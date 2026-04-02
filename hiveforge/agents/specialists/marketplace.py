from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile
from hiveforge.agents.registry import DEFAULT_SPECIALISTS


def list_hireable_agents() -> list[AgentProfile]:
    return [agent for agent in DEFAULT_SPECIALISTS if agent.enabled]


def find_agent_by_role(role: str) -> AgentProfile | None:
    for agent in DEFAULT_SPECIALISTS:
        if agent.role == role and agent.enabled:
            return agent
    return None
