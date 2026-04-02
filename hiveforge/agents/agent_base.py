from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from hiveforge.loop import AgentContext, AgentLoopRuntime
from hiveforge.telemetry import get_session_recorder


@dataclass
class AgentProfile:
    name: str
    role: str
    skills: list[str]
    hourly_cost: float
    enabled: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


class HiveForgeAgent:
    """Base class for CEO, Coordinator, and specialists."""

    def __init__(self, profile: AgentProfile, runtime: AgentLoopRuntime | None = None) -> None:
        self.profile = profile
        self.runtime = runtime or AgentLoopRuntime()

    def run_task(self, objective: str, state: dict[str, Any], budget: float) -> dict[str, Any]:
        recorder = get_session_recorder()
        recorder.record(
            event_type="task_start",
            source="agent_base.run_task",
            agent_id=self.profile.name,
            role=self.profile.role,
            objective=objective,
            payload={"budget": budget, "state_keys": sorted(state.keys())},
        )

        context = AgentContext(
            agent_id=self.profile.name,
            role=self.profile.role,
            objective=objective,
            state=state,
            budget_remaining=budget,
        )
        result = {
            "agent": self.profile.name,
            "role": self.profile.role,
            "result": self.runtime.run_once(context),
            "cost_estimate": self.profile.hourly_cost,
        }
        recorder.record(
            event_type="task_end",
            source="agent_base.run_task",
            agent_id=self.profile.name,
            role=self.profile.role,
            objective=objective,
            payload={"iterations": context.iterations, "cost_estimate": self.profile.hourly_cost},
        )
        return result
