from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedResponse


class MessageCreate(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1)


class MessageUpdate(BaseModel):
    content: str = Field(min_length=1)


class MessageResponse(TimestampedResponse):
    conversation_id: str
    role: str
    content: str
    status: str
    metadata: dict = Field(validation_alias="meta")


class ConversationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    folder: str | None = Field(default=None, max_length=120)
    model_id: str | None = None
    initial_message: str | None = None


class ConversationResponse(TimestampedResponse):
    title: str
    folder: str | None
    model_id: str | None
    messages: list[MessageResponse] = Field(default_factory=list)


class RegenerateRequest(BaseModel):
    message_id: str
