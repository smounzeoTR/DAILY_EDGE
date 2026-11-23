// Questions of the web diagnostic (site § 7). Values come from the shared module of the Edge
// Functions, so that the site, diagnostic-submit and the app onboarding use the same ones.
import {
  AUTHORS,
  CHRONOTYPES,
  DIAGNOSTIC_BLOCKERS,
  DIAGNOSTIC_MINUTES,
  DOMAINS,
  SITUATIONS,
  type Author,
  type Chronotype,
  type DiagnosticBlocker,
  type Domain,
  type Situation,
} from '../../../supabase/functions/_shared/diagnostic/values.ts';

export interface ChoiceQuestion {
  key: 'domain' | 'situation' | 'blocker' | 'daily_minutes' | 'chronotype' | 'authors';
  title: string;
  hint?: string;
  multiple?: boolean;
  optional?: boolean;
  options: { value: string; label: string }[];
}

const DOMAIN_LABELS: Record<Domain, string> = {
  clarity_goals: 'Clarté & objectifs',
  discipline_habits: 'Discipline & habitudes',
  money_wealth: 'Argent & patrimoine',
  business_career: 'Entreprise & carrière',
  mindset_beliefs: 'État d’esprit & croyances',
  relationships_network: 'Relations & réseau',
  energy_health: 'Énergie & rythme',
};

const SITUATION_LABELS: Record<Situation, string> = {
  employee: 'Salarié',
  entrepreneur: 'Entrepreneur',
  freelancer: 'Indépendant',
  student: 'Étudiant',
  in_transition: 'En transition',
};

const BLOCKER_LABELS: Record<DiagnosticBlocker, string> = {
  motivation: 'Motivation',
  organisation: 'Organisation',
  constance: 'Constance',
  fear: 'Peur de passer à l’action',
};

const CHRONOTYPE_LABELS: Record<Chronotype, string> = {
  morning: 'Matin',
  midday: 'Midi',
  evening: 'Soir',
};

const AUTHOR_LABELS: Record<Author, string> = {
  hill: 'Napoleon Hill',
  kiyosaki: 'Robert Kiyosaki',
  clear: 'James Clear',
  covey: 'Stephen Covey',
  robbins: 'Tony Robbins',
  carnegie: 'Dale Carnegie',
};

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

export const questions: ChoiceQuestion[] = [
  {
    key: 'domain',
    title: 'Quel est ton objectif principal pour les 3 prochains mois ?',
    options: options(DOMAINS, DOMAIN_LABELS),
  },
  { key: 'situation', title: 'Ta situation', options: options(SITUATIONS, SITUATION_LABELS) },
  {
    key: 'blocker',
    title: 'Qu’est-ce qui te bloque le plus aujourd’hui ?',
    options: options(DIAGNOSTIC_BLOCKERS, BLOCKER_LABELS),
  },
  {
    key: 'daily_minutes',
    title: 'Combien de temps peux-tu y consacrer par jour ?',
    options: DIAGNOSTIC_MINUTES.map((m) => ({ value: String(m), label: `${m} min` })),
  },
  {
    key: 'chronotype',
    title: 'Quel est ton meilleur moment de la journée ?',
    options: options(CHRONOTYPES, CHRONOTYPE_LABELS),
  },
  {
    key: 'authors',
    title: 'Quels auteurs as-tu déjà lus ?',
    hint: 'Plusieurs réponses possibles. Question facultative.',
    multiple: true,
    optional: true,
    options: [...options(AUTHORS, AUTHOR_LABELS), { value: 'none', label: 'Aucun' }],
  },
];

// 6 choice questions + the e-mail
export const QUESTION_COUNT = questions.length + 1;
