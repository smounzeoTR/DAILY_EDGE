// Library search and filters (pure). Search ignores accents and case, in the current language.
import type { Language } from '@/i18n/language';

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Every word of the query must appear in the text
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.join(' '));
  return words.every((w) => haystack.includes(w));
}

export type DurationBucket = 'short' | 'medium' | 'long';

// <= 5 min, 10-15 min, 30 min
export function durationBucket(minutes: number): DurationBucket {
  if (minutes <= 5) return 'short';
  if (minutes <= 15) return 'medium';
  return 'long';
}

export type LibraryFilters = {
  query: string;
  domains: string[];
  sourceId: string | null;
  duration: DurationBucket | null;
  favoritesOnly: boolean;
};

export const emptyFilters: LibraryFilters = {
  query: '',
  domains: [],
  sourceId: null,
  duration: null,
  favoritesOnly: false,
};

type Texts = { title_fr: string; title_en: string };

export type LibraryExercise = Texts & {
  id: string;
  domain: string;
  duration_min: number;
  instructions_fr: string;
  instructions_en: string;
  sourceIds: string[];
};

export type LibraryPrinciple = Texts & {
  id: string;
  domain: string;
  summary_fr: string;
  summary_en: string;
  sourceIds: string[];
};

export function filterExercises<E extends LibraryExercise>(
  exercises: E[],
  filters: LibraryFilters,
  language: Language,
  favorites: ReadonlySet<string>,
): E[] {
  return exercises.filter(
    (e) =>
      (!filters.favoritesOnly || favorites.has(e.id)) &&
      (filters.domains.length === 0 || filters.domains.includes(e.domain)) &&
      (!filters.sourceId || e.sourceIds.includes(filters.sourceId)) &&
      (!filters.duration || durationBucket(e.duration_min) === filters.duration) &&
      matchesQuery(filters.query, e[`title_${language}`], e[`instructions_${language}`]),
  );
}

// Duration does not apply to principles
export function filterPrinciples<P extends LibraryPrinciple>(
  principles: P[],
  filters: LibraryFilters,
  language: Language,
  favorites: ReadonlySet<string>,
): P[] {
  return principles.filter(
    (p) =>
      (!filters.favoritesOnly || favorites.has(p.id)) &&
      (filters.domains.length === 0 || filters.domains.includes(p.domain)) &&
      (!filters.sourceId || p.sourceIds.includes(filters.sourceId)) &&
      matchesQuery(filters.query, p[`title_${language}`], p[`summary_${language}`]),
  );
}
