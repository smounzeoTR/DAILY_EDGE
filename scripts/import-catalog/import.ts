import { normalizeCatalog } from './normalize.ts';
import { readWorkbook } from './read-workbook.ts';
import { buildSeedSql } from './sql.ts';
import type { Catalog, Issue, Workbook } from './types.ts';
import { validateCatalog } from './validate.ts';

export type ImportResult = { catalog: Catalog; issues: Issue[]; sql: string };

// Pure pipeline from parsed workbook (used by tests)
export function importWorkbook(workbook: Workbook, sourceFile: string): ImportResult {
  const { catalog, issues } = normalizeCatalog(workbook);
  const allIssues = [...issues, ...validateCatalog(catalog)];
  return { catalog, issues: allIssues, sql: buildSeedSql(catalog, { sourceFile }) };
}

export async function importCatalog(path: string, sourceFile: string): Promise<ImportResult> {
  return importWorkbook(await readWorkbook(path), sourceFile);
}

export function formatIssue(issue: Issue): string {
  return `[${issue.sheet}] ${issue.ref} : ${issue.message}`;
}
