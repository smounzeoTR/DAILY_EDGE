// CLI: node scripts/import-catalog/index.ts [--input data/catalogue.xlsx] [--output supabase/seed.sql]
import { writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { importCatalog, formatIssue } from './import.ts';

const root = resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
  options: {
    input: { type: 'string', default: 'data/catalogue.xlsx' },
    output: { type: 'string', default: 'supabase/seed.sql' },
  },
});

const input = resolve(root, values.input);
const output = resolve(root, values.output);

const result = await importCatalog(input, relative(root, input));
const errors = result.issues.filter((i) => i.level === 'error');
const warnings = result.issues.filter((i) => i.level === 'warning');

for (const w of warnings) console.warn(`⚠️  ${formatIssue(w)}`);
for (const e of errors) console.error(`❌ ${formatIssue(e)}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} erreur(s) : seed.sql n'a pas été écrit.`);
  process.exit(1);
}

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
