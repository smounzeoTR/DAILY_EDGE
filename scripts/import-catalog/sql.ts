// Catalogue -> deterministic seed SQL (one insert per table, sorted by ID).
import type { Catalog } from './types.ts';

type SqlValue = string | number | boolean | null | SqlArray;
type SqlArray = { values: string[]; type: string };

export function sqlArray(values: string[], type: string): SqlArray {
  return { values, type };
}

export function literal(value: SqlValue): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`invalid number ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  if (value.values.length === 0) return `'{}'::${value.type}`;
  return `array[${value.values.map((v) => literal(v)).join(', ')}]::${value.type}`;
}

const byId = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id, 'en', { numeric: true });

function insert(table: string, columns: string[], rows: SqlValue[][]): string {
  if (rows.length === 0) return `-- ${table}: no rows\n`;
  const values = rows.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')}) values\n${values};\n`;
}

export function buildSeedSql(catalog: Catalog, meta: { sourceFile: string }): string {
  const sources = [...catalog.sources].sort(byId);
  const principles = [...catalog.principles].sort(byId);
  const exercises = [...catalog.exercises].sort(byId);
  const habits = [...catalog.habitTemplates].sort(byId);
  const programs = [...catalog.programs].sort(byId);
  const steps = [...catalog.programSteps].sort(
    (a, b) =>
      a.programId.localeCompare(b.programId, 'en', { numeric: true }) || a.dayIndex - b.dayIndex,
  );

  const parts = [
    `-- GENERATED FILE, DO NOT EDIT.`,
    `-- Source: ${meta.sourceFile}`,
    `-- Regenerate with: npm run import:catalog`,
    ``,
    `begin;`,
    ``,
    insert(
      'sources',
      ['id', 'author', 'title_fr', 'title_original', 'year'],
      sources.map((s) => [s.id, s.author, s.titleFr, s.titleOriginal, s.year]),
    ),
    insert(
      'principles',
      ['id', 'domain', 'title_fr', 'summary_fr', 'title_en', 'summary_en', 'status'],
      principles.map((p) => [
        p.id,
        p.domain,
        p.titleFr,
        p.summaryFr,
        p.titleEn,
        p.summaryEn,
        p.status,
      ]),
    ),
    insert(
      'principle_sources',
      ['principle_id', 'source_id', 'position'],
      principles.flatMap((p) => p.sourceIds.map((id, i) => [p.id, id, i + 1])),
    ),
    insert(
      'exercises',
      [
        'id',
        'title_fr',
        'instructions_fr',
        'title_en',
        'instructions_en',
        'domain',
        'duration_min',
        'difficulty',
        'energy',
        'time_of_day',
        'type',
        'personas',
        'blockers',
        'repeat_after_days',
        'proof_type',
        'status',
      ],
      exercises.map((e) => [
        e.id,
        e.titleFr,
        e.instructionsFr,
        e.titleEn,
        e.instructionsEn,
        e.domain,
        e.durationMin,
        e.difficulty,
        e.energy,
        e.timeOfDay,
        e.type,
        sqlArray(e.personas, 'public.persona[]'),
        sqlArray(e.blockers, 'public.blocker[]'),
        e.repeatAfterDays,
        e.proofType,
        e.status,
      ]),
    ),
    insert(
      'exercise_principles',
      ['exercise_id', 'principle_id', 'position'],
      exercises.flatMap((e) => e.principleIds.map((id, i) => [e.id, id, i + 1])),
    ),
    insert(
      'exercise_prerequisites',
      ['exercise_id', 'prerequisite_id'],
      exercises.flatMap((e) => e.prerequisiteIds.map((id) => [e.id, id])),
    ),
    insert(
      'habit_templates',
      [
        'id',
        'title_fr',
        'description_fr',
        'title_en',
        'description_en',
        'domain',
        'frequency',
        'time_of_day',
        'default_cue_fr',
        'default_cue_en',
        'minimal_version_fr',
        'minimal_version_en',
        'personas',
        'status',
      ],
      habits.map((h) => [
        h.id,
        h.titleFr,
        h.descriptionFr,
        h.titleEn,
        h.descriptionEn,
        h.domain,
        h.frequency,
        h.timeOfDay,
        h.defaultCueFr,
        h.defaultCueEn,
        h.minimalVersionFr,
        h.minimalVersionEn,
        sqlArray(h.personas, 'public.persona[]'),
        h.status,
      ]),
    ),
    insert(
      'habit_template_principles',
      ['habit_template_id', 'principle_id', 'position'],
      habits.flatMap((h) => h.principleIds.map((id, i) => [h.id, id, i + 1])),
    ),
    insert(
      'programs',
      [
        'id',
        'name_fr',
        'description_fr',
        'name_en',
        'description_en',
        'persona',
        'duration_days',
        'status',
      ],
      programs.map((p) => [
        p.id,
        p.nameFr,
        p.descriptionFr,
        p.nameEn,
        p.descriptionEn,
        p.persona,
        p.durationDays,
        p.status,
      ]),
    ),
    insert(
      'program_steps',
      [
        'program_id',
        'day_index',
        'theme_fr',
        'theme_en',
        'principle_id',
        'main_exercise_id',
        'minimal_exercise_id',
        'introduced_habit_id',
      ],
      steps.map((s) => [
        s.programId,
        s.dayIndex,
        s.themeFr,
        s.themeEn,
        s.principleId,
        s.mainExerciseId,
        s.minimalExerciseId,
        s.introducedHabitId,
      ]),
    ),
    `commit;`,
    ``,
  ];
  return parts.join('\n');
}
