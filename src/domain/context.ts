/**
 * Everything the domain layer needs from the outside world, injected so the same code
 * runs on expo-sqlite (app) and sql.js (tests) with deterministic time and ids.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from '@/src/db/schema';
import { dayKeyFor, type DayKey } from './dates';
import type { PointRules } from './points/config';

// Both ExpoSQLiteDatabase and SQLJsDatabase are 'sync' BaseSQLiteDatabases, and a
// SQLiteTransaction extends BaseSQLiteDatabase too, so helpers accept db or tx alike.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;

export interface NotificationSettings {
  notifHabits: boolean;
  notifTasks: boolean;
  notifEvents: boolean;
  notifSummary: boolean;
  notifNudges: boolean;
  notifCapture: boolean;
  notifFocus: boolean;
  nudgesPerDay: number;
  capturesPerDay: number;
  quietFrom: string; // 'HH:MM'
  quietTo: string; // 'HH:MM'
  summaryTime: string; // 'HH:MM'
  captureOnOpenHours: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifHabits: true,
  notifTasks: true,
  notifEvents: true,
  notifSummary: true,
  notifNudges: true,
  notifCapture: true,
  notifFocus: true,
  nudgesPerDay: 3,
  capturesPerDay: 2,
  quietFrom: '22:00',
  quietTo: '07:30',
  summaryTime: '20:00',
  captureOnOpenHours: 4,
};

export interface DomainSettings extends NotificationSettings {
  timezone: string;
  dayStartHour: number;
  editGraceHours: number;
  kcalTolerancePct: number;
  kcalTarget: number | null;
  challengesEnabled: boolean;
  challengeChoices: number;
  /** Focus mode: open the focus screen on app open while a session runs. */
  focusAutoOpen: boolean;
  /** Focus mode: default "still on it?" interval for new sessions, minutes (0 = none). */
  focusCheckinMinutes: number;
  /** User-editable point rules (defaults merged in). */
  rules: PointRules;
}

export interface DomainCtx {
  db: Db;
  userId: string;
  settings: DomainSettings;
  now: () => Date;
  uuid: () => string;
  /** Uniform [0, 1) – injected so draws are deterministic in tests. */
  random: () => number;
}

export function todayKey(ctx: DomainCtx): DayKey {
  return dayKeyFor(ctx.now(), ctx.settings.timezone, ctx.settings.dayStartHour);
}

export function nowIso(ctx: DomainCtx): string {
  return ctx.now().toISOString();
}

export class DomainError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'INSUFFICIENT_POINTS'
      | 'ALREADY_REDEEMED'
      | 'COOLDOWN'
      | 'DAY_LOCKED'
      | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
