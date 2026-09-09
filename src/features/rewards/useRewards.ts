import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useDomain } from '@/src/db/domain';
import {
  archiveReward,
  createReward,
  getReward,
  redeemReward,
  rewardShop,
  updateReward,
  type RewardInput,
} from '@/src/domain/rewards';
import { keys, useDomainMutation } from '../queries';

export function useRewardShop() {
  const ctx = useDomain();
  return useQuery({ queryKey: keys.shop(), queryFn: () => rewardShop(ctx) });
}

export function useReward(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: keys.reward(id ?? 'none'),
    queryFn: () => getReward(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useRewardActions() {
  const ctx = useDomain();
  const redeem = useDomainMutation((id: string) => {
    const r = redeemReward(ctx, id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return r;
  });
  const create = useDomainMutation((input: RewardInput) => createReward(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<RewardInput> }) =>
    updateReward(ctx, id, patch),
  );
  const archive = useDomainMutation((id: string) => archiveReward(ctx, id));
  return { redeem, create, update, archive };
}
