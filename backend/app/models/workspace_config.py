from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import UUIDTimestampMixin


class WorkspaceConfig(UUIDTimestampMixin, Base):
    __tablename__ = "workspace_configs"

    name: Mapped[str] = mapped_column(String(120), default="Olanma Workspace")
    authentication_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    docs_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    public_registration_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    vision_aware: Mapped[bool] = mapped_column(Boolean, default=True)
