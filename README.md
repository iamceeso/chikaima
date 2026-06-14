<p align="center">
  <img src="frontend/public/olanma-logo.png" alt="Olanma logo" width="120" />
</p>

# Olanma prononced OR-LAN-MA

Olanma (or-lan-ma) is a self-hosted AI media intelligence workspace for understanding audio, video, and documents with multiple AI providers. This monorepo contains a Next.js frontend and a FastAPI backend, plus Docker orchestration for PostgreSQL, Redis, and Celery workers.

## Monorepo Structure

```text
olanma/
├── frontend/
├── backend/
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Stack

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- TanStack Query
- Zustand
- React Hook Form
- Zod
- shadcn-inspired UI primitives

### Backend

- FastAPI
- SQLAlchemy 2.0
- PostgreSQL
- Redis
- Alembic
- Pydantic v2
- JWT authentication with refresh tokens
- Celery background jobs

## Key Features

- User registration, login, logout, refresh tokens, and profile management
- Provider management for OpenAI, Anthropic, Gemini, Ollama, OpenRouter, and LiteLLM-backed endpoints
- Audio, video, and document ingestion with persisted uploads
- Background processing through PostgreSQL-backed jobs and Celery workers
- Transcript and summary artifact foundations for media understanding workflows
- Transcript Q&A support through provider-backed reasoning

## Quick Start

### 1. Environment Files

Copy the provided example files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 2. Run with Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs` when enabled in workspace settings
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The Docker images install native `ffmpeg` and `tesseract-ocr`, and the backend uses `openai-whisper` for audio/video transcription. In local development, `imageio-ffmpeg` bundles an `ffmpeg` binary automatically so `uv sync` is enough for the Whisper pipeline. Startup now fails fast if Whisper cannot see `ffmpeg`.

### 3. Local Development

Start both frontend and backend from the repo root:

```bash
./start-dev.sh
```

Or run each service manually:

Backend:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend startup validates `ffmpeg` before serving requests. It prefers `FFMPEG_BINARY_PATH` when set, then a system `ffmpeg`, and finally falls back to the bundled `imageio-ffmpeg` binary.

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

Celery worker:

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Upload limits are configuration-based:

- `DOCUMENT_UPLOAD_MAX_MEGABYTES=100`
- `AUDIO_UPLOAD_MAX_MEGABYTES=512`
- `VIDEO_UPLOAD_MAX_MEGABYTES=2048`

If you deploy behind Nginx or another reverse proxy, make sure its body-size limit is at least as large as the relevant backend setting.

### 4. Connect OpenAI First

To use provider-backed transcript Q&A right away:

1. Register or sign in.
2. Open the `Providers` page.
3. Add an `OpenAI` provider with your `sk-...` API key.
4. Go to `Ask` and send a message.

The first enabled model is used for live replies. Provider integrations are available through the configured adapter set in the workspace.

## API Surface

Versioned endpoints live under `/api/v1`:

- `/auth`
- `/users`
- `/providers`
- `/models`
- `/chat`
- `/documents`
- `/audio`
- `/video`
- `/jobs`
- `/transcripts`

## Authentication Flow

- Access tokens authenticate API requests
- Refresh tokens issue new access tokens
- Password reset delivery is not configured in this release; use admin-managed account recovery instead
- In non-production environments, password reset tokens are written to backend logs for local testing only
- Credentials are hashed, and provider secrets are encrypted at rest using the configured `PROVIDER_SECRET_KEY`

## Production Notes

- The backend uses a service/repository split to keep provider, auth, and job orchestration logic isolated.
- Upload persistence now goes through a storage service rooted at `MEDIA_ROOT`, with a shared Docker volume for backend and worker access.
- OpenAI-backed reasoning is wired first through the provider system; other provider adapters can be added behind the same service boundary.
- Celery jobs and SQL-backed job records provide trackable processing state for long-running media workflows.
- The frontend uses a shared API client, React Query for server state, and Zustand for session/chat UI state.

## Repository Setup

This repo is intended to be initialized from the root so both applications are versioned together:

```bash
git init
git add .
git commit -m "Initial Olanma platform foundation"
```

If you previously initialized Git inside `backend/`, remove that nested `.git` directory before running the root `git init`.
