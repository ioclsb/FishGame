// Core-logic regression harness for the Mini Game port: runs the self-test
// suite against minigame/js/core.js directly (no browser, no wx needed).
//   node minigame/tests/run-core.mjs          # all groups
//   node minigame/tests/run-core.mjs undo     # single group
// Exits non-zero on any failed assertion.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(path.join(here, '../js/core.js')));

const which = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : 'all';
const result = core.runSelfTest(which);
if (result.pass) {
  console.log(`SELFTEST PASS (${which}): ${result.count} assertions`);
  process.exit(0);
} else {
  console.error(`SELFTEST FAIL (${which}): ${result.failures.length} failures of ${result.count}`);
  for (const f of result.failures) console.error('  -', f);
  process.exit(1);
}