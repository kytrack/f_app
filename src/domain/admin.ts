/**
 * Administration use-cases: everything the control panel needs that the day-to-day
 * screens do not – full listings (incl. archived), restore, rules, profile, manual
 * point adjustments and the data wipe. Pure TypeScript.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  dailySummaries,
  eventReminders,
  events,
  exercises,
  habitLogs,
  habits,
  mealLogs,
  mealPlanItems,
  mealTemplates,
  pointLedger,
  rewardRedemptions,
  rewards,
  setLogs,
  settings,
  tasks,
  users,
  challenges,
  workoutPlanExercises,
  workoutPlans,
  workoutSessions,
  type Event,
  type Exercise,
  type LedgerEntry,
  type MealTemplate,
  type Reward,
  type RewardRedemption,
  type Task,
  type WorkoutPlan,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { listChallenges } from './challenges';
import { DEFAULT_RULES, invalidRuleKeys, parseRules, serializeRules, type PointRules } from './points/config';

// ---------------------------------------------------------------- point rules

export function getPointRules(ctx: DomainCtx): PointRules {
  const row = ctx.db.select({ json: settings.pointRules }).from(settings).where(eq(settings.userId, ctx.userId)).get();
  return parseRules(row?.json);
}

/** Persists a full rule set. Callers must rebuild the DomainCtx afterwards (onSettingsChange). */
export function updatePointRules(ctx: DomainCtx, rules: PointRules): PointRules {
  const bad = invalidRuleKeys(rules);
  if (bad.length) throw new DomainError('INVALID', `invalid rules: ${bad.join(', ')}`);
  ctx.db
    .update(settings)
    .set({ pointRules: serializeRules(rules), updatedAt: nowIso(ctx) })
    .where(eq(settings.userId, ctx.userId))
    .run();
  return getPointRules(ctx);
}

export function resetPointRules(ctx: DomainCtx): PointRules {
  return updatePointRules(ctx, { ...DEFAULT_RULES });
}

// ---------------------------------------------------------------- profile

export interface Profile {
  displayName: string;
  timezone: string;
  editGraceHours: number;
}

export function getProfile(ctx: DomainCtx): Profile {
  const u = ctx.db.select().from(users).where(eq(users.id, ctx.userId)).get();
  const s = ctx.db.select().from(settings).where(eq(settings.userId, ctx.userId)).get();
  if (!u || !s) throw new DomainError('NOT_FOUND', 'profile missing');
  return { displayName: u.displayName, timezone: s.timezone, editGraceHours: s.editGraceHours };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function updateProfile(ctx: DomainCtx, patch: Partial<Profile>): Profile {
  if (patch.displayName !== undefined && !patch.displayName.trim()) throw new DomainError('INVALID', 'name required');
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw new DomainError('INVALID', 'unknown time zone');
  if (patch.editGraceHours !== undefined && (patch.editGraceHours < 0 || patch.editGraceHours > 24 * 14))
    throw new DomainError('INVALID', 'editGraceHours out of range');
  const ts = nowIso(ctx);
  ctx.db.transaction((tx) => {
    if (patch.displayName !== undefined) {
      tx.update(users).set({ displayName: patch.displayName.trim(), updatedAt: ts }).where(eq(users.id, ctx.userId)).run();
    }
    const s: Partial<{ timezone: string; editGraceHours: number }> = {};
    if (patch.timezone !== undefined) s.timezone = patch.timezone;
    if (patch.editGraceHours !== undefined) s.editGraceHours = patch.editGraceHours;
    if (Object.keys(s).length) tx.update(settings).set({ ...s, updatedAt: ts }).where(eq(settings.userId, ctx.userId)).run();
  });
  return getProfile(ctx);
}

// ---------------------------------------------------------------- manual points

/** A signed correction in the ledger (bonus, fine, fixing a mistake). Always needs a note. */
export function manualAdjust(ctx: DomainCtx, delta: number, note: string): LedgerEntry {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) throw new DomainError('INVALID', 'delta must be a non-zero integer');
  if (!note.trim()) throw new DomainError('INVALID', 'note required');
  return ctx.db
    .insert(pointLedger)
    .values({
      id: ctx.uuid(),
      userId: ctx.userId,
      delta,
      reason: 'manual_adjust',
      refType: null,
      refId: null,
      date: todayKey(ctx),
      multiplier: 1,
      note: note.trim(),
      createdAt: nowIso(ctx),
    })
    .returning()
    .get();
}

// ---------------------------------------------------------------- tasks

export interface AllTasks {
  /** Recurring templates (hidden from every day list). */
  templates: Task[];
  open: Task[];
  completed: Task[];
}

export function listAllTasks(ctx: DomainCtx, completedLimit = 50): AllTasks {
  const all = ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
    .all();
  const completed = all
    .filter((t) => t.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, completedLimit);
  return {
    templates: all.filter((t) => t.recurrence !== null),
    open: all.filter((t) => t.recurrence === null && !t.completedAt),
    completed,
  };
}

// ---------------------------------------------------------------- events

export function listEvents(ctx: DomainCtx): Event[] {
  return ctx.db
    .select()
    .from(events)
    .where(and(eq(events.userId, ctx.userId), isNull(events.deletedAt)))
    .orderBy(desc(events.startAt))
    .all();
}

// ---------------------------------------------------------------- rewards

export function listAllRewards(ctx: DomainCtx): Reward[] {
  return ctx.db
    .select()
    .from(rewards)
    .where(and(eq(rewards.userId, ctx.userId), isNull(rewards.deletedAt)))
    .orderBy(asc(rewards.cost))
    .all()
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

export function restoreReward(ctx: DomainCtx, id: string): void {
  ctx.db
    .update(rewards)
    .set({ archivedAt: null, updatedAt: nowIso(ctx) })
    .where(and(eq(rewards.id, id), eq(rewards.userId, ctx.userId)))
    .run();
}

export interface RedemptionView extends RewardRedemption {
  rewardName: string;
  rewardIcon: string | null;
}

export function listRedemptions(ctx: DomainCtx, limit = 100): RedemptionView[] {
  return ctx.db
    .select()
    .from(rewardRedemptions)
    .innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
    .where(eq(rewards.userId, ctx.userId))
    .orderBy(desc(rewardRedemptions.redeemedAt))
    .limit(limit)
    .all()
    .map((r) => ({ ...r.reward_redemptions, rewardName: r.rewards.name, rewardIcon: r.rewards.icon }));
}

/** "I actually went to the cinema" – toggles the fulfilled flag of a redemption. */
export function setFulfilled(ctx: DomainCtx, redemptionId: string, fulfilled: boolean): void {
  ctx.db
    .update(rewardRedemptions)
    .set({ fulfilledAt: fulfilled ? nowIso(ctx) : null })
    .where(eq(rewardRedemptions.id, redemptionId))
    .run();
}

// ---------------------------------------------------------------- workouts

export function listAllPlans(ctx: DomainCtx): WorkoutPlan[] {
  return ctx.db
    .select()
    .from(workoutPlans)
    .where(and(eq(workoutPlans.userId, ctx.userId), isNull(workoutPlans.deletedAt)))
    .orderBy(asc(workoutPlans.sortOrder), asc(workoutPlans.createdAt))
    .all()
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

export function restorePlan(ctx: DomainCtx, id: string): void {
  ctx.db
    .update(workoutPlans)
    .set({ archivedAt: null, updatedAt: nowIso(ctx) })
    .where(and(eq(workoutPlans.id, id), eq(workoutPlans.userId, ctx.userId)))
    .run();
}

export interface ExerciseUsage {
  exercise: Exercise;
  /** Names of active plans that use it. */
  plans: string[];
}

export function exercisesWithUsage(ctx: DomainCtx): ExerciseUsage[] {
  const exs = ctx.db
    .select()
    .from(exercises)
    .where(and(eq(exercises.userId, ctx.userId), isNull(exercises.deletedAt)))
    .orderBy(asc(exercises.name))
    .all();
  const links = ctx.db
    .select({ exerciseId: workoutPlanExercises.exerciseId, plan: workoutPlans.name })
    .from(workoutPlanExercises)
    .innerJoin(workoutPlans, eq(workoutPlans.id, workoutPlanExercises.planId))
    .where(and(isNull(workoutPlans.deletedAt), isNull(workoutPlans.archivedAt)))
    .all();
  return exs.map((exercise) => ({
    exercise,
    plans: [...new Set(links.filter((l) => l.exerciseId === exercise.id).map((l) => l.plan))],
  }));
}

export function renameExercise(ctx: DomainCtx, id: string, name: string, muscleGroup?: string | null): Exercise {
  const clean = name.trim();
  if (!clean) throw new DomainError('INVALID', 'exercise name required');
  const clash = exercisesWithUsage(ctx).find((e) => e.exercise.id !== id && e.exercise.name.toLowerCase() === clean.toLowerCase());
  if (clash) throw new DomainError('INVALID', 'an exercise with this name already exists');
  const row = ctx.db
    .update(exercises)
    .set({ name: clean, ...(muscleGroup !== undefined ? { muscleGroup } : {}), updatedAt: nowIso(ctx) })
    .where(and(eq(exercises.id, id), eq(exercises.userId, ctx.userId)))
    .returning()
    .get();
  if (!row) throw new DomainError('NOT_FOUND', `exercise ${id} not found`);
  return row;
}

/** Soft delete; refused while an active plan still uses the exercise. History keeps it. */
export function deleteExercise(ctx: DomainCtx, id: string): void {
  const usage = exercisesWithUsage(ctx).find((e) => e.exercise.id === id);
  if (!usage) throw new DomainError('NOT_FOUND', `exercise ${id} not found`);
  if (usage.plans.length) throw new DomainError('INVALID', `még használja: ${usage.plans.join(', ')}`);
  const ts = nowIso(ctx);
  ctx.db.update(exercises).set({ deletedAt: ts, updatedAt: ts }).where(eq(exercises.id, id)).run();
}

// ---------------------------------------------------------------- meals

export function listAllMealTemplates(ctx: DomainCtx): MealTemplate[] {
  return ctx.db
    .select()
    .from(mealTemplates)
    .where(and(eq(mealTemplates.userId, ctx.userId), isNull(mealTemplates.deletedAt)))
    .orderBy(asc(mealTemplates.name))
    .all()
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

export function restoreMealTemplate(ctx: DomainCtx, id: string): void {
  ctx.db
    .update(mealTemplates)
    .set({ archivedAt: null, updatedAt: nowIso(ctx) })
    .where(and(eq(mealTemplates.id, id), eq(mealTemplates.userId, ctx.userId)))
    .run();
}

// ---------------------------------------------------------------- overview + wipe

export interface AdminCounts {
  habits: number;
  habitsArchived: number;
  taskTemplates: number;
  tasksOpen: number;
  events: number;
  rewards: number;
  plans: number;
  exercises: number;
  mealTemplates: number;
  challenges: number;
  ledgerEntries: number;
}

export function adminCounts(ctx: DomainCtx): AdminCounts {
  const hs = ctx.db.select({ a: habits.archivedAt }).from(habits).where(and(eq(habits.userId, ctx.userId), isNull(habits.deletedAt))).all();
  const ts = listAllTasks(ctx, 0);
  const count = <T>(rows: T[]) => rows.length;
  return {
    habits: hs.filter((h) => !h.a).length,
    habitsArchived: hs.filter((h) => h.a).length,
    taskTemplates: ts.templates.length,
    tasksOpen: ts.open.length,
    events: count(listEvents(ctx)),
    rewards: listAllRewards(ctx).filter((r) => !r.archivedAt).length,
    plans: listAllPlans(ctx).filter((p) => !p.archivedAt).length,
    exercises: count(exercisesWithUsage(ctx)),
    mealTemplates: listAllMealTemplates(ctx).filter((t) => !t.archivedAt).length,
    challenges: listChallenges(ctx).length,
    ledgerEntries: count(ctx.db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.userId, ctx.userId)).all()),
  };
}

export type WipeScope = 'points' | 'everything';

/**
 * Danger zone. 'points' empties the ledger, redemptions, summaries and streaks (content stays);
 * 'everything' also removes all content. Settings and the user row always survive.
 * This is the ONE sanctioned exception to the append-only ledger rule: a deliberate, confirmed reset.
 */
export function wipeData(ctx: DomainCtx, scope: WipeScope): void {
  ctx.db.transaction((tx) => {
    tx.delete(rewardRedemptions).run();
    // reversal rows reference their originals → delete the referencing rows first
    tx.delete(pointLedger).where(isNotNull(pointLedger.reversesId)).run();
    tx.delete(pointLedger).run();
    tx.delete(dailySummaries).run();
    if (scope === 'points') {
      tx.update(habits)
        .set({ currentStreak: 0, bestStreak: 0, streakFreezesAvailable: 0, lastSuccessDate: null, streakStartedOn: todayKey(ctx) })
        .run();
      tx.update(tasks).set({ overduePenalizedAt: null }).run();
      return;
    }
    tx.delete(habitLogs).run();
    tx.delete(habits).run();
    tx.delete(eventReminders).run();
    tx.delete(events).run();
    // task instances reference their templates
    const children = tx.select({ id: tasks.id }).from(tasks).where(isNotNull(tasks.parentTaskId)).all();
    if (children.length) tx.delete(tasks).where(inArray(tasks.id, children.map((c) => c.id))).run();
    tx.delete(tasks).run();
    tx.delete(rewards).run();
    tx.delete(setLogs).run();
    tx.delete(workoutSessions).run();
    tx.delete(workoutPlanExercises).run();
    tx.delete(workoutPlans).run();
    tx.delete(exercises).run();
    tx.delete(mealLogs).run();
    tx.delete(mealPlanItems).run();
    tx.delete(mealTemplates).run();
    tx.delete(challenges).run();
  });
}
