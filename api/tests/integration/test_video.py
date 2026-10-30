"""Live video sessions: who may join, when, and what the room credential allows."""

import re
import time

import jwt
import pytest

from app.providers.video import FAKE_API_KEY, FAKE_API_SECRET, FakeVideoProvider, get_video_provider
from tests.conftest import Flow, UserFactory


def claims(token: str) -> dict:  # type: ignore[type-arg]
    return jwt.decode(token, FAKE_API_SECRET, algorithms=["HS256"], options={"verify_nbf": False})


async def join(flow: Flow, who: str = "student"):  # type: ignore[no-untyped-def]
    user = getattr(flow, who)
    return await flow.client.post(f"/tasks/{flow.task_id}/video/join", headers=user.h)


async def test_student_and_hired_tutor_join_the_same_private_room(flow: Flow) -> None:
    await flow.to("paid")
    s, t = await join(flow, "student"), await join(flow, "tutor")
    assert s.status_code == 200 and t.status_code == 200, (s.text, t.text)
    sj, tj = s.json(), t.json()
    assert sj["room"] == tj["room"]
    assert re.fullmatch(r"room_[0-9a-f]{32}", sj["room"])
    assert flow.task_id.replace("-", "") not in sj["room"]  # opaque: no task id, no PII
    assert sj["identity"] != tj["identity"]
    assert sj["url"].startswith("wss://")

    c = claims(sj["token"])
    assert c["iss"] == FAKE_API_KEY and c["sub"] == sj["identity"]
    assert str(flow.student.id) not in c["sub"]
    v = c["video"]
    assert v["room"] == sj["room"] and v["roomJoin"] is True
    assert set(v["canPublishSources"]) == {
        "camera",
        "microphone",
        "screen_share",
        "screen_share_audio",
    }
    assert v["canPublishData"] is False
    assert not v.get("roomAdmin") and not v.get("roomCreate") and not v.get("roomList")
    assert claims(tj["token"])["metadata"] == '{"role":"tutor"}'


async def test_credential_is_short_lived(flow: Flow) -> None:
    await flow.to("paid")
    body = (await join(flow)).json()
    c = claims(body["token"])
    now = int(time.time())
    assert now - 5 <= c["nbf"] <= now + 1
    assert c["exp"] - c["nbf"] == 600
    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(
            body["token"],
            FAKE_API_SECRET,
            algorithms=["HS256"],
            options={"verify_nbf": False},
            leeway=-601,
        )


async def test_rejoining_keeps_the_room_and_the_identity(flow: Flow) -> None:
    await flow.to("delivered")
    a, b = (await join(flow)).json(), (await join(flow)).json()
    # Same identity: a second tab replaces the first instead of adding a third participant.
    assert (a["room"], a["identity"]) == (b["room"], b["identity"])


async def test_anonymous_cannot_join(flow: Flow) -> None:
    await flow.to("paid")
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/join")
    assert r.status_code == 401


async def test_outsiders_cannot_join(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("paid")
    for outsider in (await make_user("student"), await make_user("tutor")):
        r = await flow.client.post(f"/tasks/{flow.task_id}/video/join", headers=outsider.h)
        assert r.status_code == 404, r.text  # no existence oracle


async def test_tutor_who_bid_but_was_not_hired_cannot_join(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.post_task()
    loser = await make_user("tutor")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=loser.h, json={"amount_cents": 3000}
    )
    assert r.status_code == 201
    await flow.bid()
    await flow.hire()
    await flow.pay()
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/join", headers=loser.h)
    assert r.status_code == 404


async def test_admin_can_see_status_but_cannot_join(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("paid")
    admin = await make_user("admin")
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/join", headers=admin.h)
    assert r.status_code == 403
    r = await flow.client.get(f"/tasks/{flow.task_id}/video", headers=admin.h)
    assert r.status_code == 200 and r.json()["status"] == "none"


@pytest.mark.parametrize("stage", ["posted", "bid", "hired"])
async def test_video_opens_only_once_the_session_is_paid(flow: Flow, stage: str) -> None:
    await flow.to(stage)
    if stage == "hired":
        r = await join(flow)
        assert r.status_code == 409 and r.json()["code"] == "invalid_state"
        st = (await flow.client.get(f"/tasks/{flow.task_id}/video", headers=flow.tutor.h)).json()
        assert st == {"status": "none", "joinable": False}
    else:
        assert (await join(flow)).status_code == 409


async def test_completed_session_cannot_be_joined(flow: Flow) -> None:
    await flow.to("delivered")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200, r.text
    assert (await join(flow)).status_code == 409


async def test_ending_closes_the_room_and_blocks_new_credentials(flow: Flow) -> None:
    await flow.to("paid")
    room = (await join(flow)).json()["room"]
    st = (await flow.client.get(f"/tasks/{flow.task_id}/video", headers=flow.student.h)).json()
    assert st == {"status": "active", "joinable": True}

    r = await flow.client.post(f"/tasks/{flow.task_id}/video/end", headers=flow.tutor.h)
    assert r.status_code == 200 and r.json()["status"] == "ended"
    provider = get_video_provider()
    assert isinstance(provider, FakeVideoProvider) and room in provider.closed

    st = (await flow.client.get(f"/tasks/{flow.task_id}/video", headers=flow.student.h)).json()
    assert st == {"status": "ended", "joinable": False}
    r = await join(flow, "tutor")
    assert r.status_code == 409
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/end", headers=flow.student.h)
    assert r.status_code == 200  # idempotent
    assert provider.closed.count(room) == 1


async def test_outsiders_cannot_end_or_read_a_session(flow: Flow, make_user: UserFactory) -> None:
    await flow.to("paid")
    await join(flow)
    outsider = await make_user("student")
    for method, path in (("post", "video/end"), ("get", "video")):
        r = await flow.client.request(
            method.upper(), f"/tasks/{flow.task_id}/{path}", headers=outsider.h
        )
        assert r.status_code == 404
    admin = await make_user("admin")
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/end", headers=admin.h)
    assert r.status_code == 403


async def test_tutors_browsing_an_open_request_cannot_see_its_video(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.post_task()
    browsing = await make_user("tutor")  # approved: may see the open task itself
    assert (await flow.client.get(f"/tasks/{flow.task_id}", headers=browsing.h)).status_code == 200
    r = await flow.client.get(f"/tasks/{flow.task_id}/video", headers=browsing.h)
    assert r.status_code == 404
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/join", headers=browsing.h)
    assert r.status_code == 403


async def test_ending_before_anyone_joined_is_not_found(flow: Flow) -> None:
    await flow.to("paid")
    r = await flow.client.post(f"/tasks/{flow.task_id}/video/end", headers=flow.student.h)
    assert r.status_code == 404


async def test_disabled_flag_turns_video_off_without_touching_the_marketplace(
    flow: Flow, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    await flow.to("paid")
    monkeypatch.setenv("VIDEO_ENABLED", "false")
    get_settings.cache_clear()
    try:
        r = await join(flow)
        assert r.status_code == 404 and r.json()["code"] == "video_disabled"
        r = await flow.client.get(f"/tasks/{flow.task_id}", headers=flow.student.h)
        assert r.status_code == 200
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
