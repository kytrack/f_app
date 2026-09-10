import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  nextOccurrence,
  occurrencesBetween,
  occursOn,
  parseRecurrence,
  serializeRecurrence,
} from '@/src/domain/recurrence';

describe('recurrence', () => {
  it('parses and rejects rules', () => {
    expect(parseRecurrence('{"type":"daily"}')).toEqual({ type: 'daily' });
    expect(parseRecurrence('{"type":"weekly","weekdayMask":31}')).toEqual({ type: 'weekly', weekdayMask: 31 });
    expect(parseRecurrence('{"type":"monthly","day":31}')).toEqual({ type: 'monthly', day: 31 });
    expect(parseRecurrence('{"type":"weekly","weekdayMask":0}')).toBeNull();
    expect(parseRecurrence('{"type":"monthly","day":0}')).toBeNull();
    expect(parseRecurrence('{"type":"daily","interval":0}')).toBeNull();
    expect(parseRecurrence('not json')).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
    expect(serializeRecurrence({ type: 'daily', interval: 3 })).toBe('{"type":"daily","interval":3}');
    expect(serializeRecurrence(null)).toBeNull();
  });

  it('daily with interval counts from the anchor', () => {
    const r = { type: 'daily', interval: 3 } as const;
    expect(occursOn(r, '2026-09-01', '2026-09-01')).toBe(true);
    expect(occursOn(r, '2026-09-01', '2026-09-02')).toBe(false);
    expect(occursOn(r, '2026-09-01', '2026-09-04')).toBe(true);
    expect(occursOn(r, '2026-09-01', '2026-08-29')).toBe(false); // before anchor
    expect(occurrencesBetween(r, '2026-09-01', '2026-08-30', '2026-09-08')).toEqual([
      '2026-09-01',
      '2026-09-04',
      '2026-09-07',
    ]);
  });

  it('weekly uses the Monday-based mask', () => {
    const r = { type: 'weekly', weekdayMask: 0b0000101 } as const; // Mon + Wed
    expect(occurrencesBetween(r, '2026-09-07', '2026-09-07', '2026-09-13')).toEqual(['2026-09-07', '2026-09-09']);
    expect(nextOccurrence(r, '2026-09-07', '2026-09-09')).toBe('2026-09-14');
  });

  it('monthly clamps to short months', () => {
    const r = { type: 'monthly', day: 31 } as const;
    expect(occursOn(r, '2026-01-31', '2026-02-28')).toBe(true);
    expect(occursOn(r, '2026-01-31', '2026-03-31')).toBe(true);
    expect(occursOn(r, '2026-01-31', '2026-04-30')).toBe(true);
    expect(occursOn(r, '2026-01-31', '2026-04-29')).toBe(false);
    expect(nextOccurrence(r, '2026-01-31', '2026-01-31')).toBe('2026-02-28');
  });

  it('describes rules in Hungarian', () => {
    expect(describeRecurrence(null)).toBe('egyszeri');
    expect(describeRecurrence({ type: 'daily' })).toBe('minden nap');
    expect(describeRecurrence({ type: 'daily', interval: 2 })).toBe('2 naponta');
    expect(describeRecurrence({ type: 'weekly', weekdayMask: 31 })).toBe('hétköznap');
    expect(describeRecurrence({ type: 'weekly', weekdayMask: 0b1000001 })).toBe('H, V');
    expect(describeRecurrence({ type: 'monthly', day: 5 })).toBe('minden hónap 5.');
  });
});
