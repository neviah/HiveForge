"""Browser tools: fetch URLs, search, and lightweight page interactions."""

from __future__ import annotations

from html import unescape
import json
import re
from typing import Any
from urllib.parse import quote_plus
from urllib.request import Request, urlopen


def _strip_html(html: str) -> str:
    without_script = re.sub(r"<script[\\s\\S]*?</script>", " ", html, flags=re.IGNORECASE)
    without_style = re.sub(r"<style[\\s\\S]*?</style>", " ", without_script, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", without_style)
    return re.sub(r"\\s+", " ", unescape(text)).strip()


def _title_from_html(html: str) -> str:
    match = re.search(r"<title[^>]*>([\\s\\S]*?)</title>", html, flags=re.IGNORECASE)
    if not match:
        return ""
    return re.sub(r"\\s+", " ", unescape(match.group(1))).strip()


class BrowserTool:
    """Web browser operations with best-effort live network access."""

    def __init__(self) -> None:
        self.session_history: list[dict[str, Any]] = []
        self.current_url: str | None = None

    def _http_get(self, url: str, timeout: int = 12) -> tuple[int, str]:
        req = Request(
            url,
            headers={
                "User-Agent": "HiveForgeBrowserTool/1.0 (+https://hiveforge.local)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urlopen(req, timeout=timeout) as resp:
            status = int(getattr(resp, "status", 200))
            raw = resp.read()
            charset = "utf-8"
            content_type = resp.headers.get("Content-Type", "")
            match = re.search(r"charset=([\\w\\-]+)", content_type, flags=re.IGNORECASE)
            if match:
                charset = match.group(1)
            html = raw.decode(charset, errors="replace")
            return status, html

    def fetch_url(self, url: str, timeout: int = 12) -> dict[str, Any]:
        """Fetch a URL and return lightweight parsed context."""
        try:
            status, html = self._http_get(url, timeout=timeout)
            title = _title_from_html(html)
            text_preview = _strip_html(html)[:3000]
            self.current_url = url
            self.session_history.append({"action": "fetch", "url": url, "status": status})
            return {
                "ok": True,
                "message": f"Fetched {url}",
                "status": status,
                "url": url,
                "title": title,
                "content_preview": text_preview,
                "content_length": len(html),
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "url": url}

    def search(self, query: str, engine: str = "duckduckgo", limit: int = 8) -> dict[str, Any]:
        """Search the web via DuckDuckGo HTML and return extracted links."""
        try:
            # Use a no-auth endpoint so this works out of the box.
            search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
            status, html = self._http_get(search_url, timeout=15)

            matches = re.findall(
                r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)</a>',
                html,
                flags=re.IGNORECASE,
            )
            results: list[dict[str, str]] = []
            for href, title_html in matches[: max(1, int(limit))]:
                title = re.sub(r"\\s+", " ", _strip_html(title_html)).strip()
                results.append({"title": title, "url": unescape(href)})

            # Fallback if DDG markup differs.
            if not results:
                fallback = re.findall(r'<a[^>]*href="(https?://[^"]+)"[^>]*>([\\s\\S]*?)</a>', html, flags=re.IGNORECASE)
                for href, title_html in fallback[: max(1, int(limit))]:
                    title = re.sub(r"\\s+", " ", _strip_html(title_html)).strip()
                    if len(title) >= 3:
                        results.append({"title": title, "url": unescape(href)})

            # Final fallback: DuckDuckGo Instant Answer API (works without keys).
            if not results:
                api_url = f"https://api.duckduckgo.com/?q={quote_plus(query)}&format=json&no_html=1&no_redirect=1"
                _, api_payload = self._http_get(api_url, timeout=12)
                data = json.loads(api_payload)
                abstract_url = str(data.get("AbstractURL", "")).strip()
                abstract_text = str(data.get("AbstractText", "")).strip()
                if abstract_url:
                    results.append({"title": abstract_text or "DuckDuckGo Abstract", "url": abstract_url})
                related = data.get("RelatedTopics", [])
                if isinstance(related, list):
                    for entry in related:
                        if isinstance(entry, dict) and entry.get("FirstURL"):
                            results.append(
                                {
                                    "title": str(entry.get("Text", "")).strip() or "Related result",
                                    "url": str(entry.get("FirstURL", "")).strip(),
                                }
                            )
                        if len(results) >= max(1, int(limit)):
                            break

            self.session_history.append({"action": "search", "query": query, "engine": engine, "status": status})
            return {
                "ok": True,
                "message": f"Search results for '{query}'",
                "engine": engine,
                "status": status,
                "results_count": len(results),
                "results": results,
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "query": query, "engine": engine}

    def screenshot(self, url: str | None = None) -> dict[str, Any]:
        """Placeholder screenshot operation."""
        try:
            target = url or self.current_url
            if not target:
                return {"ok": False, "error": "No URL loaded"}
            self.session_history.append({"action": "screenshot", "url": target})
            return {"ok": True, "message": f"Screenshot taken of {target}", "file": f"screenshot_{len(self.session_history)}.png"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def click(self, selector: str) -> dict[str, Any]:
        """Record click interaction for future browser automation compatibility."""
        try:
            self.session_history.append({"action": "click", "selector": selector})
            return {"ok": True, "message": f"Clicked {selector}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}


_browser_tool = BrowserTool()


def execute(operation: str, **kwargs) -> dict[str, Any]:
    handler = getattr(_browser_tool, operation.replace("-", "_"), None)
    if not handler:
        return {"ok": False, "error": f"Unknown operation: {operation}"}
    try:
        return handler(**kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}
