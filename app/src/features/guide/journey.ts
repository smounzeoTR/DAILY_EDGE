// Day journey (pure): Principle -> Exercise -> Habits -> Check-in, and the next step.
import { habitStatusOn, type HabitFrequency, type HabitLog } from '@shared/habits/schedule.ts';

export type JourneyStepId = 'principle' | 'exercise' | 'habits' | 'checkin';
export const JOURNEY_STEPS: JourneyStepId[] = ['principle', 'exercise', 'habits', 'checkin'];

export type JourneyInput = {
  today: string;
  // daily_plans.principle_read_at (opening the principle card or "J'ai lu")
  principleReadAt: string | null;
  // Every item of today's plan (engine and user additions)
  items: { status: string }[];
  habits: { id: string; frequency: HabitFrequency; startedOn: string }[];
  logs: (HabitLog & { user_habit_id: string })[];
  checkinDone: boolean;
};

export type Journey = {
  steps: { id: JourneyStepId; done: boolean }[];
  // First step not done, or null when the day is complete
  next: JourneyStepId | null;
  // No habit expected today: the step is filled (the journey never waits on an empty step)
  noHabitDue: boolean;
};

export function dayJourney(input: JourneyInput): Journey {
  const principle = input.principleReadAt !== null;
  // Minimal versions and additions included
  const exercise = input.items.some((i) => i.status === 'done');
  const expected = input.habits
    .filter((h) => h.frequency !== 'occasional')
    .map((h) =>
      habitStatusOn(
        h,
        input.logs.filter((l) => l.user_habit_id === h.id),
        input.today,
      ),
    )
    .filter((s) => s.visible && s.state !== 'not_due');
  const habits = expected.every((s) => s.state !== 'todo');
  const done: Record<JourneyStepId, boolean> = {
    principle,
    exercise,
    habits,
    checkin: input.checkinDone,
  };
  const steps = JOURNEY_STEPS.map((id) => ({ id, done: done[id] }));
  return {
    steps,
    next: steps.find((s) => !s.done)?.id ?? null,
    noHabitDue: expected.length === 0,
  };
}
