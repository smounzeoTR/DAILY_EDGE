// Signals derived from the user's recent history (cahier des charges § 5.1 and § 5.3).
import { addDays, diffDays, previousDays } from './dates.ts';
import type { EngineInput, EnergyLevel, ISODate, PastPlan, UserLevel } from './types.ts';

export const DEFAULT_ENERGY = 3;
export const DEFAULT_DAILY_MINUTES = 15;
export const MAX_DAILY_MINUTES = 45;
export const MINIMAL_MAX_MINUTES = 5;
export const RATED_LOW_EXCLUSION_DAYS = 60;

export type Signals = {
  hasCheckin: boolean;
  energy: number;
  availableMinutes: number;
  inactive3d: boolean;
  lowEnergy: boolean;
  lowEnergy2d: boolean;
  lowTime: boolean;
  lowCompletion: boolean;
  lowMood5d: boolean;
  highCompletion7d: boolean;
  goalBehind: boolean;
};

const planDone = (plan: PastPlan) => plan.items.some((i) => i.status === 'done');

function checkinOn(input: EngineInput, date: ISODate) {
  return input.checkins.find((c) => c.date === date);
}

// Days with at least one exercise done, one habit checked or one check-in
export function activityDays(input: EngineInput): Set<ISODate> {
  const days = new Set<ISODate>([input.profile.onboardedOn]);
  for (const plan of input.plans) if (planDone(plan)) days.add(plan.date);
  for (const date of input.habitLogDates) days.add(date);
  for (const c of input.checkins) days.add(c.date);
  return days;
}

// Recovery: no activity on the 3 full days before the plan date (J-1, J-2, J-3).
// Days before onboarding do not count as inactive.
export function isInactive3d(input: EngineInput): boolean {
  const window = previousDays(input.today, 3);
  const oldest = window[2] as ISODate;
  if (diffDays(input.profile.onboardedOn, oldest) <= 0) return false;
  const days = activityDays(input);
  return window.every((d) => !days.has(d));
}

// Completion over the days that had a plan among `days`; null if fewer than `minDays`
export function completionRate(input: EngineInput, days: number, minDays: number): number | null {
  const window = new Set(previousDays(input.today, days));
  const plans = input.plans.filter((p) => window.has(p.date) && p.items.length > 0);
  if (plans.length < minDays) return null;
  return plans.filter(planDone).length / plans.length;
}

export function acceptedEnergy(energy: number): EnergyLevel[] {
  if (energy <= 2) return ['low'];
  if (energy === 3) return ['low', 'medium'];
  return ['low', 'medium', 'high'];
}

export function maxDifficulty(level: UserLevel): number {
  return { beginner: 2, intermediate: 3, advanced: 4 }[level];
}

// Behind by more than 20 % on a linear path from 0 (creation) to target (deadline)
export function isGoalBehind(input: EngineInput): boolean {
  const goal = input.goal;
  if (!goal || goal.targetValue === null || goal.targetValue <= 0 || !goal.deadline) return false;
  const total = diffDays(goal.createdOn, goal.deadline);
  const elapsed = diffDays(goal.createdOn, input.today);
  if (total <= 0 || elapsed <= 0) return false;
  const expected = goal.targetValue * Math.min(1, elapsed / total);
  return (goal.currentValue ?? 0) < 0.8 * expected;
}

export function computeSignals(input: EngineInput): Signals {
  const yesterday = addDays(input.today, -1);
  const checkin = checkinOn(input, yesterday);
  const energy = checkin?.energy ?? DEFAULT_ENERGY;
  const availableMinutes = Math.min(
    MAX_DAILY_MINUTES,
    checkin?.minutesTomorrow ?? input.profile.dailyMinutes ?? DEFAULT_DAILY_MINUTES,
  );

  const lowEnergyOn = (date: ISODate) => {
    const e = checkinOn(input, date)?.energy;
    return e !== undefined && e !== null && e <= 2;
  };
  const lowMoodOn = (date: ISODate) => {
    const m = checkinOn(input, date)?.mood;
    return m !== undefined && m !== null && m <= 2;
  };

  const completion3d = completionRate(input, 3, 2);
  const completion7d = completionRate(input, 7, 7);

  return {
    hasCheckin: checkin !== undefined,
    energy,
    availableMinutes,
    inactive3d: isInactive3d(input),
    lowEnergy: energy <= 2,
    lowEnergy2d: previousDays(input.today, 2).every(lowEnergyOn),
    lowTime: availableMinutes <= MINIMAL_MAX_MINUTES,
    lowCompletion: completion3d !== null && completion3d < 0.5,
    lowMood5d: previousDays(input.today, 5).every(lowMoodOn),
    highCompletion7d: completion7d !== null && completion7d > 0.85,
    goalBehind: isGoalBehind(input),
  };
}
