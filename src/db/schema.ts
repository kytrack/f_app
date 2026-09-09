/**
 * Drizzle schema. Phase 0: users + settings.
 * Phase 1 adds habits, habit_logs, tasks, point_ledger, rewards, reward_redemptions, daily_summaries
 * exactly as laid out in docs/SPEC.md §3.2.
 *
 * Conventions: TEXT ids (UUID), ISO-8601 UTC timestamps, soft delete via deleted_at.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  dayStartHour: integer('day_start_hour').notNull().default(4),
  timezone: text('timezone').notNull(),
  kcalTarget: integer('kcal_target'),
  proteinG: integer('protein_g'),
  carbsG: integer('carbs_g'),
  fatG: integer('fat_g'),
  kcalTolerancePct: integer('kcal_tolerance_pct').notNull().default(10),
  editGraceHours: integer('edit_grace_hours').notNull().default(48),
  updatedAt: text('updated_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
