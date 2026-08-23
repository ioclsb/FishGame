// Structured debug logging for the mini game. Mirrors the web page's
// dbg()/dbgStep() contract so ported code reads identically. Enabled only
// when game.js sets G.__DEBUG_ENABLED (launch query debug=1).
//
// NOTE: debug.js is required by game.js BEFORE the launch query is parsed, so
// the flag must be read lazily at call time rather than captured at load.
const { G } = require('./globals.js');
const LOGS = [];
let step = 0;

function isDebug() { return G.__DEBUG_ENABLED === true; }

function dbg(entry) {
  if (!isDebug()) return;
  entry.seq = LOGS.length + 1;
  entry.step = step;
  LOGS.push(entry);
  if (LOGS.length > 20000) LOGS.splice(0, LOGS.length - 20000);
}

function dbgStep() {
  if (isDebug()) step++;
}

function dumpLogs() {
  return LOGS.slice();
}

G.dbg = dbg;
G.dbgStep = dbgStep;

// ---- diagnostic capture ---------------------------------------------------
// Snapshots app state + board/screen screenshots so issues can be diagnosed
// from a remote report. Invoked via __captureDebug() from the DevTools
// console, or automatically by a long-press gesture in debug mode. No-op in
// production builds (DEBUG off).
function serializeState(app) {
  if (!app || !app.core) return null;
  const core = app.core;
  return {
    t: Date.now(),
    busy: !!app.busy,
    streak: app.streak,
    stats: app.stats,
    grid: core.getGrid ? core.getGrid() : null,
    blocks: core.getBlocks ? core.getBlocks().map((b) => ({ id: b.id, p: b.pattern, r: b.r, c: b.c })) : null,
    cleared: core.getClearedPairs ? core.getClearedPairs() : null,
    total: core.getTotalPairs ? core.getTotalPairs() : null,
    view: app.view ? {
      bounce: !!app.view.bounce,
      drag: !!app.view.drag,
      revert: !!app.view.revert,
      pick: !!app.view.pick,
      elimFlash: !!app.view.elimFlash,
      hint: !!app.view.hint,
    } : null,
    boardCanvas: app.view ? [app.view.canvas.width, app.view.canvas.height] : null,
  };
}

function captureDebug(app) {
  if (!isDebug()) return false;
  try {
    wx.setStorageSync('__debugState', JSON.stringify(serializeState(app)));
    wx.setStorageSync('__debugLogs', JSON.stringify(dumpLogs().slice(-500)));
  } catch (e) {}
  // Screenshots (best-effort): board + screen canvas -> jpg -> base64 in
  // storage. The base64 can be copied out of the DevTools console/storage
  // panel and decoded to view exactly what the canvas showed.
  try {
    const fs = wx.getFileSystemManager();
    const shot = (canvas, key) => {
      if (!canvas || !canvas.toTempFilePath) return;
      canvas.toTempFilePath({
        fileType: 'jpg',
        quality: 0.6,
        success: (r) => {
          try { wx.setStorageSync(key, fs.readFileSync(r.tempFilePath, 'base64')); } catch (e) {}
        },
        fail: () => {},
      });
    };
    if (app && app.view) shot(app.view.canvas, '__debugBoardPng');
    if (app && app.screen) shot(app.screen, '__debugScreenPng');
  } catch (e) {}
  try { wx.showToast({ title: '已采集调试数据', icon: 'none' }); } catch (e) {}
  return true;
}

G.__captureDebug = captureDebug;

module.exports = { dbg, dbgStep, dumpLogs, captureDebug };