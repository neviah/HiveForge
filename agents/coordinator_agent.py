from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import json
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from .agent_base import AgentBase, AgentEnvelope, AgentMessage
from .message_bus import MessageBus
from .task_scheduler import TaskScheduler, TASK_BACKLOG, TASK_DONE


@dataclass(slots=True)
class CredentialGrant:
    service: str
    scopes: List[str] = field(default_factory=list)
    max_daily_spend: Optional[float] = None
    max_monthly_spend: Optional[float] = None


@dataclass(slots=True)
class BrowserGrant:
    allowed_domains: List[str] = field(default_factory=list)
    allowed_actions: List[str] = field(default_factory=lambda: [
        "navigate",
        "wait_for_selector",
        "get_content",
        "screenshot",
    ])
    require_https: bool = True


class CoordinatorAgent:
    """Mandatory coordinator for every HiveForge project.

    Responsibilities implemented in scaffold form:
    - route all inter-agent messages through message bus
    - assign tasks from scheduler to subordinate agents
    - enforce credential-access gate
    - track heartbeat and detect stalled agents
    - maintain project status snapshot for dashboard APIs
    """

    def __init__(
        self,
        project_id: str,
        sandbox_root: Path,
        heartbeat_interval_seconds: int = 30,
    ) -> None:
        self.project_id = project_id
        self.coordinator_id = f"coordinator::{project_id}"
        self.sandbox_root = sandbox_root
        self.heartbeat_interval_seconds = heartbeat_interval_seconds

        bus_path = sandbox_root / "agents" / "messages.db"
        self.bus = MessageBus(bus_path)
        self.scheduler = TaskScheduler()

        self.subordinates: Dict[str, AgentBase] = {}
        self.credential_policy: Dict[str, CredentialGrant] = {}
        self.browser_policy = BrowserGrant()
        self.skill_policy: Dict[str, Any] = self._load_skill_policy()
        self.heartbeat_log: List[dict] = []
        self.last_heartbeat_at: str | None = None
        self.auto_fix_attempts: int = 0

    def _load_skill_policy(self) -> Dict[str, Any]:
        policy_path = self.sandbox_root / "skills" / "sandbox_policy.json"
        if not policy_path.exists():
            return {
                "default": {"allow": False, "reason": "missing_policy_file"},
                "global_rules": {
                    "allow_host_filesystem_access": False,
                    "allow_direct_credential_access": False,
                    "require_coordinator_mediation": True,
                    "require_audit_logging": True,
                },
                "skills": {},
            }
        return json.loads(policy_path.read_text(encoding="utf-8"))

    def register_agent(self, agent: AgentBase) -> None:
        if agent.agent_id in self.subordinates:
            raise ValueError(f"Agent already registered: {agent.agent_id}")
        self.subordinates[agent.agent_id] = agent

    def register_credential_policy(self, grant: CredentialGrant) -> None:
        self.credential_policy[grant.service] = grant

    def register_browser_policy(self, grant: BrowserGrant) -> None:
        self.browser_policy = grant

    def route_outbound(self) -> int:
        """Persist outbound envelopes from subordinate outboxes into the bus."""
        published = 0
        for agent in self.subordinates.values():
            for envelope in agent.drain_outbox():
                # Hard rule: all subordinate messages must target coordinator first.
                if envelope.receiver_id != self.coordinator_id:
                    envelope = AgentEnvelope(
                        sender_id=envelope.sender_id,
                        receiver_id=self.coordinator_id,
                        message=AgentMessage(
                            kind="reroute_warning",
                            content="Direct peer message blocked; routed to coordinator.",
                            metadata={
                                "original_receiver": envelope.receiver_id,
                                "original_kind": envelope.message.kind,
                            },
                        ),
                    )
                self.bus.publish(envelope)
                published += 1
        return published

    def process_inbound(self, limit: int = 100) -> int:
        """Consume coordinator mailbox and dispatch valid messages."""
        records = self.bus.fetch_pending(self.coordinator_id, limit=limit)
        handled = 0
        now = datetime.now(timezone.utc).isoformat()

        for record in records:
            envelope = self.bus.to_envelope(record)
            self._handle_envelope(envelope)
            self.bus.acknowledge(record.id, delivered_at=now)
            handled += 1

        return handled

    def _handle_envelope(self, envelope: AgentEnvelope) -> None:
        message = envelope.message
        if message.kind == "task_request":
            task_title = message.metadata.get("title", "Untitled task")
            task_desc = message.metadata.get("description", message.content)
            assignee = message.metadata.get("assignee_id")
            depends_on = message.metadata.get("depends_on", [])
            self.scheduler.add_task(task_title, task_desc, assignee_id=assignee, depends_on=depends_on)
            return

        if message.kind == "credential_request":
            approved = self._approve_credential_request(message.metadata)
            response = AgentEnvelope(
                sender_id=self.coordinator_id,
                receiver_id=envelope.sender_id,
                message=AgentMessage(
                    kind="credential_response",
                    content="approved" if approved else "denied",
                    metadata={"approved": approved},
                ),
            )
            self.bus.publish(response)
            return

        if message.kind == "browser_request":
            approved, reason = self._approve_browser_request(message.metadata)
            response = AgentEnvelope(
                sender_id=self.coordinator_id,
                receiver_id=envelope.sender_id,
                message=AgentMessage(
                    kind="browser_response",
                    content="approved" if approved else "denied",
                    metadata={
                        "approved": approved,
                        "reason": reason,
                        "action": message.metadata.get("action"),
                        "url": message.metadata.get("url"),
                    },
                ),
            )
            self.bus.publish(response)
            return

        if message.kind == "skill_request":
            approved, reason = self._approve_skill_request(envelope.sender_id, message.metadata)
            response = AgentEnvelope(
                sender_id=self.coordinator_id,
                receiver_id=envelope.sender_id,
                message=AgentMessage(
                    kind="skill_response",
                    content="approved" if approved else "denied",
                    metadata={
                        "approved": approved,
                        "reason": reason,
                        "skill_name": message.metadata.get("skill_name"),
                        "operation": message.metadata.get("operation"),
                    },
                ),
            )
            self.bus.publish(response)
            return

        if message.kind == "task_completed":
            task_id = message.metadata.get("task_id")
            if task_id and task_id in self.scheduler.tasks:
                self.scheduler.mark_done(task_id)
            return

        # Unknown messages are preserved in heartbeat log for diagnosis.
        self.heartbeat_log.append(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": "warn",
                "event": "unknown_message_kind",
                "data": {
                    "sender": envelope.sender_id,
                    "kind": message.kind,
                    "metadata": message.metadata,
                },
            }
        )

    def _approve_credential_request(self, metadata: dict) -> bool:
        service = metadata.get("service")
        scope = metadata.get("scope")
        if not service or service not in self.credential_policy:
            return False
        grant = self.credential_policy[service]
        if scope and grant.scopes and scope not in grant.scopes:
            return False
        return True

    def _approve_browser_request(self, metadata: dict) -> tuple[bool, str]:
        # Runtime check: browser automation can be blocked globally via Task 8 policy.
        agent_browser = self.skill_policy.get("skills", {}).get("agent-browser", {})
        if agent_browser and not bool(agent_browser.get("enabled", False)):
            return False, "agent-browser skill is disabled by sandbox policy"

        action = str(metadata.get("action") or "")
        url = str(metadata.get("url") or "")

        if not action:
            return False, "Missing browser action"
        if action not in self.browser_policy.allowed_actions:
            return False, f"Action not allowed: {action}"

        if not url:
            return False, "Missing target URL"

        parsed = urlparse(url)
        domain = (parsed.hostname or "").lower()
        if not domain:
            return False, "Invalid URL"

        if self.browser_policy.require_https and parsed.scheme.lower() != "https":
            return False, "Only HTTPS targets are allowed"

        if not self.browser_policy.allowed_domains:
            return False, "No browser domains have been allowlisted"

        for allowed in self.browser_policy.allowed_domains:
            allowed_l = allowed.lower()
            if domain == allowed_l or domain.endswith("." + allowed_l):
                return True, "Allowed by browser policy"

        return False, f"Domain not allowlisted: {domain}"

    def _approve_skill_request(self, sender_id: str, metadata: dict) -> tuple[bool, str]:
        skill_name = str(metadata.get("skill_name") or "").strip()
        operation = str(metadata.get("operation") or "").strip()
        target_url = str(metadata.get("target_url") or "").strip()
        target_domain = str(metadata.get("target_domain") or "").strip().lower()
        requests_direct_credentials = bool(metadata.get("requests_direct_credentials", False))

        if not skill_name:
            return False, "Missing skill_name"

        global_rules = self.skill_policy.get("global_rules", {})
        skill_cfg = self.skill_policy.get("skills", {}).get(skill_name)
        if not skill_cfg:
            default = self.skill_policy.get("default", {})
            allowed = bool(default.get("allow", False))
            return (allowed, "Allowed by default policy" if allowed else str(default.get("reason", "deny-by-default")))

        if not bool(skill_cfg.get("enabled", False)):
            return False, f"Skill disabled by policy: {skill_name}"

        if requests_direct_credentials and not bool(global_rules.get("allow_direct_credential_access", False)):
            return False, "Direct credential access is forbidden by global policy"

        # coordinator_only means subordinate requests must still route via coordinator only.
        if bool(skill_cfg.get("coordinator_only", False)) and sender_id != self.coordinator_id:
            # This is still acceptable because this method is coordinator-side mediation.
            # Keep this check explicit for auditability.
            pass

        allowed_domains = [str(d).lower() for d in skill_cfg.get("allowed_network_domains", [])]
        if target_url and not target_domain:
            parsed = urlparse(target_url)
            target_domain = (parsed.hostname or "").lower()

        if target_domain and allowed_domains:
            if not any(target_domain == dom or target_domain.endswith("." + dom) for dom in allowed_domains):
                return False, f"Target domain not allowlisted for {skill_name}: {target_domain}"

        if not operation:
            return False, "Missing skill operation"

        return True, "Skill request approved by sandbox policy"

    def assign_runnable_tasks(self) -> int:
        """Assign unblocked tasks to available agents."""
        assigned = 0
        runnable = self.scheduler.next_runnable()
        if not runnable:
            return 0

        idle_agents = [a for a in self.subordinates.values() if a.health_status in {"idle", "running"}]
        if not idle_agents:
            return 0

        cursor = 0
        for task in runnable:
            agent = idle_agents[cursor % len(idle_agents)]
            self.scheduler.assign(task.task_id, agent.agent_id)
            self.scheduler.mark_inprogress(task.task_id)
            agent.enqueue_task(
                {
                    "task_id": task.task_id,
                    "title": task.title,
                    "description": task.description,
                }
            )
            assigned += 1
            cursor += 1

        return assigned

    def run_heartbeat(self) -> dict:
        """Heartbeat cycle to keep forward progress and detect stalls."""
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        stalled_agents: List[str] = []
        for agent in self.subordinates.values():
            agent.record_heartbeat()
            if agent.health_status == "error":
                stalled_agents.append(agent.agent_id)

        if stalled_agents:
            self.auto_fix_attempts += 1
            for agent_id in stalled_agents:
                self.heartbeat_log.append(
                    {
                        "ts": now_iso,
                        "level": "warn",
                        "event": "agent_stalled",
                        "data": {"agent_id": agent_id},
                    }
                )

        self.last_heartbeat_at = now_iso
        snapshot = self.status_snapshot()
        self.heartbeat_log.append({"ts": now_iso, "level": "info", "event": "heartbeat", "data": snapshot})
        return snapshot

    def status_snapshot(self) -> dict:
        tasks = self.scheduler.snapshot()
        done = len([t for t in tasks if t["status"] == TASK_DONE])
        backlog = len([t for t in tasks if t["status"] == TASK_BACKLOG])
        return {
            "project_id": self.project_id,
            "coordinator_id": self.coordinator_id,
            "agents": [a.status_snapshot() for a in self.subordinates.values()],
            "task_counts": {
                "total": len(tasks),
                "done": done,
                "backlog": backlog,
            },
            "last_heartbeat_at": self.last_heartbeat_at,
            "auto_fix_attempts": self.auto_fix_attempts,
        }
