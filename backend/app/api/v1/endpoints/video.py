from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.assets import VideoResponse
from app.schemas.transcript import SummaryArtifactResponse, TranscriptResponse
from app.services.job_service import JobService
from app.services.library_service import LibraryService
from app.services.storage_service import storage_service
from app.services.transcript_service import TranscriptService

router = APIRouter()


@router.get("", response_model=list[VideoResponse])
def list_videos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VideoResponse]:
    videos = db.query(Video).filter(Video.user_id == current_user.id).all()
    return [VideoResponse.model_validate(video) for video in videos]


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_resource(current_user.id, "video", video_id)
    LibraryService.invalidate_user_cache(current_user.id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_videos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    TranscriptService(db).delete_all_resources(current_user.id, "video")
    LibraryService.invalidate_user_cache(current_user.id)


@router.post("/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VideoResponse:
    stored = await storage_service.save_upload(
        file,
        "video",
        allowed_content_types={
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
        },
        max_size_bytes=settings.video_upload_max_bytes,
    )
    video = Video(
        user_id=current_user.id,
        name=str(stored["name"]),
        file_path=str(stored["file_path"]),
        status="pending",
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    JobService(db).create_job(current_user.id, "video_analysis", "video", video.id)
    LibraryService.invalidate_user_cache(current_user.id)
    return VideoResponse.model_validate(video)


@router.get("/{video_id}/transcript", response_model=TranscriptResponse)
def get_video_transcript(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TranscriptResponse:
    transcript = TranscriptService(db).get_for_resource(current_user.id, "video", video_id)
    return TranscriptResponse.model_validate(transcript)


@router.get("/{video_id}/summaries", response_model=list[SummaryArtifactResponse])
def get_video_summaries(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SummaryArtifactResponse]:
    summaries = TranscriptService(db).list_summaries_for_resource(current_user.id, "video", video_id)
    return [SummaryArtifactResponse.model_validate(item) for item in summaries]


@router.post("/{video_id}/analyze")
def analyze_video(video_id: str) -> dict[str, str]:
    return {"video_id": video_id, "message": "Video analysis pipeline queued"}
