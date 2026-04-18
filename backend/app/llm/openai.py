from __future__ import annotations

import httpx


class OpenAIProvider:
    """OpenAI chat-completions adapter using JSON mode."""

    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 60.0,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def complete_json(self, system: str, user: str) -> str:
        return await self._chat(system, user, model=self.model, json_mode=True)

    async def complete_text(
        self, system: str, user: str, model: str | None = None
    ) -> str:
        return await self._chat(system, user, model=model or self.model, json_mode=False)

    async def _chat(self, system: str, user: str, model: str, json_mode: bool) -> str:
        payload: dict[str, object] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0 if json_mode else 0.2,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
