from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(slots=True)
class ParsedMeasurement:
    """Measurement extracted from a PDF.

    `raw_name` keeps the original language string from the report. `canonical_name`
    is an English standardized name produced by the LLM (e.g. "LDL Cholesterol").
    The persistence layer slugifies canonical_name for grouping across reports.
    """

    raw_name: str
    canonical_name: str
    value: float
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    taken_at: date | None = None


@dataclass(slots=True)
class ParsedReport:
    language: str | None
    collected_at: date | None
    measurements: list[ParsedMeasurement]


class Parser(ABC):
    """Async parser interface."""

    @abstractmethod
    async def parse(self, path: Path) -> ParsedReport: ...
