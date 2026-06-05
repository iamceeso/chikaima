from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class Provider(UUIDTimestampMixin, Base):
    __tablename__ = "providers"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    provider_type: Mapped[str] = mapped_column(String(50), index=True)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user = relationship("User", back_populates="providers")
    models = relationship("AIModel", back_populates="provider", cascade="all, delete-orphan")
