import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs from 'sql.js';
import * as schema from '@/src/db/schema';
import { DEFAULT_NOTIFICATION_SETTINGS, type DomainCtx } from '@/src/domain/context';

const TZ = 'Europe/Budapest';

export interface TestWorld {
  ctx: DomainCtx;
  /** Move the clock (ISO string or Date). */
  setNow: (when: string | Date) => void;
  /** Advance the clock by whole days, keeping the time of day. */
  advanceDays: (days: number) => void;
}

/**
 * Real SQLite (sql.js, in-memory) with the real migrations applied, plus a seeded user.
 * Deterministic ids (id-1, id-2, …) and a controllable clock.
 */
export async function createTestWorld(startAt = '2026-09-09T10:00:00Z'): Promise<TestWorld> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  sqlite.exec('PRAGMA foreign_keys = ON;');

  let now = new Date(startAt);
  let counter = 0;
  const ctx: DomainCtx = {
    db,
    userId: 'user-1',
    settings: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      // Tests that exercise the plan enable nudges/captures explicitly.
      nudgesPerDay: 0,
      capturesPerDay: 0,
      timezone: TZ,
      dayStartHour: 4,
      editGraceHours: 48,
      kcalTolerancePct: 10,
      kcalTarget: null,
    },
    now: () => now,
    uuid: () => `id-${++counter}`,
  };

  const iso = now.toISOString();
  db.insert(schema.users)
    .values({ id: 'user-1', displayName: 'Test', createdAt: iso, updatedAt: iso })
    .run();
  db.insert(schema.settings).values({ userId: 'user-1', timezone: TZ, updatedAt: iso }).run();

  return {
    ctx,
    setNow: (when) => {
      now = new Date(when);
    },
    advanceDays: (days) => {
      now = new Date(now.getTime() + days * 86_400_000);
    },
  };
}
