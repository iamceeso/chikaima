from fastapi import APIRouter

from app.api.v1.endpoints import (
    audio,
    auth,
    chat,
    dashboard,
    documents,
    jobs,
    library,
    models,
    providers,
    settings,
    transcripts,
    users,
    video,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(models.router, prefix="/models", tags=["models"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(audio.router, prefix="/audio", tags=["audio"])
api_router.include_router(video.router, prefix="/video", tags=["video"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(transcripts.router, prefix="/transcripts", tags=["transcripts"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
