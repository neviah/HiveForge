from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Iterable, List
from collections import deque
import uuid


@dataclass(slots=True)
class AgentMessage:
    """A message payload exchanged through the coordinator and message bus."""

    kind: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AgentEnvelope:
    """Transport wrapper for messages moving across the system."""

    sender_id: str
    receiver_id: str
    message: AgentMessage
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AgentBase(ABC):
    """Base behavior for all subordinate HiveForge agents.

    This class intentionally enforces inbox/outbox semantics and does not provide
    direct peer-to-peer communication. Subordinate agents push outbound messages
    to the coordinator via outbox envelopes.
    """

    def __init__(self, agent_id: str, role: str, private_memory: Dict[str, Any] | None = None) -> None:
        self.agent_id = agent_id
        self.role = role
        self.private_memory: Dict[str, Any] = private_memory or {}
        self.task_queue: Deque[Dict[str, Any]] = deque()
        self.inbox: Deque[AgentEnvelope] = deque()
        self.outbox: Deque[AgentEnvelope] = deque()
        self.health_status: str = "idle"
        self.last_heartbeat_at: str | None = None
        self.completed_tasks: int = 0

    def enqueue_task(self, task: Dict[str, Any]) -> None:
        self.task_queue.append(task)

    def dequeue_task(self) -> Dict[str, Any] | None:
        return self.task_queue.popleft() if self.task_queue else None

    def receive(self, envelope: AgentEnvelope) -> None:
        self.inbox.append(envelope)

    def send_to_coordinator(self, coordinator_id: str, message: AgentMessage) -> AgentEnvelope:
        envelope = AgentEnvelope(sender_id=self.agent_id, receiver_id=coordinator_id, message=message)
        self.outbox.append(envelope)
        return envelope

    def drain_outbox(self) -> List[AgentEnvelope]:
        items = list(self.outbox)
        self.outbox.clear()
        return items

    def pull_inbox(self) -> List[AgentEnvelope]:
        items = list(self.inbox)
        self.inbox.clear()
        return items

    def record_heartbeat(self) -> None:
        self.last_heartbeat_at = datetime.now(timezone.utc).isoformat()

    def status_snapshot(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "health_status": self.health_status,
            "queued_tasks": len(self.task_queue),
            "completed_tasks": self.completed_tasks,
            "last_heartbeat_at": self.last_heartbeat_at,
        }

    @abstractmethod
    def handle_message(self, envelope: AgentEnvelope) -> Iterable[AgentEnvelope]:
        """Process a single inbound message and optionally emit coordinator-bound messages."""

    @abstractmethod
    def tick(self) -> Iterable[AgentEnvelope]:
        """Run one work cycle for the agent."""
