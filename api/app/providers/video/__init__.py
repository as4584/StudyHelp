"""Video providers. The SFU carries the media; this API only signs room credentials.

LiveKit access tokens are HS256 JWTs (iss = API key, sub = participant identity, `video` =
grant), so they are minted locally with PyJWT: no SDK dependency and no network call per join.
"""

import time
from functools import lru_cache
from typing import Any, Protocol

import httpx
import jwt

from app.core.config import Settings, get_settings

# What a tutoring participant may publish: their camera, mic and a screen share (with its audio).
PUBLISH_SOURCES = ["camera", "microphone", "screen_share", "screen_share_audio"]

FAKE_API_KEY = "fake-video-key"
FAKE_API_SECRET = "fake-video-secret-for-tests-and-demo-only"  # noqa: S105  (not a credential)


class VideoError(Exception):
    pass


def _sign(api_key: str, api_secret: str, claims: dict[str, Any], *, ttl_s: int, now: int) -> str:
    return jwt.encode(
        {"iss": api_key, "nbf": now, "exp": now + ttl_s, **claims}, api_secret, algorithm="HS256"
    )


def mint_livekit_token(
    api_key: str,
    api_secret: str,
    *,
    room: str,
    identity: str,
    name: str,
    metadata: str,
    ttl_s: int,
    now: int | None = None,
) -> str:
    grant = {
        "room": room,
        "roomJoin": True,
        "canPublish": True,
        "canSubscribe": True,
        "canPublishData": False,
        "canPublishSources": PUBLISH_SOURCES,
        "canUpdateOwnMetadata": False,
    }
    claims = {"sub": identity, "name": name, "metadata": metadata, "video": grant}
    return _sign(
        api_key, api_secret, claims, ttl_s=ttl_s, now=int(time.time()) if now is None else now
    )


class VideoProvider(Protocol):
    name: str
    public_url: str

    def join_token(
        self, *, room: str, identity: str, name: str, metadata: str, ttl_s: int
    ) -> str: ...

    async def close_room(self, room: str) -> None: ...


class LiveKitProvider:
    name = "livekit"

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self._s = settings
        self._transport = transport
        self.public_url = settings.livekit_public_url

    def join_token(self, *, room: str, identity: str, name: str, metadata: str, ttl_s: int) -> str:
        return mint_livekit_token(
            self._s.livekit_api_key,
            self._s.livekit_api_secret,
            room=room,
            identity=identity,
            name=name,
            metadata=metadata,
            ttl_s=ttl_s,
        )

    async def close_room(self, room: str) -> None:
        """Disconnect everyone and free the room (RoomService.DeleteRoom over Twirp)."""
        admin = _sign(
            self._s.livekit_api_key,
            self._s.livekit_api_secret,
            {"video": {"room": room, "roomCreate": True}},
            ttl_s=60,
            now=int(time.time()),
        )
        url = f"{self._s.livekit_url.rstrip('/')}/twirp/livekit.RoomService/DeleteRoom"
        try:
            async with httpx.AsyncClient(timeout=5.0, transport=self._transport) as client:
                resp = await client.post(
                    url, json={"room": room}, headers={"Authorization": f"Bearer {admin}"}
                )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise VideoError(f"livekit: {type(exc).__name__}") from exc


class FakeVideoProvider:
    """Signs real LiveKit-shaped tokens with a public test secret; records closed rooms."""

    name = "fake"
    public_url = "wss://video.fake.invalid"

    def __init__(self) -> None:
        self.closed: list[str] = []

    def join_token(self, *, room: str, identity: str, name: str, metadata: str, ttl_s: int) -> str:
        return mint_livekit_token(
            FAKE_API_KEY,
            FAKE_API_SECRET,
            room=room,
            identity=identity,
            name=name,
            metadata=metadata,
            ttl_s=ttl_s,
        )

    async def close_room(self, room: str) -> None:
        self.closed.append(room)


@lru_cache
def get_video_provider() -> VideoProvider:
    s = get_settings()
    if s.video_provider == "livekit":
        return LiveKitProvider(s)
    return FakeVideoProvider()
