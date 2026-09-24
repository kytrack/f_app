CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`checkin_minutes` integer DEFAULT 20 NOT NULL,
	`checkins_done` integer DEFAULT 0 NOT NULL,
	`last_checkin_at` text,
	`completed_at` text,
	`cancelled_at` text,
	`points_awarded` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_focus_start` ON `focus_sessions` (`user_id`,`start_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_focus` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `focus_auto_open` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `focus_checkin_minutes` integer DEFAULT 20 NOT NULL;