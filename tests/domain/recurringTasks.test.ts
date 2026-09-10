import { beforeEach, describe, expect, it } from 'vitest';
import { closePendingDays } from '@/src/domain/dayClose';
import { balance } from '@/src/domain/points/ledger';
import {
  completeTask,
  createTask,
  deleteTask,
  materializeRecurringTasks,
  recurringTemplates,
  tasksForDay,
  updateTask,
} from '@/src/domain/tasks';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('recurring tasks', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z'); // Wednesday
  });

  it('a daily template spawns instances for the next 7 days and is hidden itself', () => {
    const tpl = createTask(w.ctx, {
      title: 'Vitamin',
      dueAt: '2026-09-09T06:00:00Z', // 08:00 CEST
      recurrence: { type: 'daily' },
    });
    expect(recurringTemplates(w.ctx).map((t) => t.id)).toEqual([tpl.id]);
    const today = tasksForDay(w.ctx, '2026-09-09');
    expect(today.due).toHaveLength(1);
    expect(today.due[0].parentTaskId).toBe(tpl.id);
    expect(today.due[0].dueAt).toBe('2026-09-09T06:00:00.000Z');
    expect(today.due.map((t) => t.id)).not.toContain(tpl.id);
    expect(tasksForDay(w.ctx, '2026-09-16').due).toHaveLength(1); // today + 7
    expect(tasksForDay(w.ctx, '2026-09-17').due).toHaveLength(0);
    expect(materializeRecurringTasks(w.ctx)).toEqual([]); // idempotent
  });

  it('weekly template respects the mask and the anchor', () => {
    createTask(w.ctx, {
      title: 'Szemét',
      dueAt: '2026-09-10T17:00:00Z', // Thursday anchor
      recurrence: { type: 'weekly', weekdayMask: 0b0001000 }, // Thursdays
    });
    expect(tasksForDay(w.ctx, '2026-09-09').due).toHaveLength(0);
    expect(tasksForDay(w.ctx, '2026-09-10').due).toHaveLength(1);
    expect(tasksForDay(w.ctx, '2026-09-11').due).toHaveLength(0);
  });

  it('rolls forward day by day and completed instances earn points', () => {
    createTask(w.ctx, { title: 'Vitamin', dueAt: '2026-09-09T06:00:00Z', recurrence: { type: 'daily' } });
    const inst = tasksForDay(w.ctx, '2026-09-09').due[0];
    completeTask(w.ctx, inst.id);
    expect(balance(w.ctx).raw).toBe(5); // due 08:00, completed 12:00 → late → 10/2
    w.advanceDays(3);
    closePendingDays(w.ctx);
    expect(tasksForDay(w.ctx, '2026-09-19').due).toHaveLength(1); // horizon moved to today + 7
    expect(balance(w.ctx).raw).toBe(5 - 2 * 5); // 10th and 11th instances went overdue (-5 each), the 12th is today
  });

  it('deleting a template removes future open instances but keeps completed ones', () => {
    const tpl = createTask(w.ctx, { title: 'x', dueAt: '2026-09-09T20:00:00Z', recurrence: { type: 'daily' } });
    completeTask(w.ctx, tasksForDay(w.ctx, '2026-09-09').due[0].id);
    deleteTask(w.ctx, tpl.id);
    expect(recurringTemplates(w.ctx)).toEqual([]);
    expect(tasksForDay(w.ctx, '2026-09-09').completed).toHaveLength(1);
    expect(tasksForDay(w.ctx, '2026-09-10').due).toHaveLength(0);
  });

  it('changing the rule regenerates future instances without duplicating', () => {
    const tpl = createTask(w.ctx, { title: 'x', dueAt: '2026-09-09T20:00:00Z', recurrence: { type: 'daily' } });
    updateTask(w.ctx, tpl.id, { recurrence: { type: 'weekly', weekdayMask: 0b0000100 } }); // Wednesdays
    expect(tasksForDay(w.ctx, '2026-09-09').due).toHaveLength(1);
    expect(tasksForDay(w.ctx, '2026-09-10').due).toHaveLength(0);
    expect(tasksForDay(w.ctx, '2026-09-16').due).toHaveLength(1);
    expect(materializeRecurringTasks(w.ctx)).toEqual([]);
  });

  it('requires a due time for recurring tasks', () => {
    expect(() => createTask(w.ctx, { title: 'x', recurrence: { type: 'daily' } })).toThrow(/due time/);
  });
});
