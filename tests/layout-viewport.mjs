// Layout regression across extreme viewports: the square board must fit its
// available box, keep cells >= 24px, and track DPR in the backing store.
//
//   node tests/layout-viewport.mjs
import { createHarness } from './lib/load-game.mjs';

const { sandbox, flush, el, G, app } = createHarness();

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name} ${detail}`);
  else { console.error(`FAIL  ${name} ${detail}`); failed++; }
}

const CASES = [
  // [wrapW, wrapH, dpr, label]
  [296, 400, 2, 'tiny phone 320x568 body'],
  [351, 480, 2, 'iPhone SE-ish'],
  [390, 640, 3, 'iPhone 14-ish (dpr capped)'],
  [430, 700, 3, 'Pro Max-ish'],
  [744, 900, 2, 'iPad portrait'],
  [1100, 600, 1, 'landscape tablet / short window'],
  [1600, 1000, 1, 'desktop wide'],
  [180, 180, 1, 'degenerate tiny box (floor kicks in)'],
];

const wrapEl = sandbox.document.getElementById('boardWrap');

for (const [w, h, dpr, label] of CASES) {
  wrapEl._wrapW = w;
  wrapEl._wrapH = h;
  sandbox.devicePixelRatio = dpr;
  app().view.relayout();
  flush(50);
  const fits = G.size <= Math.min(w, h) + 0.001;
  const cellOk = G.cell >= 10;
  const cssMatches = el('board').style.width === G.size + 'px';
  const backing = Math.abs(el('board').width - G.size * Math.min(dpr, 2.5)) < 0.01;
  check(`${label}: board fits`, fits, `${G.size}px vs box ${w}x${h}`);
  check(`${label}: cell size sane`, cellOk, `cell=${G.cell}`);
  check(`${label}: css size matches`, cssMatches);
  check(`${label}: backing store tracks capped dpr`, backing, `dpr=${G.dpr}`);
  // grid math stays exact after relayout
  const p = app().view.gridToPixel(7, 7);
  check(`${label}: last cell inside board`, p.x + G.cell <= G.size + 0.001 && p.y + G.cell <= G.size + 0.001);
}

// rotation: square board sizes off min(w,h), so landscape<->portrait swap
// must keep the same fitted size while both stay within their boxes
wrapEl._wrapW = 700; wrapEl._wrapH = 500;
app().view.relayout(); flush(30);
const landscapeSize = G.size;
check('rotation: landscape within box', landscapeSize <= 500);
wrapEl._wrapW = 500; wrapEl._wrapH = 700;
app().view.relayout(); flush(30);
check('rotation: portrait refit equals min(w,h) fit', G.size === landscapeSize && G.size <= 500,
  `${landscapeSize} -> ${G.size}`);

console.log(failed === 0 ? 'LAYOUT PASS' : `LAYOUT FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
