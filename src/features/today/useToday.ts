import { useQuery } from '@tanstack/react-query';
import { useDomain } from '@/src/db/domain';
import { todayKey } from '@/src/domain/context';
import { habitsWithLogs } from '@/src/domain/habits';
import { balance, levelProgress, pointsForDay, recentEntries } from '@/src/domain/points/ledger';
import { tasksForDay } from '@/src/domain/tasks';
import { keys } from '../queries';

export function useTodayKey(): string {
  const ctx = useDomain();
  // Re-evaluated on every render; the "Ma" screen re-renders on focus/app-active anyway.
  return todayKey(ctx);
}

export function useToday() {
  const ctx = useDomain();
  const date = todayKey(ctx);
  return useQuery({
    queryKey: keys.today(date),
    queryFn: () => ({
      date,
      habits: habitsWithLogs(ctx, date),
      tasks: tasksForDay(ctx, date),
      points: pointsForDay(ctx, date),
    }),
  });
}

export function usePoints() {
  const ctx = useDomain();
  return useQuery({
    queryKey: keys.points(),
    queryFn: () => {
      const b = balance(ctx);
      return { ...b, ...levelProgress(b.xp) };
    },
  });
}

export function useHistory(limit = 100) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...keys.history(), limit],
    queryFn: () => recentEntries(ctx, limit),
  });
}
