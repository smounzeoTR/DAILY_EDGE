import { describe, expect, it } from 'vitest';

import { habitStatusOn, isoWeekday, periodOf, type HabitLog } from './schedule';

const log = (date: string, minimal = false): HabitLog => ({ date, done: true, minimal });
// 2026-11-16 is a Monday
const MON = '2026-11-16';
const TUE = '2026-11-17';
const THU = '2026-11-19';
const SAT = '2026-11-21';
const NEXT_MON = '2026-11-23';

describe('periods', () => {
  it('weekdays and ISO weeks', () => {
    expect([MON, SAT, '2026-11-22'].map(isoWeekday)).toEqual([1, 6, 7]);
    expect(periodOf('weekly', THU, MON)).toEqual({ start: MON, end: '2026-11-22' });
    expect(periodOf('weekly', '2026-11-22', MON)).toEqual({ start: MON, end: '2026-11-22' });
  });

  it('biweekly windows start on the habit start date, across months', () => {
    expect(periodOf('biweekly', '2026-11-25', '2026-11-20')).toEqual({
      start: '2026-11-20',
      end: '2026-12-03',
    });
    expect(periodOf('biweekly', '2026-12-04', '2026-11-20')).toEqual({
      start: '2026-12-04',
      end: '2026-12-17',
    });
  });

  it('monthly = calendar month (incl. the 31st and February)', () => {
    expect(periodOf('monthly', '2026-12-31', MON)).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
    expect(periodOf('monthly', '2028-02-10', MON)).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });
});

describe('habitStatusOn', () => {
  const habit = (frequency: Parameters<typeof habitStatusOn>[0]['frequency']) => ({
    frequency,
    startedOn: '2026-11-01',
  });

  it('daily: every day, done or minimal on that day only', () => {
    expect(habitStatusOn(habit('daily'), [], THU).state).toBe('todo');
    expect(habitStatusOn(habit('daily'), [log(THU)], THU).state).toBe('done');
    expect(habitStatusOn(habit('daily'), [log(THU, true)], THU).state).toBe('done_minimal');
    expect(habitStatusOn(habit('daily'), [log(TUE)], THU).state).toBe('todo');
  });

  it('weekdays: hidden on Saturday and Sunday, not counted', () => {
    expect(habitStatusOn(habit('weekdays'), [], THU)).toMatchObject({
      visible: true,
      state: 'todo',
    });
    expect(habitStatusOn(habit('weekdays'), [], SAT)).toMatchObject({
      visible: false,
      state: 'not_due',
      countsForRate: false,
    });
  });

  it('weekly: checked on Tuesday -> done this week on Thursday, due again next Monday', () => {
    expect(habitStatusOn(habit('weekly'), [log(TUE)], TUE).state).toBe('done');
    expect(habitStatusOn(habit('weekly'), [log(TUE)], THU).state).toBe('done_in_period');
    expect(habitStatusOn(habit('weekly'), [log(TUE)], NEXT_MON).state).toBe('todo');
  });

  it('biweekly and monthly follow their period', () => {
    const biweekly = { frequency: 'biweekly' as const, startedOn: '2026-11-20' };
    expect(habitStatusOn(biweekly, [log('2026-11-21')], '2026-12-03').state).toBe('done_in_period');
    expect(habitStatusOn(biweekly, [log('2026-11-21')], '2026-12-04').state).toBe('todo');
    expect(habitStatusOn(habit('monthly'), [log('2026-12-01')], '2026-12-31').state).toBe(
      'done_in_period',
    );
    expect(habitStatusOn(habit('monthly'), [log('2026-11-30')], '2026-12-01').state).toBe('todo');
  });

  it('occasional: always visible, never counted in rates', () => {
    expect(habitStatusOn(habit('occasional'), [], SAT)).toEqual({
      visible: true,
      state: 'todo',
      period: null,
      countsForRate: false,
    });
    expect(habitStatusOn(habit('occasional'), [log(SAT)], SAT).state).toBe('done');
  });

  it('ignores logs marked not done', () => {
    expect(
      habitStatusOn(habit('daily'), [{ date: THU, done: false, minimal: false }], THU).state,
    ).toBe('todo');
  });
});
