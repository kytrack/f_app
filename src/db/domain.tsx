/**
 * Bridges the pure domain layer to the running app: real clock, expo-crypto ids,
 * settings from the DB. Exposed through React context.
 */
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DomainCtx } from '@/src/domain/context';
import { parseRules } from '@/src/domain/points/config';
import { balance } from '@/src/domain/points/ledger';
import { onSettingsChange, setLevelProbe } from '@/src/features/queries';
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
      rules: parseRules(row.pointRules),
      notifHabits: row.notifHabits,
      notifTasks: row.notifTasks,
      notifEvents: row.notifEvents,
      notifSummary: row.notifSummary,
      notifNudges: row.notifNudges,
      notifCapture: row.notifCapture,
      nudgesPerDay: row.nudgesPerDay,
      capturesPerDay: row.capturesPerDay,
      quietFrom: row.quietFrom,
      quietTo: row.quietTo,
      summaryTime: row.summaryTime,
      captureOnOpenHours: row.captureOnOpenHours,
    },
    now: () => new Date(),
    uuid: () => Crypto.randomUUID(),
  };
}

const DomainContext = createContext<DomainCtx | null>(null);

export function DomainProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  // Settings are a snapshot inside the ctx; bump the version to re-read them after an edit.
  const ctx = useMemo(buildDomainCtx, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    onSettingsChange.add(bump);
    return () => {
      onSettingsChange.delete(bump);
    };
  }, []);
  useEffect(() => {
    setLevelProbe(() => balance(ctx).level);
    return () => setLevelProbe(null);
  }, [ctx]);
  return <DomainContext.Provider value={ctx}>{children}</DomainContext.Provider>;
}

export function useDomain(): DomainCtx {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error('useDomain must be used inside DomainProvider');
  return ctx;
}
