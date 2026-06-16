import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.auth_service import AuthService


def make_auth_service(user: object | None) -> AuthService:
    service = object.__new__(AuthService)
    service.db = SimpleNamespace()
    service.users = SimpleNamespace(
        get_by_email=lambda email: user, get=lambda user_id: user
    )
    return service


class AuthServiceTests(unittest.TestCase):
    def test_init_builds_user_repository(self) -> None:
        db = SimpleNamespace()

        with patch(
            "app.services.auth_service.UserRepository", return_value="repo"
        ) as repository:
            service = AuthService(db)

        self.assertIs(service.db, db)
        self.assertEqual(service.users, "repo")
        repository.assert_called_once_with(db)

    def test_register_rejects_duplicate_email(self) -> None:
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(get_by_email=lambda email: object())
        service.db = SimpleNamespace()

        with self.assertRaises(HTTPException) as context:
            service.register(
                SimpleNamespace(
                    email="taken@example.com", full_name="Taken", password="password123"
                )
            )

        self.assertEqual(context.exception.status_code, 400)

    def test_register_promotes_first_user_to_admin(self) -> None:
        service = object.__new__(AuthService)
        committed: list[str] = []
        refreshed: list[object] = []
        service.users = SimpleNamespace(
            get_by_email=lambda email: None, count=lambda: 0
        )
        service.db = SimpleNamespace(
            add_all=lambda items: None,
            commit=lambda: committed.append("commit"),
            refresh=lambda user: refreshed.append(user),
        )

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch(
                "app.services.auth_service.hash_password",
                return_value="hashed-password",
            ),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                public_registration_enabled=True
            )
            user = service.register(
                SimpleNamespace(
                    email="first@example.com",
                    full_name="First User",
                    password="password123",
                )
            )

        self.assertTrue(user.is_superuser)
        self.assertEqual(user.hashed_password, "hashed-password")
        self.assertEqual(committed, ["commit"])
        self.assertEqual(refreshed, [user])

    def test_register_rejects_when_public_registration_is_disabled(self) -> None:
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(
            get_by_email=lambda email: None, count=lambda: 2
        )
        service.db = SimpleNamespace()

        with patch("app.services.auth_service.WorkspaceService") as workspace_service:
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                public_registration_enabled=False
            )
            with self.assertRaises(HTTPException) as context:
                service.register(
                    SimpleNamespace(
                        email="user@example.com",
                        full_name="User",
                        password="password123",
                    )
                )

        self.assertEqual(context.exception.status_code, 403)

    def test_create_user_rejects_duplicate_email(self) -> None:
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(get_by_email=lambda email: object())

        with self.assertRaises(HTTPException) as context:
            service.create_user(
                SimpleNamespace(is_superuser=True),
                SimpleNamespace(
                    email="taken@example.com",
                    full_name="Taken",
                    password="password123",
                    is_superuser=False,
                    is_active=True,
                ),
            )

        self.assertEqual(context.exception.status_code, 400)

    def test_create_user_persists_new_user(self) -> None:
        commits: list[str] = []
        refreshed: list[object] = []
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(get_by_email=lambda email: None)
        service.db = SimpleNamespace(
            add_all=lambda _items: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda user: refreshed.append(user),
        )

        with patch(
            "app.services.auth_service.hash_password", return_value="hashed-password"
        ):
            user = service.create_user(
                SimpleNamespace(is_superuser=True),
                SimpleNamespace(
                    email="new@example.com",
                    full_name="New User",
                    password="password123",
                    is_superuser=False,
                    is_active=True,
                ),
            )

        self.assertEqual(user.email, "new@example.com")
        self.assertEqual(user.hashed_password, "hashed-password")
        self.assertEqual(commits, ["commit"])
        self.assertEqual(refreshed, [user])

    def test_create_user_rejects_non_admin_actor(self) -> None:
        service = object.__new__(AuthService)

        with self.assertRaises(HTTPException) as context:
            service.create_user(SimpleNamespace(is_superuser=False), SimpleNamespace())

        self.assertEqual(context.exception.status_code, 403)

    def test_update_user_rejects_non_admin_missing_user_and_duplicate_email(
        self,
    ) -> None:
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(
            get=lambda user_id: None,
            get_by_email=lambda email: object(),
            count_superusers=lambda: 2,
        )

        with self.assertRaises(HTTPException) as non_admin_context:
            service.update_user(
                SimpleNamespace(is_superuser=False),
                "user-1",
                SimpleNamespace(model_dump=lambda exclude_unset=True: {}),
            )
        self.assertEqual(non_admin_context.exception.status_code, 403)

        with self.assertRaises(HTTPException) as missing_context:
            service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-1",
                SimpleNamespace(model_dump=lambda exclude_unset=True: {}),
            )
        self.assertEqual(missing_context.exception.status_code, 404)

        existing = SimpleNamespace(
            id="user-1", email="old@example.com", is_superuser=False, is_active=True
        )
        service.users = SimpleNamespace(
            get=lambda user_id: existing,
            get_by_email=lambda email: object(),
            count_superusers=lambda: 2,
        )

        with self.assertRaises(HTTPException) as duplicate_context:
            service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-1",
                SimpleNamespace(
                    model_dump=lambda exclude_unset=True: {"email": "taken@example.com"}
                ),
            )

        self.assertEqual(duplicate_context.exception.status_code, 400)

    def test_update_user_prevents_demoting_last_admin(self) -> None:
        user = SimpleNamespace(
            id="user-1", email="admin@example.com", is_superuser=True, is_active=True
        )
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(
            get=lambda user_id: user,
            get_by_email=lambda email: None,
            count_superusers=lambda: 1,
        )

        with self.assertRaises(HTTPException) as context:
            service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-1",
                SimpleNamespace(
                    model_dump=lambda exclude_unset=True: {"is_superuser": False}
                ),
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("last admin", context.exception.detail)

    def test_update_user_prevents_disabling_last_admin_and_applies_updates(
        self,
    ) -> None:
        admin = SimpleNamespace(
            id="user-1",
            email="admin@example.com",
            full_name="Admin",
            hashed_password="old",
            is_superuser=True,
            is_active=True,
        )
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(
            get=lambda user_id: admin,
            get_by_email=lambda email: None,
            count_superusers=lambda: 1,
        )
        service.db = SimpleNamespace(
            add=lambda _item: None, commit=lambda: None, refresh=lambda _item: None
        )

        with self.assertRaises(HTTPException) as inactive_context:
            service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-1",
                SimpleNamespace(
                    model_dump=lambda exclude_unset=True: {"is_active": False}
                ),
            )

        self.assertEqual(inactive_context.exception.status_code, 400)

        user = SimpleNamespace(
            id="user-2",
            email="user@example.com",
            full_name="User",
            hashed_password="old",
            is_superuser=False,
            is_active=True,
        )
        commits: list[str] = []
        refreshed: list[object] = []
        service.users = SimpleNamespace(
            get=lambda user_id: user,
            get_by_email=lambda email: None,
            count_superusers=lambda: 2,
        )
        service.db = SimpleNamespace(
            add=lambda item: refreshed.append(item),
            commit=lambda: commits.append("commit"),
            refresh=lambda item: refreshed.append(("refresh", item)),
        )

        with patch("app.services.auth_service.hash_password", return_value="new-hash"):
            updated = service.update_user(
                SimpleNamespace(is_superuser=True),
                "user-2",
                SimpleNamespace(
                    model_dump=lambda exclude_unset=True: {
                        "email": "new@example.com",
                        "full_name": "Updated User",
                        "password": "password123",
                        "is_superuser": True,
                        "is_active": False,
                    }
                ),
            )

        self.assertEqual(updated.email, "new@example.com")
        self.assertEqual(updated.full_name, "Updated User")
        self.assertEqual(updated.hashed_password, "new-hash")
        self.assertTrue(updated.is_superuser)
        self.assertFalse(updated.is_active)
        self.assertEqual(commits, ["commit"])

    def test_update_user_keeps_existing_fields_when_updates_are_empty(self) -> None:
        user = SimpleNamespace(
            id="user-2",
            email="user@example.com",
            full_name="User",
            hashed_password="old",
            is_superuser=False,
            is_active=True,
        )
        commits: list[str] = []
        refreshed: list[object] = []
        service = object.__new__(AuthService)
        service.users = SimpleNamespace(
            get=lambda user_id: user,
            get_by_email=lambda email: None,
            count_superusers=lambda: 2,
        )
        service.db = SimpleNamespace(
            add=lambda _item: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda item: refreshed.append(item),
        )

        updated = service.update_user(
            SimpleNamespace(is_superuser=True),
            "user-2",
            SimpleNamespace(model_dump=lambda exclude_unset=True: {}),
        )

        self.assertIs(updated, user)
        self.assertEqual(commits, ["commit"])
        self.assertEqual(refreshed, [user])

    def test_login_rejects_invalid_credentials(self) -> None:
        user = SimpleNamespace(id="user-1", hashed_password="hashed")
        service = make_auth_service(user)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch("app.services.auth_service.verify_password", return_value=False),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=True
            )
            with self.assertRaises(HTTPException) as context:
                service.login(
                    SimpleNamespace(email="person@example.com", password="bad-password")
                )

        self.assertEqual(context.exception.status_code, 401)

    def test_login_rejects_when_authentication_disabled_and_returns_tokens_on_success(
        self,
    ) -> None:
        user = SimpleNamespace(id="user-1", hashed_password="hashed")
        service = make_auth_service(user)

        with patch("app.services.auth_service.WorkspaceService") as workspace_service:
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=False
            )
            with self.assertRaises(HTTPException) as disabled_context:
                service.login(
                    SimpleNamespace(email="person@example.com", password="password123")
                )

        self.assertEqual(disabled_context.exception.status_code, 403)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch("app.services.auth_service.verify_password", return_value=True),
            patch(
                "app.services.auth_service.create_access_token",
                return_value="access-token",
            ),
            patch(
                "app.services.auth_service.create_refresh_token",
                return_value="refresh-token",
            ),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=True
            )
            logged_in_user, access_token, refresh_token = service.login(
                SimpleNamespace(email="person@example.com", password="password123")
            )

        self.assertIs(logged_in_user, user)
        self.assertEqual(access_token, "access-token")
        self.assertEqual(refresh_token, "refresh-token")

    def test_refresh_returns_new_access_token(self) -> None:
        service = make_auth_service(None)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch(
                "app.services.auth_service.decode_token", return_value={"sub": "user-1"}
            ),
            patch(
                "app.services.auth_service.create_access_token",
                return_value="new-access-token",
            ),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=True
            )
            token = service.refresh("refresh-token")

        self.assertEqual(token, "new-access-token")

    def test_refresh_rejects_disabled_authentication_and_invalid_tokens(self) -> None:
        service = make_auth_service(None)

        with patch("app.services.auth_service.WorkspaceService") as workspace_service:
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=False
            )
            with self.assertRaises(HTTPException) as disabled_context:
                service.refresh("refresh-token")

        self.assertEqual(disabled_context.exception.status_code, 403)

        with (
            patch("app.services.auth_service.WorkspaceService") as workspace_service,
            patch(
                "app.services.auth_service.decode_token",
                side_effect=ValueError("bad token"),
            ),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                authentication_enabled=True
            )
            with self.assertRaises(HTTPException) as invalid_context:
                service.refresh("refresh-token")

        self.assertEqual(invalid_context.exception.status_code, 401)

    def test_request_password_reset_rejects_unconfigured_production(self) -> None:
        user = SimpleNamespace(id="user-1", email="person@example.com")
        service = make_auth_service(user)

        with patch(
            "app.services.auth_service.app_settings",
            SimpleNamespace(is_production=True),
        ):
            with self.assertRaises(HTTPException) as context:
                service.request_password_reset("person@example.com")

        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(
            context.exception.detail,
            "Password reset is not configured for this deployment.",
        )

    def test_request_password_reset_returns_generic_message_for_missing_user(
        self,
    ) -> None:
        service = make_auth_service(None)

        with patch(
            "app.services.auth_service.app_settings",
            SimpleNamespace(is_production=False),
        ):
            response = service.request_password_reset("missing@example.com")

        self.assertEqual(
            response,
            {
                "message": "If the account exists, password reset instructions have been sent."
            },
        )

    def test_request_password_reset_never_returns_token(self) -> None:
        user = SimpleNamespace(id="user-1", email="person@example.com")
        service = make_auth_service(user)

        with (
            patch(
                "app.services.auth_service.app_settings",
                SimpleNamespace(is_production=False),
            ),
            patch(
                "app.services.auth_service.create_password_reset_token",
                return_value="reset-token",
            ),
        ):
            with self.assertLogs("app.services.auth_service", level="INFO") as logs:
                response = service.request_password_reset("person@example.com")

        self.assertEqual(
            response,
            {
                "message": "If the account exists, password reset instructions have been sent."
            },
        )
        self.assertNotIn("reset_token", response)
        self.assertIn(
            "Password reset token for person@example.com: reset-token", logs.output[0]
        )

    def test_request_password_reset_handles_unreachable_log_branch_without_returning_token(
        self,
    ) -> None:
        user = SimpleNamespace(id="user-1", email="person@example.com")
        service = make_auth_service(user)

        class FlakySettings:
            def __init__(self) -> None:
                self.calls = 0

            @property
            def is_production(self) -> bool:
                self.calls += 1
                return self.calls > 1

        with (
            patch("app.services.auth_service.app_settings", FlakySettings()),
            patch(
                "app.services.auth_service.create_password_reset_token",
                return_value="reset-token",
            ),
        ):
            response = service.request_password_reset("person@example.com")

        self.assertEqual(
            response,
            {
                "message": "If the account exists, password reset instructions have been sent."
            },
        )

    def test_confirm_password_reset_rejects_non_reset_tokens(self) -> None:
        user = SimpleNamespace(id="user-1", hashed_password="old-hash")
        service = make_auth_service(user)
        service.db = SimpleNamespace(add=lambda item: None, commit=lambda: None)

        with patch(
            "app.services.auth_service.decode_token",
            side_effect=ValueError("bad token type"),
        ):
            with self.assertRaises(HTTPException) as context:
                service.confirm_password_reset(
                    SimpleNamespace(
                        token="access-token", new_password="new-password-123"
                    )
                )

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail, "Invalid reset token")

    def test_confirm_password_reset_rejects_missing_user_and_updates_password(
        self,
    ) -> None:
        service = make_auth_service(None)
        service.db = SimpleNamespace(add=lambda item: None, commit=lambda: None)

        with patch(
            "app.services.auth_service.decode_token", return_value={"sub": "user-1"}
        ):
            with self.assertRaises(HTTPException) as missing_context:
                service.confirm_password_reset(
                    SimpleNamespace(
                        token="reset-token", new_password="new-password-123"
                    )
                )

        self.assertEqual(missing_context.exception.status_code, 404)

        user = SimpleNamespace(id="user-1", hashed_password="old-hash")
        added: list[object] = []
        commits: list[str] = []
        service = make_auth_service(user)
        service.db = SimpleNamespace(
            add=lambda item: added.append(item), commit=lambda: commits.append("commit")
        )

        with (
            patch(
                "app.services.auth_service.decode_token", return_value={"sub": "user-1"}
            ),
            patch("app.services.auth_service.hash_password", return_value="new-hash"),
        ):
            response = service.confirm_password_reset(
                SimpleNamespace(token="reset-token", new_password="new-password-123")
            )

        self.assertEqual(response, {"message": "Password updated successfully"})
        self.assertEqual(user.hashed_password, "new-hash")
        self.assertEqual(added, [user])
        self.assertEqual(commits, ["commit"])
