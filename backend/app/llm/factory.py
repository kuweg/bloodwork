from __future__ import annotations

from app.config import ProviderChoice, settings
from app.llm.base import LlmProvider

_DEFAULT_MODELS: dict[ProviderChoice, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-6",
    "deepseek": "deepseek-chat",
}


def get_provider(override: ProviderChoice | None = None) -> LlmProvider:
    """Build the configured LLM provider. Raises ValueError if not configured."""
    name = override or settings.llm_provider
    if name is None:
        raise ValueError(
            "No LLM provider configured. Set BW_LLM_PROVIDER and BW_LLM_API_KEY."
        )
    if not settings.llm_api_key:
        raise ValueError("BW_LLM_API_KEY is required when using an LLM provider.")

    model = settings.llm_model or _DEFAULT_MODELS[name]
    timeout = settings.llm_timeout_seconds

    if name == "openai":
        from app.llm.openai import OpenAIProvider

        return OpenAIProvider(settings.llm_api_key, model=model, timeout=timeout)
    if name == "anthropic":
        from app.llm.anthropic import AnthropicProvider

        return AnthropicProvider(settings.llm_api_key, model=model, timeout=timeout)
    if name == "deepseek":
        from app.llm.deepseek import DeepSeekProvider

        return DeepSeekProvider(settings.llm_api_key, model=model, timeout=timeout)

    raise ValueError(f"Unsupported LLM provider: {name}")
