// buildPlan: profile + history + catalogue -> plan of one day. Pure and deterministic.
import {
  buildScoreContext,
  eligibleWithRelaxation,
  type FilterContext,
  historyMap,
  MAX_CANDIDATES_LOGGED,
  rankCandidates,
  type ScoreContext,
} from './catalog.ts';
import { weekOfDay } from './dates.ts';
import {
  currentProgramDay,
  findStep,
  programExerciseProblem,
  shorterSamePrinciple,
} from './program.ts';
import { computeSignals, maxDifficulty, MINIMAL_MAX_MINUTES } from './signals.ts';
import type {
  CatalogExercise,
  EngineInput,
  PlanDecision,
  PlanMode,
  RuleId,
  ScoredCandidate,
} from './types.ts';
import { chooseWhyKey, DOMAIN_LABELS, renderWhy } from './why.ts';

const TWO_EXERCISES_MIN_MINUTES = 30;

type Selection = {
  mode: PlanMode;
  exerciseIds: string[];
  adoptedId?: string;
  candidates: ScoredCandidate[];
};

// Best catalogue exercises (1 or 2) with relaxation when nothing passes the filters
function selectFromCatalog(
  exercises: CatalogExercise[],
  filterCtx: FilterContext,
  scoreCtx: ScoreContext,
  count: 1 | 2,
  rules: RuleId[],
): { exerciseIds: string[]; candidates: ScoredCandidate[] } {
  const { eligible, rules: relaxRules } = eligibleWithRelaxation(exercises, filterCtx);
  rules.push(...relaxRules);
  const ranked = rankCandidates(eligible, scoreCtx);
  const first = ranked[0];
  if (!first) {
    rules.push('no_candidate');
    return { exerciseIds: [], candidates: [] };
  }
  const ids = [first.exerciseId];
  if (count === 2) {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const remaining = filterCtx.maxMinutes - (byId.get(first.exerciseId)?.durationMin ?? 0);
    const second = ranked.find(
      (c) =>
        c.exerciseId !== first.exerciseId &&
        (byId.get(c.exerciseId)?.durationMin ?? Infinity) <= remaining,
    );
    if (second) {
      ids.push(second.exerciseId);
      rules.push('catalog_two_exercises');
    }
  }
  return { exerciseIds: ids, candidates: ranked.slice(0, MAX_CANDIDATES_LOGGED) };
}

export function buildPlan(input: EngineInput): PlanDecision {
  const rules: RuleId[] = [];
  const signals = computeSignals(input);
  const byId = new Map(input.catalog.exercises.map((e) => [e.id, e]));
  // Exercises already added by the user are never proposed again
  const added = new Set(input.userAddedExerciseIds);
  const exercises = input.catalog.exercises.filter((e) => !added.has(e.id));

  if (!signals.hasCheckin) rules.push('no_checkin_defaults');

  // Mode: recovery, then minimal, then normal
  let mode: PlanMode = 'normal';
  if (signals.inactive3d) {
    mode = 'recovery';
    rules.push('recovery_inactive_3d');
  } else {
    if (signals.lowEnergy) rules.push('minimal_low_energy');
    if (signals.lowTime) rules.push('minimal_low_time');
    if (signals.lowCompletion) rules.push('minimal_low_completion');
    if (signals.lowMood5d) rules.push('minimal_low_mood_5d');
    if (signals.lowEnergy || signals.lowTime || signals.lowCompletion || signals.lowMood5d) {
      mode = 'minimal';
    }
  }
  // Detected and logged only (display comes later)
  if (signals.lowEnergy2d) rules.push('low_energy_2d');
  if (signals.goalBehind) rules.push('goal_behind_schedule');

  const levelUp = mode === 'normal' && signals.highCompletion7d;
  const filterCtx: FilterContext = {
    today: input.today,
    maxMinutes:
      mode === 'normal'
        ? signals.availableMinutes
        : Math.min(signals.availableMinutes, MINIMAL_MAX_MINUTES),
    energy: signals.energy,
    maxDifficulty: Math.min(5, maxDifficulty(input.profile.level) + (levelUp ? 1 : 0)),
    persona: input.profile.persona,
    history: historyMap(input),
  };
  const scoreCtx = buildScoreContext(input);

  const { day, advanced } = currentProgramDay(input);
  const step = findStep(input, day);
  let selection: Selection;
  let principleId: string | null = null;
  let introducedHabitId: string | null = null;
  let programDay: number | null = null;
  const whyParams: Record<string, string | number> = {};

  if (step) {
    // Program mode: one exercise, principle of the step
    programDay = day;
    principleId = step.principleId;
    rules.push('program_step');
    if (advanced) rules.push('program_advanced');
    let chosenId = mode === 'normal' ? step.mainExerciseId : step.minimalExerciseId;
    const main = byId.get(step.mainExerciseId);
    if (mode === 'normal' && main && main.durationMin > signals.availableMinutes) {
      mode = 'minimal';
      chosenId = step.minimalExerciseId;
      rules.push('program_main_too_long');
    }
    // Program exercises ignore energy; time is checked above
    const programCtx = { ...filterCtx, maxMinutes: signals.availableMinutes };
    // The user already added the step exercise: adopted as the engine item
    const adopted = added.has(chosenId);
    if (adopted) rules.push('adopted_user_item');
    const problem = adopted ? null : programExerciseProblem(byId.get(chosenId), programCtx);
    let candidates: ScoredCandidate[] = [];
    if (problem) {
      rules.push(problem);
      const original = byId.get(chosenId);
      const shorter = shorterSamePrinciple(
        original,
        step.principleId,
        exercises,
        filterCtx,
        scoreCtx,
      );
      const minimalOk =
        chosenId !== step.minimalExerciseId &&
        !added.has(step.minimalExerciseId) &&
        programExerciseProblem(byId.get(step.minimalExerciseId), programCtx) === null &&
        (byId.get(step.minimalExerciseId)?.durationMin ?? Infinity) <= filterCtx.maxMinutes;
      if (shorter) {
        chosenId = shorter.exerciseId;
        candidates = [shorter];
      } else if (minimalOk) {
        chosenId = step.minimalExerciseId;
        if (mode === 'normal') mode = 'minimal';
      } else {
        const fallback = selectFromCatalog(exercises, filterCtx, scoreCtx, 1, rules);
        chosenId = fallback.exerciseIds[0] ?? '';
        candidates = fallback.candidates;
      }
    }
    selection = {
      mode,
      exerciseIds: chosenId ? [chosenId] : [],
      candidates,
      adoptedId: adopted ? chosenId : undefined,
    };
    if (!chosenId && !rules.includes('no_candidate')) rules.push('no_candidate');
    if (step.introducedHabitId && !input.ownedHabitTemplateIds.includes(step.introducedHabitId)) {
      introducedHabitId = step.introducedHabitId;
      rules.push('habit_introduced');
    }
    whyParams.week = weekOfDay(day);
    whyParams.theme = input.language === 'en' ? step.themeEn : step.themeFr;
  } else {
    // Catalogue mode: after the program (or without program)
    const program = input.catalog.programs.find((p) => p.id === input.profile.programId);
    if (program && day > program.durationDays) rules.push('program_completed');
    rules.push('catalog_mode');
    if (levelUp) rules.push('level_up_high_completion');
    const count: 1 | 2 =
      mode === 'normal' && signals.availableMinutes >= TWO_EXERCISES_MIN_MINUTES ? 2 : 1;
    const picked = selectFromCatalog(exercises, filterCtx, scoreCtx, count, rules);
    selection = { mode, ...picked };
    const first = byId.get(picked.exerciseIds[0] ?? '');
    principleId = first?.principleIds[0] ?? null;
    if (first) whyParams.domain = DOMAIN_LABELS[first.domain][input.language];
  }

  const firstDomain = byId.get(selection.exerciseIds[0] ?? '')?.domain;
  const catalogDomainIsPriority =
    firstDomain !== undefined && input.profile.priorityDomains.includes(firstDomain);
  const whyKey = chooseWhyKey(rules, catalogDomainIsPriority);
  const usedParams: Record<string, string | number> =
    whyKey === 'program_week'
      ? { week: whyParams.week ?? 1, theme: whyParams.theme ?? '' }
      : whyKey === 'catalog_domain'
        ? { domain: whyParams.domain ?? '' }
        : {};

  return {
    date: input.today,
    mode: selection.mode,
    programDay,
    programId: programDay !== null ? input.profile.programId : null,
    nextProfileProgramDay: day,
    principleId,
    items: selection.exerciseIds.map((exerciseId, i) => ({
      exerciseId,
      position: i + 1,
      adopted: exerciseId === selection.adoptedId,
    })),
    introducedHabitId,
    budgetMinutes: step ? signals.availableMinutes : filterCtx.maxMinutes,
    whyToday: renderWhy(whyKey, input.language, usedParams),
    whyKey,
    whyParams: usedParams,
    rulesFired: rules,
    candidates: selection.candidates,
  };
}
