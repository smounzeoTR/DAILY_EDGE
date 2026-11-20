import { describe, expect, it } from 'vitest';

import {
  completionRate,
  dayStates,
  goalProgress,
  habitRates,
  streak,
  type DayPlan,
} from './progress';

const T = '2026-11-20';
// Days before T: d(1) = 2026-11-19
const d = (n: number) => {
  const date = new Date(Date.UTC(2026, 10, 20 - n));
  return date.toISOString().slice(0, 10);
};

describe('streak ("never miss twice")', () => {
  it('counts consecutive done days', () => {
    expect(streak([d(3), d(2), d(1)], T, d(3))).toEqual({
      current: 3,
      record: 3,
      todayDone: false,
    });
  });

  it('an isolated missed day does not break the streak', () => {
    // done, done, missed, done
    expect(streak([d(4), d(3), d(1)], T, d(4)).current).toBe(3);
  });

  it('two missed days in a row reset it', () => {
    // done x3, missed x2, done
    const result = streak([d(6), d(5), d(4), d(1)], T, d(6));
    expect(result.current).toBe(1);
    expect(result.record).toBe(3);
  });

  it('today never breaks it and counts once done', () => {
    expect(streak([d(2), d(1)], T, d(2)).current).toBe(2);
    expect(streak([d(2), d(1), T], T, d(2))).toEqual({ current: 3, record: 3, todayDone: true });
    // Yesterday missed + today not done yet: still running
    expect(streak([d(3), d(2)], T, d(3)).current).toBe(2);
  });

  it('two missed days just before today reset it to zero', () => {
    expect(streak([d(4), d(3)], T, d(4))).toEqual({ current: 0, record: 2, todayDone: false });
  });

  it('days before onboarding are ignored; nothing done -> 0', () => {
    expect(streak([], T, d(10))).toEqual({ current: 0, record: 0, todayDone: false });
    expect(streak([], T, null)).toEqual({ current: 0, record: 0, todayDone: false });
    expect(streak([d(1)], T, d(1)).current).toBe(1);
  });

  it('the record keeps the best streak', () => {
    const days = [d(20), d(19), d(18), d(17), d(16), d(3), d(2)];
    expect(streak(days, T, d(20))).toMatchObject({ current: 2, record: 5 });
  });
});

describe('completion rate', () => {
  const p = (date: string, ...statuses: string[]): DayPlan => ({
    date,
    items: statuses.map((status) => ({ status })),
  });

  it('done days / days with a plan over 7 and 30 days', () => {
    const plans = [p(d(1), 'done'), p(d(2), 'skipped'), p(d(3), 'todo', 'done'), p(d(10), 'done')];
    expect(completionRate(plans, T, 7)).toBeCloseTo(2 / 3);
    expect(completionRate(plans, T, 30)).toBeCloseTo(3 / 4);
  });

  it('today counts only once its exercise is done', () => {
    expect(completionRate([p(d(1), 'done'), p(T, 'todo')], T, 7)).toBe(1);
    expect(completionRate([p(d(1), 'skipped'), p(T, 'done')], T, 7)).toBe(0.5);
  });

  it('null without any day with a plan', () => {
    expect(completionRate([], T, 7)).toBeNull();
    expect(completionRate([p(T, 'todo')], T, 7)).toBeNull();
  });

  it('day states for the chart', () => {
    const states = dayStates([p(d(1), 'done'), p(d(2), 'skipped')], T, 4).map((s) => s.state);
    expect(states).toEqual(['none', 'missed', 'done', 'today']);
  });
});

describe('habit rates', () => {
  const log = (habitId: string, date: string, minimal = false) => ({
    habitId,
    date,
    done: true,
    minimal,
  });

  it('daily: done days / elapsed days, current day only once done, minimal counts', () => {
    const habits = [{ id: 'h', frequency: 'daily' as const, startedOn: d(3) }];
    const rates = habitRates(habits, [log('h', d(3)), log('h', d(1), true)], T, 30);
    expect(rates).toEqual([{ habitId: 'h', expected: 3, done: 2, rate: 2 / 3 }]);
  });

  it('weekdays: weekends are not expected', () => {
    // 2026-11-16 (Mon) .. 2026-11-22 (Sun), today Sunday
    const habits = [{ id: 'w', frequency: 'weekdays' as const, startedOn: '2026-11-16' }];
    const rates = habitRates(habits, [log('w', '2026-11-16')], '2026-11-22', 30);
    expect(rates[0]).toMatchObject({ expected: 5, done: 1 });
  });

  it('weekly: one per week, current week only once done', () => {
    const habits = [{ id: 'k', frequency: 'weekly' as const, startedOn: '2026-11-02' }];
    // Weeks of Nov 2, 9, 16 (current: today is Fri Nov 20)
    expect(habitRates(habits, [log('k', '2026-11-04')], T, 30)[0]).toMatchObject({
      expected: 2,
      done: 1,
    });
    expect(
      habitRates(habits, [log('k', '2026-11-04'), log('k', '2026-11-18')], T, 30)[0],
    ).toMatchObject({ expected: 3, done: 2 });
  });

  it('occasional habits are excluded', () => {
    const habits = [{ id: 'o', frequency: 'occasional' as const, startedOn: d(10) }];
    expect(habitRates(habits, [log('o', d(1))], T, 30)).toEqual([]);
  });

  it('no elapsed period -> null rate', () => {
    const habits = [{ id: 'm', frequency: 'monthly' as const, startedOn: T }];
    expect(habitRates(habits, [], T, 30)[0]).toMatchObject({ expected: 0, rate: null });
  });
});

describe('goal trajectory', () => {
  const goal = {
    targetValue: 100,
    currentValue: 30,
    createdOn: '2026-11-01',
    deadline: '2026-12-01',
  };

  it('linear expected value between creation and deadline', () => {
    const g = goalProgress(goal, '2026-11-16');
    expect(g.ratio).toBeCloseTo(0.3);
    expect(g.expected).toBeCloseTo(50);
    expect(g.expectedRatio).toBeCloseTo(0.5);
  });

  it('before creation 0, after the deadline the target', () => {
    expect(goalProgress(goal, '2026-10-20').expected).toBe(0);
    expect(goalProgress(goal, '2027-01-10').expected).toBe(100);
  });

  it('no target -> nothing; no deadline -> no trajectory; ratio capped', () => {
    expect(goalProgress({ ...goal, targetValue: null }, T)).toEqual({
      ratio: null,
      expected: null,
      expectedRatio: null,
    });
    expect(goalProgress({ ...goal, deadline: null }, T)).toMatchObject({
      ratio: 0.3,
      expected: null,
    });
    expect(goalProgress({ ...goal, currentValue: 150 }, T).ratio).toBe(1);
  });
});
