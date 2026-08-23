// App ported from push-slide-match.html: assembles GameCore + RenderView +
// UI + SoundManager, drives a single rAF frame loop, and routes touch input
// through the same drag/tap state machine as the web version.

const { G: GLOBAL } = require('./globals.js');
const { GameCore } = require('./core.js');
const { RenderView, G } = require('./view.js');
const { UI } = require('./ui.js');
const { SoundManager } = require('./sound.js');
const storage = require('./storage.js');
require('./debug.js');

const DEBUG = GLOBAL.__DEBUG_ENABLED === true;
// 开发跳关：设为目标关（如 36）启动即直跳该关；用毕改回 0 恢复常规进度。
const JUMP_TO_LEVEL = 36;
const PATTERN_NAMES = ['小丑鱼', '蓝倒吊', '绿海龟', '河豚', '紫水母', '小红蟹'];
// 顶部设置按钮与安全区之间的留白
const TOP_PAD = 12;
// 左上角设置按钮半径
const SETTINGS_R = 20;
// 棋盘下方按钮行区域高度
const BTN_AREA = 56;
// 棋盘外框向内收的距离，四周露出页面留白
const BOARD_PAD = 8;
// 屏幕画布像素比上限：与 view 的 DPR_CAP 保持一致，避免高端机上
// 全屏清屏/填充/棋盘 blit 的像素量爆炸式增长
const DPR_CAP = 2;

function sysInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

class App {
  constructor() {
    this.core = new GameCore(this._loadLevel());
    this.streak = 0;
    this.stats = this._freshStats();
    this.busy = false;
    this.press = null;
    this.picking = null;
    this._hidden = false;
    this._lastUiRender = -1000;

    const info = sysInfo();
    this.width = info.windowWidth;
    this.height = info.windowHeight;
    this.dpr = Math.min(info.pixelRatio || 1, DPR_CAP);
    const safe = info.safeArea || { top: 0, bottom: this.height };
    this.safeTop = Math.round(safe.top || 0);
    this.safeBottom = Math.max(0, Math.round(this.height - (safe.bottom != null ? safe.bottom : this.height)));

    this.screen = wx.createCanvas();
    this.screen.width = Math.round(this.width * this.dpr);
    this.screen.height = Math.round(this.height * this.dpr);
    this.screenCtx = this.screen.getContext('2d');
    this.screenCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.boardCanvas = wx.createCanvas();

    this.sound = new SoundManager();
    this._computeLayout();
    this.view = new RenderView(this.boardCanvas, this.core, this.platform);
    this._setBoardRect();

    this.uiState = {
      progress: { cleared: 0, total: this.core.getTotalPairs(), pct: 0 },
      soundOn: this.sound.enabled,
      musicOn: this.sound.musicOn,
      vibrate: this._loadVibrate(),
      stuck: false,
      msg: null,
      coach: false,
      win: null,
      settings: false,
      level: this._loadLevel(),
      usedOnce: { undo: false, shuffle: false, hint: false },
    };
    this.ui = new UI(this);
    this.ui.setLayout({
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      safeTop: this.safeTop,
      safeBottom: this.safeBottom,
      hudH: this.hudH,
      progTop: this.progTop,
      board: this.boardRect,
    });

    this._wireView(this.view);
    this.updateHud();
    this._maybeCoach();
    // 高刷设备解锁 120fps（60Hz 屏 / 不支持的基础库自动回落，无副作用）
    try {
      if (typeof wx !== 'undefined' && wx.setPreferredFramesPerSecond) {
        const ret = wx.setPreferredFramesPerSecond(120);
        console.log('[diag] setPreferredFramesPerSecond(120) ok, ret=',
          ret && ret.errMsg ? ret.errMsg : (ret === undefined ? 'void' : String(ret)));
      } else {
        console.log('[diag] setPreferredFramesPerSecond 不可用');
      }
    } catch (e) {
      console.log('[diag] setPreferredFramesPerSecond 抛错:', e && e.message);
    }
    this._loop();
  }

  // ---- layout -----------------------------------------------------------
  _loadLevel() {
    // 开发跳关：把 JUMP_TO_LEVEL 设为目标关即可启动直跳该关；用毕改回 0 恢复常规进度。
    if (JUMP_TO_LEVEL >= 1) {
      try { storage.set('psm.level', String(JUMP_TO_LEVEL)); } catch (e) {}
      return JUMP_TO_LEVEL;
    }
    // 启动参数 ?level=N 可跳关（开发者工具“启动参数”填 level=36），仅用于测试/调试。
    try {
      const q = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query) || {};
      const ql = parseInt(q.level, 10);
      if (Number.isFinite(ql) && ql >= 1) {
        try { storage.set('psm.level', String(ql)); } catch (e) {}
        return ql;
      }
    } catch (e) { /* 忽略，退回持久化关卡 */ }
    try {
      const v = parseInt(storage.get('psm.level'), 10);
      return Number.isFinite(v) && v >= 1 ? v : 1;
    } catch (e) { return 1; }
  }

  _loadVibrate() {
    try {
      return storage.get('psm.vibrate') !== '0';
    } catch (e) { return true; }
  }

  _computeLayout() {
    const wrapW = this.width;
    // 顶部保留区：左上角设置按钮（进度条随棋盘定位）
    this.progTop = this.safeTop + TOP_PAD + SETTINGS_R * 2;
    const wrapH = this.height - this.safeBottom - this.progTop - BTN_AREA;
    this.hudH = this.progTop - this.safeTop;
    this.platform = {
      dpr: this.dpr,
      hidden: () => this._hidden,
      wrapW,
      wrapH,
    };
  }

  _setBoardRect() {
    const bw = G.boardW, bh = G.boardH;
    const wrapW = this.width;
    const avail = this.height - this.safeBottom - BTN_AREA - this.progTop;
    const ox = Math.round((wrapW - bw) / 2);
    const oy = Math.round(this.progTop + (avail - bh) / 2);
    this.boardRect = { x: ox + BOARD_PAD, y: oy + BOARD_PAD, w: bw - BOARD_PAD * 2, h: bh - BOARD_PAD * 2 };
    if (this.ui) {
      this.ui.setLayout({
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        safeTop: this.safeTop,
        safeBottom: this.safeBottom,
        hudH: this.hudH,
        progTop: this.progTop,
        board: this.boardRect,
      });
    }
  }

  // ---- frame loop -------------------------------------------------------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    try {
      const f0 = performance.now();
      this.view.tick(now);
      // UI 层跟随整帧成本自适应节流：动画/交互时每帧重绘；整帧够快时
      // 空闲也跑满帧，慢设备空闲降到 30fps，避免整屏无谓重绘。
      const busy = this.view.isBusyFrame();
      if (busy || RenderView._frameCostMs < 10 || now - this._lastUiRender >= 33) {
        this.ui.render(this.screenCtx, now);
        this._lastUiRender = now;
      }
      const fms = performance.now() - f0;
      RenderView._frameCostMs = RenderView._frameCostMs * 0.9 + fms * 0.1;
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg !== this._lastLoopErr) {
        this._lastLoopErr = msg;
        console.error('[loop]', msg);
        try { wx.setStorageSync('__runtimeError', msg.slice(0, 400)); } catch (e) {}
      }
    }
  }

  // Window rotation / resize (wx.onWindowResize).
  onResize() {
    if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = null; }
    const info = sysInfo();
    const w = info.windowWidth, h = info.windowHeight;
    // Hysteresis: ignore <24px jitter (URL bar / browser chrome toggles on
    // mobile) so the canvas buffer is not re-allocated in a feedback storm.
    if (this._vpW > 0 && Math.abs(w - this._vpW) < 24 && Math.abs(h - this._vpH) < 24) {
      this._vpW = w; this._vpH = h;
      return;
    }
    this._vpW = w; this._vpH = h;
    this._resizeTimer = setTimeout(() => {
      this._resizeTimer = null;
      this._applyResize();
    }, 120);
  }

  _applyResize() {
    const info = sysInfo();
    this.width = info.windowWidth;
    this.height = info.windowHeight;
    this.dpr = Math.min(info.pixelRatio || 1, DPR_CAP);
    const safe = info.safeArea || { top: 0, bottom: this.height };
    this.safeTop = Math.round(safe.top || 0);
    this.safeBottom = Math.max(0, Math.round(this.height - (safe.bottom != null ? safe.bottom : this.height)));
    this.screen.width = Math.round(this.width * this.dpr);
    this.screen.height = Math.round(this.height * this.dpr);
    this.screenCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._computeLayout();
    this.view.relayout();
    this._setBoardRect();
    this.ui.render(this.screenCtx, performance.now());
  }

  // ---- callbacks from view ----------------------------------------------
  _wireView(view) {
    view.onRevert = () => {
      if (this.sound) this.sound.release();
      this.streak = 0;
    };
    view.onMatchFx = (fx) => { this._registerMatch(fx.cells, fx.pattern); };
  }

  _registerMatch(cells, pattern) {
    this.streak = (this.streak || 0) + 1;
    const streak = this.streak;
    this.stats.moves++;
    const tier = Math.min(streak, 3);

    this.sound.match(tier);
    this.vibrate(14);

    const v = this.view;
    v.hitStop([70, 90, 115][tier - 1]);
    for (const cell of cells) v.matchBurst(cell.r, cell.c, pattern, tier);
    v.addShake(tier === 3 ? 3 : 0);
    if (streak >= 2) {
      let mx = 0, my = 0;
      for (const c of cells) { mx += c.c; my += c.r; }
      const px = (mx / cells.length) * G.pitch + G.cell / 2;
      const py = (my / cells.length) * G.pitch - G.cell * 0.15;
      v.schedule(110, () => v.spawnFloater(px, py, `连击 ×${streak}`, Math.min(streak - 1, 4)));
    }
  }

  vibrate(msOrPattern) {
    try {
      if (typeof wx === 'undefined' || !wx.vibrateShort || this.uiState.vibrate === false) return;
      const pulses = Array.isArray(msOrPattern) ? msOrPattern : [msOrPattern];
      pulses.forEach((ms, i) => {
        setTimeout(() => {
          wx.vibrateShort({ type: ms < 14 ? 'light' : ms < 25 ? 'medium' : 'heavy', fail: () => {} });
        }, i * 45);
      });
    } catch (e) { /* non-fatal */ }
  }

  _freshStats() {
    return { t0: performance.now(), moves: 0, hints: 0, undos: 0 };
  }

  // ---- UI state helpers -------------------------------------------------
  winVisible() { return !!this.uiState.win; }
  coachVisible() { return !!this.uiState.coach; }
  settingsVisible() { return !!this.uiState.settings; }

  updateHud() {
    const c = this.core.getClearedPairs();
    const t = this.core.getTotalPairs();
    this.uiState.progress = { cleared: c, total: t, pct: (this.core.getProgress() * 100).toFixed(1) };
  }

  setMsg(text, ttl = 2200, color = '#ffd54f', plain = false) {
    if (!text) { this.uiState.msg = null; return; }
    this.uiState.msg = { text, until: performance.now() + ttl, color, plain, dur: ttl };
  }

  checkMovesLeft() {
    const stuck = this.core.getPatternCount() > 0 && this.core.findHint() === null;
    this.uiState.stuck = stuck;
    if (stuck) {
      this.view.hint = null;
      this.view.render();
      this.setMsg('暂无可消组合，试试洗牌', 2600);
    }
  }

  // ---- controls ---------------------------------------------------------
  _onButton(id) {
    if (id === 'undo') {
      if (this.busy) return;
      this.uiState.usedOnce.undo = true;
      this.sound.ui();
      this.undo();
    } else if (id === 'shuffle') {
      if (this.busy || this.core.getPatternCount() === 0) return;
      this.uiState.usedOnce.shuffle = true;
      this.busy = true;
      this.core.shuffle();
      this.view.hint = null;
      this.view.drag = null;
      this.streak = 0;
      this.sound.ui();
      this.sound.shuffleSfx();
      this.vibrate(20);
      this.uiState.stuck = false;
      this.view.render();
      this.updateHud();
      this.busy = false;
    } else if (id === 'hint') {
      if (this.busy) return;
      this.uiState.usedOnce.hint = true;
      this.sound.ui();
      this.stats.hints++;
      const h = this.core.findHint();
      if (h) {
        this.view.hint = h;
        this.view.render();
        const hinted = this.core.getBlocks().find((b) => b.id === h.blockId);
        const species = hinted ? PATTERN_NAMES[hinted.pattern - 1] : '';
        const verb = h.dir === null ? '点击' : '推动';
        this.setMsg(species ? `提示：${verb}${species}即可消除` : `提示：${verb}该方块即可消除`);
      } else {
        this.view.hint = null;
        this.view.render();
        this.setMsg('当前无解，可尝试洗牌');
      }
    } else if (id === 'settings') {
      this.sound.ui();
      this.uiState.settings = true;
    }
  }

  // Settings panel controls: sound / vibration toggles + restart.
  _toggleSound() {
    this.sound.setEnabled(!this.sound.enabled);
    this.uiState.soundOn = this.sound.enabled;
    if (this.sound.enabled) { this.sound.ui(); }
    this.setMsg(this.sound.enabled ? '声音已开启' : '声音已关闭', 1400);
  }

  _toggleVibrate() {
    this.uiState.vibrate = !this.uiState.vibrate;
    try { storage.set('psm.vibrate', this.uiState.vibrate ? '1' : '0'); } catch (e) {}
    this.setMsg(this.uiState.vibrate ? '震动已开启' : '震动已关闭', 1400);
    if (this.uiState.vibrate) this.vibrate(20);
  }

  _toggleMusic() {
    this.sound.setMusic(!this.sound.musicOn);
    this.uiState.musicOn = this.sound.musicOn;
    this.setMsg(this.sound.musicOn ? '音乐已开启' : '音乐已关闭', 1400);
  }

  _maybeCoach() {
    let coached = false;
    try { coached = storage.get('psm.coached') === '1'; } catch (e) {}
    if (coached) return;
    this.uiState.coach = true;
    RenderView.setPaused(true);
  }

  _dismissCoach() {
    this.uiState.coach = false;
    RenderView.setPaused(false);
    try { storage.set('psm.coached', '1'); } catch (e) {}
    this.sound.ui();
  }

  // ---- input ------------------------------------------------------------
  _boardCoords(x, y) {
    const br = this.boardRect;
    // 棋盘画布缩放进内收区域，命中坐标需同步按比例还原
    const kx = G.boardW / br.w;
    const ky = G.boardH / br.h;
    return this.view.pixelToGrid((x - br.x) * kx, (y - br.y) * ky);
  }

  onTouchStart(x, y) {
    this.sound.unlock();
    if (DEBUG) {
      // Debug long-press: holding a block ~0.6s captures state + screenshots.
      clearTimeout(this._dbgTimer);
      this._dbgTimer = setTimeout(() => {
        this._dbgTimer = null;
        GLOBAL.__captureDebug(this);
      }, 600);
    }
    if (this.busy) return;

    const hit = this.ui.hitTest(x, y);
    if (hit) {
      if (hit.zone === 'overlay') {
        if (hit.id === 'coachStart') this._dismissCoach();
        else if (hit.id === 'winRestart') this.restart();
        else if (hit.id === 'settingsClose') this.uiState.settings = false;
        else if (hit.id === 'settingsSound') this._toggleSound();
        else if (hit.id === 'settingsVibrate') this._toggleVibrate();
        else if (hit.id === 'settingsMusic') this._toggleMusic();
        else if (hit.id === 'settingsRestart' || hit.id === 'settingsClose') {
          // 按下时记录，松开再触发，以呈现按压点击效果
          this.ui.pressId = hit.id;
          this.sound.ui();
        }
        return;
      }
      if (hit.zone === 'button') {
        this._onButton(hit.id);
        return;
      }
    }
    // Touching the board clears any lingering hint outline (web parity).
    if (!hit || hit.zone === 'board') this.view.hint = null;
    if (this.picking) {
      const { r, c } = this._boardCoords(x, y);
      const t = (this.picking.targets || []).find(xx => xx.r === r && xx.c === c) || null;
      if (t) {
        this._doPick(this.picking.r, this.picking.c, t.r, t.c);
      } else {
        this._cancelPick();
      }
      return;
    }
    this.busy = true;
    const { r, c } = this._boardCoords(x, y);
    if (!this.core.inBounds(r, c) || this.core.getGrid()[r][c] === 0) {
      this.press = null;
      return;
    }
    // Same-pattern breathing pulse the moment a block is touched, so it fires
    // whether the touch becomes a tap or a drag (a finger often drifts past the
    // 6px drag threshold, which would otherwise swallow the on-release pulse).
    this.view.triggerBounce(this.core.getGrid()[r][c]);
    this.press = { r, c, startX: x, startY: y, axis: null, dir: null, group: null, maxDist: 0 };
  }

  onTouchMove(x, y) {
    if (DEBUG && !this.busy && !this.press) {
      const hc = this._boardCoords(x, y);
      if (this.core.inBounds(hc.r, hc.c)) {
        this.view.hoverCell = { r: hc.r, c: hc.c };
        this.view.render();
      }
    }
    if (!this.press || !this.busy) return;
    const dx = x - this.press.startX;
    const dy = y - this.press.startY;

    if (!this.press.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      const isH = Math.abs(dx) >= Math.abs(dy);
      const dir = isH ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      const group = this.core.getPushGroup(this.press.r, this.press.c, dir);
      if (!group) return;
      const maxDist = this.core.getMaxSlideDistance(group, dir);
      if (maxDist === 0) return;
      this.press.axis = isH ? 'h' : 'v';
      this.press.dir = dir;
      this.press.group = group;
      this.press.maxDist = maxDist;
      this.view.startDrag(group, dir, maxDist);
      clearTimeout(this._dbgTimer);
      this._dbgTimer = null;
    }

    const curDir = this.press.axis === 'h' ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
    const pxDist = this.press.axis === 'h' ? Math.abs(dx) : Math.abs(dy);
    const maxDist = this.core.getMaxSlideDistance(this.press.group, curDir);
    if (curDir !== this.press.dir) {
      this.press.dir = curDir;
      this.press.maxDist = maxDist;
      if (this.view.drag) { this.view.drag.dir = curDir; this.view.drag.maxDist = maxDist; }
    }
    // 屏幕位移按内收比例换算为画布位移，保证拖拽跟手
    const k = this.press.axis === 'h' ? (G.boardW / this.boardRect.w) : (G.boardH / this.boardRect.h);
    this.view.updateDrag(Math.min(pxDist * k, maxDist * G.pitch));
  }

  onTouchEnd() {
    clearTimeout(this._dbgTimer);
    this._dbgTimer = null;
    // 设置面板底部按钮：松开时触发（呈现按压点击效果）
    if (this.ui.pressId) {
      const id = this.ui.pressId;
      this.ui.pressId = null;
      if (id === 'settingsRestart') {
        this.uiState.settings = false;
        this.restart();
      } else if (id === 'settingsClose') {
        this.uiState.settings = false;
        this.view.render();
      }
      return;
    }
    if (!this.busy) return;
    const hadDrag = this.press && this.press.dir !== null;
    const clickRc = this.press ? { r: this.press.r, c: this.press.c } : null;
    this.press = null;
    if (!hadDrag) {
      if (clickRc) {
        const multi = this.core.findMultiMatches(clickRc.r, clickRc.c);
        if (multi) {
          this.core.pushSnapshot();
          this.picking = { r: clickRc.r, c: clickRc.c, targets: multi };
          this.view.pick = this.picking;
          this.sound.pick();
          this.vibrate(8);
          this.view.render();
          this.busy = false;
          return;
        }
        const tappedPattern = this.core.inBounds(clickRc.r, clickRc.c) ? this.core.getGrid()[clickRc.r][clickRc.c] : 0;
        const res = this.core.clickResolve(clickRc.r, clickRc.c);
        if (res.matched) {
          this._registerMatch([clickRc, { ...res.target }], tappedPattern);
          this.view.playElimination(clickRc, res.target, tappedPattern, () => this._finishAction());
        } else {
          this.streak = 0;
          this.sound.click();
          this._finishAction();
        }
      } else {
        this.busy = false;
      }
      return;
    }
    this.view.snapAndResolve(() => {
      if (this.view.pick) {
        this.picking = this.view.pick;
        this.busy = false;
        this.sound.pick();
        return;
      }
      this._finishAction();
    });
  }

  _doPick(r, c, tr, tc) {
    const pattern = this.core.getGrid()[r][c];
    const res = this.core.resolvePair(r, c, tr, tc);
    this.picking = null;
    this.view.pick = null;
    if (res.matched) {
      this._registerMatch([{ r, c }, { r: tr, c: tc }], pattern);
      this.view.playElimination({ r, c }, { r: tr, c: tc }, pattern, () => this._finishAction());
    } else {
      this.busy = false;
    }
  }

  _cancelPick() {
    if (this.picking && this.picking.slide) {
      this.core.revertSlide(this.picking.slide.moved);
    }
    this.picking = null;
    this.view.pick = null;
    this.view.render();
    this.busy = false;
  }

  _finishAction() {
    this.busy = false;
    this.updateHud();
    this.checkWin();
    this.checkMovesLeft();
  }

  checkWin() {
    if (this.core.getPatternCount() !== 0) return;
    // 每通过一关，关卡数 +1 并持久化
    this.uiState.level = Math.max(1, (this.uiState.level || 1) + 1);
    try { storage.set('psm.level', String(this.uiState.level)); } catch (e) {}
    const secs = Math.max(0, Math.round((performance.now() - this.stats.t0) / 1000));
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const extras = [];
    if (this.stats.hints) extras.push(`提示 ×${this.stats.hints}`);
    if (this.stats.undos) extras.push(`撤销 ×${this.stats.undos}`);
    let best = null;
    try { best = parseInt(storage.get('psm.bestTime'), 10) || null; } catch (e) {}
    let recordTag = '';
    if (!best || secs < best) {
      best = secs;
      try { storage.set('psm.bestTime', String(secs)); } catch (e) {}
      recordTag = ' · 新纪录！';
    } else {
      extras.push(`最佳 ${fmt(best)}`);
    }
    this.uiState.win = {
      statsText: `用时 ${fmt(secs)} · 消除 ${this.stats.moves} 对` +
        (extras.length ? ' · ' + extras.join(' · ') : '') + recordTag,
    };
    this.sound.win();
    this.vibrate([16, 40, 16, 40, 60]);
    this.ui.spawnConfetti();
    RenderView.setPaused(true);
    this.uiState.stuck = false;
  }

  undo() {
    if (!this.core.canUndo()) {
      this.setMsg('没有可撤销的操作');
      return;
    }
    this.stats.undos++;
    this.streak = 0;
    this.core.undo();
    RenderView.setPaused(false);
    if (this.view) this.view._bumpToken();
    this.view.drag = null;
    this.view.revert = null;
    this.view.elimFlash = null;
    this.view.bounce = null;
    this.view.pick = null;
    this.view.hint = null;
    this.picking = null;
    this.press = null;
    this.uiState.win = null;
    this.view.render();
    this.busy = false;
    this.updateHud();
    this.checkMovesLeft();
    this.setMsg('已撤销上一步');
  }

  restart() {
    this.uiState.win = null;
    RenderView.setPaused(false);
    if (this.view) this.view._bumpToken();
    this.busy = false;
    this.press = null;
    this.picking = null;
    this.streak = 0;
    this.stats = this._freshStats();
    this.core.init(this.uiState.level);
    this.view = new RenderView(this.boardCanvas, this.core, this.platform);
    this._wireView(this.view);
    this.uiState.stuck = false;
    this.uiState.usedOnce = { undo: false, shuffle: false, hint: false };
    this.setMsg('');
    this.updateHud();
  }
}

module.exports = { App };