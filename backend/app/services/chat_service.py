from __future__ import annotations

import base64
import mimetypes
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ai_model import AIModel
from app.models.audio import AudioAsset
from app.models.conversation import Conversation
from app.models.document import Document
from app.models.message import Message
from app.models.transcript import Transcript
from app.models.video import Video
from app.repositories.chat import ConversationRepository, MessageRepository
from app.schemas.chat import ConversationCreate, MessageCreate
from app.services.library_service import LibraryService
from app.services.llm_service import LLMService
from app.services.transcript_service import TranscriptService
from app.services.workspace_service import WorkspaceService

MAX_ATTACHMENT_CONTEXT_CHARS = 8_000
MAX_ATTACHMENT_ITEM_CHARS = 2_500


class ChatService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.conversations = ConversationRepository(db)
        self.messages = MessageRepository(db)
        self.llm = LLMService(db)

    def list_conversations(self, user_id: str) -> list[Conversation]:
        return self.conversations.list_for_user(user_id)

    def delete_conversation(self, user_id: str, conversation_id: str) -> None:
        conversation = self.conversations.get(conversation_id)
        if not conversation or conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        attachments = self._collect_rag_source_filters(list(conversation.messages))
        transcript_service = TranscriptService(self.db)

        if attachments:
            for resource_type, resource_ids in attachments.items():
                for resource_id in resource_ids:
                    transcript_service.delete_resource(user_id, resource_type, resource_id)

        refreshed_conversation = self.conversations.get(conversation_id)
        if refreshed_conversation and refreshed_conversation.user_id == user_id:
            self.db.delete(refreshed_conversation)
            self.db.commit()

        LibraryService.invalidate_user_cache(user_id)

    def create_conversation(self, user_id: str, payload: ConversationCreate, use_rag: bool = True) -> Conversation:
        try:
            model, provider = self._resolve_chat_model_and_provider(
                user_id,
                payload.model_id,
                payload.initial_metadata,
            )
            conversation = Conversation(
                user_id=user_id,
                title=payload.title,
                folder=payload.folder,
                model_id=model.id,
            )
            self.db.add(conversation)
            self.db.flush()

            if payload.initial_message:
                user_message = Message(
                    conversation_id=conversation.id,
                    role="user",
                    content=payload.initial_message,
                    meta={"source": "initial", **payload.initial_metadata},
                )
                self.db.add(user_message)
                self.db.flush()

                pending_notice = self._build_pending_attachment_notice(user_id, [user_message])
                if pending_notice:
                    assistant_content = pending_notice
                    citations = []
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                        "processing_blocked": True,
                        "rag_citations": citations,
                    }
                elif use_rag:
                    rag_scope = self._collect_rag_source_filters([user_message])
                    assistant_content, citations = self.llm.generate_reply_with_rag(
                        user_id=user_id,
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages(user_id, [user_message], model),
                        source_filters=rag_scope,
                    )
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                        "rag_citations": citations,
                    }
                else:
                    assistant_content = self.llm.generate_reply(
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages(user_id, [user_message], model),
                    )
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                    }

                self.db.add(
                    Message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=assistant_content,
                        meta=meta,
                    )
                )

            self.db.commit()
            self.db.refresh(conversation)
            return conversation
        except Exception:
            self.db.rollback()
            raise

    def add_message(
        self,
        user_id: str,
        conversation_id: str,
        payload: MessageCreate,
        use_rag: bool = True,
    ) -> Message:
        conversation = self.conversations.get(conversation_id)
        if not conversation or conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

        if payload.role != "user":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only user messages can be posted directly.",
            )
        try:
            model, provider = self._resolve_chat_model_and_provider(
                user_id,
                conversation.model_id,
                payload.metadata,
            )
            message = Message(
                conversation_id=conversation_id,
                role=payload.role,
                content=payload.content,
                meta={
                    **payload.metadata,
                    "provider": provider.provider_type,
                    "model": model.model_key,
                },
            )
            self.db.add(message)
            self.db.flush()

            history = [*conversation.messages, message]

            pending_notice = self._build_pending_attachment_notice(user_id, history)
            if pending_notice:
                assistant_content = pending_notice
                citations = []
                meta = {
                    "provider": provider.provider_type,
                    "model": model.model_key,
                    "processing_blocked": True,
                    "rag_citations": citations,
                }
            elif use_rag:
                rag_scope = self._collect_rag_source_filters(history)
                assistant_content, citations = self.llm.generate_reply_with_rag(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(user_id, history, model),
                    source_filters=rag_scope,
                )
                meta = {
                    "provider": provider.provider_type,
                    "model": model.model_key,
                    "rag_citations": citations,
                }
            else:
                assistant_content = self.llm.generate_reply(
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(user_id, history, model),
                )
                meta = {"provider": provider.provider_type, "model": model.model_key}

            self.db.add(
                Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=assistant_content,
                    meta=meta,
                )
            )

            self.db.commit()
            self.db.refresh(message)
            return message
        except Exception:
            self.db.rollback()
            raise

    def update_message(self, user_id: str, message_id: str, content: str, use_rag: bool = True) -> Message:
        message = self.messages.get(message_id)
        if not message or message.conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        try:
            conversation = message.conversation
            cutoff = message.created_at
            message.content = content
            message.meta = {**message.meta, "edited": True}
            self.db.add(message)
            self.db.flush()

            if message.role == "user":
                (
                    self.db.query(Message)
                    .filter(
                        Message.conversation_id == message.conversation_id,
                        Message.id != message.id,
                        Message.created_at > cutoff,
                    )
                    .delete(synchronize_session=False)
                )
                model, provider = self._resolve_chat_model_and_provider(
                    user_id,
                    conversation.model_id,
                    message.meta,
                )
                history = list(
                    self.db.query(Message)
                    .filter(
                        Message.conversation_id == message.conversation_id,
                        Message.created_at <= cutoff,
                    )
                    .order_by(Message.created_at.asc())
                    .all()
                )

                pending_notice = self._build_pending_attachment_notice(user_id, history)
                if pending_notice:
                    assistant_content = pending_notice
                    citations = []
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                        "processing_blocked": True,
                        "rag_citations": citations,
                    }
                elif use_rag:
                    rag_scope = self._collect_rag_source_filters(history)
                    assistant_content, citations = self.llm.generate_reply_with_rag(
                        user_id=user_id,
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages(user_id, history, model),
                        source_filters=rag_scope,
                    )
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                        "rag_citations": citations,
                    }
                else:
                    assistant_content = self.llm.generate_reply(
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages(user_id, history, model),
                    )
                    meta = {
                        "provider": provider.provider_type,
                        "model": model.model_key,
                    }

                self.db.add(
                    Message(
                        conversation_id=message.conversation_id,
                        role="assistant",
                        content=assistant_content,
                        meta=meta,
                    )
                )

            self.db.commit()
            self.db.refresh(message)
            return message
        except Exception:
            self.db.rollback()
            raise

    def regenerate_message(self, user_id: str, message_id: str, use_rag: bool = True) -> Message:
        message = self.messages.get(message_id)
        if not message or message.conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        try:
            conversation = message.conversation
            model, provider = self._resolve_chat_model_and_provider(
                user_id,
                conversation.model_id,
                message.meta,
            )

            history: list[Message] = []
            for item in conversation.messages:
                if item.id == message.id:
                    continue
                if message.role == "assistant" and item.created_at > message.created_at:
                    continue
                history.append(item)

            pending_notice = self._build_pending_attachment_notice(user_id, history)
            if pending_notice:
                assistant_content = pending_notice
                citations = []
                meta = {
                    "regenerated_from": message.id,
                    "provider": provider.provider_type,
                    "model": model.model_key,
                    "processing_blocked": True,
                    "rag_citations": citations,
                }
            elif use_rag:
                rag_scope = self._collect_rag_source_filters(history)
                assistant_content, citations = self.llm.generate_reply_with_rag(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(user_id, history, model),
                    source_filters=rag_scope,
                )
                meta = {
                    "regenerated_from": message.id,
                    "provider": provider.provider_type,
                    "model": model.model_key,
                    "rag_citations": citations,
                }
            else:
                assistant_content = self.llm.generate_reply(
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(user_id, history, model),
                )
                meta = {
                    "regenerated_from": message.id,
                    "provider": provider.provider_type,
                    "model": model.model_key,
                }

            regenerated = Message(
                conversation_id=message.conversation_id,
                role="assistant",
                content=assistant_content,
                meta=meta,
            )
            self.db.add(regenerated)
            self.db.commit()
            self.db.refresh(regenerated)
            return regenerated
        except Exception:
            self.db.rollback()
            raise

    def _serialize_messages(self, user_id: str, messages: list[Message], model: AIModel) -> list[dict[str, Any]]:
        return [
            {
                "role": message.role,
                "content": self._build_message_content(user_id, message, model),
            }
            for message in messages
        ]

    def _build_message_content(self, user_id: str, message: Message, model: AIModel) -> str | list[dict[str, str]]:
        base_content = message.content
        if message.role != "user":
            return base_content

        attachment_context = self._build_attachment_context(user_id, message.meta)
        vision_parts = self._build_image_parts(user_id, message.meta, model)
        if not attachment_context and not vision_parts:
            return base_content

        text_content = base_content
        if attachment_context:
            text_content = (
                f"{base_content}\n\n"
                "Attached resources for this message:\n"
                f"{attachment_context}\n\n"
                "Use the attached resource context when it is relevant to the user's request."
            )
        elif vision_parts:
            text_content = (
                f"{base_content}\n\n"
                "An image is attached to this message. Analyze it directly when that helps answer the user's request."
            )
        if not vision_parts:
            return text_content

        return [{"type": "text", "text": text_content}, *vision_parts]

    def _build_attachment_context(self, user_id: str, metadata: dict[str, Any] | None) -> str:
        if not isinstance(metadata, dict):
            return ""

        attachments = metadata.get("attachments")
        if not isinstance(attachments, list):
            return ""

        sections: list[str] = []
        remaining_chars = MAX_ATTACHMENT_CONTEXT_CHARS

        for attachment in attachments:
            if remaining_chars <= 0 or not isinstance(attachment, dict):
                break

            section = self._build_attachment_section(user_id, attachment)
            if not section:
                continue

            section = section[:MAX_ATTACHMENT_ITEM_CHARS].strip()
            if not section:
                continue

            sections.append(section)
            remaining_chars -= len(section)

        return "\n\n".join(sections)

    def _build_image_parts(self, user_id: str, metadata: dict[str, Any] | None, model: AIModel) -> list[dict[str, str]]:
        if not isinstance(metadata, dict) or not bool((model.capabilities or {}).get("vision")):
            return []

        attachments = metadata.get("attachments")
        if not isinstance(attachments, list):
            return []

        image_parts: list[dict[str, str]] = []
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            resource_id = attachment.get("id")
            kind = attachment.get("kind")
            if kind != "document" or not isinstance(resource_id, str):
                continue

            resource = self.db.get(Document, resource_id)
            if not resource or resource.user_id != user_id or not resource.mime_type.startswith("image/"):
                continue

            file_path = Path(resource.file_path)
            if not file_path.exists():
                continue

            mime_type = resource.mime_type or mimetypes.guess_type(file_path.name)[0] or "image/png"
            try:
                encoded = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            except OSError:
                continue

            image_parts.append(
                {
                    "type": "image",
                    "mime_type": mime_type,
                    "data": encoded,
                }
            )
        return image_parts

    def _resolve_chat_model_and_provider(
        self,
        user_id: str,
        model_id: str | None,
        metadata: dict[str, Any] | None,
    ) -> tuple[AIModel, Any]:
        model, provider = self.llm.resolve_model_and_provider(user_id, model_id)
        if not self._should_auto_use_vision_model(metadata, model):
            return model, provider

        vision_model = self._find_same_provider_vision_model(model.provider_id)
        if vision_model is None:
            return model, provider

        return vision_model, provider

    def _should_auto_use_vision_model(self, metadata: dict[str, Any] | None, model: AIModel) -> bool:
        workspace = WorkspaceService(self.db).get_or_create()
        if not workspace.vision_aware:
            return False
        if bool((model.capabilities or {}).get("vision")):
            return False
        return self._has_image_attachment(metadata)

    def _has_image_attachment(self, metadata: dict[str, Any] | None) -> bool:
        if not isinstance(metadata, dict):
            return False
        attachments = metadata.get("attachments")
        if not isinstance(attachments, list):
            return False

        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            resource_id = attachment.get("id")
            kind = attachment.get("kind")
            if kind != "document" or not isinstance(resource_id, str):
                continue
            resource = self.db.get(Document, resource_id)
            if resource and resource.mime_type.startswith("image/"):
                return True
        return False

    def _find_same_provider_vision_model(self, provider_id: str) -> AIModel | None:
        candidates = (
            self.db.query(AIModel)
            .filter(
                AIModel.provider_id == provider_id,
                AIModel.is_available.is_(True),
            )
            .order_by(AIModel.is_default.desc(), AIModel.created_at.asc())
            .all()
        )
        for candidate in candidates:
            if bool((candidate.capabilities or {}).get("vision")):
                return candidate
        return None

    def _build_pending_attachment_notice(self, user_id: str, messages: list[Message]) -> str | None:
        pending_resources = self._collect_pending_attachments(user_id, messages)
        if not pending_resources:
            return None

        if len(pending_resources) == 1:
            pending = pending_resources[0]
            if pending["kind"] == "video":
                return (
                    f'I can see you\'ve uploaded "{pending["name"]}", but the transcription is still processing.\n\n'
                    "Please give it a moment to finish, and I'll be able to help with that video once it's complete."
                )
            if pending["kind"] == "audio":
                return (
                    f'I can see you\'ve uploaded "{pending["name"]}", but the transcription is still processing.\n\n'
                    "Please give it a moment to finish, and I'll be able to help with that audio once it's complete."
                )
            return (
                f'I can see you\'ve uploaded "{pending["name"]}", but it is still processing.\n\n'
                "Please give it a moment to finish, and I'll be able to help once it's complete."
            )

        pending_lines = [f'- {item["name"]} ({item["kind"]}, {item["status"]})' for item in pending_resources]
        return (
            "Some attached files are still processing, so I can't work from them yet.\n\n"
            + "\n".join(pending_lines)
            + "\n\nPlease wait for processing to finish, then try again."
        )

    def _collect_rag_source_filters(self, messages: list[Message]) -> dict[str, set[str]]:
        source_filters: dict[str, set[str]] = {}

        for message in messages:
            metadata = getattr(message, "meta", None)
            if not isinstance(metadata, dict):
                continue

            attachments = metadata.get("attachments")
            if not isinstance(attachments, list):
                continue

            for attachment in attachments:
                if not isinstance(attachment, dict):
                    continue
                resource_id = attachment.get("id")
                kind = attachment.get("kind")
                if not isinstance(resource_id, str) or kind not in {"document", "audio", "video"}:
                    continue
                source_filters.setdefault(kind, set()).add(resource_id)

        return source_filters

    def _collect_pending_attachments(self, user_id: str, messages: Iterable[Message]) -> list[dict[str, str]]:
        pending_resources: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()

        model_map: dict[str, type[Document | AudioAsset | Video]] = {
            "document": Document,
            "audio": AudioAsset,
            "video": Video,
        }

        for message in messages:
            metadata = getattr(message, "meta", None)
            if not isinstance(metadata, dict):
                continue

            attachments = metadata.get("attachments")
            if not isinstance(attachments, list):
                continue

            for attachment in attachments:
                if not isinstance(attachment, dict):
                    continue
                resource_id = attachment.get("id")
                kind = attachment.get("kind")
                if not isinstance(resource_id, str) or kind not in model_map:
                    continue

                cache_key = (kind, resource_id)
                if cache_key in seen:
                    continue
                seen.add(cache_key)

                resource = self.db.get(model_map[kind], resource_id)
                if not resource or resource.user_id != user_id:
                    continue
                if resource.status == "completed":
                    continue

                pending_resources.append(
                    {
                        "id": resource_id,
                        "kind": kind,
                        "name": getattr(resource, "name", attachment.get("name") or "Attachment"),
                        "status": resource.status,
                    }
                )

        return pending_resources

    def _build_attachment_section(self, user_id: str, attachment: dict[str, Any]) -> str:
        resource_id = attachment.get("id")
        kind = attachment.get("kind")
        display_name = str(attachment.get("name") or "Attachment")
        if not isinstance(resource_id, str) or not isinstance(kind, str):
            return ""

        model_map: dict[str, type[Document | AudioAsset | Video]] = {
            "document": Document,
            "audio": AudioAsset,
            "video": Video,
        }
        model = model_map.get(kind)
        if model is None:
            return ""

        resource = self.db.get(model, resource_id)
        if not resource or resource.user_id != user_id:
            return f"{display_name} ({kind}) could not be loaded."

        transcript = (
            self.db.query(Transcript)
            .filter(
                Transcript.user_id == user_id,
                Transcript.resource_type == kind,
                Transcript.resource_id == resource_id,
            )
            .order_by(Transcript.created_at.desc())
            .first()
        )

        if isinstance(resource, Document) and resource.mime_type.startswith("image/"):
            label = f"Image attachment: {resource.name}"
            if resource.status != "completed":
                return f"{label}\nStatus: {resource.status}. OCR/analysis may still be processing."

            ocr_text = (transcript.content if transcript and transcript.content else "").strip()
            if ocr_text:
                return f"{label}\nExtracted text:\n{ocr_text}"
            if resource.summary:
                return f"{label}\nSummary:\n{resource.summary}"
            return f"{label}\nNo extracted text is available yet."

        if kind == "document":
            label = f"Document attachment: {resource.name}"
            if resource.status != "completed":
                return f"{label}\nStatus: {resource.status}. Document analysis may still be processing."

            parts = [label]
            if resource.summary:
                parts.append(f"Summary:\n{resource.summary.strip()}")
            if transcript and transcript.content:
                parts.append(f"Extracted content:\n{transcript.content.strip()}")
            return "\n".join(parts)

        if kind == "audio":
            label = f"Audio attachment: {resource.name}"
            if resource.status != "completed":
                return f"{label}\nStatus: {resource.status}. Transcription may still be processing."
            transcript_text = (resource.transcript or (transcript.content if transcript else "")).strip()
            return f"{label}\nTranscript:\n{transcript_text or 'No transcript is available yet.'}"

        if kind == "video":
            label = f"Video attachment: {resource.name}"
            if resource.status != "completed":
                return f"{label}\nStatus: {resource.status}. Transcription may still be processing."
            transcript_text = (resource.transcript or (transcript.content if transcript else "")).strip()
            parts = [label]
            if resource.summary:
                parts.append(f"Summary:\n{resource.summary.strip()}")
            parts.append(f"Transcript:\n{transcript_text or 'No transcript is available yet.'}")
            return "\n".join(parts)

        return ""
