from collections.abc import AsyncIterator

from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


_engine_kwargs: dict = {"echo": False, "future": True}
if settings.database_url.startswith("sqlite"):
    # Let SQLite wait for write locks instead of failing immediately.
    _engine_kwargs["connect_args"] = {"timeout": 30}

engine = create_async_engine(settings.database_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from app.models import orm  # noqa: F401

    async with engine.begin() as conn:
        if settings.database_url.startswith("sqlite"):
            # Better concurrent behavior for read-heavy + bursty write workloads.
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
            await conn.execute(text("PRAGMA busy_timeout=30000"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_schema_upgrades)
    await _ensure_bootstrap_admin()


def _ensure_schema_upgrades(sync_conn) -> None:
    """Lightweight forward-only upgrades for existing local DBs."""
    inspector = inspect(sync_conn)
    table_names = set(inspector.get_table_names())
    if "reports" not in table_names:
        return

    report_cols = {col["name"] for col in inspector.get_columns("reports")}
    if "user_id" not in report_cols:
        sync_conn.execute(text("ALTER TABLE reports ADD COLUMN user_id INTEGER"))


async def _ensure_bootstrap_admin() -> None:
    login = settings.bootstrap_admin_login.strip().lower()
    password = settings.bootstrap_admin_password
    if not login or not password:
        return

    from app.models.orm import User
    from app.services.auth import hash_password

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == login))
        if user is None:
            session.add(
                User(
                    email=login,
                    password_hash=hash_password(password),
                    role="admin",
                    is_active=True,
                )
            )
            await session.commit()
            return

        changed = False
        if user.role != "admin":
            user.role = "admin"
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if changed:
            await session.commit()
