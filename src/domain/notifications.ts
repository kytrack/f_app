/**
 * Notification PLAN – what should be scheduled in the OS for the next few days, derived
 * purely from the database and the user's notification settings. The Expo-side scheduler
 * diffs this against what the OS holds. Pure TypeScript; fully unit-tested.
 *
 * Kinds (each can be switched off in settings):
 *  - habit reminders at the habit's own time (skipped once done)
 *  - event reminders per offset, task reminders an hour before the deadline
 *  - "nudges": N per day spread over the active window – how much is still open today
 *  - "capture" prompts: M per day – "anything on your mind? put it in the calendar"
 *  - evening summary at summaryTime
 * Nudges, captures and the summary respect the quiet hours; explicit times do not.
 */
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { habits, tasks } from '@/src/db/schema';
import { todayKey, type DomainCtx } from './context';
import { addDaysToKey, calendarKeyFor, dayRange, instantFor, localTime, type DayKey } from './dates';
import { eventsOn } from './events';
import { habitsWithLogs } from './habits';
import { taskDayKey, tasksForDay } from './tasks';

export const TASK_REMINDER_MINUTES = 60;
/** iOS caps pending local notifications at 64; keep headroom. Android has no such cap. */
export const MAX_SCHEDULED_IOS = 60;
export const MAX_SCHEDULED_ANDROID = 200;
export const PLAN_DAYS = 7;
export const MAX_NUDGES_PER_DAY = 8;
export const MAX_CAPTURES_PER_DAY = 6;

export type NotificationChannel = 'reminders' | 'summary' | 'nudges';

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

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** True when a wall-clock minute-of-day falls inside the quiet window (which may wrap midnight). */
export function inQuietHours(minuteOfDay: number, quietFrom: string, quietTo: string): boolean {
  const from = toMinutes(quietFrom);
  const to = toMinutes(quietTo);
  if (from === to) return false;
  return from < to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to;
}

/** N times of day ('HH:MM') spread evenly over the active window (quietTo → quietFrom), never on the edges. */
export function spreadOverActiveWindow(count: number, quietFrom: string, quietTo: string): string[] {
  if (count <= 0) return [];
  const start = toMinutes(quietTo);
  let end = toMinutes(quietFrom);
  if (end <= start) end += 24 * 60;
  const span = end - start;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const minute = Math.round(start + (span * (i + 1)) / (count + 1)) % (24 * 60);
    out.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return out;
}

const CAPTURE_LINES = [
  'Van valami a fejedben? Írd be, beteszem a naptárba vagy a teendők közé.',
  'Mi jár a fejedben? Egy sor, és nem felejted el.',
  'Jegyezzünk fel valamit? Találkozó, határidő, ötlet.',
  'Üres a fejed vagy pörög? Ha pörög, dobd ide.',
];

export function planNotifications(
  ctx: DomainCtx,
  opts: { days?: number; max?: number } = {},
): PlannedNotification[] {
  const s = ctx.settings;
  const tz = s.timezone;
  const now = ctx.now();
  const nowMs = now.getTime();
  const days = opts.days ?? PLAN_DAYS;
  const today = todayKey(ctx);
  const calendarToday = calendarKeyFor(now, tz);
  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification) => {
    if (Date.parse(n.fireAt) > nowMs) out.push(n);
  };
  const quiet = (time: string) => inQuietHours(toMinutes(time), s.quietFrom, s.quietTo);

  const anyHabits =
    ctx.db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.userId, ctx.userId), isNull(habits.archivedAt), isNull(habits.deletedAt)))
      .limit(1)
      .all().length > 0;

  // --- per LOGICAL day: habit reminders, nudges, summary, capture prompts
  const nudgeTimes = spreadOverActiveWindow(Math.min(MAX_NUDGES_PER_DAY, s.nudgesPerDay), s.quietFrom, s.quietTo);
  const captureTimes = spreadOverActiveWindow(Math.min(MAX_CAPTURES_PER_DAY, s.capturesPerDay), s.quietFrom, s.quietTo).map(
    // Offset captures by a third of a slot so they do not collide with nudges.
    (t) => {
      const m = (toMinutes(t) + 20) % (24 * 60);
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    },
  );

  for (const day of dayRange(today, addDaysToKey(today, days - 1))) {
    const rows = habitsWithLogs(ctx, day);
    let remaining = 0;
    for (const { habit, log } of rows) {
      const settled = log?.status === 'done' || log?.status === 'skipped';
      if (habit.kind === 'good' && !settled) remaining += 1;
      if (!s.notifHabits || !habit.reminderTime || habit.kind !== 'good' || settled) continue;
      const counted = habit.targetCount > 1;
      const left = habit.targetCount - (log?.count ?? 0);
      push({
        key: `habit:${habit.id}:${day}`,
        fireAt: instantFor(day, habit.reminderTime, tz).toISOString(),
        title: `${habit.icon ? habit.icon + ' ' : ''}${habit.name}`,
        body: counted ? `Ma még ${left} ${habit.unit ?? ''}`.trim() : 'Pipáld ki, ha megvolt!',
        url: '/',
        channel: 'reminders',
      });
    }
    const openTasksToday = day === today ? tasksForDay(ctx, day) : null;
    const openCount = openTasksToday ? openTasksToday.overdue.length + openTasksToday.due.length : 0;

    if (s.notifNudges && anyHabits) {
      nudgeTimes.forEach((time, i) => {
        const parts: string[] = [];
        if (day === today) {
          if (remaining > 0) parts.push(`${remaining} szokás vár még`);
          if (openCount > 0) parts.push(`${openCount} teendő nyitva`);
          if (parts.length === 0) parts.push('Minden megvan mára. Szép!');
        } else {
          parts.push('Nézz rá a mai listádra.');
        }
        push({
          key: `nudge:${day}:${i}`,
          fireAt: instantFor(day, time, tz).toISOString(),
          title: 'Hol tartasz ma?',
          body: parts.join(' · '),
          url: '/',
          channel: 'nudges',
        });
      });
    }

    if (s.notifCapture) {
      captureTimes.forEach((time, i) => {
        push({
          key: `capture:${day}:${i}`,
          fireAt: instantFor(day, time, tz).toISOString(),
          title: 'Van valami a fejedben?',
          body: CAPTURE_LINES[(i + day.charCodeAt(9)) % CAPTURE_LINES.length],
          url: '/capture',
          channel: 'nudges',
        });
      });
    }

    if (s.notifSummary && anyHabits && !quiet(s.summaryTime)) {
      push({
        key: `summary:${day}`,
        fireAt: instantFor(day, s.summaryTime, tz).toISOString(),
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

  // --- per CALENDAR day: events
  if (s.notifEvents) {
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
  }

  // --- tasks: an hour before the deadline
  if (s.notifTasks) {
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
  }

  out.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : a.key.localeCompare(b.key)));
  return out.slice(0, opts.max ?? MAX_SCHEDULED_IOS);
}

/** Should the in-app "anything on your mind?" sheet open now? */
export function shouldPromptCapture(ctx: DomainCtx, lastPromptAt: string | null): boolean {
  const s = ctx.settings;
  if (!s.notifCapture || s.captureOnOpenHours <= 0) return false;
  const now = ctx.now();
  if (inQuietHours(toMinutes(localTime(now, s.timezone)), s.quietFrom, s.quietTo)) return false;
  if (!lastPromptAt) return true;
  return now.getTime() - Date.parse(lastPromptAt) >= s.captureOnOpenHours * 3_600_000;
}
