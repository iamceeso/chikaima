import unittest

from app.core.config import Settings


class SettingsTests(unittest.TestCase):
    def test_parse_cors_origins_supports_csv_strings(self) -> None:
        origins = Settings.parse_cors_origins("http://localhost:3000, https://example.com")

        self.assertEqual(origins, ["http://localhost:3000", "https://example.com"])

    def test_parse_cors_origins_supports_json_arrays(self) -> None:
        origins = Settings.parse_cors_origins('["http://localhost:3000", "https://example.com"]')

        self.assertEqual(origins, ["http://localhost:3000", "https://example.com"])

    def test_is_production_is_case_insensitive(self) -> None:
        settings = Settings(app_env="PrOdUcTiOn")

        self.assertTrue(settings.is_production)
