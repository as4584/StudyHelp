from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import ClaimsDep, SessionDep, TutorDep, UserDep
from app.models.entities import Profile, TutorProfile
from app.routers.avatars import avatar_link, avatar_version
from app.schemas.api import (
    GuardianConsentIn,
    MeOut,
    OnboardIn,
    PolicyAcceptIn,
    ProfileOut,
    ProfilePatch,
    PublicTutorOut,
    TutorApplicationIn,
    TutorOut,
)
from app.services import bot_check, policies
from app.services.audit import audit
from app.services.payments import is_premium

router = APIRouter(tags=["profile"])


async def _me(session: SessionDep, profile: Profile) -> MeOut:
    tutor = await session.get(TutorProfile, profile.id)
    return MeOut(
        profile=ProfileOut.model_validate(profile),
        tutor=TutorOut.model_validate(tutor) if tutor else None,
        premium=await is_premium(session, profile.id),
        policy=await policies.status(session, profile),
    )


@router.get("/me", response_model=MeOut)
async def get_me(user: UserDep, session: SessionDep) -> MeOut:
    return await _me(session, user.profile)


@router.post("/me/onboard", response_model=MeOut, status_code=201)
async def onboard(
    body: OnboardIn, claims: ClaimsDep, session: SessionDep, request: Request
) -> MeOut:
    """Create the caller's profile, together with their policy acceptance. The id always comes
    from the verified token. A bot check token is required: no profile, no use of the app."""
    import uuid

    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    await bot_check.verify(
        body.bot_token, forwarded or (request.client.host if request.client else None)
    )

    profile = Profile(
        id=uuid.UUID(claims.sub),
        role=body.role,
        display_name=body.display_name,
        preferred_language=body.preferred_language,
    )
    session.add(profile)
    try:
        await session.flush()
        await policies.accept(session, profile, claims.email, body.policy)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Profile already exists") from exc
    return await _me(session, profile)


@router.post("/me/policy", response_model=MeOut)
async def accept_policy(body: PolicyAcceptIn, user: UserDep, session: SessionDep) -> MeOut:
    """Accept the current policy version later: existing accounts, new versions, or a parent's
    consent for a student under 18."""
    await policies.accept(session, user.profile, user.email, body)
    await session.commit()
    return await _me(session, user.profile)


@router.post("/me/policy/guardian", response_model=MeOut)
async def guardian_consent(body: GuardianConsentIn, user: UserDep, session: SessionDep) -> MeOut:
    """A parent/guardian's consent for a student under 18, given after sign-up."""
    await policies.guardian_consent(session, user.profile, user.email, body)
    await session.commit()
    return await _me(session, user.profile)


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
            **body.model_dump(exclude={"main_subject"}),
        )
        session.add(tp)
    else:
        # Adding a subject or level (not dropping one) needs vetting.
        teaches_new = not (
            set(body.subjects) <= set(tp.subjects) and set(body.levels) <= set(tp.levels)
        )
        tp.bio, tp.subjects, tp.hourly_rate_cents = body.bio, body.subjects, body.hourly_rate_cents
        tp.years_experience = body.years_experience
        tp.levels = list(body.levels)
        if tp.status == "rejected" or (tp.status == "approved" and teaches_new):
            # Editing a rejected application resubmits it; an approved tutor who changes their
            # subjects or levels (e.g. adds high school) is vetted again before teaching them.
            tp.status = "pending"
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
    session: SessionDep,
    _: UserDep,
    request: Request,
    subject: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PublicTutorOut]:
    stmt = (
        select(TutorProfile, Profile.display_name, avatar_version)
        .join(Profile, Profile.id == TutorProfile.user_id)
        .where(TutorProfile.status == "approved", Profile.is_active)
        .order_by(
            TutorProfile.rating_avg.desc(),
            TutorProfile.rating_count.desc(),
            TutorProfile.user_id,  # stable order, so pages never repeat or skip a tutor
        )
        .limit(limit)
        .offset(offset)
    )
    if subject and subject.strip():
        # Case-insensitive: "math" finds a tutor who listed "Math".
        listed = func.unnest(TutorProfile.subjects).table_valued("s").render_derived()
        stmt = stmt.where(
            exists(
                select(1)
                .select_from(listed)
                .where(func.lower(listed.c.s) == subject.strip().lower())
            )
        )
    rows = (await session.execute(stmt)).all()
    return [
        PublicTutorOut.model_validate(
            {
                **TutorOut.model_validate(tp).model_dump(),
                "display_name": n,
                "avatar_url": avatar_link(request, tp.user_id, av),
            }
        )
        for tp, n, av in rows
    ]
