import unittest
from types import SimpleNamespace

from app.services.workspace_service import WorkspaceService


class QueryStub:
    def __init__(self, count_result: int) -> None:
        self.count_result = count_result

    def count(self) -> int:
        return self.count_result

    def filter(self, *_args, **_kwargs) -> "QueryStub":
        return self


class WorkspaceServiceTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
