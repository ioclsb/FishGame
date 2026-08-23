// Interaction smoke tests: drive the real input -> view -> core pipeline in
// the VM harness (virtual clock + manual rAF pump) and assert the state
// machine never wedges.
//
//   node tests/smoke-interaction.mjs
import { createHarness } from './lib/load-game.mjs';

const { sandbox, flush, fire, centerPx, G, el, app } = createHarness();

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name}`); failed++; }
}

const DIRS = sandbox.GameCore.DIRS;

// Under SMOKE_DEBUG, record every core mutation call so a missed drag can be
// post-mortemed (inputs vs the pure-logic prediction).
const coreLog = [];
if (process.env.SMOKE_DEBUG) {
  for (const name of ['resolve', 'clickResolve', 'resolvePair', 'applySlide', 'revertSlide']) {
    const orig = sandbox.GameCore.prototype[name];
    sandbox.GameCore.prototype[name] = function (...args) {
      const t0 = performance.now();
      let pre = '';
      if (name === 'resolvePair') {
        const [r, c, tr, tc] = args;
        const ab = this.findBlockByPos(r, c);
        const bb = this.findBlockByPos(tr, tc);
        pre = JSON.stringify({
          gridRC: this.grid[r][c], gridTC: this.grid[tr][tc],
          aBlock: ab && { id: ab.id, p: ab.pattern }, bBlock: bb && { id: bb.id, p: bb.pattern },
        });
      }
      const r = orig.apply(this, args);
      coreLog.push([name,
        `${Math.round(performance.now() - t0)}ms@${Math.round(t0)}`,
        pre,
        `cleared=${this.getClearedPairs()}`,
        JSON.stringify(r && typeof r === 'object' ? { m: r.match ?? r.matched } : r)]);
      if (coreLog.length > 12) coreLog.shift();
      return r;
    };
  }
}

// Drive one hint-based drag match to completion (handles the legal
// multi-choice overlay branch). `observe()` is sampled every frame during
// the settle window so tests can catch transient states like shake.
function steps(h, ms, observe) {
  const n = Math.max(1, Math.ceil(ms / 16.7));
  for (let i = 0; i < n; i++) { flush(16.7); if (observe) observe(); }
}
function hintDrag(h, observe) {
  const a = h.app();
  const hint = a.core.findHint();
  if (!hint) return false;
  const blk = a.core.getBlocks().find((b) => b.id === hint.blockId);
  const d = DIRS[hint.dir];
  const start = h.centerPx(blk.r, blk.c);
  const end = {
    x: start.x + d.dc * G.pitch * hint.dist,
    y: start.y + d.dr * G.pitch * hint.dist,
  };
  fire(h.el('board'), 'pointerdown', { pointerId: 21, clientX: start.x, clientY: start.y });
  const pdPress = a.press ? { r: a.press.r, c: a.press.c } : null;
  steps(h, 20);
  fire(h.el('board'), 'pointermove', { pointerId: 21, clientX: end.x, clientY: end.y });
  const midState = {    press: !!a.press,
    axis: a.press ? a.press.axis : null,
    dir: a.press ? a.press.dir : null,
    maxDist: a.press ? a.press.maxDist : null,
    drag: !!a.view.drag,
    busy: a.busy,
  };
  steps(h, 40);
  fire(h.el('board'), 'pointerup', { pointerId: 21 });
  // pure-logic prediction of the outcome straight from the live board
  const predicted = a.core.simulateSlide(a.core.getPushGroup(blk.r, blk.c, hint.dir), hint.dir, hint.dist, (ar, ac, ov) => a.core.checkMatch(ar, ac, ov));
  let sawPick = false;
  const prevObs = observe;
  const obs2 = () => { if (a.picking || a.view.pick) sawPick = true; if (prevObs) prevObs(); };
  steps(h, 170, obs2); // snap tween; multi-choice may open here
  const clrMid = a.core.getClearedPairs();
  const gridMid = a.core.getGrid().map((r) => r.join('')).join('/');
  if (a.picking) {
    const t = a.picking.targets[0];
    const tp = h.centerPx(t.r, t.c);
    fire(h.el('board'), 'pointerdown', { pointerId: 22, clientX: tp.x, clientY: tp.y });
  }
  const clrBefore = a.core.getClearedPairs();
  // full settle timeline: when does the pick overlay appear, when does the
  // clear land, did we tap a target?
  const tl = { pickOpenAt: -1, clearAt: -1, tapped: false };
  let frameIdx = 0;
  const prevObs2 = obs2;
  const obs3 = () => {
    frameIdx++;
    if (tl.pickOpenAt < 0 && (a.picking || a.view.pick)) tl.pickOpenAt = frameIdx;
    if (tl.clearAt < 0 && a.core.getClearedPairs() > clrBefore) tl.clearAt = frameIdx;
    if (prevObs2) prevObs2();
  };
  steps(h, 170, obs3); // snap tween; multi-choice may open here
  if (a.picking) {
    tl.tapped = true;
    const t = a.picking.targets[0];
    const tp = h.centerPx(t.r, t.c);
    fire(h.el('board'), 'pointerdown', { pointerId: 22, clientX: tp.x, clientY: tp.y });
  }
  steps(h, 750, obs3); // hit-stop + elim flash + completion
  const expectedDelta = predicted ? 1 : 0;
  if (process.env.SMOKE_DEBUG &&
      (a.core.getClearedPairs() !== clrBefore + expectedDelta ||
       (tl.pickOpenAt >= 0 && !tl.tapped))) {
    console.error('DRAG-MISS', JSON.stringify({
      hint: { dir: hint.dir, dist: hint.dist, blk: { r: blk.r, c: blk.c } },
      predicted: predicted && { r: predicted.r, c: predicted.c },
      midState, clrMid,
      clearedNow: a.core.getClearedPairs(), tl,
      streakEnd: a.streak,
      gridNow: a.core.getGrid().map((r) => r.join('')).join('/'),
    }));
    for (const e of coreLog) console.error('   core:', e.join(' | '));
    const logs = sandbox.__LOGS || [];
    console.error('   page-log tail:');
    for (const entry of logs.slice(-14)) {
      console.error('    ', JSON.stringify(entry));
    }
  }
  return true;
}
const H = { app, flush, fire, el, centerPx };

// ---- Scenario 1: drag-to-match via a hint ---------------------------------
{
  const a = app();
  const hint = a.core.findHint();
  check('S1: initial board has a hint', !!hint);
  if (!hint) process.exit(1);

  // locate the hinted block's live cell
  const blk = a.core.getBlocks().find((b) => b.id === hint.blockId);
  const d = DIRS[hint.dir];
  const start = centerPx(blk.r, blk.c);
  const end = {
    x: start.x + d.dc * G.pitch * hint.dist,
    y: start.y + d.dr * G.pitch * hint.dist,
  };

  const before = a.core.getPatternCount();
  fire(el('board'), 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  flush(20);
  fire(el('board'), 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  flush(40);
  check('S1: drag started and follows', !!a.view.drag && a.view.drag.offsetPx > 0);
  fire(el('board'), 'pointerup', { pointerId: 1 });
  flush(250); // snap tween (~120ms)
  check('S1: drag cleared after snap', a.view.drag === null);
  if (a.picking) {
    // Drag landed where A matches on BOTH axes -> pick overlay is legal.
    console.log('  --  S1: multi-choice surfaced, choosing first target');
    const t = a.picking.targets[0];
    const tp = centerPx(t.r, t.c);
    fire(el('board'), 'pointerdown', { pointerId: 9, clientX: tp.x, clientY: tp.y });
    flush(600);
  }
  flush(900); // hit-stop + elim flash + completion
  check('S1: elimination applied', a.core.getClearedPairs() === 1);
  check('S1: two blocks removed', a.core.getPatternCount() === before - 2);
  check('S1: busy released', a.busy === false);
  check('S1: consistency holds', a.core.consistencyCheck().length === 0);
  check('S1: combo streak counted', a.streak === 1);
}

// ---- Scenario 2: tap-to-match (no drag movement) ---------------------------
{
  const a = app();
  a.restart();
  flush(600); // entrance stagger

  // find a block whose ray-cast already hits a same-pattern partner
  let target = null;
  for (const b of a.core.getBlocks()) {
    if (a.core.findMultiMatches(b.r, b.c)) continue; // pick overlay path
    if (a.core.checkMatch(b.r, b.c)) { target = b; break; }
  }
  if (!target) {
    console.log('  --  S2 skipped: no direct pair on this layout');
  } else {
    const p = centerPx(target.r, target.c);
    const before = a.core.getPatternCount();
    fire(el('board'), 'pointerdown', { pointerId: 2, clientX: p.x, clientY: p.y });
    fire(el('board'), 'pointerup', { pointerId: 2 });
    flush(900);
    check('S2: tap eliminated the pair', a.core.getClearedPairs() === 1);
    check('S2: blocks removed', a.core.getPatternCount() === before - 2);
    check('S2: busy released', a.busy === false);
    check('S2: no ghosts', a.core.consistencyCheck().length === 0);
  }
}

// ---- Scenario 3: undo restores a tap elimination ----------------------------
{
  const a = app();
  a.restart(); flush(600);

  let target = null;
  for (const b of a.core.getBlocks()) {
    if (a.core.findMultiMatches(b.r, b.c)) continue;
    if (a.core.checkMatch(b.r, b.c)) { target = b; break; }
  }
  if (!target) {
    console.log('  --  S3 skipped: no direct pair on this layout');
  } else {
    const count0 = a.core.getPatternCount();
    const p = centerPx(target.r, target.c);
    fire(el('board'), 'pointerdown', { pointerId: 3, clientX: p.x, clientY: p.y });
    fire(el('board'), 'pointerup', { pointerId: 3 });
    flush(900);
    check('S3: undo available', a.core.canUndo());
    fire(el('btnUndo'), 'click');
    flush(50);
    check('S3: board restored', a.core.getPatternCount() === count0 && a.core.getClearedPairs() === 0);
    check('S3: single-step undo exhausted', !a.core.canUndo());
    check('S3: overlay hidden again', el('winOverlay').classList.contains('hidden'));
  }
}

// ---- Scenario 4: shuffle keeps an invariant board and clears stuck state ----
{
  const a = app();
  a.restart(); flush(600);
  const before = a.core.getPatternCount();
  fire(el('btnShuffle'), 'click');
  flush(50);
  check('S4: shuffle keeps all blocks', a.core.getPatternCount() === before);
  check('S4: shuffled board has a move', a.core.findHint() !== null);
  check('S4: consistency holds', a.core.consistencyCheck().length === 0);
  check('S4: busy released', a.busy === false);
}

// ---- Scenario 5: empty-cell press cannot wedge input ------------------------
{
  const a = app();
  a.restart(); flush(600);
  // find an empty cell
  let er = null, ec = null;
  outer:
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (a.core.getGrid()[r][c] === 0) { er = r; ec = c; break outer; }
  }
  check('S5: board has an empty cell', er !== null);
  if (er !== null) {
    const p = centerPx(er, ec);
    fire(el('board'), 'pointerdown', { pointerId: 4, clientX: p.x, clientY: p.y });
    check('S5: busy while pressed', a.busy === true);
    fire(el('board'), 'pointerup', { pointerId: 4 });
    check('S5: busy released after release', a.busy === false);
    // a normal match still works afterwards
    const hint = a.core.findHint();
    check('S5: game still playable', !!hint);
  }
}

// ---- Scenario 6: no rebake leak over long idle ------------------------------
{
  const a = app();
  a.restart(); flush(600);
  const s = sandbox.RenderView._stats;
  const before = `${s.tiles}/${s.creatures}/${s.bgs}`;
  flush(600 * 16.7); // ~10s idle at 60fps
  const after = `${s.tiles}/${s.creatures}/${s.bgs}`;
  check('S6: zero bakes across 600 idle frames', before === after, `${before} -> ${after}`);
  check('S6: fps sampler alive', s.fps > 0 || s.frames >= 60);
  // and a resize must NOT rebake when dimensions end up unchanged
  const pre = `${s.tiles}/${s.creatures}/${s.bgs}`;
  a.maybeRelayout(540, 540); // same box as the harness default
  a.view.relayout();
  const post = `${s.tiles}/${s.creatures}/${s.bgs}`;
  check('S6: no-op relayout does not rebake sprites/bg', pre === post, `${pre} -> ${post}`);
}

// ---- Scenario 7: fixed combo note with 3-tier punch scaling ----------------
{
  const SM = sandbox.SoundManager;
  check('S7: fixed match base is finite & in a pleasant band',
    isFinite(SM.MATCH_BASE) && SM.MATCH_BASE >= 400 && SM.MATCH_BASE <= 900,
    `${SM.MATCH_BASE}Hz`);
  const tiers = [1, 2, 3, 4, 10].map((c) => SM.tierForStreak(c));
  check('S7: punch tiers map 1,2,3 and cap at 3', tiers.join(',') === '1,2,3,3,3',
    `tiers=${tiers.join(',')}`);
  check('S7: sub-1 streak clamps to tier 1', SM.tierForStreak(0) === 1);
  check('S7: pitch ladder removed (constant note, not per-combo pitches)',
    !('COMBO_LADDER' in SM) && !('noteForCombo' in SM));
}

// ---- Scenario 8: hit-stop engages on match and releases cleanly -------------
{
  const a = app();
  a.restart(); flush(600);
  let sawFreeze = false;
  const obs = () => { if (a.view.freezeUntil > 0) sawFreeze = true; };
  hintDrag(H, obs);
  check('S8: hit-stop armed during elimination', sawFreeze);
  check('S8: hit-stop released afterwards', a.view.freezeUntil === 0);
  check('S8: match completed', a.core.getClearedPairs() >= 1 && a.busy === false);
  // choreography fully delivered (particles/floaters may legally outlive it)
  check('S8: effects scheduled all fired', a.view.pendingFx.length === 0);
}

// ---- Scenario 9: shake only when earned (combo>=3) ---------------------------
{
  const a = app();
  a.restart(); flush(600);
  const beforePairs = a.core.getClearedPairs();
  let maxAmp = 0;
  const obs = () => { if (a.view.shake) maxAmp = Math.max(maxAmp, a.view.shake.amp); };
  hintDrag(H); // combo x1
  check('S9: streak is 1 after first chain', a.streak === 1, `got ${a.streak}`);
  hintDrag(H, obs); // quick second -> combo x2
  check('S9: streak reached 2', a.streak === 2, `got ${a.streak}`);
  check('S9: no shake at combo x2', maxAmp === 0);
  hintDrag(H, obs); // third -> combo x3
  check('S9: streak reached 3', a.streak === 3, `got ${a.streak}`);
  check('S9: shake engaged at combo x3', maxAmp > 0, `amp=${maxAmp.toFixed(1)}`);
  check('S9: eliminations accumulated', a.core.getClearedPairs() - beforePairs === 3);
}

// ---- Scenario 10: combo floater replaces the toast at combo x2 ---------------
{
  const a = app();
  a.restart(); flush(600);
  hintDrag(H);
  hintDrag(H);
  check('S10: floater exists at combo x2', a.view.floaters.length >= 1,
    `[${a.view.floaters.map((f) => f.text).join(',')}]`);
  check('S10: floater shows the combo count',
    a.view.floaters.length > 0 && a.view.floaters[0].text === '连击 ×2');
}

// ---- Scenario 11: streak survives long pauses (no time decay) ---------------
{
  const a = app();
  a.restart(); flush(600);
  hintDrag(H);
  check('S11: streak 1 before pause', a.streak === 1);
  flush(5000); // think about the next move for five whole seconds
  hintDrag(H);
  check('S11: streak continues after long pause', a.streak === 2, `got ${a.streak}`);
}

// ---- Scenario 12: edge floaters stay visible (incl. rise animation) ---------
{
  const a = app();
  a.restart(); flush(600);
  const s = G.size;
  // spawn at all four extreme corners with a long label and big tier
  const corners = [
    [3, 3], [s - 3, 3], [3, s - 3], [s - 3, s - 3],
  ];
  for (const [x, y] of corners) {
    a.view.floaters.push({ x, y, text: '连击 ×99', t: 0, life: 0.95, size: G.cell * 0.5 });
  }
  let worst = Infinity;
  for (let i = 0; i < 57; i++) { // full life at ~60fps
    flush(16.7);
    for (const f of a.view.floaters) {
      if (f.t >= f.life) continue;
      const L = a.view._floaterLayout(f);
      const distToEdge = Math.min(L.x, L.y, s - L.x, s - L.y);
      worst = Math.min(worst, distToEdge);
    }
  }
  check('S12: clamped floaters never leave the board', worst >= 6, `closest ${worst.toFixed(1)}px`);
}

console.log(failed === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
