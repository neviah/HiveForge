from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from hiveforge.loop import AgentContext, AgentLoopRuntime


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
        context = AgentContext(
            agent_id=self.profile.name,
            role=self.profile.role,
            objective=objective,
            state=state,
            budget_remaining=budget,
        )
        return {
            "agent": self.profile.name,
            "role": self.profile.role,
            "result": self.runtime.run_once(context),
            "cost_estimate": self.profile.hourly_cost,
        }
