import asyncio
import uuid

import httpx
import pytest

from tests.conftest import Flow, UserFactory


@pytest.mark.parametrize("closed_status", ["cancelled", "hired"])
async def test_bid_waits_for_task_closure(
    flow: Flow, make_user: UserFactory, db, closed_status: str
) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    rival = await make_user("tutor")
    task_id = uuid.UUID(flow.task_id)
    request = None
    try:
        async with db.transaction():
            # Hold the same row lock as hire/cancel, with the closure not yet committed.
            await db.fetchrow("select id from tasks where id = $1 for update", task_id)
            if closed_status == "hired":
                await db.execute(
                    "update tasks set status = 'hired', hired_tutor_id = $2, accepted_bid_id = $3 "
                    "where id = $1",
                    task_id,
                    flow.tutor.id,
                    uuid.UUID(flow.bid_id),
                )
                await db.execute(
                    "update bids set status = 'accepted' where id = $1", uuid.UUID(flow.bid_id)
                )
            else:
                await db.execute("update tasks set status = 'cancelled' where id = $1", task_id)
            request = asyncio.create_task(
                flow.client.post(
                    f"/tasks/{flow.task_id}/bids",
                    headers=rival.h,
                    json={"amount_cents": 2000},
                )
            )
            # Wait for PostgreSQL to confirm the request is blocked on our transaction.
            # A missing task lock instead waits at the FK insert with a stale 'open' task.
            async with asyncio.timeout(5):
                while not await db.fetchval(
                    "select exists(select 1 from pg_stat_activity "
                    "where pg_backend_pid() = any(pg_blocking_pids(pid)))"
                ):
                    if request.done():
                        pytest.fail(f"bid finished before task closure: {(await request).text}")
                    await asyncio.sleep(0.01)
        response = await asyncio.wait_for(request, timeout=5)
        assert response.status_code == 404, response.text
        assert (
            await db.fetchval(
                "select count(*) from bids where task_id = $1 and tutor_id = $2", task_id, rival.id
            )
            == 0
        )
    finally:
        if request is not None and not request.done():
            request.cancel()
            await asyncio.gather(request, return_exceptions=True)


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
            "budget_cents": 1500,
            "honor_code_ack": False,
        },
    )
    assert r.status_code == 409


async def test_unapproved_tutor_cannot_see_or_bid(flow: Flow, make_user: UserFactory) -> None:
    await flow.post_task()
    pending = await make_user("tutor", tutor_status="pending")
    assert (await flow.client.get("/tasks?scope=open", headers=pending.h)).json() == []
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=pending.h, json={"amount_cents": 1500}
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
        f"/tasks/{flow.task_id}/bids", headers=rival.h, json={"amount_cents": 2500}
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
        f"/tasks/{flow.task_id}/bids", headers=rival.h, json={"amount_cents": 2500}
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


async def test_hired_but_unpaid_task_can_be_cancelled(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    # The student opened a checkout but never paid: the request isn't stuck forever.
    assert (
        await flow.client.post(f"/tasks/{flow.task_id}/checkout", headers=flow.student.h)
    ).status_code == 200
    r = await flow.client.post(f"/tasks/{flow.task_id}/cancel", headers=flow.student.h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    statuses = await db.fetch(
        "select status from payments where task_id = $1", uuid.UUID(flow.task_id)
    )
    assert [p["status"] for p in statuses] == ["expired"]


async def test_paid_task_cannot_be_cancelled(flow: Flow) -> None:
    await flow.to("paid")
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


async def test_task_language_defaults_to_english_and_is_validated(flow: Flow) -> None:
    base = {
        "subject": "Math",
        "title": "Limits",
        "description": "x",
        "budget_cents": 1500,
        "honor_code_ack": True,
    }
    c, h = flow.client, flow.student.h
    r = await c.post("/tasks", headers=h, json=base)
    assert r.status_code == 201 and r.json()["language"] == "en"
    r = await c.post("/tasks", headers=h, json={**base, "language": "es"})
    assert r.status_code == 201 and r.json()["language"] == "es"
    r = await c.post("/tasks", headers=h, json={**base, "language": "spanish"})
    assert r.status_code == 422


async def test_tutors_only_see_requests_at_levels_they_teach(flow: Flow) -> None:
    c = flow.client
    base = {"subject": "Math", "description": "x", "budget_cents": 1500, "honor_code_ack": True}
    hs = await c.post(
        "/tasks",
        headers=flow.student.h,
        json={**base, "title": "HS algebra", "level": "high_school"},
    )
    assert hs.status_code == 201 and hs.json()["level"] == "high_school"
    r = await c.post(
        "/tasks", headers=flow.student.h, json={**base, "title": "Bad", "level": "phd"}
    )
    assert r.status_code == 422

    def open_ids(resp: httpx.Response) -> set[str]:
        return {t["id"] for t in resp.json()}

    assert hs.json()["id"] in open_ids(await c.get("/tasks?scope=open", headers=flow.tutor.h))
    r = await c.put(
        "/tutors/me/application",
        headers=flow.tutor.h,
        json={"bio": "", "subjects": ["Math"], "levels": ["college"], "hourly_rate_cents": 3000},
    )
    assert r.status_code == 200 and r.json()["levels"] == ["college"]
    assert hs.json()["id"] not in open_ids(await c.get("/tasks?scope=open", headers=flow.tutor.h))


async def test_profile_photo_set_validated_and_cleared(flow: Flow) -> None:
    c, h = flow.client, flow.student.h
    pic = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    r = await c.patch("/me", headers=h, json={"avatar_url": pic})
    assert r.status_code == 200 and r.json()["profile"]["avatar_url"] == pic
    for bad in ["javascript:alert(1)", "data:text/html;base64,PGgxPg==", "https://x.test/a.png"]:
        r = await c.patch("/me", headers=h, json={"avatar_url": bad})
        assert r.status_code == 422, bad
    r = await c.patch(
        "/me", headers=h, json={"avatar_url": "data:image/png;base64," + "A" * 200_000}
    )
    assert r.status_code == 422
    r = await c.patch("/me", headers=h, json={"avatar_url": ""})
    assert r.status_code == 200 and r.json()["profile"]["avatar_url"] is None


async def test_session_prices_must_fit_the_15_to_25_dollar_range(flow: Flow) -> None:
    c = flow.client
    base = {"subject": "Math", "title": "Limits", "description": "x", "honor_code_ack": True}
    for cents, status in [(1499, 422), (1500, 201), (2500, 201), (2501, 422)]:
        r = await c.post("/tasks", headers=flow.student.h, json={**base, "budget_cents": cents})
        assert r.status_code == status, (cents, r.text)
    await flow.post_task()
    for cents, status in [(1000, 422), (2600, 422), (2000, 201)]:
        r = await c.post(
            f"/tasks/{flow.task_id}/bids", headers=flow.tutor.h, json={"amount_cents": cents}
        )
        assert r.status_code == status, (cents, r.text)


async def test_application_main_subject_and_experience_show_on_offers(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    c = flow.client
    base = {"bio": "Independent tutor", "subjects": ["Physics", "Math"], "hourly_rate_cents": 2000}
    r = await c.put(
        "/tutors/me/application",
        headers=flow.tutor.h,
        json={**base, "main_subject": "Math", "years_experience": 7},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subjects"] == ["Math", "Physics"]  # the main subject is stored first
    assert body["main_subject"] == "Math" and body["years_experience"] == 7

    # The main subject must be one the tutor listed; experience must be realistic.
    for bad in [{"main_subject": "Chemistry"}, {"years_experience": -1}, {"years_experience": 61}]:
        r = await c.put("/tutors/me/application", headers=flow.tutor.h, json={**base, **bad})
        assert r.status_code == 422, bad

    # Adding Physics sent the application back for review; an admin approves it again.
    await db.execute(
        "update tutor_profiles set status = 'approved' where user_id = $1", flow.tutor.id
    )
    await flow.post_task()
    await flow.bid()
    [offer] = (await c.get(f"/tasks/{flow.task_id}/bids", headers=flow.student.h)).json()
    assert offer["tutor_main_subject"] == "Math" and offer["tutor_years_experience"] == 7


async def test_tutor_cannot_deliver_their_way_out_of_a_dispute(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.to("paid")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/disputes",
        headers=flow.student.h,
        json={"reason": "Tutor never showed up"},
    )
    assert r.status_code == 201
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/deliver", headers=flow.tutor.h, json={"note": "Here you go"}
    )
    assert r.status_code == 409
    task = (await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)).json()
    assert task["status"] == "disputed"
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/disputes", headers=flow.student.h, json={"reason": "again"}
    )
    assert r.status_code == 409  # never a 500
    admin = await make_user("admin")
    d = (await flow.client.get("/admin/disputes", headers=admin.h)).json()[0]
    r = await flow.client.post(
        f"/admin/disputes/{d['id']}/resolve",
        headers=admin.h,
        json={"outcome": "refund", "note": "ok"},
    )
    assert r.status_code == 200


async def test_tutor_cannot_bid_outside_their_levels(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.post_task()
    await db.execute(
        "update tutor_profiles set levels = '{high_school}' where user_id = $1", flow.tutor.id
    )
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=flow.tutor.h, json={"amount_cents": 2000}
    )
    assert r.status_code == 404


async def test_approved_tutor_changing_what_they_teach_is_reviewed_again(flow: Flow) -> None:
    app = {
        "bio": "I teach calculus and physics.",
        "subjects": ["Math"],
        "levels": ["college"],  # dropping a level needs no review
        "hourly_rate_cents": 2000,
        "years_experience": 5,
    }
    r = await flow.client.put("/tutors/me/application", headers=flow.tutor.h, json=app)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"  # same subjects and levels: still approved
    r = await flow.client.put(
        "/tutors/me/application",
        headers=flow.tutor.h,
        json={**app, "subjects": ["Math", "Chemistry"]},
    )
    assert r.json()["status"] == "pending"


async def test_task_says_whether_it_was_reviewed(flow: Flow) -> None:
    await flow.to("delivered")
    await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    task = (await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)).json()
    assert task["reviewed"] is False
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/review",
        headers=flow.student.h,
        json={"rating": 5, "comment": "Great"},
    )
    assert r.status_code == 201, r.text
    task = (await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)).json()
    assert task["reviewed"] is True
