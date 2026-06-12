import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.auth_service import AuthService


def make_auth_service(user: object | None) -> AuthService:
    service = object.__new__(AuthService)
    service.db = SimpleNamespace()
    service.users = SimpleNamespace(get_by_email=lambda email: user, get=lambda user_id: user)
    return service


class AuthServiceTests(unittest.TestCase):
    def test_request_password_reset_rejects_unconfigured_production(self) -> None:
        user = SimpleNamespace(id="user-1", email="person@example.com")
        service = make_auth_service(user)

        with patch("app.services.auth_service.app_settings", SimpleNamespace(is_production=True)):
            with self.assertRaises(HTTPException) as context:
                service.request_password_reset("person@example.com")

        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(
            context.exception.detail,
            "Password reset is not configured for this deployment.",
        )

    def test_request_password_reset_never_returns_token(self) -> None:
        user = SimpleNamespace(id="user-1", email="person@example.com")
        service = make_auth_service(user)

        with (
            patch("app.services.auth_service.app_settings", SimpleNamespace(is_production=False)),
            patch("app.services.auth_service.create_password_reset_token", return_value="reset-token"),
        ):
            response = service.request_password_reset("person@example.com")

        self.assertEqual(
            response,
            {"message": "If the account exists, password reset instructions have been sent."},
        )
        self.assertNotIn("reset_token", response)

    def test_confirm_password_reset_rejects_non_reset_tokens(self) -> None:
        user = SimpleNamespace(id="user-1", hashed_password="old-hash")
        service = make_auth_service(user)
        service.db = SimpleNamespace(add=lambda item: None, commit=lambda: None)

        with patch("app.services.auth_service.decode_token", side_effect=ValueError("bad token type")):
            with self.assertRaises(HTTPException) as context:
                service.confirm_password_reset(SimpleNamespace(token="access-token", new_password="new-password-123"))

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail, "Invalid reset token")
