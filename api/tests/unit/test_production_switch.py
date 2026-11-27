"""What changes when ENVIRONMENT=production: demo and simulated-payment routes and the API docs
are gone, unsigned webhooks are refused, CORS only answers the real site, and every response
carries browser-safety headers (plus HSTS in production)."""

from collections.abc import Iterator

import httpx
import pytest

from app.core.config import get_settings

PROD = {
    "ENVIRONMENT": "production",
    "PAYMENTS_PROVIDER": "stripe",
    "STRIPE_SECRET_KEY": "sk_test_unit",
    "STRIPE_WEBHOOK_SECRET": "whsec_unit",
    "STRIPE_PREMIUM_PRICE_ID": "price_unit",
    "LLM_PROVIDER": "ollama",
    "OLLAMA_MODEL": "m",
    "TRANSLATION_PROVIDER": "ollama",
    "TRANSLATION_OLLAMA_MODEL": "m",
    "STORAGE_PROVIDER": "supabase",
    "VIDEO_ENABLED": "false",
    "TURNSTILE_SECRET_KEY": "0x4AAAAAAAunitTestSecretNotReal",
    "CORS_ORIGINS": '["https://site.example"]',
    "WEB_BASE_URL": "https://site.example",
}


@pytest.fixture
def prod(monkeypatch: pytest.MonkeyPatch) -> Iterator[httpx.AsyncClient]:
    for k, v in PROD.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    from app.main import create_app
    from app.providers.payments import get_gateway

    get_gateway.cache_clear()
    app = create_app()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    yield httpx.AsyncClient(transport=transport, base_url="https://api.example")
    get_settings.cache_clear()
    get_gateway.cache_clear()


def _paths(client: httpx.AsyncClient) -> set[str]:
    app = client._transport.app  # type: ignore[attr-defined]
    return {getattr(r, "path", "") for r in app.routes}


async def test_demo_simulated_and_docs_routes_are_not_mounted(prod: httpx.AsyncClient) -> None:
    paths = _paths(prod)
    assert not [p for p in paths if p.startswith(("/simulated", "/demo"))]
    assert not paths & {"/docs", "/redoc", "/openapi.json"}
    async with prod as c:
        assert (
            await c.post("/demo/restore-login", json={"email": "x@demo.gsht"})
        ).status_code == 404
        assert (await c.post("/simulated/connect/complete")).status_code == 404
        assert (await c.get("/openapi.json")).status_code == 404


async def test_webhook_refuses_unsigned_and_forged_events(prod: httpx.AsyncClient) -> None:
    async with prod as c:
        assert (await c.post("/webhooks/stripe", content=b"{}")).status_code == 400
        forged = await c.post(
            "/webhooks/stripe", content=b"{}", headers={"stripe-signature": "t=1,v1=deadbeef"}
        )
        assert forged.status_code == 400


async def test_cors_only_answers_the_real_site(prod: httpx.AsyncClient) -> None:
    pre = {"access-control-request-method": "GET"}
    async with prod as c:
        evil = await c.options("/me", headers={**pre, "origin": "https://evil.example"})
        assert "access-control-allow-origin" not in evil.headers
        ok = await c.options("/me", headers={**pre, "origin": "https://site.example"})
        assert ok.headers["access-control-allow-origin"] == "https://site.example"


async def test_responses_carry_security_headers_and_hsts(prod: httpx.AsyncClient) -> None:
    async with prod as c:
        for r in (await c.get("/health"), await c.get("/me"), await c.get("/nope")):
            h = r.headers
            assert h["x-content-type-options"] == "nosniff"
            assert h["x-frame-options"] == "DENY"
            assert "frame-ancestors 'none'" in h["content-security-policy"]
            assert h["referrer-policy"] == "no-referrer"
            assert h["cache-control"] == "no-store"
            assert h["strict-transport-security"].startswith("max-age=")


async def test_errors_do_not_leak_internals(prod: httpx.AsyncClient) -> None:
    async with prod as c:
        r = await c.get("/me", headers={"authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401 and r.json() == {"detail": "Invalid or missing credentials"}
        assert "Traceback" not in r.text


def test_production_refuses_the_always_pass_bot_check_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pydantic import ValidationError

    from app.core.config import Settings

    for k, v in PROD.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA")
    with pytest.raises(ValidationError, match="TURNSTILE"):
        Settings()
