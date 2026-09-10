/**
 * Workout log: fixed plans, sessions with quick set ticking, points on finish.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  exercises,
  setLogs,
  workoutPlanExercises,
  workoutPlans,
  workoutSessions,
  type Exercise,
  type SetLog,
  type WorkoutPlan,
  type WorkoutPlanExercise,
  type WorkoutSession,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { isBitSet, weekdayIndex, type DayKey } from './dates';
import { assertEditable } from './habits';
import { award, reverseActive } from './points/ledger';
import { POINTS, workoutPoints } from './points/rules';

// ---------------------------------------------------------------- exercises

export function listExercises(ctx: DomainCtx): Exercise[] {
  return ctx.db
    .select()
    .from(exercises)
    .where(and(eq(exercises.userId, ctx.userId), isNull(exercises.deletedAt)))
    .orderBy(asc(exercises.name))
    .all();
}

/** Case-insensitive find-or-create by name, so plan editing is just typing names. */
export function ensureExercise(ctx: DomainCtx, name: string, muscleGroup?: string | null): Exercise {
  const clean = name.trim();
  if (!clean) throw new DomainError('INVALID', 'exercise name required');
  const existing = listExercises(ctx).find((e) => e.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const ts = nowIso(ctx);
  return ctx.db
    .insert(exercises)
    .values({ id: ctx.uuid(), userId: ctx.userId, name: clean, muscleGroup: muscleGroup ?? null, createdAt: ts, updatedAt: ts })
    .returning()
    .get();
}

// ---------------------------------------------------------------- plans

export interface PlanExerciseInput {
  /** Existing exercise id, or a name to find-or-create. */
  exerciseId?: string;
  name?: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg?: number | null;
}

export interface PlanInput {
  name: string;
  weekdayMask?: number;
  pointsComplete?: number;
  exercises: PlanExerciseInput[];
}

export interface PlanDetail {
  plan: WorkoutPlan;
  exercises: (WorkoutPlanExercise & { exercise: Exercise })[];
}

export function getPlan(ctx: DomainCtx, id: string): PlanDetail {
  const plan = ctx.db
    .select()
    .from(workoutPlans)
    .where(and(eq(workoutPlans.id, id), eq(workoutPlans.userId, ctx.userId)))
    .get();
  if (!plan || plan.deletedAt) throw new DomainError('NOT_FOUND', `plan ${id} not found`);
  return { plan, exercises: planExercises(ctx, id) };
}

function planExercises(ctx: DomainCtx, planId: string): PlanDetail['exercises'] {
  const rows = ctx.db
    .select()
    .from(workoutPlanExercises)
    .innerJoin(exercises, eq(exercises.id, workoutPlanExercises.exerciseId))
    .where(eq(workoutPlanExercises.planId, planId))
    .orderBy(asc(workoutPlanExercises.sortOrder))
    .all();
  return rows.map((r) => ({ ...r.workout_plan_exercises, exercise: r.exercises }));
}

function validatePlan(input: Partial<PlanInput>): void {
  if (input.name !== undefined && !input.name.trim()) throw new DomainError('INVALID', 'plan name required');
  if (input.exercises) {
    if (input.exercises.length === 0) throw new DomainError('INVALID', 'a plan needs at least one exercise');
    for (const e of input.exercises) {
      if (!e.exerciseId && !e.name?.trim()) throw new DomainError('INVALID', 'exercise needs a name');
      if (!Number.isInteger(e.targetSets) || e.targetSets < 1 || e.targetSets > 20)
        throw new DomainError('INVALID', 'sets must be 1..20');
      if (!Number.isInteger(e.targetReps) || e.targetReps < 1 || e.targetReps > 500)
        throw new DomainError('INVALID', 'reps must be 1..500');
    }
  }
  if (input.pointsComplete !== undefined && (input.pointsComplete < 0 || input.pointsComplete > 500))
    throw new DomainError('INVALID', 'points must be 0..500');
}

function replacePlanExercises(ctx: DomainCtx, planId: string, list: PlanExerciseInput[]): void {
  ctx.db.delete(workoutPlanExercises).where(eq(workoutPlanExercises.planId, planId)).run();
  list.forEach((e, i) => {
    const exerciseId = e.exerciseId ?? ensureExercise(ctx, e.name!).id;
    ctx.db
      .insert(workoutPlanExercises)
      .values({
        id: ctx.uuid(),
        planId,
        exerciseId,
        sortOrder: i,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeightKg: e.targetWeightKg ?? null,
      })
      .run();
  });
}

export function createPlan(ctx: DomainCtx, input: PlanInput): PlanDetail {
  validatePlan(input);
  const ts = nowIso(ctx);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const plan = tx
      .insert(workoutPlans)
      .values({
        id: c.uuid(),
        userId: c.userId,
        name: input.name.trim(),
        weekdayMask: input.weekdayMask ?? 0,
        pointsComplete: input.pointsComplete ?? POINTS.workoutComplete,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning()
      .get();
    replacePlanExercises(c, plan.id, input.exercises);
    return getPlan(c, plan.id);
  });
}

export function updatePlan(ctx: DomainCtx, id: string, patch: Partial<PlanInput>): PlanDetail {
  getPlan(ctx, id);
  validatePlan(patch);
  const { exercises: list, ...rest } = patch;
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    tx.update(workoutPlans)
      .set({ ...rest, ...(rest.name !== undefined ? { name: rest.name.trim() } : {}), updatedAt: nowIso(c) })
      .where(eq(workoutPlans.id, id))
      .run();
    if (list) replacePlanExercises(c, id, list);
    return getPlan(c, id);
  });
}

export function archivePlan(ctx: DomainCtx, id: string): void {
  getPlan(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(workoutPlans).set({ archivedAt: ts, updatedAt: ts }).where(eq(workoutPlans.id, id)).run();
}

export function listPlans(ctx: DomainCtx): WorkoutPlan[] {
  return ctx.db
    .select()
    .from(workoutPlans)
    .where(and(eq(workoutPlans.userId, ctx.userId), isNull(workoutPlans.archivedAt), isNull(workoutPlans.deletedAt)))
    .orderBy(asc(workoutPlans.sortOrder), asc(workoutPlans.createdAt))
    .all();
}

export const isPlannedOn = (plan: Pick<WorkoutPlan, 'weekdayMask'>, date: DayKey) =>
  isBitSet(plan.weekdayMask, weekdayIndex(date));

// ---------------------------------------------------------------- sessions

export interface SessionDetail {
  session: WorkoutSession;
  plan: WorkoutPlan | null;
  /** Grouped by exercise in plan order (or first-seen order for plan-less sessions). */
  exercises: { exercise: Exercise; target: WorkoutPlanExercise | null; sets: SetLog[] }[];
  doneSets: number;
  totalSets: number;
}

export function getSession(ctx: DomainCtx, id: string): SessionDetail {
  const session = ctx.db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, ctx.userId)))
    .get();
  if (!session) throw new DomainError('NOT_FOUND', `session ${id} not found`);
  const plan = session.planId
    ? (ctx.db.select().from(workoutPlans).where(eq(workoutPlans.id, session.planId)).get() ?? null)
    : null;
  const targets = session.planId ? planExercises(ctx, session.planId) : [];
  const sets = ctx.db
    .select()
    .from(setLogs)
    .where(eq(setLogs.sessionId, id))
    .orderBy(asc(setLogs.setIndex))
    .all();
  const exerciseIds = [...new Set([...targets.map((t) => t.exerciseId), ...sets.map((s) => s.exerciseId)])];
  const exs = exerciseIds.length
    ? ctx.db.select().from(exercises).where(inArray(exercises.id, exerciseIds)).all()
    : [];
  const grouped = exerciseIds.map((eid) => ({
    exercise: exs.find((e) => e.id === eid)!,
    target: targets.find((t) => t.exerciseId === eid) ?? null,
    sets: sets.filter((s) => s.exerciseId === eid),
  }));
  return {
    session,
    plan,
    exercises: grouped,
    doneSets: sets.filter((s) => s.done).length,
    totalSets: sets.length,
  };
}

export function openSessionFor(ctx: DomainCtx, planId: string, date: DayKey): WorkoutSession | undefined {
  return ctx.db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, ctx.userId),
        eq(workoutSessions.planId, planId),
        eq(workoutSessions.date, date),
        isNull(workoutSessions.finishedAt),
      ),
    )
    .get();
}

/** Last finished session's set logs for an exercise – used to prefill weight/reps. */
export function lastSetsFor(ctx: DomainCtx, exerciseId: string): SetLog[] {
  const last = ctx.db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .innerJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, ctx.userId),
        eq(setLogs.exerciseId, exerciseId),
        eq(setLogs.done, true),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1)
    .get();
  if (!last) return [];
  return ctx.db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.sessionId, last.id), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(asc(setLogs.setIndex))
    .all();
}

/**
 * Starts (or resumes) today's session for a plan. Set rows are pre-created from the plan,
 * prefilled with the last performance for that exercise (falling back to the plan target).
 */
export function startSession(ctx: DomainCtx, planId: string, date: DayKey = todayKey(ctx)): SessionDetail {
  const { plan, exercises: targets } = getPlan(ctx, planId);
  const existing = openSessionFor(ctx, planId, date);
  if (existing) return getSession(ctx, existing.id);
  assertEditable(ctx, date);
  const ts = nowIso(ctx);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const session = tx
      .insert(workoutSessions)
      .values({ id: c.uuid(), userId: c.userId, planId: plan.id, date, startedAt: ts, createdAt: ts, updatedAt: ts })
      .returning()
      .get();
    for (const t of targets) {
      const last = lastSetsFor(c, t.exerciseId);
      for (let i = 0; i < t.targetSets; i++) {
        const prev = last[i] ?? last[last.length - 1];
        tx.insert(setLogs)
          .values({
            id: c.uuid(),
            sessionId: session.id,
            exerciseId: t.exerciseId,
            setIndex: i,
            weightKg: prev?.weightKg ?? t.targetWeightKg,
            reps: prev?.reps ?? t.targetReps,
            done: false,
          })
          .run();
      }
    }
    return getSession(c, session.id);
  });
}

function sessionOf(ctx: DomainCtx, setId: string): { set: SetLog; session: WorkoutSession } {
  const set = ctx.db.select().from(setLogs).where(eq(setLogs.id, setId)).get();
  if (!set) throw new DomainError('NOT_FOUND', `set ${setId} not found`);
  const session = ctx.db.select().from(workoutSessions).where(eq(workoutSessions.id, set.sessionId)).get();
  if (!session || session.userId !== ctx.userId) throw new DomainError('NOT_FOUND', 'session not found');
  if (session.finishedAt) throw new DomainError('INVALID', 'session already finished');
  return { set, session };
}

export function updateSet(
  ctx: DomainCtx,
  setId: string,
  patch: { weightKg?: number | null; reps?: number | null; done?: boolean },
): SetLog {
  sessionOf(ctx, setId);
  if (patch.reps !== undefined && patch.reps !== null && (patch.reps < 0 || patch.reps > 500))
    throw new DomainError('INVALID', 'reps out of range');
  if (patch.weightKg !== undefined && patch.weightKg !== null && (patch.weightKg < 0 || patch.weightKg > 1000))
    throw new DomainError('INVALID', 'weight out of range');
  return ctx.db.update(setLogs).set(patch).where(eq(setLogs.id, setId)).returning().get();
}

export function toggleSet(ctx: DomainCtx, setId: string): SetLog {
  const { set } = sessionOf(ctx, setId);
  return ctx.db.update(setLogs).set({ done: !set.done }).where(eq(setLogs.id, setId)).returning().get();
}

/** Marks every set of an exercise done (or undone) in one tap. */
export function setExerciseDone(ctx: DomainCtx, sessionId: string, exerciseId: string, done: boolean): void {
  const detail = getSession(ctx, sessionId);
  if (detail.session.finishedAt) throw new DomainError('INVALID', 'session already finished');
  ctx.db
    .update(setLogs)
    .set({ done })
    .where(and(eq(setLogs.sessionId, sessionId), eq(setLogs.exerciseId, exerciseId)))
    .run();
}

/** Closes the session and pays out by completion. Idempotent. */
export function finishSession(ctx: DomainCtx, sessionId: string): SessionDetail {
  const detail = getSession(ctx, sessionId);
  if (detail.session.finishedAt) return detail;
  const completionPct = detail.totalSets === 0 ? 0 : Math.round((detail.doneSets / detail.totalSets) * 100);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    tx.update(workoutSessions)
      .set({ finishedAt: nowIso(c), completionPct, updatedAt: nowIso(c) })
      .where(eq(workoutSessions.id, sessionId))
      .run();
    award(c, {
      reason: 'workout_done',
      refType: 'workout_session',
      refId: sessionId,
      date: detail.session.date,
      base: workoutPoints({ completionPct, base: detail.plan?.pointsComplete ?? POINTS.workoutComplete }),
      note: `${completionPct}%`,
    });
    return getSession(c, sessionId);
  });
}

/** Reopens a finished session (within the edit window) and takes its points back. */
export function reopenSession(ctx: DomainCtx, sessionId: string): SessionDetail {
  const detail = getSession(ctx, sessionId);
  if (!detail.session.finishedAt) return detail;
  assertEditable(ctx, detail.session.date);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    reverseActive(c, { reason: 'workout_done', refType: 'workout_session', refId: sessionId, date: detail.session.date }, 'újranyitva');
    tx.update(workoutSessions)
      .set({ finishedAt: null, completionPct: null, updatedAt: nowIso(c) })
      .where(eq(workoutSessions.id, sessionId))
      .run();
    return getSession(c, sessionId);
  });
}

export function discardSession(ctx: DomainCtx, sessionId: string): void {
  const detail = getSession(ctx, sessionId);
  if (detail.session.finishedAt) throw new DomainError('INVALID', 'reopen before discarding');
  ctx.db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId)).run(); // sets cascade
}

export function sessionsOn(ctx: DomainCtx, date: DayKey): WorkoutSession[] {
  return ctx.db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, ctx.userId), eq(workoutSessions.date, date)))
    .orderBy(asc(workoutSessions.startedAt))
    .all();
}

export function workoutDoneOn(ctx: DomainCtx, date: DayKey): boolean {
  return sessionsOn(ctx, date).some((s) => s.finishedAt && (s.completionPct ?? 0) >= 50);
}

export interface WorkoutDay {
  date: DayKey;
  planned: (WorkoutPlan & { session: WorkoutSession | null })[];
  others: (WorkoutPlan & { session: WorkoutSession | null })[];
}

export function workoutDay(ctx: DomainCtx, date: DayKey = todayKey(ctx)): WorkoutDay {
  const sessions = sessionsOn(ctx, date);
  const withSession = (p: WorkoutPlan) => ({
    ...p,
    session: sessions.filter((s) => s.planId === p.id).sort((a, b) => (a.finishedAt ? 1 : 0) - (b.finishedAt ? 1 : 0))[0] ?? null,
  });
  const plans = listPlans(ctx);
  return {
    date,
    planned: plans.filter((p) => isPlannedOn(p, date)).map(withSession),
    others: plans.filter((p) => !isPlannedOn(p, date)).map(withSession),
  };
}
