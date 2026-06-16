import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api.v1.endpoints.assets import get_asset_file
from app.models.document import Document
from app.models.video import Video


class AssetsEndpointTests(unittest.TestCase):
    def test_get_asset_file_rejects_missing_stored_file(self) -> None:
        db = SimpleNamespace()
        current_user = SimpleNamespace(id="user-1")
        resource = SimpleNamespace(file_path="/tmp/missing-file", name="missing.txt")

        with patch("app.api.v1.endpoints.assets.TranscriptService") as transcript_service:
            transcript_service.return_value.get_resource.return_value = resource
            with self.assertRaises(HTTPException) as context:
                get_asset_file("document", "doc-1", db, current_user)

        self.assertEqual(context.exception.status_code, 404)

    def test_get_asset_file_uses_document_mime_type(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "notes.pdf"
            path.write_bytes(b"pdf")
            resource = Document(
                user_id="user-1",
                name="notes.pdf",
                file_path=str(path),
                mime_type="application/pdf",
                summary=None,
                status="completed",
            )
            db = SimpleNamespace()
            current_user = SimpleNamespace(id="user-1")

            with patch("app.api.v1.endpoints.assets.TranscriptService") as transcript_service:
                transcript_service.return_value.get_resource.return_value = resource
                response = get_asset_file("document", "doc-1", db, current_user)

        self.assertEqual(response.media_type, "application/pdf")
        self.assertIn('filename="notes.pdf"', response.headers["Content-Disposition"])

    def test_get_asset_file_guesses_media_type_for_non_documents(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "clip.mp4"
            path.write_bytes(b"video")
            resource = Video(
                user_id="user-1",
                name="clip.mp4",
                file_path=str(path),
                transcript=None,
                summary=None,
                chapters=[],
                action_items=[],
                status="completed",
            )
            db = SimpleNamespace()
            current_user = SimpleNamespace(id="user-1")

            with patch("app.api.v1.endpoints.assets.TranscriptService") as transcript_service:
                transcript_service.return_value.get_resource.return_value = resource
                response = get_asset_file("video", "video-1", db, current_user)

        self.assertEqual(response.media_type, "video/mp4")
