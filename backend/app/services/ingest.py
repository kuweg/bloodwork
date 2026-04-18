"""Pipeline that turns PDF bytes into a persisted Report using the LLM parser."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.llm.factory import get_provider
from app.llm.test_info import generate_test_info
from app.models.orm import Measurement, Report, TestInfo
from app.parsers import LlmPdfParser, Parser
from app.parsers.base import ParsedMeasurement
from app.services.normalizer import slugify


@dataclass(slots=True)
class IngestResult:
    report: Report | None
    skipped_duplicate: bool = False


def _user_scoped_sha256(data: bytes, user_id: int) -> str:
    seed = f"{user_id}:".encode("utf-8")
    return hashlib.sha256(seed + data).hexdigest()


def build_parser() -> Parser:
    """Build the LLM-backed PDF parser. Raises if the provider is unconfigured."""
    return LlmPdfParser(get_provider())


def _to_orm_measurements(
    parsed: list[ParsedMeasurement], collected_at
) -> list[Measurement]:
    out: list[Measurement] = []
    for m in parsed:
        if not m.raw_name or not m.raw_name.strip():
            continue
        display = (m.canonical_name or m.raw_name).strip()
        out.append(
            Measurement(
                canonical_name=slugify(display),
                display_name=display,
                raw_name=m.raw_name,
                value=m.value,
                unit=m.unit,
                ref_low=m.ref_low,
                ref_high=m.ref_high,
                taken_at=m.taken_at or collected_at,
            )
        )
    return out


async def _ensure_test_info_cache(
    session: AsyncSession, measurements: list[Measurement]
) -> None:
    """Generate and cache test info once per canonical test when first ingested.

    Failures here should not block report ingestion.
    """
    by_canonical: dict[str, str] = {}
    for m in measurements:
        canonical = (m.canonical_name or "").strip()
        if not canonical or canonical in by_canonical:
            continue
        by_canonical[canonical] = (m.display_name or canonical).strip() or canonical

    if not by_canonical:
        return

    existing_rows = await session.execute(
        select(TestInfo.canonical_name).where(
            TestInfo.canonical_name.in_(list(by_canonical.keys()))
        )
    )
    existing = set(existing_rows.scalars().all())
    missing = [name for name in by_canonical if name not in existing]
    if not missing:
        return

    try:
        provider = get_provider()
    except ValueError:
        return

    for canonical in missing:
        try:
            generated = await generate_test_info(provider, by_canonical[canonical])
        except Exception:
            continue

        try:
            async with session.begin_nested():
                session.add(
                    TestInfo(
                        canonical_name=canonical,
                        title=generated["title"] or by_canonical[canonical],
                        description=generated["description"],
                        importance=generated["importance"],
                    )
                )
                await session.flush()
        except IntegrityError:
            # Another concurrent request inserted the same canonical test info.
            continue


async def ingest_pdf_bytes(
    session: AsyncSession,
    data: bytes,
    original_filename: str,
    user_id: int,
    parser: Parser | None = None,
) -> IngestResult:
    """Parse, dedupe, and persist a PDF. Caller commits.

    If an existing report has no measurements (a prior parse failed), it gets
    re-parsed and refilled. Populated duplicates are left alone.
    """
    content_hash = _user_scoped_sha256(data, user_id)

    existing = await session.scalar(
        select(Report)
        .where(Report.content_hash == content_hash, Report.user_id == user_id)
        .options(selectinload(Report.measurements))
    )
    if existing is not None and existing.measurements:
        return IngestResult(report=existing, skipped_duplicate=True)

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"{uuid.uuid4().hex}.pdf"
    stored_path.write_bytes(data)

    parsed = await (parser or build_parser()).parse(stored_path)
    new_measurements = _to_orm_measurements(parsed.measurements, parsed.collected_at)

    if existing is not None:
        existing.language = parsed.language or existing.language
        existing.collected_at = parsed.collected_at or existing.collected_at
        existing.measurements = new_measurements
        try:
            await session.flush()
            await _ensure_test_info_cache(session, new_measurements)
        except IntegrityError:
            await session.rollback()
            existing = await _get_by_hash(session, content_hash, user_id)
            return IngestResult(report=existing, skipped_duplicate=True)
        return IngestResult(report=existing, skipped_duplicate=False)

    report = Report(
        user_id=user_id,
        source_filename=original_filename,
        content_hash=content_hash,
        language=parsed.language,
        collected_at=parsed.collected_at,
    )
    report.measurements = new_measurements
    session.add(report)
    try:
        await session.flush()
        await _ensure_test_info_cache(session, new_measurements)
    except IntegrityError:
        # Another concurrent upload committed first (e.g. a byte-identical
        # duplicate in a parallel batch). Treat as a dedup hit.
        await session.rollback()
        winner = await _get_by_hash(session, content_hash, user_id)
        return IngestResult(report=winner, skipped_duplicate=True)
    return IngestResult(report=report, skipped_duplicate=False)


async def _get_by_hash(
    session: AsyncSession, content_hash: str, user_id: int
) -> Report | None:
    return await session.scalar(
        select(Report)
        .where(Report.content_hash == content_hash, Report.user_id == user_id)
        .options(selectinload(Report.measurements))
    )


async def ingest_directory(
    session: AsyncSession,
    directory: Path,
    user_id: int,
    parser: Parser | None = None,
) -> dict:
    """Import every PDF in `directory` non-recursively."""
    imported = 0
    skipped = 0
    errors: list[dict[str, str]] = []
    active_parser = parser or build_parser()

    for pdf_path in sorted(directory.glob("*.pdf")):
        try:
            result = await ingest_pdf_bytes(
                session,
                pdf_path.read_bytes(),
                pdf_path.name,
                user_id=user_id,
                parser=active_parser,
            )
            # Commit per file so a later failure or rollback (from the dedup
            # race handler) doesn't wipe prior files' work.
            await session.commit()
        except Exception as exc:
            await session.rollback()
            errors.append({"file": pdf_path.name, "error": str(exc)})
            continue

        if result.skipped_duplicate:
            skipped += 1
        else:
            imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}
