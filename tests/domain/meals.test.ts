import { beforeEach, describe, expect, it } from 'vitest';
import { closePendingDays } from '@/src/domain/dayClose';
import {
  addAdHocMeal,
  addCustomMeal,
  addPlanItem,
  archiveTemplate,
  copyWeekday,
  createTemplate,
  dayNutrition,
  materializeMealLogs,
  removeMealLog,
  removePlanItem,
  toggleMeal,
  updateTemplate,
  weekPlan,
} from '@/src/domain/meals';
import { balance } from '@/src/domain/points/ledger';
import { updateSettings } from '@/src/domain/settings';
import { dailySummaries } from '@/src/db/schema';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09'; // Wednesday = weekday 2

describe('meals', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
    w.ctx.settings.kcalTarget = 2000;
  });

  it('weekly plan generates planned logs once per day', () => {
    const oats = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400, proteinG: 15, defaultSlot: 'breakfast' });
    const chicken = createTemplate(w.ctx, { name: 'Csirke rizzsel', kcal: 700, proteinG: 50, defaultSlot: 'lunch' });
    addPlanItem(w.ctx, 2, 'breakfast', oats.id);
    addPlanItem(w.ctx, 2, 'lunch', chicken.id);
    expect(materializeMealLogs(w.ctx, TODAY)).toHaveLength(2);
    expect(materializeMealLogs(w.ctx, TODAY)).toHaveLength(0);
    expect(materializeMealLogs(w.ctx, '2026-09-10')).toHaveLength(0); // Thursday has no plan
    const n = dayNutrition(w.ctx, TODAY);
    expect(n.plannedKcal).toBe(1100);
    expect(n.eatenKcal).toBe(0);
    expect(n.outcome).toBe('no_data');
    expect(n.slots.find((s) => s.slot === 'breakfast')?.logs[0].nameSnapshot).toBe('Zabkása');
  });

  it('ticking meals sums kcal and macros; template edits do not rewrite snapshots', () => {
    const oats = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400, proteinG: 15, carbsG: 60, fatG: 8 });
    addPlanItem(w.ctx, 2, 'breakfast', oats.id);
    const [log] = materializeMealLogs(w.ctx, TODAY);
    toggleMeal(w.ctx, log.id);
    updateTemplate(w.ctx, oats.id, { kcal: 999 });
    const n = dayNutrition(w.ctx, TODAY);
    expect(n.eatenKcal).toBe(400);
    expect(n.protein).toBe(15);
    expect(n.carbs).toBe(60);
    expect(n.fat).toBe(8);
    expect(toggleMeal(w.ctx, log.id).eaten).toBe(false);
  });

  it('ad-hoc and custom meals count immediately and can be removed', () => {
    const cake = createTemplate(w.ctx, { name: 'Süti', kcal: 350, defaultSlot: 'snack' });
    const a = addAdHocMeal(w.ctx, TODAY, cake.id);
    expect(a.slot).toBe('snack');
    expect(a.eaten).toBe(true);
    const c = addCustomMeal(w.ctx, TODAY, { name: 'Étterem', kcal: 900, slot: 'dinner' });
    expect(dayNutrition(w.ctx, TODAY).eatenKcal).toBe(1250);
    removeMealLog(w.ctx, c.id);
    expect(dayNutrition(w.ctx, TODAY).eatenKcal).toBe(350);
    expect(() => addCustomMeal(w.ctx, TODAY, { name: '', kcal: 1, slot: 'snack' })).toThrow(/name/);
  });

  it('planned meals cannot be removed, only unticked; locked days refuse edits', () => {
    const oats = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400 });
    addPlanItem(w.ctx, 2, 'breakfast', oats.id);
    const [log] = materializeMealLogs(w.ctx, TODAY);
    expect(() => removeMealLog(w.ctx, log.id)).toThrow(/planned/);
    w.advanceDays(3);
    expect(() => toggleMeal(w.ctx, log.id)).toThrow(/locked/);
  });

  it('copyWeekday clones a day; archiving a template drops it from the plan', () => {
    const oats = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400 });
    addPlanItem(w.ctx, 0, 'breakfast', oats.id);
    copyWeekday(w.ctx, 0, [1, 2, 3, 4]);
    expect(weekPlan(w.ctx, 3)).toHaveLength(1);
    removePlanItem(w.ctx, weekPlan(w.ctx, 4)[0].id);
    expect(weekPlan(w.ctx, 4)).toHaveLength(0);
    archiveTemplate(w.ctx, oats.id);
    expect(weekPlan(w.ctx, 0)).toHaveLength(0);
  });

  it('day close awards the kcal goal within tolerance and penalises overeating', () => {
    const meal = createTemplate(w.ctx, { name: 'Menü', kcal: 1000 });
    addAdHocMeal(w.ctx, TODAY, meal.id);
    addAdHocMeal(w.ctx, TODAY, meal.id); // 2000 = target
    w.advanceDays(1);
    closePendingDays(w.ctx);
    expect(balance(w.ctx).raw).toBe(20);
    const summary = w.ctx.db.select().from(dailySummaries).get();
    expect(summary).toMatchObject({ kcalEaten: 2000, kcalGoalHit: true, kcalTarget: 2000 });

    // next day: 2500 kcal → over by 25% → -10
    addAdHocMeal(w.ctx, '2026-09-10', meal.id);
    addAdHocMeal(w.ctx, '2026-09-10', meal.id);
    const half = createTemplate(w.ctx, { name: 'Fél', kcal: 500 });
    addAdHocMeal(w.ctx, '2026-09-10', half.id);
    w.advanceDays(1);
    closePendingDays(w.ctx);
    expect(balance(w.ctx).raw).toBe(10);

    // a day without any food is neutral
    w.advanceDays(1);
    closePendingDays(w.ctx);
    expect(balance(w.ctx).raw).toBe(10);
  });

  it('day close materialises today and tomorrow from the weekly plan', () => {
    const oats = createTemplate(w.ctx, { name: 'Zabkása', kcal: 400 });
    for (let d = 0; d < 7; d++) addPlanItem(w.ctx, d, 'breakfast', oats.id);
    closePendingDays(w.ctx);
    expect(dayNutrition(w.ctx, TODAY).slots[0].logs).toHaveLength(1);
    expect(dayNutrition(w.ctx, '2026-09-10').slots[0].logs).toHaveLength(1);
    expect(dayNutrition(w.ctx, '2026-09-11').slots[0].logs).toHaveLength(0);
  });

  it('settings validation', () => {
    expect(() => updateSettings(w.ctx, { kcalTarget: 100 })).toThrow(/kcalTarget/);
    expect(updateSettings(w.ctx, { kcalTarget: 2200, proteinG: 150 })).toMatchObject({ kcalTarget: 2200, proteinG: 150, theme: 'system' });
    expect(updateSettings(w.ctx, { theme: 'dark' }).theme).toBe('dark');
    expect(() => updateSettings(w.ctx, { theme: 'neon' as never })).toThrow(/theme/);
  });
});
