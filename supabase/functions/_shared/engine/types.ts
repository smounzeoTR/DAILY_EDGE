// Plan engine types. The engine is pure: everything it needs is in EngineInput.

// YYYY-MM-DD, local date in the user's time zone
export type ISODate = string;
export type Language = 'fr' | 'en';

export type Domain =
  | 'clarity_goals'
  | 'discipline_habits'
  | 'money_wealth'
  | 'business_career'
  | 'mindset_beliefs'
  | 'relationships_network'
  | 'energy_health';
export type Persona = 'entrepreneur' | 'employee' | 'career_changer' | 'financial_beginner';
export type Blocker =
  'procrastination' | 'fear' | 'finances' | 'confidence' | 'organisation' | 'motivation';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type UserLevel = 'beginner' | 'intermediate' | 'advanced';
export type PlanMode = 'normal' | 'minimal' | 'recovery';
export type ItemStatus = 'todo' | 'done' | 'skipped' | 'too_hard';
export type ItemOrigin = 'engine' | 'user';
export type ContentStatus = 'draft' | 'review' | 'published' | 'retired';

export type CatalogExercise = {
  id: string;
  status: ContentStatus;
  domain: Domain;
  // Ordered: first = main principle
  principleIds: string[];
  durationMin: number;
  difficulty: number;
  energy: EnergyLevel;
  // Empty = all personas
  personas: Persona[];
  blockers: Blocker[];
  prerequisiteIds: string[];
  // null = never repeated
  repeatAfterDays: number | null;
};

export type ProgramStep = {
  programId: string;
  dayIndex: number;
  principleId: string;
  mainExerciseId: string;
  minimalExerciseId: string;
  introducedHabitId: string | null;
  themeFr: string;
  themeEn: string;
};

export type Catalog = {
  exercises: CatalogExercise[];
  programs: { id: string; durationDays: number }[];
  programSteps: ProgramStep[];
};

export type PastPlan = {
  date: ISODate;
  mode: PlanMode;
  // Program day covered; null in catalogue mode
  programDay: number | null;
  // Program of the plan (a program change restarts at the profile's day)
  programId: string | null;
  items: {
    exerciseId: string;
    status: ItemStatus;
    rating: number | null;
    // engine = proposed by the engine; user = added from the library
    origin: ItemOrigin;
  }[];
};

export type ExerciseHistory = {
  exerciseId: string;
  lastDoneOn: ISODate | null;
  // Times skipped or marked too hard
  skips: number;
  lastRating1On: ISODate | null;
};

export type EngineInput = {
  today: ISODate;
  language: Language;
  profile: {
    level: UserLevel;
    dailyMinutes: number | null;
    persona: Persona;
    programId: string | null;
    programDay: number;
    priorityDomains: Domain[];
    blockers: Blocker[];
    onboardedOn: ISODate;
  };
  // Last 7 days or more; a check-in on day D is about day D+1
  checkins: {
    date: ISODate;
    energy: number | null;
    mood: number | null;
    minutesTomorrow: number | null;
  }[];
  // Plans before `today` (60 days or more)
  plans: PastPlan[];
  // All-time per exercise
  exerciseHistory: ExerciseHistory[];
  // Days with at least one habit checked (recent)
  habitLogDates: ISODate[];
  // Exercises the user already added to the plan of `today` (never proposed twice)
  userAddedExerciseIds: string[];
  ownedHabitTemplateIds: string[];
  goal: {
    targetValue: number | null;
    currentValue: number | null;
    // Last time the user entered the current value
    currentValueUpdatedOn: ISODate | null;
    createdOn: ISODate;
    deadline: ISODate | null;
  } | null;
  catalog: Catalog;
};

export type RuleId =
  | 'no_checkin_defaults'
  | 'recovery_inactive_3d'
  | 'minimal_low_energy'
  | 'minimal_low_time'
  | 'minimal_low_completion'
  | 'minimal_low_mood_5d'
  | 'low_energy_2d'
  | 'goal_behind_schedule'
  | 'program_step'
  | 'program_advanced'
  | 'program_completed'
  | 'program_main_too_long'
  | 'replaced_skipped_twice'
  | 'replaced_rated_low'
  | 'replaced_missing_prerequisite'
  | 'replaced_unpublished'
  | 'catalog_mode'
  | 'catalog_two_exercises'
  | 'level_up_high_completion'
  | 'relaxed_repeat_delay'
  | 'relaxed_skipped_twice'
  | 'relaxed_difficulty'
  | 'relaxed_energy'
  | 'relaxed_persona'
  | 'relaxed_short_fallback'
  | 'no_candidate'
  | 'habit_introduced'
  | 'adopted_user_item';

export type WhyKey =
  | 'recovery'
  | 'low_energy'
  | 'low_time'
  | 'low_completion'
  | 'low_mood'
  | 'replaced'
  | 'level_up'
  | 'program_week'
  | 'program_completed'
  | 'catalog_domain'
  | 'catalog_default';

export type ScoreParts = {
  domain: number;
  blocker: number;
  affinity: number;
  novelty: number;
  balance: number;
};

export type ScoredCandidate = { exerciseId: string; score: number; parts: ScoreParts };

export type PlanDecision = {
  date: ISODate;
  mode: PlanMode;
  programDay: number | null;
  programId: string | null;
  nextProfileProgramDay: number;
  principleId: string | null;
  // adopted: the user's addition of the program step exercise, now an engine item
  items: { exerciseId: string; position: number; adopted: boolean }[];
  introducedHabitId: string | null;
  // Minutes available for the engine items (AI choices must fit in it)
  budgetMinutes: number;
  whyToday: string;
  whyKey: WhyKey;
  whyParams: Record<string, string | number>;
  rulesFired: RuleId[];
  candidates: ScoredCandidate[];
};
