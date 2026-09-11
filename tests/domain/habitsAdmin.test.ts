import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  getHabit,
  habitsWithLogs,
  listAllHabits,
  reorderHabit,
  restoreHabit,
} from '@/src/domain/habits';
import { habits } from '@/src/db/schema';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('habit administration', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  it('lists active habits first, archived last; restore brings them back', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    const b = createHabit(w.ctx, { name: 'b', kind: 'good' });
    archiveHabit(w.ctx, a.id);
    expect(listAllHabits(w.ctx).map((h) => h.name)).toEqual(['b', 'a']);
    expect(habitsWithLogs(w.ctx, '2026-09-09').map((r) => r.habit.id)).toEqual([b.id]);
    restoreHabit(w.ctx, a.id);
    expect(habitsWithLogs(w.ctx, '2026-09-09')).toHaveLength(2);
  });

  it('reorders among active habits and normalises sortOrder', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    const b = createHabit(w.ctx, { name: 'b', kind: 'good' });
    const c = createHabit(w.ctx, { name: 'c', kind: 'good' });
    reorderHabit(w.ctx, c.id, 'up');
    expect(listAllHabits(w.ctx).map((h) => h.name)).toEqual(['a', 'c', 'b']);
    reorderHabit(w.ctx, a.id, 'up'); // already first → no-op
    expect(listAllHabits(w.ctx).map((h) => [h.name, h.sortOrder])).toEqual([['a', 0], ['c', 1], ['b', 2]]);
    reorderHabit(w.ctx, a.id, 'down');
    expect(habitsWithLogs(w.ctx, '2026-09-09').map((r) => r.habit.name)).toEqual(['c', 'a', 'b']);
  });

  it('delete hides the habit everywhere but keeps history rows', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    deleteHabit(w.ctx, a.id);
    expect(listAllHabits(w.ctx)).toEqual([]);
    expect(() => getHabit(w.ctx, a.id)).toThrow(/not found/);
    expect(w.ctx.db.select().from(habits).all()).toHaveLength(1);
  });
});
