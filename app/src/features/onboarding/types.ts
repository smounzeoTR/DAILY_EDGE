import type { Database } from '@/lib/database.types';

type Enums = Database['public']['Enums'];
export type Situation = Enums['situation'];
export type Domain = Enums['domain'];
export type Blocker = Enums['blocker'];
export type Persona = Enums['persona'];
export type Chronotype = Enums['chronotype'];
export type MotivationStyle = Enums['motivation_style'];
export type UserLevel = Enums['user_level'];
export type DailyMinutes = 5 | 15 | 30 | 45;

export type ChosenHabit = {
  templateId: string;
  // null = default cue of the template (not stored)
  cue: string | null;
};

export type Answers = {
  goalTitle: string;
  goalTargetValue: string;
  goalUnit: string;
  // YYYY-MM-DD (local date)
  goalDeadline: string | null;
  goalWhy: string;
  situation: Situation | null;
  priorityDomains: Domain[];
  blockers: Blocker[];
  dailyMinutes: DailyMinutes | null;
  chronotype: Chronotype | null;
  motivationStyle: MotivationStyle | null;
  level: UserLevel | null;
  // HH:MM
  notifyMorning: string;
  notifyEvening: string;
  // Lot 10b: 18 or older, required (confirmed server side before complete_onboarding)
  adultConfirmed: boolean;
  consentCheckin: boolean;
  consentAi: boolean;
  // Audience measurement (PostHog), off by default
  consentAnalytics: boolean;
  // Set by "Changer de programme"; null = program from the assignment rule
  programOverride: string | null;
  habits: ChosenHabit[];
};

export const emptyAnswers: Answers = {
  goalTitle: '',
  goalTargetValue: '',
  goalUnit: '',
  goalDeadline: null,
  goalWhy: '',
  situation: null,
  priorityDomains: [],
  blockers: [],
  dailyMinutes: null,
  chronotype: null,
  motivationStyle: null,
  level: null,
  notifyMorning: '07:30',
  notifyEvening: '21:00',
  adultConfirmed: false,
  consentCheckin: false,
  consentAi: false,
  consentAnalytics: false,
  programOverride: null,
  habits: [],
};

export const STEPS = [
  'adult',
  'goalTitle',
  'goalMeasure',
  'goalDeadline',
  'goalWhy',
  'situation',
  'domains',
  'blockers',
  'dailyMinutes',
  'chronotype',
  'motivation',
  'level',
  'reminders',
  'consent',
  'program',
  'habits',
] as const;
export type Step = (typeof STEPS)[number];

// Questions that can be skipped (all but Q1; consent/program/habits have no skip)
export const SKIPPABLE: ReadonlySet<Step> = new Set<Step>([
  'goalMeasure',
  'goalDeadline',
  'goalWhy',
  'situation',
  'domains',
  'blockers',
  'dailyMinutes',
  'chronotype',
  'motivation',
  'level',
  'reminders',
]);

export type ProgramRow = { id: string; persona: Persona; status?: string };
export type HabitTemplateRow = {
  id: string;
  domain: Domain;
  personas: Persona[];
  status?: string;
};
