// CLI:
//   node scripts/import-catalog/index.ts [--input data/catalogue.xlsx] [--output supabase/seed.sql]
//     Local seed: writes supabase/seed.sql (then `supabase db reset`).
//   node scripts/import-catalog/index.ts --target local|recette|production [--apply] [--confirm-production]
//     Update of an existing database (upsert): shows the differences (simulation by default),
//     writes them in one transaction with --apply. Never deletes content: content missing from
//     the workbook is set to 'retired'. Running it twice writes nothing the second time.
//     Database URL: SUPABASE_DB_URL in .env.<target> (not needed for local).
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import postgres from 'postgres';

import { importCatalog, formatIssue } from './import.ts';
import { catalogTables } from './sql.ts';
import { diffCatalog, formatDiff, hasChanges, upsertSql, type CurrentRows } from './upsert.ts';

const root = resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
  options: {
    input: { type: 'string', default: 'data/catalogue.xlsx' },
    output: { type: 'string', default: 'supabase/seed.sql' },
    target: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'confirm-production': { type: 'boolean', default: false },
  },
});

const input = resolve(root, values.input);
const result = await importCatalog(input, relative(root, input));
const errors = result.issues.filter((i) => i.level === 'error');
const warnings = result.issues.filter((i) => i.level === 'warning');

for (const w of warnings) console.warn(`⚠️  ${formatIssue(w)}`);
for (const e of errors) console.error(`❌ ${formatIssue(e)}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} erreur(s) : rien n'a été écrit.`);
  process.exit(1);
}

if (values.target === undefined) {
  const output = resolve(root, values.output);
  await writeFile(output, result.sql);
  const c = result.catalog;
  console.log(`\n✅ ${relative(root, output)} écrit (${warnings.length} avertissement(s)).`);
  console.table({
    sources: c.sources.length,
    principles: c.principles.length,
    exercises: c.exercises.length,
    habit_templates: c.habitTemplates.length,
    programs: c.programs.length,
    program_steps: c.programSteps.length,
  });
  process.exit(0);
}

// ---- Update of an existing database -------------------------------------------------------
const target = values.target;
if (!['local', 'recette', 'production'].includes(target)) {
  console.error('--target doit valoir local, recette ou production.');
  process.exit(1);
}
if (target === 'production' && values.apply && !values['confirm-production']) {
  console.error('Écriture en production : ajouter --confirm-production (après la recette).');
  process.exit(1);
}
let url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (target !== 'local') {
  const envFile = resolve(root, `.env.${target}`);
  if (!existsSync(envFile)) {
    console.error(`Fichier ${relative(root, envFile)} absent (voir .env.deploy.example).`);
    process.exit(1);
  }
  process.loadEnvFile(envFile);
  url = process.env.SUPABASE_DB_URL ?? '';
  if (!url) {
    console.error(`SUPABASE_DB_URL manquant dans .env.${target}.`);
    process.exit(1);
  }
}

const sql = postgres(url, {
  max: 1,
  ssl: target === 'local' ? false : 'require',
  onnotice: () => {},
});
const tables = catalogTables(result.catalog);
const readCurrent = async (): Promise<CurrentRows> => {
  const current: CurrentRows = {};
  for (const t of tables) {
    const rows = await sql.unsafe(
      `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from public.${t.table} t`,
    );
    current[t.table] = (rows[0]?.rows ?? []) as Record<string, unknown>[];
  }
  return current;
};

try {
  const diffs = diffCatalog(tables, await readCurrent());
  console.log(`\nCible : ${target}\n`);
  console.log(formatDiff(diffs));
  if (!hasChanges(diffs)) process.exit(0);
  if (!values.apply) {
    console.log("\nSimulation : rien n'a été écrit. Relancer avec --apply pour appliquer.");
    process.exit(0);
  }
  const statements = upsertSql(tables, diffs);
  await sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
  const after = diffCatalog(tables, await readCurrent());
  if (hasChanges(after)) {
    console.error("\n❌ Des différences subsistent après l'écriture :\n" + formatDiff(after));
    process.exit(1);
  }
  console.log(
    `\n✅ ${statements.length} instruction(s) appliquée(s) en une transaction ; base à jour.`,
  );
} finally {
  await sql.end();
}
