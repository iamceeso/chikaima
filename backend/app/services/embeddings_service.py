from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import secret_manager
from app.models.asset_chunk import AssetChunk
from app.models.provider import Provider
from app.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

OPENAI_COMPATIBLE_PROVIDER_TYPES = ("openai", "openrouter", "litellm", "local")
SUPPORTED_EMBEDDING_PROVIDER_TYPES = (*OPENAI_COMPATIBLE_PROVIDER_TYPES, "gemini", "ollama")
EMBEDDING_PROVIDER_PRIORITY = {
    "openai": 0,
    "openrouter": 1,
    "gemini": 2,
    "ollama": 3,
    "litellm": 4,
}
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "litellm": "http://localhost:4000/v1",
    "local": "http://localhost:4000/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "ollama": "http://localhost:11434",
}
DEFAULT_EMBEDDING_MODELS = {
    "openai": "text-embedding-3-small",
    "openrouter": "openai/text-embedding-3-small",
    "litellm": "text-embedding-3-small",
    "local": "text-embedding-3-small",
    "gemini": "text-embedding-004",
    "ollama": "nomic-embed-text",
}


class EmbeddingProviderError(RuntimeError):
    pass


class NoEmbeddingProviderError(EmbeddingProviderError):
    pass


class EmbeddingsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def generate_embedding(self, user_id: str, text: str) -> list[float]:
        providers = self._list_embedding_providers(user_id)
        if not providers:
            raise NoEmbeddingProviderError(
                "No supported embedding provider is enabled. Add an OpenAI, Gemini, Ollama, OpenRouter, LiteLLM, or local OpenAI-compatible provider to enable retrieval."
            )
        return self._generate_embedding_with_providers(providers, text)

    def replace_chunks_for_source(
        self,
        *,
        user_id: str,
        source_type: str,
        source_id: str,
        asset_type: str,
        filename: str,
        chunks: list[tuple[str, dict]],
    ) -> list[AssetChunk]:
        (
            self.db.query(AssetChunk)
            .filter(
                AssetChunk.user_id == user_id,
                AssetChunk.source_type == source_type,
                AssetChunk.source_id == source_id,
            )
            .delete(synchronize_session=False)
        )

        providers = self._list_embedding_providers(user_id)
        if not providers:
            logger.warning("Skipping vector indexing for %s/%s because no embedding provider is configured.", source_type, source_id)
            self.db.flush()
            return []

        prepared_chunks: list[tuple[int, str, dict[str, Any], list[float]]] = []
        try:
            for chunk_index, (content, metadata) in enumerate(chunks):
                normalized = content.strip()
                if not normalized:
                    continue
                payload = dict(metadata or {})
                payload.setdefault("chunk_index", chunk_index)
                payload.setdefault("source_type", source_type)
                payload.setdefault("source_id", source_id)
                payload.setdefault("asset_type", asset_type)
                payload.setdefault("filename", filename)
                embedding = self._generate_embedding_with_providers(providers, normalized)
                prepared_chunks.append((chunk_index, normalized, payload, embedding))
        except EmbeddingProviderError as exc:
            logger.warning("Skipping vector indexing for %s/%s after embedding provider failure: %s", source_type, source_id, exc)
            self.db.flush()
            return []

        stored_chunks: list[AssetChunk] = []
        for chunk_index, normalized, payload, embedding in prepared_chunks:
            stored = AssetChunk(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                asset_type=asset_type,
                filename=filename,
                chunk_index=chunk_index,
                content=normalized,
                embedding=embedding,
                meta=payload,
            )
            self.db.add(stored)
            stored_chunks.append(stored)

        self.db.flush()
        return stored_chunks

    def delete_chunks_for_source(self, *, user_id: str, source_type: str, source_id: str) -> int:
        count = (
            self.db.query(AssetChunk)
            .filter(
                AssetChunk.user_id == user_id,
                AssetChunk.source_type == source_type,
                AssetChunk.source_id == source_id,
            )
            .delete(synchronize_session=False)
        )
        self.db.flush()
        return count

    def _list_embedding_providers(self, user_id: str) -> list[Provider]:
        workspace = WorkspaceService(self.db).get_or_create()
        query = self.db.query(Provider).filter(
            Provider.is_enabled.is_(True),
            Provider.provider_type.in_(SUPPORTED_EMBEDDING_PROVIDER_TYPES),
        )
        if workspace.authentication_enabled:
            query = query.filter(Provider.user_id == user_id)
        providers = list(query.order_by(Provider.created_at.asc()).all())
        providers.sort(key=lambda provider: EMBEDDING_PROVIDER_PRIORITY.get(provider.provider_type, 100))
        return providers

    def _generate_embedding_with_providers(self, providers: list[Provider], text: str) -> list[float]:
        errors: list[str] = []
        for provider in providers:
            try:
                vector = self._embed_with_provider(provider, text or " ")
                return self._coerce_embedding_dimension(vector)
            except EmbeddingProviderError as exc:
                errors.append(f"{provider.name}: {exc}")

        raise EmbeddingProviderError(errors[-1] if errors else "Embedding generation failed.")

    def _embed_with_provider(self, provider: Provider, text: str) -> list[float]:
        if provider.provider_type in OPENAI_COMPATIBLE_PROVIDER_TYPES:
            return self._embed_with_openai_compatible(provider, text)
        if provider.provider_type == "gemini":
            return self._embed_with_gemini(provider, text)
        if provider.provider_type == "ollama":
            return self._embed_with_ollama(provider, text)
        raise EmbeddingProviderError(f"{provider.provider_type} does not support embeddings.")

    def _embed_with_openai_compatible(self, provider: Provider, text: str) -> list[float]:
        encrypted_api_key = provider.encrypted_config.get("api_key")
        if provider.provider_type not in {"litellm", "local"} and not encrypted_api_key:
            raise EmbeddingProviderError(f"{provider.name} is missing an API key.")

        api_key = secret_manager.decrypt(encrypted_api_key) if encrypted_api_key else ""
        base_url = (provider.base_url or DEFAULT_BASE_URLS[provider.provider_type]).rstrip("/")
        payload = {
            "model": self._embedding_model_for_provider(provider),
            "input": text or " ",
        }
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(f"{base_url}/embeddings", headers=headers, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Embedding request failed."
            raise EmbeddingProviderError(detail) from exc
        except httpx.HTTPError as exc:
            raise EmbeddingProviderError("Could not reach the embedding provider.") from exc

        data = response.json().get("data") or []
        if not data:
            raise EmbeddingProviderError("The embedding provider returned no vectors.")
        return self._parse_embedding_values(data[0].get("embedding"))

    def _embed_with_gemini(self, provider: Provider, text: str) -> list[float]:
        encrypted_api_key = provider.encrypted_config.get("api_key")
        if not encrypted_api_key:
            raise EmbeddingProviderError(f"{provider.name} is missing an API key.")

        api_key = secret_manager.decrypt(encrypted_api_key)
        base_url = (provider.base_url or DEFAULT_BASE_URLS["gemini"]).rstrip("/")
        model = self._embedding_model_for_provider(provider)
        model_path = model if model.startswith("models/") else f"models/{model}"

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{base_url}/{model_path}:embedContent",
                    params={"key": api_key},
                    json={"content": {"parts": [{"text": text or " "}]}},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Embedding request failed."
            raise EmbeddingProviderError(detail) from exc
        except httpx.HTTPError as exc:
            raise EmbeddingProviderError("Could not reach the embedding provider.") from exc

        embedding = response.json().get("embedding") or {}
        return self._parse_embedding_values(embedding.get("values"))

    def _embed_with_ollama(self, provider: Provider, text: str) -> list[float]:
        base_url = (provider.base_url or DEFAULT_BASE_URLS["ollama"]).rstrip("/")

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{base_url}/api/embed",
                    json={"model": self._embedding_model_for_provider(provider), "input": text or " "},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or "Embedding request failed."
            raise EmbeddingProviderError(detail) from exc
        except httpx.HTTPError as exc:
            raise EmbeddingProviderError("Could not reach the embedding provider.") from exc

        payload = response.json()
        if isinstance(payload.get("embedding"), list):
            return self._parse_embedding_values(payload["embedding"])
        embeddings = payload.get("embeddings") or []
        if embeddings:
            return self._parse_embedding_values(embeddings[0])
        raise EmbeddingProviderError("The embedding provider returned no vectors.")

    def _embedding_model_for_provider(self, provider: Provider) -> str:
        configured = provider.encrypted_config.get("embedding_model")
        if isinstance(configured, str) and configured.strip():
            return configured.strip()
        return DEFAULT_EMBEDDING_MODELS[provider.provider_type]

    def _parse_embedding_values(self, values: Any) -> list[float]:
        if not isinstance(values, list):
            raise EmbeddingProviderError("The embedding provider returned an invalid vector payload.")
        vector = [float(value) for value in values if isinstance(value, (int, float))]
        if not vector:
            raise EmbeddingProviderError("The embedding provider returned an empty vector.")
        return vector

    def _coerce_embedding_dimension(self, vector: list[float]) -> list[float]:
        target_dimension = settings.embedding_dimension
        if len(vector) == target_dimension:
            return vector
        if len(vector) > target_dimension:
            return vector[:target_dimension]
        # Keep pgvector writes stable while providers return different native dimensions.
        return [*vector, *([0.0] * (target_dimension - len(vector)))]
