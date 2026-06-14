import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_processors import AssetProcessingError
from app.services.transcription_provider_service import (
    MAX_TRANSCRIPTION_FILE_BYTES,
    TranscriptionProviderService,
)


class TranscriptionProviderServiceTests(unittest.TestCase):
    def test_transcribe_media_rejects_files_over_provider_limit(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".mp4") as handle:
            service = TranscriptionProviderService(db=SimpleNamespace())
            with patch.object(Path, "stat", return_value=SimpleNamespace(st_size=MAX_TRANSCRIPTION_FILE_BYTES + 1)):
                with self.assertRaises(AssetProcessingError) as context:
                    service.transcribe_media("user-1", handle.name, "clip.mp4", "video/mp4")

        self.assertIn("25 MB", str(context.exception))

    def test_transcribe_media_returns_first_successful_provider_result(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())
        providers = [
            SimpleNamespace(name="Primary", provider_type="openai"),
            SimpleNamespace(name="Fallback", provider_type="litellm"),
        ]

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with (
                patch.object(service, "_list_transcription_providers", return_value=providers),
                patch.object(
                    service,
                    "_transcribe_with_provider",
                    side_effect=[AssetProcessingError("temporary failure"), "hello world"],
                ),
            ):
                result = service.transcribe_media("user-1", handle.name, "call.wav", "audio/wav")

        self.assertEqual(result, "hello world")

    def test_transcribe_media_raises_when_no_supported_provider_is_enabled(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with patch.object(service, "_list_transcription_providers", return_value=[]):
                with self.assertRaises(AssetProcessingError) as context:
                    service.transcribe_media("user-1", handle.name, "call.wav", "audio/wav")

        self.assertIn("No supported transcription provider", str(context.exception))
