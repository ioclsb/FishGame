// Solver simulation: plays many full games through the pure GameCore API
// (greedy hint chase, shuffle on deadlock) and reports stability stats.
//
//   node tests/solver-sim.mjs [games=200]
import { createHarness } from './lib/load-game.mjs';

const games = parseInt(process.argv[2], 10) || 200;
const { sandbox } = createHarness();
const Core = sandbox.GameCore;

let totalShuffles = 0;
let deadEndGames = 0;   // games that hit at least one deadlock
let unwinnable = 0;     // shuffle could not restore solvability
let wins = 0;
const shufflesHistogram = new Map();

for (let g = 0; g < games; g++) {
  const c = new Core();
  let shuffles = 0;
  let guard = 500; // hard cap on moves per game
  while (c.getPatternCount() > 0 && guard-- > 0) {
    const hint = c.findHint();
    if (!hint) {
      deadEndGames++;
      if (!c.shuffle()) { unwinnable++; break; }
      shuffles++;
      continue;
    }
    const res = c.resolve({ group: hint.group, dir: hint.dir, dist: hint.dist });
    if (!res.match) throw new Error('hint failed to match - invariant broken');
    if (c.consistencyCheck().length > 0) {
      throw new Error('consistency violation after resolve');
    }
  }
  if (c.getPatternCount() === 0) wins++;
  totalShuffles += shuffles;
  shufflesHistogram.set(shuffles, (shufflesHistogram.get(shuffles) || 0) + 1);
}

console.log(`games=${games} wins=${wins} (${((wins / games) * 100).toFixed(1)}%)`);
console.log(`dead-end encounters: ${deadEndGames} (${(deadEndGames / games).toFixed(2)} per game)`);
console.log(`avg shuffles/game: ${(totalShuffles / games).toFixed(2)}`);
console.log('shuffles histogram:', [...shufflesHistogram.entries()].sort((a, b) => a[0] - b[0]));
if (unwinnable > 0) console.error(`UNWINNABLE GAMES: ${unwinnable}`);
process.exit(unwinnable > 0 ? 1 : 0);
