from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.models.inference import ModelClient
from hiveforge.agents.marketplace import get_marketplace

CEO_SYSTEM_PROMPT = """You are ExecutiveAgent, the CEO of HiveForge, a multi-agent operating system.

You can handle projects of any scope across business, engineering, design, research, and planning.
Your responsibilities:
1. **Interpret Goals** — understand high-level user objectives and break them into actionable elements.
2. **Plan** — create a roadmap with dependencies, risks, and success criteria.
3. **Hire Specialists** — select the best agent(s) from the marketplace (ProjectManager, Developer, Researcher, Writer, Analyst, Critic, Designer, and more as needed).
4. **Delegate** — break work into executable tasks and assign to the Coordinator.
5. **Review** — check specialist outputs for quality, completeness, and alignment with goals.
6. **Escalate** — when blockers aren't solvable, ask the user for clarification.
7. **Maintain Safety** — prevent infinite loops, enforce budgets, and keep state consistent.

Your decisions are final. Be decisive. Think step-by-step about each project.
You have access to a marketplace of specialist agents. Hire specialists based on task requirements."""


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
        self.llm_client = ModelClient()
        self.marketplace = get_marketplace()

    def run_task(self, objective: str, state: dict, budget: float) -> dict:
        """Run CEO task with actual LLM inference."""
        # First, use the loop to structure the thinking
        loop_result = super().run_task(objective, state, budget)

        # Then, call the LLM to generate CEO-level reasoning
        try:
            # Get available specialists for context
            available_agents = self.marketplace.list_available_agents()
            agent_list = ", ".join(f"{role} ({agent.skills})" for role, agent in available_agents.items())

            llm_response = self.llm_client.infer(
                prompt=f"""Objective: {objective}

Current state: {state}
Available specialists: {agent_list}

Based on this objective and state, provide:
1. Your analysis of the project
2. Breakdown into concrete tasks
3. Specialist agent recommendations (roles and why each is needed)
4. Critical path and timeline estimates
5. Budget allocation across tasks""",
                system_prompt=CEO_SYSTEM_PROMPT,
            )

            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "objective": objective,
                "llm_analysis": llm_response,
                "loop_result": loop_result,
                "budget_used": budget,
                "cost_estimate": self.profile.hourly_cost,
                "marketplace_stats": self.marketplace.get_stats(),
            }
        except Exception as e:
            return {
                "agent": self.profile.name,
                "role": self.profile.role,
                "error": str(e),
                "fallback_result": loop_result,
            }

    def hire_specialist(self, role: str):
        """Hire a specialist from the marketplace.
        
        Args:
            role: Role name (e.g., "developer", "researcher", "marketing_strategist")
        
        Returns:
            Agent instance or None if role not found
        
        Example:
            dev = ceo.hire_specialist("developer")
            result = dev.run_task("Build API", {}, 100.0)
        """
        return self.marketplace.hire(role)
