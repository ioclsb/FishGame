// Canvas HUD for the Mini Game port. Replaces the DOM from the web version:
// a row of four round icon buttons (undo / shuffle / hint / settings) below
// the board, progress bar + label (above the board), message toast, first-run
// coach overlay, the win overlay (with confetti) and the settings panel.
// Everything is drawn on the screen canvas and hit-tested through hitTest().

const { roundRectPath, RenderView } = require('./view.js');
const { shade } = require('./creatures.js');

// 圆润字体栈（设备不支持圆体时回退到常规无衬线）
const ROUND_FONT = "'Yuanti SC','YouYuan','PingFang SC','Microsoft YaHei',sans-serif";
const rf = (weight, size) => `${weight} ${size}px ${ROUND_FONT}`;

const BTN_DEFS = [
  { id: 'undo', label: '撤销' },
  { id: 'shuffle', label: '打乱' },
  { id: 'hint', label: '提示' },
  { id: 'settings', label: '设置' },
];

// Card colors for the icon buttons — a deep blue echoing the board water.
const BTN_COLORS = {
  undo: '#15405c',
  shuffle: '#15405c',
  hint: '#15405c',
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
    this.pressId = null; // 底部按钮按压反馈：'settingsRestart' | 'settingsClose'
    this.winPressId = null; // 结算“再来一局”按压反馈
    this.confetti = [];         // active confetti pieces
    this.fishX = 0;             // animated fish position along the bar
    this._lastT = 0;
  }

  setLayout(layout) {
    this.layout = layout;
    const W = layout.width;
    const board = layout.board;

    // settings lives in the button row now; no corner button
    this.settingsBtn = null;

    // progress label + bar: centered just above the board
    const barW = Math.min(Math.round(board.w * 0.72), 240);
    const barH = 10;
    const barX = Math.round((W - barW) / 2);
    const barY = board.y - 34;
    this.progress = { x: barX, y: barY, w: barW, h: barH, labelY: barY - 12 };

    // main buttons: 居中横向排布于棋盘下方，整体上移、与棋盘下边缘留出间距
    const btnR = W < 360 ? 20 : 23;
    const gap = Math.max(18, Math.round(W * 0.05));
    const btnArea = BTN_DEFS.length * (btnR * 2) + (BTN_DEFS.length - 1) * gap;
    const startX = Math.round((W - btnArea) / 2);
    const bottomLine = layout.height - (layout.safeBottom || 0);
    const areaH = bottomLine - (board.y + board.h);
    // 上移：从棋盘下边缘留一点间距起步，但保证按钮下方文字不超出屏幕
    const fromBoard = Math.max(12, Math.round(areaH * 0.20));
    let btnY = board.y + board.h + fromBoard + btnR;
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
    const cardW = Math.min(W * 0.8, 320);
    const cardH = 300;
    const c = { x: Math.round((W - cardW) / 2), y: Math.round((H - cardH) / 2), w: cardW, h: cardH };
    const rowX = c.x + 20;
    const rowW = cardW - 40;
    const rowH = 40;
    this.settingsCard = c;
    this.settingsRows = {
      music:   { x: rowX, y: c.y + 78, w: rowW, h: rowH },
      sound:   { x: rowX, y: c.y + 126, w: rowW, h: rowH },
      vibrate: { x: rowX, y: c.y + 174, w: rowW, h: rowH },
    };
    const bh = 44;
    const gap = 12;
    const bw = Math.round((rowW - gap) / 2);
    this.settingsRestartBtn = { x: c.x + 20, y: c.y + cardH - 64, w: bw, h: bh };
    this.settingsCloseBtn = { x: c.x + 20 + bw + gap, y: c.y + cardH - 64, w: bw, h: bh };
  }

  // ---- hit testing ------------------------------------------------------
  // Returns a descriptor consumed by App.handleTap:
  //   { zone:'overlay', id } | { zone:'button', id } | { zone:'board' } | null
  hitTest(x, y) {
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
    if (this.app.coachVisible()) this._drawCoach(ctx);
    if (this.app.winVisible()) this._drawWin(ctx, now);
    if (this.app.settingsVisible()) this._drawSettings(ctx, now);
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
    ctx.fillStyle = 'rgba(2,10,22,0.72)';
    ctx.fillRect(0, 0, L.width, L.height);

    const c = this.settingsCard;
    if (!c) return;

    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 22);
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
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
    ctx.font = rf('700', 17);
    ctx.fillText('设置', c.x + c.w / 2, c.y + 42);

    const s = this.app.uiState;
    this._drawSettingsRow(ctx, this.settingsRows.music, '音乐', null, !!s.musicOn, 'music');
    this._drawSettingsRow(ctx, this.settingsRows.sound, '音效', null, !!s.soundOn, 'sound');
    this._drawSettingsRow(ctx, this.settingsRows.vibrate, '震动', null, !!s.vibrate, 'vibrate');

    // 底部一排按钮：左“重新开始”（黄）、右“返回游戏”（呼吸缩放）
    const rb = this.settingsRestartBtn;
    if (rb) this._drawPanelButton(ctx, rb, '重新开始', '#ffd54f', '#f5b400', this.pressId === 'settingsRestart', false, now, '#ffffff');
    const b = this.settingsCloseBtn;
    if (b) this._drawPanelButton(ctx, b, '返回游戏', '#58d97e', '#2fae5c', this.pressId === 'settingsClose', true, now, '#fff');
  }

  // 设置面板底部按钮：圆角胶囊、文字居中，press 时轻微缩小并提亮，
  // pulse 时（未按压）做轻微放大缩小呼吸效果
  _drawPanelButton(ctx, btn, label, c0, c1, pressed, pulse, now, textColor) {
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
      ctx.fillStyle = textColor || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = rf('700', 15);
      ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
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
    roundRectPath(ctx, row.x, row.y, row.w, row.h, row.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    if (icon) this._drawRowIcon(ctx, icon, row.x + 22, row.y + row.h / 2, 20, 'rgba(234,246,255,0.94)');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = rf('600', 15);
    ctx.fillText(label, row.x + 44, row.y + row.h / 2 + 0.5);
    if (on === null) {
      // action row (重开)
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(234,246,255,0.6)';
      ctx.font = rf('500', 12);
      ctx.fillText(hint || '', row.x + row.w - 16, row.y + row.h / 2 + 0.5);
    } else {
      // toggle switch
      const swW = 44, swH = 24;
      const sx = row.x + row.w - 16 - swW;
      const sy = row.y + (row.h - swH) / 2;
      ctx.beginPath();
      roundRectPath(ctx, sx, sy, swW, swH, swH / 2);
      ctx.fillStyle = on ? 'rgba(125,200,255,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.fill();
      const kx = on ? sx + swW - swH + 2 : sx + 2;
      ctx.beginPath();
      ctx.arc(kx + (swH - 4) / 2, sy + swH / 2, (swH - 4) / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
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

    // confetti
    this._updateConfetti(now);

    const cardW = Math.min(L.width * 0.8, 320);
    const cardH = 210;
    const cx = (L.width - cardW) / 2;
    const cy = (L.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, cx, cy, cardW, cardH, 26);
    const g = ctx.createLinearGradient(0, cy, 0, cy + cardH);
    g.addColorStop(0, 'rgba(13,36,58,0.9)');
    g.addColorStop(1, 'rgba(3,14,28,0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // trophy
    ctx.save();
    ctx.translate(cx + cardW / 2, cy + 46);
    this._drawTrophy(ctx);
    ctx.restore();

    // 标题（去掉用时/消除/提示/最佳等成绩统计）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd54f';
    ctx.font = rf('800', 26);
    ctx.fillText('恭喜通关', cx + cardW / 2, cy + 104);

    // “再来一局”：按压时缩小、平时轻微呼吸缩放（放大缩小效果）
    const bw = 170, bh = 46;
    const bx = cx + (cardW - bw) / 2, by = cy + cardH - 58;
    const pressing = this.winPressId === 'winRestart';
    const sc = pressing ? 0.94 : (1 + 0.04 * Math.sin(now * 0.006));
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.scale(sc, sc);
    ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    ctx.beginPath();
    roundRectPath(ctx, bx, by, bw, bh, bh / 2);
    const g2 = ctx.createLinearGradient(0, by, 0, by + bh);
    g2.addColorStop(0, '#58d97e');
    g2.addColorStop(1, '#2fae5c');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = rf('700', 16);
    ctx.fillText('再来一局', bx + bw / 2, by + bh / 2 + 1);
    ctx.restore();
    this.winBtn = { x: bx, y: by, w: bw, h: bh };
  }

  _drawTrophy(ctx) {
    ctx.scale(0.9, 0.9);
    ctx.beginPath();
    ctx.moveTo(-12, -26); ctx.lineTo(12, -26); ctx.lineTo(12, -10);
    ctx.arc(0, -10, 12, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#ffe27a';
    ctx.fill();
    ctx.strokeStyle = '#f0a51e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#c8871a';
    ctx.fillRect(-7, -6, 14, 6);
    ctx.beginPath();
    roundRectPath(ctx, -9, 0, 18, 8, 3);
    ctx.fillStyle = '#ffe27a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -18, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
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