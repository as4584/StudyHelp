from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import ClaimsDep, SessionDep, TutorDep, UserDep
from app.models.entities import Profile, TutorProfile
from app.schemas.api import (
    MeOut,
    OnboardIn,
    ProfileOut,
    ProfilePatch,
    PublicTutorOut,
    TutorApplicationIn,
    TutorOut,
)
from app.services.audit import audit
from app.services.payments import is_premium

router = APIRouter(tags=["profile"])


async def _me(session: SessionDep, profile: Profile) -> MeOut:
    tutor = await session.get(TutorProfile, profile.id)
    return MeOut(
        profile=ProfileOut.model_validate(profile),
        tutor=TutorOut.model_validate(tutor) if tutor else None,
        premium=await is_premium(session, profile.id),
    )


@router.get("/me", response_model=MeOut)
async def get_me(user: UserDep, session: SessionDep) -> MeOut:
    return await _me(session, user.profile)


@router.post("/me/onboard", response_model=MeOut, status_code=201)
async def onboard(body: OnboardIn, claims: ClaimsDep, session: SessionDep) -> MeOut:
    """Create the caller's profile. The id always comes from the verified token."""
    import uuid

    profile = Profile(
        id=uuid.UUID(claims.sub),
        role=body.role,
        display_name=body.display_name,
        preferred_language=body.preferred_language,
    )
    session.add(profile)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Profile already exists") from exc
    return await _me(session, profile)


@router.patch("/me", response_model=MeOut)
async def patch_me(body: ProfilePatch, user: UserDep, session: SessionDep) -> MeOut:
    profile = user.profile
    if body.display_name is not None:
        profile.display_name = body.display_name
    if body.preferred_language is not None:
        profile.preferred_language = body.preferred_language
    if body.avatar_url is not None:
        profile.avatar_url = body.avatar_url or None
    await session.commit()
    return await _me(session, profile)


@router.put("/tutors/me/application", response_model=TutorOut)
async def submit_application(
    body: TutorApplicationIn, tutor: TutorDep, session: SessionDep
) -> TutorOut:
    tp = await session.get(TutorProfile, tutor.id, with_for_update=True)
    if tp is None:
        tp = TutorProfile(
            user_id=tutor.id,
            status="pending",
            payouts_enabled=False,
            rating_avg=0,
            rating_count=0,
            **body.model_dump(),
        )
        session.add(tp)
    else:
        tp.bio, tp.subjects, tp.hourly_rate_cents = body.bio, body.subjects, body.hourly_rate_cents
        tp.levels = list(body.levels)
        if tp.status == "rejected":
            tp.status = "pending"  # editing a rejected application resubmits it
    audit(
        session,
        actor=tutor.id,
        action="tutor.application_submitted",
        entity_type="tutor_profile",
        entity_id=tutor.id,
    )
    await session.commit()
    return TutorOut.model_validate(tp)


@router.get("/tutors", response_model=list[PublicTutorOut])
async def list_tutors(
    session: SessionDep, _: UserDep, subject: str | None = None
) -> list[PublicTutorOut]:
    stmt = (
        select(TutorProfile, Profile.display_name, Profile.avatar_url)
        .join(Profile, Profile.id == TutorProfile.user_id)
        .where(TutorProfile.status == "approved", Profile.is_active)
        .order_by(TutorProfile.rating_avg.desc(), TutorProfile.rating_count.desc())
    )
    if subject:
        stmt = stmt.where(TutorProfile.subjects.any(subject))  # type: ignore[arg-type]
    rows = (await session.execute(stmt)).all()
    return [
        PublicTutorOut.model_validate(
            {**TutorOut.model_validate(tp).model_dump(), "display_name": n, "avatar_url": av}
        )
        for tp, n, av in rows
    ]
