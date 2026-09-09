import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveHabit,
  cleanDays,
  createHabit,
  habitsWithLogs,
  isScheduledOn,
  recordRelapse,
  setHabitCount,
  skipHabit,
  tapHabit,
} from '@/src/domain/habits';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09'; // Wednesday

describe('habits', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  it('schedules by type and weekday mask', () => {
    expect(isScheduledOn({ scheduleType: 'daily', weekdayMask: 0 }, TODAY)).toBe(true);
    expect(isScheduledOn({ scheduleType: 'weekdays', weekdayMask: 0b0011111 }, TODAY)).toBe(true);
    expect(isScheduledOn({ scheduleType: 'weekdays', weekdayMask: 0b0011111 }, '2026-09-12')).toBe(false); // Sat
    expect(isScheduledOn({ scheduleType: 'times_per_week', weekdayMask: 0 }, '2026-09-12')).toBe(true);
  });

  it('tap toggles a simple habit and awards/reverses 10 points', () => {
    const h = createHabit(w.ctx, { name: 'Olvasás', kind: 'good' });
    expect(tapHabit(w.ctx, h.id, TODAY).status).toBe('done');
    expect(balance(w.ctx).raw).toBe(10);
    expect(tapHabit(w.ctx, h.id, TODAY).status).toBe('pending');
    expect(balance(w.ctx).raw).toBe(0);
    expect(recentEntries(w.ctx)).toHaveLength(2); // award + reversal, nothing deleted
  });

  it('counted habit pays proportionally and re-syncs on every change', () => {
    const h = createHabit(w.ctx, { name: 'Víz', kind: 'good', targetCount: 8, unit: 'pohár' });
    setHabitCount(w.ctx, h.id, TODAY, 3);
    expect(balance(w.ctx).raw).toBe(0); // < 50%
    setHabitCount(w.ctx, h.id, TODAY, 4);
    expect(balance(w.ctx).raw).toBe(5);
    setHabitCount(w.ctx, h.id, TODAY, 8);
    expect(balance(w.ctx).raw).toBe(10);
    expect(setHabitCount(w.ctx, h.id, TODAY, 8).status).toBe('done');
    setHabitCount(w.ctx, h.id, TODAY, 20); // clamped to target
    expect(balance(w.ctx).raw).toBe(10);
    setHabitCount(w.ctx, h.id, TODAY, 0);
    expect(balance(w.ctx).raw).toBe(0);
  });

  it('tap on a counted habit increments and wraps to zero when full', () => {
    const h = createHabit(w.ctx, { name: 'Víz', kind: 'good', targetCount: 2 });
    expect(tapHabit(w.ctx, h.id, TODAY).count).toBe(1);
    expect(tapHabit(w.ctx, h.id, TODAY).count).toBe(2);
    expect(tapHabit(w.ctx, h.id, TODAY).count).toBe(0);
  });

  it('uses the streak multiplier at tap time', () => {
    const h = createHabit(w.ctx, { name: 'Séta', kind: 'good' });
    // simulate a 7-day streak already settled by day close
    w.ctx.db.run(sql`UPDATE habits SET current_streak = 7 WHERE id = ${h.id}`);
    tapHabit(w.ctx, h.id, TODAY);
    expect(balance(w.ctx).raw).toBe(13);
  });

  it('refuses future dates and locked past dates', () => {
    const h = createHabit(w.ctx, { name: 'X', kind: 'good' });
    expect(() => tapHabit(w.ctx, h.id, '2026-09-10')).toThrow(/future/);
    expect(() => tapHabit(w.ctx, h.id, '2026-09-06')).toThrow(/locked/);
    expect(tapHabit(w.ctx, h.id, '2026-09-08').status).toBe('done'); // within 48h
  });

  it('skip clears points and marks skipped', () => {
    const h = createHabit(w.ctx, { name: 'X', kind: 'good' });
    tapHabit(w.ctx, h.id, TODAY);
    expect(skipHabit(w.ctx, h.id, TODAY).status).toBe('skipped');
    expect(balance(w.ctx).raw).toBe(0);
  });

  it('relapse penalises -10 per event, capped at -30, and is undoable', () => {
    const h = createHabit(w.ctx, { name: 'Dohányzás', kind: 'bad' });
    expect(recordRelapse(w.ctx, h.id, TODAY).status).toBe('relapse');
    expect(balance(w.ctx).raw).toBe(-10);
    recordRelapse(w.ctx, h.id, TODAY);
    recordRelapse(w.ctx, h.id, TODAY);
    recordRelapse(w.ctx, h.id, TODAY);
    expect(balance(w.ctx).raw).toBe(-30);
    const log = recordRelapse(w.ctx, h.id, TODAY, -1);
    expect(log.count).toBe(3);
    expect(balance(w.ctx).raw).toBe(-30); // still capped
    recordRelapse(w.ctx, h.id, TODAY, -1);
    recordRelapse(w.ctx, h.id, TODAY, -1);
    recordRelapse(w.ctx, h.id, TODAY, -1);
    expect(recordRelapse(w.ctx, h.id, TODAY, -1).count).toBe(0); // floor
    expect(balance(w.ctx).raw).toBe(0);
  });

  it('rejects the wrong operation per kind', () => {
    const good = createHabit(w.ctx, { name: 'g', kind: 'good' });
    const bad = createHabit(w.ctx, { name: 'b', kind: 'bad' });
    expect(() => recordRelapse(w.ctx, good.id, TODAY)).toThrow(/bad habits/);
    expect(() => tapHabit(w.ctx, bad.id, TODAY)).toThrow(/recordRelapse/);
    expect(() => skipHabit(w.ctx, bad.id, TODAY)).toThrow(/good habits/);
  });

  it('lists only scheduled, unarchived habits with their logs', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    const weekend = createHabit(w.ctx, { name: 'wk', kind: 'good', scheduleType: 'weekdays', weekdayMask: 0b1100000 });
    const archived = createHabit(w.ctx, { name: 'old', kind: 'good' });
    archiveHabit(w.ctx, archived.id);
    tapHabit(w.ctx, a.id, TODAY);
    const rows = habitsWithLogs(w.ctx, TODAY);
    expect(rows.map((r) => r.habit.id)).toEqual([a.id]);
    expect(rows[0].log?.status).toBe('done');
    expect(habitsWithLogs(w.ctx, '2026-09-12').map((r) => r.habit.id)).toEqual([a.id, weekend.id]);
  });

  it('cleanDays counts whole days since the streak start', () => {
    const h = createHabit(w.ctx, { name: 'b', kind: 'bad' });
    expect(h.streakStartedOn).toBe(TODAY);
    expect(cleanDays(h, TODAY)).toBe(0);
    expect(cleanDays(h, '2026-09-19')).toBe(10);
  });
});
