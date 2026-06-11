import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.asset_processors import AssetProcessingError, VideoProcessor, _transcribe_audio


class AssetProcessorTests(unittest.TestCase):
    def test_transcribe_audio_raises_when_whisper_dependency_is_missing(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with patch("app.services.asset_processors.whisper", None):
                with self.assertRaises(AssetProcessingError) as context:
                    _transcribe_audio(Path(handle.name), "clip.wav")

        self.assertIn("openai-whisper", str(context.exception))

    def test_video_processor_raises_when_ffmpeg_is_missing(self) -> None:
        processor = VideoProcessor()
        resource = SimpleNamespace(name="video.mp4", file_path="/tmp/video.mp4")

        with patch("app.services.asset_processors.shutil.which", return_value=None):
            with self.assertRaises(AssetProcessingError) as context:
                processor.extract(resource, "video/mp4")

        self.assertIn("ffmpeg", str(context.exception))
