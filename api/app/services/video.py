"""Live video sessions: only the task's student and hired tutor, only while the work is funded.

Per join the server does one locked row read and signs a token locally; media goes straight
from the browsers to the SFU.
"""

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.config import get_settings
from app.core.errors import Forbidden, InvalidState, NotFound
from app.models.entities import Task, VideoSession
from app.observability.logging import event
from app.providers.video import VideoError, VideoProvider
from app.services import marketplace

log = logging.getLogger("video")

# Paid (funds held) or delivered (follow-up questions before release). Never before payment.
JOINABLE = {"paid", "delivered"}


@dataclass(frozen=True)
class Join:
    url: str
    token: str
    expires_at: datetime
    room: str
    identity: str


def new_room_name() -> str:
    return f"room_{secrets.token_hex(16)}"


def participant_identity(room: str, user_id: uuid.UUID) -> str:
    """Stable per (room, user), so a rejoin replaces the old connection; reveals no user id."""
    return "p_" + hashlib.sha256(f"{room}:{user_id}".encode()).hexdigest()[:24]


async def _task_for_party(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID, *, for_update: bool = False
) -> Task:
    task = await marketplace.get_visible_task(session, user, task_id, for_update=for_update)
    if user.id not in (task.student_id, task.hired_tutor_id):
        raise Forbidden("only the student and the hired tutor can use this session's video")
    return task


async def _get(session: AsyncSession, task_id: uuid.UUID) -> VideoSession | None:
    stmt = select(VideoSession).where(VideoSession.task_id == task_id)
    return (await session.execute(stmt)).scalar_one_or_none()


async def join(
    session: AsyncSession, provider: VideoProvider, user: CurrentUser, task_id: uuid.UUID
) -> Join:
    # The task row lock serializes the first two joins so both land in the same room.
    task = await _task_for_party(session, user, task_id, for_update=True)
    vs = await _get(session, task.id)
    if vs is not None and vs.status == "ended":
        raise InvalidState("this video session has ended")
    if task.status not in JOINABLE:
        raise InvalidState("video opens once the session is paid")
    now = datetime.now(UTC)
    if vs is None:
        vs = VideoSession(task_id=task.id, room_name=new_room_name(), status="created")
        session.add(vs)
    if vs.status == "created":
        vs.status, vs.started_at = "active", now
    room = vs.room_name
    await session.commit()

    ttl = get_settings().video_token_ttl_s
    role = "student" if user.id == task.student_id else "tutor"
    identity = participant_identity(room, user.id)
    token = provider.join_token(
        room=room,
        identity=identity,
        name=user.profile.display_name,
        metadata=f'{{"role":"{role}"}}',
        ttl_s=ttl,
    )
    event(log, "video.join", user_id=str(user.id), task_id=str(task.id), role=role)
    return Join(provider.public_url, token, now + timedelta(seconds=ttl), room, identity)


async def status(session: AsyncSession, user: CurrentUser, task_id: uuid.UUID) -> tuple[str, bool]:
    task = await marketplace.get_visible_task(session, user, task_id)
    if user.role != "admin" and user.id not in (task.student_id, task.hired_tutor_id):
        raise NotFound("task not found")
    vs = await _get(session, task.id)
    state = vs.status if vs else "none"
    return state, task.status in JOINABLE and state != "ended"


async def end(
    session: AsyncSession, provider: VideoProvider, user: CurrentUser, task_id: uuid.UUID
) -> str:
    task = await _task_for_party(session, user, task_id, for_update=True)
    vs = await _get(session, task.id)
    if vs is None:
        raise NotFound("no video session for this task")
    if vs.status == "ended":
        return "ended"
    vs.status, vs.ended_at = "ended", datetime.now(UTC)
    room = vs.room_name
    await session.commit()  # commit first: never hold the row lock across a network call
    try:
        await provider.close_room(room)
    except VideoError as exc:
        # New credentials are already refused and live ones expire within the token TTL.
        event(log, "video.close_failed", logging.WARNING, task_id=str(task.id), error=str(exc))
    event(log, "video.end", user_id=str(user.id), task_id=str(task.id))
    return "ended"
