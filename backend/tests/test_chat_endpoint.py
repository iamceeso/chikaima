import asyncio
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api.v1.endpoints.chat import (
    add_message,
    create_conversation,
    delete_conversation,
    edit_message,
    list_conversations,
    regenerate_message,
    stream_chat,
)


def make_message(message_id: str, conversation_id: str, role: str, content: str) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=message_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        status="completed",
        meta={},
        created_at=now,
        updated_at=now,
    )


def make_conversation(conversation_id: str, user_id: str) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=conversation_id,
        user_id=user_id,
        title="Chat",
        folder=None,
        model_id="model-1",
        messages=[],
        created_at=now,
        updated_at=now,
    )


async def collect_streaming_response(response) -> str:
    chunks: list[str] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else str(chunk))
    return "".join(chunks)


class ChatEndpointTests(unittest.TestCase):
    def test_conversation_endpoints_validate_service_results(self) -> None:
        db = SimpleNamespace()
        current_user = SimpleNamespace(id="user-1")
        conversation = make_conversation("conv-1", "user-1")
        user_message = make_message("msg-1", "conv-1", "user", "Hello")
        conversation.messages = [user_message]

        with patch("app.api.v1.endpoints.chat.ChatService") as chat_service:
            chat_service.return_value.list_conversations.return_value = [conversation]
            chat_service.return_value.create_conversation.return_value = conversation
            chat_service.return_value.add_message.return_value = user_message
            chat_service.return_value.update_message.return_value = user_message
            chat_service.return_value.regenerate_message.return_value = user_message

            conversations = list_conversations(db, current_user)
            created = create_conversation(SimpleNamespace(title="Chat"), db, current_user)
            added = add_message("conv-1", SimpleNamespace(role="user", content="Hello"), db, current_user)
            edited = edit_message("msg-1", SimpleNamespace(content="Updated"), db, current_user)
            regenerated = regenerate_message(SimpleNamespace(message_id="msg-1"), db, current_user)
            delete_conversation("conv-1", db, current_user)

        self.assertEqual(conversations[0].id, "conv-1")
        self.assertEqual(created.id, "conv-1")
        self.assertEqual(added.id, "msg-1")
        self.assertEqual(edited.content, "Hello")
        self.assertEqual(regenerated.id, "msg-1")
        chat_service.return_value.delete_conversation.assert_called_once_with("user-1", "conv-1")

    def test_stream_chat_rejects_missing_existing_conversation(self) -> None:
        db = SimpleNamespace()
        current_user = SimpleNamespace(id="user-1")
        service = SimpleNamespace(conversations=SimpleNamespace(get=lambda conversation_id: None))

        with patch("app.api.v1.endpoints.chat.ChatService", return_value=service):
            with self.assertRaises(HTTPException) as context:
                stream_chat(
                    SimpleNamespace(conversation_id="missing", model_id=None, metadata={}, content="Hi", title=None, use_rag=True),
                    db,
                    current_user,
                )

        self.assertEqual(context.exception.status_code, 404)

    def test_stream_chat_returns_pending_notice_stream_for_new_conversation(self) -> None:
        db = SimpleNamespace(
            add=lambda _item: None,
            flush=lambda: None,
            commit=lambda: None,
            refresh=lambda _item: None,
            rollback=lambda: None,
        )
        current_user = SimpleNamespace(id="user-1")
        conversation = make_conversation("conv-1", "user-1")
        service = SimpleNamespace(
            conversations=SimpleNamespace(get=lambda conversation_id: None),
            llm=SimpleNamespace(resolve_model_and_provider=lambda user_id, model_id: (SimpleNamespace(id="model-1"), None)),
            _resolve_chat_model_and_provider=lambda *args, **kwargs: (SimpleNamespace(model_key="gpt-4o-mini"), SimpleNamespace(provider_type="openai")),
            _build_pending_attachment_notice=lambda *args, **kwargs: "Still processing",
            _serialize_messages=lambda *args, **kwargs: [],
            _collect_rag_source_filters=lambda *args, **kwargs: {},
        )

        with patch("app.api.v1.endpoints.chat.ChatService", return_value=service), patch(
            "app.api.v1.endpoints.chat.Conversation",
            return_value=conversation,
        ), patch(
            "app.api.v1.endpoints.chat.Message",
            side_effect=lambda **kwargs: SimpleNamespace(
                id="msg-1",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
                status="completed",
                **kwargs,
            ),
        ):
            response = stream_chat(
                SimpleNamespace(conversation_id=None, model_id=None, metadata={}, content="Hi", title="Chat", use_rag=True),
                db,
                current_user,
            )
            body = asyncio.run(collect_streaming_response(response))

        self.assertEqual(response.media_type, "text/event-stream")
        self.assertIn("event: metadata", body)
        self.assertIn("Still processing", body)
        self.assertIn("event: done", body)
