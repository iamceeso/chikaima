from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.audio import AudioAsset
from app.models.user import User
from app.schemas.assets import AudioResponse
from app.services.job_service import JobService
from app.services.storage_service import storage_service
from app.services.transcript_service import TranscriptService
from app.schemas.transcript import TranscriptResponse, SummaryArtifactResponse

router = APIRouter()


@router.get("", response_model=list[AudioResponse])
def list_audio_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AudioResponse]:
    assets = db.query(AudioAsset).filter(AudioAsset.user_id == current_user.id).all()
    return [AudioResponse.model_validate(asset) for asset in assets]


@router.delete("/{audio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_audio_asset(
    audio_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_resource(current_user.id, "audio", audio_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_audio_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_all_resources(current_user.id, "audio")


@router.post("/upload", response_model=AudioResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AudioResponse:
    stored = await storage_service.save_upload(
        file,
        "audio",
        allowed_content_types={
            "audio/mpeg",
            "audio/mp4",
            "audio/wav",
            "audio/x-wav",
            "audio/webm",
            "audio/ogg",
            "audio/m4a",
        },
        max_size_bytes=250 * 1024 * 1024,
    )
    asset = AudioAsset(
        user_id=current_user.id,
        name=str(stored["name"]),
        file_path=str(stored["file_path"]),
        status="pending",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    JobService(db).create_job(current_user.id, "audio_transcription", "audio", asset.id)
    return AudioResponse.model_validate(asset)


@router.get("/{audio_id}/transcript", response_model=TranscriptResponse)
def get_audio_transcript(
    audio_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TranscriptResponse:
    transcript = TranscriptService(db).get_for_resource(current_user.id, "audio", audio_id)
    return TranscriptResponse.model_validate(transcript)


@router.get("/{audio_id}/summaries", response_model=list[SummaryArtifactResponse])
def get_audio_summaries(
    audio_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SummaryArtifactResponse]:
    summaries = TranscriptService(db).list_summaries_for_resource(current_user.id, "audio", audio_id)
    return [SummaryArtifactResponse.model_validate(item) for item in summaries]


@router.post("/speech-to-text")
def speech_to_text() -> dict[str, str]:
    return {"message": "Speech-to-text provider abstraction scaffolded"}


@router.post("/text-to-speech")
def text_to_speech() -> dict[str, str]:
    return {"message": "Text-to-speech provider abstraction scaffolded"}
