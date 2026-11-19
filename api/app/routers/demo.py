"""Demo environment only (mounted in main when ENVIRONMENT=demo)."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.demo import restore_demo_password

router = APIRouter(prefix="/demo", tags=["demo"])


class RestoreIn(BaseModel):
    email: str = Field(max_length=100)


class RestoreOut(BaseModel):
    restored: bool


@router.post("/restore-login", response_model=RestoreOut)
async def restore_login(body: RestoreIn) -> RestoreOut:
    """Put a public demo account back on the published password."""
    await restore_demo_password(body.email)
    return RestoreOut(restored=True)
