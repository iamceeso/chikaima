CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `depends_on` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_job_events_job_id` ON `job_events` (`job_id`, `id`);
--> statement-breakpoint
-- Serves the per-user event stream's replay query (`WHERE user_id = ? AND id > ?`).
CREATE INDEX IF NOT EXISTS `idx_job_events_user_id` ON `job_events` (`user_id`, `id`);
