import { TZDate } from '@date-fns/tz';
import { addDays, format, subHours } from 'date-fns';

export type DayKey = string; // 'YYYY-MM-DD' in the user's local calendar

/**
 * Maps an instant to the user's "logical day".
 * With dayStartHour = 4, 2026-09-10 02:30 local still belongs to 2026-09-09.
 */
export function dayKeyFor(instant: Date, timeZone: string, dayStartHour = 4): DayKey {
  const local = new TZDate(instant, timeZone);
  return format(subHours(local, dayStartHour), 'yyyy-MM-dd');
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  return format(addDays(new Date(y, m - 1, d), days), 'yyyy-MM-dd');
}

/** ISO weekday index used by the schedule bitmask: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return (js + 6) % 7;
}

export function isBitSet(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

/** Every day key in [from, to], inclusive, ascending. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = from; k <= to; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}
