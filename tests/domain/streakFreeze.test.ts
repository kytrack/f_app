import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDay } from '@/src/domain/dayClose';
import { createHabit, getHabit, tapHabit } from '@/src/domain/habits';
import { balance } from '@/src/domain/points/ledger';
import { freezeEarned } from '@/src/domain/points/streak';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('streak freeze', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-08T10:00:00Z');
  });

  it('is earned at every 30th day, capped at 2', () => {
    expect(freezeEarned(29)).toBe(0);
    expect(freezeEarned(30)).toBe(1);
    expect(freezeEarned(60)).toBe(1);
    expect(freezeEarned(0)).toBe(0);
  });

  it('day close grants a freeze when the streak reaches 30', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 29, best_streak = 29 WHERE id = ${h.id}`);
    tapHabit(w.ctx, h.id, '2026-09-08');
    w.advanceDays(1);
    closeDay(w.ctx, '2026-09-08');
    expect(getHabit(w.ctx, h.id)).toMatchObject({ currentStreak: 30, streakFreezesAvailable: 1 });
  });

  it('a miss spends the freeze instead of resetting, with no penalty', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 31, best_streak = 31, streak_freezes_available = 1 WHERE id = ${h.id}`);
    w.advanceDays(1);
    const s = closeDay(w.ctx, '2026-09-08')!;
    expect(getHabit(w.ctx, h.id)).toMatchObject({ currentStreak: 31, streakFreezesAvailable: 0 });
    expect(balance(w.ctx).raw).toBe(0);
    expect(s.habitsScheduled).toBe(0); // excused day is excluded from perfect-day maths
    // next miss without a freeze resets as usual
    w.advanceDays(1);
    closeDay(w.ctx, '2026-09-09');
    expect(getHabit(w.ctx, h.id).currentStreak).toBe(0);
    expect(balance(w.ctx).raw).toBe(-5);
  });

  it('never spends a freeze on a zero streak', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.ctx.db.run(sql`UPDATE habits SET streak_freezes_available = 1 WHERE id = ${h.id}`);
    w.advanceDays(1);
    closeDay(w.ctx, '2026-09-08');
    expect(getHabit(w.ctx, h.id)).toMatchObject({ currentStreak: 0, streakFreezesAvailable: 1 });
    expect(balance(w.ctx).raw).toBe(-5);
  });
});
