// Lighthouse CI in two phases: the collection is retried when Lighthouse itself crashes (e.g.
// NO_NAVSTART with headless Chrome on shared CI machines), the score assertions run once on a
// complete collection. A real score below the thresholds still fails at once.
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LHCI = ['--yes', '@lhci/cli@0.16.1'];
const CONFIG = '--config=lighthouserc.cjs';
const ATTEMPTS = 3;

const run = (command) =>
  spawnSync('npx', [...LHCI, command, CONFIG], { stdio: 'inherit' }).status === 0;

let collected = false;
for (let attempt = 1; attempt <= ATTEMPTS && !collected; attempt++) {
  rmSync('.lighthouseci', { recursive: true, force: true });
  console.log(`\nLighthouse : collecte, essai ${attempt}/${ATTEMPTS}`);
  collected = run('collect');
}
if (!collected) {
  console.error(`Lighthouse : collecte impossible après ${ATTEMPTS} essais`);
  process.exit(1);
}
const asserted = run('assert');
run('upload');
process.exit(asserted ? 0 : 1);
