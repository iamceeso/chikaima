# Architecture

Deep understanding of Olanma's system design and components.

## Quick Navigation

- [System Overview](./system-overview.md) - High-level architecture
- [Components](./components.md) - All major components
- [Data Flow](./data-flow.md) - How data moves
- [Technology Stack](./tech-stack.md) - Technologies used
- [Security](./security.md) - Authentication & encryption

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                      │
│  Chat UI | Library | Settings | Workspaces | Collaboration │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/SSE
┌────────────────────────▼────────────────────────────────────┐
│                  API Gateway (Nginx)                        │
│              Load Balancing & SSL/TLS                       │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    ┌─────────┐   ┌──────────┐   ┌──────────────┐
    │Backend  │   │  Cache   │   │ Job Queue    │
    │(FastAPI)│   │ (Redis)  │   │ (Redis/Bull) │
    └────┬────┘   └──────────┘   └──────┬───────┘
         │                               │
         │                      ┌────────▼────────┐
         │                      │ Celery Workers  │
         │                      │ - Transcribe    │
         │                      │ - Extract text  │
         │                      │ - Generate      │
         │                      └─────────────────┘
         │
    ┌────▼────────────────────────┐
    │  Data Layer                 │
    ├─────────────────────────────┤
    │ - PostgreSQL (Primary)      │
    │ - Vector DB (Embeddings)    │
    │ - File Storage (S3/Local)   │
    └─────────────────────────────┘
```

## Core Layers

### 1. Presentation Layer (Frontend)
- Next.js React application
- Zustand state management
- React Query for data fetching
- Tailwind CSS styling
- Real-time SSE for chat streaming

### 2. API Layer (Backend)
- FastAPI REST API
- JWT authentication
- Request validation (Pydantic)
- Error handling & logging
- CORS support

### 3. Business Logic Layer
- Services (ChatService, AuthService, etc.)
- Provider management (LLM adapters)
- RAG pipeline
- Document processing

### 4. Data Access Layer
- Repositories (Repository pattern)
- SQLAlchemy ORM
- Database transactions
- Query optimization

### 5. Database Layer
- PostgreSQL (relational data)
- Redis (caching, job queue)
- Vector DB (embeddings)
- File storage (local or S3)

### 6. Background Processing
- Celery for async tasks
- Worker processes
- Task scheduling
- Error handling & retries

## Design Patterns

### Repository Pattern
Data access abstraction:
```
Controller → Service → Repository → Database
```

### Factory Pattern
Provider creation:
```
Provider Type → Factory → Provider Instance
```

### Observer Pattern
Real-time updates via SSE:
```
Message Created → Stream to Client
```

### Adapter Pattern
LLM provider abstraction:
```
Generic LLM Interface → OpenAI/Anthropic/etc Adapters
```

## Technology Stack

### Frontend
- **Framework**: Next.js 14+
- **Language**: TypeScript
- **State**: Zustand
- **Data Fetching**: React Query
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form + Zod
- **Testing**: Vitest, Playwright

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.10+
- **ORM**: SQLAlchemy 2.0
- **Validation**: Pydantic
- **Database**: PostgreSQL
- **Cache**: Redis
- **Async**: Asyncio, Celery
- **Testing**: Pytest

### DevOps
- **Containerization**: Docker
- **Orchestration**: Docker Compose / Kubernetes
- **Reverse Proxy**: Nginx
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus, Grafana (optional)

---

**Next**: [System Overview](./system-overview.md)
