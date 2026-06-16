import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from tempfile import TemporaryDirectory

from app.services.asset_processors import (
    CodeProcessor,
    ImageProcessor,
    TextProcessor,
    AssetProcessorRegistry,
    AudioProcessor,
    OfficeProcessor,
    VideoProcessor,
    chunk_text,
)


class AssetProcessorTests(unittest.TestCase):
    def test_pdf_processor_returns_empty_when_dependency_or_file_is_missing(self) -> None:
        extracted = AssetProcessorRegistry()._processors[0].extract(SimpleNamespace(name="missing.pdf", file_path="/tmp/missing.pdf"))

        self.assertEqual(extracted.content, "")

    def test_chunk_text_splits_long_content_into_overlapping_chunks(self) -> None:
        text = ("abcde " * 900).strip()

        chunks = chunk_text(text, base_metadata={"source": "notes"})

        self.assertGreater(len(chunks), 1)
        self.assertEqual(chunks[0].metadata, {"source": "notes"})
        self.assertTrue(all(chunk.content for chunk in chunks))

    def test_code_processor_extracts_python_symbols(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "sample.py"
            path.write_text(
                "class Example:\n"
                "    def run(self):\n"
                "        return True\n\n"
                "def helper(value):\n"
                "    return value * 2\n",
                encoding="utf-8",
            )

            extracted = CodeProcessor().extract(SimpleNamespace(name="sample.py", file_path=str(path)))

        self.assertEqual(extracted.metadata["language"], "py")
        self.assertEqual([chunk.metadata["symbol"] for chunk in extracted.chunks], ["Example", "helper"])
        self.assertEqual(extracted.chunks[0].metadata["symbol_type"], "class")
        self.assertEqual(extracted.chunks[1].metadata["symbol_type"], "function")

    def test_image_processor_returns_description_without_ocr_text(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "diagram.png"
            path.write_bytes(b"not-really-an-image")

            extracted = ImageProcessor().extract(SimpleNamespace(name="diagram.png", file_path=str(path)))

        self.assertIn("Image asset named diagram.png", extracted.content)
        self.assertEqual(extracted.metadata["ocr_text"], "")
        self.assertTrue(extracted.chunks)

    def test_office_processor_docx_zip_fallback_returns_empty_for_invalid_archive(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "broken.docx"
            path.write_text("not a zip", encoding="utf-8")

            paragraphs = OfficeProcessor()._extract_docx_via_zip(path)

        self.assertEqual(paragraphs, [])

    def test_registry_falls_back_to_text_processor_for_unknown_files(self) -> None:
        processor = AssetProcessorRegistry().select(
            SimpleNamespace(name="archive.bin", file_path="/tmp/archive.bin"),
            "application/octet-stream",
        )

        self.assertIsInstance(processor, TextProcessor)

    def test_code_processor_falls_back_to_generic_chunks_on_syntax_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "broken.py"
            path.write_text("def broken(:\n", encoding="utf-8")

            extracted = CodeProcessor().extract(SimpleNamespace(name="broken.py", file_path=str(path)))

        self.assertTrue(extracted.chunks)
        self.assertEqual(extracted.metadata["language"], "py")

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

    def test_office_processor_returns_empty_for_missing_optional_dependencies(self) -> None:
        with TemporaryDirectory() as tmpdir:
            pptx_path = Path(tmpdir) / "slides.pptx"
            pptx_path.write_bytes(b"fake")
            xlsx_path = Path(tmpdir) / "sheet.xlsx"
            xlsx_path.write_bytes(b"fake")

            with patch("app.services.asset_processors.Presentation", None), patch("app.services.asset_processors.load_workbook", None):
                pptx_extracted = OfficeProcessor().extract(SimpleNamespace(name="slides.pptx", file_path=str(pptx_path)))
                xlsx_extracted = OfficeProcessor().extract(SimpleNamespace(name="sheet.xlsx", file_path=str(xlsx_path)))

        self.assertEqual(pptx_extracted.content, "")
        self.assertEqual(xlsx_extracted.content, "")

    def test_processor_support_checks_cover_media_types(self) -> None:
        self.assertTrue(AudioProcessor().supports(SimpleNamespace(name="clip.mp3", file_path="/tmp/clip.mp3"), None))
        self.assertTrue(VideoProcessor().supports(SimpleNamespace(name="clip.mov", file_path="/tmp/clip.mov"), None))
        self.assertTrue(ImageProcessor().supports(SimpleNamespace(name="image.bin", file_path="/tmp/image.bin"), "image/png"))
