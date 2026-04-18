"""PDF parser that defers extraction to an LLM provider."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pdfplumber

from app.llm.base import LlmProvider
from app.llm.extractor import extract
from app.parsers.base import ParsedMeasurement, ParsedReport, Parser


def _extract_pdf_content(path: Path) -> str:
    """Pull text and table content out of a PDF into one prompt-ready string."""
    chunks: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                chunks.append(f"=== Page {page_num} text ===\n{text}")

            for table_num, table in enumerate(page.extract_tables() or [], start=1):
                rendered = "\n".join(
                    " | ".join((cell or "").strip() for cell in row)
                    for row in table
                )
                if rendered.strip():
                    chunks.append(f"=== Page {page_num} table {table_num} ===\n{rendered}")

    return "\n\n".join(chunks)


class LlmPdfParser(Parser):
    """Extract text and tables from a PDF and let the LLM structure them.

    The LLM returns both the original-language name (`raw_name`) and a
    canonical English name (`canonical_name`). Persistence slugifies the
    canonical name to group across languages and lab variants.
    """

    def __init__(self, provider: LlmProvider) -> None:
        self.provider = provider

    async def parse(self, path: Path) -> ParsedReport:
        content = await asyncio.to_thread(_extract_pdf_content, path)
        if not content.strip():
            return ParsedReport(language=None, collected_at=None, measurements=[])

        extraction = await extract(self.provider, content)
        return ParsedReport(
            language=extraction.language,
            collected_at=extraction.collected_at,
            measurements=[
                ParsedMeasurement(
                    raw_name=m.raw_name,
                    canonical_name=m.canonical_name,
                    value=m.value,
                    unit=m.unit,
                    ref_low=m.ref_low,
                    ref_high=m.ref_high,
                    taken_at=m.taken_at,
                )
                for m in extraction.measurements
            ],
        )
