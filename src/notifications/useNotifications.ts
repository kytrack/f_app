import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { onDomainChange } from '@/src/features/queries';
import { getNotifications } from './module';
import { reconcileNotifications, requestNotificationPermission } from './scheduler';

function openFromNotification(response: NotificationResponse | null | undefined): void {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
}

/**
 * Root hook: asks for permission once, re-plans the OS queue after every domain change
 * (debounced) and on app foreground, and routes notification taps to their screen.
 * A no-op where notifications are unavailable (web, Expo Go on Android).
 */
export function useNotifications() {
  const ctx = useDomain();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const tap = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    void Notifications.getLastNotificationResponseAsync().then(openFromNotification);

    return () => {
      onDomainChange.delete(plan);
      app.remove();
      tap.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ctx]);
}
