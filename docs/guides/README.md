# Guides

Step-by-step guides for common tasks.

## Adding a New LLM Provider

Step 1: Create Provider Class

```python
# app/services/providers/new_provider.py
from app.services.providers.base import LLMProvider

class NewProvider(LLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = NewProviderClient(api_key)
    
    def generate_reply(self, model: str, messages: list[dict]) -> str:
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content
    
    def stream_reply(self, model: str, messages: list[dict]):
        stream = self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

Step 2: Register Provider

```python
# app/services/providers/factory.py
def create_provider(provider: Provider, model: AIModel):
    if provider.provider_type == "new_provider":
        return NewProvider(provider.secret_key)
```

Step 3: Add API Key Environment Variable

```env
NEW_PROVIDER_API_KEY=...
```

Step 4: Test

```python
# tests/test_new_provider.py
def test_generate_reply():
    provider = NewProvider("test-key")
    response = provider.generate_reply("model", [
        {"role": "user", "content": "Hello"}
    ])
    assert isinstance(response, str)
```

## Creating Custom Components

React Component:
```typescript
// components/CustomComponent.tsx
import React from 'react';

interface CustomComponentProps {
  title: string;
  onAction: () => void;
}

export function CustomComponent({ title, onAction }: CustomComponentProps) {
  return (
    <div className="custom-component">
      <h1>{title}</h1>
      <button onClick={onAction}>Action</button>
    </div>
  );
}
```

Use in page:
```typescript
import { CustomComponent } from '@/components/CustomComponent';

export default function MyPage() {
  return (
    <CustomComponent
      title="My Component"
      onAction={() => console.log('Clicked')}
    />
  );
}
```

## Data Migration

Migrate from Other Tools:

1. Export data from source
2. Create migration script
3. Transform data
4. Import to Olanma
5. Verify completeness

Example:
```python
import json
from app.core.database import SessionLocal
from app.models.conversation import Conversation

# Read exported data
with open('export.json') as f:
    data = json.load(f)

db = SessionLocal()

for conv in data['conversations']:
    conversation = Conversation(
        user_id=user_id,
        title=conv['title'],
        # Map other fields
    )
    db.add(conversation)

db.commit()
print(f"Migrated {len(data['conversations'])} conversations")
```

## Backup and Recovery

Daily Backup Script:
```bash
#!/bin/bash
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# PostgreSQL backup
pg_dump olanma | gzip > $BACKUP_DIR/olanma_$TIMESTAMP.sql.gz

# Uploaded files backup
tar -czf $BACKUP_DIR/storage_$TIMESTAMP.tar.gz storage/

# Upload to S3
aws s3 sync $BACKUP_DIR s3://my-bucket/olanma-backups/

# Keep 30 days
find $BACKUP_DIR -mtime +30 -delete
```

Recovery:
```bash
# Restore database
gunzip olanma_20260607_120000.sql.gz
psql olanma < olanma_20260607_120000.sql

# Restore files
tar -xzf storage_20260607_120000.tar.gz
```

## Multi-tenant Setup

Configure for Multiple Users:

```python
# app/core/config.py
MULTI_TENANT = True
TENANT_SUBDOMAIN_ENABLED = True

# Users access via: tenant1.your-domain.com, tenant2.your-domain.com
```

Database schema supports multi-tenant by design:
- Each user is isolated (user_id foreign keys)
- No cross-user data access
- Row-level security possible

Scale with separate database per tenant:
```python
def get_tenant_db(subdomain: str):
    db_url = f"postgresql://user:pass@host/{subdomain}_db"
    return SessionLocal(bind=create_engine(db_url))
```

## Scaling to Production

1. Database Optimization
   - Add indexes
   - Configure connection pool
   - Enable query caching

2. Application Scaling
   - Run multiple API instances
   - Scale Celery workers
   - Implement caching layer

3. Infrastructure
   - Load balancing (Nginx, HAProxy)
   - Auto-scaling groups
   - Monitoring and alerting
   - Backup and disaster recovery

4. Performance
   - CDN for static assets
   - Database read replicas
   - Redis for caching
   - Background job optimization

---

See Related: Add Provider, Custom Components, Data Migration, Backup, Multi-tenant, Scaling
