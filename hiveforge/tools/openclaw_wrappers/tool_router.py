from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import importlib
import logging

logger = logging.getLogger(__name__)


@dataclass
class ToolRequest:
    """Tool execution request."""
    name: str  # Tool name: filesystem, browser, api, messaging, command
    operation: str  # Operation: read_file, fetch_url, etc.
    payload: dict[str, Any]  # Operation-specific arguments


class OpenClawToolRouter:
    """Single entrypoint for all tool calls (filesystem, browser, API, messaging, command)."""

    def __init__(self) -> None:
        self._tool_modules = {
            "filesystem": "hiveforge.tools.openclaw_wrappers.filesystem",
            "browser": "hiveforge.tools.openclaw_wrappers.browser",
            "api": "hiveforge.tools.openclaw_wrappers.api",
            "messaging": "hiveforge.tools.openclaw_wrappers.messaging",
            "command": "hiveforge.tools.openclaw_wrappers.command",
        }
        self._loaded_modules = {}

    def _load_module(self, tool_name: str):
        """Lazy-load a tool module."""
        if tool_name in self._loaded_modules:
            return self._loaded_modules[tool_name]
        
        module_path = self._tool_modules.get(tool_name)
        if not module_path:
            return None
        
        try:
            module = importlib.import_module(module_path)
            self._loaded_modules[tool_name] = module
            return module
        except ImportError as e:
            logger.error(f"Failed to load tool module {tool_name}: {e}")
            return None

    def route(self, tool_name: str, operation: str, **payload) -> dict[str, Any]:
        """Route a tool request to the appropriate handler.
        
        Args:
            tool_name: Tool to use (filesystem, browser, api, messaging, command)
            operation: Operation to perform (read_file, fetch_url, etc.)
            **payload: Operation-specific arguments
        
        Returns:
            Result dict with ok, message/error, and operation-specific fields
        
        Example:
            router = OpenClawToolRouter()
            result = router.route("filesystem", "read_file", path="main.py")
            result = router.route("browser", "fetch_url", url="https://example.com")
            result = router.route("messaging", "send_email", to="user@example.com", subject="Test", body="Body")
        """
        # Validate tool name
        if tool_name not in self._tool_modules:
            return {"ok": False, "error": f"Unknown tool '{tool_name}'. Available: {list(self._tool_modules.keys())}"}
        
        # Load tool module
        module = self._load_module(tool_name)
        if not module:
            return {"ok": False, "error": f"Failed to load tool '{tool_name}'"}
        
        # Execute operation
        try:
            result = module.execute(operation, **payload)
            return result
        except Exception as e:
            logger.error(f"Error executing {tool_name}.{operation}: {e}")
            return {"ok": False, "error": f"Tool execution failed: {e}"}

    def tools_available(self) -> list[str]:
        """List available tools."""
        return list(self._tool_modules.keys())

    # Convenience methods for common operations
    
    def read_file(self, path: str) -> dict[str, Any]:
        """Read a file."""
        return self.route("filesystem", "read_file", path=path)
    
    def write_file(self, path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
        """Write to a file."""
        return self.route("filesystem", "write_file", path=path, content=content, overwrite=overwrite)
    
    def edit_file(self, path: str, search: str, replace: str) -> dict[str, Any]:
        """Edit a file."""
        return self.route("filesystem", "edit_file", path=path, search=search, replace=replace)
    
    def list_directory(self, path: str = ".") -> dict[str, Any]:
        """List directory contents."""
        return self.route("filesystem", "list_directory", path=path)
    
    def fetch_url(self, url: str) -> dict[str, Any]:
        """Fetch a URL."""
        return self.route("browser", "fetch_url", url=url)
    
    def search_web(self, query: str, engine: str = "google") -> dict[str, Any]:
        """Search the web."""
        return self.route("browser", "search", query=query, engine=engine)
    
    def http_request(self, method: str, url: str, **kwargs) -> dict[str, Any]:
        """Make an HTTP request."""
        return self.route("api", "http_request", method=method, url=url, **kwargs)
    
    def send_email(self, to: str, subject: str, body: str) -> dict[str, Any]:
        """Send an email."""
        return self.route("messaging", "send_email", to=to, subject=subject, body=body)
    
    def send_slack(self, channel: str, message: str) -> dict[str, Any]:
        """Send a Slack message."""
        return self.route("messaging", "send_slack", channel=channel, message=message)
    
    def execute_command(self, command: str, cwd: str | None = None, timeout: int = 30) -> dict[str, Any]:
        """Execute a shell command."""
        return self.route("command", "execute", command=command, cwd=cwd, timeout=timeout)
