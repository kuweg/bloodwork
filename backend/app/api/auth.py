from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models.orm import User
from app.models.schemas import AuthLoginRequest, AuthRegisterRequest, AuthResponse, UserRead
from app.services.auth import (
    create_auth_session,
    destroy_auth_session,
    get_current_user,
    hash_password,
    normalize_email,
    validate_email_or_400,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_cookie_kwargs() -> dict:
    max_age = settings.session_ttl_hours * 60 * 60
    return {
        "httponly": True,
        "secure": settings.session_secure_cookie,
        "samesite": "lax",
        "max_age": max_age,
        "path": "/",
    }


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        **_session_cookie_kwargs(),
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        samesite="lax",
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(
    body: AuthRegisterRequest,
    response: Response,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    email = validate_email_or_400(body.email)
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role="user",
        is_active=True,
    )
    session.add(user)
    await session.flush()

    token = await create_auth_session(
        session,
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()

    _set_session_cookie(response, token)
    return AuthResponse(user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(
    body: AuthLoginRequest,
    response: Response,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    email = normalize_email(body.email)
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    token = await create_auth_session(
        session,
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()

    _set_session_cookie(response, token)
    return AuthResponse(user=UserRead.model_validate(user))


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await destroy_auth_session(session, token)
        await session.commit()
    _clear_session_cookie(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=AuthResponse)
async def me(user: User = Depends(get_current_user)) -> AuthResponse:
    return AuthResponse(user=UserRead.model_validate(user))
