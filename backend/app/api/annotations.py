from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.orm import Annotation, User
from app.models.schemas import AnnotationCreate, AnnotationRead
from app.services.auth import get_current_user

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("", response_model=list[AnnotationRead])
async def list_annotations(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[Annotation]:
    stmt = (
        select(Annotation)
        .where(Annotation.user_id == user.id)
        .order_by(Annotation.date, Annotation.id)
    )
    return list((await session.execute(stmt)).scalars().all())


@router.post("", response_model=AnnotationRead, status_code=201)
async def create_annotation(
    body: AnnotationCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Annotation:
    annotation = Annotation(user_id=user.id, date=body.date, label=body.label.strip())
    session.add(annotation)
    await session.commit()
    await session.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}", status_code=204)
async def delete_annotation(
    annotation_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    annotation = await session.get(Annotation, annotation_id)
    if annotation is None or annotation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await session.delete(annotation)
    await session.commit()
    return Response(status_code=204)
