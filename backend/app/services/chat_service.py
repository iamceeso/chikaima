from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.chat import ConversationRepository, MessageRepository
from app.schemas.chat import ConversationCreate, MessageCreate


class ChatService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.conversations = ConversationRepository(db)
        self.messages = MessageRepository(db)

    def list_conversations(self, user_id: str) -> list[Conversation]:
        return self.conversations.list_for_user(user_id)

    def create_conversation(self, user_id: str, payload: ConversationCreate) -> Conversation:
        conversation = Conversation(
            user_id=user_id,
            title=payload.title,
            folder=payload.folder,
            model_id=payload.model_id,
        )
        self.db.add(conversation)
        self.db.flush()

        if payload.initial_message:
            self.db.add(
                Message(
                    conversation_id=conversation.id,
                    role="user",
                    content=payload.initial_message,
                    meta={"source": "initial"},
                )
            )

        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def add_message(self, user_id: str, conversation_id: str, payload: MessageCreate) -> Message:
        conversation = self.conversations.get(conversation_id)
        if not conversation or conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

        message = Message(
            conversation_id=conversation_id,
            role=payload.role,
            content=payload.content,
            meta={"streaming": payload.role == "assistant"},
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message

    def update_message(self, user_id: str, message_id: str, content: str) -> Message:
        message = self.messages.get(message_id)
        if not message or message.conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        message.content = content
        message.meta = {**message.meta, "edited": True}
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message

    def regenerate_message(self, user_id: str, message_id: str) -> Message:
        message = self.messages.get(message_id)
        if not message or message.conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        regenerated = Message(
            conversation_id=message.conversation_id,
            role="assistant",
            content="Regenerated response placeholder. Connect a provider to stream live output.",
            meta={"regenerated_from": message.id},
        )
        self.db.add(regenerated)
        self.db.commit()
        self.db.refresh(regenerated)
        return regenerated
