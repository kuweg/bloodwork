from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Measurement, Report
from app.models.schemas import AggregatedPoint, AggregatedSeries


async def aggregate_by_type(
    session: AsyncSession,
    user_id: int,
    canonical_names: list[str] | None = None,
) -> list[AggregatedSeries]:
    """Return a time series per canonical test name, ordered by date."""
    stmt = (
        select(Measurement)
        .join(Report, Report.id == Measurement.report_id)
        .where(Measurement.taken_at.is_not(None), Report.user_id == user_id)
    )
    if canonical_names:
        stmt = stmt.where(Measurement.canonical_name.in_(canonical_names))
    stmt = stmt.order_by(Measurement.taken_at)

    result = await session.execute(stmt)
    rows = result.scalars().all()

    buckets: dict[str, list[Measurement]] = defaultdict(list)
    for row in rows:
        buckets[row.canonical_name].append(row)

    series: list[AggregatedSeries] = []
    for name, items in buckets.items():
        unit = next((m.unit for m in items if m.unit), None)
        series.append(
            AggregatedSeries(
                canonical_name=name,
                unit=unit,
                points=[
                    AggregatedPoint(taken_at=m.taken_at, value=m.value, unit=m.unit)
                    for m in items
                    if m.taken_at is not None
                ],
            )
        )
    series.sort(key=lambda s: s.canonical_name)
    return series
