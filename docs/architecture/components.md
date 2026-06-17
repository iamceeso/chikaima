# Components

This page breaks the current stack into the main components that actually matter when working in the repo.

## Frontend Components

Key route areas:

- auth pages
- chat
- library
- processing
- uploads
- settings
- workspace video intake

Key component domains:

- `components/chat`
- `components/assets`
- `components/providers`
- `components/settings`
- `components/layout`
- `components/ui`

Frontend responsibilities:

- collect user input
- stream chat responses
- manage authenticated API calls
- surface processing status and library state

## Backend API Components

Core route groups:

- auth
- users
- providers
- models
- chat
- documents
- audio
- video
- assets
- library
- jobs
- dashboard
- transcripts
- settings

The router entry point is [backend/app/api/v1/api.py](../../backend/app/api/v1/api.py).

## Service Components

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

Shared service responsibilities:

- orchestrate multi-step business logic
- isolate provider differences
- keep endpoint handlers thin

## Worker Components

The Celery worker processes:

- `document_analysis`
- `audio_transcription`
- `video_analysis`

This is the async side of the ingestion pipeline and is required for uploaded assets to finish processing.

## Storage Components

PostgreSQL stores:

- users
- providers and models
- conversations and messages
- assets
- transcripts and summaries
- jobs
- retrieval chunks

Redis handles:

- Celery broker traffic
- background job coordination

Filesystem storage holds:

- uploaded media
- derived local asset files written by processing services

## Provider Components

Current provider support in code:

- OpenAI: chat, embeddings, transcription
- Anthropic: chat
- Gemini: chat, embeddings
- Ollama: chat, embeddings
- OpenRouter: chat, embeddings
- LiteLLM: depends on exposed compatible endpoints
- local OpenAI-compatible gateway: depends on exposed compatible endpoints

Continue with:

- [System Overview](./system-overview.md)
- [Data Flow](./data-flow.md)
- [Features](../features/README.md)
