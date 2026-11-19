// Loads data/catalogue.xlsx through the import script and maps it to the engine catalogue.
import { resolve } from 'node:path';

import { importCatalog } from '../../../../../scripts/import-catalog/import.ts';
import type { Catalog } from '../types.ts';

const root = resolve(import.meta.dirname, '../../../../..');

export async function loadRealCatalog(): Promise<Catalog> {
  const { catalog } = await importCatalog(
    resolve(root, 'data/catalogue.xlsx'),
    'data/catalogue.xlsx',
  );
  return {
    exercises: catalog.exercises.map((e) => ({
      id: e.id,
      status: e.status,
      domain: e.domain,
      principleIds: e.principleIds,
      durationMin: e.durationMin,
      difficulty: e.difficulty,
      energy: e.energy,
      personas: e.personas,
      blockers: e.blockers,
      prerequisiteIds: e.prerequisiteIds,
      repeatAfterDays: e.repeatAfterDays,
    })),
    programs: catalog.programs.map((p) => ({ id: p.id, durationDays: p.durationDays })),
    programSteps: catalog.programSteps.map((s) => ({
      programId: s.programId,
      dayIndex: s.dayIndex,
      principleId: s.principleId,
      mainExerciseId: s.mainExerciseId,
      minimalExerciseId: s.minimalExerciseId,
      introducedHabitId: s.introducedHabitId,
      themeFr: s.themeFr,
      themeEn: s.themeEn,
    })),
  };
}
