/**
 * Drizzle schema – mirrors docs/SPEC.md §3.2.
 * Phase 1: users, settings, habits, habit_logs, tasks, point_ledger, rewards,
 * reward_redemptions, daily_summaries. Phase 2/3 tables are added later.
 *
 * Conventions: TEXT ids (UUID), ISO-8601 UTC timestamps, 'YYYY-MM-DD' logical day keys,
 * soft delete via deleted_at, booleans as INTEGER 0/1 (mode: 'boolean').
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------- core

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
  onboardedAt: text('onboarded_at'),
  updatedAt: text('updated_at').notNull(),
});

// ---------------------------------------------------------------- habits

export const HABIT_KINDS = ['good', 'bad'] as const;
export const SCHEDULE_TYPES = ['daily', 'weekdays', 'times_per_week'] as const;
export const HABIT_LOG_STATUSES = ['pending', 'done', 'missed', 'skipped', 'relapse'] as const;

export const habits = sqliteTable('habits', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  kind: text('kind', { enum: HABIT_KINDS }).notNull(),
  scheduleType: text('schedule_type', { enum: SCHEDULE_TYPES }).notNull().default('daily'),
  weekdayMask: integer('weekday_mask').notNull().default(127), // bit0 = Monday … bit6 = Sunday
  timesPerWeek: integer('times_per_week'),
  targetCount: integer('target_count').notNull().default(1),
  unit: text('unit'),
  pointsSuccess: integer('points_success').notNull().default(10),
  pointsPenalty: integer('points_penalty').notNull().default(5),
  currentStreak: integer('current_streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  lastSuccessDate: text('last_success_date'),
  streakStartedOn: text('streak_started_on'),
  streakFreezesAvailable: integer('streak_freezes_available').notNull().default(0), // earned every 30 days, spent instead of a reset
  reminderTime: text('reminder_time'), // 'HH:MM'
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: text('archived_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const habitLogs = sqliteTable(
  'habit_logs',
  {
    id: text('id').primaryKey(),
    habitId: text('habit_id')
      .notNull()
      .references(() => habits.id),
    date: text('date').notNull(),
    count: integer('count').notNull().default(0),
    status: text('status', { enum: HABIT_LOG_STATUSES }).notNull().default('pending'),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_habit_logs_habit_date').on(t.habitId, t.date),
    index('idx_habit_logs_date').on(t.date),
  ],
);

// ---------------------------------------------------------------- tasks

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    notes: text('notes'),
    dueAt: text('due_at'), // ISO datetime or NULL (anytime)
    priority: integer('priority').notNull().default(2), // 1 low … 3 high
    points: integer('points'), // NULL → derived from priority
    recurrence: text('recurrence'), // JSON, Phase 2
    parentTaskId: text('parent_task_id').references((): AnySQLiteColumn => tasks.id),
    completedAt: text('completed_at'),
    overduePenalizedAt: text('overdue_penalized_at'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_tasks_due').on(t.dueAt)],
);

// ---------------------------------------------------------------- calendar

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    notes: text('notes'),
    location: text('location'),
    startAt: text('start_at').notNull(), // ISO datetime; for all-day events the local 00:00
    endAt: text('end_at'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    recurrence: text('recurrence'), // JSON Recurrence (src/domain/recurrence.ts) or NULL
    color: text('color'),
    linkedTaskId: text('linked_task_id').references(() => tasks.id),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_events_start').on(t.startAt)],
);

export const eventReminders = sqliteTable('event_reminders', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  offsetMinutes: integer('offset_minutes').notNull(), // 0, 15, 60, 1440 …
});

// ---------------------------------------------------------------- workouts

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group'),
  isBodyweight: integer('is_bodyweight', { mode: 'boolean' }).notNull().default(false),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workoutPlans = sqliteTable('workout_plans', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  weekdayMask: integer('weekday_mask').notNull().default(0), // planned days, bit0 = Monday
  pointsComplete: integer('points_complete').notNull().default(30),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: text('archived_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workoutPlanExercises = sqliteTable('workout_plan_exercises', {
  id: text('id').primaryKey(),
  planId: text('plan_id')
    .notNull()
    .references(() => workoutPlans.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  sortOrder: integer('sort_order').notNull(),
  targetSets: integer('target_sets').notNull(),
  targetReps: integer('target_reps').notNull(),
  targetWeightKg: real('target_weight_kg'),
});

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    planId: text('plan_id').references(() => workoutPlans.id),
    date: text('date').notNull(), // logical day
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    completionPct: integer('completion_pct'), // done sets / planned sets
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_sessions_date').on(t.date)],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setIndex: integer('set_index').notNull(),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('uq_set_logs').on(t.sessionId, t.exerciseId, t.setIndex)],
);

// ---------------------------------------------------------------- meals

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const mealTemplates = sqliteTable('meal_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  kcal: integer('kcal').notNull(),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  defaultSlot: text('default_slot', { enum: MEAL_SLOTS }),
  archivedAt: text('archived_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Weekly template: "Monday breakfast = X". */
export const mealPlanItems = sqliteTable('meal_plan_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  weekday: integer('weekday').notNull(), // 0 = Monday … 6 = Sunday
  slot: text('slot', { enum: MEAL_SLOTS }).notNull(),
  templateId: text('template_id')
    .notNull()
    .references(() => mealTemplates.id),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Daily instance: generated from the weekly plan plus ad-hoc entries. Snapshots survive template edits. */
export const mealLogs = sqliteTable(
  'meal_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    date: text('date').notNull(), // logical day
    slot: text('slot', { enum: MEAL_SLOTS }).notNull(),
    templateId: text('template_id').references(() => mealTemplates.id),
    planItemId: text('plan_item_id'), // which weekly item generated it (idempotency)
    nameSnapshot: text('name_snapshot').notNull(),
    kcalSnapshot: integer('kcal_snapshot').notNull(),
    proteinSnapshot: real('protein_snapshot'),
    carbsSnapshot: real('carbs_snapshot'),
    fatSnapshot: real('fat_snapshot'),
    eaten: integer('eaten', { mode: 'boolean' }).notNull().default(false),
    planned: integer('planned', { mode: 'boolean' }).notNull().default(true),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_meal_logs_date').on(t.date)],
);

// ---------------------------------------------------------------- gamification

export const LEDGER_REASONS = [
  'habit_done',
  'habit_missed',
  'bad_habit_clean_day',
  'bad_habit_relapse',
  'task_done',
  'task_overdue',
  'workout_done',
  'kcal_goal_hit',
  'kcal_goal_missed',
  'streak_milestone',
  'perfect_day',
  'reward_redeem',
  'reversal',
  'manual_adjust',
] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const LEDGER_REF_TYPES = ['habit', 'task', 'workout_session', 'day', 'reward'] as const;
export type LedgerRefType = (typeof LEDGER_REF_TYPES)[number];

/** APPEND-ONLY. Never UPDATE or DELETE a row; undo with a 'reversal' row. */
export const pointLedger = sqliteTable(
  'point_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    delta: integer('delta').notNull(),
    reason: text('reason', { enum: LEDGER_REASONS }).notNull(),
    refType: text('ref_type', { enum: LEDGER_REF_TYPES }),
    refId: text('ref_id'),
    reversesId: text('reverses_id').references((): AnySQLiteColumn => pointLedger.id),
    date: text('date').notNull(),
    multiplier: real('multiplier').notNull().default(1),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_ledger_date').on(t.date),
    index('idx_ledger_ref').on(t.refType, t.refId),
    // A row can be reversed at most once.
    uniqueIndex('uq_ledger_reverses')
      .on(t.reversesId)
      .where(sql`reverses_id IS NOT NULL`),
  ],
);

export const rewards = sqliteTable('rewards', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  cost: integer('cost').notNull(),
  repeatable: integer('repeatable', { mode: 'boolean' }).notNull().default(true),
  cooldownDays: integer('cooldown_days'),
  archivedAt: text('archived_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rewardRedemptions = sqliteTable('reward_redemptions', {
  id: text('id').primaryKey(),
  rewardId: text('reward_id')
    .notNull()
    .references(() => rewards.id),
  costSnapshot: integer('cost_snapshot').notNull(),
  ledgerId: text('ledger_id')
    .notNull()
    .references(() => pointLedger.id),
  redeemedAt: text('redeemed_at').notNull(),
  fulfilledAt: text('fulfilled_at'),
});

export const dailySummaries = sqliteTable(
  'daily_summaries',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    date: text('date').notNull(),
    habitsScheduled: integer('habits_scheduled').notNull(),
    habitsDone: integer('habits_done').notNull(),
    tasksDue: integer('tasks_due').notNull(),
    tasksDone: integer('tasks_done').notNull(),
    workoutDone: integer('workout_done', { mode: 'boolean' }).notNull().default(false),
    kcalTarget: integer('kcal_target'),
    kcalEaten: integer('kcal_eaten'),
    kcalGoalHit: integer('kcal_goal_hit', { mode: 'boolean' }),
    pointsEarned: integer('points_earned').notNull(),
    pointsLost: integer('points_lost').notNull(),
    perfectDay: integer('perfect_day', { mode: 'boolean' }).notNull().default(false),
    closedAt: text('closed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// ---------------------------------------------------------------- types

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type HabitLog = typeof habitLogs.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventReminder = typeof eventReminders.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type WorkoutPlanExercise = typeof workoutPlanExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type MealTemplate = typeof mealTemplates.$inferSelect;
export type NewMealTemplate = typeof mealTemplates.$inferInsert;
export type MealPlanItem = typeof mealPlanItems.$inferSelect;
export type MealLog = typeof mealLogs.$inferSelect;
export type LedgerEntry = typeof pointLedger.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type NewReward = typeof rewards.$inferInsert;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type DailySummary = typeof dailySummaries.$inferSelect;
