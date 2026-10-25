import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.dependencies import SessionDep, TutorDep, UserDep
from app.core.errors import Forbidden, NotFound
from app.models.entities import Task, TaskFile, TutorDocument
from app.providers.storage import StorageProvider, get_storage
from app.providers.translation import TranslationProvider, get_translation_provider
from app.schemas.api import (
    ConversationOut,
    FileOut,
    MessageIn,
    MessageOut,
    RedirectOut,
    TranslationOut,
    UploadIn,
    UploadOut,
)
from app.services import chat, marketplace

router = APIRouter(tags=["chat", "files"])
StorageDep = Annotated[StorageProvider, Depends(get_storage)]
TranslatorDep = Annotated[TranslationProvider, Depends(get_translation_provider)]

TASK_BUCKET = "task-files"
TUTOR_BUCKET = "tutor-documents"


@router.get("/tasks/{task_id}/conversation", response_model=ConversationOut)
async def task_conversation(
    task_id: uuid.UUID, user: UserDep, session: SessionDep
) -> ConversationOut:
    return ConversationOut.model_validate(await chat.conversation_for_task(session, user, task_id))


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID, user: UserDep, session: SessionDep
) -> list[MessageOut]:
    rows = await chat.list_messages(session, user, conversation_id)
    return [
        MessageOut(
            id=m.id,
            sender_id=m.sender_id,
            body=m.body,
            source_language=m.source_language,
            created_at=m.created_at,
            translations=[TranslationOut.model_validate(t) for t in ts],
        )
        for m, ts in rows
    ]


@router.post(
    "/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201
)
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageIn,
    user: UserDep,
    session: SessionDep,
    translator: TranslatorDep,
) -> MessageOut:
    msg, ts = await chat.send_message(session, translator, user, conversation_id, body.body)
    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        body=msg.body,
        source_language=msg.source_language,
        created_at=msg.created_at,
        translations=[TranslationOut.model_validate(t) for t in ts],
    )


# ------------------------------------------------------------------ task files


def _can_access_task_files(user_id: uuid.UUID, role: str, task: Task) -> bool:
    return role == "admin" or user_id in (task.student_id, task.hired_tutor_id)


@router.post("/tasks/{task_id}/files", response_model=UploadOut, status_code=201)
async def create_task_upload(
    task_id: uuid.UUID, body: UploadIn, user: UserDep, session: SessionDep, storage: StorageDep
) -> UploadOut:
    task = await marketplace.get_visible_task(session, user, task_id)
    if body.kind == "rubric" and user.id != task.student_id:
        raise Forbidden("only the student uploads rubrics")
    if body.kind == "deliverable" and user.id != task.hired_tutor_id:
        raise Forbidden("only the hired tutor uploads deliverables")
    file_id = uuid.uuid4()
    # Server-chosen path: clients can never pick or overwrite another object.
    path = f"{task.id}/{file_id}/{body.filename}"
    signed = await storage.signed_upload(TASK_BUCKET, path)
    session.add(
        TaskFile(
            id=file_id,
            task_id=task.id,
            uploader_id=user.id,
            kind=body.kind,
            storage_path=path,
            filename=body.filename,
        )
    )
    await session.commit()
    return UploadOut(file_id=file_id, upload_url=signed.url, token=signed.token, path=path)


@router.get("/tasks/{task_id}/files", response_model=list[FileOut])
async def list_task_files(task_id: uuid.UUID, user: UserDep, session: SessionDep) -> list[FileOut]:
    task = await marketplace.get_visible_task(session, user, task_id)
    stmt = select(TaskFile).where(TaskFile.task_id == task.id).order_by(TaskFile.created_at)
    if not _can_access_task_files(user.id, user.role, task):
        # Approved tutors browsing an OPEN task may see the student's rubric only.
        stmt = stmt.where(TaskFile.kind == "rubric")
    return [FileOut.model_validate(f) for f in (await session.execute(stmt)).scalars()]


@router.get("/files/{file_id}/download", response_model=RedirectOut)
async def download_task_file(
    file_id: uuid.UUID, user: UserDep, session: SessionDep, storage: StorageDep
) -> RedirectOut:
    f = await session.get(TaskFile, file_id)
    if f is None:
        raise NotFound("file not found")
    task = await marketplace.get_visible_task(session, user, f.task_id)  # 404 if not visible
    if not _can_access_task_files(user.id, user.role, task) and f.kind != "rubric":
        raise NotFound("file not found")
    return RedirectOut(url=await storage.signed_download(TASK_BUCKET, f.storage_path))


# ------------------------------------------------------------------ tutor qualifications


@router.post("/tutors/me/documents", response_model=UploadOut, status_code=201)
async def create_tutor_document(
    body: UploadIn, tutor: TutorDep, session: SessionDep, storage: StorageDep
) -> UploadOut:
    doc_id = uuid.uuid4()
    path = f"{tutor.id}/{doc_id}/{body.filename}"
    signed = await storage.signed_upload(TUTOR_BUCKET, path)
    session.add(
        TutorDocument(id=doc_id, tutor_id=tutor.id, storage_path=path, filename=body.filename)
    )
    await session.commit()
    return UploadOut(file_id=doc_id, upload_url=signed.url, token=signed.token, path=path)


@router.get("/tutors/{tutor_id}/documents", response_model=list[FileOut])
async def list_tutor_documents(
    tutor_id: uuid.UUID, user: UserDep, session: SessionDep
) -> list[FileOut]:
    if user.role != "admin" and user.id != tutor_id:
        raise NotFound("not found")
    docs = (
        await session.execute(select(TutorDocument).where(TutorDocument.tutor_id == tutor_id))
    ).scalars()
    return [
        FileOut(id=d.id, kind="qualification", filename=d.filename, created_at=d.created_at)
        for d in docs
    ]


@router.get("/tutor-documents/{doc_id}/download", response_model=RedirectOut)
async def download_tutor_document(
    doc_id: uuid.UUID, user: UserDep, session: SessionDep, storage: StorageDep
) -> RedirectOut:
    doc = await session.get(TutorDocument, doc_id)
    if doc is None or (user.role != "admin" and user.id != doc.tutor_id):
        raise NotFound("not found")
    return RedirectOut(url=await storage.signed_download(TUTOR_BUCKET, doc.storage_path))
