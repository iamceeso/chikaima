# Contributing to Chikaima

Thanks for helping improve Chikaima. Chikaima is a self-hosted, local-first AI media intelligence workspace for understanding audio, video, and documents with multiple AI providers. It's a single Next.js application (App Router, TypeScript) with an embedded SQLite database, vector store, and background job worker.

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
- `CODE_OF_CONDUCT.md` for community expectations

Do not commit secrets, provider API keys, local database data, uploaded media, or generated credentials.

## Development environment

### Prerequisites

- Node.js 22
- `pnpm`

Docker Compose can run the full app, including the persisted SQLite/media volumes.

### App setup

```bash
corepack enable
pnpm install
pnpm dev
```

The app serves on `http://localhost:3000` and hosts both the UI and its `/api/v1/*` API routes — there is no separate backend process to run.

### Docker Compose setup

From the repository root:

```bash
docker compose up --build
```

Compose keeps its runtime environment inline in `docker-compose.yml` and starts the single `frontend` service, with named volumes for the SQLite database and media storage.

## Repository layout

- `app/`, `components/`, `core/`, `hooks/`, `lib/`, `services/`, `store/`, `tests/`, and related root config files - the Next.js application, API route handlers, framework-independent business logic, and tests
- `docker-compose.yml` - local/production orchestration
- `pre-push.sh` - local verification script

`core/**` must stay framework-independent — it cannot import from `next` (enforced by an ESLint rule). Route handlers under `app/api/v1/**` should stay thin: parse the request, call into `core/**`, shape the response.

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

- Next.js (App Router), React, TypeScript, Tailwind CSS, and React Query for the UI
- Drizzle ORM over `better-sqlite3` and `sqlite-vec` for relational data and vector search
- `pnpm`, ESLint, TypeScript checks, and Node's built-in test runner for development

Extend the current patterns instead of introducing a parallel framework or tooling path.

### Keep boundaries clear

- Keep request parsing, auth extraction, and response shaping in `app/api/v1/**` route handlers.
- Keep reusable business logic in the appropriate `core/**` service.
- Keep provider-specific logic behind the existing provider adapter abstractions.
- Keep shared frontend API calls, stores, and UI components in their established locations (`services/api.ts`, `store/`, `components/`).
- Avoid coupling frontend behaviour to implementation details that already have API boundaries.

### Handle errors explicitly

Chikaima handles user accounts, provider credentials, uploaded media, background jobs, retrieval, and generated AI responses. Silent failures are hard to diagnose in those flows. Prefer explicit validation, actionable errors (via `core/errors.ts`'s `HttpError` helpers), and tests for edge cases.

### Protect sensitive data

Be careful with contributions that affect:

- authentication and workspace admin behaviour
- provider credential storage (encrypted via `core/crypto`)
- media upload and processing
- document extraction and transcription
- retrieval and embeddings
- background job retries
- database schema/migrations (`core/db/migrations`)

Changes in these areas should include tests and a clear explanation of security or operational impact.

## Tests and validation

App checks:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Version bump when needed:

```bash
pnpm version patch
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
- background jobs
- reusable frontend stores, services, or utilities

For UI-only copy or documentation changes, tests are usually not necessary unless behaviour also changed.

## Documentation expectations

Update docs in the same pull request when behaviour changes. Good documentation changes are specific, current, and example-driven.

## Pull request guidance

When opening a pull request:

- use a clear title
- explain the problem being solved
- summarize the approach
- note tradeoffs or follow-up work
- include screenshots or recordings for meaningful UI changes
- mention manual verification steps reviewers can use
- call out changes to auth, provider credentials, uploads, processing jobs, database schema, or generated AI behaviour

## Suggested PR checklist

Before requesting review, confirm that:

- the branch contains only the intended changes
- relevant app checks pass locally
- new behaviour is covered by tests when appropriate
- docs were updated when behaviour changed
- no secrets, tokens, local databases, uploaded media, or generated artifacts were committed

## Community expectations

By participating in this project, you agree to follow `CODE_OF_CONDUCT.md`.

Be respectful, constructive, and specific in issues, reviews, and pull requests.
