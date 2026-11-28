"""Participant-only task chat with automatic translation.

The original message is committed BEFORE translation is attempted, so a provider outage
can never lose what the user wrote. Translation outcome (ok/failed) is stored per target
language and surfaced to clients; Realtime only signals clients to refetch via the API.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.dependencies import CurrentUser
from app.core.errors import NotFound
from app.models.entities import (
    Conversation,
    ConversationRead,
    Message,
    MessageTranslation,
    Profile,
)
from app.observability.logging import event
from app.providers.translation import TranslationError, TranslationProvider
from app.services import rate_limits

log = logging.getLogger("chat")


async def get_conversation(
    session: AsyncSession, user: CurrentUser, conversation_id: uuid.UUID
) -> Conversation:
    conv = await session.get(Conversation, conversation_id)
    if conv is None or user.id not in (conv.student_id, conv.tutor_id):
        # Admins deliberately do NOT read private chats through this path.
        raise NotFound("conversation not found")
    return conv


async def conversation_for_task(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID
) -> Conversation:
    conv = (
        await session.execute(select(Conversation).where(Conversation.task_id == task_id))
    ).scalar_one_or_none()
    if conv is None or user.id not in (conv.student_id, conv.tutor_id):
        raise NotFound("conversation not found")
    return conv


async def list_messages(
    session: AsyncSession, user: CurrentUser, conversation_id: uuid.UUID
) -> list[tuple[Message, list[MessageTranslation]]]:
    conv = await get_conversation(session, user, conversation_id)
    # The latest 500, oldest first.
    msgs = list(
        (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(500)
            )
        ).scalars()
    )[::-1]
    translations = list(
        (
            await session.execute(
                select(MessageTranslation).where(
                    MessageTranslation.message_id.in_([m.id for m in msgs])
                )
            )
        ).scalars()
    )
    by_msg: dict[uuid.UUID, list[MessageTranslation]] = {}
    for t in translations:
        by_msg.setdefault(t.message_id, []).append(t)
    return [(m, by_msg.get(m.id, [])) for m in msgs]


async def send_message(
    session: AsyncSession,
    translator: TranslationProvider,
    user: CurrentUser,
    conversation_id: uuid.UUID,
    body: str,
) -> tuple[Message, list[MessageTranslation]]:
    conv = await get_conversation(session, user, conversation_id)
    other_id = conv.tutor_id if user.id == conv.student_id else conv.student_id
    other = await session.get(Profile, other_id)
    assert other is not None
    await rate_limits.check_message(session, user.id)
    source = user.profile.preferred_language
    msg = Message(conversation_id=conv.id, sender_id=user.id, body=body, source_language=source)
    session.add(msg)
    await session.commit()  # the original is durable before any provider call

    results: list[MessageTranslation] = []
    target = other.preferred_language
    if target != source:
        start = time.perf_counter()
        try:
            text = await translator.translate(body, source=source, target=target)
            tr = MessageTranslation(
                message_id=msg.id,
                conversation_id=conv.id,
                target_language=target,
                translated_body=text,
                provider=translator.name,
                status="ok",
            )
        except TranslationError as exc:
            event(
                log,
                "translation.failed",
                logging.WARNING,
                provider=translator.name,
                error=str(exc),
                message_id=str(msg.id),
            )
            tr = MessageTranslation(
                message_id=msg.id,
                conversation_id=conv.id,
                target_language=target,
                translated_body=None,
                provider=translator.name,
                status="failed",
                error=str(exc)[:200],
            )
        tr.latency_ms = round((time.perf_counter() - start) * 1000)
        event(
            log,
            "translation.done",
            provider=translator.name,
            status=tr.status,
            latency_ms=tr.latency_ms,
        )
        session.add(tr)
        await session.commit()
        results.append(tr)
    return msg, results


# ------------------------------------------------------------------ read markers


def _unread_filter(user_id: uuid.UUID, read: Any) -> tuple[Any, Any]:
    return (
        Message.sender_id != user_id,
        or_(read.last_read_at.is_(None), Message.created_at > read.last_read_at),
    )


async def mark_read(session: AsyncSession, user: CurrentUser, conversation_id: uuid.UUID) -> None:
    """Record that this participant has seen the conversation up to now."""
    conv = await get_conversation(session, user, conversation_id)  # 404 for non-participants
    stmt = pg_insert(ConversationRead).values(conversation_id=conv.id, user_id=user.id)
    stmt = stmt.on_conflict_do_update(
        index_elements=[ConversationRead.conversation_id, ConversationRead.user_id],
        set_={"last_read_at": func.now()},
    )
    await session.execute(stmt)
    await session.commit()


@dataclass
class ChatSummary:
    unread: int
    opened: bool  # this participant has viewed the chat at least once
    counterpart_name: str


async def summaries(
    session: AsyncSession, user_id: uuid.UUID, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ChatSummary]:
    """Per-task chat summary for this user, only for conversations they take part in."""
    if not task_ids:
        return {}
    read = aliased(ConversationRead)
    other = aliased(Profile)
    other_id = case(
        (Conversation.student_id == user_id, Conversation.tutor_id), else_=Conversation.student_id
    )
    unread = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id, *_unread_filter(user_id, read))
        .correlate(Conversation, read)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(Conversation.task_id, unread, read.last_read_at, other.display_name)
        .select_from(Conversation)
        .join(
            read,
            (read.conversation_id == Conversation.id) & (read.user_id == user_id),
            isouter=True,
        )
        .join(other, other.id == other_id)
        .where(
            Conversation.task_id.in_(task_ids),
            or_(Conversation.student_id == user_id, Conversation.tutor_id == user_id),
        )
    )
    return {
        task_id: ChatSummary(int(n or 0), last is not None, name) for task_id, n, last, name in rows
    }


async def unread_total(session: AsyncSession, user_id: uuid.UUID) -> int:
    read = aliased(ConversationRead)
    n = await session.scalar(
        select(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(
            read,
            (read.conversation_id == Conversation.id) & (read.user_id == user_id),
            isouter=True,
        )
        .where(
            or_(Conversation.student_id == user_id, Conversation.tutor_id == user_id),
            *_unread_filter(user_id, read),
        )
    )
    return int(n or 0)
