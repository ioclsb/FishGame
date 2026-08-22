#!/usr/bin/env node
// Core-logic regression harness: runs the page's embedded self-test suite in
// a Node VM with a minimal browser stub. No browser required.
//
//   node tests/run-core-tests.mjs          # all groups
//   node tests/run-core-tests.mjs core     # single group
//
// Exits non-zero on any failed assertion.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'push-slide-match.html'), 'utf8');

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no <script> block found'); process.exit(1); }
const src = m[1];

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return null;
      if (p === 'measureText') return () => ({ width: 10 });
      return () => makeCtx();
    },
    set() { return true; },
  });
}

function fakeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 540 }),
    clientWidth: 540, clientHeight: 540,
    width: 300, height: 150,
    textContent: '',
    appendChild() {},
  };
  return el;
}

const sandbox = {
  console,
  performance,
  URLSearchParams,
  Math, JSON, Set, Map, Object, Array, Number, String, Boolean, Date, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.document = {
  getElementById: (id) => (sandbox.document._els[id] ??= fakeEl(id === 'board' ? 'canvas' : 'div')),
  _els: {},
  createElement: (tag) => fakeEl(tag),
  addEventListener() {},
  body: fakeEl('body'),
};
sandbox.location = { search: '' };
sandbox.navigator = {};
sandbox.devicePixelRatio = 1;
sandbox.innerWidth = 900;
sandbox.innerHeight = 950;
sandbox.visualViewport = null;
sandbox.addEventListener = () => {}; // no listeners fire in the harness
sandbox.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();
sandbox.requestAnimationFrame = () => 0;

vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'push-slide-match.html#inline' });

if (!sandbox.window || !sandbox.window.runSelfTest) {
  console.error('runSelfTest not exposed after evaluation');
  process.exit(1);
}

const which = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : 'all';
const result = sandbox.window.runSelfTest(which);
if (result.pass) {
  console.log(`SELFTEST PASS (${which}): ${result.count} assertions`);
  process.exit(0);
} else {
  console.error(`SELFTEST FAIL (${which}): ${result.failures.length} failures of ${result.count}`);
  for (const f of result.failures) console.error('  -', f);
  process.exit(1);
}
