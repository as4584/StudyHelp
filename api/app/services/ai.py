"""AI study assistant: free daily allowance, Premium fair-use cap, usage logging, escalation."""

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.config import get_settings
from app.core.errors import NotFound, ProviderError, QuotaExceeded
from app.models.entities import AiChat, AiMessage, AiUsage
from app.observability.logging import event, request_id_var
from app.providers.llm import ChatTurn, LLMError, LLMProvider
from app.services.payments import is_premium

log = logging.getLogger("ai")

SYSTEM_PROMPT = (
    "You are a patient study coach on a tutoring platform. Explain concepts, ask guiding "
    "questions, and walk through worked examples of SIMILAR problems. Do not produce "
    "submission-ready answers to graded assignments or exams; instead help the student "
    "reach the answer themselves. Be concise and encouraging. If the student is stuck "
    "after a few exchanges, suggest escalating to a live expert on the platform.\n\n"
    "Format: start each part of your answer on its own line with exactly one of these labels, "
    "then a colon: 'Key idea:', 'Explanation:', 'Example:', 'Try this:', 'Hint:', "
    "'Check yourself:', 'Common mistake:'. Lead with one short 'Key idea:' sentence. "
    "Use **bold** for the one or two key concepts and `backticks` for formulas or code. "
    "Keep each part to a few sentences."
)
MAX_CONTEXT_TURNS = 12


@dataclass(frozen=True)
class Quota:
    premium: bool
    period: str  # "day" (free) or "month" (Premium fair use)
    used: int
    limit: int
    resets_at: datetime

    @property
    def remaining(self) -> int:
        return max(self.limit - self.used, 0)


def _window(premium: bool, now: datetime) -> tuple[str, datetime, datetime]:
    """Calendar windows in UTC: today for free users, this month for Premium."""
    if premium:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = (start + timedelta(days=32)).replace(day=1)
        return "month", start, end
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return "day", start, start + timedelta(days=1)


async def quota(session: AsyncSession, user: CurrentUser, now: datetime | None = None) -> Quota:
    """Questions count as the user's own messages in the window; failed answers are removed."""
    premium = await is_premium(session, user.id)
    period, start, end = _window(premium, now or datetime.now(UTC))
    used = await session.scalar(
        select(func.count())
        .select_from(AiMessage)
        .join(AiChat, AiChat.id == AiMessage.chat_id)
        .where(AiChat.user_id == user.id, AiMessage.role == "user", AiMessage.created_at >= start)
    )
    s = get_settings()
    limit = s.ai_premium_monthly if premium else s.ai_free_daily
    return Quota(premium=premium, period=period, used=used or 0, limit=limit, resets_at=end)


async def _owned_chat(session: AsyncSession, user: CurrentUser, chat_id: uuid.UUID) -> AiChat:
    chat = await session.get(AiChat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise NotFound("chat not found")
    return chat


async def create_chat(session: AsyncSession, user: CurrentUser, subject: str) -> AiChat:
    chat = AiChat(user_id=user.id, subject=subject)
    session.add(chat)
    await session.commit()
    return chat


async def chat_messages(
    session: AsyncSession, user: CurrentUser, chat_id: uuid.UUID
) -> list[AiMessage]:
    chat = await _owned_chat(session, user, chat_id)
    return list(
        (
            await session.execute(
                select(AiMessage).where(AiMessage.chat_id == chat.id).order_by(AiMessage.created_at)
            )
        ).scalars()
    )


async def ask(
    session: AsyncSession,
    llm: LLMProvider,
    user: CurrentUser,
    chat_id: uuid.UUID,
    question: str,
) -> AiMessage:
    chat = await _owned_chat(session, user, chat_id)
    # Serialize this user's asks so parallel requests can't slip past the limit.
    await session.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"ai:{user.id}"}
    )
    q = await quota(session, user)
    premium = q.premium
    if q.remaining == 0:
        session.add(
            AiUsage(
                user_id=user.id,
                chat_id=chat.id,
                provider=llm.name,
                model="-",
                status="denied",
                latency_ms=0,
                premium=premium,
                request_id=request_id_var.get(),
            )
        )
        await session.commit()
        if premium:
            raise QuotaExceeded(
                f"You've reached this month's fair-use limit of {q.limit} AI questions.",
                code="ai_fair_use",
                status_code=429,
                resets_at=q.resets_at.isoformat(),
            )
        raise QuotaExceeded(
            f"You've used your {q.limit} free AI questions for today.",
            code="ai_daily_limit",
            status_code=402,
            resets_at=q.resets_at.isoformat(),
        )

    history = await chat_messages(session, user, chat.id)
    asked = AiMessage(chat_id=chat.id, role="user", content=question)
    session.add(asked)
    await session.commit()
    turns = [ChatTurn(role=m.role, content=m.content) for m in history[-MAX_CONTEXT_TURNS:]]  # type: ignore[arg-type]
    turns.append(ChatTurn(role="user", content=question))

    start = time.perf_counter()
    try:
        result = await llm.generate(
            system=SYSTEM_PROMPT, turns=turns, max_tokens=get_settings().llm_max_tokens
        )
    except LLMError as exc:
        latency = round((time.perf_counter() - start) * 1000)
        session.add(
            AiUsage(
                user_id=user.id,
                chat_id=chat.id,
                provider=llm.name,
                model="-",
                status="error",
                latency_ms=latency,
                premium=premium,
                request_id=request_id_var.get(),
            )
        )
        # A failed answer doesn't use up a question.
        await session.execute(delete(AiMessage).where(AiMessage.id == asked.id))
        await session.commit()
        event(log, "llm.failed", logging.WARNING, provider=llm.name, error=str(exc))
        raise ProviderError("the AI assistant is temporarily unavailable") from exc
    latency = round((time.perf_counter() - start) * 1000)
    reply = AiMessage(chat_id=chat.id, role="assistant", content=result.text)
    session.add(reply)
    session.add(
        AiUsage(
            user_id=user.id,
            chat_id=chat.id,
            provider=llm.name,
            model=result.model,
            status="ok",
            latency_ms=latency,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            premium=premium,
            request_id=request_id_var.get(),
        )
    )
    await session.commit()
    event(
        log,
        "llm.ok",
        provider=llm.name,
        model=result.model,
        latency_ms=latency,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    return reply


@dataclass(frozen=True)
class TaskDraft:
    subject: str
    title: str
    description: str


async def escalate(session: AsyncSession, user: CurrentUser, chat_id: uuid.UUID) -> TaskDraft:
    """Turn the student's own AI conversation into a prefilled tutoring-task draft."""
    msgs = await chat_messages(session, user, chat_id)
    chat = await _owned_chat(session, user, chat_id)
    questions = [m.content for m in msgs if m.role == "user"]
    if not questions:
        raise NotFound("ask the assistant something first")
    first = questions[0].strip().replace("\n", " ")
    title = (first[:117] + "...") if len(first) > 120 else first
    if len(title) < 3:
        title = "Help with my question"
    bullets = "\n".join(f"- {q.strip()[:500]}" for q in questions[-5:])
    description = (
        "I worked with the AI study assistant and would like a live expert to walk me "
        f"through this.\n\nWhat I asked:\n{bullets}"
    )
    return TaskDraft(subject=chat.subject or "General", title=title, description=description[:5000])
