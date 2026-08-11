<p align="center">
  <img src="public/chikaima-logo.png" alt="Chikaima logo" width="120" />
</p>

# Chikaima

Chikaima is a self-hosted, local-first AI media intelligence workspace for understanding audio, video, and documents with multiple AI providers. It's a single Next.js application with an embedded SQLite database, vector store, and background job worker — no separate backend service to run.

## What is included

- Next.js app for chat, library, processing, provider, model, and workspace settings, plus its own `/api/v1/*` API routes
- Embedded SQLite (via `better-sqlite3` and `sqlite-vec`) for relational data and vector search — no external database to provision
- An in-process job worker for asynchronous media processing — no Redis or Celery required
- Docker Compose for containerized local/production runs
- Documentation for setup, architecture, APIs, development, deployment, and troubleshooting

## Repository Structure

```text
chikaima/
├── app/
├── components/
├── core/
├── docs/
├── docker-compose.yml
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── .gitignore
└── README.md
```

## Getting started

For the current local setup, Docker Compose workflow, and first-run product checks, see:

- [Getting Started Guide](https://chikaima.com/docs/getting-started/)

The shortest full-stack path is:

```bash
docker compose up --build
```

Compose uses the inline environment values in `docker-compose.yml` and starts the frontend, which serves both the UI and its API routes. Then open it at `http://localhost:3000`.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening issues or pull requests.

## Website

Installation guide and getting started information are also available on the official website:

https://chikaima.com
