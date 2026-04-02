from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterator

from hiveforge.models.provider_base import LLMProvider
from hiveforge.telemetry import get_session_recorder


class ModelProviderConfig:
    """Unified model provider configuration loader."""

    def __init__(self, config_path: str = "hiveforge/config/models.json") -> None:
        self.config_path = Path(config_path)
        self.config: dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        if self.config_path.exists():
            self.config = json.loads(self.config_path.read_text(encoding="utf-8"))

    def get_active_provider(self) -> tuple[str, dict[str, Any]]:
        """Returns (provider_name, config_dict) for the active provider."""
        active = self.config.get("active_provider", "openrouter")
        return active, self.config.get("providers", {}).get(active, {})

    def get_provider(self, name: str) -> dict[str, Any]:
        return self.config.get("providers", {}).get(name, {})

    def list_providers(self) -> list[str]:
        return list(self.config.get("providers", {}).keys())


def get_provider_instance(provider_name: str, config: dict) -> LLMProvider:
    """Factory function to create the right provider instance."""
    if provider_name == "anthropic":
        from hiveforge.models.anthropic_provider import AnthropicProvider

        return AnthropicProvider(config)
    elif provider_name == "openai":
        from hiveforge.models.openai_provider import OpenAIProvider

        return OpenAIProvider(config)
    elif provider_name == "openrouter":
        from hiveforge.models.openrouter_provider import OpenRouterProvider

        return OpenRouterProvider(config)
    elif provider_name == "ollama":
        from hiveforge.models.ollama_provider import OllamaProvider

        return OllamaProvider(config)
    elif provider_name == "lmstudio":
        from hiveforge.models.lmstudio_provider import LMStudioProvider

        return LMStudioProvider(config)
    elif provider_name == "custom":
        from hiveforge.models.openrouter_provider import OpenRouterProvider

        # Custom OpenAI-compatible endpoints use OpenRouter client
        return OpenRouterProvider(config)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")


class ModelClient:
    """Unified client for LLM inference across multiple providers."""

    def __init__(self, provider_name: str | None = None) -> None:
        self.config_loader = ModelProviderConfig()

        if provider_name:
            self.provider_name = provider_name
            self.provider_config = self.config_loader.get_provider(provider_name)
        else:
            self.provider_name, self.provider_config = self.config_loader.get_active_provider()

        self.provider: LLMProvider | None = None
        self._init_provider()

    def _init_provider(self) -> None:
        """Initialize the provider instance."""
        try:
            self.provider = get_provider_instance(self.provider_name, self.provider_config)
        except ImportError as e:
            print(f"Warning: Could not initialize {self.provider_name}: {e}")
            self.provider = None

    def infer(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Synchronous inference call."""
        recorder = get_session_recorder()
        if not self.provider:
            recorder.record(
                event_type="llm_call",
                source="models.inference",
                payload={
                    "provider": self.provider_name,
                    "ok": False,
                    "error": "provider not initialized",
                    "prompt_preview": prompt[:200],
                },
            )
            recorder.record(
                event_type="llm_response",
                source="models.inference",
                payload={
                    "provider": self.provider_name,
                    "ok": False,
                    "error": "provider not initialized",
                },
            )
            return f"ERROR: {self.provider_name} provider not initialized"

        temp = temperature or self.provider_config.get("temperature", 0.2)
        tokens = max_tokens or self.provider_config.get("max_tokens", 4000)
        recorder.record(
            event_type="llm_call",
            source="models.inference",
            payload={
                "provider": self.provider_name,
                "temperature": temp,
                "max_tokens": tokens,
                "prompt_chars": len(prompt),
                "prompt_preview": prompt[:200],
            },
        )

        try:
            response = self.provider.infer(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=temp,
                max_tokens=tokens,
            )
            recorder.record(
                event_type="llm_response",
                source="models.inference",
                payload={
                    "provider": self.provider_name,
                    "ok": True,
                    "response_chars": len(response),
                    "response_preview": response[:200],
                },
            )
            return response
        except Exception as e:
            recorder.record(
                event_type="llm_response",
                source="models.inference",
                payload={"provider": self.provider_name, "ok": False, "error": str(e)},
            )
            return f"ERROR: {str(e)}"

    def infer_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> Iterator[str]:
        """Streaming inference, yielding chunks."""
        if not self.provider:
            yield f"ERROR: {self.provider_name} provider not initialized"
            return

        temp = temperature or self.provider_config.get("temperature", 0.2)
        tokens = max_tokens or self.provider_config.get("max_tokens", 4000)

        try:
            yield from self.provider.infer_stream(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=temp,
                max_tokens=tokens,
            )
        except Exception as e:
            yield f"ERROR: {str(e)}"

    def count_tokens(self, text: str) -> int:
        """Estimate token count for billing."""
        if not self.provider:
            return len(text) // 4
        return self.provider.count_tokens(text)

    def switch_provider(self, provider_name: str) -> None:
        """Switch to a different provider."""
        self.provider_name = provider_name
        self.provider_config = self.config_loader.get_provider(provider_name)
        self._init_provider()


class InferenceContext:
    """Manages inference state including token tracking and costs."""

    def __init__(self, model_client: ModelClient | None = None) -> None:
        self.client = model_client or ModelClient()
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0.0

        # Provider cost rates (per 1k tokens)
        self.cost_rates = {
            "anthropic": {"input": 0.003, "output": 0.015},
            "openai": {"input": 0.003, "output": 0.006},
            "openrouter": {"input": 0.001, "output": 0.001},  # Varies by model
            "ollama": {"input": 0.0, "output": 0.0},  # Local
            "lmstudio": {"input": 0.0, "output": 0.0},  # Local
            "custom": {"input": 0.0, "output": 0.0},  # Custom
        }

    def infer(self, prompt: str, system_prompt: str = "") -> str:
        """Inference with cost tracking."""
        response = self.client.infer(prompt, system_prompt)

        # Track tokens
        input_tokens = self.client.count_tokens(prompt)
        output_tokens = self.client.count_tokens(response)
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens

        # Calculate cost
        rates = self.cost_rates.get(self.client.provider_name, {"input": 0.0, "output": 0.0})
        input_cost = (input_tokens / 1000) * rates["input"]
        output_cost = (output_tokens / 1000) * rates["output"]
        self.total_cost += input_cost + output_cost

        return response

    def get_usage_summary(self) -> dict[str, Any]:
        """Get token usage and cost summary."""
        return {
            "input_tokens": self.total_input_tokens,
            "output_tokens": self.total_output_tokens,
            "total_tokens": self.total_input_tokens + self.total_output_tokens,
            "estimated_cost_usd": round(self.total_cost, 6),
            "provider": self.client.provider_name,
        }
