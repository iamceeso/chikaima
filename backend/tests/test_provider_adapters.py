import unittest
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
from fastapi import HTTPException

from app.services.providers.base import (
    AnthropicAdapter,
    GeminiAdapter,
    OllamaAdapter,
    OpenAIAdapter,
    ProviderAdapter,
    _extract_stream_error_detail,
    _extract_system_prompt,
    _iter_sse_json_events,
    _merge_consecutive_messages,
    _merge_message_content,
    _normalize_messages,
    _text_from_content,
)


def build_response(
    *,
    json_payload: dict[str, Any] | None = None,
    text: str = "",
    lines: list[str] | None = None,
) -> MagicMock:
    response = MagicMock()
    response.json.return_value = json_payload or {}
    response.text = text
    response.read.return_value = text.encode("utf-8")
    response.iter_lines.return_value = lines or []
    return response


def build_status_error(url: str, text: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(502, request=request, content=text.encode("utf-8"))
    return httpx.HTTPStatusError("bad gateway", request=request, response=response)


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
        self.assertEqual(_text_from_content(12), "12")

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

    def test_merge_message_content_merges_mixed_content_and_filters_empty_text_parts(self) -> None:
        self.assertEqual(_merge_message_content("Hello", "World"), "Hello\n\nWorld")
        self.assertEqual(
            _merge_message_content(
                " Left ",
                [{"type": "text", "text": ""}, {"type": "image", "data": "x"}],
            ),
            [{"type": "text", "text": "Left"}, {"type": "image", "data": "x"}],
        )

    def test_iter_sse_json_events_parses_and_skips_invalid_chunks(self) -> None:
        events = list(
            _iter_sse_json_events(
                iter(
                    [
                        "",
                        "event: message",
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

    def test_extract_stream_error_detail_handles_payload_empty_and_read_failure(self) -> None:
        class BrokenResponse:
            def read(self) -> bytes:
                raise RuntimeError("boom")

        self.assertEqual(_extract_stream_error_detail(BrokenResponse(), "fallback"), "fallback")
        self.assertEqual(_extract_stream_error_detail(build_response(text="details"), "fallback"), "details")
        self.assertEqual(_extract_stream_error_detail(build_response(text=""), "fallback"), "fallback")

    def test_iter_sse_json_events_emits_trailing_payload_and_returns_on_invalid_trailing_data(self) -> None:
        events = list(_iter_sse_json_events(iter(['data: {"done": true}'])))

        self.assertEqual(events, [{"done": True}])
        self.assertEqual(list(_iter_sse_json_events(iter(["data: not-json"]))), [])
        self.assertEqual(list(_iter_sse_json_events(iter(["data: [DONE]"]))), [])


class ProviderAdapterAbstractTests(unittest.TestCase):
    def test_abstract_base_methods_raise_not_implemented(self) -> None:
        class ConcreteAdapter(ProviderAdapter):
            def generate_reply(self, model_key: str, messages: list[dict[str, Any]]) -> str:
                return ProviderAdapter.generate_reply(self, model_key, messages)

            def stream_reply(self, model_key: str, messages: list[dict[str, Any]]):  # type: ignore[override]
                return ProviderAdapter.stream_reply(self, model_key, messages)

        adapter = ConcreteAdapter()

        with self.assertRaises(NotImplementedError):
            adapter.generate_reply("model", [])
        with self.assertRaises(NotImplementedError):
            list(adapter.stream_reply("model", []))


class OpenAIAdapterTests(unittest.TestCase):
    def test_extract_content_supports_string_text_parts_and_fallback(self) -> None:
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
        self.assertEqual(adapter._extract_content({"choices": [{"message": {"content": None}}]}), "")

    def test_build_messages_translates_image_parts_and_plain_strings(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")

        built = adapter._build_messages(
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this"},
                        {"type": "image", "mime_type": "image/png", "data": "abc123"},
                        {"type": "image", "mime_type": "image/png"},
                        "ignored",
                    ],
                },
                {"role": "assistant", "content": "Thanks"},
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
                },
                {"role": "assistant", "content": "Thanks"},
            ],
        )

    def test_generate_reply_returns_extracted_content(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key", base_url="https://example.com/v1")
        response = build_response(
            json_payload={
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"type": "text", "text": " First "},
                                {"type": "text", "text": "Second"},
                            ]
                        }
                    }
                ]
            }
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client = client_cls.return_value.__enter__.return_value
            client.post.return_value = response
            reply = adapter.generate_reply("gpt-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(reply, "First\nSecond")
        self.assertEqual(
            client.post.call_args.kwargs["json"],
            {"model": "gpt-test", "messages": [{"role": "user", "content": "Hi"}]},
        )

    def test_generate_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error("https://api.openai.com/v1/chat/completions", "upstream failed")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("gpt-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(context.exception.detail, "upstream failed")

    def test_generate_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key", provider_label="OpenRouter")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("gpt-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(context.exception.detail, "Could not reach OpenRouter.")

    def test_stream_reply_yields_string_and_text_delta_content(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")
        response = build_response(
            lines=[
                'data: {"choices":[{"delta":{"content":"Hello"}}]}',
                "",
                'data: {"choices":[{"delta":{"content":[{"type":"text_delta","text":" world"}]}}]}',
                "",
                'data: {"choices":[{"delta":{"content":[{"type":"image"},"skip",{"type":"text_delta","text":""}]}}]}',
                "",
                'data: {"choices":[{"delta":{"content":[]}}]}',
                "",
            ]
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client = client_cls.return_value.__enter__.return_value
            client.stream.return_value.__enter__.return_value = response
            chunks = list(adapter.stream_reply("gpt-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(chunks, ["Hello", " world"])

    def test_stream_reply_uses_provider_specific_fallback_message(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key", provider_label="OpenRouter")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            response = build_response()
            response.raise_for_status.side_effect = build_status_error(
                "https://openrouter.ai/api/v1/chat/completions",
                "",
            )
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("~anthropic/claude-fable-latest", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.status_code, 502)
        self.assertEqual(
            context.exception.detail,
            "OpenRouter streaming request failed for model ~anthropic/claude-fable-latest.",
        )

    def test_stream_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("gpt-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "Could not reach OpenAI.")

    def test_stream_reply_skips_non_text_delta_parts_inside_content_lists(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")
        response = build_response(lines=["data: {}"])

        with (
            patch("app.services.providers.base.httpx.Client") as client_cls,
            patch(
                "app.services.providers.base._iter_sse_json_events",
                return_value=iter(
                    [
                        {"choices": [{"delta": {"content": [{"type": "image"}, "skip", {"type": "text_delta", "text": ""}]}}]},
                        {"choices": []},
                    ]
                ),
            ),
        ):
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            chunks = list(adapter.stream_reply("gpt-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(chunks, [])


class AnthropicAdapterTests(unittest.TestCase):
    def test_build_content_blocks_supports_text_images_and_fallback(self) -> None:
        adapter = AnthropicAdapter(api_key="key")

        self.assertEqual(
            adapter._build_content_blocks(
                [
                    {"type": "text", "text": " hello "},
                    {"type": "image", "mime_type": "image/png", "data": "abc"},
                    {"type": "text", "text": "   "},
                    "ignored",
                ]
            ),
            [
                {"type": "text", "text": "hello"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "abc",
                    },
                },
            ],
        )
        self.assertEqual(
            adapter._build_content_blocks([{"type": "text", "text": "   "}]),
            [{"type": "text", "text": ""}],
        )

    def test_generate_reply_returns_text_and_includes_system_prompt(self) -> None:
        adapter = AnthropicAdapter(api_key="key", base_url="https://anthropic.local")
        response = build_response(
            json_payload={
                "content": [
                    {"type": "text", "text": "First"},
                    {"type": "image", "text": "ignored"},
                    {"type": "text", "text": "Second"},
                ]
            }
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client = client_cls.return_value.__enter__.return_value
            client.post.return_value = response
            reply = adapter.generate_reply(
                "claude-test",
                [
                    {"role": "system", "content": "Be helpful"},
                    {"role": "user", "content": "Hi"},
                ],
            )

        self.assertEqual(reply, "First\nSecond")
        self.assertEqual(client.post.call_args.kwargs["json"]["system"], "Be helpful")

    def test_generate_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = AnthropicAdapter(api_key="key")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error("https://api.anthropic.com/v1/messages", "request failed")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("claude-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "request failed")

    def test_generate_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = AnthropicAdapter(api_key="key")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("claude-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "Could not reach the Anthropic provider.")

    def test_stream_reply_yields_text_blocks(self) -> None:
        adapter = AnthropicAdapter(api_key="key")
        response = build_response(
            lines=[
                'data: {"type":"content_block_start"}',
                "",
                'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
                "",
                'data: {"type":"content_block_delta","delta":{"text":""}}',
                "",
                'data: {"type":"content_block_delta","delta":{"text":" world"}}',
                "",
            ]
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client = client_cls.return_value.__enter__.return_value
            client.stream.return_value.__enter__.return_value = response
            chunks = list(
                adapter.stream_reply(
                    "claude-test",
                    [
                        {"role": "system", "content": "Be helpful"},
                        {"role": "user", "content": "Hi"},
                    ],
                )
            )

        self.assertEqual(chunks, ["Hello", " world"])
        self.assertEqual(client.stream.call_args.kwargs["json"]["system"], "Be helpful")

    def test_stream_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = AnthropicAdapter(api_key="key")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error("https://api.anthropic.com/v1/messages", "stream failed")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("claude-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "stream failed")

    def test_stream_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = AnthropicAdapter(api_key="key")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("claude-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "Could not reach the Anthropic provider.")


class GeminiAdapterTests(unittest.TestCase):
    def test_build_payload_and_extract_text_handle_system_multimodal_and_fallbacks(self) -> None:
        adapter = GeminiAdapter(api_key="key")

        payload = adapter._build_payload(
            [
                {"role": "system", "content": "Be concise"},
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": " Ready "},
                        {"type": "image", "mime_type": "image/png", "data": "abc"},
                        "ignored",
                    ],
                },
                {"role": "user", "content": [{"type": "text", "text": "   "}]},
                {"role": "assistant", "content": "Done"},
                {"role": "user", "content": 42},
            ]
        )

        self.assertEqual(payload["systemInstruction"], {"parts": [{"text": "Be concise"}]})
        self.assertEqual(payload["contents"][0]["role"], "model")
        self.assertEqual(payload["contents"][0]["parts"][0], {"text": "Ready"})
        self.assertEqual(
            payload["contents"][0]["parts"][1],
            {"inline_data": {"mime_type": "image/png", "data": "abc"}},
        )
        self.assertEqual(payload["contents"][1]["parts"], [{"text": ""}])
        self.assertEqual(payload["contents"][2]["parts"], [{"text": "Done"}])
        self.assertEqual(payload["contents"][3]["parts"], [{"text": "42"}])
        self.assertEqual(adapter._extract_gemini_text({"candidates": []}), "")

    def test_generate_reply_returns_text(self) -> None:
        adapter = GeminiAdapter(api_key="key", base_url="https://gemini.local")
        response = build_response(
            json_payload={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "First"},
                                {"inline_data": {"mime_type": "image/png"}},
                                {"text": "Second"},
                            ]
                        }
                    }
                ]
            }
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            reply = adapter.generate_reply("gemini-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(reply, "First\nSecond")

    def test_generate_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = GeminiAdapter(api_key="key")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
            "gemini failed",
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("gemini-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "gemini failed")

    def test_generate_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = GeminiAdapter(api_key="key")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("gemini-test", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "Could not reach the Gemini provider.")

    def test_stream_reply_yields_non_empty_text(self) -> None:
        adapter = GeminiAdapter(api_key="key")
        response = build_response(
            lines=[
                'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
                "",
                'data: {"candidates":[]}',
                "",
                'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}',
                "",
            ]
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            chunks = list(adapter.stream_reply("gemini-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(chunks, ["Hello", "world"])

    def test_stream_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = GeminiAdapter(api_key="key")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent",
            "stream failed",
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("gemini-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "stream failed")

    def test_stream_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = GeminiAdapter(api_key="key")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("gemini-test", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "Could not reach the Gemini provider.")


class OllamaAdapterTests(unittest.TestCase):
    def test_build_messages_merges_content_and_attaches_images(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")

        built = adapter._build_messages(
            [
                {"role": "user", "content": "Hello"},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": " world "},
                        {"type": "image", "data": "img-1"},
                        {"type": "image", "data": "img-2"},
                    ],
                },
                {"role": "assistant", "content": "Done"},
            ]
        )

        self.assertEqual(
            built,
            [
                {"role": "user", "content": "Hello\n\nworld", "images": ["img-1", "img-2"]},
                {"role": "assistant", "content": "Done"},
            ],
        )
        self.assertEqual(
            adapter._build_messages([{"role": "user", "content": [{"type": "text", "text": "Only text"}]}]),
            [{"role": "user", "content": "Only text"}],
        )

    def test_generate_reply_returns_message_content(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        response = build_response(json_payload={"message": {"content": "Hello"}})

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            reply = adapter.generate_reply("llama3", [{"role": "user", "content": "Hi"}])

        self.assertEqual(reply, "Hello")

    def test_generate_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error("http://localhost:11434/api/chat", "ollama failed")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("llama3", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "ollama failed")

    def test_generate_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                adapter.generate_reply("llama3", [{"role": "user", "content": "Hi"}])

        self.assertEqual(context.exception.detail, "Could not reach Ollama endpoint.")

    def test_stream_reply_yields_valid_content_and_skips_invalid_lines(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        response = build_response(
            lines=[
                "",
                '{"message":{"content":"Hello"}}',
                "not-json",
                '{"message":{"content":" world"}}',
                '{"message":{"content":""}}',
            ]
        )

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            chunks = list(adapter.stream_reply("llama3", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(chunks, ["Hello", " world"])

    def test_stream_reply_raises_http_exception_for_status_error(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        response = build_response()
        response.raise_for_status.side_effect = build_status_error("http://localhost:11434/api/chat", "stream failed")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = response
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("llama3", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "stream failed")

    def test_stream_reply_raises_http_exception_for_transport_error(self) -> None:
        adapter = OllamaAdapter(base_url="http://localhost:11434")

        with patch("app.services.providers.base.httpx.Client") as client_cls:
            client_cls.return_value.__enter__.return_value.stream.return_value.__enter__.side_effect = httpx.ConnectError("offline")
            with self.assertRaises(HTTPException) as context:
                list(adapter.stream_reply("llama3", [{"role": "user", "content": "Hi"}]))

        self.assertEqual(context.exception.detail, "Could not reach Ollama endpoint.")
