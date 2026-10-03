/**
 * Android-only helpers for RELIABLE delivery. expo-notifications schedules local
 * notifications with AlarmManager: exact alarms only when the app may schedule them
 * (SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM, declared in app.json), otherwise inexact ones,
 * which Doze defers for hours – that is what "sometimes it forgets" looks like. Battery
 * optimisation and OEM "sleeping apps" lists do the rest. These open the matching
 * system screens so the user can allow both.
 *
 * expo-intent-launcher is loaded lazily: an older APK updated over the air may not have
 * the native module yet, and a module-scope import would then crash the screen.
 */
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

type IntentLauncher = typeof import('expo-intent-launcher');

let cached: IntentLauncher | null | undefined;

function getIntentLauncher(): IntentLauncher | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-intent-launcher') as IntentLauncher;
  } catch {
    cached = null;
  }
  return cached;
}

const packageName = (): string => Constants.expoConfig?.android?.package ?? 'com.kytrack.lifeos';

export const isAndroid = Platform.OS === 'android';

/** "Alarms & reminders" special-access page for this app (Android 12+). */
export async function openExactAlarmSettings(): Promise<boolean> {
  const il = getIntentLauncher();
  if (!il) return false;
  try {
    await il.startActivityAsync(il.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, { data: `package:${packageName()}` });
    return true;
  } catch {
    return false;
  }
}

/** System dialog asking to exempt this app from battery optimisation (Doze). */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  const il = getIntentLauncher();
  if (!il) return false;
  try {
    await il.startActivityAsync(il.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${packageName()}` });
    return true;
  } catch {
    try {
      await il.startActivityAsync(il.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      return true;
    } catch {
      return false;
    }
  }
}

/** The app's own system settings page (notifications, battery, autostart on some OEMs). */
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}
