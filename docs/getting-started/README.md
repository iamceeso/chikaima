# Getting Started

This guide covers the setup paths that are real in the repository today.

## Recommended Paths

- Local development best if you are changing code.
- Docker Compose best if you want the whole stack up quickly with PostgreSQL, Redis, backend, frontend, and a Celery worker.

## Current Prerequisites

For local development:

- Python `3.12`
- `uv`
- Node.js `22`
- `pnpm` via Corepack or a direct install
- Docker for local PostgreSQL + `pgvector` and Redis containers
- `tesseract` only if you run the backend outside Docker and need OCR for uploaded images

For Docker:

- Docker Desktop or Docker Engine with Compose support

## Configuration

The backend example file is [backend/.env.example](https://github.com/iamceeso/chikaima/blob/main/backend/.env.example).

Minimum backend settings for local work:

```env
JWT_SECRET_KEY=change-me-development-secret
JWT_REFRESH_SECRET_KEY=change-me-too-development-secret
PROVIDER_SECRET_KEY=replace-with-32-char-secret-key
DATABASE_URL=postgresql+psycopg://chikaima:chikaima@localhost:5433/chikaima
REDIS_URL=redis://localhost:6379/0
```

The full current backend environment shape is:

```env
APP_NAME=Chikaima API
APP_ENV=development
APP_DEBUG=true
API_V1_PREFIX=/api/v1
DATABASE_URL=postgresql+psycopg://chikaima:chikaima@localhost:5433/chikaima
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=change-me-development-secret
JWT_REFRESH_SECRET_KEY=change-me-too-development-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
PROVIDER_SECRET_KEY=replace-with-32-char-secret-key
CORS_ORIGINS=["http://localhost:3000"]
MEDIA_ROOT=storage
DOCUMENT_UPLOAD_MAX_MEGABYTES=100
AUDIO_UPLOAD_MAX_MEGABYTES=512
VIDEO_UPLOAD_MAX_MEGABYTES=2048
OLLAMA_BASE_URL=http://localhost:11434
```

Frontend defaults:

```env
NEXT_PUBLIC_APP_NAME=Chikaima
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

Provider credentials are configured in the app UI, not through global `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` style environment variables for the main product flow.

The backend Docker image already installs `tesseract-ocr`. For local backend runs outside Docker, install the `tesseract` system binary if you need OCR-backed image extraction; otherwise image uploads still process with a fallback description but no extracted OCR text.

## Local Development Setup

### 1. Start PostgreSQL And Redis

Start the local PostgreSQL + `pgvector` container before installing dependencies, running migrations, or starting the backend:
Notice the postgres port values `5433:5432`.

```bash
docker run -d \
  --name chikaima-postgres \
  -e POSTGRES_DB=chikaima \
  -e POSTGRES_USER=chikaima \
  -e POSTGRES_PASSWORD=chikaima \
  -p 5433:5432 \
  -v chikaima_postgres_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  pgvector/pgvector:pg17
```

Start Redis before starting the backend or worker:

```bash
docker run -d \
  --name chikaima-redis \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:alpine
```

The local database is available at `localhost:5433`, and Redis is available at `localhost:6379`.

If the containers already exist, start them instead:

```bash
docker start chikaima-postgres
docker start chikaima-redis
```

### 2. Backend

```bash
cd backend
uv sync --group dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

The backend serves on `http://localhost:8000` by default.

### 3. Worker

Open another terminal:

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

### 4. Frontend

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
cp backend/.env.example backend/.env
docker compose up --build
```

This starts:

- frontend
- backend
- celery worker
- PostgreSQL
- Redis

The Compose file is [docker-compose.yml](https://github.com/iamceeso/chikaima/blob/main/docker-compose.yml).

Ports:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8000`
- postgres: `localhost:5433`
- redis: `localhost:6379`

Common Compose commands:

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f celery-worker
docker compose down
```

To remove local Compose volumes:

```bash
docker compose down -v
```

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

## First Functional Steps

1. Register the first user.
2. Add at least one provider for your account in the provider settings page.
3. Confirm that models appear in your model settings page.
4. Upload a document, audio file, or video.
5. Wait for the processing job to finish.
6. Open chat and ask a question with RAG enabled.

Good smoke-test prompts:

- "Summarize this asset."
- "What are the key points?"
- "Which source supports that answer?"

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
