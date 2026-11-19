// Catalogue mode: eliminatory filters, progressive relaxation and scoring (§ 5.2).
import { diffDays } from './dates.ts';
import { acceptedEnergy, MINIMAL_MAX_MINUTES, RATED_LOW_EXCLUSION_DAYS } from './signals.ts';
import type {
  CatalogExercise,
  Domain,
  EngineInput,
  EnergyLevel,
  ExerciseHistory,
  ISODate,
  RuleId,
  ScoredCandidate,
  ScoreParts,
} from './types.ts';

export const WEIGHTS = { domain: 0.3, blocker: 0.25, affinity: 0.15, novelty: 0.15, balance: 0.15 };
export const AFFINITY_MIN_RATINGS = 10;
const DOMAIN_RANK_SCORES = [1, 0.75, 0.5];
const NOVELTY_DAYS = 30;
const BALANCE_DAYS = 14;
const SKIP_LIMIT = 2;
export const MAX_CANDIDATES_LOGGED = 10;

export type FilterContext = {
  today: ISODate;
  maxMinutes: number;
  energy: number;
  maxDifficulty: number;
  persona: EngineInput['profile']['persona'];
  history: Map<string, ExerciseHistory>;
};

// Filters that may be relaxed, in relaxation order
export type Relaxation = 'repeat' | 'skipped' | 'difficulty' | 'energy' | 'persona';
export const RELAXATION_ORDER: { relax: Relaxation; rule: RuleId }[] = [
  { relax: 'repeat', rule: 'relaxed_repeat_delay' },
  { relax: 'skipped', rule: 'relaxed_skipped_twice' },
  { relax: 'difficulty', rule: 'relaxed_difficulty' },
  { relax: 'energy', rule: 'relaxed_energy' },
  { relax: 'persona', rule: 'relaxed_persona' },
];

export function historyMap(input: EngineInput): Map<string, ExerciseHistory> {
  return new Map(input.exerciseHistory.map((h) => [h.exerciseId, h]));
}

// Never relaxed: published, not rated 1/5 within 60 days, prerequisites done
export function passesHardFilters(
  exercise: CatalogExercise,
  ctx: Pick<FilterContext, 'today' | 'history'>,
): boolean {
  if (exercise.status !== 'published') return false;
  const own = ctx.history.get(exercise.id);
  if (own?.lastRating1On && diffDays(own.lastRating1On, ctx.today) < RATED_LOW_EXCLUSION_DAYS) {
    return false;
  }
  return exercise.prerequisiteIds.every((id) => Boolean(ctx.history.get(id)?.lastDoneOn));
}

export function isSkippedTwice(exerciseId: string, history: Map<string, ExerciseHistory>): boolean {
  return (history.get(exerciseId)?.skips ?? 0) >= SKIP_LIMIT;
}

export function passesFilters(
  exercise: CatalogExercise,
  ctx: FilterContext,
  relaxed: ReadonlySet<Relaxation> = new Set(),
): boolean {
  if (!passesHardFilters(exercise, ctx)) return false;
  if (exercise.durationMin > ctx.maxMinutes) return false;
  if (
    !relaxed.has('persona') &&
    exercise.personas.length > 0 &&
    !exercise.personas.includes(ctx.persona)
  ) {
    return false;
  }
  const energies: EnergyLevel[] = relaxed.has('energy')
    ? ['low', 'medium', 'high']
    : acceptedEnergy(ctx.energy);
  if (!energies.includes(exercise.energy)) return false;
  const maxDifficulty = Math.min(5, ctx.maxDifficulty + (relaxed.has('difficulty') ? 1 : 0));
  if (exercise.difficulty > maxDifficulty) return false;
  if (!relaxed.has('skipped') && isSkippedTwice(exercise.id, ctx.history)) return false;
  if (!relaxed.has('repeat')) {
    const lastDone = ctx.history.get(exercise.id)?.lastDoneOn;
    if (lastDone) {
      if (exercise.repeatAfterDays === null) return false;
      if (diffDays(lastDone, ctx.today) < exercise.repeatAfterDays) return false;
    }
  }
  return true;
}

// Eligible exercises with the smallest relaxation that yields at least one candidate.
// Last resort: hard filters + duration <= 5 minutes.
export function eligibleWithRelaxation(
  exercises: CatalogExercise[],
  ctx: FilterContext,
  accept: (e: CatalogExercise) => boolean = () => true,
): { eligible: CatalogExercise[]; rules: RuleId[] } {
  const relaxed = new Set<Relaxation>();
  const rules: RuleId[] = [];
  const pick = () => exercises.filter((e) => accept(e) && passesFilters(e, ctx, relaxed));
  let eligible = pick();
  for (const step of RELAXATION_ORDER) {
    if (eligible.length > 0) return { eligible, rules };
    relaxed.add(step.relax);
    rules.push(step.rule);
    eligible = pick();
  }
  if (eligible.length > 0) return { eligible, rules };
  rules.push('relaxed_short_fallback');
  const shortCap = Math.min(MINIMAL_MAX_MINUTES, ctx.maxMinutes);
  eligible = exercises.filter(
    (e) => accept(e) && passesHardFilters(e, ctx) && e.durationMin <= shortCap,
  );
  return { eligible, rules };
}

export type ScoreContext = {
  priorityDomains: Domain[];
  blockers: EngineInput['profile']['blockers'];
  // Average rating (1-5) per domain, or null below the cold-start threshold
  affinityByDomain: Map<Domain, number> | null;
  lastProposedOn: Map<string, ISODate>;
  domainShare14d: Map<Domain, number>;
  today: ISODate;
};

export function buildScoreContext(input: EngineInput): ScoreContext {
  const byId = new Map(input.catalog.exercises.map((e) => [e.id, e]));
  const ratings: { domain: Domain; rating: number }[] = [];
  const lastProposedOn = new Map<string, ISODate>();
  const domainCounts = new Map<Domain, number>();
  let recentItems = 0;
  for (const plan of input.plans) {
    const recent = diffDays(plan.date, input.today) <= BALANCE_DAYS;
    for (const item of plan.items) {
      const exercise = byId.get(item.exerciseId);
      const previous = lastProposedOn.get(item.exerciseId);
      if (!previous || previous < plan.date) lastProposedOn.set(item.exerciseId, plan.date);
      if (!exercise) continue;
      if (item.rating !== null) ratings.push({ domain: exercise.domain, rating: item.rating });
      if (recent) {
        domainCounts.set(exercise.domain, (domainCounts.get(exercise.domain) ?? 0) + 1);
        recentItems += 1;
      }
    }
  }
  let affinityByDomain: Map<Domain, number> | null = null;
  if (ratings.length >= AFFINITY_MIN_RATINGS) {
    const sums = new Map<Domain, { sum: number; n: number }>();
    for (const r of ratings) {
      const s = sums.get(r.domain) ?? { sum: 0, n: 0 };
      sums.set(r.domain, { sum: s.sum + r.rating, n: s.n + 1 });
    }
    affinityByDomain = new Map([...sums].map(([d, s]) => [d, s.sum / s.n]));
  }
  const domainShare14d = new Map(
    [...domainCounts].map(([d, n]) => [d, recentItems > 0 ? n / recentItems : 0]),
  );
  return {
    priorityDomains: input.profile.priorityDomains,
    blockers: input.profile.blockers,
    affinityByDomain,
    lastProposedOn,
    domainShare14d,
    today: input.today,
  };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export function scoreExercise(exercise: CatalogExercise, ctx: ScoreContext): ScoredCandidate {
  const rank = ctx.priorityDomains.indexOf(exercise.domain);
  const avg = ctx.affinityByDomain?.get(exercise.domain);
  const last = ctx.lastProposedOn.get(exercise.id);
  const parts: ScoreParts = {
    domain: rank >= 0 ? (DOMAIN_RANK_SCORES[rank] ?? 0) : 0,
    blocker: exercise.blockers.some((b) => ctx.blockers.includes(b)) ? 1 : 0,
    affinity: avg === undefined ? 0.5 : (avg - 1) / 4,
    novelty: last ? Math.min(1, diffDays(last, ctx.today) / NOVELTY_DAYS) : 1,
    balance: 1 - (ctx.domainShare14d.get(exercise.domain) ?? 0),
  };
  const score =
    WEIGHTS.domain * parts.domain +
    WEIGHTS.blocker * parts.blocker +
    WEIGHTS.affinity * parts.affinity +
    WEIGHTS.novelty * parts.novelty +
    WEIGHTS.balance * parts.balance;
  return { exerciseId: exercise.id, score: round(score), parts };
}

// Highest score first; ties broken by exercise ID (deterministic)
export function rankCandidates(exercises: CatalogExercise[], ctx: ScoreContext): ScoredCandidate[] {
  return exercises
    .map((e) => scoreExercise(e, ctx))
    .sort((a, b) => b.score - a.score || a.exerciseId.localeCompare(b.exerciseId));
}
