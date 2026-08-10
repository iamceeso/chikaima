-- Foreign-key lookup indexes (mirrors the `index=True` columns on the SQLAlchemy models).
CREATE INDEX IF NOT EXISTS `idx_providers_user_id` ON `providers` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_models_provider_id` ON `ai_models` (`provider_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_models_model_key` ON `ai_models` (`model_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversations_user_id` ON `conversations` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_messages_conversation_id` ON `messages` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_documents_user_id` ON `documents` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audio_assets_user_id` ON `audio_assets` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_videos_user_id` ON `videos` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_user_id` ON `jobs` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_status` ON `jobs` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transcripts_user_id` ON `transcripts` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transcripts_resource` ON `transcripts` (`user_id`, `resource_type`, `resource_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_summary_artifacts_user_id` ON `summary_artifacts` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_summary_artifacts_resource` ON `summary_artifacts` (`user_id`, `resource_type`, `resource_id`);
--> statement-breakpoint
-- Mirrors alembic 20260607_0006_assets.py: composite lookup + source indexes on asset_chunks.
CREATE INDEX IF NOT EXISTS `idx_asset_chunks_user_id` ON `asset_chunks` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_asset_chunks_source_type` ON `asset_chunks` (`source_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_asset_chunks_source_id` ON `asset_chunks` (`source_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_asset_chunks_asset_type` ON `asset_chunks` (`asset_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_asset_chunk_source_order` ON `asset_chunks` (`user_id`, `source_type`, `source_id`, `chunk_index`);
--> statement-breakpoint
-- Vector storage for RAG, replacing pgvector's `asset_chunks.embedding` column + ivfflat index.
-- Kept as a separate vec0 virtual table (loaded via the sqlite-vec extension) rather than a
-- column on `asset_chunks`, since SQLite has no native vector column type. The virtual table's
-- rowid is set explicitly to match `asset_chunks.id` on insert so the two can be joined without
-- a separate id-mapping table. Dimension must match `CHIKAIMA_EMBEDDING_DIMENSION` (default 384).
CREATE VIRTUAL TABLE IF NOT EXISTS `asset_chunk_vectors` USING vec0(
  embedding float[384]
);
