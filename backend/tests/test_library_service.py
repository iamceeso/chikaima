import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

from app.services.library_service import LIBRARY_CACHE_TTL_SECONDS, LibraryService


def make_asset(resource_id: str, **overrides) -> SimpleNamespace:
    now = datetime.now(UTC)
    asset = SimpleNamespace(
        id=resource_id,
        created_at=now,
        updated_at=now,
        name=f"{resource_id}.dat",
        file_path=f"/tmp/{resource_id}",
        mime_type="application/pdf",
        transcript=None,
        summary=None,
        chapters=[],
        action_items=[],
        status="completed",
    )
    for key, value in overrides.items():
        setattr(asset, key, value)
    return asset


class QueryStub:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def filter(self, *_args, **_kwargs) -> "QueryStub":
        return self

    def all(self) -> list[object]:
        return self.rows


class LibraryServiceTests(unittest.TestCase):
    def test_init_and_cache_helpers(self) -> None:
        service = LibraryService(db="db")

        self.assertEqual(service.db, "db")
        self.assertEqual(LibraryService.cache_key("user-1"), "library:user-1")

        with patch("app.services.library_service.get_cache_service") as get_cache_service:
            LibraryService.invalidate_user_cache("user-1")

        get_cache_service.return_value.delete.assert_called_once_with("library:user-1")

    def test_get_bundle_returns_cached_payload_when_present(self) -> None:
        cached_bundle = {
            "audio": [],
            "videos": [],
            "documents": [],
        }
        service = LibraryService(db=SimpleNamespace(query=lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected query"))))
        cache = SimpleNamespace(
            get_json=lambda key: cached_bundle,
            set_json=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("unexpected cache write")),
        )

        with patch("app.services.library_service.get_cache_service", return_value=cache):
            bundle = service.get_bundle("user-1")

        self.assertEqual(bundle.audio, [])
        self.assertEqual(bundle.videos, [])
        self.assertEqual(bundle.documents, [])

    def test_get_bundle_builds_and_caches_payload(self) -> None:
        audio = make_asset("audio-1", transcript="Transcript", mime_type="audio/wav")
        video = make_asset("video-1", transcript="Video transcript", summary="Summary")
        document = make_asset("doc-1", mime_type="application/pdf", summary="Doc summary")
        rows = {
            "AudioAsset": [audio],
            "Video": [video],
            "Document": [document],
        }
        db = SimpleNamespace(query=lambda model: QueryStub(rows[model.__name__]))
        writes: list[tuple[str, dict, int]] = []
        cache = SimpleNamespace(
            get_json=lambda key: None,
            set_json=lambda key, value, ttl: writes.append((key, value, ttl)),
        )
        service = LibraryService(db=db)

        with patch("app.services.library_service.get_cache_service", return_value=cache):
            bundle = service.get_bundle("user-1")

        self.assertEqual(bundle.audio[0].name, "audio-1.dat")
        self.assertEqual(bundle.videos[0].summary, "Summary")
        self.assertEqual(bundle.documents[0].summary, "Doc summary")
        self.assertEqual(writes[0][0], "library:user-1")
        self.assertEqual(writes[0][2], LIBRARY_CACHE_TTL_SECONDS)
