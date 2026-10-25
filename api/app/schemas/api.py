"""Request/response contracts. Clients never send user ids or roles for themselves."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Lang = Field(pattern=r"^[a-z]{2}$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------------- profiles / tutors


class OnboardIn(BaseModel):
    role: Literal["student", "tutor"]  # admin is never self-assignable
    display_name: str = Field(min_length=1, max_length=80)
    preferred_language: str = Lang


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    preferred_language: str | None = Field(default=None, pattern=r"^[a-z]{2}$")


class TutorApplicationIn(BaseModel):
    bio: str = Field(max_length=2000)
    subjects: list[str] = Field(min_length=1, max_length=10)
    hourly_rate_cents: int = Field(ge=100, le=100000)


class TutorOut(ORM):
    user_id: uuid.UUID
    bio: str
    subjects: list[str]
    hourly_rate_cents: int
    status: str
    payouts_enabled: bool
    rating_avg: float
    rating_count: int


class PublicTutorOut(TutorOut):
    display_name: str


class ProfileOut(ORM):
    id: uuid.UUID
    role: str
    display_name: str
    preferred_language: str
    is_active: bool


class MeOut(BaseModel):
    profile: ProfileOut
    tutor: TutorOut | None
    premium: bool


# ----------------------------------------------------------------- tasks / bids


class TaskIn(BaseModel):
    subject: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=1, max_length=5000)
    budget_cents: int = Field(ge=500, le=500000)
    honor_code_ack: bool


class TaskOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID
    subject: str
    title: str
    description: str
    budget_cents: int
    status: str
    hired_tutor_id: uuid.UUID | None
    accepted_bid_id: uuid.UUID | None
    delivery_note: str | None
    created_at: datetime


class BidIn(BaseModel):
    amount_cents: int = Field(ge=500, le=500000)
    message: str = Field(default="", max_length=2000)


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
    tutor_rating_avg: float
    tutor_rating_count: int


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
    filename: str = Field(min_length=1, max_length=200, pattern=r"^[\w.\- ()]+$")
    kind: Literal["rubric", "deliverable"] = "rubric"


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
