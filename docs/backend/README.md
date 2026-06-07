# Backend Development

Complete guide to FastAPI backend development.

## Table of Contents

- Project Structure
- Creating Endpoints
- Services Layer
- Repositories
- Authentication
- Error Handling
- Background Tasks
- Testing
- Logging

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── endpoints/
│   │   │   │   ├── auth.py           # Auth routes
│   │   │   │   ├── chat.py           # Chat endpoints
│   │   │   │   ├── documents.py      # Document endpoints
│   │   │   │   ├── providers.py      # Provider management
│   │   │   │   └── users.py          # User endpoints
│   │   │   └── api.py                # Route aggregation
│   │   └── deps/
│   │       └── auth.py               # Dependencies
│   ├── core/
│   │   ├── config.py                 # Settings
│   │   ├── database.py               # DB connection
│   │   ├── security.py               # JWT & auth
│   │   └── crypto.py                 # Encryption
│   ├── models/                       # SQLAlchemy models
│   │   ├── user.py
│   │   ├── conversation.py
│   │   ├── message.py
│   │   ├── document.py
│   │   └── ...
│   ├── repositories/                 # Data access
│   │   ├── base.py
│   │   ├── users.py
│   │   ├── conversations.py
│   │   └── ...
│   ├── services/                     # Business logic
│   │   ├── auth_service.py
│   │   ├── chat_service.py
│   │   ├── document_service.py
│   │   └── ...
│   ├── schemas/                      # Pydantic models
│   │   ├── auth.py
│   │   ├── chat.py
│   │   └── ...
│   ├── workers/                      # Celery tasks
│   │   ├── celery_app.py
│   │   └── tasks.py
│   └── main.py                       # FastAPI app
├── tests/
│   ├── test_auth.py
│   ├── test_chat.py
│   └── ...
├── alembic/                          # Migrations
│   ├── versions/
│   ├── env.py
│   └── alembic.ini
├── pyproject.toml                    # Dependencies
└── main.py
```

## Creating Endpoints

### Basic Endpoint

```python
# app/api/v1/endpoints/chat.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps.auth import get_current_user
from app.models.user import User
from app.schemas.chat import ConversationCreate, ConversationResponse

router = APIRouter(prefix="/chat", tags=["chat"])

@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all conversations for the current user."""
    conversations = db.query(Conversation).filter(
        Conversation.user_id == current_user.id
    ).all()
    return conversations

@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new conversation."""
    conversation = Conversation(
        user_id=current_user.id,
        title=payload.title,
        model_id=payload.model_id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation."""
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    
    db.delete(conversation)
    db.commit()
```

### Streaming Response

```python
@router.post("/stream")
async def stream_chat(
    payload: StreamChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream chat response using Server-Sent Events."""
    async def event_generator():
        try:
            service = ChatService(db)
            
            # Create user message
            message = service.create_message(
                payload.conversation_id,
                "user",
                payload.content,
            )
            
            yield f'event: metadata\ndata: {{"message_id": "{message.id}"}}\n\n'
            
            # Stream LLM response
            async for chunk in service.stream_response(
                payload.conversation_id,
                payload.content,
            ):
                yield f'event: token\ndata: {{"text": "{chunk}"}}\n\n'
            
            yield 'event: done\ndata: {"status": "completed"}\n\n'
        except Exception as e:
            yield f'event: error\ndata: {{"error": "{str(e)}"}}\n\n'
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

## Services Layer

```python
# app/services/chat_service.py
from sqlalchemy.orm import Session
from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories.conversations import ConversationRepository

class ChatService:
    def __init__(self, db: Session):
        self.db = db
        self.conversations = ConversationRepository(db)
    
    def create_conversation(self, user_id: str, payload) -> Conversation:
        """Create a new conversation."""
        conversation = Conversation(
            user_id=user_id,
            title=payload.title,
            model_id=payload.model_id,
        )
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation
    
    def list_conversations(self, user_id: str) -> list[Conversation]:
        """List all conversations for a user."""
        return self.conversations.list_for_user(user_id)
    
    def stream_response(self, conversation_id: str, message: str):
        """Stream response from LLM."""
        # Load messages
        messages = self._load_messages(conversation_id)
        
        # Get LLM provider
        provider = self._get_provider()
        
        # Stream tokens
        for token in provider.stream(messages):
            yield token
```

## Repositories

```python
# app/repositories/conversations.py
from sqlalchemy.orm import Session
from app.models.conversation import Conversation

class ConversationRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def get(self, conversation_id: str) -> Conversation | None:
        """Get a conversation by ID."""
        return self.db.query(Conversation).filter(
            Conversation.id == conversation_id
        ).first()
    
    def list_for_user(self, user_id: str) -> list[Conversation]:
        """Get all conversations for a user."""
        return self.db.query(Conversation).filter(
            Conversation.user_id == user_id,
            Conversation.is_deleted == False,
        ).order_by(Conversation.updated_at.desc()).all()
    
    def create(self, **kwargs) -> Conversation:
        """Create a new conversation."""
        conversation = Conversation(**kwargs)
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation
    
    def delete(self, conversation_id: str) -> None:
        """Delete a conversation."""
        conversation = self.get(conversation_id)
        if conversation:
            self.db.delete(conversation)
            self.db.commit()
```

## Authentication

```python
# app/core/security.py
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"])

def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password."""
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str) -> str:
    """Create a JWT access token."""
    expire = datetime.utcnow() + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )

def verify_token(token: str) -> str:
    """Verify and decode a token."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload.get("sub")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")
```

## Error Handling

```python
# app/core/exceptions.py
from fastapi import HTTPException, status

class ConversationNotFound(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )

class Unauthorized(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

# app/main.py
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
    )
```

## Background Tasks

```python
# app/workers/tasks.py
from celery import shared_task

@shared_task
def process_document(document_id: str, file_path: str):
    """Extract text from document."""
    try:
        db = SessionLocal()
        
        # Extract content
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            text = ""
            for page in reader.pages[:5]:
                text += page.extract_text()
        
        # Update database
        document = db.query(Document).get(document_id)
        document.extracted_text = text
        document.status = "completed"
        db.commit()
        
    except Exception as e:
        document.status = "failed"
        document.error = str(e)
        db.commit()
    finally:
        db.close()
```

## Testing

```python
# tests/test_chat.py
import pytest
from app.services.chat_service import ChatService
from app.schemas.chat import ConversationCreate

@pytest.fixture
def db():
    # Setup test database
    pass

def test_create_conversation(db):
    service = ChatService(db)
    payload = ConversationCreate(title="Test")
    conversation = service.create_conversation("user-1", payload)
    
    assert conversation.title == "Test"
    assert conversation.user_id == "user-1"

def test_list_conversations(db):
    service = ChatService(db)
    conversations = service.list_conversations("user-1")
    assert len(conversations) >= 0
```

## Logging

```python
# app/core/logging.py
import logging

logger = logging.getLogger(__name__)

def log_event(event: str, **kwargs):
    """Log an event."""
    logger.info(f"{event}", extra=kwargs)

# Usage
log_event("conversation_created", conversation_id="...", user_id="...")
```

---

See specific guides: Endpoints, Services, Repositories, Authentication, Error Handling, Background Tasks, Testing
