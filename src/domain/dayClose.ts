/**
 * Day close – the nightly (well, next-app-open) settlement. See docs/SPEC.md §4.4.
 * Idempotent per date: a daily_summaries row means the day is settled.
 */
import { and, asc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import {
  dailySummaries,
  habitLogs,
  habits,
  tasks,
  users,
  type DailySummary,
  type Habit,
  type HabitLog,
} from '@/src/db/schema';
import { nowIso, todayKey, type DomainCtx } from './context';
import { addDaysToKey, dayKeyFor, dayRange, weekdayIndex, type DayKey } from './dates';
import { scheduledHabitsOn } from './habits';
import { award, penalize, pointsForDay } from './points/ledger';
import { POINTS, evaluateKcal } from './points/rules';
import { dayNutrition, materializeMealLogs } from './meals';
import { workoutDoneOn } from './workouts';
import { milestoneBonus, multiplierFor, nextStreak, type DayOutcome } from './points/streak';
import { materializeRecurringTasks, taskDayKey } from './tasks';

export function isDayClosed(ctx: DomainCtx, date: DayKey): boolean {
  return !!ctx.db
    .select({ date: dailySummaries.date })
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, ctx.userId), eq(dailySummaries.date, date)))
    .get();
}

function getOrCreateLog(ctx: DomainCtx, habitId: string, date: DayKey): HabitLog {
  const existing = ctx.db
    .select()
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
    .get();
  if (existing) return existing;
  const ts = nowIso(ctx);
  return ctx.db
    .insert(habitLogs)
    .values({ id: ctx.uuid(), habitId, date, createdAt: ts, updatedAt: ts })
    .returning()
    .get();
}

function setLogStatus(ctx: DomainCtx, log: HabitLog, status: HabitLog['status']): void {
  if (log.status === status) return;
  ctx.db.update(habitLogs).set({ status, updatedAt: nowIso(ctx) }).where(eq(habitLogs.id, log.id)).run();
}

/** Settles one habit for one scheduled day. Returns whether it counts as done for perfect-day. */
function settleHabit(ctx: DomainCtx, habit: Habit, date: DayKey): 'done' | 'not_done' | 'excluded' {
  const log = getOrCreateLog(ctx, habit.id, date);
  let outcome: DayOutcome | null = null;
  let counted: 'done' | 'not_done' | 'excluded' = 'not_done';

  if (habit.kind === 'good') {
    if (log.status === 'done') {
      outcome = 'done';
      counted = 'done';
    } else if (log.status === 'skipped') {
      outcome = 'skipped';
      counted = 'excluded';
    } else if (habit.scheduleType === 'times_per_week') {
      // Flexible habits are never penalised per day; the quota check runs on Sundays.
      outcome = null;
      counted = 'excluded';
    } else {
      setLogStatus(ctx, log, 'missed');
      penalize(ctx, {
        reason: 'habit_missed',
        refType: 'habit',
        refId: habit.id,
        date,
        base: habit.pointsPenalty,
      });
      outcome = 'missed';
    }
  } else {
    if (log.status === 'relapse') {
      outcome = 'relapse';
    } else {
      setLogStatus(ctx, log, 'done');
      award(ctx, {
        reason: 'bad_habit_clean_day',
        refType: 'habit',
        refId: habit.id,
        date,
        base: habit.pointsSuccess,
        multiplier: multiplierFor(habit.currentStreak),
      });
      outcome = 'clean';
      counted = 'done';
    }
  }

  // Weekly quota for times_per_week habits, checked when the week ends.
  if (habit.scheduleType === 'times_per_week' && weekdayIndex(date) === 6) {
    const weekStart = addDaysToKey(date, -6);
    const done = ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(habitLogs)
      .where(
        and(
          eq(habitLogs.habitId, habit.id),
          eq(habitLogs.status, 'done'),
          sql`${habitLogs.date} >= ${weekStart}`,
          sql`${habitLogs.date} <= ${date}`,
        ),
      )
      .get()?.n ?? 0;
    if (done < (habit.timesPerWeek ?? 1)) {
      penalize(ctx, {
        reason: 'habit_missed',
        refType: 'habit',
        refId: habit.id,
        date,
        base: habit.pointsPenalty,
        note: `heti kvóta ${done}/${habit.timesPerWeek}`,
      });
      outcome = 'missed';
    }
  }

  if (outcome) {
    const streak = nextStreak({ current: habit.currentStreak, best: habit.bestStreak }, outcome);
    const bonus = outcome === 'done' || outcome === 'clean' ? milestoneBonus(streak.current) : 0;
    if (bonus > 0) {
      award(ctx, {
        reason: 'streak_milestone',
        refType: 'habit',
        refId: habit.id,
        date,
        base: bonus,
        note: `${streak.current} nap`,
      });
    }
    ctx.db
      .update(habits)
      .set({
        currentStreak: streak.current,
        bestStreak: streak.best,
        lastSuccessDate: outcome === 'done' || outcome === 'clean' ? date : habit.lastSuccessDate,
        streakStartedOn:
          habit.kind === 'bad' && outcome === 'relapse' ? addDaysToKey(date, 1) : habit.streakStartedOn,
        updatedAt: nowIso(ctx),
      })
      .where(eq(habits.id, habit.id))
      .run();
  }
  return counted;
}

/** Settles `date`. Returns the summary, or null if the day was already closed. */
export function closeDay(ctx: DomainCtx, date: DayKey): DailySummary | null {
  if (date >= todayKey(ctx)) return null; // only past days settle
  if (isDayClosed(ctx, date)) return null;

  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };

    // --- habits
    let habitsScheduled = 0;
    let habitsDone = 0;
    for (const habit of scheduledHabitsOn(c, date)) {
      const r = settleHabit(c, habit, date);
      if (r === 'excluded') continue;
      habitsScheduled += 1;
      if (r === 'done') habitsDone += 1;
    }

    // --- tasks: penalise overdue ones exactly once
    const open = tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, c.userId),
          isNull(tasks.deletedAt),
          isNull(tasks.completedAt),
          isNull(tasks.recurrence),
          isNotNull(tasks.dueAt),
          isNull(tasks.overduePenalizedAt),
        ),
      )
      .all();
    for (const t of open) {
      const due = taskDayKey(c, t);
      if (due !== null && due <= date) {
        penalize(c, { reason: 'task_overdue', refType: 'task', refId: t.id, date, base: POINTS.taskOverdue });
        tx.update(tasks).set({ overduePenalizedAt: nowIso(c) }).where(eq(tasks.id, t.id)).run();
      }
    }
    const allTasks = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, c.userId), isNull(tasks.deletedAt), isNull(tasks.recurrence)))
      .all();
    const dueToday = allTasks.filter((t) => taskDayKey(c, t) === date);
    const tasksDue = dueToday.length;
    const tasksDone = dueToday.filter(
      (t) =>
        t.completedAt &&
        dayKeyFor(new Date(t.completedAt), c.settings.timezone, c.settings.dayStartHour) <= date,
    ).length;

    // --- kcal goal (only when the day has any food logged; under-eating is never penalised)
    const nutrition = dayNutrition(c, date);
    const kcalOutcome = evaluateKcal({ eaten: nutrition.eatenKcal, target: c.settings.kcalTarget, tolerancePct: c.settings.kcalTolerancePct });
    if (kcalOutcome === 'hit') {
      award(c, { reason: 'kcal_goal_hit', refType: 'day', refId: date, date, base: POINTS.kcalGoalHit });
    } else if (kcalOutcome === 'over') {
      penalize(c, { reason: 'kcal_goal_missed', refType: 'day', refId: date, date, base: POINTS.kcalGoalMissed });
    }

    // --- perfect day
    const perfectDay = habitsScheduled > 0 && habitsDone === habitsScheduled && tasksDone === tasksDue;
    if (perfectDay) {
      award(c, { reason: 'perfect_day', refType: 'day', refId: date, date, base: POINTS.perfectDay });
    }

    const pts = pointsForDay(c, date);
    return tx
      .insert(dailySummaries)
      .values({
        userId: c.userId,
        date,
        habitsScheduled,
        habitsDone,
        tasksDue,
        tasksDone,
        workoutDone: workoutDoneOn(c, date),
        kcalTarget: c.settings.kcalTarget,
        kcalEaten: kcalOutcome === 'no_data' ? null : nutrition.eatenKcal,
        kcalGoalHit: kcalOutcome === 'no_data' ? null : kcalOutcome === 'hit',
        pointsEarned: pts.earned,
        pointsLost: pts.lost,
        perfectDay,
        closedAt: nowIso(c),
      })
      .returning()
      .get();
  });
}

/** The install day: every day since then gets a summary row (empty days settle to zeros). */
function installDay(ctx: DomainCtx): DayKey | null {
  const u = ctx.db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, ctx.userId)).get();
  return u ? dayKeyFor(new Date(u.createdAt), ctx.settings.timezone, ctx.settings.dayStartHour) : null;
}

/**
 * Settles every unsettled day up to yesterday, oldest first, then materialises upcoming
 * recurring tasks. Returns the closed dates.
 */
export function closePendingDays(ctx: DomainCtx): DayKey[] {
  const closed = settlePendingDays(ctx);
  materializeRecurringTasks(ctx);
  const today = todayKey(ctx);
  materializeMealLogs(ctx, today);
  materializeMealLogs(ctx, addDaysToKey(today, 1));
  return closed;
}

function settlePendingDays(ctx: DomainCtx): DayKey[] {
  const last = ctx.db
    .select({ date: dailySummaries.date })
    .from(dailySummaries)
    .where(eq(dailySummaries.userId, ctx.userId))
    .orderBy(sql`${dailySummaries.date} desc`)
    .limit(1)
    .get()?.date;
  const from = last ? addDaysToKey(last, 1) : installDay(ctx);
  if (!from) return [];
  const yesterday = addDaysToKey(todayKey(ctx), -1);
  const closed: DayKey[] = [];
  for (const d of dayRange(from, yesterday)) {
    if (closeDay(ctx, d)) closed.push(d);
  }
  return closed;
}
