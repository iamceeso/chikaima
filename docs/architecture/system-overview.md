# System Overview

This page expands on the high-level view from [Architecture](./README.md).

## Runtime Topology

```text
Browser
  |
  v
Next.js frontend
  |
  v
FastAPI backend
  |
  +--> PostgreSQL + pgvector
  |
  +--> Redis
  |
  +--> Provider APIs
        OpenAI / Anthropic / Gemini / Ollama / OpenRouter / LiteLLM / local gateway

Celery worker
  |
  +--> PostgreSQL + pgvector
  +--> Redis
  +--> Provider APIs
```

## What Each Layer Does

Frontend:

- authentication flows
- chat UI
- library and processing views
- provider/model settings
- workspace/admin settings

Backend:

- auth and authorization
- API validation
- provider orchestration
- chat streaming
- asset ingestion
- retrieval and citation assembly

Worker:

- document analysis
- audio transcription through configured providers
- video analysis
- summary and chunk generation

Data services:

- PostgreSQL stores app state
- `pgvector` supports similarity search on asset chunks
- Redis brokers Celery jobs

## Architecture Direction

The current system is intentionally provider-based.

Olanma:

- stores conversations, assets, transcripts, summaries, and vectors
- orchestrates model/provider calls
- does not aim to bundle heavyweight local ML runtimes into the core backend image

That is why the current docs no longer describe local Whisper, local sentence-transformers, or a PyTorch-serving stack as core architecture.

## Current Caveats

- the frontend `/dashboard` route is still a redirect, not a full analytics product surface
- some older comments and historical docs outside the refreshed pages may still imply broader collaboration features than the code currently supports

Continue with:

- [Components](./components.md)
- [Data Flow](./data-flow.md)
- [Backend](../backend/README.md)
