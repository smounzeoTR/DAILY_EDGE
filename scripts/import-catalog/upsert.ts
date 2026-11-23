// Catalogue update of an existing database (pure): differences between the workbook and the
// current rows, then the SQL that applies them. Never deletes: content missing from the
// workbook is set to 'retired' (tables with a status), other missing rows are only reported.
import { literal, type SqlValue, type TableData } from './sql.ts';

export type CurrentRows = Record<string, Record<string, unknown>[]>;

export type Change = { column: string; from: unknown; to: unknown };
export type TableDiff = {
  table: string;
  created: SqlValue[][];
  updated: { key: string; row: SqlValue[]; changes: Change[] }[];
  // Missing from the workbook and not retired yet (status set to 'retired')
  retired: string[];
  // Missing from the workbook, kept as they are (link and step rows have no status)
  kept: string[];
};

// Workbook value -> the JSON shape of the same value read with to_jsonb()
function normalize(value: SqlValue | unknown): unknown {
  if (value === undefined) return null;
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'values' in value) {
    return (value as { values: string[] }).values;
  }
  return value;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(normalize(a) ?? null) === JSON.stringify(normalize(b) ?? null);

const keyOf = (key: string[], get: (column: string) => unknown) =>
  key.map((k) => String(get(k))).join('|');

export function diffTable(data: TableData, current: Record<string, unknown>[]): TableDiff {
  const index = (column: string) => data.columns.indexOf(column);
  const existing = new Map(current.map((row) => [keyOf(data.key, (c) => row[c]), row]));
  const seen = new Set<string>();
  const diff: TableDiff = { table: data.table, created: [], updated: [], retired: [], kept: [] };

  for (const row of data.rows) {
    const key = keyOf(data.key, (c) => row[index(c)]);
    seen.add(key);
    const before = existing.get(key);
    if (!before) {
      diff.created.push(row);
      continue;
    }
    const changes = data.columns
      .filter((column) => !same(row[index(column)], before[column]))
      .map((column) => ({ column, from: before[column], to: normalize(row[index(column)]) }));
    if (changes.length > 0) diff.updated.push({ key, row, changes });
  }

  const hasStatus = data.columns.includes('status');
  for (const [key, row] of existing) {
    if (seen.has(key)) continue;
    if (hasStatus) {
      if (row.status !== 'retired') diff.retired.push(key);
    } else {
      diff.kept.push(key);
    }
  }
  return diff;
}

export function diffCatalog(tables: TableData[], current: CurrentRows): TableDiff[] {
  return tables.map((t) => diffTable(t, current[t.table] ?? []));
}

export const hasChanges = (diffs: TableDiff[]) =>
  diffs.some((d) => d.created.length + d.updated.length + d.retired.length > 0);

// Statements applying the differences, parents first (run in one transaction)
export function upsertSql(tables: TableData[], diffs: TableDiff[]): string[] {
  const statements: string[] = [];
  tables.forEach((data, i) => {
    const diff = diffs[i];
    if (!diff) return;
    const rows = [...diff.created, ...diff.updated.map((u) => u.row)];
    if (rows.length > 0) {
      const updates = data.columns.filter((c) => !data.key.includes(c));
      const values = rows.map((row) => `(${row.map(literal).join(', ')})`).join(',\n  ');
      const onConflict =
        updates.length > 0
          ? `do update set ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}`
          : 'do nothing';
      statements.push(
        `insert into public.${data.table} (${data.columns.join(', ')}) values\n  ${values}\n` +
          `on conflict (${data.key.join(', ')}) ${onConflict};`,
      );
    }
    if (diff.retired.length > 0) {
      // Tables with a status have a single "id" key
      statements.push(
        `update public.${data.table} set status = 'retired' where id in (${diff.retired
          .map((id) => literal(id))
          .join(', ')});`,
      );
    }
  });
  return statements;
}

export function formatDiff(diffs: TableDiff[]): string {
  const lines: string[] = [];
  for (const d of diffs) {
    const total = d.created.length + d.updated.length + d.retired.length + d.kept.length;
    if (total === 0) continue;
    lines.push(
      `${d.table} : ${d.created.length} création(s), ${d.updated.length} modification(s), ` +
        `${d.retired.length} passage(s) en retired, ${d.kept.length} absent(s) conservé(s)`,
    );
    for (const row of d.created)
      lines.push(`  + ${String(row[0])}${row[1] !== undefined ? ` ${String(row[1])}` : ''}`);
    for (const u of d.updated) {
      for (const c of u.changes) {
        lines.push(
          `  ~ ${u.key}.${c.column} : ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`,
        );
      }
    }
    for (const id of d.retired) lines.push(`  - ${id} → retired`);
    for (const key of d.kept) lines.push(`  = ${key} (absent du fichier, conservé)`);
  }
  return lines.length > 0 ? lines.join('\n') : 'Aucune différence : la base est déjà à jour.';
}
