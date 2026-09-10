/**
 * Query keys + a single invalidation entry point. The whole app hangs off ['lifeos'],
 * so any domain mutation invalidates everything – trivial and always correct for a
 * one-user local database.
 */
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { DomainError } from '@/src/domain/context';

export const ROOT_KEY = ['lifeos'] as const;

/** Listeners run after every successful domain mutation (e.g. notification re-planning). */
export const onDomainChange = new Set<() => void>();
export const keys = {
  today: (date: string) => [...ROOT_KEY, 'today', date] as const,
  points: () => [...ROOT_KEY, 'points'] as const,
  habit: (id: string) => [...ROOT_KEY, 'habit', id] as const,
  task: (id: string) => [...ROOT_KEY, 'task', id] as const,
  reward: (id: string) => [...ROOT_KEY, 'reward', id] as const,
  event: (id: string) => [...ROOT_KEY, 'event', id] as const,
  shop: () => [...ROOT_KEY, 'shop'] as const,
  history: () => [...ROOT_KEY, 'history'] as const,
};

/** useMutation that invalidates the whole app cache on success. */
export function useDomainMutation<TVars, TResult>(
  fn: (vars: TVars) => TResult,
  options?: Omit<UseMutationOptions<TResult, Error, TVars>, 'mutationFn'>,
) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: async (vars) => fn(vars),
    ...options,
    onSuccess: (data, vars, ctx, mutation) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      onDomainChange.forEach((fn) => fn());
      options?.onSuccess?.(data, vars, ctx, mutation);
    },
  });
}

export function describeError(e: unknown): string {
  if (e instanceof DomainError) {
    switch (e.code) {
      case 'INSUFFICIENT_POINTS':
        return 'Nincs elég pontod ehhez.';
      case 'ALREADY_REDEEMED':
        return 'Ezt már beváltottad, egyszeri jutalom.';
      case 'COOLDOWN':
        return 'Ez a jutalom még pihen, később újra beváltható.';
      case 'DAY_LOCKED':
        return 'Ez a nap már lezárult, nem szerkeszthető.';
      case 'NOT_FOUND':
        return 'Nem található.';
      case 'INVALID':
        return e.message;
    }
  }
  return e instanceof Error ? e.message : 'Ismeretlen hiba';
}
