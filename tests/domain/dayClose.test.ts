import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDay, closePendingDays, isDayClosed } from '@/src/domain/dayClose';
import { createHabit, getHabit, recordRelapse, skipHabit, tapHabit } from '@/src/domain/habits';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import { completeTask, createTask, getTask } from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

// World starts Wed 2026-09-09 10:00Z. "Yesterday" = 2026-09-08.
const D8 = '2026-09-08';
const D9 = '2026-09-09';

describe('closeDay', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-08T10:00:00Z'); // start ON the 8th so habits exist that day
  });

  it('never settles today or the future, and is idempotent', () => {
    createHabit(w.ctx, { name: 'x', kind: 'good' });
    expect(closeDay(w.ctx, D8)).toBeNull(); // it is still the 8th
    w.advanceDays(1);
    const s = closeDay(w.ctx, D8);
    expect(s?.date).toBe(D8);
    expect(isDayClosed(w.ctx, D8)).toBe(true);
    expect(closeDay(w.ctx, D8)).toBeNull();
  });

  it('penalises missed good habits, rewards clean bad habits, updates streaks', () => {
    const missed = createHabit(w.ctx, { name: 'missed', kind: 'good' });
    const done = createHabit(w.ctx, { name: 'done', kind: 'good' });
    const smoke = createHabit(w.ctx, { name: 'smoke', kind: 'bad' });
    tapHabit(w.ctx, done.id, D8); // +10
    w.advanceDays(1);

    const s = closeDay(w.ctx, D8)!;
    expect(s).toMatchObject({ habitsScheduled: 3, habitsDone: 2, perfectDay: false });
    expect(s.pointsEarned).toBe(25); // 10 done + 15 clean day
    expect(s.pointsLost).toBe(5);
    expect(getHabit(w.ctx, missed.id)).toMatchObject({ currentStreak: 0, bestStreak: 0 });
    expect(getHabit(w.ctx, done.id)).toMatchObject({ currentStreak: 1, bestStreak: 1, lastSuccessDate: D8 });
    expect(getHabit(w.ctx, smoke.id)).toMatchObject({ currentStreak: 1 });
  });

  it('relapse resets the bad-habit streak and restarts the clean counter tomorrow', () => {
    const smoke = createHabit(w.ctx, { name: 'smoke', kind: 'bad' });
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 12, best_streak = 12 WHERE id = ${smoke.id}`);
    recordRelapse(w.ctx, smoke.id, D8);
    w.advanceDays(1);
    closeDay(w.ctx, D8);
    expect(getHabit(w.ctx, smoke.id)).toMatchObject({ currentStreak: 0, bestStreak: 12, streakStartedOn: D9 });
  });

  it('skipped habits neither penalise nor break the streak, and are excluded from perfect day', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 3, best_streak = 3 WHERE id = ${h.id}`);
    skipHabit(w.ctx, h.id, D8);
    w.advanceDays(1);
    const s = closeDay(w.ctx, D8)!;
    expect(s).toMatchObject({ habitsScheduled: 0, habitsDone: 0, pointsLost: 0, perfectDay: false });
    expect(getHabit(w.ctx, h.id).currentStreak).toBe(3);
  });

  it('pays the 7-day milestone bonus once', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 6, best_streak = 6 WHERE id = ${h.id}`);
    tapHabit(w.ctx, h.id, D8);
    w.advanceDays(1);
    closeDay(w.ctx, D8);
    expect(getHabit(w.ctx, h.id).currentStreak).toBe(7);
    const bonus = recentEntries(w.ctx).find((e) => e.reason === 'streak_milestone');
    expect(bonus?.delta).toBe(25);
  });

  it('overdue tasks are penalised exactly once across days', () => {
    const t = createTask(w.ctx, { title: 't', dueAt: '2026-09-08T12:00:00Z' });
    w.advanceDays(1);
    closeDay(w.ctx, D8);
    expect(balance(w.ctx).raw).toBe(-5);
    expect(getTask(w.ctx, t.id).overduePenalizedAt).not.toBeNull();
    w.advanceDays(1);
    closeDay(w.ctx, D9);
    expect(balance(w.ctx).raw).toBe(-5);
  });

  it('perfect day needs every scheduled habit done and every due task completed', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    const t = createTask(w.ctx, { title: 't', dueAt: '2026-09-08T12:00:00Z' });
    tapHabit(w.ctx, h.id, D8);
    completeTask(w.ctx, t.id);
    w.advanceDays(1);
    const s = closeDay(w.ctx, D8)!;
    expect(s.perfectDay).toBe(true);
    expect(s).toMatchObject({ tasksDue: 1, tasksDone: 1 });
    expect(s.pointsEarned).toBe(10 + 10 + 25);
  });

  it('flexible habits are not penalised daily but are on Sunday when under quota', () => {
    // Move to Monday 2026-09-07 so the whole week exists.
    w.setNow('2026-09-07T10:00:00Z');
    const h = createHabit(w.ctx, { name: 'gym', kind: 'good', scheduleType: 'times_per_week', timesPerWeek: 3 });
    tapHabit(w.ctx, h.id, '2026-09-07');
    w.setNow('2026-09-14T10:00:00Z'); // next Monday
    const closed = closePendingDays(w.ctx);
    expect(closed).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
    // +10 workout, +25 perfect day on Monday (only scheduled habit done, no tasks due),
    // -5 once for the weekly quota miss on Sunday, nothing on the other weekdays
    expect(balance(w.ctx).raw).toBe(30);
    expect(recentEntries(w.ctx).filter((e) => e.reason === 'habit_missed')).toHaveLength(1);
    expect(getHabit(w.ctx, h.id).currentStreak).toBe(0);
  });

  it('closePendingDays starts at the first activity and stops at yesterday', () => {
    expect(closePendingDays(w.ctx)).toEqual([]); // nothing exists yet
    createHabit(w.ctx, { name: 'h', kind: 'good' });
    w.advanceDays(3); // now the 11th
    expect(closePendingDays(w.ctx)).toEqual([D8, D9, '2026-09-10']);
    expect(closePendingDays(w.ctx)).toEqual([]);
    w.advanceDays(1);
    expect(closePendingDays(w.ctx)).toEqual(['2026-09-11']);
  });
});
