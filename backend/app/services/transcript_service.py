from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.services.llm_service import LLMService


class TranscriptService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm = LLMService(db)

    def get_for_resource(self, user_id: str, resource_type: str, resource_id: str) -> Transcript:
        transcript = (
            self.db.query(Transcript)
            .filter(
                Transcript.user_id == user_id,
                Transcript.resource_type == resource_type,
                Transcript.resource_id == resource_id,
            )
            .order_by(Transcript.created_at.desc())
            .first()
        )
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")
        return transcript

    def list_summaries_for_resource(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
    ) -> list[SummaryArtifact]:
        return list(
            self.db.query(SummaryArtifact)
            .filter(
                SummaryArtifact.user_id == user_id,
                SummaryArtifact.resource_type == resource_type,
                SummaryArtifact.resource_id == resource_id,
            )
            .order_by(SummaryArtifact.created_at.asc())
            .all()
        )

    def query_transcript(self, user_id: str, transcript_id: str, question: str) -> str:
        transcript = self.db.get(Transcript, transcript_id)
        if not transcript or transcript.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")

        model, provider = self.llm.resolve_model_and_provider(user_id, None)
        return self.llm.generate_reply(
            provider=provider,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Answer using only the transcript content provided. Be concise and factual.",
                },
                {
                    "role": "user",
                    "content": f"Transcript:\n{transcript.content}\n\nQuestion: {question}",
                },
            ],
        )
