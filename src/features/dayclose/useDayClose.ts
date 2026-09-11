import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { dailySummaries } from '@/src/db/schema';
import { closePendingDays } from '@/src/domain/dayClose';
import { celebrate } from '@/src/store/celebration';
import { ROOT_KEY } from '../queries';

/**
 * Settles every unsettled past day on mount and whenever the app returns to the
 * foreground (the phone may have slept through midnight). Cheap when nothing is pending.
 */
export function useDayClose() {
  const ctx = useDomain();
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    const run = () => {
      if (running.current) return;
      running.current = true;
      try {
        const closed = closePendingDays(ctx);
        if (closed.length > 0) {
          qc.invalidateQueries({ queryKey: ROOT_KEY });
          const perfect = ctx.db
            .select({ date: dailySummaries.date })
            .from(dailySummaries)
            .where(and(eq(dailySummaries.userId, ctx.userId), inArray(dailySummaries.date, closed), eq(dailySummaries.perfectDay, true)))
            .all();
          if (perfect.length > 0) celebrate({ type: 'perfect', date: perfect[perfect.length - 1].date, count: perfect.length });
        }
      } catch (e) {
        console.error('day close failed', e);
      } finally {
        running.current = false;
      }
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [ctx, qc]);
}
