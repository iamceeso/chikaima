# Database

Database schema, models, and migrations.

## Overview

Olanma uses PostgreSQL as the primary data store with SQLAlchemy ORM.

## Core Models

### User

Represents a user account.

```
id: UUID (primary key)
email: VARCHAR(255) unique
hashed_password: VARCHAR(255)
is_active: BOOLEAN
is_superuser: BOOLEAN
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- Conversations (1:N)
- Workspaces (1:N)
- Documents (1:N)
- Providers (1:N)

### Conversation

Represents a chat conversation.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
workspace_id: UUID (foreign key -> workspaces, nullable)
title: VARCHAR(255)
model_id: UUID (foreign key -> ai_models, nullable)
is_pinned: BOOLEAN default false
is_deleted: BOOLEAN default false
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- User (N:1)
- Workspace (N:1, optional)
- Messages (1:N)
- AIModel (N:1, optional)

### Message

Represents a single message in a conversation.

```
id: UUID (primary key)
conversation_id: UUID (foreign key -> conversations)
role: VARCHAR(50) enum: user, assistant, system
content: TEXT
meta: JSON (attachments, rag_context, etc)
tokens_used: INTEGER nullable
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- Conversation (N:1)

Meta structure:
```json
{
  "attachments": [
    {
      "id": "doc-uuid",
      "name": "file.pdf",
      "kind": "document"
    }
  ],
  "rag_context": [
    {
      "document_id": "doc-uuid",
      "score": 0.95
    }
  ]
}
```

### Document

Represents an uploaded document.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
name: VARCHAR(255)
file_path: VARCHAR(500)
mime_type: VARCHAR(100)
file_size: INTEGER
status: VARCHAR(50) enum: pending, processing, completed, failed
summary: TEXT nullable
extracted_text: TEXT nullable
error_message: TEXT nullable
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- User (N:1)

Status flow: pending -> processing -> completed (or failed)

### AudioAsset

Represents an uploaded audio file.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
name: VARCHAR(255)
file_path: VARCHAR(500)
mime_type: VARCHAR(100)
duration_seconds: INTEGER nullable
status: VARCHAR(50) enum: pending, processing, completed, failed
transcript: TEXT nullable
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

### VideoAsset

Represents an uploaded video file.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
name: VARCHAR(255)
file_path: VARCHAR(500)
mime_type: VARCHAR(100)
duration_seconds: INTEGER nullable
status: VARCHAR(50) enum: pending, processing, completed, failed
summary: TEXT nullable
transcript: TEXT nullable
action_items: JSON array
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

### Provider

Represents an LLM API provider.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
provider_type: VARCHAR(50) enum: openai, anthropic, cohere, huggingface
secret_key: VARCHAR(1000) encrypted
is_enabled: BOOLEAN default true
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- User (N:1)
- AIModels (1:N)

### AIModel

Represents an available AI model.

```
id: UUID (primary key)
provider_id: UUID (foreign key -> providers)
model_key: VARCHAR(255)
name: VARCHAR(255)
description: TEXT nullable
is_enabled: BOOLEAN default true
is_default: BOOLEAN default false
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Relationships:
- Provider (N:1)

### Workspace

Represents a workspace for organizing conversations.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
name: VARCHAR(255)
description: VARCHAR(1000) nullable
icon: VARCHAR(100) nullable
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Unique constraint: (user_id, name)

Relationships:
- User (N:1)
- Conversations (1:N)
- WorkspaceCollaborators (1:N)

### WorkspaceCollaborator

Represents a collaborator in a workspace.

```
id: UUID (primary key)
workspace_id: UUID (foreign key -> workspaces)
user_id: UUID (foreign key -> users)
role: VARCHAR(50) enum: owner, editor, viewer
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

Unique constraint: (workspace_id, user_id)

### Job

Represents a background job.

```
id: UUID (primary key)
user_id: UUID (foreign key -> users)
job_type: VARCHAR(100)
status: VARCHAR(50) enum: pending, processing, completed, failed
data: JSON
result: JSON nullable
error: TEXT nullable
celery_task_id: VARCHAR(255) nullable
progress: INTEGER default 0
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

## Schema Diagram

```
users
├── conversations
│   ├── messages
│   └── ai_models
├── workspaces
│   ├── workspace_collaborators
│   └── conversations
├── documents
├── audio_assets
├── video_assets
├── providers
│   └── ai_models
└── jobs
```

## Migrations

Create new migration:
```bash
uv run alembic revision --autogenerate -m "Add new column"
```

Apply migrations:
```bash
uv run alembic upgrade head
```

Revert migration:
```bash
uv run alembic downgrade -1
```

View migration status:
```bash
uv run alembic current
uv run alembic history
```

## Indexing Strategy

Key indexes for performance:

```python
# User lookups
Index('idx_users_email', 'email')

# Conversation queries
Index('idx_conversations_user_id', 'user_id')
Index('idx_conversations_user_created', 'user_id', 'created_at')

# Message queries
Index('idx_messages_conversation_id', 'conversation_id')
Index('idx_messages_conversation_created', 'conversation_id', 'created_at')

# Document queries
Index('idx_documents_user_id', 'user_id')
Index('idx_documents_user_status', 'user_id', 'status')
```

## Connection Pool

PostgreSQL connection pooling configuration:

```python
from sqlalchemy import create_engine

engine = create_engine(
    database_url,
    pool_size=10,           # connections to maintain
    max_overflow=20,        # additional connections
    pool_pre_ping=True,     # verify connections before use
    pool_recycle=3600,      # recycle connections hourly
)
```

## Backup and Recovery

Backup:
```bash
pg_dump -U olanma olanma > backup.sql
```

Restore:
```bash
psql -U olanma olanma < backup.sql
```

## Performance Optimization

Query optimization:

```python
# Avoid N+1 queries
from sqlalchemy.orm import joinedload

conversations = db.query(Conversation).options(
    joinedload(Conversation.messages)
).filter(...).all()

# Use only needed columns
from sqlalchemy import select

users = db.query(User.id, User.email).filter(...).all()
```

---

See specific model documentation and migration guides.
