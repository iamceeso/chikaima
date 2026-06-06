from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class Embedding(UUIDTimestampMixin, Base):
    __tablename__ = "embeddings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(50), index=True)
    source_id: Mapped[str] = mapped_column(String(255), index=True)
    content: Mapped[str] = mapped_column(Text)
    vector: Mapped[dict] = mapped_column(JSON, default=dict)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="embeddings")

    __table_args__ = (
        Index("idx_user_source", "user_id", "source_type", "source_id"),
    )



