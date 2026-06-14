import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_processors import AudioProcessor, VideoProcessor


class AssetProcessorTests(unittest.TestCase):
    def test_audio_processor_uses_whisper_transcription_service(self) -> None:
        resource = SimpleNamespace(file_path="/tmp/audio.wav", name="audio.wav")

        with patch("app.services.whisper_transcription_service.WhisperTranscriptionService.transcribe_media", return_value="hello world"):
            extracted = AudioProcessor().extract(resource, "audio/wav")

        self.assertEqual(extracted.transcript, "hello world")
        self.assertTrue(extracted.chunks)

    def test_video_processor_returns_silent_placeholder_when_no_text_detected(self) -> None:
        resource = SimpleNamespace(file_path="/tmp/video.mp4", name="video.mp4")

        with patch("app.services.whisper_transcription_service.WhisperTranscriptionService.transcribe_media", return_value=""):
            extracted = VideoProcessor().extract(resource, "video/mp4")

        self.assertEqual(extracted.transcript, "No spoken audio was detected in video.mp4.")
