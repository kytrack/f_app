import { beforeEach, describe, expect, it } from 'vitest';
import { mealTemplates, settings } from '@/src/db/schema';
import { applyDietPack, DIET_PACKS, dietDayTotals, getDietPack, WEIGHT_LOSS_PACK } from '@/src/domain/dietPack';
import { archiveTemplate, dayNutrition, listTemplates, materializeMealLogs, toggleMeal, weekPlan } from '@/src/domain/meals';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('diet pack data', () => {
  it('every meal key used by a week exists, every slot is covered, every meal is used at least once', () => {
    for (const pack of DIET_PACKS) {
      const used = new Set<string>();
      for (const week of pack.weeks) {
        expect(week.days).toHaveLength(7);
        for (const d of week.days) {
          for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
            expect(d[slot].length).toBeGreaterThan(0);
            for (const k of d[slot]) {
              const meal = pack.meals.find((m) => m.key === k);
              expect(meal, `${pack.id}: missing ${k}`).toBeDefined();
              expect(meal!.slot).toBe(slot);
              used.add(k);
            }
          }
        }
      }
      for (const m of pack.meals) expect(used.has(m.key), `${m.key} unused`).toBe(true);
      expect(new Set(pack.meals.map((m) => m.name)).size).toBe(pack.meals.length);
    }
  });

  it('every day lands inside the kcal tolerance and macros add up to the kcal', () => {
    const pack = WEIGHT_LOSS_PACK;
    for (const week of pack.weeks) {
      for (const d of week.days) {
        const t = dietDayTotals(pack, d);
        expect(Math.abs(t.kcal - pack.kcalTarget) / pack.kcalTarget).toBeLessThanOrEqual(0.1);
        expect(t.p).toBeGreaterThanOrEqual(140);
      }
    }
    for (const m of pack.meals) {
      const fromMacros = m.p * 4 + m.c * 4 + m.f * 9;
      expect(Math.abs(fromMacros - m.kcal) / m.kcal, `${m.key} macros vs kcal`).toBeLessThan(0.15);
      expect(m.notes.length).toBeGreaterThan(20);
    }
    expect(pack.weeks[0].days.map((d) => d.lunch[0])).not.toEqual(pack.weeks[1].days.map((d) => d.lunch[0]));
  });
});

describe('applyDietPack', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z'); // Wednesday
  });

  it('creates the templates, fills all seven days and sets the targets', () => {
    const r = applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 0);
    expect(r.templates).toBe(WEIGHT_LOSS_PACK.meals.length);
    expect(r.planItems).toBe(7 * 5);
    expect(listTemplates(w.ctx)).toHaveLength(WEIGHT_LOSS_PACK.meals.length);
    const wed = weekPlan(w.ctx, 2);
    expect(wed.map((i) => i.slot).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack', 'snack']);
    const wedBreakfast = wed.find((i) => i.slot === 'breakfast')!;
    expect(wedBreakfast.template.name).toBe('Zabos-túrós palacsinta gyümölccsel');
    expect(wedBreakfast.template.notes).toContain('zabpehely');
    const s = w.ctx.db.select().from(settings).get()!;
    expect(s).toMatchObject({ kcalTarget: 2100, proteinG: 160, carbsG: 215, fatG: 62 });
    const logs = materializeMealLogs(w.ctx, '2026-09-09');
    expect(logs).toHaveLength(5);
    expect(dayNutrition(w.ctx, '2026-09-09').slots.find((x) => x.slot === 'breakfast')!.logs[0].notes).toContain('zabpehely');
  });

  it('re-applying (or switching weeks) reuses templates and does not duplicate anything', () => {
    applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 0);
    const before = listTemplates(w.ctx).map((t) => t.id).sort();
    applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 1);
    expect(listTemplates(w.ctx).map((t) => t.id).sort()).toEqual(before);
    expect(weekPlan(w.ctx, 0).find((i) => i.slot === 'lunch')!.template.name).toBe('Csirkés-gombás rizottó');
    expect(w.ctx.db.select().from(mealTemplates).all()).toHaveLength(WEIGHT_LOSS_PACK.meals.length);
  });

  it('restores an archived template instead of creating a twin, and keeps eaten logs', () => {
    applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 0);
    const [log] = materializeMealLogs(w.ctx, '2026-09-09');
    toggleMeal(w.ctx, log.id);
    const tpl = listTemplates(w.ctx).find((t) => t.name === 'Alma + 25 g mandula')!;
    archiveTemplate(w.ctx, tpl.id);
    applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 1);
    const again = listTemplates(w.ctx).find((t) => t.name === 'Alma + 25 g mandula')!;
    expect(again.id).toBe(tpl.id);
    expect(again.archivedAt).toBeNull();
    const n = dayNutrition(w.ctx, '2026-09-09');
    expect(n.slots.flatMap((s) => s.logs).some((l) => l.id === log.id && l.eaten)).toBe(true); // eaten log survives the plan swap
    expect(() => applyDietPack(w.ctx, 'nope')).toThrow(/not found/);
    expect(() => applyDietPack(w.ctx, WEIGHT_LOSS_PACK.id, 9)).toThrow(/week/);
    expect(getDietPack(WEIGHT_LOSS_PACK.id).name).toContain('Fogyás');
  });
});
