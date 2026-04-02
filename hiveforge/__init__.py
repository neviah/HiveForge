"""
HiveForge: Multi-agent operating system combining claw-code loop, OpenClaw tools, and agency-agents.

Key Components:
- AgentLoopRuntime: 6-phase loop (OBSERVE → REFLECT → PLAN → ACT → EVALUATE → MEMORY)
- ExecutiveAgent (CEO): Interprets goals, breaks work into tasks, hires specialists
- CoordinatorAgent: Routes tasks, enforces budgets, merges outputs
- ModelClient: Unified LLM interface (Anthropic, OpenAI, OpenRouter, Ollama, LM Studio)
- OpenClawToolRouter: Task execution engine (filesystem, browser, API, messaging, command)

Usage:
    from hiveforge import ExecutiveAgent, CoordinatorAgent, ModelClient
    
    ceo = ExecutiveAgent()
    result = ceo.run_task(objective="...", state={}, budget=100.0)
"""

from .agents.ceo import ExecutiveAgent
from .agents.coordinator import CoordinatorAgent  
from .loop import AgentLoopRuntime, AgentContext, AgentStepResult
from .tools import OpenClawToolRouter
from .models.inference import ModelProviderConfig, ModelClient, InferenceContext, get_provider_instance

__all__ = [
    "ExecutiveAgent",
    "CoordinatorAgent",
    "AgentLoopRuntime",
    "AgentContext",
    "AgentStepResult",
    "OpenClawToolRouter",
    "ModelProviderConfig",
    "ModelClient",
    "InferenceContext",
    "get_provider_instance",
]
