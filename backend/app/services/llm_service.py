from __future__ import annotations

from collections.abc import Iterator

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.ai_model import AIModel
from app.models.provider import Provider
from app.services.embeddings_service import EmbeddingsService
from app.services.providers.factory import AdapterFactory


class LLMService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.embeddings = EmbeddingsService(db)

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
        adapter = self._build_adapter(provider)
        content = adapter.generate_reply(model.model_key, messages)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI provider returned an empty response.",
            )
        return content

    def stream_reply(self, provider: Provider, model: AIModel, messages: list[dict[str, str]]) -> Iterator[str]:
        adapter = self._build_adapter(provider)
        yielded = False
        for chunk in adapter.stream_reply(model.model_key, messages):
            if not chunk:
                continue
            yielded = True
            yield chunk

        if not yielded:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI provider returned an empty streamed response.",
            )

    def _build_adapter(self, provider: Provider):
        encrypted_api_key = provider.encrypted_config.get("api_key")
        if provider.provider_type != "ollama" and not encrypted_api_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{provider.name} is missing an API key.",
            )

        api_key = secret_manager.decrypt(encrypted_api_key) if encrypted_api_key else ""
        return AdapterFactory.create(provider, api_key)

    def generate_reply_with_rag(
        self,
        user_id: str,
        provider: Provider,
        model: AIModel,
        messages: list[dict[str, str]],
        include_context: bool = True,
    ) -> tuple[str, list[str]]:
        user_message = messages[-1]["content"] if messages else ""
        context_ids = []

        if include_context and user_message:
            similar_embeddings = self.embeddings.search_similar(user_id, user_message)
            if similar_embeddings:
                context = "\n\n".join([e[0].content for e in similar_embeddings])
                context_ids = [e[0].id for e in similar_embeddings]

                rag_system_message = f"""You are a helpful assistant with access to relevant documents and transcripts.
Use the following context to answer the user's question:

{context}

---

If the context doesn't contain relevant information, answer based on your knowledge."""

                rag_messages = [{"role": "system", "content": rag_system_message}]
                rag_messages.extend(messages[:-1])
                rag_messages.append({"role": "user", "content": user_message})

                response = self.generate_reply(provider, model, rag_messages)
                return response, context_ids

        response = self.generate_reply(provider, model, messages)
        return response, context_ids

    def stream_reply_with_rag(
        self,
        user_id: str,
        provider: Provider,
        model: AIModel,
        messages: list[dict[str, str]],
        include_context: bool = True,
    ) -> tuple[Iterator[str], list[str]]:
        user_message = messages[-1]["content"] if messages else ""
        context_ids: list[str] = []
        stream_messages = messages

        if include_context and user_message:
            similar_embeddings = self.embeddings.search_similar(user_id, user_message)
            if similar_embeddings:
                context = "\n\n".join([e[0].content for e in similar_embeddings])
                context_ids = [e[0].id for e in similar_embeddings]
                rag_system_message = f"""You are a helpful assistant with access to relevant documents and transcripts.
Use the following context to answer the user's question:

{context}

---

If the context doesn't contain relevant information, answer based on your knowledge."""
                stream_messages = [{"role": "system", "content": rag_system_message}]
                stream_messages.extend(messages[:-1])
                stream_messages.append({"role": "user", "content": user_message})

        return self.stream_reply(provider, model, stream_messages), context_ids
