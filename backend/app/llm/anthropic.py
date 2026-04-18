from __future__ import annotations

import re

import httpx

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class AnthropicProvider:
    """Anthropic Messages API adapter. Expects JSON; strips code fences if present."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-6",
        timeout: float = 60.0,
        max_tokens: int = 4096,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_tokens = max_tokens

    async def complete_json(self, system: str, user: str) -> str:
        text = await self._messages(
            system=system + "\n\nRespond with a single JSON object. No prose, no markdown.",
            user=user,
            model=self.model,
            temperature=0,
        )
        return _FENCE_RE.sub("", text.strip())

    async def complete_text(
        self, system: str, user: str, model: str | None = None
    ) -> str:
        return await self._messages(
            system=system,
            user=user,
            model=model or self.model,
            temperature=0.2,
        )

    async def _messages(
        self, system: str, user: str, model: str, temperature: float
    ) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": self.max_tokens,
                    "temperature": temperature,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]
