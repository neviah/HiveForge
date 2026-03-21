import json
from typing import Iterable, Dict, Any, Generator
import requests

from .base import BaseProvider, ProviderError


class LMStudioProvider(BaseProvider):
    name = "lmstudio"

    def __init__(self, endpoint: str, model: str, timeout: int = 60, headers: Dict[str, str] | None = None):
        self.endpoint = endpoint.rstrip('/')
        self.model = model
        self.timeout = timeout
        self.headers = headers or {}

    def _build_payload(self, messages: Iterable[Dict[str, Any]], tools: Dict[str, Any] | None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        return payload

    def _candidate_endpoints(self) -> list[str]:
        base = self.endpoint.rstrip('/')
        candidates: list[str] = []

        def add(value: str):
            value = value.rstrip('/')
            if value and value not in candidates:
                candidates.append(value)

        add(base)
        if base.endswith('/api/v1'):
            # e.g. http://host:1234/api/v1 -> also try /v1
            root = base[:-7].rstrip('/')
            add(f"{root}/v1")
            add(root)
        elif base.endswith('/v1'):
            # e.g. http://host:1234/v1 -> also try /api/v1
            root = base[:-3].rstrip('/')
            add(f"{root}/api/v1")
            add(root)
        else:
            add(f"{base}/v1")
            add(f"{base}/api/v1")

        return candidates

    def complete(self, messages: Iterable[Dict[str, Any]], tools: Dict[str, Any] | None = None) -> Generator[str, None, None]:
        payload = self._build_payload(messages, tools)
        attempts: list[str] = []
        resp = None

        for endpoint in self._candidate_endpoints():
            url = f"{endpoint}/chat/completions"
            try:
                current = requests.post(url, json=payload, headers=self.headers, stream=True, timeout=self.timeout)
            except Exception as exc:  # pragma: no cover - network error
                attempts.append(f"{url} -> network error: {exc}")
                continue

            if current.status_code == 200:
                resp = current
                self.endpoint = endpoint
                break

            attempts.append(f"{url} -> HTTP {current.status_code}")

        if resp is None:
            raise ProviderError(
                "Failed to reach LM Studio chat endpoint. Tried: " + " | ".join(attempts)
            )

        for line in resp.iter_lines():
            if not line:
                continue
            if line.startswith(b"data: "):
                line = line[len(b"data: "):]
            if line == b"[DONE]":
                break
            try:
                data = json.loads(line)
                delta = data.get("choices", [{}])[0].get("delta", {})
                if "content" in delta and delta["content"]:
                    yield delta["content"]
                elif delta.get("tool_calls"):
                    # Forward raw tool call JSON to the agent for execution
                    yield json.dumps({"tool_calls": delta["tool_calls"]})
            except json.JSONDecodeError:
                continue

    def supports_tools(self) -> bool:
        return True


__all__ = ["LMStudioProvider", "ProviderError"]
