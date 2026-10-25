"""Stripe Connect (separate charges and transfers) + Billing. TEST MODE ONLY (see config)."""

import asyncio
import logging
import time
from typing import Any

import stripe

from app.core.config import Settings
from app.core.errors import ProviderError
from app.observability.logging import event
from app.providers.payments.base import CheckoutSession, ConnectOnboarding

log = logging.getLogger("stripe")


class StripeGateway:
    name = "stripe"

    def __init__(self, settings: Settings) -> None:
        self._s = settings
        self._client = stripe.StripeClient(settings.stripe_secret_key)

    async def _call(self, op: str, fn: Any, *args: Any) -> Any:
        start = time.perf_counter()
        ok = False
        try:
            result = await asyncio.to_thread(fn, *args)
            ok = True
            return result
        except stripe.StripeError as exc:
            raise ProviderError(f"stripe: {exc.user_message or type(exc).__name__}") from exc
        finally:
            event(
                log,
                "stripe.call",
                op=op,
                ok=ok,
                duration_ms=round((time.perf_counter() - start) * 1000, 1),
            )

    def _return_urls(self) -> dict[str, str]:
        base = self._s.web_base_url
        return {
            "success_url": f"{base}/payments/return?status=success",
            "cancel_url": f"{base}/payments/return?status=cancel",
        }

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
        params: dict[str, Any] = {
            "mode": "payment",
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": amount_cents,
                        "product_data": {"name": description[:250]},
                    },
                    "quantity": 1,
                }
            ],
            "payment_intent_data": {"transfer_group": transfer_group, "metadata": metadata},
            "metadata": metadata,
            **self._return_urls(),
        }
        if customer_email:
            params["customer_email"] = customer_email
        session = await self._call(
            "checkout.create",
            self._client.checkout.sessions.create,
            params,
            {"idempotency_key": idempotency_key},
        )
        return CheckoutSession(id=session.id, url=session.url)

    async def create_subscription_checkout(
        self, *, metadata: dict[str, str], customer_email: str | None, idempotency_key: str
    ) -> CheckoutSession:
        if not self._s.stripe_premium_price_id:
            raise ProviderError("STRIPE_PREMIUM_PRICE_ID is not configured")
        params: dict[str, Any] = {
            "mode": "subscription",
            "line_items": [{"price": self._s.stripe_premium_price_id, "quantity": 1}],
            "metadata": metadata,
            "subscription_data": {"metadata": metadata},
            **self._return_urls(),
        }
        if customer_email:
            params["customer_email"] = customer_email
        session = await self._call(
            "checkout.subscription",
            self._client.checkout.sessions.create,
            params,
            {"idempotency_key": idempotency_key},
        )
        return CheckoutSession(id=session.id, url=session.url)

    async def create_transfer(
        self,
        *,
        amount_cents: int,
        destination_account: str,
        source_charge: str | None,
        transfer_group: str,
        idempotency_key: str,
    ) -> str:
        params: dict[str, Any] = {
            "amount": amount_cents,
            "currency": "usd",
            "destination": destination_account,
            "transfer_group": transfer_group,
        }
        if source_charge:
            # Ties the transfer to the charge so it cannot outrun settled funds.
            params["source_transaction"] = source_charge
        transfer = await self._call(
            "transfer.create",
            self._client.transfers.create,
            params,
            {"idempotency_key": idempotency_key},
        )
        return str(transfer.id)

    async def refund(self, *, charge_id: str, idempotency_key: str) -> str:
        refund = await self._call(
            "refund.create",
            self._client.refunds.create,
            {"charge": charge_id},
            {"idempotency_key": idempotency_key},
        )
        return str(refund.id)

    async def resolve_charge(self, payment_intent_id: str) -> str | None:
        pi = await self._call(
            "payment_intent.retrieve", self._client.payment_intents.retrieve, payment_intent_id
        )
        charge = pi.latest_charge
        return None if charge is None else str(getattr(charge, "id", charge))

    async def create_connect_onboarding(
        self, *, existing_account_id: str | None, email: str | None, user_id: str
    ) -> ConnectOnboarding:
        account_id = existing_account_id
        if account_id is None:
            account = await self._call(
                "account.create",
                self._client.accounts.create,
                {
                    "type": "express",
                    "email": email,
                    "capabilities": {"transfers": {"requested": True}},
                    "metadata": {"user_id": user_id},
                },
                {"idempotency_key": f"connect-account:{user_id}"},
            )
            account_id = str(account.id)
        link = await self._call(
            "account_link.create",
            self._client.account_links.create,
            {
                "account": account_id,
                "type": "account_onboarding",
                "refresh_url": f"{self._s.web_base_url}/tutor?connect=refresh",
                "return_url": f"{self._s.web_base_url}/tutor?connect=return",
            },
        )
        return ConnectOnboarding(account_id=account_id, url=str(link.url))

    def parse_webhook(self, payload: bytes, signature: str) -> dict[str, Any]:
        try:
            evt = stripe.Webhook.construct_event(payload, signature, self._s.stripe_webhook_secret)
        except (stripe.SignatureVerificationError, ValueError) as exc:
            raise ValueError("invalid stripe webhook") from exc
        result: dict[str, Any] = evt.to_dict()
        return result
