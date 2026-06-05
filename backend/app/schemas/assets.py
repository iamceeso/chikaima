from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import TimestampedResponse


class DocumentResponse(TimestampedResponse):
    name: str
    file_path: str
    mime_type: str
    summary: str | None
    status: str


class AudioResponse(TimestampedResponse):
    name: str
    file_path: str
    transcript: str | None
    status: str


class VideoResponse(TimestampedResponse):
    name: str
    file_path: str
    transcript: str | None
    summary: str | None
    chapters: list
    action_items: list
    status: str


class AssetQuestionRequest(BaseModel):
    question: str
