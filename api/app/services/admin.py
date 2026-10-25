"""Admin operations. Every state change writes an audit_logs row."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser
from app.core.errors import Forbidden, InvalidState, NotFound
from app.models.entities import Dispute, Payment, Profile, Task, Tip, Transfer, TutorProfile
from app.providers.payments.base import PaymentGateway
from app.services import payments
from app.services.audit import audit


async def set_tutor_status(
    session: AsyncSession, admin: CurrentUser, tutor_id: uuid.UUID, status: str
) -> TutorProfile:
    tp = await session.get(TutorProfile, tutor_id, with_for_update=True)
    if tp is None:
        raise NotFound("tutor application not found")
    before = tp.status
    tp.status = status
    audit(session, actor=admin.id, action=f"tutor.{status}", entity_type="tutor_profile",
          entity_id=tutor_id, metadata={"before": before, "after": status})
    await session.commit()
    return tp


async def set_user_active(
    session: AsyncSession, admin: CurrentUser, user_id: uuid.UUID, active: bool
) -> Profile:
    if user_id == admin.id:
        raise Forbidden("admins cannot suspend themselves")
    profile = await session.get(Profile, user_id, with_for_update=True)
    if profile is None:
        raise NotFound("user not found")
    profile.is_active = active
    audit(session, actor=admin.id, action="user.reactivated" if active else "user.suspended",
          entity_type="profile", entity_id=user_id)
    await session.commit()
    return profile


async def resolve_dispute(
    session: AsyncSession,
    gateway: PaymentGateway,
    admin: CurrentUser,
    dispute_id: uuid.UUID,
    outcome: str,
    note: str,
) -> Dispute:
    dispute = await session.get(Dispute, dispute_id, with_for_update=True)
    if dispute is None:
        raise NotFound("dispute not found")
    if dispute.status != "open":
        raise InvalidState("dispute is already resolved")
    task = await session.get(Task, dispute.task_id, with_for_update=True)
    assert task is not None
    if outcome == "release":
        await payments.admin_release(session, gateway, admin, task)
        dispute.status = "resolved_release"
    elif outcome == "refund":
        await payments.admin_refund(session, gateway, admin, task)
        dispute.status = "resolved_refund"
    else:
        raise InvalidState("outcome must be 'release' or 'refund'")
    dispute.resolution_note = note
    dispute.resolved_by = admin.id
    dispute.resolved_at = datetime.now(UTC)
    audit(session, actor=admin.id, action=f"dispute.{dispute.status}", entity_type="dispute",
          entity_id=dispute.id, metadata={"task_id": str(task.id)})
    await session.commit()
    return dispute


@dataclass(frozen=True)
class RevenueSummary:
    fee_bps: int
    gross_held_cents: int
    gross_released_cents: int
    platform_fees_earned_cents: int
    platform_fees_pending_cents: int
    tutor_payouts_cents: int
    refunded_cents: int
    tips_cents: int
    payments_count: int


async def revenue_summary(session: AsyncSession, fee_bps: int) -> RevenueSummary:
    def total(col: object, status: str):  # type: ignore[no-untyped-def]
        return func.coalesce(func.sum(col).filter(Payment.status == status), 0)  # type: ignore[arg-type]

    row = (
        await session.execute(
            select(
                total(Payment.amount_cents, "held"),
                total(Payment.amount_cents, "released"),
                total(Payment.platform_fee_cents, "released"),
                total(Payment.platform_fee_cents, "held"),
                total(Payment.amount_cents, "refunded"),
                func.count(Payment.id),
            )
        )
    ).one()
    payouts = (
        await session.execute(
            select(func.coalesce(func.sum(Transfer.amount_cents), 0)).where(
                Transfer.status == "created"
            )
        )
    ).scalar_one()
    tips = (
        await session.execute(
            select(func.coalesce(func.sum(Tip.amount_cents), 0)).where(
                Tip.status.in_(("paid", "transferred"))
            )
        )
    ).scalar_one()
    return RevenueSummary(
        fee_bps=fee_bps,
        gross_held_cents=int(row[0]),
        gross_released_cents=int(row[1]),
        platform_fees_earned_cents=int(row[2]),
        platform_fees_pending_cents=int(row[3]),
        refunded_cents=int(row[4]),
        payments_count=int(row[5]),
        tutor_payouts_cents=int(payouts),
        tips_cents=int(tips),
    )
