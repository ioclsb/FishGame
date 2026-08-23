// Structured debug logging for the mini game. Mirrors the web page's
// dbg()/dbgStep() contract so ported code reads identically. Enabled only
// when game.js sets G.__DEBUG_ENABLED (launch query debug=1).
const { G } = require('./globals.js');
const DEBUG = G.__DEBUG_ENABLED === true;
const LOGS = [];
let step = 0;

function dbg(entry) {
  if (!DEBUG) return;
  entry.seq = LOGS.length + 1;
  entry.step = step;
  LOGS.push(entry);
  if (LOGS.length > 20000) LOGS.splice(0, LOGS.length - 20000);
}

function dbgStep() {
  if (DEBUG) step++;
}

function dumpLogs() {
  return LOGS.slice();
}

G.dbg = dbg;
G.dbgStep = dbgStep;

module.exports = { dbg, dbgStep, dumpLogs };