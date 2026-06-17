from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user, get_settings_owner_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.provider import ProviderCreate, ProviderResponse, ProviderUpdate
from app.services.provider_service import ProviderService

router = APIRouter()


def _mask(provider_secret: str | None) -> str | None:
    if not provider_secret:
        return None
    return "**********"


@router.get("", response_model=list[ProviderResponse])
def list_providers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProviderResponse]:
    owner = get_settings_owner_user(db, current_user)
    providers = ProviderService(db).list_for_user(owner.id)
    return [
        ProviderResponse(
            **provider.__dict__,
            masked_secret=_mask(provider.encrypted_config.get("api_key")),
        )
        for provider in providers
    ]


@router.post("", response_model=ProviderResponse, status_code=status.HTTP_201_CREATED)
def create_provider(
    payload: ProviderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProviderResponse:
    owner = get_settings_owner_user(db, current_user)
    provider = ProviderService(db).create(owner.id, payload)
    return ProviderResponse(
        **provider.__dict__,
        masked_secret=_mask(provider.encrypted_config.get("api_key")),
    )


@router.patch("/{provider_id}", response_model=ProviderResponse)
def update_provider(
    provider_id: str,
    payload: ProviderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProviderResponse:
    owner = get_settings_owner_user(db, current_user)
    provider = ProviderService(db).update(owner.id, provider_id, payload)
    return ProviderResponse(
        **provider.__dict__,
        masked_secret=_mask(provider.encrypted_config.get("api_key")),
    )


@router.post("/{provider_id}/resync", response_model=ProviderResponse)
def resync_provider_models(
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProviderResponse:
    owner = get_settings_owner_user(db, current_user)
    provider = ProviderService(db).resync_models(owner.id, provider_id)
    return ProviderResponse(
        **provider.__dict__,
        masked_secret=_mask(provider.encrypted_config.get("api_key")),
    )


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    owner = get_settings_owner_user(db, current_user)
    ProviderService(db).delete(owner.id, provider_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
