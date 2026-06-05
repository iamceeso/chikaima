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


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)

    def register(self, payload: UserRegister) -> User:
        if self.users.get_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = User(
            email=payload.email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
        )
        settings = Settings(user=user)
        self.db.add_all([user, settings])
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, payload: UserLogin) -> tuple[User, str, str]:
        user = self.users.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return user, create_access_token(user.id), create_refresh_token(user.id)

    def refresh(self, refresh_token: str) -> str:
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
