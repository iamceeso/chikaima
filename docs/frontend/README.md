# Frontend

This page documents the current Next.js frontend structure instead of the older aspirational layout.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- TanStack Query
- React Hook Form
- Zod
- Zustand
- Tailwind CSS

## App Routes That Exist Today

Public/auth:

- `/`
- `/login`
- `/register`

Protected app routes:

- `/chat`
- `/library`
- `/processing`
- `/uploads`
- `/workspace`
- `/settings`
- `/settings/models`
- `/settings/providers`
- `/settings/users`
- `/settings/workspace`

Redirect routes:

- `/dashboard` redirects to `/library`
- `/providers` redirects to `/settings/providers`

## Route Intent

- `/chat`
  Main conversation surface.
- `/library`
  Search and browse processed assets.
- `/processing`
  Track background jobs.
- `/uploads`
  Upload assets into the system.
- `/workspace`
  Batch video intake workflow.
- `/settings/*`
  Mixed account, provider/model, and admin control surfaces.

More specifically:

- `/settings/workspace`
  Personal account actions for all signed-in users, plus admin-only workspace controls.
- `/settings/providers`
  User-scoped provider setup.
- `/settings/models`
  User-scoped model availability and default selection.
- `/settings/users`
  Admin-only user management.

## Component Organization

The code is organized by domain rather than the older generic structure described in previous docs.

Major folders:

- `components/chat`
- `components/providers`
- `components/settings`
- `components/assets`
- `components/layout`
- `components/ui`

This better reflects how the product actually works today.

## Data Flow

The frontend generally follows this pattern:

1. auth token is read from Zustand
2. TanStack Query fetches backend data
3. domain components render and mutate through `services/api`
4. invalidation refreshes dependent views

Important frontend service file:

- [frontend/services/api.ts](../../frontend/services/api.ts)

## Current Strengths

- domain-oriented component structure
- good use of React Query for server state
- strong settings surfaces split between account, provider/model, and admin controls
- library and processing pages map well to backend workflows

## Current Gaps

- there is an experimental analytics page file in the repo, but the live `/dashboard` route is still a redirect
- some copy in the UI has historically drifted from the backend, especially around provider capabilities and media pipelines
- there is room for more route-level documentation and tests around the more complex chat and upload flows

## Frontend Commands

Install:

```bash
cd frontend
corepack enable
pnpm install
```

Run dev server:

```bash
pnpm dev
```

Type-check:

```bash
pnpm typecheck
```

Lint:

```bash
pnpm lint
```

Unit tests:

```bash
pnpm test:unit
```

Production build:

```bash
pnpm build
```

Related:

- [Features](../features/README.md)
- [API](../api/README.md)
- [Development](../development/README.md)
