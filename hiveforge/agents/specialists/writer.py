"""Writer specialist agent."""

from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient


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


class WriterAgent(HiveForgeAgent):
    """Specialist: Content creation, documentation, communication."""

    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="WriterAgent",
                role="writer",
                skills=["content creation", "documentation", "editing"],
                hourly_cost=75.0,
                metadata={"system_prompt": WRITER_SYSTEM_PROMPT},
            )
        )
        self.llm_client = ModelClient()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run Writer task with LLM-assisted content creation."""
        loop_result = super().run_task(objective, state, budget)

        try:
            llm_response = self.llm_client.infer(
                prompt=f"""Writing task: {objective}

Context and requirements: {state}
Budget: ${budget}

Provide:
1. Content outline and structure
2. Tone and voice guidance
3. Key messages and themes
4. Target audience and format
5. Draft content with editing notes""",
                system_prompt=WRITER_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "content_draft": llm_response,
                "loop_result": loop_result,
                "budget_allocated": budget,
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "error": str(e),
                "fallback_result": loop_result,
            }
