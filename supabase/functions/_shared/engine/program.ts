// Program mode: current day, advancement and replacement of a program exercise (§ 5.1, § 5.3).
import { diffDays } from './dates.ts';
import {
  type FilterContext,
  isSkippedTwice,
  passesFilters,
  rankCandidates,
  type ScoreContext,
} from './catalog.ts';
import { RATED_LOW_EXCLUSION_DAYS } from './signals.ts';
import type {
  CatalogExercise,
  EngineInput,
  ProgramStep,
  RuleId,
  ScoredCandidate,
} from './types.ts';

export type ProgramDay = {
  day: number;
  advanced: boolean;
};

// Day covered by the plan of `today`, derived from the previous plan (idempotent):
// previous plan day + 1 if its exercise was done and it was not a recovery plan.
export function currentProgramDay(input: EngineInput): ProgramDay {
  const previous = [...input.plans]
    .filter((p) => p.date < input.today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!previous || previous.programDay === null) {
    return { day: input.profile.programDay, advanced: false };
  }
  // Only engine items move the program (user additions do not)
  const done = previous.items.some((i) => i.status === 'done' && i.origin === 'engine');
  const advanced = done && previous.mode !== 'recovery';
  return { day: previous.programDay + (advanced ? 1 : 0), advanced };
}

export function findStep(input: EngineInput, day: number): ProgramStep | null {
  const { programId } = input.profile;
  if (!programId) return null;
  return (
    input.catalog.programSteps.find((s) => s.programId === programId && s.dayIndex === day) ?? null
  );
}

// Why a program exercise cannot be proposed as is (null = fine)
export function programExerciseProblem(
  exercise: CatalogExercise | undefined,
  ctx: FilterContext,
): RuleId | null {
  if (!exercise || exercise.status !== 'published') return 'replaced_unpublished';
  const own = ctx.history.get(exercise.id);
  if (own?.lastRating1On && diffDays(own.lastRating1On, ctx.today) < RATED_LOW_EXCLUSION_DAYS) {
    return 'replaced_rated_low';
  }
  if (!exercise.prerequisiteIds.every((id) => Boolean(ctx.history.get(id)?.lastDoneOn))) {
    return 'replaced_missing_prerequisite';
  }
  if (isSkippedTwice(exercise.id, ctx.history)) return 'replaced_skipped_twice';
  return null;
}

// A shorter exercise sharing the step principle, passing all catalogue filters
export function shorterSamePrinciple(
  original: CatalogExercise | undefined,
  principleId: string,
  exercises: CatalogExercise[],
  filterCtx: FilterContext,
  scoreCtx: ScoreContext,
): ScoredCandidate | null {
  const maxDuration = original ? original.durationMin : Infinity;
  const pool = exercises.filter(
    (e) =>
      e.id !== original?.id &&
      e.principleIds.includes(principleId) &&
      e.durationMin < maxDuration &&
      passesFilters(e, filterCtx),
  );
  return rankCandidates(pool, scoreCtx)[0] ?? null;
}
