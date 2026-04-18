from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_session
from app.models.orm import AuthSession, User

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email_or_400(email: str) -> str:
    normalized = normalize_email(email)
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Invalid email format")
    return normalized


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$16384$8$1$" + salt.hex() + "$" + digest.hex()


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n_str, r_str, p_str, salt_hex, digest_hex = encoded.split("$", 5)
    except ValueError:
        return False
    if algorithm != "scrypt":
        return False
    try:
        n = int(n_str)
        r = int(r_str)
        p = int(p_str)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except (ValueError, TypeError):
        return False

    actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p)
    return hmac.compare_digest(actual, expected)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def create_auth_session(
    db: AsyncSession,
    user: User,
    *,
    user_agent: str | None,
    ip_address: str | None,
) -> str:
    raw_token = secrets.token_urlsafe(48)
    now = _utcnow()
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
        last_seen_at=now,
        user_agent=(user_agent or "")[:255] or None,
        ip_address=(ip_address or "")[:64] or None,
    )
    db.add(auth_session)
    await db.flush()
    return raw_token


async def destroy_auth_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == _hash_token(token)))


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    now = _utcnow()
    stmt = (
        select(AuthSession)
        .where(AuthSession.token_hash == _hash_token(token))
        .where(AuthSession.expires_at > now)
        .options(selectinload(AuthSession.user))
    )
    auth_session = await db.scalar(stmt)
    if auth_session is None or auth_session.user is None or not auth_session.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return auth_session.user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
