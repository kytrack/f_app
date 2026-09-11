import { beforeEach, describe, expect, it } from 'vitest';
import { closePendingDays } from '@/src/domain/dayClose';
import { createHabit, tapHabit } from '@/src/domain/habits';
import { addAdHocMeal, createTemplate } from '@/src/domain/meals';
import { exerciseProgress, habitHeatmap, kcalHistory, overview, pointsHistory, weeklyPoints } from '@/src/domain/stats';
import { createPlan, finishSession, setExerciseDone, startSession, updateSet } from '@/src/domain/workouts';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('stats', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-07T10:00:00Z'); // Monday
  });

  it('points history mixes closed days and today, weekly totals group by Monday', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, '2026-09-07'); // +10, perfect day
    w.advanceDays(1); // Tue
    closePendingDays(w.ctx);
    tapHabit(w.ctx, h.id, '2026-09-08'); // live today
    const hist = pointsHistory(w.ctx, 3);
    expect(hist.map((d) => [d.date, d.net, d.closed, d.perfect])).toEqual([
      ['2026-09-06', 0, false, false],
      ['2026-09-07', 35, true, true],
      ['2026-09-08', 10, false, false],
    ]);
    const weeks = weeklyPoints(w.ctx, 2);
    expect(weeks.map((x) => [x.weekStart, x.net])).toEqual([
      ['2026-08-31', 0],
      ['2026-09-07', 45],
    ]);
  });

  it('heatmap reports completion ratios and null for unscheduled days', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    createHabit(w.ctx, { name: 'b', kind: 'good' });
    createHabit(w.ctx, { name: 'smoke', kind: 'bad' }); // not part of the ratio
    tapHabit(w.ctx, a.id, '2026-09-07');
    const cells = habitHeatmap(w.ctx, 2);
    expect(cells).toEqual([
      { date: '2026-09-06', ratio: null, done: 0, scheduled: 0 },
      { date: '2026-09-07', ratio: 0.5, done: 1, scheduled: 2 },
    ]);
  });

  it('exercise progress tracks max weight and volume per session day', () => {
    const { plan } = createPlan(w.ctx, {
      name: 'A',
      exercises: [{ name: 'Fekvenyomás', targetSets: 2, targetReps: 8, targetWeightKg: 60 }],
    });
    let s = startSession(w.ctx, plan.id);
    updateSet(w.ctx, s.exercises[0].sets[0].id, { weightKg: 60, reps: 8, done: true });
    updateSet(w.ctx, s.exercises[0].sets[1].id, { weightKg: 62.5, reps: 6, done: true });
    finishSession(w.ctx, s.session.id);
    w.advanceDays(2);
    s = startSession(w.ctx, plan.id);
    setExerciseDone(w.ctx, s.session.id, s.exercises[0].exercise.id, true); // prefilled 60×8, 62.5×6
    updateSet(w.ctx, s.exercises[0].sets[1].id, { weightKg: 65, reps: 5 });
    finishSession(w.ctx, s.session.id);
    const [p] = exerciseProgress(w.ctx);
    expect(p.exercise.name).toBe('Fekvenyomás');
    expect(p.points).toEqual([
      { date: '2026-09-07', maxWeight: 62.5, volume: 60 * 8 + 62.5 * 6, sets: 2 },
      { date: '2026-09-09', maxWeight: 65, volume: 60 * 8 + 65 * 5, sets: 2 },
    ]);
    expect(p.bestWeight).toBe(65);
    expect(p.lastWeight).toBe(65);
  });

  it('kcal history uses summaries for closed days and live data for today', () => {
    w.ctx.settings.kcalTarget = 2000;
    const meal = createTemplate(w.ctx, { name: 'm', kcal: 1000 });
    addAdHocMeal(w.ctx, '2026-09-07', meal.id);
    addAdHocMeal(w.ctx, '2026-09-07', meal.id);
    w.advanceDays(1);
    closePendingDays(w.ctx);
    addAdHocMeal(w.ctx, '2026-09-08', meal.id);
    const k = kcalHistory(w.ctx, 3);
    expect(k).toEqual([
      { date: '2026-09-06', eaten: null, target: 2000, hit: null },
      { date: '2026-09-07', eaten: 2000, target: 2000, hit: true },
      { date: '2026-09-08', eaten: 1000, target: 2000, hit: false },
    ]);
  });

  it('overview aggregates totals and streaks', () => {
    const h = createHabit(w.ctx, { name: 'Olvasás', kind: 'good', icon: '📖' });
    tapHabit(w.ctx, h.id, '2026-09-07');
    w.advanceDays(1);
    closePendingDays(w.ctx);
    const o = overview(w.ctx);
    expect(o).toMatchObject({ xp: 35, level: 0, spendable: 35, daysTracked: 1, perfectDays: 1, workouts: 0, redemptions: 0 });
    expect(o.bestStreak).toEqual({ name: 'Olvasás', streak: 1 });
    expect(o.activeStreaks).toEqual([{ name: 'Olvasás', icon: '📖', streak: 1, freezes: 0 }]);
  });
});
