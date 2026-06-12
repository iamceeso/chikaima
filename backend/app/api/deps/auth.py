from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.database import get_db
from app.core.security import decode_token
from app.models.settings import Settings
from app.models.user import User
from app.repositories.users import UserRepository
from app.services.workspace_service import WorkspaceService

DBSession = Annotated[Session, Depends(get_db)]
LEGACY_PUBLIC_WORKSPACE_EMAIL = "workspace-public@olanma.local"
PUBLIC_WORKSPACE_EMAIL = "workspace-public@olanma.app"
PUBLIC_WORKSPACE_NAME = "Workspace Public"


def _get_or_create_public_actor(db: Session, users: UserRepository) -> User:
    public_user = users.get_by_email(PUBLIC_WORKSPACE_EMAIL)
    if not public_user:
        public_user = users.get_by_email(LEGACY_PUBLIC_WORKSPACE_EMAIL)

    if public_user:
        if public_user.email != PUBLIC_WORKSPACE_EMAIL or public_user.full_name != PUBLIC_WORKSPACE_NAME:
            public_user.email = PUBLIC_WORKSPACE_EMAIL
            public_user.full_name = PUBLIC_WORKSPACE_NAME
            db.add(public_user)
            db.commit()
            db.refresh(public_user)
        return public_user

    public_user = User(
        email=PUBLIC_WORKSPACE_EMAIL,
        full_name=PUBLIC_WORKSPACE_NAME,
        hashed_password=hash_password("workspace-public-actor"),
        is_active=True,
        is_superuser=True,
    )
    settings = Settings(user=public_user)
    db.add(public_user)
    db.add(settings)
    db.commit()
    db.refresh(public_user)
    return public_user


def get_current_user(
    db: DBSession,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> User:
    workspace = WorkspaceService(db).get_or_create()
    users = UserRepository(db)

    if not workspace.authentication_enabled:
        return _get_or_create_public_actor(db, users)

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token, expected_type="access")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = users.get(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
