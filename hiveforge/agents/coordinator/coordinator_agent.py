from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent

COORDINATOR_SYSTEM_PROMPT = """You are CoordinatorAgent, the deterministic orchestration layer of HiveForge.

Rules:
- Receive tasks from CEO and pick the best specialist agent.
- Enforce hard limits for retries, budget, and execution time.
- Detect stalled tasks and trigger bounded retries.
- Merge specialist outputs into coherent deliverables.
- Update Kanban/task state and log every transition.
- Avoid infinite delegation loops and duplicate assignments.
- Report concise status and escalations back to CEO.
"""


class CoordinatorAgent(HiveForgeAgent):
    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="CoordinatorAgent",
                role="coordinator",
                skills=["orchestration", "budgeting", "retry control"],
                hourly_cost=150.0,
                metadata={"system_prompt": COORDINATOR_SYSTEM_PROMPT},
            )
        )
