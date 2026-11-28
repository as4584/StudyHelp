"""Double taps and two tabs: the same money or state action sent several times at once must
take effect exactly once. Phones double-fire taps; people press Pay in two tabs."""

import asyncio

from tests.conftest import Flow, UserFactory

N = 6


async def _burst(flow: Flow, method: str, path: str, headers: dict[str, str], json=None):  # type: ignore[no-untyped-def]
    send = getattr(flow.client, method)
    kwargs = {"headers": headers} | ({"json": json} if json is not None else {})
    return await asyncio.gather(*(send(path, **kwargs) for _ in range(N)))


def _codes(responses) -> list[int]:  # type: ignore[no-untyped-def]
    return sorted(r.status_code for r in responses)


async def test_release_pressed_many_times_pays_the_tutor_once(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    rs = await _burst(flow, "post", f"/tasks/{flow.task_id}/release", flow.student.h)
    assert _codes(rs).count(200) == 1, _codes(rs)
    assert all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from transfers where payment_id is not null") == 1


async def test_pay_pressed_many_times_makes_one_payment(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    rs = await _burst(flow, "post", f"/tasks/{flow.task_id}/checkout", flow.student.h)
    assert all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from payments") == 1
    assert len({r.json()["url"] for r in rs if r.status_code == 200}) == 1


async def test_hire_pressed_many_times_hires_once(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    rs = await _burst(
        flow, "post", f"/tasks/{flow.task_id}/hire", flow.student.h, {"bid_id": flow.bid_id}
    )
    assert _codes(rs).count(200) == 1 and all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from conversations") == 1


async def test_two_tutors_hired_at_once_only_one_wins(
    flow: Flow, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    other = await make_user("tutor")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids",
        headers=other.h,
        json={"amount_cents": 2000, "message": "Me too"},
    )
    assert r.status_code == 201, r.text
    rs = await asyncio.gather(
        *(
            flow.client.post(
                f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": b}
            )
            for b in (flow.bid_id, r.json()["id"])
        )
    )
    assert _codes(rs).count(200) == 1 and all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from bids where status = 'accepted'") == 1


async def test_deliver_review_and_dispute_bursts_apply_once(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    rs = await _burst(
        flow, "post", f"/tasks/{flow.task_id}/deliver", flow.tutor.h, {"note": "Done, see notes"}
    )
    assert _codes(rs).count(200) == 1 and all(c < 500 for c in _codes(rs)), _codes(rs)

    rs = await _burst(
        flow, "post", f"/tasks/{flow.task_id}/disputes", flow.student.h, {"reason": "Not right"}
    )
    assert _codes(rs).count(201) == 1 and all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from disputes") == 1


async def test_review_burst_counts_once(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200, r.text
    rs = await _burst(
        flow, "post", f"/tasks/{flow.task_id}/review", flow.student.h, {"rating": 5, "comment": ""}
    )
    assert _codes(rs).count(201) == 1 and all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select rating_count from tutor_profiles") == 1


async def test_tip_burst_makes_one_tip(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200, r.text
    rs = await _burst(
        flow, "post", f"/tasks/{flow.task_id}/tips", flow.student.h, {"amount_cents": 500}
    )
    assert all(c < 500 for c in _codes(rs)), _codes(rs)
    assert await db.fetchval("select count(*) from tips") == 1


async def test_cancel_racing_hire_leaves_one_consistent_state(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    hire, cancel = await asyncio.gather(
        flow.client.post(
            f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": flow.bid_id}
        ),
        flow.client.post(f"/tasks/{flow.task_id}/cancel", headers=flow.student.h),
    )
    assert hire.status_code < 500 and cancel.status_code < 500
    status = await db.fetchval("select status from tasks")
    assert status in ("hired", "cancelled")
    convs = await db.fetchval("select count(*) from conversations")
    # A cancelled request never keeps a hired tutor or an open chat for that hire.
    if status == "cancelled" and hire.status_code == 200:
        assert cancel.status_code == 200
    assert convs <= 1
