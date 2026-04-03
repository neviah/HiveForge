"""Writer specialist agent."""

from __future__ import annotations

from pathlib import Path

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.specialists.tool_execution import execute_tool_calls
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


WRITER_SYSTEM_PROMPT = """You are WriterAgent, the specialist who creates and refines content.

Your responsibilities:
1. **Create** — write clear, engaging, on-brand content
2. **Adapt** — match tone, audience, and format requirements
3. **Structure** — organize ideas logically, use hierarchy effectively
4. **Edit** — refine for clarity, conciseness, impact
5. **Proofread** — catch grammar, spelling, consistency issues
6. **Collaborate** — incorporate feedback, iterate quickly

You are precise. You think about audience, intent, and impact. You ask about tone, 
length limits, key messages, and success criteria. You notice ambiguity and flag it."""

_MARKETPLACE_CONTENT_CREATOR_PATH = (
    Path(__file__).resolve().parents[2]
    / "marketplace"
    / "agency_agents_upstream"
    / "marketing"
    / "marketing-content-creator.md"
)


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            return parts[1]
    return text


def _load_marketplace_writer_prompt() -> str:
    if not _MARKETPLACE_CONTENT_CREATOR_PATH.exists():
        return ""
    try:
        raw = _MARKETPLACE_CONTENT_CREATOR_PATH.read_text(encoding="utf-8")
        return _strip_frontmatter(raw).strip()[:5000]
    except Exception:
        return ""


MARKETPLACE_WRITER_PROMPT = _load_marketplace_writer_prompt()
COMBINED_WRITER_SYSTEM_PROMPT = (
    WRITER_SYSTEM_PROMPT
    if not MARKETPLACE_WRITER_PROMPT
    else f"{WRITER_SYSTEM_PROMPT}\n\nReference playbook from marketplace Content Creator agent:\n{MARKETPLACE_WRITER_PROMPT}"
)


class WriterAgent(HiveForgeAgent):
    """Specialist: Content creation, documentation, communication."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="WriterAgent",
                role="writer",
                skills=["content creation", "documentation", "editing"],
                hourly_cost=75.0,
                metadata={"system_prompt": COMBINED_WRITER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Writer task with LLM-assisted content creation."""
        loop_result = super().run_task(objective, state, budget)
        tool_results = execute_tool_calls(self.router, state, self.profile.role, self.profile.name)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Writing task: {objective}

Context and requirements: {state}
Tool execution results: {tool_results}
Budget: ${budget}

Provide:
1. Content outline and structure
2. Tone and voice guidance
3. Key messages and themes
4. Target audience and format
5. Draft content with editing notes""",
                system_prompt=COMBINED_WRITER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "content_draft": llm_response,
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
