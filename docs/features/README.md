# Features

This page documents what Olanma currently ships, not the older planned feature set.

## Core Product Areas

### Chat

Current chat capabilities:

- conversation creation and listing
- message streaming through SSE
- model selection
- RAG-assisted responses
- citations sourced from asset chunks
- vision-aware model switching when configured

### Library

The library is the main surface for processed assets.

Current asset types:

- documents
- audio
- video

For each asset, the product can surface:

- processing status
- transcript or extracted content
- summaries
- search/retrieval context

### Background Processing

Uploaded assets are processed asynchronously through Celery.

Current job flows:

- document analysis
- audio transcription
- video analysis

### Retrieval-Augmented Generation

RAG is built from:

- extracted transcript/content
- chunking
- provider-based embeddings
- cosine similarity search on `asset_chunks`
- citation metadata returned to chat

### Provider Management

Signed-in users can:

- add providers
- sync model catalogs
- enable/disable models
- pick per-account defaults indirectly through model availability/default flags

Admins additionally can:

- manage workspace-wide auth, docs, registration, and user administration

## Current Provider Capability Matrix

- OpenAI
  Chat, embeddings, transcription
- Anthropic
  Chat only
- Gemini
  Chat, embeddings
- Ollama
  Chat, embeddings
- OpenRouter
  Chat, embeddings
- LiteLLM
  Chat, embeddings, transcription if the proxy exposes OpenAI-compatible endpoints
- Local OpenAI-compatible gateway
  Chat, embeddings, transcription if the gateway exposes those endpoints

## Media Processing Reality

### Documents

Current supported document/input categories include:

- PDF
- plain text and markdown
- JSON and XML
- Office files such as DOCX, PPTX, XLSX
- images with OCR
- several code/text formats

### Audio

Audio uploads are transcribed through provider-based transcription rather than a bundled local Whisper runtime.

### Video

Video uploads are analyzed through the same worker pipeline and can produce:

- transcript text
- summaries
- key points
- action items
- chapters for video-oriented flows

## Workspace And Admin Features

The current workspace model is primarily configuration-oriented, not a full collaboration suite.

Shipped settings surfaces include:

- workspace auth toggle
- public registration toggle
- docs visibility toggle
- vision-aware toggle
- user administration
- provider management
- model availability control

Access model:

- `Users` is admin-only
- `Providers` and `Models` are user-scoped
- `Workspace` includes account actions for everyone and admin controls for admins

## Features That Are Not Shipped As Earlier Docs Implied

These were referenced in older docs but are not current shipped features:

- built-in local Whisper runtime
- built-in sentence-transformers embeddings runtime
- Cohere provider support
- HuggingFace provider support
- workspace collaborator roles
- soft-delete and recovery for conversations
- recent-activity center
- webhook and Zapier style integrations

## Current Product Caveats

- `/dashboard` is not the main analytics experience today; it redirects to `/library`
- conversation deletion currently has stronger side effects than most users would expect because it can cascade into asset cleanup

Related:

- [Frontend](../frontend/README.md)
- [Backend](../backend/README.md)
- [API](../api/README.md)
