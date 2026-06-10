from __future__ import annotations

from pydantic import BaseModel, Field

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
    chapters: list = Field(default_factory=list)
    action_items: list = Field(default_factory=list)
    status: str


class AssetQuestionRequest(BaseModel):
    question: str


class LibraryBundleResponse(BaseModel):
    audio: list[AudioResponse]
    videos: list[VideoResponse]
    documents: list[DocumentResponse]
