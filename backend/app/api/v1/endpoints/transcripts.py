from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.transcript import TranscriptQueryRequest, TranscriptQueryResponse
from app.services.transcript_service import TranscriptService

router = APIRouter()


@router.post("/{transcript_id}/query", response_model=TranscriptQueryResponse)
def query_transcript(
    transcript_id: str,
    payload: TranscriptQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TranscriptQueryResponse:
    answer = TranscriptService(db).query_transcript(current_user.id, transcript_id, payload.question)
    return TranscriptQueryResponse(transcript_id=transcript_id, answer=answer)
