# Olanma

Olanma is a self-hosted AI workspace for managing multiple AI providers and local models from one dashboard. This monorepo contains a Next.js frontend and a FastAPI backend, plus Docker orchestration for PostgreSQL, Redis, and Celery workers.

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

- User registration, login, logout, refresh tokens, password reset, and profile management
- Provider management for OpenAI, Anthropic, Gemini, Ollama, and OpenAI-compatible endpoints
- Chat workspace with streaming-ready API design, conversation folders, message editing, regeneration, and model selection
- Document, audio, and video ingestion endpoints with background-job orchestration
- Dashboard analytics for provider health, recent activity, uploads, and jobs

## Quick Start

### 1. Environment Files

Copy the provided example files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 2. Run with Docker

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 3. Local Development

Backend:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

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

## Authentication Flow

- Access tokens authenticate API requests
- Refresh tokens issue new access tokens
- Password reset endpoints support token-based reset flow
- Credentials are hashed, provider secrets are stored as encrypted payload placeholders ready for KMS or Vault integration

## Production Notes

- The backend uses a service/repository split to keep provider, auth, and job orchestration logic isolated.
- Chat, document, audio, and video features are scaffolded with provider abstraction hooks so real model integrations can be added safely.
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
