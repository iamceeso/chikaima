from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProviderAdapter(ABC):
    @abstractmethod
    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        pass


class OpenAIAdapter(ProviderAdapter):
    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        import httpx

        from fastapi import HTTPException, status

        payload: dict[str, Any] = {
            "model": model_key,
            "messages": messages,
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
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        import anthropic

        from fastapi import HTTPException, status

        try:
            client = anthropic.Anthropic(api_key=self.api_key)
            response = client.messages.create(
                model=model_key,
                max_tokens=1024,
                messages=messages,
            )
            return response.content[0].text
        except anthropic.AuthenticationError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Anthropic API authentication failed.",
            ) from exc
        except anthropic.APIError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Anthropic API error: {str(exc)}",
            ) from exc


class GeminiAdapter(ProviderAdapter):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        import google.generativeai as genai

        from fastapi import HTTPException, status

        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(model_key)

            history = []
            for msg in messages[:-1]:
                history.append({"role": msg["role"], "parts": [{"text": msg["content"]}]})

            user_message = messages[-1] if messages else {"role": "user", "content": ""}

            chat = model.start_chat(history=history)
            response = chat.send_message(user_message["content"])

            return response.text
        except google.api_core.exceptions.GoogleAPIError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini API error: {str(exc)}",
            ) from exc


class OllamaAdapter(ProviderAdapter):
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def generate_reply(self, model_key: str, messages: list[dict[str, str]]) -> str:
        import httpx

        from fastapi import HTTPException, status

        payload: dict[str, Any] = {
            "model": model_key,
            "messages": messages,
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
