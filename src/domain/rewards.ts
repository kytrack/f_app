/**
 * Reward shop: define goals, spend points on them. See docs/SPEC.md §4.5.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  pointLedger,
  rewardRedemptions,
  rewards,
  type NewReward,
  type Reward,
  type RewardRedemption,
} from '@/src/db/schema';
import { DomainError, nowIso, todayKey, type DomainCtx } from './context';
import { balance } from './points/ledger';

export type RewardInput = Pick<NewReward, 'name' | 'cost'> &
  Partial<Pick<NewReward, 'description' | 'icon' | 'repeatable' | 'cooldownDays'>>;

export function getReward(ctx: DomainCtx, id: string): Reward {
  const r = ctx.db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, id), eq(rewards.userId, ctx.userId)))
    .get();
  if (!r || r.deletedAt) throw new DomainError('NOT_FOUND', `reward ${id} not found`);
  return r;
}

export function createReward(ctx: DomainCtx, input: RewardInput): Reward {
  if (!input.name.trim()) throw new DomainError('INVALID', 'name required');
  if (!Number.isInteger(input.cost) || input.cost <= 0) throw new DomainError('INVALID', 'cost must be > 0');
  const ts = nowIso(ctx);
  return ctx.db
    .insert(rewards)
    .values({ ...input, name: input.name.trim(), id: ctx.uuid(), userId: ctx.userId, createdAt: ts, updatedAt: ts })
    .returning()
    .get();
}

export function updateReward(ctx: DomainCtx, id: string, patch: Partial<RewardInput>): Reward {
  getReward(ctx, id);
  if (patch.cost !== undefined && (!Number.isInteger(patch.cost) || patch.cost <= 0)) {
    throw new DomainError('INVALID', 'cost must be > 0');
  }
  return ctx.db
    .update(rewards)
    .set({ ...patch, updatedAt: nowIso(ctx) })
    .where(eq(rewards.id, id))
    .returning()
    .get();
}

export function archiveReward(ctx: DomainCtx, id: string): void {
  getReward(ctx, id);
  const ts = nowIso(ctx);
  ctx.db.update(rewards).set({ archivedAt: ts, updatedAt: ts }).where(eq(rewards.id, id)).run();
}

export function redemptionsFor(ctx: DomainCtx, rewardId: string): RewardRedemption[] {
  return ctx.db
    .select()
    .from(rewardRedemptions)
    .where(eq(rewardRedemptions.rewardId, rewardId))
    .orderBy(desc(rewardRedemptions.redeemedAt))
    .all();
}

export type RewardAvailability =
  | { ok: true }
  | { ok: false; reason: 'INSUFFICIENT_POINTS' | 'ALREADY_REDEEMED' | 'COOLDOWN'; detail?: string };

export function availability(ctx: DomainCtx, reward: Reward, spendable: number): RewardAvailability {
  const past = redemptionsFor(ctx, reward.id);
  if (!reward.repeatable && past.length > 0) return { ok: false, reason: 'ALREADY_REDEEMED' };
  if (reward.cooldownDays && past[0]) {
    const last = new Date(past[0].redeemedAt).getTime();
    const until = last + reward.cooldownDays * 86_400_000;
    if (ctx.now().getTime() < until) {
      return { ok: false, reason: 'COOLDOWN', detail: new Date(until).toISOString() };
    }
  }
  if (spendable < reward.cost) return { ok: false, reason: 'INSUFFICIENT_POINTS' };
  return { ok: true };
}

/** Spends points on a reward. Atomic: balance is re-read inside the transaction. */
export function redeemReward(ctx: DomainCtx, rewardId: string): RewardRedemption {
  const reward = getReward(ctx, rewardId);
  if (reward.archivedAt) throw new DomainError('NOT_FOUND', 'reward archived');
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx };
    const avail = availability(c, reward, balance(c).spendable);
    if (!avail.ok) throw new DomainError(avail.reason, `cannot redeem ${reward.name}: ${avail.reason}`);
    const ts = nowIso(c);
    const entry = tx
      .insert(pointLedger)
      .values({
        id: c.uuid(),
        userId: c.userId,
        delta: -reward.cost,
        reason: 'reward_redeem',
        refType: 'reward',
        refId: reward.id,
        date: todayKey(c),
        multiplier: 1,
        note: reward.name,
        createdAt: ts,
      })
      .returning()
      .get();
    return tx
      .insert(rewardRedemptions)
      .values({ id: c.uuid(), rewardId: reward.id, costSnapshot: reward.cost, ledgerId: entry.id, redeemedAt: ts })
      .returning()
      .get();
  });
}

export function markFulfilled(ctx: DomainCtx, redemptionId: string): void {
  ctx.db
    .update(rewardRedemptions)
    .set({ fulfilledAt: nowIso(ctx) })
    .where(eq(rewardRedemptions.id, redemptionId))
    .run();
}

export interface RewardView {
  reward: Reward;
  availability: RewardAvailability;
  /** 0..1 of cost already covered by spendable points. */
  progress: number;
  missing: number;
  redeemedCount: number;
}

export function rewardShop(ctx: DomainCtx): { spendable: number; items: RewardView[] } {
  const { spendable } = balance(ctx);
  const list = ctx.db
    .select()
    .from(rewards)
    .where(and(eq(rewards.userId, ctx.userId), isNull(rewards.archivedAt), isNull(rewards.deletedAt)))
    .orderBy(asc(rewards.cost))
    .all();
  return {
    spendable,
    items: list.map((reward) => ({
      reward,
      availability: availability(ctx, reward, spendable),
      progress: Math.min(1, spendable / reward.cost),
      missing: Math.max(0, reward.cost - spendable),
      redeemedCount: redemptionsFor(ctx, reward.id).length,
    })),
  };
}
