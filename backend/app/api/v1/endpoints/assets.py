from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.document import Document
from app.models.user import User
from app.services.transcript_service import TranscriptService

router = APIRouter()


@router.get("/{resource_type}/{resource_id}/file")
def get_asset_file(
    resource_type: str,
    resource_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    resource = TranscriptService(db).get_resource(current_user.id, resource_type, resource_id)
    file_path = Path(getattr(resource, "file_path", ""))
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file not found")

    media_type = "application/octet-stream"
    if isinstance(resource, Document):
        media_type = resource.mime_type or media_type
    else:
        guessed_type, _ = mimetypes.guess_type(file_path.name)
        if guessed_type:
            media_type = guessed_type

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=getattr(resource, "name", file_path.name),
        headers={"Content-Disposition": f'inline; filename="{getattr(resource, "name", file_path.name)}"'},
    )
