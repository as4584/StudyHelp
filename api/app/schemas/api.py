"""Request/response contracts. Clients never send user ids or roles for themselves."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.core.config import get_settings

Lang = Field(pattern=r"^[a-z]{2}$")
Level = Literal["high_school", "college"]
# A client-resized profile photo as a data URL; "" clears it.
AVATAR_PATTERN = r"^(|data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$"
# No leading dot: rules out "." / ".." path segments and hidden files.
SAFE_FILENAME = r"^[\w\- ()][\w.\- ()]*$"
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _session_price(cents: int) -> int:
    s = get_settings()
    if not s.price_min_cents <= cents <= s.price_max_cents:
        raise ValueError(
            f"Session prices are ${s.price_min_cents / 100:.0f}-${s.price_max_cents / 100:.0f}"
        )
    return cents


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------------- profiles / tutors


class PolicyAcceptIn(BaseModel):
    """Acceptance of the caller's sign-up policy. Tutors' full name is their e-signature."""

    agree: Literal[True]  # the unchecked box never creates an acceptance
    full_name: str = Field(min_length=2, max_length=120)
    date_of_birth: date | None = None  # students
    guardian_name: str | None = Field(default=None, min_length=2, max_length=120)
    guardian_email: str | None = Field(default=None, max_length=254, pattern=EMAIL)
    guardian_consent: bool = False  # the parent/guardian ticks this; required before booking
    rules: list[bool] = Field(max_length=20)  # the policy's rule checklist, every box ticked

    # "before": the length limits then apply to the trimmed name, so "  a " is a 422, not a 500.
    @field_validator("full_name", "guardian_name", "guardian_email", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class GuardianConsentIn(BaseModel):
    """A parent/guardian's consent for a student under 18 who has already accepted the policy."""

    consent: Literal[True]
    guardian_name: str = Field(min_length=2, max_length=120)
    guardian_email: str = Field(max_length=254, pattern=EMAIL)

    @field_validator("guardian_name", "guardian_email", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class PolicyStatusOut(BaseModel):
    policy: str | None = None  # None: this role has no sign-up policy (admins)
    title: str | None = None
    version: str | None = None
    accepted: bool = False
    accepted_name: str | None = None
    date_of_birth: date | None = None
    minor: bool = False
    guardian_name: str | None = None
    guardian_email: str | None = None
    guardian_consent: bool = False
    ready: bool = False  # tutors may send offers / students may book


class OnboardIn(BaseModel):
    role: Literal["student", "tutor"]  # admin is never self-assignable
    display_name: str = Field(min_length=1, max_length=80)
    preferred_language: str = Lang
    policy: PolicyAcceptIn  # no account without accepting the role's policy


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    preferred_language: str | None = Field(default=None, pattern=r"^[a-z]{2}$")
    avatar_url: str | None = Field(default=None, max_length=200000, pattern=AVATAR_PATTERN)


class TutorApplicationIn(BaseModel):
    bio: str = Field(max_length=2000)
    subjects: list[str] = Field(min_length=1, max_length=10)
    # The subject shown first on the tutor's profile; must be one of `subjects`.
    main_subject: str | None = Field(default=None, max_length=80)
    years_experience: int | None = Field(default=None, ge=0, le=60)
    levels: list[Level] = Field(default=["high_school", "college"], min_length=1, max_length=2)
    hourly_rate_cents: int = Field(ge=100, le=100000)

    @model_validator(mode="after")
    def _main_subject_first(self) -> "TutorApplicationIn":
        if self.main_subject is not None:
            if self.main_subject not in self.subjects:
                raise ValueError("main_subject must be one of subjects")
            rest = [s for s in self.subjects if s != self.main_subject]
            self.subjects = [self.main_subject, *rest]
        return self


class TutorOut(ORM):
    user_id: uuid.UUID
    bio: str
    subjects: list[str]
    years_experience: int | None = None
    levels: list[str]
    hourly_rate_cents: int
    status: str
    payouts_enabled: bool
    rating_avg: float
    rating_count: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def main_subject(self) -> str | None:
        """Stored as the first subject, so subject search needs no extra column."""
        return self.subjects[0] if self.subjects else None


class PublicTutorOut(TutorOut):
    display_name: str
    avatar_url: str | None = None


class ProfileOut(ORM):
    id: uuid.UUID
    role: str
    display_name: str
    preferred_language: str
    is_active: bool
    avatar_url: str | None = None


class MeOut(BaseModel):
    profile: ProfileOut
    tutor: TutorOut | None
    premium: bool
    policy: PolicyStatusOut


# ----------------------------------------------------------------- tasks / bids


class TaskIn(BaseModel):
    subject: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=1, max_length=5000)
    budget_cents: int
    language: str = Field(default="en", pattern=r"^[a-z]{2}$")
    level: Level = "college"
    honor_code_ack: bool

    _budget = field_validator("budget_cents")(_session_price)


class TaskOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID
    subject: str
    title: str
    description: str
    budget_cents: int
    language: str
    level: str
    status: str
    hired_tutor_id: uuid.UUID | None
    accepted_bid_id: uuid.UUID | None
    delivery_note: str | None
    created_at: datetime


class BidIn(BaseModel):
    amount_cents: int
    message: str = Field(default="", max_length=2000)

    _amount = field_validator("amount_cents")(_session_price)


class BidOut(ORM):
    id: uuid.UUID
    task_id: uuid.UUID
    tutor_id: uuid.UUID
    amount_cents: int
    message: str
    status: str
    created_at: datetime


class BidWithTutorOut(BidOut):
    tutor_name: str
    tutor_avatar_url: str | None
    tutor_rating_avg: float
    tutor_rating_count: int
    tutor_main_subject: str | None = None
    tutor_years_experience: int | None = None


class HireIn(BaseModel):
    bid_id: uuid.UUID


class DeliverIn(BaseModel):
    note: str = Field(min_length=1, max_length=5000)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ReviewOut(ORM):
    id: uuid.UUID
    task_id: uuid.UUID
    tutor_id: uuid.UUID
    rating: int
    comment: str


class DisputeIn(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class DisputeOut(ORM):
    id: uuid.UUID
    task_id: uuid.UUID
    opened_by: uuid.UUID
    reason: str
    status: str
    resolution_note: str | None
    created_at: datetime


class ResolveDisputeIn(BaseModel):
    outcome: Literal["release", "refund"]
    note: str = Field(min_length=1, max_length=2000)


# ----------------------------------------------------------------- payments


class RedirectOut(BaseModel):
    url: str


class TipIn(BaseModel):
    amount_cents: Literal[200, 500, 1000]


class PaymentOut(ORM):
    id: uuid.UUID
    task_id: uuid.UUID
    amount_cents: int
    platform_fee_bps: int
    platform_fee_cents: int
    tutor_net_cents: int
    status: str
    created_at: datetime


class QuoteOut(BaseModel):
    task_id: uuid.UUID
    amount_cents: int
    platform_fee_bps: int
    platform_fee_cents: int
    tutor_net_cents: int


class TransferOut(ORM):
    id: uuid.UUID
    amount_cents: int
    status: str
    provider_transfer_id: str | None


class TaskPaymentState(BaseModel):
    payment: PaymentOut | None
    transfer: TransferOut | None
    tips_cents: int


class WebhookAck(BaseModel):
    result: Literal["processed", "duplicate"]


# ----------------------------------------------------------------- chat / files


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TranslationOut(ORM):
    target_language: str
    translated_body: str | None
    provider: str
    status: str


class MessageOut(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    body: str
    source_language: str
    created_at: datetime
    translations: list[TranslationOut]


class ConversationOut(ORM):
    id: uuid.UUID
    task_id: uuid.UUID
    student_id: uuid.UUID
    tutor_id: uuid.UUID


class UploadIn(BaseModel):
    filename: str = Field(min_length=1, max_length=200, pattern=SAFE_FILENAME)
    kind: Literal["rubric", "deliverable"] = "rubric"


class TutorDocumentIn(BaseModel):
    filename: str = Field(min_length=1, max_length=200, pattern=SAFE_FILENAME)
    kind: Literal["qualification", "resume"] = "qualification"


class UploadOut(BaseModel):
    file_id: uuid.UUID
    upload_url: str
    token: str
    path: str


class FileOut(ORM):
    id: uuid.UUID
    kind: str
    filename: str
    created_at: datetime


# ----------------------------------------------------------------- AI


class AiChatIn(BaseModel):
    subject: str = Field(default="", max_length=60)


class AiChatOut(ORM):
    id: uuid.UUID
    subject: str


class AiQuotaOut(BaseModel):
    premium: bool
    period: Literal["day", "month"]
    used: int
    limit: int
    remaining: int
    resets_at: datetime


class VideoJoinOut(BaseModel):
    url: str
    token: str
    expires_at: datetime
    room: str
    identity: str


class VideoStatusOut(BaseModel):
    status: Literal["none", "created", "active", "ended"]
    joinable: bool


class AiAskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


class AiMessageOut(ORM):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class TaskDraftOut(BaseModel):
    subject: str
    title: str
    description: str


# ----------------------------------------------------------------- admin


class AdminUserOut(ProfileOut):
    created_at: datetime


class RevenueOut(BaseModel):
    fee_bps: int
    gross_held_cents: int
    gross_released_cents: int
    platform_fees_earned_cents: int
    platform_fees_pending_cents: int
    tutor_payouts_cents: int
    refunded_cents: int
    tips_cents: int
    payments_count: int


class PolicyAcceptanceOut(ORM):
    id: uuid.UUID
    user_id: uuid.UUID
    account_name: str
    role: str
    policy: str
    policy_version: str
    accepted_by: str
    full_name: str
    email: str
    accepted_at: datetime


class AuditOut(ORM):
    id: int
    actor_user_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: str
    created_at: datetime


class HealthOut(BaseModel):
    status: str
    version: str
    git_sha: str
    environment: str
    providers: dict[str, str]
