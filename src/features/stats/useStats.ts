import { useQuery } from '@tanstack/react-query';
import { useDomain } from '@/src/db/domain';
import { exerciseProgress, habitHeatmap, kcalHistory, overview, pointsHistory, weeklyPoints } from '@/src/domain/stats';
import { ROOT_KEY } from '../queries';

export function useStats() {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'stats'],
    queryFn: () => ({
      overview: overview(ctx),
      days: pointsHistory(ctx, 28),
      weeks: weeklyPoints(ctx, 8),
      heatmap: habitHeatmap(ctx, 84),
      exercises: exerciseProgress(ctx, 90),
      kcal: kcalHistory(ctx, 28),
    }),
  });
}
