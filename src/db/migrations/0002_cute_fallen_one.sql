CREATE TABLE `event_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`location` text,
	`start_at` text NOT NULL,
	`end_at` text,
	`all_day` integer DEFAULT false NOT NULL,
	`recurrence` text,
	`color` text,
	`linked_task_id` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_start` ON `events` (`start_at`);