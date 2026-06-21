# Data Flow

This page focuses on the three flows that define the current product: chat, ingestion, and retrieval.

## Chat Flow

1. The frontend sends a chat request to the backend.
2. The backend authenticates the user and loads the conversation.
3. The selected model and provider are resolved.
4. If retrieval is enabled, the backend gathers relevant `asset_chunks`.
5. The provider adapter streams or returns the model response.
6. SSE events are sent back to the frontend as `metadata`, `token`, `done`, or `error`.
7. The assistant message is persisted after a successful completion.

Important files:

- [backend/app/services/chat_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/chat_service.py)
- [backend/app/services/llm_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/llm_service.py)

## Asset Ingestion Flow

1. A document, audio file, or video is uploaded.
2. The backend validates the file and stores it under the media root.
3. A job row is created.
4. The Celery worker picks up the job from Redis.
5. The worker extracts transcript/content data.
6. Summaries and structured outputs are generated through a configured provider.
7. Chunks are embedded when an embedding-capable provider is available.
8. Results are written back to PostgreSQL.

Important files:

- [backend/app/services/job_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/job_service.py)
- [backend/app/workers/tasks.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/workers/tasks.py)
- [backend/app/services/asset_processors.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_processors.py)

## Retrieval Flow

1. The user asks a question.
2. The query is embedded through the configured provider path.
3. Similar rows are fetched from `asset_chunks`.
4. The top matches are formatted into context and citations.
5. The final provider request includes that context.

Important files:

- [backend/app/services/embeddings_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/embeddings_service.py)
- [backend/app/services/asset_search_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_search_service.py)

## Provider Flow

1. A signed-in user configures a provider in the settings UI.
2. The backend stores encrypted provider configuration.
3. Supported models are synced and stored in `ai_models`.
4. Chat, embeddings, and transcription services select the provider path at runtime.

Current ownership behavior:

- providers and synced models belong to the current user when workspace auth is enabled
- when workspace auth is disabled, they belong to the shared public workspace actor
- workspace-level auth/docs/registration toggles are still admin-owned

This keeps the core app lightweight while allowing multiple inference backends.

## Current Behavioral Caveats

- Anthropic is currently used for chat, not embeddings or transcription.
- Some providers are only partially wired because the backend only calls them where the code supports them.
- Deleting a conversation currently has stronger cleanup side effects than the docs historically implied.

Continue with:

- [Architecture](./README.md)
- [Database](../database/README.md)
- [Troubleshooting](../troubleshooting/README.md)
