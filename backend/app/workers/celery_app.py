import sys

from celery import Celery

from app.core.config import settings
import app.models  # noqa: F401  Ensure all SQLAlchemy models are registered before worker tasks run.

celery_app = Celery(
    "olanma",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)
celery_app.conf.task_track_started = True
celery_app.conf.result_extended = True

# On macOS in local development, sentence-transformers/PyTorch can abort inside
# Celery's prefork pool. Use a single-process worker to keep media jobs stable.
if settings.app_env == "development" and sys.platform == "darwin":
    celery_app.conf.worker_pool = "solo"
    celery_app.conf.worker_concurrency = 1
