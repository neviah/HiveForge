"""
HiveForge: Multi-agent operating system combining claw-code loop, OpenClaw tools, and agency-agents.

Key Components:
- AgentLoopRuntime: 6-phase loop (OBSERVE → REFLECT → PLAN → ACT → EVALUATE → MEMORY)
- ExecutiveAgent (CEO): Interprets goals, breaks work into tasks, hires specialists
- CoordinatorAgent: Routes tasks, enforces budgets, merges outputs
- 7 Specialist Agents: ProjectManager, Developer, Researcher, Writer, Analyst, Critic, Designer
- ModelClient: Unified LLM interface (Anthropic, OpenAI, OpenRouter, Ollama, LM Studio)
- OpenClawToolRouter: Task execution engine (filesystem, browser, API, messaging, command)

Usage:
    from hiveforge import ExecutiveAgent, CoordinatorAgent, ModelClient
    from hiveforge.agents.specialists import DeveloperAgent, ProjectManagerAgent
    from hiveforge.agents.specialists.marketplace import instantiate_all_specialists
    
    # Simple: hire one specialist
    developer = DeveloperAgent()
    
    # Advanced: instantiate all specialists on standby
    all_agents = instantiate_all_specialists()
    developer = all_agents["developer"]
"""

from .agents.ceo import ExecutiveAgent
from .agents.coordinator import CoordinatorAgent  
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
