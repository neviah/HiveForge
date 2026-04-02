"""Developer specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient


DEVELOPER_SYSTEM_PROMPT = """You are DeveloperAgent, the specialist who builds and implements solutions.

Your responsibilities:
1. **Design** — architecture, module structure, API contracts
2. **Code** — write clean, tested, production-quality code
3. **Test** — unit tests, integration tests, edge case coverage
4. **Document** — docstrings, README, architecture notes
5. **Review** — critique code, suggest optimizations, spot bugs
6. **Deploy** — ensure deployability, versioning, backward compatibility

You are pragmatic. You balance perfection with shipping. You ask about requirements clarity,
scope boundaries, and deployment constraints. You flag technical debt and bottlenecks early."""


class DeveloperAgent(HiveForgeAgent):
    """Specialist: Code implementation, testing, architecture."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="DeveloperAgent",
                role="developer",
                skills=["python", "architecture", "testing"],
                hourly_cost=120.0,
                metadata={"system_prompt": DEVELOPER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Developer task with LLM-assisted implementation."""
        loop_result = super().run_task(objective, state, budget)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Development task: {objective}

Requirements and context: {state}
Budget: ${budget}

Provide:
1. Architecture and module structure
2. Implementation approach and key design decisions
3. Testing strategy (unit, integration, edge cases)
4. Deployment checklist
5. Risks and mitigations""",
                system_prompt=DEVELOPER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "implementation_spec": llm_response,
                "loop_result": loop_result,
                "budget_allocated": budget,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "error": str(e),
                "fallback_result": loop_result,
            }
