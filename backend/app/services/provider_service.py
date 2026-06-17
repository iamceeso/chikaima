from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.ai_model import AIModel
from app.models.conversation import Conversation
from app.models.provider import Provider
from app.repositories.providers import ProviderRepository
from app.schemas.provider import AIModelResponse, ProviderCreate, ProviderUpdate

CURATED_PROVIDER_MODELS: dict[str, list[dict[str, Any]]] = {
    "openai": [
        {
            "key": "gpt-5.2",
            "name": "GPT-5.2",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "gpt-5",
            "name": "GPT-5",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "gpt-5-mini",
            "name": "GPT-5 mini",
            "capabilities": {"chat": True, "vision": True},
        },
        {"key": "gpt-5-nano", "name": "GPT-5 nano", "capabilities": {"chat": True}},
        {
            "key": "gpt-4.1",
            "name": "GPT-4.1",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "gpt-4.1-mini",
            "name": "GPT-4.1 mini",
            "capabilities": {"chat": True, "vision": True},
        },
        {"key": "gpt-4.1-nano", "name": "GPT-4.1 nano", "capabilities": {"chat": True}},
        {
            "key": "gpt-4o",
            "name": "GPT-4o",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
        {
            "key": "gpt-4o-mini",
            "name": "GPT-4o mini",
            "capabilities": {"chat": True, "vision": True},
        },
        {"key": "o4-mini", "name": "o4-mini", "capabilities": {"chat": True}},
        {"key": "o3", "name": "o3", "capabilities": {"chat": True}},
        {"key": "o3-mini", "name": "o3-mini", "capabilities": {"chat": True}},
    ],
    "anthropic": [
        {
            "key": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-sonnet-4-20250514",
            "name": "Claude Sonnet 4",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-opus-4-1-20250805",
            "name": "Claude Opus 4.1",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-opus-4-20250514",
            "name": "Claude Opus 4",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-3-7-sonnet-20250219",
            "name": "Claude Sonnet 3.7",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-3-5-haiku-20241022",
            "name": "Claude Haiku 3.5",
            "capabilities": {"chat": True, "vision": True},
        },
    ],
    "gemini": [
        {
            "key": "gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
        {
            "key": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
        {
            "key": "gemini-2.5-flash-lite",
            "name": "Gemini 2.5 Flash-Lite",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
        {
            "key": "gemini-3-pro-preview",
            "name": "Gemini 3 Pro Preview",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
        {
            "key": "gemini-3-flash-preview",
            "name": "Gemini 3 Flash Preview",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
    ],
    "ollama": [
        {
            "key": "llama3.1",
            "name": "Llama 3.1",
            "capabilities": {"chat": True, "local": True},
        },
        {
            "key": "gemma3",
            "name": "Gemma 3",
            "capabilities": {"chat": True, "local": True},
        },
        {
            "key": "qwen3",
            "name": "Qwen 3",
            "capabilities": {"chat": True, "local": True},
        },
    ],
    "openrouter": [
        {
            "key": "~openai/gpt-latest",
            "name": "OpenAI latest alias",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "~anthropic/claude-sonnet-latest",
            "name": "Claude Sonnet latest alias",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "openai/gpt-4o-mini",
            "name": "GPT-4o mini via OpenRouter",
            "capabilities": {"chat": True, "vision": True},
        },
    ],
    "litellm": [
        {
            "key": "gpt-4o-mini",
            "name": "GPT-4o mini via LiteLLM",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "claude-3-5-haiku-20241022",
            "name": "Claude Haiku via LiteLLM",
            "capabilities": {"chat": True, "vision": True},
        },
        {
            "key": "gemini-2.5-flash",
            "name": "Gemini Flash via LiteLLM",
            "capabilities": {"chat": True, "vision": True, "audio": True},
        },
    ],
    "local": [
        {
            "key": "qwen3",
            "name": "Qwen 3",
            "capabilities": {"chat": True, "local": True},
        },
        {
            "key": "llama3.1",
            "name": "Llama 3.1",
            "capabilities": {"chat": True, "local": True},
        },
        {
            "key": "gemma3",
            "name": "Gemma 3",
            "capabilities": {"chat": True, "local": True},
        },
    ],
}

DEFAULT_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "ollama": "http://localhost:11434",
    "openrouter": "https://openrouter.ai/api/v1",
    "litellm": "http://localhost:4000/v1",
    "local": "http://localhost:4000/v1",
}

OPENAI_EXCLUDED_MODEL_TOKENS = (
    "audio",
    "transcribe",
    "tts",
    "realtime",
    "image",
    "embedding",
    "moderation",
    "search-preview",
    "deep-research",
    "codex",
    "whisper",
)

MODEL_PRIORITY: dict[str, dict[str, int]] = {
    "openai": {
        "gpt-5.2": 0,
        "gpt-5": 1,
        "gpt-5-mini": 2,
        "gpt-5-nano": 3,
        "gpt-4.1": 4,
        "gpt-4o": 5,
        "gpt-4.1-mini": 6,
        "gpt-4o-mini": 7,
        "gpt-4.1-nano": 8,
        "o3": 9,
        "o4-mini": 10,
        "o3-mini": 11,
    },
    "anthropic": {
        "claude-sonnet-4-5-20250929": 0,
        "claude-sonnet-4-20250514": 1,
        "claude-opus-4-1-20250805": 2,
        "claude-opus-4-20250514": 3,
        "claude-3-7-sonnet-20250219": 4,
        "claude-3-5-haiku-20241022": 5,
    },
    "gemini": {
        "gemini-2.5-pro": 0,
        "gemini-2.5-flash": 1,
        "gemini-2.5-flash-lite": 2,
        "gemini-3-pro-preview": 3,
        "gemini-3-flash-preview": 4,
    },
    "local": {
        "qwen3": 0,
        "llama3.1": 1,
        "gemma3": 2,
    },
}

DEPRECATED_MODEL_KEYS: dict[str, set[str]] = {
    "openai": {
        "gpt-3.5-turbo",
        "gpt-4",
        "gpt-4-turbo",
        "gpt-4-turbo-preview",
        "gpt-4.5-preview",
        "o1-preview",
        "o1-mini",
        "codex-mini-latest",
    },
    "anthropic": {
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20240620",
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
    },
}


def _dedupe_models(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for model in models:
        key = str(model["key"]).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(
            {
                "key": key,
                "name": str(model.get("name") or key),
                "capabilities": dict(model.get("capabilities") or {"chat": True}),
            }
        )
    return deduped


def _titleize_model_name(model_key: str) -> str:
    return model_key.replace("-", " ").replace("_", " ").replace(".", ". ").replace("  ", " ").title().replace(". ", ".")


def _openai_capabilities(model_id: str) -> dict[str, bool]:
    lowered = model_id.lower()
    capabilities = {"chat": True}
    if lowered.startswith(("gpt-", "chatgpt-")) or lowered in {
        "o3",
        "o3-mini",
        "o4-mini",
        "o1",
        "o1-pro",
    }:
        capabilities["vision"] = any(token in lowered for token in ("gpt-4", "gpt-5", "gpt-4o"))
    if any(
        token in lowered
        for token in (
            "vision",
            "vl",
            "multimodal",
            "gemini",
            "claude",
            "gpt-4o",
            "gpt-4.1",
            "gpt-5",
        )
    ):
        capabilities["vision"] = True
    if any(token in lowered for token in ("audio", "speech", "realtime")):
        capabilities["audio"] = True
    return capabilities


def _gemini_capabilities(model_name: str) -> dict[str, bool]:
    lowered = model_name.lower()
    capabilities = {"chat": True, "vision": True}
    if "gemini" in lowered:
        capabilities["audio"] = True
    return capabilities


def _resolve_base_url(provider_type: str, base_url: str | None) -> str | None:
    return base_url or DEFAULT_BASE_URLS.get(provider_type)


def _join_api_url(base_url: str, path: str) -> str:
    normalized_base = base_url.rstrip("/")
    normalized_path = path.lstrip("/")
    if normalized_base.endswith(f"/{normalized_path}"):
        return normalized_base
    return urljoin(normalized_base + "/", normalized_path)


def _should_include_openai_model(model_id: str) -> bool:
    lowered = model_id.lower()
    if any(token in lowered for token in OPENAI_EXCLUDED_MODEL_TOKENS):
        return False
    return lowered.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-", "gpt-oss-"))


def _should_include_openrouter_model(model_id: str) -> bool:
    lowered = model_id.lower()
    excluded_tokens = (
        "embedding",
        "moderation",
        "image",
        "transcribe",
        "tts",
        "rerank",
    )
    if any(token in lowered for token in excluded_tokens):
        return False
    return True


def _sort_models(provider_type: str, models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority_map = MODEL_PRIORITY.get(provider_type, {})
    return sorted(
        models,
        key=lambda item: (
            priority_map.get(item["key"], 10_000),
            str(item["name"]).lower(),
        ),
    )


def is_deprecated_model(provider_type: str | None, model_key: str) -> bool:
    if not provider_type:
        return False
    return model_key in DEPRECATED_MODEL_KEYS.get(provider_type, set())


def build_model_response(model: AIModel, provider: Provider) -> AIModelResponse:
    return AIModelResponse(
        **model.__dict__,
        provider_name=provider.name,
        provider_type=provider.provider_type,
        is_deprecated=is_deprecated_model(provider.provider_type, model.model_key),
    )


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

        synced_models = self._load_provider_models(provider, api_key=payload.api_key)
        self._replace_provider_models(provider, synced_models)

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
        self.db.flush()

        if payload.api_key is not None or payload.base_url is not None or payload.config is not None:
            synced_models = self._load_provider_models(provider, api_key=payload.api_key)
            self._replace_provider_models(provider, synced_models)

        self.db.commit()
        self.db.refresh(provider)
        return provider

    def resync_models(self, user_id: str, provider_id: str) -> Provider:
        provider = self.providers.get(provider_id)
        if not provider or provider.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

        synced_models = self._load_provider_models(provider)
        self._replace_provider_models(provider, synced_models)

        self.db.commit()
        self.db.refresh(provider)
        return provider

    def delete(self, user_id: str, provider_id: str) -> None:
        provider = self.providers.get(provider_id)
        if not provider or provider.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
        self.providers.delete(provider)

    def _replace_provider_models(self, provider: Provider, models: list[dict[str, Any]]) -> None:
        synced_models = _sort_models(
            provider.provider_type,
            _dedupe_models(models) or CURATED_PROVIDER_MODELS.get(provider.provider_type, []),
        )
        existing_models = list(self.db.query(AIModel).filter(AIModel.provider_id == provider.id).all())
        existing_by_key = {model.model_key: model for model in existing_models}
        existing_default = next((model for model in existing_models if model.is_default), None)
        has_global_default_elsewhere = (
            self.db.query(AIModel)
            .filter(AIModel.is_default.is_(True), AIModel.provider_id != provider.id)
            .first()
            is not None
        )

        for idx, model in enumerate(synced_models):
            existing = existing_by_key.get(model["key"])
            if existing is not None:
                existing.display_name = model["name"]
                existing.capabilities = model["capabilities"]
                self.db.add(existing)
                continue

            should_be_default = idx == 0 and existing_default is None and not has_global_default_elsewhere
            new_model = AIModel(
                provider_id=provider.id,
                model_key=model["key"],
                display_name=model["name"],
                capabilities=model["capabilities"],
                is_default=should_be_default,
                is_available=True,
            )
            self.db.add(new_model)
            existing_by_key[model["key"]] = new_model
            if should_be_default:
                existing_default = new_model

        synced_keys = {model["key"] for model in synced_models}
        for existing in existing_models:
            if existing.model_key in synced_keys:
                continue

            is_referenced = (
                self.db.query(Conversation.id).filter(Conversation.model_id == existing.id).first() is not None
            )
            if is_referenced or existing.is_default:
                existing.is_available = False
                self.db.add(existing)
                continue

            self.db.delete(existing)

    def _load_provider_models(self, provider: Provider, api_key: str | None = None) -> list[dict[str, Any]]:
        resolved_api_key = api_key
        if not resolved_api_key:
            encrypted_api_key = provider.encrypted_config.get("api_key")
            if isinstance(encrypted_api_key, str):
                resolved_api_key = secret_manager.decrypt(encrypted_api_key)
                provider.encrypted_config["api_key"] = secret_manager.encrypt(resolved_api_key)
                self.db.add(provider)

        if provider.provider_type == "openai":
            return self._fetch_openai_models(provider, resolved_api_key)
        if provider.provider_type == "anthropic":
            return self._fetch_anthropic_models(provider, resolved_api_key)
        if provider.provider_type == "gemini":
            return self._fetch_gemini_models(provider, resolved_api_key)
        if provider.provider_type == "ollama":
            return self._fetch_ollama_models(provider)
        if provider.provider_type in {"openrouter", "litellm", "local"}:
            return self._fetch_openai_models(provider, resolved_api_key)
        return CURATED_PROVIDER_MODELS.get(provider.provider_type, [])

    def _fetch_openai_models(self, provider: Provider, api_key: str | None) -> list[dict[str, Any]]:
        fallback_key = provider.provider_type if provider.provider_type in CURATED_PROVIDER_MODELS else "openai"
        if not api_key and provider.provider_type != "local":
            return CURATED_PROVIDER_MODELS["openai" if provider.provider_type == "openai" else fallback_key]

        base_url = _resolve_base_url(provider.provider_type, provider.base_url)
        if not base_url:
            return CURATED_PROVIDER_MODELS["openai" if provider.provider_type == "openai" else fallback_key]

        try:
            with httpx.Client(timeout=12.0) as client:
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                response = client.get(
                    _join_api_url(base_url, "models"),
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPError:
            return CURATED_PROVIDER_MODELS["openai" if provider.provider_type == "openai" else fallback_key]

        data = response.json().get("data", [])
        models = [
            {
                "key": item["id"],
                "name": item["id"],
                "capabilities": _openai_capabilities(item["id"]),
            }
            for item in data
            if isinstance(item, dict)
            and isinstance(item.get("id"), str)
            and (
                _should_include_openrouter_model(item["id"])
                if provider.provider_type in {"openrouter", "local"}
                else _should_include_openai_model(item["id"])
            )
        ]
        return sorted(models, key=lambda item: item["name"].lower())

    def _fetch_anthropic_models(self, provider: Provider, api_key: str | None) -> list[dict[str, Any]]:
        if not api_key:
            return CURATED_PROVIDER_MODELS["anthropic"]

        base_url = _resolve_base_url(provider.provider_type, provider.base_url)
        if not base_url:
            return CURATED_PROVIDER_MODELS["anthropic"]

        try:
            with httpx.Client(timeout=12.0) as client:
                response = client.get(
                    _join_api_url(base_url, "v1/models"),
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError:
            return CURATED_PROVIDER_MODELS["anthropic"]

        data = response.json().get("data", [])
        models = [
            {
                "key": item["id"],
                "name": item.get("display_name") or _titleize_model_name(item["id"]),
                "capabilities": {"chat": True, "vision": True},
            }
            for item in data
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        ]
        return models or CURATED_PROVIDER_MODELS["anthropic"]

    def _fetch_gemini_models(self, provider: Provider, api_key: str | None) -> list[dict[str, Any]]:
        if not api_key:
            return CURATED_PROVIDER_MODELS["gemini"]

        base_url = _resolve_base_url(provider.provider_type, provider.base_url)
        if not base_url:
            return CURATED_PROVIDER_MODELS["gemini"]

        try:
            with httpx.Client(timeout=12.0) as client:
                response = client.get(
                    _join_api_url(base_url, "models"),
                    params={"key": api_key},
                )
                response.raise_for_status()
        except httpx.HTTPError:
            return CURATED_PROVIDER_MODELS["gemini"]

        data = response.json().get("models", [])
        models = []
        for item in data:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            methods = item.get("supportedGenerationMethods") or []
            if not isinstance(name, str) or not isinstance(methods, list):
                continue
            if "generateContent" not in methods:
                continue

            model_key = name.removeprefix("models/")
            if "embedding" in model_key.lower():
                continue
            models.append(
                {
                    "key": model_key,
                    "name": item.get("displayName") or _titleize_model_name(model_key),
                    "capabilities": _gemini_capabilities(model_key),
                }
            )

        return models or CURATED_PROVIDER_MODELS["gemini"]

    def _fetch_ollama_models(self, provider: Provider) -> list[dict[str, Any]]:
        base_url = _resolve_base_url(provider.provider_type, provider.base_url)
        if not base_url:
            return CURATED_PROVIDER_MODELS["ollama"]

        try:
            with httpx.Client(timeout=8.0) as client:
                response = client.get(_join_api_url(base_url, "api/tags"))
                response.raise_for_status()
        except httpx.HTTPError:
            return CURATED_PROVIDER_MODELS["ollama"]

        data = response.json().get("models", [])
        models = [
            {
                "key": item["model"],
                "name": item.get("name") or item["model"],
                "capabilities": {"chat": True, "local": True},
            }
            for item in data
            if isinstance(item, dict) and isinstance(item.get("model"), str)
        ]
        return models or CURATED_PROVIDER_MODELS["ollama"]
