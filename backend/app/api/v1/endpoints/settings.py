from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_admin_user, get_settings_owner_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.provider import AIModelResponse
from app.schemas.workspace import (
    WorkspaceConfigResponse,
    WorkspaceConfigUpdate,
    WorkspaceModelVisibilityUpdate,
    WorkspacePublicResponse,
)
from app.services.workspace_service import WorkspaceService

router = APIRouter()


@router.get("/workspace", response_model=WorkspaceConfigResponse)
def get_workspace_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> WorkspaceConfigResponse:
    owner = get_settings_owner_user(db, current_user)
    return WorkspaceService(db).get_summary(owner)


@router.get("/public", response_model=WorkspacePublicResponse)
def get_public_workspace_settings(
    db: Session = Depends(get_db),
) -> WorkspacePublicResponse:
    return WorkspaceService(db).get_public_settings()


@router.patch("/workspace", response_model=WorkspaceConfigResponse)
def update_workspace_settings(
    payload: WorkspaceConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> WorkspaceConfigResponse:
    owner = get_settings_owner_user(db, current_user)
    return WorkspaceService(db).update(current_user, payload, owner)


@router.get("/models", response_model=list[AIModelResponse])
def get_workspace_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> list[AIModelResponse]:
    owner = get_settings_owner_user(db, current_user)
    return WorkspaceService(db).list_models(current_user, owner)


@router.patch("/models", response_model=list[AIModelResponse])
def update_workspace_models(
    payload: WorkspaceModelVisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> list[AIModelResponse]:
    owner = get_settings_owner_user(db, current_user)
    return WorkspaceService(db).update_model_visibility(current_user, payload, owner)
