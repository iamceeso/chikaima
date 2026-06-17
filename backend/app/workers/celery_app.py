from celery import Celery

import app.models  # noqa: F401  Ensure all SQLAlchemy models are registered before worker tasks run.
from app.core.config import settings

celery_app = Celery(
    "chikaima",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)
celery_app.conf.task_track_started = True
celery_app.conf.result_extended = True
