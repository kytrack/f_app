import { beforeEach, describe, expect, it } from 'vitest';
import { agendaFor, busyDays, createEvent, deleteEvent, eventsOn, getEvent, updateEvent } from '@/src/domain/events';
import { createTask } from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('events', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z'); // Wednesday
  });

  it('creates with reminders and lists on its calendar day', () => {
    const { event, reminders } = createEvent(w.ctx, {
      title: 'Fogorvos',
      startAt: '2026-09-10T07:30:00Z', // 09:30 CEST
      endAt: '2026-09-10T08:00:00Z',
      location: 'Klinika',
      reminders: [60, 15, 60],
    });
    expect(reminders.map((r) => r.offsetMinutes)).toEqual([15, 60]); // deduped, sorted
    expect(eventsOn(w.ctx, '2026-09-10').map((o) => o.event.id)).toEqual([event.id]);
    expect(eventsOn(w.ctx, '2026-09-09')).toEqual([]);
  });

  it('a late-night event belongs to its calendar day, not the logical day', () => {
    // 2026-09-10 01:00 CEST = 2026-09-09T23:00Z → logical day 09-09, calendar day 09-10
    const { event } = createEvent(w.ctx, { title: 'Éjjel', startAt: '2026-09-09T23:00:00Z' });
    expect(eventsOn(w.ctx, '2026-09-10').map((o) => o.event.id)).toEqual([event.id]);
    expect(eventsOn(w.ctx, '2026-09-09')).toEqual([]);
  });

  it('multi-day events appear on every day they span', () => {
    const { event } = createEvent(w.ctx, {
      title: 'Kirándulás',
      startAt: '2026-09-11T22:00:00Z',
      endAt: '2026-09-13T22:00:00Z',
      allDay: true,
    });
    expect(eventsOn(w.ctx, '2026-09-12').map((o) => o.event.id)).toEqual([event.id]);
    expect(eventsOn(w.ctx, '2026-09-14').map((o) => o.event.id)).toEqual([event.id]); // ends 00:00 on the 14th
    expect(eventsOn(w.ctx, '2026-09-15')).toEqual([]);
  });

  it('weekly recurring events keep their local start time', () => {
    const { event } = createEvent(w.ctx, {
      title: 'Edzés',
      startAt: '2026-09-07T16:00:00Z', // Monday 18:00 CEST
      endAt: '2026-09-07T17:00:00Z',
      recurrence: { type: 'weekly', weekdayMask: 0b0000101 }, // Mon + Wed
      reminders: [30],
    });
    const wed = eventsOn(w.ctx, '2026-09-09');
    expect(wed).toHaveLength(1);
    expect(wed[0].startAt).toBe('2026-09-09T16:00:00.000Z');
    expect(wed[0].endAt).toBe('2026-09-09T17:00:00.000Z');
    expect(wed[0].reminders[0].offsetMinutes).toBe(30);
    expect(eventsOn(w.ctx, '2026-09-10')).toEqual([]); // Thursday
    expect(eventsOn(w.ctx, '2026-09-02')).toEqual([]); // before anchor
    expect(eventsOn(w.ctx, '2026-10-26')[0].startAt).toBe('2026-10-26T17:00:00.000Z'); // after DST: 18:00 CET
    expect(eventsOn(w.ctx, '2026-10-26')[0].event.id).toBe(event.id);
  });

  it('sorts all-day first, then by time', () => {
    createEvent(w.ctx, { title: 'B', startAt: '2026-09-10T12:00:00Z' });
    createEvent(w.ctx, { title: 'A', startAt: '2026-09-10T08:00:00Z' });
    createEvent(w.ctx, { title: 'Ünnep', startAt: '2026-09-09T22:00:00Z', allDay: true });
    expect(eventsOn(w.ctx, '2026-09-10').map((o) => o.event.title)).toEqual(['Ünnep', 'A', 'B']);
  });

  it('updates, replaces reminders, validates, deletes', () => {
    const { event } = createEvent(w.ctx, { title: 'x', startAt: '2026-09-10T08:00:00Z', reminders: [15] });
    const upd = updateEvent(w.ctx, event.id, { title: ' y ', reminders: [0, 1440], recurrence: { type: 'daily' } });
    expect(upd.event.title).toBe('y');
    expect(upd.reminders.map((r) => r.offsetMinutes)).toEqual([0, 1440]);
    expect(upd.event.recurrence).toBe('{"type":"daily"}');
    expect(() => createEvent(w.ctx, { title: '', startAt: '2026-09-10T08:00:00Z' })).toThrow(/title/);
    expect(() =>
      createEvent(w.ctx, { title: 'z', startAt: '2026-09-10T08:00:00Z', endAt: '2026-09-10T07:00:00Z' }),
    ).toThrow(/end before start/);
    deleteEvent(w.ctx, event.id);
    expect(() => getEvent(w.ctx, event.id)).toThrow(/not found/);
    expect(eventsOn(w.ctx, '2026-09-10')).toEqual([]);
  });

  it('agenda merges events and tasks; busyDays flags them', () => {
    createEvent(w.ctx, { title: 'e', startAt: '2026-09-11T08:00:00Z' });
    createTask(w.ctx, { title: 't', dueAt: '2026-09-12T10:00:00Z' });
    const a = agendaFor(w.ctx, '2026-09-11');
    expect(a.events).toHaveLength(1);
    expect(a.tasks.due).toHaveLength(0);
    expect([...busyDays(w.ctx, '2026-09-07', '2026-09-13')]).toEqual(['2026-09-11', '2026-09-12']);
  });
});
