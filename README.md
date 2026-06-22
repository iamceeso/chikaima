<p align="center">
  <img src="frontend/public/chikaima-logo.png" alt="Chikaima logo" width="120" />
</p>

# Chikaima

Chikaima is a self-hosted AI media intelligence workspace for understanding audio, video, and documents with multiple AI providers. This monorepo contains a Next.js frontend and a FastAPI backend, plus Docker orchestration for PostgreSQL, Redis, and Celery workers.

## What is included

- Next.js frontend for chat, library, processing, provider, model, and workspace settings
- FastAPI backend for authentication, assets, chat, providers, models, and background task orchestration
- PostgreSQL with `pgvector` for relational data and vector search
- Redis and Celery for asynchronous media processing
- Docker Compose for local full-stack development
- Documentation for setup, architecture, APIs, development, deployment, and troubleshooting

## Monorepo Structure

```text
chikaima/
├── frontend/
├── backend/
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
cp backend/.env.example backend/.env
docker compose up --build
```

Then open the frontend at `http://localhost:3000`.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening issues or pull requests.

## Website

Installation guide and getting started information are also available on the official website:

https://chikaima.com
