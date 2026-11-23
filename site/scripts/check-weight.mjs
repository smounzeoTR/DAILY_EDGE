// Fails when a built page weighs 500 KB or more, fonts excluded (spec § 10).
// Counts the HTML plus every local stylesheet, script and image it references, and the scripts
// those scripts import (statically or on demand).
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
  // Scripts also count what they import, statically or on demand (e.g. PostHog, loaded later)
  const queue = [...refs];
  for (let i = 0; i < queue.length; i++) {
    const ref = queue[i];
    if (!ref.endsWith('.js')) continue;
    try {
      const code = readFileSync(join(dist, ref), 'utf8');
      for (const m of code.matchAll(/["'`]\.\/([\w.\-]+\.js)["'`]/g)) {
        const child = join(ref, '..', m[1]);
        if (!refs.has(child)) {
          refs.add(child);
          queue.push(child);
        }
      }
    } catch {
      // Not a local file
    }
  }
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
