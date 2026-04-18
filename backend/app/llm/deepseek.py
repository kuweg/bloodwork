from __future__ import annotations

from app.llm.openai import OpenAIProvider


class DeepSeekProvider(OpenAIProvider):
    """DeepSeek uses an OpenAI-compatible chat-completions API."""

    name = "deepseek"

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek-chat",
        timeout: float = 60.0,
    ) -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            base_url="https://api.deepseek.com/v1",
            timeout=timeout,
        )
