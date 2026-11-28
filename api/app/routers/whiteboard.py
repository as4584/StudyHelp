"""Shared whiteboard for a tutoring session: only the student and the hired tutor.

Live strokes travel over the LiveKit data channel while both are in the call; this stores the
scene so it survives reloads and works outside a call. Writes are optimistic: each PUT names
the version it was based on and gets 409 (with the current scene) if the other person saved
first, so neither side silently overwrites the other.
"""

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.dependencies import CurrentUser, SessionDep, UserDep
from app.core.errors import Forbidden, InvalidState
from app.core.limits import WHITEBOARD_MAX_BYTES
from app.models.entities import Task, TaskWhiteboard
from app.schemas.api import WhiteboardIn, WhiteboardOut
from app.services import marketplace

router = APIRouter(prefix="/tasks", tags=["whiteboard"])

# Inside a paid session; the board stays available after delivery and completion.
OPEN = {"paid", "delivered", "completed", "disputed"}


async def _task(session: SessionDep, user: CurrentUser, task_id: uuid.UUID, lock: bool) -> Task:
    task = await marketplace.get_visible_task(session, user, task_id, for_update=lock)
    if task.hired_tutor_id is None or user.id not in (task.student_id, task.hired_tutor_id):
        raise Forbidden("only the student and the hired tutor can use this whiteboard")
    if task.status not in OPEN:
        raise InvalidState("the whiteboard opens once the session is paid")
    return task


def _out(wb: TaskWhiteboard | None) -> WhiteboardOut:
    if wb is None:
        return WhiteboardOut(scene=None, version=0, updated_at=None)
    return WhiteboardOut(scene=wb.scene, version=wb.version, updated_at=wb.updated_at)


@router.get("/{task_id}/whiteboard", response_model=WhiteboardOut)
async def get_whiteboard(task_id: uuid.UUID, user: UserDep, session: SessionDep) -> WhiteboardOut:
    task = await _task(session, user, task_id, lock=False)
    return _out(await session.get(TaskWhiteboard, task.id))


@router.put(
    "/{task_id}/whiteboard",
    response_model=WhiteboardOut,
    responses={409: {"model": WhiteboardOut}, 413: {}},
)
async def put_whiteboard(
    task_id: uuid.UUID, body: WhiteboardIn, user: UserDep, session: SessionDep
) -> WhiteboardOut | JSONResponse:
    # The request body is already capped by BodyLimitMiddleware; this guards the stored scene.
    # Measure UTF-8 bytes: the default ASCII escaping would count Hindi or emoji text 2-6x.
    size = len(json.dumps(body.scene, separators=(",", ":"), ensure_ascii=False).encode())
    if size > WHITEBOARD_MAX_BYTES:
        return JSONResponse(
            {"detail": "whiteboard is too large", "code": "too_large"}, status_code=413
        )
    # The task row lock serializes concurrent saves, including the very first one.
    task = await _task(session, user, task_id, lock=True)
    stmt = select(TaskWhiteboard).where(TaskWhiteboard.task_id == task.id)
    wb = (await session.execute(stmt)).scalar_one_or_none()
    current = wb.version if wb else 0
    if body.base_version != current:
        return JSONResponse(
            _out(wb).model_dump(mode="json") | {"code": "version_conflict"}, status_code=409
        )
    now = datetime.now(UTC)
    if wb is None:
        wb = TaskWhiteboard(
            task_id=task.id, scene=body.scene, version=1, updated_by=user.id, updated_at=now
        )
        session.add(wb)
    else:
        wb.scene, wb.version, wb.updated_by, wb.updated_at = (
            body.scene,
            wb.version + 1,
            user.id,
            now,
        )
    await session.commit()
    return _out(wb)
