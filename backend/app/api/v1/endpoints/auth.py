from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth import (
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenPair,
    UserLogin,
    UserRegister,
)
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserResponse)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> UserResponse:
    user = AuthService(db).register(payload)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenPair:
    _, access_token, refresh_token = AuthService(db).login(payload)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh")
def refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    access_token = AuthService(db).refresh(payload.refresh_token)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout() -> dict[str, str]:
    return {"message": "Logout handled client-side by discarding tokens."}


@router.post("/password-reset/request")
def password_reset_request(payload: PasswordResetRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    return AuthService(db).request_password_reset(payload.email)


@router.post("/password-reset/confirm")
def password_reset_confirm(payload: PasswordResetConfirm, db: Session = Depends(get_db)) -> dict[str, str]:
    return AuthService(db).confirm_password_reset(payload)
