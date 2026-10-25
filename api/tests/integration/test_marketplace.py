import uuid

import httpx

from tests.conftest import Flow, UserFactory


async def test_full_marketplace_loop_with_review_updates_rating(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    c = flow.client
    r = await c.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200, r.text
    r = await c.post(
        f"/tasks/{flow.task_id}/review",
        headers=flow.student.h,
        json={"rating": 5, "comment": "Clear explanations"},
    )
    assert r.status_code == 201
    r = await c.post(f"/tasks/{flow.task_id}/review", headers=flow.student.h, json={"rating": 1})
    assert r.status_code == 409  # one review per task
    tutors = (await c.get("/tutors", headers=flow.student.h)).json()
    me = next(t for t in tutors if t["user_id"] == str(flow.tutor.id))
    assert me["rating_count"] == 1 and me["rating_avg"] == 5.0


async def test_honor_code_required(flow: Flow) -> None:
    r = await flow.client.post(
        "/tasks",
        headers=flow.student.h,
        json={
            "subject": "Math",
            "title": "abc",
            "description": "x",
            "budget_cents": 1000,
            "honor_code_ack": False,
        },
    )
    assert r.status_code == 409


async def test_unapproved_tutor_cannot_see_or_bid(flow: Flow, make_user: UserFactory) -> None:
    await flow.post_task()
    pending = await make_user("tutor", tutor_status="pending")
    assert (await flow.client.get("/tasks?scope=open", headers=pending.h)).json() == []
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=pending.h, json={"amount_cents": 1000}
    )
    assert r.status_code == 403


async def test_duplicate_bid_rejected(flow: Flow) -> None:
    await flow.to("bid")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=flow.tutor.h, json={"amount_cents": 1500}
    )
    assert r.status_code == 409


async def test_other_student_cannot_see_or_hire(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("bid")
    other = await make_user("student")
    c = flow.client
    assert (await c.get(f"/tasks/{flow.task_id}", headers=other.h)).status_code == 404
    assert (await c.get(f"/tasks/{flow.task_id}/bids", headers=other.h)).status_code == 404
    r = await c.post(f"/tasks/{flow.task_id}/hire", headers=other.h, json={"bid_id": flow.bid_id})
    assert r.status_code == 404


async def test_hire_rejects_other_bids_and_closes_task(flow: Flow, make_user: UserFactory) -> None:
    await flow.post_task()
    rival = await make_user("tutor")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=rival.h, json={"amount_cents": 3000}
    )
    rival_bid = r.json()["id"]
    await flow.bid()
    await flow.hire()
    bids = (await flow.client.get(f"/tasks/{flow.task_id}/bids", headers=flow.student.h)).json()
    status = {b["id"]: b["status"] for b in bids}
    assert status == {flow.bid_id: "accepted", rival_bid: "rejected"}
    # Rival no longer sees the (no longer open) task; second hire is impossible.
    assert (await flow.client.get(f"/tasks/{flow.task_id}", headers=rival.h)).status_code == 404
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": rival_bid}
    )
    assert r.status_code == 409


async def test_tutor_sees_only_own_bid(flow: Flow, make_user: UserFactory) -> None:
    await flow.post_task()
    rival = await make_user("tutor")
    await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=rival.h, json={"amount_cents": 3000}
    )
    await flow.bid()
    bids = (await flow.client.get(f"/tasks/{flow.task_id}/bids", headers=flow.tutor.h)).json()
    assert [b["tutor_id"] for b in bids] == [str(flow.tutor.id)]


async def test_only_hired_tutor_delivers_and_only_after_payment(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.to("hired")
    c = flow.client
    r = await c.post(f"/tasks/{flow.task_id}/deliver", headers=flow.tutor.h, json={"note": "x"})
    assert r.status_code == 409  # not paid yet
    await flow.pay()
    rival = await make_user("tutor")
    r = await c.post(f"/tasks/{flow.task_id}/deliver", headers=rival.h, json={"note": "x"})
    assert r.status_code == 404


async def test_review_requires_completion(flow: Flow) -> None:
    await flow.to("delivered")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/review", headers=flow.student.h, json={"rating": 4}
    )
    assert r.status_code == 409


async def test_rating_bounds(flow: Flow) -> None:
    await flow.to("posted")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/review", headers=flow.student.h, json={"rating": 6}
    )
    assert r.status_code == 422


async def test_unknown_task_and_bad_ids(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    assert (await client.get(f"/tasks/{uuid.uuid4()}", headers=u.h)).status_code == 404
    assert (await client.get("/tasks/not-a-uuid", headers=u.h)).status_code == 422


async def test_hired_task_cannot_be_cancelled(flow: Flow) -> None:
    await flow.to("hired")
    r = await flow.client.post(f"/tasks/{flow.task_id}/cancel", headers=flow.student.h)
    assert r.status_code == 409


async def test_open_task_can_be_cancelled(flow: Flow) -> None:
    await flow.to("posted")
    r = await flow.client.post(f"/tasks/{flow.task_id}/cancel", headers=flow.student.h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"


async def test_suspended_tutor_cannot_be_hired(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    await db.execute("update profiles set is_active = false where id = $1", flow.tutor.id)
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": flow.bid_id}
    )
    assert r.status_code == 409
