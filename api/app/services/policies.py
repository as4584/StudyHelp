"""Sign-up policies: acceptance records and the gates that depend on them.

Tutors sign the Tutor Policy and Independent Contractor Agreement (typed full legal name) and
cannot send offers until that signature is on record. Students accept the Student and Parent
Policy; a student under 18 also needs a parent/guardian's consent before booking a session.
Gates check the CURRENT policy version, so publishing a new version asks everyone to accept again.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, InvalidState
from app.models.entities import PolicyAcceptance, Profile
from app.schemas.api import PolicyAcceptIn, PolicyStatusOut
from app.services.audit import audit

# Bump a version whenever its policy text changes (web/src/content/policies.ts shows the text).
POLICIES = {
    "tutor": ("tutor_agreement", "Tutor Policy and Independent Contractor Agreement"),
    "student": ("student_policy", "Student and Parent Policy and Terms of Use"),
}
VERSIONS = {"tutor_agreement": "draft-2026-11-08", "student_policy": "draft-2026-11-08"}
ADULT_AGE = 18
MIN_STUDENT_AGE = 13  # Student and Parent Policy 1.4


def age_on(dob: date, today: date) -> int:
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _today() -> date:
    return datetime.now(UTC).date()


async def _accepted_by(session: AsyncSession, user_id: uuid.UUID, policy: str) -> dict[str, str]:
    """Who accepted the current version of `policy` for this user: {"user"|"guardian": name}."""
    rows = await session.execute(
        select(PolicyAcceptance.accepted_by, PolicyAcceptance.full_name).where(
            PolicyAcceptance.user_id == user_id,
            PolicyAcceptance.policy == policy,
            PolicyAcceptance.policy_version == VERSIONS[policy],
        )
    )
    return {by: name for by, name in rows.all()}


async def status(session: AsyncSession, profile: Profile) -> PolicyStatusOut:
    if profile.role not in POLICIES:
        return PolicyStatusOut(ready=True)
    policy, title = POLICIES[profile.role]
    by = await _accepted_by(session, profile.id, policy)
    dob = profile.date_of_birth
    minor = dob is not None and age_on(dob, _today()) < ADULT_AGE
    accepted = "user" in by and (profile.role == "tutor" or dob is not None)
    guardian = "guardian" in by
    return PolicyStatusOut(
        policy=policy,
        title=title,
        version=VERSIONS[policy],
        accepted=accepted,
        accepted_name=by.get("user"),
        date_of_birth=dob,
        minor=minor,
        guardian_name=profile.guardian_name,
        guardian_email=profile.guardian_email,
        guardian_consent=guardian,
        ready=accepted and (not minor or guardian),
    )


async def accept(
    session: AsyncSession, profile: Profile, email: str | None, body: PolicyAcceptIn
) -> None:
    """Record acceptance of the caller's policy (and guardian consent, if given). Idempotent."""
    if profile.role not in POLICIES:
        raise InvalidState("this account has no sign-up policy to accept")
    policy, _ = POLICIES[profile.role]
    rows = [("user", body.full_name, email or "")]
    if profile.role == "student":
        dob = profile.date_of_birth or body.date_of_birth
        if dob is None:
            raise InvalidState("date of birth is required")
        today = _today()
        if dob > today or age_on(dob, today) > 120:
            raise InvalidState("enter a real date of birth")
        if age_on(dob, today) < MIN_STUDENT_AGE:
            raise InvalidState(f"students must be {MIN_STUDENT_AGE} or older to use StudyHelp")
        profile.date_of_birth = dob
        if age_on(dob, today) < ADULT_AGE:
            name = body.guardian_name or profile.guardian_name
            mail = body.guardian_email or profile.guardian_email
            if not name or not mail:
                raise InvalidState("students under 18 need a parent or guardian's name and email")
            profile.guardian_name, profile.guardian_email = name, mail
            if body.guardian_consent:
                rows.append(("guardian", name, mail))
    for by, name, mail in rows:
        await session.execute(
            insert(PolicyAcceptance)
            .values(
                user_id=profile.id,
                policy=policy,
                policy_version=VERSIONS[policy],
                accepted_by=by,
                full_name=name,
                email=mail,
            )
            .on_conflict_do_nothing()
        )
    audit(
        session,
        actor=profile.id,
        action="policy.accepted",
        entity_type="profile",
        entity_id=profile.id,
        metadata={"policy": policy, "version": VERSIONS[policy], "by": [r[0] for r in rows]},
    )


async def require_tutor_signed(session: AsyncSession, tutor_id: uuid.UUID) -> None:
    if "user" not in await _accepted_by(session, tutor_id, "tutor_agreement"):
        raise Forbidden("sign the Tutor Policy and Contractor Agreement before sending offers")


async def require_can_book(session: AsyncSession, student: Profile) -> None:
    s = await status(session, student)
    if not s.accepted:
        raise Forbidden("accept the Student and Parent Policy before booking a session")
    if not s.ready:
        raise Forbidden("a parent or guardian must give consent before booking a session")
