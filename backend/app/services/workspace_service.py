from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.provider import Provider
from app.models.user import User
from app.models.workspace_config import WorkspaceConfig
from app.schemas.workspace import WorkspaceConfigResponse, WorkspaceConfigUpdate, WorkspacePublicResponse


class WorkspaceService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create(self) -> WorkspaceConfig:
        workspace = self.db.query(WorkspaceConfig).first()
        if workspace:
            return workspace

        workspace = WorkspaceConfig()
        self.db.add(workspace)
        self.db.commit()
        self.db.refresh(workspace)
        return workspace

    def get_summary(self) -> WorkspaceConfigResponse:
        workspace = self.get_or_create()
        return WorkspaceConfigResponse(
            **workspace.__dict__,
            total_users=self.db.query(User).count(),
            total_providers=self.db.query(Provider).count(),
            pending_jobs=self.db.query(Job).filter(Job.status.in_(["pending", "running"])).count(),
            completed_jobs=self.db.query(Job).filter(Job.status == "completed").count(),
        )

    def get_public_settings(self) -> WorkspacePublicResponse:
        workspace = self.get_or_create()
        return WorkspacePublicResponse(
            name=workspace.name,
            public_registration_enabled=workspace.public_registration_enabled,
        )

    def update(self, actor: User, payload: WorkspaceConfigUpdate) -> WorkspaceConfigResponse:
        if not actor.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        workspace = self.get_or_create()
        updates = payload.model_dump(exclude_unset=True)
        for key, value in updates.items():
            setattr(workspace, key, value)

        self.db.add(workspace)
        self.db.commit()
        self.db.refresh(workspace)
        return self.get_summary()
