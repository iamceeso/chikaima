# Configuration

This page documents the configuration surfaces that actually exist in the repo today.

## Backend Environment

The source of truth is [backend/.env.example](https://github.com/iamceeso/chikaima/blob/main/backend/.env.example).

Current variables:

```env
APP_NAME=Chikaima API
APP_ENV=development
APP_DEBUG=true
API_V1_PREFIX=/api/v1
DATABASE_URL=postgresql+psycopg://chikaima:chikaima@localhost:5432/chikaima
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

What these control:

- app identity and environment mode
- JWT auth behavior
- database and Redis connections
- encrypted provider-secret handling
- upload limits
- CORS
- local file storage
- Ollama base URL for local/provider-hosted Ollama setups

## Frontend Environment

The source of truth is [frontend/.env.example](https://github.com/iamceeso/chikaima/blob/main/frontend/.env.example).

Current variables:

```env
NEXT_PUBLIC_APP_NAME=Chikaima
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## Provider Configuration

The app does not currently rely on global provider env vars like `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for its main product flow.

Instead:

- providers are created in the UI
- credentials are stored through backend provider management
- model lists are synced per provider and scoped per user/public workspace actor

This is an intentional part of the current product shape.

## Workspace Settings

The backend currently exposes workspace settings for:

- authentication enable/disable
- public registration enable/disable
- docs visibility
- vision-aware behavior
- workspace model visibility/defaults

These are managed through the API and settings UI, not through dozens of feature-flag env vars.

Current access split:

- workspace auth/docs/registration/vision settings are admin-controlled
- provider setup and model availability/default selection are user-scoped
- when authentication is disabled, provider/model state is attached to the shared public workspace actor

## Production Notes

- keep JWT secrets and provider secret keys strong
- use a persistent `MEDIA_ROOT`
- make sure PostgreSQL supports `pgvector`
- run a Celery worker alongside the API

## What Is Not Part Of Current Config

These older doc concepts are not first-class repo configuration today:

- bundled Whisper model settings
- Cohere or HuggingFace env setup docs
- Kubernetes secret manifests checked into the repo
- collaboration/workspace-membership feature flags
- SQLite as a supported main local path for this app

Continue with:

- [Local Setup](./local-setup.md)
- [Docker Setup](./docker-setup.md)
- [Deployment](../deployment/README.md)
