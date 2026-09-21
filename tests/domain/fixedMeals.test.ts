import { beforeEach, describe, expect, it } from 'vitest';
import {
  addFixedMeal,
  archiveTemplate,
  dayNutrition,
  fixedMeals,
  listTemplates,
  materializeMealLogs,
  removeFixedMeal,
  setFixedMealDays,
  toggleMeal,
  updateTemplate,
} from '@/src/domain/meals';
import { createTestWorld, type TestWorld } from '../helpers/db';

const TODAY = '2026-09-09'; // Wednesday (weekday 2)

describe('fixed daily meals', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
    w.ctx.settings.kcalTarget = 2000;
  });

  const logsToday = () => dayNutrition(w.ctx, TODAY).slots.flatMap((s) => s.logs);

  it('one step: food + every-day plan + a tickable row today', () => {
    const f = addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, proteinG: 20, slot: 'breakfast' });
    expect(f.weekdayMask).toBe(127);
    expect(f.planItemIds).toHaveLength(7);
    expect(logsToday().map((l) => [l.nameSnapshot, l.kcalSnapshot, l.eaten, l.planned])).toEqual([['Zabkása', 450, false, true]]);
    expect(materializeMealLogs(w.ctx, TODAY)).toEqual([]); // already there
  });

  it('ticking counts kcal and tells whether the goal will be reached', () => {
    addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, slot: 'breakfast' });
    addFixedMeal(w.ctx, { name: 'Csirke rizzsel', kcal: 750, slot: 'lunch' });
    addFixedMeal(w.ctx, { name: 'Túró', kcal: 300, slot: 'snack' });
    addFixedMeal(w.ctx, { name: 'Lazac', kcal: 550, slot: 'dinner' });
    let n = dayNutrition(w.ctx, TODAY);
    expect(n).toMatchObject({ plannedKcal: 2050, eatenKcal: 0, outcome: 'no_data', projectedOutcome: 'hit', plannedCount: 4, plannedEaten: 0 });
    const [breakfast, lunch] = logsToday();
    toggleMeal(w.ctx, breakfast.id);
    toggleMeal(w.ctx, lunch.id);
    n = dayNutrition(w.ctx, TODAY);
    expect(n).toMatchObject({ eatenKcal: 1200, outcome: 'under', projectedOutcome: 'hit', plannedEaten: 2 });
    for (const l of logsToday().slice(2)) toggleMeal(w.ctx, l.id);
    expect(dayNutrition(w.ctx, TODAY)).toMatchObject({ eatenKcal: 2050, outcome: 'hit', plannedEaten: 4 });
  });

  it('projection warns when the plan itself overshoots or falls short', () => {
    addFixedMeal(w.ctx, { name: 'Nagy menü', kcal: 2600, slot: 'lunch' });
    expect(dayNutrition(w.ctx, TODAY).projectedOutcome).toBe('over');
    removeFixedMeal(w.ctx, listTemplates(w.ctx)[0].id, 'lunch');
    addFixedMeal(w.ctx, { name: 'Saláta', kcal: 500, slot: 'lunch' });
    expect(dayNutrition(w.ctx, TODAY).projectedOutcome).toBe('under');
  });

  it('only on chosen weekdays; changing days updates today', () => {
    const f = addFixedMeal(w.ctx, { name: 'Edzés utáni shake', kcal: 250, slot: 'snack', weekdayMask: 0b0000001 }); // Monday
    expect(logsToday()).toHaveLength(0);
    setFixedMealDays(w.ctx, f.template.id, 'snack', 0b0000101); // Mon + Wed
    expect(logsToday()).toHaveLength(1);
    expect(fixedMeals(w.ctx)[0].weekdayMask).toBe(0b0000101);
    setFixedMealDays(w.ctx, f.template.id, 'snack', 0b0000001);
    expect(logsToday()).toHaveLength(0); // un-eaten row for today disappears
  });

  it('removing keeps what was already eaten; the food stays as a template', () => {
    const f = addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, slot: 'breakfast' });
    toggleMeal(w.ctx, logsToday()[0].id);
    removeFixedMeal(w.ctx, f.template.id, 'breakfast');
    expect(fixedMeals(w.ctx)).toEqual([]);
    expect(logsToday().map((l) => l.eaten)).toEqual([true]);
    expect(listTemplates(w.ctx).map((t) => t.name)).toEqual(['Zabkása']);
  });

  it('same name updates the food instead of duplicating; pending rows follow edits', () => {
    addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, slot: 'breakfast' });
    addFixedMeal(w.ctx, { name: ' zabkása ', kcal: 500, slot: 'breakfast' });
    expect(listTemplates(w.ctx)).toHaveLength(1);
    expect(fixedMeals(w.ctx)).toHaveLength(1);
    expect(logsToday()[0].kcalSnapshot).toBe(500);
    updateTemplate(w.ctx, listTemplates(w.ctx)[0].id, { kcal: 520 });
    expect(logsToday()[0].kcalSnapshot).toBe(520);
  });

  it('archiving a food removes its pending rows; validates input', () => {
    const f = addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, slot: 'breakfast' });
    archiveTemplate(w.ctx, f.template.id);
    expect(logsToday()).toHaveLength(0);
    expect(() => addFixedMeal(w.ctx, { name: '', kcal: 1, slot: 'lunch' })).toThrow(/name/);
    expect(() => addFixedMeal(w.ctx, { name: 'x', kcal: 1, slot: 'lunch', weekdayMask: 0 })).toThrow(/at least one day/);
  });
});
