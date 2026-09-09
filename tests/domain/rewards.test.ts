import { beforeEach, describe, expect, it } from 'vitest';
import { award, balance } from '@/src/domain/points/ledger';
import { archiveReward, createReward, markFulfilled, redeemReward, rewardShop } from '@/src/domain/rewards';
import { createTestWorld, type TestWorld } from '../helpers/db';

function earn(w: TestWorld, points: number, refId = 'h1') {
  award(w.ctx, { reason: 'habit_done', refType: 'habit', refId, date: '2026-09-09', base: points });
}

describe('rewards', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld();
  });

  it('refuses redemption without cover and spends exactly the cost', () => {
    const r = createReward(w.ctx, { name: 'Mozi', cost: 100 });
    earn(w, 60);
    expect(() => redeemReward(w.ctx, r.id)).toThrow(/INSUFFICIENT_POINTS/);
    earn(w, 60, 'h2');
    const red = redeemReward(w.ctx, r.id);
    expect(red.costSnapshot).toBe(100);
    expect(balance(w.ctx)).toMatchObject({ raw: 20, spendable: 20, xp: 120 }); // xp untouched by spending
  });

  it('one-time rewards cannot be redeemed twice', () => {
    const r = createReward(w.ctx, { name: 'Cipő', cost: 10, repeatable: false });
    earn(w, 100);
    redeemReward(w.ctx, r.id);
    expect(() => redeemReward(w.ctx, r.id)).toThrow(/ALREADY_REDEEMED/);
  });

  it('cooldown blocks until the window passes', () => {
    const r = createReward(w.ctx, { name: 'Pizza', cost: 10, cooldownDays: 7 });
    earn(w, 100);
    redeemReward(w.ctx, r.id);
    expect(() => redeemReward(w.ctx, r.id)).toThrow(/COOLDOWN/);
    w.advanceDays(7);
    expect(redeemReward(w.ctx, r.id).costSnapshot).toBe(10);
  });

  it('archived rewards disappear from the shop and cannot be redeemed', () => {
    const r = createReward(w.ctx, { name: 'Régi', cost: 10 });
    archiveReward(w.ctx, r.id);
    expect(rewardShop(w.ctx).items).toHaveLength(0);
    expect(() => redeemReward(w.ctx, r.id)).toThrow(/archived/);
  });

  it('shop reports progress and missing points', () => {
    createReward(w.ctx, { name: 'Kicsi', cost: 50 });
    createReward(w.ctx, { name: 'Nagy', cost: 200 });
    earn(w, 100);
    const shop = rewardShop(w.ctx);
    expect(shop.spendable).toBe(100);
    expect(shop.items.map((i) => i.reward.name)).toEqual(['Kicsi', 'Nagy']); // cheapest first
    expect(shop.items[0]).toMatchObject({ progress: 1, missing: 0, availability: { ok: true } });
    expect(shop.items[1]).toMatchObject({ progress: 0.5, missing: 100 });
    expect(shop.items[1].availability).toEqual({ ok: false, reason: 'INSUFFICIENT_POINTS' });
  });

  it('validates cost and marks fulfilment', () => {
    expect(() => createReward(w.ctx, { name: 'x', cost: 0 })).toThrow(/cost/);
    const r = createReward(w.ctx, { name: 'x', cost: 5 });
    earn(w, 10);
    const red = redeemReward(w.ctx, r.id);
    markFulfilled(w.ctx, red.id);
    expect(rewardShop(w.ctx).items[0].redeemedCount).toBe(1);
  });
});
