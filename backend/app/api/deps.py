import asyncpg
from app.db.client import get_db_pool


async def get_db() -> asyncpg.Pool:
    return get_db_pool()
