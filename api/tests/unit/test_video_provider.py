"""LiveKit adapter: token claims, room close over the Twirp API, and config guards."""

import json

import httpx
import jwt
import pytest

from app.core.config import Settings
from app.providers.video import LiveKitProvider, VideoError, mint_livekit_token

SECRET = "s" * 40


def lk_settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "environment": "test",
        "video_enabled": True,
        "video_provider": "livekit",
        "livekit_api_key": "APIkey123",
        "livekit_api_secret": SECRET,
        "livekit_url": "http://livekit.internal:7880",
        "livekit_public_url": "wss://rtc.example.com",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_token_is_scoped_to_one_room_and_expires() -> None:
    tok = mint_livekit_token(
        "APIkey123",
        SECRET,
        room="room_abc",
        identity="p_1",
        name="Ana",
        metadata='{"role":"student"}',
        ttl_s=600,
        now=1_000_000,
    )
    c = jwt.decode(tok, SECRET, algorithms=["HS256"], options={"verify_exp": False})
    assert c["iss"] == "APIkey123" and c["sub"] == "p_1" and c["name"] == "Ana"
    assert (c["nbf"], c["exp"]) == (1_000_000, 1_000_600)
    assert c["video"]["room"] == "room_abc" and c["video"]["roomJoin"] is True
    assert c["video"]["canSubscribe"] is True and c["video"]["canPublish"] is True


async def test_close_room_calls_delete_room_with_an_admin_token() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={})

    p = LiveKitProvider(lk_settings(), transport=httpx.MockTransport(handler))
    await p.close_room("room_abc")
    (req,) = seen
    assert str(req.url) == "http://livekit.internal:7880/twirp/livekit.RoomService/DeleteRoom"
    assert json.loads(req.content) == {"room": "room_abc"}
    tok = req.headers["Authorization"].removeprefix("Bearer ")
    grant = jwt.decode(tok, SECRET, algorithms=["HS256"])["video"]
    assert grant == {"room": "room_abc", "roomCreate": True}


async def test_close_room_reports_server_errors() -> None:
    p = LiveKitProvider(lk_settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(VideoError):
        await p.close_room("room_abc")


def test_livekit_config_is_validated() -> None:
    lk_settings()  # valid
    with pytest.raises(ValueError, match="LIVEKIT_API_SECRET"):
        lk_settings(livekit_api_secret="short")
    with pytest.raises(ValueError, match="LIVEKIT_API_KEY"):
        lk_settings(livekit_api_key="")
    with pytest.raises(ValueError, match="wss://"):
        lk_settings(livekit_public_url="ws://rtc.example.com")


def test_production_refuses_fake_video_only_when_video_is_on() -> None:
    prod = {
        "environment": "production",
        "payments_provider": "stripe",
        "stripe_secret_key": "sk_test_x",
        "stripe_webhook_secret": "whsec_x",
        "llm_provider": "ollama",
        "ollama_model": "qwen3:8b",
        "translation_provider": "deepl",
        "deepl_api_key": "k",
        "storage_provider": "supabase",
    }
    Settings(**prod, video_enabled=False, video_provider="fake")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="Fake"):
        Settings(**prod, video_enabled=True, video_provider="fake")  # type: ignore[arg-type]
