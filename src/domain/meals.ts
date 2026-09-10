/**
 * Meals: fixed templates, a weekly plan, and a per-day log with quick ticking.
 * Points for the kcal goal are settled by the day close, not here.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  mealLogs,
  mealPlanItems,
  mealTemplates,
  MEAL_SLOTS,
  type MealLog,
  type MealPlanItem,
  type MealSlot,
  type MealTemplate,
  type NewMealTemplate,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { weekdayIndex, type DayKey } from './dates';
import { assertEditable } from './habits';
import { evaluateKcal, type KcalOutcome } from './points/rules';

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Reggeli',
  lunch: 'Ebéd',
  dinner: 'Vacsora',
  snack: 'Nasi',
};

// ---------------------------------------------------------------- templates

export type MealTemplateInput = Pick<NewMealTemplate, 'name' | 'kcal'> &
  Partial<Pick<NewMealTemplate, 'proteinG' | 'carbsG' | 'fatG' | 'defaultSlot'>>;

function validateTemplate(input: Partial<MealTemplateInput>): void {
  if (input.name !== undefined && !input.name.trim()) throw new DomainError('INVALID', 'name required');
  if (input.kcal !== undefined && (!Number.isInteger(input.kcal) || input.kcal < 0 || input.kcal > 10_000))
    throw new DomainError('INVALID', 'kcal must be 0..10000');
}

export function getTemplate(ctx: DomainCtx, id: string): MealTemplate {
  const t = ctx.db
    .select()
    .from(mealTemplates)
    .where(and(eq(mealTemplates.id, id), eq(mealTemplates.userId, ctx.userId)))
    .get();
  if (!t || t.deletedAt) throw new DomainError('NOT_FOUND', `meal template ${id} not found`);
  return t;
}

export function listTemplates(ctx: DomainCtx): MealTemplate[] {
  return ctx.db
    .select()
    .from(mealTemplates)
    .where(and(eq(mealTemplates.userId, ctx.userId), isNull(mealTemplates.archivedAt), isNull(mealTemplates.deletedAt)))
    .orderBy(asc(mealTemplates.name))
    .all();
}

export function createTemplate(ctx: DomainCtx, input: MealTemplateInput): MealTemplate {
  validateTemplate(input);
  const ts = nowIso(ctx);
  return ctx.db
    .insert(mealTemplates)
    .values({ ...input, name: input.name.trim(), id: ctx.uuid(), userId: ctx.userId, createdAt: ts, updatedAt: ts })
    .returning()
    .get();
}

export function updateTemplate(ctx: DomainCtx, id: string, patch: Partial<MealTemplateInput>): MealTemplate {
  getTemplate(ctx, id);
  validateTemplate(patch);
  return ctx.db
    .update(mealTemplates)
    .set({ ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), updatedAt: nowIso(ctx) })
    .where(eq(mealTemplates.id, id))
    .returning()
    .get();
}

export function archiveTemplate(ctx: DomainCtx, id: string): void {
  getTemplate(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.transaction((tx) => {
    tx.update(mealTemplates).set({ archivedAt: ts, updatedAt: ts }).where(eq(mealTemplates.id, id)).run();
    tx.delete(mealPlanItems).where(eq(mealPlanItems.templateId, id)).run();
  });
}

// ---------------------------------------------------------------- weekly plan

export interface WeekPlanItem extends MealPlanItem {
  template: MealTemplate;
}

export function weekPlan(ctx: DomainCtx, weekday: number): WeekPlanItem[] {
  const rows = ctx.db
    .select()
    .from(mealPlanItems)
    .innerJoin(mealTemplates, eq(mealTemplates.id, mealPlanItems.templateId))
    .where(and(eq(mealPlanItems.userId, ctx.userId), eq(mealPlanItems.weekday, weekday)))
    .orderBy(asc(mealPlanItems.sortOrder))
    .all();
  return rows.map((r) => ({ ...r.meal_plan_items, template: r.meal_templates }));
}

export function addPlanItem(ctx: DomainCtx, weekday: number, slot: MealSlot, templateId: string): MealPlanItem {
  if (weekday < 0 || weekday > 6) throw new DomainError('INVALID', 'weekday 0..6');
  if (!MEAL_SLOTS.includes(slot)) throw new DomainError('INVALID', 'bad slot');
  getTemplate(ctx, templateId);
  const order = weekPlan(ctx, weekday).filter((i) => i.slot === slot).length;
  return ctx.db
    .insert(mealPlanItems)
    .values({ id: ctx.uuid(), userId: ctx.userId, weekday, slot, templateId, sortOrder: order })
    .returning()
    .get();
}

export function removePlanItem(ctx: DomainCtx, id: string): void {
  ctx.db.delete(mealPlanItems).where(and(eq(mealPlanItems.id, id), eq(mealPlanItems.userId, ctx.userId))).run();
}

/** Copies one weekday's plan onto other weekdays (replacing theirs). */
export function copyWeekday(ctx: DomainCtx, from: number, to: number[]): void {
  const source = weekPlan(ctx, from);
  ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    for (const wd of to) {
      if (wd === from) continue;
      tx.delete(mealPlanItems).where(and(eq(mealPlanItems.userId, c.userId), eq(mealPlanItems.weekday, wd))).run();
      for (const item of source) {
        tx.insert(mealPlanItems)
          .values({ id: c.uuid(), userId: c.userId, weekday: wd, slot: item.slot, templateId: item.templateId, sortOrder: item.sortOrder })
          .run();
      }
    }
  });
}

// ---------------------------------------------------------------- daily log

/** Generates the planned meal logs of a logical day from the weekly plan. Idempotent. */
export function materializeMealLogs(ctx: DomainCtx, date: DayKey): MealLog[] {
  const items = weekPlan(ctx, weekdayIndex(date));
  if (items.length === 0) return [];
  const existing = new Set(
    ctx.db
      .select({ planItemId: mealLogs.planItemId })
      .from(mealLogs)
      .where(and(eq(mealLogs.userId, ctx.userId), eq(mealLogs.date, date)))
      .all()
      .map((r) => r.planItemId),
  );
  const created: MealLog[] = [];
  for (const item of items) {
    if (existing.has(item.id)) continue;
    const ts = nowIso(ctx);
    created.push(
      ctx.db
        .insert(mealLogs)
        .values({
          id: ctx.uuid(),
          userId: ctx.userId,
          date,
          slot: item.slot,
          templateId: item.templateId,
          planItemId: item.id,
          nameSnapshot: item.template.name,
          kcalSnapshot: item.template.kcal,
          proteinSnapshot: item.template.proteinG,
          carbsSnapshot: item.template.carbsG,
          fatSnapshot: item.template.fatG,
          planned: true,
          eaten: false,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning()
        .get(),
    );
  }
  return created;
}

function getLog(ctx: DomainCtx, id: string): MealLog {
  const log = ctx.db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.id, id), eq(mealLogs.userId, ctx.userId)))
    .get();
  if (!log || log.deletedAt) throw new DomainError('NOT_FOUND', `meal log ${id} not found`);
  return log;
}

export function toggleMeal(ctx: DomainCtx, id: string): MealLog {
  const log = getLog(ctx, id);
  assertEditable(ctx, log.date);
  return ctx.db
    .update(mealLogs)
    .set({ eaten: !log.eaten, updatedAt: nowIso(ctx) })
    .where(eq(mealLogs.id, id))
    .returning()
    .get();
}

/** Logs a template as eaten right now (not part of the plan). */
export function addAdHocMeal(ctx: DomainCtx, date: DayKey, templateId: string, slot?: MealSlot): MealLog {
  assertEditable(ctx, date);
  const t = getTemplate(ctx, templateId);
  const ts = nowIso(ctx);
  return ctx.db
    .insert(mealLogs)
    .values({
      id: ctx.uuid(),
      userId: ctx.userId,
      date,
      slot: slot ?? t.defaultSlot ?? 'snack',
      templateId: t.id,
      nameSnapshot: t.name,
      kcalSnapshot: t.kcal,
      proteinSnapshot: t.proteinG,
      carbsSnapshot: t.carbsG,
      fatSnapshot: t.fatG,
      planned: false,
      eaten: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

/** One-off entry without a template (e.g. a restaurant meal). */
export function addCustomMeal(
  ctx: DomainCtx,
  date: DayKey,
  input: { name: string; kcal: number; slot: MealSlot; proteinG?: number | null; carbsG?: number | null; fatG?: number | null },
): MealLog {
  assertEditable(ctx, date);
  validateTemplate(input);
  const ts = nowIso(ctx);
  return ctx.db
    .insert(mealLogs)
    .values({
      id: ctx.uuid(),
      userId: ctx.userId,
      date,
      slot: input.slot,
      nameSnapshot: input.name.trim(),
      kcalSnapshot: input.kcal,
      proteinSnapshot: input.proteinG ?? null,
      carbsSnapshot: input.carbsG ?? null,
      fatSnapshot: input.fatG ?? null,
      planned: false,
      eaten: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
    .get();
}

/** Removes an ad-hoc entry; a planned one can only be un-ticked. */
export function removeMealLog(ctx: DomainCtx, id: string): void {
  const log = getLog(ctx, id);
  if (log.planned) throw new DomainError('INVALID', 'planned meals cannot be removed, untick them');
  assertEditable(ctx, log.date);
  const ts = nowIso(ctx);
  ctx.db.update(mealLogs).set({ deletedAt: ts, updatedAt: ts }).where(eq(mealLogs.id, id)).run();
}

export interface DayNutrition {
  date: DayKey;
  target: number | null;
  tolerancePct: number;
  eatenKcal: number;
  plannedKcal: number;
  protein: number;
  carbs: number;
  fat: number;
  outcome: KcalOutcome;
  slots: { slot: MealSlot; label: string; logs: MealLog[] }[];
}

export function dayNutrition(ctx: DomainCtx, date: DayKey = todayKey(ctx)): DayNutrition {
  const logs = ctx.db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.userId, ctx.userId), eq(mealLogs.date, date), isNull(mealLogs.deletedAt)))
    .orderBy(asc(mealLogs.createdAt))
    .all();
  const eaten = logs.filter((l) => l.eaten);
  const sum = (pick: (l: MealLog) => number | null) => eaten.reduce((a, l) => a + (pick(l) ?? 0), 0);
  const eatenKcal = sum((l) => l.kcalSnapshot);
  return {
    date,
    target: ctx.settings.kcalTarget,
    tolerancePct: ctx.settings.kcalTolerancePct,
    eatenKcal,
    plannedKcal: logs.reduce((a, l) => a + l.kcalSnapshot, 0),
    protein: Math.round(sum((l) => l.proteinSnapshot)),
    carbs: Math.round(sum((l) => l.carbsSnapshot)),
    fat: Math.round(sum((l) => l.fatSnapshot)),
    outcome: evaluateKcal({ eaten: eatenKcal, target: ctx.settings.kcalTarget, tolerancePct: ctx.settings.kcalTolerancePct }),
    slots: MEAL_SLOTS.map((slot) => ({ slot, label: SLOT_LABEL[slot], logs: logs.filter((l) => l.slot === slot) })),
  };
}
