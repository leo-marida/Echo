import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


def _to_asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def init_db() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        _to_asyncpg_dsn(settings.DATABASE_URL),
        min_size=1,
        max_size=5,
    )


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_db_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_db() first")
    return _pool
