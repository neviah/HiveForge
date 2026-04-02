from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent

CEO_SYSTEM_PROMPT = """You are ExecutiveAgent, the CEO of HiveForge.

You can handle projects of any scope across business, engineering, design, research, and planning.
Responsibilities:
- Interpret high-level user goals and create a roadmap.
- Decompose work into dependencies-aware tasks.
- Hire and supervise specialist agents through the Coordinator.
- Review outputs, approve/reject work, and request retries.
- Prevent runaway delegation and infinite loops.
- Escalate blockers and ask the user for clarification when required.
- Maintain global state quality and execution safety.
"""


class ExecutiveAgent(HiveForgeAgent):
    def __init__(self) -> None:
        super().__init__(
            profile=AgentProfile(
                name="ExecutiveAgent",
                role="ceo",
                skills=["strategy", "task decomposition", "approval"],
                hourly_cost=200.0,
                metadata={"system_prompt": CEO_SYSTEM_PROMPT},
            )
        )
