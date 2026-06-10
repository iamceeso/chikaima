from __future__ import annotations

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.provider import Provider
from app.services.providers.base import (
    AnthropicAdapter,
    GeminiAdapter,
    OllamaAdapter,
    OpenAIAdapter,
    ProviderAdapter,
)


class AdapterFactory:
    @staticmethod
    def create(provider: Provider, api_key: str) -> ProviderAdapter:
        provider_type = provider.provider_type.lower()

        if provider_type == "openai":
            return OpenAIAdapter(api_key=api_key)
        elif provider_type == "openai_compatible":
            return OpenAIAdapter(api_key=api_key, base_url=provider.base_url)
        elif provider_type == "openrouter":
            return OpenAIAdapter(api_key=api_key, base_url=provider.base_url or "https://openrouter.ai/api/v1")
        elif provider_type == "litellm":
            return OpenAIAdapter(api_key=api_key, base_url=provider.base_url or "http://localhost:4000/v1")
        elif provider_type == "anthropic":
            return AnthropicAdapter(api_key=api_key, base_url=provider.base_url)
        elif provider_type == "gemini":
            return GeminiAdapter(api_key=api_key, base_url=provider.base_url)
        elif provider_type == "ollama":
            base_url = provider.base_url or settings.ollama_base_url
            return OllamaAdapter(base_url=base_url)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported provider type: {provider_type}",
            )
