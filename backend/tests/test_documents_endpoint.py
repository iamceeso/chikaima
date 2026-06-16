import unittest
from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile

from app.api.v1.endpoints.documents import (
    ask_document,
    clear_documents,
    delete_document,
    get_document_summaries,
    get_document_transcript,
    list_documents,
    summarize_document,
    upload_document,
)
from app.models.document import Document


def make_document(document_id: str) -> Document:
    document = Document(
        user_id="user-1",
        name="notes.pdf",
        file_path="/tmp/notes.pdf",
        mime_type="application/pdf",
        summary="Summary",
        status="completed",
    )
    document.id = document_id
    now = datetime.now(UTC)
    document.created_at = now
    document.updated_at = now
    return document


def make_summary(summary_type: str) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=f"{summary_type}-1",
        user_id="user-1",
        resource_type="document",
        resource_id="doc-1",
        summary_type=summary_type,
        content="Summary" if summary_type == "summary" else "",
        data={"items": ["Point"]} if summary_type == "key_points" else {},
        status="completed",
        created_at=now,
        updated_at=now,
    )


class QueryStub:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def filter(self, *_args, **_kwargs) -> "QueryStub":
        return self

    def all(self) -> list[object]:
        return self.rows


class DocumentsEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_document_persists_asset_dispatches_job_and_invalidates_cache(self) -> None:
        db_calls: list[str] = []
        db = SimpleNamespace(
            add=lambda _item: db_calls.append("add"),
            commit=lambda: db_calls.append("commit"),
            refresh=lambda document: (
                setattr(document, "id", "doc-1"),
                setattr(document, "created_at", datetime.now(UTC)),
                setattr(document, "updated_at", datetime.now(UTC)),
            ),
        )
        current_user = SimpleNamespace(id="user-1")
        upload = UploadFile(filename="notes.pdf", file=BytesIO(b"pdf"))

        with (
            patch(
                "app.api.v1.endpoints.documents.storage_service.save_upload",
                new=AsyncMock(return_value={"name": "notes.pdf", "file_path": "/tmp/notes.pdf", "content_type": "application/pdf"}),
            ),
            patch("app.api.v1.endpoints.documents.JobService") as job_service,
            patch("app.api.v1.endpoints.documents.LibraryService") as library_service,
        ):
            response = await upload_document(upload, db, current_user)

        self.assertEqual(response.name, "notes.pdf")
        self.assertEqual(response.mime_type, "application/pdf")
        self.assertEqual(db_calls, ["add", "commit"])
        job_service.return_value.create_job.assert_called_once_with("user-1", "document_analysis", "document", "doc-1")
        library_service.invalidate_user_cache.assert_called_once_with("user-1")

    async def test_document_endpoints_delegate_to_transcript_service(self) -> None:
        document = make_document("doc-1")
        transcript = SimpleNamespace(
            id="transcript-1",
            user_id="user-1",
            resource_type="document",
            resource_id="doc-1",
            language="en",
            content="Transcript",
            segments=[],
            status="completed",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db = SimpleNamespace(query=lambda _model: QueryStub([document]))
        current_user = SimpleNamespace(id="user-1")

        with (
            patch("app.api.v1.endpoints.documents.TranscriptService") as transcript_service,
            patch("app.api.v1.endpoints.documents.LibraryService") as library_service,
        ):
            transcript_service.return_value.get_for_resource.return_value = transcript
            transcript_service.return_value.list_summaries_for_resource.return_value = [make_summary("summary"), make_summary("key_points")]
            transcript_service.return_value.summarize_resource.return_value = [make_summary("summary")]
            transcript_service.return_value.query_resource.return_value = "Answer"

            listed = list_documents(db, current_user)
            got_transcript = get_document_transcript("doc-1", db, current_user)
            got_summaries = get_document_summaries("doc-1", db, current_user)
            summarized = summarize_document("doc-1", db, current_user)
            answered = ask_document("doc-1", SimpleNamespace(question="What?"), db, current_user)
            delete_document("doc-1", db, current_user)
            clear_documents(db, current_user)

        self.assertEqual(listed[0].name, "notes.pdf")
        self.assertEqual(got_transcript.content, "Transcript")
        self.assertEqual(len(got_summaries), 2)
        self.assertEqual(summarized[0].summary_type, "summary")
        self.assertEqual(answered, {"document_id": "doc-1", "answer": "Answer"})
        transcript_service.return_value.query_resource.assert_called_once_with("user-1", "document", "doc-1", "What?")
        transcript_service.return_value.delete_resource.assert_called_once_with("user-1", "document", "doc-1")
        transcript_service.return_value.delete_all_resources.assert_called_once_with("user-1", "document")
        self.assertEqual(library_service.invalidate_user_cache.call_count, 2)
