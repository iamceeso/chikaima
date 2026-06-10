from __future__ import annotations

import json
import logging
from functools import lru_cache

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self, client: Redis) -> None:
        self.client = client

    def get_json(self, key: str) -> dict[str, object] | None:
        try:
            payload = self.client.get(key)
        except RedisError as exc:
            logger.warning("Redis get failed for %s: %s", key, exc)
            return None

        if not payload:
            return None

        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            logger.warning("Redis payload for %s was not valid JSON", key)
            return None

    def set_json(self, key: str, value: dict[str, object], ttl_seconds: int) -> None:
        try:
            self.client.setex(key, ttl_seconds, json.dumps(value))
        except RedisError as exc:
            logger.warning("Redis set failed for %s: %s", key, exc)

    def delete(self, *keys: str) -> None:
        if not keys:
            return
        try:
            self.client.delete(*keys)
        except RedisError as exc:
            logger.warning("Redis delete failed for %s: %s", ", ".join(keys), exc)


@lru_cache(maxsize=1)
def get_cache_service() -> CacheService:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    return CacheService(client)
