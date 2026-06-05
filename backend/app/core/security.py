from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expires = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {"sub": subject, "exp": expires, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expires = datetime.now(UTC) + (expires_delta or timedelta(days=settings.refresh_token_expire_days))
    payload: dict[str, Any] = {"sub": subject, "exp": expires, "type": "refresh"}
    return jwt.encode(payload, settings.jwt_refresh_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, refresh: bool = False) -> dict[str, Any]:
    secret = settings.jwt_refresh_secret_key if refresh else settings.jwt_secret_key
    return jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
