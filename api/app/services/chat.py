"""Participant-only task chat with automatic translation.

The original message is committed BEFORE translation is attempted, so a provider outage
can never lose what the user wrote. Translation outcome (ok/failed) is stored per target
language and surfaced to clients; Realtime only signals clients to refetch via the API.
"""

import logging
import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.errors import NotFound
from app.models.entities import Conversation, Message, MessageTranslation, Profile
from app.observability.logging import event
from app.providers.translation import TranslationError, TranslationProvider

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
    msgs = list(
        (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.created_at, Message.id)
                .limit(500)
            )
        ).scalars()
    )
    translations = list(
        (
            await session.execute(
                select(MessageTranslation).where(MessageTranslation.conversation_id == conv.id)
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
