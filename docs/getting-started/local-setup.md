# Local Development Setup

Set up Olanma for local development on macOS, Linux, or Windows.

## Prerequisites

### macOS
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install python@3.10 node postgresql redis git tesseract

# Start PostgreSQL and Redis
brew services start postgresql
brew services start redis
```

### Linux (Ubuntu/Debian)
```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y python3.10 python3.10-venv nodejs postgresql redis-server git tesseract-ocr

# Start services
sudo systemctl start postgresql
sudo systemctl start redis-server
```

### Windows (WSL2 Recommended)
```bash
# Enable WSL2
wsl --install

# Inside WSL2, run Ubuntu Linux setup
# Or use Docker Desktop for Windows
```

## Step 1: Clone Repository

```bash
git clone https://github.com/iamceeso/olanma.git
cd olanma
```

## Step 2: Backend Setup

```bash
cd backend

# Create virtual environment
python3.10 -m venv venv

# Activate venv
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Install uv (fast package installer)
pip install uv

# Install dependencies
uv sync

# Copy example environment
cp .env.example .env
```

`openai-whisper` and `imageio-ffmpeg` are installed with the backend dependencies. Olanma bootstraps Whisper so it can discover a bundled `ffmpeg` binary automatically in local development, while `tesseract` powers OCR-backed image extraction.

### Configure .env

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/olanma_dev

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=your-secret-key-here-min-32-chars

# LLM API Keys (get from provider dashboards)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Settings
DEBUG=true
ENVIRONMENT=development
WHISPER_MODEL=base
VIDEO_UPLOAD_MAX_MEGABYTES=2048
```

If `ffmpeg` cannot be resolved, the API and Celery worker fail during startup with a clear transcription runtime error instead of allowing upload jobs to fail later.

### Initialize Database

```bash
# Create database
createdb -U postgres olanma_dev

# Run migrations
uv run alembic upgrade head

# Verify
psql olanma_dev -c "SELECT * FROM alembic_version;"
```

## Step 3: Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Copy example environment
cp .env.example .env.local
```

### Configure .env.local

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## Step 4: Start Development Servers

### Terminal 1: Backend API

```bash
cd backend
source venv/bin/activate
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend available at: http://localhost:8000

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

Frontend available at: http://localhost:3000

### Terminal 3: Celery Worker (Optional)

```bash
cd backend
source venv/bin/activate
uv run celery -A app.workers.celery_app worker --loglevel=info
```

### Terminal 4: Redis (If not running as service)

```bash
redis-server
```

## Step 5: Verify Installation

```bash
# Backend health
curl http://localhost:8000/health

# Frontend
curl http://localhost:3000

# API docs
open http://localhost:8000/docs
```

## Step 6: Create Admin User

```bash
cd backend
python -c "
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password

db = SessionLocal()
user = User(
    email='admin@example.com',
    hashed_password=hash_password('admin123'),
    is_active=True,
    is_superuser=True,
)
db.add(user)
db.commit()
print('Admin user created!')
"
```

Login with:
- Email: `admin@example.com`
- Password: `admin123`

## Common Commands

### Backend

```bash
# Format code
uv run ruff format app/

# Lint code
uv run ruff check app/

# Run tests
uv run python -m unittest discover -s tests -p 'test_*.py'

# Run with hot reload
uv run uvicorn app.main:app --reload

# Shell for interactive debugging
uv run ipython
```

### Frontend

```bash
# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run type-check

# Run tests
npm test

# Build for production
npm run build
```

### Database

```bash
# Create migration
uv run alembic revision --autogenerate -m "Description"

# Apply migrations
uv run alembic upgrade head

# Revert migration
uv run alembic downgrade -1

# Connect to database
psql olanma_dev
```

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :8000   # Windows

# Use different port
uvicorn app.main:app --port 8001
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Check credentials in .env
echo $DATABASE_URL

# Create database manually
createdb -U postgres olanma_dev
```

### Redis Connection Failed

```bash
# Check Redis is running
redis-cli ping  # Should return PONG

# Start Redis
redis-server
```

### Module Not Found

```bash
# Reinstall dependencies
uv sync

# Verify venv is activated
which python  # Should show venv path
```

## Next Steps

1. [First Steps - Your First Conversation](./first-steps.md)
2. [Architecture Overview](../architecture/system-overview.md)
3. [Backend Development](../backend/README.md)
4. [Frontend Development](../frontend/README.md)

---

**Having issues?** Check [Troubleshooting](../troubleshooting/README.md)
