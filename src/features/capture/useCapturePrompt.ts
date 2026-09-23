import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { shouldDrawToday } from '@/src/domain/challenges';
import { shouldPromptCapture } from '@/src/domain/notifications';
import { getSettings, updateSettings } from '@/src/domain/settings';
import { ROOT_KEY } from '../queries';

/**
 * Opens the "anything on your mind?" sheet on app open / foreground, at most every
 * `captureOnOpenHours` hours and never in quiet hours. Mount once (home screen).
 */
export function useCapturePrompt() {
  const ctx = useDomain();
  const qc = useQueryClient();
  const checking = useRef(false);

  useEffect(() => {
    const check = () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const row = getSettings(ctx);
        if (!row.onboardedAt) return;
        if (shouldDrawToday(ctx, row.lastChallengeDay)) return; // the daily draw goes first; capture asks next time
        if (!shouldPromptCapture(ctx, row.lastCapturePromptAt)) return;
        updateSettings(ctx, { lastCapturePromptAt: ctx.now().toISOString() });
        qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'settings'] });
        // Let the home screen mount first, then present the sheet.
        setTimeout(() => router.push({ pathname: '/capture', params: { auto: '1' } }), 600);
      } catch (e) {
        console.warn('capture prompt check failed', e);
      } finally {
        checking.current = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [ctx, qc]);
}
