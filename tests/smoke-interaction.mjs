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
  flush(500); // elim flash (350ms) + completion
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
    flush(500);
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
    flush(500);
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

// ---- Scenario 7: combo pitch ladder evolves forever -------------------------
{
  const SM = sandbox.SoundManager;
  const freqs = [];
  for (let c = 1; c <= 60; c++) freqs.push(SM.noteForCombo(c));
  check('S7: all notes finite & in band', freqs.every((f) => isFinite(f) && f >= 500 && f <= 1800),
    `${Math.min(...freqs).toFixed(0)}-${Math.max(...freqs).toFixed(0)}Hz`);
  check('S7: never static between consecutive combos',
    freqs.every((f, i) => i === 0 || f !== freqs[i - 1]));
  const distinct = new Set(freqs).size;
  check('S7: rich variety', distinct >= 10, `${distinct} distinct over 60`);
  check('S7: deterministic ping-pong cycle', freqs[20] === freqs[20 + 18] && freqs[5] === freqs[5 + 18]);
}

console.log(failed === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
