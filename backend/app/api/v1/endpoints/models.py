from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.ai_model import AIModel
from app.models.provider import Provider
from app.models.user import User
from app.schemas.provider import AIModelResponse

router = APIRouter()


@router.get("", response_model=list[AIModelResponse])
def list_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AIModelResponse]:
    models = (
        db.query(AIModel)
        .join(Provider, Provider.id == AIModel.provider_id)
        .filter(Provider.user_id == current_user.id, Provider.is_enabled.is_(True), AIModel.is_available.is_(True))
        .order_by(AIModel.display_name.asc())
        .all()
    )
    return [AIModelResponse.model_validate(model) for model in models]
