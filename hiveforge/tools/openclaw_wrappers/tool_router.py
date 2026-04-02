from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ToolRequest:
    name: str
    payload: dict[str, Any]


class OpenClawToolRouter:
    """Single entrypoint for all OpenClaw-backed tool calls."""

    def __init__(self) -> None:
        self._registry = {
            "filesystem": "hiveforge.tools.openclaw_wrappers.filesystem",
            "browser": "hiveforge.tools.openclaw_wrappers.browser",
            "api": "hiveforge.tools.openclaw_wrappers.api",
            "messaging": "hiveforge.tools.openclaw_wrappers.messaging",
            "command": "hiveforge.tools.openclaw_wrappers.command",
        }

    def route(self, request: ToolRequest) -> dict[str, Any]:
        module_name = self._registry.get(request.name)
        if not module_name:
            return {"ok": False, "error": f"Unknown tool '{request.name}'"}
        return {
            "ok": True,
            "tool": request.name,
            "module": module_name,
            "payload": request.payload,
            "status": "placeholder",
        }
