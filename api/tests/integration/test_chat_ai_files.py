import uuid
from datetime import UTC, datetime, timedelta

import httpx

from tests.conftest import Flow, UserFactory


async def test_translated_chat_both_directions(flow: Flow) -> None:
    await flow.to("hired")
    c, conv = flow.client, flow.conversation_id
    r = await c.post(
        f"/conversations/{conv}/messages",
        headers=flow.student.h,
        json={"body": "Can you explain the chain rule?"},
    )
    assert r.status_code == 201
    assert (
        r.json()["translations"][0]["translated_body"] == "[EN→ES] Can you explain the chain rule?"
    )
    r = await c.post(
        f"/conversations/{conv}/messages", headers=flow.tutor.h, json={"body": "Claro, empecemos"}
    )
    assert r.json()["translations"][0]["target_language"] == "en"
    msgs = (await c.get(f"/conversations/{conv}/messages", headers=flow.tutor.h)).json()
    assert [m["body"] for m in msgs] == ["Can you explain the chain rule?", "Claro, empecemos"]


async def test_translation_failure_keeps_original(flow: Flow) -> None:
    await flow.to("hired")
    body = "Please keep this [[fail-translation]]"
    r = await flow.client.post(
        f"/conversations/{flow.conversation_id}/messages",
        headers=flow.student.h,
        json={"body": body},
    )
    assert r.status_code == 201
    tr = r.json()["translations"][0]
    assert tr["status"] == "failed" and tr["translated_body"] is None
    msgs = (
        await flow.client.get(
            f"/conversations/{flow.conversation_id}/messages", headers=flow.tutor.h
        )
    ).json()
    assert msgs[0]["body"] == body


async def test_same_language_skips_translation(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    f = Flow(client, await make_user("student"), await make_user("tutor", lang="en"))
    await f.to("hired")
    r = await client.post(
        f"/conversations/{f.conversation_id}/messages", headers=f.student.h, json={"body": "hi"}
    )
    assert r.json()["translations"] == []


async def test_outsiders_cannot_read_or_write_chat(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("hired")
    for outsider in (
        await make_user("student"),
        await make_user("tutor"),
        await make_user("admin"),
    ):
        r = await flow.client.get(
            f"/conversations/{flow.conversation_id}/messages", headers=outsider.h
        )
        assert r.status_code == 404
        r = await flow.client.post(
            f"/conversations/{flow.conversation_id}/messages",
            headers=outsider.h,
            json={"body": "intrude"},
        )
        assert r.status_code == 404


async def test_task_files_are_private(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("hired")
    c = flow.client
    r = await c.post(
        f"/tasks/{flow.task_id}/files",
        headers=flow.student.h,
        json={"filename": "rubric.pdf", "kind": "rubric"},
    )
    assert r.status_code == 201
    file_id, path = r.json()["file_id"], r.json()["path"]
    assert path.startswith(f"{flow.task_id}/")  # server-chosen path
    r = await c.post(
        f"/tasks/{flow.task_id}/files",
        headers=flow.tutor.h,
        json={"filename": "x.pdf", "kind": "rubric"},
    )
    assert r.status_code == 403
    assert (await c.get(f"/files/{file_id}/download", headers=flow.tutor.h)).status_code == 200
    other = await make_user("student")
    assert (await c.get(f"/files/{file_id}/download", headers=other.h)).status_code == 404
    assert (await c.get(f"/tasks/{flow.task_id}/files", headers=other.h)).status_code == 404
    r = await c.post(
        f"/tasks/{flow.task_id}/files",
        headers=flow.student.h,
        json={"filename": "../../etc/passwd", "kind": "rubric"},
    )
    assert r.status_code == 422


async def test_tutor_documents_private(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    tutor, rival, admin = (
        await make_user("tutor"),
        await make_user("tutor"),
        await make_user("admin"),
    )
    r = await client.post("/tutors/me/documents", headers=tutor.h, json={"filename": "degree.pdf"})
    doc = r.json()["file_id"]
    assert (await client.get(f"/tutors/{tutor.id}/documents", headers=rival.h)).status_code == 404
    assert (
        await client.get(f"/tutor-documents/{doc}/download", headers=rival.h)
    ).status_code == 404
    assert (
        await client.get(f"/tutor-documents/{doc}/download", headers=admin.h)
    ).status_code == 200


async def test_free_students_get_five_ai_questions_per_day(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    s = await make_user("student")
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "Math"})).json()
    url = f"/ai/chats/{chat['id']}/messages"
    for i in range(5):
        r = await client.post(url, headers=s.h, json={"question": f"q{i}"})
        assert r.status_code == 201, r.text
    q = (await client.get("/ai/quota", headers=s.h)).json()
    assert q["period"] == "day" and q["used"] == 5 and q["remaining"] == 0
    r = await client.post(url, headers=s.h, json={"question": "one more"})
    assert r.status_code == 402 and r.json()["code"] == "ai_daily_limit" and r.json()["resets_at"]
    assert await db.fetchval("select count(*) from ai_usage where status = 'denied'") == 1
    # Yesterday's questions don't count: the allowance resets each UTC day.
    await db.execute(
        "update ai_messages set created_at = now() - interval '1 day' - interval '1 minute'"
    )
    r = await client.post(url, headers=s.h, json={"question": "new day"})
    assert r.status_code == 201


async def test_premium_is_unlimited_daily_with_monthly_fair_use_cap(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    s = await make_user("student", premium=True)
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "Math"})).json()
    url = f"/ai/chats/{chat['id']}/messages"
    for i in range(6):  # past the free daily allowance
        assert (await client.post(url, headers=s.h, json={"question": f"q{i}"})).status_code == 201
    # Fill the rest of the month's 150 directly, then the 151st is refused.
    await db.execute(
        "insert into ai_messages (chat_id, role, content)"
        " select $1, 'user', 'x' from generate_series(1, 144)",
        uuid.UUID(chat["id"]),
    )
    q = (await client.get("/ai/quota", headers=s.h)).json()
    assert q["period"] == "month" and q["used"] == 150 and q["limit"] == 150
    r = await client.post(url, headers=s.h, json={"question": "151"})
    assert r.status_code == 429 and r.json()["code"] == "ai_fair_use"


async def test_ai_answers_logs_usage_and_escalates(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    s = await make_user("student", premium=True)
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "Calculus"})).json()
    r = await client.post(
        f"/ai/chats/{chat['id']}/messages",
        headers=s.h,
        json={"question": "How do I differentiate sin(x^2)?"},
    )
    assert r.status_code == 201 and r.json()["role"] == "assistant"
    usage = await db.fetchrow("select * from ai_usage")
    assert usage["status"] == "ok" and usage["provider"] == "fake" and usage["premium"]
    draft = (await client.post(f"/ai/chats/{chat['id']}/escalate", headers=s.h)).json()
    assert draft["subject"] == "Calculus" and "sin(x^2)" in draft["title"]
    r = await client.post(
        "/tasks", headers=s.h, json={**draft, "budget_cents": 2500, "honor_code_ack": True}
    )
    assert r.status_code == 201


async def test_ai_chats_are_private(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    a, b = await make_user("student", premium=True), await make_user("student", premium=True)
    chat = (await client.post("/ai/chats", headers=a.h, json={})).json()
    await client.post(f"/ai/chats/{chat['id']}/messages", headers=a.h, json={"question": "secret"})
    assert (await client.get(f"/ai/chats/{chat['id']}/messages", headers=b.h)).status_code == 404
    assert (await client.post(f"/ai/chats/{chat['id']}/escalate", headers=b.h)).status_code == 404
    r = await client.post(f"/ai/chats/{chat['id']}/messages", headers=b.h, json={"question": "x"})
    assert r.status_code == 404


async def test_admin_tutor_approval_flow_is_audited(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    admin = await make_user("admin")
    t = await make_user("tutor", tutor_status="pending")
    pending = (await client.get("/admin/tutors?status=pending", headers=admin.h)).json()
    assert [p["user_id"] for p in pending] == [str(t.id)]
    r = await client.post(f"/admin/tutors/{t.id}/approve", headers=admin.h)
    assert r.json()["status"] == "approved"
    log = await db.fetchrow("select * from audit_logs where action = 'tutor.approved'")
    assert log["actor_user_id"] == admin.id
    r = await client.post(f"/admin/users/{admin.id}/suspend", headers=admin.h)
    assert r.status_code == 403  # cannot suspend self
    r = await client.post(f"/admin/users/{t.id}/suspend", headers=admin.h)
    assert r.json()["is_active"] is False
    assert (await client.get("/me", headers=t.h)).status_code == 403


async def test_free_allowance_resets_at_next_utc_midnight(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s = await make_user("student")
    q = (await client.get("/ai/quota", headers=s.h)).json()
    resets = datetime.fromisoformat(q["resets_at"])
    now = datetime.now(UTC)
    assert resets == (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


async def test_failed_ai_answer_does_not_use_up_a_question(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    from app.providers.llm import LLMError, get_llm_provider

    app = client._transport.app  # type: ignore[attr-defined]  # the fixture's ASGI app

    class Down:
        name = "down"

        async def generate(self, **_: object) -> object:
            raise LLMError("provider outage")

    s = await make_user("student")
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "Math"})).json()
    app.dependency_overrides[get_llm_provider] = lambda: Down()
    try:
        r = await client.post(
            f"/ai/chats/{chat['id']}/messages", headers=s.h, json={"question": "hi"}
        )
    finally:
        app.dependency_overrides.pop(get_llm_provider)
    assert r.status_code == 502
    assert (await client.get("/ai/quota", headers=s.h)).json()["used"] == 0
    assert await db.fetchval("select status from ai_usage") == "error"
