// Normalized catalogue model, mirrors the content tables.

export type ContentStatus = 'draft' | 'review' | 'published' | 'retired';
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
export type TimeOfDay = 'morning' | 'daytime' | 'evening' | 'any';
export type ExerciseType =
  'writing' | 'reflection' | 'action' | 'visualisation' | 'learning' | 'social';
export type ProofType = 'checkbox' | 'free_text' | 'numeric';
export type HabitFrequency =
  'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'occasional';

export type Source = {
  id: string;
  author: string;
  titleFr: string;
  titleOriginal: string;
  year: number | null;
};

export type Principle = {
  id: string;
  domain: Domain;
  titleFr: string;
  summaryFr: string;
  titleEn: string;
  summaryEn: string;
  status: ContentStatus;
  sourceIds: string[];
};

export type Exercise = {
  id: string;
  titleFr: string;
  instructionsFr: string;
  titleEn: string;
  instructionsEn: string;
  domain: Domain;
  principleIds: string[];
  durationMin: number;
  difficulty: number;
  energy: EnergyLevel;
  timeOfDay: TimeOfDay;
  type: ExerciseType;
  // Empty = all personas
  personas: Persona[];
  blockers: Blocker[];
  prerequisiteIds: string[];
  // null = never repeated
  repeatAfterDays: number | null;
  proofType: ProofType;
  status: ContentStatus;
};

export type HabitTemplate = {
  id: string;
  titleFr: string;
  descriptionFr: string;
  titleEn: string;
  descriptionEn: string;
  domain: Domain;
  principleIds: string[];
  frequency: HabitFrequency;
  timeOfDay: TimeOfDay;
  defaultCueFr: string;
  defaultCueEn: string;
  minimalVersionFr: string;
  minimalVersionEn: string;
  personas: Persona[];
  status: ContentStatus;
};

export type Program = {
  id: string;
  nameFr: string;
  descriptionFr: string;
  nameEn: string;
  descriptionEn: string;
  persona: Persona;
  durationDays: number;
  status: ContentStatus;
};

export type ProgramStep = {
  programId: string;
  dayIndex: number;
  themeFr: string;
  themeEn: string;
  principleId: string;
  mainExerciseId: string;
  minimalExerciseId: string;
  introducedHabitId: string | null;
};

export type Catalog = {
  sources: Source[];
  principles: Principle[];
  exercises: Exercise[];
  habitTemplates: HabitTemplate[];
  programs: Program[];
  programSteps: ProgramStep[];
};

export type Issue = {
  level: 'error' | 'warning';
  sheet: string;
  // Row identifier (catalogue ID or "PR1 J5")
  ref: string;
  message: string;
};

export type CellValue = string | number | null;
export type SheetRow = { rowNumber: number; cells: Record<string, CellValue> };
export type Workbook = Record<string, { headers: string[]; rows: SheetRow[] }>;
