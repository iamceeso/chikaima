from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.job import Job
from app.repositories.jobs import JobRepository


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
        return job
