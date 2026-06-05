from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.base import Repository


class ConversationRepository(Repository[Conversation]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, Conversation)

    def list_for_user(self, user_id: str) -> list[Conversation]:
        return list(
            self.db.query(Conversation)
            .options(joinedload(Conversation.messages))
            .filter(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
            .all()
        )


class MessageRepository(Repository[Message]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, Message)
