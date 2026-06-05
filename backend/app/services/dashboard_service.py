from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai_model import AIModel
from app.models.document import Document
from app.models.job import Job
from app.models.provider import Provider
from app.models.video import Video


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_summary(self, user_id: str) -> dict:
        providers = self.db.query(Provider).filter(Provider.user_id == user_id).count()
        models = (
            self.db.query(AIModel)
            .join(Provider, Provider.id == AIModel.provider_id)
            .filter(Provider.user_id == user_id)
            .count()
        )
        documents = self.db.query(Document).filter(Document.user_id == user_id).count()
        videos = self.db.query(Video).filter(Video.user_id == user_id).count()
        jobs = self.db.query(Job).filter(Job.user_id == user_id).count()
        return {
            "providers": providers,
            "models": models,
            "documents": documents,
            "videos": videos,
            "jobs": jobs,
            "system_health": "healthy",
        }
