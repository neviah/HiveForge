from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentStepResult:
    """Standardized output for each loop phase."""

    phase: str
    summary: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentContext:
    """Mutable context that flows through OBSERVE->MEMORY phases."""

    agent_id: str
    role: str
    objective: str
    state: dict[str, Any] = field(default_factory=dict)
    memory: list[dict[str, Any]] = field(default_factory=list)
    plan: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    iterations: int = 0
    max_iterations: int = 8
    budget_remaining: float = 0.0
