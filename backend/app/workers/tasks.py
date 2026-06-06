from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.job import Job
from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.models.video import Video
from app.workers.celery_app import celery_app


@celery_app.task(name="olanma.video.process")
def process_video(job_id: str) -> dict[str, str]:
    return _process_asset_job(job_id, Video, "video")


@celery_app.task(name="olanma.document.analyze")
def analyze_document(job_id: str) -> dict[str, str]:
    return _process_asset_job(job_id, Document, "document")


@celery_app.task(name="olanma.audio.transcribe")
def transcribe_audio(job_id: str) -> dict[str, str]:
    return _process_asset_job(job_id, AudioAsset, "audio")


def _process_asset_job(job_id: str, model: type[AudioAsset | Video | Document], resource_type: str) -> dict[str, str]:
    db: Session = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return {"job_id": job_id, "status": "failed", "message": "Job not found"}

        asset = db.get(model, job.resource_id)
        if not asset:
            job.status = "failed"
            job.error_message = "Asset not found"
            db.add(job)
            db.commit()
            return {"job_id": job_id, "status": "failed", "message": "Asset not found"}

        job.status = "running"
        asset.status = "processing"
        db.add_all([job, asset])
        db.commit()

        transcript_text = (
            f"Transcript placeholder for {asset.name}. "
            f"This pipeline is now wired through storage and background jobs and is ready for provider-specific transcription adapters."
        )

        transcript = Transcript(
            user_id=job.user_id,
            resource_type=resource_type,
            resource_id=asset.id,
            language="en",
            content=transcript_text,
            segments=[{"speaker": "system", "text": transcript_text}],
            status="completed",
        )
        db.add(transcript)

        db.add(
            SummaryArtifact(
                user_id=job.user_id,
                resource_type=resource_type,
                resource_id=asset.id,
                summary_type="summary",
                content=f"Summary placeholder for {asset.name}.",
                data={},
                status="completed",
            )
        )
        db.add(
            SummaryArtifact(
                user_id=job.user_id,
                resource_type=resource_type,
                resource_id=asset.id,
                summary_type="key_points",
                content="",
                data={
                    "items": [
                        f"{asset.name} was ingested successfully.",
                        "Transcript storage is now wired.",
                        "Summary artifacts are ready for provider-backed enrichment.",
                    ]
                },
                status="completed",
            )
        )

        asset.status = "completed"
        if isinstance(asset, AudioAsset):
            asset.transcript = transcript_text
        if isinstance(asset, Video):
            asset.transcript = transcript_text
            asset.summary = f"Summary placeholder for {asset.name}."
            asset.chapters = ["Introduction", "Discussion", "Wrap-up"]
            asset.action_items = ["Review transcript", "Add provider-backed transcription", "Validate summary output"]
        if isinstance(asset, Document):
            asset.summary = f"Summary placeholder for {asset.name}."

        job.status = "completed"
        job.result = {"resource_type": resource_type, "resource_id": asset.id}
        db.add_all([asset, job])
        db.commit()
        return {"job_id": job.id, "status": "completed", "resource_id": asset.id}
    except Exception as exc:  # noqa: BLE001
        job = db.get(Job, job_id)
        if job:
            job.status = "failed"
            job.error_message = str(exc)
            db.add(job)
            db.commit()
        raise
    finally:
        db.close()
