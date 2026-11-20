import { describe, expect, it } from 'vitest';

import { addDays } from '../../habits/schedule.ts';
import { buildWeeklyReview, mondayOf, type ReviewInput } from '../buildWeeklyReview.ts';

// Week of Monday 2026-11-16 to Sunday 2026-11-22
const MON = '2026-11-16';
const SUN = '2026-11-22';
const d = (offset: number) => addDays(MON, offset);

type Plan = ReviewInput['plans'][number];
const plan = (
  date: string,
  status: string,
  extra: Partial<Plan> & { minutes?: number } = {},
): Plan => ({
  date,
  mode: extra.mode ?? 'normal',
  items: extra.items ?? [{ status, origin: 'engine', durationMin: extra.minutes ?? 10 }],
});

function input(patch: Partial<ReviewInput> = {}): ReviewInput {
  return {
    weekStart: MON,
    consentCheckin: true,
    level: 'beginner',
    dailyMinutes: 15,
    persona: 'entrepreneur',
    plans: [],
    habits: [],
    habitLogs: [],
    checkins: [],
    goal: null,
    templates: [],
    ownedTemplateIds: [],
    ...patch,
  };
}

const habit = (id: string, patch: Partial<ReviewInput['habits'][number]> = {}) => ({
  id,
  templateId: `T${id}`,
  frequency: 'daily' as const,
  startedOn: d(-20),
  simplified: false,
  domain: 'clarity_goals',
  ...patch,
});

describe('summary', () => {
  it('exercises done / planned, habit rates, energy average, best day', () => {
    const review = buildWeeklyReview(
      input({
        plans: [plan(d(0), 'done'), plan(d(1), 'skipped'), plan(d(2), 'done'), plan(d(-1), 'done')],
        habits: [habit('h1')],
        habitLogs: [
          { habitId: 'h1', date: d(2), done: true, minimal: false },
          { habitId: 'h1', date: d(4), done: true, minimal: true },
        ],
        checkins: [
          { date: d(0), energy: 3 },
          { date: d(1), energy: 4 },
          { date: d(2), energy: null },
        ],
      }),
    );
    expect(review.stats).toMatchObject({
      weekStart: MON,
      weekEnd: SUN,
      exercisesDone: 2,
      exercisesPlanned: 3,
      energyAverage: 3.5,
      // d(2): 1 exercise + 1 habit
      bestDay: d(2),
    });
    // Sunday is the current period: counted only once done (6 periods here)
    expect(review.stats.habits).toEqual([{ habitId: 'h1', done: 2, expected: 6, rate: 2 / 6 }]);
  });

  it('no energy average without check-in consent; best day tie -> latest', () => {
    const review = buildWeeklyReview(
      input({
        consentCheckin: false,
        checkins: [{ date: d(0), energy: 4 }],
        plans: [plan(d(0), 'done'), plan(d(3), 'done')],
      }),
    );
    expect(review.stats.energyAverage).toBeNull();
    expect(review.stats.bestDay).toBe(d(3));
  });
});

describe('habit proposals (< 30 % over 14 days)', () => {
  it('simplify first, then replace by a template of the same domain', () => {
    const logs = [{ habitId: 'h1', date: d(3), done: true, minimal: false }];
    expect(buildWeeklyReview(input({ habits: [habit('h1')], habitLogs: logs })).proposals).toEqual([
      { type: 'habit_simplify', priority: 1, params: { user_habit_id: 'h1' } },
    ]);
    const replaced = buildWeeklyReview(
      input({
        habits: [habit('h1', { simplified: true })],
        habitLogs: logs,
        templates: [
          { id: 'H09', domain: 'money_wealth', personas: [] },
          { id: 'H07', domain: 'clarity_goals', personas: ['employee'] },
          { id: 'H05', domain: 'clarity_goals', personas: [] },
          { id: 'H02', domain: 'clarity_goals', personas: [] },
        ],
        ownedTemplateIds: ['Th1', 'H02'],
      }),
    );
    expect(replaced.proposals).toEqual([
      { type: 'habit_replace', priority: 1, params: { user_habit_id: 'h1', template_id: 'H05' } },
    ]);
  });

  it('no proposal at 30 % or more, or with fewer than 2 expected periods', () => {
    const logs = [d(0), d(2), d(4), d(6), d(-2)].map((date) => ({
      habitId: 'h1',
      date,
      done: true,
      minimal: false,
    }));
    expect(buildWeeklyReview(input({ habits: [habit('h1')], habitLogs: logs })).proposals).toEqual(
      [],
    );
    // Weekly habit started last week: 1 elapsed period only
    expect(
      buildWeeklyReview(input({ habits: [habit('w', { frequency: 'weekly', startedOn: d(1) })] }))
        .proposals,
    ).toEqual([]);
  });

  it('occasional habits never get a proposal', () => {
    expect(
      buildWeeklyReview(input({ habits: [habit('o', { frequency: 'occasional' })] })).proposals,
    ).toEqual([]);
  });
});

describe('goal proposals', () => {
  const goal = {
    id: 'g1',
    targetValue: 10,
    currentValue: 1,
    currentValueUpdatedOn: d(5),
    createdOn: d(-24),
    deadline: d(36),
  };

  it('behind by more than 20 %: new deadline from the real pace', () => {
    // 30 of 60 days elapsed: 5 expected, 1 done (pace 1 / 29 days) -> 9 remaining -> 261 days
    const proposals = buildWeeklyReview(input({ goal })).proposals;
    expect(proposals).toEqual([
      {
        type: 'goal_deadline',
        priority: 2,
        params: { goal_id: 'g1', deadline: addDays(SUN, 261), previous_deadline: d(36) },
      },
    ]);
  });

  it('on track: no proposal', () => {
    expect(buildWeeklyReview(input({ goal: { ...goal, currentValue: 5 } })).proposals).toEqual([]);
  });

  it('missing or stale value (> 14 days): ask to update the progress instead', () => {
    const update = [{ type: 'update_goal_progress', priority: 2, params: { goal_id: 'g1' } }];
    expect(buildWeeklyReview(input({ goal: { ...goal, currentValue: null } })).proposals).toEqual(
      update,
    );
    expect(
      buildWeeklyReview(input({ goal: { ...goal, currentValueUpdatedOn: addDays(SUN, -15) } }))
        .proposals,
    ).toEqual(update);
    expect(
      buildWeeklyReview(input({ goal: { ...goal, currentValueUpdatedOn: addDays(SUN, -14) } }))
        .proposals[0]?.type,
    ).toBe('goal_deadline');
  });

  it('zero pace, no target or past deadline: nothing', () => {
    expect(buildWeeklyReview(input({ goal: { ...goal, currentValue: 0 } })).proposals).toEqual([]);
    expect(buildWeeklyReview(input({ goal: { ...goal, targetValue: null } })).proposals).toEqual(
      [],
    );
    expect(buildWeeklyReview(input({ goal: { ...goal, deadline: d(3) } })).proposals).toEqual([]);
  });
});

describe('level up (2 weeks above 85 %)', () => {
  const weeks = (doneDaysThisWeek: number) => [
    ...[-7, -6, -5, -4, -3, -2, -1].map((o) => plan(d(o), 'done')),
    ...[0, 1, 2, 3, 4, 5, 6].map((o, i) => plan(d(o), i < doneDaysThisWeek ? 'done' : 'skipped')),
  ];

  it('both weeks above 85 % -> next level', () => {
    expect(
      buildWeeklyReview(input({ plans: weeks(7), dailyMinutes: 15 })).proposals,
    ).toContainEqual({
      type: 'level_up',
      priority: 3,
      params: { from: 'beginner', to: 'intermediate' },
    });
  });

  it('6 of 7 days this week is 85.7 % (> 85 %): still proposed; 5 of 7 is not', () => {
    expect(buildWeeklyReview(input({ plans: weeks(6) })).proposals.map((p) => p.type)).toContain(
      'level_up',
    );
    expect(
      buildWeeklyReview(input({ plans: weeks(5) })).proposals.map((p) => p.type),
    ).not.toContain('level_up');
  });

  it('never above advanced', () => {
    expect(
      buildWeeklyReview(input({ plans: weeks(7), level: 'advanced' })).proposals.map((p) => p.type),
    ).not.toContain('level_up');
  });
});

describe('daily time (normal days only)', () => {
  it('real time well below the declared time -> lower bucket', () => {
    const plans = [0, 1, 2].map((o) => plan(d(o), 'done', { minutes: 10 }));
    expect(buildWeeklyReview(input({ plans, dailyMinutes: 30 })).proposals).toEqual([
      {
        type: 'daily_minutes',
        priority: 4,
        params: { minutes: 15, previous_minutes: 30, average: 10 },
      },
    ]);
  });

  it('real time well above -> higher bucket', () => {
    const plans = [0, 1, 2].map((o) => plan(d(o), 'done', { minutes: 30 }));
    expect(buildWeeklyReview(input({ plans, dailyMinutes: 15 })).proposals[0]).toMatchObject({
      type: 'daily_minutes',
      params: { minutes: 30 },
    });
  });

  it('short versions (minimal, recovery) never push the time down', () => {
    const plans = [
      plan(d(0), 'done', { minutes: 2, mode: 'minimal' }),
      plan(d(1), 'done', { minutes: 5, mode: 'recovery' }),
      plan(d(2), 'done', { minutes: 2, mode: 'minimal' }),
      plan(d(3), 'done', { minutes: 25 }),
      plan(d(4), 'done', { minutes: 30 }),
    ];
    expect(buildWeeklyReview(input({ plans, dailyMinutes: 30 })).proposals).toEqual([]);
  });

  it('needs at least 3 normal days with an exercise done', () => {
    const plans = [0, 1].map((o) => plan(d(o), 'done', { minutes: 5 }));
    expect(buildWeeklyReview(input({ plans, dailyMinutes: 30 })).proposals).toEqual([]);
  });
});

describe('ordering and limit', () => {
  it('priority order and at most 3 proposals', () => {
    const logs: ReviewInput['habitLogs'] = [];
    const review = buildWeeklyReview(
      input({
        habits: [habit('h1'), habit('h2')],
        habitLogs: logs,
        goal: {
          id: 'g',
          targetValue: 10,
          currentValue: null,
          currentValueUpdatedOn: null,
          createdOn: d(-20),
          deadline: d(40),
        },
        plans: [0, 1, 2].map((o) => plan(d(o), 'done', { minutes: 5 })),
        dailyMinutes: 30,
      }),
    );
    expect(review.proposals.map((p) => p.type)).toEqual([
      'habit_simplify',
      'habit_simplify',
      'update_goal_progress',
    ]);
  });

  it('mondayOf', () => {
    expect(mondayOf('2026-11-22')).toBe(MON);
    expect(mondayOf('2026-11-16')).toBe(MON);
    expect(mondayOf('2026-11-19')).toBe(MON);
  });
});
