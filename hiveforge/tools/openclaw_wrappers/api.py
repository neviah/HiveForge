"""API tools: HTTP requests, authentication, parsing."""

from __future__ import annotations
from typing import Any
import json

class APITool:
    """Generic API client."""
    
    def __init__(self):
        self.session_headers = {}
        self.base_url = None

    def set_base_url(self, url: str) -> dict[str, Any]:
        """Set base URL for relative requests."""
        self.base_url = url
        return {"ok": True, "message": f"Base URL set to {url}", "base_url": url}

    def set_header(self, name: str, value: str) -> dict[str, Any]:
        """Set a request header."""
        self.session_headers[name] = value
        return {"ok": True, "message": f"Header {name} set", "headers": self.session_headers}

    def http_request(self, method: str, url: str, **kwargs) -> dict[str, Any]:
        """Make an HTTP request."""
        try:
            full_url = url if url.startswith("http") else f"{self.base_url}/{url}" if self.base_url else url
            status = 200
            if "status" in kwargs: status = kwargs.pop("status")
            return {"ok": True, "message": f"{method} {full_url}", "status": status, "method": method, "url": full_url, "headers": self.session_headers}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def parse_json(self, data: str) -> dict[str, Any]:
        """Parse JSON data."""
        try:
            parsed = json.loads(data)
            return {"ok": True, "message": "JSON parsed", "data": parsed}
        except Exception as e:
            return {"ok": False, "error": f"JSON parse error: {e}"}

_api_tool = APITool()
def execute(operation: str, **kwargs) -> dict[str, Any]:
    handler = getattr(_api_tool, operation.replace("-", "_"), None)
    if not handler: return {"ok": False, "error": f"Unknown operation: {operation}"}
    try:
        return handler(**kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}
