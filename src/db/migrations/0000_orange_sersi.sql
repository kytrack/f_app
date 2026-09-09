CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`day_start_hour` integer DEFAULT 4 NOT NULL,
	`timezone` text NOT NULL,
	`kcal_target` integer,
	`protein_g` integer,
	`carbs_g` integer,
	`fat_g` integer,
	`kcal_tolerance_pct` integer DEFAULT 10 NOT NULL,
	`edit_grace_hours` integer DEFAULT 48 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
