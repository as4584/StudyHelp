"""Held marketplace funds via Stripe Connect separate charges and transfers.

Flow: student pays the PLATFORM (Checkout) -> signed webhook marks the payment `held` ->
after delivery the student (or an admin resolving a dispute) releases -> FastAPI creates a
Connect Transfer of the tutor's net amount -> platform keeps the configured fee.

This is delayed payout of platform-held funds, not a legal escrow arrangement.

Safety properties (each backed by a DB constraint AND a test):
- webhook events are processed at most once (provider_events primary key)
- a payment/tip is transferred at most once (unique partial indexes on transfers)
- every gateway call carries an idempotency key derived from our own row id
- every financial change appends to payment_events (append-only, trigger-enforced)
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.config import get_settings
from app.core.errors import Conflict, Forbidden, InvalidState, NotFound
from app.models.entities import (
    Payment,
    PaymentEvent,
    ProviderEvent,
    Subscription,
    Task,
    Tip,
    Transfer,
    TutorProfile,
)
from app.observability.logging import event
from app.providers.payments.base import PaymentGateway
from app.services.audit import audit
from app.services.fees import split_payment, validate_tip
from app.services.marketplace import accepted_amount, get_visible_task
from app.services.state import ensure_transition

log = logging.getLogger("payments")

PREMIUM_STATUSES = ("active", "trialing")


def _ledger(
    session: AsyncSession,
    kind: str,
    *,
    payment: Payment | None = None,
    tip: Tip | None = None,
    amount_cents: int | None = None,
    provider_event_id: str | None = None,
    **data: Any,
) -> None:
    session.add(
        PaymentEvent(
            payment_id=payment.id if payment else None,
            tip_id=tip.id if tip else None,
            kind=kind,
            amount_cents=amount_cents,
            provider_event_id=provider_event_id,
            data=data,
        )
    )


# --------------------------------------------------------------------------- premium


async def is_premium(session: AsyncSession, user_id: uuid.UUID) -> bool:
    sub = (
        await session.execute(select(Subscription).where(Subscription.user_id == user_id))
    ).scalar_one_or_none()
    if sub is None or sub.status not in PREMIUM_STATUSES:
        return False
    return sub.current_period_end is None or sub.current_period_end > datetime.now(UTC)


async def start_premium_checkout(
    session: AsyncSession, gateway: PaymentGateway, student: CurrentUser
) -> str:
    if await is_premium(session, student.id):
        raise Conflict("premium is already active")
    checkout = await gateway.create_subscription_checkout(
        metadata={"kind": "subscription", "user_id": str(student.id)},
        customer_email=student.email,
        idempotency_key=f"premium:{student.id}:{datetime.now(UTC):%Y%m%d%H}",
    )
    return checkout.url


# --------------------------------------------------------------------------- task payment


async def start_task_checkout(
    session: AsyncSession, gateway: PaymentGateway, student: CurrentUser, task_id: uuid.UUID
) -> str:
    task = await get_visible_task(session, student, task_id, for_update=True)
    if task.student_id != student.id:
        raise NotFound("task not found")
    if task.status != "hired" or task.hired_tutor_id is None:
        raise InvalidState("payment is only possible after hiring and before payment")
    payment = (
        await session.execute(
            select(Payment).where(Payment.task_id == task.id, Payment.status == "pending")
        )
    ).scalar_one_or_none()
    if payment is None:
        split = split_payment(await accepted_amount(session, task), get_settings().platform_fee_bps)
        payment = Payment(
            task_id=task.id,
            student_id=student.id,
            tutor_id=task.hired_tutor_id,
            amount_cents=split.amount_cents,
            platform_fee_bps=split.fee_bps,
            platform_fee_cents=split.platform_fee_cents,
            tutor_net_cents=split.tutor_net_cents,
            status="pending",
        )
        session.add(payment)
        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise Conflict("a payment for this task is already in progress") from exc
        _ledger(session, "payment.created", payment=payment, amount_cents=payment.amount_cents)
    checkout = await gateway.create_payment_checkout(
        amount_cents=payment.amount_cents,
        description=f"Tutoring: {task.title}",
        metadata={"kind": "task_payment", "payment_id": str(payment.id), "task_id": str(task.id)},
        transfer_group=f"task_{task.id}",
        customer_email=student.email,
        idempotency_key=f"task-pay:{payment.id}",
    )
    payment.checkout_session_id = checkout.id
    await session.commit()
    return checkout.url


async def _tutor_payout_account(session: AsyncSession, tutor_id: uuid.UUID) -> str:
    tp = await session.get(TutorProfile, tutor_id)
    if tp is None or not tp.stripe_account_id or not tp.payouts_enabled:
        raise InvalidState("the tutor has not finished payout onboarding yet")
    return tp.stripe_account_id


async def _held_payment(session: AsyncSession, task: Task) -> Payment:
    payment = (
        await session.execute(
            select(Payment).where(Payment.task_id == task.id, Payment.status == "held")
            .with_for_update()
        )
    ).scalar_one_or_none()
    if payment is None:
        raise InvalidState("no held payment for this task")
    return payment


async def _transfer_payment(
    session: AsyncSession, gateway: PaymentGateway, task: Task, actor: uuid.UUID
) -> Transfer:
    payment = await _held_payment(session, task)
    destination = await _tutor_payout_account(session, payment.tutor_id)
    transfer = Transfer(
        payment_id=payment.id,
        tutor_id=payment.tutor_id,
        amount_cents=payment.tutor_net_cents,
        idempotency_key=f"release:{payment.id}",
    )
    session.add(transfer)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise Conflict("this payment has already been released") from exc
    transfer.provider_transfer_id = await gateway.create_transfer(
        amount_cents=transfer.amount_cents,
        destination_account=destination,
        source_charge=payment.charge_id,
        transfer_group=f"task_{task.id}",
        idempotency_key=transfer.idempotency_key,
    )
    transfer.status = "created"
    payment.status = "released"
    _ledger(
        session,
        "payment.released",
        payment=payment,
        amount_cents=payment.tutor_net_cents,
        transfer_id=transfer.provider_transfer_id,
        platform_fee_cents=payment.platform_fee_cents,
    )
    audit(session, actor=actor, action="payment.released", entity_type="payment",
          entity_id=payment.id, metadata={"tutor_net_cents": payment.tutor_net_cents})
    return transfer


async def release_payment(
    session: AsyncSession, gateway: PaymentGateway, student: CurrentUser, task_id: uuid.UUID
) -> Transfer:
    task = await get_visible_task(session, student, task_id, for_update=True)
    if task.student_id != student.id:
        raise NotFound("task not found")
    if task.status != "delivered":
        # Disputed/paid/completed tasks cannot be released by the student.
        raise InvalidState("payment can be released once work is delivered and not disputed")
    transfer = await _transfer_payment(session, gateway, task, student.id)
    ensure_transition(task.status, "completed")
    task.status = "completed"
    await session.commit()
    return transfer


async def admin_release(
    session: AsyncSession, gateway: PaymentGateway, admin: CurrentUser, task: Task
) -> Transfer:
    """Called by dispute resolution (task row already locked by caller)."""
    transfer = await _transfer_payment(session, gateway, task, admin.id)
    task.status = "completed"
    return transfer


async def admin_refund(
    session: AsyncSession, gateway: PaymentGateway, admin: CurrentUser, task: Task
) -> Payment:
    payment = await _held_payment(session, task)
    if not payment.charge_id:
        raise InvalidState("payment has no settled charge to refund")
    refund_id = await gateway.refund(
        charge_id=payment.charge_id, idempotency_key=f"refund:{payment.id}"
    )
    payment.status = "refunded"
    task.status = "refunded"
    _ledger(session, "payment.refunded", payment=payment, amount_cents=payment.amount_cents,
            refund_id=refund_id)
    audit(session, actor=admin.id, action="payment.refunded", entity_type="payment",
          entity_id=payment.id)
    return payment


# --------------------------------------------------------------------------- tips


async def start_tip_checkout(
    session: AsyncSession,
    gateway: PaymentGateway,
    student: CurrentUser,
    task_id: uuid.UUID,
    amount_cents: int,
) -> str:
    validate_tip(amount_cents)
    task = await get_visible_task(session, student, task_id)
    if task.student_id != student.id:
        raise NotFound("task not found")
    if task.status != "completed" or task.hired_tutor_id is None:
        raise InvalidState("tips are available after the session is completed")
    tip = Tip(task_id=task.id, student_id=student.id, tutor_id=task.hired_tutor_id,
              amount_cents=amount_cents)
    session.add(tip)
    await session.flush()
    _ledger(session, "tip.created", tip=tip, amount_cents=amount_cents)
    checkout = await gateway.create_payment_checkout(
        amount_cents=amount_cents,
        description=f"Tip for your tutor: {task.title}",
        metadata={"kind": "tip", "tip_id": str(tip.id), "task_id": str(task.id)},
        transfer_group=f"tip_{tip.id}",
        customer_email=student.email,
        idempotency_key=f"tip:{tip.id}",
    )
    tip.checkout_session_id = checkout.id
    await session.commit()
    return checkout.url


async def _transfer_tip(session: AsyncSession, gateway: PaymentGateway, tip: Tip) -> None:
    """Tips go 100% to the tutor; Stripe processing fees are absorbed by the platform."""
    tp = await session.get(TutorProfile, tip.tutor_id)
    if tp is None or not tp.stripe_account_id or not tp.payouts_enabled:
        event(log, "tip.transfer_deferred", tip_id=str(tip.id))
        return
    transfer = Transfer(tip_id=tip.id, tutor_id=tip.tutor_id, amount_cents=tip.amount_cents,
                        idempotency_key=f"tip-transfer:{tip.id}")
    session.add(transfer)
    await session.flush()
    transfer.provider_transfer_id = await gateway.create_transfer(
        amount_cents=tip.amount_cents,
        destination_account=tp.stripe_account_id,
        source_charge=tip.charge_id,
        transfer_group=f"tip_{tip.id}",
        idempotency_key=transfer.idempotency_key,
    )
    transfer.status = "created"
    tip.status = "transferred"
    _ledger(session, "tip.transferred", tip=tip, amount_cents=tip.amount_cents,
            transfer_id=transfer.provider_transfer_id)


# --------------------------------------------------------------------------- connect


async def start_connect_onboarding(
    session: AsyncSession, gateway: PaymentGateway, tutor: CurrentUser
) -> str:
    tp = await session.get(TutorProfile, tutor.id, with_for_update=True)
    if tp is None:
        raise Forbidden("submit a tutor application first")
    onboarding = await gateway.create_connect_onboarding(
        existing_account_id=tp.stripe_account_id, email=tutor.email, user_id=str(tutor.id)
    )
    tp.stripe_account_id = onboarding.account_id
    await session.commit()
    return onboarding.url


# --------------------------------------------------------------------------- webhooks


async def process_event(
    session: AsyncSession, gateway: PaymentGateway, evt: dict[str, Any]
) -> str:
    """Apply one verified provider event exactly once. Returns 'processed' or 'duplicate'.

    The idempotency row is inserted in the SAME transaction as the effects: if handling
    fails, both roll back and the provider's retry is processed normally.
    """
    event_id = str(evt["id"])
    etype = str(evt["type"])
    inserted = await session.execute(
        insert(ProviderEvent)
        .values(event_id=event_id, type=etype)
        .on_conflict_do_nothing(index_elements=["event_id"])
        .returning(ProviderEvent.event_id)
    )
    if inserted.scalar_one_or_none() is None:
        await session.rollback()
        event(log, "webhook.duplicate", event_id=event_id, type=etype)
        return "duplicate"

    obj: dict[str, Any] = evt.get("data", {}).get("object", {})
    handler = _HANDLERS.get(etype)
    if handler is not None:
        await handler(session, gateway, obj, event_id)
    await session.commit()
    event(log, "webhook.processed", event_id=event_id, type=etype, handled=handler is not None)
    return "processed"


async def _on_checkout_completed(
    session: AsyncSession, gateway: PaymentGateway, obj: dict[str, Any], event_id: str
) -> None:
    if obj.get("payment_status") != "paid":
        return  # async methods complete later via checkout.session.async_payment_succeeded
    meta: dict[str, str] = obj.get("metadata") or {}
    kind = meta.get("kind")
    if kind == "task_payment":
        payment = (
            await session.execute(
                select(Payment).where(Payment.checkout_session_id == obj["id"]).with_for_update()
            )
        ).scalar_one_or_none()
        if payment is None or payment.status != "pending":
            event(log, "webhook.payment_unmatched", logging.WARNING, session_id=obj.get("id"))
            return
        payment.payment_intent_id = obj.get("payment_intent")
        if payment.payment_intent_id:
            payment.charge_id = await gateway.resolve_charge(payment.payment_intent_id)
        payment.status = "held"
        task = await session.get(Task, payment.task_id, with_for_update=True)
        assert task is not None
        ensure_transition(task.status, "paid")
        task.status = "paid"
        _ledger(session, "payment.held", payment=payment, amount_cents=payment.amount_cents,
                provider_event_id=event_id)
    elif kind == "tip":
        tip = (
            await session.execute(
                select(Tip).where(Tip.checkout_session_id == obj["id"]).with_for_update()
            )
        ).scalar_one_or_none()
        if tip is None or tip.status != "pending":
            return
        pi = obj.get("payment_intent")
        tip.charge_id = await gateway.resolve_charge(pi) if pi else None
        tip.status = "paid"
        _ledger(session, "tip.paid", tip=tip, amount_cents=tip.amount_cents,
                provider_event_id=event_id)
        await _transfer_tip(session, gateway, tip)
    elif kind == "subscription":
        user_id = uuid.UUID(meta["user_id"])
        await session.execute(
            insert(Subscription)
            .values(user_id=user_id, provider_subscription_id=obj.get("subscription"),
                    status="active")
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_={"provider_subscription_id": obj.get("subscription"), "status": "active",
                      "updated_at": func.now()},
            )
        )
        audit(session, actor=None, action="subscription.activated", entity_type="profile",
              entity_id=user_id)


async def _on_checkout_expired(
    session: AsyncSession, gateway: PaymentGateway, obj: dict[str, Any], event_id: str
) -> None:
    payment = (
        await session.execute(select(Payment).where(Payment.checkout_session_id == obj["id"]))
    ).scalar_one_or_none()
    if payment is not None and payment.status == "pending":
        payment.status = "expired"
        _ledger(session, "payment.expired", payment=payment, provider_event_id=event_id)


async def _on_subscription_changed(
    session: AsyncSession, gateway: PaymentGateway, obj: dict[str, Any], event_id: str
) -> None:
    sub = (
        await session.execute(
            select(Subscription).where(Subscription.provider_subscription_id == obj["id"])
        )
    ).scalar_one_or_none()
    if sub is None:
        return
    sub.status = str(obj.get("status", "canceled"))
    period_end = obj.get("current_period_end") or (
        (obj.get("items", {}).get("data") or [{}])[0].get("current_period_end")
    )
    if period_end:
        sub.current_period_end = datetime.fromtimestamp(int(period_end), UTC)


async def _on_charge_refunded(
    session: AsyncSession, gateway: PaymentGateway, obj: dict[str, Any], event_id: str
) -> None:
    payment = (
        await session.execute(select(Payment).where(Payment.charge_id == obj["id"]))
    ).scalar_one_or_none()
    if payment is not None and payment.status == "held":
        payment.status = "refunded"
        _ledger(session, "payment.refunded", payment=payment, provider_event_id=event_id)


async def _on_account_updated(
    session: AsyncSession, gateway: PaymentGateway, obj: dict[str, Any], event_id: str
) -> None:
    tp = (
        await session.execute(
            select(TutorProfile).where(TutorProfile.stripe_account_id == obj["id"])
        )
    ).scalar_one_or_none()
    if tp is None:
        return
    caps = obj.get("capabilities") or {}
    tp.payouts_enabled = caps.get("transfers") == "active"


_HANDLERS = {
    "checkout.session.completed": _on_checkout_completed,
    "checkout.session.async_payment_succeeded": _on_checkout_completed,
    "checkout.session.expired": _on_checkout_expired,
    "customer.subscription.updated": _on_subscription_changed,
    "customer.subscription.deleted": _on_subscription_changed,
    "charge.refunded": _on_charge_refunded,
    "account.updated": _on_account_updated,
}
