from __future__ import annotations

ALLOWED_TRANSITIONS = {
    "backlog": {"ready"},
    "ready": {"in_progress"},
    "in_progress": {"review", "blocked"},
    "blocked": {"in_progress", "cancelled"},
    "review": {"done", "in_progress"},
    "done": set(),
    "cancelled": set(),
}


def can_transition(current: str, nxt: str) -> bool:
    return nxt in ALLOWED_TRANSITIONS.get(current, set())
