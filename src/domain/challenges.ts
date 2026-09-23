/**
 * Random challenges ("dobás"): a user-defined pool of chores and small missions.
 * Once per logical day the app draws a few and the user must pick one; the pick becomes
 * a task due today. The user can also draw on demand. Pure TypeScript.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { challenges, settings, tasks, type Challenge, type Task } from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { addDaysToKey, dayKeyFor, instantFor, type DayKey } from './dates';
import { createTask } from './tasks';

export interface ChallengeInput {
  name: string;
  icon?: string | null;
  points?: number;
  weight?: number;
}

function validate(input: Partial<ChallengeInput>): void {
  if (input.name !== undefined && !input.name.trim()) throw new DomainError('INVALID', 'name required');
  if (input.points !== undefined && (!Number.isInteger(input.points) || input.points < 0 || input.points > 500))
    throw new DomainError('INVALID', 'points must be 0..500');
  if (input.weight !== undefined && (!Number.isInteger(input.weight) || input.weight < 1 || input.weight > 10))
    throw new DomainError('INVALID', 'weight must be 1..10');
}

export function getChallenge(ctx: DomainCtx, id: string): Challenge {
  const c = ctx.db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, id), eq(challenges.userId, ctx.userId)))
    .get();
  if (!c || c.deletedAt) throw new DomainError('NOT_FOUND', `challenge ${id} not found`);
  return c;
}

/** Active (not archived) challenges – the draw pool. */
export function listChallenges(ctx: DomainCtx): Challenge[] {
  return ctx.db
    .select()
    .from(challenges)
    .where(and(eq(challenges.userId, ctx.userId), isNull(challenges.archivedAt), isNull(challenges.deletedAt)))
    .orderBy(asc(challenges.name))
    .all();
}

/** Every non-deleted challenge, active first – for the admin list. */
export function listAllChallenges(ctx: DomainCtx): Challenge[] {
  return ctx.db
    .select()
    .from(challenges)
    .where(and(eq(challenges.userId, ctx.userId), isNull(challenges.deletedAt)))
    .orderBy(asc(challenges.name))
    .all()
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

export function createChallenge(ctx: DomainCtx, input: ChallengeInput): Challenge {
  validate(input);
  const ts = nowIso(ctx);
  return ctx.db
    .insert(challenges)
    .values({
      id: ctx.uuid(),
      userId: ctx.userId,
      name: input.name.trim(),
      icon: input.icon ?? null,
      points: input.points ?? ctx.settings.rules.challengePoints,
      weight: input.weight ?? 1,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

export function updateChallenge(ctx: DomainCtx, id: string, patch: Partial<ChallengeInput>): Challenge {
  getChallenge(ctx, id);
  validate(patch);
  return ctx.db
    .update(challenges)
    .set({ ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), updatedAt: nowIso(ctx) })
    .where(eq(challenges.id, id))
    .returning()
    .get();
}

export function archiveChallenge(ctx: DomainCtx, id: string): void {
  getChallenge(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(challenges).set({ archivedAt: ts, updatedAt: ts }).where(eq(challenges.id, id)).run();
}

export function restoreChallenge(ctx: DomainCtx, id: string): void {
  getChallenge(ctx, id);
  ctx.db.update(challenges).set({ archivedAt: null, updatedAt: nowIso(ctx) }).where(eq(challenges.id, id)).run();
}

/** Soft delete; tasks already created from it keep their history. */
export function deleteChallenge(ctx: DomainCtx, id: string): void {
  getChallenge(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(challenges).set({ deletedAt: ts, archivedAt: ts, updatedAt: ts }).where(eq(challenges.id, id)).run();
}

/** Challenge ids already turned into a task on `date` (open or done, not deleted). */
export function acceptedOn(ctx: DomainCtx, date: DayKey): Set<string> {
  const rows = ctx.db
    .select({ challengeId: tasks.challengeId, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.challengeId || !r.dueAt) continue;
    const day = new Date(r.dueAt);
    const key = dayKeyOf(ctx, day);
    if (key === date) out.add(r.challengeId);
  }
  return out;
}

function dayKeyOf(ctx: DomainCtx, d: Date): DayKey {
  return dayKeyFor(d, ctx.settings.timezone, ctx.settings.dayStartHour);
}

/**
 * Draws up to `count` distinct challenges, weighted, excluding the ones already accepted
 * today and any ids in `exclude` (e.g. the previous roll). Returns [] when the pool is empty.
 */
export function drawChallenges(ctx: DomainCtx, count = ctx.settings.challengeChoices, exclude: string[] = []): Challenge[] {
  const taken = acceptedOn(ctx, todayKey(ctx));
  let pool = listChallenges(ctx).filter((c) => !taken.has(c.id) && !exclude.includes(c.id));
  // If excluding the previous roll leaves too little, fall back to the full unaccepted pool.
  if (pool.length < count && exclude.length) pool = listChallenges(ctx).filter((c) => !taken.has(c.id));
  const picked: Challenge[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((a, c) => a + c.weight, 0);
    let r = ctx.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r < 0) break;
    }
    const [c] = pool.splice(Math.min(idx, pool.length - 1), 1);
    picked.push(c);
  }
  return picked;
}

/** End of the logical day: the next day's dayStartHour minus one minute. */
function endOfLogicalDay(ctx: DomainCtx, date: DayKey): Date {
  const next = addDaysToKey(date, 1);
  const hh = String(ctx.settings.dayStartHour).padStart(2, '0');
  const start = instantFor(next, `${hh}:00`, ctx.settings.timezone);
  return new Date(start.getTime() - 60_000);
}

/** Turns a drawn challenge into today's task (priority 2, the challenge's points). */
export function acceptChallenge(ctx: DomainCtx, challengeId: string): Task {
  const c = getChallenge(ctx, challengeId);
  if (c.archivedAt) throw new DomainError('INVALID', 'challenge archived');
  const today = todayKey(ctx);
  if (acceptedOn(ctx, today).has(c.id)) throw new DomainError('INVALID', 'ma már elvállaltad ezt');
  return createTask(ctx, {
    title: `${c.icon ? c.icon + ' ' : ''}${c.name}`,
    priority: 2,
    points: c.points,
    dueAt: endOfLogicalDay(ctx, today).toISOString(),
    challengeId: c.id,
  });
}

/** Is the mandatory daily draw still due today? */
export function shouldDrawToday(ctx: DomainCtx, lastChallengeDay: string | null): boolean {
  if (!ctx.settings.challengesEnabled) return false;
  if (listChallenges(ctx).length === 0) return false;
  return lastChallengeDay !== todayKey(ctx);
}

/** Records that today's mandatory draw happened (after the user picked). */
export function markDrawnToday(ctx: DomainCtx): void {
  ctx.db
    .update(settings)
    .set({ lastChallengeDay: todayKey(ctx), updatedAt: nowIso(ctx) })
    .where(eq(settings.userId, ctx.userId))
    .run();
}
