"""LLM-generated description + clinical importance for a single blood test."""

from __future__ import annotations

import json

from app.llm.base import LlmProvider

SYSTEM_PROMPT = """You write compact, accurate reference material for a blood-test dashboard.

Given a test name, return JSON exactly matching:

{
  "title": "<human-friendly title, Title Case, singular>",
  "description": "<2-4 sentence plain-English explanation of what this test measures. No medical advice, no disclaimers.>",
  "importance": "<2-4 sentences on why this test is clinically useful: what systems/conditions it reflects and what high or low values typically indicate.>"
}

Constraints:
- Plain text only (no markdown, no bullet points, no HTML).
- Never invent a test you do not recognize — if unsure, give a generic, careful description and say what family of tests it belongs to.
- Do not include dosage, treatment suggestions, or diagnosis.
- Each field must be a single paragraph.
"""


async def generate_test_info(provider: LlmProvider, title_hint: str) -> dict[str, str]:
    user = f"Test: {title_hint.strip()}"
    raw = await provider.complete_json(SYSTEM_PROMPT, user)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM returned invalid JSON for test info generation: {exc}\n---\n{raw[:500]}"
        ) from exc
    return {
        "title": str(data.get("title") or title_hint).strip(),
        "description": str(data.get("description") or "").strip(),
        "importance": str(data.get("importance") or "").strip(),
    }
