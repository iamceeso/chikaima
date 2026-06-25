import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api.deps.auth import (
    PUBLIC_WORKSPACE_EMAIL,
    PUBLIC_WORKSPACE_NAME,
    _get_or_create_public_actor,
    get_current_admin_user,
    get_current_user,
)


class AuthDependencyTests(unittest.TestCase):
    def test_get_current_user_uses_existing_public_actor_when_auth_is_disabled(self) -> None:
        public_user = SimpleNamespace(email=PUBLIC_WORKSPACE_EMAIL, full_name=PUBLIC_WORKSPACE_NAME, is_superuser=False)
        db = SimpleNamespace()

        with (
            patch("app.api.deps.auth.WorkspaceService") as workspace_service,
            patch("app.api.deps.auth.UserRepository") as user_repository,
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=False)
            user_repository.return_value.get_by_email.return_value = public_user

            resolved_user = get_current_user(db, None)

        self.assertIs(resolved_user, public_user)

    def test_get_or_create_public_actor_creates_reserved_workspace_user(self) -> None:
        added_items: list[object] = []
        refreshed: list[object] = []
        db = SimpleNamespace(
            add=lambda item: added_items.append(item),
            commit=lambda: None,
            refresh=lambda item: refreshed.append(item),
        )
        users = SimpleNamespace(get_by_email=lambda email: None)

        public_user = _get_or_create_public_actor(db, users)

        self.assertEqual(public_user.email, PUBLIC_WORKSPACE_EMAIL)
        self.assertEqual(public_user.full_name, PUBLIC_WORKSPACE_NAME)
        self.assertFalse(public_user.is_superuser)
        self.assertTrue(public_user.is_active)
        self.assertEqual(len(added_items), 2)
        self.assertEqual(refreshed, [public_user])

    def test_get_current_admin_user_requires_basic_auth_when_workspace_auth_is_disabled(self) -> None:
        db = SimpleNamespace()

        with (
            patch("app.api.deps.auth.WorkspaceService") as workspace_service,
            patch("app.api.deps.auth.UserRepository"),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=False)

            with self.assertRaises(Exception) as context:
                get_current_admin_user(db, None)

        self.assertEqual(context.exception.status_code, 401)
        self.assertEqual(context.exception.detail, "Administrator credentials required")
        self.assertIsNone(context.exception.headers)

    def test_get_current_admin_user_accepts_basic_auth_for_active_superuser(self) -> None:
        db = SimpleNamespace()
        admin_user = SimpleNamespace(
            email="admin@example.com",
            full_name="Admin",
            is_superuser=True,
            is_active=True,
            hashed_password="hashed-password",
        )

        with (
            patch("app.api.deps.auth.WorkspaceService") as workspace_service,
            patch("app.api.deps.auth.UserRepository") as user_repository,
            patch("app.api.deps.auth.verify_password", return_value=True),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(authentication_enabled=False)
            user_repository.return_value.get_by_email.return_value = admin_user

            resolved_user = get_current_admin_user(db, "Basic YWRtaW5AZXhhbXBsZS5jb206c2VjcmV0LXBhc3M=")

        self.assertIs(resolved_user, admin_user)


if __name__ == "__main__":
    unittest.main()
