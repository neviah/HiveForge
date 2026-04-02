from __future__ import annotations

from hiveforge.agents.ceo import ExecutiveAgent
from hiveforge.agents.coordinator import CoordinatorAgent


def bootstrap() -> dict:
    ceo = ExecutiveAgent()
    coordinator = CoordinatorAgent()

    goal = "Initialize HiveForge clean-room runtime"
    ceo_result = ceo.run_task(goal, state={"project": "HiveForge"}, budget=1000.0)
    coordinator_result = coordinator.run_task(goal, state={"handoff": "ceo"}, budget=700.0)

    return {
        "ceo": ceo_result,
        "coordinator": coordinator_result,
    }


if __name__ == "__main__":
    print(bootstrap())
