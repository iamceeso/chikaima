from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.settings import Settings
from app.models.user import User
from app.repositories.users import UserRepository
from app.schemas.auth import PasswordResetConfirm, UserLogin, UserRegister
from app.schemas.user import UserAdminCreate, UserAdminUpdate
from app.services.workspace_service import WorkspaceService


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def register(self, payload: UserRegister) -> User:
        if self.users.get_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        is_first_user = self.users.count() == 0
        workspace = WorkspaceService(self.db).get_or_create()
        if not is_first_user and not workspace.public_registration_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is disabled. Ask an administrator to create your account.",
            )

        user = User(
            email=payload.email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            is_superuser=is_first_user,
        )
        settings = Settings(user=user)
        self.db.add_all([user, settings])
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_user(self, actor: User, payload: UserAdminCreate) -> User:
        if not actor.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        if self.users.get_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = User(
            email=payload.email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            is_superuser=payload.is_superuser,
            is_active=payload.is_active,
        )
        settings = Settings(user=user)
        self.db.add_all([user, settings])
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user(self, actor: User, user_id: str, payload: UserAdminUpdate) -> User:
        if not actor.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

        user = self.users.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        updates = payload.model_dump(exclude_unset=True)

        next_email = updates.get("email")
        if next_email and next_email != user.email and self.users.get_by_email(next_email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        next_is_superuser = updates.get("is_superuser", user.is_superuser)
        next_is_active = updates.get("is_active", user.is_active)
        if user.is_superuser and not next_is_superuser and self.users.count_superusers() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The last admin cannot be changed to a non-admin user.",
            )
        if user.is_superuser and not next_is_active and self.users.count_superusers() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The last admin cannot be made inactive.",
            )

        if "email" in updates:
            user.email = updates["email"]
        if "full_name" in updates:
            user.full_name = updates["full_name"]
        if "password" in updates and updates["password"]:
            user.hashed_password = hash_password(updates["password"])
        if "is_superuser" in updates:
            user.is_superuser = updates["is_superuser"]
        if "is_active" in updates:
            user.is_active = updates["is_active"]

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, payload: UserLogin) -> tuple[User, str, str]:
        workspace = WorkspaceService(self.db).get_or_create()
        if not workspace.authentication_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication is disabled for this workspace.",
            )
        user = self.users.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return user, create_access_token(user.id), create_refresh_token(user.id)

    def refresh(self, refresh_token: str) -> str:
        workspace = WorkspaceService(self.db).get_or_create()
        if not workspace.authentication_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication is disabled for this workspace.",
            )
        try:
            payload = decode_token(refresh_token, refresh=True)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
        return create_access_token(payload["sub"])

    def request_password_reset(self, email: str) -> dict[str, str]:
        user = self.users.get_by_email(email)
        if not user:
            return {"message": "If the account exists, a reset token has been generated."}
        token = create_access_token(user.id)
        return {"message": "Reset token generated for development use.", "reset_token": token}

    def confirm_password_reset(self, payload: PasswordResetConfirm) -> dict[str, str]:
        try:
            token_payload = decode_token(payload.token)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid reset token") from exc

        user = self.users.get(token_payload["sub"])
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        user.hashed_password = hash_password(payload.new_password)
        self.db.add(user)
        self.db.commit()
        return {"message": "Password updated successfully"}
