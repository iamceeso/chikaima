from __future__ import annotations

from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.asset_chunk import AssetChunk
from app.models.audio import AudioAsset
from app.models.document import Document
from app.models.embedding import Embedding
from app.models.job import Job
from app.models.summary import SummaryArtifact
from app.models.transcript import Transcript
from app.models.video import Video
from app.services.asset_search_service import AssetSearchService
from app.services.llm_service import LLMService
from app.services.storage_service import storage_service

MAX_LLM_SOURCE_CHARS = 12_000


class TranscriptService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm = LLMService(db)
        self.search = AssetSearchService(db)

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
        model_map = {"audio": AudioAsset, "video": Video, "document": Document}
        model = model_map.get(resource_type)
        if model is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported resource type")
        resource = self.db.get(model, resource_id)
        if not resource or resource.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
        return resource

    def delete_resource(self, user_id: str, resource_type: str, resource_id: str) -> None:
        resource = self.get_resource(user_id, resource_type, resource_id)
        storage_service.delete_file(getattr(resource, "file_path", None))

        transcript_ids = [
            item.id
            for item in self.db.query(Transcript)
            .filter(
                Transcript.user_id == user_id,
                Transcript.resource_type == resource_type,
                Transcript.resource_id == resource_id,
            )
            .all()
        ]
        summary_ids = [
            item.id
            for item in self.db.query(SummaryArtifact)
            .filter(
                SummaryArtifact.user_id == user_id,
                SummaryArtifact.resource_type == resource_type,
                SummaryArtifact.resource_id == resource_id,
            )
            .all()
        ]

        (
            self.db.query(AssetChunk)
            .filter(
                AssetChunk.user_id == user_id,
                AssetChunk.source_type == resource_type,
                AssetChunk.source_id == resource_id,
            )
            .delete(synchronize_session=False)
        )
        if transcript_ids:
            (
                self.db.query(Embedding)
                .filter(
                    Embedding.user_id == user_id,
                    Embedding.source_type == "transcript",
                    Embedding.source_id.in_(transcript_ids),
                )
                .delete(synchronize_session=False)
            )
        if summary_ids:
            (
                self.db.query(Embedding)
                .filter(
                    Embedding.user_id == user_id,
                    Embedding.source_type == "summary",
                    Embedding.source_id.in_(summary_ids),
                )
                .delete(synchronize_session=False)
            )
        (
            self.db.query(Embedding)
            .filter(
                Embedding.user_id == user_id,
                Embedding.source_type == resource_type,
                Embedding.source_id == resource_id,
            )
            .delete(synchronize_session=False)
        )
        (
            self.db.query(Job)
            .filter(
                Job.user_id == user_id,
                Job.resource_type == resource_type,
                Job.resource_id == resource_id,
            )
            .delete(synchronize_session=False)
        )
        (
            self.db.query(Transcript)
            .filter(
                Transcript.user_id == user_id,
                Transcript.resource_type == resource_type,
                Transcript.resource_id == resource_id,
            )
            .delete(synchronize_session=False)
        )
        (
            self.db.query(SummaryArtifact)
            .filter(
                SummaryArtifact.user_id == user_id,
                SummaryArtifact.resource_type == resource_type,
                SummaryArtifact.resource_id == resource_id,
            )
            .delete(synchronize_session=False)
        )
        self.db.delete(resource)
        self.db.commit()

    def delete_all_resources(self, user_id: str, resource_type: str) -> int:
        model_map = {"audio": AudioAsset, "video": Video, "document": Document}
        model = model_map.get(resource_type)
        if model is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported resource type")
        resources = self.db.query(model).filter(model.user_id == user_id).all()
        for resource in resources:
            self.delete_resource(user_id, resource_type, resource.id)
        return len(resources)

    def list_summaries_for_resource(self, user_id: str, resource_type: str, resource_id: str) -> list[SummaryArtifact]:
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

        summary_artifact = by_type.get("summary") or SummaryArtifact(
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            summary_type="summary",
        )
        summary_artifact.content = bundle["summary"]
        summary_artifact.data = {}
        summary_artifact.status = "completed"

        key_points_artifact = by_type.get("key_points") or SummaryArtifact(
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
        elif resource_type == "video":
            resource.summary = bundle["summary"]
            resource.chapters = bundle["chapters"]
            resource.action_items = bundle["action_items"]
        self.db.add(resource)
        self.db.commit()
        return self.list_summaries_for_resource(user_id, resource_type, resource_id)

    def query_resource(self, user_id: str, resource_type: str, resource_id: str, question: str) -> str:
        resource = self.get_resource(user_id, resource_type, resource_id)
        transcript = self.get_for_resource(user_id, resource_type, resource_id)
        summaries = self.list_summaries_for_resource(user_id, resource_type, resource_id)

        grouped_hits: dict[tuple[str, str], list[tuple[str, dict]]] = defaultdict(list)
        search_results = self.search.search(user_id, question, source_type=resource_type, source_ids={resource_id}, limit=5)
        for result in search_results:
            for hit in result.chunks[:2]:
                grouped_hits[(result.source_type, result.source_id)].append((hit.chunk.content, hit.chunk.meta))

        relevant_context = "\n\n".join(
            f"[{self._format_citation(resource.name, meta)}]\n{content}"
            for hits in grouped_hits.values()
            for content, meta in hits
        ).strip()

        summary_text = ""
        key_points_text = ""
        for item in summaries:
            if item.summary_type == "summary" and item.content:
                summary_text = item.content
            if item.summary_type == "key_points":
                points = item.data.get("items") if isinstance(item.data, dict) else []
                if isinstance(points, list):
                    key_points_text = "\n".join(f"- {point}" for point in points if isinstance(point, str))

        prompt_parts = [f"Resource: {resource.name}", f"Type: {resource_type}"]
        if summary_text:
            prompt_parts.append(f"Summary:\n{summary_text}")
        if key_points_text:
            prompt_parts.append(f"Key points:\n{key_points_text}")
        if relevant_context:
            prompt_parts.append(f"Relevant excerpts:\n{relevant_context}")
        else:
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
                {"role": "system", "content": "Answer using only the transcript content provided. Be concise and factual."},
                {"role": "user", "content": f"Transcript:\n{transcript.content}\n\nQuestion: {question}"},
            ],
        )

    def _generate_summary_bundle(
        self,
        user_id: str,
        resource_type: str,
        asset_name: str,
        transcript_text: str,
    ) -> dict[str, list[str] | str]:
        fallback = self._fallback_summary_bundle(resource_type, asset_name, transcript_text)
        try:
            model, provider = self.llm.resolve_model_and_provider(user_id, None)
            source_excerpt = transcript_text[:MAX_LLM_SOURCE_CHARS]
            summary = self.llm.generate_reply(
                provider,
                model,
                [
                    {"role": "system", "content": "Summarize the provided source in 2-4 concise sentences. Be factual and specific."},
                    {"role": "user", "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}"},
                ],
            ).strip()
            key_points = self._parse_bullets(
                self.llm.generate_reply(
                    provider,
                    model,
                    [
                        {"role": "system", "content": "Extract 3 to 5 key points from the source. Return one bullet per line starting with '- '."},
                        {"role": "user", "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}"},
                    ],
                )
            )
            action_items: list[str] = []
            chapters: list[str] = []
            if resource_type in {"audio", "video"}:
                action_items = self._parse_bullets(
                    self.llm.generate_reply(
                        provider,
                        model,
                        [
                            {"role": "system", "content": "Extract explicit action items from the source. Return one bullet per line. If there are none, return 'No action items.'"},
                            {"role": "user", "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}"},
                        ],
                    )
                )
            if resource_type == "video":
                chapters = self._parse_bullets(
                    self.llm.generate_reply(
                        provider,
                        model,
                        [
                            {"role": "system", "content": "Create 3 to 6 short chapter headings for the source. Return one bullet per line."},
                            {"role": "user", "content": f"Resource: {asset_name}\nType: {resource_type}\n\nSource:\n{source_excerpt}"},
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
        excerpt = " ".join(transcript_text.split())[:280]
        summary = f"{asset_name} contains extracted {resource_type} content. {excerpt}" if excerpt else f"{asset_name} was processed as a {resource_type}, but no text could be extracted."
        return {"summary": summary, "key_points": [summary], "action_items": [], "chapters": []}

    def _parse_bullets(self, text: str) -> list[str]:
        return [line.removeprefix("-").removeprefix("*").strip() for line in text.splitlines() if line.strip()]

    def _format_citation(self, filename: str, metadata: dict) -> str:
        if not isinstance(metadata, dict):
            return filename
        if "page" in metadata:
            return f"{filename} page {metadata['page']}"
        if "slide" in metadata:
            return f"{filename} slide {metadata['slide']}"
        if "sheet" in metadata:
            return f"{filename} sheet {metadata['sheet']}"
        if "start_line" in metadata and "end_line" in metadata:
            return f"{filename} lines {metadata['start_line']}-{metadata['end_line']}"
        if "chunk_index" in metadata:
            return f"{filename} chunk {metadata['chunk_index']}"
        return filename
