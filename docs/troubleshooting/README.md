# Troubleshooting

Solutions to common problems.

## Backend Issues

### Backend won't start

Error: Application startup failed

Solutions:
```bash
# Check Python version
python --version  # Should be 3.10+

# Check dependencies
uv sync

# Check for syntax errors
python -m py_compile app/main.py

# Run with verbose output
uvicorn app.main:app --reload --log-level debug

# Check port availability
lsof -i :8000
```

### Database connection failed

Error: psycopg2.OperationalError: could not connect to server

Solutions:
```bash
# Check PostgreSQL running
sudo systemctl status postgresql

# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# For Docker
docker-compose ps postgres
docker-compose logs postgres
```

### Redis connection failed

Error: redis.exceptions.ConnectionError

Solutions:
```bash
# Check Redis running
redis-cli ping  # Should return PONG

# Start Redis
redis-server

# Check connection in .env
REDIS_URL=redis://localhost:6379/0

# For Docker
docker-compose up -d redis
```

### PyPDF2 import error

Error: ModuleNotFoundError: No module named 'PyPDF2'

Solution:
```bash
# Install PyPDF2
pip install PyPDF2

# Or update pyproject.toml
# Then sync
uv sync
```

### Celery tasks not running

Background jobs not executing

Solutions:
```bash
# Start Celery worker
celery -A app.workers.celery_app worker --loglevel=info

# Check Redis connection
redis-cli ping

# Monitor tasks
celery -A app.workers.celery_app inspect active
celery -A app.workers.celery_app inspect reserved

# Clear queue if stuck
celery -A app.workers.celery_app purge
```

## Frontend Issues

### Port already in use

Error: listen EADDRINUSE

Solutions:
```bash
# Kill process using port
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
```

### API connection issues

Frontend can't reach backend

Solutions:
```bash
# Check backend is running
curl http://localhost:8000/api/health

# Check NEXT_PUBLIC_API_URL in .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Check CORS in backend .env
BACKEND_CORS_ORIGINS=["http://localhost:3000"]

# Clear browser cache
Ctrl+Shift+R
```

### SSE streaming stops

Chat response cuts off

Solutions:
```bash
# Check browser console for errors
# Open DevTools, Network tab, look for SSE connection

# Increase Nginx timeout
proxy_read_timeout 300s;
proxy_send_timeout 300s;

# Check backend logs
docker-compose logs -f backend
```

## Database Issues

### Migrations failed

Error: Column already exists

Solutions:
```bash
# Check migration status
alembic current

# Downgrade and re-apply
alembic downgrade -1
alembic upgrade head

# Manual fix
alembic stamp head
```

### Database locked

Solutions:
```bash
# Restart database
docker-compose restart postgres

# Or
sudo systemctl restart postgresql
```

### Slow queries

Solutions:
```bash
# Enable query logging
echo "true" > app/core/database.py

# Analyze slow query
EXPLAIN ANALYZE SELECT * FROM conversations WHERE ...;

# Add indexes
alembic revision --autogenerate -m "Add indexes"
alembic upgrade head
```

## Authentication Issues

### Token invalid

Error: Invalid token

Solutions:
```bash
# Generate new token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Check token format
# Should be: "Authorization: Bearer {token}"

# Use refresh token
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Authorization: Bearer {refresh_token}"
```

### Login not working

Solutions:
```bash
# Check user exists
SELECT * FROM users WHERE email = 'user@example.com';

# Reset password
python -c "
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

db = SessionLocal()
user = db.query(User).filter(User.email == 'user@example.com').first()
user.hashed_password = hash_password('newpassword')
db.commit()
"

# Verify CORS
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```

## Chat Issues

### LLM API errors

Error: Invalid API key

Solutions:
```bash
# Check API key
echo $OPENAI_API_KEY

# Test directly
python -c "
import openai
openai.api_key = 'sk-...'
print(openai.Model.list())
"

# Verify key has permissions
# Check provider dashboard
```

### Chat response empty

Solutions:
```bash
# Try without attachments
# Check message serialization
# Check LLM model is accessible

curl http://localhost:8000/api/v1/models \
  -H "Authorization: Bearer $TOKEN"
```

## Document Processing Issues

### PDF not extracting

Document stays "pending"

Solutions:
```bash
# Check Celery worker running
celery -A app.workers.celery_app inspect active

# Check file exists
ls -la storage/{user_id}/

# Check PyPDF2 installed
pip list | grep PyPDF2

# Test PDF reading
python -c "
import PyPDF2
with open('document.pdf', 'rb') as f:
    reader = PyPDF2.PdfReader(f)
    print(len(reader.pages))
"
```

### File too large

Error: 413 Payload Too Large

Solutions:
```bash
# Increase limit in .env
MAX_UPLOAD_SIZE_MB=2000

# Or in Nginx
client_max_body_size 2G;
```

## Deployment Issues

### Container won't start

Solutions:
```bash
# Check logs
docker-compose logs backend

# Build without cache
docker-compose build --no-cache

# Check environment
docker-compose config | head

# Verify dependencies
docker-compose logs postgres
```

### Out of memory

Solutions:
```bash
# Check memory usage
docker stats

# Increase limit
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G

# Reduce workers
gunicorn app.main:app -w 2
```

### High CPU usage

Solutions:
```bash
# Find process
top

# Add logging to identify bottleneck
# Optimize database queries
# Reduce worker concurrency
```

## FAQ

Q: Can I use SQLite?
A: Not recommended for production, but possible for development

Q: What LLM providers work?
A: OpenAI, Anthropic, Cohere, HuggingFace

Q: How do I backup data?
A: Use pg_dump and tar for files. See Backup Guide.

Q: Can I run on Windows?
A: Yes, use WSL2 or Docker Desktop

Q: How do I scale?
A: Use Kubernetes or multiple Docker Compose instances

---

Need more help? Check documentation or open issue on GitHub.
