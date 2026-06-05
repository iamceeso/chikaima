from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.document import Document
from app.models.user import User
from app.schemas.assets import AssetQuestionRequest, DocumentResponse
from app.services.job_service import JobService

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
    document = Document(
        user_id=current_user.id,
        name=file.filename or "document",
        file_path=f"uploads/documents/{file.filename or 'document'}",
        mime_type=file.content_type or "application/octet-stream",
        status="pending",
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    JobService(db).create_job(current_user.id, "document_analysis", "document", document.id)
    return DocumentResponse.model_validate(document)


@router.post("/{document_id}/summarize")
def summarize_document(document_id: str) -> dict[str, str]:
    return {"document_id": document_id, "message": "Summarization queued"}


@router.post("/{document_id}/ask")
def ask_document(document_id: str, payload: AssetQuestionRequest) -> dict[str, str]:
    return {"document_id": document_id, "answer": f"Placeholder answer for: {payload.question}"}
