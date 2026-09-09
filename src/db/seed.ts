import * as Crypto from 'expo-crypto';
import { db } from './client';
import { settings, users } from './schema';

/** Idempotent: creates the single local user + settings row on first launch. */
export async function ensureSeed(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Budapest';

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, displayName: 'Én', createdAt: now, updatedAt: now });
    await tx.insert(settings).values({ userId: id, timezone, updatedAt: now });
  });
}
