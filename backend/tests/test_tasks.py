import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_processors import AssetProcessingError
from app.workers import tasks


class FakeDB:
    def __init__(self, job: object, resource: object) -> None:
        self.job = job
        self.resource = resource

    def get(self, model: object, resource_id: str) -> object | None:
        if model is tasks.Job:
            return self.job
        return self.resource

    def add(self, item: object) -> None:
        return None

    def add_all(self, items: list[object]) -> None:
        return None

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None


class WorkerTaskTests(unittest.TestCase):
    def test_process_resource_job_marks_job_failed_when_processing_errors(self) -> None:
        job = SimpleNamespace(id="job-1", resource_id="audio-1", status="pending", error_message=None)
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
            patch("app.workers.tasks.WhisperTranscriptionService") as transcription_service,
        ):
            transcription_service.return_value.transcribe_media.side_effect = AssetProcessingError("provider failure")
            with self.assertRaises(AssetProcessingError):
                tasks._process_resource_job("job-1", tasks.AudioAsset, "audio")

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "provider failure")
        self.assertEqual(resource.status, "failed")

    def test_process_resource_job_completes_video_when_transcription_returns_empty_text(self) -> None:
        job = SimpleNamespace(id="job-2", resource_id="video-1", status="pending", error_message=None, result={})
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
            patch("app.workers.tasks.WhisperTranscriptionService") as transcription_service,
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch("app.workers.tasks._generate_summary_bundle", return_value={"summary": "summary", "key_points": []}),
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

    def test_process_resource_job_handles_document_extraction_locally(self) -> None:
        job = SimpleNamespace(id="job-3", resource_id="video-2", status="pending", error_message=None, result={})
        resource = SimpleNamespace(
            id="doc-1",
            name="notes.txt",
            mime_type="text/plain",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        processor = SimpleNamespace(
            extract=lambda resource, mime_type: SimpleNamespace(transcript="", content="document text", chunks=[]),
        )
        transcript = SimpleNamespace(id="transcript-2")

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch("app.workers.tasks.processor_registry.select", return_value=processor),
            patch("app.workers.tasks._upsert_transcript", return_value=transcript),
            patch("app.workers.tasks._generate_summary_bundle", return_value={"summary": "summary", "key_points": []}),
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
