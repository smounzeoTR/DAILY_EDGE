// Checks the real catalogue export and that seed.sql is up to date.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { importCatalog, type ImportResult } from './import.ts';

const root = resolve(import.meta.dirname, '../..');
let result: ImportResult;

beforeAll(async () => {
  result = await importCatalog(resolve(root, 'data/catalogue.xlsx'), 'data/catalogue.xlsx');
});

describe('data/catalogue.xlsx', () => {
  it('has no blocking error', () => {
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('has the expected counts', () => {
    const c = result.catalog;
    expect({
      sources: c.sources.length,
      principles: c.principles.length,
      exercises: c.exercises.length,
      habitTemplates: c.habitTemplates.length,
      programs: c.programs.length,
      programSteps: c.programSteps.length,
    }).toEqual({
      sources: 15,
      principles: 115,
      exercises: 287,
      habitTemplates: 42,
      programs: 4,
      programSteps: 112,
    });
  });

  it('only warns about the three known step principles', () => {
    expect(result.issues.filter((i) => i.level === 'warning').map((i) => i.ref)).toEqual([
      'PR2 J5',
      'PR2 J14',
      'PR3 J16',
    ]);
  });

  it('matches the committed supabase/seed.sql (run npm run import:catalog)', async () => {
    const committed = await readFile(resolve(root, 'supabase/seed.sql'), 'utf8');
    expect(committed).toBe(result.sql);
  });
});
