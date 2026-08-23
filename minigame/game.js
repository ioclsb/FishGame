// WeChat Mini Game entry point. Boots the environment (debug flag, canvas
// factory), creates the App, and wires wx touch/lifecycle events to it.
require('./js/debug.js');
const { G } = require('./js/globals.js');

// 无论真机基础库是否已提供全局 performance，都统一覆盖为从启动时刻计时的
// 相对毫秒时钟：部分基础库的 performance.now() 刻度为微秒或从绝对时间戳
// 开始（实测会导致 Math.sin(now * k) 特效爆频、定时动画瞬间完成、busy
// 状态卡死）。相对毫秒时钟与标准 performance.now() 语义完全一致。
(function () {
  const t0 = Date.now();
  const relNow = () => Date.now() - t0;
  try {
    if (typeof globalThis.performance === 'undefined') {
      globalThis.performance = { now: relNow };
    } else {
      globalThis.performance.now = relNow;
    }
  } catch (e) {
    try { globalThis.performance = { now: relNow }; } catch (e2) {}
  }
})();

// Launch query support: ?debug=1 (dev console "custom compile condition")
try {
  const launch = wx.getLaunchOptionsSync();
  const query = (launch && launch.query) || {};
  if (query.debug === '1' || query.debug === 1 || query.debug === 'true') {
    G.__DEBUG_ENABLED = true;
  }
} catch (e) { /* defaults off */ }

G.__DEBUG_ENABLED = G.__DEBUG_ENABLED === true;
G.__REDUCED_MOTION = false; // no OS API; keep full effects
G.__createCanvas = () => wx.createCanvas();

// Capture uncaught runtime errors (e.g. inside the frame loop) to storage so
// they can be diagnosed without watching the console.
try {
  wx.onError((err) => {
    const msg = (err && err.message) ? err.message : String(err);
    console.error('[runtime]', msg);
    try { wx.setStorageSync('__runtimeError', msg.slice(0, 400)); } catch (e) {}
  });
} catch (e) { /* onError is best-effort */ }

// Diagnostic: after boot, dump geometry + device environment to storage and
// save PNG captures of the board canvas and the screen canvas so rendering
// issues can be seen.
setTimeout(() => {
  if (!app || !app.view) return;
  try {
    let si = {};
    try {
      si = (wx.getSystemInfoSync && wx.getSystemInfoSync()) ||
        (wx.getSystemInfo && wx.getSystemInfoSync());
    } catch (e) {}
    let nowV = 'NA';
    try { nowV = performance.now(); } catch (e) {}
    const diag = {
      code: '433d1e3+diag',
      platform: si.platform, sdk: si.SDKVersion, model: si.model,
      performanceType: typeof globalThis.performance,
      performanceNow: nowV,
      wxGetPerformance: typeof wx.getPerformance,
      audioCtx: typeof wx.createWebAudioContext,
      nowDiffMs: Date.now() - nowV,
    };
    console.log('[diag]', JSON.stringify(diag));
    wx.setStorageSync('__diag', JSON.stringify(diag));
    wx.setStorageSync('__report', JSON.stringify({
      w: app.width, h: app.height, dpr: app.dpr,
      boardRect: app.boardRect,
      boardCanvas: [app.view.canvas.width, app.view.canvas.height],
      blocks: app.core.getPatternCount(),
      bg: app.view.bbg ? [app.view.bg.width, app.view.bg.height] : null,
    }));
  } catch (e) {}
  try {
    app.view.canvas.toTempFilePath({
      success: (r) => { try { wx.setStorageSync('__boardPng', r.tempFilePath); } catch (e) {} },
      fail: (e) => { try { wx.setStorageSync('__boardPngErr', JSON.stringify(e)); } catch (x) {} },
    });
    app.screen.toTempFilePath({
      success: (r) => { try { wx.setStorageSync('__screenPng', r.tempFilePath); } catch (e) {} },
      fail: () => {},
    });
  } catch (e) {}
}, 1500);

const { App } = require('./js/app.js');

let app = null;
try {
  app = new App();
  G.__app = app; // debug + test-harness hook
  try { wx.setStorageSync('__bootOk', 'yes'); } catch (e) {}
  try { wx.removeStorageSync('__bootError'); } catch (e) {}
} catch (err) {
  // Surface boot errors on screen so failures are visible without the console.
  const msg = (err && err.message ? err.message : String(err));
  const stack = (err && err.stack ? err.stack : '');
  console.error('[boot]', msg, stack);
  try { wx.setStorageSync('__bootError', msg); } catch (e) {}
  try {
    wx.showToast({ title: '启动失败: ' + msg, icon: 'none', duration: 5000 });
  } catch (e) { /* toast is best-effort */ }
  try {
    const c = wx.createCanvas();
    c.width = 800;
    c.height = 500;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b2743';
    ctx.fillRect(0, 0, 800, 500);
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('BOOT ERROR', 20, 34);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '13px monospace';
    const lines = ('Error: ' + msg + '\n' + stack).split('\n').slice(0, 18);
    lines.forEach((ln, i) => ctx.fillText(ln, 20, 62 + i * 18));
  } catch (e2) { /* non-fatal */ }
}

let touchId = null;

wx.onTouchStart((e) => {
  if (!app) return;
  const t = e.touches && e.touches[0];
  if (!t) return;
  touchId = t.identifier;
  app.onTouchStart(t.clientX, t.clientY);
});

wx.onTouchMove((e) => {
  if (!app || touchId === null) return;
  let t = null;
  if (e.touches) {
    for (const tk of e.touches) {
      if (tk.identifier === touchId) { t = tk; break; }
    }
  }
  if (!t && e.changedTouches && e.changedTouches.length) t = e.changedTouches[0];
  if (!t) return;
  app.onTouchMove(t.clientX, t.clientY);
});

function endTouch() {
  touchId = null;
  if (app) app.onTouchEnd();
}

wx.onTouchEnd(endTouch);
wx.onTouchCancel(endTouch);

wx.onShow(() => {
  if (!app) return;
  app._hidden = false;
  if (app.sound) app.sound.onShow();
});
wx.onHide(() => {
  if (app) app._hidden = true;
  if (app && app.sound) app.sound.pauseBgm();
});

wx.onWindowResize(() => {
  if (app) app.onResize();
});