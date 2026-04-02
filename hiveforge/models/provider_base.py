from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Iterator


class LLMProvider(ABC):
    """Base class for all LLM provider implementations."""

    def __init__(self, config: dict) -> None:
        self.config = config
        self.api_key = config.get("api_key") or os.getenv(config.get("api_key_env", ""))
        self.base_url = config.get("base_url", "")
        self.model = config.get("model", "")

    @abstractmethod
    def infer(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> str:
        """Synchronous single-turn inference."""
        pass

    @abstractmethod
    def infer_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> Iterator[str]:
        """Streaming inference yielding token chunks."""
        pass

    @abstractmethod
    def count_tokens(self, text: str) -> int:
        """Estimate token count for billing."""
        pass
