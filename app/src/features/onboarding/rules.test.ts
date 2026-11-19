import { describe, expect, it } from 'vitest';

import { makeDraft, parseDraft } from './draftSchema';
import {
  assignPersona,
  buildCompleteOnboardingArgs,
  canContinue,
  effectiveProgram,
  habitCandidates,
  isFutureDate,
  localDateString,
  parseTargetValue,
  selectProgram,
  skipAnswer,
  toggleHabit,
  toggleLimited,
} from './rules';
import { emptyAnswers, type Answers, type HabitTemplateRow, type ProgramRow } from './types';

const programs: ProgramRow[] = [
  { id: 'PR1', persona: 'entrepreneur' },
  { id: 'PR2', persona: 'employee' },
  { id: 'PR3', persona: 'career_changer' },
  { id: 'PR4', persona: 'financial_beginner' },
];

const answers = (patch: Partial<Answers> = {}): Answers => ({ ...emptyAnswers, ...patch });

describe('assignPersona (cahier des charges § 2)', () => {
  it('money as first priority domain -> financial beginner, whatever the situation', () => {
    expect(
      assignPersona({
        priorityDomains: ['money_wealth', 'business_career'],
        situation: 'employee',
      }),
    ).toBe('financial_beginner');
  });

  it('money as second domain does not count', () => {
    expect(
      assignPersona({
        priorityDomains: ['business_career', 'money_wealth'],
        situation: 'employee',
      }),
    ).toBe('employee');
  });

  it.each([
    ['entrepreneur', 'entrepreneur'],
    ['freelancer', 'entrepreneur'],
    ['employee', 'employee'],
    ['student', 'career_changer'],
    ['in_transition', 'career_changer'],
  ] as const)('situation %s -> %s', (situation, persona) => {
    expect(assignPersona({ priorityDomains: [], situation })).toBe(persona);
  });

  it('skipped situation -> entrepreneur (PR1)', () => {
    expect(assignPersona({ priorityDomains: [], situation: null })).toBe('entrepreneur');
  });
});

describe('program selection', () => {
  it('picks the published program of the persona', () => {
    expect(selectProgram('career_changer', programs)?.id).toBe('PR3');
    expect(
      selectProgram('employee', [{ id: 'PRX', persona: 'employee', status: 'retired' }]),
    ).toBeNull();
  });

  it('uses the override from "Changer de programme"', () => {
    expect(effectiveProgram(answers({ situation: 'employee' }), programs)?.id).toBe('PR2');
    expect(
      effectiveProgram(answers({ situation: 'employee', programOverride: 'PR4' }), programs)?.id,
    ).toBe('PR4');
    expect(effectiveProgram(answers({ programOverride: 'PR9' }), programs)?.id).toBe('PR1');
  });
});

describe('habitCandidates', () => {
  const t = (
    id: string,
    domain: HabitTemplateRow['domain'],
    personas: HabitTemplateRow['personas'] = [],
  ) => ({ id, domain, personas }) satisfies HabitTemplateRow;

  it('keeps "Tous" and persona templates, priority domains first in priority order', () => {
    const list = habitCandidates(
      [
        t('H01', 'clarity_goals'),
        t('H02', 'money_wealth', ['financial_beginner']),
        t('H03', 'energy_health'),
        t('H04', 'business_career', ['entrepreneur']),
        t('H05', 'business_career'),
      ],
      'entrepreneur',
      ['business_career', 'energy_health'],
    );
    expect(list.map((h) => h.id)).toEqual(['H04', 'H05', 'H03', 'H01']);
  });

  it('caps the list at 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => t(`H${i}`, 'clarity_goals'));
    expect(habitCandidates(many, 'employee', [])).toHaveLength(12);
  });
});

describe('selection helpers', () => {
  it('toggleHabit allows 3 habits at most', () => {
    let habits = toggleHabit([], 'H01');
    habits = toggleHabit(habits, 'H02');
    habits = toggleHabit(habits, 'H03');
    expect(toggleHabit(habits, 'H04').map((h) => h.templateId)).toEqual(['H01', 'H02', 'H03']);
    expect(toggleHabit(habits, 'H02').map((h) => h.templateId)).toEqual(['H01', 'H03']);
  });

  it('toggleLimited respects the max', () => {
    expect(toggleLimited(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
    expect(toggleLimited(['a', 'b'], 'a', 3)).toEqual(['b']);
  });
});

describe('dates and values', () => {
  it('formats local dates and compares to today', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isFutureDate('2026-11-22', '2026-11-21')).toBe(true);
    expect(isFutureDate('2026-11-21', '2026-11-21')).toBe(false);
    expect(isFutureDate('2026-11-20', '2026-11-21')).toBe(false);
    expect(isFutureDate('soon', '2026-11-21')).toBe(false);
  });

  it('parses target values', () => {
    expect(parseTargetValue('')).toBeNull();
    expect(parseTargetValue('1 500,5')).toBe(1500.5);
    expect(parseTargetValue('abc')).toBe('invalid');
  });
});

describe('canContinue', () => {
  const today = '2026-11-21';

  it('requires a goal title (Q1)', () => {
    expect(canContinue('goalTitle', answers({ goalTitle: '  ' }), today)).toBe(false);
    expect(canContinue('goalTitle', answers({ goalTitle: 'Signer 5 clients' }), today)).toBe(true);
  });

  it('requires a future deadline when one is set (Q3)', () => {
    expect(canContinue('goalDeadline', answers({ goalDeadline: null }), today)).toBe(true);
    expect(canContinue('goalDeadline', answers({ goalDeadline: '2026-11-21' }), today)).toBe(false);
    expect(canContinue('goalDeadline', answers({ goalDeadline: '2027-03-01' }), today)).toBe(true);
  });

  it('rejects a non numeric target value (Q2)', () => {
    expect(canContinue('goalMeasure', answers({ goalTargetValue: 'cinq' }), today)).toBe(false);
  });

  it('requires exactly 3 habits', () => {
    const two = [
      { templateId: 'H01', cue: null },
      { templateId: 'H02', cue: null },
    ];
    expect(canContinue('habits', answers({ habits: two }), today)).toBe(false);
    expect(
      canContinue('habits', answers({ habits: [...two, { templateId: 'H03', cue: null }] }), today),
    ).toBe(true);
  });

  it('skip clears the answer', () => {
    expect(skipAnswer('situation', answers({ situation: 'student' })).situation).toBeNull();
  });
});

describe('buildCompleteOnboardingArgs', () => {
  it('sends only changed cues and applies defaults', () => {
    const args = buildCompleteOnboardingArgs(
      answers({
        goalTitle: '  Signer 5 clients ',
        goalTargetValue: '5',
        habits: [
          { templateId: 'H01', cue: 'Après mon café' },
          { templateId: 'H02', cue: 'Default H02' },
          { templateId: 'H03', cue: null },
        ],
      }),
      'PR1',
      { H01: 'Default H01', H02: 'Default H02', H03: 'Default H03' },
      { locale: 'fr', timezone: 'Europe/Paris' },
    );
    expect(args.p_goal_title).toBe('Signer 5 clients');
    expect(args.p_goal_target_value).toBe(5);
    expect(args.p_daily_minutes).toBe(15);
    expect(args.p_habits).toEqual([
      { template_id: 'H01', cue: 'Après mon café' },
      { template_id: 'H02' },
      { template_id: 'H03' },
    ]);
    expect(args.p_situation).toBeUndefined();
    expect(args.p_locale).toBe('fr');
  });
});

describe('draft', () => {
  it('round-trips and rejects other versions', () => {
    const draft = makeDraft(4, answers({ goalTitle: 'X' }));
    expect(parseDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(parseDraft({ ...draft, version: 99 })).toBeNull();
    expect(parseDraft('nope')).toBeNull();
  });

  it('clamps the step and fills missing fields', () => {
    const parsed = parseDraft({ version: 1, stepIndex: 99, answers: { goalTitle: 'X' } });
    expect(parsed?.stepIndex).toBe(14);
    expect(parsed?.answers.notifyMorning).toBe('07:30');
  });
});
