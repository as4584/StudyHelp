"""Unread chat counts: per participant, cleared by viewing (mark read) or replying."""

from tests.conftest import Flow, User


async def _send(f: Flow, who: User, text: str) -> None:
    r = await f.client.post(
        f"/conversations/{f.conversation_id}/messages", headers=who.h, json={"body": text}
    )
    assert r.status_code == 201, r.text


async def _mine(f: Flow, who: User) -> dict:  # type: ignore[type-arg]
    r = await f.client.get("/tasks?scope=mine", headers=who.h)
    assert r.status_code == 200, r.text
    [t] = [t for t in r.json() if t["id"] == f.task_id]
    return t  # type: ignore[no-any-return]


async def _total(f: Flow, who: User) -> int:
    r = await f.client.get("/me/unread", headers=who.h)
    assert r.status_code == 200, r.text
    return int(r.json()["count"])


async def test_new_hire_shows_counterpart_and_unopened_chat(flow: Flow) -> None:
    await flow.to("hired")
    tutor_view = await _mine(flow, flow.tutor)
    assert tutor_view["counterpart_name"].startswith("student-")
    assert tutor_view["chat_opened"] is False and tutor_view["unread_count"] == 0
    student_view = await _mine(flow, flow.student)
    assert student_view["counterpart_name"].startswith("tutor-")


async def test_unread_counts_follow_each_participant(flow: Flow) -> None:
    await flow.to("hired")
    await _send(flow, flow.student, "hello")
    await _send(flow, flow.student, "are you there?")
    assert (await _mine(flow, flow.tutor))["unread_count"] == 2
    assert await _total(flow, flow.tutor) == 2
    # The sender's own messages are never unread for them.
    assert (await _mine(flow, flow.student))["unread_count"] == 0
    assert await _total(flow, flow.student) == 0

    r = await flow.client.post(f"/conversations/{flow.conversation_id}/read", headers=flow.tutor.h)
    assert r.status_code == 204, r.text
    view = await _mine(flow, flow.tutor)
    assert view["unread_count"] == 0 and view["chat_opened"] is True
    assert await _total(flow, flow.tutor) == 0

    await _send(flow, flow.student, "one more")
    assert (await _mine(flow, flow.tutor))["unread_count"] == 1
    # Replying counts as reading.
    await _send(flow, flow.tutor, "here!")
    assert (await _mine(flow, flow.tutor))["unread_count"] == 0
    assert (await _mine(flow, flow.student))["unread_count"] == 1


async def test_mark_read_is_idempotent(flow: Flow) -> None:
    await flow.to("hired")
    for _ in range(2):
        r = await flow.client.post(
            f"/conversations/{flow.conversation_id}/read", headers=flow.student.h
        )
        assert r.status_code == 204, r.text
