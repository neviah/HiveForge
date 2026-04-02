"""Designer specialist agent."""

from __future__ import annotations

from pathlib import Path

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.specialists.tool_execution import execute_tool_calls
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


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

_MARKETPLACE_UI_DESIGNER_PATH = (
    Path(__file__).resolve().parents[2]
    / "marketplace"
    / "agency_agents_upstream"
    / "design"
    / "design-ui-designer.md"
)


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            return parts[1]
    return text


def _load_marketplace_design_prompt() -> str:
    if not _MARKETPLACE_UI_DESIGNER_PATH.exists():
        return ""
    try:
        raw = _MARKETPLACE_UI_DESIGNER_PATH.read_text(encoding="utf-8")
        return _strip_frontmatter(raw).strip()[:5000]
    except Exception:
        return ""


MARKETPLACE_DESIGNER_PROMPT = _load_marketplace_design_prompt()
COMBINED_DESIGNER_SYSTEM_PROMPT = (
    DESIGNER_SYSTEM_PROMPT
    if not MARKETPLACE_DESIGNER_PROMPT
    else f"{DESIGNER_SYSTEM_PROMPT}\n\nReference playbook from marketplace UI Designer agent:\n{MARKETPLACE_DESIGNER_PROMPT}"
)


class DesignerAgent(HiveForgeAgent):
    """Specialist: UX/UI design, visual design, user research."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="DesignerAgent",
                role="designer",
                skills=["ux", "visual design", "accessibility"],
                hourly_cost=100.0,
                metadata={"system_prompt": COMBINED_DESIGNER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Designer task with LLM-assisted design planning."""
        loop_result = super().run_task(objective, state, budget)
        tool_results = execute_tool_calls(self.router, state, self.profile.role, self.profile.name)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Design task: {objective}

User context and requirements: {state}
Tool execution results: {tool_results}
Budget: ${budget}

Provide:
1. User research questions and approach
2. Key user personas and journeys
3. Wireframes and user flow outline
4. Visual design direction and guidelines
5. Accessibility and responsive design considerations
6. Interaction and animation strategy""",
                system_prompt=COMBINED_DESIGNER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "design_spec": llm_response,
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
