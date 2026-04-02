from __future__ import annotations

import sys
from pathlib import Path

# Add claw-code upstream to path for imports
upstream_root = Path(__file__).parent.parent / "claw_code_upstream"
if str(upstream_root) not in sys.path:
    sys.path.insert(0, str(upstream_root))


def get_claw_code_runtime():
    """Load the claw-code QueryEnginePort as the canonical runtime."""
    from src.query_engine import QueryEnginePort
    return QueryEnginePort.from_workspace()


__all__ = ["get_claw_code_runtime"]
