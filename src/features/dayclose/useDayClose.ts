import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { closePendingDays } from '@/src/domain/dayClose';
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
        if (closed.length > 0) qc.invalidateQueries({ queryKey: ROOT_KEY });
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
