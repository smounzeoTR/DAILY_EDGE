import { describe, expect, it } from 'vitest';

import { formatMetric, metricRows } from './metrics';

describe('beta metrics', () => {
  const rows = metricRows({
    signups: 10,
    onboarded: 9,
    d7_total: 5,
    d7_kept: 1,
    d30_total: 0,
    d30_kept: 0,
    active_days: 20,
    active_days_with_checkin: 12,
    exercises_total: 10,
    exercises_done: 6,
    rating_avg: '4.20',
    ratings: 8,
    proposals_total: 4,
    proposals_accepted: 2,
    ai_cost_per_active_user_month_eur: '0.42',
    active_users: 6,
  });
  const by = (key: string) => rows.find((r) => r.key === key);

  it('rates against the targets of the specification', () => {
    expect(by('onboarding')).toMatchObject({ value: 0.9, status: 'ok' });
    expect(by('d7')).toMatchObject({ value: 0.2, status: 'below' });
    expect(by('checkin')).toMatchObject({ value: 0.6, status: 'ok' });
    expect(by('completion')).toMatchObject({ value: 0.6, status: 'ok' });
    expect(by('rating')).toMatchObject({ value: 4.2, status: 'ok' });
    expect(by('adjustments')).toMatchObject({ value: 0.5, status: 'ok' });
  });

  it('no data yet is not a failure', () => {
    expect(by('d30')).toMatchObject({ value: null, status: 'none' });
  });

  it('the AI cost must stay below its target', () => {
    expect(by('aiCost')).toMatchObject({ value: 0.42, status: 'below' });
  });

  it('formats percentages, ratings and euros', () => {
    expect(formatMetric({ key: 'd7', value: 0.2 }, 'en')).toBe('20%');
    expect(formatMetric({ key: 'rating', value: 4.2 }, 'fr')).toBe('4,2');
    expect(formatMetric({ key: 'aiCost', value: 0.42 }, 'en')).toBe('€0.42');
    expect(formatMetric({ key: 'd30', value: null }, 'fr')).toBe('—');
  });
});
