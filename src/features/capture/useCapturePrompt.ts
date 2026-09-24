import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { shouldDrawToday } from '@/src/domain/challenges';
import { activeFocus } from '@/src/domain/focus';
import { shouldPromptCapture } from '@/src/domain/notifications';
import { getSettings, updateSettings } from '@/src/domain/settings';
import { canAutoPrompt } from '@/src/notifications/taps';
import { ROOT_KEY } from '../queries';

/**
 * Opens the "anything on your mind?" sheet on app open / foreground, at most every
 * `captureOnOpenHours` hours and never in quiet hours. Mount once (home screen).
 * Yields to the focus screen, the daily draw and to any screen a notification tap opened.
 */
export function useCapturePrompt() {
  const ctx = useDomain();
  const qc = useQueryClient();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => {
      if (pending.current) clearTimeout(pending.current);
      // Decide after the home screen mounted and after a possible notification tap was routed.
      pending.current = setTimeout(() => {
        pending.current = null;
        try {
          const row = getSettings(ctx);
          if (!row.onboardedAt) return;
          if (!canAutoPrompt()) return;
          if (ctx.settings.focusAutoOpen && activeFocus(ctx)) return; // the focus prompt owns the screen
          if (shouldDrawToday(ctx, row.lastChallengeDay)) return; // the daily draw goes first; capture asks next time
          if (!shouldPromptCapture(ctx, row.lastCapturePromptAt)) return;
          updateSettings(ctx, { lastCapturePromptAt: ctx.now().toISOString() });
          qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'settings'] });
          router.push({ pathname: '/capture', params: { auto: '1' } });
        } catch (e) {
          console.warn('capture prompt check failed', e);
        }
      }, 900);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      sub.remove();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [ctx, qc]);
}
