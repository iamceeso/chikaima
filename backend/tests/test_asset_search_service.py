import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_search_service import AssetSearchService


class FakeField:
    def __init__(self, name: str) -> None:
        self.name = name

    def __eq__(self, other: object) -> "FakeCondition":
        return FakeCondition(("eq", self.name, other))

    def in_(self, values: set[str]) -> "FakeCondition":
        return FakeCondition(("in", self.name, tuple(sorted(values))))


class FakeCondition:
    def __init__(self, value: object) -> None:
        self.value = value

    def __and__(self, other: object) -> tuple[str, object, object]:
        return ("and", self.value, getattr(other, "value", other))


class FakeDistanceExpression:
    def __init__(self, vector: list[float]) -> None:
        self.vector = vector
        self.label_name: str | None = None
        self.asc_called = False

    def label(self, name: str) -> "FakeDistanceExpression":
        self.label_name = name
        return self

    def asc(self) -> tuple[str, tuple[float, ...]]:
        self.asc_called = True
        return ("asc", tuple(self.vector))


class FakeEmbeddingField:
    def __init__(self) -> None:
        self.distance_expression: FakeDistanceExpression | None = None

    def cosine_distance(self, vector: list[float]) -> FakeDistanceExpression:
        self.distance_expression = FakeDistanceExpression(vector)
        return self.distance_expression


class FakeAssetChunkModel:
    user_id = FakeField("user_id")
    source_type = FakeField("source_type")
    source_id = FakeField("source_id")
    asset_type = FakeField("asset_type")
    embedding = FakeEmbeddingField()


class FakeQuery:
    def __init__(self, rows: list[tuple[SimpleNamespace, float]]) -> None:
        self.rows = rows
        self.filters: list[tuple[object, ...]] = []
        self.ordering: object | None = None
        self.limit_value: int | None = None

    def filter(self, *criteria: object) -> "FakeQuery":
        self.filters.append(criteria)
        return self

    def order_by(self, ordering: object) -> "FakeQuery":
        self.ordering = ordering
        return self

    def limit(self, value: int) -> "FakeQuery":
        self.limit_value = value
        return self

    def all(self) -> list[tuple[SimpleNamespace, float]]:
        return self.rows


class FakeDB:
    def __init__(self, rows: list[tuple[SimpleNamespace, float]]) -> None:
        self.query_obj = FakeQuery(rows)
        self.query_args: tuple[object, ...] | None = None

    def query(self, *args: object) -> FakeQuery:
        self.query_args = args
        return self.query_obj


class AssetSearchServiceTests(unittest.TestCase):
    def test_init_creates_embeddings_service(self) -> None:
        with patch("app.services.asset_search_service.EmbeddingsService", return_value="embeddings") as factory:
            service = AssetSearchService(db="db")

        self.assertEqual(service.embeddings, "embeddings")
        factory.assert_called_once_with("db")

    def test_search_returns_empty_for_blank_query(self) -> None:
        service = object.__new__(AssetSearchService)
        service.db = SimpleNamespace()

        def unexpected_call(_: str) -> list[float]:
            raise AssertionError("generate_embedding should not run for blank queries")

        service.embeddings = SimpleNamespace(generate_embedding=unexpected_call)

        self.assertEqual(service.search("user-1", "   "), [])

    def test_search_returns_empty_for_empty_source_filters(self) -> None:
        service = object.__new__(AssetSearchService)
        service.db = SimpleNamespace()

        service.embeddings = SimpleNamespace(generate_embedding=lambda _: [0.1, 0.2, 0.3])

        self.assertEqual(service.search("user-1", "hello", source_filters={}), [])

    def test_search_applies_default_limit_and_optional_filters(self) -> None:
        row = (
            SimpleNamespace(
                source_type="document",
                source_id="doc-1",
                asset_type="text",
                filename="notes.txt",
                content="match",
            ),
            0.2,
        )
        db = FakeDB([row])
        service = object.__new__(AssetSearchService)
        service.db = db
        service.embeddings = SimpleNamespace(generate_embedding=lambda query: [0.1, 0.2])

        with (
            patch("app.services.asset_search_service.AssetChunk", FakeAssetChunkModel),
            patch("app.services.asset_search_service.settings", SimpleNamespace(rag_top_k=3)),
        ):
            results = service.search(
                "user-1",
                "hello",
                source_type="document",
                source_ids={"doc-1"},
                asset_types={"text"},
            )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].score, 0.8)
        self.assertEqual(results[0].chunks[0].score, 0.8)
        self.assertEqual(db.query_obj.limit_value, 24)
        self.assertEqual(db.query_obj.ordering, ("asc", (0.1, 0.2)))
        self.assertEqual(len(db.query_obj.filters), 4)

    def test_search_applies_source_ids_without_source_type(self) -> None:
        row = (
            SimpleNamespace(
                source_type="document",
                source_id="doc-2",
                asset_type="text",
                filename="notes.txt",
                content="match",
            ),
            0.1,
        )
        db = FakeDB([row])
        service = object.__new__(AssetSearchService)
        service.db = db
        service.embeddings = SimpleNamespace(generate_embedding=lambda query: [0.3])

        with patch("app.services.asset_search_service.AssetChunk", FakeAssetChunkModel):
            results = service.search("user-1", "hello", source_ids={"doc-2"}, limit=1)

        self.assertEqual(len(results), 1)
        self.assertEqual(len(db.query_obj.filters), 2)

    def test_search_groups_results_for_source_filters_and_limits_chunks(self) -> None:
        rows = [
            (
                SimpleNamespace(
                    source_type="document",
                    source_id="doc-1",
                    asset_type="text",
                    filename="notes.txt",
                    content="first",
                ),
                0.1,
            ),
            (
                SimpleNamespace(
                    source_type="document",
                    source_id="doc-1",
                    asset_type="text",
                    filename="notes.txt",
                    content="second",
                ),
                0.2,
            ),
            (
                SimpleNamespace(
                    source_type="document",
                    source_id="doc-1",
                    asset_type="text",
                    filename="notes.txt",
                    content="third",
                ),
                0.3,
            ),
            (
                SimpleNamespace(
                    source_type="document",
                    source_id="doc-1",
                    asset_type="text",
                    filename="notes.txt",
                    content="fourth",
                ),
                0.4,
            ),
            (
                SimpleNamespace(
                    source_type="video",
                    source_id="video-1",
                    asset_type="video",
                    filename="walkthrough.mp4",
                    content="best",
                ),
                0.05,
            ),
            (
                SimpleNamespace(
                    source_type="document",
                    source_id="doc-2",
                    asset_type="text",
                    filename="ignored.txt",
                    content="negative",
                ),
                1.5,
            ),
        ]
        db = FakeDB(rows)
        service = object.__new__(AssetSearchService)
        service.db = db
        service.embeddings = SimpleNamespace(generate_embedding=lambda query: [0.5])

        with (
            patch("app.services.asset_search_service.AssetChunk", FakeAssetChunkModel),
            patch("app.services.asset_search_service.or_", lambda *clauses: ("or", clauses)),
        ):
            results = service.search(
                "user-1",
                "hello",
                source_filters={"document": {"doc-1"}, "": {"skip"}, "video": set()},
                limit=2,
            )

        self.assertEqual([item.source_id for item in results], ["video-1", "doc-1"])
        self.assertEqual(results[0].score, 0.95)
        self.assertEqual(results[1].score, 0.9)
        self.assertEqual(len(results[1].chunks), 3)
        self.assertEqual([hit.chunk.content for hit in results[1].chunks], ["first", "second", "third"])
        self.assertEqual(db.query_obj.limit_value, 16)
        self.assertEqual(len(db.query_obj.filters), 2)
