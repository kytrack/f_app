/**
 * Point rules – the single source of truth for every number in the gamification system.
 * Pure TypeScript: no React Native imports allowed in `src/domain`.
 * See docs/SPEC.md §4.1 for the rationale behind each value.
 */

export const POINTS = {
  habitSuccess: 10,
  habitPenalty: 5,
  badHabitCleanDay: 15,
  badHabitRelapseFactor: 2, // relapse = -factor * penalty
  badHabitRelapseDailyCap: 30, // max points lost per habit per day from relapses
  taskByPriority: { 1: 5, 2: 10, 3: 20 } as const,
  taskLateFactor: 0.5,
  taskOverdue: 5,
  workoutComplete: 30,
  kcalGoalHit: 20,
  kcalGoalMissed: 10,
  perfectDay: 25,
} as const;

export const PARTIAL_HABIT_MIN_RATIO = 0.5; // below this no points for partial completion
export const WORKOUT_FULL_RATIO = 0.8; // >= 80% of sets → full points
export const WORKOUT_HALF_RATIO = 0.5; // 50–79% → half points

export type TaskPriority = 1 | 2 | 3;

/** Rounds like a human would (0.5 → 1), never negative. */
export function applyMultiplier(base: number, multiplier: number): number {
  return Math.max(0, Math.round(base * multiplier));
}

/**
 * Points for a good habit on a given day.
 * Full target → base × multiplier. Partial (≥50%) → proportional, floored. Below 50% → 0.
 */
export function habitPoints(input: {
  count: number;
  target: number;
  base?: number;
  multiplier?: number;
}): number {
  const base = input.base ?? POINTS.habitSuccess;
  const multiplier = input.multiplier ?? 1;
  const target = Math.max(1, input.target);
  const ratio = Math.min(1, input.count / target);
  if (ratio >= 1) return applyMultiplier(base, multiplier);
  if (ratio < PARTIAL_HABIT_MIN_RATIO) return 0;
  return Math.floor(base * ratio * multiplier);
}

/** Penalty (positive number) for a relapse; the caller stores it as a negative delta. */
export function relapsePenalty(input: { penalty?: number; alreadyLostToday: number }): number {
  const penalty = (input.penalty ?? POINTS.habitPenalty) * POINTS.badHabitRelapseFactor;
  const room = Math.max(0, POINTS.badHabitRelapseDailyCap - input.alreadyLostToday);
  return Math.min(penalty, room);
}

export function taskPoints(input: {
  priority: TaskPriority;
  override?: number | null;
  late: boolean;
}): number {
  const base = input.override ?? POINTS.taskByPriority[input.priority];
  return input.late ? Math.floor(base * POINTS.taskLateFactor) : base;
}

export function workoutPoints(input: { completionPct: number; base?: number }): number {
  const base = input.base ?? POINTS.workoutComplete;
  const ratio = input.completionPct / 100;
  if (ratio >= WORKOUT_FULL_RATIO) return base;
  if (ratio >= WORKOUT_HALF_RATIO) return Math.floor(base / 2);
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
