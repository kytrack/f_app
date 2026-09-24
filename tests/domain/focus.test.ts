import { beforeEach, describe, expect, it } from 'vitest';
import { pointLedger } from '@/src/db/schema';
import {
  activeFocus,
  cancelFocus,
  checkinFocus,
  createFocus,
  deleteFocus,
  elapsedMinutes,
  finishFocus,
  focusPoints,
  focusStatus,
  focusTimeRange,
  inFocusAt,
  listFocus,
  nextFocus,
  openFocus,
  unsettledFocus,
  updateFocus,
} from '@/src/domain/focus';
import { planNotifications, shouldPromptCapture } from '@/src/domain/notifications';
import { balance } from '@/src/domain/points/ledger';
import { createHabit } from '@/src/domain/habits';
import { createTestWorld, type TestWorld } from '../helpers/db';

// 2026-09-09 10:00Z = 12:00 CEST
const START = '2026-09-09T12:00:00.000Z'; // 14:00 CEST
const END = '2026-09-09T14:00:00.000Z'; // 16:00 CEST

describe('focus sessions', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  const plan = () => createFocus(w.ctx, { title: ' Projekt ', startAt: START, endAt: END });

  it('creates with the settings default check-in interval and validates', () => {
    const s = plan();
    expect(s).toMatchObject({ title: 'Projekt', startAt: START, endAt: END, checkinMinutes: 20, checkinsDone: 0, pointsAwarded: 0 });
    expect(() => createFocus(w.ctx, { title: ' ', startAt: START, endAt: END })).toThrow(/title/);
    expect(() => createFocus(w.ctx, { title: 'x', startAt: END, endAt: START })).toThrow(/vége/);
    expect(() => createFocus(w.ctx, { title: 'x', startAt: START, endAt: '2026-09-10T12:00:00Z' })).toThrow(/legfeljebb/);
    expect(() => createFocus(w.ctx, { title: 'x', startAt: START, endAt: END, checkinMinutes: 999 })).toThrow(/checkin/);
    expect(() => createFocus(w.ctx, { title: 'x', startAt: 'nope', endAt: END })).toThrow(/invalid/);
    expect(focusTimeRange(w.ctx, s)).toBe('14:00–16:00');
  });

  it('derives the status from the clock and the outcome', () => {
    const s = plan();
    expect(focusStatus(w.ctx, s)).toBe('planned');
    expect(activeFocus(w.ctx)).toBeNull();
    expect(nextFocus(w.ctx)?.id).toBe(s.id);
    w.setNow('2026-09-09T12:30:00Z');
    expect(focusStatus(w.ctx, s)).toBe('active');
    expect(activeFocus(w.ctx)?.id).toBe(s.id);
    expect(nextFocus(w.ctx)).toBeNull();
    expect(elapsedMinutes(s, w.ctx.now())).toBe(30);
    w.setNow('2026-09-09T15:00:00Z');
    expect(focusStatus(w.ctx, s)).toBe('ended');
    expect(unsettledFocus(w.ctx).map((x) => x.id)).toEqual([s.id]);
    expect(openFocus(w.ctx)).toEqual([]); // ran out → no longer "open"
    expect(elapsedMinutes(s, w.ctx.now())).toBe(120);
  });

  it('check-ins only while running, at most one per gap', () => {
    const s = plan();
    expect(() => checkinFocus(w.ctx, s.id)).toThrow(/nem fut/);
    w.setNow('2026-09-09T12:20:00Z');
    expect(checkinFocus(w.ctx, s.id).checkinsDone).toBe(1);
    w.setNow('2026-09-09T12:22:00Z');
    expect(checkinFocus(w.ctx, s.id).checkinsDone).toBe(1); // too soon, counted once
    w.setNow('2026-09-09T12:40:00Z');
    expect(checkinFocus(w.ctx, s.id).checkinsDone).toBe(2);
  });

  it('finishing awards pro-rata points + check-in bonus once, in the ledger', () => {
    const s = plan();
    expect(() => finishFocus(w.ctx, s.id)).toThrow(/nem kezdődött/);
    w.setNow('2026-09-09T12:20:00Z');
    checkinFocus(w.ctx, s.id);
    w.setNow('2026-09-09T13:30:00Z'); // 90 of 120 minutes, finished early
    const before = focusPoints(w.ctx, { ...s, checkinsDone: 1 });
    expect(before).toBe(Math.round(1.5 * 20) + 2); // 32
    const { session, points } = finishFocus(w.ctx, s.id);
    expect(points).toBe(32);
    expect(session.completedAt).not.toBeNull();
    expect(session.pointsAwarded).toBe(32);
    expect(balance(w.ctx).raw).toBe(32);
    const rows = w.ctx.db.select().from(pointLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'focus_done', refType: 'focus', refId: s.id, delta: 32, note: 'Projekt' });
    // idempotent
    expect(finishFocus(w.ctx, s.id).points).toBe(32);
    expect(balance(w.ctx).raw).toBe(32);
    expect(focusStatus(w.ctx, session)).toBe('done');
    expect(() => cancelFocus(w.ctx, session.id)).toThrow(/befejezett/);
    expect(() => updateFocus(w.ctx, session.id, { title: 'x' })).toThrow(/lezárt/);
  });

  it('finishing after the end pays for the planned length, not for the delay', () => {
    const s = plan();
    w.setNow('2026-09-09T20:00:00Z');
    expect(finishFocus(w.ctx, s.id).points).toBe(40);
  });

  it('cancelling earns nothing and is final', () => {
    const s = plan();
    w.setNow('2026-09-09T12:30:00Z');
    const c = cancelFocus(w.ctx, s.id);
    expect(c.cancelledAt).not.toBeNull();
    expect(focusStatus(w.ctx, c)).toBe('cancelled');
    expect(() => finishFocus(w.ctx, s.id)).toThrow(/lemondtad/);
    expect(cancelFocus(w.ctx, s.id).id).toBe(s.id); // idempotent
    expect(balance(w.ctx).raw).toBe(0);
    expect(activeFocus(w.ctx)).toBeNull();
  });

  it('update, list and soft delete', () => {
    const s = plan();
    const u = updateFocus(w.ctx, s.id, { title: 'Tanulás', endAt: '2026-09-09T15:00:00Z', checkinMinutes: 0 });
    expect(u).toMatchObject({ title: 'Tanulás', endAt: '2026-09-09T15:00:00.000Z', checkinMinutes: 0 });
    expect(() => updateFocus(w.ctx, s.id, { endAt: '2026-09-09T11:00:00Z' })).toThrow(/vége/);
    expect(listFocus(w.ctx)).toHaveLength(1);
    deleteFocus(w.ctx, s.id);
    expect(listFocus(w.ctx)).toEqual([]);
    expect(() => updateFocus(w.ctx, s.id, { title: 'x' })).toThrow(/not found/);
  });

  it('inFocusAt covers [start, end)', () => {
    const s = plan();
    expect(inFocusAt([s], START)).toBe(true);
    expect(inFocusAt([s], END)).toBe(false);
    expect(inFocusAt([s], '2026-09-09T13:00:00Z')).toBe(true);
    expect(inFocusAt([], '2026-09-09T13:00:00Z')).toBe(false);
  });
});

describe('focus notifications', () => {
  let w: TestWorld;
  beforeEach(async () => {
    w = await createTestWorld('2026-09-09T10:00:00Z');
  });

  it('plans start, check-ins and end pings that open the focus screen', () => {
    const s = createFocus(w.ctx, { title: 'Projekt', startAt: START, endAt: END, checkinMinutes: 45 });
    const plan = planNotifications(w.ctx, { days: 1 });
    const mine = plan.filter((n) => n.key.startsWith('focus:'));
    expect(mine.map((n) => n.key)).toEqual([`focus:${s.id}:start`, `focus:${s.id}:c1`, `focus:${s.id}:c2`, `focus:${s.id}:end`]);
    expect(mine[0]).toMatchObject({ fireAt: START, url: `/focus/${s.id}`, channel: 'reminders' });
    expect(mine[0].body).toContain('14:00–16:00');
    expect(mine[1].fireAt).toBe('2026-09-09T12:45:00.000Z');
    expect(mine[1].body).toContain('Még 75 perc');
    expect(mine[3]).toMatchObject({ fireAt: END });
    expect(mine[3].body).toContain('+40 pont');
  });

  it('no check-ins when the interval is 0, nothing when the toggle is off or the session is settled', () => {
    const s = createFocus(w.ctx, { title: 'Projekt', startAt: START, endAt: END, checkinMinutes: 0 });
    expect(planNotifications(w.ctx, { days: 1 }).filter((n) => n.key.startsWith('focus:'))).toHaveLength(2);
    w.ctx.settings.notifFocus = false;
    expect(planNotifications(w.ctx, { days: 1 }).filter((n) => n.key.startsWith('focus:'))).toHaveLength(0);
    w.ctx.settings.notifFocus = true;
    cancelFocus(w.ctx, s.id);
    expect(planNotifications(w.ctx, { days: 1 }).filter((n) => n.key.startsWith('focus:'))).toHaveLength(0);
  });

  it('drops nudges and capture prompts that would fall inside a focus block', () => {
    createHabit(w.ctx, { name: 'a', kind: 'good' });
    w.ctx.settings.nudgesPerDay = 8;
    w.ctx.settings.capturesPerDay = 6;
    const before = planNotifications(w.ctx, { days: 1, max: 500 }).filter((n) => /^(nudge|capture):/.test(n.key));
    const inside = before.filter((n) => n.fireAt >= START && n.fireAt < END);
    expect(inside.length).toBeGreaterThan(0);
    createFocus(w.ctx, { title: 'Projekt', startAt: START, endAt: END });
    const after = planNotifications(w.ctx, { days: 1, max: 500 }).filter((n) => /^(nudge|capture):/.test(n.key));
    expect(after).toHaveLength(before.length - inside.length);
    expect(after.some((n) => n.fireAt >= START && n.fireAt < END)).toBe(false);
  });

  it('the in-app capture prompt stays quiet during a focus block', () => {
    createFocus(w.ctx, { title: 'Projekt', startAt: START, endAt: END });
    w.setNow('2026-09-09T13:00:00Z');
    expect(shouldPromptCapture(w.ctx, null)).toBe(false);
    w.setNow('2026-09-09T15:00:00Z');
    expect(shouldPromptCapture(w.ctx, null)).toBe(true);
  });
});
