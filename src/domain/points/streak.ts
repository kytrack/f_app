/**
 * Streak mechanics – see docs/SPEC.md §4.2.
 * A streak only moves on SCHEDULED days; unscheduled days are transparent.
 */

export const MILESTONES = [
  { days: 7, bonus: 25 },
  { days: 30, bonus: 100 },
  { days: 100, bonus: 500 },
] as const;

export function multiplierFor(streak: number): number {
  if (streak >= 30) return 1.5;
  if (streak >= 7) return 1.25;
  return 1.0;
}

export type DayOutcome = 'done' | 'missed' | 'skipped' | 'relapse' | 'clean';

export interface StreakState {
  current: number;
  best: number;
}

/**
 * Advances the streak for one scheduled day.
 * - done / clean  → +1
 * - missed / relapse → reset to 0 (best is preserved)
 * - skipped → unchanged (declared rest day, e.g. sick)
 */
export function nextStreak(state: StreakState, outcome: DayOutcome): StreakState {
  switch (outcome) {
    case 'done':
    case 'clean': {
      const current = state.current + 1;
      return { current, best: Math.max(state.best, current) };
    }
    case 'missed':
    case 'relapse':
      return { current: 0, best: state.best };
    case 'skipped':
      return { ...state };
  }
}

/** Bonus points earned when a streak *reaches* a milestone (exactly), otherwise 0. */
export function milestoneBonus(streak: number): number {
  return MILESTONES.find((m) => m.days === streak)?.bonus ?? 0;
}
