import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx

from app.services.asset_processors import AssetProcessingError
from app.services.transcription_provider_service import (
    DEFAULT_BASE_URLS,
    MAX_TRANSCRIPTION_FILE_BYTES,
    TranscriptionProviderService,
)


class TranscriptionProviderServiceTests(unittest.TestCase):
    def test_init_sets_db(self) -> None:
        service = TranscriptionProviderService(db="db")

        self.assertEqual(service.db, "db")

    def test_transcribe_media_rejects_missing_file(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())

        with self.assertRaises(AssetProcessingError) as context:
            service.transcribe_media("user-1", "/tmp/missing-file.wav", "call.wav", "audio/wav")

        self.assertIn("could not be read", str(context.exception))

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

    def test_transcribe_media_raises_last_provider_error_when_all_providers_fail(self) -> None:
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
                    side_effect=[AssetProcessingError("temporary failure"), AssetProcessingError("still failing")],
                ),
            ):
                with self.assertRaises(AssetProcessingError) as context:
                    service.transcribe_media("user-1", handle.name, "call.wav", "audio/wav")

        self.assertEqual(str(context.exception), "Fallback: still failing")

    def test_list_transcription_providers_filters_by_workspace_mode_and_priority(self) -> None:
        providers = [
            SimpleNamespace(name="LiteLLM", provider_type="litellm"),
            SimpleNamespace(name="OpenAI", provider_type="openai"),
        ]

        class QueryStub:
            def __init__(self) -> None:
                self.filter_calls = 0

            def filter(self, *_args, **_kwargs) -> "QueryStub":
                self.filter_calls += 1
                return self

            def order_by(self, *_args, **_kwargs) -> "QueryStub":
                return self

            def all(self) -> list[object]:
                return providers

        query = QueryStub()
        service = TranscriptionProviderService(db=SimpleNamespace(query=lambda _model: query))

        with patch("app.services.transcription_provider_service.WorkspaceService") as workspace_service:
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=True)
            scoped = service._list_transcription_providers("user-1")
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=False)
            unscoped = service._list_transcription_providers("user-1")

        self.assertEqual([provider.provider_type for provider in scoped], ["openai", "litellm"])
        self.assertEqual([provider.provider_type for provider in unscoped], ["openai", "litellm"])
        self.assertGreaterEqual(query.filter_calls, 3)

    def test_transcribe_with_provider_rejects_missing_api_key(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with self.assertRaises(AssetProcessingError) as context:
                service._transcribe_with_provider(
                    SimpleNamespace(name="OpenAI", provider_type="openai", encrypted_config={}, base_url=None),
                    Path(handle.name),
                    None,
                )

        self.assertEqual(str(context.exception), "OpenAI is missing an API key.")

    def test_transcribe_with_local_provider_allows_missing_api_key(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())
        provider = SimpleNamespace(
            name="Local Gateway",
            provider_type="local",
            encrypted_config={},
            base_url="http://localhost:4000/v1",
        )
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"text": "  local transcript  "},
        )
        client = MagicMock()
        client.__enter__.return_value.post.return_value = response

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with patch("app.services.transcription_provider_service.httpx.Client", return_value=client):
                result = service._transcribe_with_provider(provider, Path(handle.name), "audio/wav")

        self.assertEqual(result, "local transcript")
        self.assertEqual(client.__enter__.return_value.post.call_args.kwargs["headers"], {})

    def test_transcribe_with_provider_uses_defaults_and_returns_stripped_text(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())
        provider = SimpleNamespace(
            name="OpenAI",
            provider_type="openai",
            encrypted_config={"api_key": "encrypted"},
            base_url=None,
        )
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"text": "  hello world  "},
        )
        client = MagicMock()
        client.__enter__.return_value.post.return_value = response

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with (
                patch("app.services.transcription_provider_service.secret_manager.decrypt", return_value="sk-test"),
                patch("app.services.transcription_provider_service.httpx.Client", return_value=client),
                patch("app.services.transcription_provider_service.mimetypes.guess_type", return_value=("audio/wav", None)),
            ):
                result = service._transcribe_with_provider(provider, Path(handle.name), None)

        self.assertEqual(result, "hello world")
        self.assertIn(DEFAULT_BASE_URLS["openai"], client.__enter__.return_value.post.call_args.args[0])

    def test_transcribe_with_provider_handles_http_errors_and_non_string_text(self) -> None:
        service = TranscriptionProviderService(db=SimpleNamespace())
        provider = SimpleNamespace(
            name="OpenAI",
            provider_type="openai",
            encrypted_config={"api_key": "encrypted"},
            base_url="https://api.example.com/v1",
        )

        with tempfile.NamedTemporaryFile(suffix=".wav") as handle:
            with patch("app.services.transcription_provider_service.secret_manager.decrypt", return_value="sk-test"):
                status_error = httpx.HTTPStatusError(
                    "bad request",
                    request=httpx.Request("POST", "https://api.example.com/v1/audio/transcriptions"),
                    response=httpx.Response(400, content=b"request failed"),
                )
                response = SimpleNamespace(raise_for_status=lambda: (_ for _ in ()).throw(status_error))
                client = MagicMock()
                client.__enter__.return_value.post.return_value = response
                with patch("app.services.transcription_provider_service.httpx.Client", return_value=client):
                    with self.assertRaises(AssetProcessingError) as status_context:
                        service._transcribe_with_provider(provider, Path(handle.name), "audio/wav")

                self.assertEqual(str(status_context.exception), "request failed")

                with patch("app.services.transcription_provider_service.httpx.Client", side_effect=httpx.HTTPError("offline")):
                    with self.assertRaises(AssetProcessingError) as transport_context:
                        service._transcribe_with_provider(provider, Path(handle.name), "audio/wav")

                self.assertEqual(str(transport_context.exception), "Could not reach the transcription provider.")

                success_response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"text": ["bad"]})
                success_client = MagicMock()
                success_client.__enter__.return_value.post.return_value = success_response
                with patch("app.services.transcription_provider_service.httpx.Client", return_value=success_client):
                    result = service._transcribe_with_provider(provider, Path(handle.name), "audio/wav")

        self.assertEqual(result, "")
