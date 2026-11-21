// Guide decisions (pure): day-1 guided tour, celebrated milestones, tip of the day, and the single
// overlay shown at an opening (tour > celebration > tip; the others wait for the next opening).
export const TIPS = [
  'minimal_version',
  'no_time',
  'library',
  'favorites',
  'goal_progress',
  'weekly_review',
] as const;
export type TipId = (typeof TIPS)[number];
// Tip i is due from day i + 2 (days 2 to 7 of the account)
export const FIRST_TIP_DAY = 2;
export const GUIDE_DAYS = 7;

export const MILESTONES = ['goal_achieved', 'program_completed', 'week_1', 'streak_7'] as const;
export type MilestoneId = (typeof MILESTONES)[number];
// A milestone is shown only when reached recently; older ones are recorded silently
export const RECENT_DAYS = 7;

export type GuideState = {
  tourFinishedAt: string | null;
  // {tip: local date seen}
  tipsSeen: Partial<Record<TipId, string>>;
  // {milestone: date}
  milestones: Partial<Record<MilestoneId, string>>;
} | null;

export type GuideInput = {
  today: string;
  // Local date of the end of onboarding (not the program start: a program change resets it)
  onboardedOn: string;
  state: GuideState;
  streakCurrent: number;
  programDay: number | null;
  programDuration: number | null;
  // Local date the active or last goal was achieved, if any
  goalAchievedOn: string | null;
};

export type Overlay =
  | { kind: 'tour' }
  | { kind: 'celebration'; milestone: MilestoneId }
  | { kind: 'tip'; tip: TipId }
  | null;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

// Day of the account: 1 on the day of onboarding
export function accountDay(onboardedOn: string, today: string): number {
  return daysBetween(onboardedOn, today) + 1;
}

export function tourDue(input: GuideInput): boolean {
  return (
    !input.state?.tourFinishedAt && accountDay(input.onboardedOn, input.today) <= GUIDE_DAYS + 1
  );
}

// First tip not seen whose day has come (missed days caught up in order), at most one a day,
// during the first week only
export function tipDue(input: GuideInput): TipId | null {
  const day = accountDay(input.onboardedOn, input.today);
  if (day < FIRST_TIP_DAY || day > GUIDE_DAYS) return null;
  const seen = input.state?.tipsSeen ?? {};
  if (Object.values(seen).includes(input.today)) return null;
  return TIPS.find((tip, i) => !seen[tip] && FIRST_TIP_DAY + i <= day) ?? null;
}

type Reached = { milestone: MilestoneId; recent: boolean };

function reachedMilestones(input: GuideInput): Reached[] {
  const reached: Reached[] = [];
  if (input.goalAchievedOn) {
    reached.push({
      milestone: 'goal_achieved',
      recent: daysBetween(input.goalAchievedOn, input.today) < RECENT_DAYS,
    });
  }
  const day = input.programDay;
  if (day !== null && input.programDuration !== null && day > input.programDuration) {
    reached.push({
      milestone: 'program_completed',
      recent: day - input.programDuration <= RECENT_DAYS,
    });
  }
  if (day !== null && day >= 8) reached.push({ milestone: 'week_1', recent: day <= 14 });
  if (input.streakCurrent >= 7) {
    reached.push({ milestone: 'streak_7', recent: input.streakCurrent < 7 + RECENT_DAYS });
  }
  return reached.filter((r) => !input.state?.milestones?.[r.milestone]);
}

// First recent milestone never celebrated (priority: goal, program, week 1, streak)
export function milestoneToCelebrate(input: GuideInput): MilestoneId | null {
  const recent = reachedMilestones(input).filter((r) => r.recent);
  return MILESTONES.find((m) => recent.some((r) => r.milestone === m)) ?? null;
}

// Reached long ago and never celebrated: recorded without being shown
export function milestonesToRecordSilently(input: GuideInput): MilestoneId[] {
  return reachedMilestones(input)
    .filter((r) => !r.recent)
    .map((r) => r.milestone);
}

// One overlay per opening, by priority: tour, then celebration, then tip of the day
export function overlayToShow(input: GuideInput): Overlay {
  if (tourDue(input)) return { kind: 'tour' };
  const milestone = milestoneToCelebrate(input);
  if (milestone) return { kind: 'celebration', milestone };
  const tip = tipDue(input);
  return tip ? { kind: 'tip', tip } : null;
}
