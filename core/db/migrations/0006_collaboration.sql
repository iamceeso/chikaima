CREATE TABLE `collab_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`member_id` text,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `collab_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collab_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`precedence` integer NOT NULL,
	`scope` text DEFAULT '[]' NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`reports_to` integer,
	`reviewed_by` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `collab_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `ai_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collab_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`member_id` text,
	`kind` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `collab_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collab_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`task` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `collab_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collab_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`folder` text NOT NULL,
	`decision_policy` text DEFAULT 'majority' NOT NULL,
	`max_revisions` integer DEFAULT 2 NOT NULL,
	`autonomy` text DEFAULT 'semi' NOT NULL,
	`test_command` text,
	`max_model_calls` integer DEFAULT 80 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_collab_members_team_precedence` ON `collab_members` (`team_id`, `precedence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_collab_runs_team_id` ON `collab_runs` (`team_id`, `created_at`);
--> statement-breakpoint
-- Serves the per-run stream's replay query (`WHERE run_id = ? AND id > ?`).
CREATE INDEX IF NOT EXISTS `idx_collab_messages_run_id` ON `collab_messages` (`run_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_collab_approvals_run_id` ON `collab_approvals` (`run_id`, `status`);
