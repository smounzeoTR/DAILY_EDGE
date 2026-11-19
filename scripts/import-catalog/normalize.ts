// Workbook rows -> normalized catalogue. Pure: collects issues instead of throwing.
import {
  ALL_PERSONAS,
  BLOCKER,
  DOMAIN,
  ENERGY,
  EXERCISE_TYPE,
  HABIT_FREQUENCY,
  NEVER_REPEAT,
  NONE,
  PERSONA,
  PROOF_TYPE,
  STATUS,
  TIME_OF_DAY,
} from './mappings.ts';
import { ID_PATTERNS, IGNORED_SHEETS, SHEETS } from './sheets.ts';
import type {
  Catalog,
  CellValue,
  Exercise,
  HabitTemplate,
  Issue,
  Persona,
  Principle,
  Program,
  ProgramStep,
  SheetRow,
  Source,
  Workbook,
} from './types.ts';

// Reads typed values from one row, reporting problems with sheet/row context
class RowReader {
  // Explicit fields: Node type stripping does not support parameter properties
  private readonly sheet: string;
  private readonly row: SheetRow;
  private readonly issues: Issue[];
  ref: string;

  constructor(sheet: string, row: SheetRow, issues: Issue[], ref: string) {
    this.sheet = sheet;
    this.row = row;
    this.issues = issues;
    this.ref = ref;
  }

  error(message: string): void {
    this.issues.push({ level: 'error', sheet: this.sheet, ref: this.ref, message });
  }

  private raw(header: string): CellValue {
    return this.row.cells[header] ?? null;
  }

  // Trimmed string, null when empty or "—"
  optionalText(header: string): string | null {
    const value = this.raw(header);
    if (value === null) return null;
    const text = String(value).normalize('NFC').trim();
    return text === '' || text === NONE ? null : text;
  }

  text(header: string): string {
    const text = this.optionalText(header);
    if (text === null) {
      this.error(`« ${header} » est vide`);
      return '';
    }
    return text;
  }

  list(header: string): string[] {
    const text = this.optionalText(header);
    if (text === null) return [];
    return text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '' && item !== NONE);
  }

  optionalInt(header: string): number | null {
    const value = this.raw(header);
    if (value === null || String(value).trim() === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(n)) {
      this.error(`« ${header} » n'est pas un entier : ${String(value)}`);
      return null;
    }
    return n;
  }

  int(header: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    const n = this.optionalInt(header);
    if (n === null) {
      this.error(`« ${header} » est vide`);
      return min;
    }
    if (n < min || n > max) this.error(`« ${header} » hors plage [${min}, ${max}] : ${n}`);
    return n;
  }

  enumValue<T>(header: string, mapping: Record<string, T>): T {
    const label = this.text(header);
    const code = mapping[label];
    if (code === undefined) {
      if (label !== '') this.error(`« ${header} » : valeur inconnue « ${label} »`);
      return Object.values(mapping)[0] as T;
    }
    return code;
  }

  enumList<T>(header: string, mapping: Record<string, T>): T[] {
    return this.list(header).flatMap((label) => {
      const code = mapping[label];
      if (code === undefined) {
        this.error(`« ${header} » : valeur inconnue « ${label} »`);
        return [];
      }
      return [code];
    });
  }

  // "Tous" -> [] (all personas)
  personas(header: string): Persona[] {
    const labels = this.list(header);
    if (labels.length === 1 && labels[0] === ALL_PERSONAS) return [];
    if (labels.includes(ALL_PERSONAS)) {
      this.error(
        `« ${header} » : « ${ALL_PERSONAS} » ne peut pas être combiné à d'autres personas`,
      );
      return [];
    }
    if (labels.length === 0) this.error(`« ${header} » est vide`);
    return this.enumList(header, PERSONA);
  }

  id(header: string, pattern: RegExp): string {
    const id = this.text(header);
    if (id !== '' && !pattern.test(id)) this.error(`identifiant mal formé « ${id} »`);
    return id;
  }
}

function sheetRows(
  workbook: Workbook,
  spec: { name: string; headers: readonly string[]; ignoredHeaders?: readonly string[] },
  issues: Issue[],
): SheetRow[] {
  const sheet = workbook[spec.name];
  if (!sheet) {
    issues.push({ level: 'error', sheet: spec.name, ref: '—', message: 'feuille absente' });
    return [];
  }
  for (const header of spec.headers) {
    if (!sheet.headers.includes(header)) {
      issues.push({
        level: 'error',
        sheet: spec.name,
        ref: '—',
        message: `colonne absente « ${header} »`,
      });
    }
  }
  const known = new Set<string>([...spec.headers, ...(spec.ignoredHeaders ?? [])]);
  for (const header of sheet.headers) {
    if (!known.has(header)) {
      issues.push({
        level: 'warning',
        sheet: spec.name,
        ref: '—',
        message: `colonne inconnue ignorée « ${header} »`,
      });
    }
  }
  return sheet.rows;
}

function checkDuplicates(sheet: string, ids: string[], issues: Issue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === '') continue;
    if (seen.has(id))
      issues.push({ level: 'error', sheet, ref: id, message: 'identifiant en double' });
    seen.add(id);
  }
}

export function normalizeCatalog(workbook: Workbook): { catalog: Catalog; issues: Issue[] } {
  const issues: Issue[] = [];
  const known = new Set<string>([...Object.values(SHEETS).map((s) => s.name), ...IGNORED_SHEETS]);
  for (const name of Object.keys(workbook)) {
    if (!known.has(name)) {
      issues.push({ level: 'warning', sheet: name, ref: '—', message: 'feuille inconnue ignorée' });
    }
  }

  const reader = (sheet: string, row: SheetRow) =>
    new RowReader(sheet, row, issues, `ligne ${row.rowNumber}`);

  const sources: Source[] = sheetRows(workbook, SHEETS.sources, issues).map((row) => {
    const r = reader(SHEETS.sources.name, row);
    r.ref = r.id('ID', ID_PATTERNS.source) || r.ref;
    return {
      id: r.ref,
      author: r.text('Auteur'),
      titleFr: r.text('Titre (FR)'),
      titleOriginal: r.text('Titre original'),
      year: r.optionalInt('Année'),
    };
  });

  const principles: Principle[] = sheetRows(workbook, SHEETS.principles, issues).map((row) => {
    const r = reader(SHEETS.principles.name, row);
    r.ref = r.id('ID', ID_PATTERNS.principle) || r.ref;
    const sourceIds = r.list('Sources');
    if (sourceIds.length === 0) r.error('aucune source');
    return {
      id: r.ref,
      domain: r.enumValue('Domaine', DOMAIN),
      titleFr: r.text('Principe (FR)'),
      summaryFr: r.text('Résumé (FR)'),
      titleEn: r.text('Principle (EN)'),
      summaryEn: r.text('Summary (EN)'),
      status: r.enumValue('Statut', STATUS),
      sourceIds,
    };
  });

  const exercises: Exercise[] = sheetRows(workbook, SHEETS.exercises, issues).map((row) => {
    const r = reader(SHEETS.exercises.name, row);
    r.ref = r.id('ID', ID_PATTERNS.exercise) || r.ref;
    const principleIds = r.list('Principes');
    if (principleIds.length === 0) r.error('aucun principe');
    const repeat = r.optionalText('Délai avant répétition (j)');
    return {
      id: r.ref,
      titleFr: r.text('Titre (FR)'),
      instructionsFr: r.text('Consigne (FR)'),
      titleEn: r.text('Title (EN)'),
      instructionsEn: r.text('Instructions (EN)'),
      domain: r.enumValue('Domaine', DOMAIN),
      principleIds,
      durationMin: r.int('Durée (min)', 1),
      difficulty: r.int('Difficulté (1-5)', 1, 5),
      energy: r.enumValue('Énergie', ENERGY),
      timeOfDay: r.enumValue('Moment', TIME_OF_DAY),
      type: r.enumValue('Type', EXERCISE_TYPE),
      personas: r.personas('Personas'),
      blockers: r.enumList('Blocages traités', BLOCKER),
      prerequisiteIds: r.list('Prérequis'),
      repeatAfterDays:
        repeat === null
          ? (r.error('« Délai avant répétition (j) » est vide'), null)
          : repeat === NEVER_REPEAT
            ? null
            : r.int('Délai avant répétition (j)', 1),
      proofType: r.enumValue('Preuve', PROOF_TYPE),
      status: r.enumValue('Statut', STATUS),
    };
  });

  const habitTemplates: HabitTemplate[] = sheetRows(workbook, SHEETS.habits, issues).map((row) => {
    const r = reader(SHEETS.habits.name, row);
    r.ref = r.id('ID', ID_PATTERNS.habit) || r.ref;
    return {
      id: r.ref,
      titleFr: r.text('Habitude (FR)'),
      descriptionFr: r.text('Description (FR)'),
      titleEn: r.text('Habit (EN)'),
      descriptionEn: r.text('Description (EN)'),
      domain: r.enumValue('Domaine', DOMAIN),
      principleIds: r.list('Principes'),
      frequency: r.enumValue('Fréquence', HABIT_FREQUENCY),
      timeOfDay: r.enumValue('Moment', TIME_OF_DAY),
      defaultCueFr: r.text('Signal par défaut (FR)'),
      defaultCueEn: r.text('Default cue (EN)'),
      minimalVersionFr: r.text('Version minimale (FR)'),
      minimalVersionEn: r.text('Minimal version (EN)'),
      personas: r.personas('Personas'),
      status: r.enumValue('Statut', STATUS),
    };
  });

  const programs: Program[] = sheetRows(workbook, SHEETS.programs, issues).map((row) => {
    const r = reader(SHEETS.programs.name, row);
    r.ref = r.id('ID', ID_PATTERNS.program) || r.ref;
    return {
      id: r.ref,
      nameFr: r.text('Nom (FR)'),
      descriptionFr: r.text('Description (FR)'),
      nameEn: r.text('Name (EN)'),
      descriptionEn: r.text('Description (EN)'),
      persona: r.enumValue('Persona', PERSONA),
      durationDays: r.int('Durée (jours)', 1),
      status: r.enumValue('Statut', STATUS),
    };
  });

  const programSteps: ProgramStep[] = sheetRows(workbook, SHEETS.steps, issues).map((row) => {
    const r = reader(SHEETS.steps.name, row);
    const programId = r.text('Programme');
    const dayIndex = r.int('Jour', 1);
    r.ref = `${programId} J${dayIndex}`;
    return {
      programId,
      dayIndex,
      themeFr: r.text('Thème (FR)'),
      themeEn: r.text('Theme (EN)'),
      principleId: r.text('Principe'),
      mainExerciseId: r.text('Exercice principal'),
      minimalExerciseId: r.text('Exercice minimal'),
      introducedHabitId: r.optionalText('Habitude introduite'),
    };
  });

  checkDuplicates(
    SHEETS.sources.name,
    sources.map((s) => s.id),
    issues,
  );
  checkDuplicates(
    SHEETS.principles.name,
    principles.map((p) => p.id),
    issues,
  );
  checkDuplicates(
    SHEETS.exercises.name,
    exercises.map((e) => e.id),
    issues,
  );
  checkDuplicates(
    SHEETS.habits.name,
    habitTemplates.map((h) => h.id),
    issues,
  );
  checkDuplicates(
    SHEETS.programs.name,
    programs.map((p) => p.id),
    issues,
  );
  checkDuplicates(
    SHEETS.steps.name,
    programSteps.map((s) => `${s.programId} J${s.dayIndex}`),
    issues,
  );

  return {
    catalog: { sources, principles, exercises, habitTemplates, programs, programSteps },
    issues,
  };
}
