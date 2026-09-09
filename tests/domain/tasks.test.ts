import { beforeEach, describe, expect, it } from 'vitest';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import { completeTask, createTask, deleteTask, tasksForDay, uncompleteTask } from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09';

describe('tasks', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  it('completing awards by priority, on time', () => {
    const t = createTask(w.ctx, { title: 'Számla', priority: 3, dueAt: '2026-09-09T16:00:00Z' });
    const done = completeTask(w.ctx, t.id);
    expect(done.completedAt).toBe('2026-09-09T10:00:00.000Z');
    expect(balance(w.ctx).raw).toBe(20);
    completeTask(w.ctx, t.id); // idempotent
    expect(balance(w.ctx).raw).toBe(20);
  });

  it('late completion pays half; override respected', () => {
    const late = createTask(w.ctx, { title: 'Késő', priority: 2, dueAt: '2026-09-08T08:00:00Z' });
    completeTask(w.ctx, late.id);
    expect(balance(w.ctx).raw).toBe(5);
    const custom = createTask(w.ctx, { title: 'Nagy', points: 50 });
    completeTask(w.ctx, custom.id);
    expect(balance(w.ctx).raw).toBe(55);
  });

  it('uncomplete reverses within the grace window and refuses after it', () => {
    const t = createTask(w.ctx, { title: 'x' });
    completeTask(w.ctx, t.id);
    expect(uncompleteTask(w.ctx, t.id).completedAt).toBeNull();
    expect(balance(w.ctx).raw).toBe(0);
    expect(recentEntries(w.ctx)).toHaveLength(2);

    completeTask(w.ctx, t.id);
    w.advanceDays(3);
    expect(() => uncompleteTask(w.ctx, t.id)).toThrow(/locked/);
  });

  it('validates input', () => {
    expect(() => createTask(w.ctx, { title: '   ' })).toThrow(/title/);
    expect(() => createTask(w.ctx, { title: 'x', priority: 5 })).toThrow(/priority/);
  });

  it('buckets tasks for a day', () => {
    const due = createTask(w.ctx, { title: 'due', dueAt: '2026-09-09T18:00:00Z' });
    const dueEarly = createTask(w.ctx, { title: 'dueEarly', dueAt: '2026-09-09T06:00:00Z', priority: 1 });
    const overdue = createTask(w.ctx, { title: 'overdue', dueAt: '2026-09-07T12:00:00Z' });
    const anytime = createTask(w.ctx, { title: 'anytime', priority: 3 });
    const tomorrow = createTask(w.ctx, { title: 'tomorrow', dueAt: '2026-09-10T12:00:00Z' });
    const doneToday = createTask(w.ctx, { title: 'done' });
    completeTask(w.ctx, doneToday.id);
    const gone = createTask(w.ctx, { title: 'gone' });
    deleteTask(w.ctx, gone.id);

    const day = tasksForDay(w.ctx, TODAY);
    expect(day.due.map((t) => t.id)).toEqual([dueEarly.id, due.id]);
    expect(day.overdue.map((t) => t.id)).toEqual([overdue.id]);
    expect(day.anytime.map((t) => t.id)).toEqual([anytime.id]);
    expect(day.completed.map((t) => t.id)).toEqual([doneToday.id]);
    expect([...day.due, ...day.overdue, ...day.anytime].map((t) => t.id)).not.toContain(tomorrow.id);
  });

  it('a 02:30 local due time belongs to the previous logical day', () => {
    // 2026-09-10 02:30 CEST = 00:30Z → logical day 2026-09-09 (day starts at 04:00)
    const t = createTask(w.ctx, { title: 'night', dueAt: '2026-09-10T00:30:00Z' });
    expect(tasksForDay(w.ctx, TODAY).due.map((x) => x.id)).toEqual([t.id]);
  });
});
