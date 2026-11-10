"""Task lifecycle state machine. The single source of allowed transitions."""

from app.core.errors import InvalidState

TRANSITIONS: dict[str, set[str]] = {
    "open": {"hired", "cancelled"},
    # hired -> cancelled only when no checkout is in flight (marketplace.cancel checks).
    "hired": {"paid", "cancelled"},
    "paid": {"delivered", "disputed", "refunded"},
    "delivered": {"completed", "disputed", "refunded"},
    # Only an admin's decision ends a dispute (release -> completed, refund -> refunded).
    "disputed": {"completed", "refunded"},
    "completed": set(),
    "refunded": set(),
    "cancelled": set(),
}


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def ensure_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidState(f"task cannot move from '{current}' to '{target}'")
