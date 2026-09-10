/**
 * RRULE-light: the three patterns a personal organiser actually needs.
 * Stored as JSON in tasks.recurrence / events.recurrence. Pure TypeScript.
 *
 *   { type: 'daily',   interval?: number }      every N days from the anchor (default 1)
 *   { type: 'weekly',  weekdayMask: number }    bit0 = Monday … bit6 = Sunday
 *   { type: 'monthly', day: number }            1..31, clamped to the month's length
 *
 * The anchor is the first occurrence's day key; nothing occurs before it.
 */
import { addDaysToKey, dayRange, isBitSet, weekdayIndex, type DayKey } from './dates';

export type Recurrence =
  | { type: 'daily'; interval?: number }
  | { type: 'weekly'; weekdayMask: number }
  | { type: 'monthly'; day: number };

export function parseRecurrence(json: string | null | undefined): Recurrence | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as Recurrence;
    if (r.type === 'daily' && (r.interval === undefined || (Number.isInteger(r.interval) && r.interval >= 1)))
      return r;
    if (r.type === 'weekly' && Number.isInteger(r.weekdayMask) && r.weekdayMask > 0 && r.weekdayMask < 128) return r;
    if (r.type === 'monthly' && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31) return r;
    return null;
  } catch {
    return null;
  }
}

export function serializeRecurrence(r: Recurrence | null): string | null {
  return r ? JSON.stringify(r) : null;
}

function daysBetween(a: DayKey, b: DayKey): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** Does the rule (anchored at `anchor`) produce an occurrence on `date`? */
export function occursOn(rule: Recurrence, anchor: DayKey, date: DayKey): boolean {
  if (date < anchor) return false;
  switch (rule.type) {
    case 'daily':
      return daysBetween(anchor, date) % (rule.interval ?? 1) === 0;
    case 'weekly':
      return isBitSet(rule.weekdayMask, weekdayIndex(date));
    case 'monthly': {
      const [y, m, d] = date.split('-').map(Number);
      return d === Math.min(rule.day, daysInMonth(y, m));
    }
  }
}

/** All occurrence day keys in [from, to] (inclusive), respecting the anchor. */
export function occurrencesBetween(rule: Recurrence, anchor: DayKey, from: DayKey, to: DayKey): DayKey[] {
  const start = from < anchor ? anchor : from;
  if (start > to) return [];
  return dayRange(start, to).filter((d) => occursOn(rule, anchor, d));
}

/** First occurrence strictly after `after` (searches up to ~13 months ahead). */
export function nextOccurrence(rule: Recurrence, anchor: DayKey, after: DayKey): DayKey | null {
  let d = addDaysToKey(after, 1);
  for (let i = 0; i < 400; i++) {
    if (occursOn(rule, anchor, d)) return d;
    d = addDaysToKey(d, 1);
  }
  return null;
}

const HU_DAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return 'egyszeri';
  switch (rule.type) {
    case 'daily':
      return rule.interval && rule.interval > 1 ? `${rule.interval} naponta` : 'minden nap';
    case 'weekly': {
      if (rule.weekdayMask === 127) return 'minden nap';
      if (rule.weekdayMask === 0b0011111) return 'hétköznap';
      return HU_DAYS.filter((_, i) => isBitSet(rule.weekdayMask, i)).join(', ');
    }
    case 'monthly':
      return `minden hónap ${rule.day}.`;
  }
}
