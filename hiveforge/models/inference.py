from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ModelProviderConfig:
    """Unified model provider configuration loader."""

    def __init__(self, config_path: str = "hiveforge/config/models.json") -> None:
        self.config_path = Path(config_path)
        self.config: dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        if self.config_path.exists():
            self.config = json.loads(self.config_path.read_text(encoding="utf-8"))

    def get_active_provider(self) -> dict[str, Any]:
        active = self.config.get("active_provider", "openrouter")
        return self.config.get("providers", {}).get(active, {})

    def get_provider(self, name: str) -> dict[str, Any]:
        return self.config.get("providers", {}).get(name, {})

    def list_providers(self) -> list[str]:
        return list(self.config.get("providers", {}).keys())


class ModelClient:
    """Client for LLM inference across multiple providers."""

    def __init__(self, provider: str = "openrouter") -> None:
        self.config = ModelProviderConfig()
        self.provider_config = self.config.get_provider(provider)
        self.provider = provider

    def infer(self, prompt: str, system_prompt: str = "", **kwargs) -> str:
        """Call the active provider's inference endpoint."""
        # Placeholder: actual implementation will integrate with
        # anthropic, openai, ollama, lmstudio, and openrouter SDKs
        return f"[{self.provider}] Response to: {prompt[:50]}..."
