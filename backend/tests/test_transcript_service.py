import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.services.transcript_service import TranscriptService


class TranscriptServiceTests(unittest.TestCase):
    def test_get_resource_rejects_unsupported_type(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.get_resource("user-1", "image", "asset-1")

        self.assertEqual(context.exception.status_code, 400)

    def test_delete_all_resources_rejects_unsupported_type(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.delete_all_resources("user-1", "image")

        self.assertEqual(context.exception.status_code, 400)

    def test_query_transcript_rejects_missing_transcript(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(get=lambda model, transcript_id: None)
        service.llm = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.query_transcript("user-1", "missing", "What happened?")

        self.assertEqual(context.exception.status_code, 404)

    def test_query_resource_falls_back_to_transcript_when_search_has_no_hits(self) -> None:
        service = object.__new__(TranscriptService)
        prompts: list[list[dict[str, str]]] = []
        service.db = SimpleNamespace()
        service.search = SimpleNamespace(search=lambda *args, **kwargs: [])
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda provider, model, messages: prompts.append(messages) or "answer",
        )
        service.get_resource = lambda user_id, resource_type, resource_id: SimpleNamespace(name="walkthrough.mp4")  # type: ignore[method-assign]
        service.get_for_resource = (  # type: ignore[method-assign]
            lambda user_id, resource_type, resource_id: SimpleNamespace(content="Full transcript text")
        )
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: []  # type: ignore[method-assign]

        answer = service.query_resource("user-1", "video", "video-1", "What does it cover?")

        self.assertEqual(answer, "answer")
        self.assertEqual(len(prompts), 1)
        self.assertIn("Transcript:\nFull transcript text", prompts[0][1]["content"])
        self.assertIn("Question: What does it cover?", prompts[0][1]["content"])

    def test_generate_summary_bundle_returns_fallback_when_llm_fails(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        bundle = service._generate_summary_bundle(
            "user-1",
            "document",
            "Notes.pdf",
            "This transcript contains details about onboarding.",
        )

        self.assertIn("Notes.pdf contains extracted document content.", bundle["summary"])
        self.assertEqual(bundle["action_items"], [])
        self.assertEqual(bundle["chapters"], [])

    def test_parse_bullets_and_format_citation_cover_supported_metadata(self) -> None:
        service = object.__new__(TranscriptService)

        bullets = service._parse_bullets("- first\n* second\nthird")

        self.assertEqual(bullets, ["first", "second", "third"])
        self.assertEqual(service._format_citation("slides.pptx", {"slide": 3}), "slides.pptx slide 3")
        self.assertEqual(service._format_citation("sheet.xlsx", {"sheet": "Budget"}), "sheet.xlsx sheet Budget")
        self.assertEqual(service._format_citation("main.py", {"start_line": 10, "end_line": 22}), "main.py lines 10-22")
        self.assertEqual(service._format_citation("notes.txt", {"chunk_index": 4}), "notes.txt chunk 4")
        self.assertEqual(service._format_citation("plain.txt", "bad-meta"), "plain.txt")

