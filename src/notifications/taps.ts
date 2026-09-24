/**
 * Routes notification taps to their screen, exactly once per tap.
 *
 * Two things went wrong before: the launching tap was re-reported on every re-subscribe
 * (so the same screen opened again and again), and the in-app prompts that fire on
 * foreground (daily draw, "anything on your mind?") pushed their own sheet on top of the
 * screen the tap had just opened. Now taps are de-duplicated by request id and briefly
 * suppress the prompts – see promptsSuppressed().
 */
import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';

const handled = new Set<string>();
let suppressUntil = 0;
const SUPPRESS_MS = 15_000;
const RETRY_MS = 250;
const MAX_RETRIES = 40;

/** True shortly after a tap opened a screen: in-app prompts must not stack a sheet on it. */
export function promptsSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

/** Something is already presented over the tabs (a modal or a pushed screen). */
export function screenStacked(): boolean {
  try {
    return router.canDismiss();
  } catch {
    return false;
  }
}

/** Should an automatic prompt open now? Not over a screen a tap just opened, not over another sheet. */
export function canAutoPrompt(): boolean {
  return !promptsSuppressed() && !screenStacked();
}

/** On a cold start the tap may arrive before the root navigator is ready: retry briefly. */
function pushWhenReady(url: string, attempt = 0): void {
  try {
    router.push(url as never);
  } catch (e) {
    if (attempt >= MAX_RETRIES) {
      console.warn('notification tap: navigation never became ready', e);
      return;
    }
    setTimeout(() => pushWhenReady(url, attempt + 1), RETRY_MS);
  }
}

export function openFromNotification(response: NotificationResponse | null | undefined): void {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const url = response.notification.request.content.data?.url;
  if (typeof url !== 'string' || !url.startsWith('/')) return;
  suppressUntil = Date.now() + SUPPRESS_MS;
  pushWhenReady(url);
}
