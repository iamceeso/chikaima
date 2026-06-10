from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.document import Document
from app.schemas.assets import AssetQuestionRequest, DocumentResponse
from app.schemas.transcript import SummaryArtifactResponse
from app.models.user import User
from app.services.job_service import JobService
from app.services.library_service import LibraryService
from app.services.storage_service import storage_service
from app.services.transcript_service import TranscriptService
from app.schemas.transcript import TranscriptResponse

router = APIRouter()


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    documents = db.query(Document).filter(Document.user_id == current_user.id).all()
    return [DocumentResponse.model_validate(document) for document in documents]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_resource(current_user.id, "document", document_id)
    LibraryService.invalidate_user_cache(current_user.id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_all_resources(current_user.id, "document")
    LibraryService.invalidate_user_cache(current_user.id)


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
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/markdown",
            "application/json",
            "application/xml",
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/javascript",
            "text/javascript",
            "text/x-python",
            "text/x-java-source",
            "text/x-csharp",
            "text/x-go",
            "text/rust",
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
    LibraryService.invalidate_user_cache(current_user.id)
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


@router.post("/{document_id}/summarize", response_model=list[SummaryArtifactResponse])
def summarize_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SummaryArtifactResponse]:
    summaries = TranscriptService(db).summarize_resource(current_user.id, "document", document_id)
    return [SummaryArtifactResponse.model_validate(item) for item in summaries]


@router.post("/{document_id}/ask")
def ask_document(
    document_id: str,
    payload: AssetQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    answer = TranscriptService(db).query_resource(current_user.id, "document", document_id, payload.question)
    return {"document_id": document_id, "answer": answer}
