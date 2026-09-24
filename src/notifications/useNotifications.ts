import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { onDomainChange } from '@/src/features/queries';
import { getNotifications } from './module';
import { reconcileNotifications, requestNotificationPermission } from './scheduler';
import { openFromNotification } from './taps';

/**
 * Root hook: asks for permission once, re-plans the OS queue after every domain change
 * (debounced) and on app foreground, and routes notification taps to their screen.
 * A no-op where notifications are unavailable (web, Expo Go on Android).
 */
export function useNotifications() {
  const ctx = useDomain();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Planning follows the ctx (settings live in it); tap routing is subscribed once.
  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    const plan = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void reconcileNotifications(ctx), 1500);
    };

    void requestNotificationPermission().then((ok) => ok && plan());
    onDomainChange.add(plan);
    const app = AppState.addEventListener('change', (s) => s === 'active' && plan());

    return () => {
      onDomainChange.delete(plan);
      app.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ctx]);

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    const tap = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    // The tap that launched the app (cold start) is not delivered to the listener above.
    void Notifications.getLastNotificationResponseAsync().then(openFromNotification);
    return () => tap.remove();
  }, []);
}
