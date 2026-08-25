// Canvas HUD for the Mini Game port. Replaces the DOM from the web version:
// a row of four round icon buttons (undo / shuffle / hint / settings) below
// the board, progress bar + label (above the board), message toast, first-run
// coach overlay, the win overlay (with confetti) and the settings panel.
// Everything is drawn on the screen canvas and hit-tested through hitTest().

const { roundRectPath, RenderView, cellCenterInBoard } = require('./view.js');
const { shade } = require('./creatures.js');

// 圆润字体栈（设备不支持圆体时回退到常规无衬线）
const ROUND_FONT = "'Yuanti SC','YouYuan','PingFang SC','Microsoft YaHei',sans-serif";
const rf = (weight, size) => `${weight} ${size}px ${ROUND_FONT}`;

const BTN_DEFS = [
  { id: 'undo', label: '撤销' },
  { id: 'shuffle', label: '打乱' },
  { id: 'hint', label: '提示' },
  { id: 'restart', label: '重开' },
  { id: 'settings', label: '设置' },
];

// Card colors for the icon buttons — a deep blue echoing the board water.
const BTN_COLORS = {
  undo: '#15405c',
  shuffle: '#15405c',
  hint: '#15405c',
  restart: '#15405c',
  settings: '#15405c',
};

class UI {
  constructor(app) {
    this.app = app;
    this.layout = null;
    this.buttons = [];          // [{id, x, y, r}]
    this.settingsBtn = null;    // {x, y, r}
    this.progress = null;       // {x, y, w, h}
    this.coachBtn = null;       // {x, y, w, h}
    this.winBtn = null;         // {x, y, w, h}
    this.settingsCloseBtn = null; // {x, y, w, h}
    this.settingsRestartBtn = null; // {x, y, w, h}
    // DEV-JUMP（临时）跳关面板几何，测试结束后连同相关代码一并删除
    this.devCard = null;
    this.devNumBox = null;
    this.devStepBtns = null;   // {m10,m1,p1,p10}
    this.devPresetBtns = [];   // [{n,x,y,w,h}]
    this.devGoBtn = null;
    this.devCloseBtn = null;
    this.tutorialSkipBtn = null; // {x, y, w, h} 教学关“跳过引导”
    this.pressId = null; // 底部按钮按压反馈：'settingsRestart' | 'settingsClose'
    this._settingsShownAt = null; // 设置面板入场动画起始时间
    this.winPressId = null; // 结算“再来一局”按压反馈
    this.confetti = [];         // active confetti pieces
    this.fishX = 0;             // animated fish position along the bar
    this._lastT = 0;
  }

  setLayout(layout) {
    this.layout = layout;
    const W = layout.width;
    const board = layout.board;
    // HUD 锚点用满盘基准矩形：前两关棋盘缩小时，进度条/关卡徽章/按钮行保持原位不动
    const anchor = layout.fullBoard || board;

    // settings lives in the button row now; no corner button
    this.settingsBtn = null;

    // progress label + bar: centered just above the board (anchored to full-board rect)
    const barW = Math.min(Math.round(anchor.w * 0.72), 240);
    const barH = 10;
    const barX = Math.round((W - barW) / 2);
    const barY = anchor.y - 34;
    this.progress = { x: barX, y: barY, w: barW, h: barH, labelY: barY - 12 };

    // main buttons: 居中横向排布于棋盘下方，整体上移、与棋盘下边缘留出间距
    const btnR = W < 360 ? 20 : 23;
    const gap = Math.max(18, Math.round(W * 0.05));
    const btnArea = BTN_DEFS.length * (btnR * 2) + (BTN_DEFS.length - 1) * gap;
    const startX = Math.round((W - btnArea) / 2);
    const bottomLine = layout.height - (layout.safeBottom || 0);
    const areaH = bottomLine - (anchor.y + anchor.h);
    // 上移：从棋盘下边缘留一点间距起步，但保证按钮下方文字不超出屏幕
    const fromBoard = Math.max(12, Math.round(areaH * 0.20));
    let btnY = anchor.y + anchor.h + fromBoard + btnR;
    btnY = Math.min(btnY, bottomLine - btnR - 16);
    btnY = Math.round(btnY);
    this.buttons = BTN_DEFS.map((b, i) => ({
      id: b.id,
      label: b.label,
      x: startX + btnR + i * (btnR * 2 + gap),
      y: btnY,
      r: btnR,
    }));

    // board rect (computed by App, reused for hit-testing)
    this.boardRect = board;

    // settings panel geometry + fish reset
    this._layoutSettings(W, layout.height);
    this.coachBtn = null;
    this.winBtn = null;
    this.fishX = 0;
  }

  // Geometry for the settings panel options (deterministic so hit-testing
  // works even before the first render of the panel).
  _layoutSettings(W, H) {
    const cardW = Math.min(W * 0.84, 340);
    const cardH = 334;
    const c = { x: Math.round((W - cardW) / 2), y: Math.round((H - cardH) / 2), w: cardW, h: cardH };
    const rowX = c.x + 22;
    const rowW = cardW - 44;
    const rowH = 52;
    const rowGap = 10;
    const row0 = c.y + 80;
    this.settingsCard = c;
    this.settingsRows = {
      music:   { x: rowX, y: row0, w: rowW, h: rowH },
      sound:   { x: rowX, y: row0 + (rowH + rowGap), w: rowW, h: rowH },
      vibrate: { x: rowX, y: row0 + (rowH + rowGap) * 2, w: rowW, h: rowH },
    };
    const bh = 56;
    const gap = 14;
    const bw = rowW;
    const by = c.y + cardH - 72;
    this.settingsRestartBtn = null;
    this.settingsCloseBtn = { x: rowX, y: by, w: bw, h: bh };
  }

  // DEV-JUMP（临时）：跳关面板几何，确定性布局供命中测试使用
  _layoutDev(W, H) {
    const cardW = Math.min(W * 0.84, 340);
    const cardH = 332;
    const c = { x: Math.round((W - cardW) / 2), y: Math.round((H - cardH) / 2), w: cardW, h: cardH };
    const rowX = c.x + 22;
    const rowW = cardW - 44;
    this.devCard = c;
    this.devNumBox = { x: rowX + 30, y: c.y + 84, w: rowW - 60, h: 56 };
    const gap = 12;
    const bw4 = Math.round((rowW - gap * 3) / 4);
    const sy = c.y + 158;
    this.devStepBtns = {
      m10: { x: rowX, y: sy, w: bw4, h: 48 },
      m1:  { x: rowX + (bw4 + gap), y: sy, w: bw4, h: 48 },
      p1:  { x: rowX + (bw4 + gap) * 2, y: sy, w: bw4, h: 48 },
      p10: { x: rowX + (bw4 + gap) * 3, y: sy, w: bw4, h: 48 },
    };
    const bw5 = Math.round((rowW - gap * 4) / 5);
    const py = c.y + 222;
    this.devPresetBtns = [1, 5, 10, 25, 50].map((n, i) => ({
      n,
      x: rowX + i * (bw5 + gap),
      y: py,
      w: bw5,
      h: 40,
    }));
    const bh = 46;
    const bgap = 14;
    const bww = Math.round((rowW - bgap) / 2);
    const by = c.y + cardH - 62;
    this.devGoBtn = { x: rowX, y: by, w: bww, h: bh };
    this.devCloseBtn = { x: rowX + bww + bgap, y: by, w: bww, h: bh };
  }

  // ---- hit testing ------------------------------------------------------
  // Returns a descriptor consumed by App.handleTap:
  //   { zone:'overlay', id } | { zone:'button', id } | { zone:'board' } | null
  hitTest(x, y) {
    if (this.app.uiState.tutorial && this.tutorialSkipBtn &&
        x >= this.tutorialSkipBtn.x && x <= this.tutorialSkipBtn.x + this.tutorialSkipBtn.w &&
        y >= this.tutorialSkipBtn.y && y <= this.tutorialSkipBtn.y + this.tutorialSkipBtn.h) {
      return { zone: 'overlay', id: 'tutorialSkip' };
    }
    if (this.app.settingsVisible()) {
      const rows = this.settingsRows;
      if (rows) {
        for (const key of ['sound', 'vibrate', 'music']) {
          const row = rows[key];
          if (row && x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) {
            return { zone: 'overlay', id: 'settings' + key.charAt(0).toUpperCase() + key.slice(1) };
          }
        }
      }
      if (this.settingsRestartBtn && x >= this.settingsRestartBtn.x && x <= this.settingsRestartBtn.x + this.settingsRestartBtn.w &&
          y >= this.settingsRestartBtn.y && y <= this.settingsRestartBtn.y + this.settingsRestartBtn.h) {
        return { zone: 'overlay', id: 'settingsRestart' };
      }
      if (this.settingsCloseBtn && x >= this.settingsCloseBtn.x && x <= this.settingsCloseBtn.x + this.settingsCloseBtn.w &&
          y >= this.settingsCloseBtn.y && y <= this.settingsCloseBtn.y + this.settingsCloseBtn.h) {
        return { zone: 'overlay', id: 'settingsClose' };
      }
      return { zone: 'overlay', id: null }; // block board while settings is up
    }
    if (this.app.winVisible()) {
      if (this.winBtn && x >= this.winBtn.x && x <= this.winBtn.x + this.winBtn.w &&
          y >= this.winBtn.y && y <= this.winBtn.y + this.winBtn.h) {
        return { zone: 'overlay', id: 'winRestart' };
      }
      return { zone: 'overlay', id: null }; // block board while win is up
    }
    if (this.app.coachVisible()) {
      if (this.coachBtn && x >= this.coachBtn.x && x <= this.coachBtn.x + this.coachBtn.w &&
          y >= this.coachBtn.y && y <= this.coachBtn.y + this.coachBtn.h) {
        return { zone: 'overlay', id: 'coachStart' };
      }
      return { zone: 'overlay', id: null }; // block board while coach is up
    }
    for (const b of this.buttons) {
      // 已用尽的撤销/打乱/提示按钮本局失效：不命中，点击穿透到棋盘
      if (b.id !== 'settings' && this.app.uiState.usedOnce && this.app.uiState.usedOnce[b.id]) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return { zone: 'button', id: b.id };
    }
    const br = this.boardRect;
    if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
      return { zone: 'board' };
    }
    return null;
  }

  // ---- board frame ------------------------------------------------------
  // Square-cornered frame around the board: a thin dark outer rim for depth
  // plus a soft sky-blue border that echoes the ocean background.
  _drawBoardFrame(ctx, br) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
    ctx.strokeStyle = 'rgba(6,18,34,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(br.x + 1, br.y + 1, br.w - 2, br.h - 2);
    ctx.strokeStyle = 'rgba(120,190,255,0.38)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---- rendering --------------------------------------------------------
  render(ctx, now) {
    if (!this.layout) return;
    const L = this.layout;
    // 页面背景是纯静态渐变，烘焙成 sprite 后每帧只需一次 drawImage，
    // 避免每帧 createLinearGradient + 全屏渐变填充（真机开销大）。
    const bgSpr = UI._bgSprite(L.width, L.height, this.app.dpr || 1);
    ctx.drawImage(bgSpr, 0, 0, L.width, L.height);

    // board (square-cornered clip + theme-colored frame)
    const br = L.board;
    if (this.app.view && this.app.view.canvas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(br.x, br.y, br.w, br.h);
      ctx.clip();
      ctx.drawImage(this.app.view.canvas, br.x, br.y, br.w, br.h);
      ctx.restore();
      this._drawBoardFrame(ctx, br);
    }

    this._drawHud(ctx, now);
    this._drawMsg(ctx, now);
    if (this.app.uiState.tutorial) this._drawTutorial(ctx, now);
    if (this.app.coachVisible()) this._drawCoach(ctx);
    if (this.app.winVisible()) this._drawWin(ctx, now);
    if (this.app.settingsVisible()) this._drawSettings(ctx, now);
    this._settingsShownAt = null;
  }

  // 教学关引导层（非阻断：棋盘仍可正常操作）
  _drawTutorial(ctx, now) {
    const L = this.layout;
    const br = L.board;
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);

    // 顶部说明横幅
    const banH = 64;
    ctx.save();
    ctx.fillStyle = 'rgba(3,16,30,0.82)';
    roundRectPath(ctx, 16, 12, L.width - 32, banH, 16);
    ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('700', 16);
    ctx.fillText('教学关：把相同的两条鱼滑到一起就能消除', L.width / 2, 12 + banH / 2);
    ctx.restore();

    // 高亮一对建议消除的鱼 + 滑动箭头
    const hint = this.app.uiState.coachHint;
    if (hint && hint.target && (hint.group || hint.blockId != null)) {
      const cellA = hint.group ? hint.group[0] : null;
      const cellB = hint.target;
      if (cellA) {
        const a = cellCenterInBoard(cellA.r, cellA.c);
        const b = cellCenterInBoard(cellB.r, cellB.c);
      const ax = br.x + a.x, ay = br.y + a.y, bx = br.x + b.x, by = br.y + b.y;
      const s = (br.w / 10) * 0.5; // 屏幕上方块半边长（棋盘 10 列）
      ctx.save();
      ctx.strokeStyle = `rgba(255,221,87,${0.6 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      [ [ax, ay], [bx, by] ].forEach(([cx, cy]) => {
        roundRectPath(ctx, cx - s, cy - s, s * 2, s * 2, 10);
        ctx.stroke();
      });
      ctx.strokeStyle = `rgba(255,221,87,${0.7 + pulse * 0.3})`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax);
      const ah = 10;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - ah * Math.cos(ang - Math.PI / 6), by - ah * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(bx - ah * Math.cos(ang + Math.PI / 6), by - ah * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      }
    }

    // 底部“跳过引导”按钮
    const bw = 160, bh = 40;
    const sx = (L.width - bw) / 2;
    const sky = L.height - 56;
    this.tutorialSkipBtn = { x: sx, y: sky, w: bw, h: bh };
    ctx.save();
    roundRectPath(ctx, sx, sky, bw, bh, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('600', 15);
    ctx.fillText('跳过引导', sx + bw / 2, sky + bh / 2);
    ctx.restore();
  }

  _drawHud(ctx, now) {
    const s = this.app.uiState;

    // live fps readout pinned to the top-left corner
    {
      const fps = RenderView._stats.fps;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText((fps > 0 ? fps : '--') + 'fps', 12, (this.layout.safeTop || 0) + 14);
    }

    // progress bar + swimming fish (light blue fill)
    const p = this.progress;
    if (p) {
      const pct = +s.progress.pct;
      const ratio = Math.max(0, Math.min(1, pct / 100));
      // Fish glides toward the target progress position each frame instead of
      // jumping, so it reads as swimming forward smoothly.
      const targetX = p.x + Math.max(8, Math.min(p.w - 8, p.w * ratio));
      this.fishX += (targetX - this.fishX) * 0.12;

      // track
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      roundRectPath(ctx, p.x, p.y, p.w, p.h, p.h / 2);
      ctx.fill();
      // fill
      ctx.fillStyle = 'rgba(125,200,255,0.92)';
      if (ratio > 0.015) {
        ctx.beginPath();
        roundRectPath(ctx, p.x, p.y, Math.max(4, p.w * ratio), p.h, p.h / 2);
        ctx.fill();
      }
      const fy = p.y + p.h / 2;
      // level badge above the bar
      this._drawLevelBadge(ctx, p.x + p.w / 2, p.y - 16);
      // fish swimming along the bar following progress; 颜色随进度走彩虹
      this._drawBarFish(ctx, this.fishX, fy, now, Math.round(ratio * 300));
    }

    // main buttons: 3D card row below the board
    for (const b of this.buttons) {
      const attention = b.id === 'shuffle' && s.stuck;
      // When the board has no moves left, the shuffle button pulses (parity
      // with the web version's attnPulse animation).
      const pulse = attention ? 1 + 0.05 * Math.sin(now * 0.007) : 1;
      // one-shot tools go grey once spent for this round
      const spent = b.id !== 'settings' && s.usedOnce && s.usedOnce[b.id];
      ctx.save();
      if (spent) ctx.globalAlpha = 0.55;
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.translate(-b.x, -b.y);
      const col = spent ? '#5f7186' : (BTN_COLORS[b.id] || BTN_COLORS.settings);
      this._drawIconCard(ctx, b.x, b.y, b.r, col);
      ctx.restore();

      // text description below the button
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = rf('500', 11);
      ctx.fillText(b.label, b.x, b.y + b.r + 13);
    }
  }

  // Level badge: "第 N 关", centered above the progress bar.
  _drawLevelBadge(ctx, cx, cy) {
    const level = this.app.uiState.level || 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = rf('600', 12);
    ctx.fillText(`第 ${level} 关`, cx, cy);
  }

  // Small fish swimming on the progress bar: bobs gently and wags its tail.
  // 颜色随进度走彩虹（hue 由调用方按 ratio*300 传入），白描边保证在浅蓝条上醒目。
  _drawBarFish(ctx, x, y, now, hue = 40) {
    const bob = Math.sin(now * 0.006) * 1.8;
    const wag = Math.sin(now * 0.012) * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(1.35, 1.35);
    // tail
    ctx.beginPath();
    ctx.moveTo(-6.5, -2.5);
    ctx.lineTo(-10, -5 + wag);
    ctx.lineTo(-10, 5 + wag);
    ctx.lineTo(-6.5, 2.5);
    ctx.closePath();
    ctx.fillStyle = `hsl(${(hue + 340) % 360},85%,52%)`;
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue},85%,58%)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // eye
    ctx.beginPath();
    ctx.arc(3.5, -1, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0b2743';
    ctx.fill();
    ctx.restore();
  }

  // Static full-screen page gradient, baked once per size so render() costs a
  // single drawImage instead of a per-frame linear-gradient fill.
  static _bgSprite(w, h, dpr) {
    const key = `${w}:${h}:${dpr}`;
    let m = UI._bgSprites;
    if (!m) m = UI._bgSprites = {};
    if (m[key]) return m[key];
    const s = wx.createCanvas();
    s.width = Math.ceil(w * dpr); s.height = Math.ceil(h * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#275d7f');
    g.addColorStop(0.55, '#173f5f');
    g.addColorStop(1, '#0a2440');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    m[key] = s;
    return s;
  }

  // Matte elegant button: the card (soft vertical gradient, hairline rim, faint
  // drop shadow) and the glyph are baked into ONE cached sprite, so per-frame
  // cost is a single drawImage with no gradients or glow.
  static _cardSprite(id, r, color, dpr) {
    const key = `${id}:${color}:${r}:${dpr}`;
    let m = UI._cardSprites;
    if (!m) m = UI._cardSprites = {};
    if (m[key]) return m[key];
    const size = Math.ceil(r * 3.0 * dpr);
    const s = wx.createCanvas();
    s.width = size; s.height = size;
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    const ox = r * 1.5, oy = r * 1.5;
    // soft drop shadow for lift
    c.beginPath();
    c.arc(ox, oy + r * 0.12, r * 0.97, 0, Math.PI * 2);
    c.shadowColor = 'rgba(2,10,20,0.45)';
    c.shadowBlur = r * 0.3;
    c.fillStyle = 'rgba(2,10,20,0)';
    c.fill();
    // dark base disc sitting slightly lower: quiet button thickness
    c.fillStyle = shade(color, -32);
    c.beginPath();
    c.arc(ox, oy + r * 0.07, r, 0, Math.PI * 2);
    c.fill();
    // face: 纯色圆，去掉高光带与描边
    c.beginPath();
    c.arc(ox, oy, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    // glyph on top
    c.save();
    c.translate(ox, oy);
    UI._drawIcon(c, id);
    c.restore();
    m[key] = s;
    return s;
  }

  _drawIconCard(ctx, x, y, r, color) {
    const spr = UI._cardSprite(this._iconIdAt(x, y), r, color, this.app.dpr || 1);
    const half = r * 1.5;
    ctx.drawImage(spr, x - half, y - half, half * 2, half * 2);
  }

  // Map a button position back to its icon id so _drawIconCard callers stay
  // unchanged while sprites are keyed per glyph.
  _iconIdAt(x, y) {
    if (this.settingsBtn && this.settingsBtn.x === x && this.settingsBtn.y === y) return 'settings';
    const b = this.buttons.find((bt) => bt.x === x && bt.y === y);
    return b ? b.id : 'settings';
  }

  // White chunky glyph drawn on top of the 3D circle (0,0 centered). The icons
  // are cute white cutouts: a seahorse for undo, a turtle for shuffle, a crab
  // for hints and a sea urchin for settings.
  static _drawIcon(ctx, id) {
    const L = (x, y, x2, y2) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); };
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (id) {
      case 'undo': {
        // sweeping return arc with an arrowhead riding the curve's end
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.arc(1, 0, 6, -Math.PI / 3, Math.PI * 13 / 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3.84, 1.81);
        ctx.lineTo(-4.8, -1.55);
        ctx.lineTo(-7.32, 0.89);
        ctx.stroke();
        break;
      }
      case 'shuffle': {
        // two gently curved arrows crossing in the middle
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.moveTo(-6.8, 6.2);
        ctx.quadraticCurveTo(0.5, 0.5, 6.8, -6.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6.8, 6.2);
        ctx.quadraticCurveTo(-0.5, 0.5, -6.8, -6.2);
        ctx.stroke();
        // arrowhead on the up-right end
        ctx.beginPath();
        ctx.moveTo(5.65, -3.11);
        ctx.lineTo(6.8, -6.2);
        ctx.lineTo(3.11, -5.65);
        ctx.stroke();
        // arrowhead on the up-left end
        ctx.beginPath();
        ctx.moveTo(-5.65, -3.11);
        ctx.lineTo(-6.8, -6.2);
        ctx.lineTo(-3.11, -5.65);
        ctx.stroke();
        break;
      }
      case 'hint': {
        // glowing bulb: outlined dome with a rounded neck, twin base lines,
        // a little filament and three rays
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.arc(0, -1.4, 4.4, Math.PI * 0.8, Math.PI * 0.2);
        ctx.lineTo(2.9, 3.1);
        ctx.quadraticCurveTo(0, 4.4, -2.9, 3.1);
        ctx.closePath();
        ctx.stroke();
        // filament
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, -0.6, 1.6, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        // base lines
        L(-1.9, 4.9, 1.9, 4.9);
        L(-1.4, 6.4, 1.4, 6.4);
        // rays
        L(0, -8.6, 0, -6.9);
        L(-4.6, -7.4, -3.6, -6.0);
        L(4.6, -7.4, 3.6, -6.0);
        break;
      }
      case 'restart': {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, Math.PI * 0.25, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4.8, -6.2); ctx.lineTo(8, -6.3); ctx.lineTo(6.7, -3.2);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'settings': {
        // sea urchin as fine line art
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6;
          L(Math.cos(a) * 4.9, Math.sin(a) * 4.9, Math.cos(a) * 8.2, Math.sin(a) * 8.2);
        }
        // body ring
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.arc(0, 0, 4.9, 0, Math.PI * 2);
        ctx.stroke();
        // face
        dot(-1.6, -0.9, 0.85);
        dot(1.6, -0.9, 0.85);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0.4, 1.8, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      }
    }
  }

  _drawSettings(ctx, now) {
    const L = this.layout;
    const c = this.settingsCard;
    if (!c) return;

    // 入场动画：卡片轻微放大 + 背景淡入
    if (this._settingsShownAt == null) this._settingsShownAt = now;
    const tIn = Math.max(0, Math.min(1, (now - this._settingsShownAt) / 200));
    const ease = 1 - Math.pow(1 - tIn, 3);
    const cardScale = 0.94 + 0.06 * ease;
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.fillStyle = 'rgba(2,10,22,0.72)';
    ctx.fillRect(0, 0, L.width, L.height);
    ctx.restore();

    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    ctx.scale(cardScale, cardScale);
    ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));

    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 24);
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    g.addColorStop(0, 'rgba(15,40,64,0.96)');
    g.addColorStop(1, 'rgba(3,14,28,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,200,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 顶部高光，营造与按钮一致的立体凸起感
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 24);
    ctx.clip();
    const hg = ctx.createLinearGradient(0, c.y, 0, c.y + 46);
    hg.addColorStop(0, 'rgba(255,255,255,0.18)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(c.x, c.y, c.w, 46);
    ctx.restore();

    // 表头：标题（淡蓝立体底板 + 两字拉开间距 + 立体文字）+ 分割线
    const ty = c.y + 38;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('700', 24);
    const chW = ctx.measureText('设').width;
    const chGap = 8; // 两字间距
    const cxTitle = c.x + c.w / 2;
    const x1 = cxTitle - chW / 2 - chGap / 2;
    const x2 = cxTitle + chW / 2 + chGap / 2;
    // 通栏淡蓝底板：从卡片最顶铺到第一个开关行的上沿，左右铺满卡片两侧
    // （开关蓝 rgba(125,200,255)，仅装饰、不可交互）
    const headH = this.settingsRows.music.y - c.y;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 24);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, headH);
    const pg = ctx.createLinearGradient(0, c.y, 0, c.y + headH);
    pg.addColorStop(0, 'rgba(125,200,255,0.9)');
    pg.addColorStop(1, 'rgba(125,200,255,0.55)');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();
    // 立体文字：底部暗影 + 亮色主体
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('设', x1, ty + 1.5);
    ctx.fillText('置', x2, ty + 1.5);
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('设', x1, ty);
    ctx.fillText('置', x2, ty);

    const s = this.app.uiState;
    this._drawSettingsRow(ctx, this.settingsRows.music, '音乐', null, !!s.musicOn, 'music');
    this._drawSettingsRow(ctx, this.settingsRows.sound, '音效', null, !!s.soundOn, 'sound');
    this._drawSettingsRow(ctx, this.settingsRows.vibrate, '震动', null, !!s.vibrate, 'vibrate');

    // 底部居中“返回游戏”按钮
    const b = this.settingsCloseBtn;
    if (b) this._drawPanelButton(ctx, b, '返回游戏', '#58d97e', '#2fae5c', this.pressId === 'settingsClose', true, now, '#fff', 19, 4);

    ctx.restore();
  }

  // DEV-JUMP（临时）：跳关面板绘制，测试结束后连同本方法一并删除
  _drawDev(ctx, now) {
    const L = this.layout;
    const c = this.devCard;
    const dev = this.app.uiState.dev;
    if (!c || !dev) return;

    ctx.save();
    ctx.fillStyle = 'rgba(2,10,22,0.72)';
    ctx.fillRect(0, 0, L.width, L.height);

    // 卡片
    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 24);
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    g.addColorStop(0, 'rgba(15,40,64,0.96)');
    g.addColorStop(1, 'rgba(3,14,28,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,200,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('700', 19);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('跳转关卡', c.x + c.w / 2, c.y + 34);
    ctx.font = rf('400', 11);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('开发测试用 · 测试结束后移除', c.x + c.w / 2, c.y + 58);

    // 目标关卡显示
    const nb = this.devNumBox;
    ctx.beginPath();
    roundRectPath(ctx, nb.x, nb.y, nb.w, nb.h, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,200,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = rf('800', 26);
    ctx.fillStyle = '#ffe27a';
    ctx.fillText(`第 ${dev.sel} 关`, nb.x + nb.w / 2, nb.y + nb.h / 2);

    // 步进按钮 -10 / -1 / +1 / +10
    const steps = [['m10', '-10'], ['m1', '-1'], ['p1', '+1'], ['p10', '+10']];
    for (const [key, label] of steps) {
      const r = this.devStepBtns[key];
      ctx.beginPath();
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = 'rgba(125,200,255,0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,200,255,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = rf('600', 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    }

    // 快捷档位（当前选中高亮）
    ctx.font = rf('400', 11);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const mid = this.devPresetBtns[2];
    ctx.fillText('快捷跳转', mid.x + mid.w / 2, this.devPresetBtns[0].y - 10);
    for (const p of this.devPresetBtns) {
      const on = p.n === dev.sel;
      ctx.beginPath();
      roundRectPath(ctx, p.x, p.y, p.w, p.h, 10);
      ctx.fillStyle = on ? 'rgba(255,226,122,0.85)' : 'rgba(125,200,255,0.14)';
      ctx.fill();
      ctx.font = rf('600', 13);
      ctx.fillStyle = on ? 'rgba(3,14,28,0.9)' : 'rgba(255,255,255,0.85)';
      ctx.fillText(String(p.n), p.x + p.w / 2, p.y + p.h / 2);
    }

    // 底部：跳转（绿，松手生效）/ 关闭
    this._drawPanelButton(ctx, this.devGoBtn, '跳转', '#58d97e', '#2fae5c', this.pressId === 'devGo', true, now, '#fff');
    this._drawPanelButton(ctx, this.devCloseBtn, '关闭', '#a8bdd0', '#78909c', false, false, now, '#fff');

    ctx.restore();
  }

  // 设置面板底部按钮：圆角胶囊、文字居中，press 时轻微缩小并提亮，
  // pulse 时（未按压）做轻微呼吸放大效果
  // fontSize / letterSpacing 可选：用于通关界面“下一关”等需要更大、更舒展字距的场景
  _drawPanelButton(ctx, btn, label, c0, c1, pressed, pulse, now, textColor, fontSize = 15, letterSpacing = 0) {
    ctx.save();
    if (pressed) {
      ctx.globalAlpha = 0.92;
      ctx.translate(btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.scale(0.95, 0.95);
      ctx.translate(-(btn.x + btn.w / 2), -(btn.y + btn.h / 2));
    } else if (pulse && now) {
      const sc = 1 + 0.04 * Math.sin(now * 0.006);
      ctx.translate(btn.x + btn.w / 2, btn.y + btn.h / 2);
      ctx.scale(sc, sc);
      ctx.translate(-(btn.x + btn.w / 2), -(btn.y + btn.h / 2));
    }
    ctx.beginPath();
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, btn.h / 2);
    const g = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
    g.addColorStop(0, pressed ? this._lighten(c0) : c0);
    g.addColorStop(1, pressed ? this._lighten(c1) : c1);
    ctx.fillStyle = g;
    ctx.fill();
    // 顶部高光线，增加立体质感
    ctx.beginPath();
    roundRectPath(ctx, btn.x + 2, btn.y + 1.5, btn.w - 4, btn.h / 2, btn.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.save();
    ctx.fillStyle = textColor || '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('700', fontSize);
    if (letterSpacing > 0) {
      const chars = String(label).split('');
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
      let x = btn.x + btn.w / 2 - total / 2;
      const y = btn.y + btn.h / 2 + 1;
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], x + widths[i] / 2, y);
        x += widths[i] + letterSpacing;
      }
    } else {
      ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    }
    ctx.restore();
    ctx.restore();
  }

  _lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + 28);
    const g = Math.min(255, ((n >> 8) & 255) + 28);
    const b = Math.min(255, (n & 255) + 28);
    return `rgb(${r},${g},${b})`;
  }

  // One option row in the settings panel: label + (toggle switch | hint text).
  _drawSettingsRow(ctx, row, label, hint, on, icon) {
    if (!row) return;
    ctx.beginPath();
    roundRectPath(ctx, row.x, row.y, row.w, row.h, 14);
    const rg = ctx.createLinearGradient(0, row.y, 0, row.y + row.h);
    rg.addColorStop(0, 'rgba(255,255,255,0.07)');
    rg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 圆形图标徽章
    const ix = row.x + 28, iy = row.y + row.h / 2;
    ctx.beginPath();
    ctx.arc(ix, iy, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,200,255,0.16)';
    ctx.fill();
    if (icon) this._drawRowIcon(ctx, icon, ix, iy, 18, '#bfe3ff');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = rf('600', 15);
    ctx.fillText(label, row.x + 54, row.y + row.h / 2 + 0.5);
    if (on === null) {
      // action row (重开)
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(234,246,255,0.6)';
      ctx.font = rf('500', 12);
      ctx.fillText(hint || '', row.x + row.w - 16, row.y + row.h / 2 + 0.5);
    } else {
      // 精致开关：开启渐变轨道 + 带柔影的滑块
      const swW = 46, swH = 26;
      const sx = row.x + row.w - 16 - swW;
      const sy = row.y + (row.h - swH) / 2;
      ctx.beginPath();
      roundRectPath(ctx, sx, sy, swW, swH, swH / 2);
      if (on) {
        ctx.fillStyle = 'rgba(125,200,255,0.9)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
      }
      ctx.fill();
      const knobR = (swH - 6) / 2;
      const kx = on ? sx + swW - swH / 2 - 3 : sx + swH / 2 + 3;
      const ky = sy + swH / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    }
  }

  // 设置行左侧小图标：music / sound / vibrate
  _drawRowIcon(ctx, type, cx, cy, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (type === 'music') {
      const r = s * 0.2;
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.1, cy + s * 0.16, r, r * 0.78, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.04, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.04, cy - s * 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.04, cy - s * 0.34);
      ctx.quadraticCurveTo(cx + s * 0.26, cy - s * 0.22, cx + s * 0.06, cy - s * 0.04);
      ctx.stroke();
    } else if (type === 'sound') {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.1);
      ctx.lineTo(cx - s * 0.12, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.05, cy - s * 0.28);
      ctx.lineTo(cx + s * 0.05, cy + s * 0.28);
      ctx.lineTo(cx - s * 0.12, cy + s * 0.1);
      ctx.lineTo(cx - s * 0.3, cy + s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, cy, s * 0.15, -0.7, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, cy, s * 0.28, -0.7, 0.7);
      ctx.stroke();
    } else if (type === 'vibrate') {
      const w = s * 0.32, h = s * 0.58;
      ctx.beginPath();
      roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, s * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.22);
      ctx.lineTo(cx, cy + h * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 - s * 0.14, cy - s * 0.14);
      ctx.lineTo(cx - w / 2 - s * 0.2, cy + s * 0.14);
      ctx.moveTo(cx + w / 2 + s * 0.14, cy - s * 0.14);
      ctx.lineTo(cx + w / 2 + s * 0.2, cy + s * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMsg(ctx, now) {
    const m = this.app.uiState.msg;
    if (!m || now >= m.until) return;
    const L = this.layout;
    // 淡入淡出：前 180ms 淡入，末尾 220ms 淡出
    const dur = m.dur || 2200;
    const remain = m.until - now;
    const elapsed = dur - remain;
    let a = 1;
    if (elapsed < 180) a = elapsed / 180;
    else if (remain < 220) a = remain / 220;
    a = Math.max(0, Math.min(1, a));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = rf('600', 15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (m.plain) {
      // 纯白文字，无底色框
      ctx.fillStyle = m.color || '#ffffff';
      ctx.fillText(m.text, L.width / 2, L.board.y + L.board.h - 24);
    } else {
      const tw = ctx.measureText(m.text).width;
      const w = tw + 32, h = 30;
      const x = (L.width - w) / 2;
      const y = L.board.y + L.board.h - h - 12;
      ctx.beginPath();
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = 'rgba(6,22,40,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = m.color || '#ffd54f';
      ctx.fillText(m.text, x + w / 2, y + h / 2 + 0.5);
    }
    ctx.restore();
  }

  _drawCoach(ctx) {
    const L = this.layout;
    ctx.fillStyle = 'rgba(2,10,22,0.72)';
    ctx.fillRect(0, 0, L.width, L.height);

    const cardW = Math.min(L.width * 0.86, 340);
    const cardH = 210;
    const cx = (L.width - cardW) / 2;
    const cy = (L.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, cx, cy, cardW, cardH, 24);
    const g = ctx.createLinearGradient(0, cy, 0, cy + cardH);
    g.addColorStop(0, 'rgba(13,36,58,0.92)');
    g.addColorStop(1, 'rgba(3,14,28,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = rf('600', 14);
    ctx.fillText('按住方块拖动，推动整排滑动', cx + cardW / 2, cy + 52);
    ctx.fillText('同款方块直线相对时，点击直接配对消除', cx + cardW / 2, cy + 86);

    const bw = 180, bh = 44;
    const bx = cx + (cardW - bw) / 2, by = cy + cardH - 66;
    ctx.beginPath();
    roundRectPath(ctx, bx, by, bw, bh, bh / 2);
    const g2 = ctx.createLinearGradient(0, by, 0, by + bh);
    g2.addColorStop(0, '#58d97e');
    g2.addColorStop(1, '#2fae5c');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = rf('700', 16);
    ctx.fillText('开始游戏', bx + bw / 2, by + bh / 2 + 1);
    this.coachBtn = { x: bx, y: by, w: bw, h: bh };
  }

  _drawWin(ctx, now) {
    const L = this.layout;
    const s = this.app.uiState;
    ctx.fillStyle = 'rgba(2,10,22,0.66)';
    ctx.fillRect(0, 0, L.width, L.height);

    this._updateConfetti(now);

    const cardW = Math.min(L.width * 0.84, 340);
    const cardH = 248;
    const cx = Math.round((L.width - cardW) / 2);
    const cy = Math.round((L.height - cardH) / 2);

    // 卡片（与设置面板同款：深蓝渐变 + 蓝边 + 圆角投影）
    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, cx, cy, cardW, cardH, 24);
    const g = ctx.createLinearGradient(0, cy, 0, cy + cardH);
    g.addColorStop(0, 'rgba(15,40,64,0.96)');
    g.addColorStop(1, 'rgba(3,14,28,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,200,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 顶部高光（与设置面板一致）
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, cx, cy, cardW, cardH, 24);
    ctx.clip();
    const hg = ctx.createLinearGradient(0, cy, 0, cy + 46);
    hg.addColorStop(0, 'rgba(255,255,255,0.18)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cx, cy, cardW, 46);
    ctx.restore();

    // 随机手绘图案（每局一个，作为通关纪念）：淡蓝圆角方块铺满，手绘图透明底居中
    const pat = (s.win && s.win.pattern) || 1;
    const sz = 76, r = 16;
    ctx.save();
    ctx.translate(cx + cardW / 2, cy + 50);
    // 淡蓝底（铺满至圆角边框，无内隙）
    roundRectPath(ctx, -sz / 2, -sz / 2, sz, sz, r);
    const bg = ctx.createLinearGradient(0, -sz / 2, 0, sz / 2);
    bg.addColorStop(0, '#bfe6fb');
    bg.addColorStop(1, '#7cbfe6');
    ctx.fillStyle = bg;
    ctx.fill();
    // 顶部高光，与按钮一致的立体感
    ctx.save();
    roundRectPath(ctx, -sz / 2, -sz / 2, sz, sz, r);
    ctx.clip();
    const sh = ctx.createLinearGradient(0, -sz / 2, 0, -sz / 2 + 30);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-sz / 2, -sz / 2, sz, 30);
    ctx.restore();
    // 手绘图案（透明底）居中铺设
    const img = RenderView.patternImage(pat);
    if (img && img.width) {
      const scale = sz / Math.max(img.width, img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, -sz / 2 + 5, -sz / 2 + 5, sz - 10, sz - 10, 22);
      ctx.clip();
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    // 描边
    ctx.beginPath();
    roundRectPath(ctx, -sz / 2, -sz / 2, sz, sz, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 标题（金色 + 暗影立体，圆润字体、整体下移）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = rf('700', 26);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText('恭喜通关', cx + cardW / 2, cy + 128 + 1.5);
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('恭喜通关', cx + cardW / 2, cy + 128);

    // 副标题：刚通关的关卡（与标题一同下移）
    const cleared = Math.max(1, (s.level || 1) - 1);
    ctx.font = rf('500', 13);
    ctx.fillStyle = 'rgba(234,246,255,0.7)';
    ctx.fillText('第 ' + cleared + ' 关 完成', cx + cardW / 2, cy + 158);

    // 按钮：“下一关”（淡蓝底，与上方图案同色；圆润字体、加大、字距舒展，同款立体凸起）
    const bw = 180, bh = 56;
    const bx = cx + (cardW - bw) / 2, by = cy + cardH - 70;
    this.winBtn = { x: bx, y: by, w: bw, h: bh };
    this._drawPanelButton(ctx, this.winBtn, '下一关', '#58d97e', '#2fae5c', this.winPressId === 'winRestart', true, now, '#fff', 20, 8);
  }

  spawnConfetti() {
    const colors = ['#ffd54f', '#ff8a65', '#4fc3f7', '#81c784', '#ba68c8', '#fff176'];
    this.confetti = [];
    for (let i = 0; i < 34; i++) {
      this.confetti.push({
        x: Math.random() * this.layout.width,
        y: -20 - Math.random() * this.layout.height * 0.4,
        vx: (Math.random() - 0.5) * 60,
        vy: 90 + Math.random() * 90,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 8,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: colors[i % colors.length],
      });
    }
  }

  _updateConfetti(now) {
    if (!this.confetti.length) return;
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;
    const L = this.layout;
    const ctx = this.app.screenCtx;
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const p = this.confetti[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > L.height + 30) { this.confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(255,255,255,0.35)';
      ctx.shadowBlur = 6;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
}

module.exports = { UI, BTN_DEFS };
