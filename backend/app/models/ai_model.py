from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class AIModel(UUIDTimestampMixin, Base):
    __tablename__ = "ai_models"

    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), index=True)
    model_key: Mapped[str] = mapped_column(String(150), index=True)
    display_name: Mapped[str] = mapped_column(String(255))
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    provider = relationship("Provider", back_populates="models")
    conversations = relationship("Conversation", back_populates="model")
