from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.job import Job
from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.models.video import Video
from app.services.asset_processors import processor_registry
from app.services.embeddings_service import EmbeddingsService
from app.services.llm_service import LLMService
from app.workers.celery_app import celery_app

MAX_LLM_SOURCE_CHARS = 12_000


@celery_app.task(name="olanma.video.process")
def process_video(job_id: str) -> dict[str, str]:
    return _process_resource_job(job_id, Video, "video")


@celery_app.task(name="olanma.document.analyze")
def analyze_document(job_id: str) -> dict[str, str]:
    return _process_resource_job(job_id, Document, "document")


@celery_app.task(name="olanma.audio.transcribe")
def transcribe_audio(job_id: str) -> dict[str, str]:
    return _process_resource_job(job_id, AudioAsset, "audio")


def _process_resource_job(job_id: str, model: type[AudioAsset | Video | Document], resource_type: str) -> dict[str, str]:
    db: Session = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return {"job_id": job_id, "status": "failed", "message": "Job not found"}

        resource = db.get(model, job.resource_id)
        if not resource:
            job.status = "failed"
            job.error_message = "Resource not found"
            db.add(job)
            db.commit()
            return {"job_id": job_id, "status": "failed", "message": "Resource not found"}

        job.status = "running"
        resource.status = "processing"
        db.add_all([job, resource])
        db.commit()

        mime_type = getattr(resource, "mime_type", None)
        processor = processor_registry.select(resource, mime_type)
        extracted = processor.extract(resource, mime_type)
        extracted_text = (extracted.transcript or extracted.content or "").strip()

        transcript = _upsert_transcript(db, resource, resource_type, extracted_text)
        summary_bundle = _generate_summary_bundle(db, resource, resource_type, extracted_text)
        _upsert_summary_artifacts(db, resource, resource_type, summary_bundle)
        _update_resource_fields(resource, resource_type, extracted_text, summary_bundle)

        EmbeddingsService(db).replace_chunks_for_source(
            user_id=resource.user_id,
            source_type=resource_type,
            source_id=resource.id,
            asset_type=_resolve_asset_type(resource_type, resource),
            filename=resource.name,
            chunks=[(chunk.content, chunk.metadata) for chunk in extracted.chunks],
        )

        resource.status = "completed"
        job.status = "completed"
        job.result = {"resource_type": resource_type, "resource_id": resource.id, "transcript_id": transcript.id}
        db.add_all([resource, job])
        db.commit()
        return {"job_id": job.id, "status": "completed", "resource_id": resource.id}
    except Exception as exc:  # noqa: BLE001
        job = db.get(Job, job_id)
        if job:
            job.status = "failed"
            job.error_message = str(exc)
            db.add(job)
            if job.resource_id:
                resource = db.get(model, job.resource_id)
                if resource:
                    resource.status = "failed"
                    db.add(resource)
            db.commit()
        raise
    finally:
        db.close()


def _upsert_transcript(db: Session, resource: AudioAsset | Video | Document, resource_type: str, content: str) -> Transcript:
    transcript = (
        db.query(Transcript)
        .filter(
            Transcript.user_id == resource.user_id,
            Transcript.resource_type == resource_type,
            Transcript.resource_id == resource.id,
        )
        .order_by(Transcript.created_at.desc())
        .first()
    )
    if transcript is None:
        transcript = Transcript(
            user_id=resource.user_id,
            resource_type=resource_type,
            resource_id=resource.id,
            language="en",
            segments=[],
        )
    transcript.content = content
    transcript.segments = [{"speaker": "system", "text": content}] if content else []
    transcript.status = "completed"
    db.add(transcript)
    db.flush()
    return transcript


def _upsert_summary_artifacts(
    db: Session,
    resource: AudioAsset | Video | Document,
    resource_type: str,
    bundle: dict[str, list[str] | str],
) -> None:
    existing = (
        db.query(SummaryArtifact)
        .filter(
            SummaryArtifact.user_id == resource.user_id,
            SummaryArtifact.resource_type == resource_type,
            SummaryArtifact.resource_id == resource.id,
        )
        .all()
    )
    by_type = {item.summary_type: item for item in existing}

    summary_artifact = by_type.get("summary") or SummaryArtifact(
        user_id=resource.user_id,
        resource_type=resource_type,
        resource_id=resource.id,
        summary_type="summary",
    )
    summary_artifact.content = str(bundle["summary"])
    summary_artifact.data = {}
    summary_artifact.status = "completed"

    key_points_artifact = by_type.get("key_points") or SummaryArtifact(
        user_id=resource.user_id,
        resource_type=resource_type,
        resource_id=resource.id,
        summary_type="key_points",
    )
    key_points_artifact.content = ""
    key_points_artifact.data = {"items": bundle["key_points"]}
    key_points_artifact.status = "completed"
    db.add_all([summary_artifact, key_points_artifact])
    db.flush()


def _generate_summary_bundle(
    db: Session,
    resource: AudioAsset | Video | Document,
    resource_type: str,
    content: str,
) -> dict[str, list[str] | str]:
    fallback = _fallback_summary_bundle(resource.name, resource_type, content)
    if not content.strip():
        return fallback
    try:
        llm = LLMService(db)
        model, provider = llm.resolve_model_and_provider(resource.user_id, None)
        excerpt = content[:MAX_LLM_SOURCE_CHARS]
        summary = llm.generate_reply(
            provider,
            model,
            [
                {"role": "system", "content": "Summarize the provided source in 2-4 concise sentences. Be factual and specific."},
                {"role": "user", "content": f"Resource: {resource.name}\nType: {resource_type}\n\nSource:\n{excerpt}"},
            ],
        ).strip()
        key_points = _parse_bullets(
            llm.generate_reply(
                provider,
                model,
                [
                    {"role": "system", "content": "Extract 3 to 5 key points from the source. Return one bullet per line starting with '- '."},
                    {"role": "user", "content": f"Resource: {resource.name}\nType: {resource_type}\n\nSource:\n{excerpt}"},
                ],
            )
        )
        action_items: list[str] = []
        chapters: list[str] = []
        if resource_type in {"audio", "video"}:
            action_items = _parse_bullets(
                llm.generate_reply(
                    provider,
                    model,
                    [
                        {"role": "system", "content": "Extract explicit action items from the source. Return one bullet per line. If there are none, return 'No action items.'"},
                        {"role": "user", "content": f"Resource: {resource.name}\nType: {resource_type}\n\nSource:\n{excerpt}"},
                    ],
                )
            )
        if resource_type == "video":
            chapters = _parse_bullets(
                llm.generate_reply(
                    provider,
                    model,
                    [
                        {"role": "system", "content": "Create 3 to 6 short chapter headings for the source. Return one bullet per line."},
                        {"role": "user", "content": f"Resource: {resource.name}\nType: {resource_type}\n\nSource:\n{excerpt}"},
                    ],
                )
            )
        return {
            "summary": summary or fallback["summary"],
            "key_points": key_points or fallback["key_points"],
            "action_items": action_items or fallback["action_items"],
            "chapters": chapters or fallback["chapters"],
        }
    except Exception:
        return fallback


def _fallback_summary_bundle(name: str, resource_type: str, content: str) -> dict[str, list[str] | str]:
    excerpt = " ".join(content.split())[:280]
    summary = f"{name} contains extracted {resource_type} content. {excerpt}" if excerpt else f"{name} was processed as a {resource_type}, but no text could be extracted."
    return {"summary": summary, "key_points": [summary], "action_items": [], "chapters": []}


def _parse_bullets(text: str) -> list[str]:
    return [line.removeprefix("-").removeprefix("*").strip() for line in text.splitlines() if line.strip()]


def _update_resource_fields(
    resource: AudioAsset | Video | Document,
    resource_type: str,
    transcript_text: str,
    bundle: dict[str, list[str] | str],
) -> None:
    if isinstance(resource, AudioAsset):
        resource.transcript = transcript_text
    if isinstance(resource, Video):
        resource.transcript = transcript_text
        resource.summary = str(bundle["summary"])
        resource.chapters = list(bundle["chapters"])
        resource.action_items = list(bundle["action_items"])
    if isinstance(resource, Document):
        resource.summary = str(bundle["summary"])


def _resolve_asset_type(resource_type: str, resource: AudioAsset | Video | Document) -> str:
    if resource_type in {"audio", "video"}:
        return resource_type
    mime_type = getattr(resource, "mime_type", "")
    if mime_type == "application/pdf":
        return "document"
    if mime_type in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }:
        return "office"
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("text/"):
        return "text"
    if resource.name.lower().endswith((".js", ".ts", ".tsx", ".jsx", ".py", ".cs", ".java", ".go", ".rs")):
        return "code"
    return "document"
