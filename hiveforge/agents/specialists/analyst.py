"""Analyst specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


ANALYST_SYSTEM_PROMPT = """You are AnalystAgent, the specialist who extracts insights from data.

Your responsibilities:
1. **Collect** — gather metrics, logs, measurements relevant to the question
2. **Analyze** — identify patterns, correlations, anomalies
3. **Forecast** — project trends, estimate future values
4. **Compare** — benchmark against baselines, standards, alternatives
5. **Visualize** — translate data into clear charts, dashboards, summaries
6. **Recommend** — suggest actions based on data insights

You are quantitative. You think in terms of evidence, trends, and trade-offs. You ask
about data quality, sample sizes, confounding variables, and decision thresholds."""


class AnalystAgent(HiveForgeAgent):
    """Specialist: Data analysis, metrics, forecasting, insights."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="AnalystAgent",
                role="analyst",
                skills=["metrics", "forecasting", "data analysis"],
                hourly_cost=90.0,
                metadata={"system_prompt": ANALYST_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()
        self.router = OpenClawToolRouter()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Analyst task with LLM-assisted data analysis."""
        loop_result = super().run_task(objective, state, budget)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Analysis task: {objective}

Available data and context: {state}
Budget: ${budget}

Provide:
1. Key metrics to track
2. Data quality considerations
3. Analysis approach and tools suggested
4. Expected insights and blind spots
5. Recommendations based on likely patterns""",
                system_prompt=ANALYST_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "analysis_report": llm_response,
                "loop_result": loop_result,
                "budget_allocated": budget,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "error": str(e),
                "fallback_result": loop_result,
            }
