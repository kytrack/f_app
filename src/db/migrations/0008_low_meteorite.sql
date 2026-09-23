CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`points` integer DEFAULT 15 NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `challenges_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `challenge_choices` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `last_challenge_day` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `challenge_id` text;