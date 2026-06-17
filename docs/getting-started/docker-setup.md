# Docker Setup

This page covers the Docker Compose path that exists in the repo now.

## Prerequisites

- Docker Desktop or Docker Engine with Compose support
- enough local disk space for backend, frontend, PostgreSQL, and Redis images

## Quick Start

From the repo root:

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

The current Compose stack starts:

- `frontend`
- `backend`
- `celery-worker`
- `postgres`
- `redis`

## Ports

- frontend: `http://localhost:3000`
- backend: `http://localhost:8000`
- postgres: `localhost:5432`
- redis: `localhost:6379`

## Current Runtime Shape

The Compose file mounts persistent volumes for:

- PostgreSQL data
- Redis data
- backend media storage

The database image is `pgvector/pgvector:pg17`, which is the easiest way to satisfy the backend vector requirement locally.

## Common Commands

Start:

```bash
docker compose up --build
```

Detached:

```bash
docker compose up -d --build
```

Logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f celery-worker
```

Stop:

```bash
docker compose down
```

Remove volumes:

```bash
docker compose down -v
```

## What To Expect

- frontend talks to the backend through `NEXT_PUBLIC_API_BASE_URL`
- backend and worker read config from `backend/.env`
- uploaded files are stored in the shared media volume
- long-running asset processing happens in `celery-worker`

## Common Problems

- missing `backend/.env`
- provider secret or JWT secrets not set
- ports already in use
- worker not healthy, leaving uploads pending
- stale Docker build cache after dependency changes

For a full local confidence check before pushing:

```bash
./pre-push.sh
```

Continue with:

- [First Steps](./first-steps.md)
- [Deployment](../deployment/README.md)
- [Troubleshooting](../troubleshooting/README.md)
