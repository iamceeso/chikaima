# Architecture

This page describes the current architecture that exists in the repo today.

## High-Level Shape

```text
Next.js frontend
        |
        | HTTP + SSE
        v
FastAPI backend
        |
        | SQLAlchemy
        v
PostgreSQL + pgvector

FastAPI backend
        |
        | jobs
        v
Redis + Celery worker

FastAPI / worker
        |
        | provider APIs
        v
OpenAI / Anthropic / Gemini / Ollama / OpenRouter / LiteLLM / local gateway
```

## Core Runtime Components

### Frontend

The frontend is a Next.js App Router application with route groups for:

- auth flows
- chat
- media library
- processing queue
- provider and model administration
- workspace settings

### Backend

The backend is a FastAPI app with:

- JWT-based auth
- provider and model management
- chat and SSE streaming
- asset ingestion APIs
- transcript/summary APIs
- workspace settings APIs

### Background Jobs

Long-running work is pushed to Celery:

- document analysis
- audio transcription
- video analysis

The worker writes results back into the same PostgreSQL database.

### Data Layer

PostgreSQL stores:

- users
- providers and synced models
- conversations and messages
- documents, audio, and video assets
- transcripts and summaries
- jobs
- asset chunks for retrieval

`pgvector` is used for `asset_chunks.embedding`.

### Storage

Uploaded files are stored on disk under the configured media root. The default local path is `storage/`.

## Inference Strategy

Olanma is now provider-oriented rather than model-runtime-oriented.

That means:

- chat goes through provider adapters
- embeddings go through provider APIs
- transcription goes through provider APIs

The backend does not currently ship local Whisper, sentence-transformers, or bundled PyTorch inference stacks.

## Main Backend Flows

### Chat Flow

1. User sends a message.
2. Backend resolves the active model and provider.
3. Optional RAG context is gathered from `asset_chunks`.
4. Provider adapter streams or returns the response.
5. Conversation messages are persisted.

### Asset Processing Flow

1. User uploads an asset.
2. Backend stores the file and creates a job row.
3. Celery worker processes the asset.
4. Transcript/content is extracted.
5. Summaries and key points are generated through an LLM provider.
6. Chunks are embedded and stored for retrieval when supported.

### Retrieval Flow

1. Query text is embedded.
2. `asset_chunks` are searched by cosine distance.
3. Top chunks are injected as context.
4. Response includes citation metadata.

## Provider Boundaries

Current support in code:

- OpenAI: chat, embeddings, transcription
- Anthropic: chat
- Gemini: chat, embeddings
- Ollama: chat, embeddings
- OpenRouter: chat, embeddings
- LiteLLM: chat, embeddings, transcription if the proxy exposes OpenAI-compatible endpoints
- Local OpenAI-compatible gateway: chat, embeddings, transcription if the gateway exposes those endpoints

## Important Current Caveats

- `/dashboard` is not a full analytics UI today; the route redirects to `/library`.
- Conversation deletion currently has side effects on referenced assets in the backend service layer and should be treated carefully until ownership semantics are tightened.
- Some older docs and comments outside this folder may still refer to local Whisper or broader collaboration features; this page reflects the current implementation, not those older references.

## Key Source Files

- App entry: [backend/app/main.py](../../backend/app/main.py)
- API router: [backend/app/api/v1/api.py](../../backend/app/api/v1/api.py)
- Worker tasks: [backend/app/workers/tasks.py](../../backend/app/workers/tasks.py)
- Chat orchestration: [backend/app/services/chat_service.py](../../backend/app/services/chat_service.py)
- LLM orchestration: [backend/app/services/llm_service.py](../../backend/app/services/llm_service.py)
- Provider catalog: [backend/app/services/provider_service.py](../../backend/app/services/provider_service.py)

Related:

- [Backend](../backend/README.md)
- [Frontend](../frontend/README.md)
- [Database](../database/README.md)
