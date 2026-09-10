import { beforeEach, describe, expect, it } from 'vitest';
import { closePendingDays } from '@/src/domain/dayClose';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import {
  archivePlan,
  createPlan,
  discardSession,
  ensureExercise,
  finishSession,
  getSession,
  listExercises,
  reopenSession,
  setExerciseDone,
  startSession,
  toggleSet,
  updatePlan,
  updateSet,
  workoutDay,
} from '@/src/domain/workouts';
import { dailySummaries } from '@/src/db/schema';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09'; // Wednesday

function planA(w: TestWorld) {
  return createPlan(w.ctx, {
    name: 'A nap',
    weekdayMask: 0b0000101, // Mon + Wed
    exercises: [
      { name: 'Fekvenyomás', targetSets: 3, targetReps: 8, targetWeightKg: 60 },
      { name: 'Guggolás', targetSets: 2, targetReps: 10, targetWeightKg: 80 },
    ],
  });
}

describe('workouts', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  it('creates a plan, deduplicating exercises by name', () => {
    const p = planA(w);
    expect(p.exercises.map((e) => e.exercise.name)).toEqual(['Fekvenyomás', 'Guggolás']);
    ensureExercise(w.ctx, ' fekvenyomás ');
    expect(listExercises(w.ctx)).toHaveLength(2);
    expect(() => createPlan(w.ctx, { name: 'x', exercises: [] })).toThrow(/at least one/);
    expect(() => createPlan(w.ctx, { name: 'x', exercises: [{ name: 'a', targetSets: 0, targetReps: 5 }] })).toThrow(/sets/);
  });

  it('shows planned vs other plans for the day', () => {
    planA(w);
    createPlan(w.ctx, { name: 'B nap', weekdayMask: 0b0000010, exercises: [{ name: 'Húzódzkodás', targetSets: 3, targetReps: 6 }] });
    const day = workoutDay(w.ctx, TODAY);
    expect(day.planned.map((p) => p.name)).toEqual(['A nap']);
    expect(day.others.map((p) => p.name)).toEqual(['B nap']);
  });

  it('starts a session with prefilled sets, ticks them, pays on finish', () => {
    const { plan } = planA(w);
    const s = startSession(w.ctx, plan.id);
    expect(s.totalSets).toBe(5);
    expect(s.exercises[0].sets.map((x) => [x.weightKg, x.reps])).toEqual([[60, 8], [60, 8], [60, 8]]);
    expect(startSession(w.ctx, plan.id).session.id).toBe(s.session.id); // resumes
    expect(workoutDay(w.ctx, TODAY).planned[0].session?.id).toBe(s.session.id);

    for (const set of s.exercises[0].sets) toggleSet(w.ctx, set.id);
    updateSet(w.ctx, s.exercises[1].sets[0].id, { weightKg: 85, reps: 8, done: true });
    const finished = finishSession(w.ctx, s.session.id);
    expect(finished.session.completionPct).toBe(80); // 4 of 5
    expect(balance(w.ctx).raw).toBe(30);
    expect(finishSession(w.ctx, s.session.id).session.completionPct).toBe(80); // idempotent
    expect(balance(w.ctx).raw).toBe(30);
    expect(() => toggleSet(w.ctx, s.exercises[0].sets[0].id)).toThrow(/finished/);
  });

  it('half points between 50–79%, none below 50%', () => {
    const { plan } = planA(w);
    const s = startSession(w.ctx, plan.id);
    setExerciseDone(w.ctx, s.session.id, s.exercises[0].exercise.id, true); // 3 of 5 = 60%
    expect(finishSession(w.ctx, s.session.id).session.completionPct).toBe(60);
    expect(balance(w.ctx).raw).toBe(15);
    w.advanceDays(1);
    const s2 = startSession(w.ctx, plan.id);
    toggleSet(w.ctx, s2.exercises[0].sets[0].id); // 1 of 5
    finishSession(w.ctx, s2.session.id);
    expect(balance(w.ctx).raw).toBe(15);
  });

  it('prefills the next session from the last finished performance', () => {
    const { plan } = planA(w);
    const s = startSession(w.ctx, plan.id);
    updateSet(w.ctx, s.exercises[0].sets[0].id, { weightKg: 62.5, reps: 8, done: true });
    updateSet(w.ctx, s.exercises[0].sets[1].id, { weightKg: 62.5, reps: 7, done: true });
    updateSet(w.ctx, s.exercises[0].sets[2].id, { weightKg: 62.5, reps: 6, done: true });
    finishSession(w.ctx, s.session.id);
    w.advanceDays(2);
    const next = startSession(w.ctx, plan.id);
    expect(next.exercises[0].sets.map((x) => [x.weightKg, x.reps])).toEqual([[62.5, 8], [62.5, 7], [62.5, 6]]);
    expect(next.exercises[1].sets[0].weightKg).toBe(80); // never done → plan target
  });

  it('reopen takes the points back, discard removes an open session', () => {
    const { plan } = planA(w);
    const s = startSession(w.ctx, plan.id);
    setExerciseDone(w.ctx, s.session.id, s.exercises[0].exercise.id, true);
    setExerciseDone(w.ctx, s.session.id, s.exercises[1].exercise.id, true);
    finishSession(w.ctx, s.session.id);
    expect(balance(w.ctx).raw).toBe(30);
    reopenSession(w.ctx, s.session.id);
    expect(balance(w.ctx).raw).toBe(0);
    expect(recentEntries(w.ctx)).toHaveLength(2);
    discardSession(w.ctx, s.session.id);
    expect(() => getSession(w.ctx, s.session.id)).toThrow(/not found/);
  });

  it('updating a plan replaces exercises; archiving hides it', () => {
    const { plan } = planA(w);
    const upd = updatePlan(w.ctx, plan.id, { exercises: [{ name: 'Evezés', targetSets: 4, targetReps: 12 }] });
    expect(upd.exercises.map((e) => e.exercise.name)).toEqual(['Evezés']);
    archivePlan(w.ctx, plan.id);
    expect(workoutDay(w.ctx, TODAY).planned).toEqual([]);
  });

  it('day close records workout_done', () => {
    const { plan } = planA(w);
    const s = startSession(w.ctx, plan.id);
    setExerciseDone(w.ctx, s.session.id, s.exercises[0].exercise.id, true);
    finishSession(w.ctx, s.session.id); // 60%
    w.advanceDays(1);
    closePendingDays(w.ctx);
    const summary = w.ctx.db.select().from(dailySummaries).get();
    expect(summary?.workoutDone).toBe(true);
  });
});
