import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.chat_service import ChatService


class ChatServiceTests(unittest.TestCase):
    def test_serialize_messages_includes_attachment_context_for_user_messages(self) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace()
        service._build_attachment_context = lambda user_id, metadata: "Image attachment: chart.png\nExtracted text:\nRevenue 42"  # type: ignore[method-assign]
        service._build_image_parts = lambda user_id, metadata, model: []  # type: ignore[method-assign]

        message = SimpleNamespace(
            role="user",
            content="What does this image say?",
            meta={"attachments": [{"id": "doc-1", "kind": "document", "name": "chart.png"}]},
        )
        model = SimpleNamespace(capabilities={})

        serialized = service._serialize_messages("user-1", [message], model)

        self.assertEqual(len(serialized), 1)
        self.assertEqual(serialized[0]["role"], "user")
        self.assertIn("What does this image say?", serialized[0]["content"])
        self.assertIn("Image attachment: chart.png", serialized[0]["content"])

    def test_serialize_messages_leaves_assistant_messages_unchanged(self) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace()

        message = SimpleNamespace(
            role="assistant",
            content="Here is the answer.",
            meta={"attachments": [{"id": "doc-1", "kind": "document", "name": "chart.png"}]},
        )
        model = SimpleNamespace(capabilities={})

        serialized = service._serialize_messages("user-1", [message], model)

        self.assertEqual(serialized, [{"role": "assistant", "content": "Here is the answer."}])

    def test_serialize_messages_adds_image_parts_for_vision_models(self) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace()
        service._build_attachment_context = lambda user_id, metadata: ""  # type: ignore[method-assign]
        service._build_image_parts = lambda user_id, metadata, model: [  # type: ignore[method-assign]
            {"type": "image", "mime_type": "image/png", "data": "encoded-image"}
        ]

        message = SimpleNamespace(
            role="user",
            content="What does this chart show?",
            meta={"attachments": [{"id": "doc-1", "kind": "document", "name": "chart.png"}]},
        )
        model = SimpleNamespace(capabilities={"vision": True})

        serialized = service._serialize_messages("user-1", [message], model)

        self.assertEqual(serialized[0]["role"], "user")
        self.assertIsInstance(serialized[0]["content"], list)
        self.assertEqual(serialized[0]["content"][0]["type"], "text")
        self.assertEqual(serialized[0]["content"][1]["type"], "image")

    def test_resolve_chat_model_and_provider_prefers_same_provider_vision_model_when_enabled(self) -> None:
        service = object.__new__(ChatService)
        base_model = SimpleNamespace(id="model-1", provider_id="provider-1", capabilities={"vision": False})
        vision_model = SimpleNamespace(id="model-2", provider_id="provider-1", capabilities={"vision": True})
        provider = SimpleNamespace(id="provider-1")
        service.llm = SimpleNamespace(resolve_model_and_provider=lambda user_id, model_id: (base_model, provider))
        service._find_same_provider_vision_model = lambda provider_id: vision_model  # type: ignore[method-assign]
        service._should_auto_use_vision_model = lambda metadata, model: True  # type: ignore[method-assign]

        resolved_model, resolved_provider = service._resolve_chat_model_and_provider(
            "user-1",
            "model-1",
            {"attachments": [{"id": "doc-1", "kind": "document"}]},
        )

        self.assertIs(resolved_model, vision_model)
        self.assertIs(resolved_provider, provider)

    def test_should_auto_use_vision_model_respects_workspace_toggle(self) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace()
        model = SimpleNamespace(capabilities={"vision": False})

        with (
            patch("app.services.chat_service.WorkspaceService") as workspace_service,
            patch.object(service, "_has_image_attachment", return_value=True),
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(vision_aware=False)
            should_auto = service._should_auto_use_vision_model({"attachments": [{"id": "doc-1"}]}, model)

        self.assertFalse(should_auto)

    def test_collect_rag_source_filters_aggregates_attachments_across_messages(self) -> None:
        service = object.__new__(ChatService)

        messages = [
            SimpleNamespace(meta={"attachments": [{"id": "doc-1", "kind": "document"}]}),
            SimpleNamespace(meta={"attachments": [{"id": "audio-1", "kind": "audio"}]}),
            SimpleNamespace(meta={"attachments": [{"id": "doc-1", "kind": "document"}, {"id": "video-1", "kind": "video"}]}),
            SimpleNamespace(meta={"attachments": [{"id": 42, "kind": "document"}, {"id": "bad-1", "kind": "unknown"}]}),
        ]

        source_filters = service._collect_rag_source_filters(messages)

        self.assertEqual(
            source_filters,
            {
                "document": {"doc-1"},
                "audio": {"audio-1"},
                "video": {"video-1"},
            },
        )
