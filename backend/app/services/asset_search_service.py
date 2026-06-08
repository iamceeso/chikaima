from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset_chunk import AssetChunk
from app.services.embeddings_service import EmbeddingsService


@dataclass
class ChunkSearchHit:
    chunk: AssetChunk
    score: float


@dataclass
class RetrievalSource:
    source_type: str
    source_id: str
    asset_type: str
    filename: str
    score: float
    chunks: list[ChunkSearchHit]


class AssetSearchService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.embeddings = EmbeddingsService(db)

    def search(
        self,
        user_id: str,
        query: str,
        *,
        source_type: str | None = None,
        source_ids: set[str] | None = None,
        asset_types: set[str] | None = None,
        limit: int | None = None,
    ) -> list[RetrievalSource]:
        if not query.strip():
            return []

        limit = limit or settings.rag_top_k
        query_vector = self.embeddings.generate_embedding(query)

        distance_expr = AssetChunk.embedding.cosine_distance(query_vector)
        query_obj = self.db.query(AssetChunk, distance_expr.label("distance")).filter(AssetChunk.user_id == user_id)
        if source_type:
            query_obj = query_obj.filter(AssetChunk.source_type == source_type)
        if source_ids:
            query_obj = query_obj.filter(AssetChunk.source_id.in_(source_ids))
        if asset_types:
            query_obj = query_obj.filter(AssetChunk.asset_type.in_(asset_types))

        rows = query_obj.order_by(distance_expr.asc()).limit(limit * 8).all()

        grouped: dict[tuple[str, str], RetrievalSource] = {}
        for chunk, distance in rows:
            score = max(0.0, 1.0 - float(distance))
            if score <= 0:
                continue
            key = (chunk.source_type, chunk.source_id)
            entry = grouped.get(key)
            if entry is None:
                entry = RetrievalSource(
                    source_type=chunk.source_type,
                    source_id=chunk.source_id,
                    asset_type=chunk.asset_type,
                    filename=chunk.filename,
                    score=score,
                    chunks=[],
                )
                grouped[key] = entry
            entry.score = max(entry.score, score)
            if len(entry.chunks) < 3:
                entry.chunks.append(ChunkSearchHit(chunk=chunk, score=score))

        return sorted(grouped.values(), key=lambda item: item.score, reverse=True)[:limit]
