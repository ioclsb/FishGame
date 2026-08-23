// RenderView ported from push-slide-match.html to the WeChat Mini Game
// canvas runtime. Changes vs the web version:
//  - canvases come from a global __createCanvas (game.js wires wx.createCanvas)
//  - creature sprites are baked SYNCHRONOUSLY with procedural canvas paths
//    (Mini Game canvases cannot decode SVG data-URIs)
//  - window.devicePixelRatio is supplied via the `platform` object
//  - document.hidden becomes platform.hidden()
//  - the internal rAF loop is replaced by an external tick(now) that the
//    app drives from a single frame loop
require('./debug.js');
const { G: GLOBAL } = require('./globals.js');
const { GameCore, ROWS, COLS } = require('./core.js');
const { drawCreature, shade } = require('./creatures.js');

const DEBUG = GLOBAL.__DEBUG_ENABLED === true;
const REDUCED_MOTION = GLOBAL.__REDUCED_MOTION === true;

function createCanvas() {
  if (typeof GLOBAL.__createCanvas === 'function') return GLOBAL.__createCanvas();
  return wx.createCanvas();
}

// ================= GEOMETRY =================
const G = { cell: 64, gap: 4, pitch: 68, boardW: 640, boardH: 640, dpr: 1 };
const DPR_CAP = 2;
const CELL_MAX = 80;

function computeLayout(availW, availH) {
  const w = Math.max(160, availW);
  const h = Math.max(160, availH);
  const gap = Math.max(2, Math.round(Math.min(w, h) * 0.006));
  const cellW = Math.floor((w - gap * (COLS - 1)) / COLS);
  const cellH = Math.floor((h - gap * (ROWS - 1)) / ROWS);
  const cell = Math.max(10, Math.min(cellW, cellH, CELL_MAX));
  G.gap = gap;
  G.cell = cell;
  G.pitch = cell + gap;
  G.boardW = cell * COLS + gap * (COLS - 1);
  G.boardH = cell * ROWS + gap * (ROWS - 1);
}

// ================= ART: OCEAN THEME =================
const PATTERN_COLORS = [
  '#f4772e', // clownfish      (orange)
  '#2f6fe0', // blue tang      (blue)
  '#2fae66', // sea turtle     (green)
  '#f5b52e', // pufferfish     (yellow)
  '#8e5cf0', // jellyfish      (violet)
  '#ef4d3d', // crab           (red)
];

function roundRectPath(ctx, x, y, w, h, r) {
  // NOTE: WeChat Mini Game canvases expose ctx.roundRect but only accept the
  // radii as a sequence, and scalar/other forms throw at runtime. The arcTo
  // fallback below is standard everywhere, so we never use ctx.roundRect here.
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class RenderView {
  // Returns a baked tile sprite (canvas) for the pattern at the current
  // geometry: glossy tile + creature composited synchronously.
  static spriteFor(pattern) {
    const geo = G.cell * 16 + Math.round(G.dpr * 4);
    let bucket = RenderView._sprites;
    if (!bucket || bucket.geo !== geo) {
      RenderView._sprites = bucket = { geo, entries: {} };
    }
    const entry = bucket.entries[pattern];
    if (entry) return entry;
    const base = RenderView._bakeTile(pattern);
    bucket.entries[pattern] = RenderView._bakeCreature(pattern, base);
    return bucket.entries[pattern];
  }

  static _tileCanvas() {
    const s = createCanvas();
    s.width = G.cell * G.dpr; s.height = G.cell * G.dpr;
    const ctx = s.getContext('2d');
    ctx.scale(G.dpr, G.dpr);
    return [s, ctx];
  }

  static _bakeTile(pattern) {
    RenderView._stats.tiles++;
    const color = PATTERN_COLORS[(pattern - 1) % PATTERN_COLORS.length];
    const [s, ctx] = RenderView._tileCanvas();
    const S = G.cell;
    const m = S * 0.04;
    const w = S - m * 2;
    const r = w * 0.30;

    ctx.save();
    ctx.shadowColor = 'rgba(4,16,30,0.45)';
    ctx.shadowBlur = S * 0.08;
    ctx.shadowOffsetY = S * 0.045;
    const grad = ctx.createLinearGradient(0, m, 0, m + w);
    grad.addColorStop(0, shade(color, 42));
    grad.addColorStop(1, shade(color, -26));
    ctx.fillStyle = grad;
    ctx.beginPath(); roundRectPath(ctx, m, m, w, w, r); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); roundRectPath(ctx, m + 1.5, m + 1.5, w - 3, w - 3, r - 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1.5, S * 0.03);
    ctx.stroke();
    ctx.beginPath(); roundRectPath(ctx, m + 3, m + 3, w - 6, w - 6, r - 3);
    ctx.strokeStyle = 'rgba(8,20,36,0.18)';
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, m + w * 0.10, m + w * 0.06, w * 0.80, w * 0.34, w * 0.17);
    ctx.clip();
    const gl = ctx.createLinearGradient(0, m, 0, m + w * 0.45);
    gl.addColorStop(0, 'rgba(255,255,255,0.42)');
    gl.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = gl;
    ctx.fillRect(m, m, w, w * 0.5);
    ctx.restore();

    return s;
  }

  static _bakeCreature(pattern, base) {
    RenderView._stats.creatures++;
    const [s, ctx] = RenderView._tileCanvas();
    ctx.drawImage(base, 0, 0, G.cell, G.cell);
    const inset = G.cell * 0.14;
    const size = G.cell - inset * 2;
    ctx.save();
    ctx.translate(inset, inset);
    ctx.scale(size / 100, size / 100);
    drawCreature(ctx, pattern);
    ctx.restore();
    return s;
  }

  // Soft radial particle (white core -> color -> transparent edge) baked once
  // per color so per-frame match bursts are plain drawImage calls instead of
  // creating one radial gradient per particle.
  static _particleSprite(color) {
    const key = color + ':' + G.dpr;
    let m = RenderView._partSprites;
    if (!m) m = RenderView._partSprites = { entries: {}, count: 0 };
    if (m.entries[key]) return m.entries[key];
    if (m.count > 48) m = RenderView._partSprites = { entries: {}, count: 0 };
    const D = 64;
    const s = createCanvas();
    s.width = Math.round(D * G.dpr); s.height = Math.round(D * G.dpr);
    const c = s.getContext('2d');
    c.scale(G.dpr, G.dpr);
    const cx = D / 2;
    const n = parseInt(color.slice(1), 16);
    const g = c.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.75)`);
    g.addColorStop(1, `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cx, cx, 0, Math.PI * 2);
    c.fill();
    m.entries[key] = s;
    m.count++;
    return s;
  }

  constructor(canvas, core, platform) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.core = core;
    this.platform = platform;
    this.dpr = platform.dpr;
    this.bg = null;
    this.drag = null;
    this.revert = null;
    this.elimFlash = null;
    this.hint = null;
    this.pick = null;
    this.bounce = null;
    this.onRevert = null;
    this.onMatchFx = null;
    this.hoverCell = null;
    this.particles = [];
    this.rings = [];
    this.floaters = [];
    this.pendingFx = [];
    this.bubbles = null;
    this.shake = null;
    this.freezeUntil = 0;
    this._freezeStart = 0;
    this._lastT = performance.now();
    this._lastRender = 0;
    this._lastFrameT = 0;
    this.spawnT0 = performance.now();
    this._animToken = 0;
    this.resize();
    this._buildBackground();
    this.render();
  }

  // External frame driver. App calls this once per rAF. Runs at full rate
  // while dragging / effects / hint / pick are live; idle it renders every
  // frame only when the whole frame is fast (<10ms incl. UI layer), otherwise
  // throttles to ~30fps so slow devices don't pile up work.
  tick(now) {
    if (RenderView._paused) return;
    if (this.platform.hidden()) return;
    this._updateEffects(now);
    // rolling frame-time stats for the debug overlay (fps / P95)
    const s = RenderView._stats;
    if (this._lastFrameT > 0) {
      s.dts.push(now - this._lastFrameT);
      if (s.dts.length > 300) s.dts.shift();
      s.frames++;
      if (s.frames % 30 === 0) {
        const avg = s.dts.reduce((a, b) => a + b, 0) / s.dts.length;
        s.fps = Math.round(1000 / Math.max(0.01, avg));
        const sorted = s.dts.slice().sort((a, b) => a - b);
        s.p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      }
      if (s.frames % 60 === 0) {
        console.log('[perf] fps=' + s.fps + ' p95=' + Math.round(s.p95) +
          'ms frame=' + Math.round(RenderView._frameCostMs * 100) / 100 + 'ms');
      }
    }
    this._lastFrameT = now;
    if (this.isBusyFrame() || RenderView._frameCostMs < 10 || now - this._lastRender >= 33) {
      this.render();
      this._lastRender = now;
    }
  }

  isBusyFrame() {
    return !!(this.drag || this.revert || this.pick || this.bounce ||
              this.hint || this.elimFlash ||
              this.particles.length > 0 || this.rings.length > 0);
  }

  static setPaused(p) { RenderView._paused = p; }

  _initBubbles() {
    this.bubbles = [];
    const n = Math.max(8, Math.round(G.boardW / 48));
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: Math.random() * G.boardW,
        y: Math.random() * G.boardH,
        r: G.cell * (0.035 + Math.random() * 0.045),
        sp: G.cell * (0.12 + Math.random() * 0.28),
        ph: Math.random() * Math.PI * 2,
        a: 0.07 + Math.random() * 0.11,
      });
    }
  }

  _updateEffects(now) {
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    if (this.freezeUntil > 0) {
      if (now < this.freezeUntil) { this._lastT = now; return; }
      const d = now - this._freezeStart;
      if (d > 0) {
        if (this.elimFlash) this.elimFlash.t0 += d;
        if (this.bounce) this.bounce.t0 += d;
        this.spawnT0 += d;
      }
      this.freezeUntil = 0;
    }
    this._lastT = now;
    for (let i = this.pendingFx.length - 1; i >= 0; i--) {
      const p = this.pendingFx[i];
      if (now >= p.at) {
        this.pendingFx.splice(i, 1);
        p.fn();
      }
    }
    if (!REDUCED_MOTION) {
      if (!this.bubbles) this._initBubbles();
      for (const b of this.bubbles) {
        b.y -= b.sp * dt;
        b.x += Math.sin(now * 0.0011 + b.ph) * 12 * dt;
        if (b.y < -b.r * 2) { b.y = G.boardH + b.r * 2; b.x = Math.random() * G.boardW; }
      }
    } else if (this.bubbles && this.bubbles.length) {
      this.bubbles.length = 0;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += 90 * dt;
      p.vx *= (1 - 1.4 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const g = this.rings[i];
      g.t += dt;
      if (g.t >= g.dur) this.rings.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) this.floaters.splice(i, 1);
    }
    if (this.shake && now >= this.shake.t0 + this.shake.dur) this.shake = null;
  }

  hitStop(ms) {
    const now = performance.now();
    if (this.freezeUntil <= now) this._freezeStart = now;
    this.freezeUntil = Math.max(this.freezeUntil, now + ms);
  }

  addShake(tier) {
    if (REDUCED_MOTION || tier <= 0) return;
    const t = Math.min(tier, 5);
    this.shake = {
      amp: G.cell * (0.016 + 0.013 * t),
      t0: performance.now(),
      dur: 150 + 45 * t,
      seed: Math.random() * 100,
    };
  }

  _shakeOffset(now) {
    if (!this.shake) return null;
    const s = this.shake;
    const t = (now - s.t0) / s.dur;
    if (t >= 1) { this.shake = null; return null; }
    const k = s.amp * (1 - t) * (1 - t);
    return { x: k * Math.sin(s.seed + t * 42), y: k * Math.sin(s.seed * 1.7 + t * 51) };
  }

  spawnFloater(x, y, text, tier) {
    if (REDUCED_MOTION) return;
    this.floaters.push({
      x, y, text,
      t: 0,
      life: 0.95,
      size: G.cell * (0.30 + 0.045 * Math.min(tier, 4)),
    });
  }

  _floaterLayout(f) {
    const p = Math.min(1, f.t / f.life);
    const u = Math.min(1, p / 0.22) - 1;
    const pop = Math.max(0.001, 1 + 2.7 * u * u * u + 1.7 * u * u);
    const size = Math.max(8, Math.round(f.size * pop));
    const rise = -G.cell * 0.38 * p;
    const lw = Math.max(3, G.cell * 0.07);
    this.ctx.font = `800 ${size}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
    const tw = this.ctx.measureText(f.text).width;
    const pad = G.cell * 0.05 + lw / 2;
    const x = Math.min(Math.max(f.x, pad + tw / 2), G.boardW - pad - tw / 2);
    const yTop = pad + size * 0.6;
    const yBot = G.boardH - pad - size * 0.6;
    const y = Math.min(Math.max(f.y + rise, yTop), Math.max(yTop, yBot));
    const alpha = p < 0.65 ? 1 : Math.max(0, (1 - p) / 0.35);
    return { x, y, size, alpha };
  }

  schedule(delayMs, fn) {
    this.pendingFx.push({ at: performance.now() + delayMs, fn });
  }

  relayout(availW, availH) {
    const wasW = G.boardW, wasH = G.boardH;
    this.resize();
    if (G.boardW !== wasW || G.boardH !== wasH || this.bg.width !== G.boardW * G.dpr || this.bg.height !== G.boardH * G.dpr) this._buildBackground();
    this.render();
  }

  resize() {
    computeLayout(this.platform.wrapW, this.platform.wrapH);
    const dpr = Math.min(this.platform.dpr || 1, DPR_CAP);
    const bw = Math.round(G.boardW * dpr);
    const bh = Math.round(G.boardH * dpr);
    if (this.canvas.width === bw && this.canvas.height === bh && G.dpr === dpr) {
      return;
    }
    G.dpr = dpr;
    this.dpr = dpr;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _buildBackground() {
    if (RenderView._stats) RenderView._stats.bgs++;
    const bg = createCanvas();
    bg.width = G.boardW * this.dpr;
    bg.height = G.boardH * this.dpr;
    const ctx = bg.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const BW = G.boardW, BH = G.boardH;

    const water = ctx.createLinearGradient(0, 0, BW * 0.25, BH);
    water.addColorStop(0, '#2b6b8f');
    water.addColorStop(0.5, '#1b4a68');
    water.addColorStop(1, '#113351');
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, BW, BH);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * G.pitch, y = r * G.pitch;
        ctx.save();
        ctx.beginPath(); roundRectPath(ctx, x, y, G.cell, G.cell, G.cell * 0.22);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath(); roundRectPath(ctx, x + G.cell * 0.10, y + G.cell * 0.06, G.cell * 0.80, G.cell * 0.16, G.cell * 0.08);
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fill();
        ctx.restore();
      }
    }

    const vig = ctx.createRadialGradient(BW / 2, BH / 2, BH * 0.42, BW / 2, BH / 2, BH * 0.75);
    vig.addColorStop(0, 'rgba(0,8,20,0)');
    vig.addColorStop(1, 'rgba(0,8,20,0.26)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, BW, BH);

    this.bg = bg;
  }

  gridToPixel(r, c) {
    return { x: c * G.pitch, y: r * G.pitch };
  }

  pixelToGrid(x, y) {
    const c = Math.floor(x / G.pitch);
    const r = Math.floor(y / G.pitch);
    return { r, c };
  }

  _groupOffsetPx() {
    if (this.drag) return this.drag.offsetPx;
    if (this.revert) return this.revert.offsetPx;
    return 0;
  }

  _groupDir() {
    if (this.drag) return this.drag.dir;
    if (this.revert) return this.revert.dir;
    return null;
  }

  render() {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.clearRect(0, 0, G.boardW, G.boardH);
    const shakeOff = this._shakeOffset(now);
    ctx.save();
    if (shakeOff) ctx.translate(shakeOff.x, shakeOff.y);
    ctx.drawImage(this.bg, 0, 0, G.boardW, G.boardH);

    if (this.bubbles) {
      for (const b of this.bubbles) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190,235,255,${b.a})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.a * 1.4})`;
        ctx.fill();
      }
    }

    const offsetPx = this._groupOffsetPx();
    const dir = this._groupDir();
    const moving = new Map();
    if (this.drag || this.revert) {
      const active = this.drag || this.revert;
      const d = GameCore.DIRS[dir];
      const px = d.dc * offsetPx;
      const py = d.dr * offsetPx;
      for (const m of active.group) {
        moving.set(m.id, { x: m.c * G.pitch + px, y: m.r * G.pitch + py });
      }
      if (this.drag) {
        const a = active.group[0];
        const cellPx = G.pitch;
        const dragDir = this.drag.dir;
        const d = GameCore.DIRS[dragDir];
        const offsetPx = this.drag.offsetPx;
        const cx = a.c * cellPx + G.cell / 2 + d.dc * offsetPx;
        const cy = a.r * cellPx + G.cell / 2 + d.dr * offsetPx;
        const curR = Math.floor(cy / cellPx);
        const curC = Math.floor(cx / cellPx);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(0, curR * cellPx, G.boardW, G.cell);
        ctx.fillRect(curC * cellPx, 0, G.cell, G.boardH);
      }
    }

    if (this.elimFlash) {
      const t = Math.min(1, (performance.now() - this.elimFlash.t0) / this.elimFlash.dur);
      if (this.elimFlash.ghosts && this.elimFlash.pattern) {
        const spr = RenderView.spriteFor(this.elimFlash.pattern);
        const gs = 1 + 0.35 * t;
        ctx.globalAlpha = 0.95 * (1 - t);
        const w = G.cell * gs;
        for (const g of this.elimFlash.ghosts) {
          ctx.drawImage(spr, g.x + G.cell / 2 - w / 2, g.y + G.cell / 2 - w / 2, w, w);
        }
        ctx.globalAlpha = 1;
      }
    }

    let pulseAngle = 0;
    let pulsePattern = null;
    if (this.bounce) {
      const t = Math.min(1, (performance.now() - this.bounce.t0) / this.bounce.dur);
      if (t < 1) {
        pulsePattern = this.bounce.pattern;
        // 同色方块来回晃动约 ±9°，幅度随时间衰减
        const ampRad = (1 - t) * 0.16;
        pulseAngle = Math.sin(t * Math.PI * 2.5) * ampRad;
      } else {
        this.bounce = null;
      }
    }

    const blocks = this.core.getBlocks();
    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx];
      const pos = moving.get(block.id);
      const x = pos ? pos.x : block.c * G.pitch;
      const y = pos ? pos.y : block.r * G.pitch;
      let scale = 1;
      let rot = 0;
      if (pulsePattern !== null && block.pattern === pulsePattern) rot = pulseAngle;
      if (!REDUCED_MOTION) {
        const lt = (now - this.spawnT0 - Math.min(idx * 9, 420)) / 240;
        if (lt < 0) scale *= 0.0001;
        else if (lt < 1) {
          const c1 = 1.70158, c3 = c1 + 1, u = lt - 1;
          scale *= 1 + c3 * u * u * u + c1 * u * u;
        }
      }
      this.drawBlock(block, x, y, scale, rot);
    }

    if (this.hint) {
      const b = this.core.getBlocks().find(x => x.id === this.hint.blockId);
      if (b) {
        // 整盘蒙版遮蔽，仅被提示方块以白色发光高亮（无黄框无连线）
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, G.boardW, G.boardH);
        const pulse = 1 + (REDUCED_MOTION ? 0 : 0.06 * Math.sin(now * 0.008));
        const p = this.gridToPixel(b.r, b.c);
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 14;
        this.drawBlock(b, p.x, p.y, pulse);
        ctx.restore();
      }
    }

    if (this.pick) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, G.boardW, G.boardH);
      let ti = 0;
      for (const t of this.pick.targets) {
        if (!t) continue;
        ti++;
        const p = this.gridToPixel(t.r, t.c);
        const ts = 1 + (REDUCED_MOTION ? 0 : 0.06 * Math.sin(now * 0.008 + ti * 0.9));
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 14;
        this.drawBlock(this.core.getBlocks().find(b => b.r === t.r && b.c === t.c) || { pattern: this.core.getGrid()[t.r][t.c], r: t.r, c: t.c }, p.x, p.y, ts);
        ctx.restore();
      }
    }
    for (const g of this.rings) {
      if (g.t < 0) continue;
      const t = Math.min(1, g.t / g.dur);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.maxR * (0.2 + 0.8 * t), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(0.5 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.5, G.cell * 0.06 * (1 - t));
      ctx.stroke();
    }
    for (const p of this.particles) {
      const t = p.t / p.life;
      const r = p.r * (1 - 0.55 * t);
      if (r <= 0.1) continue;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.drawImage(RenderView._particleSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    if (this.floaters.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineW = Math.max(3, G.cell * 0.07);
      for (const f of this.floaters) {
        const L = this._floaterLayout(f);
        if (L.alpha <= 0) continue;
        ctx.globalAlpha = L.alpha;
        ctx.font = `800 ${L.size}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
        ctx.lineWidth = lineW;
        ctx.strokeStyle = 'rgba(6,18,34,0.8)';
        ctx.strokeText(f.text, L.x, L.y);
        ctx.fillStyle = '#ffe27a';
        ctx.fillText(f.text, L.x, L.y);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (DEBUG) this._renderDebugOverlay();
  }

  _renderDebugOverlay() {
    const ctx = this.ctx;
    const s = RenderView._stats || {};
    ctx.save();
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 4, 250, 16);
    ctx.fillStyle = '#9fe8ff';
    ctx.fillText(`fps:${s.fps || '-'} p95:${s.p95 ? Math.round(s.p95) : '-'}ms tiles:${s.tiles} svg:${s.creatures} bg:${s.bgs}`, 8, 7);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.gridToPixel(r, c);
        ctx.strokeRect(p.x + 1, p.y + 1, G.cell - 2, G.cell - 2);
        const v = this.core.getGrid()[r][c];
        ctx.fillText(v === 0 ? '·' : String(v), p.x + G.cell / 2, p.y + G.cell / 2);
      }
    }
    if (this.hoverCell) {
      const { r, c } = this.hoverCell;
      const p = this.gridToPixel(r, c);
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 1, p.y + 1, G.cell - 2, G.cell - 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`(${r},${c})`, p.x + G.cell / 2, p.y - 8);
    }
  }

  drawBlock(block, x, y, scale = 1, rot = 0) {
    const img = RenderView.spriteFor(block.pattern);
    if (scale === 1 && !rot) {
      this.ctx.drawImage(img, x, y, G.cell, G.cell);
      return;
    }
    const cx = x + G.cell / 2, cy = y + G.cell / 2;
    const w = G.cell * scale, h = G.cell * scale;
    this.ctx.save();
    this.ctx.translate(cx, cy);
    if (rot) this.ctx.rotate(rot);
    this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
    this.ctx.restore();
  }

  triggerBounce(pattern) {
    this.bounce = { pattern, t0: performance.now(), dur: 450 };
    this._animateUntil(450, () => this.render(), () => {
      this.bounce = null;
      this.render();
    });
  }

  matchBurst(r, c, pattern, power = 1, delayMs = 0) {
    if (REDUCED_MOTION) return;
    const cx = c * G.pitch + G.cell / 2;
    const cy = r * G.pitch + G.cell / 2;
    this.rings.push({ x: cx, y: cy, t: -delayMs / 1000, dur: 0.38, maxR: G.cell * (0.85 + 0.15 * Math.min(power, 3)), color: PATTERN_COLORS[(pattern - 1) % PATTERN_COLORS.length] });
    this.schedule(delayMs, () => {
      const base = PATTERN_COLORS[(pattern - 1) % PATTERN_COLORS.length];
      const palette = ['#ffffff', '#cfefff', shade(base, 70), base];
      const n = Math.round(10 + 6 * Math.min(power, 3));
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = (60 + Math.random() * 150) * (G.cell / 64) * (1 + 0.22 * Math.min(power, 3));
        this.particles.push({
          x: cx + (Math.random() - 0.5) * G.cell * 0.4,
          y: cy + (Math.random() - 0.5) * G.cell * 0.4,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 50 * (G.cell / 64),
          r: G.cell * (0.05 + Math.random() * 0.085),
          t: 0,
          life: 0.45 + Math.random() * 0.45,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
    });
  }

  startDrag(group, dir, maxDist) {
    this.drag = { group, dir, offsetPx: 0, maxDist };
    this.revert = null;
    this.elimFlash = null;
    this._bumpToken();
    this.render();
  }

  updateDrag(offsetPx) {
    if (!this.drag) return;
    const cellPx = G.pitch;
    const maxPx = this.drag.maxDist * cellPx;
    this.drag.offsetPx = Math.max(0, Math.min(maxPx, offsetPx));
    this.render();
  }

  playElimination(cellA, cellB, pattern, onDone) {
    const ax = cellA.c * G.pitch, ay = cellA.r * G.pitch;
    const tp = this.gridToPixel(cellB.r, cellB.c);
    this.elimFlash = {
      t0: performance.now(),
      dur: 350,
      ghosts: [{ x: ax, y: ay }, { x: tp.x, y: tp.y }],
      pattern,
    };
    this.render();
    this._animateUntil(350, () => this.render(), () => {
      this.elimFlash = null;
      this.render();
      if (onDone) onDone();
    });
  }

  snapAndResolve(onDone) {
    if (!this.drag) { onDone && onDone(); return; }
    const cellPx = G.pitch;
    const rawDist = Math.round(this.drag.offsetPx / cellPx);
    const dist = Math.min(this.drag.maxDist, rawDist);
    if (dist === 0) {
      const { group, dir } = this.drag;
      const from = this.drag.offsetPx;
      this.drag = null;
      this.revert = { group, dir, offsetPx: from, fromPx: from };
      this._animate(from, 0, 220, (v) => {
        this.revert.offsetPx = v;
        this.render();
      }, () => {
        this.revert = null;
        this.render();
        onDone && onDone();
      });
      return;
    }
    const to = dist * cellPx;
    const from = this.drag.offsetPx;
    this._animate(from, to, 120, (v) => {
      this.drag.offsetPx = v;
      this.render();
    }, () => {
      const { group, dir } = this.drag;
      const d = GameCore.DIRS[dir];
      const a = group[0];
      const aR = a.r + d.dr * dist, aC = a.c + d.dc * dist;
      dbgStep();
      dbg({ type: 'snapResolve', dir, dist, maxDist: this.drag.maxDist, gridBefore: this.core.getGrid().map(r => r.join('')) });
      const vacated = new Set();
      const occupied = new Map();
      for (const m of group) {
        vacated.add(m.r + "," + m.c);
        occupied.set((m.r + d.dr * dist) + "," + (m.c + d.dc * dist), this.core.getGrid()[m.r][m.c]);
      }
      const multi = this.core.findMultiMatches(aR, aC, { vacated, occupied });
      if (multi) {
        this.core.pushSnapshot();
        const slideMoved = this.core.applySlide(group, dir, dist);
        this.pick = {
          r: aR, c: aC,
          targets: multi,
          slide: { group, dir, dist, moved: slideMoved },
        };
        this.drag = null;
        dbg({ type: 'pickOpen', r: aR, c: aC, multi });
        this.render();
        if (onDone) onDone();
        return;
      }
      this.drag = null;
      const res = this.core.resolve({ group, dir, dist });
      if (res.match) {
        const a = group[0];
        const cellA = { r: a.r + d.dr * dist, c: a.c + d.dc * dist };
        if (this.onMatchFx) {
          this.onMatchFx({ cells: [cellA, { ...res.target }], pattern: group[0].pattern });
        }
        this.playElimination(cellA, res.target, group[0].pattern, () => onDone && onDone());
      } else {
        if (this.onRevert) this.onRevert();
        this.revert = { group, dir, offsetPx: to, fromPx: to };
        this._animate(to, 0, 220, (v) => {
          this.revert.offsetPx = v;
          this.render();
        }, () => {
          this.revert = null;
          this.render();
          onDone && onDone();
        });
      }
    });
  }

  _animate(from, to, dur, tick, onDone) {
    const token = ++this._animToken;
    const t0 = performance.now();
    const step = () => {
      if (token !== this._animToken) return;
      // Use performance.now(), not the rAF callback argument: WeChat Mini Game
      // rAF timestamps are not comparable to performance.now(), which made
      // every timed animation complete on the first frame.
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - (1 - t) * (1 - t);
      tick(from + (to - from) * e);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onDone && onDone();
      }
    };
    requestAnimationFrame(step);
  }

  _animateUntil(dur, tick, onDone) {
    const token = ++this._animToken;
    const t0 = performance.now();
    const step = () => {
      if (token !== this._animToken) return;
      const t = Math.min(1, (performance.now() - t0) / dur);
      tick(t);
      if (t < 1) requestAnimationFrame(step);
      else onDone && onDone();
    };
    requestAnimationFrame(step);
  }

  _bumpToken() { this._animToken++; }
}

RenderView._stats = { tiles: 0, creatures: 0, bgs: 0, frames: 0, dtSum: 0, fps: 0, p95: 0, dts: [] };
RenderView._frameCostMs = 0;
RenderView._sprites = null;
RenderView._paused = false;

module.exports = { RenderView, G, computeLayout, PATTERN_COLORS, roundRectPath, createCanvas };