// Deep test of the hint / no-solution (deadlock) logic.
//
// The game supports point-slide: a drag may release at ANY cell 1..maxDist,
// so a match can exist at an intermediate stop even when the max-distance
// stop misses. findHint must find those moves, and "no hint" must mean "no
// legal move exists".
//
//   node tests/find-hint.mjs
import { createHarness } from './lib/load-game.mjs';

const { sandbox } = createHarness();
const Core = sandbox.GameCore;
const ROWS = 8, COLS = 8;

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`); failed++; }
}

// Build a board from explicit placements: [[r, c, pattern]...]. Non-listed
// cells stay empty.
function coreWith(entries) {
  const c = new Core();
  c.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  c.blocks = [];
  c.clearedPairs = 0;
  c.nextId = 1;
  for (const [r, cc, p] of entries) {
    c.grid[r][cc] = p;
    c.blocks.push({ id: c.nextId++, pattern: p, r, c: cc });
  }
  return c;
}

// Brute-force oracle: does ANY legal move eliminate a pair? Checks every tap
// (clickResolve-style, same-pattern on a clear ray) and every slide (applies
// applySlide then checkMatch on the live board, reverting afterwards).
// Independent of findHint/simulateSlide.
function anyMove(c) {
  for (const block of c.blocks) {
    if (c.checkMatch(block.r, block.c)) return true; // tap move
    for (const dir of Object.keys(Core.DIRS)) {
      const group = c.getPushGroup(block.r, block.c, dir);
      if (!group) continue;
      const maxDist = c.getMaxSlideDistance(group, dir);
      for (let dist = 1; dist <= maxDist; dist++) {
        // applySlide mutates the block coords in place, so capture the origin
        // BEFORE sliding and check A's final cell from that origin.
        const fromR = block.r, fromC = block.c;
        const d = Core.DIRS[dir];
        const moved = c.applySlide(group, dir, dist);
        const hit = c.checkMatch(fromR + d.dr * dist, fromC + d.dc * dist);
        c.revertSlide(moved);
        if (hit) return true;
      }
    }
  }
  return false;
}

// ---- F1: findHint finds an intermediate-distance (point-slide) match ------
{
  // Column 0 is fully packed (rows 0-7) so A cannot slide vertically; the
  // only possible moves are A sliding RIGHT. A(4,0)p1, empties (4,1..3),
  // stop (4,4)=p9 -> maxDist 3. dist=1 lands A at (4,1) whose up-ray hits
  // B(2,1)p1 -> match. dist=2/3 land A under blockers (2,2)p2/(2,3)p2 -> no
  // match. So ONLY dist=1 works: a max-distance-only search would say 无解.
  const c = coreWith([
    [4, 0, 1], [0, 0, 2], [1, 0, 3], [2, 0, 4], [3, 0, 5], [5, 0, 6], [6, 0, 2], [7, 0, 3],
    [2, 1, 1],   // B: matches A at dist 1 via the up-ray
    [2, 2, 2],   // blocks dist 2
    [2, 3, 2],   // blocks dist 3
    [4, 4, 9],   // slide stop
  ]);
  const hint = c.findHint();
  check('F1: intermediate-distance match is found', hint !== null);
  check('F1: hint distance is the intermediate one', hint !== null && hint.dist === 1,
    hint ? `dir=${hint.dir} dist=${hint.dist}` : 'no hint');
  const res = c.resolve({ group: hint.group, dir: hint.dir, dist: hint.dist });
  check('F1: hint resolves to a real elimination', res.match === true);
  check('F1: consistency holds after resolve', c.consistencyCheck().length === 0);
}

// ---- F2: findHint prefers the longest distance when several work ----------
{
  // Same column-0 lock. A(4,0)p1, empties (4,1..3), stop (4,4)=p9 -> maxDist
  // 3. dist=1 (B at (2,1)p1) and dist=3 (B2 at (2,3)p1) both match; dist=2 is
  // blocked by (2,2)p2. Longest-first must return dist=3.
  const c = coreWith([
    [4, 0, 1], [0, 0, 2], [1, 0, 3], [2, 0, 4], [3, 0, 5], [5, 0, 6], [6, 0, 2], [7, 0, 3],
    [2, 1, 1],   // matches dist 1
    [2, 2, 2],   // blocks dist 2
    [2, 3, 1],   // matches dist 3
    [4, 4, 9],   // slide stop
  ]);
  const hint = c.findHint();
  check('F2: hint found', hint !== null);
  check('F2: longest working distance preferred', hint !== null && hint.dist === 3,
    hint ? `dir=${hint.dir} dist=${hint.dist}` : 'no hint');
  const res = c.resolve({ group: hint.group, dir: hint.dir, dist: hint.dist });
  check('F2: hint resolves to a real elimination', res.match === true);
  check('F2: consistency holds after resolve', c.consistencyCheck().length === 0);
}

// ---- F5: adjacent same-pattern pair is a TAP move (no slide needed) -------
{
  // Row 4 is fully packed and the pair sits against the left edge, so neither
  // block can slide horizontally (a horizontal slide would always re-align an
  // adjacent pair). Vertical slides only put them on diagonals, never on a
  // clear ray. All other patterns are unique (p2 repeats at the row ends but
  // in different columns, so no slide can ever align them). The adjacent pair
  // is therefore reachable ONLY by tapping.
  const c = coreWith([
    [4, 0, 1], [4, 1, 1], [4, 2, 2], [4, 3, 3],
    [4, 4, 4], [4, 5, 5], [4, 6, 6], [4, 7, 2],
  ]);
  const hint = c.findHint();
  check('F5: tap-only board reports a hint', hint !== null);
  check('F5: hint is a tap (dir null, dist 0)', hint !== null && hint.dir === null && hint.dist === 0,
    hint ? `dir=${hint.dir} dist=${hint.dist}` : 'no hint');
  check('F5: oracle agrees the only move is the tap', anyMove(c) === true);
  const blk = c.blocks.find(b => b.id === hint.blockId);
  const res = c.clickResolve(blk.r, blk.c);
  check('F5: tap hint resolves to a real elimination', res.matched === true);
  check('F5: consistency holds after tap resolve', c.consistencyCheck().length === 0);
}

// ---- F3: a board with no same-pattern pair is guaranteed dead --------------
{
  // One block of each pattern, so no two blocks ever share a pattern. A match
  // requires two same-pattern blocks, therefore no move exists - whether by
  // tap or by any slide.
  const c = coreWith([[0, 0, 1], [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 6]]);
  const oracle = anyMove(c);
  check('F3: oracle confirms no legal move', oracle === false);
  check('F3: findHint reports no hint', c.findHint() === null);
}

// ---- F4: findHint agrees with the brute-force oracle across game states ----
{
  const games = 120;
  let mismatches = 0, states = 0, hintMatches = 0, hintMisses = 0, deadEnds = 0;
  for (let g = 0; g < games; g++) {
    const c = new Core();
    let guard = 200;
    while (c.getPatternCount() > 0 && guard-- > 0) {
      states++;
      const oracle = anyMove(c);
      const h = c.findHint();
      if ((h !== null) !== oracle) {
        mismatches++;
        if (mismatches <= 3) {
          console.error('  MISMATCH hint=' + (h !== null) + ' oracle=' + oracle +
            ' blocks=' + c.getPatternCount());
          console.error(c.getGrid().map(r => r.join('')).join('\n'));
        }
        break;
      }
      if (oracle) hintMatches++;
      else deadEnds++;
      if (!h) { c.shuffle(); continue; }
      let resOk;
      if (h.dir === null) {
        const blk = c.blocks.find(b => b.id === h.blockId);
        const r = c.clickResolve(blk.r, blk.c);
        resOk = r.matched;
      } else {
        const r = c.resolve({ group: h.group, dir: h.dir, dist: h.dist });
        resOk = r.match;
      }
      if (!resOk) {
        console.error('  HINT FAILED TO MATCH dir=' + h.dir + ' dist=' + h.dist +
          ' blocks=' + c.getPatternCount());
        mismatches++;
        break;
      }
      if (c.consistencyCheck().length > 0) {
        console.error('  CONSISTENCY VIOLATION after hint resolve');
        mismatches++;
        break;
      }
      hintMisses++;
    }
  }
  check(`F4: findHint matches brute-force oracle across ${states} mid-game states`,
    mismatches === 0, `${mismatches} mismatches`);
  check(`F4: every hint resolved into a real elimination`, mismatches === 0);
  console.log(`      (oracle-hinted states=${hintMatches}, dead-ends=${deadEnds}, resolved=${hintMisses})`);
}

if (failed > 0) {
  console.error(`\n${failed} FAILURE(S)`);
  process.exit(1);
}
console.log('\nFIND-HINT PASS');