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
const G = { cell: 64, gap: 4, pitch: 68, boardW: 640, boardH: 640, dpr: 1, originR: 0, originC: 0 };
const DPR_CAP = 2;
const CELL_MAX = 150;

// 棋盘背景统一为整片蓝色（去掉浅色渐变与格子浅色叠层）
const BOARD_BG = '#103e66';

// 所有方块的底色统一为同一种浅蓝色，图案本身保留各自独特颜色作为区分
const TILE_BASE = '#a6d8f0';

// 手绘贴图：assets/patterns/NN.png（或 .jpg）优先于矢量绘制；无图则走 drawCreature 兜底
const PATTERN_IMG_DIR = 'assets/patterns/';
const _patternImg = {};
function _patternImgPath(p) { return PATTERN_IMG_DIR + String(p).padStart(2, '0'); }
function _loadPatternImages() {
  if (typeof wx === 'undefined' || !wx.createImage) return;
  for (let p = 1; p <= 70; p++) {
    const load = (ext) => new Promise((done) => {
      const im = wx.createImage();
      im.onload = () => {
        _patternImg[p] = im;
        if (RenderView._sprites && RenderView._sprites.entries) delete RenderView._sprites.entries[p];
        done();
      };
      im.onerror = () => done();
      im.src = _patternImgPath(p) + ext;
    });
    load('.png').then(() => { if (!_patternImg[p]) load('.jpg'); });
  }
}

function computeLayout(availW, availH, rows, cols) {
  const w = Math.max(160, availW);
  const h = Math.max(160, availH);
  const gap = 0; // 方块之间无缝隙
  // 以“满盘 9x12”为基准算格子尺寸：第 3 关起即为正常尺寸，前两关只是更少行数的小棋盘
  const cellW = Math.floor((w - gap * (COLS - 1)) / COLS);
  const cellH = Math.floor((h - gap * (ROWS - 1)) / ROWS);
  const cell = Math.max(10, Math.min(cellW, cellH, CELL_MAX));
  G.gap = gap;
  G.cell = cell;
  G.pitch = cell + gap;
  const r = rows != null ? rows : ROWS;
  const c = cols != null ? cols : COLS;
  G.boardW = cell * c + gap * (c - 1);
  G.boardH = cell * r + gap * (r - 1);
  // 满盘（9x12）基准尺寸：HUD 锚定用，不随本关棋盘行数变化
  G.fullW = cell * COLS + gap * (COLS - 1);
  G.fullH = cell * ROWS + gap * (ROWS - 1);
  // 实际棋盘在 9x12 网格中的居中偏移（core 用同样公式放置方块），绘制时减掉它
  G.originR = Math.floor((ROWS - r) / 2);
  G.originC = Math.floor((COLS - c) / 2);
}

// ================= ART: OCEAN THEME =================
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

// 前 7 种为既有生物配色（手选，互不撞色）。
const PATTERN_COLORS = [
  '#f4772e', // 1  clownfish    (orange)
  '#2f6fe0', // 2  blue tang    (blue)
  '#2fae66', // 3  sea turtle   (green)
  '#f5b52e', // 4  pufferfish   (yellow)
  '#8e5cf0', // 5  jellyfish    (violet)
  '#ef4d3d', // 6  crab         (red)
  '#16bccb', // 7  starfish     (cyan)
];
// 8–70：14 个易分辨基色 × 5 档明度 = 70 色，靠“色系+明度”分层区分。
// 明度收紧到中明度区间（0.46–0.74），避免浅档发白、深档发灰，保证图案色始终鲜明。
const BASE_HUES = [350, 18, 40, 55, 95, 135, 165, 192, 212, 230, 255, 278, 305, 328];
const LIGHT_TIERS = [0.74, 0.67, 0.60, 0.53, 0.46];
for (let i = 0; i < 63; i++) {
  const hue = BASE_HUES[i % BASE_HUES.length];
  const light = LIGHT_TIERS[Math.floor(i / BASE_HUES.length) % LIGHT_TIERS.length];
  PATTERN_COLORS.push(hslToHex(hue, 68, light * 100));
}

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

  // 取手绘原图（透明底），用于界面装饰（如通关纪念图）直接铺设
  static patternImage(pattern) {
    return _patternImg[pattern] || null;
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
    const [s, ctx] = RenderView._tileCanvas();
    const S = G.cell;
    const m = S * 0.03;
    const w = S - m * 2;
    const r = 3;
    const t = Math.max(3, S * 0.10); // 伪 3D 厚度（向下偏移的侧面），比之前更厚

    // 侧面：深一档底色、向下偏移，投影更强 —— 挤出式立体感
    ctx.save();
    ctx.shadowColor = 'rgba(4,16,30,0.45)';
    ctx.shadowBlur = S * 0.08;
    ctx.shadowOffsetY = S * 0.055;
    ctx.fillStyle = shade(TILE_BASE, -48);
    ctx.beginPath(); roundRectPath(ctx, m, m + t, w, w, r); ctx.fill();
    ctx.restore();

    // 顶面：平面浅蓝，无镜面高光
    ctx.fillStyle = TILE_BASE;
    ctx.beginPath(); roundRectPath(ctx, m, m, w, w, r); ctx.fill();

    // 受光上沿 bevel（弱高光，非镜面）
    ctx.save();
    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.strokeStyle = shade(TILE_BASE, 26);
    ctx.beginPath(); roundRectPath(ctx, m + 0.5, m + 0.5, w - 1, w - 1, r); ctx.stroke();
    ctx.restore();

    // 暗边 bevel：底部/右侧更深的细描边，强化厚度
    ctx.save();
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.strokeStyle = 'rgba(8,20,36,0.22)';
    ctx.beginPath(); roundRectPath(ctx, m + 0.5, m + 0.5, w - 1, w - 1, r); ctx.stroke();
    ctx.restore();

    return s;
  }

  static _bakeCreature(pattern, base) {
    RenderView._stats.creatures++;
    const [s, ctx] = RenderView._tileCanvas();
    ctx.drawImage(base, 0, 0, G.cell, G.cell);
    const inset = G.cell * 0.05;
    const im = _patternImg[pattern];
    if (im) {
      // 手绘贴图：主体已裁方居中，直接铺进方块面（透明处透出底色与挤出侧面）
      ctx.drawImage(im, inset, inset, G.cell - inset * 2, G.cell - inset * 2);
      return s;
    }
    const size = G.cell - inset * 2;
    ctx.save();
    ctx.translate(inset, inset);
    ctx.scale(size / 100, size / 100);
    drawCreature(ctx, pattern, PATTERN_COLORS[(pattern - 1) % PATTERN_COLORS.length]);
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
    this.dragBubbles = [];
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
    // 入场动画窗口内（8 列错峰 320ms + 单块 400ms ≈ 720ms）保持全帧率渲染
    if (performance.now() - this.spawnT0 < 800) return true;
    return !!(this.drag || this.revert || this.pick || this.bounce ||
              this.hint || this.elimFlash ||
              this.particles.length > 0 || this.rings.length > 0 ||
              this.dragBubbles.length > 0);
  }

  static setPaused(p) { RenderView._paused = p; }

  _initBubbles() {
    this.bubbles = [];
    // 数量更多、稍大一些、大小差异更大
    const n = Math.max(28, Math.round(G.boardW / 16));
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: Math.random() * G.boardW,
        y: Math.random() * G.boardH,
        r: G.cell * (0.04 + Math.random() * 0.24),
        sp: G.cell * (0.12 + Math.random() * 0.34),
        ph: Math.random() * Math.PI * 2,
        a: 0.05 + Math.random() * 0.15,
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
    // 拖动时在方块“身后”生成跟随的泡泡拖尾（更小、分布更散、有流动感）
    if (this.drag && !REDUCED_MOTION) {
      const dir = this.drag.dir;
      const d = GameCore.DIRS[dir];
      const off = this.drag.offsetPx;
      for (const m of this.drag.group) {
        const cx = (m.c - G.originC) * G.pitch + G.cell / 2 + d.dc * off;
        const cy = (m.r - G.originR) * G.pitch + G.cell / 2 + d.dr * off;
        // 沿运动反方向拉开距离，再向两侧散开，形成一条身后流动的小泡泡带
        const back = 0.3 + Math.random() * 0.9;
        const side = (Math.random() - 0.5) * G.cell * 1.1;
        const bx = cx - d.dc * G.cell * back - d.dr * side;
        const by = cy - d.dr * G.cell * back + d.dc * side;
        if (Math.random() < 14 * dt) {
          this.dragBubbles.push({
            x: bx,
            y: by,
            t: 0,
            life: 0.55 + Math.random() * 0.6,
            r: G.cell * (0.03 + Math.random() * 0.07),
            vx: (Math.random() - 0.5) * 16 - d.dc * G.cell * 0.05,
            vy: -G.cell * (0.07 + Math.random() * 0.16) - d.dr * G.cell * 0.05,
          });
        }
      }
    }
    for (let i = this.dragBubbles.length - 1; i >= 0; i--) {
      const s = this.dragBubbles[i];
      s.t += dt;
      if (s.t >= s.life) { this.dragBubbles.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
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
    this.ctx.font = `800 ${size}px "Yuanti SC","YouYuan","PingFang SC","Microsoft YaHei",sans-serif`;
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
    const rows = this.core ? this.core.getRows() : ROWS;
    const cols = this.core ? this.core.getCols() : COLS;
    computeLayout(this.platform.wrapW, this.platform.wrapH, rows, cols);
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

    // 整片纯蓝：去掉浅色渐变、格子浅色叠层与暗角，保持统一
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, BW, BH);

    this.bg = bg;
  }

  gridToPixel(r, c) {
    return { x: (c - G.originC) * G.pitch, y: (r - G.originR) * G.pitch };
  }

  pixelToGrid(x, y) {
    const c = Math.floor(x / G.pitch) + G.originC;
    const r = Math.floor(y / G.pitch) + G.originR;
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
        moving.set(m.id, { x: (m.c - G.originC) * G.pitch + px, y: (m.r - G.originR) * G.pitch + py });
      }
      if (this.drag) {
        const a = active.group[0];
        const cellPx = G.pitch;
        const dragDir = this.drag.dir;
        const d = GameCore.DIRS[dragDir];
        const offsetPx = this.drag.offsetPx;
        const cx = (a.c - G.originC) * cellPx + G.cell / 2 + d.dc * offsetPx;
        const cy = (a.r - G.originR) * cellPx + G.cell / 2 + d.dr * offsetPx;
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
        const clicks = this.bounce.clicks || 1;
        const attack = Math.min(1, t * 6); // 起始快速建立，避免突兀
        const ampRad = (1 - t) * 0.18 * (1 + 0.35 * (clicks - 1)); // 连击幅度递增
        const freq = 3.0 + (clicks - 1) * 1.0; // 连击频率递增
        pulseAngle = Math.sin(t * Math.PI * freq) * ampRad * attack;
      } else {
    this.bounce = null;
    this.settle = null;
      }
    }

    // 泡泡拖尾绘制在方块之前，使其出现在方块“身后”
    for (const s of this.dragBubbles) {
      const fade = Math.max(0, 1 - s.t / s.life);
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(190,235,255,0.6)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const blocks = this.core.getBlocks();
    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx];
      const pos = moving.get(block.id);
      const x = pos ? pos.x : (block.c - G.originC) * G.pitch;
      const y = pos ? pos.y : (block.r - G.originR) * G.pitch;
      let scale = 1;
      let rot = 0;
      if (pulsePattern !== null && block.pattern === pulsePattern) rot = pulseAngle;
      if (this.settle) {
        // 消除后余下方块整体“向前突出”一下（放大回弹），配合底部厚边强化立体感
        const st = (now - this.settle.t0) / this.settle.dur;
        if (st >= 1) this.settle = null;
        else scale *= 1 + 0.05 * Math.sin(st * Math.PI);
      }
      if (!REDUCED_MOTION) {
        // 入场：上下两半相向入场——上半部分从左往右、下半部分从右往左同时推进，
        // 每块仍用 easeOutBack 弹入（0→过冲→回正）；整体节奏放缓
        const nCols = this.core.getCols();
        const halfRow = Math.floor(this.core.getRows() / 2);
        const fromLeft = block.r < halfRow;
        const p = now - this.spawnT0 - (fromLeft ? block.c : nCols - 1 - block.c) * 40;
        const POP = 400;
        if (p < 0) continue; // 未轮到：先隐藏
        if (p < POP) {
          const t = p / POP;
          const c1 = 1.70158, c3 = c1 + 1;
          scale *= Math.max(0, 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
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
        // 高亮只作用于方块本身：不再加白色外发光（旧效果会在方块四周/下方晕出光斑）
        this.drawBlock(this.core.getBlocks().find(b => b.r === t.r && b.c === t.c) || { pattern: this.core.getGrid()[t.r][t.c], r: t.r, c: t.c }, p.x, p.y, ts);
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
        ctx.font = `800 ${L.size}px "Yuanti SC","YouYuan","PingFang SC","Microsoft YaHei",sans-serif`;
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

  drawBlock(block, x, y, scale = 1, rot = 0, sq = 1) {
    const img = RenderView.spriteFor(block.pattern);
    if (scale === 1 && sq === 1 && !rot) {
      this.ctx.drawImage(img, x, y, G.cell, G.cell);
      return;
    }
    const cx = x + G.cell / 2, cy = y + G.cell / 2;
    const w = G.cell * scale, h = G.cell * scale * sq;
    this.ctx.save();
    // sq<1（落地压扁）时保持底边贴地：中心向下偏移压缩量的一半
    this.ctx.translate(cx, cy + (h - w) / 2);
    if (rot) this.ctx.rotate(rot);
    this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
    this.ctx.restore();
  }

  triggerBounce(pattern) {
    const now = performance.now();
    if (this.bounce && this.bounce.pattern === pattern) {
      // 连击：仅提升频率/幅度，不重置计时 → 旋转连续无跳变、无重影交叠
      this.bounce.clicks = Math.min((this.bounce.clicks || 1) + 1, 4);
    } else {
      this.bounce = { pattern, t0: now, dur: 360, clicks: 1 };
    }
    this._animateUntil(this.bounce.dur, () => this.render(), () => {
      this.bounce = null;
      this.render();
    });
  }

  triggerSettle() {
    // 消除完成后调用：余下方块快速放大回弹一次，像从棋盘上“浮起”
    if (REDUCED_MOTION) return;
    this.settle = { t0: performance.now(), dur: 260 };
    this._animateUntil(260, () => this.render(), () => {
      this.settle = null;
      this.render();
    });
  }

  matchBurst(r, c, pattern, power = 1, delayMs = 0) {
    if (REDUCED_MOTION) return;
    const cx = (c - G.originC) * G.pitch + G.cell / 2;
    const cy = (r - G.originR) * G.pitch + G.cell / 2;
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
    // 橡皮筋：超过最大距离后带阻力继续跟随，松手回弹，避免“卡死不跟手”
    let v = Math.max(0, offsetPx);
    if (v > maxPx) v = maxPx + (v - maxPx) * 0.22;
    this.drag.offsetPx = Math.min(v, maxPx + cellPx * 0.38);
    // 不在此处同步 render：tick() 拖拽期间每帧渲染，重复绘制反而掉帧
  }

  playElimination(cellA, cellB, pattern, onDone) {
    const ax = (cellA.c - G.originC) * G.pitch, ay = (cellA.r - G.originR) * G.pitch;
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
      this.triggerSettle(); // 消除后余下方块“突出”一下
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
      this._animate(from, 0, 100, (v) => {
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
        this._animate(to, 0, 100, (v) => {
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

// 单元格中心（在棋盘画布坐标系内），供 UI 引导层精确定位高亮/箭头
function cellCenterInBoard(r, c) {
  return { x: (c - G.originC) * G.pitch + G.cell / 2, y: (r - G.originR) * G.pitch + G.cell / 2 };
}

module.exports = { RenderView, G, computeLayout, PATTERN_COLORS, roundRectPath, createCanvas, cellCenterInBoard };

// 启动即预加载手绘贴图（微信环境内；缺失文件 onerror 静默走矢量兜底）
if (typeof wx !== 'undefined') _loadPatternImages();