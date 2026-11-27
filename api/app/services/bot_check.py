"""Server-side check of a Cloudflare Turnstile token, so sign-up can't be scripted.

The browser shows the widget and sends the token it produces; only this check decides.
It fails closed: if Cloudflare can't be reached the sign-up is refused and can be retried.
With Cloudflare's published test secrets no request is made (always pass / always fail),
so local runs and CI work offline.
"""

import logging
from typing import Any

import httpx

from app.core.config import TURNSTILE_TEST_SECRET_FAIL, TURNSTILE_TEST_SECRET_PASS, get_settings
from app.core.errors import BotCheckFailed
from app.observability.logging import event

log = logging.getLogger("bot_check")

RETRY = "We couldn't confirm you're not a bot. Please complete the check and try again."


async def verify(token: str | None, remote_ip: str | None = None) -> None:
    """Raise BotCheckFailed unless Cloudflare confirms this single-use token."""
    s = get_settings()
    secret = s.turnstile_secret
    if not token:
        raise BotCheckFailed(RETRY)
    if secret == TURNSTILE_TEST_SECRET_PASS:
        return
    if secret == TURNSTILE_TEST_SECRET_FAIL:
        raise BotCheckFailed(RETRY)
    data = {"secret": secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=s.turnstile_timeout_s) as client:
            resp = await client.post(s.turnstile_verify_url, data=data)
        body: dict[str, Any] = resp.json() if resp.status_code == 200 else {}
    except (httpx.HTTPError, ValueError) as exc:
        event(log, "bot_check.unreachable", logging.WARNING, error=type(exc).__name__)
        raise BotCheckFailed(RETRY) from exc
    if body.get("success") is not True:
        codes = ",".join(body.get("error-codes") or []) or f"http_{resp.status_code}"
        event(log, "bot_check.rejected", codes=codes)
        raise BotCheckFailed(RETRY)
