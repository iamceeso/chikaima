# Backend

This page describes the current FastAPI backend layout and the development patterns used in the repo.

## Tech Stack

- FastAPI
- SQLAlchemy 2.x
- Pydantic
- PostgreSQL
- Redis
- Celery
- `uv` for environment and dependency management
- `ruff` for linting
- `pytest` for tests

## Folder Layout

```text
backend/
├── app/
│   ├── api/
│   │   ├── deps/
│   │   └── v1/
│   │       ├── api.py
│   │       └── endpoints/
│   ├── core/
│   ├── models/
│   ├── repositories/
│   ├── schemas/
│   ├── services/
│   └── workers/
├── alembic/
├── tests/
├── pyproject.toml
└── uv.lock
```

## API Layer

The API surface is assembled in [api.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/api/v1/api.py).

Current endpoint groups:

- auth
- users
- assets
- providers
- models
- chat
- documents
- audio
- video
- library
- jobs
- dashboard
- transcripts
- settings

## Service Layer

The service layer contains most of the product logic.

Key services:

- `AuthService`
- `ChatService`
- `LLMService`
- `ProviderService`
- `TranscriptService`
- `EmbeddingsService`
- `TranscriptionProviderService`
- `LibraryService`
- `JobService`

Patterns used here:

- services own orchestration
- repositories handle repeated data-access patterns
- provider adapters isolate vendor-specific APIs
- workers call services instead of duplicating logic

## Provider Architecture

Provider runtime behavior is split across:

- provider catalog and model syncing in [provider_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/provider_service.py)
- adapter selection in [factory.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/providers/factory.py)
- provider-specific request formatting in [base.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/providers/base.py)

This is one of the stronger parts of the codebase. It keeps chat, embeddings, and transcription flows relatively decoupled from individual vendors.

## Background Processing

Celery workers process uploaded assets.

Current job types:

- `audio_transcription`
- `video_analysis`
- `document_analysis`

Entry points:

- job creation: [job_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/job_service.py)
- worker app: [celery_app.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/workers/celery_app.py)
- task execution: [tasks.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/workers/tasks.py)

## Retrieval And Media Intelligence

The current RAG flow is built around:

- transcript/content extraction
- chunk creation
- provider-based embeddings
- `asset_chunks` cosine search with `pgvector`
- citation injection into chat responses

This is reflected in:

- [embeddings_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/embeddings_service.py)
- [asset_search_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_search_service.py)
- [transcript_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/transcript_service.py)

## Current Strengths

- clear service-oriented backend structure
- solid provider abstraction
- meaningful test coverage across services and endpoints
- async work correctly separated into a worker process

## Current Weak Spots

- some ownership semantics are still muddy, especially around conversation deletion versus asset deletion
- there is still some legacy surface area, such as the older `Embedding` table coexisting beside `asset_chunks`
- there are a few unused or stale dependencies outside the docs set, such as `google-generativeai`

## Useful Commands

Install:

```bash
cd backend
uv sync --group dev
```

Run API:

```bash
uv run uvicorn app.main:app --reload
```

Run worker:

```bash
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Run tests:

```bash
uv run pytest
```

Lint:

```bash
uv run ruff check .
```

Related:

- [API](../api/README.md)
- [Database](../database/README.md)
- [Development](../development/README.md)
