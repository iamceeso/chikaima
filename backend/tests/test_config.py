import unittest

from pydantic import ValidationError

from app.core.config import Settings


class SettingsTests(unittest.TestCase):
    def test_missing_required_secrets_fail_validation(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(
                jwt_secret_key="",
                jwt_refresh_secret_key="",
                provider_secret_key="",
            )

    def test_parse_cors_origins_supports_csv_strings(self) -> None:
        origins = Settings.parse_cors_origins("http://localhost:3000, https://example.com")

        self.assertEqual(origins, ["http://localhost:3000", "https://example.com"])

    def test_parse_cors_origins_supports_json_arrays(self) -> None:
        origins = Settings.parse_cors_origins('["http://localhost:3000", "https://example.com"]')

        self.assertEqual(origins, ["http://localhost:3000", "https://example.com"])

    def test_is_production_is_case_insensitive(self) -> None:
        settings = Settings(
            app_env="Production",
            jwt_secret_key="prod-jwt-secret-1234567890",
            jwt_refresh_secret_key="prod-refresh-secret-1234567890",
            provider_secret_key="prod-provider-secret-1234567890",
        )

        self.assertTrue(settings.is_production)

    def test_development_allows_placeholder_secrets(self) -> None:
        settings = Settings(
            jwt_secret_key="change-me-development-secret",
            jwt_refresh_secret_key="change-me-too-development-secret",
            provider_secret_key="replace-with-32-char-secret-key",
        )

        self.assertFalse(settings.is_production)

    def test_production_rejects_placeholder_secrets(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(
                app_env="production",
                jwt_secret_key="change-me",
                jwt_refresh_secret_key="change-me-too",
                provider_secret_key="replace-with-32-char-secret",
            )

    def test_production_accepts_real_secrets(self) -> None:
        settings = Settings(
            app_env="production",
            jwt_secret_key="prod-jwt-secret-1234567890",
            jwt_refresh_secret_key="prod-refresh-secret-1234567890",
            provider_secret_key="prod-provider-secret-1234567890",
        )

        self.assertTrue(settings.is_production)
