"""When something behind the API breaks (database, file storage, the AI gateway, Supabase
Auth), the browser must still get a readable JSON answer it is allowed to read (CORS), with an
honest status: 503 while a dependency is away, never a bare text 500 the page can't parse."""

import httpx
import pytest
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from tests.conftest import Flow

ORIGIN = "http://localhost:3000"


@pytest.fixture
def boom(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """Make the task list raise whatever exception the test hands it."""
    from app.services import marketplace

    def install(exc: Exception) -> None:
        async def fail(*_a, **_k):  # type: ignore[no-untyped-def]
            raise exc

        monkeypatch.setattr(marketplace, "list_tasks", fail)

    return install


async def _get(flow: Flow) -> httpx.Response:
    return await flow.client.get("/tasks", headers={**flow.student.h, "Origin": ORIGIN})


def _cors_ok(r: httpx.Response) -> bool:
    return r.headers.get("access-control-allow-origin") in (ORIGIN, "*")


async def test_an_unexpected_crash_is_json_the_page_can_read(flow: Flow, boom) -> None:  # type: ignore[no-untyped-def]
    boom(RuntimeError("bug"))
    r = await _get(flow)
    assert r.status_code == 500
    body = r.json()
    assert body["code"] == "internal_error" and "try again" in body["detail"].lower()
    assert body.get("request_id")
    assert "bug" not in r.text  # internals never reach the browser
    assert _cors_ok(r), r.headers


async def test_a_database_outage_is_a_503_not_a_crash(flow: Flow, boom) -> None:  # type: ignore[no-untyped-def]
    boom(OperationalError("select 1", {}, ConnectionRefusedError("db down")))
    r = await _get(flow)
    assert r.status_code == 503
    assert r.json()["code"] == "temporarily_unavailable"
    assert _cors_ok(r)


async def test_storage_unreachable_is_a_clear_provider_error(
    flow: Flow, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.providers.storage import SupabaseStorage

    def refuse(*_a, **_k):  # type: ignore[no-untyped-def]
        raise httpx.ConnectError("refused")

    store = SupabaseStorage(get_settings())
    monkeypatch.setattr(httpx.AsyncClient, "post", refuse)
    with pytest.raises(Exception) as err:
        await store.signed_upload("task-files", "a/b.png")
    assert type(err.value).__name__ == "ProviderError"
    assert "temporarily unavailable" in str(err.value)
    with pytest.raises(Exception) as err2:
        await store.signed_download("task-files", "a/b.png")
    assert type(err2.value).__name__ == "ProviderError"


async def test_auth_keys_unreachable_is_503_not_signed_out(flow: Flow) -> None:
    """Supabase Auth down: a signed-in person must not be told their session is invalid."""
    from app.api.dependencies import get_verifier
    from app.security.jwt import RemoteKeySource, TokenVerifier

    app = flow.client._transport.app  # type: ignore[attr-defined]
    s = get_settings()
    # Nothing listens on port 9: the key fetch fails at connect, like an unreachable Supabase.
    dead = TokenVerifier(
        RemoteKeySource("http://127.0.0.1:9/jwks.json"), s.jwt_issuer, s.jwt_audience, ["ES256"]
    )
    real = app.dependency_overrides[get_verifier]
    app.dependency_overrides[get_verifier] = lambda: dead
    try:
        r = await flow.client.get("/me", headers={**flow.student.h, "Origin": ORIGIN})
    finally:
        app.dependency_overrides[get_verifier] = real
    assert r.status_code == 503, r.text
    assert r.json()["code"] == "auth_unavailable"
    assert _cors_ok(r)
