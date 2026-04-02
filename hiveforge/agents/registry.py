from __future__ import annotations

from hiveforge.agents.agent_base import AgentProfile


DEFAULT_SPECIALISTS: list[AgentProfile] = [
    AgentProfile("ProjectManagerAgent", "project_manager", ["planning", "risk"], 95.0),
    AgentProfile("DeveloperAgent", "developer", ["python", "integration"], 120.0),
    AgentProfile("ResearchAgent", "research", ["analysis", "fact_finding"], 80.0),
    AgentProfile("WriterAgent", "writer", ["docs", "communication"], 75.0),
    AgentProfile("AnalystAgent", "analyst", ["metrics", "forecasting"], 90.0),
    AgentProfile("CriticAgent", "critic", ["qa", "review"], 85.0),
    AgentProfile("DesignerAgent", "designer", ["ux", "visual_design"], 100.0),
]
