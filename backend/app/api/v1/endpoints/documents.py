from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.document import Document
from app.models.user import User
from app.schemas.assets import AssetQuestionRequest, DocumentResponse
from app.services.job_service import JobService
from app.services.storage_service import storage_service
from app.services.transcript_service import TranscriptService
from app.schemas.transcript import TranscriptResponse, SummaryArtifactResponse

router = APIRouter()


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    documents = db.query(Document).filter(Document.user_id == current_user.id).all()
    return [DocumentResponse.model_validate(document) for document in documents]


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    stored = await storage_service.save_upload(
        file,
        "documents",
        allowed_content_types={
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown",
        },
        max_size_bytes=100 * 1024 * 1024,
    )
    document = Document(
        user_id=current_user.id,
        name=str(stored["name"]),
        file_path=str(stored["file_path"]),
        mime_type=str(stored["content_type"]),
        status="pending",
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    JobService(db).create_job(current_user.id, "document_analysis", "document", document.id)
    return DocumentResponse.model_validate(document)


@router.get("/{document_id}/transcript", response_model=TranscriptResponse)
def get_document_transcript(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TranscriptResponse:
    transcript = TranscriptService(db).get_for_resource(current_user.id, "document", document_id)
    return TranscriptResponse.model_validate(transcript)


@router.get("/{document_id}/summaries", response_model=list[SummaryArtifactResponse])
def get_document_summaries(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SummaryArtifactResponse]:
    summaries = TranscriptService(db).list_summaries_for_resource(current_user.id, "document", document_id)
    return [SummaryArtifactResponse.model_validate(item) for item in summaries]


@router.post("/{document_id}/summarize")
def summarize_document(document_id: str) -> dict[str, str]:
    return {"document_id": document_id, "message": "Summarization queued"}


@router.post("/{document_id}/ask")
def ask_document(document_id: str, payload: AssetQuestionRequest) -> dict[str, str]:
    return {"document_id": document_id, "answer": f"Placeholder answer for: {payload.question}"}
