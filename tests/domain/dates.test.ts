import { describe, expect, it } from 'vitest';
import { addDaysToKey, dayKeyFor, dayRange, isBitSet, weekdayIndex } from '@/src/domain/dates';

const TZ = 'Europe/Budapest';

describe('dayKeyFor', () => {
  it('keeps a normal daytime instant on its calendar day', () => {
    // 2026-09-09 14:00 CEST = 12:00Z
    expect(dayKeyFor(new Date('2026-09-09T12:00:00Z'), TZ)).toBe('2026-09-09');
  });
  it('assigns 02:30 local to the previous logical day when day starts at 04:00', () => {
    // 2026-09-10 02:30 CEST = 00:30Z
    expect(dayKeyFor(new Date('2026-09-10T00:30:00Z'), TZ, 4)).toBe('2026-09-09');
    expect(dayKeyFor(new Date('2026-09-10T00:30:00Z'), TZ, 0)).toBe('2026-09-10');
  });
  it('flips exactly at the day start hour', () => {
    // 04:00 CEST = 02:00Z
    expect(dayKeyFor(new Date('2026-09-10T02:00:00Z'), TZ, 4)).toBe('2026-09-10');
    expect(dayKeyFor(new Date('2026-09-10T01:59:59Z'), TZ, 4)).toBe('2026-09-09');
  });
});

describe('addDaysToKey / dayRange', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysToKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('lists inclusive ranges', () => {
    expect(dayRange('2026-09-07', '2026-09-09')).toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
    expect(dayRange('2026-09-09', '2026-09-08')).toEqual([]);
  });
});

describe('weekdayIndex / isBitSet', () => {
  it('uses Monday = 0', () => {
    expect(weekdayIndex('2026-09-07')).toBe(0); // Monday
    expect(weekdayIndex('2026-09-13')).toBe(6); // Sunday
  });
  it('reads the schedule bitmask', () => {
    const weekdaysOnly = 0b0011111;
    expect(isBitSet(weekdaysOnly, 0)).toBe(true);
    expect(isBitSet(weekdaysOnly, 5)).toBe(false);
    expect(isBitSet(127, 6)).toBe(true);
  });
});
