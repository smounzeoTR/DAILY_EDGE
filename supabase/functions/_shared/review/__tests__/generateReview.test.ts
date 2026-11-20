import { describe, expect, it } from 'vitest';

import { localClock, reviewWeekStart } from '../generateReview.ts';

describe('review week', () => {
  it('local clock in the user time zone', () => {
    // 2026-11-22 is a Sunday
    expect(localClock(new Date('2026-11-22T17:30:00Z'), 'Europe/Paris')).toEqual({
      date: '2026-11-22',
      isoDay: 7,
      hour: 18,
    });
    expect(localClock(new Date('2026-11-23T03:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-11-22',
      isoDay: 7,
      hour: 22,
    });
  });

  it('current week from Sunday 18:00, previous week otherwise', () => {
    expect(reviewWeekStart({ date: '2026-11-22', isoDay: 7, hour: 18 })).toBe('2026-11-16');
    expect(reviewWeekStart({ date: '2026-11-22', isoDay: 7, hour: 17 })).toBe('2026-11-09');
    expect(reviewWeekStart({ date: '2026-11-23', isoDay: 1, hour: 9 })).toBe('2026-11-16');
    expect(reviewWeekStart({ date: '2026-11-20', isoDay: 5, hour: 20 })).toBe('2026-11-09');
  });
});
