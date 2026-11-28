"""Shared whiteboard (#45) and chat read markers (#44) exercised together."""

import asyncio

from tests.conftest import Flow, UserFactory

SCENE = {"elements": [{"id": "a", "type": "rectangle", "version": 1}], "files": {}}


def wb(flow: Flow) -> str:
    return f"/tasks/{flow.task_id}/whiteboard"


async def unread(flow: Flow, who: str) -> int:
    h = getattr(flow, who).h
    r = await flow.client.get("/me/unread", headers=h)
    assert r.status_code == 200, r.text
    return int(r.json()["count"])


async def test_whiteboard_activity_does_not_count_as_unread_chat(flow: Flow) -> None:
    await flow.to("paid")
    for _ in range(3):
        v = (await flow.client.get(wb(flow), headers=flow.student.h)).json()["version"]
        r = await flow.client.put(
            wb(flow), headers=flow.student.h, json={"scene": SCENE, "base_version": v}
        )
        assert r.status_code == 200
    assert await unread(flow, "tutor") == 0
    tasks = (await flow.client.get("/tasks", headers=flow.tutor.h)).json()
    assert [t["unread_count"] for t in tasks if t["id"] == flow.task_id] == [0]


async def test_send_and_read_at_once_never_500s_and_settles(flow: Flow) -> None:
    await flow.to("paid")
    c, cid = flow.client, flow.conversation_id
    results = await asyncio.gather(
        c.post(f"/conversations/{cid}/messages", headers=flow.tutor.h, json={"body": "hola"}),
        c.post(f"/conversations/{cid}/read", headers=flow.student.h, json={}),
        c.post(f"/conversations/{cid}/read", headers=flow.student.h, json={}),
        c.post(f"/conversations/{cid}/messages", headers=flow.student.h, json={"body": "hi"}),
    )
    assert all(r.status_code < 500 for r in results), [r.status_code for r in results]
    assert (
        await c.post(f"/conversations/{cid}/read", headers=flow.student.h, json={})
    ).status_code == 204
    assert await unread(flow, "student") == 0
    assert await unread(flow, "tutor") == 0  # their reply marked their own view read


async def test_hindi_scene_under_the_byte_cap_is_saved(flow: Flow) -> None:
    """The cap is about bytes on the wire: non-ASCII text must not count 6x (\\uXXXX)."""
    await flow.to("paid")
    text = "नमस्ते " * 60_000  # ~1.1 MB as UTF-8, ~2.5 MB if escaped to \uXXXX
    scene = {"elements": [{"id": "t", "type": "text", "version": 1, "text": text}], "files": {}}
    r = await flow.client.put(
        wb(flow), headers=flow.student.h, json={"scene": scene, "base_version": 0}
    )
    assert r.status_code == 200, r.text[:200]
    got = (await flow.client.get(wb(flow), headers=flow.tutor.h)).json()
    assert got["scene"]["elements"][0]["text"] == text


async def test_board_still_usable_after_an_oversized_save(flow: Flow) -> None:
    await flow.to("paid")
    big = {"elements": [], "files": {"img": {"dataURL": "x" * (2 * 1024 * 1024)}}}
    r = await flow.client.put(
        wb(flow), headers=flow.student.h, json={"scene": big, "base_version": 0}
    )
    assert r.status_code == 413
    assert r.json().get("detail")
    r = await flow.client.put(
        wb(flow), headers=flow.student.h, json={"scene": SCENE, "base_version": 0}
    )
    assert r.status_code == 200 and r.json()["version"] == 1


async def test_board_through_dispute_and_refund(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("paid")
    assert (
        await flow.client.put(
            wb(flow), headers=flow.tutor.h, json={"scene": SCENE, "base_version": 0}
        )
    ).status_code == 200
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/disputes", headers=flow.student.h, json={"reason": "no show"}
    )
    assert r.status_code == 201
    assert (await flow.client.get(wb(flow), headers=flow.student.h)).status_code == 200
    admin = await make_user("admin")
    assert (await flow.client.get(wb(flow), headers=admin.h)).status_code in (403, 404)
    d = (await flow.client.get("/admin/disputes", headers=admin.h)).json()[0]
    r = await flow.client.post(
        f"/admin/disputes/{d['id']}/resolve",
        headers=admin.h,
        json={"outcome": "refund", "note": "ok"},
    )
    assert r.status_code == 200
    # Refunded: the session is over, the board is closed to both (a clear 4xx, never a 500).
    for who in (flow.student, flow.tutor):
        assert (await flow.client.get(wb(flow), headers=who.h)).status_code == 409
    # The chat (and its read markers) keep working after a refund.
    cid = flow.conversation_id
    assert (
        await flow.client.post(f"/conversations/{cid}/read", headers=flow.student.h, json={})
    ).status_code == 204


async def test_completed_session_keeps_board_and_unread(flow: Flow) -> None:
    await flow.to("delivered")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200, r.text
    assert (await flow.client.get(wb(flow), headers=flow.tutor.h)).status_code == 200
    cid = flow.conversation_id
    await flow.client.post(
        f"/conversations/{cid}/messages", headers=flow.tutor.h, json={"body": "gracias"}
    )
    assert await unread(flow, "student") == 1


async def test_outsiders_cannot_mark_read_or_see_board(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("paid")
    cid = flow.conversation_id
    for role in ("student", "tutor", "admin"):
        u = await make_user(role)
        r = await flow.client.post(f"/conversations/{cid}/read", headers=u.h, json={})
        assert r.status_code == 404
        assert (await flow.client.get(wb(flow), headers=u.h)).status_code in (403, 404)
        assert (await flow.client.get("/me/unread", headers=u.h)).json()["count"] == 0
