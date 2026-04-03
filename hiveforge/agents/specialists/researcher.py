"""Researcher specialist agent."""

from __future__ import annotations

from pathlib import Path

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.specialists.tool_execution import execute_tool_calls
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


RESEARCHER_SYSTEM_PROMPT = """You are ResearcherAgent, the specialist who discovers and validates information.

Your responsibilities:
1. **Investigate** — search, analyze, synthesize information from multiple sources
2. **Validate** — fact-check claims, verify sources, assess credibility
3. **Synthesize** — connect dots, identify patterns, draw insights
4. **Discover** — surface gaps in knowledge, identify alternatives
5. **Report** — present findings clearly with evidence and caveats
6. **Recommend** — suggest next steps based on research results

You are rigorous. You distinguish facts from opinions. You cite sources. You surface
uncertainty and limitations. You ask clarifying questions about what "true enough" means."""

_MARKETPLACE_TREND_RESEARCHER_PATH = (
    Path(__file__).resolve().parents[2]
    / "marketplace"
    / "agency_agents_upstream"
    / "product"
    / "product-trend-researcher.md"
)


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            return parts[1]
    return text


def _load_marketplace_researcher_prompt() -> str:
    if not _MARKETPLACE_TREND_RESEARCHER_PATH.exists():
        return ""
    try:
        raw = _MARKETPLACE_TREND_RESEARCHER_PATH.read_text(encoding="utf-8")
        return _strip_frontmatter(raw).strip()[:5000]
    except Exception:
        return ""


MARKETPLACE_RESEARCHER_PROMPT = _load_marketplace_researcher_prompt()
COMBINED_RESEARCHER_SYSTEM_PROMPT = (
    RESEARCHER_SYSTEM_PROMPT
    if not MARKETPLACE_RESEARCHER_PROMPT
    else f"{RESEARCHER_SYSTEM_PROMPT}\n\nReference playbook from marketplace Trend Researcher agent:\n{MARKETPLACE_RESEARCHER_PROMPT}"
)


class ResearcherAgent(HiveForgeAgent):
    """Specialist: Research, fact-finding, analysis, synthesis."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="ResearcherAgent",
                role="researcher",
                skills=["analysis", "fact_finding", "synthesis"],
                hourly_cost=80.0,
                metadata={"system_prompt": COMBINED_RESEARCHER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Researcher task with LLM-assisted investigation."""
        loop_result = super().run_task(objective, state, budget)
        tool_results = execute_tool_calls(self.router, state, self.profile.role, self.profile.name)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Research task: {objective}

Context and constraints: {state}
Tool execution results: {tool_results}
Budget: ${budget}

Provide:
1. Key questions to answer
2. Suggested research approach and sources
3. Preliminary findings and gaps
4. Confidence levels for each claim
5. Next steps for deeper investigation""",
                system_prompt=COMBINED_RESEARCHER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "research_report": llm_response,
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
