// "Pourquoi aujourd'hui" sentence templates (rule-based, free plan). Kind, never guilt-inducing.
import type { Domain, Language, RuleId, WhyKey } from './types.ts';

export const WHY_TEMPLATES: Record<WhyKey, Record<Language, string>> = {
  recovery: {
    fr: 'Content de te revoir ! On reprend en douceur avec une version courte.',
    en: "Good to see you again! Let's ease back in with a short version.",
  },
  low_energy: {
    fr: 'Ton énergie était basse hier : voici une version courte pour garder le rythme.',
    en: "Your energy was low yesterday: here's a short version to keep the rhythm.",
  },
  low_time: {
    fr: "Peu de temps aujourd'hui : une action courte suffit pour avancer.",
    en: 'Little time today: one short action is enough to move forward.',
  },
  low_completion: {
    fr: 'On allège un peu : une petite action, et le rythme revient.',
    en: "Let's keep it light: one small action and the rhythm comes back.",
  },
  low_mood: {
    fr: "Ces derniers jours ont l'air chargés : on garde l'essentiel, en douceur.",
    en: "The last few days seem heavy: let's keep just the essentials, gently.",
  },
  replaced: {
    fr: 'On aborde ce principe autrement : voici une version plus courte.',
    en: "Let's take this principle from another angle: here's a shorter version.",
  },
  level_up: {
    fr: "Tu tiens le rythme depuis une semaine : on monte d'un cran.",
    en: "You've kept the rhythm for a week: let's step it up.",
  },
  program_week: {
    fr: 'Semaine {{week}} de ton programme : {{theme}}.',
    en: 'Week {{week}} of your program: {{theme}}.',
  },
  program_completed: {
    fr: 'Programme terminé, bravo ! Place à des exercices choisis pour ton objectif.',
    en: 'Program completed, well done! Now come exercises picked for your goal.',
  },
  catalog_domain: {
    fr: 'Choisi pour ta priorité : {{domain}}.',
    en: 'Picked for your priority: {{domain}}.',
  },
  catalog_default: {
    fr: "Choisi pour varier les plaisirs et garder l'équilibre.",
    en: 'Picked for variety and balance.',
  },
};

export const DOMAIN_LABELS: Record<Domain, Record<Language, string>> = {
  clarity_goals: { fr: 'clarté & objectifs', en: 'clarity & goals' },
  discipline_habits: { fr: 'discipline & habitudes', en: 'discipline & habits' },
  money_wealth: { fr: 'argent & patrimoine', en: 'money & wealth' },
  business_career: { fr: 'entreprise & carrière', en: 'business & career' },
  mindset_beliefs: { fr: 'mental & croyances', en: 'mindset & beliefs' },
  relationships_network: { fr: 'relations & réseau', en: 'relationships & network' },
  energy_health: { fr: 'énergie & santé', en: 'energy & health' },
};

// First matching rule wins
const PRIORITY: { rule: RuleId; key: WhyKey }[] = [
  { rule: 'recovery_inactive_3d', key: 'recovery' },
  { rule: 'minimal_low_energy', key: 'low_energy' },
  { rule: 'minimal_low_time', key: 'low_time' },
  { rule: 'program_main_too_long', key: 'low_time' },
  { rule: 'minimal_low_mood_5d', key: 'low_mood' },
  { rule: 'minimal_low_completion', key: 'low_completion' },
  { rule: 'replaced_skipped_twice', key: 'replaced' },
  { rule: 'replaced_rated_low', key: 'replaced' },
  { rule: 'level_up_high_completion', key: 'level_up' },
  { rule: 'program_step', key: 'program_week' },
  { rule: 'program_completed', key: 'program_completed' },
];

export function chooseWhyKey(rules: RuleId[], catalogDomainIsPriority: boolean): WhyKey {
  for (const p of PRIORITY) if (rules.includes(p.rule)) return p.key;
  return catalogDomainIsPriority ? 'catalog_domain' : 'catalog_default';
}

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1);

export function renderWhy(
  key: WhyKey,
  language: Language,
  params: Record<string, string | number>,
): string {
  return WHY_TEMPLATES[key][language].replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing why param ${name} for ${key}`);
    return typeof value === 'string' ? lowerFirst(value) : String(value);
  });
}
