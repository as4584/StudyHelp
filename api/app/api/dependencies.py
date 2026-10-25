"""Trusted request identity.

JWT -> verify signature/exp/iss/aud/alg -> sub -> load the CURRENT profile from Postgres ->
reject inactive accounts -> role guards. Token claims are never used for roles, approval,
suspension, premium or payout state; those are always read from the database.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.models.entities import Profile
from app.observability.logging import event
from app.security.jwt import InvalidToken, KeySource, RemoteKeySource, TokenClaims, TokenVerifier

log = logging.getLogger("auth")
_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@lru_cache
def _default_key_source() -> KeySource:
    return RemoteKeySource(get_settings().jwks_url)


def get_verifier() -> TokenVerifier:
    s = get_settings()
    return TokenVerifier(_default_key_source(), s.jwt_issuer, s.jwt_audience, s.jwt_algorithms)


def _unauthorized(reason: str, request: Request) -> HTTPException:
    event(log, "auth.rejected", logging.WARNING, reason=reason, path=request.url.path)
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_token_claims(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
) -> TokenClaims:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise _unauthorized("missing", request)
    try:
        return verifier.verify(creds.credentials)
    except InvalidToken as exc:
        raise _unauthorized(str(exc), request) from exc


ClaimsDep = Annotated[TokenClaims, Depends(get_token_claims)]


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    role: str
    email: str | None
    profile: Profile


async def get_current_user(claims: ClaimsDep, session: SessionDep) -> CurrentUser:
    try:
        user_id = uuid.UUID(claims.sub)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid subject") from exc
    profile = await session.get(Profile, user_id)
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Onboarding required")
    if not profile.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return CurrentUser(id=profile.id, role=profile.role, email=claims.email, profile=profile)


UserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_role(*roles: str) -> Callable[[CurrentUser], Awaitable[CurrentUser]]:
    async def guard(user: UserDep, request: Request) -> CurrentUser:
        if user.role not in roles:
            event(
                log,
                "authz.denied",
                logging.WARNING,
                user_id=str(user.id),
                role=user.role,
                needed=list(roles),
                path=request.url.path,
            )
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return guard


StudentDep = Annotated[CurrentUser, Depends(require_role("student"))]
TutorDep = Annotated[CurrentUser, Depends(require_role("tutor"))]
AdminDep = Annotated[CurrentUser, Depends(require_role("admin"))]
