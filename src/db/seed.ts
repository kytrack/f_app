import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import { settings, users } from './schema';

/** Idempotent: creates the single local user + settings row on first launch. */
export function ensureSeed(): void {
  const db = getDb();
  const existing = db.select({ id: users.id }).from(users).limit(1).all();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Budapest';

  db.transaction((tx) => {
    tx.insert(users).values({ id, displayName: 'Én', createdAt: now, updatedAt: now }).run();
    tx.insert(settings).values({ userId: id, timezone, updatedAt: now }).run();
  });
}
