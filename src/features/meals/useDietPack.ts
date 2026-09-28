import { useDomain } from '@/src/db/domain';
import { applyDietPack } from '@/src/domain/dietPack';
import { onSettingsChange, useDomainMutation } from '../queries';

export function useDietPackActions() {
  const ctx = useDomain();
  const apply = useDomainMutation(({ packId, week }: { packId: string; week: number }) => {
    const r = applyDietPack(ctx, packId, week);
    onSettingsChange.forEach((fn) => fn()); // kcal + macro targets live in the DomainCtx snapshot
    return r;
  });
  return { apply };
}
