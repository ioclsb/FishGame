// Canvas HUD for the Mini Game port. Replaces the DOM from the web version:
// progress ring + bar, five round icon buttons, message toast, first-run
// coach overlay and the win overlay (with confetti). Everything is drawn on
// the screen canvas and hit-tested through hitTest().

const { roundRectPath } = require('./view.js');

const BTN_DEFS = [
  { id: 'undo', label: '撤销' },
  { id: 'shuffle', label: '洗牌' },
  { id: 'hint', label: '提示' },
  { id: 'restart', label: '重开' },
  { id: 'sound', label: '声音' },
];

class UI {
  constructor(app) {
    this.app = app;
    this.layout = null;
    this.buttons = [];      // [{id, x, y, r}]
    this.ring = null;       // {x, y, r}
    this.progress = null;   // {x, y, w, h}
    this.coachBtn = null;   // {x, y, w, h}
    this.winBtn = null;     // {x, y, w, h}
    this.confetti = [];     // active confetti pieces
    this._lastT = 0;
  }

  setLayout(layout) {
    this.layout = layout;
    const W = layout.width;
    const topY = layout.safeTop;
    const hudH = layout.hudH;
    const cy = topY + hudH / 2;

    // progress ring
    const ringR = 20;
    this.ring = { x: 12 + ringR, y: cy, r: ringR };
    // buttons right-aligned
    const btnR = 20;
    const gap = Math.max(4, Math.round(W * 0.012));
    const btnArea = BTN_DEFS.length * (btnR * 2) + (BTN_DEFS.length - 1) * gap;
    const startX = W - 10 - btnArea;
    this.buttons = BTN_DEFS.map((b, i) => ({
      id: b.id,
      x: startX + btnR + i * (btnR * 2 + gap),
      y: cy,
      r: btnR,
    }));
    // progress label + bar fill the space between ring and buttons
    const barX = this.ring.x + ringR + 10;
    const barW = Math.max(20, startX - barX - 8);
    this.progress = { x: barX, y: cy - 14, w: barW, h: 10, labelY: cy + 4 };

    // board rect (computed by App, reused for hit-testing)
    this.boardRect = layout.board;

    // overlay buttons are sized from the board card each render (store a
    // default and refine on first draw)
    this.coachBtn = null;
    this.winBtn = null;
  }

  // ---- hit testing ------------------------------------------------------
  // Returns a descriptor consumed by App.handleTap:
  //   { zone:'overlay', id } | { zone:'button', id } | { zone:'board' } | null
  hitTest(x, y) {
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
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return { zone: 'button', id: b.id };
    }
    const br = this.boardRect;
    if (x >= br.x && x <= br.x + br.size && y >= br.y && y <= br.y + br.size) {
      return { zone: 'board' };
    }
    return null;
  }

  // ---- rendering --------------------------------------------------------
  render(ctx, now) {
    if (!this.layout) return;
    const L = this.layout;
    ctx.clearRect(0, 0, L.width, L.height);

    // page background
    const bg = ctx.createLinearGradient(0, 0, 0, L.height);
    bg.addColorStop(0, '#123a5c');
    bg.addColorStop(0.55, '#0b2743');
    bg.addColorStop(1, '#071a30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.width, L.height);

    // board
    const br = L.board;
    if (this.app.view && this.app.view.canvas) {
      ctx.drawImage(this.app.view.canvas, br.x, br.y, br.size, br.size);
    }

    this._drawHud(ctx, now);
    this._drawMsg(ctx, now);
    if (this.app.coachVisible()) this._drawCoach(ctx);
    if (this.app.winVisible()) this._drawWin(ctx, now);
  }

  _drawHud(ctx, now) {
    const s = this.app.uiState;
    const ring = this.ring;
    if (!ring) return;

    // ring track
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 5;
    ctx.stroke();
    // ring progress
    const pct = s.progress.pct;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r - 3, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,213,79,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // ring count
    ctx.fillStyle = '#ffd54f';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.progress.cleared), ring.x, ring.y + 0.5);

    // label + bar
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 11px sans-serif';
    let label = `进度 ${s.progress.cleared}/${s.progress.total}`;
    ctx.textAlign = 'left';
    if (ctx.measureText(label).width > this.progress.w + 6) {
      label = `${s.progress.cleared}/${s.progress.total}`;
    }
    ctx.fillText(label, this.progress.x, this.progress.labelY);
    const bx = this.progress.x, by = this.progress.y;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRectPath(ctx, bx, by, this.progress.w, this.progress.h, this.progress.h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,213,79,0.9)';
    if (pct > 1.5) {
      roundRectPath(ctx, bx, by, Math.max(4, this.progress.w * pct / 100), this.progress.h, this.progress.h / 2);
      ctx.fill();
    }

    // buttons
    for (const b of this.buttons) {
      const active = b.id === 'sound' && !s.soundOn;
      const attention = b.id === 'shuffle' && s.stuck;
      // When the board has no moves left, the shuffle button pulses (parity
      // with the web version's attnPulse animation).
      const pulse = attention ? 1 + 0.045 * Math.sin(now * 0.007) : 1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.translate(-b.x, -b.y);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(30,58,88,0.6)' : (attention ? 'rgba(255,213,79,0.28)' : 'rgba(30,58,88,0.85)');
      ctx.fill();
      ctx.strokeStyle = attention ? 'rgba(255,213,79,0.65)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.55)' : '#fff';
      ctx.fillStyle = active ? 'rgba(255,255,255,0.55)' : '#fff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this._drawIcon(ctx, b.id, s);
      ctx.restore();
    }
  }

  _drawIcon(ctx, id, s) {
    const u = 24; // icon draw box 24x24, centered on 0,0
    ctx.scale(0.85, 0.85);
    const L = (x, y, x2, y2) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); };
    const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
    const half = u / 2;
    switch (id) {
      case 'undo':
        P([-6, 4, -11, -1, -6, -6]);
        ctx.beginPath();
        ctx.moveTo(-11, -1);
        ctx.lineTo(1, -1);
        ctx.arc(1, -1, 7.5, Math.PI * 1.6, Math.PI * 2.9);
        ctx.stroke();
        break;
      case 'shuffle':
        P([-10, 7, -7.5, 7]);
        ctx.beginPath();
        ctx.moveTo(-7.5, 7);
        ctx.quadraticCurveTo(-2, 7, 1, 1);
        ctx.lineTo(5, -4);
        ctx.quadraticCurveTo(7.5, -8, 10, -8);
        ctx.stroke();
        P([7, -4, 10, -8, 12, -5]);
        P([-10, -8, -6.5, -8]);
        ctx.beginPath();
        ctx.moveTo(-6.5, -8);
        ctx.quadraticCurveTo(-1, -8, 2, -2);
        ctx.lineTo(6, 5);
        ctx.quadraticCurveTo(8, 9, 10, 9);
        ctx.stroke();
        P([7, 5, 10, 9, 12, 6]);
        break;
      case 'hint':
        ctx.beginPath();
        ctx.moveTo(3, 2);
        ctx.quadraticCurveTo(6, -3, 3.5, -8);
        ctx.arc(0, -7, 6, Math.PI * 0.5, Math.PI * 1.4, false);
        ctx.quadraticCurveTo(-3.5, -2.5, -3.5, 2);
        ctx.closePath();
        ctx.stroke();
        L(-1.5, 6, 1.5, 6);
        L(-0.5, 9, 0.5, 9);
        break;
      case 'restart':
        ctx.beginPath();
        ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6.5, -6.5);
        ctx.lineTo(6.5, -1);
        ctx.lineTo(2, -4.5);
        ctx.stroke();
        break;
      case 'sound': {
        P([-3, -6, -6, -6, -6, 0, -3, 0]);
        ctx.lineTo(0, 0);
        ctx.quadraticCurveTo(1, 0, 2, 1);
        ctx.stroke();
        if (s.soundOn) {
          ctx.beginPath();
          ctx.arc(-1, -3, 3.5, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(-1, -3, 6.5, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
        } else {
          L(-1.5, -5.5, -0.5, -0.5);
          L(-0.5, -5.5, -1.5, -0.5);
        }
        break;
      }
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
    const y = L.board.y + L.board.size - h - 12;
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