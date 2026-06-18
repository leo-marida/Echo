import logging

import redis.asyncio as redis
from app.config import settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None


async def init_redis() -> None:
    global _redis
    _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    await _redis.ping()
    logger.info("Connected to Redis at %s", settings.REDIS_URL)


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


def get_redis() -> redis.Redis:
    if _redis is None:
        raise RuntimeError("Redis client not initialized — call init_redis() first")
    return _redis


async def publish(channel: str, message: str) -> None:
    await get_redis().publish(channel, message)


async def subscribe(channel: str) -> redis.client.PubSub:
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)
    return pubsub
