import unittest

import httpx
from fastapi import HTTPException

from app.services.providers.base import (
    OpenAIAdapter,
    _extract_stream_error_detail,
    _extract_system_prompt,
    _iter_sse_json_events,
    _merge_consecutive_messages,
    _normalize_messages,
    _text_from_content,
)


class ProviderAdapterHelpersTests(unittest.TestCase):
    def test_text_from_content_handles_string_list_and_fallback(self) -> None:
        self.assertEqual(_text_from_content("Hello"), "Hello")
        self.assertEqual(
            _text_from_content(
                [
                    {"type": "text", "text": " First "},
                    {"type": "image", "text": "ignored"},
                    {"type": "text", "text": "Second"},
                ]
            ),
            "First\n\nSecond",
        )
        self.assertEqual(_text_from_content(None), "")

    def test_normalize_messages_skips_empty_content(self) -> None:
        normalized = _normalize_messages(
            [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "   "},
                {"role": "user", "content": []},
                {"role": "assistant"},
                {"role": "assistant", "content": [{"type": "text", "text": "Hi"}]},
            ]
        )

        self.assertEqual(
            normalized,
            [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": [{"type": "text", "text": "Hi"}]},
            ],
        )

    def test_extract_system_prompt_collects_system_messages(self) -> None:
        system_prompt, conversation = _extract_system_prompt(
            [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Hi"},
                {"role": "system", "content": [{"type": "text", "text": "Be concise."}]},
            ]
        )

        self.assertEqual(system_prompt, "You are helpful.\n\nBe concise.")
        self.assertEqual(conversation, [{"role": "user", "content": "Hi"}])

    def test_merge_consecutive_messages_combines_strings_and_lists(self) -> None:
        merged = _merge_consecutive_messages(
            [
                {"role": "user", "content": "Hello"},
                {"role": "user", "content": "World"},
                {"role": "assistant", "content": [{"type": "text", "text": "A"}]},
                {"role": "assistant", "content": [{"type": "text", "text": "B"}]},
            ]
        )

        self.assertEqual(
            merged,
            [
                {"role": "user", "content": "Hello\n\nWorld"},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "A"},
                        {"type": "text", "text": "B"},
                    ],
                },
            ],
        )

    def test_iter_sse_json_events_parses_and_skips_invalid_chunks(self) -> None:
        events = list(
            _iter_sse_json_events(
                iter(
                    [
                        "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}",
                        "",
                        "data: not-json",
                        "",
                        "data: [DONE]",
                        "",
                    ]
                )
            )
        )

        self.assertEqual(events, [{"choices": [{"delta": {"content": "Hi"}}]}])

    def test_extract_stream_error_detail_returns_fallback_on_read_failure(self) -> None:
        class BrokenResponse:
            def read(self) -> bytes:
                raise RuntimeError("boom")

        self.assertEqual(
            _extract_stream_error_detail(BrokenResponse(), "fallback"),
            "fallback",
        )


class OpenAIAdapterTests(unittest.TestCase):
    def test_extract_content_supports_string_and_text_parts(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")

        self.assertEqual(
            adapter._extract_content({"choices": [{"message": {"content": "Hello"}}]}),
            "Hello",
        )
        self.assertEqual(
            adapter._extract_content(
                {
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {"type": "text", "text": "First"},
                                    {"type": "image", "text": "ignored"},
                                    {"type": "text", "text": "Second"},
                                ]
                            }
                        }
                    ]
                }
            ),
            "First\nSecond",
        )

    def test_build_messages_translates_image_parts(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")

        built = adapter._build_messages(
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this"},
                        {"type": "image", "mime_type": "image/png", "data": "abc123"},
                    ],
                }
            ]
        )

        self.assertEqual(
            built,
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this"},
                        {
                            "type": "image_url",
                            "image_url": {"url": "data:image/png;base64,abc123"},
                        },
                    ],
                }
            ],
        )

    def test_generate_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key", provider_label="OpenRouter")

        class FailingClient:
            def __init__(self, *args, **kwargs) -> None:  # type: ignore[no-untyped-def]
                return None

            def __enter__(self) -> "FailingClient":
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def post(self, *args, **kwargs):  # type: ignore[no-untyped-def]
                raise httpx.ConnectError("offline")

        original_client = httpx.Client
        httpx.Client = FailingClient  # type: ignore[assignment]
        try:
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("gpt-test", [{"role": "user", "content": "Hi"}])
        finally:
            httpx.Client = original_client  # type: ignore[assignment]

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(context.exception.detail, "Could not reach OpenRouter.")

    def test_stream_reply_uses_provider_specific_fallback_message(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key", provider_label="OpenRouter")

        request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        response = httpx.Response(502, request=request, content=b"")

        class FailingStreamClient:
            def __init__(self, *args, **kwargs) -> None:  # type: ignore[no-untyped-def]
                return None

            def __enter__(self) -> "FailingStreamClient":
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def stream(self, *args, **kwargs):  # type: ignore[no-untyped-def]
                class StreamContext:
                    def __enter__(self_inner):
                        raise httpx.HTTPStatusError("bad gateway", request=request, response=response)

                    def __exit__(self_inner, exc_type, exc, tb) -> None:
                        return None

                return StreamContext()

        original_client = httpx.Client
        httpx.Client = FailingStreamClient  # type: ignore[assignment]
        try:
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("~anthropic/claude-fable-latest", [{"role": "user", "content": "Hi"}]))
        finally:
            httpx.Client = original_client  # type: ignore[assignment]

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(
            context.exception.detail,
            "OpenRouter streaming request failed for model ~anthropic/claude-fable-latest.",
        )
