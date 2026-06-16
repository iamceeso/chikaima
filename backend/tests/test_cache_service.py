import unittest
from unittest.mock import patch

from redis.exceptions import RedisError

from app.services import cache_service


class CacheServiceTests(unittest.TestCase):
    def tearDown(self) -> None:
        cache_service.get_cache_service.cache_clear()

    def test_get_json_returns_parsed_payload(self) -> None:
        client = type("Client", (), {"get": lambda self, key: '{"ok": true}'})()
        service = cache_service.CacheService(client)

        self.assertEqual(service.get_json("cache:key"), {"ok": True})

    def test_get_json_returns_none_for_missing_payload(self) -> None:
        client = type("Client", (), {"get": lambda self, key: ""})()
        service = cache_service.CacheService(client)

        self.assertIsNone(service.get_json("cache:key"))

    def test_get_json_handles_redis_errors_and_invalid_json(self) -> None:
        class FailingClient:
            def __init__(self) -> None:
                self.payload = "{bad json}"

            def get(self, key: str) -> str:
                if key == "broken":
                    raise RedisError("offline")
                return self.payload

        service = cache_service.CacheService(FailingClient())

        with self.assertLogs("app.services.cache_service", level="WARNING") as logs:
            self.assertIsNone(service.get_json("broken"))
            self.assertIsNone(service.get_json("invalid"))

        self.assertIn("Redis get failed for broken", logs.output[0])
        self.assertIn("Redis payload for invalid was not valid JSON", logs.output[1])

    def test_set_json_serializes_payload(self) -> None:
        captured: list[tuple[str, int, str]] = []

        class Client:
            def setex(self, key: str, ttl: int, payload: str) -> None:
                captured.append((key, ttl, payload))

        service = cache_service.CacheService(Client())
        service.set_json("cache:key", {"count": 2}, 60)

        self.assertEqual(captured, [("cache:key", 60, '{"count": 2}')])

    def test_set_json_logs_redis_errors(self) -> None:
        class Client:
            def setex(self, key: str, ttl: int, payload: str) -> None:
                raise RedisError("offline")

        service = cache_service.CacheService(Client())

        with self.assertLogs("app.services.cache_service", level="WARNING") as logs:
            service.set_json("cache:key", {"count": 2}, 60)

        self.assertIn("Redis set failed for cache:key", logs.output[0])

    def test_delete_skips_empty_keys_and_logs_redis_errors(self) -> None:
        calls: list[tuple[str, ...]] = []

        class Client:
            def delete(self, *keys: str) -> None:
                calls.append(keys)
                raise RedisError("offline")

        service = cache_service.CacheService(Client())
        service.delete()

        with self.assertLogs("app.services.cache_service", level="WARNING") as logs:
            service.delete("a", "b")

        self.assertEqual(calls, [("a", "b")])
        self.assertIn("Redis delete failed for a, b", logs.output[0])

    def test_get_cache_service_caches_client(self) -> None:
        client = object()

        with patch("app.services.cache_service.Redis.from_url", return_value=client) as from_url:
            first = cache_service.get_cache_service()
            second = cache_service.get_cache_service()

        self.assertIs(first, second)
        self.assertIs(first.client, client)
        from_url.assert_called_once_with(cache_service.settings.redis_url, decode_responses=True)
