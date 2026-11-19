// Test builders: a small hand-made catalogue and an input factory.
import { addDays } from '../dates.ts';
import type {
  CatalogExercise,
  EngineInput,
  ExerciseHistory,
  ItemStatus,
  PastPlan,
  PlanMode,
  ProgramStep,
} from '../types.ts';

export const TODAY = '2026-12-10';
export const day = (offset: number) => addDays(TODAY, offset);

export function exercise(id: string, patch: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id,
    status: 'published',
    domain: 'clarity_goals',
    principleIds: ['P001'],
    durationMin: 10,
    difficulty: 1,
    energy: 'medium',
    personas: [],
    blockers: [],
    prerequisiteIds: [],
    repeatAfterDays: 7,
    ...patch,
  };
}

// Program PR1 of 3 days: main E01/E02/E03, minimal M01/M02/M03
export function smallCatalog(): EngineInput['catalog'] {
  const steps: ProgramStep[] = [1, 2, 3].map((d) => ({
    programId: 'PR1',
    dayIndex: d,
    principleId: `P00${d}`,
    mainExerciseId: `E0${d}`,
    minimalExerciseId: `M0${d}`,
    introducedHabitId: d === 1 ? 'H01' : null,
    themeFr: 'Clarifier l’objectif',
    themeEn: 'Clarify the goal',
  }));
  return {
    programs: [{ id: 'PR1', durationDays: 3 }],
    programSteps: steps,
    exercises: [
      exercise('E01', { principleIds: ['P001'], durationMin: 10 }),
      exercise('E02', { principleIds: ['P002'], durationMin: 15, prerequisiteIds: ['E01'] }),
      exercise('E03', { principleIds: ['P003'], durationMin: 30, energy: 'high' }),
      exercise('M01', { principleIds: ['P001'], durationMin: 2, energy: 'low' }),
      exercise('M02', { principleIds: ['P002'], durationMin: 5, energy: 'low' }),
      exercise('M03', { principleIds: ['P003'], durationMin: 5, energy: 'low' }),
      // Catalogue-only exercises
      exercise('C01', { domain: 'business_career', principleIds: ['P010'], blockers: ['fear'] }),
      exercise('C02', { domain: 'energy_health', principleIds: ['P011'], durationMin: 15 }),
      exercise('C03', {
        domain: 'money_wealth',
        principleIds: ['P012'],
        durationMin: 5,
        energy: 'low',
      }),
      exercise('C04', {
        domain: 'business_career',
        principleIds: ['P002'],
        durationMin: 5,
        energy: 'low',
      }),
    ],
  };
}

export function makeInput(patch: Partial<EngineInput> = {}): EngineInput {
  const base: EngineInput = {
    today: TODAY,
    language: 'fr',
    profile: {
      level: 'beginner',
      dailyMinutes: 15,
      persona: 'entrepreneur',
      programId: 'PR1',
      programDay: 1,
      priorityDomains: ['business_career', 'energy_health'],
      blockers: ['fear'],
      onboardedOn: TODAY,
    },
    checkins: [],
    plans: [],
    exerciseHistory: [],
    habitLogDates: [],
    ownedHabitTemplateIds: [],
    goal: null,
    catalog: smallCatalog(),
  };
  return { ...base, ...patch, profile: { ...base.profile, ...(patch.profile ?? {}) } };
}

export function plan(
  date: string,
  exerciseId: string,
  status: ItemStatus,
  extra: { mode?: PlanMode; programDay?: number | null; rating?: number | null } = {},
): PastPlan {
  return {
    date,
    mode: extra.mode ?? 'normal',
    programDay: extra.programDay === undefined ? null : extra.programDay,
    items: [{ exerciseId, status, rating: extra.rating ?? null }],
  };
}

export function history(exerciseId: string, patch: Partial<ExerciseHistory> = {}): ExerciseHistory {
  return { exerciseId, lastDoneOn: null, skips: 0, lastRating1On: null, ...patch };
}

export function checkin(date: string, patch: Partial<EngineInput['checkins'][number]> = {}) {
  return { date, energy: 4, mood: 4, minutesTomorrow: 15, ...patch };
}
