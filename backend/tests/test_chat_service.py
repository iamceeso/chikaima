import unittest
from types import SimpleNamespace

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
