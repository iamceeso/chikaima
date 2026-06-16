import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_processors import AssetProcessingError
from app.workers import tasks


class FakeQuery:
    def __init__(
        self,
        *,
        first_result: object | None = None,
        all_result: list[object] | None = None,
    ) -> None:
        self.first_result = first_result
        self.all_result = all_result or []

    def filter(self, *_args, **_kwargs) -> "FakeQuery":
        return self

    def order_by(self, *_args, **_kwargs) -> "FakeQuery":
        return self

    def first(self) -> object | None:
        return self.first_result

    def all(self) -> list[object]:
        return self.all_result


class FakeDB:
    def __init__(self, job: object | None, resource: object | None) -> None:
        self.job = job
        self.resource = resource
        self.added: list[object] = []
        self.added_batches: list[list[object]] = []
        self.commits = 0
        self.flushes = 0
        self.closed = False
        self.queries: dict[object, FakeQuery] = {}

    def get(self, model: object, resource_id: str | None) -> object | None:
        if model is tasks.Job:
            return self.job
        return self.resource

    def query(self, model: object) -> FakeQuery:
        return self.queries[model]

    def add(self, item: object) -> None:
        self.added.append(item)

    def add_all(self, items: list[object]) -> None:
        self.added_batches.append(list(items))

    def commit(self) -> None:
        self.commits += 1

    def flush(self) -> None:
        self.flushes += 1

    def close(self) -> None:
        self.closed = True


class FlakyJobLookupDB(FakeDB):
    def __init__(
        self,
        job: object | None,
        resource: object | None,
        *,
        return_job_on_second_lookup: bool,
        return_resource_on_second_lookup: bool,
    ) -> None:
        super().__init__(job, resource)
        self.return_job_on_second_lookup = return_job_on_second_lookup
        self.return_resource_on_second_lookup = return_resource_on_second_lookup
        self.job_lookups = 0
        self.resource_lookups = 0

    def get(self, model: object, resource_id: str | None) -> object | None:
        if model is tasks.Job:
            self.job_lookups += 1
            if self.job_lookups == 1:
                return self.job
            return self.job if self.return_job_on_second_lookup else None

        self.resource_lookups += 1
        if self.resource_lookups == 1:
            return self.resource
        return self.resource if self.return_resource_on_second_lookup else None


class WorkerTaskTests(unittest.TestCase):
    def test_task_wrappers_delegate_to_shared_processor(self) -> None:
        with patch(
            "app.workers.tasks._process_resource_job", return_value={"status": "ok"}
        ) as process:
            self.assertEqual(tasks.process_video.run("job-1"), {"status": "ok"})
            self.assertEqual(tasks.analyze_document.run("job-2"), {"status": "ok"})
            self.assertEqual(tasks.transcribe_audio.run("job-3"), {"status": "ok"})

        self.assertEqual(
            process.call_args_list,
            [
                unittest.mock.call("job-1", tasks.Video, "video"),
                unittest.mock.call("job-2", tasks.Document, "document"),
                unittest.mock.call("job-3", tasks.AudioAsset, "audio"),
            ],
        )

    def test_process_resource_job_returns_failure_when_job_is_missing(self) -> None:
        db = FakeDB(job=None, resource=None)

        with patch("app.workers.tasks.SessionLocal", return_value=db):
            result = tasks._process_resource_job("missing", tasks.AudioAsset, "audio")

        self.assertEqual(
            result,
            {"job_id": "missing", "status": "failed", "message": "Job not found"},
        )
        self.assertTrue(db.closed)

    def test_process_resource_job_marks_job_failed_when_resource_is_missing(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-1", resource_id="audio-1", status="pending", error_message=None
        )
        db = FakeDB(job=job, resource=None)

        with patch("app.workers.tasks.SessionLocal", return_value=db):
            result = tasks._process_resource_job("job-1", tasks.AudioAsset, "audio")

        self.assertEqual(
            result,
            {"job_id": "job-1", "status": "failed", "message": "Resource not found"},
        )
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "Resource not found")
        self.assertEqual(db.added, [job])
        self.assertEqual(db.commits, 1)

    def test_process_resource_job_marks_job_failed_when_processing_errors(self) -> None:
        job = SimpleNamespace(
            id="job-1", resource_id="audio-1", status="pending", error_message=None
        )
        resource = SimpleNamespace(
            id="audio-1",
            name="call.wav",
            file_path="/tmp/call.wav",
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService"
            ) as transcription_service,
        ):
            transcription_service.return_value.transcribe_media.side_effect = (
                AssetProcessingError("provider failure")
            )
            with self.assertRaises(AssetProcessingError):
                tasks._process_resource_job("job-1", tasks.AudioAsset, "audio")

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "provider failure")
        self.assertEqual(resource.status, "failed")

    def test_process_resource_job_raises_when_audio_transcript_is_empty(self) -> None:
        job = SimpleNamespace(
            id="job-audio", resource_id="audio-1", status="pending", error_message=None
        )
        resource = SimpleNamespace(
            id="audio-1",
            name="empty.wav",
            file_path="/tmp/empty.wav",
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService"
            ) as transcription_service,
        ):
            transcription_service.return_value.transcribe_media.return_value = "   "
            with self.assertRaises(AssetProcessingError) as context:
                tasks._process_resource_job("job-audio", tasks.AudioAsset, "audio")

        self.assertEqual(
            str(context.exception),
            "No transcript content could be extracted from empty.wav.",
        )
        self.assertEqual(job.status, "failed")
        self.assertEqual(resource.status, "failed")

    def test_process_resource_job_failure_does_not_update_resource_when_job_has_no_resource_id(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-9", resource_id=None, status="pending", error_message=None
        )
        resource = SimpleNamespace(
            id="audio-1",
            name="call.wav",
            file_path="/tmp/call.wav",
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService",
                side_effect=RuntimeError("boom"),
            ),
        ):
            with self.assertRaises(RuntimeError):
                tasks._process_resource_job("job-9", tasks.AudioAsset, "audio")

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "boom")
        self.assertEqual(resource.status, "processing")
        self.assertNotIn(resource, db.added)

    def test_process_resource_job_failure_skips_updates_when_follow_up_lookup_cannot_find_job(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-10", resource_id="audio-1", status="pending", error_message=None
        )
        resource = SimpleNamespace(
            id="audio-1",
            name="call.wav",
            file_path="/tmp/call.wav",
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FlakyJobLookupDB(
            job,
            resource,
            return_job_on_second_lookup=False,
            return_resource_on_second_lookup=True,
        )

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService",
                side_effect=RuntimeError("boom"),
            ),
        ):
            with self.assertRaises(RuntimeError):
                tasks._process_resource_job("job-10", tasks.AudioAsset, "audio")

        self.assertEqual(db.added, [])
        self.assertEqual(db.commits, 1)

    def test_process_resource_job_failure_skips_resource_update_when_follow_up_lookup_cannot_find_resource(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-11", resource_id="audio-1", status="pending", error_message=None
        )
        resource = SimpleNamespace(
            id="audio-1",
            name="call.wav",
            file_path="/tmp/call.wav",
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FlakyJobLookupDB(
            job,
            resource,
            return_job_on_second_lookup=True,
            return_resource_on_second_lookup=False,
        )

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService",
                side_effect=RuntimeError("boom"),
            ),
        ):
            with self.assertRaises(RuntimeError):
                tasks._process_resource_job("job-11", tasks.AudioAsset, "audio")

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "boom")
        self.assertEqual(db.added, [job])
        self.assertEqual(db.commits, 2)

    def test_process_resource_job_completes_video_when_transcription_returns_empty_text(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-2",
            resource_id="video-1",
            status="pending",
            error_message=None,
            result={},
        )
        resource = SimpleNamespace(
            id="video-1",
            name="silent.mp4",
            file_path="/tmp/silent.mp4",
            mime_type="video/mp4",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        transcript = SimpleNamespace(id="transcript-1")

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService"
            ) as transcription_service,
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch(
                "app.workers.tasks._generate_summary_bundle",
                return_value={
                    "summary": "summary",
                    "key_points": [],
                    "action_items": [],
                    "chapters": [],
                },
            ),
            patch("app.workers.tasks._upsert_summary_artifacts"),
            patch("app.workers.tasks._update_resource_fields"),
            patch("app.workers.tasks._resolve_asset_type", return_value="video"),
            patch("app.workers.tasks.EmbeddingsService") as embeddings_service,
        ):
            transcription_service.return_value.transcribe_media.return_value = ""
            result = tasks._process_resource_job("job-2", tasks.Video, "video")

        embeddings_service.return_value.replace_chunks_for_source.assert_called_once()
        self.assertEqual(job.status, "completed")
        self.assertEqual(resource.status, "completed")
        self.assertEqual(result["status"], "completed")

    def test_process_resource_job_completes_video_when_transcription_returns_text(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-4",
            resource_id="video-2",
            status="pending",
            error_message=None,
            result={},
        )
        resource = SimpleNamespace(
            id="video-2",
            name="demo.mp4",
            file_path="/tmp/demo.mp4",
            mime_type="video/mp4",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        transcript = SimpleNamespace(id="transcript-4")

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.TranscriptionProviderService"
            ) as transcription_service,
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch(
                "app.workers.tasks._generate_summary_bundle",
                return_value={
                    "summary": "summary",
                    "key_points": [],
                    "action_items": [],
                    "chapters": [],
                },
            ),
            patch("app.workers.tasks._upsert_summary_artifacts"),
            patch("app.workers.tasks._update_resource_fields"),
            patch("app.workers.tasks._resolve_asset_type", return_value="video"),
            patch("app.workers.tasks.EmbeddingsService") as embeddings_service,
        ):
            transcription_service.return_value.transcribe_media.return_value = (
                "Spoken words"
            )
            result = tasks._process_resource_job("job-4", tasks.Video, "video")

        embeddings_service.return_value.replace_chunks_for_source.assert_called_once()
        self.assertEqual(result["status"], "completed")

    def test_process_resource_job_handles_document_extraction_locally(self) -> None:
        job = SimpleNamespace(
            id="job-3",
            resource_id="doc-1",
            status="pending",
            error_message=None,
            result={},
        )
        resource = SimpleNamespace(
            id="doc-1",
            name="notes.txt",
            mime_type="text/plain",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        processor = SimpleNamespace(
            extract=lambda resource, mime_type: SimpleNamespace(
                transcript="", content="document text", chunks=[]
            ),
        )
        transcript = SimpleNamespace(id="transcript-2")

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.processor_registry.select", return_value=processor
            ),
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch(
                "app.workers.tasks._generate_summary_bundle",
                return_value={
                    "summary": "summary",
                    "key_points": [],
                    "action_items": [],
                    "chapters": [],
                },
            ),
            patch("app.workers.tasks._upsert_summary_artifacts"),
            patch("app.workers.tasks._update_resource_fields"),
            patch("app.workers.tasks._resolve_asset_type", return_value="document"),
            patch("app.workers.tasks.EmbeddingsService") as embeddings_service,
        ):
            result = tasks._process_resource_job("job-3", tasks.Document, "document")

        embeddings_service.return_value.replace_chunks_for_source.assert_called_once()
        self.assertEqual(job.status, "completed")
        self.assertEqual(resource.status, "completed")
        self.assertEqual(result["status"], "completed")

    def test_process_resource_job_uses_existing_document_chunks_without_rebuilding(
        self,
    ) -> None:
        job = SimpleNamespace(
            id="job-5",
            resource_id="doc-2",
            status="pending",
            error_message=None,
            result={},
        )
        resource = SimpleNamespace(
            id="doc-2",
            name="slides.pptx",
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        processor = SimpleNamespace(
            extract=lambda resource, mime_type: SimpleNamespace(
                transcript="",
                content="document text",
                chunks=[SimpleNamespace(content="chunk", metadata={"chunk_index": 0})],
            ),
        )
        transcript = SimpleNamespace(id="transcript-5")

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch(
                "app.workers.tasks.processor_registry.select", return_value=processor
            ),
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch(
                "app.workers.tasks._generate_summary_bundle",
                return_value={
                    "summary": "summary",
                    "key_points": [],
                    "action_items": [],
                    "chapters": [],
                },
            ),
            patch("app.workers.tasks._upsert_summary_artifacts"),
            patch("app.workers.tasks._update_resource_fields"),
            patch("app.workers.tasks._resolve_asset_type", return_value="office"),
            patch("app.workers.tasks.EmbeddingsService") as embeddings_service,
            patch(
                "app.workers.tasks._build_chunks",
                side_effect=AssertionError("should not rebuild chunks"),
            ),
        ):
            result = tasks._process_resource_job("job-5", tasks.Document, "document")

        embeddings_service.return_value.replace_chunks_for_source.assert_called_once_with(
            user_id="user-1",
            source_type="document",
            source_id="doc-2",
            asset_type="office",
            filename="slides.pptx",
            chunks=[("chunk", {"chunk_index": 0})],
        )
        self.assertEqual(result["status"], "completed")

    def test_build_chunks_handles_blank_and_overlapping_content(self) -> None:
        self.assertEqual(tasks._build_chunks("   "), [])

        chunks = tasks._build_chunks("word " * 1200)

        self.assertGreater(len(chunks), 1)
        self.assertEqual(chunks[0].metadata, {"chunk_index": 0})
        self.assertEqual(chunks[1].metadata, {"chunk_index": 1})

    def test_build_chunks_skips_empty_sections_from_custom_split_content(self) -> None:
        class StrangeContent:
            def split(self) -> list[str]:
                return [""] * 5000

        self.assertEqual(tasks._build_chunks(StrangeContent()), [])

    def test_upsert_transcript_creates_new_transcript(self) -> None:
        db = FakeDB(job=None, resource=None)
        db.queries[tasks.Transcript] = FakeQuery(first_result=None)
        resource = SimpleNamespace(user_id="user-1", id="audio-1")

        transcript = tasks._upsert_transcript(db, resource, "audio", "Transcript body")

        self.assertEqual(transcript.user_id, "user-1")
        self.assertEqual(transcript.language, "en")
        self.assertEqual(transcript.content, "Transcript body")
        self.assertEqual(
            transcript.segments, [{"speaker": "system", "text": "Transcript body"}]
        )
        self.assertEqual(transcript.status, "completed")
        self.assertEqual(db.added, [transcript])
        self.assertEqual(db.flushes, 1)

    def test_upsert_transcript_updates_existing_transcript_and_clears_segments_for_empty_content(
        self,
    ) -> None:
        existing = SimpleNamespace(content="old", segments=["old"], status="pending")
        db = FakeDB(job=None, resource=None)
        db.queries[tasks.Transcript] = FakeQuery(first_result=existing)
        resource = SimpleNamespace(user_id="user-1", id="video-1")

        transcript = tasks._upsert_transcript(db, resource, "video", "")

        self.assertIs(transcript, existing)
        self.assertEqual(existing.content, "")
        self.assertEqual(existing.segments, [])
        self.assertEqual(existing.status, "completed")

    def test_upsert_summary_artifacts_creates_and_updates_records(self) -> None:
        existing_summary = SimpleNamespace(
            summary_type="summary", content="old", data={"x": 1}, status="pending"
        )
        db = FakeDB(job=None, resource=None)
        db.queries[tasks.SummaryArtifact] = FakeQuery(all_result=[existing_summary])
        resource = SimpleNamespace(user_id="user-1", id="doc-1")

        tasks._upsert_summary_artifacts(
            db,
            resource,
            "document",
            {"summary": "New summary", "key_points": ["Point A"]},
        )

        self.assertEqual(existing_summary.content, "New summary")
        self.assertEqual(existing_summary.data, {})
        self.assertEqual(existing_summary.status, "completed")
        self.assertEqual(len(db.added_batches[0]), 2)
        self.assertEqual(db.added_batches[0][1].summary_type, "key_points")
        self.assertEqual(db.added_batches[0][1].data, {"items": ["Point A"]})
        self.assertEqual(db.flushes, 1)

    def test_generate_summary_bundle_returns_fallback_for_blank_and_failing_content(
        self,
    ) -> None:
        resource = SimpleNamespace(name="Notes.pdf", user_id="user-1")

        blank = tasks._generate_summary_bundle(
            SimpleNamespace(), resource, "document", "   "
        )
        self.assertEqual(blank["action_items"], [])
        self.assertEqual(blank["chapters"], [])

        with patch("app.workers.tasks.LLMService", side_effect=RuntimeError("boom")):
            failed = tasks._generate_summary_bundle(
                SimpleNamespace(), resource, "document", "Some content"
            )

        self.assertIn(
            "Notes.pdf contains extracted document content.", failed["summary"]
        )

    def test_generate_summary_bundle_populates_video_fields_and_uses_fallback_values_when_needed(
        self,
    ) -> None:
        replies = iter(
            [
                "",
                "   ",
                "- Action item",
                "- Chapter 1\n- Chapter 2",
            ]
        )
        llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: (
                "model-1",
                "provider-1",
            ),
            generate_reply=lambda *args, **kwargs: next(replies),
        )
        resource = SimpleNamespace(name="Walkthrough.mp4", user_id="user-1")

        with patch("app.workers.tasks.LLMService", return_value=llm):
            bundle = tasks._generate_summary_bundle(
                SimpleNamespace(), resource, "video", "Transcript body"
            )

        self.assertIn(
            "Walkthrough.mp4 contains extracted video content.", bundle["summary"]
        )
        self.assertEqual(bundle["key_points"], [bundle["summary"]])
        self.assertEqual(bundle["action_items"], ["Action item"])
        self.assertEqual(bundle["chapters"], ["Chapter 1", "Chapter 2"])

    def test_generate_summary_bundle_populates_audio_fields_without_video_chapters(
        self,
    ) -> None:
        replies = iter(
            [
                "Summary text",
                "- Point one\n- Point two",
                "- Action item",
            ]
        )
        llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: (
                "model-1",
                "provider-1",
            ),
            generate_reply=lambda *args, **kwargs: next(replies),
        )
        resource = SimpleNamespace(name="Call.wav", user_id="user-1")

        with patch("app.workers.tasks.LLMService", return_value=llm):
            bundle = tasks._generate_summary_bundle(
                SimpleNamespace(), resource, "audio", "Transcript body"
            )

        self.assertEqual(bundle["summary"], "Summary text")
        self.assertEqual(bundle["key_points"], ["Point one", "Point two"])
        self.assertEqual(bundle["action_items"], ["Action item"])
        self.assertEqual(bundle["chapters"], [])

    def test_generate_summary_bundle_populates_document_fields_without_audio_or_video_branches(
        self,
    ) -> None:
        replies = iter(
            [
                "Document summary",
                "- Point one",
            ]
        )
        llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: (
                "model-1",
                "provider-1",
            ),
            generate_reply=lambda *args, **kwargs: next(replies),
        )
        resource = SimpleNamespace(name="Notes.pdf", user_id="user-1")

        with patch("app.workers.tasks.LLMService", return_value=llm):
            bundle = tasks._generate_summary_bundle(
                SimpleNamespace(), resource, "document", "Transcript body"
            )

        self.assertEqual(bundle["summary"], "Document summary")
        self.assertEqual(bundle["key_points"], ["Point one"])
        self.assertEqual(bundle["action_items"], [])
        self.assertEqual(bundle["chapters"], [])

    def test_fallback_summary_bundle_and_parse_bullets_cover_supported_formats(
        self,
    ) -> None:
        with_text = tasks._fallback_summary_bundle(
            "notes.txt", "document", "One   two   three"
        )
        without_text = tasks._fallback_summary_bundle("notes.txt", "document", "   ")

        self.assertIn("One two three", with_text["summary"])
        self.assertEqual(
            without_text["summary"],
            "notes.txt was processed as a document, but no text could be extracted.",
        )
        self.assertEqual(
            tasks._parse_bullets("- first\n* second\nthird"),
            ["first", "second", "third"],
        )

    def test_update_resource_fields_sets_expected_attributes(self) -> None:
        audio = tasks.AudioAsset(
            user_id="user-1", name="call.wav", file_path="/tmp/call.wav"
        )
        video = tasks.Video(
            user_id="user-1", name="demo.mp4", file_path="/tmp/demo.mp4"
        )
        document = tasks.Document(
            user_id="user-1",
            name="notes.pdf",
            file_path="/tmp/notes.pdf",
            mime_type="application/pdf",
        )
        bundle = {
            "summary": "Summary",
            "chapters": ["Intro"],
            "action_items": ["Follow up"],
        }

        tasks._update_resource_fields(audio, "audio", "Audio transcript", bundle)
        tasks._update_resource_fields(video, "video", "Video transcript", bundle)
        tasks._update_resource_fields(document, "document", "Ignored", bundle)

        self.assertEqual(audio.transcript, "Audio transcript")
        self.assertEqual(video.transcript, "Video transcript")
        self.assertEqual(video.summary, "Summary")
        self.assertEqual(video.chapters, ["Intro"])
        self.assertEqual(video.action_items, ["Follow up"])
        self.assertEqual(document.summary, "Summary")

    def test_resolve_asset_type_covers_supported_document_types(self) -> None:
        document = SimpleNamespace(name="notes.pdf", mime_type="application/pdf")
        office = SimpleNamespace(
            name="deck.pptx",
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        image = SimpleNamespace(name="photo.png", mime_type="image/png")
        text = SimpleNamespace(name="notes.txt", mime_type="text/plain")
        code = SimpleNamespace(name="main.py", mime_type="application/octet-stream")
        fallback = SimpleNamespace(
            name="archive.bin", mime_type="application/octet-stream"
        )

        self.assertEqual(tasks._resolve_asset_type("audio", fallback), "audio")
        self.assertEqual(tasks._resolve_asset_type("video", fallback), "video")
        self.assertEqual(tasks._resolve_asset_type("document", document), "document")
        self.assertEqual(tasks._resolve_asset_type("document", office), "office")
        self.assertEqual(tasks._resolve_asset_type("document", image), "image")
        self.assertEqual(tasks._resolve_asset_type("document", text), "text")
        self.assertEqual(tasks._resolve_asset_type("document", code), "code")
        self.assertEqual(tasks._resolve_asset_type("document", fallback), "document")
