// Canvas HUD for the Mini Game port. Replaces the DOM from the web version:
// settings button (top-left), progress bar + label (above the board), five
// round icon buttons (below the board), message toast, first-run coach
// overlay, the win overlay (with confetti) and the settings panel. Everything
// is drawn on the screen canvas and hit-tested through hitTest().

const { roundRectPath } = require('./view.js');
const { shade } = require('./creatures.js');

const BTN_DEFS = [
  { id: 'undo', label: '撤销' },
  { id: 'shuffle', label: '洗牌' },
  { id: 'hint', label: '提示' },
];

// Card colors for the 3D icon buttons (echo the six creature palette).
const BTN_COLORS = {
  undo: '#2f6fe0',
  shuffle: '#2fae66',
  hint: '#f5b52e',
  settings: '#8e5cf0',
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
    this.confetti = [];         // active confetti pieces
    this.fishX = 0;             // animated fish position along the bar
    this._lastT = 0;
  }

  setLayout(layout) {
    this.layout = layout;
    const W = layout.width;
    const safeTop = layout.safeTop;
    const board = layout.board;

    // settings button: top-left corner
    const sR = 20;
    this.settingsBtn = { x: 12 + sR, y: safeTop + 12 + sR, r: sR };

    // progress label + bar: centered just above the board
    const barW = Math.min(Math.round(board.w * 0.72), 240);
    const barH = 10;
    const barX = Math.round((W - barW) / 2);
    const barY = board.y - 34;
    this.progress = { x: barX, y: barY, w: barW, h: barH, labelY: barY - 12 };

    // main buttons: centered below the board
    const btnR = W < 360 ? 17 : 19;
    const gap = Math.max(12, Math.round(W * 0.03));
    const btnArea = BTN_DEFS.length * (btnR * 2) + (BTN_DEFS.length - 1) * gap;
    const startX = Math.round((W - btnArea) / 2);
    const bottomLine = layout.height - (layout.safeBottom || 0);
    const btnY = Math.round(board.y + board.h + (bottomLine - (board.y + board.h)) / 2);
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
      sound:   { x: rowX, y: c.y + 78, w: rowW, h: rowH },
      vibrate: { x: rowX, y: c.y + 126, w: rowW, h: rowH },
      restart: { x: rowX, y: c.y + 174, w: rowW, h: rowH },
    };
    const bw = 140, bh = 44;
    this.settingsCloseBtn = { x: c.x + Math.round((cardW - bw) / 2), y: c.y + cardH - 64, w: bw, h: bh };
  }

  // ---- hit testing ------------------------------------------------------
  // Returns a descriptor consumed by App.handleTap:
  //   { zone:'overlay', id } | { zone:'button', id } | { zone:'board' } | null
  hitTest(x, y) {
    if (this.app.settingsVisible()) {
      const rows = this.settingsRows;
      if (rows) {
        for (const key of ['sound', 'vibrate', 'restart']) {
          const row = rows[key];
          if (row && x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) {
            return { zone: 'overlay', id: 'settings' + key.charAt(0).toUpperCase() + key.slice(1) };
          }
        }
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
    if (this.settingsBtn) {
      const dx = x - this.settingsBtn.x, dy = y - this.settingsBtn.y;
      if (dx * dx + dy * dy <= this.settingsBtn.r * this.settingsBtn.r) return { zone: 'button', id: 'settings' };
    }
    for (const b of this.buttons) {
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
  _boardRadius(w, h) {
    return Math.min(28, Math.round(Math.min(w, h) * 0.045));
  }

  // Rounded frame around the board: a thin dark outer rim for depth plus a
  // soft sky-blue border that echoes the ocean background.
  _drawBoardFrame(ctx, br, r) {
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1, r);
    ctx.strokeStyle = 'rgba(6,18,34,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, br.x + 1, br.y + 1, br.w - 2, br.h - 2, r);
    ctx.strokeStyle = 'rgba(120,190,255,0.38)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(90,175,255,0.35)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  // ---- rendering --------------------------------------------------------
  render(ctx, now) {
    if (!this.layout) return;
    const L = this.layout;
    ctx.clearRect(0, 0, L.width, L.height);

    // page background
    const bg = ctx.createLinearGradient(0, 0, 0, L.height);
    bg.addColorStop(0, '#2476b0');
    bg.addColorStop(0.55, '#185788');
    bg.addColorStop(1, '#11446b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.width, L.height);

    // board (rounded clip + theme-colored frame)
    const br = L.board;
    if (this.app.view && this.app.view.canvas) {
      const r = this._boardRadius(br.w, br.h);
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, br.x, br.y, br.w, br.h, r);
      ctx.clip();
      ctx.drawImage(this.app.view.canvas, br.x, br.y, br.w, br.h);
      ctx.restore();
      this._drawBoardFrame(ctx, br, r);
    }

    this._drawHud(ctx, now);
    this._drawMsg(ctx, now);
    if (this.app.coachVisible()) this._drawCoach(ctx);
    if (this.app.winVisible()) this._drawWin(ctx, now);
    if (this.app.settingsVisible()) this._drawSettings(ctx);
  }

  _drawHud(ctx, now) {
    const s = this.app.uiState;

    // settings button (top-left, 3D card + gear glyph)
    const sb = this.settingsBtn;
    if (sb) {
      this._drawIconCard(ctx, sb.x, sb.y, sb.r, BTN_COLORS.settings);
      ctx.save();
      ctx.translate(sb.x, sb.y);
      this._drawIcon(ctx, 'settings', s);
      ctx.restore();
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
      // percentage fixed right of the bar end so the fish never covers it
      const fy = p.y + p.h / 2;
      const pctX = Math.min(p.x + p.w + 40, this.layout.width - 8);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 13px sans-serif';
      ctx.fillText(`${Math.round(pct)}%`, pctX, fy);
      // level badge above the bar
      this._drawLevelBadge(ctx, p.x + p.w / 2, p.y - 16);
      // fish swimming along the bar following progress
      this._drawBarFish(ctx, this.fishX, fy, now);
    }

    // main buttons: 3D card row below the board
    for (const b of this.buttons) {
      const attention = b.id === 'shuffle' && s.stuck;
      // When the board has no moves left, the shuffle button pulses (parity
      // with the web version's attnPulse animation).
      const pulse = attention ? 1 + 0.05 * Math.sin(now * 0.007) : 1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.translate(-b.x, -b.y);
      this._drawIconCard(ctx, b.x, b.y, b.r, BTN_COLORS[b.id] || BTN_COLORS.settings);
      ctx.translate(b.x, b.y);
      this._drawIcon(ctx, b.id, s);
      ctx.restore();

      // text description below the button
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '500 11px sans-serif';
      ctx.fillText(b.label, b.x, b.y + b.r + 13);
    }
  }

  // Level badge: small flag icon + "第 N 关", centered above the progress bar.
  _drawLevelBadge(ctx, cx, cy) {
    const level = this.app.uiState.level || 1;
    const label = `第 ${level} 关`;
    ctx.font = '600 12px sans-serif';
    const tw = ctx.measureText(label).width;
    const totalW = 16 + 6 + tw;
    const x0 = Math.round(cx - totalW / 2);
    // flag: pole + pennant
    ctx.strokeStyle = 'rgba(234,246,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + 2, cy - 8);
    ctx.lineTo(x0 + 2, cy + 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(125,200,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(x0 + 2, cy - 8);
    ctx.lineTo(x0 + 14, cy - 5);
    ctx.lineTo(x0 + 2, cy - 2);
    ctx.closePath();
    ctx.fill();
    // label
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(label, x0 + 18, cy);
  }

  // Small fish swimming on the progress bar: bobs gently and wags its tail.
  _drawBarFish(ctx, x, y, now) {
    const bob = Math.sin(now * 0.006) * 1.8;
    const wag = Math.sin(now * 0.012) * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    // tail
    ctx.beginPath();
    ctx.moveTo(-6.5, -2.5);
    ctx.lineTo(-10, -5 + wag);
    ctx.lineTo(-10, 5 + wag);
    ctx.lineTo(-6.5, 2.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,190,100,0.95)';
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(130,205,255,0.95)';
    ctx.fill();
    // eye
    ctx.beginPath();
    ctx.arc(3.5, -1, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0b2743';
    ctx.fill();
    ctx.restore();
  }

  // Glossy 3D circular card behind each icon: radial-gradient sphere, drop
// shadow, subtle bottom rim and a top-left specular highlight.
  _drawIconCard(ctx, x, y, r, color) {
    ctx.save();
    // drop shadow
    ctx.beginPath();
    ctx.arc(x, y + r * 0.14, r * 0.98, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(3,12,24,0.55)';
    ctx.shadowBlur = r * 0.4;
    ctx.fillStyle = 'rgba(3,12,24,0)';
    ctx.fill();
    // glossy sphere body
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.15, x, y, r * 1.05);
    g.addColorStop(0, shade(color, 54));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -34));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // bottom rim shadow
    ctx.beginPath();
    ctx.arc(x, y + r * 0.03, r * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(6,18,34,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // top specular highlight
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.4, r * 0.42, r * 0.24, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fill();
    ctx.restore();
  }

  // White bold glyph drawn on top of the 3D circle (0,0 centered). Glyphs are
  // chunky and cute: an undo arrow with a smiley, crossed fat shuffle arrows,
  // a smiling lightbulb for hints and a smiling gear for settings.
  _drawIcon(ctx, id, s) {
    const L = (x, y, x2, y2) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); };
    switch (id) {
      case 'undo': {
        // chunky curved back arrow with a happy face in the curl
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.arc(0.5, 0.5, 6.4, -Math.PI * 0.7, Math.PI * 0.42);
        ctx.stroke();
        // rounded arrowhead
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-3.6, -5.6, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-5.4, -4.6);
        ctx.lineTo(-8.4, -1.4);
        ctx.lineTo(-3.4, -1.7);
        ctx.closePath();
        ctx.fill();
        // smiley face in the open area
        ctx.beginPath();
        ctx.arc(-0.4, 3.6, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3.6, 1.8, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(1.6, 4.6, 2.2, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      }
      case 'shuffle': {
        // two crossed fat arrows (up-right / down-left)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-5.5, 5.5);
        ctx.lineTo(5.5, -5.5);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(2.2, -5.4);
        ctx.lineTo(6.6, -6.6);
        ctx.lineTo(5.4, -2.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(5.5, 5.5);
        ctx.lineTo(-5.5, -5.5);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-2.2, 5.4);
        ctx.lineTo(-6.6, 6.6);
        ctx.lineTo(-5.4, 2.2);
        ctx.closePath();
        ctx.fill();
        // sparkle star at the crossing
        ctx.beginPath();
        ctx.moveTo(0, -3.4);
        ctx.lineTo(1, -1);
        ctx.lineTo(3.4, 0);
        ctx.lineTo(1, 1);
        ctx.lineTo(0, 3.4);
        ctx.lineTo(-1, 1);
        ctx.lineTo(-3.4, 0);
        ctx.lineTo(-1, -1);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'hint': {
        // smiling lightbulb with glow rays and a sparkle
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.2;
        L(0, -7.4, 0, -10.4);
        L(-5.6, -5, -8.2, -7.2);
        L(5.6, -5, 8.2, -7.2);
        // bulb
        ctx.beginPath();
        ctx.arc(0, -1.8, 6, Math.PI, 0);
        ctx.lineTo(3.7, 4.4);
        ctx.quadraticCurveTo(0, 6.6, -3.7, 4.4);
        ctx.closePath();
        ctx.fill();
        // cute face
        ctx.fillStyle = 'rgba(120,84,20,0.9)';
        ctx.beginPath();
        ctx.arc(-2.3, -1.4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.3, -1.4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,84,20,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0.9, 2.6, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
        // sparkle star near the bulb
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4;
        L(-1.2, -8.8, 1.2, -8.8);
        L(0, -10, 0, -7.6);
        break;
      }
      case 'settings': {
        // smiling gear
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 5.4, Math.sin(a) * 5.4);
          ctx.lineTo(Math.cos(a) * 8.4, Math.sin(a) * 8.4);
          ctx.stroke();
        }
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
        ctx.stroke();
        // smiley face in the hub
        ctx.beginPath();
        ctx.arc(-1.6, -1.3, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(1.6, -1.3, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0.5, 1.9, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      }
    }
  }

  _drawSettings(ctx) {
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
    g.addColorStop(0, 'rgba(28,64,102,0.92)');
    g.addColorStop(1, 'rgba(10,30,54,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = '700 17px sans-serif';
    ctx.fillText('设置', c.x + c.w / 2, c.y + 42);

    const s = this.app.uiState;
    this._drawSettingsRow(ctx, this.settingsRows.sound, '声音', null, !!s.soundOn);
    this._drawSettingsRow(ctx, this.settingsRows.vibrate, '震动', null, !!s.vibrate);
    this._drawSettingsRow(ctx, this.settingsRows.restart, '重开', '重新开始本关', null);

    const b = this.settingsCloseBtn;
    if (b) {
      ctx.beginPath();
      roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2);
      const g2 = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g2.addColorStop(0, '#58d97e');
      g2.addColorStop(1, '#2fae5c');
      ctx.fillStyle = g2;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 15px sans-serif';
      ctx.fillText('关闭', b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }

  // One option row in the settings panel: label + (toggle switch | hint text).
  _drawSettingsRow(ctx, row, label, hint, on) {
    if (!row) return;
    ctx.beginPath();
    roundRectPath(ctx, row.x, row.y, row.w, row.h, row.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = '600 15px sans-serif';
    ctx.fillText(label, row.x + 16, row.y + row.h / 2 + 0.5);
    if (on === null) {
      // action row (重开)
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(234,246,255,0.6)';
      ctx.font = '500 12px sans-serif';
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

  _drawMsg(ctx, now) {
    const m = this.app.uiState.msg;
    if (!m || now >= m.until) return;
    const L = this.layout;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (m.until - now) / 300);
    const size = 15;
    ctx.font = `600 ${size}px sans-serif`;
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
    ctx.fillStyle = '#ffd54f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.text, x + w / 2, y + h / 2 + 0.5);
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
    g.addColorStop(0, 'rgba(28,64,102,0.92)');
    g.addColorStop(1, 'rgba(10,30,54,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234,246,255,0.94)';
    ctx.font = '600 14px sans-serif';
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
    ctx.font = '700 16px sans-serif';
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
    const cardH = 230;
    const cx = (L.width - cardW) / 2;
    const cy = (L.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,5,15,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    roundRectPath(ctx, cx, cy, cardW, cardH, 26);
    const g = ctx.createLinearGradient(0, cy, 0, cy + cardH);
    g.addColorStop(0, 'rgba(28,64,102,0.9)');
    g.addColorStop(1, 'rgba(10,30,54,0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // trophy
    ctx.save();
    ctx.translate(cx + cardW / 2, cy + 48);
    this._drawTrophy(ctx);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd54f';
    ctx.font = '800 26px sans-serif';
    ctx.fillText('恭喜通关', cx + cardW / 2, cy + 108);

    ctx.fillStyle = 'rgba(234,246,255,0.85)';
    ctx.font = '500 13px sans-serif';
    ctx.fillText(s.win.statsText, cx + cardW / 2, cy + 138);

    const bw = 170, bh = 46;
    const bx = cx + (cardW - bw) / 2, by = cy + cardH - 66;
    ctx.beginPath();
    roundRectPath(ctx, bx, by, bw, bh, bh / 2);
    const g2 = ctx.createLinearGradient(0, by, 0, by + bh);
    g2.addColorStop(0, '#58d97e');
    g2.addColorStop(1, '#2fae5c');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px sans-serif';
    ctx.fillText('再来一局', bx + bw / 2, by + bh / 2 + 1);
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