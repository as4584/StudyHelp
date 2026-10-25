"""Payment gateway boundary. Stripe is authoritative for payment state; we mirror it."""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class CheckoutSession:
    id: str
    url: str


@dataclass(frozen=True)
class ConnectOnboarding:
    account_id: str
    url: str


class PaymentGateway(Protocol):
    name: str

    async def create_payment_checkout(
        self,
        *,
        amount_cents: int,
        description: str,
        metadata: dict[str, str],
        transfer_group: str,
        customer_email: str | None,
        idempotency_key: str,
    ) -> CheckoutSession: ...

    async def create_subscription_checkout(
        self, *, metadata: dict[str, str], customer_email: str | None, idempotency_key: str
    ) -> CheckoutSession: ...

    async def create_transfer(
        self,
        *,
        amount_cents: int,
        destination_account: str,
        source_charge: str | None,
        transfer_group: str,
        idempotency_key: str,
    ) -> str: ...

    async def refund(self, *, charge_id: str, idempotency_key: str) -> str: ...

    async def resolve_charge(self, payment_intent_id: str) -> str | None:
        """Return the PaymentIntent's latest charge id (needed for source_transaction)."""
        ...

    async def create_connect_onboarding(
        self, *, existing_account_id: str | None, email: str | None, user_id: str
    ) -> ConnectOnboarding: ...

    def parse_webhook(self, payload: bytes, signature: str) -> dict[str, Any]:
        """Verify the signature and return the event dict. Raises ValueError if invalid."""
        ...
