# Development

Development workflow and contributing guidelines.

## Setup Local Development

Prerequisites:
- Python 3.10+
- Node.js 18+
- PostgreSQL
- Redis

Follow the Getting Started guide for initial setup.

## Development Commands

Backend:
```bash
cd backend

# Format code
uv run ruff format app/

# Lint code
uv run ruff check app/

# Run tests
uv run pytest

# Run with hot reload
uv run uvicorn app.main:app --reload

# Interactive shell
uv run ipython
```

Frontend:
```bash
cd frontend

# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run type-check

# Run tests
npm test

# Build
npm run build
```

## Testing

Backend tests:
```bash
# All tests
uv run pytest

# Specific file
uv run pytest tests/test_chat.py

# With coverage
uv run pytest --cov=app --cov-report=html

# Specific test
uv run pytest tests/test_chat.py::test_create_conversation
```

Frontend tests:
```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## Git Workflow

Branch naming:
```
feature/feature-name          New features
bugfix/bug-name              Bug fixes
docs/documentation-update    Documentation
chore/dependency-update      Maintenance
```

Commit messages:
```
feat(scope): description
fix(scope): description
docs(scope): description
chore(scope): description
```

Example:
```
git checkout -b feature/chat-streaming
git commit -m "feat(chat): add message streaming with SSE"
git push origin feature/chat-streaming
```

Create pull request and request review.

## Code Standards

Python:
- Line length: 100
- Use type hints
- Follow PEP 8
- Docstrings for public functions

TypeScript:
- Use strict mode
- Use interfaces for types
- Const for immutable values
- JSDoc comments for public APIs

## Database Development

Create migration:
```bash
# Auto-detect changes
uv run alembic revision --autogenerate -m "Add new column"

# Manual
uv run alembic revision -m "Custom migration"
```

Apply migration:
```bash
uv run alembic upgrade head
```

Edit migration file and make changes.

## Debugging

Backend:
```python
# Breakpoint
breakpoint()

# Or
import ipdb; ipdb.set_trace()

# Logging
import logging
logger = logging.getLogger(__name__)
logger.debug("Message")
```

Frontend:
```typescript
// Log to console
console.log("Debug:", value);

// Debugger statement
debugger;

// React DevTools browser extension
```

## Performance Profiling

Backend:
```bash
# Profile with cProfile
uv run python -m cProfile -s cumulative app/main.py
```

Frontend:
```bash
# Lighthouse audit
npm run build
npm run start
# Open DevTools -> Lighthouse
```

## CI/CD

GitHub Actions workflows in `.github/workflows/`

Workflows:
- Tests on push
- Linting
- Type checking
- Build verification
- Deployment on merge to main

## Release Process

1. Update version in package.json and pyproject.toml
2. Update CHANGELOG
3. Create git tag: git tag v1.2.3
4. Push tag: git push origin v1.2.3
5. GitHub Actions builds and publishes

## Documentation

- Update docs in /docs folder
- Follow existing structure
- Include code examples
- Link to related sections
- No icons/emoji in tutorial

---

Contributing Guidelines: Testing, Code Standards, Git Workflow
