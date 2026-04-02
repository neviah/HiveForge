from __future__ import annotations

from typing import Iterator

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from hiveforge.models.provider_base import LLMProvider


class LMStudioProvider(LLMProvider):
    """LM Studio local model provider (OpenAI-compatible)."""

    def __init__(self, config: dict) -> None:
        super().__init__(config)
        if not OpenAI:
            raise ImportError("openai package not installed. Run: pip install openai")

        self.client = OpenAI(
            api_key="lm-studio",
            base_url=self.base_url or "http://127.0.0.1:1234/v1",
        )

    def infer(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> str:
        messages = [
            {
                "role": "system",
                "content": system_prompt or "You are a helpful AI assistant.",
            },
            {"role": "user", "content": prompt},
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        return response.choices[0].message.content

    def infer_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.2,
        max_tokens: int = 4000,
    ) -> Iterator[str]:
        messages = [
            {
                "role": "system",
                "content": system_prompt or "You are a helpful AI assistant.",
            },
            {"role": "user", "content": prompt},
        ]

        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def count_tokens(self, text: str) -> int:
        return len(text) // 4
