import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.services.transcript_service import TranscriptService


class TranscriptServiceTests(unittest.TestCase):
    def test_init_builds_llm_and_search_services(self) -> None:
        db = SimpleNamespace()

        with (
            unittest.mock.patch("app.services.transcript_service.LLMService", return_value="llm") as llm_service,
            unittest.mock.patch("app.services.transcript_service.AssetSearchService", return_value="search") as search_service,
        ):
            service = TranscriptService(db)

        self.assertIs(service.db, db)
        self.assertEqual(service.llm, "llm")
        self.assertEqual(service.search, "search")
        llm_service.assert_called_once_with(db)
        search_service.assert_called_once_with(db)

    def test_get_for_resource_returns_latest_transcript(self) -> None:
        transcript = SimpleNamespace(id="transcript-1")
        query = SimpleNamespace(filter=lambda *_args, **_kwargs: query, order_by=lambda *_args, **_kwargs: query, first=lambda: transcript)
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(query=lambda _model: query)

        result = service.get_for_resource("user-1", "video", "video-1")

        self.assertIs(result, transcript)

    def test_get_for_resource_rejects_missing_transcript(self) -> None:
        query = SimpleNamespace(filter=lambda *_args, **_kwargs: query, order_by=lambda *_args, **_kwargs: query, first=lambda: None)
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(query=lambda _model: query)

        with self.assertRaises(HTTPException) as context:
            service.get_for_resource("user-1", "video", "video-1")

        self.assertEqual(context.exception.status_code, 404)

    def test_get_resource_rejects_unsupported_type(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.get_resource("user-1", "image", "asset-1")

        self.assertEqual(context.exception.status_code, 400)

    def test_get_resource_returns_owned_resource(self) -> None:
        resource = SimpleNamespace(user_id="user-1")
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(get=lambda model, resource_id: resource)

        self.assertIs(service.get_resource("user-1", "document", "doc-1"), resource)

    def test_get_resource_rejects_missing_or_unowned_resource(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(get=lambda model, resource_id: None)

        with self.assertRaises(HTTPException) as missing_context:
            service.get_resource("user-1", "document", "doc-1")

        self.assertEqual(missing_context.exception.status_code, 404)

        service.db = SimpleNamespace(get=lambda model, resource_id: SimpleNamespace(user_id="user-2"))
        with self.assertRaises(HTTPException) as unowned_context:
            service.get_resource("user-1", "document", "doc-1")

        self.assertEqual(unowned_context.exception.status_code, 404)

    def test_delete_all_resources_rejects_unsupported_type(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.delete_all_resources("user-1", "image")

        self.assertEqual(context.exception.status_code, 400)

    def test_delete_all_resources_deletes_each_resource_and_returns_count(self) -> None:
        resources = [SimpleNamespace(id="doc-1"), SimpleNamespace(id="doc-2")]
        query = SimpleNamespace(filter=lambda *_args, **_kwargs: query, all=lambda: resources)
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(query=lambda _model: query)
        deleted: list[tuple[str, str, str]] = []
        service.delete_resource = lambda user_id, resource_type, resource_id: deleted.append((user_id, resource_type, resource_id))  # type: ignore[method-assign]

        count = service.delete_all_resources("user-1", "document")

        self.assertEqual(count, 2)
        self.assertEqual(deleted, [("user-1", "document", "doc-1"), ("user-1", "document", "doc-2")])

    def test_list_summaries_for_resource_returns_rows(self) -> None:
        summaries = [SimpleNamespace(id="summary-1")]
        query = SimpleNamespace(filter=lambda *_args, **_kwargs: query, order_by=lambda *_args, **_kwargs: query, all=lambda: summaries)
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(query=lambda _model: query)

        self.assertEqual(service.list_summaries_for_resource("user-1", "document", "doc-1"), summaries)

    def test_query_transcript_rejects_missing_transcript(self) -> None:
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(get=lambda model, transcript_id: None)
        service.llm = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.query_transcript("user-1", "missing", "What happened?")

        self.assertEqual(context.exception.status_code, 404)

    def test_query_transcript_uses_llm_for_existing_transcript(self) -> None:
        transcript = SimpleNamespace(user_id="user-1", content="Transcript body")
        prompts: list[list[dict[str, str]]] = []
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(get=lambda model, transcript_id: transcript)
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda provider, model, messages: prompts.append(messages) or "answer",
        )

        answer = service.query_transcript("user-1", "transcript-1", "What happened?")

        self.assertEqual(answer, "answer")
        self.assertIn("Transcript:\nTranscript body", prompts[0][1]["content"])

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

    def test_query_resource_prefers_search_hits_and_summary_metadata(self) -> None:
        service = object.__new__(TranscriptService)
        prompts: list[list[dict[str, str]]] = []
        hit = SimpleNamespace(chunk=SimpleNamespace(content="Relevant quote", meta={"page": 2}))
        search_result = SimpleNamespace(source_type="document", source_id="doc-1", chunks=[hit])
        service.db = SimpleNamespace()
        service.search = SimpleNamespace(search=lambda *args, **kwargs: [search_result])
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda provider, model, messages: prompts.append(messages) or "answer",
        )
        service.get_resource = lambda user_id, resource_type, resource_id: SimpleNamespace(name="notes.pdf")  # type: ignore[method-assign]
        service.get_for_resource = lambda user_id, resource_type, resource_id: SimpleNamespace(content="Long transcript")  # type: ignore[method-assign]
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: [  # type: ignore[method-assign]
            SimpleNamespace(summary_type="summary", content="Brief summary", data={}),
            SimpleNamespace(summary_type="key_points", content="", data={"items": ["Point A"]}),
        ]

        answer = service.query_resource("user-1", "document", "doc-1", "Question?")

        self.assertEqual(answer, "answer")
        self.assertIn("Summary:\nBrief summary", prompts[0][1]["content"])
        self.assertIn("Relevant excerpts:\n[notes.pdf page 2]\nRelevant quote", prompts[0][1]["content"])

    def test_query_resource_ignores_non_list_key_points_data(self) -> None:
        service = object.__new__(TranscriptService)
        prompts: list[list[dict[str, str]]] = []
        service.db = SimpleNamespace()
        service.search = SimpleNamespace(search=lambda *args, **kwargs: [])
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda provider, model, messages: prompts.append(messages) or "answer",
        )
        service.get_resource = lambda user_id, resource_type, resource_id: SimpleNamespace(name="notes.pdf")  # type: ignore[method-assign]
        service.get_for_resource = lambda user_id, resource_type, resource_id: SimpleNamespace(content="Long transcript")  # type: ignore[method-assign]
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: [  # type: ignore[method-assign]
            SimpleNamespace(summary_type="key_points", content="", data={"items": "bad-data"}),
        ]

        answer = service.query_resource("user-1", "document", "doc-1", "Question?")

        self.assertEqual(answer, "answer")
        self.assertNotIn("Key points:", prompts[0][1]["content"])

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

    def test_generate_summary_bundle_populates_audio_and_video_fields(self) -> None:
        replies = iter(
            [
                "Summary text",
                "- Point one\n- Point two",
                "- Action item",
                "- Chapter 1\n- Chapter 2",
            ]
        )
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace()
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda *args, **kwargs: next(replies),
        )

        bundle = service._generate_summary_bundle("user-1", "video", "Walkthrough.mp4", "Transcript body")

        self.assertEqual(bundle["summary"], "Summary text")
        self.assertEqual(bundle["key_points"], ["Point one", "Point two"])
        self.assertEqual(bundle["action_items"], ["Action item"])
        self.assertEqual(bundle["chapters"], ["Chapter 1", "Chapter 2"])

    def test_generate_summary_bundle_populates_audio_and_document_specific_fields(self) -> None:
        audio_replies = iter(
            [
                "Summary text",
                "- Point one",
                "- Action item",
            ]
        )
        audio_service = object.__new__(TranscriptService)
        audio_service.db = SimpleNamespace()
        audio_service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda *args, **kwargs: next(audio_replies),
        )

        audio_bundle = audio_service._generate_summary_bundle("user-1", "audio", "Call.wav", "Transcript body")

        self.assertEqual(audio_bundle["chapters"], [])
        self.assertEqual(audio_bundle["action_items"], ["Action item"])

        document_replies = iter(
            [
                "Summary text",
                "- Point one",
            ]
        )
        document_service = object.__new__(TranscriptService)
        document_service.db = SimpleNamespace()
        document_service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: ("model-1", "provider-1"),
            generate_reply=lambda *args, **kwargs: next(document_replies),
        )

        document_bundle = document_service._generate_summary_bundle("user-1", "document", "Notes.pdf", "Transcript body")

        self.assertEqual(document_bundle["action_items"], [])
        self.assertEqual(document_bundle["chapters"], [])

    def test_summarize_resource_updates_document_summary_and_returns_artifacts(self) -> None:
        document = SimpleNamespace(name="notes.pdf", summary=None)
        transcript = SimpleNamespace(content="Transcript body")
        added_batches: list[list[object]] = []
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(
            add_all=lambda items: added_batches.append(list(items)),
            add=lambda _item: None,
            commit=lambda: None,
        )
        service.get_resource = lambda user_id, resource_type, resource_id: document  # type: ignore[method-assign]
        service.get_for_resource = lambda user_id, resource_type, resource_id: transcript  # type: ignore[method-assign]
        service._generate_summary_bundle = lambda *args, **kwargs: {  # type: ignore[method-assign]
            "summary": "Summary text",
            "key_points": ["Point one"],
            "action_items": [],
            "chapters": [],
        }
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: []  # type: ignore[method-assign]

        with unittest.mock.patch("app.services.transcript_service.SummaryArtifact", side_effect=lambda **kwargs: SimpleNamespace(**kwargs)):
            artifacts = service.summarize_resource("user-1", "document", "doc-1")

        self.assertEqual(document.summary, "Summary text")
        self.assertEqual(artifacts, [])

    def test_summarize_resource_updates_video_summary_fields(self) -> None:
        video = SimpleNamespace(name="walkthrough.mp4", summary=None, chapters=[], action_items=[])
        transcript = SimpleNamespace(content="Transcript body")
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(
            add_all=lambda _items: None,
            add=lambda _item: None,
            commit=lambda: None,
        )
        service.get_resource = lambda user_id, resource_type, resource_id: video  # type: ignore[method-assign]
        service.get_for_resource = lambda user_id, resource_type, resource_id: transcript  # type: ignore[method-assign]
        service._generate_summary_bundle = lambda *args, **kwargs: {  # type: ignore[method-assign]
            "summary": "Summary text",
            "key_points": ["Point one"],
            "action_items": ["Follow up"],
            "chapters": ["Intro"],
        }
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: []  # type: ignore[method-assign]

        with unittest.mock.patch("app.services.transcript_service.SummaryArtifact", side_effect=lambda **kwargs: SimpleNamespace(**kwargs)):
            artifacts = service.summarize_resource("user-1", "video", "video-1")

        self.assertEqual(video.summary, "Summary text")
        self.assertEqual(video.chapters, ["Intro"])
        self.assertEqual(video.action_items, ["Follow up"])
        self.assertEqual(artifacts, [])

    def test_summarize_resource_leaves_audio_resource_fields_unchanged(self) -> None:
        audio = SimpleNamespace(name="call.wav", transcript="Transcript")
        transcript = SimpleNamespace(content="Transcript body")
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(
            add_all=lambda _items: None,
            add=lambda _item: None,
            commit=lambda: None,
        )
        service.get_resource = lambda user_id, resource_type, resource_id: audio  # type: ignore[method-assign]
        service.get_for_resource = lambda user_id, resource_type, resource_id: transcript  # type: ignore[method-assign]
        service._generate_summary_bundle = lambda *args, **kwargs: {  # type: ignore[method-assign]
            "summary": "Summary text",
            "key_points": ["Point one"],
            "action_items": ["Follow up"],
            "chapters": ["Intro"],
        }
        service.list_summaries_for_resource = lambda user_id, resource_type, resource_id: []  # type: ignore[method-assign]

        with unittest.mock.patch("app.services.transcript_service.SummaryArtifact", side_effect=lambda **kwargs: SimpleNamespace(**kwargs)):
            artifacts = service.summarize_resource("user-1", "audio", "audio-1")

        self.assertEqual(audio.transcript, "Transcript")
        self.assertEqual(artifacts, [])

    def test_delete_resource_removes_related_records_and_commits(self) -> None:
        resource = SimpleNamespace(user_id="user-1", file_path="/tmp/file", id="doc-1")
        deleted_filters: list[str] = []

        class Query:
            def __init__(self, name: str, all_result=None) -> None:
                self.name = name
                self.all_result = all_result or []

            def filter(self, *_args, **_kwargs):
                return self

            def all(self):
                return self.all_result

            def delete(self, synchronize_session=False):
                deleted_filters.append(self.name)
                return 1

            def order_by(self, *_args, **_kwargs):
                return self

            def first(self):
                return None

        transcript_rows = [SimpleNamespace(id="t-1")]
        summary_rows = [SimpleNamespace(id="s-1")]
        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(
            get=lambda model, resource_id: resource,
            query=lambda model: Query(
                model.__name__,
                transcript_rows if model.__name__ == "Transcript" else summary_rows if model.__name__ == "SummaryArtifact" else [],
            ),
            delete=lambda item: deleted_filters.append(f"delete:{item.id}"),
            commit=lambda: deleted_filters.append("commit"),
        )

        with unittest.mock.patch("app.services.transcript_service.storage_service.delete_file") as delete_file:
            service.delete_resource("user-1", "document", "doc-1")

        delete_file.assert_called_once_with("/tmp/file")
        self.assertIn("Embedding", deleted_filters)
        self.assertIn("delete:doc-1", deleted_filters)
        self.assertIn("commit", deleted_filters)

    def test_delete_resource_skips_embedding_cleanup_when_related_rows_are_missing(self) -> None:
        resource = SimpleNamespace(user_id="user-1", file_path="/tmp/file", id="doc-1")
        deleted_filters: list[str] = []

        class Query:
            def __init__(self, name: str, all_result=None) -> None:
                self.name = name
                self.all_result = all_result or []

            def filter(self, *_args, **_kwargs):
                return self

            def all(self):
                return self.all_result

            def delete(self, synchronize_session=False):
                deleted_filters.append(self.name)
                return 1

            def order_by(self, *_args, **_kwargs):
                return self

            def first(self):
                return None

        service = object.__new__(TranscriptService)
        service.db = SimpleNamespace(
            get=lambda model, resource_id: resource,
            query=lambda model: Query(model.__name__, []),
            delete=lambda item: deleted_filters.append(f"delete:{item.id}"),
            commit=lambda: deleted_filters.append("commit"),
        )

        with unittest.mock.patch("app.services.transcript_service.storage_service.delete_file"):
            service.delete_resource("user-1", "document", "doc-1")

        self.assertEqual(deleted_filters.count("Embedding"), 1)

    def test_parse_bullets_and_format_citation_cover_supported_metadata(self) -> None:
        service = object.__new__(TranscriptService)

        bullets = service._parse_bullets("- first\n* second\nthird")

        self.assertEqual(bullets, ["first", "second", "third"])
        self.assertEqual(service._format_citation("slides.pptx", {"slide": 3}), "slides.pptx slide 3")
        self.assertEqual(service._format_citation("sheet.xlsx", {"sheet": "Budget"}), "sheet.xlsx sheet Budget")
        self.assertEqual(service._format_citation("main.py", {"start_line": 10, "end_line": 22}), "main.py lines 10-22")
        self.assertEqual(service._format_citation("notes.txt", {"chunk_index": 4}), "notes.txt chunk 4")
        self.assertEqual(service._format_citation("plain.txt", {}), "plain.txt")
        self.assertEqual(service._format_citation("plain.txt", "bad-meta"), "plain.txt")
