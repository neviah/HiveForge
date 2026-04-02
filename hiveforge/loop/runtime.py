from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .act import run_act
from .evaluate import run_evaluate
from .memory import run_memory
from .observe import run_observe
from .plan import run_plan
from .reflect import run_reflect
from .types import AgentContext


class AgentLoopRuntime:
    """Executes the standardized 6-phase loop for any agent role."""

    def run_once(self, context: AgentContext) -> dict[str, Any]:
        observed = run_observe(context)
        reflected = run_reflect(context, observed)
        planned = run_plan(context, reflected)
        acted = run_act(context, planned)
        evaluated = run_evaluate(context, acted)
        memorized = run_memory(context, evaluated)

        context.iterations += 1

        return {
            "observe": asdict(observed),
            "reflect": asdict(reflected),
            "plan": asdict(planned),
            "act": asdict(acted),
            "evaluate": asdict(evaluated),
            "memory": asdict(memorized),
        }

    def run_until_limit(self, context: AgentContext) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        while context.iterations < context.max_iterations:
            cycle = self.run_once(context)
            results.append(cycle)
            if not cycle["evaluate"]["data"].get("can_continue", True):
                break
        return results
