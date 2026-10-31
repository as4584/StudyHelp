"""Test harness.

Integration tests run against a disposable `gsht_test` database on the local Supabase
Postgres, built with the REAL Alembic migrations (never create_all). Tokens are signed
with a test-only ES256 key and verified by the production TokenVerifier.
"""

import base64
import os
import time
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

ADMIN_URL = os.environ.get(
    "TEST_ADMIN_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
TEST_DB = "gsht_test"
TEST_URL = ADMIN_URL.rsplit("/", 1)[0] + f"/{TEST_DB}"

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": TEST_URL.replace("postgresql://", "postgresql+asyncpg://"),
        "SUPABASE_URL": "http://supabase.test",
        "PAYMENTS_PROVIDER": "fake",
        "LLM_PROVIDER": "fake",
        "TRANSLATION_PROVIDER": "fake",
        "STORAGE_PROVIDER": "fake",
        "PLATFORM_FEE_BPS": "2500",
        "VIDEO_ENABLED": "true",
        "VIDEO_PROVIDER": "fake",
    }
)

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

from app.api.dependencies import get_verifier  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import reset_engine  # noqa: E402
from app.security.jwt import StaticKeySource, TokenVerifier  # noqa: E402

ISSUER = "http://supabase.test/auth/v1"


def _b64(n: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()


@dataclass
class KeyPair:
    kid: str
    private: ec.EllipticCurvePrivateKey

    def jwk(self) -> dict[str, str]:
        nums = self.private.public_key().public_numbers()
        return {
            "kty": "EC",
            "crv": "P-256",
            "alg": "ES256",
            "use": "sig",
            "kid": self.kid,
            "x": _b64(nums.x),
            "y": _b64(nums.y),
        }


TRUSTED = KeyPair("trusted-key", ec.generate_private_key(ec.SECP256R1()))
UNTRUSTED = KeyPair("trusted-key", ec.generate_private_key(ec.SECP256R1()))  # same kid!


def make_token(sub: str, *, key: KeyPair = TRUSTED, **overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "aud": "authenticated",
        "iss": ISSUER,
        "role": "authenticated",
        "iat": now,
        "exp": now + 600,
        "email": f"{sub[:8]}@test.local",
    }
    claims.update(overrides)
    for k in [k for k, v in claims.items() if v is None]:
        del claims[k]
    return jwt.encode(claims, key.private, algorithm="ES256", headers={"kid": key.kid})


def test_verifier() -> TokenVerifier:
    return TokenVerifier(
        StaticKeySource({"keys": [TRUSTED.jwk()]}), ISSUER, "authenticated", ["ES256"]
    )


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    admin = await asyncpg.connect(ADMIN_URL)
    await admin.execute(
        f"select pg_terminate_backend(pid) from pg_stat_activity where datname = '{TEST_DB}'"
    )
    await admin.execute(f"drop database if exists {TEST_DB}")
    await admin.execute(f"create database {TEST_DB}")
    await admin.close()
    conn = await asyncpg.connect(TEST_URL)
    await conn.execute((Path(__file__).parent / "supabase_stub.sql").read_text())
    await conn.close()

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    cfg.attributes["database_url"] = os.environ["DATABASE_URL"]
    import asyncio

    await asyncio.to_thread(command.upgrade, cfg, "head")
    get_settings.cache_clear()
    yield
    await reset_engine()


TABLES = (
    "audit_logs, ai_usage, ai_messages, ai_chats, disputes, reviews, message_translations, "
    "messages, conversations, subscriptions, transfers, payment_events, provider_events, tips, "
    "payments, bids, task_files, video_sessions, tasks, tutor_documents, tutor_profiles, profiles"
)


@pytest.fixture
async def db() -> AsyncIterator[asyncpg.Connection]:
    """Raw superuser connection for setup and assertions; tables are wiped after each test."""
    conn = await asyncpg.connect(TEST_URL)
    yield conn
    # Append-only triggers block DELETE but not TRUNCATE (an owner-only, test-only path).
    await conn.execute(f"truncate {TABLES} restart identity cascade; delete from auth.users;")
    await conn.close()


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    from app.main import create_app
    from app.providers.payments import get_gateway

    get_gateway.cache_clear()
    app = create_app()
    app.dependency_overrides[get_verifier] = test_verifier
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://api.test") as c:
        yield c


@dataclass
class User:
    id: uuid.UUID
    role: str
    token: str

    @property
    def h(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


UserFactory = Callable[..., Any]


@pytest.fixture
def make_user(db: asyncpg.Connection) -> UserFactory:
    async def factory(
        role: str = "student",
        *,
        lang: str = "en",
        tutor_status: str = "approved",
        payouts: bool = True,
        premium: bool = False,
        name: str | None = None,
    ) -> User:
        uid = uuid.uuid4()
        await db.execute("insert into auth.users(id, email) values ($1, $2)", uid, f"{uid}@t")
        await db.execute(
            "insert into profiles(id, role, display_name, preferred_language) values ($1,$2,$3,$4)",
            uid,
            role,
            name or f"{role}-{str(uid)[:4]}",
            lang,
        )
        if role == "tutor":
            await db.execute(
                "insert into tutor_profiles(user_id, bio, subjects, hourly_rate_cents, status,"
                " stripe_account_id, payouts_enabled) values ($1,'bio','{Math}',2000,$2,$3,$4)",
                uid,
                tutor_status,
                f"acct_fake_{uid.hex[:12]}" if payouts else None,
                payouts,
            )
        if premium:
            await db.execute(
                "insert into subscriptions(user_id, provider_subscription_id, status)"
                " values ($1, $2, 'active')",
                uid,
                f"sub_{uid.hex[:10]}",
            )
        return User(uid, role, make_token(str(uid)))

    return factory


@dataclass
class Flow:
    """Drives the marketplace through the API to a given stage."""

    client: httpx.AsyncClient
    student: User
    tutor: User
    task_id: str = ""
    bid_id: str = ""
    conversation_id: str = ""

    async def post_task(self, budget: int = 4000) -> str:
        r = await self.client.post(
            "/tasks",
            headers=self.student.h,
            json={
                "subject": "Math",
                "title": "Help me understand derivatives",
                "description": "Chain rule practice",
                "budget_cents": budget,
                "honor_code_ack": True,
            },
        )
        assert r.status_code == 201, r.text
        self.task_id = r.json()["id"]
        return self.task_id

    async def bid(self, amount: int = 4000) -> str:
        r = await self.client.post(
            f"/tasks/{self.task_id}/bids",
            headers=self.tutor.h,
            json={"amount_cents": amount, "message": "Happy to help"},
        )
        assert r.status_code == 201, r.text
        self.bid_id = r.json()["id"]
        return self.bid_id

    async def hire(self) -> None:
        r = await self.client.post(
            f"/tasks/{self.task_id}/hire", headers=self.student.h, json={"bid_id": self.bid_id}
        )
        assert r.status_code == 200, r.text
        r = await self.client.get(f"/tasks/{self.task_id}/conversation", headers=self.student.h)
        self.conversation_id = r.json()["id"]

    async def pay(self) -> str:
        r = await self.client.post(f"/tasks/{self.task_id}/checkout", headers=self.student.h)
        assert r.status_code == 200, r.text
        session_id = r.json()["url"].split("?")[0].rsplit("/", 1)[1]
        r = await self.client.post(
            f"/simulated/checkout/{session_id}/complete", headers=self.student.h
        )
        assert r.status_code == 200, r.text
        return session_id

    async def deliver(self) -> None:
        r = await self.client.post(
            f"/tasks/{self.task_id}/deliver",
            headers=self.tutor.h,
            json={"note": "Walkthrough video and practice set"},
        )
        assert r.status_code == 200, r.text

    async def to(self, stage: str, amount: int = 4000) -> "Flow":
        steps = ["posted", "bid", "hired", "paid", "delivered"]
        await self.post_task(amount)
        if steps.index(stage) >= 1:
            await self.bid(amount)
        if steps.index(stage) >= 2:
            await self.hire()
        if steps.index(stage) >= 3:
            await self.pay()
        if steps.index(stage) >= 4:
            await self.deliver()
        return self


@pytest.fixture
async def flow(client: httpx.AsyncClient, make_user: UserFactory) -> Flow:
    return Flow(client, await make_user("student"), await make_user("tutor", lang="es"))
