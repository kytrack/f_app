/**
 * Meals: fixed templates, a weekly plan, and a per-day log with quick ticking.
 * Points for the kcal goal are settled by the day close, not here.
 */
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import {
  mealLogs,
  mealPlanItems,
  mealTemplates,
  MEAL_SLOTS,
  settings as settingsTable,
  type MealLog,
  type MealPlanItem,
  type MealSlot,
  type MealTemplate,
  type NewMealTemplate,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { isBitSet, weekdayIndex, type DayKey } from './dates';
import { assertEditable } from './habits';
import { award, reverseActive } from './points/ledger';
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
  const updated = ctx.db
    .update(mealTemplates)
    .set({ ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), updatedAt: nowIso(ctx) })
    .where(eq(mealTemplates.id, id))
    .returning()
    .get();
  // History keeps its snapshots; rows that are not eaten yet follow the edited food.
  ctx.db
    .update(mealLogs)
    .set({
      nameSnapshot: updated.name,
      kcalSnapshot: updated.kcal,
      proteinSnapshot: updated.proteinG,
      carbsSnapshot: updated.carbsG,
      fatSnapshot: updated.fatG,
      updatedAt: nowIso(ctx),
    })
    .where(
      and(
        eq(mealLogs.userId, ctx.userId),
        eq(mealLogs.templateId, id),
        eq(mealLogs.eaten, false),
        gte(mealLogs.date, todayKey(ctx)),
        isNull(mealLogs.deletedAt),
      ),
    )
    .run();
  return updated;
}

export function archiveTemplate(ctx: DomainCtx, id: string): void {
  getTemplate(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const items = tx.select({ id: mealPlanItems.id }).from(mealPlanItems).where(eq(mealPlanItems.templateId, id)).all();
    dropPendingLogs(c, items.map((i) => i.id));
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

/** Un-eaten planned logs from today on that were generated by these plan items disappear with them. */
function dropPendingLogs(ctx: DomainCtx, planItemIds: string[]): void {
  if (planItemIds.length === 0) return;
  const ts = nowIso(ctx);
  ctx.db
    .update(mealLogs)
    .set({ deletedAt: ts, updatedAt: ts })
    .where(
      and(
        eq(mealLogs.userId, ctx.userId),
        inArray(mealLogs.planItemId, planItemIds),
        eq(mealLogs.eaten, false),
        gte(mealLogs.date, todayKey(ctx)),
        isNull(mealLogs.deletedAt),
      ),
    )
    .run();
}

export function removePlanItem(ctx: DomainCtx, id: string): void {
  ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    dropPendingLogs(c, [id]);
    tx.delete(mealPlanItems).where(and(eq(mealPlanItems.id, id), eq(mealPlanItems.userId, c.userId))).run();
  });
}

// ---------------------------------------------------------------- fixed daily meals

export interface FixedMealInput {
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  slot: MealSlot;
  /** Which weekdays it is eaten on; bit0 = Monday … bit6 = Sunday. 127 = every day. */
  weekdayMask?: number;
}

export interface FixedMeal {
  template: MealTemplate;
  slot: MealSlot;
  weekdayMask: number;
  planItemIds: string[];
}

/** The weekly plan seen as "my fixed meals": one row per (food, slot) with its weekday mask. */
export function fixedMeals(ctx: DomainCtx): FixedMeal[] {
  const rows = ctx.db
    .select()
    .from(mealPlanItems)
    .innerJoin(mealTemplates, eq(mealTemplates.id, mealPlanItems.templateId))
    .where(eq(mealPlanItems.userId, ctx.userId))
    .orderBy(asc(mealPlanItems.sortOrder))
    .all();
  const byKey = new Map<string, FixedMeal>();
  for (const r of rows) {
    const key = r.meal_plan_items.templateId + ':' + r.meal_plan_items.slot;
    const entry =
      byKey.get(key) ?? { template: r.meal_templates, slot: r.meal_plan_items.slot, weekdayMask: 0, planItemIds: [] };
    entry.weekdayMask |= 1 << r.meal_plan_items.weekday;
    entry.planItemIds.push(r.meal_plan_items.id);
    byKey.set(key, entry);
  }
  const order = (s: MealSlot) => MEAL_SLOTS.indexOf(s);
  return [...byKey.values()].sort((a, b) => order(a.slot) - order(b.slot) || a.template.name.localeCompare(b.template.name));
}

/** Sets the weekdays of one fixed meal (food + slot): adds missing days, removes the others. */
export function setFixedMealDays(ctx: DomainCtx, templateId: string, slot: MealSlot, weekdayMask: number): void {
  ctx.db.transaction((tx) => applyFixedMealDays({ ...ctx, db: tx }, templateId, slot, weekdayMask));
}

/** Worker for setFixedMealDays; expects to run inside a transaction. */
function applyFixedMealDays(c: DomainCtx, templateId: string, slot: MealSlot, weekdayMask: number): void {
  if (!Number.isInteger(weekdayMask) || weekdayMask < 0 || weekdayMask > 127) throw new DomainError('INVALID', 'bad weekday mask');
  getTemplate(c, templateId);
  {
    const tx = c.db;
    const existing = tx
      .select()
      .from(mealPlanItems)
      .where(and(eq(mealPlanItems.userId, c.userId), eq(mealPlanItems.templateId, templateId), eq(mealPlanItems.slot, slot)))
      .all();
    const drop = existing.filter((i) => !isBitSet(weekdayMask, i.weekday));
    dropPendingLogs(c, drop.map((i) => i.id));
    for (const i of drop) tx.delete(mealPlanItems).where(eq(mealPlanItems.id, i.id)).run();
    for (let wd = 0; wd < 7; wd++) {
      if (isBitSet(weekdayMask, wd) && !existing.some((i) => i.weekday === wd)) addPlanItem(c, wd, slot, templateId);
    }
    materializeMealLogs(c, todayKey(c));
  }
}

/**
 * One step from "I eat oats every morning" to a tickable row: creates (or updates) the food,
 * plans it on the chosen weekdays and makes it show up today.
 */
export function addFixedMeal(ctx: DomainCtx, input: FixedMealInput): FixedMeal {
  validateTemplate(input);
  if (!MEAL_SLOTS.includes(input.slot)) throw new DomainError('INVALID', 'bad slot');
  const mask = input.weekdayMask ?? 127;
  if (mask <= 0 || mask > 127) throw new DomainError('INVALID', 'pick at least one day');
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const values = {
      name: input.name,
      kcal: input.kcal,
      proteinG: input.proteinG ?? null,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      defaultSlot: input.slot,
    };
    const same = listTemplates(c).find((t) => t.name.toLowerCase() === input.name.trim().toLowerCase());
    const template = same ? updateTemplate(c, same.id, values) : createTemplate(c, values);
    applyFixedMealDays(c, template.id, input.slot, mask);
    return fixedMeals(c).find((f) => f.template.id === template.id && f.slot === input.slot)!;
  });
}

/** Takes a fixed meal off the plan on every day; the food itself stays in the template list. */
export function removeFixedMeal(ctx: DomainCtx, templateId: string, slot: MealSlot): void {
  setFixedMealDays(ctx, templateId, slot, 0);
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
  const eaten = !log.eaten;
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    // Only PLANNED meals earn points: sticking to the plan is the behaviour being rewarded.
    if (log.planned) {
      const key = { reason: 'meal_eaten', refType: 'meal', refId: log.id, date: log.date } as const;
      if (eaten) award(c, { ...key, base: c.settings.rules.mealEaten, note: log.nameSnapshot });
      else reverseActive(c, key, 'visszavonva');
    }
    return tx
      .update(mealLogs)
      .set({ eaten, updatedAt: nowIso(c) })
      .where(eq(mealLogs.id, id))
      .returning()
      .get();
  });
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
  /** What the day ends as if every listed meal gets eaten – "will I hit my goal?". */
  projectedOutcome: KcalOutcome;
  /** Planned meals: how many exist today and how many are ticked. */
  plannedCount: number;
  plannedEaten: number;
  targets: { proteinG: number | null; carbsG: number | null; fatG: number | null };
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
  const plannedKcal = logs.reduce((a, l) => a + l.kcalSnapshot, 0);
  const planned = logs.filter((l) => l.planned);
  const row = ctx.db.select().from(settingsTable).where(eq(settingsTable.userId, ctx.userId)).get();
  return {
    date,
    target: ctx.settings.kcalTarget,
    tolerancePct: ctx.settings.kcalTolerancePct,
    eatenKcal,
    plannedKcal,
    protein: Math.round(sum((l) => l.proteinSnapshot)),
    carbs: Math.round(sum((l) => l.carbsSnapshot)),
    fat: Math.round(sum((l) => l.fatSnapshot)),
    outcome: evaluateKcal({ eaten: eatenKcal, target: ctx.settings.kcalTarget, tolerancePct: ctx.settings.kcalTolerancePct }),
    projectedOutcome: evaluateKcal({ eaten: plannedKcal, target: ctx.settings.kcalTarget, tolerancePct: ctx.settings.kcalTolerancePct }),
    plannedCount: planned.length,
    plannedEaten: planned.filter((l) => l.eaten).length,
    targets: { proteinG: row?.proteinG ?? null, carbsG: row?.carbsG ?? null, fatG: row?.fatG ?? null },
    slots: MEAL_SLOTS.map((slot) => ({ slot, label: SLOT_LABEL[slot], logs: logs.filter((l) => l.slot === slot) })),
  };
}
