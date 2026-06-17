# Development

This page documents the current development workflow used by the repo.

## Tooling

Backend:

- Python `3.12`
- `uv`
- `pytest`
- `ruff`

Frontend:

- Node `22`
- `pnpm`
- TypeScript
- ESLint

## Daily Commands

Backend install:

```bash
cd backend
uv sync --group dev
```

Backend checks:

```bash
uv run ruff check .
uv run pytest
```

Frontend install:

```bash
cd frontend
corepack enable
pnpm install
```

Frontend checks:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

## Local Full-Stack Validation

From the repo root:

```bash
./pre-push.sh
```

This is the closest thing to a local CI gate and should be your default confidence check before pushing.

## Versioning And Releases

The current release helper is:

```bash
./version-patch.sh
```

Behavior:

- no argument increments the patch version
- explicit versions are accepted with or without a leading `v`
- backend and frontend versions are kept in sync
- lockfiles are refreshed
- a commit and tag are created

## CI Behavior

Current workflows:

- `main` branch pushes run backend and frontend checks on Ubuntu and macOS
- version tag pushes build and publish backend and frontend images to GHCR

The workflow files are:

- [ci.yml](../../.github/workflows/ci.yml)
- [docker-release.yml](../../.github/workflows/docker-release.yml)

## Current Repo Conventions

- backend dependency management uses `uv`
- frontend dependency management uses `pnpm`
- backend tests use `pytest`
- frontend tests use the TypeScript compile-to-Node flow in `package.json`
- manual version changes should generally go through `version-patch.sh`

## Current Improvement Areas

These are worth knowing as a contributor:

- the docs have historically drifted from the code; keep docs edits close to behavior changes
- there is some stale repo clutter such as an unused dashboard draft page
- ownership semantics around conversation deletion and asset deletion need care before changing adjacent behavior

Related:

- [Backend](../backend/README.md)
- [Frontend](../frontend/README.md)
- [Guides](../guides/README.md)
