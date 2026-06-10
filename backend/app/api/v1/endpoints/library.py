from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.assets import LibraryBundleResponse
from app.services.library_service import LibraryService

router = APIRouter()


@router.get("", response_model=LibraryBundleResponse)
def get_library_bundle(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LibraryBundleResponse:
    return LibraryService(db).get_bundle(current_user.id)
