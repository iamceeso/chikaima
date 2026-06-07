# System Overview

Complete system architecture and design patterns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CLIENTS                             │
│            Web Browser | Mobile | API Clients              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  LOAD BALANCER / REVERSE PROXY              │
│                       (Nginx)                               │
│              SSL/TLS | Rate Limiting                        │
└─────────────────────────┬───────────────────────────────────┘
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐      ┌────▼────┐      ┌───▼────┐
    │Frontend  │      │ Backend │      │ Backend │
    │Server    │      │ API #1  │      │ API #2  │
    │(Next.js) │      │(FastAPI)│      │(FastAPI)│
    └──────────┘      └─────────┘      └─────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │PostgreSQL│      │  Redis  │      │ Storage │
    │(Primary) │      │ (Cache) │      │(Local/S3)│
    └──────────┘      └─────────┘      └─────────┘
         │
    ┌────▼──────────────────┐
    │ Vector Database       │
    │ (for Embeddings)      │
    └───────────────────────┘

┌──────────────────────────────────────┐
│      Background Processing Queue      │
├──────────────────────────────────────┤
│ - Document extraction                │
│ - Audio transcription                │
│ - Video analysis                     │
│ - Embedding generation               │
│ - Cleanup jobs                       │
└──────────────────────────────────────┘
     ↑                            ↓
┌────┴───────────────────────────┴──┐
│     Celery Workers (Distributed)   │
│    Multiple Instances (Scalable)   │
└────────────────────────────────────┘
```

## Request Flow

### Chat Request with Streaming

```
1. User sends message
   │
   ├→ Validate JWT token
   ├→ Validate conversation access
   │
2. Store user message in database
   │
3. Fetch previous messages
   │
4. Serialize messages with attachments
   ├→ Extract PDF text
   ├→ Get audio transcripts
   ├→ Get video summaries
   │
5. Add RAG context (if enabled)
   ├→ Generate query embedding
   ├→ Search vector database
   ├→ Retrieve top-K documents
   │
6. Call LLM provider (async stream)
   │
7. Stream tokens to client (SSE)
   │
   token 1 → token 2 → token 3 → ... → done
   │
8. Save assistant response
   │
9. Update conversation metadata
```

## Component Responsibilities

### Frontend
- User interface rendering
- Form validation
- State management
- Real-time streaming UI
- Error handling & feedback
- Local caching

### Backend API
- Request routing & validation
- Authentication & authorization
- Business logic orchestration
- Database operations
- LLM provider integration
- Response formatting

### Services Layer
- Chat processing
- Authentication
- Document processing coordination
- Provider management
- Embedding generation
- RAG pipeline

### Repositories
- Database queries
- Transaction management
- Query optimization
- Data caching

### Workers (Celery)
- Heavy computation (async)
- Transcription & extraction
- Batch processing
- Scheduled tasks

## Data Models

### Core Entities

```
User
├── Workspaces
│   └── Conversations
│       └── Messages
│           └── Attachments
├── Documents
├── AudioAssets
├── VideoAssets
├── Providers
│   └── AIModels
└── Jobs (background tasks)
```

### Message with Attachments

```json
{
  "id": "msg-123",
  "conversation_id": "conv-456",
  "role": "user",
  "content": "Summarize this",
  "meta": {
    "attachments": [
      {
        "id": "doc-789",
        "name": "report.pdf",
        "kind": "document"
      }
    ]
  },
  "created_at": "2026-06-07T12:00:00Z"
}
```

## Authentication Flow

```
1. User submits login credentials
   ├→ Validate email format
   ├→ Check password hash
   │
2. Generate JWT tokens
   ├→ Access token (30 min)
   ├→ Refresh token (7 days)
   │
3. Return tokens to client
   │
4. Client sends with each request:
   Authorization: Bearer {access_token}
   │
5. Backend validates token:
   ├→ Verify signature
   ├→ Check expiration
   ├→ Load user from database
   │
6. Allow or deny request
```

## Real-Time Features

### Server-Sent Events (SSE)

Chat streaming uses SSE for real-time token delivery:

```
Browser                        Server
  │                              │
  ├──GET /api/chat/stream───────→│
  │                              │
  │←──event: metadata────────────┤
  │←──event: token ───────────────│ (repeated)
  │←──event: token ───────────────│
  │←──event: token ───────────────│
  │←──event: done────────────────┤
  │                              │
```

## Scalability

### Horizontal Scaling

**Stateless Components** (scale easily):
- Backend API servers
- Celery workers
- Frontend servers (static)

**Stateful Components** (shared):
- PostgreSQL database
- Redis cache
- File storage

### Load Distribution

```
Nginx
├── 30% traffic → API-1
├── 30% traffic → API-2
├── 40% traffic → API-3
```

### Worker Distribution

```
Redis Queue
├── Transcription workers (2)
├── PDF extraction (3)
├── Embeddings (2)
└── General workers (4)
```

## Disaster Recovery

### Data Backups
- PostgreSQL: Daily backups
- Files: Synced to S3
- Configuration: Version controlled

### High Availability
- Database replication
- Read replicas for queries
- Failover to standby

---

**Next**: [Components](./components.md) - Detailed component breakdown
