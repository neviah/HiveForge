from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json
import sqlite3
from typing import List, Optional

from .agent_base import AgentEnvelope, AgentMessage


@dataclass(slots=True)
class BusRecord:
    id: int
    sender_id: str
    receiver_id: str
    payload: str
    correlation_id: str
    created_at: str
    delivered_at: Optional[str]


class MessageBus:
    """SQLite-backed message bus for agent communication.

    Path requirement from bootstrap:
      sandbox/agents/messages.db
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id TEXT NOT NULL,
                    receiver_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    correlation_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    delivered_at TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_receiver_delivered ON messages(receiver_id, delivered_at)"
            )
            conn.commit()

    def publish(self, envelope: AgentEnvelope) -> int:
        payload = json.dumps(
            {
                "kind": envelope.message.kind,
                "content": envelope.message.content,
                "metadata": envelope.message.metadata,
            },
            ensure_ascii=True,
        )
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO messages (sender_id, receiver_id, payload, correlation_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    envelope.sender_id,
                    envelope.receiver_id,
                    payload,
                    envelope.correlation_id,
                    envelope.created_at,
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)

    def fetch_pending(self, receiver_id: str, limit: int = 100) -> List[BusRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, sender_id, receiver_id, payload, correlation_id, created_at, delivered_at
                FROM messages
                WHERE receiver_id = ? AND delivered_at IS NULL
                ORDER BY id ASC
                LIMIT ?
                """,
                (receiver_id, limit),
            ).fetchall()
        return [BusRecord(**dict(row)) for row in rows]

    def acknowledge(self, message_id: int, delivered_at: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE messages SET delivered_at = ? WHERE id = ?",
                (delivered_at, message_id),
            )
            conn.commit()

    @staticmethod
    def to_envelope(record: BusRecord) -> AgentEnvelope:
        payload = json.loads(record.payload)
        msg = AgentMessage(
            kind=payload.get("kind", "unknown"),
            content=payload.get("content", ""),
            metadata=payload.get("metadata", {}),
        )
        return AgentEnvelope(
            sender_id=record.sender_id,
            receiver_id=record.receiver_id,
            message=msg,
            correlation_id=record.correlation_id,
            created_at=record.created_at,
        )
