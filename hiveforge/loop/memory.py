from __future__ import annotations

from datetime import UTC, datetime

from .types import AgentContext, AgentStepResult


def run_memory(context: AgentContext, evaluation: AgentStepResult) -> AgentStepResult:
    memory_event = {
        "ts": datetime.now(UTC).isoformat(),
        "iteration": context.iterations,
        "evaluation": evaluation.data,
    }
    context.memory.append(memory_event)
    return AgentStepResult(
        phase="MEMORY",
        summary="Persisted iteration summary into agent memory.",
        data=memory_event,
    )
