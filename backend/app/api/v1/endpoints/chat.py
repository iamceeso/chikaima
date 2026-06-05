from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.chat import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
    MessageUpdate,
    RegenerateRequest,
)
from app.services.chat_service import ChatService

router = APIRouter()


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationResponse]:
    conversations = ChatService(db).list_conversations(current_user.id)
    return [ConversationResponse.model_validate(conversation) for conversation in conversations]


@router.post("/conversations", response_model=ConversationResponse)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationResponse:
    conversation = ChatService(db).create_conversation(current_user.id, payload)
    return ConversationResponse.model_validate(conversation)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
def add_message(
    conversation_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    message = ChatService(db).add_message(current_user.id, conversation_id, payload)
    return MessageResponse.model_validate(message)


@router.patch("/messages/{message_id}", response_model=MessageResponse)
def edit_message(
    message_id: str,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    message = ChatService(db).update_message(current_user.id, message_id, payload.content)
    return MessageResponse.model_validate(message)


@router.post("/messages/regenerate", response_model=MessageResponse)
def regenerate_message(
    payload: RegenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    message = ChatService(db).regenerate_message(current_user.id, payload.message_id)
    return MessageResponse.model_validate(message)


@router.post("/stream")
def stream_chat() -> dict[str, str]:
    return {"message": "Streaming endpoint scaffold ready for SSE/WebSocket provider integration."}
