import { beforeEach, describe, expect, it } from 'vitest';
import { createEvent } from '@/src/domain/events';
import { createHabit, tapHabit } from '@/src/domain/habits';
import { planNotifications } from '@/src/domain/notifications';
import { completeTask, createTask } from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('planNotifications', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z'); // Wed 12:00 CEST
  });

  it('is empty without data', () => {
    expect(planNotifications(w.ctx)).toEqual([]);
  });

  it('schedules habit reminders on scheduled days, skipping done ones and past times', () => {
    const h = createHabit(w.ctx, { name: 'Olvasás', kind: 'good', reminderTime: '21:00', icon: '📖' });
    const morning = createHabit(w.ctx, { name: 'Víz', kind: 'good', reminderTime: '08:00', targetCount: 8, unit: 'pohár' });
    const plan = planNotifications(w.ctx, { days: 2 });
    const keys = plan.map((n) => n.key);
    expect(keys).toContain(`habit:${h.id}:2026-09-09`);
    expect(keys).not.toContain(`habit:${morning.id}:2026-09-09`); // 08:00 already passed
    expect(keys).toContain(`habit:${morning.id}:2026-09-10`);
    const tonight = plan.find((n) => n.key === `habit:${h.id}:2026-09-09`)!;
    expect(tonight.fireAt).toBe('2026-09-09T19:00:00.000Z');
    expect(tonight.title).toBe('📖 Olvasás');
    expect(tonight.url).toBe('/');
    expect(plan.find((n) => n.key === `habit:${morning.id}:2026-09-10`)?.body).toBe('Ma még 8 pohár');

    tapHabit(w.ctx, h.id, '2026-09-09');
    expect(planNotifications(w.ctx, { days: 2 }).map((n) => n.key)).not.toContain(`habit:${h.id}:2026-09-09`);
  });

  it('adds an evening summary per day with a live count for today', () => {
    const a = createHabit(w.ctx, { name: 'a', kind: 'good' });
    createHabit(w.ctx, { name: 'b', kind: 'good' });
    createHabit(w.ctx, { name: 'smoke', kind: 'bad' }); // bad habits do not count as "remaining"
    let plan = planNotifications(w.ctx, { days: 2 });
    const today = plan.find((n) => n.key === 'summary:2026-09-09')!;
    expect(today.fireAt).toBe('2026-09-09T18:00:00.000Z');
    expect(today.body).toBe('2 szokásod vár még rád ma.');
    expect(today.channel).toBe('summary');
    expect(plan.find((n) => n.key === 'summary:2026-09-10')?.body).toBe('Nézd meg, mi maradt mára.');
    tapHabit(w.ctx, a.id, '2026-09-09');
    plan = planNotifications(w.ctx, { days: 1 });
    expect(plan.find((n) => n.key === 'summary:2026-09-09')?.body).toBe('1 szokásod vár még rád ma.');
  });

  it('schedules event reminders per offset and task reminders an hour before', () => {
    const { event } = createEvent(w.ctx, {
      title: 'Fogorvos',
      startAt: '2026-09-10T07:30:00Z',
      location: 'Klinika',
      reminders: [0, 60],
    });
    const t = createTask(w.ctx, { title: 'Számla', dueAt: '2026-09-09T16:00:00Z' });
    const done = createTask(w.ctx, { title: 'Kész', dueAt: '2026-09-09T17:00:00Z' });
    completeTask(w.ctx, done.id);
    const plan = planNotifications(w.ctx);
    const e0 = plan.find((n) => n.key === `event:${event.id}:2026-09-10:0`)!;
    const e60 = plan.find((n) => n.key === `event:${event.id}:2026-09-10:60`)!;
    expect(e0.fireAt).toBe('2026-09-10T07:30:00.000Z');
    expect(e0.body).toBe('Most kezdődik · Klinika');
    expect(e60.fireAt).toBe('2026-09-10T06:30:00.000Z');
    expect(e60.body).toBe('09:30 · Klinika');
    expect(e60.url).toBe(`/event/${event.id}`);
    const task = plan.find((n) => n.key === `task:${t.id}`)!;
    expect(task.fireAt).toBe('2026-09-09T15:00:00.000Z');
    expect(task.body).toBe('Számla');
    expect(plan.map((n) => n.key)).not.toContain(`task:${done.id}`);
  });

  it('is sorted by time and capped', () => {
    for (let i = 0; i < 10; i++) createHabit(w.ctx, { name: 'h' + i, kind: 'good', reminderTime: '20:00' });
    const plan = planNotifications(w.ctx, { days: 7, max: 5 });
    expect(plan).toHaveLength(5);
    for (let i = 1; i < plan.length; i++) expect(plan[i].fireAt >= plan[i - 1].fireAt).toBe(true);
  });
});
