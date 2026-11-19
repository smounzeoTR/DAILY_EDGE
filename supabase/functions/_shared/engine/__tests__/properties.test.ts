// Properties checked on varied generated profiles and histories, with the real catalogue.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildPlan } from '../buildPlan.ts';
import { addDays, diffDays } from '../dates.ts';
import type {
  Catalog,
  Domain,
  EngineInput,
  ExerciseHistory,
  ItemStatus,
  PastPlan,
} from '../types.ts';
import { loadRealCatalog } from './realCatalog.ts';

const TODAY = '2026-12-10';
const DOMAINS: Domain[] = [
  'clarity_goals',
  'discipline_habits',
  'money_wealth',
  'business_career',
  'mindset_beliefs',
  'relationships_network',
  'energy_health',
];
const SEED = 20261210;
const RUNS = 500;

let catalog: Catalog;
beforeAll(async () => {
  catalog = await loadRealCatalog();
});

// History consistent with the plans, plus older activity
function historyFrom(
  plans: PastPlan[],
  extraDone: string[],
  extraRated1: string[],
): ExerciseHistory[] {
  const map = new Map<string, ExerciseHistory>();
  const get = (id: string) => {
    const h = map.get(id) ?? { exerciseId: id, lastDoneOn: null, skips: 0, lastRating1On: null };
    map.set(id, h);
    return h;
  };
  for (const id of extraDone) get(id).lastDoneOn = addDays(TODAY, -200);
  for (const id of extraRated1) get(id).lastRating1On = addDays(TODAY, -30);
  for (const p of [...plans].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const item of p.items) {
      const h = get(item.exerciseId);
      if (item.status === 'done') h.lastDoneOn = p.date;
      if (item.status === 'skipped' || item.status === 'too_hard') h.skips += 1;
      if (item.rating === 1) h.lastRating1On = p.date;
    }
  }
  return [...map.values()];
}

function inputArbitrary(): fc.Arbitrary<EngineInput> {
  const exerciseIds = () => catalog.exercises.map((e) => e.id);
  const status = fc.constantFrom<ItemStatus>('todo', 'done', 'skipped', 'too_hard');
  const planArb = fc.record({
    offset: fc.integer({ min: 1, max: 60 }),
    exerciseId: fc.constantFrom(...exerciseIds()),
    status,
    rating: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
    mode: fc.constantFrom('normal', 'minimal', 'recovery' as const),
    programDay: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
  });
  return fc
    .record({
      level: fc.constantFrom('beginner', 'intermediate', 'advanced' as const),
      dailyMinutes: fc.constantFrom(5, 15, 30, 45, null),
      persona: fc.constantFrom(
        'entrepreneur',
        'employee',
        'career_changer',
        'financial_beginner' as const,
      ),
      programId: fc.constantFrom('PR1', 'PR2', 'PR3', 'PR4', null),
      programDay: fc.integer({ min: 1, max: 32 }),
      priorityDomains: fc.uniqueArray(fc.constantFrom(...DOMAINS), { maxLength: 3 }),
      blockers: fc.uniqueArray(
        fc.constantFrom(
          'procrastination',
          'fear',
          'finances',
          'confidence',
          'organisation',
          'motivation' as const,
        ),
        { maxLength: 3 },
      ),
      onboardedAgo: fc.integer({ min: 0, max: 90 }),
      language: fc.constantFrom('fr', 'en' as const),
      checkins: fc.array(
        fc.record({
          offset: fc.integer({ min: 1, max: 7 }),
          energy: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
          mood: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
          minutesTomorrow: fc.option(fc.constantFrom(5, 15, 30), { nil: null }),
        }),
        { maxLength: 7 },
      ),
      plans: fc.array(planArb, { maxLength: 40 }),
      extraDone: fc.subarray(exerciseIds(), { maxLength: 80 }),
      extraRated1: fc.subarray(exerciseIds(), { maxLength: 40 }),
      habitDays: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { maxLength: 7 }),
    })
    .map((r) => {
      // One plan per date
      const byDate = new Map<string, PastPlan>();
      for (const p of r.plans) {
        const date = addDays(TODAY, -p.offset);
        byDate.set(date, {
          date,
          mode: p.mode,
          programDay: p.programDay,
          items: [
            {
              exerciseId: p.exerciseId,
              status: p.status,
              rating: p.status === 'done' ? p.rating : null,
            },
          ],
        });
      }
      const plans = [...byDate.values()];
      const checkinsByDate = new Map(
        r.checkins.map((c) => [
          addDays(TODAY, -c.offset),
          {
            date: addDays(TODAY, -c.offset),
            energy: c.energy,
            mood: c.mood,
            minutesTomorrow: c.minutesTomorrow,
          },
        ]),
      );
      return {
        today: TODAY,
        language: r.language,
        profile: {
          level: r.level,
          dailyMinutes: r.dailyMinutes,
          persona: r.persona,
          programId: r.programId,
          programDay: r.programDay,
          priorityDomains: r.priorityDomains,
          blockers: r.blockers,
          onboardedOn: addDays(TODAY, -r.onboardedAgo),
        },
        checkins: [...checkinsByDate.values()],
        plans,
        exerciseHistory: historyFrom(plans, r.extraDone, r.extraRated1),
        habitLogDates: r.habitDays.map((d) => addDays(TODAY, -d)),
        ownedHabitTemplateIds: [],
        goal: null,
        catalog,
      } satisfies EngineInput;
    });
}

function availableMinutes(input: EngineInput): number {
  const yesterday = input.checkins.find((c) => c.date === addDays(input.today, -1));
  return Math.min(45, yesterday?.minutesTomorrow ?? input.profile.dailyMinutes ?? 15);
}

function checkInvariants(input: EngineInput): void {
  const result = buildPlan(input);
  const byId = new Map(input.catalog.exercises.map((e) => [e.id, e]));
  const history = new Map(input.exerciseHistory.map((h) => [h.exerciseId, h]));
  const exercises = result.items.map((i) => byId.get(i.exerciseId));

  expect(result.items.length).toBeGreaterThanOrEqual(1);
  expect(result.items.length).toBeLessThanOrEqual(2);
  for (const e of exercises) {
    expect(e?.status).toBe('published');
    const rated1 = history.get(e?.id ?? '')?.lastRating1On;
    if (rated1) expect(diffDays(rated1, input.today)).toBeGreaterThanOrEqual(60);
    for (const pre of e?.prerequisiteIds ?? []) expect(history.get(pre)?.lastDoneOn).toBeTruthy();
  }
  const total = exercises.reduce((sum, e) => sum + (e?.durationMin ?? 0), 0);
  expect(total).toBeLessThanOrEqual(availableMinutes(input));
  expect(new Set(result.items.map((i) => i.exerciseId)).size).toBe(result.items.length);
  expect(result.whyToday).not.toMatch(/\{\{/);
}

describe('properties on varied profiles (real catalogue)', () => {
  it('never unpublished, never over the time, never rated 1/5 within 60 days, never a missing prerequisite', () => {
    fc.assert(
      fc.property(inputArbitrary(), (input) => checkInvariants(input)),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('is deterministic and advances the program by at most one day', () => {
    fc.assert(
      fc.property(inputArbitrary(), (input) => {
        const a = buildPlan(input);
        expect(buildPlan(structuredClone(input))).toEqual(a);
        const previous = [...input.plans].sort((x, y) => (x.date < y.date ? 1 : -1))[0];
        const base = previous?.programDay ?? input.profile.programDay;
        expect(a.nextProfileProgramDay - base).toBeGreaterThanOrEqual(0);
        expect(a.nextProfileProgramDay - base).toBeLessThanOrEqual(1);
      }),
      { seed: SEED + 1, numRuns: 200 },
    );
  });

  it('still proposes a valid exercise when the history has exhausted the catalogue', () => {
    fc.assert(
      fc.property(inputArbitrary(), fc.integer({ min: 1, max: 6 }), (input, recentDays) => {
        // Everything done recently and skipped twice, except rated-1 and prerequisite rules still apply
        const exhausted: ExerciseHistory[] = input.catalog.exercises.map((e, i) => ({
          exerciseId: e.id,
          lastDoneOn: addDays(TODAY, -recentDays),
          skips: 2,
          lastRating1On: i % 3 === 0 ? addDays(TODAY, -10) : null,
        }));
        const exhaustedInput: EngineInput = {
          ...input,
          profile: { ...input.profile, programId: null },
          exerciseHistory: exhausted,
        };
        const result = buildPlan(exhaustedInput);
        expect(result.rulesFired.some((r) => r.startsWith('relaxed_'))).toBe(true);
        checkInvariants(exhaustedInput);
      }),
      { seed: SEED + 2, numRuns: 200 },
    );
  });
});
