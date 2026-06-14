from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.asset_processors import AssetProcessingError
from app.services.transcription_runtime import bootstrap_transcription_runtime

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_model(model_name: str) -> Any:
    import whisper

    logger.info("Loading Whisper model '%s'", model_name)
    return whisper.load_model(model_name)


class WhisperTranscriptionService:
    def __init__(self) -> None:
        bootstrap_transcription_runtime()

    def transcribe_media(self, file_path: str, source_name: str) -> str:
        path = Path(file_path)
        if not path.exists():
            raise AssetProcessingError(f"{source_name} could not be read for transcription.")

        try:
            model = _load_model(settings.whisper_model)
            options: dict[str, object] = {"fp16": False}
            if settings.whisper_language:
                options["language"] = settings.whisper_language
            result = model.transcribe(str(path), **options)
        except Exception as exc:  # noqa: BLE001
            raise AssetProcessingError(f"Whisper transcription failed for {source_name}: {exc}") from exc

        text = result.get("text", "")
        return text.strip() if isinstance(text, str) else ""
