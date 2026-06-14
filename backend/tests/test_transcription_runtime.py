import os
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import transcription_runtime


class TranscriptionRuntimeTests(unittest.TestCase):
    def test_ensure_ffmpeg_on_path_prepends_binary_directory(self) -> None:
        ffmpeg_path = Path("/tmp/ffmpeg-bin/ffmpeg")
        original_path = os.environ.get("PATH")
        try:
            os.environ["PATH"] = "/usr/bin"
            transcription_runtime._ensure_ffmpeg_on_path(ffmpeg_path)
            self.assertEqual(os.environ["PATH"].split(os.pathsep)[0], str(ffmpeg_path.parent))
        finally:
            if original_path is None:
                os.environ.pop("PATH", None)
            else:
                os.environ["PATH"] = original_path

    def test_ensure_ffmpeg_command_creates_shim_for_bundled_binary(self) -> None:
        shim_path = transcription_runtime._ensure_ffmpeg_command(Path("/tmp/imageio/ffmpeg-macos"))

        self.assertTrue(shim_path.exists())
        self.assertEqual(shim_path.stem, "ffmpeg")

    def test_validate_whisper_ffmpeg_access_raises_clear_error_when_load_fails(self) -> None:
        with patch("whisper.audio.load_audio", side_effect=FileNotFoundError("ffmpeg")):
            with self.assertRaises(RuntimeError) as context:
                transcription_runtime._validate_whisper_ffmpeg_access()

        self.assertIn("Whisper could not access ffmpeg", str(context.exception))

    def test_create_validation_wav_writes_file(self) -> None:
        sample_path = transcription_runtime._create_validation_wav()
        try:
            self.assertTrue(sample_path.exists())
            self.assertEqual(sample_path.suffix, ".wav")
        finally:
            sample_path.unlink(missing_ok=True)
