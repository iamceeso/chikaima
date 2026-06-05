from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.ai_model import AIModel
from app.models.provider import Provider


class LLMService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_model_and_provider(self, user_id: str, model_id: str | None) -> tuple[AIModel, Provider]:
        query = (
            self.db.query(AIModel, Provider)
            .join(Provider, Provider.id == AIModel.provider_id)
            .filter(
                Provider.user_id == user_id,
                Provider.is_enabled.is_(True),
                AIModel.is_available.is_(True),
            )
        )

        if model_id:
            selection = query.filter(AIModel.id == model_id).first()
        else:
            selection = query.order_by(AIModel.is_default.desc(), AIModel.created_at.asc()).first()

        if not selection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No enabled AI model is available. Add an OpenAI provider and model first.",
            )

        model, provider = selection
        return model, provider

    def generate_reply(self, provider: Provider, model: AIModel, messages: list[dict[str, str]]) -> str:
        if provider.provider_type not in {"openai", "openai_compatible"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{provider.provider_type} chat execution is not wired yet. Use an OpenAI provider first.",
            )

        encrypted_api_key = provider.encrypted_config.get("api_key")
        if not encrypted_api_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{provider.name} is missing an API key.",
            )

        api_key = secret_manager.decrypt(encrypted_api_key)
        base_url = provider.base_url.rstrip("/") if provider.base_url else "https://api.openai.com/v1"

        payload: dict[str, Any] = {
            "model": model.model_key,
            "messages": messages,
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
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

        content = self._extract_content(response.json())
        if not content:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI provider returned an empty response.",
            )
        return content

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
