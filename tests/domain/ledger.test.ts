import { beforeEach, describe, expect, it } from 'vitest';
import {
  award,
  balance,
  findActiveEntry,
  levelFor,
  levelProgress,
  penalize,
  pointsForDay,
  recentEntries,
  reverse,
  reverseActive,
  setActiveDelta,
} from '@/src/domain/points/ledger';
import { createTestWorld, type TestWorld } from '../helpers/db';

const KEY = { reason: 'habit_done', refType: 'habit', refId: 'h1', date: '2026-09-09' } as const;

describe('ledger', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld();
  });

  it('awards once per key (idempotent) and applies the multiplier', () => {
    const a = award(w.ctx, { ...KEY, base: 10, multiplier: 1.25 });
    const b = award(w.ctx, { ...KEY, base: 10, multiplier: 1.25 });
    expect(a?.delta).toBe(13);
    expect(b?.id).toBe(a?.id);
    expect(balance(w.ctx)).toMatchObject({ raw: 13, spendable: 13, xp: 13 });
  });

  it('returns null for zero-point awards', () => {
    expect(award(w.ctx, { ...KEY, base: 0 })).toBeNull();
    expect(recentEntries(w.ctx)).toHaveLength(0);
  });

  it('reverses exactly once and re-awarding after reversal is allowed', () => {
    const a = award(w.ctx, { ...KEY, base: 10 })!;
    reverse(w.ctx, a.id);
    expect(() => reverse(w.ctx, a.id)).toThrow(/already reversed/);
    expect(findActiveEntry(w.ctx, KEY)).toBeUndefined();
    expect(balance(w.ctx)).toMatchObject({ raw: 0, xp: 0 });

    const again = award(w.ctx, { ...KEY, base: 10 })!;
    expect(again.id).not.toBe(a.id);
    expect(balance(w.ctx)).toMatchObject({ raw: 10, xp: 10 });
  });

  it('cannot reverse a reversal', () => {
    const a = award(w.ctx, { ...KEY, base: 10 })!;
    const r = reverse(w.ctx, a.id);
    expect(() => reverse(w.ctx, r.id)).toThrow(/cannot reverse a reversal/);
  });

  it('reverseActive is a no-op when nothing is active', () => {
    expect(reverseActive(w.ctx, KEY)).toBeNull();
  });

  it('penalties drive raw negative but spendable floors at 0 and xp ignores them', () => {
    penalize(w.ctx, { ...KEY, reason: 'habit_missed', base: 5 });
    penalize(w.ctx, { ...KEY, reason: 'habit_missed', base: 5 }); // idempotent
    expect(balance(w.ctx)).toEqual({ raw: -5, spendable: 0, xp: 0, level: 0 });
  });

  it('check/uncheck cycles do not farm xp', () => {
    for (let i = 0; i < 5; i++) {
      const a = award(w.ctx, { ...KEY, base: 10 })!;
      reverse(w.ctx, a.id);
    }
    award(w.ctx, { ...KEY, base: 10 });
    expect(balance(w.ctx)).toMatchObject({ raw: 10, xp: 10 });
  });

  it('setActiveDelta moves the credit to the desired value with a single active row', () => {
    setActiveDelta(w.ctx, { ...KEY, base: 10, desired: 5 });
    setActiveDelta(w.ctx, { ...KEY, base: 10, desired: 5 }); // unchanged → no new rows
    expect(recentEntries(w.ctx)).toHaveLength(1);
    setActiveDelta(w.ctx, { ...KEY, base: 10, desired: 10 });
    expect(findActiveEntry(w.ctx, KEY)?.delta).toBe(10);
    expect(balance(w.ctx).raw).toBe(10);
    setActiveDelta(w.ctx, { ...KEY, base: 10, desired: 0 });
    expect(findActiveEntry(w.ctx, KEY)).toBeUndefined();
    expect(balance(w.ctx).raw).toBe(0);
  });

  it('pointsForDay nets out reversals', () => {
    const a = award(w.ctx, { ...KEY, base: 10 })!;
    award(w.ctx, { ...KEY, refId: 'h2', base: 20 });
    penalize(w.ctx, { ...KEY, reason: 'task_overdue', refType: 'task', refId: 't1', base: 5 });
    reverse(w.ctx, a.id);
    expect(pointsForDay(w.ctx, '2026-09-09')).toEqual({ earned: 20, lost: 5, net: 15 });
    expect(pointsForDay(w.ctx, '2026-09-10')).toEqual({ earned: 0, lost: 0, net: 0 });
  });

  it('levels grow with the square root of xp', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(99)).toBe(0);
    expect(levelFor(100)).toBe(1);
    expect(levelFor(400)).toBe(2);
    expect(levelFor(10_000)).toBe(10);
    expect(levelProgress(250)).toEqual({ level: 1, next: 400, progress: 0.5 });
  });
});
