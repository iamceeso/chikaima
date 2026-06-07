from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.root = Path(settings.media_root)

    async def save_upload(
        self,
        file: UploadFile,
        category: str,
        *,
        allowed_content_types: set[str],
        max_size_bytes: int,
    ) -> dict[str, str | int]:
        content_type = file.content_type or "application/octet-stream"
        if content_type not in allowed_content_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {content_type}",
            )

        original_name = file.filename or f"{category}-upload"
        safe_name = self._sanitize_filename(original_name)
        target_dir = self.root / category
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{uuid.uuid4()}-{safe_name}"

        size = 0
        with target_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_size_bytes:
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Uploaded file exceeds the size limit.",
                    )
                output.write(chunk)

        await file.seek(0)

        return {
            "name": original_name,
            "file_path": str(target_path),
            "content_type": content_type,
            "size_bytes": size,
        }

    def delete_file(self, file_path: str | None) -> None:
        if not file_path:
            return
        path = Path(file_path)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            return

    def _sanitize_filename(self, name: str) -> str:
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
        return sanitized or "upload"


storage_service = StorageService()
