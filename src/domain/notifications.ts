/**
 * Notification PLAN – what should be scheduled in the OS for the next few days, derived
 * purely from the database. The Expo-side scheduler diffs this against what the OS holds.
 * Pure TypeScript; fully unit-tested.
 */
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { habits, tasks } from '@/src/db/schema';
import { todayKey, type DomainCtx } from './context';
import { addDaysToKey, calendarKeyFor, dayRange, instantFor, localTime, type DayKey } from './dates';
import { eventsOn } from './events';
import { habitsWithLogs } from './habits';
import { taskDayKey } from './tasks';

export const SUMMARY_TIME = '20:00';
export const TASK_REMINDER_MINUTES = 60;
/** iOS caps pending local notifications at 64; keep headroom. */
export const MAX_SCHEDULED = 60;
export const PLAN_DAYS = 7;

export type NotificationChannel = 'reminders' | 'summary';

export interface PlannedNotification {
  /** Stable identity: the scheduler matches OS entries by this key. */
  key: string;
  fireAt: string; // ISO
  title: string;
  body: string;
  /** Expo Router path to open on tap. */
  url: string;
  channel: NotificationChannel;
}

export function planNotifications(
  ctx: DomainCtx,
  opts: { days?: number; max?: number } = {},
): PlannedNotification[] {
  const tz = ctx.settings.timezone;
  const now = ctx.now();
  const nowMs = now.getTime();
  const days = opts.days ?? PLAN_DAYS;
  const today = todayKey(ctx);
  const calendarToday = calendarKeyFor(now, tz);
  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification) => {
    if (Date.parse(n.fireAt) > nowMs) out.push(n);
  };

  const anyHabits =
    ctx.db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.userId, ctx.userId), isNull(habits.archivedAt), isNull(habits.deletedAt)))
      .limit(1)
      .all().length > 0;

  // --- habits + summary follow the LOGICAL day (04:00 start)
  for (const day of dayRange(today, addDaysToKey(today, days - 1))) {
    const rows = habitsWithLogs(ctx, day);
    let remaining = 0;
    for (const { habit, log } of rows) {
      const settled = log?.status === 'done' || log?.status === 'skipped';
      if (habit.kind === 'good' && !settled) remaining += 1;
      if (!habit.reminderTime || habit.kind !== 'good' || settled) continue;
      const fireAt = instantFor(day, habit.reminderTime, tz);
      const counted = habit.targetCount > 1;
      const left = habit.targetCount - (log?.count ?? 0);
      push({
        key: `habit:${habit.id}:${day}`,
        fireAt: fireAt.toISOString(),
        title: `${habit.icon ? habit.icon + ' ' : ''}${habit.name}`,
        body: counted ? `Ma még ${left} ${habit.unit ?? ''}`.trim() : 'Pipáld ki, ha megvolt!',
        url: '/',
        channel: 'reminders',
      });
    }
    if (anyHabits) {
      push({
        key: `summary:${day}`,
        fireAt: instantFor(day, SUMMARY_TIME, tz).toISOString(),
        title: 'Esti összegző',
        body:
          day === today
            ? remaining === 0
              ? 'Minden szokásod megvan mára. Szép!'
              : `${remaining} szokásod vár még rád ma.`
            : 'Nézd meg, mi maradt mára.',
        url: '/',
        channel: 'summary',
      });
    }
  }

  // --- events + tasks follow the calendar day
  for (const day of dayRange(calendarToday, addDaysToKey(calendarToday, days - 1))) {
    for (const occ of eventsOn(ctx, day)) {
      const startMs = Date.parse(occ.startAt);
      const time = occ.event.allDay ? 'egész nap' : localTime(new Date(occ.startAt), tz);
      for (const r of occ.reminders) {
        push({
          key: `event:${occ.event.id}:${day}:${r.offsetMinutes}`,
          fireAt: new Date(startMs - r.offsetMinutes * 60_000).toISOString(),
          title: occ.event.title,
          body: `${r.offsetMinutes === 0 ? 'Most kezdődik' : time}${occ.event.location ? ' · ' + occ.event.location : ''}`,
          url: `/event/${occ.event.id}`,
          channel: 'reminders',
        });
      }
    }
  }

  const openTasks = ctx.db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, ctx.userId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        isNull(tasks.recurrence),
        isNotNull(tasks.dueAt),
      ),
    )
    .all();
  const horizon = addDaysToKey(calendarToday, days - 1);
  for (const t of openTasks) {
    const day = taskDayKey(ctx, t);
    if (!day || day > horizon) continue;
    push({
      key: `task:${t.id}`,
      fireAt: new Date(Date.parse(t.dueAt!) - TASK_REMINDER_MINUTES * 60_000).toISOString(),
      title: 'Határidő 1 óra múlva',
      body: t.title,
      url: `/task/${t.id}`,
      channel: 'reminders',
    });
  }

  out.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : a.key.localeCompare(b.key)));
  return out.slice(0, opts.max ?? MAX_SCHEDULED);
}
