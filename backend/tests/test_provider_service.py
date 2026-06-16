import unittest
from unittest.mock import patch

from app.core.crypto import ENCRYPTED_VALUE_PREFIX, SecretManager
from app.services.provider_service import (
    CURATED_PROVIDER_MODELS,
    DEFAULT_BASE_URLS,
    ProviderService,
    _join_api_url,
    _should_include_openai_model,
    _sort_models,
    build_model_response,
    is_deprecated_model,
    _should_include_openrouter_model,
)


class ProviderServiceTests(unittest.TestCase):
    def test_openrouter_default_base_url_is_registered(self) -> None:
        self.assertEqual(DEFAULT_BASE_URLS["openrouter"], "https://openrouter.ai/api/v1")

    def test_litellm_default_base_url_is_registered(self) -> None:
        self.assertEqual(DEFAULT_BASE_URLS["litellm"], "http://localhost:4000/v1")

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

    def test_sort_models_applies_provider_priority(self) -> None:
        models = [
            {"key": "gpt-4o", "name": "GPT-4o", "capabilities": {"chat": True}},
            {"key": "gpt-5", "name": "GPT-5", "capabilities": {"chat": True}},
        ]

        sorted_models = _sort_models("openai", models)

        self.assertEqual([item["key"] for item in sorted_models], ["gpt-5", "gpt-4o"])

    def test_build_model_response_marks_deprecated_models(self) -> None:
        model = type("Model", (), {"__dict__": {"model_key": "gpt-4", "display_name": "GPT-4"}})()
        provider = type("Provider", (), {"name": "Primary", "provider_type": "openai"})()

        response = build_model_response(model, provider)

        self.assertTrue(response.is_deprecated)
        self.assertTrue(is_deprecated_model("openai", "gpt-4"))

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
