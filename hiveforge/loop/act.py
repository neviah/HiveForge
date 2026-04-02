from __future__ import annotations

from .types import AgentContext, AgentStepResult


def run_act(context: AgentContext, plan_result: AgentStepResult) -> AgentStepResult:
    actions = [{"task_id": item["id"], "action": "dispatch", "status": "queued"} for item in plan_result.data["plan"]]
    context.tool_results.extend(actions)
    return AgentStepResult(
        phase="ACT",
        summary="Queued tasks for execution via the tool layer.",
        data={"actions": actions},
    )
