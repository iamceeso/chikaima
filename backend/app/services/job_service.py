from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.job import Job
from app.repositories.jobs import JobRepository
from app.workers.tasks import analyze_document, process_video, transcribe_audio

logger = logging.getLogger(__name__)


class JobService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.jobs = JobRepository(db)

    def list_for_user(self, user_id: str) -> list[Job]:
        return self.jobs.list_for_user(user_id)

    def create_job(
        self,
        user_id: str,
        job_type: str,
        resource_type: str | None = None,
        resource_id: str | None = None,
        payload: dict | None = None,
    ) -> Job:
        job = Job(
            user_id=user_id,
            job_type=job_type,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        self.dispatch(job)
        return job

    def dispatch(self, job: Job) -> None:
        task_map = {
            "audio_transcription": transcribe_audio,
            "video_analysis": process_video,
            "document_analysis": analyze_document,
        }
        task = task_map.get(job.job_type)
        if task:
            try:
                task.delay(job.id)
            except Exception as exc:  # noqa: BLE001
                job.status = "failed"
                job.error_message = f"Background dispatch failed: {exc}"
                self.db.add(job)
                self.db.commit()
                logger.exception("Failed to dispatch job %s", job.id)
