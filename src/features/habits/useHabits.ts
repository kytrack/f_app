import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useDomain } from '@/src/db/domain';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  getHabit,
  listAllHabits,
  reorderHabit,
  restoreHabit,
  recordRelapse,
  setHabitCount,
  skipHabit,
  tapHabit,
  updateHabit,
  type HabitInput,
} from '@/src/domain/habits';
import { keys, ROOT_KEY, useDomainMutation } from '../queries';

export function useAllHabits() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'allHabits'], queryFn: () => listAllHabits(ctx) });
}

export function useHabit(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: keys.habit(id ?? 'none'),
    queryFn: () => getHabit(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useHabitActions() {
  const ctx = useDomain();
  const tap = useDomainMutation(({ habitId, date }: { habitId: string; date: string }) => {
    const log = tapHabit(ctx, habitId, date);
    void Haptics.impactAsync(
      log.status === 'done' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    return log;
  });
  const setCount = useDomainMutation(
    ({ habitId, date, count }: { habitId: string; date: string; count: number }) =>
      setHabitCount(ctx, habitId, date, count),
  );
  const skip = useDomainMutation(({ habitId, date }: { habitId: string; date: string }) =>
    skipHabit(ctx, habitId, date),
  );
  const relapse = useDomainMutation(
    ({ habitId, date, delta }: { habitId: string; date: string; delta: 1 | -1 }) => {
      const log = recordRelapse(ctx, habitId, date, delta);
      if (delta === 1) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return log;
    },
  );
  const create = useDomainMutation((input: HabitInput) => createHabit(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<HabitInput> }) =>
    updateHabit(ctx, id, patch),
  );
  const archive = useDomainMutation((id: string) => archiveHabit(ctx, id));
  const restore = useDomainMutation((id: string) => restoreHabit(ctx, id));
  const remove = useDomainMutation((id: string) => deleteHabit(ctx, id));
  const reorder = useDomainMutation(({ id, direction }: { id: string; direction: 'up' | 'down' }) =>
    reorderHabit(ctx, id, direction),
  );
  return { tap, setCount, skip, relapse, create, update, archive, restore, remove, reorder };
}
