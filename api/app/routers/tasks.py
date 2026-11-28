import uuid
from typing import Literal

from fastapi import APIRouter, Request
from sqlalchemy import exists, select

from app.api.dependencies import SessionDep, StudentDep, TutorDep, UserDep
from app.core.errors import Forbidden
from app.models.entities import Profile, Review, TutorProfile
from app.routers.avatars import avatar_link, avatar_version
from app.schemas.api import (
    BidIn,
    BidOut,
    BidWithTutorOut,
    DeliverIn,
    DisputeIn,
    DisputeOut,
    HireIn,
    ReviewIn,
    ReviewOut,
    TaskIn,
    TaskOut,
)
from app.services import chat, marketplace

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(body: TaskIn, student: StudentDep, session: SessionDep) -> TaskOut:
    task = await marketplace.create_task(session, student, **body.model_dump())
    return TaskOut.model_validate(task)


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    user: UserDep, session: SessionDep, scope: Literal["mine", "open"] = "mine"
) -> list[TaskOut]:
    tasks = [TaskOut.model_validate(t) for t in await marketplace.list_tasks(session, user, scope)]
    if scope != "mine":
        return tasks
    # Chat summaries come only from conversations the caller takes part in (never admin views).
    chats = await chat.summaries(session, user.id, [t.id for t in tasks])
    return [
        t.model_copy(
            update={
                "unread_count": c.unread,
                "chat_opened": c.opened,
                "counterpart_name": c.counterpart_name,
            }
        )
        if (c := chats.get(t.id))
        else t
        for t in tasks
    ]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, user: UserDep, session: SessionDep) -> TaskOut:
    task = await marketplace.get_visible_task(session, user, task_id)
    reviewed = await session.scalar(select(exists().where(Review.task_id == task.id)))
    return TaskOut.model_validate(task).model_copy(update={"reviewed": bool(reviewed)})


@router.post("/{task_id}/cancel", response_model=TaskOut)
async def cancel_task(task_id: uuid.UUID, student: StudentDep, session: SessionDep) -> TaskOut:
    return TaskOut.model_validate(await marketplace.cancel(session, student, task_id))


@router.get("/{task_id}/bids", response_model=list[BidWithTutorOut])
async def list_bids(
    task_id: uuid.UUID, user: UserDep, session: SessionDep, request: Request
) -> list[BidWithTutorOut]:
    bids = await marketplace.list_bids(session, user, task_id)
    # One query for every bidder's card (was one query per bid).
    rows = {
        r[0]: r[1:]
        for r in (
            await session.execute(
                select(
                    Profile.id,
                    Profile.display_name,
                    TutorProfile.rating_avg,
                    TutorProfile.rating_count,
                    avatar_version,
                    TutorProfile.subjects,
                    TutorProfile.years_experience,
                )
                .join(TutorProfile, TutorProfile.user_id == Profile.id)
                .where(Profile.id.in_({b.tutor_id for b in bids}))
            )
        ).all()
    }
    out = []
    for b in bids:
        row = rows[b.tutor_id]
        out.append(
            BidWithTutorOut(
                **BidOut.model_validate(b).model_dump(),
                tutor_name=row[0],
                tutor_avatar_url=avatar_link(request, b.tutor_id, row[3]),
                tutor_rating_avg=float(row[1]),
                tutor_rating_count=row[2],
                tutor_main_subject=row[4][0] if row[4] else None,
                tutor_years_experience=row[5],
            )
        )
    return out


@router.post("/{task_id}/bids", response_model=BidOut, status_code=201)
async def place_bid(
    task_id: uuid.UUID, body: BidIn, tutor: TutorDep, session: SessionDep
) -> BidOut:
    bid = await marketplace.place_bid(session, tutor, task_id, body.amount_cents, body.message)
    return BidOut.model_validate(bid)


@router.post("/{task_id}/hire", response_model=TaskOut)
async def hire(
    task_id: uuid.UUID, body: HireIn, student: StudentDep, session: SessionDep
) -> TaskOut:
    return TaskOut.model_validate(await marketplace.hire(session, student, task_id, body.bid_id))


@router.post("/{task_id}/deliver", response_model=TaskOut)
async def deliver(
    task_id: uuid.UUID, body: DeliverIn, tutor: TutorDep, session: SessionDep
) -> TaskOut:
    return TaskOut.model_validate(await marketplace.deliver(session, tutor, task_id, body.note))


@router.post("/{task_id}/review", response_model=ReviewOut, status_code=201)
async def review(
    task_id: uuid.UUID, body: ReviewIn, student: StudentDep, session: SessionDep
) -> ReviewOut:
    rev = await marketplace.review(session, student, task_id, body.rating, body.comment)
    return ReviewOut.model_validate(rev)


@router.post("/{task_id}/disputes", response_model=DisputeOut, status_code=201)
async def open_dispute(
    task_id: uuid.UUID, body: DisputeIn, user: UserDep, session: SessionDep
) -> DisputeOut:
    if user.role == "admin":
        raise Forbidden("admins resolve disputes; they do not open them")
    return DisputeOut.model_validate(
        await marketplace.open_dispute(session, user, task_id, body.reason)
    )
