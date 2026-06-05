from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy.orm import Session

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class Repository(Generic[ModelType]):
    def __init__(self, db: Session, model: type[ModelType]) -> None:
        self.db = db
        self.model = model

    def get(self, item_id: str) -> ModelType | None:
        return self.db.get(self.model, item_id)

    def list(self) -> list[ModelType]:
        return list(self.db.query(self.model).all())

    def add(self, instance: ModelType) -> ModelType:
        self.db.add(instance)
        self.db.commit()
        self.db.refresh(instance)
        return instance

    def delete(self, instance: ModelType) -> None:
        self.db.delete(instance)
        self.db.commit()
