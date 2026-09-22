/**
 * Keeps the OS notification queue equal to `planNotifications()` from the database.
 * Native builds only – see ./module.ts for where notifications are unavailable.
 */
import type { NotificationChannelInput } from 'expo-notifications';
import { Platform } from 'react-native';
import type { DomainCtx } from '@/src/domain/context';
import {
  MAX_SCHEDULED_ANDROID,
  MAX_SCHEDULED_IOS,
  planNotifications,
  type NotificationChannel,
  type PlannedNotification,
} from '@/src/domain/notifications';
import { colors } from '@/src/ui/tokens';
import { getNotifications } from './module';

export const isNativeNotifications = getNotifications() !== null;

let configured = false;

/** Foreground presentation + Android channels. Idempotent. */
export async function configureNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    const channels: Record<NotificationChannel, NotificationChannelInput> = {
      reminders: {
        name: 'Emlékeztetők',
        description: 'Szokások, teendők és események emlékeztetői',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: colors.accent.DEFAULT,
        vibrationPattern: [0, 150, 100, 150],
      },
      summary: {
        name: 'Esti összegző',
        description: 'Mi maradt még mára',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: colors.accent.DEFAULT,
      },
      nudges: {
        name: 'Lökések és kérdések',
        description: 'Napközbeni „hol tartasz?” és „van valami a fejedben?” üzenetek',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: colors.accent.DEFAULT,
      },
    };
    for (const [id, input] of Object.entries(channels)) {
      await Notifications.setNotificationChannelAsync(id, input);
    }
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** Asks once; returns whether we may schedule. */
export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

interface Scheduled {
  identifier: string;
  key: string;
  fireAt: string;
}

async function currentlyScheduled(Notifications: NonNullable<ReturnType<typeof getNotifications>>): Promise<Scheduled[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const out: Scheduled[] = [];
  for (const n of all) {
    const data = (n.content.data ?? {}) as { key?: string; fireAt?: string };
    if (typeof data.key === 'string' && typeof data.fireAt === 'string') {
      out.push({ identifier: n.identifier, key: data.key, fireAt: data.fireAt });
    } else {
      // Unknown entry (older build?) – drop it so the queue stays ours.
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  return out;
}

async function schedule(Notifications: NonNullable<ReturnType<typeof getNotifications>>, n: PlannedNotification): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: n.title,
      body: n.body,
      data: { key: n.key, fireAt: n.fireAt, url: n.url },
      ...(Platform.OS === 'android' ? { channelId: n.channel } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(n.fireAt),
      ...(Platform.OS === 'android' ? { channelId: n.channel } : {}),
    },
  });
}

let inFlight: Promise<void> | null = null;
let queued = false;

/**
 * Diff plan vs OS queue: cancel stale/changed entries, schedule missing ones.
 * Serialised: concurrent calls coalesce into one follow-up run.
 */
export function reconcileNotifications(ctx: DomainCtx): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return Promise.resolve();
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      if (!(await notificationsAllowed())) return;
      await configureNotifications();
      const plan = planNotifications(ctx, { max: Platform.OS === 'ios' ? MAX_SCHEDULED_IOS : MAX_SCHEDULED_ANDROID });
      const wanted = new Map(plan.map((n) => [n.key, n]));
      const existing = await currentlyScheduled(Notifications);
      const keep = new Set<string>();
      for (const s of existing) {
        const w = wanted.get(s.key);
        if (w && w.fireAt === s.fireAt) keep.add(s.key);
        else await Notifications.cancelScheduledNotificationAsync(s.identifier);
      }
      for (const n of plan) if (!keep.has(n.key)) await schedule(Notifications, n);
    } catch (e) {
      console.warn('notification reconcile failed', e);
    } finally {
      inFlight = null;
      if (queued) {
        queued = false;
        void reconcileNotifications(ctx);
      }
    }
  })();
  return inFlight;
}

/** Sends a test notification in ~3 seconds (settings/debug helper). */
export async function sendTestNotification(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await configureNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'LifeOS',
      body: 'Az értesítések működnek.',
      data: { key: 'test', fireAt: new Date(Date.now() + 3000).toISOString(), url: '/' },
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
  });
}
