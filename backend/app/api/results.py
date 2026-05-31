from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models.orm import Measurement, Report, User
from app.models.schemas import (
    AggregatedSeries,
    MeasurementRead,
    MeasurementUpdate,
    ReportRead,
)
from app.services.auth import get_current_user
from app.services.aggregator import aggregate_by_type
from app.services.ingest import resolve_uploaded_pdf_path

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/reports", response_model=list[ReportRead])
async def list_reports(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[Report]:
    stmt = (
        select(Report)
        .where(Report.user_id == user.id)
        .options(selectinload(Report.measurements))
        .order_by(Report.uploaded_at.desc())
    )
    return list((await session.execute(stmt)).scalars().all())


@router.get("/reports/{report_id}", response_model=ReportRead)
async def get_report(
    report_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Report:
    stmt = (
        select(Report)
        .where(Report.id == report_id, Report.user_id == user.id)
        .options(selectinload(Report.measurements))
    )
    report = (await session.execute(stmt)).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/reports/{report_id}/pdf")
async def get_report_pdf(
    report_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> FileResponse:
    stmt = select(Report).where(Report.id == report_id, Report.user_id == user.id)
    report = (await session.execute(stmt)).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    pdf_path = resolve_uploaded_pdf_path(user.id, report.content_hash)
    if pdf_path is None:
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(path=pdf_path, media_type="application/pdf")


@router.patch("/measurements/{measurement_id}", response_model=MeasurementRead)
async def update_measurement(
    measurement_id: int,
    body: MeasurementUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Measurement:
    """Correct a single measurement (value/unit/reference range) on your own report."""
    stmt = (
        select(Measurement)
        .join(Report, Report.id == Measurement.report_id)
        .where(Measurement.id == measurement_id, Report.user_id == user.id)
    )
    measurement = (await session.execute(stmt)).scalar_one_or_none()
    if measurement is None:
        raise HTTPException(status_code=404, detail="Measurement not found")

    fields = body.model_fields_set
    if "value" in fields:
        if body.value is None:
            raise HTTPException(status_code=422, detail="value cannot be null")
        measurement.value = body.value
    if "unit" in fields:
        measurement.unit = body.unit
    if "ref_low" in fields:
        measurement.ref_low = body.ref_low
    if "ref_high" in fields:
        measurement.ref_high = body.ref_high

    await session.commit()
    await session.refresh(measurement)
    return measurement


@router.delete("/reports/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete one of your reports and its measurements (and its stored PDF)."""
    stmt = (
        select(Report)
        .where(Report.id == report_id, Report.user_id == user.id)
        .options(selectinload(Report.measurements))
    )
    report = (await session.execute(stmt)).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Best-effort removal of the stored PDF; never block the DB delete on it.
    try:
        pdf_path = resolve_uploaded_pdf_path(user.id, report.content_hash)
        if pdf_path is not None:
            pdf_path.unlink(missing_ok=True)
    except OSError:
        pass

    await session.delete(report)
    await session.commit()
    return None


@router.get("/aggregate", response_model=list[AggregatedSeries])
async def get_aggregate(
    names: list[str] | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[AggregatedSeries]:
    return await aggregate_by_type(session, user_id=user.id, canonical_names=names)
