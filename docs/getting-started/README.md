# Getting Started

This guide covers the setup paths that are real in the repository today.

## Recommended Paths

- Local development
  Best if you are changing code.
- Docker Compose
  Best if you want the whole stack up quickly with PostgreSQL, Redis, backend, frontend, and a Celery worker.

## Current Prerequisites

For local development:

- Python `3.12`
- `uv`
- Node.js `22`
- `pnpm` via Corepack or a direct install
- PostgreSQL
- Redis

For Docker:

- Docker Desktop or Docker Engine with Compose support

## Environment Variables

The backend example file is [backend/.env.example](../../backend/.env.example).

Minimum backend settings for local work:

```env
JWT_SECRET_KEY=change-me-development-secret
JWT_REFRESH_SECRET_KEY=change-me-too-development-secret
PROVIDER_SECRET_KEY=replace-with-32-char-secret-key
DATABASE_URL=postgresql+psycopg://chikaima:chikaima@localhost:5432/chikaima
REDIS_URL=redis://localhost:6379/0
```

## Local Development Setup

### 1. Backend

```bash
cd backend
uv sync --group dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

The backend serves on `http://localhost:8000` by default.

### 2. Worker

Open another terminal:

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

### 3. Frontend

```bash
cd frontend
corepack enable
pnpm install
pnpm dev
```

The frontend serves on `http://localhost:3000`.

## Docker Compose Setup

From the repo root:

```bash
docker compose up --build
```

This starts:

- frontend
- backend
- celery worker
- PostgreSQL
- Redis

The Compose file is [docker-compose.yml](../../docker-compose.yml).

## First Product Surfaces To Check

After startup, the main surfaces are:

- `/login`
- `/register`
- `/chat`
- `/library`
- `/processing`
- `/settings/providers`
- `/settings/models`
- `/settings/workspace`

Notes:

- `/dashboard` currently redirects to `/library`.
- `/providers` currently redirects to `/settings/providers`.
- `/workspace` is a video intake workflow, not the main chat surface.

## First Functional Steps

1. Register the first user.
2. Add at least one provider for your account in the provider settings page.
3. Confirm that models appear in your model settings page.
4. Upload a document, audio file, or video.
5. Wait for the processing job to finish.
6. Open chat and ask a question with RAG enabled.

Access note:

- `Providers` and `Models` are available to regular signed-in users.
- `Users` is reserved for admins.
- `Workspace` always includes account actions such as sign-out and clearing your own analysis history.

## Quick Verification Commands

Backend:

```bash
curl http://localhost:8000/health
```

Backend tests:

```bash
cd backend
uv run pytest
```

Frontend checks:

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Full local verification:

```bash
./pre-push.sh
```

## Common Setup Gotchas

- No provider configured
  Chat and retrieval need at least one enabled provider/model.
- No worker running
  Uploads will stay pending if Celery is not running.
- Database missing `pgvector`
  Use the provided `pgvector/pgvector` image in Docker or enable the extension in your local database.

Continue with:

- [Architecture](../architecture/README.md)
- [Features](../features/README.md)
- [Development](../development/README.md)
