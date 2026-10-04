ALTER TABLE `collab_runs` ADD `base_branch` text;--> statement-breakpoint
ALTER TABLE `collab_runs` ADD `run_branch` text;--> statement-breakpoint
ALTER TABLE `collab_teams` ADD `git_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `collab_teams` ADD `parallel` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `collab_teams` ADD `preview_command` text;--> statement-breakpoint
ALTER TABLE `collab_teams` ADD `deploy_command` text;