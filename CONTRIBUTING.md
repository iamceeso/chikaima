# Contributing to Chikaima

Thanks for helping improve Chikaima. Chikaima is a self-hosted AI media intelligence workspace for understanding audio, video, and documents with multiple AI providers. The repository is a monorepo with a Next.js frontend, a FastAPI backend, PostgreSQL with `pgvector`, Redis, and Celery workers.

This guide explains how to contribute code, tests, docs, and fixes in a way that matches the current repository.

## Ways to contribute

Helpful contributions include:

- fixing bugs
- improving tests
- tightening validation, auth, or provider handling
- refining the chat, library, processing, or settings UX
- improving docs and examples
- reporting bugs with clear reproduction steps
- proposing focused enhancements

If you are planning a larger change, open an issue or discussion first so the approach can be aligned before you invest time in implementation.

## Before you start

Please review:

- `README.md` for the project overview
- `docs/README.md` for the full documentation map
- `docs/getting-started/README.md` for local and Docker setup
- `CODE_OF_CONDUCT.md` for community expectations

Do not commit secrets, provider API keys, local database data, uploaded media, or generated credentials.

## Development environment

### Prerequisites

Backend:

- Python 3.12
- `uv`
- PostgreSQL with `pgvector`
- Redis

Frontend:

- Node.js 22
- `pnpm`

Docker Compose can run the full stack, including PostgreSQL, Redis, the backend, the frontend, and a Celery worker.

### Backend setup

```bash
cd backend
uv sync --group dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

The backend serves on `http://localhost:8000`.

### Worker setup

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

### Frontend setup

```bash
cd frontend
corepack enable
pnpm install
pnpm dev
```

The frontend serves on `http://localhost:3000`.

### Docker Compose setup

From the repository root:

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

See `docs/getting-started/README.md` for full environment details and first-run checks.

## Repository layout

- `frontend/` - Next.js app, React components, frontend services, stores, and UI tests
- `backend/` - FastAPI app, SQLAlchemy models, Alembic migrations, provider integrations, Celery workers, and backend tests
- `docs/` - current product, architecture, API, development, deployment, and troubleshooting documentation
- `docker-compose.yml` - local full-stack orchestration
- `pre-push.sh` - local verification script
- `version-patch.sh` - release version helper

When adding code, place it near the feature it supports and reuse existing helpers before introducing new abstractions.

## Recommended workflow

1. Fork the repository and create a focused branch.
2. Sync with the latest default branch before starting work.
3. Make a small, reviewable change.
4. Add or update tests when behaviour changes.
5. Run validation locally before opening a pull request.
6. Update docs if your change affects setup, APIs, configuration, deployment, or contributor expectations.

Favor narrow pull requests over mixed, unrelated changes.

## Coding guidelines

### Follow the existing stack

Chikaima currently uses:

- FastAPI, SQLAlchemy, Alembic, Celery, Redis, PostgreSQL, and `pgvector` in the backend
- `uv`, `pytest`, and `ruff` for Python development
- Next.js, React, TypeScript, Tailwind CSS, and React Query in the frontend
- `pnpm`, ESLint, TypeScript checks, and Node's built-in test runner for frontend development

Extend the current patterns instead of introducing a parallel framework or tooling path.

### Keep boundaries clear

- Keep API and request validation close to backend route handlers or schemas.
- Keep reusable backend behaviour in the appropriate service layer.
- Keep provider-specific logic behind the existing provider abstractions.
- Keep shared frontend API calls, stores, and UI components in their established locations.
- Avoid coupling frontend behaviour to implementation details that already have API boundaries.

### Handle errors explicitly

Chikaima handles user accounts, provider credentials, uploaded media, background jobs, retrieval, and generated AI responses. Silent failures are hard to diagnose in those flows. Prefer explicit validation, actionable errors, and tests for edge cases.

### Protect sensitive data

Be careful with contributions that affect:

- authentication and workspace admin behaviour
- provider credential storage
- media upload and processing
- document extraction and transcription
- retrieval and embeddings
- background job retries
- database migrations

Changes in these areas should include tests and a clear explanation of security or operational impact.

## Tests and validation

Backend checks:

```bash
cd backend
uv run ruff check .
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

Full local verification from the repository root:

```bash
./pre-push.sh
```

### When to add tests

Add or update tests when your contribution changes:

- authentication, authorization, or workspace behaviour
- API request or response behaviour
- provider, model, transcription, embedding, or chat logic
- asset upload, extraction, storage, search, or processing behaviour
- background jobs or cache behaviour
- reusable frontend stores, services, or utilities

For UI-only copy or documentation changes, tests are usually not necessary unless behaviour also changed.

## Documentation expectations

Update docs in the same pull request when behaviour changes.

Examples:

- update `README.md` for project-level overview changes
- update `docs/getting-started/README.md` when setup or first-run behaviour changes
- update `docs/api/README.md` when endpoints change
- update `docs/backend/README.md` or `docs/frontend/README.md` when implementation structure changes
- update `docs/deployment/README.md` when deployment behaviour changes

Good documentation changes are specific, current, and example-driven.

## Pull request guidance

When opening a pull request:

- use a clear title
- explain the problem being solved
- summarize the approach
- note tradeoffs or follow-up work
- include screenshots or recordings for meaningful UI changes
- mention manual verification steps reviewers can use
- call out changes to auth, provider credentials, uploads, processing jobs, database migrations, or generated AI behaviour

## Suggested PR checklist

Before requesting review, confirm that:

- the branch contains only the intended changes
- relevant backend and frontend checks pass locally
- new behaviour is covered by tests when appropriate
- docs were updated when behaviour changed
- no secrets, tokens, local databases, uploaded media, or generated artifacts were committed

## Community expectations

By participating in this project, you agree to follow `CODE_OF_CONDUCT.md`.

Be respectful, constructive, and specific in issues, reviews, and pull requests.
