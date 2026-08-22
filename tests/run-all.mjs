// Aggregate runner: executes every suite in sequence, fails fast on any
// regression. Usage: node tests/run-all.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = [
  ['core-selftest', 'run-core-tests.mjs'],
  ['interaction-smoke', 'smoke-interaction.mjs'],
  ['layout-viewport', 'layout-viewport.mjs'],
  ['solver-sim-150', 'solver-sim.mjs', ['150']],
];

let failures = 0;
for (const [name, file, args = []] of suites) {
  const r = spawnSync(process.execPath, [path.join(here, file), ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    failures++;
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
  }
}

console.log(failures === 0 ? '\nALL SUITES GREEN' : `\n${failures} SUITE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
