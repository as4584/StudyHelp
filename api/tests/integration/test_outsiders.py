"""Authorization matrix: people who are not part of a session (another student, another
tutor, an unapproved applicant) get nowhere with ANY of that session's endpoints, and private
things (AI chats, files, tutor documents) stay with their owner. Nothing may return 2xx or 5xx.
"""

import pytest

from tests.conftest import Flow, User, UserFactory


def _task_calls(f: Flow) -> list[tuple[str, str, dict | None]]:
    t = f.task_id
    return [
        ("get", f"/tasks/{t}", None),
        ("get", f"/tasks/{t}/bids", None),
        ("get", f"/tasks/{t}/payment", None),
        ("get", f"/tasks/{t}/quote", None),
        ("get", f"/tasks/{t}/conversation", None),
        ("get", f"/tasks/{t}/files", None),
        ("get", f"/tasks/{t}/video", None),
        ("get", f"/conversations/{f.conversation_id}/messages", None),
        ("post", f"/conversations/{f.conversation_id}/messages", {"body": "hi"}),
        ("post", f"/conversations/{f.conversation_id}/read", None),
        ("post", f"/tasks/{t}/cancel", None),
        ("post", f"/tasks/{t}/hire", {"bid_id": f.bid_id}),
        ("post", f"/tasks/{t}/checkout", None),
        ("post", f"/tasks/{t}/deliver", {"note": "done"}),
        ("post", f"/tasks/{t}/release", None),
        ("post", f"/tasks/{t}/review", {"rating": 1, "comment": "bad"}),
        ("post", f"/tasks/{t}/tips", {"amount_cents": 200}),
        ("post", f"/tasks/{t}/disputes", {"reason": "not mine"}),
        ("post", f"/tasks/{t}/video/join", None),
        ("post", f"/tasks/{t}/video/end", None),
        (
            "post",
            f"/tasks/{t}/files",
            {"filename": "x.png", "content_type": "image/png", "kind": "rubric", "size": 10},
        ),
    ]


async def _send(f: Flow, who: User, method: str, path: str, body: dict | None):  # type: ignore[no-untyped-def]
    kwargs: dict = {"headers": who.h}
    if method == "post":
        kwargs["json"] = body or {}
    return await getattr(f.client, method)(path, **kwargs)


@pytest.mark.parametrize("stage", ["paid", "delivered"])
@pytest.mark.parametrize(
    "outsider",
    [("student", {}), ("tutor", {}), ("tutor", {"tutor_status": "pending"})],
    ids=["other-student", "other-tutor", "applicant"],
)
async def test_outsiders_get_nowhere_with_a_session(
    flow: Flow,
    make_user: UserFactory,
    db,
    stage: str,
    outsider,  # type: ignore[no-untyped-def]
) -> None:
    await flow.to(stage)
    who = await make_user(outsider[0], **outsider[1])
    before = await db.fetchval("select status from tasks")
    leaks = []
    for method, path, body in _task_calls(flow):
        r = await _send(flow, who, method, path, body)
        if r.status_code < 400 or r.status_code >= 500:
            leaks.append(f"{method.upper()} {path} -> {r.status_code} {r.text[:120]}")
    assert leaks == []
    assert await db.fetchval("select status from tasks") == before
    assert await db.fetchval("select count(*) from messages where sender_id = $1", who.id) == 0


async def test_private_ai_chats_stay_with_their_owner(flow: Flow, make_user: UserFactory) -> None:
    r = await flow.client.post("/ai/chats", headers=flow.student.h, json={})
    assert r.status_code == 201, r.text
    chat = r.json()["id"]
    for who in (await make_user("student"), flow.tutor, await make_user("admin")):
        for method, path, body in [
            ("get", f"/ai/chats/{chat}/messages", None),
            ("post", f"/ai/chats/{chat}/messages", {"question": "2+2"}),
            ("post", f"/ai/chats/{chat}/escalate", {}),
        ]:
            res = await _send(flow, who, method, path, body)
            assert 400 <= res.status_code < 500, f"{who.role} {method} {path}: {res.status_code}"


async def test_outsiders_and_admins_never_see_session_unread_counts(
    flow: Flow, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    r = await flow.client.post(
        f"/conversations/{flow.conversation_id}/messages",
        headers=flow.student.h,
        json={"body": "hi"},
    )
    assert r.status_code == 201, r.text
    for who in (await make_user("student"), await make_user("tutor"), await make_user("admin")):
        r = await flow.client.get("/me/unread", headers=who.h)
        assert r.status_code == 200 and r.json() == {"count": 0}, f"{who.role}: {r.text}"
        r = await flow.client.get("/tasks?scope=mine", headers=who.h)
        assert r.status_code == 200, r.text
        for t in r.json():
            # Admins list every task, but chat details stay with the two participants.
            assert t["unread_count"] == 0 and t["counterpart_name"] is None, who.role
    # The outsiders' failed mark-read attempts left no read marker behind.
    assert await db.fetchval("select count(*) from conversation_reads") == 1  # the sender's


async def test_tutor_documents_are_admin_only(flow: Flow, make_user: UserFactory) -> None:
    for who in (flow.student, await make_user("tutor")):
        r = await flow.client.get(f"/tutors/{flow.tutor.id}/documents", headers=who.h)
        assert 400 <= r.status_code < 500, f"{who.role}: {r.status_code}"


async def test_admin_actions_refuse_non_admins(flow: Flow) -> None:
    for who in (flow.student, flow.tutor):
        for method, path in [
            ("get", "/admin/disputes"),
            ("get", "/admin/revenue"),
            ("get", "/admin/users"),
            ("post", f"/admin/users/{flow.student.id}/suspend"),
            ("post", f"/admin/tutors/{flow.tutor.id}/approve"),
            ("get", "/admin/tutors"),
            ("get", "/admin/payments"),
            ("get", "/admin/audit"),
            ("get", "/admin/policy-acceptances"),
        ]:
            r = await _send(flow, who, method, path, {})
            assert 400 <= r.status_code < 500, f"{who.role} {method} {path}: {r.status_code}"
