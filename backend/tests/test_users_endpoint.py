import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api.v1.endpoints.users import (
    _require_superuser,
    create_user,
    delete_user,
    get_profile,
    list_users,
    update_profile,
    update_user,
)


def make_user(user_id: str, *, is_superuser: bool) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=user_id,
        email=f"{user_id}@example.com",
        full_name=f"User {user_id}",
        is_active=True,
        is_superuser=is_superuser,
        created_at=now,
        updated_at=now,
    )


class UsersEndpointTests(unittest.TestCase):
    def test_require_superuser_rejects_non_admins(self) -> None:
        with self.assertRaises(HTTPException) as context:
            _require_superuser(make_user("user-1", is_superuser=False))

        self.assertEqual(context.exception.status_code, 403)

    def test_get_profile_returns_current_user(self) -> None:
        profile = get_profile(make_user("user-1", is_superuser=False))

        self.assertEqual(profile.email, "user-1@example.com")

    def test_update_profile_persists_name_change(self) -> None:
        user = make_user("user-1", is_superuser=False)
        commits: list[str] = []
        db = SimpleNamespace(add=lambda _item: None, commit=lambda: commits.append("commit"), refresh=lambda _item: None)

        response = update_profile(SimpleNamespace(full_name="Updated Name"), db, user)

        self.assertEqual(user.full_name, "Updated Name")
        self.assertEqual(response.full_name, "Updated Name")
        self.assertEqual(commits, ["commit"])

    def test_list_users_returns_validated_rows(self) -> None:
        admin = make_user("admin", is_superuser=True)
        users = [make_user("user-1", is_superuser=False)]
        db = SimpleNamespace()

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.users.list_all.return_value = users
            response = list_users(db, admin)

        self.assertEqual(len(response), 1)
        self.assertEqual(response[0].email, "user-1@example.com")

    def test_create_user_delegates_to_auth_service(self) -> None:
        admin = make_user("admin", is_superuser=True)
        created = make_user("new-user", is_superuser=False)
        db = SimpleNamespace()
        payload = SimpleNamespace(email="new@example.com")

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.create_user.return_value = created
            response = create_user(payload, db, admin)

        self.assertEqual(response.email, "new-user@example.com")

    def test_delete_user_rejects_missing_target(self) -> None:
        admin = make_user("admin", is_superuser=True)
        db = SimpleNamespace()

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.users.get.return_value = None
            with self.assertRaises(HTTPException) as context:
                delete_user("missing", db, admin)

        self.assertEqual(context.exception.status_code, 404)

    def test_delete_user_rejects_self_delete_and_last_admin_delete(self) -> None:
        admin = make_user("admin", is_superuser=True)
        db = SimpleNamespace()

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.users.get.return_value = admin
            with self.assertRaises(HTTPException) as self_context:
                delete_user("admin", db, admin)
            self.assertEqual(self_context.exception.status_code, 400)

            target = make_user("target", is_superuser=True)
            auth_service.return_value.users.get.return_value = target
            auth_service.return_value.users.count_superusers.return_value = 1
            with self.assertRaises(HTTPException) as admin_context:
                delete_user("target", db, admin)

        self.assertEqual(admin_context.exception.status_code, 400)

    def test_delete_user_deletes_target_and_returns_204(self) -> None:
        admin = make_user("admin", is_superuser=True)
        target = make_user("target", is_superuser=False)
        deleted: list[str] = []
        commits: list[str] = []
        db = SimpleNamespace(delete=lambda item: deleted.append(item.id), commit=lambda: commits.append("commit"))

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.users.get.return_value = target
            response = delete_user("target", db, admin)

        self.assertEqual(response.status_code, 204)
        self.assertEqual(deleted, ["target"])
        self.assertEqual(commits, ["commit"])

    def test_update_user_delegates_to_auth_service(self) -> None:
        admin = make_user("admin", is_superuser=True)
        updated = make_user("target", is_superuser=False)
        db = SimpleNamespace()

        with patch("app.api.v1.endpoints.users.AuthService") as auth_service:
            auth_service.return_value.update_user.return_value = updated
            response = update_user("target", SimpleNamespace(full_name="Updated"), db, admin)

        self.assertEqual(response.email, "target@example.com")
