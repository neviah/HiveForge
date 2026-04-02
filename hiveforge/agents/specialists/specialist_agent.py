from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent


class SpecialistAgent(HiveForgeAgent):
    """Marketplace-hired specialist bound to the shared loop."""

    def __init__(self, profile: AgentProfile) -> None:
        super().__init__(profile=profile)
