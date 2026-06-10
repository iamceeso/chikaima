from __future__ import annotations

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class AssetChunk(UUIDTimestampMixin, Base):
    __tablename__ = "asset_chunks"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(50), index=True)
    source_id: Mapped[str] = mapped_column(String(36), index=True)
    asset_type: Mapped[str] = mapped_column(String(50), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dimension))
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    user = relationship("User", back_populates="asset_chunks")

    __table_args__ = (
        Index(
            "idx_asset_chunk_source_order",
            "user_id",
            "source_type",
            "source_id",
            "chunk_index",
        ),
    )
