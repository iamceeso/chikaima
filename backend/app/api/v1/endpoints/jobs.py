from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.job import JobResponse
from app.services.job_service import JobService

router = APIRouter()


@router.get("", response_model=list[JobResponse])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[JobResponse]:
    jobs = JobService(db).list_for_user(current_user.id)
    return [JobResponse.model_validate(job) for job in jobs]
