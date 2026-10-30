import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import SessionDep, UserDep
from app.core.config import get_settings
from app.core.errors import VideoDisabled
from app.providers.video import VideoProvider, get_video_provider
from app.schemas.api import VideoJoinOut, VideoStatusOut
from app.services import video


def _enabled() -> None:
    if not get_settings().video_enabled:
        raise VideoDisabled("video sessions are not enabled")


router = APIRouter(prefix="/tasks", tags=["video"], dependencies=[Depends(_enabled)])
VideoDep = Annotated[VideoProvider, Depends(get_video_provider)]


@router.post("/{task_id}/video/join", response_model=VideoJoinOut)
async def join_video(
    task_id: uuid.UUID, user: UserDep, session: SessionDep, provider: VideoDep
) -> VideoJoinOut:
    j = await video.join(session, provider, user, task_id)
    return VideoJoinOut(
        url=j.url, token=j.token, expires_at=j.expires_at, room=j.room, identity=j.identity
    )


@router.get("/{task_id}/video", response_model=VideoStatusOut)
async def video_status(task_id: uuid.UUID, user: UserDep, session: SessionDep) -> VideoStatusOut:
    state, joinable = await video.status(session, user, task_id)
    return VideoStatusOut(status=state, joinable=joinable)


@router.post("/{task_id}/video/end", response_model=VideoStatusOut)
async def end_video(
    task_id: uuid.UUID, user: UserDep, session: SessionDep, provider: VideoDep
) -> VideoStatusOut:
    await video.end(session, provider, user, task_id)
    return VideoStatusOut(status="ended", joinable=False)
