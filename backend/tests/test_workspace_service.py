import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.services.workspace_service import WorkspaceService


class QueryStub:
    def __init__(self, count_result: int) -> None:
        self.count_result = count_result

    def count(self) -> int:
        return self.count_result

    def filter(self, *_args, **_kwargs) -> "QueryStub":
        return self


class WorkspaceServiceTests(unittest.TestCase):
    def test_get_or_create_returns_existing_workspace(self) -> None:
        workspace = SimpleNamespace(id="workspace-1")
        db = SimpleNamespace(query=lambda _model: SimpleNamespace(first=lambda: workspace))

        service = WorkspaceService(db)

        self.assertIs(service.get_or_create(), workspace)

    def test_get_or_create_creates_workspace_when_missing(self) -> None:
        added: list[object] = []
        refreshed: list[object] = []
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(first=lambda: None),
            add=lambda item: added.append(item),
            commit=lambda: added.append("commit"),
            refresh=lambda item: refreshed.append(item),
        )

        service = WorkspaceService(db)
        workspace = service.get_or_create()

        self.assertEqual(len(added), 2)
        self.assertEqual(added[1], "commit")
        self.assertEqual(refreshed, [workspace])

    def test_get_summary_uses_real_total_user_count(self) -> None:
        query_results = iter([QueryStub(3), QueryStub(2), QueryStub(1), QueryStub(4)])
        db = SimpleNamespace(query=lambda _model: next(query_results))
        actor = SimpleNamespace(id="user-1", is_superuser=True)
        workspace = SimpleNamespace(
            id="workspace-1",
            name="Olanma",
            authentication_enabled=True,
            docs_enabled=False,
            public_registration_enabled=True,
            vision_aware=False,
            created_at="2026-06-12T00:00:00Z",
            updated_at="2026-06-12T00:00:00Z",
        )
        service = WorkspaceService(db)
        service.get_or_create = lambda: workspace

        summary = service.get_summary(actor)

        self.assertEqual(summary.total_users, 3)
        self.assertFalse(summary.first_user_registration_required)
        self.assertEqual(summary.total_providers, 2)
        self.assertEqual(summary.pending_jobs, 1)
        self.assertEqual(summary.completed_jobs, 4)

    def test_get_public_settings_marks_first_registration_when_no_users_exist(self) -> None:
        db = SimpleNamespace(query=lambda _model: QueryStub(0))
        workspace = SimpleNamespace(
            name="Olanma",
            authentication_enabled=True,
            docs_enabled=True,
            public_registration_enabled=False,
        )
        service = WorkspaceService(db)
        service.get_or_create = lambda: workspace

        public_settings = service.get_public_settings()

        self.assertTrue(public_settings.first_user_registration_required)
        self.assertTrue(public_settings.docs_enabled)

    def test_update_rejects_non_superusers(self) -> None:
        service = WorkspaceService(SimpleNamespace())

        with self.assertRaises(HTTPException) as context:
            service.update(
                SimpleNamespace(is_superuser=False),
                SimpleNamespace(model_dump=lambda **_kwargs: {"docs_enabled": False}),
            )

        self.assertEqual(context.exception.status_code, 403)

    def test_update_applies_changes_and_returns_summary(self) -> None:
        actor = SimpleNamespace(id="user-1", is_superuser=True)
        workspace = SimpleNamespace(docs_enabled=True, public_registration_enabled=True)
        added: list[object] = []
        refreshed: list[object] = []
        db = SimpleNamespace(
            add=lambda item: added.append(item),
            commit=lambda: added.append("commit"),
            refresh=lambda item: refreshed.append(item),
        )
        service = WorkspaceService(db)
        service.get_or_create = lambda: workspace
        service.get_summary = lambda current_actor: ("summary", current_actor.id)

        result = service.update(
            actor,
            SimpleNamespace(model_dump=lambda **_kwargs: {"docs_enabled": False}),
        )

        self.assertEqual(workspace.docs_enabled, False)
        self.assertEqual(result, ("summary", "user-1"))
        self.assertEqual(refreshed, [workspace])

    def test_list_models_builds_responses_for_owner(self) -> None:
        actor = SimpleNamespace(id="user-1", is_superuser=False)
        model = SimpleNamespace(id="model-1")
        provider = SimpleNamespace(id="provider-1")
        query = SimpleNamespace(
            join=lambda *_args, **_kwargs: query,
            filter=lambda *_args, **_kwargs: query,
            order_by=lambda *_args, **_kwargs: query,
            all=lambda: [(model, provider)],
        )
        db = SimpleNamespace(query=lambda *_args, **_kwargs: query)
        service = WorkspaceService(db)

        with patch("app.services.workspace_service.build_model_response", return_value="response") as builder:
            responses = service.list_models(actor)

        self.assertEqual(responses, ["response"])
        builder.assert_called_once_with(model, provider)

    def test_update_model_visibility_updates_default_and_availability(self) -> None:
        actor = SimpleNamespace(id="user-1", is_superuser=False)
        model_a = SimpleNamespace(id="model-a", is_default=True, is_available=True)
        model_b = SimpleNamespace(id="model-b", is_default=False, is_available=False)
        added: list[object] = []
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                join=lambda *_args, **_kwargs: SimpleNamespace(
                    filter=lambda *_args, **_kwargs: SimpleNamespace(all=lambda: [model_a, model_b])
                )
            ),
            add=lambda item: added.append(item),
            commit=lambda: added.append("commit"),
        )
        payload = SimpleNamespace(
            enabled_model_ids=["model-b"],
            default_model_id="model-b",
            model_fields_set={"default_model_id"},
        )
        service = WorkspaceService(db)
        service.list_models = lambda current_actor, scope_user=None: ["model-response"]

        responses = service.update_model_visibility(actor, payload)

        self.assertEqual(responses, ["model-response"])
        self.assertFalse(model_a.is_default)
        self.assertFalse(model_a.is_available)
        self.assertTrue(model_b.is_default)
        self.assertTrue(model_b.is_available)

    def test_update_model_visibility_clears_default_when_existing_default_is_disabled(self) -> None:
        actor = SimpleNamespace(id="user-1", is_superuser=False)
        model_a = SimpleNamespace(id="model-a", is_default=True, is_available=True)
        model_b = SimpleNamespace(id="model-b", is_default=False, is_available=True)
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                join=lambda *_args, **_kwargs: SimpleNamespace(
                    filter=lambda *_args, **_kwargs: SimpleNamespace(all=lambda: [model_a, model_b])
                )
            ),
            add=lambda _item: None,
            commit=lambda: None,
        )
        payload = SimpleNamespace(
            enabled_model_ids=["model-b"],
            default_model_id=None,
            model_fields_set=set(),
        )
        service = WorkspaceService(db)
        service.list_models = lambda current_actor, scope_user=None: []

        service.update_model_visibility(actor, payload)

        self.assertFalse(model_a.is_default)
        self.assertTrue(model_b.is_available)

    def test_update_model_visibility_keeps_default_when_it_remains_enabled(self) -> None:
        actor = SimpleNamespace(id="user-1", is_superuser=False)
        model_a = SimpleNamespace(id="model-a", is_default=True, is_available=True)
        model_b = SimpleNamespace(id="model-b", is_default=False, is_available=True)
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                join=lambda *_args, **_kwargs: SimpleNamespace(
                    filter=lambda *_args, **_kwargs: SimpleNamespace(all=lambda: [model_a, model_b])
                )
            ),
            add=lambda _item: None,
            commit=lambda: None,
        )
        payload = SimpleNamespace(
            enabled_model_ids=["model-a", "model-b"],
            default_model_id=None,
            model_fields_set=set(),
        )
        service = WorkspaceService(db)
        service.list_models = lambda current_actor, scope_user=None: []

        service.update_model_visibility(actor, payload)

        self.assertTrue(model_a.is_default)
        self.assertTrue(model_b.is_available)


if __name__ == "__main__":
    unittest.main()
