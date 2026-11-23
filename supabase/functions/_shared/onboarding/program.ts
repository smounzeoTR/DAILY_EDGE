// Program assignment rule of the onboarding ("Ton programme", cahier des charges § 2), shared by
// diagnostic-submit and, from lot S3b, the app. Pure: no I/O.
// Until S3b removes it, app/src/features/onboarding/rules.ts keeps a copy: program.test.ts
// checks that both give the same program for every domain × situation.

export const DOMAINS = [
  'clarity_goals',
  'discipline_habits',
  'money_wealth',
  'business_career',
  'mindset_beliefs',
  'relationships_network',
  'energy_health',
] as const;
export type Domain = (typeof DOMAINS)[number];

export const SITUATIONS = [
  'employee',
  'entrepreneur',
  'freelancer',
  'student',
  'in_transition',
] as const;
export type Situation = (typeof SITUATIONS)[number];

export type Persona = 'entrepreneur' | 'employee' | 'career_changer' | 'financial_beginner';

export type ProgramRow = { id: string; persona: Persona; status?: string };

// § 2: first priority domain "money" wins, then situation. Skipped situation -> entrepreneur.
export function assignPersona(answers: {
  priorityDomains: readonly Domain[];
  situation: Situation | null;
}): Persona {
  if (answers.priorityDomains[0] === 'money_wealth') return 'financial_beginner';
  switch (answers.situation) {
    case 'employee':
      return 'employee';
    case 'student':
    case 'in_transition':
      return 'career_changer';
    case 'entrepreneur':
    case 'freelancer':
    case null:
      return 'entrepreneur';
  }
}

// Published program of the persona (catalogue order), null if none
export function selectProgram<P extends ProgramRow>(persona: Persona, programs: P[]): P | null {
  return (
    programs.find((p) => p.persona === persona && (p.status ?? 'published') === 'published') ?? null
  );
}
