const { GameCore } = require('../js/core.js');

let failures = 0;
for (let i = 0; i < 100; i++) {
  if (!new GameCore(1).findHint()) failures++;
}

if (failures) {
  console.error(`L1 initial-match failures: ${failures}/100`);
  process.exit(1);
}
console.log('L1 initial-match PASS: 100/100');
