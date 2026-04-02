from __future__ import annotations

from .types import AgentContext, AgentStepResult


def run_observe(context: AgentContext) -> AgentStepResult:
    observations = {
        "objective": context.objective,
        "iterations": context.iterations,
        "state_keys": sorted(context.state.keys()),
        "budget_remaining": context.budget_remaining,
    }
    return AgentStepResult(
        phase="OBSERVE",
        summary="Captured current objective, state footprint, and budget status.",
        data=observations,
    )
