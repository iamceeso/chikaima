from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.audio import AudioAsset
from app.models.user import User
from app.schemas.assets import AudioResponse
from app.services.job_service import JobService

router = APIRouter()


@router.get("", response_model=list[AudioResponse])
def list_audio_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AudioResponse]:
    assets = db.query(AudioAsset).filter(AudioAsset.user_id == current_user.id).all()
    return [AudioResponse.model_validate(asset) for asset in assets]


@router.post("/upload", response_model=AudioResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AudioResponse:
    asset = AudioAsset(
        user_id=current_user.id,
        name=file.filename or "audio",
        file_path=f"uploads/audio/{file.filename or 'audio'}",
        status="pending",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    JobService(db).create_job(current_user.id, "audio_transcription", "audio", asset.id)
    return AudioResponse.model_validate(asset)


@router.post("/speech-to-text")
def speech_to_text() -> dict[str, str]:
    return {"message": "Speech-to-text provider abstraction scaffolded"}


@router.post("/text-to-speech")
def text_to_speech() -> dict[str, str]:
    return {"message": "Text-to-speech provider abstraction scaffolded"}
