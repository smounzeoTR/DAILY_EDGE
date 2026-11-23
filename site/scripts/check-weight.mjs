// Fails when a built page weighs 500 KB or more, fonts excluded (spec § 10).
// Counts the HTML plus every local stylesheet, script and image it references.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const limit = 500 * 1024;
const fontExt = /\.(woff2?|ttf|otf)$/i;

const pages = readdirSync(dist, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.html'));

let failed = false;
for (const page of pages) {
  const html = readFileSync(join(dist, page), 'utf8');
  const refs = new Set(
    [...html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)]
      .map((m) => m[1])
      .filter((ref) => !fontExt.test(ref)),
  );
  let total = Buffer.byteLength(html);
  for (const ref of refs) {
    try {
      const file = join(dist, ref);
      if (statSync(file).isFile()) total += statSync(file).size;
    } catch {
      // Not a local file (page link): ignored
    }
  }
  const kb = (total / 1024).toFixed(1);
  const ok = total < limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} /${page} ${kb} KB`);
}

if (pages.length === 0) {
  console.error('No built page: run astro build first');
  process.exit(1);
}
if (failed) process.exit(1);
