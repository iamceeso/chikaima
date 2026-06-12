from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ai_model import AIModel
from app.models.job import Job
from app.models.provider import Provider
from app.models.user import User
from app.models.workspace_config import WorkspaceConfig
from app.schemas.provider import AIModelResponse
from app.schemas.workspace import (
    WorkspaceConfigResponse,
    WorkspaceConfigUpdate,
    WorkspaceModelVisibilityUpdate,
    WorkspacePublicResponse,
)
from app.services.provider_service import build_model_response


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

    def get_summary(self, actor: User) -> WorkspaceConfigResponse:
        workspace = self.get_or_create()
        total_users = self.db.query(User).count()
        return WorkspaceConfigResponse(
            **workspace.__dict__,
            first_user_registration_required=total_users == 0,
            total_users=total_users,
            total_providers=self.db.query(Provider).filter(Provider.user_id == actor.id).count(),
            pending_jobs=self.db.query(Job)
            .filter(Job.user_id == actor.id, Job.status.in_(["pending", "running"]))
            .count(),
            completed_jobs=self.db.query(Job)
            .filter(Job.user_id == actor.id, Job.status == "completed")
            .count(),
        )

    def get_public_settings(self) -> WorkspacePublicResponse:
        workspace = self.get_or_create()
        total_users = self.db.query(User).count()
        return WorkspacePublicResponse(
            name=workspace.name,
            authentication_enabled=workspace.authentication_enabled,
            docs_enabled=workspace.docs_enabled,
            public_registration_enabled=workspace.public_registration_enabled,
            first_user_registration_required=total_users == 0,
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
        return self.get_summary(actor)

    def list_models(self, actor: User) -> list[AIModelResponse]:
        if not actor.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        models = (
            self.db.query(AIModel, Provider)
            .join(Provider, Provider.id == AIModel.provider_id)
            .order_by(
                Provider.name.asc(),
                AIModel.is_default.desc(),
                AIModel.display_name.asc(),
            )
            .all()
        )
        return [build_model_response(model, provider) for model, provider in models]

    def update_model_visibility(
        self,
        actor: User,
        payload: WorkspaceModelVisibilityUpdate,
    ) -> list[AIModelResponse]:
        if not actor.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        enabled_ids = {model_id for model_id in payload.enabled_model_ids}
        default_model_id_supplied = "default_model_id" in payload.model_fields_set
        models = self.db.query(AIModel).all()
        current_default_model = next((model for model in models if model.is_default), None)

        if default_model_id_supplied and payload.default_model_id:
            enabled_ids.add(payload.default_model_id)

        for model in models:
            model.is_available = model.id in enabled_ids
            if default_model_id_supplied:
                model.is_default = payload.default_model_id is not None and model.id == payload.default_model_id
            elif current_default_model and current_default_model.id not in enabled_ids:
                model.is_default = False
            self.db.add(model)

        self.db.commit()
        return self.list_models(actor)
