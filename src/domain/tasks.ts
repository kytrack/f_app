/**
 * Task use-cases: create/edit, complete (award), un-complete (reverse).
 * Overdue penalties are applied by the day close, not here.
 */
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { tasks, type NewTask, type Task } from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { addDaysToKey, calendarKeyFor, dayKeyFor, instantFor, localTime, type DayKey } from './dates';
import { occurrencesBetween, parseRecurrence, serializeRecurrence, type Recurrence } from './recurrence';
import { award, findActiveEntry, reverse } from './points/ledger';
import { taskPoints, type TaskPriority } from './points/rules';
import { assertEditable } from './habits';

export type TaskInput = Pick<NewTask, 'title'> &
  Partial<Pick<NewTask, 'notes' | 'dueAt' | 'priority' | 'points' | 'challengeId'>> & { recurrence?: Recurrence | null };

/** How far ahead recurring templates are turned into concrete task instances. */
export const MATERIALIZE_DAYS = 7;

export const isTemplate = (t: Pick<Task, 'recurrence'>) => t.recurrence !== null;

export function taskDayKey(ctx: DomainCtx, task: Pick<Task, 'dueAt'>): DayKey | null {
  return task.dueAt ? dayKeyFor(new Date(task.dueAt), ctx.settings.timezone, ctx.settings.dayStartHour) : null;
}

export function getTask(ctx: DomainCtx, id: string): Task {
  const t = ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)))
    .get();
  if (!t || t.deletedAt) throw new DomainError('NOT_FOUND', `task ${id} not found`);
  return t;
}

function validateTask(input: Partial<TaskInput>): void {
  if (input.title !== undefined && !input.title.trim()) throw new DomainError('INVALID', 'title required');
  if (input.priority !== undefined && (input.priority < 1 || input.priority > 3))
    throw new DomainError('INVALID', 'priority must be 1..3');
}

export function createTask(ctx: DomainCtx, input: TaskInput): Task {
  validateTask(input);
  if (input.recurrence && !input.dueAt) throw new DomainError('INVALID', 'recurring tasks need a due time');
  const ts = nowIso(ctx);
  const { recurrence, ...rest } = input;
  const task = ctx.db
    .insert(tasks)
    .values({
      ...rest,
      title: input.title.trim(),
      priority: input.priority ?? 2,
      recurrence: serializeRecurrence(recurrence ?? null),
      id: ctx.uuid(),
      userId: ctx.userId,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
  if (recurrence) materializeRecurringTasks(ctx);
  return task;
}

export function updateTask(ctx: DomainCtx, id: string, patch: Partial<TaskInput>): Task {
  const before = getTask(ctx, id);
  validateTask(patch);
  const { recurrence, ...rest } = patch;
  const becomesTemplate = recurrence !== undefined ? !!recurrence : isTemplate(before);
  const dueAt = rest.dueAt !== undefined ? rest.dueAt : before.dueAt;
  if (becomesTemplate && !dueAt) throw new DomainError('INVALID', 'recurring tasks need a due time');
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const updated = tx
      .update(tasks)
      .set({
        ...rest,
        ...(rest.title !== undefined ? { title: rest.title.trim() } : {}),
        ...(recurrence !== undefined ? { recurrence: serializeRecurrence(recurrence) } : {}),
        updatedAt: nowIso(c),
      })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    if (isTemplate(before) || becomesTemplate) {
      // The schedule may have changed: drop open future instances and regenerate.
      dropOpenInstances(c, id);
      materializeRecurringTasks(c);
    }
    return updated;
  });
}

/**
 * Hard-deletes generated instances of a template that are still open and not yet due, so a
 * changed rule can regenerate them. Safe: an open instance has no ledger rows. Occurrences the
 * user removed themselves are soft-deleted and stay excluded from regeneration.
 */
function dropOpenInstances(ctx: DomainCtx, templateId: string): void {
  const today = todayKey(ctx);
  const open = ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, templateId), isNull(tasks.deletedAt), isNull(tasks.completedAt)))
    .all();
  for (const t of open) {
    const day = taskDayKey(ctx, t);
    if (day !== null && day >= today) {
      ctx.db.delete(tasks).where(eq(tasks.id, t.id)).run();
    }
  }
}

export function deleteTask(ctx: DomainCtx, id: string): void {
  const task = getTask(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    tx.update(tasks).set({ deletedAt: ts, updatedAt: ts }).where(eq(tasks.id, id)).run();
    if (isTemplate(task)) dropOpenInstances(c, id);
  });
}

/** Templates (tasks with a recurrence rule); never shown in day lists themselves. */
export function recurringTemplates(ctx: DomainCtx): Task[] {
  return ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt), isNotNull(tasks.recurrence)))
    .orderBy(asc(tasks.createdAt))
    .all();
}

/**
 * Creates concrete instances for every recurring template from today through
 * today + MATERIALIZE_DAYS. Idempotent: a (template, day) pair gets at most one instance,
 * and a deleted instance is not re-created (the user removed that occurrence).
 */
export function materializeRecurringTasks(ctx: DomainCtx, through?: DayKey): Task[] {
  const tz = ctx.settings.timezone;
  const today = todayKey(ctx);
  const to = through ?? addDaysToKey(today, MATERIALIZE_DAYS);
  const created: Task[] = [];
  for (const template of recurringTemplates(ctx)) {
    const rule = parseRecurrence(template.recurrence);
    if (!rule || !template.dueAt) continue;
    const anchorInstant = new Date(template.dueAt);
    const anchor = calendarKeyFor(anchorInstant, tz);
    const time = localTime(anchorInstant, tz);
    const existing = new Set(
      ctx.db
        .select({ dueAt: tasks.dueAt })
        .from(tasks)
        .where(eq(tasks.parentTaskId, template.id))
        .all()
        .map((t) => (t.dueAt ? calendarKeyFor(new Date(t.dueAt), tz) : '')),
    );
    for (const day of occurrencesBetween(rule, anchor, today, to)) {
      if (existing.has(day)) continue;
      const ts = nowIso(ctx);
      created.push(
        ctx.db
          .insert(tasks)
          .values({
            id: ctx.uuid(),
            userId: ctx.userId,
            title: template.title,
            notes: template.notes,
            priority: template.priority,
            points: template.points,
            dueAt: instantFor(day, time, tz).toISOString(),
            parentTaskId: template.id,
            createdAt: ts,
            updatedAt: ts,
          })
          .returning()
          .get(),
      );
    }
  }
  return created;
}

/** Completes a task now; late completion (past due) earns half. Idempotent. */
export function completeTask(ctx: DomainCtx, id: string): Task {
  const task = getTask(ctx, id);
  if (task.completedAt) return task;
  const now = ctx.now();
  const late = !!task.dueAt && now.getTime() > new Date(task.dueAt).getTime();
  const today = todayKey(ctx);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    award(c, {
      reason: 'task_done',
      refType: 'task',
      refId: task.id,
      date: today,
      base: taskPoints({ priority: task.priority as TaskPriority, override: task.points, late }, c.settings.rules),
      note: late ? 'késve' : undefined,
    });
    return tx
      .update(tasks)
      .set({ completedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  });
}

/** Undoes a completion within the edit grace window and reverses its points. */
export function uncompleteTask(ctx: DomainCtx, id: string): Task {
  const task = getTask(ctx, id);
  if (!task.completedAt) return task;
  const completedDay = dayKeyFor(new Date(task.completedAt), ctx.settings.timezone, ctx.settings.dayStartHour);
  assertEditable(ctx, completedDay);
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const active = findActiveEntry(c, {
      reason: 'task_done',
      refType: 'task',
      refId: task.id,
      date: completedDay,
    });
    if (active) reverse(c, active.id, 'visszavonva');
    return tx
      .update(tasks)
      .set({ completedAt: null, updatedAt: nowIso(c) })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  });
}

export interface DayTasks {
  /** Open tasks due on `date`, sorted by due time then priority. */
  due: Task[];
  /** Open tasks due before `date`. */
  overdue: Task[];
  /** Open tasks with no due date. */
  anytime: Task[];
  /** Tasks completed on `date`. */
  completed: Task[];
}

export function tasksForDay(ctx: DomainCtx, date: DayKey): DayTasks {
  const all = ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt), isNull(tasks.recurrence)))
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
    .all();
  const out: DayTasks = { due: [], overdue: [], anytime: [], completed: [] };
  for (const t of all) {
    if (t.completedAt) {
      if (dayKeyFor(new Date(t.completedAt), ctx.settings.timezone, ctx.settings.dayStartHour) === date) {
        out.completed.push(t);
      }
      continue;
    }
    const day = taskDayKey(ctx, t);
    if (day === null) out.anytime.push(t);
    else if (day === date) out.due.push(t);
    else if (day < date) out.overdue.push(t);
  }
  const byPriority = (a: Task, b: Task) => b.priority - a.priority;
  out.due.sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : a.dueAt! > b.dueAt! ? 1 : byPriority(a, b)));
  out.anytime.sort(byPriority);
  return out;
}
