"""Profile photos as their own cacheable images instead of inline data URLs in every list.

A tutor directory of 100 tutors carried ~3 MB of base64 photos on every load (and every bid
list ~30 KB per offer). Lists now return a link per photo; the browser fetches each one once
and caches it for good. The link is a capability: it is signed (so it can't be guessed from a
user id) and pinned to the photo's fingerprint (a new photo gets a new link, an old link 404s).
"""

import base64
import binascii
import hashlib
import hmac
import re
import uuid

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import SessionDep
from app.core.config import get_settings
from app.core.errors import NotFound
from app.models.entities import Profile

router = APIRouter(tags=["profile"])

_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$")


def _key() -> bytes:
    # Derived from the server secret with its own label, so no new setting is needed.
    secret = get_settings().supabase_secret_key or "local-dev-avatar-key"
    return hashlib.sha256(b"gsht-avatar-link:" + secret.encode()).digest()


def _sig(user_id: uuid.UUID, version: str) -> str:
    return hmac.new(_key(), f"{user_id}:{version}".encode(), hashlib.sha256).hexdigest()[:32]


# The photo's fingerprint, computed in the database so lists never load the photo itself.
avatar_version = func.md5(Profile.avatar_url)


def avatar_link(request: Request, user_id: uuid.UUID, version: str | None) -> str | None:
    if not version:
        return None
    v = version[:16]
    return str(request.url_for("avatar", user_id=str(user_id))) + f"?v={v}&s={_sig(user_id, v)}"


@router.get("/avatars/{user_id}", name="avatar", include_in_schema=False)
async def avatar(user_id: uuid.UUID, v: str, s: str, session: SessionDep) -> Response:
    if not hmac.compare_digest(s, _sig(user_id, v[:16])):
        raise NotFound("photo not found")
    return await _photo(session, user_id, v[:16])


async def _photo(session: AsyncSession, user_id: uuid.UUID, v: str) -> Response:
    row = (
        await session.execute(
            select(Profile.avatar_url, avatar_version).where(Profile.id == user_id)
        )
    ).one_or_none()
    if row is None or not row[0] or not row[1].startswith(v):
        raise NotFound("photo not found")  # removed, or replaced by a newer photo
    m = _DATA_URL.match(row[0])
    try:
        data = base64.b64decode(m.group(2), validate=True) if m else b""
    except binascii.Error:
        data = b""
    if m is None or not data:
        raise NotFound("photo not found")  # stored data isn't a valid image data URL
    return Response(
        data,
        media_type=m.group(1),
        # The URL changes whenever the photo does, so it can be cached forever.
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
