// Beta metrics of the specification (§ 9): rates from the admin_metrics counts, compared to
// their targets. Pure.
export type MetricKey =
  'onboarding' | 'd7' | 'd30' | 'checkin' | 'completion' | 'rating' | 'adjustments' | 'aiCost';

export type MetricRow = {
  key: MetricKey;
  // Rate (0-1), average rating (1-5) or euros; null when there is no data yet
  value: number | null;
  target: number;
  // 'min': the value should reach the target; 'max': stay below it
  direction: 'min' | 'max';
  sample: number;
  status: 'ok' | 'below' | 'none';
};

type Counts = Record<string, number | string | null | undefined>;

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const ratio = (part: unknown, total: unknown) => {
  const t = num(total);
  return t && t > 0 ? (num(part) ?? 0) / t : null;
};

export function metricRows(c: Counts): MetricRow[] {
  const rows: Omit<MetricRow, 'status'>[] = [
    {
      key: 'onboarding',
      value: ratio(c.onboarded, c.signups),
      target: 0.8,
      direction: 'min',
      sample: num(c.signups) ?? 0,
    },
    {
      key: 'd7',
      value: ratio(c.d7_kept, c.d7_total),
      target: 0.4,
      direction: 'min',
      sample: num(c.d7_total) ?? 0,
    },
    {
      key: 'd30',
      value: ratio(c.d30_kept, c.d30_total),
      target: 0.25,
      direction: 'min',
      sample: num(c.d30_total) ?? 0,
    },
    {
      key: 'checkin',
      value: ratio(c.active_days_with_checkin, c.active_days),
      target: 0.5,
      direction: 'min',
      sample: num(c.active_days) ?? 0,
    },
    {
      key: 'completion',
      value: ratio(c.exercises_done, c.exercises_total),
      target: 0.6,
      direction: 'min',
      sample: num(c.exercises_total) ?? 0,
    },
    {
      key: 'rating',
      value: num(c.rating_avg),
      target: 3.8,
      direction: 'min',
      sample: num(c.ratings) ?? 0,
    },
    {
      key: 'adjustments',
      value: ratio(c.proposals_accepted, c.proposals_total),
      target: 0.5,
      direction: 'min',
      sample: num(c.proposals_total) ?? 0,
    },
    {
      key: 'aiCost',
      value: num(c.ai_cost_per_active_user_month_eur),
      target: 0.3,
      direction: 'max',
      sample: num(c.active_users) ?? 0,
    },
  ];
  return rows.map((r) => ({
    ...r,
    status:
      r.value === null
        ? 'none'
        : (r.direction === 'min' ? r.value >= r.target : r.value < r.target)
          ? 'ok'
          : 'below',
  }));
}

export function formatMetric(row: Pick<MetricRow, 'key' | 'value'>, language: string): string {
  if (row.value === null) return '—';
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  if (row.key === 'rating') return row.value.toLocaleString(locale, { maximumFractionDigits: 2 });
  if (row.key === 'aiCost') {
    return row.value.toLocaleString(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    });
  }
  return row.value.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 });
}
