from __future__ import annotations

from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.models.video import Video
from app.services.embeddings_service import EmbeddingsService
from app.services.llm_service import LLMService

MAX_LLM_SOURCE_CHARS = 12_000


class TranscriptService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm = LLMService(db)
        self.embeddings = EmbeddingsService(db)

    def get_for_resource(self, user_id: str, resource_type: str, resource_id: str) -> Transcript:
        transcript = (
            self.db.query(Transcript)
            .filter(
                Transcript.user_id == user_id,
                Transcript.resource_type == resource_type,
                Transcript.resource_id == resource_id,
            )
            .order_by(Transcript.created_at.desc())
            .first()
        )
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")
        return transcript

    def get_resource(self, user_id: str, resource_type: str, resource_id: str) -> AudioAsset | Video | Document:
        model_map = {
            "audio": AudioAsset,
            "video": Video,
            "document": Document,
        }
        model = model_map.get(resource_type)
        if model is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported resource type")

        resource = self.db.get(model, resource_id)
        if not resource or resource.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
        return resource

    def list_summaries_for_resource(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
    ) -> list[SummaryArtifact]:
        return list(
            self.db.query(SummaryArtifact)
            .filter(
                SummaryArtifact.user_id == user_id,
                SummaryArtifact.resource_type == resource_type,
                SummaryArtifact.resource_id == resource_id,
            )
            .order_by(SummaryArtifact.created_at.asc())
            .all()
        )

    def summarize_resource(self, user_id: str, resource_type: str, resource_id: str) -> list[SummaryArtifact]:
        resource = self.get_resource(user_id, resource_type, resource_id)
        transcript = self.get_for_resource(user_id, resource_type, resource_id)
        bundle = self._generate_summary_bundle(user_id, resource_type, resource.name, transcript.content)

        existing = self.list_summaries_for_resource(user_id, resource_type, resource_id)
        by_type = {item.summary_type: item for item in existing}

        summary_artifact = by_type.get("summary")
        if summary_artifact is None:
            summary_artifact = SummaryArtifact(
                user_id=user_id,
                resource_type=resource_type,
                resource_id=resource_id,
                summary_type="summary",
            )
        summary_artifact.content = bundle["summary"]
        summary_artifact.data = {}
        summary_artifact.status = "completed"

        key_points_artifact = by_type.get("key_points")
        if key_points_artifact is None:
            key_points_artifact = SummaryArtifact(
                user_id=user_id,
                resource_type=resource_type,
                resource_id=resource_id,
                summary_type="key_points",
            )
        key_points_artifact.content = ""
        key_points_artifact.data = {"items": bundle["key_points"]}
        key_points_artifact.status = "completed"

        self.db.add_all([summary_artifact, key_points_artifact])

        if resource_type == "document":
            resource.summary = bundle["summary"]
            self.embeddings.index_document(user_id, resource_id, transcript.content[:MAX_LLM_SOURCE_CHARS])
        elif resource_type == "video":
            resource.summary = bundle["summary"]
            resource.chapters = bundle["chapters"]
            resource.action_items = bundle["action_items"]

        self.db.add(resource)
        self.db.flush()
        if summary_artifact.content:
            self.embeddings.index_summary(user_id, summary_artifact.id, summary_artifact.content)
        self.db.commit()

        return self.list_summaries_for_resource(user_id, resource_type, resource_id)

    def query_resource(self, user_id: str, resource_type: str, resource_id: str, question: str) -> str:
        resource = self.get_resource(user_id, resource_type, resource_id)
        transcript = self.get_for_resource(user_id, resource_type, resource_id)
        summaries = self.list_summaries_for_resource(user_id, resource_type, resource_id)

        summary_text = ""
        key_points_text = ""
        for item in summaries:
            if item.summary_type == "summary" and item.content:
                summary_text = item.content
            if item.summary_type == "key_points":
                points = item.data.get("items") if isinstance(item.data, dict) else []
                if isinstance(points, list):
                    key_points_text = "\n".join(f"- {point}" for point in points if isinstance(point, str))

        grouped_hits: dict[tuple[str, str], list[str]] = defaultdict(list)
        transcript_hits = self.embeddings.search_similar(
            user_id,
            question,
            source_type="transcript",
            limit=8,
            dedupe_sources=False,
        )
        for hit, _score in transcript_hits:
            if hit.source_id == transcript.id:
                grouped_hits[(hit.source_type, hit.source_id)].append(hit.content)
        if resource_type == "document":
            document_hits = self.embeddings.search_similar(
                user_id,
                question,
                source_type="document",
                limit=8,
                dedupe_sources=False,
            )
            for hit, _score in document_hits:
                if hit.source_id == resource_id:
                    grouped_hits[(hit.source_type, hit.source_id)].append(hit.content)

        relevant_context = "\n\n".join(
            "\n".join(chunks[:2]).strip()
            for chunks in grouped_hits.values()
            if chunks
        ).strip()

        prompt_parts = [
            f"Resource: {resource.name}",
            f"Type: {resource_type}",
        ]
        if summary_text:
            prompt_parts.append(f"Summary:\n{summary_text}")
        if key_points_text:
            prompt_parts.append(f"Key points:\n{key_points_text}")
        if relevant_context:
            prompt_parts.append(f"Relevant excerpts:\n{relevant_context}")
        prompt_parts.append(f"Transcript:\n{transcript.content[:MAX_LLM_SOURCE_CHARS]}")
        prompt_parts.append(f"Question: {question}")

        model, provider = self.llm.resolve_model_and_provider(user_id, None)
        return self.llm.generate_reply(
            provider=provider,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer using the provided resource transcript, summary, and excerpts. "
                        "Prefer direct evidence from the material and say when the answer is uncertain."
                    ),
                },
                {"role": "user", "content": "\n\n".join(prompt_parts)},
            ],
        )

    def query_transcript(self, user_id: str, transcript_id: str, question: str) -> str:
        transcript = self.db.get(Transcript, transcript_id)
        if not transcript or transcript.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")

        model, provider = self.llm.resolve_model_and_provider(user_id, None)
        return self.llm.generate_reply(
            provider=provider,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Answer using only the transcript content provided. Be concise and factual.",
                },
                {
                    "role": "user",
                    "content": f"Transcript:\n{transcript.content}\n\nQuestion: {question}",
                },
            ],
        )

    def _generate_summary_bundle(
        self,
        user_id: str,
        resource_type: str,
        asset_name: str,
        transcript_text: str,
    ) -> dict[str, list[str] | str]:
        excerpt = transcript_text[:MAX_LLM_SOURCE_CHARS]
        fallback = self._fallback_summary_bundle(resource_type, asset_name, transcript_text)
        try:
            model, provider = self.llm.resolve_model_and_provider(user_id, None)
        except HTTPException:
            return fallback
        except Exception:
            return fallback

        try:
            summary = self.llm.generate_reply(
                provider=provider,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Summarize the source in 2-4 concise factual sentences.",
                    },
                    {
                        "role": "user",
                        "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{excerpt}",
                    },
                ],
            ).strip()
            key_points = self._parse_bullets(
                self.llm.generate_reply(
                    provider=provider,
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": "Extract 3 to 5 key points. Return one bullet per line prefixed with '- '.",
                        },
                        {
                            "role": "user",
                            "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{excerpt}",
                        },
                    ],
                )
            )
            action_items: list[str] = []
            chapters: list[str] = []
            if resource_type in {"audio", "video"}:
                action_items = self._parse_bullets(
                    self.llm.generate_reply(
                        provider=provider,
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": "Extract explicit action items. Return one bullet per line, or 'No action items.'",
                            },
                            {
                                "role": "user",
                                "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{excerpt}",
                            },
                        ],
                    )
                )
            if resource_type == "video":
                chapters = self._parse_bullets(
                    self.llm.generate_reply(
                        provider=provider,
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": "Create 3 to 6 short chapter headings. Return one bullet per line.",
                            },
                            {
                                "role": "user",
                                "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{excerpt}",
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

    def _fallback_summary_bundle(self, resource_type: str, asset_name: str, transcript_text: str) -> dict[str, list[str] | str]:
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

    def _parse_bullets(self, text: str) -> list[str]:
        items: list[str] = []
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            while line[:1] in {"-", "*", "•"}:
                line = line[1:].strip()
            line = line.lstrip("0123456789.) ").strip()
            if line and line.lower() != "no action items.":
                items.append(line)
        return items
