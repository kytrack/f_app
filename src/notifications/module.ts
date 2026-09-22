/**
 * Lazy, guarded access to expo-notifications.
 *
 * Since SDK 53 the package THROWS at import time inside Expo Go on Android, which would take
 * the whole app down. So nothing may `import 'expo-notifications'` at module scope: go through
 * getNotifications(), which returns null where notifications are unavailable (web, Expo Go on
 * Android) and the real module everywhere else (development/production builds, iOS Expo Go).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** True when the only reason notifications are off is that we run inside Expo Go on Android. */
export const notificationsBlockedByExpoGo = Platform.OS === 'android' && isExpoGo;

let cached: NotificationsModule | null | undefined;

export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || notificationsBlockedByExpoGo) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('expo-notifications unavailable', e);
    cached = null;
  }
  return cached;
}
