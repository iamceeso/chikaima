import unittest
from unittest.mock import patch

from app.core.crypto import ENCRYPTED_VALUE_PREFIX, SecretManager
from app.services.provider_service import (
    CURATED_PROVIDER_MODELS,
    DEFAULT_BASE_URLS,
    ProviderService,
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
