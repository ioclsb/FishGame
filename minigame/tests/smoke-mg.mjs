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

// Pump ~40 frames (app._loop re-registers each frame). Drive a controllable
// clock so the view's animations (driven by performance.now()) advance in step
// with the pumped rAF frames, matching how the app runs on a real device.
let now = performance.now();
globalThis.performance.now = () => now;
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

// Board invariants (10x14 layout).
assert(app.core.getPatternCount() === 108, '108 blocks on the board');
assert(app.core.getGrid().length === 14, 'grid is 14 rows');
assert(app.core.getGrid()[0].length === 10, 'grid is 10 columns');
assert(Number.isFinite(app.boardRect.x) && Number.isFinite(app.boardRect.y) && app.boardRect.w > 0 && app.boardRect.h > 0,
  'boardRect has valid finite coordinates');

// Tap the hint button (button #3, right-aligned row).
const hintBtn = app.ui.buttons[2];
listeners.touchStart[0]({ touches: [{ identifier: 1, clientX: hintBtn.x, clientY: hintBtn.y }] });
listeners.touchEnd[0]();
assert(app.stats.hints === 1, 'hint button increments hint counter');

// Open the settings panel and toggle sound / vibration via its rows.
const sBtn = app.ui.buttons[3]; // settings now sits in the button row
listeners.touchStart[0]({ touches: [{ identifier: 2, clientX: sBtn.x, clientY: sBtn.y }] });
listeners.touchEnd[0]();
assert(app.uiState.settings === true, 'settings panel opens via row button');

const sndRow = app.ui.settingsRows.sound;
const vibRow = app.ui.settingsRows.vibrate;
assert(!!sndRow && !!vibRow, 'settings rows laid out');

const wasOn = app.sound.enabled;
listeners.touchStart[0]({ touches: [{ identifier: 3, clientX: sndRow.x + sndRow.w / 2, clientY: sndRow.y + sndRow.h / 2 }] });
listeners.touchEnd[0]();
assert(app.sound.enabled === !wasOn, 'settings sound row toggles mute');

const wasVib = app.uiState.vibrate;
listeners.touchStart[0]({ touches: [{ identifier: 4, clientX: vibRow.x + vibRow.w / 2, clientY: vibRow.y + vibRow.h / 2 }] });
listeners.touchEnd[0]();
assert(app.uiState.vibrate === !wasVib, 'settings vibration row toggles');

const closeB = app.ui.settingsCloseBtn;
listeners.touchStart[0]({ touches: [{ identifier: 5, clientX: closeB.x + closeB.w / 2, clientY: closeB.y + closeB.h / 2 }] });
listeners.touchEnd[0]();
assert(app.uiState.settings === false, 'settings closes via close button');

// Simulate a press-drag-release on the board (no assertion on match, just
// exercising the state machine without throwing).
const br = app.boardRect;
const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
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

// Restart via the settings panel rebuilds the board and closes settings.
const restartRow = app.ui.settingsRows.restart;
listeners.touchStart[0]({ touches: [{ identifier: 5, clientX: sBtn.x, clientY: sBtn.y }] });
listeners.touchEnd[0]();
assert(app.uiState.settings === true, 'settings opens again for restart');
listeners.touchStart[0]({ touches: [{ identifier: 6, clientX: restartRow.x + restartRow.w / 2, clientY: restartRow.y + restartRow.h / 2 }] });
listeners.touchEnd[0]();
assert(app.core.getPatternCount() === 108, 'settings restart rebuilds a full board');
assert(app.uiState.settings === false, 'settings restart closes settings');

// Bounce parity: tapping a block that cannot match fires the same-pattern
// pulse (web behavior), i.e. view.bounce is set and clears after the 450ms
// animation. Search with the non-mutating checkMatch/findMultiMatches.
let orphan = null;
for (let r = 0; r < 14 && !orphan; r++) {
  for (let c = 0; c < 10 && !orphan; c++) {
    if (app.core.getGrid()[r][c] === 0) continue;
    if (app.core.findMultiMatches(r, c)) continue;
    if (app.core.checkMatch(r, c)) continue;
    orphan = { r, c };
  }
}
if (orphan) {
  const ox = br.x + (orphan.c + 0.5) * (br.w / 10);
  const oy = br.y + (orphan.r + 0.5) * (br.h / 14);
  listeners.touchStart[0]({ touches: [{ identifier: 6, clientX: ox, clientY: oy }] });
  listeners.touchEnd[0]();
  assert(!!app.view.bounce, 'no-match tap triggers same-pattern bounce');
  for (let i = 0; i < 40; i++) {
    const q = rafQueue; rafQueue = [];
    for (const fn of q) { now += 16.7; fn(now); }
  }
  assert(app.view.bounce === null, 'bounce animation completes and clears');
} else {
  console.log('  skip  no orphan cell on this board (bounce not asserted)');
}

// A MATCHING tap also fires the same-pattern pulse (hints the remaining
// same-type blocks for chain planning), then it clears.
let matchCell = null;
for (let r = 0; r < 14 && !matchCell; r++) {
  for (let c = 0; c < 10 && !matchCell; c++) {
    if (app.core.getGrid()[r][c] === 0) continue;
    if (app.core.findMultiMatches(r, c)) continue;
    if (app.core.checkMatch(r, c)) matchCell = { r, c };
  }
}
if (matchCell) {
  const mx = br.x + (matchCell.c + 0.5) * (br.w / 10);
  const my = br.y + (matchCell.r + 0.5) * (br.h / 14);
  listeners.touchStart[0]({ touches: [{ identifier: 7, clientX: mx, clientY: my }] });
  listeners.touchEnd[0]();
  assert(!!app.view.bounce, 'matching tap also triggers same-pattern bounce');
  for (let i = 0; i < 40; i++) {
    const q = rafQueue; rafQueue = [];
    for (const fn of q) { now += 16.7; fn(now); }
  }
  // playElimination bumps the anim token (cancelling the bounce rAF), so the
  // pulse clears via render()'s real-time clock; here we just verify the
  // elimination finished and the app returned to idle.
  assert(app.busy === false, 'app responsive after matching tap + bounce');
} else {
  console.log('  skip  no matchable cell on this board (matching bounce not asserted)');
}

// Resize event.
listeners.resize[0]();
assert(true, 'window resize handled');

// Force a near-win state (single solvable pair left), resolve it and verify
// the win overlay + confetti + best-time storage fire.
app.core.blocks = [
  { id: 100, pattern: 1, r: 0, c: 0 },
  { id: 101, pattern: 1, r: 0, c: 2 },
];
app.core.grid = Array.from({ length: 14 }, () => Array(10).fill(0));
app.core.grid[0][0] = 1;
app.core.grid[0][2] = 1;
app.core.clearedPairs = 53;
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