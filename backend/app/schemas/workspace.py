from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedResponse


class WorkspaceConfigUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    authentication_enabled: bool | None = None
    docs_enabled: bool | None = None
    public_registration_enabled: bool | None = None


class WorkspaceModelVisibilityUpdate(BaseModel):
    enabled_model_ids: list[str] = Field(default_factory=list)
    default_model_id: str | None = None


class WorkspaceConfigResponse(TimestampedResponse):
    name: str
    authentication_enabled: bool
    docs_enabled: bool
    public_registration_enabled: bool
    first_user_registration_required: bool
    total_users: int
    total_providers: int
    pending_jobs: int
    completed_jobs: int


class WorkspacePublicResponse(BaseModel):
    name: str
    authentication_enabled: bool
    docs_enabled: bool
    public_registration_enabled: bool
    first_user_registration_required: bool
