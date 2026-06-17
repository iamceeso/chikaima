# Deployment

This page describes the deployment paths that are actually present in the repo now.

## Supported Deployment Paths

### 1. Docker Compose

The repo ships a working local Compose stack in [docker-compose.yml](../../docker-compose.yml).

Services:

- frontend
- backend
- celery worker
- PostgreSQL with `pgvector`
- Redis

Start it with:

```bash
docker compose up --build
```

### 2. Tag-Based Container Publishing

The repo also ships GitHub Actions workflows for CI and image publishing:

- [ci.yml](../../.github/workflows/ci.yml)
- [docker-release.yml](../../.github/workflows/docker-release.yml)

Current release behavior:

- CI runs on pushes to `main`
- Docker publish runs on version tag pushes matching `v*`
- backend and frontend images are built for:
  - `linux/amd64`
  - `linux/arm64`

Images are published to GHCR.

## Local Verification Before Release

Use the repo helper:

```bash
./pre-push.sh
```

It currently runs:

- backend lint
- backend tests
- frontend lint
- frontend typecheck
- frontend unit tests
- frontend build
- backend Docker build
- frontend Docker build

## Version And Tag Flow

Use:

```bash
./version-patch.sh
```

Or pass an explicit version:

```bash
./version-patch.sh v0.1.6
```

The script updates:

- backend version
- frontend version
- backend lockfile
- frontend lockfile
- git commit
- git tag

## Current Environment Shape

The backend example variables live in [backend/.env.example](../../backend/.env.example).

Important production categories:

- database URL
- Redis URL
- JWT secrets
- provider secret key
- upload size limits
- media root
- CORS origins

Provider API keys are stored through the provider settings UI rather than as static global env vars.

## What This Repo Does Not Currently Ship

These older docs references were removed because the repo does not currently include them:

- Kubernetes manifests
- an Nginx deployment bundle
- Prometheus/Grafana integration files
- backup automation scripts checked into the repo
- a traditional `requirements.txt`-based production path

That does not mean those deployments are impossible, only that they are not first-class documented repo assets today.

## Practical Production Notes

- make sure `pgvector` is available in PostgreSQL
- run the Celery worker alongside the API
- use persistent storage for uploaded files
- validate provider configuration after deploy because chat and processing depend on it

Related:

- [Getting Started](../getting-started/README.md)
- [Development](../development/README.md)
- [Troubleshooting](../troubleshooting/README.md)
