"""Pure money math. All amounts are integer cents; no floats touch money."""

from dataclasses import dataclass

TIP_AMOUNTS_CENTS = (200, 500, 1000)


@dataclass(frozen=True)
class FeeSplit:
    amount_cents: int
    fee_bps: int
    platform_fee_cents: int
    tutor_net_cents: int


def split_payment(amount_cents: int, fee_bps: int) -> FeeSplit:
    """Platform fee rounds half-up to the cent; the tutor receives the exact remainder."""
    if amount_cents <= 0:
        raise ValueError("amount must be positive")
    if not 2000 <= fee_bps <= 3000:
        raise ValueError("fee must be within the 20-30% policy")
    fee = (amount_cents * fee_bps + 5000) // 10000
    return FeeSplit(amount_cents, fee_bps, fee, amount_cents - fee)


def validate_tip(amount_cents: int) -> int:
    if amount_cents not in TIP_AMOUNTS_CENTS:
        raise ValueError("tip must be $2, $5 or $10")
    return amount_cents
