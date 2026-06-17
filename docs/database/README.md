# Database

Chikaima uses PostgreSQL as the primary store and `pgvector` for retrieval over asset chunks.

## ORM And Migrations

- ORM: SQLAlchemy
- migrations: Alembic
- vector support: `pgvector`

The backend attempts to enable the `vector` extension on startup in [backend/app/main.py](../../backend/app/main.py).

## Active Tables / Models

These are the current model files in `backend/app/models`.

Core identity and workspace:

- `users`
- `settings`
- `workspace_configs`

Chat:

- `conversations`
- `messages`

Providers:

- `providers`
- `ai_models`

Media and knowledge:

- `documents`
- `audio_assets`
- `videos`
- `transcripts`
- `summary_artifacts`
- `asset_chunks`
- `embeddings`

Operations:

- `jobs`

## What Each Area Stores

### Users

Authentication and account-level flags.

### Providers And Models

- provider connection metadata
- encrypted provider config
- synced model catalog
- default/available model flags

### Conversations And Messages

- chat history
- chosen model
- attachment metadata
- response/provider metadata

### Documents, Audio, And Videos

- uploaded asset identity
- processing status
- summary/transcript fields on the asset itself

### Transcripts And Summaries

- canonical transcript body
- summary artifacts such as summary text and key points

### Asset Chunks

This is the main retrieval table used for current RAG.

It stores:

- source identity
- chunk text
- vector embedding
- location metadata for citations

### Legacy `embeddings` Table

There is also an `embeddings` table still present in the model set. It is used in cleanup paths, but the current retrieval flow is centered on `asset_chunks`.

That means the database has some transitional shape today, and future cleanup may consolidate more of this logic.

## Ownership Model

Current storage relationships are mostly user-scoped through `user_id`.

Important practical note:

- deletion paths for assets also clear transcripts, summaries, jobs, legacy embeddings, and asset chunks

## Current Database Caveats

- collaboration/workspace membership tables described in older docs are not part of the current model set
- older docs that mention `is_deleted` conversation soft-delete or workspace collaborator tables are outdated
- the live retrieval path is tied to the fixed `asset_chunks.embedding` vector width configured in the backend settings

## Useful Commands

Apply migrations:

```bash
cd backend
uv run alembic upgrade head
```

Create a migration:

```bash
uv run alembic revision --autogenerate -m "describe change"
```

Related:

- [Backend](../backend/README.md)
- [Architecture](../architecture/README.md)
- [Development](../development/README.md)
