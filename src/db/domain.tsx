/**
 * Bridges the pure domain layer to the running app: real clock, expo-crypto ids,
 * settings from the DB. Exposed through React context.
 */
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DomainCtx } from '@/src/domain/context';
import { getDb } from './client';
import { settings as settingsTable } from './schema';

export function buildDomainCtx(): DomainCtx {
  const db = getDb();
  const row = db.select().from(settingsTable).get();
  if (!row) throw new Error('settings row missing – seed did not run');
  return {
    db,
    userId: row.userId,
    settings: {
      timezone: row.timezone,
      dayStartHour: row.dayStartHour,
      editGraceHours: row.editGraceHours,
      kcalTolerancePct: row.kcalTolerancePct,
      kcalTarget: row.kcalTarget,
    },
    now: () => new Date(),
    uuid: () => Crypto.randomUUID(),
  };
}

const DomainContext = createContext<DomainCtx | null>(null);

export function DomainProvider({ children }: { children: ReactNode }) {
  const ctx = useMemo(buildDomainCtx, []);
  return <DomainContext.Provider value={ctx}>{children}</DomainContext.Provider>;
}

export function useDomain(): DomainCtx {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error('useDomain must be used inside DomainProvider');
  return ctx;
}
