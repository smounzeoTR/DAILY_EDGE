import { describe, expect, it } from 'vitest';

import {
  durationBucket,
  emptyFilters,
  filterExercises,
  filterPrinciples,
  matchesQuery,
  normalizeSearch,
  type LibraryExercise,
  type LibraryPrinciple,
} from './search';

const exercise = (id: string, patch: Partial<LibraryExercise> = {}): LibraryExercise => ({
  id,
  domain: 'clarity_goals',
  duration_min: 10,
  title_fr: 'Ce que je donne en échange',
  title_en: 'What I give in return',
  instructions_fr: 'Note ce que tu es prêt à donner.',
  instructions_en: 'List what you are willing to give.',
  sourceIds: ['S01'],
  ...patch,
});

const principle = (id: string, patch: Partial<LibraryPrinciple> = {}): LibraryPrinciple => ({
  id,
  domain: 'discipline_habits',
  title_fr: 'La règle des deux minutes',
  title_en: 'The two-minute rule',
  summary_fr: 'Réduire une habitude à deux minutes.',
  summary_en: 'Scale a habit down to two minutes.',
  sourceIds: ['S04'],
  ...patch,
});

describe('search', () => {
  it('ignores accents, case and extra spaces', () => {
    expect(normalizeSearch('  Échange  ÉNERGIE  cœur ')).toBe('echange energie coeur');
    expect(matchesQuery('echange', 'Ce que je donne en échange')).toBe(true);
    expect(matchesQuery('REGLE minutes', 'La règle des deux minutes')).toBe(true);
    expect(matchesQuery('regle heures', 'La règle des deux minutes')).toBe(false);
    expect(matchesQuery('   ', 'anything')).toBe(true);
  });

  it('searches in the current language only', () => {
    const list = [exercise('E1')];
    expect(
      filterExercises(list, { ...emptyFilters, query: 'echange' }, 'fr', new Set()),
    ).toHaveLength(1);
    expect(
      filterExercises(list, { ...emptyFilters, query: 'echange' }, 'en', new Set()),
    ).toHaveLength(0);
    expect(
      filterExercises(list, { ...emptyFilters, query: 'return' }, 'en', new Set()),
    ).toHaveLength(1);
  });
});

describe('filters', () => {
  const list = [
    exercise('E1'),
    exercise('E2', { domain: 'money_wealth', duration_min: 5, sourceIds: ['S02'] }),
    exercise('E3', { duration_min: 30, sourceIds: ['S01', 'S04'] }),
  ];
  const ids = (filters: Partial<typeof emptyFilters>, favorites = new Set<string>()) =>
    filterExercises(list, { ...emptyFilters, ...filters }, 'fr', favorites).map((e) => e.id);

  it('by domain, source and duration', () => {
    expect(ids({ domains: ['money_wealth'] })).toEqual(['E2']);
    expect(ids({ sourceId: 'S04' })).toEqual(['E3']);
    expect(ids({ duration: 'short' })).toEqual(['E2']);
    expect(ids({ duration: 'medium' })).toEqual(['E1']);
    expect(ids({ duration: 'long' })).toEqual(['E3']);
  });

  it('favorites only', () => {
    expect(ids({ favoritesOnly: true }, new Set(['E3']))).toEqual(['E3']);
    expect(ids({ favoritesOnly: true })).toEqual([]);
  });

  it('duration buckets', () => {
    expect([2, 5, 10, 15, 30].map(durationBucket)).toEqual([
      'short',
      'short',
      'medium',
      'medium',
      'long',
    ]);
  });

  it('principles: query, domain, source, favorites', () => {
    const principles = [
      principle('P1'),
      principle('P2', { domain: 'money_wealth', sourceIds: ['S02'] }),
    ];
    const run = (f: Partial<typeof emptyFilters>, fav = new Set<string>()) =>
      filterPrinciples(principles, { ...emptyFilters, ...f }, 'fr', fav).map((p) => p.id);
    expect(run({ query: 'regle' })).toEqual(['P1', 'P2']);
    expect(run({ domains: ['money_wealth'] })).toEqual(['P2']);
    expect(run({ sourceId: 'S04' })).toEqual(['P1']);
    expect(run({ favoritesOnly: true }, new Set(['P2']))).toEqual(['P2']);
  });
});
