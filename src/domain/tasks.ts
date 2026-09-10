/**
 * Task use-cases: create/edit, complete (award), un-complete (reverse).
 * Overdue penalties are applied by the day close, not here.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { tasks, type NewTask, type Task } from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { dayKeyFor, type DayKey } from './dates';
import { award, findActiveEntry, reverse } from './points/ledger';
import { taskPoints, type TaskPriority } from './points/rules';
import { assertEditable } from './habits';

export type TaskInput = Pick<NewTask, 'title'> &
  Partial<Pick<NewTask, 'notes' | 'dueAt' | 'priority' | 'points' | 'recurrence'>>;

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

export function createTask(ctx: DomainCtx, input: TaskInput): Task {
  if (!input.title.trim()) throw new DomainError('INVALID', 'title required');
  const priority = input.priority ?? 2;
  if (priority < 1 || priority > 3) throw new DomainError('INVALID', 'priority must be 1..3');
  const ts = nowIso(ctx);
  return ctx.db
    .insert(tasks)
    .values({
      ...input,
      title: input.title.trim(),
      priority,
      id: ctx.uuid(),
      userId: ctx.userId,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

export function updateTask(ctx: DomainCtx, id: string, patch: Partial<TaskInput>): Task {
  getTask(ctx, id);
  return ctx.db
    .update(tasks)
    .set({ ...patch, updatedAt: nowIso(ctx) })
    .where(eq(tasks.id, id))
    .returning()
    .get();
}

export function deleteTask(ctx: DomainCtx, id: string): void {
  getTask(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(tasks).set({ deletedAt: ts, updatedAt: ts }).where(eq(tasks.id, id)).run();
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
      base: taskPoints({ priority: task.priority as TaskPriority, override: task.points, late }),
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
    .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
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
