"""Per-user limits on actions that cost money or reach other people, counted from the rows
they create (no extra table). Generous for real use, tight enough to stop spam."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.errors import TooMany
from app.models.entities import Message, Task

MESSAGES_PER_MINUTE = 30
MESSAGES_PER_DAY = 1000
TASKS_PER_DAY = 30


async def _count(
    session: AsyncSession,
    col: InstrumentedAttribute[datetime],
    owner_col: InstrumentedAttribute[uuid.UUID],
    user_id: uuid.UUID,
    since: timedelta,
) -> int:
    start = datetime.now(UTC) - since
    return int(
        await session.scalar(select(func.count()).where(owner_col == user_id, col >= start)) or 0
    )


async def check_message(session: AsyncSession, user_id: uuid.UUID) -> None:
    if (
        await _count(session, Message.created_at, Message.sender_id, user_id, timedelta(minutes=1))
        >= MESSAGES_PER_MINUTE
    ):
        raise TooMany("you're sending messages very fast — wait a minute and try again")
    if (
        await _count(session, Message.created_at, Message.sender_id, user_id, timedelta(days=1))
        >= MESSAGES_PER_DAY
    ):
        raise TooMany("you've reached today's message limit — try again tomorrow")


async def check_task(session: AsyncSession, user_id: uuid.UUID) -> None:
    today = await _count(session, Task.created_at, Task.student_id, user_id, timedelta(days=1))
    if today >= TASKS_PER_DAY:
        raise TooMany(f"you can post up to {TASKS_PER_DAY} requests a day — try again tomorrow")
