# Guides

This page contains practical extension notes based on the current codebase.

## Add A New Chat Provider

The current provider path is:

1. add or update provider metadata in [provider_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/provider_service.py)
2. add adapter behavior in [base.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/providers/base.py)
3. wire provider selection in [factory.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/providers/factory.py)
4. update tests:
   - `backend/tests/test_provider_service.py`
   - `backend/tests/test_provider_factory.py`
   - `backend/tests/test_provider_adapters.py`

Use this path when the provider needs a custom request format.

If the provider is OpenAI-compatible, prefer extending the OpenAI-compatible path instead of creating a completely new adapter.

## Add Provider-Based Embeddings Support

Embedding support lives in [embeddings_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/embeddings_service.py).

You will usually need to:

1. add the provider type to the supported embedding set
2. define its default base URL and model
3. implement the provider-specific embedding request
4. add tests for success and failure behavior

## Add Provider-Based Transcription Support

Transcription support lives in [transcription_provider_service.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/transcription_provider_service.py).

The current implementation is intentionally narrower than chat support. Additions here should be explicit because transcription endpoint formats vary more than chat formats.

## Add A New API Endpoint

The current backend pattern is:

1. create or update a schema in `backend/app/schemas`
2. add service logic in `backend/app/services`
3. add the endpoint in `backend/app/api/v1/endpoints`
4. register it in [api.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/api/v1/api.py) if needed
5. add endpoint and service tests

## Add A New Asset Processing Path

Asset extraction starts in [asset_processors.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/services/asset_processors.py), while background orchestration happens in [tasks.py](https://github.com/iamceeso/chikaima/blob/main/backend/app/workers/tasks.py).

The normal pattern is:

1. teach the processor how to recognize the asset type
2. return extracted content and chunks
3. let the worker pipeline handle transcript, summaries, and embeddings

## Ship A Release

Recommended flow:

```bash
./pre-push.sh
./version-patch.sh
git push origin HEAD
git push origin vX.Y.Z
```

The tag push triggers image publishing through GitHub Actions.

## Keep Docs Honest

If you change:

- provider capabilities
- upload types
- routes
- release flow
- runtime dependencies

update the matching page in `docs/` in the same change if possible.

Related:

- [Development](../development/README.md)
- [API](../api/README.md)
- [Architecture](../architecture/README.md)
