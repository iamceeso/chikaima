import unittest
from datetime import datetime, UTC
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from fastapi import HTTPException

from app.core.crypto import ENCRYPTED_VALUE_PREFIX, SecretManager
from app.services.provider_service import (
    CURATED_PROVIDER_MODELS,
    DEFAULT_BASE_URLS,
    ProviderService,
    _dedupe_models,
    _gemini_capabilities,
    _join_api_url,
    _openai_capabilities,
    _resolve_base_url,
    _should_include_openai_model,
    _should_include_openrouter_model,
    _sort_models,
    _titleize_model_name,
    build_model_response,
    is_deprecated_model,
)


class ProviderServiceTests(unittest.TestCase):
    @staticmethod
    def _make_model(model_key: str, display_name: str) -> SimpleNamespace:
        now = datetime.now(UTC)
        return SimpleNamespace(
            id="model-1",
            created_at=now,
            updated_at=now,
            provider_id="provider-1",
            model_key=model_key,
            display_name=display_name,
            capabilities={"chat": True},
            is_default=False,
            is_available=True,
        )

    def test_openrouter_default_base_url_is_registered(self) -> None:
        self.assertEqual(DEFAULT_BASE_URLS["openrouter"], "https://openrouter.ai/api/v1")

    def test_litellm_default_base_url_is_registered(self) -> None:
        self.assertEqual(DEFAULT_BASE_URLS["litellm"], "http://localhost:4000/v1")

    def test_init_and_list_for_user_delegate_to_repository(self) -> None:
        db = SimpleNamespace()

        with patch("app.services.provider_service.ProviderRepository", return_value="repo") as repository:
            service = ProviderService(db)

        self.assertIs(service.db, db)
        self.assertEqual(service.providers, "repo")
        repository.assert_called_once_with(db)

        service = object.__new__(ProviderService)
        service.providers = SimpleNamespace(list_for_user=lambda user_id: [user_id])

        self.assertEqual(service.list_for_user("user-1"), ["user-1"])

    def test_openrouter_model_filter_excludes_non_chat_endpoints(self) -> None:
        self.assertTrue(_should_include_openrouter_model("openai/gpt-4o-mini"))
        self.assertFalse(_should_include_openrouter_model("openai/text-embedding-3-small"))
        self.assertFalse(_should_include_openrouter_model("openai/tts-1"))

    def test_openai_model_filter_includes_supported_chat_families(self) -> None:
        self.assertTrue(_should_include_openai_model("gpt-5"))
        self.assertTrue(_should_include_openai_model("gpt-oss-20b"))
        self.assertFalse(_should_include_openai_model("text-embedding-3-small"))

    def test_join_api_url_avoids_duplicate_suffix(self) -> None:
        self.assertEqual(_join_api_url("https://api.example.com/v1/models", "models"), "https://api.example.com/v1/models")
        self.assertEqual(_join_api_url("https://api.example.com/v1", "models"), "https://api.example.com/v1/models")

    def test_titleize_and_capability_helpers_shape_model_metadata(self) -> None:
        self.assertEqual(_titleize_model_name("gemini-2.5-flash"), "Gemini 2.5 Flash")
        self.assertEqual(_resolve_base_url("openai", None), DEFAULT_BASE_URLS["openai"])
        self.assertIsNone(_resolve_base_url("unknown", None))
        self.assertTrue(_openai_capabilities("gpt-4o-audio")["audio"])
        self.assertTrue(_openai_capabilities("gpt-5")["vision"])
        self.assertFalse(_openai_capabilities("o3-mini")["vision"])
        self.assertTrue(_openai_capabilities("chatgpt-vision")["vision"])
        self.assertTrue(_openai_capabilities("vision-model")["vision"])
        self.assertTrue(_gemini_capabilities("gemini-2.5-flash")["audio"])
        self.assertNotIn("audio", _gemini_capabilities("palm"))

    def test_dedupe_models_removes_duplicates_and_normalizes_names(self) -> None:
        models = _dedupe_models(
            [
                {"key": "  gpt-4o  ", "name": "", "capabilities": None},
                {"key": "gpt-4o", "name": "Duplicate", "capabilities": {"chat": False}},
                {"key": "", "name": "Ignored"},
            ]
        )

        self.assertEqual(
            models,
            [{"key": "gpt-4o", "name": "gpt-4o", "capabilities": {"chat": True}}],
        )

    def test_sort_models_applies_provider_priority(self) -> None:
        models = [
            {"key": "gpt-4o", "name": "GPT-4o", "capabilities": {"chat": True}},
            {"key": "gpt-5", "name": "GPT-5", "capabilities": {"chat": True}},
        ]

        sorted_models = _sort_models("openai", models)

        self.assertEqual([item["key"] for item in sorted_models], ["gpt-5", "gpt-4o"])

    def test_build_model_response_marks_deprecated_models(self) -> None:
        model = self._make_model("gpt-4", "GPT-4")
        provider = SimpleNamespace(name="Primary", provider_type="openai")

        response = build_model_response(model, provider)

        self.assertTrue(response.is_deprecated)
        self.assertTrue(is_deprecated_model("openai", "gpt-4"))

    def test_build_model_response_keeps_supported_models_active(self) -> None:
        model = self._make_model("gpt-4o-mini", "GPT-4o Mini")
        provider = SimpleNamespace(name="Primary", provider_type="openai")

        response = build_model_response(model, provider)

        self.assertFalse(response.is_deprecated)
        self.assertFalse(is_deprecated_model(None, "gpt-4o-mini"))

    def test_openrouter_models_use_openai_fetch_path(self) -> None:
        service = object.__new__(ProviderService)

        with patch.object(
            service,
            "_fetch_openai_models",
            return_value=CURATED_PROVIDER_MODELS["openrouter"],
        ) as fetcher:
            models = service._load_provider_models(
                type(
                    "Provider",
                    (),
                    {
                        "provider_type": "openrouter",
                        "encrypted_config": {},
                        "base_url": "https://openrouter.ai/api/v1",
                    },
                )(),
                api_key="sk-or-test",
            )

        fetcher.assert_called_once()
        self.assertEqual(models, CURATED_PROVIDER_MODELS["openrouter"])

    def test_secret_manager_encrypts_values_with_fernet_prefix(self) -> None:
        manager = SecretManager("provider-secret-key-for-tests-123456")

        encrypted = manager.encrypt("sk-test-secret")

        self.assertTrue(encrypted.startswith(ENCRYPTED_VALUE_PREFIX))
        self.assertNotIn("sk-test-secret", encrypted)
        self.assertEqual(manager.decrypt(encrypted), "sk-test-secret")

    def test_secret_manager_supports_legacy_base64_values(self) -> None:
        manager = SecretManager("provider-secret-key-for-tests-123456")

        self.assertEqual(manager.decrypt("c2stdGVzdC1zZWNyZXQ="), "sk-test-secret")

    def test_load_provider_models_reencrypts_legacy_api_keys(self) -> None:
        service = object.__new__(ProviderService)
        added_items: list[object] = []
        service.db = type("DB", (), {"add": lambda _self, item: added_items.append(item)})()

        provider = type(
            "Provider",
            (),
            {
                "provider_type": "openai",
                "encrypted_config": {"api_key": "c2stdGVzdC1zZWNyZXQ="},
                "base_url": "https://api.openai.com/v1",
            },
        )()

        with patch.object(service, "_fetch_openai_models", return_value=CURATED_PROVIDER_MODELS["openai"]) as fetcher:
            models = service._load_provider_models(provider)

        fetcher.assert_called_once_with(provider, "sk-test-secret")
        self.assertEqual(models, CURATED_PROVIDER_MODELS["openai"])
        self.assertTrue(provider.encrypted_config["api_key"].startswith(ENCRYPTED_VALUE_PREFIX))
        self.assertEqual(added_items, [provider])

    def test_update_does_not_reload_models_when_connection_fields_are_unchanged(self) -> None:
        provider = type(
            "Provider",
            (),
            {
                "id": "provider-1",
                "user_id": "user-1",
                "name": "Primary",
                "provider_type": "openai",
                "base_url": "https://api.openai.com/v1",
                "is_enabled": True,
                "encrypted_config": {},
            },
        )()
        refreshed: list[object] = []
        service = object.__new__(ProviderService)
        service.providers = type("Repo", (), {"get": lambda _self, provider_id: provider})()
        service.db = type(
            "DB",
            (),
            {
                "add": lambda _self, item: None,
                "flush": lambda _self: None,
                "commit": lambda _self: None,
                "refresh": lambda _self, item: refreshed.append(item),
            },
        )()

        with patch.object(service, "_load_provider_models") as loader, patch.object(service, "_replace_provider_models") as replacer:
            updated = service.update(
                "user-1",
                "provider-1",
                type("Payload", (), {"name": "Renamed", "base_url": None, "is_enabled": None, "config": None, "api_key": None})(),
            )

        self.assertEqual(updated.name, "Renamed")
        loader.assert_not_called()
        replacer.assert_not_called()
        self.assertEqual(refreshed, [provider])

    def test_create_encrypts_api_key_and_replaces_models(self) -> None:
        flushed: list[str] = []
        refreshed: list[object] = []
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(
            add=lambda _item: None,
            flush=lambda: flushed.append("flush"),
            commit=lambda: flushed.append("commit"),
            refresh=lambda item: refreshed.append(item),
        )

        payload = SimpleNamespace(
            config={"region": "us"},
            api_key="sk-live",
            name="Primary",
            provider_type="openai",
            base_url="https://api.openai.com/v1",
        )

        with (
            patch.object(service, "_load_provider_models", return_value=[{"key": "gpt-5", "name": "GPT-5", "capabilities": {"chat": True}}]) as loader,
            patch.object(service, "_replace_provider_models") as replacer,
        ):
            provider = service.create("user-1", payload)

        self.assertEqual(provider.user_id, "user-1")
        self.assertTrue(provider.encrypted_config["api_key"].startswith(ENCRYPTED_VALUE_PREFIX))
        loader.assert_called_once()
        replacer.assert_called_once()
        self.assertEqual(refreshed, [provider])

    def test_create_without_api_key_preserves_plain_config(self) -> None:
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(add=lambda _item: None, flush=lambda: None, commit=lambda: None, refresh=lambda _item: None)
        payload = SimpleNamespace(
            config={"region": "us"},
            api_key=None,
            name="Primary",
            provider_type="local",
            base_url=None,
        )

        with (
            patch.object(service, "_load_provider_models", return_value=[]),
            patch.object(service, "_replace_provider_models"),
        ):
            provider = service.create("user-1", payload)

        self.assertEqual(provider.encrypted_config, {"region": "us"})

    def test_update_rejects_missing_provider_and_reloads_models_when_connection_fields_change(self) -> None:
        service = object.__new__(ProviderService)
        service.providers = SimpleNamespace(get=lambda _provider_id: None)

        with self.assertRaises(HTTPException) as context:
            service.update("user-1", "missing", SimpleNamespace(name=None, base_url=None, is_enabled=None, config=None, api_key=None))

        self.assertEqual(context.exception.status_code, 404)

        provider = type(
            "Provider",
            (),
            {
                "id": "provider-1",
                "user_id": "user-1",
                "name": "Primary",
                "provider_type": "openai",
                "base_url": None,
                "is_enabled": True,
                "encrypted_config": {"existing": True},
            },
        )()
        service.providers = SimpleNamespace(get=lambda _provider_id: provider)
        service.db = SimpleNamespace(add=lambda _item: None, flush=lambda: None, commit=lambda: None, refresh=lambda _item: None)

        with (
            patch.object(service, "_load_provider_models", return_value=[{"key": "gpt-5", "name": "GPT-5", "capabilities": {"chat": True}}]) as loader,
            patch.object(service, "_replace_provider_models") as replacer,
            patch("app.services.provider_service.secret_manager.encrypt", return_value="encrypted-key"),
        ):
            updated = service.update(
                "user-1",
                "provider-1",
                SimpleNamespace(name=None, base_url="https://api.example.com/v1", is_enabled=False, config={"region": "eu"}, api_key="sk-test"),
            )

        self.assertEqual(updated.base_url, "https://api.example.com/v1")
        self.assertFalse(updated.is_enabled)
        self.assertEqual(updated.encrypted_config["existing"], True)
        self.assertEqual(updated.encrypted_config["region"], "eu")
        self.assertEqual(updated.encrypted_config["api_key"], "encrypted-key")
        loader.assert_called_once()
        replacer.assert_called_once()

    def test_delete_raises_for_unknown_provider(self) -> None:
        service = object.__new__(ProviderService)
        service.providers = SimpleNamespace(get=lambda _provider_id: None)

        with self.assertRaises(HTTPException) as context:
            service.delete("user-1", "missing")

        self.assertEqual(context.exception.status_code, 404)

    def test_delete_removes_owned_provider(self) -> None:
        provider = SimpleNamespace(id="provider-1", user_id="user-1")
        deleted: list[object] = []
        service = object.__new__(ProviderService)
        service.providers = SimpleNamespace(
            get=lambda _provider_id: provider,
            delete=lambda item: deleted.append(item),
        )

        service.delete("user-1", "provider-1")

        self.assertEqual(deleted, [provider])

    def test_delete_rejects_provider_owned_by_other_user(self) -> None:
        provider = SimpleNamespace(id="provider-1", user_id="user-2")
        service = object.__new__(ProviderService)
        service.providers = SimpleNamespace(get=lambda _provider_id: provider)

        with self.assertRaises(HTTPException) as context:
            service.delete("user-1", "provider-1")

        self.assertEqual(context.exception.status_code, 404)

    def test_replace_provider_models_preserves_existing_default_and_assigns_first_global_default(self) -> None:
        provider = SimpleNamespace(id="provider-1", provider_type="openai")
        added: list[object] = []
        query_results = iter(
            [
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(first=lambda: SimpleNamespace(model_key="gpt-4o"))),
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(first=lambda: None)),
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(delete=lambda: None)),
            ]
        )
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(
            query=lambda _model: next(query_results),
            add=lambda item: added.append(item),
        )

        service._replace_provider_models(
            provider,
            [
                {"key": "gpt-4o", "name": "GPT-4o", "capabilities": {"chat": True}},
                {"key": "gpt-4o", "name": "GPT-4o duplicate", "capabilities": {"chat": True}},
                {"key": "gpt-5", "name": "GPT-5", "capabilities": {"chat": True}},
            ],
        )

        self.assertEqual(len(added), 2)
        self.assertEqual([item.model_key for item in added], ["gpt-5", "gpt-4o"])
        self.assertTrue(added[0].is_default)
        self.assertTrue(added[1].is_default)

    def test_replace_provider_models_falls_back_to_curated_models(self) -> None:
        provider = SimpleNamespace(id="provider-1", provider_type="local")
        added: list[object] = []
        query_results = iter(
            [
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(first=lambda: None)),
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(first=lambda: None)),
                SimpleNamespace(filter=lambda *_args, **_kwargs: SimpleNamespace(delete=lambda: None)),
            ]
        )
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(query=lambda _model: next(query_results), add=lambda item: added.append(item))

        service._replace_provider_models(provider, [])

        self.assertEqual(added[0].model_key, CURATED_PROVIDER_MODELS["local"][0]["key"])
        self.assertTrue(added[0].is_default)

    def test_load_provider_models_dispatches_by_provider_type(self) -> None:
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(add=lambda _item: None)
        provider = SimpleNamespace(provider_type="local", encrypted_config={}, base_url=None)

        self.assertEqual(service._load_provider_models(provider), CURATED_PROVIDER_MODELS["local"])

    def test_load_provider_models_dispatches_all_provider_types(self) -> None:
        service = object.__new__(ProviderService)
        service.db = SimpleNamespace(add=lambda _item: None)

        with (
            patch.object(service, "_fetch_openai_models", return_value=["openai"]) as openai_fetcher,
            patch.object(service, "_fetch_anthropic_models", return_value=["anthropic"]) as anthropic_fetcher,
            patch.object(service, "_fetch_gemini_models", return_value=["gemini"]) as gemini_fetcher,
            patch.object(service, "_fetch_ollama_models", return_value=["ollama"]) as ollama_fetcher,
        ):
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="openai", encrypted_config={}, base_url=None), "sk"), ["openai"])
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="anthropic", encrypted_config={}, base_url=None), "sk"), ["anthropic"])
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="gemini", encrypted_config={}, base_url=None), "sk"), ["gemini"])
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="ollama", encrypted_config={}, base_url=None), "sk"), ["ollama"])
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="openrouter", encrypted_config={}, base_url=None), "sk"), ["openai"])
            self.assertEqual(service._load_provider_models(SimpleNamespace(provider_type="litellm", encrypted_config={}, base_url=None), "sk"), ["openai"])

        self.assertEqual(openai_fetcher.call_count, 3)
        anthropic_fetcher.assert_called_once()
        gemini_fetcher.assert_called_once()
        ollama_fetcher.assert_called_once()

    def test_fetch_openai_models_uses_curated_fallbacks_when_unavailable(self) -> None:
        service = object.__new__(ProviderService)
        provider = SimpleNamespace(provider_type="openrouter", base_url=None)

        self.assertEqual(service._fetch_openai_models(provider, None), CURATED_PROVIDER_MODELS["openrouter"])
        self.assertEqual(service._fetch_openai_models(SimpleNamespace(provider_type="openai", base_url=None), "sk"), CURATED_PROVIDER_MODELS["openai"])

    def test_fetch_openai_models_filters_and_sorts_remote_results(self) -> None:
        service = object.__new__(ProviderService)
        provider = SimpleNamespace(provider_type="openai", base_url="https://api.openai.com/v1")
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "data": [
                    {"id": "gpt-4o"},
                    {"id": "text-embedding-3-small"},
                    {"id": "gpt-5"},
                ]
            },
        )
        client = MagicMock()
        client.__enter__.return_value.get.return_value = response

        with patch("app.services.provider_service.httpx.Client", return_value=client):
            models = service._fetch_openai_models(provider, "sk-test")

        self.assertEqual([item["key"] for item in models], ["gpt-4o", "gpt-5"])

    def test_fetch_openai_models_falls_back_when_transport_fails(self) -> None:
        service = object.__new__(ProviderService)

        with patch("app.services.provider_service.httpx.Client", side_effect=httpx.HTTPError("boom")):
            self.assertEqual(
                service._fetch_openai_models(SimpleNamespace(provider_type="litellm", base_url="http://localhost:4000/v1"), "sk"),
                CURATED_PROVIDER_MODELS["litellm"],
            )

    def test_fetch_openai_anthropic_gemini_and_ollama_fallback_when_base_url_missing(self) -> None:
        service = object.__new__(ProviderService)

        self.assertEqual(service._fetch_openai_models(SimpleNamespace(provider_type="custom", base_url=""), "sk"), CURATED_PROVIDER_MODELS["openai"])
        self.assertEqual(service._fetch_anthropic_models(SimpleNamespace(provider_type="custom", base_url=""), "sk"), CURATED_PROVIDER_MODELS["anthropic"])
        self.assertEqual(service._fetch_gemini_models(SimpleNamespace(provider_type="custom", base_url=""), "sk"), CURATED_PROVIDER_MODELS["gemini"])
        self.assertEqual(service._fetch_ollama_models(SimpleNamespace(provider_type="custom", base_url="")), CURATED_PROVIDER_MODELS["ollama"])

    def test_fetch_anthropic_and_gemini_fallback_when_api_key_missing(self) -> None:
        service = object.__new__(ProviderService)

        self.assertEqual(
            service._fetch_anthropic_models(SimpleNamespace(provider_type="anthropic", base_url="https://api.anthropic.com"), None),
            CURATED_PROVIDER_MODELS["anthropic"],
        )
        self.assertEqual(
            service._fetch_gemini_models(SimpleNamespace(provider_type="gemini", base_url="https://generativelanguage.googleapis.com/v1beta"), None),
            CURATED_PROVIDER_MODELS["gemini"],
        )

    def test_fetch_anthropic_gemini_and_ollama_models_cover_remote_and_fallback_paths(self) -> None:
        service = object.__new__(ProviderService)

        with patch("app.services.provider_service.httpx.Client", side_effect=httpx.HTTPError("boom")):
            self.assertEqual(
                service._fetch_anthropic_models(SimpleNamespace(provider_type="anthropic", base_url="https://api.anthropic.com"), "sk"),
                CURATED_PROVIDER_MODELS["anthropic"],
            )
            self.assertEqual(
                service._fetch_gemini_models(SimpleNamespace(provider_type="gemini", base_url="https://generativelanguage.googleapis.com/v1beta"), "sk"),
                CURATED_PROVIDER_MODELS["gemini"],
            )
            self.assertEqual(
                service._fetch_ollama_models(SimpleNamespace(provider_type="ollama", base_url="http://localhost:11434")),
                CURATED_PROVIDER_MODELS["ollama"],
            )

        anthropic_response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"data": [{"id": "claude-sonnet-4-5-20250929", "display_name": "Claude Sonnet 4.5"}]},
        )
        gemini_response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "models": [
                    {"name": "models/gemini-2.5-flash", "displayName": "Gemini Flash", "supportedGenerationMethods": ["generateContent"]},
                    {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
                ]
            },
        )
        ollama_response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"models": [{"model": "llama3.1", "name": "Llama 3.1"}]},
        )
        anthropic_client = MagicMock()
        anthropic_client.__enter__.return_value.get.return_value = anthropic_response
        gemini_client = MagicMock()
        gemini_client.__enter__.return_value.get.return_value = gemini_response
        ollama_client = MagicMock()
        ollama_client.__enter__.return_value.get.return_value = ollama_response

        with patch("app.services.provider_service.httpx.Client", side_effect=[anthropic_client, gemini_client, ollama_client]):
            anthropic_models = service._fetch_anthropic_models(
                SimpleNamespace(provider_type="anthropic", base_url="https://api.anthropic.com"),
                "sk",
            )
            gemini_models = service._fetch_gemini_models(
                SimpleNamespace(provider_type="gemini", base_url="https://generativelanguage.googleapis.com/v1beta"),
                "sk",
            )
            ollama_models = service._fetch_ollama_models(
                SimpleNamespace(provider_type="ollama", base_url="http://localhost:11434")
            )

        self.assertEqual(anthropic_models[0]["key"], "claude-sonnet-4-5-20250929")
        self.assertEqual(gemini_models[0]["key"], "gemini-2.5-flash")
        self.assertEqual(ollama_models[0]["key"], "llama3.1")

    def test_fetch_remote_model_helpers_cover_empty_and_invalid_payload_fallbacks(self) -> None:
        service = object.__new__(ProviderService)

        anthropic_response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": []})
        gemini_response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "models": [
                    {"name": None, "supportedGenerationMethods": "bad"},
                    {"name": "models/text-embedding-004", "supportedGenerationMethods": ["generateContent"]},
                    "skip",
                ]
            },
        )
        ollama_response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"models": [{"model": None}, "skip"]})

        anthropic_client = MagicMock()
        anthropic_client.__enter__.return_value.get.return_value = anthropic_response
        gemini_client = MagicMock()
        gemini_client.__enter__.return_value.get.return_value = gemini_response
        ollama_client = MagicMock()
        ollama_client.__enter__.return_value.get.return_value = ollama_response

        with patch("app.services.provider_service.httpx.Client", side_effect=[anthropic_client, gemini_client, ollama_client]):
            self.assertEqual(
                service._fetch_anthropic_models(SimpleNamespace(provider_type="anthropic", base_url="https://api.anthropic.com"), "sk"),
                CURATED_PROVIDER_MODELS["anthropic"],
            )
            self.assertEqual(
                service._fetch_gemini_models(SimpleNamespace(provider_type="gemini", base_url="https://generativelanguage.googleapis.com/v1beta"), "sk"),
                CURATED_PROVIDER_MODELS["gemini"],
            )
            self.assertEqual(
                service._fetch_ollama_models(SimpleNamespace(provider_type="ollama", base_url="http://localhost:11434")),
                CURATED_PROVIDER_MODELS["ollama"],
            )
