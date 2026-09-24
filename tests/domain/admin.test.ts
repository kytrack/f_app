import { beforeEach, describe, expect, it } from 'vitest';
import {
  adminCounts,
  deleteExercise,
  exercisesWithUsage,
  getPointRules,
  getProfile,
  listAllMealTemplates,
  listAllPlans,
  listAllRewards,
  listAllTasks,
  listEvents,
  listRedemptions,
  manualAdjust,
  renameExercise,
  resetPointRules,
  restoreMealTemplate,
  restorePlan,
  restoreReward,
  setFulfilled,
  updatePointRules,
  updateProfile,
  wipeData,
} from '@/src/domain/admin';
import { closeDay } from '@/src/domain/dayClose';
import { createEvent } from '@/src/domain/events';
import { createHabit, getHabit, listAllHabits, recordRelapse, setHabitCount, tapHabit } from '@/src/domain/habits';
import { addAdHocMeal, archiveTemplate, createTemplate } from '@/src/domain/meals';
import { DEFAULT_RULES, parseRules, serializeRules } from '@/src/domain/points/config';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import { archiveReward, createReward, redeemReward } from '@/src/domain/rewards';
import { completeTask, createTask } from '@/src/domain/tasks';
import { archivePlan, createPlan, finishSession, setExerciseDone, startSession } from '@/src/domain/workouts';
import { habits as habitsTable } from '@/src/db/schema';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09';

describe('point rules config', () => {
  it('parses defensively and stores only the diff', () => {
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    expect(parseRules('garbage')).toEqual(DEFAULT_RULES);
    expect(parseRules('{"taskHigh":40,"habitSuccess":-5,"streakTier1Mult":"x"}')).toEqual({ ...DEFAULT_RULES, taskHigh: 40 });
    expect(serializeRules({ ...DEFAULT_RULES })).toBeNull();
    expect(serializeRules({ ...DEFAULT_RULES, perfectDay: 50 })).toBe('{"perfectDay":50}');
  });
});

describe('admin', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  /** Mimics the app: after saving rules the DomainCtx snapshot is rebuilt. */
  const applyRules = (patch: Partial<typeof DEFAULT_RULES>) => {
    w.ctx.settings.rules = updatePointRules(w.ctx, { ...w.ctx.settings.rules, ...patch });
  };

  it('saves, validates and resets rules', () => {
    applyRules({ taskHigh: 40, streakTier1Mult: 2 });
    expect(getPointRules(w.ctx)).toMatchObject({ taskHigh: 40, streakTier1Mult: 2, taskLow: 5 });
    expect(() => updatePointRules(w.ctx, { ...DEFAULT_RULES, taskLow: -1 })).toThrow(/taskLow/);
    expect(() => updatePointRules(w.ctx, { ...DEFAULT_RULES, workoutHalfPct: 90 })).toThrow(/workoutHalfPct/);
    expect(resetPointRules(w.ctx)).toEqual(DEFAULT_RULES);
  });

  it('custom rules drive habits, tasks, relapses and new-item defaults', () => {
    applyRules({ habitSuccess: 12, taskHigh: 40, taskLatePct: 25, badHabitRelapseFactor: 3, badHabitRelapseDailyCap: 20, partialHabitMinPct: 25 });
    const h = createHabit(w.ctx, { name: 'Víz', kind: 'good', targetCount: 8 });
    expect(h.pointsSuccess).toBe(12);
    setHabitCount(w.ctx, h.id, TODAY, 2); // 25% → floor(12 × 0.25) = 3
    expect(balance(w.ctx).raw).toBe(3);
    const late = createTask(w.ctx, { title: 'késő', priority: 3, dueAt: '2026-09-09T08:00:00Z' });
    completeTask(w.ctx, late.id); // 40 × 25% = 10
    expect(balance(w.ctx).raw).toBe(13);
    const smoke = createHabit(w.ctx, { name: 'smoke', kind: 'bad' });
    recordRelapse(w.ctx, smoke.id, TODAY); // 5 × 3 = 15
    recordRelapse(w.ctx, smoke.id, TODAY); // capped at 20
    expect(balance(w.ctx).raw).toBe(13 - 20);
  });

  it('custom rules drive streak multiplier, milestones, freezes, workouts and the day close', () => {
    applyRules({ streakTier1Days: 2, streakTier1Mult: 2, milestone1Days: 1, milestone1Bonus: 7, freezeEvery: 1, maxFreezes: 1, perfectDay: 50, workoutFullPct: 60, workoutComplete: 44 });
    w.setNow('2026-09-08T10:00:00Z');
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, '2026-09-08'); // +10
    const { plan } = createPlan(w.ctx, { name: 'A', exercises: [{ name: 'x', targetSets: 5, targetReps: 5 }, { name: 'y', targetSets: 5, targetReps: 5 }] });
    expect(plan.pointsComplete).toBe(44);
    const s = startSession(w.ctx, plan.id);
    setExerciseDone(w.ctx, s.session.id, s.exercises[0].exercise.id, true);
    finishSession(w.ctx, s.session.id); // 5 of 10 = 50% → half of 44 = 22
    w.advanceDays(1);
    closeDay(w.ctx, '2026-09-08');
    const reasons = recentEntries(w.ctx).map((e) => [e.reason, e.delta]);
    expect(reasons).toContainEqual(['workout_done', 22]);
    expect(reasons).toContainEqual(['streak_milestone', 7]);
    expect(reasons).toContainEqual(['perfect_day', 50]);
    expect(getHabit(w.ctx, h.id)).toMatchObject({ currentStreak: 1, streakFreezesAvailable: 1 });
    w.ctx.db.update(habitsTable).set({ currentStreak: 2 }).run();
    tapHabit(w.ctx, h.id, '2026-09-09');
    expect(recentEntries(w.ctx)[0].delta).toBe(20); // 10 × 2.0 at streak ≥ 2
  });

  it('profile: name, time zone, grace window', () => {
    expect(updateProfile(w.ctx, { displayName: ' Krisz ', timezone: 'Europe/London', editGraceHours: 72 })).toEqual({
      displayName: 'Krisz',
      timezone: 'Europe/London',
      editGraceHours: 72,
    });
    expect(() => updateProfile(w.ctx, { timezone: 'Mars/Olympus' })).toThrow(/time zone/);
    expect(() => updateProfile(w.ctx, { displayName: '  ' })).toThrow(/name/);
    expect(getProfile(w.ctx).displayName).toBe('Krisz');
  });

  it('manual adjustments need a note and land in the ledger', () => {
    manualAdjust(w.ctx, 100, 'bónusz');
    manualAdjust(w.ctx, -30, 'büntetés');
    expect(balance(w.ctx)).toMatchObject({ raw: 70, xp: 100 });
    expect(() => manualAdjust(w.ctx, 0, 'x')).toThrow(/non-zero/);
    expect(() => manualAdjust(w.ctx, 5, ' ')).toThrow(/note/);
  });

  it('lists tasks incl. hidden recurring templates; events newest first', () => {
    const tpl = createTask(w.ctx, { title: 'Vitamin', dueAt: '2026-09-09T06:00:00Z', recurrence: { type: 'daily' } });
    const open = createTask(w.ctx, { title: 'nyitott' });
    const done = createTask(w.ctx, { title: 'kész' });
    completeTask(w.ctx, done.id);
    const all = listAllTasks(w.ctx);
    expect(all.templates.map((t) => t.id)).toEqual([tpl.id]);
    expect(all.open.map((t) => t.title)).toContain('nyitott');
    expect(all.open.some((t) => t.parentTaskId === tpl.id)).toBe(true);
    expect(all.completed.map((t) => t.id)).toEqual([done.id]);
    expect(open.id).toBeTruthy();
    createEvent(w.ctx, { title: 'régi', startAt: '2026-09-01T08:00:00Z' });
    createEvent(w.ctx, { title: 'új', startAt: '2026-09-20T08:00:00Z' });
    expect(listEvents(w.ctx).map((e) => e.title)).toEqual(['új', 'régi']);
  });

  it('rewards: archived listing, restore, redemptions with fulfilment', () => {
    const r = createReward(w.ctx, { name: 'Mozi', cost: 10, icon: '🎬' });
    manualAdjust(w.ctx, 50, 'start');
    const red = redeemReward(w.ctx, r.id);
    archiveReward(w.ctx, r.id);
    expect(listAllRewards(w.ctx)[0].archivedAt).not.toBeNull();
    restoreReward(w.ctx, r.id);
    expect(listAllRewards(w.ctx)[0].archivedAt).toBeNull();
    setFulfilled(w.ctx, red.id, true);
    expect(listRedemptions(w.ctx)[0]).toMatchObject({ rewardName: 'Mozi', rewardIcon: '🎬' });
    expect(listRedemptions(w.ctx)[0].fulfilledAt).not.toBeNull();
    setFulfilled(w.ctx, red.id, false);
    expect(listRedemptions(w.ctx)[0].fulfilledAt).toBeNull();
  });

  it('workouts: archived plans restore; exercises rename, usage-guarded delete', () => {
    const { plan, exercises } = createPlan(w.ctx, { name: 'A', exercises: [{ name: 'Fekvenyomás', targetSets: 3, targetReps: 8 }, { name: 'Evezés', targetSets: 3, targetReps: 8 }] });
    const bench = exercises[0].exercise;
    expect(exercisesWithUsage(w.ctx).find((e) => e.exercise.id === bench.id)?.plans).toEqual(['A']);
    expect(renameExercise(w.ctx, bench.id, 'Fekvenyomás rúddal').name).toBe('Fekvenyomás rúddal');
    expect(() => renameExercise(w.ctx, bench.id, 'evezés')).toThrow(/already exists/);
    expect(() => deleteExercise(w.ctx, bench.id)).toThrow(/használja/);
    archivePlan(w.ctx, plan.id);
    expect(listAllPlans(w.ctx)[0].archivedAt).not.toBeNull();
    deleteExercise(w.ctx, bench.id); // no active plan uses it any more
    expect(exercisesWithUsage(w.ctx).map((e) => e.exercise.name)).toEqual(['Evezés']);
    restorePlan(w.ctx, plan.id);
    expect(listAllPlans(w.ctx)[0].archivedAt).toBeNull();
  });

  it('meals: archived templates are listed and restorable', () => {
    const t = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400 });
    archiveTemplate(w.ctx, t.id);
    expect(listAllMealTemplates(w.ctx)[0].archivedAt).not.toBeNull();
    restoreMealTemplate(w.ctx, t.id);
    expect(listAllMealTemplates(w.ctx)[0].archivedAt).toBeNull();
  });

  it('counts and wipes: points only, then everything', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, TODAY);
    const r = createReward(w.ctx, { name: 'r', cost: 5 });
    redeemReward(w.ctx, r.id);
    tapHabit(w.ctx, h.id, TODAY); // reversal row referencing the original
    createTask(w.ctx, { title: 'tpl', dueAt: '2026-09-09T06:00:00Z', recurrence: { type: 'daily' } });
    createEvent(w.ctx, { title: 'e', startAt: '2026-09-10T08:00:00Z', reminders: [15] });
    const meal = createTemplate(w.ctx, { name: 'm', kcal: 100 });
    addAdHocMeal(w.ctx, TODAY, meal.id);
    const { plan } = createPlan(w.ctx, { name: 'A', exercises: [{ name: 'x', targetSets: 1, targetReps: 1 }] });
    startSession(w.ctx, plan.id);
    expect(adminCounts(w.ctx)).toMatchObject({ habits: 1, taskTemplates: 1, events: 1, rewards: 1, plans: 1, exercises: 1, mealTemplates: 1 });
    expect(adminCounts(w.ctx).ledgerEntries).toBeGreaterThan(0);

    wipeData(w.ctx, 'points');
    expect(balance(w.ctx)).toMatchObject({ raw: 0, xp: 0 });
    expect(listAllHabits(w.ctx)).toHaveLength(1);

    wipeData(w.ctx, 'everything');
    expect(adminCounts(w.ctx)).toEqual({
      habits: 0, habitsArchived: 0, taskTemplates: 0, tasksOpen: 0, events: 0, rewards: 0, plans: 0, exercises: 0, mealTemplates: 0, challenges: 0, focusOpen: 0, ledgerEntries: 0,
    });
    expect(getProfile(w.ctx).timezone).toBe('Europe/Budapest'); // settings survive
  });
});
