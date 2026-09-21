/**
 * Streak mechanics – see docs/SPEC.md §4.2. Thresholds come from PointRules (user-editable).
 * A streak only moves on SCHEDULED days; unscheduled days are transparent.
 */
import { DEFAULT_RULES, type PointRules } from './config';

/** Defaults under their historical names (kept for tests and docs). */
export const FREEZE_EVERY = DEFAULT_RULES.freezeEvery;
export const MAX_FREEZES = DEFAULT_RULES.maxFreezes;

export function milestones(rules: PointRules = DEFAULT_RULES): { days: number; bonus: number }[] {
  return [
    { days: rules.milestone1Days, bonus: rules.milestone1Bonus },
    { days: rules.milestone2Days, bonus: rules.milestone2Bonus },
    { days: rules.milestone3Days, bonus: rules.milestone3Bonus },
  ];
}

export const MILESTONES = milestones();

export function multiplierFor(streak: number, rules: PointRules = DEFAULT_RULES): number {
  if (streak >= rules.streakTier2Days) return rules.streakTier2Mult;
  if (streak >= rules.streakTier1Days) return rules.streakTier1Mult;
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

/** Freezes to add when a streak reaches `streak` (1 at every freezeEvery-th day; 0 disables). */
export function freezeEarned(streak: number, rules: PointRules = DEFAULT_RULES): number {
  return rules.freezeEvery > 0 && streak > 0 && streak % rules.freezeEvery === 0 ? 1 : 0;
}

/** Bonus points earned when a streak *reaches* a milestone (exactly), otherwise 0. */
export function milestoneBonus(streak: number, rules: PointRules = DEFAULT_RULES): number {
  return milestones(rules)
    .filter((m) => m.days === streak)
    .reduce((a, m) => a + m.bonus, 0);
}
