from __future__ import annotations

from dataclasses import asdict
from typing import Any

from hiveforge.telemetry import get_session_recorder

from .act import run_act
from .evaluate import run_evaluate
from .memory import run_memory
from .observe import run_observe
from .plan import run_plan
from .reflect import run_reflect
from .types import AgentContext


class AgentLoopRuntime:
    """Executes the standardized 6-phase loop for any agent role."""

    @staticmethod
    def _record_phase(context: AgentContext, phase_name: str, result: dict[str, Any]) -> None:
        get_session_recorder().record(
            event_type="loop_phase",
            source="loop.runtime",
            agent_id=context.agent_id,
            role=context.role,
            objective=context.objective,
            payload={
                "phase": phase_name,
                "iteration": context.iterations,
                "summary": result.get("summary", ""),
            },
        )

    def run_once(self, context: AgentContext) -> dict[str, Any]:
        observed = run_observe(context)
        self._record_phase(context, "observe", asdict(observed))
        reflected = run_reflect(context, observed)
        self._record_phase(context, "reflect", asdict(reflected))
        planned = run_plan(context, reflected)
        self._record_phase(context, "plan", asdict(planned))
        acted = run_act(context, planned)
        self._record_phase(context, "act", asdict(acted))
        evaluated = run_evaluate(context, acted)
        self._record_phase(context, "evaluate", asdict(evaluated))
        memorized = run_memory(context, evaluated)
        self._record_phase(context, "memory", asdict(memorized))

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
