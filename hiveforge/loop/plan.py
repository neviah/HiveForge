from __future__ import annotations

from .types import AgentContext, AgentStepResult


def run_plan(context: AgentContext, reflection: AgentStepResult) -> AgentStepResult:
    if not context.plan:
        context.plan = [
            {"id": "t1", "title": "Break objective into executable tasks", "status": "ready"},
            {"id": "t2", "title": "Assign tasks to best-fit specialist", "status": "pending"},
            {"id": "t3", "title": "Evaluate outputs and update user", "status": "pending"},
        ]

    return AgentStepResult(
        phase="PLAN",
        summary="Prepared or reused the active task plan.",
        data={"plan": context.plan, "reflection": reflection.data},
    )
