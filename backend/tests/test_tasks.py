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
            mime_type="audio/wav",
            user_id="user-1",
            status="pending",
        )
        db = FakeDB(job, resource)
        processor = SimpleNamespace(extract=lambda resource, mime_type: (_ for _ in ()).throw(AssetProcessingError("ffmpeg missing")))

        with (
            patch("app.workers.tasks.SessionLocal", return_value=db),
            patch("app.workers.tasks.processor_registry.select", return_value=processor),
        ):
            with self.assertRaises(AssetProcessingError):
                tasks._process_resource_job("job-1", tasks.AudioAsset, "audio")

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "ffmpeg missing")
        self.assertEqual(resource.status, "failed")
