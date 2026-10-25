import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select

from app.api.dependencies import SessionDep, StudentDep, TutorDep, UserDep
from app.core.config import get_settings
from app.core.errors import NotFound
from app.models.entities import Payment, Tip, Transfer, TutorProfile
from app.providers.payments import get_gateway
from app.providers.payments.base import PaymentGateway
from app.schemas.api import (
    PaymentOut,
    QuoteOut,
    RedirectOut,
    TaskPaymentState,
    TipIn,
    TransferOut,
    WebhookAck,
)
from app.services import marketplace, payments

router = APIRouter(tags=["payments"])
GatewayDep = Annotated[PaymentGateway, Depends(get_gateway)]


@router.post("/tasks/{task_id}/checkout", response_model=RedirectOut)
async def task_checkout(
    task_id: uuid.UUID, student: StudentDep, session: SessionDep, gateway: GatewayDep
) -> RedirectOut:
    return RedirectOut(url=await payments.start_task_checkout(session, gateway, student, task_id))


@router.get("/tasks/{task_id}/quote", response_model=QuoteOut)
async def task_quote(task_id: uuid.UUID, student: StudentDep, session: SessionDep) -> QuoteOut:
    task, amount, bps, fee, net = await payments.quote_task(session, student, task_id)
    return QuoteOut(
        task_id=task.id,
        amount_cents=amount,
        platform_fee_bps=bps,
        platform_fee_cents=fee,
        tutor_net_cents=net,
    )


@router.post("/tasks/{task_id}/release", response_model=TransferOut)
async def release(
    task_id: uuid.UUID, student: StudentDep, session: SessionDep, gateway: GatewayDep
) -> TransferOut:
    return TransferOut.model_validate(
        await payments.release_payment(session, gateway, student, task_id)
    )


@router.post("/tasks/{task_id}/tips", response_model=RedirectOut)
async def tip(
    task_id: uuid.UUID, body: TipIn, student: StudentDep, session: SessionDep, gateway: GatewayDep
) -> RedirectOut:
    url = await payments.start_tip_checkout(session, gateway, student, task_id, body.amount_cents)
    return RedirectOut(url=url)


@router.get("/tasks/{task_id}/payment", response_model=TaskPaymentState)
async def payment_state(task_id: uuid.UUID, user: UserDep, session: SessionDep) -> TaskPaymentState:
    task = await marketplace.get_visible_task(session, user, task_id)
    if user.role != "admin" and user.id not in (task.student_id, task.hired_tutor_id):
        raise NotFound("task not found")
    payment = (
        (
            await session.execute(
                select(Payment)
                .where(Payment.task_id == task.id)
                .order_by(Payment.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    transfer = None
    if payment is not None:
        transfer = (
            await session.execute(select(Transfer).where(Transfer.payment_id == payment.id))
        ).scalar_one_or_none()
    tips = (
        await session.execute(
            select(func.coalesce(func.sum(Tip.amount_cents), 0)).where(
                Tip.task_id == task.id, Tip.status.in_(("paid", "transferred"))
            )
        )
    ).scalar_one()
    return TaskPaymentState(
        payment=PaymentOut.model_validate(payment) if payment else None,
        transfer=TransferOut.model_validate(transfer) if transfer else None,
        tips_cents=int(tips),
    )


@router.post("/premium/checkout", response_model=RedirectOut)
async def premium_checkout(
    student: StudentDep, session: SessionDep, gateway: GatewayDep
) -> RedirectOut:
    return RedirectOut(url=await payments.start_premium_checkout(session, gateway, student))


@router.post("/tutors/me/connect", response_model=RedirectOut)
async def connect_onboarding(
    tutor: TutorDep, session: SessionDep, gateway: GatewayDep
) -> RedirectOut:
    return RedirectOut(url=await payments.start_connect_onboarding(session, gateway, tutor))


@router.post("/webhooks/stripe", response_model=WebhookAck)
async def stripe_webhook(
    request: Request,
    session: SessionDep,
    gateway: GatewayDep,
    stripe_signature: Annotated[str | None, Header()] = None,
) -> WebhookAck:
    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(400, "missing signature")
    try:
        evt = gateway.parse_webhook(payload, stripe_signature)
    except ValueError as exc:
        raise HTTPException(400, "invalid signature") from exc
    return WebhookAck(result=await payments.process_event(session, gateway, evt))


# ------------------------------------------------------------------ simulated (fake gateway)
# Only mounted when PAYMENTS_PROVIDER=fake (refused in production by config). They build a
# Stripe-shaped event, sign it with the fake gateway and push it through the SAME webhook
# verification + processing path as real Stripe events.

simulated = APIRouter(prefix="/simulated", tags=["simulated-payments"])


async def _push(gateway: PaymentGateway, session: SessionDep, evt: dict[str, object]) -> str:
    from app.providers.payments.fake_gateway import FakeGateway

    payload = json.dumps(evt).encode()
    verified = gateway.parse_webhook(payload, FakeGateway.sign(payload))
    return await payments.process_event(session, gateway, verified)


@simulated.post("/checkout/{session_id}/complete", response_model=WebhookAck)
async def simulated_checkout_complete(
    session_id: str, user: UserDep, session: SessionDep, gateway: GatewayDep
) -> WebhookAck:
    payment = (
        await session.execute(select(Payment).where(Payment.checkout_session_id == session_id))
    ).scalar_one_or_none()
    tip = (
        await session.execute(select(Tip).where(Tip.checkout_session_id == session_id))
    ).scalar_one_or_none()
    obj: dict[str, object] = {"id": session_id, "payment_status": "paid"}
    if payment is not None:
        if payment.student_id != user.id:
            raise NotFound("checkout not found")
        obj |= {
            "payment_intent": f"pi_fake_{payment.id.hex[:16]}",
            "metadata": {"kind": "task_payment", "payment_id": str(payment.id)},
        }
    elif tip is not None:
        if tip.student_id != user.id:
            raise NotFound("checkout not found")
        obj |= {
            "payment_intent": f"pi_fake_{tip.id.hex[:16]}",
            "metadata": {"kind": "tip", "tip_id": str(tip.id)},
        }
    elif user.role == "student" and session_id.startswith("cs_fake_"):
        obj |= {
            "subscription": f"sub_fake_{user.id.hex[:16]}",
            "metadata": {"kind": "subscription", "user_id": str(user.id)},
        }
    else:
        raise NotFound("checkout not found")
    evt = {
        "id": f"evt_fake_{uuid.uuid4().hex}",
        "type": "checkout.session.completed",
        "data": {"object": obj},
    }
    return WebhookAck(result=await _push(gateway, session, evt))  # type: ignore[arg-type]


@simulated.post("/connect/complete", response_model=WebhookAck)
async def simulated_connect_complete(
    tutor: TutorDep, session: SessionDep, gateway: GatewayDep
) -> WebhookAck:
    tp = await session.get(TutorProfile, tutor.id)
    if tp is None or not tp.stripe_account_id:
        raise NotFound("start payout onboarding first")
    evt = {
        "id": f"evt_fake_{uuid.uuid4().hex}",
        "type": "account.updated",
        "data": {"object": {"id": tp.stripe_account_id, "capabilities": {"transfers": "active"}}},
    }
    return WebhookAck(result=await _push(gateway, session, evt))  # type: ignore[arg-type]


def simulated_enabled() -> bool:
    s = get_settings()
    return s.payments_provider == "fake" and s.environment != "production"
