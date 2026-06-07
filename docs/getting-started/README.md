# Getting Started

Welcome to Olanma! This section helps you get up and running quickly.

## Quick Navigation

- [Local Development Setup](./local-setup.md) - Set up on your machine
- [Docker Compose Setup](./docker-setup.md) - Containerized setup
- [First Steps](./first-steps.md) - Your first conversation
- [Configuration](./configuration.md) - Environment variables

## Choose Your Path

### 🖥️ Local Development (Recommended for Development)

Best if you want to develop features or contribute.

```bash
# Prerequisites: Python 3.10+, Node.js 18+, PostgreSQL, Redis
git clone https://github.com/iamceeso/olanma.git
cd olanma

# Follow Local Development Setup
```

→ [Local Development Setup](./local-setup.md)

### 🐳 Docker Compose (Recommended for Production)

Best if you want a complete self-contained setup.

```bash
docker-compose up -d
```

→ [Docker Compose Setup](./docker-setup.md)

### ☁️ Kubernetes (Advanced)

For production deployments with scaling.

→ [See Deployment Guide](../deployment/kubernetes.md)

## 5-Minute Quick Start

### Using Docker Compose

```bash
# 1. Clone repository
git clone https://github.com/iamceeso/olanma.git
cd olanma

# 2. Create .env file
cp .env.example .env
# Edit .env with your API keys

# 3. Start services
docker-compose up -d

# 4. Wait for services to be healthy
docker-compose ps

# 5. Visit http://localhost:3000
```

### Verify Installation

```bash
# Check backend is running
curl http://localhost:8000/health

# Check frontend is running
curl http://localhost:3000

# Check database
docker-compose exec postgres psql -U olanma -d olanma -c "SELECT 1"
```

## Next Steps

Once installed:

1. [Take your first steps](./first-steps.md) - Create a conversation
2. [Learn the architecture](../architecture/system-overview.md) - Understand how it works
3. [Explore features](../features/README.md) - What you can do
4. [Read API reference](../api/README.md) - Integrate with other tools

## System Requirements

### Minimum (Development)
- 4GB RAM
- 10GB Disk
- Python 3.10+
- Node.js 18+

### Recommended (Production)
- 16GB+ RAM
- 100GB+ Disk
- PostgreSQL 13+
- Redis 6+
- Dedicated CPU (4+ cores)

### Supported Platforms
- macOS (Intel & Apple Silicon)
- Linux (Ubuntu, Debian, etc.)
- Windows (WSL2 recommended)
- Docker (any platform)

## Common Issues

**Can't connect to database?**
→ [Database Issues](../troubleshooting/database.md)

**Frontend won't load?**
→ [Frontend Issues](../troubleshooting/frontend.md)

**Don't have an API key?**
→ [Get API Keys](./configuration.md#api-keys)

---

**Next**: [Local Development Setup](./local-setup.md) or [Docker Compose Setup](./docker-setup.md)
