import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api.v1.endpoints.models import list_models


class QueryStub:
    def __init__(self, rows: list[tuple[object, object]]) -> None:
        self.rows = rows
        self.filters: list[tuple[object, ...]] = []

    def join(self, *_args, **_kwargs) -> "QueryStub":
        return self

    def filter(self, *conditions: object) -> "QueryStub":
        self.filters.append(conditions)
        return self

    def order_by(self, *_args, **_kwargs) -> "QueryStub":
        return self

    def all(self) -> list[tuple[object, object]]:
        return self.rows


class ModelsEndpointTests(unittest.TestCase):
    def test_list_models_scopes_to_current_user(self) -> None:
        model = SimpleNamespace(model_key="gpt-4o", display_name="GPT-4o", is_default=True, __dict__={})
        provider = SimpleNamespace(name="Primary", provider_type="openai")
        query = QueryStub([(model, provider)])
        db = SimpleNamespace(query=lambda *_args: query)
        actor = SimpleNamespace(id="user-1")

        with patch(
            "app.api.v1.endpoints.models.build_model_response",
            return_value="model-response",
        ) as build_response:
            result = list_models(db, actor)

        self.assertEqual(result, ["model-response"])
        build_response.assert_called_once_with(model, provider)
        self.assertEqual(len(query.filters), 2)

    def test_list_models_keeps_public_actor_scoped_to_public_models(self) -> None:
        model = SimpleNamespace(model_key="gpt-4o", display_name="GPT-4o", is_default=True, __dict__={})
        provider = SimpleNamespace(name="Primary", provider_type="openai")
        query = QueryStub([(model, provider)])
        db = SimpleNamespace(query=lambda *_args: query)
        actor = SimpleNamespace(id="workspace-public")

        with patch(
            "app.api.v1.endpoints.models.build_model_response",
            return_value="model-response",
        ):
            result = list_models(db, actor)

        self.assertEqual(result, ["model-response"])
        self.assertEqual(len(query.filters), 2)


if __name__ == "__main__":
    unittest.main()
