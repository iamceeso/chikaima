# Chikaima Documentation

This docs tree is the current high-level reference for the Chikaima monorepo.

## What is Chikaima

Chikaima is a self-hosted AI workspace built around:

- a Next.js frontend
- a FastAPI backend
- PostgreSQL with `pgvector`
- Redis and Celery for background jobs
- provider-based AI integration instead of bundled local model runtimes

The product focuses on chat, uploaded media, summaries, retrieval, and provider orchestration.

## Docs Map

Start here:

- [Getting Started](./getting-started/README.md)
  Covers local setup, Docker Compose, required environment variables, and first-run product checks.
- [Features](./features/README.md)
  Explains what is currently shipped, including provider capability boundaries.

Understand the system:

- [Architecture](./architecture/README.md)
  Describes the current system shape, runtime components, data flow, and provider boundaries.
- [Frontend](./frontend/README.md)
  Documents the app routes, UI organization, state usage, and feature surfaces.
- [Backend](./backend/README.md)
  Documents API structure, services, workers, and provider abstractions.
- [API](./api/README.md)
  Summarizes the live REST and streaming endpoints exposed by the backend today.
- [Database](./database/README.md)
  Lists the active tables/models and the data they are responsible for.

Build, ship, and maintain:

- [Development](./development/README.md)
  Covers local workflows, test commands, release/version scripts, and repo conventions.
- [Deployment](./deployment/README.md)
  Covers Docker Compose, CI, tag-based image publishing, and operational notes.
- [Guides](./guides/README.md)
  Practical implementation notes for extending providers, endpoints, and processing flows.
- [Troubleshooting](./troubleshooting/README.md)
  Common issues that match the current stack and scripts.

## Ground Rules For These Docs

- These pages describe the code that exists in this repository now.
- Planned features are called out explicitly as planned, not implied as shipped.
- If the docs and code disagree, the code wins and the docs should be updated.

## Current Reality Check

Today the repo ships:

- user authentication and workspace-level admin controls
- provider and model management
- chat with streaming responses
- retrieval-augmented responses using stored asset chunks
- document, audio, and video ingestion
- background processing for transcription, extraction, and summarization
- library and processing views in the frontend
- local and CI Docker build flows

The docs do not assume:

- Kubernetes manifests
- built-in local Whisper or sentence-transformers runtimes
- collaboration roles beyond the current user/admin model
- soft-delete and recovery flows
- webhook, Zapier, or plugin ecosystems

## Related Files

- Root project overview: [README.md](https://github.com/iamceeso/chikaima/blob/main/README.md)
- Backend config example: [backend/.env.example](https://github.com/iamceeso/chikaima/blob/main/backend/.env.example)
- Local verification script: [pre-push.sh](https://github.com/iamceeso/chikaima/blob/main/pre-push.sh)
- Version/tag helper: [version-patch.sh](https://github.com/iamceeso/chikaima/blob/main/version-patch.sh)

Last reviewed against the codebase: June 25, 2026.
