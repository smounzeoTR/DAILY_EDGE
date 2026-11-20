// Progress computations (pure). Dates are local YYYY-MM-DD strings in the user's time zone.
import {
  addDays,
  habitStatusOn,
  periodOf,
  type HabitFrequency,
  type HabitLog,
} from '../habits/schedule';

// ---------------------------------------------------------------------------
// Streak: "never miss twice" (P027)
// ---------------------------------------------------------------------------

export type Streak = { current: number; record: number; todayDone: boolean };

// A day counts if at least one exercise was done (minimal version and additions included).
// One missed day alone does not break the streak; two missed days in a row reset it.
// Today never breaks it (it counts once done). The value is the number of days done.
export function streak(doneDays: string[], today: string, startedOn: string | null): Streak {
  const done = new Set(doneDays.filter((d) => d <= today));
  const first = [startedOn, ...[...done].sort()].filter((d): d is string => Boolean(d)).sort()[0];
  if (!first) return { current: 0, record: 0, todayDone: false };

  let current = 0;
  let record = 0;
  let missed = 0;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (done.has(day)) {
      current += 1;
      missed = 0;
    } else if (day !== today) {
      missed += 1;
      if (missed >= 2) current = 0;
    }
    record = Math.max(record, current);
  }
  return { current, record, todayDone: done.has(today) };
}

// ---------------------------------------------------------------------------
// Completion rate: days with an exercise done / days that had a plan
// ---------------------------------------------------------------------------

export type DayPlan = { date: string; items: { status: string }[] };

export function isPlanDone(plan: DayPlan): boolean {
  return plan.items.some((i) => i.status === 'done');
}

// Over the last `days` days (today included only if done); null when no day had a plan
export function completionRate(plans: DayPlan[], today: string, days: number): number | null {
  const from = addDays(today, -(days - 1));
  const counted = plans.filter(
    (p) =>
      p.date >= from &&
      p.date <= today &&
      p.items.length > 0 &&
      (p.date !== today || isPlanDone(p)),
  );
  if (counted.length === 0) return null;
  return counted.filter(isPlanDone).length / counted.length;
}

// Day-by-day state for the chart (oldest first)
export type DayState = 'done' | 'missed' | 'none' | 'today';

export function dayStates(
  plans: DayPlan[],
  today: string,
  days: number,
): { date: string; state: DayState }[] {
  const byDate = new Map(plans.map((p) => [p.date, p]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    const plan = byDate.get(date);
    const state: DayState =
      plan && isPlanDone(plan)
        ? 'done'
        : date === today
          ? 'today'
          : plan && plan.items.length > 0
            ? 'missed'
            : 'none';
    return { date, state };
  });
}

// ---------------------------------------------------------------------------
// Habit rates: periods done / periods expected (habitStatusOn + periodOf)
// ---------------------------------------------------------------------------

export type HabitRate = { habitId: string; expected: number; done: number; rate: number | null };

export function habitRates(
  habits: { id: string; frequency: HabitFrequency; startedOn: string }[],
  logs: (HabitLog & { habitId: string })[],
  today: string,
  days: number,
): HabitRate[] {
  const windowStart = addDays(today, -(days - 1));
  return (
    habits
      // "Occasional" habits never count
      .filter((h) => h.frequency !== 'occasional')
      .map((habit) => {
        const own = logs.filter((l) => l.habitId === habit.id);
        const seen = new Set<string>();
        let expected = 0;
        let done = 0;
        const start = habit.startedOn > windowStart ? habit.startedOn : windowStart;
        for (let day = start; day <= today; day = addDays(day, 1)) {
          const period = periodOf(habit.frequency, day, habit.startedOn);
          if (!period || seen.has(period.start)) continue;
          // Evaluate the period on its last elapsed day
          const last = period.end < today ? period.end : today;
          const status = habitStatusOn(habit, own, last);
          if (!status.visible || !status.countsForRate) {
            // Weekdays habit on a weekend: not due that day, the next days may be
            continue;
          }
          seen.add(period.start);
          const isDone = status.state !== 'todo';
          // The current period counts only once done
          if (period.end >= today && !isDone) continue;
          expected += 1;
          if (isDone) done += 1;
        }
        return { habitId: habit.id, expected, done, rate: expected > 0 ? done / expected : null };
      })
  );
}

// ---------------------------------------------------------------------------
// Goal: progress and expected linear trajectory (creation -> deadline)
// ---------------------------------------------------------------------------

export type GoalProgress = {
  // current / target, capped to [0, 1]; null without target
  ratio: number | null;
  // expected value today on the linear path from 0 to target; null without target or deadline
  expected: number | null;
  expectedRatio: number | null;
};

function diffDays(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export function goalProgress(
  goal: {
    targetValue: number | null;
    currentValue: number | null;
    createdOn: string;
    deadline: string | null;
  },
  today: string,
): GoalProgress {
  const target = goal.targetValue;
  if (target === null || target <= 0) return { ratio: null, expected: null, expectedRatio: null };
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const ratio = clamp((goal.currentValue ?? 0) / target);
  if (!goal.deadline) return { ratio, expected: null, expectedRatio: null };
  const total = diffDays(goal.createdOn, goal.deadline);
  if (total <= 0) return { ratio, expected: target, expectedRatio: 1 };
  const share = clamp(diffDays(goal.createdOn, today) / total);
  return { ratio, expected: target * share, expectedRatio: share };
}
