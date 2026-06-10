import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.asset_search_service import ChunkSearchHit, RetrievalSource
from app.services.llm_service import LLMService


def make_service() -> LLMService:
    service = object.__new__(LLMService)
    service.db = SimpleNamespace()
    service.asset_search = SimpleNamespace()
    return service


class LLMServiceTests(unittest.TestCase):
    def test_generate_reply_raises_when_provider_returns_empty_content(self) -> None:
        service = make_service()
        service._build_adapter = lambda provider: SimpleNamespace(  # type: ignore[method-assign]
            generate_reply=lambda model_key, messages: ""
        )

        with self.assertRaises(HTTPException) as context:
            service.generate_reply(
                SimpleNamespace(),
                SimpleNamespace(model_key="model"),
                [{"role": "user", "content": "Hi"}],
            )

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(context.exception.detail, "The AI provider returned an empty response.")

    def test_stream_reply_skips_empty_chunks(self) -> None:
        service = make_service()
        service._build_adapter = lambda provider: SimpleNamespace(  # type: ignore[method-assign]
            stream_reply=lambda model_key, messages: iter(["", "Hello", "", " world"])
        )

        chunks = list(service.stream_reply(SimpleNamespace(), SimpleNamespace(model_key="model"), []))

        self.assertEqual(chunks, ["Hello", " world"])

    def test_stream_reply_raises_when_all_chunks_are_empty(self) -> None:
        service = make_service()
        service._build_adapter = lambda provider: SimpleNamespace(  # type: ignore[method-assign]
            stream_reply=lambda model_key, messages: iter(["", ""])
        )

        with self.assertRaises(HTTPException) as context:
            list(service.stream_reply(SimpleNamespace(), SimpleNamespace(model_key="model"), []))

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(
            context.exception.detail,
            "The AI provider returned an empty streamed response.",
        )

    def test_generate_reply_with_rag_builds_citations_and_context(self) -> None:
        service = make_service()
        captured_messages: list[dict[str, str]] = []
        chunk = SimpleNamespace(
            id="chunk-1",
            chunk_index=4,
            meta={"page": 2, "chunk_index": 4},
            content="Workspace revenue grew 25 percent year over year.",
        )
        search_results = [
            RetrievalSource(
                source_type="document",
                source_id="doc-1",
                asset_type="document",
                filename="report.pdf",
                score=0.91,
                chunks=[ChunkSearchHit(chunk=chunk, score=0.91)],
            )
        ]

        with (
            patch.object(service, "_search_with_fallback", return_value=search_results),
            patch.object(
                service,
                "generate_reply",
                side_effect=lambda provider, model, messages: captured_messages.extend(messages) or "Answer with citation",
            ),
        ):
            answer, citations = service.generate_reply_with_rag(
                "user-1",
                SimpleNamespace(),
                SimpleNamespace(),
                [{"role": "user", "content": "How did revenue change?"}],
            )

        self.assertEqual(answer, "Answer with citation")
        self.assertEqual(
            citations,
            [
                {
                    "source_type": "document",
                    "source_id": "doc-1",
                    "asset_type": "document",
                    "filename": "report.pdf",
                    "chunk_id": "chunk-1",
                    "chunk_index": 4,
                    "reference": "report.pdf p.2",
                    "excerpt": "Workspace revenue grew 25 percent year over year.",
                    "location": {"page": 2, "chunk_index": 4},
                    "score": 0.91,
                }
            ],
        )
        self.assertEqual(captured_messages[0]["role"], "system")
        self.assertIn("report.pdf p.2", captured_messages[0]["content"])
        self.assertIn(
            "Workspace revenue grew 25 percent year over year.",
            captured_messages[0]["content"],
        )
        self.assertEqual(
            captured_messages[-1],
            {"role": "user", "content": "How did revenue change?"},
        )

    def test_generate_reply_with_rag_falls_back_when_search_finds_nothing(self) -> None:
        service = make_service()
        captured_messages: list[dict[str, str]] = []
        original_messages = [{"role": "user", "content": "Hello"}]

        with (
            patch.object(service, "_search_with_fallback", return_value=[]),
            patch.object(
                service,
                "generate_reply",
                side_effect=lambda provider, model, messages: captured_messages.extend(messages) or "Plain answer",
            ),
        ):
            answer, citations = service.generate_reply_with_rag(
                "user-1",
                SimpleNamespace(),
                SimpleNamespace(),
                original_messages,
            )

        self.assertEqual(answer, "Plain answer")
        self.assertEqual(citations, [])
        self.assertEqual(captured_messages, original_messages)

    def test_build_citation_formats_known_locations(self) -> None:
        service = make_service()

        cases = [
            ({"page": 8}, "slides.pdf p.8"),
            ({"slide": 5}, "slides.pdf slide 5"),
            ({"sheet": "Summary"}, "slides.pdf sheet Summary"),
            ({"start_line": 4, "end_line": 9}, "slides.pdf lines 4-9"),
            ({}, "slides.pdf chunk 0"),
        ]

        for metadata, expected in cases:
            with self.subTest(metadata=metadata):
                self.assertEqual(service._build_citation("slides.pdf", metadata), expected)

    def test_extract_location_returns_supported_fields_only(self) -> None:
        service = make_service()

        location = service._extract_location(
            {
                "page": 3,
                "chunk_index": 1,
                "section_index": "intro",
                "ignored": {"nested": True},
            }
        )

        self.assertEqual(
            location,
            {
                "page": 3,
                "chunk_index": 1,
                "section_index": "intro",
            },
        )

    def test_build_adapter_requires_api_key_for_non_ollama_provider(self) -> None:
        service = make_service()
        provider = SimpleNamespace(
            provider_type="openai",
            name="Primary OpenAI",
            encrypted_config={},
        )

        with self.assertRaises(HTTPException) as context:
            service._build_adapter(provider)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Primary OpenAI is missing an API key.")
