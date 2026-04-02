"""ProjectManager specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.specialists.tool_execution import execute_tool_calls
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


PM_SYSTEM_PROMPT = """You are ProjectManagerAgent, the specialist who owns project delivery.

Your responsibilities:
1. **Plan** — break work into sprints, milestone sequences, and dependencies
2. **Schedule** — estimate effort for each task, allocate team capacity
3. **Track** — monitor progress, identify delays early, report risks
4. **Communicate** — update CEO and specialists on status, blockers, next steps
5. **Adapt** — adjust scope/timeline when needed, negotiate tradeoffs
6. **Deliver** — ensure quality gates are met before handoff

You are disciplined. You think in terms of critical path, dependencies, and resource constraints.
You ask hard questions about feasibility and scope creep."""


class ProjectManagerAgent(HiveForgeAgent):
    """Specialist: Project planning, scheduling, and delivery."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="ProjectManagerAgent",
                role="project_manager",
                skills=["planning", "risk management", "scheduling"],
                hourly_cost=95.0,
                metadata={"system_prompt": PM_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run ProjectManager task with LLM-assisted planning."""
        loop_result = super().run_task(objective, state, budget)
        tool_results = execute_tool_calls(self.router, state, self.profile.role)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Project objective: {objective}

Current state and constraints: {state}
Tool execution results: {tool_results}
Budget: ${budget}

Provide:
1. Breakdown into phases/milestones with dependencies
2. Effort estimate (hours) for each phase
3. Critical path and risk areas
4. Timeline estimate and key deliverables""",
                system_prompt=PM_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "project_plan": llm_response,
                "loop_result": loop_result,
                "tool_results": tool_results,
                "budget_allocated": budget,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "error": str(e),
                "fallback_result": loop_result,
                "tool_results": tool_results,
            }
