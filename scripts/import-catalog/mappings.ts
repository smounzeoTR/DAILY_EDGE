// Catalogue labels (French, as typed in the Sheet) -> database codes.
import type {
  Blocker,
  ContentStatus,
  Domain,
  EnergyLevel,
  ExerciseType,
  HabitFrequency,
  Persona,
  ProofType,
  TimeOfDay,
} from './types.ts';

export const NONE = '—';
export const ALL_PERSONAS = 'Tous';
export const NEVER_REPEAT = 'Non';

export const STATUS: Record<string, ContentStatus> = {
  Brouillon: 'draft',
  'En relecture': 'review',
  Validé: 'published',
  Rejeté: 'retired',
};

export const DOMAIN: Record<string, Domain> = {
  'Clarté & objectifs': 'clarity_goals',
  'Discipline & habitudes': 'discipline_habits',
  'Argent & patrimoine': 'money_wealth',
  'Entreprise & carrière': 'business_career',
  'Mental & croyances': 'mindset_beliefs',
  'Relations & réseau': 'relationships_network',
  'Énergie & santé': 'energy_health',
};

export const PERSONA: Record<string, Persona> = {
  Entrepreneur: 'entrepreneur',
  Salarié: 'employee',
  Reconverti: 'career_changer',
  'Débutant financier': 'financial_beginner',
};

export const BLOCKER: Record<string, Blocker> = {
  Procrastination: 'procrastination',
  Peur: 'fear',
  Finances: 'finances',
  Confiance: 'confidence',
  Organisation: 'organisation',
  Motivation: 'motivation',
};

export const ENERGY: Record<string, EnergyLevel> = {
  Basse: 'low',
  Moyenne: 'medium',
  Haute: 'high',
};

export const TIME_OF_DAY: Record<string, TimeOfDay> = {
  Matin: 'morning',
  Journée: 'daytime',
  Soir: 'evening',
  Indifférent: 'any',
};

export const EXERCISE_TYPE: Record<string, ExerciseType> = {
  Écriture: 'writing',
  Réflexion: 'reflection',
  Action: 'action',
  Visualisation: 'visualisation',
  Apprentissage: 'learning',
  Social: 'social',
};

export const PROOF_TYPE: Record<string, ProofType> = {
  'Case à cocher': 'checkbox',
  'Texte libre': 'free_text',
  'Valeur chiffrée': 'numeric',
};

export const HABIT_FREQUENCY: Record<string, HabitFrequency> = {
  Quotidienne: 'daily',
  'Jours ouvrés': 'weekdays',
  Hebdomadaire: 'weekly',
  'Toutes les 2 semaines': 'biweekly',
  Mensuelle: 'monthly',
  "À l'occasion": 'occasional',
};
