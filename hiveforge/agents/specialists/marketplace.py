from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile
from hiveforge.agents.registry import DEFAULT_SPECIALISTS
from hiveforge.agents.specialists.project_manager import ProjectManagerAgent
from hiveforge.agents.specialists.developer import DeveloperAgent
from hiveforge.agents.specialists.researcher import ResearcherAgent
from hiveforge.agents.specialists.writer import WriterAgent
from hiveforge.agents.specialists.analyst import AnalystAgent
from hiveforge.agents.specialists.critic import CriticAgent
from hiveforge.agents.specialists.designer import DesignerAgent


SPECIALIST_CLASSES = {
    "project_manager": ProjectManagerAgent,
    "developer": DeveloperAgent,
    "researcher": ResearcherAgent,
    "writer": WriterAgent,
    "analyst": AnalystAgent,
    "critic": CriticAgent,
    "designer": DesignerAgent,
}


def list_hireable_agents() -> list[AgentProfile]:
    return [agent for agent in DEFAULT_SPECIALISTS if agent.enabled]


def find_agent_by_role(role: str) -> AgentProfile | None:
    for agent in DEFAULT_SPECIALISTS:
        if agent.role == role and agent.enabled:
            return agent
    return None


def instantiate_specialist(role: str):
    """Instantiate a specialist agent by role.
    
    Args:
        role: The role string (e.g., "developer", "researcher")
    
    Returns:
        Agent instance or None if role not found
    
    Example:
        developer = instantiate_specialist("developer")
        result = developer.run_task("Build REST API", {}, 100.0)
    """
    agent_class = SPECIALIST_CLASSES.get(role)
    if agent_class is None:
        raise ValueError(f"Unknown specialist role: {role}")
    return agent_class()


def instantiate_all_specialists() -> dict[str, object]:
    """Instantiate all available specialists ready for deployment.
    
    Returns:
        Dictionary mapping role names to agent instances
    
    Example:
        all_agents = instantiate_all_specialists()
        all_agents["developer"].run_task(...)
    """
    return {role: instantiate_specialist(role) for role in SPECIALIST_CLASSES.keys()}
