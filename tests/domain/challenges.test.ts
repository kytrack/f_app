import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '@/src/db/schema';
import {
  acceptChallenge,
  acceptedOn,
  archiveChallenge,
  createChallenge,
  deleteChallenge,
  drawChallenges,
  listAllChallenges,
  listChallenges,
  markDrawnToday,
  restoreChallenge,
  shouldDrawToday,
  updateChallenge,
} from '@/src/domain/challenges';
import { balance } from '@/src/domain/points/ledger';
import { completeTask, tasksForDay } from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09';

describe('challenges', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
    (w.ctx.settings as { challengesEnabled: boolean; challengeChoices: number }).challengesEnabled = true;
    (w.ctx.settings as { challengeChoices: number }).challengeChoices = 3;
  });

  const seed = () => ['Szobatakarítás', 'Mosogatás', 'Porszívózás', 'Mosás', 'Ablakpucolás'].map((name) => createChallenge(w.ctx, { name }));

  it('creates with the rule default points, validates, archives, restores, deletes', () => {
    const c = createChallenge(w.ctx, { name: ' Mosogatás ', icon: '🍽️' });
    expect(c).toMatchObject({ name: 'Mosogatás', points: 15, weight: 1 });
    expect(() => createChallenge(w.ctx, { name: ' ' })).toThrow(/name/);
    expect(() => createChallenge(w.ctx, { name: 'x', points: 999 })).toThrow(/points/);
    expect(updateChallenge(w.ctx, c.id, { points: 25, weight: 3 })).toMatchObject({ points: 25, weight: 3 });
    archiveChallenge(w.ctx, c.id);
    expect(listChallenges(w.ctx)).toEqual([]);
    expect(listAllChallenges(w.ctx)[0].archivedAt).not.toBeNull();
    restoreChallenge(w.ctx, c.id);
    expect(listChallenges(w.ctx)).toHaveLength(1);
    deleteChallenge(w.ctx, c.id);
    expect(listAllChallenges(w.ctx)).toEqual([]);
  });

  it('draws distinct options, respects the count and the pool size', () => {
    seed();
    const draw = drawChallenges(w.ctx);
    expect(draw).toHaveLength(3);
    expect(new Set(draw.map((c) => c.id)).size).toBe(3);
    expect(drawChallenges(w.ctx, 10)).toHaveLength(5);
    expect(drawChallenges({ ...w.ctx, settings: { ...w.ctx.settings } }, 0)).toEqual([]);
  });

  it('weights bias the draw', () => {
    createChallenge(w.ctx, { name: 'ritka', weight: 1 });
    const heavy = createChallenge(w.ctx, { name: 'gyakori', weight: 10 });
    let heavyFirst = 0;
    for (let i = 0; i < 200; i++) if (drawChallenges(w.ctx, 1)[0].id === heavy.id) heavyFirst++;
    expect(heavyFirst).toBeGreaterThan(150);
  });

  it('accepting creates a task due at the end of the logical day with the challenge points', () => {
    const [c] = seed();
    const task = acceptChallenge(w.ctx, c.id);
    expect(task).toMatchObject({ title: 'Szobatakarítás', points: 15, challengeId: c.id, priority: 2 });
    expect(task.dueAt).toBe('2026-09-10T01:59:00.000Z'); // 03:59 CEST next morning (day starts at 04:00)
    expect(tasksForDay(w.ctx, TODAY).due.map((t) => t.id)).toEqual([task.id]);
    expect(acceptedOn(w.ctx, TODAY)).toEqual(new Set([c.id]));
    expect(() => acceptChallenge(w.ctx, c.id)).toThrow(/ma már/);
    completeTask(w.ctx, task.id);
    expect(balance(w.ctx).raw).toBe(15);
  });

  it('accepted challenges are excluded from later draws today, back tomorrow', () => {
    const all = seed();
    for (const c of all.slice(0, 4)) acceptChallenge(w.ctx, c.id);
    expect(drawChallenges(w.ctx).map((c) => c.id)).toEqual([all[4].id]);
    w.advanceDays(1);
    expect(drawChallenges(w.ctx)).toHaveLength(3);
  });

  it('reroll excludes the previous roll when the pool allows', () => {
    const all = seed();
    const first = drawChallenges(w.ctx, 2);
    const second = drawChallenges(w.ctx, 2, first.map((c) => c.id));
    expect(second.some((c) => first.some((f) => f.id === c.id))).toBe(false);
    // pool of 5, exclude 4 → falls back to the full pool
    const third = drawChallenges(w.ctx, 3, all.slice(0, 4).map((c) => c.id));
    expect(third).toHaveLength(3);
  });

  it('the mandatory daily draw is due once per logical day, only with a pool and when enabled', () => {
    expect(shouldDrawToday(w.ctx, null)).toBe(false); // empty pool
    seed();
    expect(shouldDrawToday(w.ctx, null)).toBe(true);
    markDrawnToday(w.ctx);
    const row = w.ctx.db.select().from(settings).get()!;
    expect(row.lastChallengeDay).toBe(TODAY);
    expect(shouldDrawToday(w.ctx, row.lastChallengeDay)).toBe(false);
    w.advanceDays(1);
    expect(shouldDrawToday(w.ctx, row.lastChallengeDay)).toBe(true);
    (w.ctx.settings as { challengesEnabled: boolean }).challengesEnabled = false;
    expect(shouldDrawToday(w.ctx, null)).toBe(false);
  });
});
