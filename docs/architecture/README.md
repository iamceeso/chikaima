# Architecture

This page describes the current architecture that exists in the repo today.

## High-Level Shape

```text
Browser
        |
        v
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

Chikaima is intentionally provider-based: it stores conversations, assets, transcripts, summaries, and vectors while orchestrating provider calls. It does not bundle local Whisper, sentence-transformers, or PyTorch-serving stacks as core architecture.

## Core Runtime Components

### Frontend

The frontend is a Next.js App Router application with route groups for:

- auth flows
- chat
- media library
- processing queue
- user-scoped provider and model settings
- workspace/account settings

### Backend

The backend is a FastAPI app with:

- JWT-based auth
- provider and model management
- chat and SSE streaming
- asset ingestion APIs
- transcript/summary APIs
- workspace settings APIs

Core route groups:

- auth
- users
- providers and models
- chat
- documents, audio, video, assets, and library
- jobs, dashboard, transcripts, and settings

The router entry point is [backend/app/api/v1/api.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/api/v1/api.py).

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

## Key Component Areas

Frontend component domains:

- `components/chat`
- `components/assets`
- `components/providers`
- `components/settings`
- `components/layout`
- `components/ui`

Important backend services:

- `AuthService`
- `ChatService`
- `LLMService`
- `ProviderService`
- `EmbeddingsService`
- `TranscriptionProviderService`
- `TranscriptService`
- `LibraryService`
- `JobService`

Shared backend services keep endpoint handlers thin, isolate provider differences, and orchestrate multi-step product behavior.

## Inference Strategy

Chikaima is now provider-oriented rather than model-runtime-oriented.

That means:

- chat goes through provider adapters
- embeddings go through provider APIs
- transcription goes through provider APIs

The backend does not currently ship local Whisper, sentence-transformers, or bundled PyTorch inference stacks.

## Main Backend Flows

### Chat Flow

1. The frontend sends a chat request to the backend.
2. The backend authenticates the user and loads the conversation.
3. The selected model and provider are resolved.
4. Optional RAG context is gathered from `asset_chunks`.
5. The provider adapter streams or returns the response.
6. SSE events are sent back to the frontend as `metadata`, `token`, `done`, or `error`.
7. The assistant message is persisted after a successful completion.

### Asset Processing Flow

1. User uploads an asset.
2. Backend stores the file and creates a job row.
3. Celery worker processes the asset.
4. Transcript/content is extracted.
5. Summaries and key points are generated through an LLM provider.
6. Chunks are embedded and stored for retrieval when supported.

### Retrieval Flow

1. The user asks a question.
2. The query is embedded through the configured provider path.
3. Similar rows are fetched from `asset_chunks`.
4. The top matches are formatted into context and citations.
5. The final provider request includes that context.

### Provider Flow

1. A signed-in user configures a provider in the settings UI.
2. The backend stores encrypted provider configuration.
3. Supported models are synced and stored in `ai_models`.
4. Chat, embeddings, and transcription services select the provider path at runtime.

Current ownership behavior:

- providers and synced models belong to the current user when workspace auth is enabled
- when workspace auth is disabled, they belong to the shared public workspace actor
- workspace-level auth/docs/registration toggles are still admin-owned

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
- Anthropic is currently used for chat, not embeddings or transcription.
- Some older docs and comments outside this folder may still refer to local Whisper or broader collaboration features; this page reflects the current implementation, not those older references.

## Key Source Files

- App entry: [backend/app/main.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/main.py)
- API router: [backend/app/api/v1/api.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/api/v1/api.py)
- Worker tasks: [backend/app/workers/tasks.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/workers/tasks.py)
- Chat orchestration: [backend/app/services/chat_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/chat_service.py)
- LLM orchestration: [backend/app/services/llm_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/llm_service.py)
- Provider catalog: [backend/app/services/provider_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/provider_service.py)
- Job orchestration: [backend/app/services/job_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/job_service.py)
- Asset processing: [backend/app/services/asset_processors.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_processors.py)
- Asset search: [backend/app/services/asset_search_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_search_service.py)

Related:

- [Backend](../backend/README.md)
- [Frontend](../frontend/README.md)
- [Database](../database/README.md)
