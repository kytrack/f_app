import { describe, expect, it } from 'vitest';
import { milestoneBonus, multiplierFor, nextStreak } from '@/src/domain/points/streak';

describe('multiplierFor', () => {
  it('tiers at 7 and 30 days', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(6)).toBe(1);
    expect(multiplierFor(7)).toBe(1.25);
    expect(multiplierFor(29)).toBe(1.25);
    expect(multiplierFor(30)).toBe(1.5);
    expect(multiplierFor(365)).toBe(1.5);
  });
});

describe('nextStreak', () => {
  it('increments on done/clean and tracks best', () => {
    const s1 = nextStreak({ current: 0, best: 0 }, 'done');
    expect(s1).toEqual({ current: 1, best: 1 });
    expect(nextStreak({ current: 4, best: 10 }, 'clean')).toEqual({ current: 5, best: 10 });
  });
  it('resets on missed/relapse but keeps best', () => {
    expect(nextStreak({ current: 12, best: 12 }, 'missed')).toEqual({ current: 0, best: 12 });
    expect(nextStreak({ current: 3, best: 40 }, 'relapse')).toEqual({ current: 0, best: 40 });
  });
  it('leaves state untouched on skipped', () => {
    expect(nextStreak({ current: 5, best: 9 }, 'skipped')).toEqual({ current: 5, best: 9 });
  });
});

describe('milestoneBonus', () => {
  it('pays exactly at 7/30/100, nothing otherwise', () => {
    expect(milestoneBonus(7)).toBe(25);
    expect(milestoneBonus(30)).toBe(100);
    expect(milestoneBonus(100)).toBe(500);
    expect(milestoneBonus(8)).toBe(0);
    expect(milestoneBonus(0)).toBe(0);
  });
});
