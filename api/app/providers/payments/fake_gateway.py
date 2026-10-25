"""Explicit demo/test adapter used when no Stripe test keys are configured.

It never moves money. Checkout URLs point at a clearly labelled simulated checkout page,
which completes payment by posting a synthetic, HMAC-signed event through the SAME
webhook processing code used for real Stripe events. Refused in production by config.
"""

import hashlib
import hmac
import json
import uuid
from typing import Any
from urllib.parse import urlencode

from app.core.config import Settings
from app.providers.payments.base import CheckoutSession, ConnectOnboarding


class FakeGateway:
    name = "fake"
    SIGNING_SECRET = b"fake-gateway-local-only"

    def __init__(self, settings: Settings) -> None:
        self._s = settings
        self._idem: dict[str, str] = {}

    def _id(self, prefix: str, key: str) -> str:
        # Mirrors Stripe idempotency: the same key returns the same object id.
        if key not in self._idem:
            self._idem[key] = f"{prefix}_fake_{uuid.uuid4().hex[:16]}"
        return self._idem[key]

    def _checkout(self, key: str, metadata: dict[str, str] | None = None) -> CheckoutSession:
        sid = self._id("cs", key)
        meta = metadata or {}
        query = urlencode([(k, meta[k]) for k in ("kind", "task_id") if k in meta])
        url = f"{self._s.web_base_url}/checkout/simulated/{sid}" + (f"?{query}" if query else "")
        return CheckoutSession(id=sid, url=url)

    async def create_payment_checkout(
        self,
        *,
        amount_cents: int,
        description: str,
        metadata: dict[str, str],
        transfer_group: str,
        customer_email: str | None,
        idempotency_key: str,
    ) -> CheckoutSession:
        return self._checkout(idempotency_key, metadata)

    async def create_subscription_checkout(
        self, *, metadata: dict[str, str], customer_email: str | None, idempotency_key: str
    ) -> CheckoutSession:
        return self._checkout(idempotency_key, metadata)

    async def create_transfer(
        self,
        *,
        amount_cents: int,
        destination_account: str,
        source_charge: str | None,
        transfer_group: str,
        idempotency_key: str,
    ) -> str:
        return self._id("tr", idempotency_key)

    async def refund(self, *, charge_id: str, idempotency_key: str) -> str:
        return self._id("re", idempotency_key)

    async def resolve_charge(self, payment_intent_id: str) -> str | None:
        return payment_intent_id.replace("pi_", "ch_", 1)

    async def create_connect_onboarding(
        self, *, existing_account_id: str | None, email: str | None, user_id: str
    ) -> ConnectOnboarding:
        account_id = existing_account_id or f"acct_fake_{user_id.replace('-', '')[:16]}"
        return ConnectOnboarding(
            account_id=account_id,
            url=f"{self._s.web_base_url}/tutor/connect/simulated?account={account_id}",
        )

    @classmethod
    def sign(cls, payload: bytes) -> str:
        return hmac.new(cls.SIGNING_SECRET, payload, hashlib.sha256).hexdigest()

    def parse_webhook(self, payload: bytes, signature: str) -> dict[str, Any]:
        if not hmac.compare_digest(self.sign(payload), signature):
            raise ValueError("invalid fake signature")
        evt: dict[str, Any] = json.loads(payload)
        return evt
