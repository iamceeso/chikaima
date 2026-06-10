from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class Settings(UUIDTimestampMixin, Base):
    __tablename__ = "settings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    theme: Mapped[str] = mapped_column(String(20), default="dark")
    default_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="settings")
