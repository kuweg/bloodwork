"""Free-form Q&A over a compact blood work table."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from app.llm.base import LlmProvider

SYSTEM_PROMPT = """You are a helpful medical data assistant answering questions about a patient's blood work.

You will be given:
- a compact markdown table (rows = tests, columns = dates, cells = value+unit)
- the reference ranges for each test
- a free-form question from the user

Answer clearly and concisely in plain prose or short bullet points. Ground every claim in the numbers provided — never invent values. If the table does not contain what the question asks, say so plainly.
"""


def _format_value(value: float, unit: str | None) -> str:
    text = f"{value:g}"
    return f"{text} {unit}" if unit else text


def _format_range(ref_low: float | None, ref_high: float | None, unit: str | None) -> str:
    u = f" {unit}" if unit else ""
    if ref_low is not None and ref_high is not None:
        return f"{ref_low:g}–{ref_high:g}{u}"
    if ref_high is not None:
        return f"<{ref_high:g}{u}"
    if ref_low is not None:
        return f">{ref_low:g}{u}"
    return "—"


def build_table(reports_payload: Iterable[dict]) -> str:
    """Turn [{collected_at, measurements: [{canonical_name, value, unit, ref_low, ref_high}]}...]
    into a compact markdown table: one row per canonical test, one column per date.
    """
    reports = list(reports_payload)
    dates: list[str] = []
    cells: dict[str, dict[str, str]] = {}
    meta: dict[str, dict] = {}

    for idx, r in enumerate(reports, start=1):
        raw_date = r.get("collected_at") or r.get("uploaded_at") or ""
        d = str(raw_date).split("T", 1)[0] if raw_date else f"unknown-{idx}"
        if d and d not in dates:
            dates.append(d)
        for m in r.get("measurements", []):
            name = m.get("canonical_name")
            if not name:
                continue
            if name not in meta:
                meta[name] = {
                    "unit": m.get("unit"),
                    "ref_low": m.get("ref_low"),
                    "ref_high": m.get("ref_high"),
                }
            cells.setdefault(name, {})[d] = _format_value(m.get("value"), m.get("unit"))

    if not cells:
        return "(no measurements)"

    header = "| Test | Range | " + " | ".join(dates) + " |"
    sep = "| --- | --- | " + " | ".join(["---"] * len(dates)) + " |"
    rows: list[str] = [header, sep]
    for name in sorted(cells):
        m = meta[name]
        range_str = _format_range(m["ref_low"], m["ref_high"], m["unit"])
        values = " | ".join(cells[name].get(d, "—") for d in dates)
        rows.append(f"| {name} | {range_str} | {values} |")

    return "\n".join(rows)


async def ask(
    provider: LlmProvider,
    question: str,
    reports_payload: list[dict],
    *,
    model: str | None = None,
    today: date | None = None,
) -> str:
    table = build_table(reports_payload)
    today_line = f"Today is {today.isoformat()}.\n\n" if today else ""
    user_msg = (
        f"{today_line}Recent blood work\n\n{table}\n\n"
        f"Question: {question.strip()}"
    )
    return await provider.complete_text(SYSTEM_PROMPT, user_msg, model=model)
