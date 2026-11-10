import asyncio

import pytest

from tests.conftest import Flow


async def test_hire_waits_for_a_concurrent_teaching_level_edit(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("bid")
    request = None
    try:
        async with db.transaction():
            await db.execute(
                "update tutor_profiles set levels = '{high_school}' where user_id = $1",
                flow.tutor.id,
            )
            request = asyncio.create_task(
                flow.client.post(
                    f"/tasks/{flow.task_id}/hire",
                    headers=flow.student.h,
                    json={"bid_id": flow.bid_id},
                )
            )
            async with asyncio.timeout(5):
                while not await db.fetchval(
                    "select exists(select 1 from pg_stat_activity "
                    "where pg_backend_pid() = any(pg_blocking_pids(pid)))"
                ):
                    if request.done():
                        pytest.fail(
                            f"hire did not wait for application edit: {(await request).text}"
                        )
                    await asyncio.sleep(0.01)
        response = await asyncio.wait_for(request, timeout=5)
        assert response.status_code == 409, response.text
        task = await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)
        assert task.json()["status"] == "open"
    finally:
        if request is not None and not request.done():
            request.cancel()
            await asyncio.gather(request, return_exceptions=True)


@pytest.mark.parametrize("keeps_task_level", [False, True])
async def test_hire_rechecks_the_tutors_current_teaching_levels(
    flow: Flow, keeps_task_level: bool
) -> None:
    await flow.to("bid")  # college task; tutor originally teaches both levels
    r = await flow.client.put(
        "/tutors/me/application",
        headers=flow.tutor.h,
        json={
            "bio": "Math tutoring",
            "subjects": ["Math"],
            "levels": ["college" if keeps_task_level else "high_school"],
            "hourly_rate_cents": 2000,
        },
    )
    assert r.status_code == 200 and r.json()["status"] == "approved", r.text
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": flow.bid_id}
    )
    if keeps_task_level:
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "hired"
        return
    assert r.status_code == 409, r.text
    task = await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)
    assert task.json()["status"] == "open"
    assert task.json()["hired_tutor_id"] is None
    bids = await flow.client.get(f"/tasks/{flow.task_id}/bids", headers=flow.student.h)
    assert bids.json()[0]["status"] == "pending"
    conversation = await flow.client.get(
        f"/tasks/{flow.task_id}/conversation", headers=flow.student.h
    )
    assert conversation.status_code == 404
