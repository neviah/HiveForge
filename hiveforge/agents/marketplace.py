"""Specialist marketplace with core agents on standby + lazy-loading for extended roles."""

from __future__ import annotations

from typing import Optional
import logging
from hiveforge.agents.agent_base import AgentProfile, HiveForgeAgent
from hiveforge.agents.registry import DEFAULT_SPECIALISTS

logger = logging.getLogger(__name__)


class SpecialistMarketplace:
    """
    Smart marketplace for hiring specialists.
    
    Strategy:
    - Core 7 agents (ProjectManager, Developer, Researcher, Writer, Analyst, Critic, Designer)
      are instantiated and kept on standby for fast access.
    - Extended agents (Marketing, Sales, DevOps, etc.) are lazy-loaded on first request.
    - Supports both core roles and extended roles from the agency-agents marketplace.
    """

    def __init__(self):
        """Initialize marketplace with core agents ready to go."""
        self.core_agents = self._instantiate_core_agents()
        self._extended_cache: dict[str, HiveForgeAgent] = {}
        self._lazy_load_map = self._build_extended_map()

    def _instantiate_core_agents(self) -> dict[str, HiveForgeAgent]:
        """Instantiate the 7 core specialists and keep them in memory."""
        from hiveforge.agents.specialists import (
            ProjectManagerAgent,
            DeveloperAgent,
            ResearcherAgent,
            WriterAgent,
            AnalystAgent,
            CriticAgent,
            DesignerAgent,
        )

        return {
            "project_manager": ProjectManagerAgent(),
            "developer": DeveloperAgent(),
            "researcher": ResearcherAgent(),
            "writer": WriterAgent(),
            "analyst": AnalystAgent(),
            "critic": CriticAgent(),
            "designer": DesignerAgent(),
        }

    def _build_extended_map(self) -> dict[str, type]:
        """Build a map of extended agent roles to their classes.
        
        This is a registry of less-common roles that are lazy-loaded on demand.
        In a full implementation, this would be auto-discovered from the 
        agency-agents/ directory.
        """
        # Placeholder for extended roles. In Phase 4+, these would be:
        # - Auto-discovered from hiveforge/third_party/agency-agents/
        # - Lazily instantiated on first hire() call
        # - Cached for subsequent calls
        return {
            # Will expand with:
            # "marketing_strategist": MarketingStrategistAgent,
            # "sales_director": SalesDirectorAgent,
            # "devops_engineer": DevOpsEngineer,
            # etc.
        }

    def hire(self, role: str) -> Optional[HiveForgeAgent]:
        """
        Hire a specialist by role.
        
        First checks core agents (instant), then checks extended (lazy-load).
        
        Args:
            role: Role name (e.g., "developer", "marketing_strategist")
        
        Returns:
            Agent instance or None if role not found
        
        Example:
            marketplace = SpecialistMarketplace()
            dev = marketplace.hire("developer")  # Instant (core)
            marketer = marketplace.hire("marketing_strategist")  # Lazy-loaded
        """
        # Check core agents first (instant)
        if role in self.core_agents:
            return self.core_agents[role]

        # Check extended agents (lazy-load)
        if role in self._extended_cache:
            return self._extended_cache[role]

        # Try to instantiate from extended map
        if role in self._lazy_load_map:
            agent_class = self._lazy_load_map[role]
            agent = agent_class()
            self._extended_cache[role] = agent
            logger.info(f"Lazy-loaded extended agent: {role}")
            return agent

        # Not found
        logger.warning(f"Agent role not found: {role}")
        return None

    def list_available_agents(self) -> dict[str, AgentProfile]:
        """List all available specialist profiles (core + extended)."""
        available = {}

        # Add core agents
        for role, agent in self.core_agents.items():
            available[role] = agent.profile

        # Add extended agents that have been loaded
        for role, agent in self._extended_cache.items():
            available[role] = agent.profile

        # Add extended agents not yet loaded (from registry)
        for profile in DEFAULT_SPECIALISTS:
            if profile.role not in available:
                available[profile.role] = profile

        return available

    def get_core_agents(self) -> dict[str, HiveForgeAgent]:
        """Get all core agents (always ready)."""
        return self.core_agents.copy()

    def get_loaded_extended_agents(self) -> dict[str, HiveForgeAgent]:
        """Get extended agents that have been lazy-loaded."""
        return self._extended_cache.copy()

    def register_extended_agent(self, role: str, agent_class: type) -> None:
        """Register an extended agent class for lazy-loading.
        
        Args:
            role: Role name
            agent_class: Class implementing HiveForgeAgent
        """
        self._lazy_load_map[role] = agent_class
        logger.info(f"Registered extended agent class: {role}")

    def warmup_agent(self, role: str) -> Optional[HiveForgeAgent]:
        """Pre-load an extended agent (move from lazy to warmup).
        
        Useful for warming up agents you know you'll need soon.
        
        Args:
            role: Role name
        
        Returns:
            Agent instance or None if not found
        """
        agent = self.hire(role)
        if agent:
            logger.info(f"Warmed up agent: {role}")
        return agent

    def warmup_multiple(self, roles: list[str]) -> dict[str, HiveForgeAgent]:
        """Pre-load multiple extended agents.
        
        Example:
            marketplace.warmup_multiple(["marketing_strategist", "sales_director"])
        """
        result = {}
        for role in roles:
            agent = self.warmup_agent(role)
            if agent:
                result[role] = agent
        return result

    def get_stats(self) -> dict:
        """Get marketplace statistics."""
        all_available = self.list_available_agents()
        loaded_extended = self.get_loaded_extended_agents()

        return {
            "core_agents": len(self.core_agents),
            "extended_registered": len(self._lazy_load_map),
            "extended_loaded": len(loaded_extended),
            "total_available": len(all_available),
            "core_roles": list(self.core_agents.keys()),
            "extended_loaded_roles": list(loaded_extended.keys()),
        }


# Singleton instance for global use
_marketplace_instance: Optional[SpecialistMarketplace] = None


def get_marketplace() -> SpecialistMarketplace:
    """Get the global marketplace instance (singleton)."""
    global _marketplace_instance
    if _marketplace_instance is None:
        _marketplace_instance = SpecialistMarketplace()
    return _marketplace_instance


def reset_marketplace() -> None:
    """Reset the global marketplace (useful for testing)."""
    global _marketplace_instance
    _marketplace_instance = None
