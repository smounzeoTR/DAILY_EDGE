// Habit success rates over a window (pure; shared by the app and the weekly review).
import {
  addDays,
  habitStatusOn,
  periodOf,
  type HabitFrequency,
  type HabitLog,
} from './schedule.ts';

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
