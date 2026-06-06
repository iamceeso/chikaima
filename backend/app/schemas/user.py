from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import TimestampedResponse


class UserResponse(TimestampedResponse):
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool


class UserProfileUpdate(BaseModel):
    full_name: str


class UserAdminCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    is_superuser: bool = False
    is_active: bool = True


class UserAdminUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_superuser: bool | None = None
    is_active: bool | None = None
