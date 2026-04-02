from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient

COORDINATOR_SYSTEM_PROMPT = """You are CoordinatorAgent, the deterministic orchestration layer of HiveForge.

Your core rules:
1. **Receive tasks** — the CEO assigns you tasks to execute.
2. **Match specialists** — pick the best agent for each task based on skills and current load.
3. **Enforce limits** — no task retries beyond 3 attempts; no task exceeding its budget.
4. **Detect staleness** — if a task hasn't made progress in 2 turns, escalate to CEO.
5. **Merge outputs** — combine specialist results into a coherent deliverable.
6. **Update state** — log all transitions (backlog → ready → in_progress → review → done).
7. **Report back** — give the CEO concise status with metrics, blockers, and recommendations.

You are deterministic. You don't delegate without clear criteria. You fail fast and escalate early."""


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
        self.llm_client = ModelClient()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Coordinator task with LLM-assisted orchestration."""
        # Use the loop for structured analysis
        loop_result = super().run_task(objective, state, budget)

        # Call the LLM to generate orchestration plan
        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Task assignment: {objective}

Current specialists: Developer, ProjectManager, Researcher, Writer, Analyst, Critic, Designer
Budget remaining: {budget}

Provide:
1. Best specialist(s) for this task and why.
2. Recommended approach and timeline.
3. Any risks or immediate blockers.
4. Success criteria.""",
                system_prompt=COORDINATOR_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "llm_orchestration_plan": llm_response,
                "loop_result": loop_result,
                "budget_remaining": budget,
                "cost_estimate": self.profile.hourly_cost,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "error": str(e),
                "fallback_result": loop_result,
            }
