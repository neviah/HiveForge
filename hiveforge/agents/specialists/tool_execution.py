"""Shared tool execution helpers for specialist agents."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
import time
from typing import Any

from hiveforge.telemetry import get_session_recorder
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter

_DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[2] / "config" / "tool_policy.json"
_DEFAULT_AUDIT_LOG_PATH = Path(__file__).resolve().parents[2] / "state" / "tool_audit.jsonl"
_POLICY_CACHE: dict[str, Any] | None = None
_RATE_WINDOWS: dict[str, deque[float]] = defaultdict(deque)
_LOCK = threading.Lock()


def _policy_path() -> Path:
    override = os.getenv("HIVEFORGE_TOOL_POLICY_PATH")
    return Path(override) if override else _DEFAULT_POLICY_PATH


def _audit_log_path() -> Path:
    override = os.getenv("HIVEFORGE_TOOL_AUDIT_PATH")
    return Path(override) if override else _DEFAULT_AUDIT_LOG_PATH


def _load_policy() -> dict[str, Any]:
    global _POLICY_CACHE
    if _POLICY_CACHE is not None:
        return _POLICY_CACHE

    path = _policy_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raw = {}
    except Exception:
        raw = {}

    _POLICY_CACHE = raw
    return raw


def _role_config(role: str) -> dict[str, Any]:
    roles = _load_policy().get("roles", {})
    if not isinstance(roles, dict):
        return {}
    config = roles.get(role, {})
    return config if isinstance(config, dict) else {}


def _allowed_ops(role: str, tool: str) -> set[str]:
    tools = _role_config(role).get("tools", {})
    if not isinstance(tools, dict):
        return set()
    ops = tools.get(tool, [])
    if not isinstance(ops, list):
        return set()
    return {str(op) for op in ops}


def _limits(role: str) -> dict[str, Any]:
    limits = _role_config(role).get("limits", {})
    return limits if isinstance(limits, dict) else {}


def _is_allowed(role: str, tool: str, operation: str) -> bool:
    return operation in _allowed_ops(role, tool)


def _audit(
    *,
    agent_name: str,
    role: str,
    index: int,
    tool: str,
    operation: str,
    decision: str,
    reason: str,
    ok: bool,
) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": agent_name,
        "role": role,
        "index": index,
        "tool": tool,
        "operation": operation,
        "decision": decision,
        "reason": reason,
        "ok": ok,
    }
    path = _audit_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=True) + "\n")
    get_session_recorder().record(
        event_type="tool_call",
        source="specialists.tool_execution",
        agent_id=agent_name,
        role=role,
        payload={
            "index": index,
            "tool": tool,
            "operation": operation,
            "decision": decision,
            "reason": reason,
            "ok": ok,
        },
    )


def _is_rate_limited(agent_name: str, role: str) -> bool:
    max_calls_per_minute = int(_limits(role).get("max_calls_per_minute", 0))
    if max_calls_per_minute <= 0:
        return False

    now = time.time()
    window = _RATE_WINDOWS[agent_name]
    with _LOCK:
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= max_calls_per_minute:
            return True
        window.append(now)
    return False


def _record_block(
    records: list[dict[str, Any]],
    *,
    index: int,
    tool: str,
    operation: str,
    error: str,
) -> None:
    records.append(
        {
            "index": index,
            "tool": tool,
            "operation": operation,
            "ok": False,
            "error": error,
        }
    )


def _max_calls_per_task(role: str) -> int:
    return int(_limits(role).get("max_calls_per_task", 0))


def _max_calls_per_tool(role: str) -> dict[str, int]:
    per_tool = _limits(role).get("max_calls_per_tool", {})
    if not isinstance(per_tool, dict):
        return {}
    return {str(k): int(v) for k, v in per_tool.items()}


def _reset_tool_execution_state_for_tests() -> None:
    """Testing helper to clear cached policy and rate windows."""
    global _POLICY_CACHE
    with _LOCK:
        _POLICY_CACHE = None
        _RATE_WINDOWS.clear()


def execute_tool_calls(
    router: OpenClawToolRouter,
    state: dict[str, Any],
    role: str,
    agent_name: str,
) -> list[dict[str, Any]]:
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

    max_calls = _max_calls_per_task(role)
    max_per_tool = _max_calls_per_tool(role)
    tool_counts: dict[str, int] = defaultdict(int)
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

        tool_text = str(tool) if tool else ""
        operation_text = str(operation) if operation else ""

        if not isinstance(payload, dict):
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error="payload must be a dict",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="invalid payload",
                ok=False,
            )
            continue

        if not tool or not operation:
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error="tool and operation are required",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="missing tool or operation",
                ok=False,
            )
            continue

        if max_calls > 0 and index >= max_calls:
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error=f"tool call budget exceeded for role '{role}'",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="max_calls_per_task",
                ok=False,
            )
            continue

        if max_per_tool.get(tool_text, 0) > 0 and tool_counts[tool_text] >= max_per_tool[tool_text]:
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error=f"tool call limit exceeded for '{tool_text}'",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="max_calls_per_tool",
                ok=False,
            )
            continue

        if _is_rate_limited(agent_name=agent_name, role=role):
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error=f"rate limit exceeded for role '{role}'",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="max_calls_per_minute",
                ok=False,
            )
            continue

        if not _is_allowed(role=role, tool=tool_text, operation=operation_text):
            _record_block(
                records,
                index=index,
                tool=tool_text,
                operation=operation_text,
                error=f"blocked by policy for role '{role}'",
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="blocked",
                reason="not in allowlist",
                ok=False,
            )
            continue

        try:
            result = router.route(tool_name=tool_text, operation=operation_text, **payload)
            tool_counts[tool_text] += 1
            records.append(
                {
                    "index": index,
                    "tool": tool_text,
                    "operation": operation_text,
                    "ok": bool(result.get("ok", False)),
                    "result": result,
                }
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="allowed",
                reason="executed",
                ok=bool(result.get("ok", False)),
            )
        except Exception as exc:
            records.append(
                {
                    "index": index,
                    "tool": tool_text,
                    "operation": operation_text,
                    "ok": False,
                    "error": str(exc),
                }
            )
            _audit(
                agent_name=agent_name,
                role=role,
                index=index,
                tool=tool_text,
                operation=operation_text,
                decision="error",
                reason=str(exc),
                ok=False,
            )

    return records
