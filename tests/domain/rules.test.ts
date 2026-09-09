import { describe, expect, it } from 'vitest';
import {
  POINTS,
  applyMultiplier,
  evaluateKcal,
  habitPoints,
  relapsePenalty,
  taskPoints,
  workoutPoints,
} from '@/src/domain/points/rules';

describe('habitPoints', () => {
  it('awards full base when target reached', () => {
    expect(habitPoints({ count: 1, target: 1 })).toBe(10);
    expect(habitPoints({ count: 9, target: 8 })).toBe(10); // over-achieving does not inflate
  });
  it('applies streak multiplier with rounding', () => {
    expect(habitPoints({ count: 1, target: 1, multiplier: 1.25 })).toBe(13);
    expect(habitPoints({ count: 1, target: 1, multiplier: 1.5 })).toBe(15);
  });
  it('gives proportional points from 50% upwards, floored', () => {
    expect(habitPoints({ count: 4, target: 8 })).toBe(5);
    expect(habitPoints({ count: 5, target: 8 })).toBe(6); // 6.25 → 6
  });
  it('gives nothing below 50%', () => {
    expect(habitPoints({ count: 3, target: 8 })).toBe(0);
    expect(habitPoints({ count: 0, target: 1 })).toBe(0);
  });
  it('tolerates a zero target', () => {
    expect(habitPoints({ count: 1, target: 0 })).toBe(10);
  });
});

describe('relapsePenalty', () => {
  it('is double the habit penalty', () => {
    expect(relapsePenalty({ alreadyLostToday: 0 })).toBe(10);
    expect(relapsePenalty({ penalty: 8, alreadyLostToday: 0 })).toBe(16);
  });
  it('caps daily loss at 30', () => {
    expect(relapsePenalty({ alreadyLostToday: 20 })).toBe(10);
    expect(relapsePenalty({ alreadyLostToday: 25 })).toBe(5);
    expect(relapsePenalty({ alreadyLostToday: 30 })).toBe(0);
  });
});

describe('taskPoints', () => {
  it('maps priority to 5/10/20', () => {
    expect(taskPoints({ priority: 1, late: false })).toBe(5);
    expect(taskPoints({ priority: 2, late: false })).toBe(10);
    expect(taskPoints({ priority: 3, late: false })).toBe(20);
  });
  it('halves points when late and respects override', () => {
    expect(taskPoints({ priority: 3, late: true })).toBe(10);
    expect(taskPoints({ priority: 1, override: 15, late: true })).toBe(7);
  });
});

describe('workoutPoints', () => {
  it('full at >=80%, half at 50–79%, none below', () => {
    expect(workoutPoints({ completionPct: 100 })).toBe(POINTS.workoutComplete);
    expect(workoutPoints({ completionPct: 80 })).toBe(30);
    expect(workoutPoints({ completionPct: 79 })).toBe(15);
    expect(workoutPoints({ completionPct: 50 })).toBe(15);
    expect(workoutPoints({ completionPct: 49 })).toBe(0);
  });
});

describe('evaluateKcal', () => {
  it('hits within tolerance, over above, under below, no_data when empty', () => {
    expect(evaluateKcal({ eaten: 2050, target: 2000, tolerancePct: 10 })).toBe('hit');
    expect(evaluateKcal({ eaten: 2200, target: 2000, tolerancePct: 10 })).toBe('hit');
    expect(evaluateKcal({ eaten: 2201, target: 2000, tolerancePct: 10 })).toBe('over');
    expect(evaluateKcal({ eaten: 1500, target: 2000, tolerancePct: 10 })).toBe('under');
    expect(evaluateKcal({ eaten: 0, target: 2000, tolerancePct: 10 })).toBe('no_data');
    expect(evaluateKcal({ eaten: 1800, target: null, tolerancePct: 10 })).toBe('no_data');
  });
});

describe('applyMultiplier', () => {
  it('never goes negative', () => {
    expect(applyMultiplier(-10, 1.5)).toBe(0);
  });
});
