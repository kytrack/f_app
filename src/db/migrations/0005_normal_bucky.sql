ALTER TABLE `settings` ADD `notif_habits` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_tasks` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_events` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_summary` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_nudges` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `notif_capture` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `nudges_per_day` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `captures_per_day` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `quiet_from` text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `quiet_to` text DEFAULT '07:30' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `summary_time` text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `capture_on_open_hours` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `last_capture_prompt_at` text;