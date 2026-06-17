# First Steps

This guide walks through the first real product flow in the current app.

## 1. Register Or Sign In

Open `http://localhost:3000`.

Use:

- `/register` to create the first account
- `/login` to sign in

## 2. Add A Provider

Before chat or most processing features are useful, configure at least one provider.

Open:

- `/settings/providers`

Typical first choices:

- OpenAI
- Anthropic
- Gemini
- Ollama
- OpenRouter
- LiteLLM

Then confirm models are available at:

- `/settings/models`

These pages are user-scoped, so each signed-in user can manage their own provider credentials and enabled models.

## 3. Upload An Asset

Use one of:

- `/uploads`
- `/library`
- `/workspace` for the batch video intake flow

Supported product areas today include:

- documents
- audio
- video

After upload:

1. the backend stores the file
2. a job is created
3. the Celery worker processes it
4. transcript, summary, and retrieval data become available when the job completes

## 4. Check Processing

Open:

- `/processing`

If work stalls in `pending`, the worker is usually not running.

## 5. Chat With Retrieved Context

Open:

- `/chat`

Then:

1. create a conversation
2. choose a model
3. ask a question about an uploaded asset

The current chat experience supports:

- streaming responses
- model selection
- retrieval over processed asset chunks
- citations

## Current Product Notes

- `/dashboard` redirects to `/library`
- `/providers` redirects to `/settings/providers`
- the current workspace area is operational/configuration-focused, not a full collaboration suite
- `/settings/users` is admin-only

## Good Smoke Test Prompts

- `Summarize the uploaded file.`
- `List the key action items from this asset.`
- `What evidence supports your answer?`

Continue with:

- [Features](../features/README.md)
- [API](../api/README.md)
- [Troubleshooting](../troubleshooting/README.md)
