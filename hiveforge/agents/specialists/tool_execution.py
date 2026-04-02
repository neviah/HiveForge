"""Shared tool execution helpers for specialist agents."""

from __future__ import annotations

from typing import Any

from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


# Role-based allowlist for tool execution. Any (tool, operation) pair not listed
# for a role is denied by default.
ROLE_TOOL_POLICY: dict[str, dict[str, set[str]]] = {
    "project_manager": {
        "filesystem": {"read_file", "write_file", "edit_file", "list_directory"},
        "messaging": {"send_email", "send_slack"},
        "api": {"http_request"},
    },
    "developer": {
        "filesystem": {"read_file", "write_file", "edit_file", "list_directory", "create_directory"},
        "command": {"execute"},
        "api": {"http_request"},
        "browser": {"fetch_url", "search"},
    },
    "researcher": {
        "browser": {"fetch_url", "search"},
        "api": {"http_request", "parse_json"},
        "filesystem": {"read_file", "write_file", "list_directory"},
    },
    "writer": {
        "filesystem": {"read_file", "write_file", "edit_file", "list_directory"},
        "browser": {"fetch_url", "search"},
    },
    "analyst": {
        "filesystem": {"read_file", "write_file", "edit_file", "list_directory"},
        "api": {"http_request", "parse_json"},
        "browser": {"fetch_url", "search"},
    },
    "critic": {
        "filesystem": {"read_file", "list_directory"},
        "browser": {"fetch_url", "search"},
        "api": {"http_request"},
    },
    "designer": {
        "filesystem": {"read_file", "write_file", "edit_file", "list_directory"},
        "browser": {"fetch_url", "search", "screenshot"},
    },
}


def _is_allowed(role: str, tool: str, operation: str) -> bool:
    role_policy = ROLE_TOOL_POLICY.get(role, {})
    allowed_ops = role_policy.get(tool, set())
    return operation in allowed_ops


def execute_tool_calls(router: OpenClawToolRouter, state: dict[str, Any], role: str) -> list[dict[str, Any]]:
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

        if not _is_allowed(role=role, tool=str(tool), operation=str(operation)):
            records.append(
                {
                    "index": index,
                    "tool": str(tool),
                    "operation": str(operation),
                    "ok": False,
                    "error": f"blocked by policy for role '{role}'",
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
