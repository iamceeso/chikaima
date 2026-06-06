from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedResponse


class TranscriptResponse(TimestampedResponse):
    user_id: str
    resource_type: str
    resource_id: str
    language: str | None
    content: str
    segments: list
    status: str


class SummaryArtifactResponse(TimestampedResponse):
    user_id: str
    resource_type: str
    resource_id: str
    summary_type: str
    content: str | None
    data: dict
    status: str


class TranscriptQueryRequest(BaseModel):
    question: str = Field(min_length=1)


class TranscriptQueryResponse(BaseModel):
    transcript_id: str
    answer: str
