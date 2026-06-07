# Olanma Documentation

Complete documentation for the self-hosted AI media intelligence workspace.

## 📖 Documentation Structure

### [Getting Started](./getting-started/README.md)
Quick start guides for different setups and first-time users.

- [Local Development Setup](./getting-started/local-setup.md) - macOS/Linux/Windows
- [Docker Compose Setup](./getting-started/docker-setup.md) - Containerized development
- [First Steps](./getting-started/first-steps.md) - Your first conversation and documents
- [Configuration](./getting-started/configuration.md) - Environment variables and settings

### [Architecture](./architecture/README.md)
Deep dive into system design, components, and how they work together.

- [System Overview](./architecture/system-overview.md) - High-level architecture
- [Component Diagram](./architecture/components.md) - All major components
- [Data Flow](./architecture/data-flow.md) - How data moves through the system
- [Technology Stack](./architecture/tech-stack.md) - Technologies used
- [Security Architecture](./architecture/security.md) - Authentication, encryption, privacy

### [Frontend Development](./frontend/README.md)
React/Next.js frontend development guide.

- [Project Structure](./frontend/structure.md) - Folder organization
- [Component Patterns](./frontend/components.md) - Building UI components
- [State Management](./frontend/state-management.md) - Zustand stores
- [Data Fetching](./frontend/data-fetching.md) - React Query & API integration
- [Styling](./frontend/styling.md) - Tailwind CSS patterns
- [Forms](./frontend/forms.md) - React Hook Form + Zod validation
- [Testing](./frontend/testing.md) - Unit & E2E tests
- [Performance](./frontend/performance.md) - Optimization tips

### [Backend Development](./backend/README.md)
FastAPI backend development guide.

- [Project Structure](./backend/structure.md) - Python module organization
- [Creating Endpoints](./backend/endpoints.md) - FastAPI routes
- [Services Layer](./backend/services.md) - Business logic
- [Repositories](./backend/repositories.md) - Data access
- [Authentication](./backend/authentication.md) - JWT & security
- [Error Handling](./backend/error-handling.md) - Exception management
- [Background Tasks](./backend/background-tasks.md) - Celery workers
- [Testing](./backend/testing.md) - Unit & integration tests
- [Logging](./backend/logging.md) - Log configuration

### [API Reference](./api/README.md)
Complete REST API documentation.

- [Authentication](./api/authentication.md) - Login, tokens, sessions
- [Chat](./api/chat.md) - Conversations and messaging
- [Documents](./api/documents.md) - File upload and processing
- [Audio](./api/audio.md) - Audio processing endpoints
- [Video](./api/video.md) - Video processing endpoints
- [Providers](./api/providers.md) - LLM provider management
- [Models](./api/models.md) - AI model selection
- [Users](./api/users.md) - User management
- [Jobs](./api/jobs.md) - Background job tracking
- [Status Codes](./api/status-codes.md) - HTTP status codes

### [Database](./database/README.md)
Database schema, models, and migrations.

- [Schema Overview](./database/schema-overview.md) - Complete schema diagram
- [User Model](./database/models/users.md) - Users & authentication
- [Chat Models](./database/models/chat.md) - Conversations & messages
- [Document Models](./database/models/documents.md) - Document storage
- [Media Models](./database/models/media.md) - Audio & video
- [Provider Models](./database/models/providers.md) - LLM providers
- [Workspace Models](./database/models/workspaces.md) - Collaboration
- [Migrations](./database/migrations.md) - Creating & managing migrations
- [Optimization](./database/optimization.md) - Query optimization & indexing

### [Features](./features/README.md)
Detailed feature documentation and workflows.

- [Chat & Conversations](./features/chat.md) - Message streaming, context
- [Document Processing](./features/documents.md) - Upload, extraction, OCR
- [Audio Analysis](./features/audio.md) - Transcription, analysis
- [Video Analysis](./features/video.md) - Video understanding, summaries
- [RAG (Retrieval-Augmented Generation)](./features/rag.md) - Context-aware AI
- [Embeddings](./features/embeddings.md) - Vector search
- [LLM Providers](./features/providers.md) - OpenAI, Anthropic, etc.
- [Workspaces](./features/workspaces.md) - Team organization
- [Collaboration](./features/collaboration.md) - Sharing & permissions
- [Recent Activities](./features/activities.md) - Activity tracking

### [Deployment](./deployment/README.md)
Production deployment guides.

- [Docker Compose](./deployment/docker-compose.md) - Single server deployment
- [Kubernetes](./deployment/kubernetes.md) - Scalable cluster deployment
- [Environment Setup](./deployment/environment.md) - Production configuration
- [SSL/TLS](./deployment/ssl-tls.md) - HTTPS & certificates
- [Backups](./deployment/backups.md) - Data backup & recovery
- [Monitoring](./deployment/monitoring.md) - Logging, metrics, alerts
- [Scaling](./deployment/scaling.md) - Horizontal scaling
- [Maintenance](./deployment/maintenance.md) - Updates, migrations, cleanup

### [Development](./development/README.md)
Contributing and development workflows.

- [Development Setup](./development/setup.md) - Local development environment
- [Git Workflow](./development/git-workflow.md) - Branch strategy, PRs
- [Code Standards](./development/code-standards.md) - Linting, formatting
- [Testing Strategy](./development/testing.md) - Unit, integration, E2E
- [Database Development](./development/database-dev.md) - Migrations, fixtures
- [Debugging](./development/debugging.md) - Tools & techniques
- [Performance Profiling](./development/profiling.md) - Identifying bottlenecks
- [CI/CD](./development/ci-cd.md) - GitHub Actions
- [Release Process](./development/releases.md) - Version bumps, changelogs

### [Guides](./guides/README.md)
Step-by-step guides for common tasks.

- [Adding a New LLM Provider](./guides/add-provider.md) - How to support a new AI service
- [Creating Custom Components](./guides/custom-components.md) - Build UI extensions
- [Building a Plugin](./guides/plugins.md) - Extend functionality
- [Data Migration](./guides/data-migration.md) - Migrate from other tools
- [Backup & Recovery](./guides/backup-recovery.md) - Disaster recovery
- [Multi-tenant Setup](./guides/multi-tenant.md) - Hosting for multiple users
- [Scaling to Production](./guides/production-scale.md) - From dev to production

### [Troubleshooting](./troubleshooting/README.md)
Solutions to common problems.

- [Backend Issues](./troubleshooting/backend.md) - FastAPI, database, workers
- [Frontend Issues](./troubleshooting/frontend.md) - Next.js, SSE, UI
- [Database Issues](./troubleshooting/database.md) - Migrations, locks, performance
- [Authentication Issues](./troubleshooting/authentication.md) - Tokens, login
- [Chat Issues](./troubleshooting/chat.md) - LLM, streaming, responses
- [Document Issues](./troubleshooting/documents.md) - Upload, processing, extraction
- [Deployment Issues](./troubleshooting/deployment.md) - Docker, Kubernetes, SSL
- [Performance Issues](./troubleshooting/performance.md) - Slow queries, memory
- [FAQ](./troubleshooting/faq.md) - Common questions

## 🎯 Quick Navigation

### For Different Roles

**👤 Users**
- [Getting Started](./getting-started/first-steps.md)
- [Features Guide](./features/README.md)
- [FAQ](./troubleshooting/faq.md)

**👨‍💻 Frontend Developers**
- [Frontend Setup](./frontend/README.md)
- [Component Patterns](./frontend/components.md)
- [API Integration](./frontend/data-fetching.md)

**🔧 Backend Developers**
- [Backend Setup](./backend/README.md)
- [Creating Endpoints](./backend/endpoints.md)
- [Database Guide](./database/README.md)

**🚀 DevOps/Deployment**
- [Deployment Guide](./deployment/README.md)
- [Monitoring](./deployment/monitoring.md)
- [Scaling](./deployment/scaling.md)

**🔍 Troubleshooting**
- [Common Issues](./troubleshooting/README.md)
- [FAQ](./troubleshooting/faq.md)

## 📚 Learning Paths

### First Time Setup
1. [Local Development Setup](./getting-started/local-setup.md)
2. [First Steps](./getting-started/first-steps.md)
3. [System Overview](./architecture/system-overview.md)

### Build a Feature
1. [API Design](./api/README.md) - Plan your endpoints
2. [Backend Development](./backend/endpoints.md) - Implement logic
3. [Database Design](./database/schema-overview.md) - Design schema
4. [Frontend Development](./frontend/components.md) - Build UI
5. [Testing](./development/testing.md) - Write tests

### Deploy to Production
1. [Environment Setup](./deployment/environment.md)
2. [Docker Compose](./deployment/docker-compose.md) or [Kubernetes](./deployment/kubernetes.md)
3. [SSL/TLS](./deployment/ssl-tls.md)
4. [Backups](./deployment/backups.md)
5. [Monitoring](./deployment/monitoring.md)

## 📊 Project Stats

- **Total Documentation**: ~200KB
- **Guides & Examples**: 40+ articles
- **Code Samples**: 100+ examples
- **Architecture Diagrams**: 10+ diagrams
- **API Endpoints**: 30+ endpoints documented
- **Database Models**: 14 core models
- **Supported LLM Providers**: 4+ providers

## 🔗 External Resources

- **GitHub Repository**: https://github.com/iamceeso/olanma
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **Next.js Docs**: https://nextjs.org/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Celery Docs**: https://docs.celeryproject.io/
- **React Docs**: https://react.dev/
- **SQLAlchemy Docs**: https://docs.sqlalchemy.org/

## 🚀 Getting Help

If you can't find what you need:

1. **Search the docs**: Use Ctrl+F to search
2. **Check FAQ**: [Frequently Asked Questions](./troubleshooting/faq.md)
3. **Troubleshooting**: [Common Issues](./troubleshooting/README.md)
4. **GitHub Issues**: [Report a bug](https://github.com/iamceeso/olanma/issues)
5. **Discussions**: [Ask questions](https://github.com/iamceeso/olanma/discussions)

---

**Last Updated**: June 7, 2026
**Documentation Version**: 1.0
