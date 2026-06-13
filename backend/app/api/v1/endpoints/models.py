from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.ai_model import AIModel
from app.models.provider import Provider
from app.models.user import User
from app.schemas.provider import AIModelResponse
from app.services.provider_service import build_model_response
from app.services.workspace_service import WorkspaceService

router = APIRouter()


@router.get("", response_model=list[AIModelResponse])
def list_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AIModelResponse]:
    workspace = WorkspaceService(db).get_or_create()
    query = db.query(AIModel, Provider).join(Provider, Provider.id == AIModel.provider_id)

    if workspace.authentication_enabled:
        query = query.filter(Provider.user_id == current_user.id)

    models = (
        query.filter(
            Provider.is_enabled.is_(True),
            AIModel.is_available.is_(True),
        )
        .order_by(desc(AIModel.is_default))
        .order_by(AIModel.display_name.asc())
        .all()
    )
    return [build_model_response(model, provider) for model, provider in models]
