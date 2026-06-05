from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.job import Job
from app.repositories.base import Repository


class JobRepository(Repository[Job]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, Job)

    def list_for_user(self, user_id: str) -> list[Job]:
        return list(self.db.query(Job).filter(Job.user_id == user_id).order_by(Job.created_at.desc()).all())
