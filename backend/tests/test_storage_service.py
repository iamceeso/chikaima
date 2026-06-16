import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.services.storage_service import StorageService


class StorageServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_save_upload_persists_file_and_resets_stream(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = StorageService()
            service.root = Path(temp_dir)
            upload = UploadFile(
                filename="notes final?.txt",
                file=io.BytesIO(b"hello world"),
                headers=Headers({"content-type": "text/plain"}),
            )

            result = await service.save_upload(
                upload,
                "documents",
                allowed_content_types={"text/plain"},
                max_size_bytes=1024,
            )

            self.assertEqual(result["name"], "notes final?.txt")
            self.assertEqual(result["content_type"], "text/plain")
            self.assertEqual(result["size_bytes"], 11)
            saved_path = Path(str(result["file_path"]))
            self.assertTrue(saved_path.exists())
            self.assertEqual(saved_path.read_bytes(), b"hello world")
            self.assertEqual(await upload.read(), b"hello world")

    async def test_save_upload_rejects_unsupported_content_type(self) -> None:
        service = StorageService()
        upload = UploadFile(
            filename="notes.txt",
            file=io.BytesIO(b"hello"),
            headers=Headers({"content-type": "application/pdf"}),
        )

        with self.assertRaises(HTTPException) as context:
            await service.save_upload(
                upload,
                "documents",
                allowed_content_types={"text/plain"},
                max_size_bytes=1024,
            )

        self.assertEqual(context.exception.status_code, 400)

    async def test_save_upload_deletes_partial_file_when_size_limit_is_exceeded(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = StorageService()
            service.root = Path(temp_dir)
            upload = UploadFile(filename=None, file=io.BytesIO(b"toolarge"), headers=Headers())

            with self.assertRaises(HTTPException) as context:
                await service.save_upload(
                    upload,
                    "documents",
                    allowed_content_types={"application/octet-stream"},
                    max_size_bytes=4,
                )

            self.assertEqual(context.exception.status_code, 413)
            self.assertEqual(list((Path(temp_dir) / "documents").glob("*")), [])

    def test_delete_file_ignores_missing_paths_and_os_errors(self) -> None:
        service = StorageService()
        service.delete_file(None)

        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "sample.txt"
            file_path.write_text("hello")
            service.delete_file(str(file_path))
            self.assertFalse(file_path.exists())

        with patch("app.services.storage_service.Path.unlink", side_effect=OSError("locked")):
            service.delete_file("/tmp/locked.txt")

    def test_sanitize_filename_returns_safe_default(self) -> None:
        service = StorageService()

        self.assertEqual(service._sanitize_filename("hello world?.txt"), "hello-world-.txt")
        self.assertEqual(service._sanitize_filename("///"), "upload")
