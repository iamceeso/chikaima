from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.crypto import secret_manager
from app.models.ai_model import AIModel
from app.models.provider import Provider
from app.services.asset_search_service import AssetSearchService
from app.services.providers.factory import AdapterFactory

RAG_SEARCH_LIMIT = 3
RAG_CHUNKS_PER_SOURCE = 1


class LLMService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.asset_search = AssetSearchService(db)

    def resolve_model_and_provider(self, user_id: str, model_id: str | None) -> tuple[AIModel, Provider]:
        query = self.db.query(AIModel, Provider).join(Provider, Provider.id == AIModel.provider_id)
        query = query.filter(Provider.user_id == user_id)

        query = query.filter(
            Provider.is_enabled.is_(True),
            AIModel.is_available.is_(True),
        )

        if model_id:
            selection = query.filter(AIModel.id == model_id).first()
            if not selection:
                selection = query.order_by(AIModel.is_default.desc(), AIModel.created_at.asc()).first()
        else:
            selection = query.order_by(AIModel.is_default.desc(), AIModel.created_at.asc()).first()

        if not selection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No enabled AI model is available. Add an OpenAI provider and model first.",
            )

        model, provider = selection
        return model, provider

    def generate_reply(self, provider: Provider, model: AIModel, messages: list[dict[str, Any]]) -> str:
        adapter = self._build_adapter(provider)
        content = adapter.generate_reply(model.model_key, messages)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI provider returned an empty response.",
            )
        return content

    def stream_reply(self, provider: Provider, model: AIModel, messages: list[dict[str, Any]]) -> Iterator[str]:
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
        if provider.provider_type not in {"ollama", "local"} and not encrypted_api_key:
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
        messages: list[dict[str, Any]],
        include_context: bool = True,
        source_filters: dict[str, set[str]] | None = None,
    ) -> tuple[str, list[dict[str, str | int | float]]]:
        user_message = self._content_to_text(messages[-1]["content"]) if messages else ""
        citations: list[dict[str, str | int | float]] = []

        if include_context and user_message:
            search_results = self._search_with_fallback(
                user_id,
                user_message,
                limit=RAG_SEARCH_LIMIT,
                source_filters=source_filters,
            )
            if search_results:
                context_sections: list[str] = []
                for result in search_results:
                    for hit in result.chunks[:RAG_CHUNKS_PER_SOURCE]:
                        reference = self._build_citation(result.filename, hit.chunk.meta)
                        citations.append(
                            {
                                "source_type": result.source_type,
                                "source_id": result.source_id,
                                "asset_type": result.asset_type,
                                "filename": result.filename,
                                "chunk_id": hit.chunk.id,
                                "chunk_index": hit.chunk.chunk_index,
                                "reference": reference,
                                "excerpt": hit.chunk.content[:280],
                                "location": self._extract_location(hit.chunk.meta),
                                "score": round(hit.score, 4),
                            }
                        )
                        context_sections.append(f"[{reference}]\n{hit.chunk.content}")

                context = "\n\n".join(context_sections)
                rag_system_message = f"""You are a helpful assistant with access to relevant workspace assets.
Use the provided chunk excerpts to answer the user's question.
When you rely on a chunk, cite it using the bracketed reference already included in the context.

{context}

---

If the context doesn't contain relevant information, answer based on your knowledge and say that no direct asset evidence was found."""

                rag_messages: list[dict[str, Any]] = [{"role": "system", "content": rag_system_message}]
                rag_messages.extend(messages[:-1])
                rag_messages.append(messages[-1])

                response = self.generate_reply(provider, model, rag_messages)
                return response, citations

        response = self.generate_reply(provider, model, messages)
        return response, citations

    def stream_reply_with_rag(
        self,
        user_id: str,
        provider: Provider,
        model: AIModel,
        messages: list[dict[str, Any]],
        include_context: bool = True,
        source_filters: dict[str, set[str]] | None = None,
    ) -> tuple[Iterator[str], list[dict[str, str | int | float]]]:
        user_message = self._content_to_text(messages[-1]["content"]) if messages else ""
        citations: list[dict[str, str | int | float]] = []
        stream_messages: list[dict[str, Any]] = messages

        if include_context and user_message:
            search_results = self._search_with_fallback(
                user_id,
                user_message,
                limit=RAG_SEARCH_LIMIT,
                source_filters=source_filters,
            )
            if search_results:
                context_sections: list[str] = []
                for result in search_results:
                    for hit in result.chunks[:RAG_CHUNKS_PER_SOURCE]:
                        reference = self._build_citation(result.filename, hit.chunk.meta)
                        citations.append(
                            {
                                "source_type": result.source_type,
                                "source_id": result.source_id,
                                "asset_type": result.asset_type,
                                "filename": result.filename,
                                "chunk_id": hit.chunk.id,
                                "chunk_index": hit.chunk.chunk_index,
                                "reference": reference,
                                "excerpt": hit.chunk.content[:280],
                                "location": self._extract_location(hit.chunk.meta),
                                "score": round(hit.score, 4),
                            }
                        )
                        context_sections.append(f"[{reference}]\n{hit.chunk.content}")
                context = "\n\n".join(context_sections)
                rag_system_message = f"""You are a helpful assistant with access to relevant workspace assets.
Use the provided chunk excerpts to answer the user's question.
When you rely on a chunk, cite it using the bracketed reference already included in the context.

{context}

---

If the context doesn't contain relevant information, answer based on your knowledge and say that no direct asset evidence was found."""
                stream_messages = [{"role": "system", "content": rag_system_message}]
                stream_messages.extend(messages[:-1])
                stream_messages.append(messages[-1])

        return self.stream_reply(provider, model, stream_messages), citations

    def _content_to_text(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            text_parts = [
                str(part.get("text", "")).strip()
                for part in content
                if isinstance(part, dict) and part.get("type") == "text" and str(part.get("text", "")).strip()
            ]
            return "\n\n".join(text_parts).strip()
        return str(content or "")

    def _search_with_fallback(
        self,
        user_id: str,
        query: str,
        *,
        limit: int,
        source_filters: dict[str, set[str]] | None = None,
    ) -> list:
        try:
            return self.asset_search.search(user_id, query, limit=limit, source_filters=source_filters)
        except Exception:
            return []

    def _build_citation(self, filename: str, metadata: dict) -> str:
        if not isinstance(metadata, dict):
            return filename
        if "page" in metadata:
            return f"{filename} p.{metadata['page']}"
        if "slide" in metadata:
            return f"{filename} slide {metadata['slide']}"
        if "sheet" in metadata:
            return f"{filename} sheet {metadata['sheet']}"
        if "start_line" in metadata and "end_line" in metadata:
            return f"{filename} lines {metadata['start_line']}-{metadata['end_line']}"
        return f"{filename} chunk {metadata.get('chunk_index', 0)}"

    def _extract_location(self, metadata: dict) -> dict[str, str | int]:
        if not isinstance(metadata, dict):
            return {}

        location: dict[str, str | int] = {}
        for key in (
            "page",
            "slide",
            "sheet",
            "start_line",
            "end_line",
            "chunk_index",
            "section_index",
        ):
            value = metadata.get(key)
            if isinstance(value, (str, int)):
                location[key] = value
        return location
