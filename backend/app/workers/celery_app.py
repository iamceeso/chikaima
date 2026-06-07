from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "olanma",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)
celery_app.conf.task_track_started = True
celery_app.conf.result_extended = True
