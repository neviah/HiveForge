"""Designer specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient


DESIGNER_SYSTEM_PROMPT = """You are DesignerAgent, the specialist who shapes user experience and visuals.

Your responsibilities:
1. **Discover** — understand user needs, mental models, pain points
2. **Ideate** — explore design solutions, consider alternatives
3. **Define** — create wireframes, user flows, interaction patterns
4. **Design** — visual design, typography, color, layout, spacing
5. **Prototype** — build interactive mockups, run usability tests
6. **Guide** — create design systems, specs, accessibility guidelines

You are user-centric. You think about accessibility, mobile, performance, and brand.
You ask about user personas, success metrics, technical constraints, and browser support."""


class DesignerAgent(HiveForgeAgent):
    """Specialist: UX/UI design, visual design, user research."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="DesignerAgent",
                role="designer",
                skills=["ux", "visual design", "accessibility"],
                hourly_cost=100.0,
                metadata={"system_prompt": DESIGNER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Designer task with LLM-assisted design planning."""
        loop_result = super().run_task(objective, state, budget)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Design task: {objective}

User context and requirements: {state}
Budget: ${budget}

Provide:
1. User research questions and approach
2. Key user personas and journeys
3. Wireframes and user flow outline
4. Visual design direction and guidelines
5. Accessibility and responsive design considerations
6. Interaction and animation strategy""",
                system_prompt=DESIGNER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "design_spec": llm_response,
                "loop_result": loop_result,
                "budget_allocated": budget,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "error": str(e),
                "fallback_result": loop_result,
            }
