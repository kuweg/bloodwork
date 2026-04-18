from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_session
from app.models.orm import Report, User
from app.models.schemas import (
    DataDirectoryListing,
    IngestFileResult,
    IngestSummary,
    ReportRead,
)
from app.services.auth import get_current_user, require_admin
from app.services.ingest import build_parser, ingest_directory, ingest_pdf_bytes

router = APIRouter(prefix="/reports", tags=["reports"])


def _parser_or_400():
    try:
        return build_parser()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _resolve_data_dir() -> Path:
    root = Path(settings.bloodwork_data_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_sqlite_locked(exc: OperationalError) -> bool:
    return "database is locked" in str(exc).lower()


async def _reload_with_measurements(
    session: AsyncSession, report_id: int, user_id: int
) -> Report:
    stmt = (
        select(Report)
        .where(Report.id == report_id, Report.user_id == user_id)
        .options(selectinload(Report.measurements))
    )
    return (await session.execute(stmt)).scalar_one()


@router.post("", response_model=ReportRead, status_code=201)
async def upload_report(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Report:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    data = await file.read()
    parser_impl = _parser_or_400()
    try:
        result = await ingest_pdf_bytes(
            session,
            data,
            file.filename,
            user_id=user.id,
            parser=parser_impl,
        )
        await session.commit()
    except OperationalError as exc:
        await session.rollback()
        if _is_sqlite_locked(exc):
            raise HTTPException(
                status_code=503,
                detail="Database is busy. Reduce import concurrency and retry.",
            ) from exc
        raise

    assert result.report is not None
    return await _reload_with_measurements(session, result.report.id, user.id)


@router.get("/data-directory", response_model=DataDirectoryListing)
async def list_data_directory(
    _admin: User = Depends(require_admin),
) -> DataDirectoryListing:
    target = _resolve_data_dir()
    files = sorted(p.name for p in target.glob("*.pdf") if p.is_file())
    return DataDirectoryListing(directory=str(target), files=files)


@router.post("/ingest-file-from-dir", response_model=IngestFileResult, status_code=201)
async def ingest_file_from_dir(
    filename: str = Query(...),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
) -> IngestFileResult:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    target = _resolve_data_dir()
    pdf_path = (target / filename).resolve()
    if not pdf_path.is_file() or pdf_path.parent != target:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    parser_impl = _parser_or_400()
    data = pdf_path.read_bytes()
    try:
        result = await ingest_pdf_bytes(
            session,
            data,
            filename,
            user_id=admin.id,
            parser=parser_impl,
        )
        await session.commit()
    except OperationalError as exc:
        await session.rollback()
        if _is_sqlite_locked(exc):
            raise HTTPException(
                status_code=503,
                detail="Database is busy. Reduce import concurrency and retry.",
            ) from exc
        raise

    assert result.report is not None
    report = await _reload_with_measurements(session, result.report.id, admin.id)
    return IngestFileResult(
        filename=filename,
        skipped_duplicate=result.skipped_duplicate,
        report=ReportRead.model_validate(report),
    )


@router.post("/ingest-directory", response_model=IngestSummary)
async def ingest_directory_endpoint(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
) -> IngestSummary:
    target = _resolve_data_dir()
    parser_impl = _parser_or_400()
    summary = await ingest_directory(
        session,
        target,
        user_id=admin.id,
        parser=parser_impl,
    )
    await session.commit()
    return IngestSummary(directory=str(target), **summary)
