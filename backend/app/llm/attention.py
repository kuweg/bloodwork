"""LLM-driven attention analysis for recent blood work reports."""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.llm.base import LlmProvider

SYSTEM_PROMPT = """You are a clinical analyst reviewing a patient's most recent blood work reports.

Your job is to identify tests that "need attention" — not the obvious far-out-of-range values, but:
- values drifting toward a reference bound across consecutive reports
- borderline values sitting just inside or outside a bound
- unusual deltas between consecutive readings
- single outliers in an otherwise normal series

Input is a JSON array of reports, oldest first, each with measurements in canonical form.

Return JSON ONLY matching this schema:

{
  "attention": [
    {
      "canonical_name": "<canonical name exactly as given>",
      "display_name": "<human-friendly name if you recognize it, otherwise repeat canonical_name>",
      "severity": "low" | "medium" | "high",
      "reason": "<one concise sentence; include numbers when helpful>"
    }
  ]
}

Rules:
- Do NOT flag tests that are stably within range with no concerning trend.
- Keep each reason under 180 characters.
- If nothing warrants attention, return {"attention": []}.
- Use only canonical names that appear in the input. Do not invent tests.
"""


@dataclass(slots=True)
class AttentionItem:
    canonical_name: str
    display_name: str
    severity: str
    reason: str


async def analyze_attention(
    provider: LlmProvider, reports_payload: list[dict]
) -> list[AttentionItem]:
    raw = await provider.complete_json(SYSTEM_PROMPT, json.dumps(reports_payload))
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM returned invalid JSON for attention analysis: {exc}\n---\n{raw[:500]}"
        ) from exc
    items: list[AttentionItem] = []
    for entry in data.get("attention", []) or []:
        canonical = str(entry.get("canonical_name") or "").strip()
        if not canonical:
            continue
        severity = str(entry.get("severity") or "medium").lower()
        if severity not in ("low", "medium", "high"):
            severity = "medium"
        items.append(
            AttentionItem(
                canonical_name=canonical,
                display_name=str(entry.get("display_name") or canonical).strip(),
                severity=severity,
                reason=str(entry.get("reason") or "").strip(),
            )
        )
    return items
