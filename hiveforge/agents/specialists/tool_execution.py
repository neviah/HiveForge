"""Shared tool execution helpers for specialist agents."""

from __future__ import annotations

from typing import Any

from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


def execute_tool_calls(router: OpenClawToolRouter, state: dict[str, Any]) -> list[dict[str, Any]]:
    """Execute structured tool calls from state and return execution records.

    Expected input shape in state:
        {
            "tool_calls": [
                {"tool": "filesystem", "operation": "write_file", "payload": {"path": "a.txt", "content": "x"}}
            ]
        }
    """
    calls = state.get("tool_calls", [])
    if not isinstance(calls, list):
        return [{"ok": False, "error": "state.tool_calls must be a list"}]

    records: list[dict[str, Any]] = []
    for index, call in enumerate(calls):
        if not isinstance(call, dict):
            records.append(
                {
                    "index": index,
                    "ok": False,
                    "error": "tool call must be a dict",
                }
            )
            continue

        tool = call.get("tool")
        operation = call.get("operation")
        payload = call.get("payload", {})

        if not isinstance(payload, dict):
            records.append(
                {
                    "index": index,
                    "tool": tool,
                    "operation": operation,
                    "ok": False,
                    "error": "payload must be a dict",
                }
            )
            continue

        if not tool or not operation:
            records.append(
                {
                    "index": index,
                    "tool": tool,
                    "operation": operation,
                    "ok": False,
                    "error": "tool and operation are required",
                }
            )
            continue

        try:
            result = router.route(tool_name=str(tool), operation=str(operation), **payload)
            records.append(
                {
                    "index": index,
                    "tool": str(tool),
                    "operation": str(operation),
                    "ok": bool(result.get("ok", False)),
                    "result": result,
                }
            )
        except Exception as exc:
            records.append(
                {
                    "index": index,
                    "tool": str(tool),
                    "operation": str(operation),
                    "ok": False,
                    "error": str(exc),
                }
            )

    return records
