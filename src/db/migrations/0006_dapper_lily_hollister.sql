ALTER TABLE `settings` ADD `point_rules` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `mod_calendar` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `mod_workout` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `mod_meals` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `mod_rewards` integer DEFAULT true NOT NULL;