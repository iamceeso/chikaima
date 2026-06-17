# Troubleshooting

These notes match the current stack and scripts in the repo.

## Backend Will Not Start

Check:

```bash
cd backend
uv sync --group dev
uv run uvicorn app.main:app --reload
```

Common causes:

- missing `.env`
- invalid JWT or provider secret settings
- PostgreSQL not reachable
- Redis not reachable

## Uploads Stay Pending

The API can accept uploads while the worker is down.

If files stay `pending`, start the worker:

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Also verify Redis is reachable.

## Retrieval Returns Nothing

Common causes:

- no embedding-capable provider is configured
- asset processing has not completed
- embeddings provider request failed during chunk indexing

Check provider configuration first:

- OpenAI
- Gemini
- Ollama
- OpenRouter
- LiteLLM
- local OpenAI-compatible gateway

Anthropic does not currently provide embeddings in Olanma.

## Audio Or Video Transcription Fails

Current transcription is provider-based.

That means you need an enabled transcription-capable provider path, currently:

- OpenAI
- LiteLLM with OpenAI-compatible transcription endpoints
- local OpenAI-compatible gateway with the same endpoint shape

Gemini, Anthropic, Ollama, and OpenRouter are not currently used for the transcription flow in this codebase.

## Docker Build Issues

Use:

```bash
./pre-push.sh
```

This builds both Docker images locally and catches many CI failures before tagging.

If Docker image size looks wrong, re-check:

- `.dockerignore`
- multi-stage Dockerfiles
- dependency lockfiles

## CI Passed Locally But GitHub Failed

Local success is a strong signal, but not a guarantee.

Common differences:

- registry/network behavior
- clean checkout behavior
- cross-platform image builds
- secrets and tag-based workflow conditions

Check the relevant workflow:

- [ci.yml](../../.github/workflows/ci.yml)
- [docker-release.yml](../../.github/workflows/docker-release.yml)

## `pgvector` Problems

The backend expects the PostgreSQL `vector` extension to exist.

In Docker Compose this is handled by the `pgvector/pgvector` image.

If running your own database, make sure the extension can be created:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Confusing Provider Behavior

Current provider support is intentionally uneven:

- Anthropic: chat only
- Gemini: chat and embeddings
- Ollama: chat and embeddings
- OpenAI: chat, embeddings, transcription
- OpenRouter: chat and embeddings
- LiteLLM: depends on proxy-exposed endpoints
- local gateway: depends on gateway-exposed endpoints

If the UI and behavior ever disagree, trust the current backend services and update the docs.

## Release/Tag Problems

Use the helper instead of editing versions manually:

```bash
./version-patch.sh
```

If it refuses to run, it usually means:

- the working tree is not clean
- the tag already exists
- `uv` or `pnpm` is not available

Related:

- [Getting Started](../getting-started/README.md)
- [Deployment](../deployment/README.md)
- [Development](../development/README.md)
