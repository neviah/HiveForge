from __future__ import annotations

from .types import AgentContext, AgentStepResult


def run_evaluate(context: AgentContext, act_result: AgentStepResult) -> AgentStepResult:
    completed = [a for a in act_result.data.get("actions", []) if a["status"] in {"done", "queued"}]
    stalled = [a for a in act_result.data.get("actions", []) if a["status"] == "stalled"]
    return AgentStepResult(
        phase="EVALUATE",
        summary="Checked action progress and flagged stalled work.",
        data={"completed": completed, "stalled": stalled, "can_continue": len(stalled) == 0},
    )
