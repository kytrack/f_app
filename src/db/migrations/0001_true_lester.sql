CREATE TABLE `daily_summaries` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`habits_scheduled` integer NOT NULL,
	`habits_done` integer NOT NULL,
	`tasks_due` integer NOT NULL,
	`tasks_done` integer NOT NULL,
	`workout_done` integer DEFAULT false NOT NULL,
	`kcal_target` integer,
	`kcal_eaten` integer,
	`kcal_goal_hit` integer,
	`points_earned` integer NOT NULL,
	`points_lost` integer NOT NULL,
	`perfect_day` integer DEFAULT false NOT NULL,
	`closed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_habit_logs_habit_date` ON `habit_logs` (`habit_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_habit_logs_date` ON `habit_logs` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`kind` text NOT NULL,
	`schedule_type` text DEFAULT 'daily' NOT NULL,
	`weekday_mask` integer DEFAULT 127 NOT NULL,
	`times_per_week` integer,
	`target_count` integer DEFAULT 1 NOT NULL,
	`unit` text,
	`points_success` integer DEFAULT 10 NOT NULL,
	`points_penalty` integer DEFAULT 5 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`last_success_date` text,
	`streak_started_on` text,
	`reminder_time` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `point_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`reverses_id` text,
	`date` text NOT NULL,
	`multiplier` real DEFAULT 1 NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_id`) REFERENCES `point_ledger`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_date` ON `point_ledger` (`date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_ref` ON `point_ledger` (`ref_type`,`ref_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ledger_reverses` ON `point_ledger` (`reverses_id`) WHERE reverses_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`cost_snapshot` integer NOT NULL,
	`ledger_id` text NOT NULL,
	`redeemed_at` text NOT NULL,
	`fulfilled_at` text,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_id`) REFERENCES `point_ledger`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`cost` integer NOT NULL,
	`repeatable` integer DEFAULT true NOT NULL,
	`cooldown_days` integer,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`due_at` text,
	`priority` integer DEFAULT 2 NOT NULL,
	`points` integer,
	`recurrence` text,
	`parent_task_id` text,
	`completed_at` text,
	`overdue_penalized_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_due` ON `tasks` (`due_at`);