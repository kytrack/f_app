/**
 * Calendar events: single or recurring, with reminder offsets. No points involved.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { eventReminders, events, type Event, type EventReminder } from '@/src/db/schema';
import { DomainError, nowIso, type DomainCtx } from './context';
import { calendarKeyFor, dayRange, instantFor, localTime, type DayKey } from './dates';
import { occursOn, parseRecurrence, serializeRecurrence, type Recurrence } from './recurrence';
import { tasksForDay, type DayTasks } from './tasks';

export interface EventInput {
  title: string;
  notes?: string | null;
  location?: string | null;
  startAt: string; // ISO
  endAt?: string | null;
  allDay?: boolean;
  recurrence?: Recurrence | null;
  color?: string | null;
  /** Reminder offsets in minutes before start (0 = at start). */
  reminders?: number[];
}

export interface EventWithReminders {
  event: Event;
  reminders: EventReminder[];
}

/** One concrete occurrence of an event on a calendar day. */
export interface EventOccurrence {
  event: Event;
  day: DayKey;
  startAt: string;
  endAt: string | null;
  reminders: EventReminder[];
}

export function getEvent(ctx: DomainCtx, id: string): EventWithReminders {
  const event = ctx.db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.userId, ctx.userId)))
    .get();
  if (!event || event.deletedAt) throw new DomainError('NOT_FOUND', `event ${id} not found`);
  const reminders = ctx.db.select().from(eventReminders).where(eq(eventReminders.eventId, id)).all();
  return { event, reminders };
}

function validate(input: Partial<EventInput>): void {
  if (input.title !== undefined && !input.title.trim()) throw new DomainError('INVALID', 'title required');
  if (input.startAt !== undefined && Number.isNaN(Date.parse(input.startAt)))
    throw new DomainError('INVALID', 'invalid start');
  if (input.endAt && input.startAt && Date.parse(input.endAt) < Date.parse(input.startAt))
    throw new DomainError('INVALID', 'end before start');
  if (input.reminders?.some((m) => !Number.isInteger(m) || m < 0)) throw new DomainError('INVALID', 'bad reminder');
}

function replaceReminders(ctx: DomainCtx, eventId: string, offsets: number[]): void {
  ctx.db.delete(eventReminders).where(eq(eventReminders.eventId, eventId)).run();
  const unique = [...new Set(offsets)].sort((a, b) => a - b);
  for (const offsetMinutes of unique) {
    ctx.db.insert(eventReminders).values({ id: ctx.uuid(), eventId, offsetMinutes }).run();
  }
}

export function createEvent(ctx: DomainCtx, input: EventInput): EventWithReminders {
  validate(input);
  const ts = nowIso(ctx);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const event = tx
      .insert(events)
      .values({
        id: c.uuid(),
        userId: c.userId,
        title: input.title.trim(),
        notes: input.notes ?? null,
        location: input.location ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        allDay: input.allDay ?? false,
        recurrence: serializeRecurrence(input.recurrence ?? null),
        color: input.color ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning()
      .get();
    replaceReminders(c, event.id, input.reminders ?? []);
    return getEvent(c, event.id);
  });
}

export function updateEvent(ctx: DomainCtx, id: string, patch: Partial<EventInput>): EventWithReminders {
  const { event } = getEvent(ctx, id);
  validate({ ...patch, startAt: patch.startAt ?? event.startAt, endAt: patch.endAt ?? event.endAt });
  const { reminders, recurrence, ...rest } = patch;
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    tx.update(events)
      .set({
        ...rest,
        ...(rest.title !== undefined ? { title: rest.title.trim() } : {}),
        ...(recurrence !== undefined ? { recurrence: serializeRecurrence(recurrence) } : {}),
        updatedAt: nowIso(c),
      })
      .where(eq(events.id, id))
      .run();
    if (reminders) replaceReminders(c, id, reminders);
    return getEvent(c, id);
  });
}

export function deleteEvent(ctx: DomainCtx, id: string): void {
  getEvent(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(events).set({ deletedAt: ts, updatedAt: ts }).where(eq(events.id, id)).run();
}

function activeEvents(ctx: DomainCtx): EventWithReminders[] {
  const list = ctx.db
    .select()
    .from(events)
    .where(and(eq(events.userId, ctx.userId), isNull(events.deletedAt)))
    .orderBy(asc(events.startAt))
    .all();
  if (list.length === 0) return [];
  const rems = ctx.db
    .select()
    .from(eventReminders)
    .where(
      inArray(
        eventReminders.eventId,
        list.map((e) => e.id),
      ),
    )
    .all();
  return list.map((event) => ({ event, reminders: rems.filter((r) => r.eventId === event.id) }));
}

/** Occurrences on a CALENDAR day (events follow the wall clock, not the 04:00 logical day). */
export function eventsOn(ctx: DomainCtx, day: DayKey): EventOccurrence[] {
  const tz = ctx.settings.timezone;
  const out: EventOccurrence[] = [];
  for (const { event, reminders } of activeEvents(ctx)) {
    const startDay = calendarKeyFor(new Date(event.startAt), tz);
    const rule = parseRecurrence(event.recurrence);
    if (!rule) {
      const endDay = event.endAt ? calendarKeyFor(new Date(event.endAt), tz) : startDay;
      if (startDay <= day && day <= endDay) {
        out.push({ event, day, startAt: event.startAt, endAt: event.endAt, reminders });
      }
      continue;
    }
    // Recurring: same local start time on every occurrence day.
    if (!occursOn(rule, startDay, day)) continue;
    const startAt = instantFor(day, localTime(new Date(event.startAt), tz), tz);
    const duration = event.endAt ? Date.parse(event.endAt) - Date.parse(event.startAt) : 0;
    out.push({
      event,
      day,
      startAt: startAt.toISOString(),
      endAt: event.endAt ? new Date(startAt.getTime() + duration).toISOString() : null,
      reminders,
    });
  }
  return out.sort((a, b) => {
    if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
    return a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0;
  });
}

export interface Agenda {
  day: DayKey;
  events: EventOccurrence[];
  tasks: DayTasks;
}

export function agendaFor(ctx: DomainCtx, day: DayKey): Agenda {
  return { day, events: eventsOn(ctx, day), tasks: tasksForDay(ctx, day) };
}

/** Days in [from, to] that have at least one event or task – for the week strip dots. */
export function busyDays(ctx: DomainCtx, from: DayKey, to: DayKey): Set<DayKey> {
  const busy = new Set<DayKey>();
  for (const day of dayRange(from, to)) {
    const a = agendaFor(ctx, day);
    if (a.events.length || a.tasks.due.length || a.tasks.completed.length) busy.add(day);
  }
  return busy;
}
