from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.embedding import Embedding
from app.repositories.base import BaseRepository


class EmbeddingRepository(BaseRepository[Embedding]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, Embedding)

    def list_for_user(self, user_id: str) -> list[Embedding]:
        return self.db.query(Embedding).filter(Embedding.user_id == user_id).all()

    def list_by_source(self, user_id: str, source_type: str, source_id: str) -> list[Embedding]:
        return (
            self.db.query(Embedding)
            .filter(
                Embedding.user_id == user_id,
                Embedding.source_type == source_type,
                Embedding.source_id == source_id,
            )
            .all()
        )
