"""
HiveForge: Multi-agent operating system combining claw-code loop, OpenClaw tools, and agency-agents.

Key Components:
- AgentLoopRuntime: 6-phase loop (OBSERVE → REFLECT → PLAN → ACT → EVALUATE → MEMORY)
- ExecutiveAgent (CEO): Interprets goals, breaks work into tasks, hires specialists
- CoordinatorAgent: Routes tasks, enforces budgets, merges outputs
- SpecialistMarketplace: Smart hiring of 7 core specialists + lazy-loading extended agents
- ModelClient: Unified LLM interface (Anthropic, OpenAI, OpenRouter, Ollama, LM Studio)
- OpenClawToolRouter: Task execution engine (filesystem, browser, API, messaging, command)

Usage:
    from hiveforge import ExecutiveAgent, CoordinatorAgent, ModelClient
    from hiveforge import get_marketplace
    
    # Simple: CEO with marketplace
    ceo = ExecutiveAgent()
    dev = ceo.hire_specialist("developer")
    
    # Advanced: Direct marketplace access
    marketplace = get_marketplace()
    all_stats = marketplace.get_stats()
"""

from .agents.ceo import ExecutiveAgent
from .agents.coordinator import CoordinatorAgent  
from .agents.marketplace import SpecialistMarketplace, get_marketplace, reset_marketplace
from .loop import AgentLoopRuntime, AgentContext, AgentStepResult
from .tools import OpenClawToolRouter
from .models.inference import ModelProviderConfig, ModelClient, InferenceContext, get_provider_instance
from .agents.specialists import (
    ProjectManagerAgent,
    DeveloperAgent,
    ResearcherAgent,
    WriterAgent,
    AnalystAgent,
    CriticAgent,
    DesignerAgent,
)

__all__ = [
    "ExecutiveAgent",
    "CoordinatorAgent",
    "SpecialistMarketplace",
    "get_marketplace",
    "reset_marketplace",
    "ProjectManagerAgent",
    "DeveloperAgent",
    "ResearcherAgent",
    "WriterAgent",
    "AnalystAgent",
    "CriticAgent",
    "DesignerAgent",
    "AgentLoopRuntime",
    "AgentContext",
    "AgentStepResult",
    "OpenClawToolRouter",
    "ModelProviderConfig",
    "ModelClient",
    "InferenceContext",
    "get_provider_instance",
]
