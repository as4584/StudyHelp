"""Lists must not cost one database round trip per row (N+1), and stay bounded in size."""

import base64
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event

from app.core.db import get_engine
from tests.conftest import Flow, UserFactory


@contextmanager
def count_queries() -> Iterator[list[str]]:
    seen: list[str] = []
    sync_engine = get_engine().sync_engine

    def on_exec(conn, cursor, statement, params, context, executemany):  # type: ignore[no-untyped-def]
        seen.append(statement)

    event.listen(sync_engine, "before_cursor_execute", on_exec)
    try:
        yield seen
    finally:
        event.remove(sync_engine, "before_cursor_execute", on_exec)


async def _bids(flow: Flow, make_user: UserFactory, n: int) -> None:
    for i in range(n):
        tutor = await make_user("tutor", name=f"Tutor {i}")
        r = await flow.client.post(
            f"/tasks/{flow.task_id}/bids",
            headers=tutor.h,
            json={"amount_cents": 2000, "message": f"Offer {i}"},
        )
        assert r.status_code == 201, r.text


async def test_offer_list_costs_the_same_with_2_or_30_offers(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.post_task()
    await _bids(flow, make_user, 2)
    with count_queries() as few:
        r = await flow.client.get(f"/tasks/{flow.task_id}/bids", headers=flow.student.h)
    assert r.status_code == 200 and len(r.json()) == 2

    await _bids(flow, make_user, 28)
    with count_queries() as many:
        r = await flow.client.get(f"/tasks/{flow.task_id}/bids", headers=flow.student.h)
    assert r.status_code == 200 and len(r.json()) == 30
    assert len(many) == len(few), f"{len(few)} queries for 2 offers, {len(many)} for 30"


async def test_tutor_directory_pages(flow: Flow, make_user: UserFactory) -> None:
    for i in range(5):
        await make_user("tutor", name=f"Paged {i}")
    first = (await flow.client.get("/tutors?limit=3", headers=flow.student.h)).json()
    rest = (await flow.client.get("/tutors?limit=3&offset=3", headers=flow.student.h)).json()
    assert len(first) == 3
    ids = [t["user_id"] for t in first + rest]
    assert len(ids) == len(set(ids)), "a tutor appeared on two pages"
    r = await flow.client.get("/tutors?limit=1000", headers=flow.student.h)
    assert r.status_code == 422


async def test_admin_user_list_leaves_out_photos(flow: Flow, make_user: UserFactory) -> None:
    pic = "data:image/jpeg;base64," + "A" * 40_000
    r = await flow.client.patch("/me", headers=flow.student.h, json={"avatar_url": pic})
    assert r.status_code == 200, r.text
    admin = await make_user("admin")
    users = (await flow.client.get("/admin/users", headers=admin.h)).json()
    assert users and all("avatar_url" not in u for u in users)
    # Oversized photos are refused at the door (the picker makes ~15-40 KB ones).
    big = "data:image/jpeg;base64," + "A" * 120_000
    assert (
        await flow.client.patch("/me", headers=flow.student.h, json={"avatar_url": big})
    ).status_code == 422


def _path(link: str) -> str:
    return "/" + link.split("://", 1)[1].split("/", 1)[1]


async def test_photos_are_cached_links_not_inline_data(flow: Flow) -> None:
    jpeg = base64.b64encode(bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"photo" * 20).decode()
    png = base64.b64encode(b"a different photo").decode()
    r = await flow.client.patch(
        "/me", headers=flow.tutor.h, json={"avatar_url": f"data:image/jpeg;base64,{jpeg}"}
    )
    assert r.status_code == 200, r.text
    await flow.post_task()
    await flow.bid()

    bids = f"/tasks/{flow.task_id}/bids"
    bid = (await flow.client.get(bids, headers=flow.student.h)).json()[0]
    tutors = (await flow.client.get("/tutors", headers=flow.student.h)).json()
    tutor = next(t for t in tutors if t["user_id"] == str(flow.tutor.id))
    for link in (bid["tutor_avatar_url"], tutor["avatar_url"]):
        assert link and not link.startswith("data:") and "/avatars/" in link
        img = await flow.client.get(_path(link))  # an <img> sends no sign-in
        assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
        assert "immutable" in img.headers["cache-control"]

    good = _path(bid["tutor_avatar_url"])
    # A guessed link (right user, wrong signature) gets nothing.
    assert (await flow.client.get(good[:-4] + "0000")).status_code == 404
    # After a new photo the old link stops working and lists carry a new one.
    r = await flow.client.patch(
        "/me", headers=flow.tutor.h, json={"avatar_url": f"data:image/png;base64,{png}"}
    )
    assert r.status_code == 200
    assert (await flow.client.get(good)).status_code == 404
    bid2 = (await flow.client.get(bids, headers=flow.student.h)).json()[0]
    assert bid2["tutor_avatar_url"] != bid["tutor_avatar_url"]
    # Removing the photo removes the link.
    await flow.client.patch("/me", headers=flow.tutor.h, json={"avatar_url": ""})
    bid3 = (await flow.client.get(bids, headers=flow.student.h)).json()[0]
    assert bid3["tutor_avatar_url"] is None
