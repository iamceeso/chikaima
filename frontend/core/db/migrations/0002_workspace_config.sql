CREATE TABLE `workspace_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Chikaima Workspace' NOT NULL,
	`authentication_enabled` integer DEFAULT true NOT NULL,
	`docs_enabled` integer DEFAULT false NOT NULL,
	`public_registration_enabled` integer DEFAULT true NOT NULL,
	`vision_aware` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
