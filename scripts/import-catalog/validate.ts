// Cross-sheet checks: broken references, program continuity, prerequisite cycles.
// Errors block the import; warnings are reported only.
import { SHEETS } from './sheets.ts';
import type { Catalog, Issue } from './types.ts';

// Minimal exercises should be a 2-5 minute action (cahier des charges § 5.1)
const MINIMAL_MAX_MINUTES = 5;

export function validateCatalog(catalog: Catalog): Issue[] {
  const issues: Issue[] = [];
  const error = (sheet: string, ref: string, message: string) =>
    issues.push({ level: 'error', sheet, ref, message });
  const warning = (sheet: string, ref: string, message: string) =>
    issues.push({ level: 'warning', sheet, ref, message });

  const sources = new Set(catalog.sources.map((s) => s.id));
  const principles = new Map(catalog.principles.map((p) => [p.id, p]));
  const exercises = new Map(catalog.exercises.map((e) => [e.id, e]));
  const habits = new Map(catalog.habitTemplates.map((h) => [h.id, h]));
  const programs = new Map(catalog.programs.map((p) => [p.id, p]));

  const ref = (sheet: string, owner: string, column: string, id: string, exists: boolean) => {
    if (!exists) error(sheet, owner, `référence cassée « ${column} » → ${id}`);
  };

  for (const p of catalog.principles) {
    for (const id of p.sourceIds) ref(SHEETS.principles.name, p.id, 'Sources', id, sources.has(id));
  }

  for (const e of catalog.exercises) {
    for (const id of e.principleIds) {
      ref(SHEETS.exercises.name, e.id, 'Principes', id, principles.has(id));
    }
    for (const id of e.prerequisiteIds) {
      ref(SHEETS.exercises.name, e.id, 'Prérequis', id, exercises.has(id));
      if (id === e.id)
        error(SHEETS.exercises.name, e.id, 'un exercice ne peut pas être son propre prérequis');
    }
    if (new Set(e.principleIds).size !== e.principleIds.length) {
      error(SHEETS.exercises.name, e.id, 'principe en double');
    }
  }

  for (const h of catalog.habitTemplates) {
    for (const id of h.principleIds)
      ref(SHEETS.habits.name, h.id, 'Principes', id, principles.has(id));
  }

  // Published content should only point to published content
  const unpublished = (sheet: string, owner: string, kind: string, id: string, status?: string) => {
    if (status !== undefined && status !== 'published') {
      warning(sheet, owner, `${kind} ${id} n'est pas publié (${status})`);
    }
  };

  // Program steps
  const sheet = SHEETS.steps.name;
  for (const s of catalog.programSteps) {
    const owner = `${s.programId} J${s.dayIndex}`;
    ref(sheet, owner, 'Programme', s.programId, programs.has(s.programId));
    ref(sheet, owner, 'Principe', s.principleId, principles.has(s.principleId));
    ref(sheet, owner, 'Exercice principal', s.mainExerciseId, exercises.has(s.mainExerciseId));
    ref(sheet, owner, 'Exercice minimal', s.minimalExerciseId, exercises.has(s.minimalExerciseId));
    if (s.introducedHabitId !== null) {
      ref(
        sheet,
        owner,
        'Habitude introduite',
        s.introducedHabitId,
        habits.has(s.introducedHabitId),
      );
    }

    const main = exercises.get(s.mainExerciseId);
    const minimal = exercises.get(s.minimalExerciseId);
    if (main && !main.principleIds.includes(s.principleId)) {
      warning(
        sheet,
        owner,
        `le principe de l'étape ${s.principleId} ne fait pas partie des principes de ${main.id} (${main.principleIds.join(', ')}) ; le principe de l'étape fait foi`,
      );
    }
    if (minimal && minimal.durationMin > MINIMAL_MAX_MINUTES) {
      warning(
        sheet,
        owner,
        `exercice minimal ${minimal.id} de ${minimal.durationMin} min (> ${MINIMAL_MAX_MINUTES})`,
      );
    }
    unpublished(sheet, owner, 'principe', s.principleId, principles.get(s.principleId)?.status);
    unpublished(sheet, owner, 'exercice', s.mainExerciseId, main?.status);
    unpublished(sheet, owner, 'exercice', s.minimalExerciseId, minimal?.status);
    if (s.introducedHabitId !== null) {
      unpublished(
        sheet,
        owner,
        'habitude',
        s.introducedHabitId,
        habits.get(s.introducedHabitId)?.status,
      );
    }
  }

  // Each program has exactly days 1..duration
  for (const program of catalog.programs) {
    const days = catalog.programSteps
      .filter((s) => s.programId === program.id)
      .map((s) => s.dayIndex)
      .sort((a, b) => a - b);
    const expected = Array.from({ length: program.durationDays }, (_, i) => i + 1);
    if (days.join(',') !== expected.join(',')) {
      const missing = expected.filter((d) => !days.includes(d));
      const extra = days.filter((d) => d < 1 || d > program.durationDays);
      error(
        SHEETS.programs.name,
        program.id,
        `étapes incohérentes avec la durée de ${program.durationDays} jours (manquants : ${missing.join(', ') || 'aucun'} ; hors plage : ${extra.join(', ') || 'aucun'})`,
      );
    }

    // Prerequisites should be met by earlier days of the same program
    const done = new Set<string>();
    for (const step of catalog.programSteps
      .filter((s) => s.programId === program.id)
      .sort((a, b) => a.dayIndex - b.dayIndex)) {
      for (const id of [step.mainExerciseId, step.minimalExerciseId]) {
        const unmet = (exercises.get(id)?.prerequisiteIds ?? []).filter((p) => !done.has(p));
        if (unmet.length > 0) {
          warning(
            sheet,
            `${program.id} J${step.dayIndex}`,
            `prérequis de ${id} non vus plus tôt dans le programme : ${unmet.join(', ')}`,
          );
        }
      }
      done.add(step.mainExerciseId);
      done.add(step.minimalExerciseId);
    }
  }

  // Prerequisite cycles
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const cycle = [...path.slice(path.indexOf(id)), id];
      error(SHEETS.exercises.name, id, `cycle de prérequis : ${cycle.join(' → ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const p of exercises.get(id)?.prerequisiteIds ?? []) {
      if (exercises.has(p)) visit(p, [...path, id]);
    }
    state.set(id, 'done');
  };
  for (const id of exercises.keys()) visit(id, []);

  return issues;
}
