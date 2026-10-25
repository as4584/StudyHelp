"""Payment safety tests (directive section 22). Stripe test-mode semantics, no real charges."""

import hashlib
import hmac
import json
import time
import uuid

import pytest

from app.core.config import Settings
from app.providers.payments.stripe_gateway import StripeGateway
from app.services import payments
from tests.conftest import Flow, UserFactory


async def _payment(db, task_id: str):  # type: ignore[no-untyped-def]
    return await db.fetchrow("select * from payments where task_id = $1", uuid.UUID(task_id))


async def test_charge_event_holds_funds_with_configured_fee(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid", amount=4000)
    p = await _payment(db, flow.task_id)
    assert p["status"] == "held"
    assert (p["platform_fee_bps"], p["platform_fee_cents"], p["tutor_net_cents"]) == (
        2500,
        1000,
        3000,
    )
    assert p["charge_id"].startswith("ch_")
    task = await db.fetchrow("select status from tasks where id = $1", uuid.UUID(flow.task_id))
    assert task["status"] == "paid"
    kinds = [r["kind"] for r in await db.fetch("select kind from payment_events order by id")]
    assert kinds == ["payment.created", "payment.held"]


async def test_frontend_cannot_fake_payment(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    r = await flow.client.post(f"/tasks/{flow.task_id}/checkout", headers=flow.student.h)
    assert r.status_code == 200
    p = await _payment(db, flow.task_id)
    assert p["status"] == "pending"  # a checkout URL is not proof of payment
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/deliver", headers=flow.tutor.h, json={"note": "x"}
    )
    assert r.status_code == 409


async def test_duplicate_webhook_event_is_ignored(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("hired")
    r = await flow.client.post(f"/tasks/{flow.task_id}/checkout", headers=flow.student.h)
    sid = r.json()["url"].rsplit("/", 1)[1]
    p = await _payment(db, flow.task_id)
    from app.core.db import get_sessionmaker
    from app.providers.payments import get_gateway

    evt = {
        "id": "evt_dup_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": sid,
                "payment_status": "paid",
                "payment_intent": "pi_x1",
                "metadata": {"kind": "task_payment", "payment_id": str(p["id"])},
            }
        },
    }
    async with get_sessionmaker()() as s:
        assert await payments.process_event(s, get_gateway(), evt) == "processed"
    async with get_sessionmaker()() as s:
        assert await payments.process_event(s, get_gateway(), evt) == "duplicate"
    held = await db.fetchval("select count(*) from payment_events where kind = 'payment.held'")
    assert held == 1


async def test_release_once_transfers_net_and_records_fee(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered", amount=4000)
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 200 and r.json()["amount_cents"] == 3000
    assert r.json()["provider_transfer_id"].startswith("tr_")
    r2 = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r2.status_code == 409  # duplicate release prevented
    assert await db.fetchval("select count(*) from transfers") == 1
    p = await _payment(db, flow.task_id)
    assert p["status"] == "released"
    state = (await flow.client.get(f"/tasks/{flow.task_id}/payment", headers=flow.tutor.h)).json()
    assert state["transfer"]["amount_cents"] == 3000


async def test_cannot_release_before_delivery(flow: Flow) -> None:
    await flow.to("paid")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 409


async def test_tutor_cannot_release_own_payment(flow: Flow) -> None:
    await flow.to("delivered")
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.tutor.h)
    assert r.status_code == 403


async def test_release_blocked_without_payout_onboarding(client, make_user: UserFactory) -> None:  # type: ignore[no-untyped-def]
    f = Flow(client, await make_user("student"), await make_user("tutor", payouts=False))
    await f.to("delivered")
    r = await client.post(f"/tasks/{f.task_id}/release", headers=f.student.h)
    assert r.status_code == 409 and "onboarding" in r.json()["detail"]


async def test_disputed_task_cannot_be_released(flow: Flow, make_user: UserFactory, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/disputes",
        headers=flow.student.h,
        json={"reason": "Not what was agreed"},
    )
    assert r.status_code == 201
    r = await flow.client.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    assert r.status_code == 409
    admin = await make_user("admin")
    d = (await flow.client.get("/admin/disputes", headers=admin.h)).json()[0]
    r = await flow.client.post(
        f"/admin/disputes/{d['id']}/resolve",
        headers=admin.h,
        json={"outcome": "refund", "note": "Refunded after review"},
    )
    assert r.status_code == 200 and r.json()["status"] == "resolved_refund"
    p = await _payment(db, flow.task_id)
    assert p["status"] == "refunded"
    assert await db.fetchval("select count(*) from transfers") == 0
    r = await flow.client.post(
        f"/admin/disputes/{d['id']}/resolve",
        headers=admin.h,
        json={"outcome": "release", "note": "again"},
    )
    assert r.status_code == 409
    actions = {r["action"] for r in await db.fetch("select action from audit_logs")}
    assert {"dispute.opened", "payment.refunded", "dispute.resolved_refund"} <= actions


async def test_admin_can_resolve_dispute_by_release(flow: Flow, make_user: UserFactory, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    await flow.client.post(
        f"/tasks/{flow.task_id}/disputes",
        headers=flow.tutor.h,
        json={"reason": "Student unresponsive"},
    )
    admin = await make_user("admin")
    d = (await flow.client.get("/admin/disputes", headers=admin.h)).json()[0]
    r = await flow.client.post(
        f"/admin/disputes/{d['id']}/resolve",
        headers=admin.h,
        json={"outcome": "release", "note": "Work delivered"},
    )
    assert r.status_code == 200
    assert (await _payment(db, flow.task_id))["status"] == "released"
    rev = (await flow.client.get("/admin/revenue", headers=admin.h)).json()
    assert rev["platform_fees_earned_cents"] == 1000 and rev["tutor_payouts_cents"] == 3000


async def test_tips_go_fully_to_tutor_and_are_validated(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("delivered")
    c = flow.client
    r = await c.post(
        f"/tasks/{flow.task_id}/tips", headers=flow.student.h, json={"amount_cents": 500}
    )
    assert r.status_code == 409  # only after completion
    await c.post(f"/tasks/{flow.task_id}/release", headers=flow.student.h)
    r = await c.post(
        f"/tasks/{flow.task_id}/tips", headers=flow.student.h, json={"amount_cents": 300}
    )
    assert r.status_code == 422
    r = await c.post(
        f"/tasks/{flow.task_id}/tips", headers=flow.student.h, json={"amount_cents": 500}
    )
    sid = r.json()["url"].rsplit("/", 1)[1]
    r = await c.post(f"/simulated/checkout/{sid}/complete", headers=flow.student.h)
    assert r.status_code == 200
    tip = await db.fetchrow("select * from tips")
    assert tip["status"] == "transferred"
    t = await db.fetchrow("select * from transfers where tip_id = $1", tip["id"])
    assert t["amount_cents"] == 500
    state = (await c.get(f"/tasks/{flow.task_id}/payment", headers=flow.student.h)).json()
    assert state["tips_cents"] == 500


async def test_other_student_cannot_complete_someone_elses_checkout(
    flow: Flow, make_user: UserFactory
) -> None:
    await flow.to("hired")
    r = await flow.client.post(f"/tasks/{flow.task_id}/checkout", headers=flow.student.h)
    sid = r.json()["url"].rsplit("/", 1)[1]
    other = await make_user("student")
    r = await flow.client.post(f"/simulated/checkout/{sid}/complete", headers=other.h)
    assert r.status_code == 404


async def test_subscription_activates_and_deactivates_premium(
    client, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    s = await make_user("student")
    assert (await client.get("/me", headers=s.h)).json()["premium"] is False
    r = await client.post("/premium/checkout", headers=s.h)
    sid = r.json()["url"].rsplit("/", 1)[1]
    await client.post(f"/simulated/checkout/{sid}/complete", headers=s.h)
    assert (await client.get("/me", headers=s.h)).json()["premium"] is True
    assert (await client.post("/premium/checkout", headers=s.h)).status_code == 409
    sub_id = await db.fetchval("select provider_subscription_id from subscriptions")
    from app.core.db import get_sessionmaker
    from app.providers.payments import get_gateway

    evt = {
        "id": "evt_sub_del",
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": sub_id, "status": "canceled"}},
    }
    async with get_sessionmaker()() as session:
        await payments.process_event(session, get_gateway(), evt)
    assert (await client.get("/me", headers=s.h)).json()["premium"] is False


async def test_ledger_is_append_only(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    with pytest.raises(Exception, match="append-only"):
        await db.execute("update payment_events set kind = 'tampered'")
    with pytest.raises(Exception, match="append-only"):
        await db.execute("delete from payment_events")


async def test_db_rejects_inconsistent_fee_split(flow: Flow, db) -> None:  # type: ignore[no-untyped-def]
    await flow.to("paid")
    with pytest.raises(Exception, match="check"):
        await db.execute("update payments set tutor_net_cents = tutor_net_cents + 1")


# ---------------------------------------------------------------- real Stripe signature path


def _stripe_settings() -> Settings:
    return Settings(
        payments_provider="stripe",
        stripe_secret_key="sk_test_dummy",
        stripe_webhook_secret="whsec_test_secret",
    )


def _sign(payload: bytes, secret: str, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def test_stripe_signature_verification_accepts_valid_and_rejects_forged() -> None:
    gw = StripeGateway(_stripe_settings())
    payload = json.dumps(
        {
            "id": "evt_1",
            "object": "event",
            "type": "account.updated",
            "data": {"object": {"id": "acct_1"}},
        }
    ).encode()
    assert gw.parse_webhook(payload, _sign(payload, "whsec_test_secret"))["id"] == "evt_1"
    with pytest.raises(ValueError):
        gw.parse_webhook(payload, _sign(payload, "whsec_wrong"))
    with pytest.raises(ValueError):
        gw.parse_webhook(payload + b" ", _sign(payload, "whsec_test_secret"))
    with pytest.raises(ValueError):  # replay outside Stripe's tolerance window
        gw.parse_webhook(payload, _sign(payload, "whsec_test_secret", ts=int(time.time()) - 3600))


async def test_webhook_endpoint_rejects_unsigned(client) -> None:  # type: ignore[no-untyped-def]
    assert (await client.post("/webhooks/stripe", content=b"{}")).status_code == 400
    r = await client.post("/webhooks/stripe", content=b"{}", headers={"stripe-signature": "bad"})
    assert r.status_code == 400
