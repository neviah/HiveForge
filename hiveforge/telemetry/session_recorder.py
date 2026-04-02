from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import threading
from typing import Any
import uuid

_DEFAULT_STATE_DIR = Path(__file__).resolve().parents[1] / "state" / "sessions"
_LOCK = threading.Lock()
_RECORDER: SessionRecorder | None = None


class SessionRecorder:
    """Append-only JSONL session recorder with lightweight replay helpers."""

    def __init__(self, session_id: str | None = None, base_dir: Path | None = None) -> None:
        self.session_id = session_id or os.getenv("HIVEFORGE_SESSION_ID") or self._new_session_id()
        self.base_dir = base_dir or self._resolve_base_dir()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.base_dir / f"{self.session_id}.jsonl"

    @staticmethod
    def _new_session_id() -> str:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        return f"session_{stamp}_{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _resolve_base_dir() -> Path:
        override = os.getenv("HIVEFORGE_SESSION_LOG_DIR")
        return Path(override) if override else _DEFAULT_STATE_DIR

    def record(
        self,
        *,
        event_type: str,
        source: str,
        payload: dict[str, Any],
        agent_id: str | None = None,
        role: str | None = None,
        objective: str | None = None,
    ) -> None:
        entry = {
            "ts": datetime.now(UTC).isoformat(),
            "session_id": self.session_id,
            "event_type": event_type,
            "source": source,
            "agent_id": agent_id,
            "role": role,
            "objective": objective,
            "payload": payload,
        }
        line = json.dumps(entry, ensure_ascii=True)
        with _LOCK:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")


def get_session_recorder() -> SessionRecorder:
    global _RECORDER
    if _RECORDER is None:
        _RECORDER = SessionRecorder()
    return _RECORDER


def _sessions_dir() -> Path:
    override = os.getenv("HIVEFORGE_SESSION_LOG_DIR")
    return Path(override) if override else _DEFAULT_STATE_DIR


def list_recorded_sessions() -> list[str]:
    base = _sessions_dir()
    if not base.exists():
        return []
    return sorted(path.stem for path in base.glob("*.jsonl"))


def load_session_events(session_id: str) -> list[dict[str, Any]]:
    path = _sessions_dir() / f"{session_id}.jsonl"
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            events.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return events


def replay_session(session_id: str) -> dict[str, Any]:
    events = load_session_events(session_id)
    event_counts = Counter(event.get("event_type", "unknown") for event in events)
    agents = sorted({event.get("agent_id") for event in events if event.get("agent_id")})
    sources = sorted({event.get("source") for event in events if event.get("source")})

    return {
        "session_id": session_id,
        "event_count": len(events),
        "event_types": dict(event_counts),
        "agents": agents,
        "sources": sources,
        "events": events,
    }


def _reset_session_recorder_for_tests() -> None:
    global _RECORDER
    _RECORDER = None
