// Pure onboarding rules (cahier des charges § 2 and § 3.1). No I/O.
import type { Answers, HabitTemplateRow, Persona, ProgramRow, Step, ChosenHabit } from './types';

export const MAX_PRIORITY_DOMAINS = 3;
export const HABITS_TO_PICK = 3;
export const MAX_HABIT_CANDIDATES = 12;
export const DEFAULT_DAILY_MINUTES = 15;

// § 2: first priority domain "money" wins, then situation. Skipped situation -> entrepreneur.
export function assignPersona(answers: Pick<Answers, 'priorityDomains' | 'situation'>): Persona {
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

// Override from "Changer de programme" wins over the assignment rule
export function effectiveProgram<P extends ProgramRow>(answers: Answers, programs: P[]): P | null {
  if (answers.programOverride) {
    const chosen = programs.find((p) => p.id === answers.programOverride);
    if (chosen) return chosen;
  }
  return selectProgram(assignPersona(answers), programs);
}

// Templates for the persona ("Tous" = empty array), priority domains first (in priority order)
export function habitCandidates<T extends HabitTemplateRow>(
  templates: T[],
  persona: Persona,
  priorityDomains: Answers['priorityDomains'],
): T[] {
  const eligible = templates.filter(
    (t) =>
      (t.status ?? 'published') === 'published' &&
      (t.personas.length === 0 || t.personas.includes(persona)),
  );
  const rank = (t: T) => {
    const i = priorityDomains.indexOf(t.domain);
    return i === -1 ? priorityDomains.length : i;
  };
  // Array.prototype.sort is stable: catalogue order kept within a rank
  return [...eligible].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_HABIT_CANDIDATES);
}

export function toggleHabit(habits: ChosenHabit[], templateId: string): ChosenHabit[] {
  if (habits.some((h) => h.templateId === templateId)) {
    return habits.filter((h) => h.templateId !== templateId);
  }
  if (habits.length >= HABITS_TO_PICK) return habits;
  return [...habits, { templateId, cue: null }];
}

export function toggleLimited<T>(values: T[], value: T, max = Infinity): T[] {
  if (values.includes(value)) return values.filter((v) => v !== value);
  if (values.length >= max) return values;
  return [...values, value];
}

// Local date as YYYY-MM-DD
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isFutureDate(isoDate: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) && isoDate > today;
}

export function parseTargetValue(raw: string): number | null | 'invalid' {
  const text = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : 'invalid';
}

export function canContinue(step: Step, answers: Answers, today: string): boolean {
  switch (step) {
    case 'goalTitle':
      return answers.goalTitle.trim().length > 0;
    case 'goalMeasure':
      return parseTargetValue(answers.goalTargetValue) !== 'invalid';
    case 'goalDeadline':
      return answers.goalDeadline === null || isFutureDate(answers.goalDeadline, today);
    case 'domains':
      return answers.priorityDomains.length <= MAX_PRIORITY_DOMAINS;
    case 'habits':
      return answers.habits.length === HABITS_TO_PICK;
    default:
      return true;
  }
}

// Clears the answer of a skipped question
export function skipAnswer(step: Step, answers: Answers): Answers {
  switch (step) {
    case 'goalMeasure':
      return { ...answers, goalTargetValue: '', goalUnit: '' };
    case 'goalDeadline':
      return { ...answers, goalDeadline: null };
    case 'goalWhy':
      return { ...answers, goalWhy: '' };
    case 'situation':
      return { ...answers, situation: null };
    case 'domains':
      return { ...answers, priorityDomains: [] };
    case 'blockers':
      return { ...answers, blockers: [] };
    case 'dailyMinutes':
      return { ...answers, dailyMinutes: null };
    case 'chronotype':
      return { ...answers, chronotype: null };
    case 'motivation':
      return { ...answers, motivationStyle: null };
    case 'level':
      return { ...answers, level: null };
    case 'reminders':
      return { ...answers, notifyMorning: '07:30', notifyEvening: '21:00' };
    default:
      return answers;
  }
}

// Arguments of the complete_onboarding Postgres function
export function buildCompleteOnboardingArgs(
  answers: Answers,
  programId: string,
  defaultCues: Record<string, string>,
  context: { locale: 'fr' | 'en'; timezone: string },
) {
  const target = parseTargetValue(answers.goalTargetValue);
  return {
    p_goal_title: answers.goalTitle.trim(),
    p_program_id: programId,
    p_habits: answers.habits.map((h) => {
      const cue = h.cue?.trim() ?? '';
      // Only a cue the user actually changed is sent
      return cue !== '' && cue !== defaultCues[h.templateId]
        ? { template_id: h.templateId, cue }
        : { template_id: h.templateId };
    }),
    p_goal_target_value: typeof target === 'number' ? target : undefined,
    p_goal_unit: answers.goalUnit.trim() || undefined,
    p_goal_deadline: answers.goalDeadline ?? undefined,
    p_goal_why: answers.goalWhy.trim() || undefined,
    p_situation: answers.situation ?? undefined,
    p_priority_domains: answers.priorityDomains,
    p_blockers: answers.blockers,
    p_daily_minutes: answers.dailyMinutes ?? DEFAULT_DAILY_MINUTES,
    p_chronotype: answers.chronotype ?? undefined,
    p_motivation_style: answers.motivationStyle ?? undefined,
    p_level: answers.level ?? undefined,
    p_notify_morning: answers.notifyMorning,
    p_notify_evening: answers.notifyEvening,
    p_consent_checkin: answers.consentCheckin,
    p_consent_ai: answers.consentAi,
    p_locale: context.locale,
    p_timezone: context.timezone,
  };
}
