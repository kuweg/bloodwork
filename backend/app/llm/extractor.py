"""Run an LLM provider against PDF content and parse the response."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

from dateutil import parser as dateparser

from app.llm.base import LlmExtraction, LlmMeasurement, LlmProvider

_NUMERIC_DATE_RE = re.compile(r"^\s*(\d{1,4})([./-])(\d{1,2})\2(\d{1,4})\s*$")

SYSTEM_PROMPT = """You extract structured blood work from lab reports in any language.

Given the text and table content of a laboratory report, return strictly valid JSON:

{
  "language": "<ISO 639-1 code such as en, ru, hr, sr, bs, es, de, fr; null if uncertain>",
  "collected_at": "<ISO date (YYYY-MM-DD) when the sample was taken, null if unknown>",
  "measurements": [
    {
      "raw_name": "<test name exactly as written in the report, preserving the original language>",
      "canonical_name": "<standardized English name for this test — see guidelines>",
      "value": <number, use dot as decimal>,
      "unit": "<unit string or null>",
      "ref_low": <number or null>,
      "ref_high": <number or null>,
      "taken_at": "<ISO date or null>"
    }
  ]
}

Canonical name guidelines:
- Always English, Title Case, singular phrase.
- Use the common name used on English lab reports. Examples:
  "Hemoglobin", "White Blood Cells", "Platelets", "Glucose (Fasting)",
  "LDL Cholesterol", "HDL Cholesterol", "Triglycerides", "TSH",
  "Creatinine", "ALT", "AST", "Total Testosterone", "Free Testosterone",
  "Vitamin D", "Vitamin B12", "Ferritin", "Iron", "MCV", "Hematocrit",
  "Hemoglobin A1c", "Total Bilirubin", "Direct Bilirubin", "Total Cholesterol".
- Translate, de-abbreviate, and standardize as needed (e.g. HGB -> Hemoglobin;
  Eritrociti -> Red Blood Cells; Тромбоциты -> Platelets; LDL kolesterol -> LDL Cholesterol).
- Keep the same canonical_name for the same test across any language or lab.
- If a test is obscure and you are unsure, pick the most natural English phrase; consistency matters more than perfection.

Other rules:
- Include every measurement with a numeric value. Skip qualitative results ("negative", "positive").
- "<X" -> ref_high=X, ref_low=null. ">X" -> ref_low=X, ref_high=null. "X-Y" -> ref_low=X, ref_high=Y.
- Convert comma decimals (4,2) to dot decimals (4.2).
- Use null for missing/unclear fields. Never invent values.
- Return ONE JSON object. No prose, no markdown fences.
"""


def _coerce_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", ".")
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text:
        return None

    try:
        return date.fromisoformat(text)
    except (ValueError, TypeError, OverflowError):
        pass

    # Support ISO datetimes like "2026-03-06T08:30:00Z".
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except (ValueError, TypeError, OverflowError):
        pass

    # Numeric formats from lab exports are usually DMY in this project.
    m = _NUMERIC_DATE_RE.match(text)
    if m:
        first_raw, separator, second_raw, year_raw = m.groups()
        first = int(first_raw)
        second = int(second_raw)
        year = int(year_raw)

        try:
            if len(first_raw) == 4:
                # YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
                return date(first, second, year)

            if separator == ".":
                # Common locale format in reports: DD.MM.YYYY
                return date(year, second, first)

            if first > 12 and second <= 12:
                return date(year, second, first)
            if second > 12 and first <= 12:
                return date(year, first, second)

            # Ambiguous (both <= 12): prefer DMY to match lab exports.
            return date(year, second, first)
        except ValueError:
            pass

    for kwargs in (
        {"dayfirst": True, "yearfirst": False},
        {"dayfirst": False, "yearfirst": False},
        {"dayfirst": False, "yearfirst": True},
    ):
        try:
            parsed = dateparser.parse(text, **kwargs)
        except (ValueError, TypeError, OverflowError):
            continue
        if parsed is not None:
            return parsed.date()

    return None


async def extract(provider: LlmProvider, pdf_content: str) -> LlmExtraction:
    raw = await provider.complete_json(SYSTEM_PROMPT, pdf_content)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\n---\n{raw[:500]}") from exc

    measurements: list[LlmMeasurement] = []
    for entry in data.get("measurements", []) or []:
        value = _coerce_float(entry.get("value"))
        raw_name = str(entry.get("raw_name") or entry.get("name") or "").strip()
        canonical = str(entry.get("canonical_name") or "").strip() or raw_name
        if value is None or not raw_name:
            continue
        measurements.append(
            LlmMeasurement(
                raw_name=raw_name,
                canonical_name=canonical,
                value=value,
                unit=(entry.get("unit") or None),
                ref_low=_coerce_float(entry.get("ref_low")),
                ref_high=_coerce_float(entry.get("ref_high")),
                taken_at=_coerce_date(entry.get("taken_at")),
            )
        )

    return LlmExtraction(
        language=(data.get("language") or None),
        collected_at=_coerce_date(data.get("collected_at")),
        measurements=measurements,
    )
