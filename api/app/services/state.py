"""Task lifecycle state machine. The single source of allowed transitions."""

from app.core.errors import InvalidState

TRANSITIONS: dict[str, set[str]] = {
    "open": {"hired", "cancelled"},
    # No hired -> cancelled: a checkout may be in flight and its webhook must always land.
    "hired": {"paid"},
    "paid": {"delivered", "disputed", "refunded"},
    "delivered": {"completed", "disputed", "refunded"},
    "disputed": {"completed", "refunded", "paid", "delivered"},
    "completed": set(),
    "refunded": set(),
    "cancelled": set(),
}


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def ensure_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidState(f"task cannot move from '{current}' to '{target}'")
