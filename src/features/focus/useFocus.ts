import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import {
  activeFocus,
  cancelFocus,
  checkinFocus,
  createFocus,
  deleteFocus,
  finishFocus,
  getFocus,
  listFocus,
  nextFocus,
  unsettledFocus,
  updateFocus,
  type FocusInput,
} from '@/src/domain/focus';
import { canAutoPrompt } from '@/src/notifications/taps';
import { celebrate } from '@/src/store/celebration';
import { ROOT_KEY, useDomainMutation } from '../queries';

const key = (name: string, ...rest: string[]) => [...ROOT_KEY, 'focus', name, ...rest];

/** What the home screen needs: the running block, the next one, and any that ended unanswered. */
export function useFocusOverview() {
  const ctx = useDomain();
  return useQuery({
    queryKey: key('overview'),
    queryFn: () => ({ active: activeFocus(ctx), next: nextFocus(ctx), unsettled: unsettledFocus(ctx) }),
    // Status flips at start/end times without any mutation: poll gently.
    refetchInterval: 30_000,
  });
}

export function useFocusSession(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: key('session', id ?? 'none'),
    queryFn: () => getFocus(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useFocusList() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('list'), queryFn: () => listFocus(ctx) });
}

export function useFocusActions() {
  const ctx = useDomain();
  const create = useDomainMutation((input: FocusInput) => createFocus(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<FocusInput> }) => updateFocus(ctx, id, patch));
  const remove = useDomainMutation((id: string) => deleteFocus(ctx, id));
  const checkin = useDomainMutation((id: string) => {
    const s = checkinFocus(ctx, id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    return s;
  });
  const finish = useDomainMutation((id: string) => {
    const result = finishFocus(ctx, id);
    if (result.points > 0) celebrate({ type: 'focus', title: result.session.title, points: result.points });
    return result;
  });
  const cancel = useDomainMutation((id: string) => cancelFocus(ctx, id));
  return { create, update, remove, checkin, finish, cancel };
}

/**
 * While a focus block runs, opening the app lands on the focus screen (if enabled in the
 * settings). Mount once (home screen). Runs before the daily draw and the capture prompt.
 */
export function useFocusPrompt() {
  const ctx = useDomain();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        try {
          if (!ctx.settings.focusAutoOpen) return;
          if (!canAutoPrompt()) return;
          const active = activeFocus(ctx);
          if (!active) return;
          router.push({ pathname: '/focus/[id]', params: { id: active.id } });
        } catch (e) {
          console.warn('focus prompt check failed', e);
        }
      }, 500);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      sub.remove();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [ctx]);
}
