const { GameCore } = require('../js/core.js');

function averagePairDistance(level, samples) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < samples; i++) {
    const core = new GameCore(level);
    const byPattern = new Map();
    for (const block of core.getBlocks()) {
      if (!byPattern.has(block.pattern)) byPattern.set(block.pattern, []);
      byPattern.get(block.pattern).push(block);
    }
    for (const blocks of byPattern.values()) {
      for (let j = 0; j < blocks.length; j++) {
        for (let k = j + 1; k < blocks.length; k++) {
          total += Math.abs(blocks[j].r - blocks[k].r) + Math.abs(blocks[j].c - blocks[k].c);
          count++;
        }
      }
    }
  }
  return total / count;
}

function averageAdjacentPairs(level, samples) {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const core = new GameCore(level);
    for (const block of core.getBlocks()) {
      const right = core.getGrid()[block.r]?.[block.c + 1];
      const down = core.getGrid()[block.r + 1]?.[block.c];
      if (right === block.pattern) total++;
      if (down === block.pattern) total++;
    }
  }
  return total / samples;
}

function adjacentPairs(core) {
  let total = 0;
  for (const block of core.getBlocks()) {
    if (core.getGrid()[block.r]?.[block.c + 1] === block.pattern) total++;
    if (core.getGrid()[block.r + 1]?.[block.c] === block.pattern) total++;
  }
  return total;
}

function hasSamePatternChain(core) {
  const grid = core.getGrid();
  for (const block of core.getBlocks()) {
    const row = [
      grid[block.r]?.[block.c - 1], grid[block.r]?.[block.c], grid[block.r]?.[block.c + 1],
    ];
    const col = [
      grid[block.r - 1]?.[block.c], grid[block.r]?.[block.c], grid[block.r + 1]?.[block.c],
    ];
    if (row.every(value => value === block.pattern) || col.every(value => value === block.pattern)) return true;
  }
  return false;
}

const low = averagePairDistance(1, 80);
const mid = averagePairDistance(150, 80);
const high = averagePairDistance(500, 80);
const lowAdjacent = averageAdjacentPairs(1, 80);
const highAdjacent = averageAdjacentPairs(500, 80);
if (!(lowAdjacent > highAdjacent && highAdjacent > 0)) {
  console.error(`Expected lower high-level adjacency, got L1=${lowAdjacent.toFixed(2)}, L500=${highAdjacent.toFixed(2)}`);
  process.exit(1);
}
for (const level of [50, 100, 500]) {
  for (let i = 0; i < 40; i++) {
    const core = new GameCore(level);
    const adjacent = adjacentPairs(core);
    if (adjacent < 3 || adjacent > 5 || hasSamePatternChain(core)) {
      console.error(`High-level layout failed at L${level}: adjacent=${adjacent}`);
      process.exit(1);
    }
  }
}
if (!(low > 2.5 && mid > 2.5 && high > 2.5)) {
  console.error(`Expected non-zero distribution, got L1=${low.toFixed(2)}, L150=${mid.toFixed(2)}, L500=${high.toFixed(2)}`);
  process.exit(1);
}
console.log(`Dispersal trend PASS: L1=${low.toFixed(2)}, L150=${mid.toFixed(2)}, L500=${high.toFixed(2)}, adjacent L1=${lowAdjacent.toFixed(2)}, L500=${highAdjacent.toFixed(2)}`);
