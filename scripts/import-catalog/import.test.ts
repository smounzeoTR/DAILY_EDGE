import { describe, expect, it } from 'vitest';

import { makeWorkbook, setCell } from './fixtures.ts';
import { importWorkbook } from './import.ts';
import { literal, sqlArray } from './sql.ts';
import type { Issue } from './types.ts';

const errors = (issues: Issue[]) => issues.filter((i) => i.level === 'error');
const warnings = (issues: Issue[]) => issues.filter((i) => i.level === 'warning');
const run = (wb = makeWorkbook()) => importWorkbook(wb, 'test.xlsx');

describe('normalization', () => {
  it('imports a valid workbook without errors or warnings', () => {
    const { issues, catalog } = run();
    expect(issues).toEqual([]);
    expect(catalog.exercises).toHaveLength(3);
    expect(catalog.programSteps).toHaveLength(2);
  });

  it('maps French labels to codes', () => {
    const [e1, e2] = run().catalog.exercises;
    expect(e1).toMatchObject({
      domain: 'clarity_goals',
      energy: 'medium',
      timeOfDay: 'morning',
      type: 'writing',
      proofType: 'free_text',
      status: 'published',
      blockers: ['motivation', 'organisation'],
    });
    expect(e2).toMatchObject({
      energy: 'low',
      timeOfDay: 'any',
      type: 'action',
      proofType: 'checkbox',
    });
  });

  it('normalizes "Tous", "—" and "Non"', () => {
    const { catalog } = run();
    const [e1, e2] = catalog.exercises;
    expect(e1?.personas).toEqual([]);
    expect(e1?.prerequisiteIds).toEqual([]);
    expect(e1?.repeatAfterDays).toBeNull();
    expect(e2?.personas).toEqual(['entrepreneur', 'employee']);
    expect(e2?.blockers).toEqual([]);
    expect(e2?.repeatAfterDays).toBe(30);
    expect(catalog.programSteps[1]?.introducedHabitId).toBeNull();
  });

  it('keeps principle order (first = main principle)', () => {
    expect(run().catalog.exercises[0]?.principleIds).toEqual(['P002', 'P001']);
  });

  it('reports unknown enum values', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Exercices', 0, 'Énergie', 'Très haute');
    expect(errors(run(wb).issues)).toEqual([
      expect.objectContaining({ ref: 'E001', message: expect.stringContaining('« Très haute »') }),
    ]);
  });

  it('rejects "Tous" mixed with other personas', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Habitudes', 0, 'Personas', 'Tous, Salarié');
    expect(errors(run(wb).issues)).toHaveLength(1);
  });

  it('reports out-of-range values and missing required text', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Exercices', 0, 'Difficulté (1-5)', 6);
    setCell(wb, 'Exercices', 1, 'Title (EN)', '  ');
    const messages = errors(run(wb).issues).map((i) => i.message);
    expect(messages).toEqual([
      expect.stringContaining('hors plage'),
      expect.stringContaining('« Title (EN) » est vide'),
    ]);
  });

  it('reports a missing column and a malformed or duplicate ID', () => {
    const wb = makeWorkbook();
    wb['Sources']!.headers = wb['Sources']!.headers.filter((h) => h !== 'Auteur');
    setCell(wb, 'Principes', 1, 'ID', 'P001');
    setCell(wb, 'Exercices', 1, 'ID', 'EX2');
    const messages = errors(run(wb).issues).map((i) => `${i.ref}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('colonne absente « Auteur »'),
        'P001: identifiant en double',
        expect.stringContaining('identifiant mal formé « EX2 »'),
      ]),
    );
  });

  it('warns on unknown sheets and columns', () => {
    const wb = makeWorkbook();
    wb['Notes'] = { headers: ['x'], rows: [] };
    wb['Sources']!.headers.push('Commentaire');
    expect(warnings(run(wb).issues).map((i) => i.message)).toEqual([
      'feuille inconnue ignorée',
      'colonne inconnue ignorée « Commentaire »',
    ]);
  });
});

describe('validation', () => {
  it('reports broken references', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Principes', 0, 'Sources', 'S01, S99');
    setCell(wb, 'Exercices', 1, 'Prérequis', 'E404');
    setCell(wb, 'Étapes des programmes', 1, 'Habitude introduite', 'H77');
    const messages = errors(run(wb).issues).map((i) => `${i.ref}: ${i.message}`);
    expect(messages).toEqual([
      'P001: référence cassée « Sources » → S99',
      'E002: référence cassée « Prérequis » → E404',
      'PR1 J2: référence cassée « Habitude introduite » → H77',
    ]);
  });

  it('reports prerequisite cycles', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Exercices', 0, 'Prérequis', 'E002');
    expect(errors(run(wb).issues).map((i) => i.message)).toEqual([
      expect.stringContaining('cycle de prérequis'),
    ]);
  });

  it('reports a program whose steps do not match its duration', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Programmes', 0, 'Durée (jours)', 3);
    expect(errors(run(wb).issues)).toEqual([
      expect.objectContaining({ ref: 'PR1', message: expect.stringContaining('manquants : 3') }),
    ]);
  });

  it('warns when the step principle is not a principle of the main exercise', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Étapes des programmes', 0, 'Principe', 'P001');
    setCell(wb, 'Exercices', 0, 'Principes', 'P002');
    const issues = run(wb).issues;
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual([
      expect.objectContaining({
        ref: 'PR1 J1',
        message: expect.stringContaining("le principe de l'étape fait foi"),
      }),
    ]);
  });

  it('warns on long minimal exercises and unpublished references', () => {
    const wb = makeWorkbook();
    setCell(wb, 'Exercices', 2, 'Durée (min)', 15);
    setCell(wb, 'Habitudes', 0, 'Statut', 'En relecture');
    const messages = warnings(run(wb).issues).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('de 15 min'),
        expect.stringContaining("habitude H01 n'est pas publié (review)"),
      ]),
    );
  });
});

describe('sql', () => {
  it('escapes literals', () => {
    expect(literal("l'objectif")).toBe("'l''objectif'");
    expect(literal(null)).toBe('null');
    expect(literal(12)).toBe('12');
    expect(literal(sqlArray([], 'public.persona[]'))).toBe("'{}'::public.persona[]");
    expect(literal(sqlArray(['employee'], 'public.persona[]'))).toBe(
      "array['employee']::public.persona[]",
    );
  });

  it('generates deterministic SQL with link rows and positions', () => {
    const { sql } = run();
    expect(sql).toBe(run().sql);
    expect(sql).toContain("('E001', 'P002', 1),\n  ('E001', 'P001', 2)");
    expect(sql).toContain("('E002', 'E001')");
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });
});
