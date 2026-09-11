/**
 * Read-only aggregations for the statistics screen. Closed days come from
 * daily_summaries; today is computed live. Pure TypeScript.
 */
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  dailySummaries,
  exercises,
  habits,
  rewardRedemptions,
  setLogs,
  workoutSessions,
  type Exercise,
} from '@/src/db/schema';
import { todayKey, type DomainCtx } from './context';
import { addDaysToKey, dayRange, weekdayIndex, type DayKey } from './dates';
import { habitsWithLogs } from './habits';
import { dayNutrition } from './meals';
import { balance, levelProgress, pointsForDay } from './points/ledger';

export interface DayPoints {
  date: DayKey;
  earned: number;
  lost: number;
  net: number;
  perfect: boolean;
  closed: boolean;
}

/** Last `days` days ending today (today live, earlier from summaries). */
export function pointsHistory(ctx: DomainCtx, days = 28): DayPoints[] {
  const today = todayKey(ctx);
  const from = addDaysToKey(today, -(days - 1));
  const rows = ctx.db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, ctx.userId), gte(dailySummaries.date, from)))
    .all();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dayRange(from, today).map((date) => {
    const s = byDate.get(date);
    if (s) return { date, earned: s.pointsEarned, lost: s.pointsLost, net: s.pointsEarned - s.pointsLost, perfect: s.perfectDay, closed: true };
    const live = pointsForDay(ctx, date);
    return { date, ...live, perfect: false, closed: false };
  });
}

export interface WeekPoints {
  weekStart: DayKey;
  net: number;
  earned: number;
  lost: number;
}

/** Net points per ISO week (Monday start) for the last `weeks` weeks, oldest first. */
export function weeklyPoints(ctx: DomainCtx, weeks = 8): WeekPoints[] {
  const today = todayKey(ctx);
  const thisMonday = addDaysToKey(today, -weekdayIndex(today));
  const from = addDaysToKey(thisMonday, -7 * (weeks - 1));
  const days = pointsHistory(ctx, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000) + 1);
  const out: WeekPoints[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDaysToKey(from, 7 * i);
    const weekEnd = addDaysToKey(weekStart, 6);
    const slice = days.filter((d) => d.date >= weekStart && d.date <= weekEnd);
    out.push({
      weekStart,
      net: slice.reduce((a, d) => a + d.net, 0),
      earned: slice.reduce((a, d) => a + d.earned, 0),
      lost: slice.reduce((a, d) => a + d.lost, 0),
    });
  }
  return out;
}

export interface HeatCell {
  date: DayKey;
  /** done / scheduled for good habits; null when nothing was scheduled. */
  ratio: number | null;
  done: number;
  scheduled: number;
}

/** GitHub-style completion grid for the last `days` days (oldest first). */
export function habitHeatmap(ctx: DomainCtx, days = 84): HeatCell[] {
  const today = todayKey(ctx);
  return dayRange(addDaysToKey(today, -(days - 1)), today).map((date) => {
    const rows = habitsWithLogs(ctx, date).filter(
      ({ habit, log }) => habit.kind === 'good' && log?.status !== 'skipped',
    );
    const scheduled = rows.length;
    const done = rows.filter(({ log }) => log?.status === 'done').length;
    return { date, ratio: scheduled ? done / scheduled : null, done, scheduled };
  });
}

export interface ExercisePoint {
  date: DayKey;
  maxWeight: number | null;
  /** Σ weight × reps over done sets. */
  volume: number;
  sets: number;
}

export interface ExerciseProgress {
  exercise: Exercise;
  points: ExercisePoint[];
  bestWeight: number | null;
  lastWeight: number | null;
}

/** Per exercise, one point per finished session day. */
export function exerciseProgress(ctx: DomainCtx, days = 90): ExerciseProgress[] {
  const from = addDaysToKey(todayKey(ctx), -days);
  const rows = ctx.db
    .select({
      date: workoutSessions.date,
      exerciseId: setLogs.exerciseId,
      weight: setLogs.weightKg,
      reps: setLogs.reps,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, ctx.userId),
        sql`${workoutSessions.finishedAt} IS NOT NULL`,
        gte(workoutSessions.date, from),
        eq(setLogs.done, true),
      ),
    )
    .orderBy(asc(workoutSessions.date))
    .all();
  const exs = ctx.db
    .select()
    .from(exercises)
    .where(and(eq(exercises.userId, ctx.userId), isNull(exercises.deletedAt)))
    .orderBy(asc(exercises.name))
    .all();
  return exs
    .map((exercise) => {
      const mine = rows.filter((r) => r.exerciseId === exercise.id);
      const byDate = new Map<DayKey, ExercisePoint>();
      for (const r of mine) {
        const p = byDate.get(r.date) ?? { date: r.date, maxWeight: null, volume: 0, sets: 0 };
        if (r.weight !== null) p.maxWeight = Math.max(p.maxWeight ?? 0, r.weight);
        p.volume += (r.weight ?? 0) * (r.reps ?? 0);
        p.sets += 1;
        byDate.set(r.date, p);
      }
      const points = [...byDate.values()];
      const weights = points.map((p) => p.maxWeight).filter((w): w is number => w !== null);
      return {
        exercise,
        points,
        bestWeight: weights.length ? Math.max(...weights) : null,
        lastWeight: points.length ? points[points.length - 1].maxWeight : null,
      };
    })
    .filter((e) => e.points.length > 0);
}

export interface KcalDay {
  date: DayKey;
  eaten: number | null;
  target: number | null;
  hit: boolean | null;
}

export function kcalHistory(ctx: DomainCtx, days = 28): KcalDay[] {
  const today = todayKey(ctx);
  const from = addDaysToKey(today, -(days - 1));
  const rows = ctx.db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, ctx.userId), gte(dailySummaries.date, from)))
    .all();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dayRange(from, today).map((date) => {
    const s = byDate.get(date);
    if (s) return { date, eaten: s.kcalEaten, target: s.kcalTarget, hit: s.kcalGoalHit };
    const n = dayNutrition(ctx, date);
    return { date, eaten: n.outcome === 'no_data' ? null : n.eatenKcal, target: n.target, hit: n.outcome === 'no_data' ? null : n.outcome === 'hit' };
  });
}

export interface Overview {
  xp: number;
  level: number;
  levelProgress: number;
  spendable: number;
  daysTracked: number;
  perfectDays: number;
  workouts: number;
  redemptions: number;
  bestStreak: { name: string; streak: number } | null;
  activeStreaks: { name: string; icon: string | null; streak: number; freezes: number }[];
}

export function overview(ctx: DomainCtx): Overview {
  const b = balance(ctx);
  const summaries = ctx.db
    .select({
      n: sql<number>`count(*)`,
      perfect: sql<number>`coalesce(sum(case when ${dailySummaries.perfectDay} then 1 else 0 end), 0)`,
    })
    .from(dailySummaries)
    .where(eq(dailySummaries.userId, ctx.userId))
    .get();
  const workouts =
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, ctx.userId), sql`${workoutSessions.finishedAt} IS NOT NULL`))
      .get()?.n ?? 0;
  const redemptions =
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(rewardRedemptions)
      .get()?.n ?? 0;
  const hs = ctx.db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), isNull(habits.deletedAt)))
    .orderBy(desc(habits.currentStreak))
    .all();
  const best = hs.reduce<{ name: string; streak: number } | null>(
    (acc, h) => (h.bestStreak > (acc?.streak ?? 0) ? { name: h.name, streak: h.bestStreak } : acc),
    null,
  );
  return {
    xp: b.xp,
    level: b.level,
    levelProgress: levelProgress(b.xp).progress,
    spendable: b.spendable,
    daysTracked: summaries?.n ?? 0,
    perfectDays: summaries?.perfect ?? 0,
    workouts,
    redemptions,
    bestStreak: best,
    activeStreaks: hs
      .filter((h) => !h.archivedAt && h.currentStreak > 0)
      .map((h) => ({ name: h.name, icon: h.icon, streak: h.currentStreak, freezes: h.streakFreezesAvailable })),
  };
}
