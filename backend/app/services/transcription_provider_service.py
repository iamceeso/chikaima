from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.provider import Provider
from app.services.asset_processors import AssetProcessingError
from app.services.workspace_service import WorkspaceService

OPENAI_COMPATIBLE_PROVIDER_TYPES = ("openai", "litellm")
DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024


class TranscriptionProviderService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def transcribe_media(self, user_id: str, file_path: str, source_name: str, mime_type: str | None = None) -> str:
        path = Path(file_path)
        if not path.exists():
            raise AssetProcessingError(f"{source_name} could not be read for transcription.")

        size_bytes = path.stat().st_size
        if size_bytes > MAX_TRANSCRIPTION_FILE_BYTES:
            raise AssetProcessingError(
                f"{source_name} is {size_bytes // (1024 * 1024)} MB, but direct transcription currently supports files up to 25 MB."
            )

        providers = self._list_transcription_providers(user_id)
        if not providers:
            raise AssetProcessingError(
                "No supported transcription provider is enabled. Add an OpenAI-compatible provider to transcribe audio or video files."
            )

        errors: list[str] = []
        for provider in providers:
            try:
                return self._transcribe_with_provider(provider, path, mime_type).strip()
            except AssetProcessingError as exc:
                errors.append(f"{provider.name}: {exc}")

        raise AssetProcessingError(errors[-1] if errors else f"Transcription failed for {source_name}.")

    def _list_transcription_providers(self, user_id: str) -> list[Provider]:
        workspace = WorkspaceService(self.db).get_or_create()
        query = self.db.query(Provider).filter(
            Provider.is_enabled.is_(True),
            Provider.provider_type.in_(OPENAI_COMPATIBLE_PROVIDER_TYPES),
        )
        if workspace.authentication_enabled:
            query = query.filter(Provider.user_id == user_id)
        providers = list(query.order_by(Provider.created_at.asc()).all())
        providers.sort(key=lambda provider: OPENAI_COMPATIBLE_PROVIDER_PRIORITY.get(provider.provider_type, 100))
        return providers

    def _transcribe_with_provider(self, provider: Provider, path: Path, mime_type: str | None) -> str:
        encrypted_api_key = provider.encrypted_config.get("api_key")
        if not encrypted_api_key:
            raise AssetProcessingError(f"{provider.name} is missing an API key.")

        api_key = secret_manager.decrypt(encrypted_api_key)
        base_url = (provider.base_url or DEFAULT_BASE_URLS[provider.provider_type]).rstrip("/")
        content_type = mime_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"

        try:
            with path.open("rb") as handle, httpx.Client(timeout=300.0) as client:
                response = client.post(
                    f"{base_url}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    data={"model": DEFAULT_TRANSCRIPTION_MODEL},
                    files={"file": (path.name, handle, content_type)},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Transcription request failed."
            raise AssetProcessingError(detail) from exc
        except httpx.HTTPError as exc:
            raise AssetProcessingError("Could not reach the transcription provider.") from exc

        payload = response.json()
        text = payload.get("text", "")
        if not isinstance(text, str):
            return ""
        return text.strip()


OPENAI_COMPATIBLE_PROVIDER_PRIORITY = {
    "openai": 0,
    "litellm": 1,
}

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "litellm": "http://localhost:4000/v1",
}
