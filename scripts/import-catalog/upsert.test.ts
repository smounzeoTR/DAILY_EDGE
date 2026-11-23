import { describe, expect, it } from 'vitest';

import { sqlArray, type TableData } from './sql.ts';
import { diffCatalog, diffTable, formatDiff, hasChanges, upsertSql } from './upsert.ts';

const exercises: TableData = {
  table: 'exercises',
  key: ['id'],
  columns: ['id', 'title_fr', 'personas', 'status'],
  rows: [
    ['E001', 'Écrire', sqlArray([], 'public.persona[]'), 'published'],
    ['E002', 'Lire', sqlArray(['employee'], 'public.persona[]'), 'published'],
  ],
};
const links: TableData = {
  table: 'exercise_principles',
  key: ['exercise_id', 'principle_id'],
  columns: ['exercise_id', 'principle_id', 'position'],
  rows: [['E001', 'P001', 1]],
};

describe('catalogue update (upsert)', () => {
  it('no difference when the database matches (empty arrays included)', () => {
    const diff = diffTable(exercises, [
      { id: 'E001', title_fr: 'Écrire', personas: [], status: 'published' },
      { id: 'E002', title_fr: 'Lire', personas: ['employee'], status: 'published' },
    ]);
    expect(hasChanges([diff])).toBe(false);
    expect(formatDiff([diff])).toBe('Aucune différence : la base est déjà à jour.');
  });

  it('creates, updates field by field and retires content missing from the workbook', () => {
    const diff = diffTable(exercises, [
      { id: 'E001', title_fr: 'Ancien titre', personas: [], status: 'published' },
      { id: 'E900', title_fr: 'Retiré du fichier', personas: [], status: 'published' },
      { id: 'E901', title_fr: 'Déjà retiré', personas: [], status: 'retired' },
    ]);
    expect(diff.created.map((r) => r[0])).toEqual(['E002']);
    expect(diff.updated).toEqual([
      {
        key: 'E001',
        row: exercises.rows[0],
        changes: [{ column: 'title_fr', from: 'Ancien titre', to: 'Écrire' }],
      },
    ]);
    expect(diff.retired).toEqual(['E900']);
  });

  it('never deletes: missing link rows are only reported', () => {
    const [, diff] = diffCatalog([exercises, links], {
      exercise_principles: [
        { exercise_id: 'E001', principle_id: 'P001', position: 1 },
        { exercise_id: 'E001', principle_id: 'P002', position: 2 },
      ],
    });
    expect(diff?.kept).toEqual(['E001|P002']);
    const sql = upsertSql([exercises, links], diffCatalog([exercises, links], {})).join('\n');
    expect(sql).not.toMatch(/\bdelete\b/i);
  });

  it('writes an upsert for changed rows and an update for retired ones', () => {
    const diffs = diffCatalog([exercises], {
      exercises: [
        { id: 'E001', title_fr: 'Ancien', personas: [], status: 'published' },
        { id: 'E002', title_fr: 'Lire', personas: ['employee'], status: 'published' },
        { id: 'E900', title_fr: 'X', personas: [], status: 'published' },
      ],
    });
    const statements = upsertSql([exercises], diffs);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("('E001', 'Écrire', '{}'::public.persona[], 'published')");
    expect(statements[0]).not.toContain('E002');
    expect(statements[0]).toContain(
      'on conflict (id) do update set title_fr = excluded.title_fr, personas = excluded.personas, status = excluded.status;',
    );
    expect(statements[1]).toBe(
      "update public.exercises set status = 'retired' where id in ('E900');",
    );
  });

  it('is idempotent: once applied, a second diff is empty', () => {
    const applied = [
      { id: 'E001', title_fr: 'Écrire', personas: [], status: 'published' },
      { id: 'E002', title_fr: 'Lire', personas: ['employee'], status: 'published' },
      { id: 'E900', title_fr: 'X', personas: [], status: 'retired' },
    ];
    expect(hasChanges(diffCatalog([exercises], { exercises: applied }))).toBe(false);
  });
});
