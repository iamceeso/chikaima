import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.providers.factory import AdapterFactory


class AdapterFactoryTests(unittest.TestCase):
    def test_create_returns_openai_adapter_for_openai_variants(self) -> None:
        provider = SimpleNamespace(provider_type="openai", name="Primary", base_url=None)

        with patch("app.services.providers.factory.OpenAIAdapter", return_value="adapter") as adapter_class:
            adapter = AdapterFactory.create(provider, "sk-test")

        self.assertEqual(adapter, "adapter")
        adapter_class.assert_called_once_with(api_key="sk-test", provider_label="Primary")

    def test_create_returns_openrouter_adapter_with_default_base_url(self) -> None:
        provider = SimpleNamespace(provider_type="openrouter", name="", base_url=None)

        with patch("app.services.providers.factory.OpenAIAdapter", return_value="adapter") as adapter_class:
            adapter = AdapterFactory.create(provider, "sk-test")

        self.assertEqual(adapter, "adapter")
        adapter_class.assert_called_once_with(
            api_key="sk-test",
            base_url="https://openrouter.ai/api/v1",
            provider_label="Openrouter",
        )

    def test_create_returns_litellm_adapter_with_default_base_url(self) -> None:
        provider = SimpleNamespace(provider_type="litellm", name="Lite", base_url=None)

        with patch("app.services.providers.factory.OpenAIAdapter", return_value="adapter") as adapter_class:
            adapter = AdapterFactory.create(provider, "sk-test")

        self.assertEqual(adapter, "adapter")
        adapter_class.assert_called_once_with(
            api_key="sk-test",
            base_url="http://localhost:4000/v1",
            provider_label="Lite",
        )

    def test_create_returns_local_adapter_with_default_base_url(self) -> None:
        provider = SimpleNamespace(provider_type="local", name="Local", base_url=None)

        with patch("app.services.providers.factory.OpenAIAdapter", return_value="adapter") as adapter_class:
            adapter = AdapterFactory.create(provider, "")

        self.assertEqual(adapter, "adapter")
        adapter_class.assert_called_once_with(
            api_key="",
            base_url="http://localhost:4000/v1",
            provider_label="Local",
        )

    def test_create_returns_anthropic_and_gemini_adapters(self) -> None:
        anthropic_provider = SimpleNamespace(provider_type="anthropic", name="Claude", base_url="https://anthropic.example")
        gemini_provider = SimpleNamespace(provider_type="gemini", name="Gemini", base_url="https://gemini.example")

        with (
            patch("app.services.providers.factory.AnthropicAdapter", return_value="anthropic-adapter") as anthropic_class,
            patch("app.services.providers.factory.GeminiAdapter", return_value="gemini-adapter") as gemini_class,
        ):
            self.assertEqual(AdapterFactory.create(anthropic_provider, "key-1"), "anthropic-adapter")
            self.assertEqual(AdapterFactory.create(gemini_provider, "key-2"), "gemini-adapter")

        anthropic_class.assert_called_once_with(api_key="key-1", base_url="https://anthropic.example")
        gemini_class.assert_called_once_with(api_key="key-2", base_url="https://gemini.example")

    def test_create_returns_ollama_adapter_using_settings_default(self) -> None:
        provider = SimpleNamespace(provider_type="ollama", name="Ollama", base_url=None)

        with patch("app.services.providers.factory.OllamaAdapter", return_value="ollama-adapter") as adapter_class:
            adapter = AdapterFactory.create(provider, "unused")

        self.assertEqual(adapter, "ollama-adapter")
        adapter_class.assert_called_once()

    def test_create_rejects_unsupported_provider_type(self) -> None:
        provider = SimpleNamespace(provider_type="unknown", name="Unknown", base_url=None)

        with self.assertRaises(HTTPException) as context:
            AdapterFactory.create(provider, "sk-test")

        self.assertEqual(context.exception.status_code, 400)
