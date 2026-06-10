from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.chat import ConversationRepository, MessageRepository
from app.schemas.chat import ConversationCreate, MessageCreate
from app.services.llm_service import LLMService


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
        self.db.delete(conversation)
        self.db.commit()

    def create_conversation(self, user_id: str, payload: ConversationCreate, use_rag: bool = True) -> Conversation:
        try:
            model, provider = self.llm.resolve_model_and_provider(user_id, payload.model_id)
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

                if use_rag:
                    assistant_content, citations = self.llm.generate_reply_with_rag(
                        user_id=user_id,
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages([user_message]),
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
                        messages=self._serialize_messages([user_message]),
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
            model, provider = self.llm.resolve_model_and_provider(user_id, conversation.model_id)
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

            if use_rag:
                assistant_content, citations = self.llm.generate_reply_with_rag(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(history),
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
                    messages=self._serialize_messages(history),
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
                model, provider = self.llm.resolve_model_and_provider(user_id, conversation.model_id)
                history = list(
                    self.db.query(Message)
                    .filter(
                        Message.conversation_id == message.conversation_id,
                        Message.created_at <= cutoff,
                    )
                    .order_by(Message.created_at.asc())
                    .all()
                )

                if use_rag:
                    assistant_content, citations = self.llm.generate_reply_with_rag(
                        user_id=user_id,
                        provider=provider,
                        model=model,
                        messages=self._serialize_messages(history),
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
                        messages=self._serialize_messages(history),
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
            model, provider = self.llm.resolve_model_and_provider(user_id, conversation.model_id)

            history: list[Message] = []
            for item in conversation.messages:
                if item.id == message.id:
                    continue
                if message.role == "assistant" and item.created_at > message.created_at:
                    continue
                history.append(item)

            if use_rag:
                assistant_content, citations = self.llm.generate_reply_with_rag(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    messages=self._serialize_messages(history),
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
                    messages=self._serialize_messages(history),
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

    def _serialize_messages(self, messages: list[Message]) -> list[dict[str, str]]:
        return [{"role": message.role, "content": message.content} for message in messages]
