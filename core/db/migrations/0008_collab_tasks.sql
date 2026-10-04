CREATE TABLE `collab_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`run_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `collab_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_collab_tasks_team_number` ON `collab_tasks` (`team_id`, `number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_collab_tasks_run_id` ON `collab_tasks` (`run_id`);
