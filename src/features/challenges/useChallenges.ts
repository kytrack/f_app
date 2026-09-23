import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import {
  acceptChallenge,
  archiveChallenge,
  createChallenge,
  deleteChallenge,
  drawChallenges,
  listAllChallenges,
  markDrawnToday,
  restoreChallenge,
  shouldDrawToday,
  updateChallenge,
  type ChallengeInput,
} from '@/src/domain/challenges';
import { getSettings } from '@/src/domain/settings';
import { ROOT_KEY, useDomainMutation } from '../queries';

export function useAllChallenges() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'challenges'], queryFn: () => listAllChallenges(ctx) });
}

/** A fresh roll; `exclude` = the previous roll so a reroll shows different options. */
export function useDraw(exclude: string[], nonce: number) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'draw', nonce],
    queryFn: () => drawChallenges(ctx, undefined, exclude),
    staleTime: Infinity,
  });
}

export function useChallengeActions() {
  const ctx = useDomain();
  const accept = useDomainMutation(({ id, daily }: { id: string; daily: boolean }) => {
    const task = acceptChallenge(ctx, id);
    if (daily) markDrawnToday(ctx);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return task;
  });
  const create = useDomainMutation((input: ChallengeInput) => createChallenge(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<ChallengeInput> }) => updateChallenge(ctx, id, patch));
  const archive = useDomainMutation((id: string) => archiveChallenge(ctx, id));
  const restore = useDomainMutation((id: string) => restoreChallenge(ctx, id));
  const remove = useDomainMutation((id: string) => deleteChallenge(ctx, id));
  return { accept, create, update, archive, restore, remove };
}

/**
 * Opens the mandatory daily draw on app open / foreground when it has not happened today.
 * Mount once (home screen). Runs before the capture prompt, which yields to it.
 */
export function useChallengePrompt() {
  const ctx = useDomain();
  const qc = useQueryClient();
  const busy = useRef(false);

  useEffect(() => {
    const check = () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const row = getSettings(ctx);
        if (!row.onboardedAt) return;
        if (!shouldDrawToday(ctx, row.lastChallengeDay)) return;
        qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'draw'] });
        setTimeout(() => router.push({ pathname: '/challenge', params: { mode: 'daily' } }), 500);
      } catch (e) {
        console.warn('challenge prompt check failed', e);
      } finally {
        busy.current = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [ctx, qc]);
}
