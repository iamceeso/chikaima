import tempfile
import unittest
from unittest.mock import MagicMock, patch

from app.services.asset_processors import AssetProcessingError
from app.services.whisper_transcription_service import WhisperTranscriptionService


class WhisperTranscriptionServiceTests(unittest.TestCase):
    @patch("app.services.whisper_transcription_service.bootstrap_transcription_runtime")
    def test_transcribe_media_returns_text(self, _bootstrap: MagicMock) -> None:
        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            mock_model = MagicMock()
            mock_model.transcribe.return_value = {"text": " hello world "}

            with patch("app.services.whisper_transcription_service._load_model", return_value=mock_model):
                service = WhisperTranscriptionService()
                result = service.transcribe_media(handle.name, "call.wav")

        self.assertEqual(result, "hello world")

    @patch("app.services.whisper_transcription_service.bootstrap_transcription_runtime")
    def test_transcribe_media_raises_for_missing_file(self, _bootstrap: MagicMock) -> None:
        service = WhisperTranscriptionService()

        with self.assertRaises(AssetProcessingError) as context:
            service.transcribe_media("/tmp/does-not-exist.wav", "missing.wav")

        self.assertIn("could not be read", str(context.exception))

    @patch("app.services.whisper_transcription_service.bootstrap_transcription_runtime")
    def test_transcribe_media_wraps_whisper_errors(self, _bootstrap: MagicMock) -> None:
        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            mock_model = MagicMock()
            mock_model.transcribe.side_effect = RuntimeError("decoder crashed")

            with patch("app.services.whisper_transcription_service._load_model", return_value=mock_model):
                service = WhisperTranscriptionService()
                with self.assertRaises(AssetProcessingError) as context:
                    service.transcribe_media(handle.name, "broken.wav")

        self.assertIn("Whisper transcription failed", str(context.exception))
