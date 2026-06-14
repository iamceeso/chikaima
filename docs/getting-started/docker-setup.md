# Docker Compose Setup

Docker Compose setup for local evaluation of Olanma.

## Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose 2.0+
- 8GB RAM minimum
- 20GB disk space

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/iamceeso/olanma.git
cd olanma

# 2. Copy backend environment file
cp backend/.env.example backend/.env

# 3. Edit backend/.env with any custom settings you need

# 4. Start services
docker compose up -d

# 5. Wait for services to be ready
docker compose ps

# 6. Run migrations
docker compose exec backend alembic upgrade head

# 7. Visit http://localhost:3000
```

## Services

### Backend (FastAPI)
- Port: 8000
- URL: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Container: `olanma-backend`

### Frontend (Next.js)
- Port: 3000
- URL: http://localhost:3000
- Container: `olanma-frontend`

### PostgreSQL
- Port: 5432
- Container: `olanma-postgres`
- Default user: `olanma`
- Default database: `olanma`

### Redis
- Port: 6379
- Container: `olanma-redis`

### Celery Worker
- Container: `olanma-celery-worker`
- Processes background tasks

## Environment Configuration

Edit `backend/.env` before starting:

```env
# Application
APP_NAME=Olanma API
APP_ENV=development
APP_DEBUG=true

# API
API_V1_PREFIX=/api/v1

# Database & Redis
DATABASE_URL=postgresql+psycopg://olanma:olanma@postgres:5432/olanma
REDIS_URL=redis://redis:6379/0

# JWT & provider secret
JWT_SECRET_KEY=change-me-development-secret
JWT_REFRESH_SECRET_KEY=change-me-too-development-secret
PROVIDER_SECRET_KEY=replace-with-32-char-secret-key

# CORS & storage
CORS_ORIGINS=["http://localhost:3000"]
MEDIA_ROOT=storage
```

The backend and worker images install native `ffmpeg` and `tesseract-ocr`. Audio/video transcription also depends on `openai-whisper`, and local non-Docker installs fall back to the bundled `imageio-ffmpeg` binary automatically.

## Common Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f celery-worker

# Execute command in container
docker compose exec backend bash
docker compose exec postgres psql -U olanma -d olanma

# Stop services
docker compose down

# Stop and remove volumes (WARNING: deletes data)
docker compose down -v

# Rebuild images
docker compose build --no-cache

# Scale services
docker compose up -d --scale celery-worker=3

# Check service health
docker compose ps
```

## Volumes (Data Persistence)

```yaml
volumes:
  postgres_data:    # PostgreSQL data
  redis_data:       # Redis cache
  storage:          # Uploaded files
```

Data persists in Docker volumes. To backup:

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U olanma olanma > backup.sql

# Restore PostgreSQL
docker compose exec -T postgres psql -U olanma olanma < backup.sql
```

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker ps

# View detailed logs
docker compose logs backend

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### Port already in use

```bash
# Change port in docker-compose.yml
ports:
  - "8001:8000"  # Use 8001 instead of 8000

# Or kill process using port
lsof -ti:8000 | xargs kill -9
```

### Database connection failed

```bash
# Check PostgreSQL is ready
docker-compose exec postgres pg_isready

# Check environment variables
docker-compose config | grep DATABASE

# Verify migrations
docker-compose exec backend alembic current
```

### Out of memory

```bash
# Increase Docker memory limit
# Docker Desktop -> Preferences -> Resources

# Or use docker-compose resource limits
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
```

## Production Deployment

For production, use the Kubernetes or advanced Docker Compose setup with:

- SSL/TLS certificates
- Proper environment variables
- Resource limits
- Health checks
- Logging & monitoring

→ See [Deployment Guide](../deployment/docker-compose.md)

---

**Next**: [First Steps](./first-steps.md)
