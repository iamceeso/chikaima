# Deployment

Deploy Olanma to production.

## Deployment Options

### Single Server (Docker Compose)

Best for: Small to medium deployments

```bash
# Requires:
# - Docker and Docker Compose
# - 8GB+ RAM
# - 50GB+ disk

# Setup
git clone https://github.com/iamceeso/olanma.git
cd olanma
cp .env.example .env

# Configure .env with your settings

# Start
docker-compose up -d

# Verify
docker-compose ps
```

### Kubernetes (Production Scale)

Best for: Large deployments with high availability

```bash
# Requires:
# - Kubernetes cluster
# - kubectl configured
# - Docker registry

# Deploy
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/nginx.yaml
```

### Traditional VPS

Best for: Custom requirements

```bash
# Setup on Ubuntu/Debian VPS
# Install dependencies
sudo apt-get install -y python3.10 nodejs postgresql redis nginx

# Clone and setup backend
git clone https://github.com/iamceeso/olanma.git
cd olanma/backend
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd ../frontend
npm install
npm run build

# Configure Nginx
# Configure systemd services
# Start services
```

## Environment Configuration

Production .env:

```env
# Database (use strong password)
DATABASE_URL=postgresql://user:STRONG_PASSWORD@db-host:5432/olanma
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://:STRONG_PASSWORD@redis-host:6379/0

# JWT
JWT_SECRET_KEY=VERY_LONG_SECRET_KEY_MIN_32_CHARS

# Application
ENVIRONMENT=production
DEBUG=false
ALLOWED_HOSTS=["your-domain.com"]

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Storage
MEDIA_ROOT=/data/storage
MAX_UPLOAD_SIZE_MB=500

# CORS
BACKEND_CORS_ORIGINS=["https://your-domain.com"]
NEXT_PUBLIC_API_URL=https://your-domain.com/api

# SSL
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-specific-password

# Monitoring (optional)
SENTRY_DSN=https://...
```

## SSL/TLS

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone \
  -d your-domain.com \
  --email admin@example.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Nginx Configuration

```nginx
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/chat/stream {
        proxy_pass http://backend;
        proxy_buffering off;
        proxy_cache off;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
    }
}
```

## Database Backups

### Automated Daily Backup

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATABASE_NAME=olanma

# PostgreSQL dump
docker-compose exec -T postgres pg_dump -U olanma $DATABASE_NAME | \
  gzip > ${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz

# Upload to S3
aws s3 cp ${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz \
  s3://your-bucket/olanma-backups/

# Keep last 30 days
find ${BACKUP_DIR} -name "backup_*.sql.gz" -mtime +30 -delete
```

### Restore from Backup

```bash
# Decompress
gunzip backup_20260607_120000.sql.gz

# Restore
psql olanma < backup_20260607_120000.sql
```

## Monitoring

### Health Checks

```bash
# Backend health
curl https://your-domain.com/api/health

# Database
docker-compose exec postgres pg_isready

# Redis
redis-cli ping
```

### Logging

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f celery
docker-compose logs -f frontend

# Send to log aggregation service
# Configure ELK, Grafana Loki, or Datadog
```

### Metrics

Prometheus metrics available at:
```
http://backend:8000/metrics
```

Configure Grafana for visualization.

## Scaling

### Horizontal Scaling

```bash
# Scale backend services
docker-compose up -d --scale backend=3

# In Kubernetes
kubectl scale deployment backend --replicas=3
```

### Load Balancing

Nginx round-robin:
```nginx
upstream backend {
    server backend-1:8000;
    server backend-2:8000;
    server backend-3:8000;
}
```

### Worker Scaling

```bash
# Scale Celery workers
docker-compose up -d --scale celery=5
```

## Maintenance

### Updating

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose build --no-cache

# Stop and restart
docker-compose down
docker-compose up -d

# Run migrations
docker-compose exec backend alembic upgrade head
```

### Database Maintenance

```bash
# Vacuum (cleanup)
docker-compose exec postgres vacuumdb -U olanma olanma

# Analyze (optimize)
docker-compose exec postgres analyzedb -U olanma olanma
```

---

See Detailed Guides: Docker Compose, Kubernetes, SSL/TLS, Backups, Monitoring, Scaling
