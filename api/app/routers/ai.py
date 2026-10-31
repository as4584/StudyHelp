import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import SessionDep, StudentDep
from app.providers.llm import LLMProvider, get_llm_provider
from app.schemas.api import AiAskIn, AiChatIn, AiChatOut, AiMessageOut, AiQuotaOut, TaskDraftOut
from app.services import ai

router = APIRouter(prefix="/ai", tags=["ai"])
LLMDep = Annotated[LLMProvider, Depends(get_llm_provider)]


@router.get("/quota", response_model=AiQuotaOut)
async def quota(student: StudentDep, session: SessionDep) -> AiQuotaOut:
    q = await ai.quota(session, student)
    return AiQuotaOut(
        premium=q.premium,
        period=q.period,
        used=q.used,
        limit=q.limit,
        remaining=q.remaining,
        resets_at=q.resets_at,
    )


@router.post("/chats", response_model=AiChatOut, status_code=201)
async def create_chat(body: AiChatIn, student: StudentDep, session: SessionDep) -> AiChatOut:
    return AiChatOut.model_validate(await ai.create_chat(session, student, body.subject))


@router.get("/chats/{chat_id}/messages", response_model=list[AiMessageOut])
async def messages(
    chat_id: uuid.UUID, student: StudentDep, session: SessionDep
) -> list[AiMessageOut]:
    return [
        AiMessageOut.model_validate(m) for m in await ai.chat_messages(session, student, chat_id)
    ]


@router.post("/chats/{chat_id}/messages", response_model=AiMessageOut, status_code=201)
async def ask(
    chat_id: uuid.UUID, body: AiAskIn, student: StudentDep, session: SessionDep, llm: LLMDep
) -> AiMessageOut:
    return AiMessageOut.model_validate(await ai.ask(session, llm, student, chat_id, body.question))


@router.post("/chats/{chat_id}/escalate", response_model=TaskDraftOut)
async def escalate(chat_id: uuid.UUID, student: StudentDep, session: SessionDep) -> TaskDraftOut:
    draft = await ai.escalate(session, student, chat_id)
    return TaskDraftOut(subject=draft.subject, title=draft.title, description=draft.description)
