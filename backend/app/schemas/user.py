from __future__ import annotations

from pydantic import BaseModel, EmailStr

from app.schemas.common import TimestampedResponse


class UserResponse(TimestampedResponse):
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool


class UserProfileUpdate(BaseModel):
    full_name: str
