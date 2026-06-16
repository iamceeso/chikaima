import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

from app.api.v1.endpoints.providers import _mask, create_provider, delete_provider, list_providers, update_provider


def make_provider(provider_id: str, *, api_key: str | None) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=provider_id,
        user_id="user-1",
        name="Primary",
        provider_type="openai",
        base_url="https://api.openai.com/v1",
        encrypted_config={"api_key": api_key} if api_key is not None else {},
        is_enabled=True,
        created_at=now,
        updated_at=now,
    )


class ProvidersEndpointTests(unittest.TestCase):
    def test_mask_handles_missing_and_present_secrets(self) -> None:
        self.assertIsNone(_mask(None))
        self.assertIsNone(_mask(""))
        self.assertEqual(_mask("secret"), "**********")

    def test_provider_endpoints_wrap_service_and_mask_secret(self) -> None:
        admin = SimpleNamespace(id="user-1")
        db = SimpleNamespace()
        with_secret = make_provider("provider-1", api_key="encrypted")
        without_secret = make_provider("provider-2", api_key=None)

        with patch("app.api.v1.endpoints.providers.ProviderService") as provider_service:
            provider_service.return_value.list_for_user.return_value = [with_secret, without_secret]
            provider_service.return_value.create.return_value = with_secret
            provider_service.return_value.update.return_value = without_secret

            listed = list_providers(db, admin)
            created = create_provider(SimpleNamespace(name="Primary"), db, admin)
            updated = update_provider("provider-2", SimpleNamespace(name="Renamed"), db, admin)
            deleted = delete_provider("provider-2", db, admin)

        self.assertEqual([item.masked_secret for item in listed], ["**********", None])
        self.assertEqual(created.masked_secret, "**********")
        self.assertIsNone(updated.masked_secret)
        provider_service.return_value.delete.assert_called_once_with("user-1", "provider-2")
        self.assertEqual(deleted.status_code, 204)
