"""Turnstile verification: what Cloudflare says decides, and anything unclear is a refusal."""

from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.errors import BotCheckFailed
from app.services import bot_check

REAL_SECRET = "0x4AAAAAAA-not-a-real-secret"


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[[str], None]]:
    def use(value: str) -> None:
        monkeypatch.setenv("TURNSTILE_SECRET_KEY", value)
        get_settings.cache_clear()

    yield use
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    get_settings.cache_clear()


def cloudflare(
    monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]
) -> list[httpx.Request]:
    """Route the verifier's HTTP client through a mock transport; returns the requests seen."""
    seen: list[httpx.Request] = []
    real = httpx.AsyncClient

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    def client(**kwargs: Any) -> httpx.AsyncClient:
        return real(transport=httpx.MockTransport(wrapped), **kwargs)

    monkeypatch.setattr(bot_check.httpx, "AsyncClient", client)
    return seen


async def test_a_token_cloudflare_confirms_passes(monkeypatch, secret) -> None:  # type: ignore[no-untyped-def]
    secret(REAL_SECRET)
    seen = cloudflare(monkeypatch, lambda r: httpx.Response(200, json={"success": True}))
    await bot_check.verify("tok-123", "203.0.113.9")
    assert len(seen) == 1
    sent = dict(httpx.QueryParams(seen[0].content.decode()))
    assert sent == {"secret": REAL_SECRET, "response": "tok-123", "remoteip": "203.0.113.9"}


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"success": False, "error-codes": ["invalid-input-response"]}),
        httpx.Response(200, json={"success": False, "error-codes": ["timeout-or-duplicate"]}),
        httpx.Response(200, json={}),
        httpx.Response(500, text="oops"),
        httpx.Response(200, text="not json"),
    ],
)
async def test_anything_but_a_clear_yes_is_refused(monkeypatch, secret, response) -> None:  # type: ignore[no-untyped-def]
    secret(REAL_SECRET)
    cloudflare(monkeypatch, lambda r: response)
    with pytest.raises(BotCheckFailed):
        await bot_check.verify("tok-123")


async def test_cloudflare_unreachable_fails_closed(monkeypatch, secret) -> None:  # type: ignore[no-untyped-def]
    secret(REAL_SECRET)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("no route", request=request)

    cloudflare(monkeypatch, down)
    with pytest.raises(BotCheckFailed):
        await bot_check.verify("tok-123")


async def test_a_missing_token_never_reaches_cloudflare(monkeypatch, secret) -> None:  # type: ignore[no-untyped-def]
    secret(REAL_SECRET)
    seen = cloudflare(monkeypatch, lambda r: httpx.Response(200, json={"success": True}))
    for token in (None, ""):
        with pytest.raises(BotCheckFailed):
            await bot_check.verify(token)
    assert seen == []


async def test_test_secrets_answer_offline(monkeypatch, secret) -> None:  # type: ignore[no-untyped-def]
    seen = cloudflare(monkeypatch, lambda r: httpx.Response(200, json={"success": True}))
    secret("")  # unset -> Cloudflare's always-pass test secret
    await bot_check.verify("XXXX.DUMMY.TOKEN.XXXX")
    secret("2x0000000000000000000000000000000AA")  # always-fail test secret
    with pytest.raises(BotCheckFailed):
        await bot_check.verify("XXXX.DUMMY.TOKEN.XXXX")
    assert seen == []


def _prod(**extra: str) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        environment="production",
        payments_provider="stripe",
        stripe_secret_key="sk_test_x",
        stripe_webhook_secret="whsec_x",
        llm_provider="ollama",
        ollama_model="m",
        translation_provider="ollama",
        translation_ollama_model="m",
        storage_provider="supabase",
        video_enabled=False,
        **extra,  # type: ignore[arg-type]
    )


def test_production_refuses_to_start_without_a_real_secret() -> None:
    for bad in ("", "1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA"):
        with pytest.raises(ValueError, match="TURNSTILE_SECRET_KEY"):
            _prod(turnstile_secret_key=bad)
    assert _prod(turnstile_secret_key=REAL_SECRET).turnstile_secret == REAL_SECRET
