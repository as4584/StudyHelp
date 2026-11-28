"""Shared whiteboard: only the two parties, only once paid, capped in size, no lost updates."""

from tests.conftest import Flow, UserFactory

SCENE = {"elements": [{"id": "a", "type": "rectangle", "version": 1}], "files": {}}


def path(flow: Flow) -> str:
    return f"/tasks/{flow.task_id}/whiteboard"


async def test_both_parties_share_one_board(flow: Flow) -> None:
    await flow.to("paid")
    r = await flow.client.get(path(flow), headers=flow.student.h)
    assert r.status_code == 200, r.text
    assert r.json() == {"scene": None, "version": 0, "updated_at": None}

    r = await flow.client.put(
        path(flow), headers=flow.student.h, json={"scene": SCENE, "base_version": 0}
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1

    r = await flow.client.get(path(flow), headers=flow.tutor.h)
    assert r.status_code == 200 and r.json()["scene"] == SCENE and r.json()["version"] == 1

    changed = {"elements": [*SCENE["elements"], {"id": "b", "type": "line", "version": 1}]}
    r = await flow.client.put(
        path(flow), headers=flow.tutor.h, json={"scene": changed, "base_version": 1}
    )
    assert r.status_code == 200 and r.json()["version"] == 2
    r = await flow.client.get(path(flow), headers=flow.student.h)
    assert r.json()["scene"] == changed


async def test_stale_write_is_refused_with_the_current_scene(flow: Flow) -> None:
    await flow.to("paid")
    first = {"scene": SCENE, "base_version": 0}
    assert (
        await flow.client.put(path(flow), headers=flow.student.h, json=first)
    ).status_code == 200
    # The tutor edited the version-0 board too: their save must not wipe the student's.
    r = await flow.client.put(
        path(flow), headers=flow.tutor.h, json={"scene": {"elements": []}, "base_version": 0}
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["version"] == 1 and body["scene"] == SCENE and body["code"] == "version_conflict"
    # A version from the future is just as stale.
    r = await flow.client.put(
        path(flow), headers=flow.tutor.h, json={"scene": SCENE, "base_version": 7}
    )
    assert r.status_code == 409
    r = await flow.client.get(path(flow), headers=flow.tutor.h)
    assert r.json()["scene"] == SCENE and r.json()["version"] == 1


async def test_oversized_scene_is_refused(flow: Flow) -> None:
    await flow.to("paid")
    big = {"elements": [], "files": {"img": {"dataURL": "x" * (2 * 1024 * 1024 + 10)}}}
    r = await flow.client.put(
        path(flow), headers=flow.student.h, json={"scene": big, "base_version": 0}
    )
    assert r.status_code == 413, r.text
    # Bigger than ordinary JSON bodies (256 KB) but under the cap is fine.
    ok = {"elements": [], "files": {"img": {"dataURL": "x" * (1024 * 1024)}}}
    r = await flow.client.put(
        path(flow), headers=flow.student.h, json={"scene": ok, "base_version": 0}
    )
    assert r.status_code == 200, r.text


async def test_closed_before_payment_and_to_others(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("hired")
    r = await flow.client.get(path(flow), headers=flow.student.h)
    assert r.status_code == 409
    await flow.pay()
    for who in (await make_user("student"), await make_user("tutor"), await make_user("admin")):
        for method, kw in (("get", {}), ("put", {"json": {"scene": SCENE, "base_version": 0}})):
            r = await getattr(flow.client, method)(path(flow), headers=who.h, **kw)
            assert 400 <= r.status_code < 500, f"{who.role} {method}: {r.status_code}"
