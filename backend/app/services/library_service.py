from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.video import Video
from app.schemas.assets import (
    AudioResponse,
    DocumentResponse,
    LibraryBundleResponse,
    VideoResponse,
)
from app.services.cache_service import get_cache_service

LIBRARY_CACHE_TTL_SECONDS = 15


class LibraryService:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def cache_key(user_id: str) -> str:
        return f"library:{user_id}"

    @staticmethod
    def invalidate_user_cache(user_id: str) -> None:
        get_cache_service().delete(LibraryService.cache_key(user_id))

    def get_bundle(self, user_id: str) -> LibraryBundleResponse:
        cache = get_cache_service()
        cache_key = self.cache_key(user_id)
        cached = cache.get_json(cache_key)
        if cached is not None:
            return LibraryBundleResponse.model_validate(cached)

        bundle = LibraryBundleResponse(
            audio=[AudioResponse.model_validate(asset) for asset in self.db.query(AudioAsset).filter(AudioAsset.user_id == user_id).all()],
            videos=[VideoResponse.model_validate(video) for video in self.db.query(Video).filter(Video.user_id == user_id).all()],
            documents=[DocumentResponse.model_validate(document) for document in self.db.query(Document).filter(Document.user_id == user_id).all()],
        )
        cache.set_json(cache_key, bundle.model_dump(mode="json"), LIBRARY_CACHE_TTL_SECONDS)
        return bundle
