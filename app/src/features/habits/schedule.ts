// Habit visibility and state on a given day, by frequency (pure; reused for rates in lot 5).
// Dates are local YYYY-MM-DD strings in the user's time zone.

export type HabitFrequency =
  'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'occasional';

export type HabitLog = { date: string; done: boolean; minimal: boolean };

export type HabitDayState =
  // Due and not done yet
  | 'todo'
  // Done on that day (full or minimal version)
  | 'done'
  | 'done_minimal'
  // Done earlier in the current period (week, 2 weeks, month)
  | 'done_in_period'
  // Not due that day (weekdays habit on a weekend)
  | 'not_due';

export type HabitDayStatus = {
  visible: boolean;
  state: HabitDayState;
  // Period the day belongs to; null for "occasional"
  period: { start: string; end: string } | null;
  // "Occasional" habits never count in success rates
  countsForRate: boolean;
};

const DAY_MS = 86_400_000;
const BIWEEKLY_DAYS = 14;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

// 1 = Monday ... 7 = Sunday
export function isoWeekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

// Period containing `date` (weekly: Monday-Sunday; biweekly: 14-day windows from `startedOn`;
// monthly: calendar month; others: the day itself)
export function periodOf(
  frequency: HabitFrequency,
  date: string,
  startedOn: string,
): { start: string; end: string } | null {
  switch (frequency) {
    case 'occasional':
      return null;
    case 'daily':
    case 'weekdays':
      return { start: date, end: date };
    case 'weekly': {
      const start = addDays(date, -(isoWeekday(date) - 1));
      return { start, end: addDays(start, 6) };
    }
    case 'biweekly': {
      const index = Math.floor(diffDays(startedOn, date) / BIWEEKLY_DAYS);
      const start = addDays(startedOn, index * BIWEEKLY_DAYS);
      return { start, end: addDays(start, BIWEEKLY_DAYS - 1) };
    }
    case 'monthly': {
      const [y, m] = date.split('-').map(Number);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = fromUtc(Date.UTC(y ?? 1970, m ?? 1, 0));
      return { start, end };
    }
  }
}

export function habitStatusOn(
  habit: { frequency: HabitFrequency; startedOn: string },
  logs: HabitLog[],
  date: string,
): HabitDayStatus {
  const done = logs.filter((l) => l.done);
  const onDay = done.find((l) => l.date === date);
  const dayState: HabitDayState = onDay ? (onDay.minimal ? 'done_minimal' : 'done') : 'todo';

  if (habit.frequency === 'occasional') {
    return { visible: true, state: dayState, period: null, countsForRate: false };
  }

  const period = periodOf(habit.frequency, date, habit.startedOn);
  if (habit.frequency === 'weekdays' && isoWeekday(date) > 5) {
    return { visible: false, state: 'not_due', period, countsForRate: false };
  }
  if (onDay || !period) {
    return { visible: true, state: dayState, period, countsForRate: true };
  }
  const doneEarlier = done.some((l) => l.date >= period.start && l.date < date);
  return {
    visible: true,
    state: doneEarlier ? 'done_in_period' : 'todo',
    period,
    countsForRate: true,
  };
}
