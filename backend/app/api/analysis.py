from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_session
from app.llm.attention import analyze_attention
from app.llm.chat import ask as llm_ask
from app.llm.factory import get_provider
from app.llm.test_info import generate_test_info
from app.models.orm import Measurement, Report, TestInfo, User
from app.models.schemas import (
    AskRequest,
    AskResponse,
    AttentionItem as AttentionItemSchema,
    AttentionResult,
    ProviderInfo,
    TestInfoResponse,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/analysis", tags=["analysis"])

_SUGGESTED_MODELS: dict[str, list[str]] = {
    "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    "anthropic": ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
}


async def _load_recent_reports(
    session: AsyncSession, limit: int, user_id: int
) -> list[Report]:
    stmt = (
        select(Report)
        .where(Report.user_id == user_id)
        .options(selectinload(Report.measurements))
        .order_by(Report.collected_at.desc().nullslast(), Report.uploaded_at.desc())
        .limit(limit)
    )
    return list((await session.execute(stmt)).scalars().all())


def _reports_to_payload(reports: list[Report]) -> list[dict]:
    # oldest-first so the LLM sees a natural timeline
    out: list[dict] = []
    for r in reversed(reports):
        out.append(
            {
                "collected_at": r.collected_at.isoformat() if r.collected_at else None,
                "uploaded_at": r.uploaded_at.isoformat(),
                "source": r.source_filename,
                "measurements": [
                    {
                        "canonical_name": m.canonical_name,
                        "raw_name": m.raw_name,
                        "value": m.value,
                        "unit": m.unit,
                        "ref_low": m.ref_low,
                        "ref_high": m.ref_high,
                    }
                    for m in r.measurements
                ],
            }
        )
    return out


def _provider_or_400():
    try:
        return get_provider()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/providers", response_model=ProviderInfo)
async def provider_info(_user: User = Depends(get_current_user)) -> ProviderInfo:
    configured = settings.llm_provider
    suggested = _SUGGESTED_MODELS.get(configured, []) if configured else []
    return ProviderInfo(
        configured=configured,
        default_model=settings.llm_model or (suggested[0] if suggested else None),
        suggested_models=suggested,
    )


@router.get("/attention", response_model=AttentionResult)
async def attention(
    last: int | None = Query(default=None, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AttentionResult:
    provider = _provider_or_400()
    n = last or settings.attention_window
    reports = await _load_recent_reports(session, n, user.id)
    if not reports:
        return AttentionResult(reports_considered=0, items=[])

    payload = _reports_to_payload(reports)
    try:
        items = await analyze_attention(provider, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="LLM returned an invalid response for attention analysis.",
        ) from exc
    return AttentionResult(
        reports_considered=len(reports),
        items=[
            AttentionItemSchema(
                canonical_name=i.canonical_name,
                display_name=i.display_name,
                severity=i.severity,
                reason=i.reason,
            )
            for i in items
        ],
    )


@router.get("/test-info/{canonical_name}", response_model=TestInfoResponse)
async def test_info(
    canonical_name: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TestInfoResponse:
    """Return cached description + clinical importance for a canonical test.

    Generates via the LLM on first request per canonical_name and caches in DB.
    The `mentioned_as` list aggregates every unique raw name seen in uploaded reports.
    """
    # Collect raw-name aliases (original-language strings across every report).
    aliases_stmt = (
        select(Measurement.raw_name, Measurement.display_name)
        .join(Report, Report.id == Measurement.report_id)
        .where(Measurement.canonical_name == canonical_name, Report.user_id == user.id)
    )
    rows = (await session.execute(aliases_stmt)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No measurements for this test")

    raw_aliases: set[str] = set()
    display_from_data: str | None = None
    for raw, disp in rows:
        if raw:
            raw_aliases.add(raw.strip())
        if disp and not display_from_data:
            display_from_data = disp.strip()

    # Fetch or generate the cached info.
    info = await session.get(TestInfo, canonical_name)
    if info is None:
        provider = _provider_or_400()
        try:
            generated = await generate_test_info(
                provider, display_from_data or canonical_name
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail="LLM returned an invalid response for test info generation.",
            ) from exc
        info = TestInfo(
            canonical_name=canonical_name,
            title=generated["title"] or display_from_data or canonical_name,
            description=generated["description"],
            importance=generated["importance"],
        )
        session.add(info)
        try:
            await session.commit()
            await session.refresh(info)
        except IntegrityError:
            # Another request generated this test info concurrently.
            await session.rollback()
            info = await session.get(TestInfo, canonical_name)
            if info is None:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to load cached test info after concurrent write.",
                )

    return TestInfoResponse(
        canonical_name=canonical_name,
        title=info.title,
        description=info.description,
        importance=info.importance,
        mentioned_as=sorted(raw_aliases),
    )


@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AskResponse:
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty")

    provider = _provider_or_400()
    n = body.last or settings.attention_window
    reports = await _load_recent_reports(session, n, user.id)
    payload = _reports_to_payload(reports)

    answer = await llm_ask(
        provider,
        body.question,
        payload,
        model=body.model or None,
        today=date.today(),
    )
    return AskResponse(
        answer=answer,
        reports_considered=len(reports),
        model=body.model,
    )
