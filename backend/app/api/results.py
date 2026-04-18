from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models.orm import Report, User
from app.models.schemas import AggregatedSeries, ReportRead
from app.services.auth import get_current_user
from app.services.aggregator import aggregate_by_type

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


@router.get("/aggregate", response_model=list[AggregatedSeries])
async def get_aggregate(
    names: list[str] | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[AggregatedSeries]:
    return await aggregate_by_type(session, user_id=user.id, canonical_names=names)
