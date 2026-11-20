// Weekly review (Monday-Sunday): summary and 1-3 rule-based proposals. Pure, no I/O.
// Stored as data (type + params); the app renders the texts in FR or EN.
import { addDays, type HabitFrequency } from '../habits/schedule.ts';
import { habitRates } from '../habits/rates.ts';

type ISODate = string;
type Level = 'beginner' | 'intermediate' | 'advanced';

export type ReviewInput = {
  // Monday of the reviewed week
  weekStart: ISODate;
  consentCheckin: boolean;
  level: Level;
  dailyMinutes: number | null;
  persona: string | null;
  // Plans from at least weekStart - 7 to the end of the week
  plans: {
    date: ISODate;
    mode: 'normal' | 'minimal' | 'recovery';
    items: { status: string; origin: 'engine' | 'user'; durationMin: number }[];
  }[];
  // Active habits
  habits: {
    id: string;
    templateId: string | null;
    frequency: HabitFrequency;
    startedOn: ISODate;
    simplified: boolean;
    domain: string | null;
  }[];
  habitLogs: { habitId: string; date: ISODate; done: boolean; minimal: boolean }[];
  checkins: { date: ISODate; energy: number | null }[];
  goal: {
    id: string;
    targetValue: number | null;
    currentValue: number | null;
    currentValueUpdatedOn: ISODate | null;
    createdOn: ISODate;
    deadline: ISODate | null;
  } | null;
  // Published templates (replacement candidates)
  templates: { id: string; domain: string; personas: string[] }[];
  // Templates of all the user's habits, active or not
  ownedTemplateIds: string[];
};

export type ProposalType =
  | 'habit_simplify'
  | 'habit_replace'
  | 'goal_deadline'
  | 'update_goal_progress'
  | 'level_up'
  | 'daily_minutes';

export type Proposal = {
  type: ProposalType;
  priority: 1 | 2 | 3 | 4;
  params: Record<string, string | number>;
};

export type ReviewStats = {
  weekStart: ISODate;
  weekEnd: ISODate;
  exercisesDone: number;
  exercisesPlanned: number;
  habits: { habitId: string; done: number; expected: number; rate: number | null }[];
  // null without check-in consent or without values
  energyAverage: number | null;
  bestDay: ISODate | null;
};

export type WeeklyReview = { stats: ReviewStats; proposals: Proposal[] };

export const MAX_PROPOSALS = 3;
export const HABIT_LOW_RATE = 0.3;
export const HABIT_RATE_DAYS = 14;
export const GOAL_BEHIND_RATIO = 0.8;
export const GOAL_VALUE_MAX_AGE_DAYS = 14;
export const LEVEL_UP_RATE = 0.85;
export const LEVEL_UP_MIN_PLAN_DAYS = 4;
export const TIME_MIN_DAYS = 3;
const MINUTE_BUCKETS = [5, 15, 30, 45];
const NEXT_LEVEL: Record<Level, Level | null> = {
  beginner: 'intermediate',
  intermediate: 'advanced',
  advanced: null,
};

function diffDays(from: ISODate, to: ISODate): number {
  const ms = (d: ISODate) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

const inRange = (date: ISODate, from: ISODate, to: ISODate) => date >= from && date <= to;
const isDone = (items: { status: string }[]) => items.some((i) => i.status === 'done');

// Days done / days with a plan in [from, to]; null below `minDays` days with a plan
function completion(
  input: ReviewInput,
  from: ISODate,
  to: ISODate,
  minDays: number,
): number | null {
  const days = input.plans.filter((p) => inRange(p.date, from, to) && p.items.length > 0);
  if (days.length < minDays) return null;
  return days.filter((p) => isDone(p.items)).length / days.length;
}

function stats(input: ReviewInput, weekEnd: ISODate): ReviewStats {
  const week = input.plans.filter((p) => inRange(p.date, input.weekStart, weekEnd));
  const items = week.flatMap((p) => p.items);
  const habits = habitRates(
    input.habits.map((h) => ({ id: h.id, frequency: h.frequency, startedOn: h.startedOn })),
    input.habitLogs,
    weekEnd,
    7,
  ).map((r) => ({ habitId: r.habitId, done: r.done, expected: r.expected, rate: r.rate }));

  const energies = input.checkins
    .filter((c) => inRange(c.date, input.weekStart, weekEnd) && c.energy !== null)
    .map((c) => c.energy as number);
  const energyAverage =
    input.consentCheckin && energies.length > 0
      ? Math.round((energies.reduce((a, b) => a + b, 0) / energies.length) * 10) / 10
      : null;

  // Best day: most exercises done + habits checked (latest day on a tie)
  let bestDay: ISODate | null = null;
  let bestScore = 0;
  for (let day = input.weekStart; day <= weekEnd; day = addDays(day, 1)) {
    const exercises = week
      .filter((p) => p.date === day)
      .flatMap((p) => p.items)
      .filter((i) => i.status === 'done').length;
    const checked = input.habitLogs.filter((l) => l.date === day && l.done).length;
    const score = exercises + checked;
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      bestDay = day;
    }
  }

  return {
    weekStart: input.weekStart,
    weekEnd,
    exercisesDone: items.filter((i) => i.status === 'done').length,
    exercisesPlanned: items.length,
    habits,
    energyAverage,
    bestDay,
  };
}

function habitProposals(input: ReviewInput, weekEnd: ISODate): Proposal[] {
  const owned = new Set(input.ownedTemplateIds);
  const low = input.habits
    .filter((h) => h.frequency !== 'occasional')
    .map((h) => ({
      habit: h,
      rate: habitRates(
        [{ id: h.id, frequency: h.frequency, startedOn: h.startedOn }],
        input.habitLogs,
        weekEnd,
        HABIT_RATE_DAYS,
      )[0],
    }))
    .filter(
      (r) => r.rate && r.rate.expected >= 2 && r.rate.rate !== null && r.rate.rate < HABIT_LOW_RATE,
    )
    .sort(
      (a, b) => (a.rate?.rate ?? 0) - (b.rate?.rate ?? 0) || a.habit.id.localeCompare(b.habit.id),
    );

  return low.flatMap(({ habit }): Proposal[] => {
    if (!habit.simplified) {
      return [{ type: 'habit_simplify', priority: 1, params: { user_habit_id: habit.id } }];
    }
    // Already simplified and still low: another template of the same domain
    const replacement = input.templates
      .filter(
        (t) =>
          t.domain === habit.domain &&
          !owned.has(t.id) &&
          (t.personas.length === 0 ||
            (input.persona !== null && t.personas.includes(input.persona))),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    return replacement
      ? [
          {
            type: 'habit_replace',
            priority: 1,
            params: { user_habit_id: habit.id, template_id: replacement.id },
          },
        ]
      : [];
  });
}

function goalProposal(input: ReviewInput, weekEnd: ISODate): Proposal | null {
  const goal = input.goal;
  if (!goal || goal.targetValue === null || goal.targetValue <= 0 || !goal.deadline) return null;
  if (goal.deadline <= weekEnd) return null;
  const elapsed = diffDays(goal.createdOn, weekEnd);
  if (elapsed < 7) return null;

  // Missing or stale value: ask for an update instead of computing a new date
  const stale =
    goal.currentValue === null ||
    !goal.currentValueUpdatedOn ||
    diffDays(goal.currentValueUpdatedOn, weekEnd) > GOAL_VALUE_MAX_AGE_DAYS;
  if (stale) return { type: 'update_goal_progress', priority: 2, params: { goal_id: goal.id } };

  const current = goal.currentValue as number;
  const total = diffDays(goal.createdOn, goal.deadline);
  const expected = goal.targetValue * Math.min(1, elapsed / total);
  if (current >= GOAL_BEHIND_RATIO * expected) return null;

  // New date from the real pace (value / days until the value was entered)
  const measured = Math.max(1, diffDays(goal.createdOn, goal.currentValueUpdatedOn as ISODate));
  const pace = current / measured;
  const remaining = goal.targetValue - current;
  if (pace <= 0 || remaining <= 0) return null;
  const deadline = addDays(weekEnd, Math.ceil(remaining / pace));
  if (deadline <= goal.deadline) return null;
  return {
    type: 'goal_deadline',
    priority: 2,
    params: { goal_id: goal.id, deadline, previous_deadline: goal.deadline },
  };
}

function levelProposal(input: ReviewInput, weekEnd: ISODate): Proposal | null {
  const next = NEXT_LEVEL[input.level];
  if (!next) return null;
  const previousWeek = completion(
    input,
    addDays(input.weekStart, -7),
    addDays(input.weekStart, -1),
    LEVEL_UP_MIN_PLAN_DAYS,
  );
  const thisWeek = completion(input, input.weekStart, weekEnd, LEVEL_UP_MIN_PLAN_DAYS);
  if (previousWeek === null || thisWeek === null) return null;
  if (previousWeek <= LEVEL_UP_RATE || thisWeek <= LEVEL_UP_RATE) return null;
  return { type: 'level_up', priority: 3, params: { from: input.level, to: next } };
}

// Real time measured on normal days only: short versions never push the time down
function timeProposal(input: ReviewInput, weekEnd: ISODate): Proposal | null {
  const days = input.plans.filter(
    (p) => inRange(p.date, input.weekStart, weekEnd) && p.mode === 'normal' && isDone(p.items),
  );
  if (days.length < TIME_MIN_DAYS) return null;
  const minutes = days.map((p) =>
    p.items.filter((i) => i.status === 'done').reduce((sum, i) => sum + i.durationMin, 0),
  );
  const average = minutes.reduce((a, b) => a + b, 0) / minutes.length;
  const declared = input.dailyMinutes ?? 15;
  // Smallest bucket covering the real time (never below what the user actually does)
  const covering = (candidates: number[]) =>
    candidates.find((b) => b >= average) ?? candidates[candidates.length - 1];
  let target: number | undefined;
  if (average <= declared * 0.5) target = covering(MINUTE_BUCKETS.filter((b) => b < declared));
  else if (average >= declared * 1.5) target = covering(MINUTE_BUCKETS.filter((b) => b > declared));
  if (target === undefined || target === declared) return null;
  return {
    type: 'daily_minutes',
    priority: 4,
    params: { minutes: target, previous_minutes: declared, average: Math.round(average) },
  };
}

export function buildWeeklyReview(input: ReviewInput): WeeklyReview {
  const weekEnd = addDays(input.weekStart, 6);
  const proposals = [
    ...habitProposals(input, weekEnd),
    goalProposal(input, weekEnd),
    levelProposal(input, weekEnd),
    timeProposal(input, weekEnd),
  ]
    .filter((p): p is Proposal => p !== null)
    // Stable sort: priority first, then the order of the rules
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_PROPOSALS);
  return { stats: stats(input, weekEnd), proposals };
}

// Monday of the week containing `date`
export function mondayOf(date: ISODate): ISODate {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
