/**
 * Point formulas. Every number comes from a PointRules object (user-editable, see config.ts);
 * each function defaults to DEFAULT_RULES so pure callers and tests stay simple.
 * Pure TypeScript: no React Native imports allowed in `src/domain`.
 * See docs/SPEC.md §4.1 for the rationale behind the default values.
 */
import { DEFAULT_RULES, type PointRules } from './config';

/** The default values under their historical names (kept for tests and docs). */
export const POINTS = {
  habitSuccess: DEFAULT_RULES.habitSuccess,
  habitPenalty: DEFAULT_RULES.habitPenalty,
  badHabitCleanDay: DEFAULT_RULES.badHabitCleanDay,
  badHabitRelapseFactor: DEFAULT_RULES.badHabitRelapseFactor,
  badHabitRelapseDailyCap: DEFAULT_RULES.badHabitRelapseDailyCap,
  taskByPriority: { 1: DEFAULT_RULES.taskLow, 2: DEFAULT_RULES.taskMid, 3: DEFAULT_RULES.taskHigh } as const,
  taskLateFactor: DEFAULT_RULES.taskLatePct / 100,
  taskOverdue: DEFAULT_RULES.taskOverdue,
  workoutComplete: DEFAULT_RULES.workoutComplete,
  kcalGoalHit: DEFAULT_RULES.kcalGoalHit,
  kcalGoalMissed: DEFAULT_RULES.kcalGoalMissed,
  perfectDay: DEFAULT_RULES.perfectDay,
} as const;

export type TaskPriority = 1 | 2 | 3;

/** Rounds like a human would (0.5 → 1), never negative. */
export function applyMultiplier(base: number, multiplier: number): number {
  return Math.max(0, Math.round(base * multiplier));
}

/**
 * Points for a good habit on a given day.
 * Full target → base × multiplier. Partial (≥ partialHabitMinPct) → proportional, floored. Below → 0.
 */
export function habitPoints(
  input: { count: number; target: number; base?: number; multiplier?: number },
  rules: PointRules = DEFAULT_RULES,
): number {
  const base = input.base ?? rules.habitSuccess;
  const multiplier = input.multiplier ?? 1;
  const target = Math.max(1, input.target);
  const ratio = Math.min(1, input.count / target);
  if (ratio >= 1) return applyMultiplier(base, multiplier);
  if (input.count <= 0 || ratio < rules.partialHabitMinPct / 100) return 0;
  return Math.floor(base * ratio * multiplier);
}

/** Total penalty (positive number) for `count` relapses on one day, capped. */
export function relapseTotal(count: number, habitPenalty: number, rules: PointRules = DEFAULT_RULES): number {
  return Math.min(Math.round(count * habitPenalty * rules.badHabitRelapseFactor), rules.badHabitRelapseDailyCap);
}

/** Penalty (positive number) for one more relapse; the caller stores it as a negative delta. */
export function relapsePenalty(
  input: { penalty?: number; alreadyLostToday: number },
  rules: PointRules = DEFAULT_RULES,
): number {
  const penalty = Math.round((input.penalty ?? rules.habitPenalty) * rules.badHabitRelapseFactor);
  const room = Math.max(0, rules.badHabitRelapseDailyCap - input.alreadyLostToday);
  return Math.min(penalty, room);
}

export function taskBasePoints(priority: TaskPriority, rules: PointRules = DEFAULT_RULES): number {
  return priority === 1 ? rules.taskLow : priority === 3 ? rules.taskHigh : rules.taskMid;
}

export function taskPoints(
  input: { priority: TaskPriority; override?: number | null; late: boolean },
  rules: PointRules = DEFAULT_RULES,
): number {
  const base = input.override ?? taskBasePoints(input.priority, rules);
  return input.late ? Math.floor((base * rules.taskLatePct) / 100) : base;
}

export function workoutPoints(
  input: { completionPct: number; base?: number },
  rules: PointRules = DEFAULT_RULES,
): number {
  const base = input.base ?? rules.workoutComplete;
  if (input.completionPct >= rules.workoutFullPct) return base;
  if (input.completionPct >= rules.workoutHalfPct) return Math.floor(base / 2);
  return 0;
}

export type KcalOutcome = 'hit' | 'over' | 'under' | 'no_data';

/** Under-eating is never penalised (we do not want to reward starving). */
export function evaluateKcal(input: {
  eaten: number;
  target: number | null;
  tolerancePct: number;
}): KcalOutcome {
  if (!input.target || input.eaten <= 0) return 'no_data';
  const tol = (input.target * input.tolerancePct) / 100;
  if (Math.abs(input.eaten - input.target) <= tol) return 'hit';
  return input.eaten > input.target ? 'over' : 'under';
}
