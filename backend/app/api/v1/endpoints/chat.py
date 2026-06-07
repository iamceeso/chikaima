from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.database import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.chat import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
    StreamChatRequest,
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
def stream_chat(
    payload: StreamChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    service = ChatService(db)
    conversation: Conversation | None = None
    history: list[Message] = []

    if payload.conversation_id:
        conversation = service.conversations.get(payload.conversation_id)
        if not conversation or conversation.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        model, provider = service.llm.resolve_model_and_provider(current_user.id, conversation.model_id)
        history = list(conversation.messages)
    else:
        model, provider = service.llm.resolve_model_and_provider(current_user.id, payload.model_id)
        conversation = Conversation(
            user_id=current_user.id,
            title=(payload.title or payload.content).strip()[:48] or "New analysis",
            model_id=model.id,
        )
        db.add(conversation)
        db.flush()

    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=payload.content,
        meta=payload.metadata,
    )
    db.add(user_message)
    conversation.updated_at = datetime.now(UTC)
    db.flush()
    db.commit()
    db.refresh(conversation)
    db.refresh(user_message)

    stream, context_ids = service.llm.stream_reply_with_rag(
        user_id=current_user.id,
        provider=provider,
        model=model,
        messages=service._serialize_messages([*history, user_message]),
        include_context=payload.use_rag,
    )

    def event_stream():
        metadata = {
            "conversation_id": conversation.id,
            "user_message_id": user_message.id,
            "provider": provider.provider_type,
            "model": model.model_key,
            "rag_context_ids": context_ids,
        }
        yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
        assistant_parts: list[str] = []
        try:
            for chunk in stream:
                assistant_parts.append(chunk)
                yield f"event: token\ndata: {json.dumps({'text': chunk})}\n\n"
            assistant_content = "".join(assistant_parts).strip()
            if assistant_content:
                assistant_message = Message(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=assistant_content,
                    meta={
                        "provider": provider.provider_type,
                        "model": model.model_key,
                        "rag_context_ids": context_ids,
                    },
                )
                db.add(assistant_message)
                conversation.updated_at = datetime.now(UTC)
                db.commit()
            yield "event: done\ndata: {}\n\n"
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
