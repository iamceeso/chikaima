from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from app.schemas.common import TimestampedResponse

ProviderType = Literal[
    "openai",
    "anthropic",
    "gemini",
    "ollama",
    "openrouter",
    "litellm",
    "local",
]


class ProviderCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    provider_type: ProviderType
    base_url: HttpUrl | None = None
    api_key: str | None = None
    config: dict = Field(default_factory=dict)


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    base_url: HttpUrl | None = None
    is_enabled: bool | None = None
    api_key: str | None = None
    config: dict | None = None


class ProviderResponse(TimestampedResponse):
    name: str
    provider_type: ProviderType
    base_url: str | None
    is_enabled: bool
    masked_secret: str | None = None


class AIModelResponse(TimestampedResponse):
    provider_id: str
    provider_name: str | None = None
    provider_type: ProviderType | None = None
    model_key: str
    display_name: str
    capabilities: dict
    is_default: bool
    is_available: bool
    is_deprecated: bool = False
