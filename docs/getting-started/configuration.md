# Configuration

Configure Olanma with environment variables and settings.

## Environment Variables

### Backend (.env)

Located in `backend/.env`

#### Database

```env
# PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/olanma_dev
```

#### Redis

```env
# Redis connection for caching and Celery
REDIS_URL=redis://localhost:6379/0
```

#### JWT & Security

```env
# Secret key for JWT tokens (use: openssl rand -base64 32)
JWT_SECRET_KEY=your-secret-key-min-32-chars

# Token expiration in minutes
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Algorithm (HS256 recommended)
JWT_ALGORITHM=HS256
```

#### Application

```env
# Environment: development, staging, production
APP_ENV=development

# Enable debug mode
APP_DEBUG=true

# Storage directory for uploaded files
MEDIA_ROOT=storage

# Upload limits in MB
DOCUMENT_UPLOAD_MAX_MEGABYTES=100
AUDIO_UPLOAD_MAX_MEGABYTES=512
VIDEO_UPLOAD_MAX_MEGABYTES=2048

# Whisper runtime
WHISPER_MODEL=base
# Optional: force a specific native ffmpeg binary
# FFMPEG_BINARY_PATH=/usr/bin/ffmpeg

# CORS origins (comma-separated or JSON list)
CORS_ORIGINS=["http://localhost:3000"]
```

FastAPI does not apply a global body-size limit by default in this project. Olanma enforces upload limits inside `StorageService`, and any reverse proxy in front of the API must be configured with a matching or larger request-body limit to avoid proxy-side `413 Request Entity Too Large` responses.

#### LLM Providers

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Cohere
COHERE_API_KEY=...

# HuggingFace
HUGGINGFACE_API_KEY=...
```

#### Optional Services

```env
# Sentry error tracking
SENTRY_DSN=https://...

# Email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-password

# S3 for file storage (optional)
S3_BUCKET=olanma-files
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### Frontend (.env.local)

Located in `frontend/.env.local`

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Analytics (optional)
NEXT_PUBLIC_ANALYTICS_KEY=...

# Environment
NEXT_PUBLIC_ENVIRONMENT=development
```

## Getting API Keys

### OpenAI

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key
4. Add to `OPENAI_API_KEY`

```env
OPENAI_API_KEY=sk-proj-...
```

### Anthropic (Claude)

1. Go to https://console.anthropic.com/
2. Go to "API Keys"
3. Click "Create Key"
4. Copy the key
5. Add to `ANTHROPIC_API_KEY`

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Other Providers

Similar process - get keys from provider dashboards.

## Settings Files

### Backend Settings

`backend/app/core/config.py`:

```python
class Settings(BaseSettings):
    # Database
    database_url: str
    
    # Redis
    redis_url: str
    
    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Application
    app_name: str = "Olanma API"
    debug: bool = False
    environment: str = "production"
    
    # Storage
    media_root: str = "storage"
    max_upload_size: int = 500 * 1024 * 1024  # 500MB
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]
    
    # LLM Providers
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    
    class Config:
        env_file = ".env"
```

## Docker Environment

In `docker-compose.yml`:

```yaml
environment:
  DATABASE_URL: postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@postgres:5432/${DATABASE_NAME}
  REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
  JWT_SECRET_KEY: ${JWT_SECRET_KEY}
  OPENAI_API_KEY: ${OPENAI_API_KEY}
  BACKEND_CORS_ORIGINS: ${BACKEND_CORS_ORIGINS}
```

## Secrets Management

### Development

Use `.env` file (never commit):

```bash
# .gitignore
.env
.env.local
```

### Production

Use environment variables or secret management:

```bash
# Docker secrets
echo "sk-..." | docker secret create openai_key -

# Kubernetes secrets
kubectl create secret generic olanma-secrets \
  --from-literal=openai-key=sk-...

# Environment variables
export OPENAI_API_KEY=sk-...
docker run -e OPENAI_API_KEY=$OPENAI_API_KEY olanma-api
```

## Feature Flags

Enable/disable features with environment variables:

```env
# RAG (Retrieval-Augmented Generation)
ENABLE_RAG=true

# Embeddings
ENABLE_EMBEDDINGS=true

# Video processing
ENABLE_VIDEO_PROCESSING=true

# Audio transcription
ENABLE_AUDIO_TRANSCRIPTION=true

# Workspaces & collaboration
ENABLE_WORKSPACES=true
```

## Database Configuration

### PostgreSQL

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

### SQLite (Development only)

```env
DATABASE_URL=sqlite:///./test.db
```

### Connection Pool

```python
# In config.py
engine = create_engine(
    database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Verify connections
)
```

## Logging Configuration

```env
# Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL=INFO

# Log format
LOG_FORMAT=json  # or 'text'

# Sentry error tracking
SENTRY_DSN=https://...
```

## Performance Tuning

```env
# Workers
GUNICORN_WORKERS=4
CELERY_CONCURRENCY=4

# Cache TTL
CACHE_DEFAULT_TTL=3600

# Database connection timeout
DB_CONNECT_TIMEOUT=10

# Request timeout
REQUEST_TIMEOUT=30
```

## Validating Configuration

```bash
# Test database connection
python -c "from app.core.database import engine; engine.connect(); print('OK')"

# Test Redis connection
redis-cli ping

# Test API key
python -c "import openai; openai.api_key='sk-...'; print(openai.Model.list())"
```

---

**Next**: [First Steps](./first-steps.md) or continue to [Local Setup](./local-setup.md)
