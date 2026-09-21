import { beforeEach, describe, expect, it } from 'vitest';
import { closeDay } from '@/src/domain/dayClose';
import { createHabit, tapHabit } from '@/src/domain/habits';
import { addAdHocMeal, addFixedMeal, dayNutrition, listTemplates, toggleMeal } from '@/src/domain/meals';
import { balance, recentEntries } from '@/src/domain/points/ledger';
import { createTestWorld, type TestWorld } from '../helpers/db';

const D8 = '2026-09-08';

describe('meal points and the perfect day', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-08T10:00:00Z');
    w.ctx.settings.kcalTarget = 2000;
  });

  const logs = () => dayNutrition(w.ctx, D8).slots.flatMap((s) => s.logs);

  it('ticking a planned meal earns points, unticking reverses, re-ticking pays once', () => {
    addFixedMeal(w.ctx, { name: 'Zabkása', kcal: 450, slot: 'breakfast' });
    const [log] = logs();
    toggleMeal(w.ctx, log.id);
    expect(balance(w.ctx)).toMatchObject({ raw: 3, xp: 3 });
    expect(recentEntries(w.ctx)[0]).toMatchObject({ reason: 'meal_eaten', refType: 'meal', refId: log.id, note: 'Zabkása' });
    toggleMeal(w.ctx, log.id);
    expect(balance(w.ctx)).toMatchObject({ raw: 0, xp: 0 });
    toggleMeal(w.ctx, log.id);
    expect(balance(w.ctx).raw).toBe(3);
  });

  it('ad-hoc meals earn nothing; the rule value is respected and 0 disables it', () => {
    addFixedMeal(w.ctx, { name: 'Süti', kcal: 300, slot: 'snack', weekdayMask: 0b1000000 }); // Sunday only → no row today
    addAdHocMeal(w.ctx, D8, listTemplates(w.ctx)[0].id);
    expect(balance(w.ctx).raw).toBe(0);
    w.ctx.settings.rules.mealEaten = 7;
    addFixedMeal(w.ctx, { name: 'Ebéd', kcal: 700, slot: 'lunch' });
    toggleMeal(w.ctx, logs().find((l) => l.planned)!.id);
    expect(balance(w.ctx).raw).toBe(7);
    w.ctx.settings.rules.mealEaten = 0;
    addFixedMeal(w.ctx, { name: 'Vacsora', kcal: 600, slot: 'dinner' });
    toggleMeal(w.ctx, logs().find((l) => l.planned && !l.eaten)!.id);
    expect(balance(w.ctx).raw).toBe(7);
  });

  it('perfect day needs the kcal goal when meals are tracked', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, D8);
    addFixedMeal(w.ctx, { name: 'Kevés', kcal: 900, slot: 'lunch' });
    toggleMeal(w.ctx, logs()[0].id); // 900 of 2000 → under
    w.advanceDays(1);
    const s = closeDay(w.ctx, D8)!;
    expect(s.perfectDay).toBe(false);
    expect(recentEntries(w.ctx).some((e) => e.reason === 'perfect_day')).toBe(false);
  });

  it('perfect day is granted when the goal is hit, and also when the rule is off', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, D8);
    addFixedMeal(w.ctx, { name: 'Teljes nap', kcal: 2000, slot: 'lunch' });
    toggleMeal(w.ctx, logs()[0].id);
    w.advanceDays(1);
    expect(closeDay(w.ctx, D8)!.perfectDay).toBe(true);
    // 10 habit + 3 meal + 20 kcal goal + 25 perfect day
    expect(balance(w.ctx).raw).toBe(58);

    // next day: under target, but the rule is switched off → still perfect
    w.ctx.settings.rules.perfectDayNeedsKcal = 0;
    tapHabit(w.ctx, h.id, '2026-09-09');
    w.advanceDays(1);
    expect(closeDay(w.ctx, '2026-09-09')!.perfectDay).toBe(true);
  });

  it('days without any meal rows or without a target are not held back', () => {
    const h = createHabit(w.ctx, { name: 'h', kind: 'good' });
    tapHabit(w.ctx, h.id, D8);
    w.advanceDays(1);
    expect(closeDay(w.ctx, D8)!.perfectDay).toBe(true); // no meals tracked that day

    w.ctx.settings.kcalTarget = null;
    addFixedMeal(w.ctx, { name: 'x', kcal: 500, slot: 'lunch' });
    tapHabit(w.ctx, h.id, '2026-09-09');
    w.advanceDays(1);
    expect(closeDay(w.ctx, '2026-09-09')!.perfectDay).toBe(true); // no target → cannot be required
  });
});
