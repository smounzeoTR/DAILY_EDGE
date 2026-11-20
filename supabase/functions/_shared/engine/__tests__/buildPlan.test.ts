import { describe, expect, it } from 'vitest';

import { buildPlan } from '../buildPlan.ts';
import type { EngineInput } from '../types.ts';
import {
  checkin,
  day,
  exercise,
  history,
  makeInput,
  plan,
  smallCatalog,
  TODAY,
} from './fixtures.ts';

const ids = (input: EngineInput) => buildPlan(input).items.map((i) => i.exerciseId);

describe('day 1 and defaults', () => {
  it('first day: normal mode, main exercise, step principle, introduced habit', () => {
    const result = buildPlan(makeInput());
    expect(result).toMatchObject({
      date: TODAY,
      mode: 'normal',
      programDay: 1,
      nextProfileProgramDay: 1,
      principleId: 'P001',
      items: [{ exerciseId: 'E01', position: 1 }],
      introducedHabitId: 'H01',
      whyKey: 'program_week',
    });
    expect(result.rulesFired).toEqual(
      expect.arrayContaining(['no_checkin_defaults', 'program_step', 'habit_introduced']),
    );
    expect(result.whyToday).toBe('Semaine 1 de ton programme : clarifier l’objectif.');
  });

  it('without check-in: daily_minutes and energy 3 are used', () => {
    // 5 minutes from the profile -> minimal
    expect(buildPlan(makeInput({ profile: { dailyMinutes: 5 } as never })).mode).toBe('minimal');
    // Energy 3 does not trigger minimal
    expect(buildPlan(makeInput()).rulesFired).not.toContain('minimal_low_energy');
  });

  it('does not propose a habit the user already has', () => {
    const result = buildPlan(makeInput({ ownedHabitTemplateIds: ['H01'] }));
    expect(result.introducedHabitId).toBeNull();
    expect(result.rulesFired).not.toContain('habit_introduced');
  });

  it('is deterministic', () => {
    const input = makeInput({ checkins: [checkin(day(-1), { energy: 4 })] });
    expect(buildPlan(input)).toEqual(buildPlan(structuredClone(input)));
  });
});

describe('recovery (no activity on J-1, J-2 and J-3)', () => {
  const old = { onboardedOn: day(-30) } as EngineInput['profile'];

  it('triggers after 3 full inactive days', () => {
    const result = buildPlan(
      makeInput({ profile: old, plans: [plan(day(-4), 'E01', 'done', { programDay: 1 })] }),
    );
    expect(result.mode).toBe('recovery');
    expect(result.rulesFired).toContain('recovery_inactive_3d');
    expect(result.items[0]?.exerciseId).toBe('M02');
    expect(result.whyKey).toBe('recovery');
  });

  it.each([
    ['an exercise done on J-3', { plans: [plan(day(-3), 'E01', 'done', { programDay: 1 })] }],
    ['a habit checked on J-2', { habitLogDates: [day(-2)] }],
    ['a check-in on J-1', { checkins: [checkin(day(-1))] }],
  ])('no recovery with %s', (_label, patch) => {
    expect(buildPlan(makeInput({ profile: old, ...patch })).mode).not.toBe('recovery');
  });

  it('activity on J-4 only is not enough; a skipped exercise is not an activity', () => {
    const input = makeInput({
      profile: old,
      habitLogDates: [day(-4)],
      plans: [plan(day(-2), 'E01', 'skipped', { programDay: 1 })],
    });
    expect(buildPlan(input).mode).toBe('recovery');
  });

  it('no recovery while the account is younger than the window (onboarded on J-3)', () => {
    expect(buildPlan(makeInput({ profile: { onboardedOn: day(-3) } as never })).mode).toBe(
      'normal',
    );
    expect(buildPlan(makeInput({ profile: { onboardedOn: day(-4) } as never })).mode).toBe(
      'recovery',
    );
  });

  it('the program does not advance after a recovery plan, even if done', () => {
    const result = buildPlan(
      makeInput({
        profile: { programDay: 2 } as never,
        plans: [plan(day(-1), 'M02', 'done', { mode: 'recovery', programDay: 2 })],
      }),
    );
    expect(result.programDay).toBe(2);
    expect(result.rulesFired).not.toContain('program_advanced');
  });
});

describe('minimal mode', () => {
  it('energy <= 2 yesterday', () => {
    const result = buildPlan(makeInput({ checkins: [checkin(day(-1), { energy: 2 })] }));
    expect(result.mode).toBe('minimal');
    expect(result.items[0]?.exerciseId).toBe('M01');
    expect(result.whyKey).toBe('low_energy');
    expect(result.whyToday).toContain('énergie était basse');
  });

  it('5 minutes available tomorrow', () => {
    const result = buildPlan(makeInput({ checkins: [checkin(day(-1), { minutesTomorrow: 5 })] }));
    expect(result.mode).toBe('minimal');
    expect(result.rulesFired).toContain('minimal_low_time');
  });

  it('completion < 50 % over the days with a plan among the last 3', () => {
    const plans = [
      plan(day(-1), 'E01', 'skipped', { programDay: 1 }),
      plan(day(-2), 'E01', 'skipped', { programDay: 1 }),
      plan(day(-3), 'E01', 'done', { programDay: 1 }),
    ];
    const input = makeInput({ profile: { onboardedOn: day(-10) } as never, plans });
    const result = buildPlan(input);
    expect(result.rulesFired).toContain('minimal_low_completion');
    expect(result.mode).toBe('minimal');
  });

  it('completion rule ignored with fewer than 2 days with a plan', () => {
    const input = makeInput({
      profile: { onboardedOn: day(-10) } as never,
      plans: [plan(day(-1), 'E01', 'skipped', { programDay: 1 })],
      checkins: [checkin(day(-1))],
    });
    expect(buildPlan(input).rulesFired).not.toContain('minimal_low_completion');
  });

  it('mood <= 2 for 5 days', () => {
    const checkins = [1, 2, 3, 4, 5].map((d) => checkin(day(-d), { mood: 2 }));
    const result = buildPlan(makeInput({ checkins }));
    expect(result.mode).toBe('minimal');
    expect(result.rulesFired).toContain('minimal_low_mood_5d');
    // 4 days only: no rule
    expect(buildPlan(makeInput({ checkins: checkins.slice(0, 4) })).rulesFired).not.toContain(
      'minimal_low_mood_5d',
    );
  });

  it('energy <= 2 two days in a row is logged', () => {
    const checkins = [checkin(day(-1), { energy: 1 }), checkin(day(-2), { energy: 2 })];
    expect(buildPlan(makeInput({ checkins })).rulesFired).toContain('low_energy_2d');
  });
});

describe('program advancement', () => {
  const onboarded = { onboardedOn: day(-5) } as EngineInput['profile'];

  it('previous exercise done -> next day', () => {
    const result = buildPlan(
      makeInput({ profile: onboarded, plans: [plan(day(-1), 'E01', 'done', { programDay: 1 })] }),
    );
    expect(result.programDay).toBe(2);
    expect(result.nextProfileProgramDay).toBe(2);
    expect(result.rulesFired).toContain('program_advanced');
  });

  it('previous minimal done -> next day as well', () => {
    const result = buildPlan(
      makeInput({
        profile: onboarded,
        plans: [plan(day(-1), 'M01', 'done', { mode: 'minimal', programDay: 1 })],
      }),
    );
    expect(result.programDay).toBe(2);
  });

  it('previous exercise skipped -> same day', () => {
    const result = buildPlan(
      makeInput({
        profile: onboarded,
        plans: [plan(day(-1), 'E01', 'skipped', { programDay: 1 })],
      }),
    );
    expect(result.programDay).toBe(1);
  });

  it('recomputing does not advance twice (derived from the previous plan)', () => {
    const input = makeInput({
      profile: { ...onboarded, programDay: 2 },
      plans: [plan(day(-1), 'E01', 'done', { programDay: 1 })],
    });
    expect(buildPlan(input).programDay).toBe(2);
    expect(buildPlan(buildInputAfter(input)).programDay).toBe(2);
  });

  it('J+1 recomputed after the J exercise is done advances the program', () => {
    // Plan of J exists (todo) when tomorrow is generated after the check-in
    const before = makeInput({
      today: day(1),
      profile: onboarded,
      plans: [plan(TODAY, 'E01', 'todo', { programDay: 1 })],
      checkins: [checkin(TODAY)],
    });
    expect(buildPlan(before).programDay).toBe(1);
    // Exercise of J marked done afterwards, J+1 recomputed
    const after = {
      ...before,
      plans: [plan(TODAY, 'E01', 'done', { programDay: 1 })],
      exerciseHistory: [history('E01', { lastDoneOn: TODAY })],
    };
    const result = buildPlan(after);
    expect(result.programDay).toBe(2);
    expect(result.items[0]?.exerciseId).toBe('E02');
  });

  it('after the last day -> catalogue mode', () => {
    const result = buildPlan(
      makeInput({
        profile: { ...onboarded, programDay: 3 },
        plans: [plan(day(-1), 'E03', 'done', { programDay: 3 })],
        exerciseHistory: [history('E03', { lastDoneOn: day(-1) })],
      }),
    );
    expect(result.programDay).toBeNull();
    expect(result.nextProfileProgramDay).toBe(4);
    expect(result.rulesFired).toEqual(
      expect.arrayContaining(['program_completed', 'catalog_mode']),
    );
    expect(result.whyKey).toBe('program_completed');
  });
});

// Same input with the profile updated as the server would after the first computation
function buildInputAfter(input: EngineInput): EngineInput {
  return {
    ...input,
    profile: { ...input.profile, programDay: buildPlan(input).nextProfileProgramDay },
  };
}

describe('program exercise replacement', () => {
  // Check-in yesterday: active user, not in recovery
  const base = {
    profile: { onboardedOn: day(-30), programDay: 2 } as EngineInput['profile'],
    checkins: [checkin(day(-1), { energy: 4 })],
  };
  const done = (id: string) => history(id, { lastDoneOn: day(-5) });

  it('main longer than the time available -> minimal of the step', () => {
    const result = buildPlan(
      makeInput({
        profile: { ...base.profile, programDay: 3 },
        checkins: [checkin(day(-1), { minutesTomorrow: 15 })],
      }),
    );
    expect(result.items[0]?.exerciseId).toBe('M03');
    expect(result.mode).toBe('minimal');
    expect(result.rulesFired).toContain('program_main_too_long');
  });

  it('skipped twice (too hard counts as a skip) -> shorter exercise of the same principle', () => {
    const result = buildPlan(
      makeInput({
        ...base,
        exerciseHistory: [done('E01'), history('E02', { skips: 2 })],
      }),
    );
    expect(result.rulesFired).toContain('replaced_skipped_twice');
    // C04 shares P002 and is shorter than E02 (scored above M02)
    expect(['C04', 'M02']).toContain(result.items[0]?.exerciseId);
    expect(result.principleId).toBe('P002');
    expect(result.whyKey).toBe('replaced');
  });

  it('rated 1/5 less than 60 days ago is replaced, not after 60 days', () => {
    const recent = buildPlan(
      makeInput({
        ...base,
        exerciseHistory: [done('E01'), history('E02', { lastRating1On: day(-59) })],
      }),
    );
    expect(recent.rulesFired).toContain('replaced_rated_low');
    expect(recent.items[0]?.exerciseId).not.toBe('E02');
    const old = buildPlan(
      makeInput({
        ...base,
        exerciseHistory: [done('E01'), history('E02', { lastRating1On: day(-60) })],
      }),
    );
    expect(old.items[0]?.exerciseId).toBe('E02');
  });

  it('missing prerequisite (only the minimal was done) -> replaced', () => {
    const result = buildPlan(makeInput({ ...base, exerciseHistory: [done('M01')] }));
    expect(result.rulesFired).toContain('replaced_missing_prerequisite');
    expect(result.items[0]?.exerciseId).not.toBe('E02');
  });

  it('unpublished main -> replaced', () => {
    const catalog = smallCatalog();
    catalog.exercises = catalog.exercises.map((e) =>
      e.id === 'E02' ? { ...e, status: 'retired' as const } : e,
    );
    const result = buildPlan(makeInput({ ...base, catalog, exerciseHistory: [done('E01')] }));
    expect(result.rulesFired).toContain('replaced_unpublished');
  });
});

describe('catalogue mode', () => {
  const noProgram = { programId: null, onboardedOn: day(-30) } as unknown as EngineInput['profile'];
  const withEnergy = (energy: number, minutes = 15) => [
    checkin(day(-1), { energy, minutesTomorrow: minutes }),
  ];

  it('scores priority domain and blocker first, principle = first principle of the main exercise', () => {
    const result = buildPlan(makeInput({ profile: noProgram, checkins: withEnergy(4) }));
    expect(result.items[0]?.exerciseId).toBe('C01');
    expect(result.principleId).toBe('P010');
    expect(result.whyKey).toBe('catalog_domain');
    expect(result.whyToday).toBe('Choisi pour ta priorité : entreprise & carrière.');
    expect(result.candidates[0]).toMatchObject({
      exerciseId: 'C01',
      parts: { domain: 1, blocker: 1, affinity: 0.5 },
    });
  });

  it('two exercises when normal with >= 30 minutes, within the time available', () => {
    const catalog = smallCatalog();
    const result = buildPlan(
      makeInput({ profile: noProgram, catalog, checkins: withEnergy(4, 30) }),
    );
    expect(result.items).toHaveLength(2);
    const total = result.items.reduce(
      (sum, i) => sum + (catalog.exercises.find((e) => e.id === i.exerciseId)?.durationMin ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(30);
    expect(result.rulesFired).toContain('catalog_two_exercises');
  });

  it('one exercise of <= 5 minutes in minimal mode', () => {
    const result = buildPlan(makeInput({ profile: noProgram, checkins: withEnergy(2, 30) }));
    expect(result.mode).toBe('minimal');
    expect(result.items).toHaveLength(1);
    expect(['M01', 'M02', 'M03', 'C03', 'C04']).toContain(result.items[0]?.exerciseId);
  });

  it('energy 3 excludes "high" exercises; energy 2 keeps only "low"', () => {
    const only = (energy: 'high' | 'medium') => {
      const catalog = smallCatalog();
      catalog.exercises = [
        exercise('X01', { energy }),
        exercise('X02', { energy: 'low', domain: 'mindset_beliefs' }),
      ];
      return catalog;
    };
    expect(
      ids(makeInput({ profile: noProgram, catalog: only('high'), checkins: withEnergy(3) })),
    ).toEqual(['X02']);
    expect(
      ids(makeInput({ profile: noProgram, catalog: only('high'), checkins: withEnergy(4) })),
    ).toEqual(['X01']);
  });

  it('max difficulty by level (beginner 2, intermediate 3, advanced 4)', () => {
    const catalog = smallCatalog();
    catalog.exercises = [
      exercise('X03', { difficulty: 3, domain: 'business_career' }),
      exercise('X01', { difficulty: 1, domain: 'mindset_beliefs' }),
    ];
    const run = (level: EngineInput['profile']['level']) =>
      ids(makeInput({ profile: { ...noProgram, level }, catalog, checkins: withEnergy(4) }));
    expect(run('beginner')).toEqual(['X01']);
    expect(run('intermediate')).toEqual(['X03']);
  });

  it('persona, prerequisites, repeat delay and "never repeated"', () => {
    const catalog = smallCatalog();
    catalog.exercises = [
      exercise('X01', { personas: ['employee'] }),
      exercise('X02', { prerequisiteIds: ['X09'] }),
      exercise('X03', { repeatAfterDays: 7 }),
      exercise('X04', { repeatAfterDays: null }),
      exercise('X05', { domain: 'mindset_beliefs' }),
    ];
    const result = buildPlan(
      makeInput({
        profile: noProgram,
        catalog,
        checkins: withEnergy(4),
        exerciseHistory: [
          history('X03', { lastDoneOn: day(-6) }),
          history('X04', { lastDoneOn: day(-300) }),
        ],
      }),
    );
    expect(result.items.map((i) => i.exerciseId)).toEqual(['X05']);
  });

  it('level up after > 85 % over 7 days with a plan', () => {
    const catalog = smallCatalog();
    catalog.exercises = [
      exercise('X03', { difficulty: 3, domain: 'business_career' }),
      exercise('X01', { difficulty: 1, domain: 'mindset_beliefs' }),
    ];
    const plans = [1, 2, 3, 4, 5, 6, 7].map((d) => plan(day(-d), 'Z99', 'done'));
    const result = buildPlan(
      makeInput({ profile: noProgram, catalog, plans, checkins: withEnergy(4) }),
    );
    expect(result.rulesFired).toContain('level_up_high_completion');
    expect(result.items[0]?.exerciseId).toBe('X03');
  });

  it('affinity counts only after 10 rated exercises', () => {
    const catalog = smallCatalog();
    const rated = (n: number) =>
      Array.from({ length: n }, (_, i) => plan(day(-20 - i), 'C02', 'done', { rating: 5 }));
    const input = (n: number) =>
      makeInput({ profile: noProgram, catalog, plans: rated(n), checkins: withEnergy(4) });
    const affinityOf = (n: number) =>
      buildPlan(input(n)).candidates.find((c) => c.exerciseId === 'C02')?.parts.affinity;
    expect(affinityOf(9)).toBe(0.5);
    expect(affinityOf(10)).toBe(1);
  });

  it('ties are broken by exercise ID', () => {
    const catalog = smallCatalog();
    catalog.exercises = [exercise('X02'), exercise('X01')];
    expect(ids(makeInput({ profile: noProgram, catalog, checkins: withEnergy(4) }))).toEqual([
      'X01',
    ]);
  });
});

describe('relaxation when nothing passes the filters', () => {
  const noProgram = {
    programId: null,
    onboardedOn: day(-30),
    level: 'beginner',
  } as unknown as EngineInput['profile'];
  const run = (exercises: EngineInput['catalog']['exercises'], extra: Partial<EngineInput> = {}) =>
    buildPlan(
      makeInput({
        profile: noProgram,
        catalog: { ...smallCatalog(), exercises },
        checkins: [checkin(day(-1), { energy: 3, minutesTomorrow: 15 })],
        ...extra,
      }),
    );

  it('relaxes the repeat delay first', () => {
    const result = run([exercise('X01', { repeatAfterDays: null })], {
      exerciseHistory: [history('X01', { lastDoneOn: day(-2) })],
    });
    expect(result.items[0]?.exerciseId).toBe('X01');
    expect(result.rulesFired).toEqual(expect.arrayContaining(['relaxed_repeat_delay']));
    expect(result.rulesFired).not.toContain('relaxed_skipped_twice');
  });

  it('then skipped twice, difficulty +1, energy, persona, in that order', () => {
    const result = run(
      [exercise('X01', { personas: ['employee'], energy: 'high', difficulty: 3 })],
      {
        exerciseHistory: [history('X01', { skips: 2, lastDoneOn: day(-1) })],
      },
    );
    const relaxed = result.rulesFired.filter((r) => r.startsWith('relaxed_'));
    expect(relaxed).toEqual([
      'relaxed_repeat_delay',
      'relaxed_skipped_twice',
      'relaxed_difficulty',
      'relaxed_energy',
      'relaxed_persona',
    ]);
    expect(result.items[0]?.exerciseId).toBe('X01');
  });

  it('last resort: any published exercise of <= 5 minutes', () => {
    const result = run([
      exercise('X01', { difficulty: 5 }),
      exercise('X02', { difficulty: 5, durationMin: 5 }),
    ]);
    expect(result.rulesFired).toContain('relaxed_short_fallback');
    expect(result.items[0]?.exerciseId).toBe('X02');
  });

  it('never lifts published, rated 1/5 and prerequisites', () => {
    const result = run(
      [
        exercise('X01', { status: 'review', durationMin: 2 }),
        exercise('X02', { durationMin: 2 }),
        exercise('X03', { durationMin: 2, prerequisiteIds: ['X09'] }),
      ],
      { exerciseHistory: [history('X02', { lastRating1On: day(-10) })] },
    );
    expect(result.items).toEqual([]);
    expect(result.rulesFired).toContain('no_candidate');
  });
});

describe('detected rules', () => {
  it('goal behind schedule by more than 20 %', () => {
    const goal = { targetValue: 100, currentValue: 30, createdOn: day(-50), deadline: day(50) };
    expect(buildPlan(makeInput({ goal })).rulesFired).toContain('goal_behind_schedule');
    expect(buildPlan(makeInput({ goal: { ...goal, currentValue: 45 } })).rulesFired).not.toContain(
      'goal_behind_schedule',
    );
  });
});

describe('why today', () => {
  it('English templates', () => {
    const result = buildPlan(makeInput({ language: 'en' }));
    expect(result.whyToday).toBe('Week 1 of your program: clarify the goal.');
    expect(result.whyParams).toEqual({ week: 1, theme: 'Clarify the goal' });
  });
});

describe('user additions (library)', () => {
  const active = {
    profile: { onboardedOn: day(-30), programDay: 1 } as EngineInput['profile'],
  };

  it('a done addition does not move the program, a done engine item does', () => {
    const withItems = (engineStatus: 'done' | 'skipped') =>
      makeInput({
        ...active,
        plans: [
          {
            date: day(-1),
            mode: 'normal',
            programDay: 1,
            items: [
              { exerciseId: 'E01', status: engineStatus, rating: null, origin: 'engine' },
              { exerciseId: 'C01', status: 'done', rating: null, origin: 'user' },
            ],
          },
        ],
      });
    expect(buildPlan(withItems('skipped')).programDay).toBe(1);
    expect(buildPlan(withItems('done')).programDay).toBe(2);
  });

  it('a done addition counts as activity (no recovery)', () => {
    const input = makeInput({
      ...active,
      plans: [plan(day(-2), 'C01', 'done', { programDay: 1, origin: 'user' })],
    });
    expect(buildPlan(input).mode).not.toBe('recovery');
  });

  it('never proposes an exercise the user already added', () => {
    const noProgram = {
      programId: null,
      onboardedOn: day(-30),
    } as unknown as EngineInput['profile'];
    const checkins = [checkin(day(-1), { energy: 4 })];
    expect(ids(makeInput({ profile: noProgram, checkins }))[0]).toBe('C01');
    const result = buildPlan(
      makeInput({ profile: noProgram, checkins, userAddedExerciseIds: ['C01'] }),
    );
    expect(result.items.map((i) => i.exerciseId)).not.toContain('C01');
    expect(result.items.every((i) => !i.adopted)).toBe(true);
  });

  it('adopts the step exercise when the user already added it', () => {
    const result = buildPlan(makeInput({ userAddedExerciseIds: ['E01', 'C02'] }));
    expect(result.items).toEqual([{ exerciseId: 'E01', position: 1, adopted: true }]);
    expect(result.rulesFired).toContain('adopted_user_item');
    expect(result.principleId).toBe('P001');
  });

  it('adopts the minimal exercise in minimal mode', () => {
    const result = buildPlan(
      makeInput({ checkins: [checkin(day(-1), { energy: 2 })], userAddedExerciseIds: ['M01'] }),
    );
    expect(result.mode).toBe('minimal');
    expect(result.items).toEqual([{ exerciseId: 'M01', position: 1, adopted: true }]);
  });

  it('an adopted exercise is not replaced (the user chose it)', () => {
    const result = buildPlan(
      makeInput({
        profile: { onboardedOn: day(-30), programDay: 2 } as EngineInput['profile'],
        checkins: [checkin(day(-1), { energy: 4 })],
        // E02 needs E01, never done: normally replaced
        userAddedExerciseIds: ['E02'],
      }),
    );
    expect(result.items).toEqual([{ exerciseId: 'E02', position: 1, adopted: true }]);
    expect(result.rulesFired).not.toContain('replaced_missing_prerequisite');
  });
});
