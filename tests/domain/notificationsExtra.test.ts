import { beforeEach, describe, expect, it } from 'vitest';
import { createHabit } from '@/src/domain/habits';
import {
  inQuietHours,
  planNotifications,
  shouldPromptCapture,
  spreadOverActiveWindow,
} from '@/src/domain/notifications';
import { createTestWorld, type TestWorld } from '../helpers/db';

describe('quiet hours and spreading', () => {
  it('detects quiet windows that wrap midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:30')).toBe(true);
    expect(inQuietHours(3 * 60, '22:00', '07:30')).toBe(true);
    expect(inQuietHours(7 * 60 + 30, '22:00', '07:30')).toBe(false);
    expect(inQuietHours(12 * 60, '22:00', '07:30')).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
    expect(inQuietHours(13 * 60, '09:00', '09:00')).toBe(false); // no quiet window
  });

  it('spreads N times evenly inside the active window', () => {
    expect(spreadOverActiveWindow(0, '22:00', '07:30')).toEqual([]);
    expect(spreadOverActiveWindow(1, '22:00', '07:30')).toEqual(['14:45']);
    expect(spreadOverActiveWindow(3, '22:00', '08:00')).toEqual(['11:30', '15:00', '18:30']);
    // window that wraps midnight (active 20:00 → 02:00)
    expect(spreadOverActiveWindow(2, '02:00', '20:00')).toEqual(['22:00', '00:00']);
  });
});

describe('nudges, captures, toggles', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T06:00:00Z'); // 08:00 CEST, Wednesday
    w.ctx.settings.nudgesPerDay = 3;
    w.ctx.settings.capturesPerDay = 2;
  });

  it('plans nudges with a live status body for today and generic text later', () => {
    createHabit(w.ctx, { name: 'a', kind: 'good' });
    createHabit(w.ctx, { name: 'b', kind: 'good' });
    const plan = planNotifications(w.ctx, { days: 2 });
    const todayNudges = plan.filter((n) => n.key.startsWith('nudge:2026-09-09:'));
    expect(todayNudges).toHaveLength(3);
    expect(todayNudges[0].fireAt).toBe('2026-09-09T09:08:00.000Z'); // 11:08 CEST (07:30 + 14.5h/4, rounded)
    expect(todayNudges[0].body).toBe('2 szokás vár még');
    expect(todayNudges[0].channel).toBe('nudges');
    const tomorrow = plan.filter((n) => n.key.startsWith('nudge:2026-09-10:'));
    expect(tomorrow[0].body).toBe('Nézz rá a mai listádra.');
  });

  it('plans capture prompts that open the capture sheet, offset from nudges', () => {
    const plan = planNotifications(w.ctx, { days: 1 });
    const captures = plan.filter((n) => n.key.startsWith('capture:'));
    expect(captures).toHaveLength(2);
    expect(captures.every((c) => c.url === '/capture')).toBe(true);
    expect(captures[0].title).toBe('Van valami a fejedben?');
    const nudgeTimes = new Set(plan.filter((n) => n.key.startsWith('nudge:')).map((n) => n.fireAt));
    expect(captures.some((c) => nudgeTimes.has(c.fireAt))).toBe(false);
  });

  it('nudges need habits, captures do not; toggles switch kinds off', () => {
    expect(planNotifications(w.ctx, { days: 1 }).filter((n) => n.key.startsWith('nudge:'))).toHaveLength(0);
    createHabit(w.ctx, { name: 'a', kind: 'good', reminderTime: '21:00' });
    w.ctx.settings.notifNudges = false;
    w.ctx.settings.notifCapture = false;
    w.ctx.settings.notifSummary = false;
    w.ctx.settings.notifHabits = false;
    expect(planNotifications(w.ctx, { days: 1 })).toEqual([]);
  });

  it('honours the summary time and quiet hours for the summary', () => {
    createHabit(w.ctx, { name: 'a', kind: 'good' });
    w.ctx.settings.summaryTime = '21:30';
    let plan = planNotifications(w.ctx, { days: 1 });
    expect(plan.find((n) => n.key === 'summary:2026-09-09')?.fireAt).toBe('2026-09-09T19:30:00.000Z');
    w.ctx.settings.summaryTime = '23:00'; // inside quiet hours
    plan = planNotifications(w.ctx, { days: 1 });
    expect(plan.find((n) => n.key === 'summary:2026-09-09')).toBeUndefined();
  });

  it('caps the plan size and prefers the nearest notifications', () => {
    w.ctx.settings.nudgesPerDay = 8;
    w.ctx.settings.capturesPerDay = 6;
    createHabit(w.ctx, { name: 'a', kind: 'good' });
    const plan = planNotifications(w.ctx, { days: 7, max: 60 });
    expect(plan).toHaveLength(60);
    expect(plan[plan.length - 1].fireAt < '2026-09-14').toBe(true);
    expect(planNotifications(w.ctx, { days: 7, max: 200 }).length).toBeGreaterThan(60);
  });

  it('shouldPromptCapture respects the interval, quiet hours and the toggle', () => {
    expect(shouldPromptCapture(w.ctx, null)).toBe(true);
    expect(shouldPromptCapture(w.ctx, '2026-09-09T05:00:00Z')).toBe(false); // 1h ago, interval 4h
    expect(shouldPromptCapture(w.ctx, '2026-09-09T01:00:00Z')).toBe(true); // 5h ago
    w.setNow('2026-09-09T21:30:00Z'); // 23:30 CEST → quiet
    expect(shouldPromptCapture(w.ctx, null)).toBe(false);
    w.setNow('2026-09-09T06:00:00Z');
    w.ctx.settings.captureOnOpenHours = 0;
    expect(shouldPromptCapture(w.ctx, null)).toBe(false);
  });
});
