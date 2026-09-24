/**
 * Focus mode: planned blocks of deep work ("projekten dolgozom 14:00–16:00").
 * While a block runs the app keeps pulling the user back to it (focus screen on open,
 * "still on it?" check-ins, no nudges); finishing it earns points for the time spent,
 * cancelling earns nothing. Points only ever move in finishFocus(). Pure TypeScript.
 */
import { and, asc, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import { focusSessions, type FocusSession } from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { localTime } from './dates';
import { award } from './points/ledger';

export interface FocusInput {
  title: string;
  startAt: string; // ISO
  endAt: string; // ISO
  checkinMinutes?: number; // 0 = no check-ins
  note?: string | null;
}

export type FocusStatus = 'planned' | 'active' | 'ended' | 'done' | 'cancelled';

export const MAX_FOCUS_HOURS = 12;
export const MAX_CHECKIN_MINUTES = 180;
/** Two check-ins closer than this are counted once (the interval may be shorter). */
export const MIN_CHECKIN_GAP_MINUTES = 5;

function validate(input: Partial<FocusInput>, current?: FocusSession): void {
  if (input.title !== undefined && !input.title.trim()) throw new DomainError('INVALID', 'title required');
  const startAt = input.startAt ?? current?.startAt;
  const endAt = input.endAt ?? current?.endAt;
  if (startAt !== undefined || endAt !== undefined) {
    const s = Date.parse(startAt ?? '');
    const e = Date.parse(endAt ?? '');
    if (!Number.isFinite(s) || !Number.isFinite(e)) throw new DomainError('INVALID', 'invalid start/end');
    if (e <= s) throw new DomainError('INVALID', 'a vége nem lehet a kezdés előtt');
    if (e - s > MAX_FOCUS_HOURS * 3_600_000) throw new DomainError('INVALID', `legfeljebb ${MAX_FOCUS_HOURS} óra lehet`);
  }
  if (
    input.checkinMinutes !== undefined &&
    (!Number.isInteger(input.checkinMinutes) || input.checkinMinutes < 0 || input.checkinMinutes > MAX_CHECKIN_MINUTES)
  )
    throw new DomainError('INVALID', `checkinMinutes must be 0..${MAX_CHECKIN_MINUTES}`);
}

export function getFocus(ctx: DomainCtx, id: string): FocusSession {
  const s = ctx.db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, ctx.userId)))
    .get();
  if (!s || s.deletedAt) throw new DomainError('NOT_FOUND', `focus session ${id} not found`);
  return s;
}

export function focusStatus(ctx: DomainCtx, s: FocusSession, at: Date = ctx.now()): FocusStatus {
  if (s.cancelledAt) return 'cancelled';
  if (s.completedAt) return 'done';
  const t = at.getTime();
  if (t < Date.parse(s.startAt)) return 'planned';
  if (t < Date.parse(s.endAt)) return 'active';
  return 'ended';
}

export const plannedMinutes = (s: Pick<FocusSession, 'startAt' | 'endAt'>): number =>
  Math.round((Date.parse(s.endAt) - Date.parse(s.startAt)) / 60_000);

/** Minutes of the block already spent at `at` (0 before start, the full length after the end). */
export function elapsedMinutes(s: Pick<FocusSession, 'startAt' | 'endAt'>, at: Date): number {
  const start = Date.parse(s.startAt);
  const end = Date.parse(s.endAt);
  const t = Math.min(Math.max(at.getTime(), start), end);
  return Math.floor((t - start) / 60_000);
}

export function createFocus(ctx: DomainCtx, input: FocusInput): FocusSession {
  validate(input);
  const ts = nowIso(ctx);
  return ctx.db
    .insert(focusSessions)
    .values({
      id: ctx.uuid(),
      userId: ctx.userId,
      title: input.title.trim(),
      note: input.note ?? null,
      startAt: new Date(input.startAt).toISOString(),
      endAt: new Date(input.endAt).toISOString(),
      checkinMinutes: input.checkinMinutes ?? ctx.settings.focusCheckinMinutes,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

/** Editable until it is finished or cancelled. */
export function updateFocus(ctx: DomainCtx, id: string, patch: Partial<FocusInput>): FocusSession {
  const before = getFocus(ctx, id);
  if (before.completedAt || before.cancelledAt) throw new DomainError('INVALID', 'a lezárt fókusz már nem szerkeszthető');
  validate(patch, before);
  return ctx.db
    .update(focusSessions)
    .set({
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.startAt !== undefined ? { startAt: new Date(patch.startAt).toISOString() } : {}),
      ...(patch.endAt !== undefined ? { endAt: new Date(patch.endAt).toISOString() } : {}),
      updatedAt: nowIso(ctx),
    })
    .where(eq(focusSessions.id, id))
    .returning()
    .get();
}

/** Soft delete; awarded points stay in the ledger. */
export function deleteFocus(ctx: DomainCtx, id: string): void {
  getFocus(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(focusSessions).set({ deletedAt: ts, updatedAt: ts }).where(eq(focusSessions.id, id)).run();
}

/** Every non-deleted session, newest start first (admin + history). */
export function listFocus(ctx: DomainCtx, limit = 200): FocusSession[] {
  return ctx.db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, ctx.userId), isNull(focusSessions.deletedAt)))
    .orderBy(desc(focusSessions.startAt))
    .limit(limit)
    .all();
}

/** Sessions that are neither finished nor cancelled – running or still ahead – earliest first. */
export function openFocus(ctx: DomainCtx): FocusSession[] {
  const now = nowIso(ctx);
  return ctx.db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, ctx.userId),
        isNull(focusSessions.deletedAt),
        isNull(focusSessions.completedAt),
        isNull(focusSessions.cancelledAt),
        gt(focusSessions.endAt, now),
      ),
    )
    .orderBy(asc(focusSessions.startAt))
    .all();
}

/** The session running right now, if any (the earliest-started one when they overlap). */
export function activeFocus(ctx: DomainCtx): FocusSession | null {
  const now = nowIso(ctx);
  return (
    ctx.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, ctx.userId),
          isNull(focusSessions.deletedAt),
          isNull(focusSessions.completedAt),
          isNull(focusSessions.cancelledAt),
          lte(focusSessions.startAt, now),
          gt(focusSessions.endAt, now),
        ),
      )
      .orderBy(asc(focusSessions.startAt))
      .get() ?? null
  );
}

/** The next session still ahead (start in the future). */
export function nextFocus(ctx: DomainCtx): FocusSession | null {
  const now = nowIso(ctx);
  return openFocus(ctx).find((s) => s.startAt > now) ?? null;
}

/** Sessions that ran out without being finished or cancelled – waiting for a "done?" answer. */
export function unsettledFocus(ctx: DomainCtx): FocusSession[] {
  const now = nowIso(ctx);
  return ctx.db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, ctx.userId),
        isNull(focusSessions.deletedAt),
        isNull(focusSessions.completedAt),
        isNull(focusSessions.cancelledAt),
        lte(focusSessions.endAt, now),
      ),
    )
    .orderBy(desc(focusSessions.endAt))
    .all();
}

/** True when any open session covers `at` – nudges and capture prompts stay quiet then. */
export function inFocusAt(sessions: Pick<FocusSession, 'startAt' | 'endAt'>[], at: string | Date): boolean {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return sessions.some((s) => t >= Date.parse(s.startAt) && t < Date.parse(s.endAt));
}

/** Points a session pays if finished at `at` (pro rata per hour + check-in bonuses). */
export function focusPoints(ctx: DomainCtx, s: FocusSession, at: Date = ctx.now()): number {
  const r = ctx.settings.rules;
  const minutes = elapsedMinutes(s, at);
  return Math.round((minutes / 60) * r.focusPointsPerHour) + s.checkinsDone * r.focusCheckinPoint;
}

/**
 * "Still on it" – answers a check-in ping. Only while the session runs; pings closer than
 * MIN_CHECKIN_GAP_MINUTES count once, so a double tap cannot farm bonuses.
 */
export function checkinFocus(ctx: DomainCtx, id: string): FocusSession {
  const s = getFocus(ctx, id);
  if (focusStatus(ctx, s) !== 'active') throw new DomainError('INVALID', 'most nem fut ez a fókusz');
  const now = ctx.now();
  if (s.lastCheckinAt && now.getTime() - Date.parse(s.lastCheckinAt) < MIN_CHECKIN_GAP_MINUTES * 60_000) return s;
  return ctx.db
    .update(focusSessions)
    .set({ checkinsDone: s.checkinsDone + 1, lastCheckinAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(eq(focusSessions.id, id))
    .returning()
    .get();
}

/**
 * Finishes a running or ended session: awards the points for the time actually spent
 * (capped at the planned length) in one transaction. Idempotent per session.
 */
export function finishFocus(ctx: DomainCtx, id: string): { session: FocusSession; points: number } {
  const s = getFocus(ctx, id);
  const status = focusStatus(ctx, s);
  if (status === 'done') return { session: s, points: s.pointsAwarded };
  if (status === 'cancelled') throw new DomainError('INVALID', 'ezt a fókuszt lemondtad');
  if (status === 'planned') throw new DomainError('INVALID', 'még nem kezdődött el');
  const points = focusPoints(ctx, s);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const entry = award(c, {
      refType: 'focus',
      refId: s.id,
      reason: 'focus_done',
      date: todayKey(c),
      base: points,
      note: s.title,
    });
    const ts = nowIso(c);
    const session = tx
      .update(focusSessions)
      .set({ completedAt: ts, pointsAwarded: entry?.delta ?? 0, updatedAt: ts })
      .where(eq(focusSessions.id, id))
      .returning()
      .get();
    return { session, points: entry?.delta ?? 0 };
  });
}

/** Gives up on a planned/running/ended session. No points, nothing to reverse. */
export function cancelFocus(ctx: DomainCtx, id: string): FocusSession {
  const s = getFocus(ctx, id);
  if (s.completedAt) throw new DomainError('INVALID', 'a befejezett fókusz nem mondható le');
  if (s.cancelledAt) return s;
  const ts = nowIso(ctx);
  return ctx.db.update(focusSessions).set({ cancelledAt: ts, updatedAt: ts }).where(eq(focusSessions.id, id)).returning().get();
}

/** 'HH:MM–HH:MM' in the user's zone, for labels and notification bodies. */
export function focusTimeRange(ctx: DomainCtx, s: Pick<FocusSession, 'startAt' | 'endAt'>): string {
  const tz = ctx.settings.timezone;
  return `${localTime(new Date(s.startAt), tz)}–${localTime(new Date(s.endAt), tz)}`;
}
