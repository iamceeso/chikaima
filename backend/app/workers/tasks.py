from __future__ import annotations

from app.workers.celery_app import celery_app


@celery_app.task(name="olanma.video.process")
def process_video(video_id: str) -> dict[str, str]:
    return {"video_id": video_id, "status": "completed", "message": "Video pipeline placeholder executed"}


@celery_app.task(name="olanma.document.analyze")
def analyze_document(document_id: str) -> dict[str, str]:
    return {"document_id": document_id, "status": "completed"}


@celery_app.task(name="olanma.audio.transcribe")
def transcribe_audio(audio_id: str) -> dict[str, str]:
    return {"audio_id": audio_id, "status": "completed"}
