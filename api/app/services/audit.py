"""Audit trail for privileged actions. Never include secrets in metadata."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuditLog
from app.observability.logging import request_id_var


def audit(
    session: AsyncSession,
    *,
    actor: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    metadata: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_user_id=actor,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            metadata_=metadata or {},
            request_id=request_id_var.get(),
        )
    )
