from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.provider import Provider
from app.repositories.base import Repository


class ProviderRepository(Repository[Provider]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, Provider)

    def list_for_user(self, user_id: str) -> list[Provider]:
        return list(self.db.query(Provider).filter(Provider.user_id == user_id).all())
