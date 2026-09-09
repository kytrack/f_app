/**
 * The point ledger – the ONLY place points are created, removed or reversed.
 * Append-only: rows are never updated or deleted. Undo = a 'reversal' row pointing at the
 * original via reverses_id. An entry is "active" when it is not a reversal and no reversal
 * points at it. See docs/SPEC.md §4.3.
 */
import { and, desc, eq, isNull, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { pointLedger, type LedgerEntry, type LedgerReason, type LedgerRefType } from '@/src/db/schema';
import { DomainError, nowIso, type DomainCtx } from '../context';
import type { DayKey } from '../dates';
import { applyMultiplier } from './rules';

export interface LedgerKey {
  refType: LedgerRefType;
  refId: string;
  reason: LedgerReason;
  date: DayKey;
}

export interface AwardInput extends LedgerKey {
  base: number;
  multiplier?: number;
  note?: string;
}

/** Sub-condition: no reversal row points at `pointLedger.id`. */
function notReversed(ctx: DomainCtx) {
  const rev = alias(pointLedger, 'rev');
  return notExists(
    ctx.db
      .select({ one: sql`1` })
      .from(rev)
      .where(eq(rev.reversesId, pointLedger.id)),
  );
}

export function findActiveEntry(ctx: DomainCtx, key: LedgerKey): LedgerEntry | undefined {
  return ctx.db
    .select()
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.userId, ctx.userId),
        eq(pointLedger.refType, key.refType),
        eq(pointLedger.refId, key.refId),
        eq(pointLedger.reason, key.reason),
        eq(pointLedger.date, key.date),
        isNull(pointLedger.reversesId),
        notReversed(ctx),
      ),
    )
    .get();
}

function insert(ctx: DomainCtx, row: Omit<LedgerEntry, 'id' | 'userId' | 'createdAt'>): LedgerEntry {
  return ctx.db
    .insert(pointLedger)
    .values({ ...row, id: ctx.uuid(), userId: ctx.userId, createdAt: nowIso(ctx) })
    .returning()
    .get();
}

/**
 * Credits `round(base × multiplier)` points once per (ref, reason, date).
 * Returns the existing active entry if one exists (idempotent), or null when the amount is 0.
 */
export function award(ctx: DomainCtx, input: AwardInput): LedgerEntry | null {
  const multiplier = input.multiplier ?? 1;
  const delta = applyMultiplier(input.base, multiplier);
  if (delta <= 0) return null;
  const existing = findActiveEntry(ctx, input);
  if (existing) return existing;
  return insert(ctx, {
    delta,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId,
    reversesId: null,
    date: input.date,
    multiplier,
    note: input.note ?? null,
  });
}

/** Debits `|base|` points once per (ref, reason, date). Never multiplied. */
export function penalize(ctx: DomainCtx, input: Omit<AwardInput, 'multiplier'>): LedgerEntry | null {
  const delta = -Math.abs(Math.round(input.base));
  if (delta === 0) return null;
  const existing = findActiveEntry(ctx, input);
  if (existing) return existing;
  return insert(ctx, {
    delta,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId,
    reversesId: null,
    date: input.date,
    multiplier: 1,
    note: input.note ?? null,
  });
}

/** Neutralises one entry with a compensating row. Throws if already reversed. */
export function reverse(ctx: DomainCtx, entryId: string, note?: string): LedgerEntry {
  const original = ctx.db.select().from(pointLedger).where(eq(pointLedger.id, entryId)).get();
  if (!original) throw new DomainError('NOT_FOUND', `ledger entry ${entryId} not found`);
  if (original.reason === 'reversal') throw new DomainError('INVALID', 'cannot reverse a reversal');
  const already = ctx.db
    .select({ id: pointLedger.id })
    .from(pointLedger)
    .where(eq(pointLedger.reversesId, entryId))
    .get();
  if (already) throw new DomainError('INVALID', `ledger entry ${entryId} already reversed`);
  return insert(ctx, {
    delta: -original.delta,
    reason: 'reversal',
    refType: original.refType,
    refId: original.refId,
    reversesId: original.id,
    date: original.date,
    multiplier: 1,
    note: note ?? null,
  });
}

/** Reverses the active entry for a key if there is one. */
export function reverseActive(ctx: DomainCtx, key: LedgerKey, note?: string): LedgerEntry | null {
  const active = findActiveEntry(ctx, key);
  return active ? reverse(ctx, active.id, note) : null;
}

/**
 * Sets the active credit for a key to exactly `desired` points: no-op if unchanged,
 * otherwise reverse the old one and (if desired > 0) write a new one.
 * Used for counted habits whose partial points move with the count.
 */
export function setActiveDelta(
  ctx: DomainCtx,
  input: AwardInput & { desired: number },
): LedgerEntry | null {
  const active = findActiveEntry(ctx, input);
  if (active && active.delta === input.desired) return active;
  if (active) reverse(ctx, active.id, 'recomputed');
  if (input.desired === 0) return null;
  return insert(ctx, {
    delta: input.desired,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId,
    reversesId: null,
    date: input.date,
    multiplier: input.multiplier ?? 1,
    note: input.note ?? null,
  });
}

export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

/** Points needed to reach the next level, and progress inside the current one (0..1). */
export function levelProgress(xp: number): { level: number; next: number; progress: number } {
  const level = levelFor(xp);
  const floor = level * level * 100;
  const next = (level + 1) * (level + 1) * 100;
  return { level, next, progress: (xp - floor) / (next - floor) };
}

export interface Balance {
  /** Σ delta, may be negative. */
  raw: number;
  /** max(0, raw) – what can be spent in the reward shop. */
  spendable: number;
  /** Σ positive, non-reversed deltas – never decreases through normal play. */
  xp: number;
  level: number;
}

export function balance(ctx: DomainCtx): Balance {
  const raw =
    ctx.db
      .select({ v: sql<number>`coalesce(sum(${pointLedger.delta}), 0)` })
      .from(pointLedger)
      .where(eq(pointLedger.userId, ctx.userId))
      .get()?.v ?? 0;
  const xp =
    ctx.db
      .select({ v: sql<number>`coalesce(sum(${pointLedger.delta}), 0)` })
      .from(pointLedger)
      .where(
        and(
          eq(pointLedger.userId, ctx.userId),
          sql`${pointLedger.delta} > 0`,
          isNull(pointLedger.reversesId),
          notReversed(ctx),
        ),
      )
      .get()?.v ?? 0;
  return { raw, spendable: Math.max(0, raw), xp, level: levelFor(xp) };
}

/** Earned / lost totals for one logical day, net of reversals. */
export function pointsForDay(ctx: DomainCtx, date: DayKey): { earned: number; lost: number; net: number } {
  const rows = ctx.db
    .select({ delta: pointLedger.delta })
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.userId, ctx.userId),
        eq(pointLedger.date, date),
        isNull(pointLedger.reversesId),
        notReversed(ctx),
      ),
    )
    .all();
  let earned = 0;
  let lost = 0;
  for (const r of rows) {
    if (r.delta > 0) earned += r.delta;
    else lost += -r.delta;
  }
  return { earned, lost, net: earned - lost };
}

export function recentEntries(ctx: DomainCtx, limit = 50): LedgerEntry[] {
  return ctx.db
    .select()
    .from(pointLedger)
    .where(eq(pointLedger.userId, ctx.userId))
    .orderBy(desc(pointLedger.createdAt), desc(pointLedger.id))
    .limit(limit)
    .all();
}
