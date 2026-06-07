# Docker Compose Setup

Production-ready Docker Compose setup for Olanma.

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

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env with your settings
# Add your API keys:
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# etc.

# 4. Start services
docker-compose up -d

# 5. Wait for services to be ready
docker-compose ps

# 6. Run migrations
docker-compose exec backend alembic upgrade head

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
- Container: `olanma-celery`
- Processes background tasks

### Nginx (Reverse Proxy)
- Port: 80, 443
- Container: `olanma-nginx`

## Environment Configuration

Edit `.env` before starting:

```env
# Database
DATABASE_NAME=olanma
DATABASE_USER=olanma
DATABASE_PASSWORD=STRONG_PASSWORD_HERE
DATABASE_HOST=postgres
DATABASE_PORT=5432

# Redis
REDIS_PASSWORD=STRONG_REDIS_PASSWORD
REDIS_HOST=redis
REDIS_PORT=6379

# JWT & Auth
JWT_SECRET_KEY=GENERATE_WITH_openssl_rand_-base64_32
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Application
ENVIRONMENT=development
DEBUG=false
MEDIA_ROOT=/app/storage
MAX_UPLOAD_SIZE_MB=500
```

## Common Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f celery

# Execute command in container
docker-compose exec backend bash
docker-compose exec postgres psql -U olanma -d olanma

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Scale services
docker-compose up -d --scale celery=3

# Check service health
docker-compose ps
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
docker-compose exec postgres pg_dump -U olanma olanma > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U olanma olanma < backup.sql
```

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker ps

# View detailed logs
docker-compose logs backend

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
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
