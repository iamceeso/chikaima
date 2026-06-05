from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.ai_model import AIModel
from app.models.provider import Provider
from app.repositories.providers import ProviderRepository
from app.schemas.provider import ProviderCreate, ProviderUpdate

DEFAULT_PROVIDER_MODELS: dict[str, list[tuple[str, str, dict]]] = {
    "openai": [("gpt-4.1", "GPT-4.1", {"chat": True, "vision": True, "audio": True})],
    "anthropic": [("claude-sonnet-4", "Claude Sonnet 4", {"chat": True, "vision": True})],
    "gemini": [("gemini-2.5-pro", "Gemini 2.5 Pro", {"chat": True, "vision": True, "audio": True})],
    "ollama": [("llama3.1", "Llama 3.1", {"chat": True, "local": True})],
    "openai_compatible": [("custom-chat-model", "Custom Chat Model", {"chat": True})],
    "local": [("local-foundation", "Local Foundation Model", {"chat": True, "local": True})],
}


class ProviderService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.providers = ProviderRepository(db)

    def list_for_user(self, user_id: str) -> list[Provider]:
        return self.providers.list_for_user(user_id)

    def create(self, user_id: str, payload: ProviderCreate) -> Provider:
        encrypted_config = payload.config.copy()
        if payload.api_key:
            encrypted_config["api_key"] = secret_manager.encrypt(payload.api_key)

        provider = Provider(
            user_id=user_id,
            name=payload.name,
            provider_type=payload.provider_type,
            base_url=str(payload.base_url) if payload.base_url else None,
            encrypted_config=encrypted_config,
        )
        self.db.add(provider)
        self.db.flush()

        for idx, (model_key, display_name, capabilities) in enumerate(
            DEFAULT_PROVIDER_MODELS.get(payload.provider_type, [])
        ):
            self.db.add(
                AIModel(
                    provider_id=provider.id,
                    model_key=model_key,
                    display_name=display_name,
                    capabilities=capabilities,
                    is_default=idx == 0,
                )
            )

        self.db.commit()
        self.db.refresh(provider)
        return provider

    def update(self, user_id: str, provider_id: str, payload: ProviderUpdate) -> Provider:
        provider = self.providers.get(provider_id)
        if not provider or provider.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

        if payload.name is not None:
            provider.name = payload.name
        if payload.base_url is not None:
            provider.base_url = str(payload.base_url)
        if payload.is_enabled is not None:
            provider.is_enabled = payload.is_enabled
        if payload.config is not None:
            provider.encrypted_config.update(payload.config)
        if payload.api_key:
            provider.encrypted_config["api_key"] = secret_manager.encrypt(payload.api_key)

        self.db.add(provider)
        self.db.commit()
        self.db.refresh(provider)
        return provider

    def delete(self, user_id: str, provider_id: str) -> None:
        provider = self.providers.get(provider_id)
        if not provider or provider.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
        self.providers.delete(provider)
