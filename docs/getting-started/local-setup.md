# Local Setup

This page is the detailed local-development companion to [Getting Started](./README.md).

## Prerequisites

Recommended local toolchain:

- Python `3.12`
- `uv`
- Node.js `22`
- Corepack or `pnpm`
- PostgreSQL
- Redis
- `tesseract` for OCR-backed image extraction

Examples:

macOS with Homebrew:

```bash
brew install python@3.12 node postgresql redis tesseract
brew services start postgresql
brew services start redis
```

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y python3.12 python3.12-venv nodejs postgresql redis-server tesseract-ocr
sudo systemctl start postgresql
sudo systemctl start redis-server
```

## Backend Setup

```bash
cd backend
uv sync --group dev
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Backend default URL: `http://localhost:8000`

Important notes:

- This repo no longer depends on bundled local Whisper or sentence-transformers runtimes.
- Audio transcription and embeddings are provider-driven.
- `pgvector` must be available in your PostgreSQL instance.

## Worker Setup

Open a second terminal:

```bash
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Without the worker, uploads will remain pending.

## Frontend Setup

```bash
cd frontend
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Frontend default URL: `http://localhost:3000`

Default frontend env:

```env
NEXT_PUBLIC_APP_NAME=Olanma
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## First Verification

Backend health:

```bash
curl http://localhost:8000/health
```

Frontend routes to check:

- `/login`
- `/register`
- `/chat`
- `/library`
- `/processing`
- `/settings/providers`

Access note:

- `Providers` and `Models` are regular signed-in user surfaces.
- `Users` remains admin-only.
- `Workspace` includes personal account controls for all users and extra workspace controls for admins.

Notes:

- `/dashboard` redirects to `/library`.
- `/providers` redirects to `/settings/providers`.
- `/workspace` is currently a batch video intake flow.

## Common Local Commands

Backend:

```bash
cd backend
uv run ruff check .
uv run pytest
```

Frontend:

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Repo-wide verification:

```bash
./pre-push.sh
```

## Common Issues

- database missing `vector` extension
- Redis not running
- worker not running
- no provider configured for chat, embeddings, or transcription-capable flows

Continue with:

- [Configuration](./configuration.md)
- [First Steps](./first-steps.md)
- [Troubleshooting](../troubleshooting/README.md)
