import unittest
from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

from app.api.v1.endpoints.audio import (
    clear_audio_assets,
    delete_audio_asset,
    get_audio_summaries,
    get_audio_transcript,
    list_audio_assets,
    speech_to_text,
    text_to_speech,
    upload_audio,
)
from app.models.audio import AudioAsset


def make_audio(audio_id: str) -> AudioAsset:
    audio = AudioAsset(user_id="user-1", name="call.wav", file_path="/tmp/call.wav", transcript="Transcript", status="completed")
    audio.id = audio_id
    now = datetime.now(UTC)
    audio.created_at = now
    audio.updated_at = now
    return audio


def make_summary(summary_type: str) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=f"{summary_type}-1",
        user_id="user-1",
        resource_type="audio",
        resource_id="audio-1",
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


class AudioEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_audio_persists_asset_dispatches_job_and_invalidates_cache(self) -> None:
        db_calls: list[str] = []
        db = SimpleNamespace(
            add=lambda _item: db_calls.append("add"),
            commit=lambda: db_calls.append("commit"),
            refresh=lambda asset: (
                setattr(asset, "id", "audio-1"),
                setattr(asset, "created_at", datetime.now(UTC)),
                setattr(asset, "updated_at", datetime.now(UTC)),
            ),
        )
        current_user = SimpleNamespace(id="user-1")
        upload = UploadFile(filename="call.wav", file=BytesIO(b"audio"))

        with (
            patch("app.api.v1.endpoints.audio.storage_service.save_upload", new=AsyncMock(return_value={"name": "call.wav", "file_path": "/tmp/call.wav"})),
            patch("app.api.v1.endpoints.audio.JobService") as job_service,
            patch("app.api.v1.endpoints.audio.LibraryService") as library_service,
        ):
            response = await upload_audio(upload, db, current_user)

        self.assertEqual(response.name, "call.wav")
        self.assertEqual(response.status, "pending")
        self.assertEqual(db_calls, ["add", "commit"])
        job_service.return_value.create_job.assert_called_once_with("user-1", "audio_transcription", "audio", "audio-1")
        library_service.invalidate_user_cache.assert_called_once_with("user-1")

    async def test_endpoint_helpers_list_delete_and_read_audio_resources(self) -> None:
        audio = make_audio("audio-1")
        transcript = SimpleNamespace(
            id="transcript-1",
            user_id="user-1",
            resource_type="audio",
            resource_id="audio-1",
            language="en",
            content="Transcript",
            segments=[],
            status="completed",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db = SimpleNamespace(query=lambda _model: QueryStub([audio]))
        current_user = SimpleNamespace(id="user-1")

        with (
            patch("app.api.v1.endpoints.audio.TranscriptService") as transcript_service,
            patch("app.api.v1.endpoints.audio.LibraryService") as library_service,
        ):
            transcript_service.return_value.get_for_resource.return_value = transcript
            transcript_service.return_value.list_summaries_for_resource.return_value = [make_summary("summary"), make_summary("key_points")]

            listed = list_audio_assets(db, current_user)
            got_transcript = get_audio_transcript("audio-1", db, current_user)
            got_summaries = get_audio_summaries("audio-1", db, current_user)
            delete_audio_asset("audio-1", db, current_user)
            clear_audio_assets(db, current_user)

        self.assertEqual(listed[0].name, "call.wav")
        self.assertEqual(got_transcript.content, "Transcript")
        self.assertEqual(len(got_summaries), 2)
        transcript_service.return_value.delete_resource.assert_called_once_with("user-1", "audio", "audio-1")
        transcript_service.return_value.delete_all_resources.assert_called_once_with("user-1", "audio")
        self.assertEqual(library_service.invalidate_user_cache.call_count, 2)

    async def test_not_implemented_audio_routes_raise_501(self) -> None:
        with self.assertRaises(HTTPException) as speech_context:
            speech_to_text()
        with self.assertRaises(HTTPException) as tts_context:
            text_to_speech()

        self.assertEqual(speech_context.exception.status_code, 501)
        self.assertEqual(tts_context.exception.status_code, 501)
