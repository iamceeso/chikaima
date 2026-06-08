import unittest
from types import SimpleNamespace

from app.services.asset_search_service import AssetSearchService


class AssetSearchServiceTests(unittest.TestCase):
    def test_search_returns_empty_for_blank_query(self) -> None:
        service = object.__new__(AssetSearchService)
        service.db = SimpleNamespace()

        def unexpected_call(_: str) -> list[float]:
            raise AssertionError("generate_embedding should not run for blank queries")

        service.embeddings = SimpleNamespace(generate_embedding=unexpected_call)

        self.assertEqual(service.search("user-1", "   "), [])
