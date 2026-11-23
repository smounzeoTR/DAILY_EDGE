// Answer values of the web diagnostic, without dependency: imported by the site (labels) and by
// schema.ts. Domains and situations are those of the onboarding (../onboarding/program.ts).
export { DOMAINS, SITUATIONS, type Domain, type Situation } from '../onboarding/program.ts';

export const DIAGNOSTIC_BLOCKERS = ['motivation', 'organisation', 'constance', 'fear'] as const;
export type DiagnosticBlocker = (typeof DIAGNOSTIC_BLOCKERS)[number];
export const DIAGNOSTIC_MINUTES = [5, 15, 30] as const;
export type DiagnosticMinutes = (typeof DIAGNOSTIC_MINUTES)[number];
export const CHRONOTYPES = ['morning', 'midday', 'evening'] as const;
export type Chronotype = (typeof CHRONOTYPES)[number];
export const AUTHORS = ['hill', 'kiyosaki', 'clear', 'covey', 'robbins', 'carnegie'] as const;
export type Author = (typeof AUTHORS)[number];
