# API

This page summarizes the current API surface exposed under `/api/v1`.

It is a map of the live route groups in [backend/app/api/v1/api.py](../../backend/app/api/v1/api.py), not a complete OpenAPI dump.

## Authentication

Most endpoints require:

```text
Authorization: Bearer <access_token>
```

Auth routes:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

## Users

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/{user_id}`
- `DELETE /api/v1/users/{user_id}`

Admin-only routes are enforced in the backend.

## Providers And Models

Providers:

- `GET /api/v1/providers`
- `POST /api/v1/providers`
- `PATCH /api/v1/providers/{provider_id}`
- `DELETE /api/v1/providers/{provider_id}`

Models:

- `GET /api/v1/models`

Workspace model visibility:

- `GET /api/v1/settings/models`
- `PATCH /api/v1/settings/models`

## Chat

Conversation endpoints:

- `GET /api/v1/chat/conversations`
- `POST /api/v1/chat/conversations`
- `DELETE /api/v1/chat/conversations/{conversation_id}`

Message endpoints:

- `POST /api/v1/chat/conversations/{conversation_id}/messages`
- `PATCH /api/v1/chat/messages/{message_id}`
- `POST /api/v1/chat/messages/regenerate`

Streaming endpoint:

- `POST /api/v1/chat/stream`

### Streaming Event Sequence

The stream emits SSE events in this shape:

- `metadata`
- `token`
- `done`
- `error`

The current implementation writes assistant output to the database after the stream completes successfully.

## Documents

- `GET /api/v1/documents`
- `POST /api/v1/documents/upload`
- `DELETE /api/v1/documents`
- `DELETE /api/v1/documents/{document_id}`
- `GET /api/v1/documents/{document_id}/transcript`
- `GET /api/v1/documents/{document_id}/summaries`
- `POST /api/v1/documents/{document_id}/summarize`
- `POST /api/v1/documents/{document_id}/ask`

## Audio

- `GET /api/v1/audio`
- `POST /api/v1/audio/upload`
- `DELETE /api/v1/audio`
- `DELETE /api/v1/audio/{audio_id}`
- `GET /api/v1/audio/{audio_id}/transcript`
- `GET /api/v1/audio/{audio_id}/summaries`
- `POST /api/v1/audio/speech-to-text`
- `POST /api/v1/audio/text-to-speech`

Notes:

- `speech-to-text` and `text-to-speech` currently return `501 Not Implemented`.

## Video

- `GET /api/v1/video`
- `POST /api/v1/video/upload`
- `DELETE /api/v1/video`
- `DELETE /api/v1/video/{video_id}`
- `GET /api/v1/video/{video_id}/transcript`
- `GET /api/v1/video/{video_id}/summaries`
- `POST /api/v1/video/{video_id}/analyze`

## Assets, Library, Jobs, Dashboard

- `GET /api/v1/assets/{resource_type}/{resource_id}/file`
- `GET /api/v1/library`
- `GET /api/v1/jobs`
- `GET /api/v1/dashboard`

The current dashboard endpoint returns a lightweight summary payload, even though the frontend dashboard route is not the primary user-facing surface.

## Transcripts

- `POST /api/v1/transcripts/{transcript_id}/query`

## Workspace Settings

- `GET /api/v1/settings/public`
- `GET /api/v1/settings/workspace`
- `PATCH /api/v1/settings/workspace`

These endpoints back:

- auth enable/disable
- public registration
- docs visibility
- vision-aware behavior
- model availability

## Docs And OpenAPI

The FastAPI docs routes are present but gated by workspace settings:

- `/docs`
- `/redoc`
- `/api/v1/openapi.json`

See [backend/app/main.py](../../backend/app/main.py) for the current behavior.

Related:

- [Backend](../backend/README.md)
- [Features](../features/README.md)
- [Troubleshooting](../troubleshooting/README.md)
