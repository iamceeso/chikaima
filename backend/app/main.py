import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.transcription_runtime import bootstrap_transcription_runtime
from app.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    _ensure_vector_extension()
    bootstrap_transcription_runtime()
    yield

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


def _ensure_vector_extension() -> None:
    db = SessionLocal()
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("Could not enable pgvector extension automatically: %s", exc)
    finally:
        db.close()


def _docs_enabled() -> bool:
    db = SessionLocal()
    try:
        return WorkspaceService(db).get_or_create().docs_enabled
    finally:
        db.close()


def _raise_docs_disabled() -> None:
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/docs", include_in_schema=False)
def swagger_ui() -> JSONResponse:
    if not _docs_enabled():
        _raise_docs_disabled()
    return get_swagger_ui_html(
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        title=f"{settings.app_name} - Swagger UI",
    )


@app.get("/redoc", include_in_schema=False)
def redoc_ui() -> JSONResponse:
    if not _docs_enabled():
        _raise_docs_disabled()
    return get_redoc_html(
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        title=f"{settings.app_name} - ReDoc",
    )


@app.get(f"{settings.api_v1_prefix}/openapi.json", include_in_schema=False)
def openapi_schema() -> JSONResponse:
    if not _docs_enabled():
        _raise_docs_disabled()
    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    return JSONResponse(schema)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}

def startup_checks() -> None:
    _ensure_vector_extension()
    bootstrap_transcription_runtime()
