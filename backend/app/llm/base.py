from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(slots=True)
class LlmMeasurement:
    raw_name: str       # original language, as written in the report
    canonical_name: str  # standardized English name chosen by the LLM
    value: float
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    taken_at: date | None = None


@dataclass(slots=True)
class LlmExtraction:
    language: str | None
    collected_at: date | None
    measurements: list[LlmMeasurement]


class LlmProvider(Protocol):
    """Async adapter that sends a system+user prompt and returns a response."""

    name: str

    async def complete_json(self, system: str, user: str) -> str:
        """Return the raw JSON string produced by the model (strict mode)."""
        ...

    async def complete_text(
        self, system: str, user: str, model: str | None = None
    ) -> str:
        """Return the plain-text response from the model."""
        ...
