"""Tasks, bids, hiring, delivery, reviews and disputes.

Authorization lives here (not in the UI): every function receives the CurrentUser and
checks ownership/participation against current database state.
"""

import uuid

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.errors import Conflict, Forbidden, InvalidState, NotFound
from app.models.entities import Bid, Conversation, Dispute, Review, Task, TutorProfile
from app.services.audit import audit
from app.services.state import ensure_transition


async def tutor_is_approved(session: AsyncSession, user_id: uuid.UUID) -> bool:
    tp = await session.get(TutorProfile, user_id)
    return tp is not None and tp.status == "approved"


def _is_party(user: CurrentUser, task: Task) -> bool:
    return user.id in (task.student_id, task.hired_tutor_id)


async def get_visible_task(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID, *, for_update: bool = False
) -> Task:
    """Return the task if this user may see it; otherwise 404 (no existence oracle)."""
    stmt = select(Task).where(Task.id == task_id)
    if for_update:
        stmt = stmt.with_for_update()
    task = (await session.execute(stmt)).scalar_one_or_none()
    if task is None:
        raise NotFound("task not found")
    if user.role == "admin" or _is_party(user, task):
        return task
    if user.role == "tutor" and task.status == "open" and await tutor_is_approved(session, user.id):
        return task
    raise NotFound("task not found")


async def create_task(
    session: AsyncSession,
    student: CurrentUser,
    *,
    subject: str,
    title: str,
    description: str,
    budget_cents: int,
    honor_code_ack: bool,
) -> Task:
    if not honor_code_ack:
        raise InvalidState("the honor-code acknowledgement is required")
    task = Task(
        student_id=student.id,
        subject=subject,
        title=title,
        description=description,
        budget_cents=budget_cents,
        honor_code_ack=True,
        status="open",
    )
    session.add(task)
    await session.commit()
    return task


async def list_tasks(session: AsyncSession, user: CurrentUser, scope: str) -> list[Task]:
    stmt = select(Task).order_by(Task.created_at.desc()).limit(100)
    if user.role == "student":
        stmt = stmt.where(Task.student_id == user.id)
    elif user.role == "tutor":
        if scope == "open":
            if not await tutor_is_approved(session, user.id):
                return []
            stmt = stmt.where(Task.status == "open", Task.student_id != user.id)
        else:
            stmt = stmt.where(Task.hired_tutor_id == user.id)
    elif scope == "open":
        stmt = stmt.where(Task.status == "open")
    return list((await session.execute(stmt)).scalars())


async def place_bid(
    session: AsyncSession, tutor: CurrentUser, task_id: uuid.UUID, amount_cents: int, message: str
) -> Bid:
    if not await tutor_is_approved(session, tutor.id):
        raise Forbidden("tutor application is not approved")
    task = await get_visible_task(session, tutor, task_id)
    if task.status != "open":
        raise InvalidState("task is not open for bids")
    bid = Bid(task_id=task.id, tutor_id=tutor.id, amount_cents=amount_cents, message=message)
    session.add(bid)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise Conflict("you have already bid on this task") from exc
    return bid


async def list_bids(session: AsyncSession, user: CurrentUser, task_id: uuid.UUID) -> list[Bid]:
    task = await get_visible_task(session, user, task_id)
    stmt = select(Bid).where(Bid.task_id == task.id).order_by(Bid.created_at)
    if user.role == "tutor":
        stmt = stmt.where(Bid.tutor_id == user.id)
    elif user.role == "student" and task.student_id != user.id:
        raise NotFound("task not found")
    return list((await session.execute(stmt)).scalars())


async def hire(
    session: AsyncSession, student: CurrentUser, task_id: uuid.UUID, bid_id: uuid.UUID
) -> Task:
    task = await get_visible_task(session, student, task_id, for_update=True)
    if task.student_id != student.id:
        raise NotFound("task not found")
    ensure_transition(task.status, "hired")
    bid = await session.get(Bid, bid_id, with_for_update=True)
    if bid is None or bid.task_id != task.id or bid.status != "pending":
        raise NotFound("bid not found")
    if not await tutor_is_approved(session, bid.tutor_id):
        raise InvalidState("this tutor is no longer approved")
    bid.status = "accepted"
    await session.execute(
        update(Bid)
        .where(Bid.task_id == task.id, Bid.id != bid.id, Bid.status == "pending")
        .values(status="rejected")
    )
    task.status = "hired"
    task.hired_tutor_id = bid.tutor_id
    task.accepted_bid_id = bid.id
    session.add(Conversation(task_id=task.id, student_id=task.student_id, tutor_id=bid.tutor_id))
    await session.commit()
    return task


async def accepted_amount(session: AsyncSession, task: Task) -> int:
    if task.accepted_bid_id is None:
        raise InvalidState("no accepted bid")
    bid = await session.get(Bid, task.accepted_bid_id)
    assert bid is not None
    return bid.amount_cents


async def deliver(session: AsyncSession, tutor: CurrentUser, task_id: uuid.UUID, note: str) -> Task:
    task = await get_visible_task(session, tutor, task_id, for_update=True)
    if task.hired_tutor_id != tutor.id:
        raise Forbidden("only the hired tutor can deliver")
    ensure_transition(task.status, "delivered")
    task.status = "delivered"
    task.delivery_note = note
    await session.commit()
    return task


async def cancel(session: AsyncSession, student: CurrentUser, task_id: uuid.UUID) -> Task:
    task = await get_visible_task(session, student, task_id, for_update=True)
    if task.student_id != student.id:
        raise NotFound("task not found")
    ensure_transition(task.status, "cancelled")
    task.status = "cancelled"
    await session.commit()
    return task


async def review(
    session: AsyncSession, student: CurrentUser, task_id: uuid.UUID, rating: int, comment: str
) -> Review:
    task = await get_visible_task(session, student, task_id)
    if task.student_id != student.id:
        raise NotFound("task not found")
    if task.status != "completed" or task.hired_tutor_id is None:
        raise InvalidState("reviews open after the payment is released")
    rev = Review(
        task_id=task.id,
        student_id=student.id,
        tutor_id=task.hired_tutor_id,
        rating=rating,
        comment=comment,
    )
    session.add(rev)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise Conflict("this task has already been reviewed") from exc
    # Incremental aggregate update in one statement (safe under concurrency).
    await session.execute(
        update(TutorProfile)
        .where(TutorProfile.user_id == task.hired_tutor_id)
        .values(
            rating_avg=(TutorProfile.rating_avg * TutorProfile.rating_count + rating)
            / (TutorProfile.rating_count + 1),
            rating_count=TutorProfile.rating_count + 1,
        )
    )
    await session.commit()
    return rev


async def open_dispute(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID, reason: str
) -> Dispute:
    task = await get_visible_task(session, user, task_id, for_update=True)
    if not _is_party(user, task):
        raise Forbidden("only the student or hired tutor can open a dispute")
    ensure_transition(task.status, "disputed")
    dispute = Dispute(
        task_id=task.id, opened_by=user.id, reason=reason, prior_task_status=task.status
    )
    task.status = "disputed"
    session.add(dispute)
    audit(session, actor=user.id, action="dispute.opened", entity_type="task", entity_id=task.id)
    await session.commit()
    return dispute


async def list_tutors(session: AsyncSession, subject: str | None) -> list[TutorProfile]:
    stmt = select(TutorProfile).where(TutorProfile.status == "approved")
    if subject:
        stmt = stmt.where(or_(TutorProfile.subjects.any(subject)))  # type: ignore[arg-type]
    stmt = stmt.order_by(TutorProfile.rating_avg.desc(), TutorProfile.rating_count.desc())
    return list((await session.execute(stmt)).scalars())
