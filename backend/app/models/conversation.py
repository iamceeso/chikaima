from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class Conversation(UUIDTimestampMixin, Base):
    __tablename__ = "conversations"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    folder: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model_id: Mapped[str | None] = mapped_column(ForeignKey("ai_models.id"), nullable=True)

    user = relationship("User", back_populates="conversations")
    model = relationship("AIModel", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
