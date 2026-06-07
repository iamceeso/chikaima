from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.embedding import Embedding

CHUNK_SIZE = 1_200
CHUNK_OVERLAP = 200
MIN_SEARCH_SCORE = 0.18


class EmbeddingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.model = SentenceTransformer(settings.embedding_model)

    def generate_embedding(self, text: str) -> list[float]:
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    def _cosine_similarity(self, vec1: list[float], vec2: list[float]) -> float:
        arr1 = np.array(vec1, dtype=np.float32)
        arr2 = np.array(vec2, dtype=np.float32)
        dot_product = np.dot(arr1, arr2)
        norm1 = np.linalg.norm(arr1)
        norm2 = np.linalg.norm(arr2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(dot_product / (norm1 * norm2))

    def store_embedding(
        self,
        user_id: str,
        source_type: str,
        source_id: str,
        content: str,
        meta: dict | None = None,
    ) -> Embedding:
        vector = self.generate_embedding(content)
        embedding = Embedding(
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            content=content,
            vector=vector,
            meta=meta or {},
        )
        self.db.add(embedding)
        self.db.flush()
        return embedding

    def _chunk_text(self, text: str) -> list[str]:
        normalized = " ".join(text.split())
        if not normalized:
            return []
        if len(normalized) <= CHUNK_SIZE:
            return [normalized]

        chunks: list[str] = []
        start = 0
        step = CHUNK_SIZE - CHUNK_OVERLAP
        while start < len(normalized):
            end = min(len(normalized), start + CHUNK_SIZE)
            chunk = normalized[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(normalized):
                break
            start += step
        return chunks

    def search_similar(
        self,
        user_id: str,
        query: str,
        source_type: str | None = None,
        limit: int | None = None,
        dedupe_sources: bool = True,
    ) -> list[tuple[Embedding, float]]:
        query_vector = self.generate_embedding(query)

        query_obj = self.db.query(Embedding).filter(Embedding.user_id == user_id)

        if source_type:
            query_obj = query_obj.filter(Embedding.source_type == source_type)

        embeddings = query_obj.all()

        scored_embeddings = [
            (emb, self._cosine_similarity(query_vector, emb.vector))
            for emb in embeddings
            if emb.vector
        ]

        scored_embeddings.sort(key=lambda x: x[1], reverse=True)

        limit = limit or settings.rag_top_k
        if not dedupe_sources:
            return [(emb, score) for emb, score in scored_embeddings if score >= MIN_SEARCH_SCORE][:limit]

        deduped_results: list[tuple[Embedding, float]] = []
        seen_sources: set[tuple[str, str]] = set()
        for emb, score in scored_embeddings:
            if score < MIN_SEARCH_SCORE:
                continue
            source_key = (emb.source_type, emb.source_id)
            if source_key in seen_sources:
                continue
            seen_sources.add(source_key)
            deduped_results.append((emb, score))
        return deduped_results[:limit]

    def delete_for_source(self, user_id: str, source_type: str, source_id: str) -> int:
        count = (
            self.db.query(Embedding)
            .filter(
                Embedding.user_id == user_id,
                Embedding.source_type == source_type,
                Embedding.source_id == source_id,
            )
            .delete()
        )
        self.db.flush()
        return count

    def index_transcript(self, user_id: str, transcript_id: str, content: str) -> Embedding:
        self.delete_for_source(user_id, "transcript", transcript_id)
        chunks = self._chunk_text(content)
        first_embedding: Embedding | None = None
        for idx, chunk in enumerate(chunks):
            embedding = self.store_embedding(
                user_id=user_id,
                source_type="transcript",
                source_id=transcript_id,
                content=chunk,
                meta={"type": "transcript", "chunk_index": idx, "chunk_count": len(chunks)},
            )
            if first_embedding is None:
                first_embedding = embedding
        if first_embedding is None:
            first_embedding = self.store_embedding(
                user_id=user_id,
                source_type="transcript",
                source_id=transcript_id,
                content="",
                meta={"type": "transcript", "chunk_index": 0, "chunk_count": 0},
            )
        return first_embedding

    def index_summary(self, user_id: str, summary_id: str, content: str) -> Embedding:
        self.delete_for_source(user_id, "summary", summary_id)
        return self.store_embedding(
            user_id=user_id,
            source_type="summary",
            source_id=summary_id,
            content=content,
            meta={"type": "summary"},
        )

    def index_document(self, user_id: str, document_id: str, content: str) -> Embedding:
        self.delete_for_source(user_id, "document", document_id)
        chunks = self._chunk_text(content)
        first_embedding: Embedding | None = None
        for idx, chunk in enumerate(chunks):
            embedding = self.store_embedding(
                user_id=user_id,
                source_type="document",
                source_id=document_id,
                content=chunk,
                meta={"type": "document", "chunk_index": idx, "chunk_count": len(chunks)},
            )
            if first_embedding is None:
                first_embedding = embedding
        if first_embedding is None:
            first_embedding = self.store_embedding(
                user_id=user_id,
                source_type="document",
                source_id=document_id,
                content="",
                meta={"type": "document", "chunk_index": 0, "chunk_count": 0},
            )
        return first_embedding
