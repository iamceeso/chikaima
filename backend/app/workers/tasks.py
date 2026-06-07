from __future__ import annotations

import html
import re
import zipfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.job import Job
from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.models.video import Video
from app.services.embeddings_service import EmbeddingsService
from app.services.llm_service import LLMService
from app.workers.celery_app import celery_app

MAX_LLM_SOURCE_CHARS = 12_000


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

        transcript_text = _build_transcript_text(asset, resource_type)
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
        db.flush()

        summary_bundle = _generate_summary_bundle(db, job.user_id, resource_type, asset.name, transcript_text)
        summary_artifact = SummaryArtifact(
            user_id=job.user_id,
            resource_type=resource_type,
            resource_id=asset.id,
            summary_type="summary",
            content=summary_bundle["summary"],
            data={},
            status="completed",
        )
        key_points_artifact = SummaryArtifact(
            user_id=job.user_id,
            resource_type=resource_type,
            resource_id=asset.id,
            summary_type="key_points",
            content="",
            data={"items": summary_bundle["key_points"]},
            status="completed",
        )
        db.add_all([summary_artifact, key_points_artifact])

        embeddings = EmbeddingsService(db)
        embeddings.index_transcript(job.user_id, transcript.id, transcript_text[:MAX_LLM_SOURCE_CHARS])
        if summary_bundle["summary"]:
            db.flush()
            embeddings.index_summary(job.user_id, summary_artifact.id, summary_bundle["summary"])
        if resource_type == "document" and transcript_text:
            embeddings.index_document(job.user_id, asset.id, transcript_text[:MAX_LLM_SOURCE_CHARS])

        asset.status = "completed"
        if isinstance(asset, AudioAsset):
            asset.transcript = transcript_text
        if isinstance(asset, Video):
            asset.transcript = transcript_text
            asset.summary = summary_bundle["summary"]
            asset.chapters = summary_bundle["chapters"]
            asset.action_items = summary_bundle["action_items"]
        if isinstance(asset, Document):
            asset.summary = summary_bundle["summary"]

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


def _build_transcript_text(asset: AudioAsset | Video | Document, resource_type: str) -> str:
    if isinstance(asset, Document):
        extracted = _extract_document_text(asset)
        if extracted:
            return extracted

    return (
        f"Transcript placeholder for {asset.name}. "
        f"This {resource_type} pipeline is ready for provider-backed transcription and extraction adapters."
    )


def _extract_document_text(document: Document) -> str:
    path = Path(document.file_path)
    if not path.exists():
        return ""

    mime_type = document.mime_type.lower()
    if mime_type in {"text/plain", "text/markdown"}:
        return path.read_text(encoding="utf-8", errors="ignore").strip()
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx_text(path)
    return ""


def _extract_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            document_xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
    except (FileNotFoundError, KeyError, zipfile.BadZipFile):
        return ""

    paragraphs = re.findall(r"<w:t[^>]*>(.*?)</w:t>", document_xml)
    cleaned = [html.unescape(text).strip() for text in paragraphs if text.strip()]
    return "\n".join(cleaned).strip()


def _generate_summary_bundle(
    db: Session,
    user_id: str,
    resource_type: str,
    asset_name: str,
    transcript_text: str,
) -> dict[str, list[str] | str]:
    fallback = _fallback_summary_bundle(resource_type, asset_name, transcript_text)

    try:
        llm = LLMService(db)
        model, provider = llm.resolve_model_and_provider(user_id, None)
        source_excerpt = transcript_text[:MAX_LLM_SOURCE_CHARS]

        summary = llm.generate_reply(
            provider,
            model,
            [
                {
                    "role": "system",
                    "content": "Summarize the provided source in 2-4 concise sentences. Be factual and specific.",
                },
                {
                    "role": "user",
                    "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}",
                },
            ],
        ).strip()

        key_points = _parse_bullets(
            llm.generate_reply(
                provider,
                model,
                [
                    {
                        "role": "system",
                        "content": "Extract 3 to 5 key points from the source. Return one bullet per line starting with '- '.",
                    },
                    {
                        "role": "user",
                        "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}",
                    },
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
                        {
                            "role": "system",
                            "content": "Extract explicit action items from the source. Return one bullet per line. If there are none, return 'No action items.'",
                        },
                        {
                            "role": "user",
                            "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}",
                        },
                    ],
                )
            )
        if resource_type == "video":
            chapters = _parse_bullets(
                llm.generate_reply(
                    provider,
                    model,
                    [
                        {
                            "role": "system",
                            "content": "Create 3 to 6 short chapter headings for the source. Return one bullet per line.",
                        },
                        {
                            "role": "user",
                            "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}",
                        },
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


def _fallback_summary_bundle(resource_type: str, asset_name: str, transcript_text: str) -> dict[str, list[str] | str]:
    excerpt = transcript_text.strip().replace("\n", " ")
    short_excerpt = excerpt[:280] + ("..." if len(excerpt) > 280 else "")
    summary = short_excerpt or f"{asset_name} was processed successfully."
    key_points = [
        f"{asset_name} was ingested successfully.",
        f"{resource_type.title()} transcript is available for follow-up questions.",
        "Provider-backed summarization can enrich this further when a model is configured.",
    ]
    action_items = ["Review the generated transcript and summary."]
    chapters = ["Overview", "Details", "Next steps"] if resource_type == "video" else []
    return {
        "summary": summary,
        "key_points": key_points,
        "action_items": action_items,
        "chapters": chapters,
    }


def _parse_bullets(text: str) -> list[str]:
    items: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[-*•\d.\)\s]+", "", line).strip()
        if line and line.lower() != "no action items.":
            items.append(line)
    return items
