/**
 * User-editable point rules. Stored as JSON in settings.point_rules; anything missing or
 * out of range falls back to the default, so an old or hand-edited value can never break
 * the scoring engine. Pure TypeScript.
 */

export interface PointRules {
  // habits
  habitSuccess: number; // default points for a new good habit
  habitPenalty: number; // default penalty for a new habit
  badHabitCleanDay: number; // default points for a clean day of a new bad habit
  badHabitRelapseFactor: number; // relapse = factor × the habit's penalty
  badHabitRelapseDailyCap: number; // max points lost per habit per day from relapses
  partialHabitMinPct: number; // counted habits pay proportionally from this completion %
  // tasks
  taskLow: number;
  taskMid: number;
  taskHigh: number;
  taskLatePct: number; // % of the points kept when completed after the deadline
  taskOverdue: number; // one-off penalty when a task goes overdue
  // workouts
  workoutComplete: number; // default points for a new plan
  workoutFullPct: number; // >= this % of sets → full points
  workoutHalfPct: number; // >= this % → half points
  // nutrition + day
  mealEaten: number; // points for ticking one PLANNED meal (ad-hoc entries earn nothing)
  perfectDayNeedsKcal: number; // 1 = the perfect-day bonus also needs the kcal goal (on days with meals logged), 0 = habits + tasks only
  kcalGoalHit: number;
  kcalGoalMissed: number;
  perfectDay: number;
  // streaks
  streakTier1Days: number;
  streakTier1Mult: number;
  streakTier2Days: number;
  streakTier2Mult: number;
  milestone1Days: number;
  milestone1Bonus: number;
  milestone2Days: number;
  milestone2Bonus: number;
  milestone3Days: number;
  milestone3Bonus: number;
  freezeEvery: number; // a streak freeze is earned every N streak days (0 = never)
  maxFreezes: number;
}

export const DEFAULT_RULES: PointRules = {
  habitSuccess: 10,
  habitPenalty: 5,
  badHabitCleanDay: 15,
  badHabitRelapseFactor: 2,
  badHabitRelapseDailyCap: 30,
  partialHabitMinPct: 50,
  taskLow: 5,
  taskMid: 10,
  taskHigh: 20,
  taskLatePct: 50,
  taskOverdue: 5,
  workoutComplete: 30,
  workoutFullPct: 80,
  workoutHalfPct: 50,
  mealEaten: 3,
  perfectDayNeedsKcal: 1,
  kcalGoalHit: 20,
  kcalGoalMissed: 10,
  perfectDay: 25,
  streakTier1Days: 7,
  streakTier1Mult: 1.25,
  streakTier2Days: 30,
  streakTier2Mult: 1.5,
  milestone1Days: 7,
  milestone1Bonus: 25,
  milestone2Days: 30,
  milestone2Bonus: 100,
  milestone3Days: 100,
  milestone3Bonus: 500,
  freezeEvery: 30,
  maxFreezes: 2,
};

type Range = { min: number; max: number; integer?: boolean };

/** Allowed range per rule – also drives the admin form's validation messages. */
export const RULE_RANGES: Record<keyof PointRules, Range> = {
  habitSuccess: { min: 0, max: 500, integer: true },
  habitPenalty: { min: 0, max: 500, integer: true },
  badHabitCleanDay: { min: 0, max: 500, integer: true },
  badHabitRelapseFactor: { min: 0, max: 10 },
  badHabitRelapseDailyCap: { min: 0, max: 1000, integer: true },
  partialHabitMinPct: { min: 0, max: 100, integer: true },
  taskLow: { min: 0, max: 500, integer: true },
  taskMid: { min: 0, max: 500, integer: true },
  taskHigh: { min: 0, max: 500, integer: true },
  taskLatePct: { min: 0, max: 100, integer: true },
  taskOverdue: { min: 0, max: 500, integer: true },
  workoutComplete: { min: 0, max: 500, integer: true },
  workoutFullPct: { min: 1, max: 100, integer: true },
  workoutHalfPct: { min: 0, max: 100, integer: true },
  mealEaten: { min: 0, max: 500, integer: true },
  perfectDayNeedsKcal: { min: 0, max: 1, integer: true },
  kcalGoalHit: { min: 0, max: 500, integer: true },
  kcalGoalMissed: { min: 0, max: 500, integer: true },
  perfectDay: { min: 0, max: 500, integer: true },
  streakTier1Days: { min: 1, max: 365, integer: true },
  streakTier1Mult: { min: 1, max: 5 },
  streakTier2Days: { min: 1, max: 1000, integer: true },
  streakTier2Mult: { min: 1, max: 5 },
  milestone1Days: { min: 1, max: 3650, integer: true },
  milestone1Bonus: { min: 0, max: 100_000, integer: true },
  milestone2Days: { min: 1, max: 3650, integer: true },
  milestone2Bonus: { min: 0, max: 100_000, integer: true },
  milestone3Days: { min: 1, max: 3650, integer: true },
  milestone3Bonus: { min: 0, max: 100_000, integer: true },
  freezeEvery: { min: 0, max: 365, integer: true },
  maxFreezes: { min: 0, max: 10, integer: true },
};

export function isValidRule(key: keyof PointRules, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const r = RULE_RANGES[key];
  if (value < r.min || value > r.max) return false;
  return !r.integer || Number.isInteger(value);
}

/** Merges stored JSON over the defaults, dropping anything invalid. Never throws. */
export function parseRules(json: string | null | undefined): PointRules {
  if (!json) return { ...DEFAULT_RULES };
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out = { ...DEFAULT_RULES };
    for (const key of Object.keys(DEFAULT_RULES) as (keyof PointRules)[]) {
      if (isValidRule(key, raw[key])) out[key] = raw[key] as number;
    }
    return out;
  } catch {
    return { ...DEFAULT_RULES };
  }
}

/** Validates a full rule set; returns the offending keys (empty = valid). */
export function invalidRuleKeys(rules: PointRules): (keyof PointRules)[] {
  const bad = (Object.keys(DEFAULT_RULES) as (keyof PointRules)[]).filter((k) => !isValidRule(k, rules[k]));
  if (rules.workoutHalfPct > rules.workoutFullPct) bad.push('workoutHalfPct');
  if (rules.streakTier2Days < rules.streakTier1Days) bad.push('streakTier2Days');
  return bad;
}

/** Stores only what differs from the defaults, so future default changes still apply. */
export function serializeRules(rules: PointRules): string | null {
  const diff: Partial<PointRules> = {};
  for (const key of Object.keys(DEFAULT_RULES) as (keyof PointRules)[]) {
    if (rules[key] !== DEFAULT_RULES[key]) diff[key] = rules[key];
  }
  return Object.keys(diff).length ? JSON.stringify(diff) : null;
}
