import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services import job_service


class FakeDB:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.refreshed: list[object] = []

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, item: object) -> None:
        item.id = "job-1"
        self.refreshed.append(item)


class JobServiceTests(unittest.TestCase):
    def test_init_builds_repository(self) -> None:
        db = SimpleNamespace()

        with patch("app.services.job_service.JobRepository", return_value="repo") as repository:
            service = job_service.JobService(db)

        self.assertIs(service.db, db)
        self.assertEqual(service.jobs, "repo")
        repository.assert_called_once_with(db)

    def test_list_for_user_delegates_to_repository(self) -> None:
        service = object.__new__(job_service.JobService)
        service.db = SimpleNamespace()
        service.jobs = SimpleNamespace(list_for_user=lambda user_id: [user_id])

        self.assertEqual(service.list_for_user("user-1"), ["user-1"])

    def test_create_job_persists_refreshes_and_dispatches(self) -> None:
        db = FakeDB()
        dispatched: list[object] = []
        service = object.__new__(job_service.JobService)
        service.db = db
        service.jobs = SimpleNamespace()
        service.dispatch = lambda job: dispatched.append(job)  # type: ignore[method-assign]

        job = service.create_job(
            "user-1",
            "video_analysis",
            resource_type="video",
            resource_id="video-1",
            payload=None,
        )

        self.assertEqual(job.user_id, "user-1")
        self.assertEqual(job.payload, {})
        self.assertEqual(job.id, "job-1")
        self.assertEqual(db.added, [job])
        self.assertEqual(db.commits, 1)
        self.assertEqual(db.refreshed, [job])
        self.assertEqual(dispatched, [job])

    def test_dispatch_calls_delay_for_supported_jobs(self) -> None:
        service = object.__new__(job_service.JobService)
        service.db = SimpleNamespace()
        service.jobs = SimpleNamespace()

        with (
            patch.object(job_service, "transcribe_audio", SimpleNamespace(delay=Mock())) as transcribe_audio,
            patch.object(job_service, "process_video", SimpleNamespace(delay=Mock())) as process_video,
            patch.object(job_service, "analyze_document", SimpleNamespace(delay=Mock())) as analyze_document,
        ):
            service.dispatch(SimpleNamespace(id="job-a", job_type="audio_transcription"))
            service.dispatch(SimpleNamespace(id="job-b", job_type="video_analysis"))
            service.dispatch(SimpleNamespace(id="job-c", job_type="document_analysis"))

        transcribe_audio.delay.assert_called_once_with("job-a")
        process_video.delay.assert_called_once_with("job-b")
        analyze_document.delay.assert_called_once_with("job-c")

    def test_dispatch_ignores_unknown_job_types(self) -> None:
        service = object.__new__(job_service.JobService)
        service.db = SimpleNamespace(add=lambda item: (_ for _ in ()).throw(AssertionError("unexpected add")), commit=lambda: (_ for _ in ()).throw(AssertionError("unexpected commit")))
        service.jobs = SimpleNamespace()

        service.dispatch(SimpleNamespace(id="job-1", job_type="unsupported"))

    def test_dispatch_marks_job_failed_when_delay_raises(self) -> None:
        db = FakeDB()
        service = object.__new__(job_service.JobService)
        service.db = db
        service.jobs = SimpleNamespace()
        job = SimpleNamespace(id="job-1", job_type="audio_transcription", status="pending", error_message=None)

        with patch.object(job_service, "transcribe_audio", SimpleNamespace(delay=Mock(side_effect=RuntimeError("boom")))):
            service.dispatch(job)

        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "Background dispatch failed: boom")
        self.assertEqual(db.added, [job])
        self.assertEqual(db.commits, 1)
