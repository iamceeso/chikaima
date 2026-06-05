from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.assets import VideoResponse
from app.services.job_service import JobService

router = APIRouter()


@router.get("", response_model=list[VideoResponse])
def list_videos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VideoResponse]:
    videos = db.query(Video).filter(Video.user_id == current_user.id).all()
    return [VideoResponse.model_validate(video) for video in videos]


@router.post("/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VideoResponse:
    video = Video(
        user_id=current_user.id,
        name=file.filename or "video",
        file_path=f"uploads/video/{file.filename or 'video'}",
        status="pending",
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    JobService(db).create_job(current_user.id, "video_analysis", "video", video.id)
    return VideoResponse.model_validate(video)


@router.post("/{video_id}/analyze")
def analyze_video(video_id: str) -> dict[str, str]:
    return {"video_id": video_id, "message": "Video analysis pipeline queued"}
