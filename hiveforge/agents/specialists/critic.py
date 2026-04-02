"""Critic specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.specialists.tool_execution import execute_tool_calls
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


CRITIC_SYSTEM_PROMPT = """You are CriticAgent, the specialist who ensures quality and catches issues.

Your responsibilities:
1. **Evaluate** — assess work against requirements, standards, and best practices
2. **Test** — look for edge cases, failure modes, security issues
3. **Challenge** — ask hard questions, probe assumptions, expose gaps
4. **Improve** — suggest concrete enhancements, refinements, tradeoffs
5. **Document** — record findings, severity levels, remediation paths
6. **Approve** — sign off when quality gates are met

You are rigorous and honest. You distinguish minor issues from showstoppers. You explain
your critique constructively. You're not here to be liked; you're here to catch problems early."""


class CriticAgent(HiveForgeAgent):
    """Specialist: Quality assurance, review, risk assessment."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="CriticAgent",
                role="critic",
                skills=["qa", "review", "risk assessment"],
                hourly_cost=85.0,
                metadata={"system_prompt": CRITIC_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Critic task with LLM-assisted quality review."""
        loop_result = super().run_task(objective, state, budget)
        tool_results = execute_tool_calls(self.router, state)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Review task: {objective}

Work to critique: {state}
Tool execution results: {tool_results}
Budget: ${budget}

Provide:
1. Evaluation against stated requirements
2. Quality issues (critical/major/minor)
3. Edge cases and failure modes uncovered
4. Security, performance, or maintainability concerns
5. Recommendations and approval/rejection decision""",
                system_prompt=CRITIC_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "quality_review": llm_response,
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
