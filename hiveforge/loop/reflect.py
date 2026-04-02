from __future__ import annotations

from .types import AgentContext, AgentStepResult


def run_reflect(context: AgentContext, observed: AgentStepResult) -> AgentStepResult:
    blockers = context.state.get("blockers", [])
    needs_clarification = bool(context.state.get("needs_user_input"))
    reflection = {
        "blockers": blockers,
        "needs_user_input": needs_clarification,
        "observation": observed.data,
    }
    return AgentStepResult(
        phase="REFLECT",
        summary="Reviewed blockers and clarification needs against current objective.",
        data=reflection,
    )
