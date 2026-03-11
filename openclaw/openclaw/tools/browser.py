import re
from typing import Any

import requests


class BrowserTool:
    def fetch(self, url: str, timeout: int = 15, max_chars: int = 4000) -> dict[str, Any]:
        response = requests.get(url, timeout=timeout, headers={"User-Agent": "HiveForge BrowserTool"}, verify=False)
        body = response.text or ""
        title_match = re.search(r"<title>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else ""
        snippet = body[:max_chars]

        return {
            "url": url,
            "status": response.status_code,
            "title": title,
            "content_preview": snippet,
            "content_length": len(body),
        }

    def run(self, action: str, url: str, timeout: int = 15, max_chars: int = 4000, **_: Any):
        if action == "fetch":
            return self.fetch(url=url, timeout=timeout, max_chars=max_chars)
        raise ValueError("Unsupported browser action")
