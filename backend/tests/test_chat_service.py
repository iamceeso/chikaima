import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.video import Video
from app.services.chat_service import ChatService


class ChatServiceTests(unittest.TestCase):
    @staticmethod
    def _make_document(resource_id: str, **overrides) -> Document:
        document = Document(
            user_id="user-1",
            name="document",
            file_path="/tmp/document",
            mime_type="application/pdf",
            summary=None,
            status="completed",
        )
        document.id = resource_id
        for key, value in overrides.items():
            setattr(document, key, value)
        return document

    @staticmethod
    def _make_audio(resource_id: str, **overrides) -> AudioAsset:
        audio = AudioAsset(
            user_id="user-1",
            name="audio",
            file_path="/tmp/audio",
            transcript=None,
            status="completed",
        )
        audio.id = resource_id
        for key, value in overrides.items():
            setattr(audio, key, value)
        return audio

    @staticmethod
    def _make_video(resource_id: str, **overrides) -> Video:
        video = Video(
            user_id="user-1",
            name="video",
            file_path="/tmp/video",
            transcript=None,
            summary=None,
            chapters=[],
            action_items=[],
            status="completed",
        )
        video.id = resource_id
        for key, value in overrides.items():
            setattr(video, key, value)
        return video

    def test_build_message_content_returns_base_content_without_attachments(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        service._build_attachment_context = lambda user_id, metadata: ""  # type: ignore[method-assign]
        service._build_image_parts = lambda user_id, metadata, model: []  # type: ignore[method-assign]

        content = service._build_message_content(
            "user-1",
            SimpleNamespace(role="user", content="Hello", meta={}),
            SimpleNamespace(capabilities={}),
        )

        self.assertEqual(content, "Hello")

    def test_build_message_content_adds_vision_notice_when_only_images_exist(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        service._build_attachment_context = lambda user_id, metadata: ""  # type: ignore[method-assign]
        service._build_image_parts = lambda user_id, metadata, model: [  # type: ignore[method-assign]
            {"type": "image", "mime_type": "image/png", "data": "abc"}
        ]

        content = service._build_message_content(
            "user-1",
            SimpleNamespace(role="user", content="Look at this", meta={}),
            SimpleNamespace(capabilities={"vision": True}),
        )

        self.assertIsInstance(content, list)
        self.assertIn("An image is attached", content[0]["text"])

    def test_serialize_messages_includes_attachment_context_for_user_messages(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace()
        service._build_attachment_context = lambda user_id, metadata: "Image attachment: chart.png\nExtracted text:\nRevenue 42"  # type: ignore[method-assign]
        service._build_image_parts = lambda user_id, metadata, model: []  # type: ignore[method-assign]

        message = SimpleNamespace(
            role="user",
            content="What does this image say?",
            meta={
                "attachments": [
                    {"id": "doc-1", "kind": "document", "name": "chart.png"}
                ]
            },
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
            meta={
                "attachments": [
                    {"id": "doc-1", "kind": "document", "name": "chart.png"}
                ]
            },
        )
        model = SimpleNamespace(capabilities={})

        serialized = service._serialize_messages("user-1", [message], model)

        self.assertEqual(
            serialized, [{"role": "assistant", "content": "Here is the answer."}]
        )

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
            meta={
                "attachments": [
                    {"id": "doc-1", "kind": "document", "name": "chart.png"}
                ]
            },
        )
        model = SimpleNamespace(capabilities={"vision": True})

        serialized = service._serialize_messages("user-1", [message], model)

        self.assertEqual(serialized[0]["role"], "user")
        self.assertIsInstance(serialized[0]["content"], list)
        self.assertEqual(serialized[0]["content"][0]["type"], "text")
        self.assertEqual(serialized[0]["content"][1]["type"], "image")

    def test_resolve_chat_model_and_provider_prefers_same_provider_vision_model_when_enabled(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        base_model = SimpleNamespace(
            id="model-1", provider_id="provider-1", capabilities={"vision": False}
        )
        vision_model = SimpleNamespace(
            id="model-2", provider_id="provider-1", capabilities={"vision": True}
        )
        provider = SimpleNamespace(id="provider-1")
        service.llm = SimpleNamespace(
            resolve_model_and_provider=lambda user_id, model_id: (base_model, provider)
        )
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
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(
                vision_aware=False
            )
            should_auto = service._should_auto_use_vision_model(
                {"attachments": [{"id": "doc-1"}]}, model
            )

        self.assertFalse(should_auto)

    def test_has_image_attachment_checks_document_mime_type(self) -> None:
        service = object.__new__(ChatService)
        service.db = SimpleNamespace(
            get=lambda model, resource_id: (
                SimpleNamespace(mime_type="image/png")
                if resource_id == "doc-1"
                else SimpleNamespace(mime_type="application/pdf")
            )
        )

        self.assertTrue(
            service._has_image_attachment(
                {"attachments": [{"id": "doc-1", "kind": "document"}]}
            )
        )
        self.assertFalse(
            service._has_image_attachment(
                {"attachments": [{"id": "doc-2", "kind": "document"}]}
            )
        )
        self.assertFalse(
            service._has_image_attachment(
                {"attachments": [{"id": 1, "kind": "document"}]}
            )
        )

    def test_find_same_provider_vision_model_returns_first_matching_candidate(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        candidates = [
            SimpleNamespace(capabilities={"vision": False}),
            SimpleNamespace(capabilities={"vision": True}),
        ]
        query = SimpleNamespace(
            filter=lambda *_args, **_kwargs: query,
            order_by=lambda *_args, **_kwargs: query,
            all=lambda: candidates,
        )
        service.db = SimpleNamespace(query=lambda _model: query)

        model = service._find_same_provider_vision_model("provider-1")

        self.assertIs(model, candidates[1])

    def test_build_pending_attachment_notice_lists_multiple_pending_resources(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        service._collect_pending_attachments = lambda user_id, messages: [  # type: ignore[method-assign]
            {
                "id": "doc-1",
                "kind": "document",
                "name": "notes.pdf",
                "status": "processing",
            },
            {"id": "audio-1", "kind": "audio", "name": "call.wav", "status": "queued"},
        ]

        notice = service._build_pending_attachment_notice("user-1", [])

        self.assertIn("Some attached files are still processing", notice)
        self.assertIn("notes.pdf", notice)
        self.assertIn("call.wav", notice)

    def test_collect_rag_source_filters_aggregates_attachments_across_messages(
        self,
    ) -> None:
        service = object.__new__(ChatService)

        messages = [
            SimpleNamespace(
                meta={"attachments": [{"id": "doc-1", "kind": "document"}]}
            ),
            SimpleNamespace(meta={"attachments": [{"id": "audio-1", "kind": "audio"}]}),
            SimpleNamespace(
                meta={
                    "attachments": [
                        {"id": "doc-1", "kind": "document"},
                        {"id": "video-1", "kind": "video"},
                    ]
                }
            ),
            SimpleNamespace(
                meta={
                    "attachments": [
                        {"id": 42, "kind": "document"},
                        {"id": "bad-1", "kind": "unknown"},
                    ]
                }
            ),
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

    def test_collect_rag_source_filters_returns_empty_scope_without_attachments(
        self,
    ) -> None:
        service = object.__new__(ChatService)

        source_filters = service._collect_rag_source_filters(
            [SimpleNamespace(meta={}), SimpleNamespace(meta=None)]
        )

        self.assertEqual(source_filters, {})

    def test_collect_pending_attachments_returns_only_incomplete_resources(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        resources = {
            ("Video", "video-1"): SimpleNamespace(
                user_id="user-1", name="walkthrough.mp4", status="processing"
            ),
            ("AudioAsset", "audio-1"): SimpleNamespace(
                user_id="user-1", name="meeting.wav", status="completed"
            ),
            ("Document", "doc-1"): SimpleNamespace(
                user_id="user-2", name="notes.pdf", status="processing"
            ),
        }
        service.db = SimpleNamespace(
            get=lambda model, resource_id: resources.get((model.__name__, resource_id))
        )

        messages = [
            SimpleNamespace(
                meta={
                    "attachments": [
                        {"id": "video-1", "kind": "video"},
                        {"id": "audio-1", "kind": "audio"},
                        {"id": "doc-1", "kind": "document"},
                        {"id": "video-1", "kind": "video"},
                    ]
                }
            )
        ]

        pending = service._collect_pending_attachments("user-1", messages)

        self.assertEqual(
            pending,
            [
                {
                    "id": "video-1",
                    "kind": "video",
                    "name": "walkthrough.mp4",
                    "status": "processing",
                }
            ],
        )

    def test_build_attachment_context_handles_invalid_metadata_and_char_limit(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        service._build_attachment_section = lambda user_id, attachment: "x" * 3000  # type: ignore[method-assign]

        self.assertEqual(service._build_attachment_context("user-1", None), "")
        context = service._build_attachment_context(
            "user-1", {"attachments": [{"id": "doc-1"}]}
        )
        self.assertEqual(len(context), 2500)

    def test_build_image_parts_reads_supported_images_and_skips_missing_files(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "chart.png"
            image_path.write_bytes(b"png-data")
            resources = {
                "doc-1": SimpleNamespace(
                    user_id="user-1", mime_type="image/png", file_path=str(image_path)
                ),
                "doc-2": SimpleNamespace(
                    user_id="user-1",
                    mime_type="image/png",
                    file_path=str(image_path) + ".missing",
                ),
                "doc-3": SimpleNamespace(
                    user_id="user-1",
                    mime_type="application/pdf",
                    file_path=str(image_path),
                ),
            }
            service.db = SimpleNamespace(
                get=lambda model, resource_id: resources.get(resource_id)
            )

            image_parts = service._build_image_parts(
                "user-1",
                {
                    "attachments": [
                        {"id": "doc-1", "kind": "document"},
                        {"id": "doc-2", "kind": "document"},
                        {"id": "doc-3", "kind": "document"},
                    ]
                },
                SimpleNamespace(capabilities={"vision": True}),
            )

        self.assertEqual(len(image_parts), 1)
        self.assertEqual(image_parts[0]["mime_type"], "image/png")

    def test_build_attachment_section_covers_missing_and_processing_resources(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        now = datetime.now(UTC)
        resources = {
            ("document", "doc-1"): self._make_document(
                "doc-1", name="chart.png", mime_type="image/png", status="processing"
            ),
            ("audio", "audio-1"): self._make_audio(
                "audio-1", name="call.wav", status="processing", transcript=""
            ),
            ("video", "video-1"): self._make_video(
                "video-1",
                name="walkthrough.mp4",
                status="processing",
                transcript="",
                summary="",
            ),
        }
        service.db = SimpleNamespace(
            get=lambda model, resource_id: resources.get(
                (model.__name__.replace("Asset", "").lower(), resource_id)
            ),
            query=lambda _model: SimpleNamespace(
                filter=lambda *_args, **_kwargs: SimpleNamespace(
                    order_by=lambda *_a, **_k: SimpleNamespace(
                        first=lambda: SimpleNamespace(content="", created_at=now)
                    )
                )
            ),
        )

        self.assertIn(
            "could not be loaded",
            service._build_attachment_section(
                "user-1", {"id": "missing", "kind": "document", "name": "missing.pdf"}
            ),
        )
        self.assertIn(
            "OCR/analysis may still be processing",
            service._build_attachment_section(
                "user-1", {"id": "doc-1", "kind": "document"}
            ),
        )
        self.assertIn(
            "Transcription may still be processing",
            service._build_attachment_section(
                "user-1", {"id": "audio-1", "kind": "audio"}
            ),
        )
        self.assertIn(
            "Transcription may still be processing",
            service._build_attachment_section(
                "user-1", {"id": "video-1", "kind": "video"}
            ),
        )

    def test_build_attachment_section_covers_completed_resources(self) -> None:
        service = object.__new__(ChatService)
        now = datetime.now(UTC)
        resources = {
            ("document", "doc-image"): self._make_document(
                "doc-image",
                name="chart.png",
                mime_type="image/png",
                status="completed",
                summary=None,
            ),
            ("document", "doc-text"): self._make_document(
                "doc-text",
                name="notes.pdf",
                mime_type="application/pdf",
                status="completed",
                summary="Summary",
            ),
            ("audio", "audio-1"): self._make_audio(
                "audio-1",
                name="call.wav",
                status="completed",
                transcript="",
            ),
            ("video", "video-1"): self._make_video(
                "video-1",
                name="walkthrough.mp4",
                status="completed",
                transcript="",
                summary="Video summary",
            ),
        }
        transcripts = {
            "doc-image": SimpleNamespace(content="Revenue 42", created_at=now),
            "doc-text": SimpleNamespace(content="Transcript text", created_at=now),
            "audio-1": SimpleNamespace(content="Audio transcript", created_at=now),
            "video-1": SimpleNamespace(content="Video transcript", created_at=now),
        }

        def get_resource(model, resource_id):
            kind = model.__name__.replace("Asset", "").lower()
            return resources.get((kind, resource_id))

        def query_transcript(_model):
            class _Query:
                def __init__(self) -> None:
                    self.resource_id = None

                def filter(self, *args, **kwargs):
                    for arg in args:
                        right = getattr(arg, "right", None)
                        value = getattr(right, "value", None)
                        if isinstance(value, str) and value in transcripts:
                            self.resource_id = value
                    return self

                def order_by(self, *_args, **_kwargs):
                    return self

                def first(self):
                    return transcripts.get(self.resource_id)

            return _Query()

        service.db = SimpleNamespace(get=get_resource, query=query_transcript)

        self.assertIn(
            "Extracted text",
            service._build_attachment_section(
                "user-1", {"id": "doc-image", "kind": "document"}
            ),
        )
        self.assertIn(
            "Summary",
            service._build_attachment_section(
                "user-1", {"id": "doc-text", "kind": "document"}
            ),
        )
        self.assertIn(
            "Audio transcript",
            service._build_attachment_section(
                "user-1", {"id": "audio-1", "kind": "audio"}
            ),
        )
        self.assertIn(
            "Video summary",
            service._build_attachment_section(
                "user-1", {"id": "video-1", "kind": "video"}
            ),
        )

    def test_add_message_rejects_missing_conversation_and_non_user_roles(self) -> None:
        service = object.__new__(ChatService)
        service.conversations = SimpleNamespace(get=lambda conversation_id: None)

        with self.assertRaises(HTTPException) as missing_context:
            service.add_message(
                "user-1",
                "conv-1",
                SimpleNamespace(role="user", content="Hi", metadata={}),
            )
        self.assertEqual(missing_context.exception.status_code, 404)

        conversation = SimpleNamespace(
            user_id="user-1", model_id="model-1", messages=[]
        )
        service.conversations = SimpleNamespace(
            get=lambda conversation_id: conversation
        )

        with self.assertRaises(HTTPException) as role_context:
            service.add_message(
                "user-1",
                "conv-1",
                SimpleNamespace(role="assistant", content="Nope", metadata={}),
            )
        self.assertEqual(role_context.exception.status_code, 400)

    def test_create_conversation_uses_pending_notice_when_attachments_are_processing(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        commits: list[str] = []
        service.db = SimpleNamespace(
            add=lambda _item: None,
            flush=lambda: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda _item: None,
            rollback=lambda: commits.append("rollback"),
        )
        model = SimpleNamespace(id="model-1", model_key="gpt-4o-mini")
        provider = SimpleNamespace(provider_type="openai")
        service._resolve_chat_model_and_provider = lambda *args, **kwargs: (model, provider)  # type: ignore[method-assign]
        service._build_pending_attachment_notice = lambda *args, **kwargs: "Still processing"  # type: ignore[method-assign]

        conversation = service.create_conversation(
            "user-1",
            SimpleNamespace(
                title="Chat",
                folder=None,
                model_id="model-1",
                initial_message="Hi",
                initial_metadata={},
            ),
        )

        self.assertEqual(conversation.title, "Chat")
        self.assertEqual(commits, ["commit"])

    def test_add_message_uses_non_rag_reply_path(self) -> None:
        service = object.__new__(ChatService)
        SimpleNamespace(id="message-1")
        conversation = SimpleNamespace(
            user_id="user-1", model_id="model-1", messages=[]
        )
        commits: list[str] = []
        service.conversations = SimpleNamespace(
            get=lambda conversation_id: conversation
        )
        service.db = SimpleNamespace(
            add=lambda _item: None,
            flush=lambda: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda item: None,
            rollback=lambda: commits.append("rollback"),
        )
        model = SimpleNamespace(model_key="gpt-4o-mini")
        provider = SimpleNamespace(provider_type="openai")
        service._resolve_chat_model_and_provider = lambda *args, **kwargs: (model, provider)  # type: ignore[method-assign]
        service._build_pending_attachment_notice = lambda *args, **kwargs: None  # type: ignore[method-assign]
        service._serialize_messages = lambda *args, **kwargs: [{"role": "user", "content": "Hi"}]  # type: ignore[method-assign]
        service.llm = SimpleNamespace(generate_reply=lambda **kwargs: "assistant reply")

        result = service.add_message(
            "user-1",
            "conv-1",
            SimpleNamespace(role="user", content="Hi", metadata={}),
            use_rag=False,
        )

        self.assertEqual(result.role, "user")
        self.assertEqual(commits, ["commit"])

    def test_update_message_edits_user_message_and_regenerates_non_rag_reply(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        conversation = SimpleNamespace(user_id="user-1", model_id="model-1")
        message = SimpleNamespace(
            id="message-1",
            role="user",
            content="Old",
            meta={},
            created_at=1,
            conversation=conversation,
            conversation_id="conv-1",
        )

        class Query:
            def filter(self, *_args, **_kwargs):
                return self

            def delete(self, **_kwargs):
                return 1

            def order_by(self, *_args, **_kwargs):
                return self

            def all(self):
                return [message]

        commits: list[str] = []
        service.messages = SimpleNamespace(get=lambda message_id: message)
        service.db = SimpleNamespace(
            add=lambda _item: None,
            flush=lambda: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda _item: None,
            rollback=lambda: commits.append("rollback"),
            query=lambda _model: Query(),
        )
        model = SimpleNamespace(model_key="gpt-4o-mini")
        provider = SimpleNamespace(provider_type="openai")
        service._resolve_chat_model_and_provider = lambda *args, **kwargs: (model, provider)  # type: ignore[method-assign]
        service._build_pending_attachment_notice = lambda *args, **kwargs: None  # type: ignore[method-assign]
        service._serialize_messages = lambda *args, **kwargs: [{"role": "user", "content": "Updated"}]  # type: ignore[method-assign]
        service.llm = SimpleNamespace(generate_reply=lambda **kwargs: "assistant reply")

        updated = service.update_message(
            "user-1", "message-1", "Updated", use_rag=False
        )

        self.assertEqual(updated.content, "Updated")
        self.assertTrue(updated.meta["edited"])
        self.assertEqual(commits, ["commit"])

    def test_regenerate_message_uses_non_rag_reply_path(self) -> None:
        service = object.__new__(ChatService)
        message = SimpleNamespace(
            id="message-1",
            role="assistant",
            created_at=2,
            conversation_id="conv-1",
            meta={},
        )
        conversation = SimpleNamespace(
            user_id="user-1", model_id="model-1", messages=[message]
        )
        message.conversation = conversation
        commits: list[str] = []
        service.messages = SimpleNamespace(get=lambda message_id: message)
        service.db = SimpleNamespace(
            add=lambda _item: None,
            commit=lambda: commits.append("commit"),
            refresh=lambda _item: None,
            rollback=lambda: commits.append("rollback"),
        )
        model = SimpleNamespace(model_key="gpt-4o-mini")
        provider = SimpleNamespace(provider_type="openai")
        service._resolve_chat_model_and_provider = lambda *args, **kwargs: (model, provider)  # type: ignore[method-assign]
        service._build_pending_attachment_notice = lambda *args, **kwargs: None  # type: ignore[method-assign]
        service._serialize_messages = lambda *args, **kwargs: [{"role": "user", "content": "Hi"}]  # type: ignore[method-assign]
        service.llm = SimpleNamespace(generate_reply=lambda **kwargs: "assistant reply")

        regenerated = service.regenerate_message("user-1", "message-1", use_rag=False)

        self.assertEqual(regenerated.role, "assistant")
        self.assertEqual(regenerated.meta["regenerated_from"], "message-1")
        self.assertEqual(commits, ["commit"])

    def test_build_pending_attachment_notice_mentions_video_transcription(self) -> None:
        service = object.__new__(ChatService)
        service._collect_pending_attachments = lambda user_id, messages: [  # type: ignore[method-assign]
            {
                "id": "video-1",
                "kind": "video",
                "name": "2. IMDhub Registration & Signin.mp4",
                "status": "processing",
            }
        ]

        notice = service._build_pending_attachment_notice(
            "user-1", [SimpleNamespace(meta={})]
        )

        self.assertIn("transcription is still processing", notice)
        self.assertIn("2. IMDhub Registration & Signin.mp4", notice)

    def test_delete_conversation_removes_attached_resources_and_conversation(
        self,
    ) -> None:
        service = object.__new__(ChatService)
        conversation = SimpleNamespace(
            id="conv-1",
            user_id="user-1",
            messages=[
                SimpleNamespace(
                    meta={"attachments": [{"id": "doc-1", "kind": "document"}]}
                ),
                SimpleNamespace(
                    meta={
                        "attachments": [
                            {"id": "video-1", "kind": "video"},
                            {"id": "doc-1", "kind": "document"},
                        ]
                    }
                ),
            ],
        )
        repo_state = {"conversation": conversation}
        delete_calls: list[str] = []
        commit_calls: list[str] = []
        cleaned_resources: list[tuple[str, str, str]] = []

        service.conversations = SimpleNamespace(
            get=lambda conversation_id: repo_state["conversation"]
        )
        service.db = SimpleNamespace(
            delete=lambda item: delete_calls.append(item.id),
            commit=lambda: commit_calls.append("commit"),
        )

        with (
            patch("app.services.chat_service.TranscriptService") as transcript_service,
            patch("app.services.chat_service.LibraryService") as library_service,
        ):
            transcript_service.return_value.delete_resource.side_effect = (
                lambda user_id, resource_type, resource_id: cleaned_resources.append(
                    (user_id, resource_type, resource_id)
                )
            )

            def delete_and_clear(item):
                delete_calls.append(item.id)
                repo_state["conversation"] = None

            service.db.delete = delete_and_clear
            service.delete_conversation("user-1", "conv-1")

            library_service.invalidate_user_cache.assert_called_once_with("user-1")

        self.assertEqual(
            cleaned_resources,
            [("user-1", "document", "doc-1"), ("user-1", "video", "video-1")],
        )
        self.assertEqual(delete_calls, ["conv-1"])
        self.assertEqual(commit_calls, ["commit"])

    def test_delete_conversation_raises_for_unknown_conversation(self) -> None:
        service = object.__new__(ChatService)
        service.conversations = SimpleNamespace(get=lambda conversation_id: None)

        with self.assertRaises(HTTPException) as context:
            service.delete_conversation("user-1", "missing")

        self.assertEqual(context.exception.status_code, 404)
