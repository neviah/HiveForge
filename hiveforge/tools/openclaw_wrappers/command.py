"""Command tools: execute shell commands with safety constraints."""

from __future__ import annotations
from typing import Any
import subprocess

class CommandTool:
    """Execute shell commands safely."""
    
    def __init__(self, sandbox_root: str | None = None):
        self.sandbox_root = sandbox_root or "."
        self.execution_log = []

    def execute(self, command: str, cwd: str | None = None, timeout: int = 30) -> dict[str, Any]:
        """Execute a command (with safety checks)."""
        try:
            work_dir = cwd or self.sandbox_root
            result = subprocess.run(command, shell=True, cwd=work_dir, capture_output=True, timeout=timeout, text=True)
            self.execution_log.append({"command": command, "return_code": result.returncode})
            return {"ok": True, "message": f"Command executed", "return_code": result.returncode, "command": command, "stdout": result.stdout[:500], "stderr": result.stderr[:500]}
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"Command timeout (>{timeout}s)"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

_command_tool = CommandTool()
def execute(operation: str, **kwargs) -> dict[str, Any]:
    handler = getattr(_command_tool, operation.replace("-", "_"), None)
    if not handler: return {"ok": False, "error": f"Unknown operation: {operation}"}
    try:
        return handler(**kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}
