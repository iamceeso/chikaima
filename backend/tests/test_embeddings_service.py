import unittest
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
    def test_generate_embedding_raises_when_no_provider_is_configured(self) -> None:
        service = embeddings_service.EmbeddingsService(db=Mock())

        with patch.object(service, "_list_embedding_providers", return_value=[]):
            with self.assertRaises(embeddings_service.NoEmbeddingProviderError):
                service.generate_embedding("user-1", "hello world")

    def test_generate_embedding_returns_first_successful_provider_vector(self) -> None:
        service = embeddings_service.EmbeddingsService(db=Mock())
        providers = [Mock(name="primary"), Mock(name="fallback")]

        with (
            patch.object(service, "_list_embedding_providers", return_value=providers),
            patch.object(
                service,
                "_generate_embedding_with_providers",
                return_value=[0.1, 0.2, 0.3],
            ) as generate_with_providers,
        ):
            result = service.generate_embedding("user-1", "")

        self.assertEqual(result, [0.1, 0.2, 0.3])
        generate_with_providers.assert_called_once_with(providers, "")

    def test_replace_chunks_for_source_adds_normalized_chunks_and_defaults_metadata(self) -> None:
        query = QueryRecorder()
        db = FakeDB(query)
        service = embeddings_service.EmbeddingsService(db)

        with (
            patch.object(service, "_list_embedding_providers", return_value=[Mock()]),
            patch.object(
                service,
                "_generate_embedding_with_providers",
                side_effect=lambda _providers, text: [float(len(text))],
            ),
        ):
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

    def test_replace_chunks_for_source_skips_storage_without_provider(self) -> None:
        query = QueryRecorder()
        db = FakeDB(query)
        service = embeddings_service.EmbeddingsService(db)

        with patch.object(service, "_list_embedding_providers", return_value=[]):
            stored_chunks = service.replace_chunks_for_source(
                user_id="user-1",
                source_type="document",
                source_id="doc-1",
                asset_type="text",
                filename="notes.txt",
                chunks=[("hello", {})],
            )

        self.assertEqual(stored_chunks, [])
        self.assertEqual(db.added, [])
        self.assertEqual(db.flush_calls, 1)

    def test_delete_chunks_for_source_returns_deleted_count(self) -> None:
        query = QueryRecorder(delete_result=4)
        db = FakeDB(query)
        service = embeddings_service.EmbeddingsService(db)

        deleted = service.delete_chunks_for_source(user_id="user-1", source_type="video", source_id="video-1")

        self.assertEqual(deleted, 4)
        self.assertEqual(query.delete_calls, [False])
        self.assertEqual(db.flush_calls, 1)
