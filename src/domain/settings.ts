import { eq } from 'drizzle-orm';
import { settings, type Settings } from '@/src/db/schema';
import { DomainError, nowIso, type DomainCtx } from './context';

export type SettingsPatch = Partial<
  Pick<Settings, 'dayStartHour' | 'kcalTarget' | 'proteinG' | 'carbsG' | 'fatG' | 'kcalTolerancePct' | 'editGraceHours'>
>;

export function getSettings(ctx: DomainCtx): Settings {
  const row = ctx.db.select().from(settings).where(eq(settings.userId, ctx.userId)).get();
  if (!row) throw new DomainError('NOT_FOUND', 'settings missing');
  return row;
}

/** Persists settings; callers must rebuild the DomainCtx afterwards (see DomainProvider). */
export function updateSettings(ctx: DomainCtx, patch: SettingsPatch): Settings {
  const bad = (k: string) => new DomainError('INVALID', `${k} out of range`);
  if (patch.dayStartHour !== undefined && (patch.dayStartHour < 0 || patch.dayStartHour > 12)) throw bad('dayStartHour');
  if (patch.kcalTarget !== undefined && patch.kcalTarget !== null && (patch.kcalTarget < 500 || patch.kcalTarget > 10_000))
    throw bad('kcalTarget');
  if (patch.kcalTolerancePct !== undefined && (patch.kcalTolerancePct < 0 || patch.kcalTolerancePct > 50))
    throw bad('kcalTolerancePct');
  for (const k of ['proteinG', 'carbsG', 'fatG'] as const) {
    const v = patch[k];
    if (v !== undefined && v !== null && (v < 0 || v > 2000)) throw bad(k);
  }
  return ctx.db
    .update(settings)
    .set({ ...patch, updatedAt: nowIso(ctx) })
    .where(eq(settings.userId, ctx.userId))
    .returning()
    .get();
}
