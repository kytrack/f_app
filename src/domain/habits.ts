/**
 * Habit use-cases: scheduling, checking off, relapses, skips.
 * Streaks are NOT touched here – the day close (dayClose.ts) owns them.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  habitLogs,
  habits,
  type Habit,
  type HabitLog,
  type NewHabit,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { dayKeyFor, isBitSet, weekdayIndex, type DayKey } from './dates';
import { setActiveDelta } from './points/ledger';
import { POINTS, habitPoints } from './points/rules';
import { multiplierFor } from './points/streak';

export type HabitInput = Pick<NewHabit, 'name' | 'kind'> &
  Partial<
    Pick<
      NewHabit,
      | 'icon'
      | 'color'
      | 'scheduleType'
      | 'weekdayMask'
      | 'timesPerWeek'
      | 'targetCount'
      | 'unit'
      | 'pointsSuccess'
      | 'pointsPenalty'
      | 'reminderTime'
      | 'sortOrder'
    >
  >;

export function isScheduledOn(habit: Pick<Habit, 'scheduleType' | 'weekdayMask'>, date: DayKey): boolean {
  switch (habit.scheduleType) {
    case 'daily':
      return true;
    case 'weekdays':
      return isBitSet(habit.weekdayMask, weekdayIndex(date));
    case 'times_per_week':
      return true; // any day counts; the weekly quota is checked on Sundays at day close
  }
}

/** Habits that exist on `date` (created on or before it) and are not archived/deleted. */
export function activeHabitsOn(ctx: DomainCtx, date: DayKey): Habit[] {
  return ctx.db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), isNull(habits.archivedAt), isNull(habits.deletedAt)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all()
    .filter((h) => dayKeyFor(new Date(h.createdAt), ctx.settings.timezone, ctx.settings.dayStartHour) <= date);
}

export function scheduledHabitsOn(ctx: DomainCtx, date: DayKey): Habit[] {
  return activeHabitsOn(ctx, date).filter((h) => isScheduledOn(h, date));
}

export interface HabitWithLog {
  habit: Habit;
  log: HabitLog | undefined;
}

export function habitsWithLogs(ctx: DomainCtx, date: DayKey): HabitWithLog[] {
  const list = scheduledHabitsOn(ctx, date);
  const logs = ctx.db.select().from(habitLogs).where(eq(habitLogs.date, date)).all();
  const byHabit = new Map(logs.map((l) => [l.habitId, l]));
  return list.map((habit) => ({ habit, log: byHabit.get(habit.id) }));
}

export function getHabit(ctx: DomainCtx, id: string): Habit {
  const h = ctx.db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, ctx.userId)))
    .get();
  if (!h || h.deletedAt) throw new DomainError('NOT_FOUND', `habit ${id} not found`);
  return h;
}

export function createHabit(ctx: DomainCtx, input: HabitInput): Habit {
  if (!input.name.trim()) throw new DomainError('INVALID', 'name required');
  const ts = nowIso(ctx);
  return ctx.db
    .insert(habits)
    .values({
      ...input,
      name: input.name.trim(),
      id: ctx.uuid(),
      userId: ctx.userId,
      targetCount: Math.max(1, input.targetCount ?? 1),
      pointsSuccess: input.pointsSuccess ?? (input.kind === 'bad' ? POINTS.badHabitCleanDay : POINTS.habitSuccess),
      pointsPenalty: input.pointsPenalty ?? POINTS.habitPenalty,
      streakStartedOn: input.kind === 'bad' ? todayKey(ctx) : null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

export function updateHabit(ctx: DomainCtx, id: string, patch: Partial<HabitInput>): Habit {
  getHabit(ctx, id);
  return ctx.db
    .update(habits)
    .set({ ...patch, updatedAt: nowIso(ctx) })
    .where(eq(habits.id, id))
    .returning()
    .get();
}

export function archiveHabit(ctx: DomainCtx, id: string): void {
  getHabit(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(habits).set({ archivedAt: ts, updatedAt: ts }).where(eq(habits.id, id)).run();
}

export function restoreHabit(ctx: DomainCtx, id: string): void {
  getHabit(ctx, id);
  ctx.db.update(habits).set({ archivedAt: null, updatedAt: nowIso(ctx) }).where(eq(habits.id, id)).run();
}

/** Soft delete – logs and ledger rows stay for history, the habit disappears everywhere. */
export function deleteHabit(ctx: DomainCtx, id: string): void {
  getHabit(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(habits).set({ deletedAt: ts, archivedAt: ts, updatedAt: ts }).where(eq(habits.id, id)).run();
}

/** Every non-deleted habit, active first, in display order – for the admin list. */
export function listAllHabits(ctx: DomainCtx): Habit[] {
  return ctx.db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), isNull(habits.deletedAt)))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    .all()
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

/** Moves a habit one step up or down among the active ones and normalises sortOrder. */
export function reorderHabit(ctx: DomainCtx, id: string, direction: 'up' | 'down'): void {
  const list = listAllHabits(ctx).filter((h) => !h.archivedAt);
  const i = list.findIndex((h) => h.id === id);
  if (i < 0) throw new DomainError('NOT_FOUND', `habit ${id} not found`);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const ts = nowIso(ctx);
  ctx.db.transaction((tx) => {
    list.forEach((h, idx) => {
      tx.update(habits).set({ sortOrder: idx, updatedAt: ts }).where(eq(habits.id, h.id)).run();
    });
  });
}

/** Throws when `date` is in the future or older than the edit grace window. */
export function assertEditable(ctx: DomainCtx, date: DayKey): void {
  const today = todayKey(ctx);
  if (date > today) throw new DomainError('INVALID', 'cannot log the future');
  const oldest = dayKeyFor(
    new Date(ctx.now().getTime() - ctx.settings.editGraceHours * 3_600_000),
    ctx.settings.timezone,
    ctx.settings.dayStartHour,
  );
  if (date < oldest) throw new DomainError('DAY_LOCKED', `${date} is locked for editing`);
}

function getOrCreateLog(ctx: DomainCtx, habitId: string, date: DayKey): HabitLog {
  const existing = ctx.db
    .select()
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
    .get();
  if (existing) return existing;
  const ts = nowIso(ctx);
  return ctx.db
    .insert(habitLogs)
    .values({ id: ctx.uuid(), habitId, date, createdAt: ts, updatedAt: ts })
    .returning()
    .get();
}

/**
 * Sets the completion count of a GOOD habit for a day and re-syncs its points:
 * the active ledger credit always equals habitPoints(count, target).
 * Un-checking (count 0) reverses everything.
 */
export function setHabitCount(ctx: DomainCtx, habitId: string, date: DayKey, count: number): HabitLog {
  const habit = getHabit(ctx, habitId);
  if (habit.kind !== 'good') throw new DomainError('INVALID', 'use recordRelapse for bad habits');
  assertEditable(ctx, date);
  const clamped = Math.max(0, Math.min(Math.floor(count), habit.targetCount));

  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const log = getOrCreateLog(c, habitId, date);
    const status = clamped >= habit.targetCount ? 'done' : 'pending';
    const updated = tx
      .update(habitLogs)
      .set({ count: clamped, status, updatedAt: nowIso(c) })
      .where(eq(habitLogs.id, log.id))
      .returning()
      .get();
    const multiplier = multiplierFor(habit.currentStreak);
    setActiveDelta(c, {
      reason: 'habit_done',
      refType: 'habit',
      refId: habitId,
      date,
      base: habit.pointsSuccess,
      multiplier,
      desired: habitPoints({ count: clamped, target: habit.targetCount, base: habit.pointsSuccess, multiplier }),
    });
    return updated;
  });
}

/** Convenience: toggle a 1-target habit, or +1 for counted habits (wraps to 0 when full). */
export function tapHabit(ctx: DomainCtx, habitId: string, date: DayKey): HabitLog {
  const habit = getHabit(ctx, habitId);
  const current =
    ctx.db
      .select({ count: habitLogs.count })
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
      .get()?.count ?? 0;
  const next = current >= habit.targetCount ? 0 : current + 1;
  return setHabitCount(ctx, habitId, date, next);
}

/** Marks a good habit as deliberately skipped for the day (no points, no penalty). */
export function skipHabit(ctx: DomainCtx, habitId: string, date: DayKey): HabitLog {
  const habit = getHabit(ctx, habitId);
  if (habit.kind !== 'good') throw new DomainError('INVALID', 'only good habits can be skipped');
  assertEditable(ctx, date);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const log = getOrCreateLog(c, habitId, date);
    setActiveDelta(c, {
      reason: 'habit_done',
      refType: 'habit',
      refId: habitId,
      date,
      base: habit.pointsSuccess,
      desired: 0,
    });
    return tx
      .update(habitLogs)
      .set({ count: 0, status: 'skipped', updatedAt: nowIso(c) })
      .where(eq(habitLogs.id, log.id))
      .returning()
      .get();
  });
}

/**
 * Records one relapse (or removes one with delta -1) on a BAD habit.
 * The active penalty for the day always equals min(count × 2 × penalty, daily cap).
 */
export function recordRelapse(ctx: DomainCtx, habitId: string, date: DayKey, delta: 1 | -1 = 1): HabitLog {
  const habit = getHabit(ctx, habitId);
  if (habit.kind !== 'bad') throw new DomainError('INVALID', 'relapse only applies to bad habits');
  assertEditable(ctx, date);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const log = getOrCreateLog(c, habitId, date);
    const count = Math.max(0, log.count + delta);
    const status = count > 0 ? 'relapse' : 'pending';
    const total = Math.min(count * habit.pointsPenalty * POINTS.badHabitRelapseFactor, POINTS.badHabitRelapseDailyCap);
    setActiveDelta(c, {
      reason: 'bad_habit_relapse',
      refType: 'habit',
      refId: habitId,
      date,
      base: total,
      desired: -total,
    });
    return tx
      .update(habitLogs)
      .set({ count, status, updatedAt: nowIso(c) })
      .where(eq(habitLogs.id, log.id))
      .returning()
      .get();
  });
}

/** For bad habits: whole days without relapse since streakStartedOn (today included if clean). */
export function cleanDays(habit: Habit, today: DayKey): number {
  if (!habit.streakStartedOn) return habit.currentStreak;
  const [y1, m1, d1] = habit.streakStartedOn.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  return Math.max(0, diff);
}
