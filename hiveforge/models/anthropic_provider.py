from __future__ import annotations

import json
from typing import Iterator

try:
    import anthropic
except ImportError:
    anthropic = None

from hiveforge.models.provider_base import LLMProvider


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        if not anthropic:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

        self.client = anthropic.Anthropic(api_key=self.api_key)

    def infer(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> str:
        messages = [{"role": "user", "content": prompt}]

        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system_prompt or "You are a helpful AI assistant.",
            messages=messages,
            temperature=temperature,
        )

        return response.content[0].text

    def infer_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> Iterator[str]:
        messages = [{"role": "user", "content": prompt}]

        with self.client.messages.stream(
            model=self.model,
            max_tokens=max_tokens,
            system=system_prompt or "You are a helpful AI assistant.",
            messages=messages,
            temperature=temperature,
        ) as stream:
            for text in stream.text_stream:
                yield text

    def count_tokens(self, text: str) -> int:
        # Claude uses roughly 1 token per 4 characters as a heuristic
        # For exact counting, use Anthropic's tokenizer
        return len(text) // 4
