from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Iterator

import httpx
from fastapi import HTTPException, status


def _normalize_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {"role": str(message["role"]), "content": str(message["content"])}
        for message in messages
        if message.get("content")
    ]


def _extract_system_prompt(messages: list[dict[str, str]]) -> tuple[str | None, list[dict[str, str]]]:
    system_parts: list[str] = []
    conversation_messages: list[dict[str, str]] = []

    for message in _normalize_messages(messages):
        if message["role"] == "system":
            system_parts.append(message["content"])
        else:
            conversation_messages.append(message)

    system_prompt = "\n\n".join(part for part in system_parts if part).strip() or None
    return system_prompt, conversation_messages


def _merge_consecutive_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    for message in _normalize_messages(messages):
        if merged and merged[-1]["role"] == message["role"]:
            merged[-1]["content"] = f"{merged[-1]['content']}\n\n{message['content']}".strip()
        else:
            merged.append(message.copy())
    return merged


def _iter_sse_json_events(lines: Iterator[str]) -> Iterator[dict[str, Any]]:
    data_lines: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if not data_lines:
                continue
            payload = "\n".join(data_lines)
            data_lines = []
            if payload == "[DONE]":
                return
            try:
                yield httpx.Response(200, content=payload).json()
            except ValueError:
                continue
            continue

        if line.startswith("data:"):
            data_lines.append(line[5:].strip())

    if data_lines:
        payload = "\n".join(data_lines)
        if payload != "[DONE]":
            try:
                yield httpx.Response(200, content=payload).json()
            except ValueError:
                return


class ProviderAdapter(ABC):
    @abstractmethod
    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        raise NotImplementedError

    @abstractmethod
    def stream_reply(self, model_key: str, messages: list[dict[str, str]]) -> Iterator[str]:
        raise NotImplementedError


class OpenAIAdapter(ProviderAdapter):
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        payload: dict[str, Any] = {
            "model": model_key,
            "messages": _normalize_messages(messages),
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "OpenAI request failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the AI provider.",
            ) from exc

        return self._extract_content(response.json())

    def stream_reply(self, model_key: str, messages: list[dict[str, str]]) -> Iterator[str]:
        payload: dict[str, Any] = {
            "model": model_key,
            "messages": _normalize_messages(messages),
            "stream": True,
        }

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for event in _iter_sse_json_events(response.iter_lines()):
                        choices = event.get("choices") or []
                        delta = choices[0].get("delta", {}) if choices else {}
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            yield content
                        elif isinstance(content, list):
                            for part in content:
                                if isinstance(part, dict) and part.get("type") == "text_delta" and part.get("text"):
                                    yield str(part["text"])
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "OpenAI streaming request failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the AI provider.",
            ) from exc

    def _extract_content(self, payload: dict[str, Any]) -> str:
        choice = (payload.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content")

        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            text_parts = [
                part.get("text", "").strip()
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            return "\n".join(part for part in text_parts if part).strip()

        return ""


class AnthropicAdapter(ProviderAdapter):
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        system_prompt, conversation_messages = _extract_system_prompt(_merge_consecutive_messages(messages))
        payload: dict[str, Any] = {
            "model": model_key,
            "max_tokens": 1024,
            "messages": [
                {"role": message["role"], "content": [{"type": "text", "text": message["content"]}]}
                for message in conversation_messages
            ],
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{self.base_url}/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Anthropic request failed."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the Anthropic provider.",
            ) from exc

        content = response.json().get("content") or []
        text_parts = [
            block.get("text", "").strip()
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(part for part in text_parts if part).strip()

    def stream_reply(self, model_key: str, messages: list[dict[str, str]]) -> Iterator[str]:
        system_prompt, conversation_messages = _extract_system_prompt(_merge_consecutive_messages(messages))
        payload: dict[str, Any] = {
            "model": model_key,
            "max_tokens": 1024,
            "messages": [
                {"role": message["role"], "content": [{"type": "text", "text": message["content"]}]}
                for message in conversation_messages
            ],
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for event in _iter_sse_json_events(response.iter_lines()):
                        if event.get("type") != "content_block_delta":
                            continue
                        delta = event.get("delta") or {}
                        text = delta.get("text")
                        if isinstance(text, str) and text:
                            yield text
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Anthropic streaming request failed."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the Anthropic provider.",
            ) from exc


class GeminiAdapter(ProviderAdapter):
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        payload = self._build_payload(messages)

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{self.base_url}/models/{model_key}:generateContent",
                    params={"key": self.api_key},
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Gemini request failed."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the Gemini provider.",
            ) from exc

        return self._extract_gemini_text(response.json())

    def stream_reply(self, model_key: str, messages: list[dict[str, str]]) -> Iterator[str]:
        payload = self._build_payload(messages)

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/models/{model_key}:streamGenerateContent",
                    params={"alt": "sse", "key": self.api_key},
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for event in _iter_sse_json_events(response.iter_lines()):
                        text = self._extract_gemini_text(event)
                        if text:
                            yield text
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Gemini streaming request failed."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the Gemini provider.",
            ) from exc

    def _build_payload(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        system_prompt, conversation_messages = _extract_system_prompt(_merge_consecutive_messages(messages))
        contents: list[dict[str, Any]] = []
        for message in conversation_messages:
            role = "model" if message["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})

        payload: dict[str, Any] = {"contents": contents}
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        return payload

    def _extract_gemini_text(self, payload: dict[str, Any]) -> str:
        candidates = payload.get("candidates") or []
        if not candidates:
            return ""
        content = candidates[0].get("content") or {}
        parts = content.get("parts") or []
        text_parts = [
            part.get("text", "").strip()
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ]
        return "\n".join(part for part in text_parts if part).strip()


class OllamaAdapter(ProviderAdapter):
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        payload: dict[str, Any] = {
            "model": model_key,
            "messages": _merge_consecutive_messages(messages),
            "stream": False,
        }

        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Ollama request failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach Ollama endpoint.",
            ) from exc

        return response.json().get("message", {}).get("content", "")

    def stream_reply(self, model_key: str, messages: list[dict[str, str]]) -> Iterator[str]:
        payload: dict[str, Any] = {
            "model": model_key,
            "messages": _merge_consecutive_messages(messages),
            "stream": True,
        }

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line:
                            continue
                        try:
                            event = httpx.Response(200, content=line).json()
                        except ValueError:
                            continue
                        content = event.get("message", {}).get("content")
                        if isinstance(content, str) and content:
                            yield content
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Ollama streaming request failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach Ollama endpoint.",
            ) from exc
