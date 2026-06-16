import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services import embeddings_service


class QueryRecorder:
    def __init__(self, delete_result: int = 0) -> None:
        self.delete_result = delete_result
        self.filter_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
        self.delete_calls: list[bool] = []

    def filter(self, *args: object, **kwargs: object) -> "QueryRecorder":
        self.filter_calls.append((args, kwargs))
        return self

    def delete(self, synchronize_session: bool = False) -> int:
        self.delete_calls.append(synchronize_session)
        return self.delete_result


class FakeDB:
    def __init__(self, query: QueryRecorder) -> None:
        self.query_recorder = query
        self.added: list[object] = []
        self.flush_calls = 0

    def query(self, model: object) -> QueryRecorder:
        return self.query_recorder

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        self.flush_calls += 1


class EmbeddingsServiceTests(unittest.TestCase):
    def tearDown(self) -> None:
        embeddings_service.get_embedding_model.cache_clear()

    def test_get_embedding_model_is_cached(self) -> None:
        factory = Mock(side_effect=["model-1", "model-2"])

        with patch("app.services.embeddings_service.SentenceTransformer", factory):
            first = embeddings_service.get_embedding_model()
            second = embeddings_service.get_embedding_model()

        self.assertEqual(first, "model-1")
        self.assertIs(first, second)
        factory.assert_called_once_with(embeddings_service.settings.embedding_model)

    def test_generate_embedding_uses_empty_string_fallback(self) -> None:
        vector = SimpleNamespace(tolist=lambda: [0.1, 0.2, 0.3])
        model = Mock()
        model.encode.return_value = vector

        with patch("app.services.embeddings_service.get_embedding_model", return_value=model):
            service = embeddings_service.EmbeddingsService(db=SimpleNamespace())

        self.assertEqual(service.generate_embedding(""), [0.1, 0.2, 0.3])
        model.encode.assert_called_once_with("", convert_to_numpy=True, show_progress_bar=False)

    def test_replace_chunks_for_source_adds_normalized_chunks_and_defaults_metadata(self) -> None:
        query = QueryRecorder()
        db = FakeDB(query)
        service = object.__new__(embeddings_service.EmbeddingsService)
        service.db = db
        service.model = Mock()
        service.generate_embedding = lambda text: [float(len(text))]  # type: ignore[method-assign]

        stored_chunks = service.replace_chunks_for_source(
            user_id="user-1",
            source_type="document",
            source_id="doc-1",
            asset_type="text",
            filename="notes.txt",
            chunks=[
                ("  first chunk  ", None),
                ("   ", {"ignored": True}),
                ("second chunk", {"chunk_index": 99, "filename": "override.txt", "extra": "value"}),
            ],
        )

        self.assertEqual(len(stored_chunks), 2)
        self.assertEqual(len(db.added), 2)
        self.assertEqual(db.flush_calls, 1)
        self.assertEqual(query.delete_calls, [False])
        self.assertEqual(stored_chunks[0].content, "first chunk")
        self.assertEqual(
            stored_chunks[0].meta,
            {
                "chunk_index": 0,
                "source_type": "document",
                "source_id": "doc-1",
                "asset_type": "text",
                "filename": "notes.txt",
            },
        )
        self.assertEqual(stored_chunks[1].chunk_index, 2)
        self.assertEqual(
            stored_chunks[1].meta,
            {
                "chunk_index": 99,
                "filename": "override.txt",
                "extra": "value",
                "source_type": "document",
                "source_id": "doc-1",
                "asset_type": "text",
            },
        )

    def test_delete_chunks_for_source_returns_deleted_count(self) -> None:
        query = QueryRecorder(delete_result=4)
        db = FakeDB(query)
        service = object.__new__(embeddings_service.EmbeddingsService)
        service.db = db
        service.model = Mock()

        deleted = service.delete_chunks_for_source(user_id="user-1", source_type="video", source_id="video-1")

        self.assertEqual(deleted, 4)
        self.assertEqual(query.delete_calls, [False])
        self.assertEqual(db.flush_calls, 1)
