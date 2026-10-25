import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.dependencies import AdminDep, SessionDep
from app.core.config import get_settings
from app.models.entities import AuditLog, Dispute, Payment, Profile, TutorProfile
from app.providers.payments import get_gateway
from app.providers.payments.base import PaymentGateway
from app.schemas.api import (
    AdminUserOut,
    AuditOut,
    DisputeOut,
    PaymentOut,
    PublicTutorOut,
    ResolveDisputeIn,
    RevenueOut,
    TutorOut,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])
GatewayDep = Annotated[PaymentGateway, Depends(get_gateway)]


@router.get("/users", response_model=list[AdminUserOut])
async def users(_: AdminDep, session: SessionDep) -> list[AdminUserOut]:
    rows = (
        await session.execute(select(Profile).order_by(Profile.created_at.desc()).limit(500))
    ).scalars()
    return [AdminUserOut.model_validate(p) for p in rows]


@router.post("/users/{user_id}/{action}", response_model=AdminUserOut)
async def set_active(
    user_id: uuid.UUID,
    action: Literal["suspend", "reactivate"],
    admin: AdminDep,
    session: SessionDep,
) -> AdminUserOut:
    p = await admin_service.set_user_active(session, admin, user_id, action == "reactivate")
    return AdminUserOut.model_validate(p)


@router.get("/tutors", response_model=list[PublicTutorOut])
async def tutors(
    _: AdminDep, session: SessionDep, status: Literal["pending", "approved", "rejected"] = "pending"
) -> list[PublicTutorOut]:
    rows = (
        await session.execute(
            select(TutorProfile, Profile.display_name)
            .join(Profile, Profile.id == TutorProfile.user_id)
            .where(TutorProfile.status == status)
            .order_by(TutorProfile.created_at)
        )
    ).all()
    return [
        PublicTutorOut.model_validate(
            {**TutorOut.model_validate(tp).model_dump(), "display_name": n}
        )
        for tp, n in rows
    ]


@router.post("/tutors/{tutor_id}/{decision}", response_model=TutorOut)
async def decide_tutor(
    tutor_id: uuid.UUID,
    decision: Literal["approve", "reject"],
    admin: AdminDep,
    session: SessionDep,
) -> TutorOut:
    status = "approved" if decision == "approve" else "rejected"
    return TutorOut.model_validate(
        await admin_service.set_tutor_status(session, admin, tutor_id, status)
    )


@router.get("/disputes", response_model=list[DisputeOut])
async def disputes(_: AdminDep, session: SessionDep) -> list[DisputeOut]:
    rows = (await session.execute(select(Dispute).order_by(Dispute.created_at.desc()))).scalars()
    return [DisputeOut.model_validate(d) for d in rows]


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeOut)
async def resolve(
    dispute_id: uuid.UUID,
    body: ResolveDisputeIn,
    admin: AdminDep,
    session: SessionDep,
    gateway: GatewayDep,
) -> DisputeOut:
    d = await admin_service.resolve_dispute(
        session, gateway, admin, dispute_id, body.outcome, body.note
    )
    return DisputeOut.model_validate(d)


@router.get("/payments", response_model=list[PaymentOut])
async def payments(_: AdminDep, session: SessionDep) -> list[PaymentOut]:
    rows = (
        await session.execute(select(Payment).order_by(Payment.created_at.desc()).limit(200))
    ).scalars()
    return [PaymentOut.model_validate(p) for p in rows]


@router.get("/revenue", response_model=RevenueOut)
async def revenue(_: AdminDep, session: SessionDep) -> RevenueOut:
    s = await admin_service.revenue_summary(session, get_settings().platform_fee_bps)
    return RevenueOut(**s.__dict__)


@router.get("/audit", response_model=list[AuditOut])
async def audit_log(_: AdminDep, session: SessionDep) -> list[AuditOut]:
    rows = (
        await session.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(200))
    ).scalars()
    return [AuditOut.model_validate(a) for a in rows]
