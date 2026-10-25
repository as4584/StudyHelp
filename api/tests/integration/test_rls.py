"""Real RLS boundary tests (directive section 21).

These connect as the Supabase `authenticated` role with JWT claims set exactly as
PostgREST/Realtime do, proving that a browser holding a user's token cannot read other
users' rows directly from the database, independently of FastAPI.
"""

import json
import uuid
from contextlib import asynccontextmanager
from typing import Any

import pytest

from tests.conftest import Flow, UserFactory


@asynccontextmanager
async def as_user(db, user_id: uuid.UUID | None):  # type: ignore[no-untyped-def]
    tr = db.transaction()
    await tr.start()
    try:
        role = "authenticated" if user_id else "anon"
        claims = json.dumps({"sub": str(user_id), "role": role}) if user_id else "{}"
        await db.execute(f"set local role {role}")
        await db.execute("select set_config('request.jwt.claims', $1, true)", claims)
        yield db
    finally:
        await tr.rollback()


async def count(db, user_id: uuid.UUID | None, sql: str, *args: Any) -> int:  # type: ignore[no-untyped-def]
    async with as_user(db, user_id) as conn:
        return int(await conn.fetchval(sql, *args))


async def test_students_cannot_read_each_others_tasks(
    flow: Flow, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    other = await make_user("student")
    tid = uuid.UUID(flow.task_id)
    assert await count(db, flow.student.id, "select count(*) from tasks where id=$1", tid) == 1
    assert await count(db, other.id, "select count(*) from tasks where id=$1", tid) == 0
    assert await count(db, flow.tutor.id, "select count(*) from tasks where id=$1", tid) == 1


async def test_conversations_and_messages_participant_only(
    flow: Flow, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    await flow.client.post(
        f"/conversations/{flow.conversation_id}/messages",
        headers=flow.student.h,
        json={"body": "private"},
    )
    other_student, other_tutor = await make_user("student"), await make_user("tutor")
    for table in ("conversations", "messages", "message_translations"):
        sql = f"select count(*) from {table}"
        assert await count(db, flow.student.id, sql) >= 1
        assert await count(db, flow.tutor.id, sql) >= 1
        assert await count(db, other_student.id, sql) == 0
        assert await count(db, other_tutor.id, sql) == 0


async def test_payments_party_only(flow: Flow, make_user: UserFactory, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    other = await make_user("student")
    assert await count(db, flow.student.id, "select count(*) from payments") == 1
    assert await count(db, other.id, "select count(*) from payments") == 0


@pytest.mark.parametrize(
    "table",
    [
        "audit_logs",
        "payment_events",
        "transfers",
        "provider_events",
        "disputes",
        "ai_chats",
        "ai_messages",
        "ai_usage",
        "subscriptions",
        "tips",
        "task_files",
        "tutor_documents",
    ],
)
async def test_internal_tables_unreadable_by_clients(
    table: str, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    u = await make_user("admin")  # even admins only reach these through FastAPI
    with pytest.raises(Exception, match="permission denied"):
        await count(db, u.id, f"select count(*) from {table}")


async def test_clients_cannot_write_directly(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    with pytest.raises(Exception, match="permission denied"):
        async with as_user(db, flow.student.id) as conn:
            await conn.execute("update payments set status = 'released'")
    with pytest.raises(Exception, match="permission denied"):
        async with as_user(db, flow.student.id) as conn:
            await conn.execute("update profiles set role = 'admin'")


async def test_anon_sees_nothing(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("posted")
    with pytest.raises(Exception, match="permission denied"):
        await count(db, None, "select count(*) from tasks")


async def test_profiles_self_only(make_user: UserFactory, db) -> None:  # type: ignore[no-untyped-def]
    a, b = await make_user("student"), await make_user("student")
    assert await count(db, a.id, "select count(*) from profiles") == 1
    assert await count(db, a.id, "select count(*) from profiles where id=$1", b.id) == 0
