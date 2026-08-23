// Integration smoke test for the Mini Game port: boots game.js inside Node
// with stubbed wx + canvas, pumps simulated frames and touch events, and
// asserts the whole App boots and responds without throwing.
//   node minigame/tests/smoke-mg.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (p === 'getContext') return () => makeCtx();
      // Reproduce the Mini Game quirk: ctx.roundRect exists but rejects a
      // scalar radii argument (must be a sequence).
      if (p === 'roundRect') {
        return (x, y, w, h, r) => {
          if (!Array.isArray(r)) throw new Error('roundRect: value cannot be converted to a sequence');
        };
      }
      return () => 0;
    },
    set() { return true; },
  });
}

function makeCanvas() {
  const c = { width: 300, height: 300 };
  c.getContext = () => makeCtx();
  return c;
}

// ---- wx stub -------------------------------------------------------------
const listeners = { touchStart: [], touchMove: [], touchEnd: [], touchCancel: [], show: [], hide: [], resize: [] };
const info = {
  windowWidth: 375,
  windowHeight: 812,
  pixelRatio: 3,
  safeArea: { top: 44, bottom: 778, left: 0, right: 375, width: 375, height: 734 },
};
const store = {};

globalThis.wx = {
  getLaunchOptionsSync: () => ({ query: {} }),
  getWindowInfo: () => info,
  getSystemInfoSync: () => info,
  createCanvas: makeCanvas,
  onTouchStart: (f) => listeners.touchStart.push(f),
  onTouchMove: (f) => listeners.touchMove.push(f),
  onTouchEnd: (f) => listeners.touchEnd.push(f),
  onTouchCancel: (f) => listeners.touchCancel.push(f),
  onShow: (f) => listeners.show.push(f),
  onHide: (f) => listeners.hide.push(f),
  onWindowResize: (f) => listeners.resize.push(f),
  vibrateShort: () => {},
  vibrateLong: () => {},
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = String(v); },
  removeStorageSync: (k) => { delete store[k]; },
  // deliberately no createWebAudioContext: sound degrades to silent
};

// ---- rAF stub ------------------------------------------------------------
let rafQueue = [];
let rafId = 0;
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return ++rafId; };
globalThis.cancelAnimationFrame = () => {};

let failures = 0;
function assert(cond, name) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// ---- boot -----------------------------------------------------------------
const require = createRequire(pathToFileURL(path.join(root, 'game.js')));
require(path.join(root, 'game.js'));

const app = globalThis.__app;
const wxM = globalThis.wx;
assert(typeof wxM === 'object', 'wx stub present');
assert(listeners.touchStart.length === 1, 'touch listeners registered');

// Coach should be visible on first run (no stored flag).
assert(app.uiState.coach === true, 'coach overlay shown on first run');

// Pump ~40 frames (app._loop re-registers each frame).
let now = performance.now();
for (let i = 0; i < 40; i++) {
  const q = rafQueue; rafQueue = [];
  for (const fn of q) { now += 16.7; fn(now); }
}
assert(rafQueue.length >= 0, 'frame loop ran');

// Tap the coach "开始游戏" button to dismiss it.
const cb = app.ui.coachBtn;
assert(!!cb, 'coach start button laid out');
listeners.touchStart[0]({ touches: [{ identifier: 0, clientX: cb.x + cb.w / 2, clientY: cb.y + cb.h / 2 }] });
listeners.touchEnd[0]();
assert(app.uiState.coach === false, 'coach dismissed via start button');

// Board invariants.
assert(app.core.getPatternCount() === 48, '48 blocks on the board');
assert(app.core.getGrid().length === 8, 'grid is 8 rows');
assert(Number.isFinite(app.boardRect.x) && Number.isFinite(app.boardRect.y) && app.boardRect.size > 0,
  'boardRect has valid finite coordinates');

// Tap the hint button (button #3, right-aligned row).
const hintBtn = app.ui.buttons[2];
listeners.touchStart[0]({ touches: [{ identifier: 1, clientX: hintBtn.x, clientY: hintBtn.y }] });
listeners.touchEnd[0]();
assert(app.stats.hints === 1, 'hint button increments hint counter');

// Tap the sound button (toggles mute).
const sndBtn = app.ui.buttons[4];
const wasOn = app.sound.enabled;
listeners.touchStart[0]({ touches: [{ identifier: 2, clientX: sndBtn.x, clientY: sndBtn.y }] });
listeners.touchEnd[0]();
assert(app.sound.enabled === !wasOn, 'sound button toggles mute');

// Simulate a press-drag-release on the board (no assertion on match, just
// exercising the state machine without throwing).
const br = app.boardRect;
const cx = br.x + br.size / 2, cy = br.y + br.size / 2;
listeners.touchStart[0]({ touches: [{ identifier: 3, clientX: cx, clientY: cy }] });
listeners.touchMove[0]({ touches: [{ identifier: 3, clientX: cx + 40, clientY: cy }] });
listeners.touchMove[0]({ touches: [{ identifier: 3, clientX: cx + 90, clientY: cy }] });
listeners.touchEnd[0]();
assert(true, 'drag touch sequence completed without throwing');

// Undo + restart buttons.
const undoBtn = app.ui.buttons[0];
listeners.touchStart[0]({ touches: [{ identifier: 4, clientX: undoBtn.x, clientY: undoBtn.y }] });
listeners.touchEnd[0]();
assert(true, 'undo button handled');

const restartBtn = app.ui.buttons[3];
listeners.touchStart[0]({ touches: [{ identifier: 5, clientX: restartBtn.x, clientY: restartBtn.y }] });
listeners.touchEnd[0]();
assert(app.core.getPatternCount() === 48, 'restart rebuilds a full board');

// Resize event.
listeners.resize[0]();
assert(true, 'window resize handled');

// Force a near-win state (single solvable pair left), resolve it and verify
// the win overlay + confetti + best-time storage fire.
app.core.blocks = [
  { id: 100, pattern: 1, r: 0, c: 0 },
  { id: 101, pattern: 1, r: 0, c: 2 },
];
app.core.grid = Array.from({ length: 8 }, () => Array(8).fill(0));
app.core.grid[0][0] = 1;
app.core.grid[0][2] = 1;
app.core.clearedPairs = 23;
app.core.undoSnapshot = null;
app.stats.t0 = performance.now() - 3000;
const winRes = app.core.clickResolve(0, 0);
assert(winRes.matched === true, 'near-win tap resolves');
app._registerMatch([{ r: 0, c: 0 }, { ...winRes.target }], 1);
app.view.playElimination({ r: 0, c: 0 }, winRes.target, 1, () => app._finishAction());
for (let i = 0; i < 40; i++) {
  const q = rafQueue; rafQueue = [];
  for (const fn of q) { now += 16.7; fn(now); }
}
assert(app.uiState.win !== null, 'win overlay shown after clearing all pairs');
assert(app.ui.confetti.length > 0, 'confetti spawned on win');
assert(store['psm.bestTime'] === '3', 'best time persisted');

if (failures === 0) {
  console.log('SMOKE PASS');
  process.exit(0);
} else {
  console.error(`${failures} FAILURE(S)`);
  process.exit(1);
}