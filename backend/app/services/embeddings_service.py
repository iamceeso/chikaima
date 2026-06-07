from __future__ import annotations

from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset_chunk import AssetChunk


class EmbeddingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.model = SentenceTransformer(settings.embedding_model)

    def generate_embedding(self, text: str) -> list[float]:
        embedding = self.model.encode(text or "", convert_to_numpy=True)
        return embedding.tolist()

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

        stored_chunks: list[AssetChunk] = []
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
            stored = AssetChunk(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                asset_type=asset_type,
                filename=filename,
                chunk_index=chunk_index,
                content=normalized,
                embedding=self.generate_embedding(normalized),
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
