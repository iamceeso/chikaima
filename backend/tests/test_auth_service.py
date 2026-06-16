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
    def test_register_promotes_first_user_to_admin(self) -> None:
        service = object.__new__(AuthService)
        committed: list[str] = []
        refreshed: list[object] = []
        service.users = SimpleNamespace(get_by_email=lambda email: None, count=lambda: 0)
        service.db = SimpleNamespace(
            add_all=lambda items: None,
            commit=lambda: committed.append("commit"),
            refresh=lambda user: refreshed.append(user),
        )

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch("app.services.auth_service.hash_password", return_value="hashed-password"),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(public_registration_enabled=True)
            user = service.register(SimpleNamespace(email="first@example.com", full_name="First User", password="password123"))

        self.assertTrue(user.is_superuser)
        self.assertEqual(user.hashed_password, "hashed-password")
        self.assertEqual(committed, ["commit"])
        self.assertEqual(refreshed, [user])

    def test_register_rejects_when_public_registration_is_disabled(self) -> None:
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(get_by_email=lambda email: None, count=lambda: 2)
        service.db = SimpleNamespace()

        with patch("app.services.auth_service.WorkspaceService") as workspace_service:
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(public_registration_enabled=False)
            with self.assertRaises(HTTPException) as context:
                service.register(SimpleNamespace(email="user@example.com", full_name="User", password="password123"))

        self.assertEqual(context.exception.status_code, 403)

    def test_create_user_rejects_non_admin_actor(self) -> None:
        service = object.__new__(AuthService)

        with self.assertRaises(HTTPException) as context:
            service.create_user(SimpleNamespace(is_superuser=False), SimpleNamespace())

        self.assertEqual(context.exception.status_code, 403)

    def test_update_user_prevents_demoting_last_admin(self) -> None:
        user = SimpleNamespace(id="user-1", email="admin@example.com", is_superuser=True, is_active=True)
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(get=lambda user_id: user, get_by_email=lambda email: None, count_superusers=lambda: 1)

        with self.assertRaises(HTTPException) as context:
            service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-1",
                SimpleNamespace(model_dump=lambda exclude_unset=True: {"is_superuser": False}),
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("last admin", context.exception.detail)

    def test_login_rejects_invalid_credentials(self) -> None:
        user = SimpleNamespace(id="user-1", hashed_password="hashed")
        service = make_auth_service(user)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch("app.services.auth_service.verify_password", return_value=False),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=True)
            with self.assertRaises(HTTPException) as context:
                service.login(SimpleNamespace(email="person@example.com", password="bad-password"))

        self.assertEqual(context.exception.status_code, 401)

    def test_refresh_returns_new_access_token(self) -> None:
        service = make_auth_service(None)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch("app.services.auth_service.decode_token", return_value={"sub": "user-1"}),
            patch("app.services.auth_service.create_access_token", return_value="new-access-token"),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=True)
            token = service.refresh("refresh-token")

        self.assertEqual(token, "new-access-token")

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
