// Expected sheets and exact headers of the catalogue export.
// Columns are read by header name, never by position.

export const SHEETS = {
  sources: {
    name: 'Sources',
    headers: ['ID', 'Auteur', 'Titre (FR)', 'Titre original', 'Année'],
  },
  principles: {
    name: 'Principes',
    headers: [
      'ID',
      'Domaine',
      'Principe (FR)',
      'Résumé (FR)',
      'Sources',
      'Statut',
      'Principle (EN)',
      'Summary (EN)',
    ],
  },
  exercises: {
    name: 'Exercices',
    headers: [
      'ID',
      'Titre (FR)',
      'Consigne (FR)',
      'Domaine',
      'Principes',
      'Durée (min)',
      'Difficulté (1-5)',
      'Énergie',
      'Moment',
      'Type',
      'Personas',
      'Blocages traités',
      'Prérequis',
      'Délai avant répétition (j)',
      'Preuve',
      'Statut',
      'Title (EN)',
      'Instructions (EN)',
    ],
  },
  habits: {
    name: 'Habitudes',
    headers: [
      'ID',
      'Habitude (FR)',
      'Description (FR)',
      'Domaine',
      'Principes',
      'Fréquence',
      'Moment',
      'Signal par défaut (FR)',
      'Version minimale (FR)',
      'Personas',
      'Statut',
      'Habit (EN)',
      'Description (EN)',
      'Default cue (EN)',
      'Minimal version (EN)',
    ],
  },
  programs: {
    name: 'Programmes',
    headers: [
      'ID',
      'Nom (FR)',
      'Persona',
      'Durée (jours)',
      'Description (FR)',
      'Statut',
      'Name (EN)',
      'Description (EN)',
    ],
  },
  steps: {
    name: 'Étapes des programmes',
    headers: [
      'Programme',
      'Jour',
      'Thème (FR)',
      'Principe',
      'Exercice principal',
      'Exercice minimal',
      'Habitude introduite',
      'Theme (EN)',
    ],
    // Lookup formula, not imported
    ignoredHeaders: ["Titre de l'exercice"],
  },
} as const satisfies Record<
  string,
  { name: string; headers: readonly string[]; ignoredHeaders?: readonly string[] }
>;

// Helper sheets of the Sheet, not imported
export const IGNORED_SHEETS = ['Dropdown options'];

export const ID_PATTERNS = {
  source: /^S\d{2}$/,
  principle: /^P\d{3}$/,
  exercise: /^E\d{3}$/,
  habit: /^H\d{2}$/,
  program: /^PR\d+$/,
} as const;
