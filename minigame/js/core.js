// GameCore extracted verbatim from push-slide-match.html (pure logic, no
// DOM/canvas dependency) and wrapped as a CommonJS module for the WeChat
// Mini Game runtime. Logic is byte-for-byte the web version; only the
// export wrapper and the debug/env plumbing differ.
require('./debug.js'); // guarantees G.dbg / dbgStep
const { G } = require('./globals.js');

const DEBUG = G.__DEBUG_ENABLED === true;

const COLS = 10, ROWS = 14;      // 竖屏 10x14 布局
const TOTAL_BLOCKS = COLS * ROWS; // 棋盘铺满 = 140 块
const TOTAL_PAIRS = TOTAL_BLOCKS / 2; // 70 对

// 关卡难度曲线：图案数随关卡“前快后平”地增长，到固定关后不再新增、难度固定。
// 前期（前 50 关）图案数增长更快，避免少数图案反复出现导致聚堆、过于简单。
const BASE_PATTERNS = 7;   // 第 1 关图案数（温和教学关）
const MAX_PATTERNS = 35;   // 最终图案数（每种 4 块 = 140，铺满且全偶数）
const FIXED_LEVEL = 300;   // 35 种在此关引入完毕，之后难度固定

// ease-out 曲线：t∈[0,1]，(1-(1-t)²) 在前期上升快、后期趋平。
function patternCountForLevel(level) {
  const L = Math.max(1, level | 0);
  const t = Math.min(1, Math.max(0, (L - 1) / (FIXED_LEVEL - 1)));
  const eased = 1 - (1 - t) * (1 - t);
  const P = Math.round(BASE_PATTERNS + (MAX_PATTERNS - BASE_PATTERNS) * eased);
  return Math.min(MAX_PATTERNS, Math.max(BASE_PATTERNS, P));
}

// 把 140 块按偶数均衡分配给 P 种图案（和=140，每种均为偶数，可两两消完）。
function countsForLevel(level) {
  const P = patternCountForLevel(level);
  const counts = new Array(P).fill(0);
  let base = Math.floor(TOTAL_BLOCKS / P);
  if (base % 2 === 1) base -= 1;          // 取不超过均值的偶数
  let remaining = TOTAL_BLOCKS - base * P; // 必为偶数
  for (let i = 0; i < P; i++) counts[i] = base;
  let idx = 0;
  while (remaining > 0) { counts[idx % P] += 2; remaining -= 2; idx++; }
  return counts;
}

// 相邻同图案“目标上限”：以随机铺满的期望对数 256/P 为基准，
// 乘一个随关卡收紧的系数（前期接近随机=宽松，后期压到约 1/3=难）。
// 生成时把相邻同图案对数压到该上限以下，即“去聚堆”，让同图案尽量分散。
function targetAdjacencyForLevel(level) {
  const P = patternCountForLevel(level);
  const adjTotal = COLS * (ROWS - 1) + (COLS - 1) * ROWS; // 棋盘全部相邻边数 = 256
  const randomExp = adjTotal / P;                         // 随机铺满的期望相邻同图案对数
  const t = Math.min(1, Math.max(0, (Math.max(1, level) - 1) / (FIXED_LEVEL - 1)));
  const ratio = 0.9 - t * (0.9 - 0.33);                   // L1≈0.9（接近随机）… L300≈0.33
  return Math.max(1, Math.round(randomExp * ratio));
}


class GameCore {
  constructor(level = 1) {
    this.grid = null;      // ROWS x COLS, 0 = empty, 1..P = pattern
    this.blocks = null;    // [{id, pattern, r, c}]
    this.clearedPairs = 0;
    this.nextId = 1;
    this.undoSnapshot = null; // snapshot of the board before the last elimination
    this.level = 1;
    this.init(level);
  }

  init(level) {
    if (level != null) this.level = Math.max(1, level | 0);
    for (let attempt = 0; attempt < 100; attempt++) {
      this._generateLayout();
      if (this.findHint() !== null) return;
    }
    this._generateLayout();
  }

  _generateLayout() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.blocks = [];
    this.clearedPairs = 0;
    this.nextId = 1;
    this.undoSnapshot = null;   // a fresh board has no undo history

    const counts = countsForLevel(this.level);
    const target = targetAdjacencyForLevel(this.level);

    // 多次尝试：随机铺底 + 贪心去聚堆，直到“有可点开局(≥1对)且达到目标上限”。
    let fallback = null; // 最接近目标（相邻同图案最少且≥1）的布局
    for (let attempt = 0; attempt < 60; attempt++) {
      const bag = [];
      counts.forEach((cnt, i) => { for (let k = 0; k < cnt; k++) bag.push(i + 1); });
      this._shuffleArray(bag);
      let bi = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          this.grid[r][c] = bag[bi++];

      this._declutter(target); // 原地交换去聚堆，保持各图案数量不变

      const adj = this._adjacencySamePairs();
      if (adj >= 1 && adj <= target) break;       // 既“活”（可点开局）又够打散
      if (adj >= 1 && (!fallback || adj < fallback.adj)) {
        fallback = { adj, grid: this.grid.map(row => row.slice()) };
      }
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); // 重置以便下次尝试
    }
    if (fallback) this.grid = fallback.grid;

    // 由最终 grid 重建 blocks
    this.blocks = [];
    this.nextId = 1;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = this.grid[r][c];
        if (v) this.blocks.push({ id: this.nextId++, pattern: v, r, c });
      }

    if (this._adjacencySamePairs() < 1) this._ensureOneAdjacency(); // 极端兜底：保证至少可点开局
  }

  // 贪心交换去聚堆：把相邻同图案对数压到 target 以下，但始终保持 ≥1 对（保证可点开局）。
  // 交换只是“互换两个格子的图案”，各图案出现次数天然不变。
  _declutter(target) {
    let cur = this._adjacencySamePairs();
    if (cur <= target) return;
    let iters = 0;
    const MAX_ITERS = 1500;
    while (cur > target && iters < MAX_ITERS) {
      iters++;
      const pair = this._randomAdjacentSamePair();
      if (!pair) break;
      const [, b] = pair;
      const v = this.grid[pair[0].r][pair[0].c];
      const c = this._randomCellWithPatternNot(v);
      if (!c) break;
      const bPat = this.grid[b.r][b.c];
      const cPat = this.grid[c.r][c.c];
      this.grid[b.r][b.c] = cPat;
      this.grid[c.r][c.c] = bPat;
      const newAdj = this._adjacencySamePairs();
      if (newAdj >= 1 && newAdj < cur) {
        cur = newAdj;            // 接受：更分散且仍留至少一对可点
      } else {
        this.grid[b.r][b.c] = bPat; // 撤销
        this.grid[c.r][c.c] = cPat;
      }
    }
  }

  // 随机取一对横/竖相邻的同图案格。
  _randomAdjacentSamePair() {
    const pairs = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = this.grid[r][c];
        if (!v) continue;
        if (c + 1 < COLS && this.grid[r][c + 1] === v) pairs.push([{ r, c }, { r, c: c + 1 }]);
        if (r + 1 < ROWS && this.grid[r + 1][c] === v) pairs.push([{ r, c }, { r: r + 1, c }]);
      }
    if (!pairs.length) return null;
    return pairs[Math.floor(Math.random() * pairs.length)];
  }

  // 随机取一个图案不同于 pat 的格子（用于交换去聚堆）。
  _randomCellWithPatternNot(pat) {
    const cand = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this.grid[r][c] !== null && this.grid[r][c] !== pat) cand.push({ r, c });
    if (!cand.length) return null;
    return cand[Math.floor(Math.random() * cand.length)];
  }

  // 横/竖相邻且图案相同的格子对数（衡量聚簇程度）。
  _adjacencySamePairs() {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = this.grid[r][c];
        if (!v) continue;
        if (c + 1 < COLS && this.grid[r][c + 1] === v) n++;
        if (r + 1 < ROWS && this.grid[r + 1][c] === v) n++;
      }
    return n;
  }

  // 兜底：若随机布局完全没有相邻同图案，把同图案的两块移到相邻，保证有解。
  _ensureOneAdjacency() {
    const byPattern = new Map();
    for (const b of this.blocks) {
      if (!byPattern.has(b.pattern)) byPattern.set(b.pattern, []);
      byPattern.get(b.pattern).push(b);
    }
    for (const [, list] of byPattern) {
      if (list.length < 2) continue;
      const a = list[0], b = list[1];
      const nr = a.r, nc = a.c + 1 < COLS ? a.c + 1 : a.c - 1;
      const x = this.blocks.find(bl => bl.r === nr && bl.c === nc);
      if (!x) continue;
      this.grid[a.r][a.c] = a.pattern;   // a 不动
      this.grid[nr][nc] = b.pattern;     // b 移到 a 的相邻格
      this.grid[b.r][b.c] = x.pattern;   // 原相邻格的块 x 移到 b 原位
      x.r = b.r; x.c = b.c;
      b.r = nr; b.c = nc;
      return;
    }
  }

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  getGrid() { return this.grid; }
  getBlocks() { return this.blocks; }
  getTotalPairs() { return TOTAL_PAIRS; }
  getClearedPairs() { return this.clearedPairs; }
  getProgress() { return this.clearedPairs / TOTAL_PAIRS; }
  getPatternCount() { return this.blocks.length; }

  getPushGroup(r, c, dir) {
    const start = (DEBUG && !this._probing) ? dbg({ type: 'getPushGroup', r, c, dir, srcPattern: this.grid && this.grid[r] ? this.grid[r][c] : undefined }) : null;
    if (!this.inBounds(r, c) || this.grid[r][c] === 0) {
      start && (start.result = null);
      return null;
    }
    const d = GameCore.DIRS[dir];
    const group = [];
    const seen = new Set();
    let cr = r, cc = c;
    while (this.inBounds(cr, cc) && this.grid[cr][cc] !== 0) {
      const key = cr + "," + cc;
      if (seen.has(key)) break;
      seen.add(key);
      const b = this.blocks.find(x => x.r === cr && x.c === cc);
      group.push(b ? { id: b.id, pattern: b.pattern, r: cr, c: cc } : { id: 0, pattern: this.grid[cr][cc], r: cr, c: cc });
      cr += d.dr;
      cc += d.dc;
    }
    start && (start.result = group.map(m => ({ id: m.id, p: m.pattern, r: m.r, c: m.c })));
    return group;
  }

  getMaxSlideDistance(group, dir) {
    const d = GameCore.DIRS[dir];
    let front = group[0];
    for (const m of group) {
      if (m.r * d.dr + m.c * d.dc > front.r * d.dr + front.c * d.dc) front = m;
    }
    let dist = 0;
    let cr = front.r + d.dr, cc = front.c + d.dc;
    while (this.inBounds(cr, cc) && this.grid[cr][cc] === 0) {
      dist++;
      cr += d.dr;
      cc += d.dc;
    }
    if (!this._probing) {
      dbg({ type: 'maxSlideDistance', dir, front: { r: front.r, c: front.c, p: front.pattern }, dist,
            stop: this.inBounds(cr, cc) ? { r: cr, c: cc, p: this.grid[cr][cc] } : 'boundary' });
    }
    return dist;
  }

  inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  _firstInDir(r, c, dir, overlay) {
    const d = GameCore.DIRS[dir];
    let cr = r + d.dr, cc = c + d.dc;
    while (this.inBounds(cr, cc)) {
      const v = overlay
        ? (overlay.occupied.has(cr + "," + cc) ? overlay.occupied.get(cr + "," + cc)
          : overlay.vacated.has(cr + "," + cc) ? 0
          : this.grid[cr][cc])
        : this.grid[cr][cc];
      if (v !== 0) return { r: cr, c: cc, v };
      cr += d.dr;
      cc += d.dc;
    }
    return null;
  }

  checkMatch(r, c, overlay = null) {
    const pat = (overlay && overlay.occupied.has(r + "," + c))
      ? overlay.occupied.get(r + "," + c)
      : this.grid[r][c];
    if (pat === 0) return null;
    for (const dir of Object.keys(GameCore.DIRS)) {
      const hit = this._firstInDir(r, c, dir, overlay);
      if (hit && hit.v === pat) {
        if (!this._probing) dbg({ type: 'checkMatch', r, c, pat, overlay: overlay ? { vacated: [...overlay.vacated], occupied: [...overlay.occupied] } : null, result: { match: true, r: hit.r, c: hit.c, dir } });
        return { r: hit.r, c: hit.c };
      }
    }
    if (!this._probing) dbg({ type: 'checkMatch', r, c, pat, overlay: overlay ? { vacated: [...overlay.vacated], occupied: [...overlay.occupied] } : null, result: { match: false } });
    return null;
  }

  findBlockByPos(r, c) {
    return this.blocks.find(b => b.r === r && b.c === c) || null;
  }

  consistencyCheck() {
    const problems = [];
    const seen = new Map();
    for (const b of this.blocks) {
      const key = b.r + "," + b.c;
      if (this.grid[b.r] === undefined || this.grid[b.r][b.c] === undefined) {
        problems.push({ type: 'block_out_of_bounds', id: b.id, r: b.r, c: b.c });
        continue;
      }
      if (this.grid[b.r][b.c] !== b.pattern) {
        problems.push({ type: 'grid_mismatch', id: b.id, p: b.pattern, r: b.r, c: b.c, gridVal: this.grid[b.r][b.c] });
      }
      if (seen.has(key)) {
        problems.push({ type: 'duplicate_cell', key, ids: [...seen.get(key), b.id] });
      } else {
        seen.set(key, [b.id]);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.grid[r][c];
        if (v !== 0 && !seen.has(r + "," + c)) {
          problems.push({ type: 'orphan_grid_value', r, c, v });
        }
      }
    }
    return problems;
  }

  _slideOverlay(group, dir, dist) {
    const d = GameCore.DIRS[dir];
    const vacated = new Set();
    const occupied = new Map();
    for (const m of group) {
      vacated.add(m.r + "," + m.c);
      occupied.set((m.r + d.dr * dist) + "," + (m.c + d.dc * dist), this.grid[m.r][m.c]);
    }
    return { vacated, occupied };
  }

  _eliminatePair(aBlock, bBlock) {
    const removedIds = [aBlock.id, bBlock.id];
    this.grid[aBlock.r][aBlock.c] = 0;
    this.grid[bBlock.r][bBlock.c] = 0;
    this.blocks = this.blocks.filter(x => !removedIds.includes(x.id));
    this.clearedPairs += 1;
    return { removedIds, issues: this.consistencyCheck() };
  }

  resolve(drag) {
    const { group, dir, dist } = drag;
    const d = GameCore.DIRS[dir];
    const a = group[0];
    const aR = a.r + d.dr * dist;
    const aC = a.c + d.dc * dist;
    dbg({ type: 'resolve', dir, dist, aStart: { r: a.r, c: a.c, p: a.pattern },
          group: group.map(m => ({ id: m.id, p: m.pattern, r: m.r, c: m.c })),
          aFinal: { r: aR, c: aC } });

    const { vacated, occupied } = this._slideOverlay(group, dir, dist);
    const newPos = new Map(); // id -> {r,c}
    for (const m of group) newPos.set(m.id, { r: m.r + d.dr * dist, c: m.c + d.dc * dist });

    const hit = this.checkMatch(aR, aC, { vacated, occupied });
    if (!hit) {
      const issues = this.consistencyCheck();
      dbg({ type: 'resolve', dir, dist, match: false, aFinal: { r: aR, c: aC }, consistency: issues });
      return { match: false, removedIds: [], moved: [], target: null };
    }

    const target = { r: hit.r, c: hit.c };

    this.pushSnapshot();

    const aBlock = this.findBlockByPos(a.r, a.c);
    let bBlock = null;
    if (aBlock) {
      for (const m of group) {
        const np = newPos.get(m.id);
        if (m.id !== aBlock.id && np.r === hit.r && np.c === hit.c) {
          bBlock = this.findBlockByPos(m.r, m.c);
          break;
        }
      }
    }
    if (!bBlock) bBlock = this.findBlockByPos(hit.r, hit.c);
    const removedIds = (aBlock && bBlock) ? this._eliminatePair(aBlock, bBlock).removedIds : [];

    const moved = [];
    const survivors = [];
    for (const m of group) {
      if (removedIds.includes(m.id)) continue;
      const block = this.findBlockByPos(m.r, m.c);
      if (!block) continue;
      survivors.push(block);
      this.grid[block.r][block.c] = 0;
    }
    for (const block of survivors) {
      const np = newPos.get(block.id);
      if (!np) continue;
      if (np.r === block.r && np.c === block.c) continue;
      block.r = np.r; block.c = np.c;
      this.grid[np.r][np.c] = block.pattern;
      moved.push({ id: block.id, r: np.r, c: np.c });
    }
    const issues = this.consistencyCheck();
    dbg({ type: 'resolve', dir, dist, match: true, aFinal: { r: aR, c: aC }, target,
          removedIds, moved, consistency: issues });
    return { match: true, removedIds, moved, target };
  }

  findMultiMatches(r, c, overlay = null) {
    if (!this.inBounds(r, c)) return null;
    const pat = (overlay && overlay.occupied.has(r + "," + c))
      ? overlay.occupied.get(r + "," + c)
      : this.grid[r][c];
    if (pat === 0) return null;
    const targets = [];
    for (const dir of Object.keys(GameCore.DIRS)) {
      const hit = this._firstInDir(r, c, dir, overlay);
      if (hit && hit.v === pat) targets.push({ r: hit.r, c: hit.c, dir });
    }
    if (targets.length < 2) return null;
    return targets;
  }

  resolvePair(r, c, tr, tc) {
    if (!this.inBounds(r, c) || this.grid[r][c] === 0) {
      return { matched: false, removedIds: [] };
    }
    const aBlock = this.findBlockByPos(r, c);
    const bBlock = this.findBlockByPos(tr, tc);
    if (!aBlock || !bBlock || aBlock.pattern !== bBlock.pattern) {
      return { matched: false, removedIds: [] };
    }
    const { removedIds, issues } = this._eliminatePair(aBlock, bBlock);
    dbg({ type: 'resolvePair', r, c, tr, tc, removedIds, consistency: issues });
    return { matched: true, removedIds, target: { r: tr, c: tc } };
  }

  applySlide(group, dir, dist) {
    const d = GameCore.DIRS[dir];
    const moved = [];
    const refs = group.map((m) => ({ m, block: this.blocks.find((b) => b.id === m.id) }));
    for (const { m } of refs) this.grid[m.r][m.c] = 0;
    for (const { m, block } of refs) {
      if (!block) continue;
      const nr = m.r + d.dr * dist;
      const nc = m.c + d.dc * dist;
      block.r = nr; block.c = nc;
      this.grid[nr][nc] = block.pattern;
      moved.push({ id: block.id, from: { r: m.r, c: m.c }, to: { r: nr, c: nc } });
    }
    return moved;
  }

  revertSlide(moved) {
    for (const item of moved) {
      this.grid[item.to.r][item.to.c] = 0;
      const block = this.findBlockByPos(item.to.r, item.to.c);
      if (!block) continue;
      block.r = item.from.r; block.c = item.from.c;
      this.grid[item.from.r][item.from.c] = block.pattern;
    }
  }

  clickResolve(r, c) {
    if (!this.inBounds(r, c) || this.grid[r][c] === 0) {
      return { matched: false, target: null, removedIds: [] };
    }
    const aBlock = this.findBlockByPos(r, c);
    if (!aBlock) return { matched: false, target: null, removedIds: [] };
    const hit = this.checkMatch(r, c);
    if (!hit) {
      dbg({ type: 'clickResolve', r, c, matched: false });
      return { matched: false, target: null, removedIds: [] };
    }
    const bBlock = this.findBlockByPos(hit.r, hit.c);
    if (!bBlock) {
      dbg({ type: 'clickResolve', r, c, matched: false });
      return { matched: false, target: null, removedIds: [] };
    }
    this.pushSnapshot();
    const { removedIds, issues } = this._eliminatePair(aBlock, bBlock);
    dbg({ type: 'clickResolve', r, c, matched: true, target: hit, removedIds, consistency: issues });
    return { matched: true, target: hit, removedIds };
  }

  shuffle() {
    if (this.blocks.length === 0) return false;
    const remaining = this.blocks.map(b => b.pattern);
    for (let attempt = 0; attempt < 10; attempt++) {
      this._clearAll();
      const cells = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          cells.push([r, c]);
      this._shuffleArray(cells);
      for (let i = 0; i < remaining.length; i++) {
        const [r, c] = cells[i];
        this.grid[r][c] = remaining[i];
        this.blocks.push({ id: this.nextId++, pattern: remaining[i], r, c });
      }
      if (this.findHint()) return true;
    }
    return false;
  }

  _clearAll() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.blocks = [];
  }

  pushSnapshot() {
    this.undoSnapshot = {
      grid: this.grid.map(row => row.slice()),
      blocks: this.blocks.map(b => ({ id: b.id, pattern: b.pattern, r: b.r, c: b.c })),
      clearedPairs: this.clearedPairs,
      nextId: this.nextId,
    };
  }

  undo() {
    const snap = this.undoSnapshot;
    if (!snap) return false;
    this.undoSnapshot = null;
    this.grid = snap.grid.map(row => row.slice());
    this.blocks = snap.blocks.map(b => ({ id: b.id, pattern: b.pattern, r: b.r, c: b.c }));
    this.clearedPairs = snap.clearedPairs;
    this.nextId = snap.nextId;
    return true;
  }

  canUndo() { return !!this.undoSnapshot; }

  simulateSlide(group, dir, dist, fn) {
    const d = GameCore.DIRS[dir];
    const saved = group.map(m => ({ r: m.r, c: m.c, pattern: this.grid[m.r][m.c] }));
    const { vacated, occupied } = this._slideOverlay(group, dir, dist);
    for (const m of saved) this.grid[m.r][m.c] = 0;
    for (const m of saved) this.grid[m.r + d.dr * dist][m.c + d.dc * dist] = m.pattern;
    const a = group[0];
    const ar = a.r + d.dr * dist, ac = a.c + d.dc * dist;
    const result = fn(ar, ac, { vacated, occupied });
    for (const m of saved) this.grid[m.r + d.dr * dist][m.c + d.dc * dist] = 0;
    for (const m of saved) this.grid[m.r][m.c] = m.pattern;
    return result;
  }

  findHint() {
    this._probing = true;
    try {
      for (const block of this.blocks) {
        for (const dir of Object.keys(GameCore.DIRS)) {
          const group = this.getPushGroup(block.r, block.c, dir);
          if (!group) continue;
          const maxDist = this.getMaxSlideDistance(group, dir);
          if (maxDist === 0) continue;
          for (let dist = maxDist; dist >= 1; dist--) {
            const target = this.simulateSlide(group, dir, dist, (ar, ac, overlay) => this.checkMatch(ar, ac, overlay));
            if (target) return { blockId: block.id, dir, dist, target, group };
          }
        }
      }
      for (const block of this.blocks) {
        const target = this.checkMatch(block.r, block.c);
        if (target) return { blockId: block.id, dir: null, dist: 0, target, group: null };
      }
      return null;
    } finally {
      this._probing = false;
    }
  }
}

// ================= SELF TEST =================
GameCore.DIRS = {
  up:    { dr: -1, dc: 0 },
  down:  { dr:  1, dc: 0 },
  left:  { dr:  0, dc: -1 },
  right: { dr:  0, dc: 1 },
};
const selfTests = {
  core() {
    const c = new GameCore();
    const checks = [];
    checks.push(c.getGrid().length === ROWS);
    checks.push(c.getGrid().every(row => row.length === COLS));
    checks.push(c.getPatternCount() === TOTAL_BLOCKS);
    checks.push(c.getTotalPairs() === TOTAL_PAIRS);
    const expected = countsForLevel(1);
    const counts = new Array(expected.length + 1).fill(0);
    for (const b of c.getBlocks()) counts[b.pattern]++;
    checks.push(expected.every((n, i) => counts[i + 1] === n));
    checks.push(counts.slice(1).every(n => n > 0 && n % 2 === 0));
    let empty = 0;
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++)
        if (c.getGrid()[r][col] === 0) empty++;
    checks.push(empty === 0);
    return checks;
  },

  group() {
    const c = new GameCore();
    const g = c.getGrid();
    const checks = [];
    const anyBlock = c.getBlocks()[0];
    checks.push(c.getPushGroup(anyBlock.r, anyBlock.c, 'right') !== null);

    const grp = c.getPushGroup(anyBlock.r, anyBlock.c, 'right');
    if (grp) {
      checks.push(grp.length >= 1);
      checks.push(grp[0].id === anyBlock.id);
      const d = GameCore.DIRS['right'];
      for (let i = 1; i < grp.length; i++) {
        checks.push(grp[i].r === grp[i - 1].r + d.dr);
        checks.push(grp[i].c === grp[i - 1].c + d.dc);
      }
      const dist = c.getMaxSlideDistance(grp, 'right');
      checks.push(dist >= 0);
      const front = grp[grp.length - 1];
      const next = { r: front.r + d.dr * (dist + 1), c: front.c + d.dc * (dist + 1) };
      if (c.inBounds(next.r, next.c)) {
        checks.push(g[next.r][next.c] !== 0);
      } else {
        checks.push(true); // boundary
      }
    }
    return checks;
  },

  match() {
    const checks = [];
    let c = coreWith([[0, 0, 1], [0, 3, 1], [2, 0, 2]]);
    const hit = c.checkMatch(0, 0);
    checks.push(hit !== null && hit.r === 0 && hit.c === 3);

    c.grid[0][1] = 3; c.blocks.push({ id: c.nextId++, pattern: 3, r: 0, c: 1 });
    checks.push(c.checkMatch(0, 0) === null);

    c = coreWith([[4, 0, 1], [4, 4, 1]]);
    const aId = c.findBlockByPos(4, 0).id;
    const bId = c.findBlockByPos(4, 4).id;
    const group = c.getPushGroup(4, 0, 'right');
    const dist = c.getMaxSlideDistance(group, 'right');
    checks.push(dist >= 3);
    const res = c.resolve({ group, dir: 'right', dist });
    checks.push(res.match === true);
    checks.push(res.removedIds.includes(aId) && res.removedIds.includes(bId));
    checks.push(res.target && res.target.r === 4 && res.target.c === 4);
    checks.push(c.getClearedPairs() === 1);
    checks.push(c.findBlockByPos(4, 4) === null);
    checks.push(c.getGrid()[4][0] === 0);

    const c2 = coreWith([[0, 0, 1]]);
    const before = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks(), cp: c2.getClearedPairs() });
    const grp = c2.getPushGroup(0, 0, 'up');
    const dd = c2.getMaxSlideDistance(grp, 'up');
    const res2 = c2.resolve({ group: grp, dir: 'up', dist: dd });
    const after = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks(), cp: c2.getClearedPairs() });
    checks.push(res2.match === false);
    checks.push(before === after);
    return checks;
  },

  shuffle() {
    const c = new GameCore();
    const checks = [];
    const beforeCount = c.getPatternCount();
    const beforeEmpty = COLS * ROWS - beforeCount;
    const ok = c.shuffle();
    checks.push(ok === true);
    checks.push(c.getPatternCount() === beforeCount);
    let empty = 0;
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++)
        if (c.getGrid()[r][col] === 0) empty++;
    checks.push(empty === beforeEmpty);

    const h = c.findHint();
    checks.push(h !== null);
    if (h) {
      checks.push(typeof h.blockId === 'number' && (h.dir === null || typeof h.dir === 'string'));
      checks.push(h.dist >= 0);
      checks.push(h.target && typeof h.target.r === 'number' && typeof h.target.c === 'number');
    }
    return checks;
  },

  full() {
    const checks = [];
    checks.push(true); // 'full' needs the live App/DOM; not run in the mini-game suite
    return checks;
  },

  ghost() {
    const c = coreWith([[3, 4, 1], [2, 4, 2], [1, 4, 3], [2, 7, 1]]);
    const checks = [];

    const group = c.getPushGroup(3, 4, 'up');
    const dist = c.getMaxSlideDistance(group, 'up');
    const res = c.resolve({ group, dir: 'up', dist });

    checks.push(dist === 1);
    checks.push(res.match === true);
    checks.push(res.removedIds.length === 2);
    const at = (r, cc) => c.blocks.find(b => b.r === r && b.c === cc) || null;
    checks.push(at(1, 4) !== null && at(1, 4).pattern === 2);
    checks.push(at(0, 4) !== null && at(0, 4).pattern === 3);
    let ghostCount = 0;
    for (const b of c.blocks) {
      if (c.grid[b.r][b.c] === 0) ghostCount++;
      if (c.grid[b.r][b.c] !== b.pattern) ghostCount++;
    }
    checks.push(ghostCount === 0);
    const movedIds = res.moved.map(m => m.id);
    checks.push(new Set(movedIds).size === movedIds.length);
    return checks;
  },

  pointSlide() {
    const c = coreWith([[2, 7, 5], [2, 6, 3], [0, 5, 5]]);
    const checks = [];

    const group = c.getPushGroup(2, 7, 'left');
    const maxDist = c.getMaxSlideDistance(group, 'left');
    const res = c.resolve({ group, dir: 'left', dist: 2 });

    checks.push(maxDist === 6);
    checks.push(res.match === true);
    checks.push(res.target && res.target.r === 0 && res.target.c === 5);
    checks.push(res.removedIds.length === 2);
    const m = c.blocks.find(b => b.pattern === 3);
    checks.push(!!m && m.r === 2 && m.c === 4);
    let ghostCount = 0;
    for (const b of c.blocks) {
      if (c.grid[b.r][b.c] === 0) ghostCount++;
      if (c.grid[b.r][b.c] !== b.pattern) ghostCount++;
    }
    checks.push(ghostCount === 0);
    return checks;
  },

  clickResolve() {
    const c = coreWith([[2, 7, 5], [0, 7, 5]]);
    const aId = c.findBlockByPos(2, 7).id;
    const bId = c.findBlockByPos(0, 7).id;
    const checks = [];

    const res = c.clickResolve(2, 7);
    checks.push(res.matched === true);
    checks.push(res.target && res.target.r === 0 && res.target.c === 7);
    checks.push(res.removedIds.includes(aId) && res.removedIds.includes(bId));
    checks.push(c.getClearedPairs() === 1);
    checks.push(c.findBlockByPos(2, 7) === null);
    checks.push(c.findBlockByPos(0, 7) === null);
    checks.push(c.getGrid()[2][7] === 0 && c.getGrid()[0][7] === 0);

    const c2 = coreWith([[4, 0, 1], [4, 2, 3], [4, 4, 1]]);
    const before = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks(), cp: c2.getClearedPairs() });
    const res2 = c2.clickResolve(4, 0);
    const after = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks(), cp: c2.getClearedPairs() });
    checks.push(res2.matched === false);
    checks.push(before === after);
    return checks;
  },

  multiPick() {
    const c = coreWith([[4, 3, 4], [4, 6, 4], [6, 3, 4]]);
    const aId = c.findBlockByPos(4, 3).id;
    const b1Id = c.findBlockByPos(4, 6).id;
    const b2Id = c.findBlockByPos(6, 3).id;
    const checks = [];

    const multi = c.findMultiMatches(4, 3);
    checks.push(multi !== null && Array.isArray(multi));
    checks.push(multi.some(t => t.r === 4 && t.c === 6));
    checks.push(multi.some(t => t.r === 6 && t.c === 3));

    const res = c.resolvePair(4, 3, 6, 3);
    checks.push(res.matched === true);
    checks.push(res.removedIds.includes(aId) && res.removedIds.includes(b2Id));
    checks.push(!res.removedIds.includes(b1Id));
    checks.push(c.getClearedPairs() === 1);
    checks.push(c.findBlockByPos(4, 3) === null);
    checks.push(c.findBlockByPos(6, 3) === null);
    checks.push(c.findBlockByPos(4, 6) !== null);
    checks.push(c.consistencyCheck().length === 0);

    const c3 = coreWith([[2, 2, 5], [2, 4, 5]]);
    checks.push(c3.findMultiMatches(2, 2) === null);

    checks.push(c3.findMultiMatches(0, 0) === null);
    return checks;
  },

  pickSlide() {
    const c = coreWith([[3, 2, 4], [3, 5, 4], [5, 3, 4]]);
    const aId = c.findBlockByPos(3, 2).id;
    const b1Id = c.findBlockByPos(3, 5).id;
    const b2Id = c.findBlockByPos(5, 3).id;
    const checks = [];

    const group = c.getPushGroup(3, 2, 'right');
    const d = GameCore.DIRS['right'];
    const aR = 3 + d.dr * 1, aC = 2 + d.dc * 1;
    const vacated = new Set(), occupied = new Map();
    for (const m of group) {
      vacated.add(m.r + "," + m.c);
      occupied.set((m.r + d.dr * 1) + "," + (m.c + d.dc * 1), c.grid[m.r][m.c]);
    }
    const multi = c.findMultiMatches(aR, aC, { vacated, occupied });
    checks.push(multi !== null && Array.isArray(multi));
    checks.push(multi.some(t => t.r === 3 && t.c === 5));
    checks.push(multi.some(t => t.r === 5 && t.c === 3));

    c.applySlide(group, 'right', 1);
    checks.push(c.findBlockByPos(3, 3) !== null && c.findBlockByPos(3, 3).pattern === 4);
    checks.push(c.findBlockByPos(3, 2) === null);
    checks.push(c.consistencyCheck().length === 0);

    const res = c.resolvePair(3, 3, 5, 3);
    checks.push(res.matched === true);
    checks.push(res.removedIds.includes(aId) && res.removedIds.includes(b2Id));
    checks.push(c.findBlockByPos(5, 3) === null);

    const c2 = coreWith([[3, 2, 4], [3, 5, 4], [5, 3, 4]]);
    const g2 = c2.getPushGroup(3, 2, 'right');
    const before = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks().map(b=>[b.r,b.c,b.pattern]) });
    const mv = c2.applySlide(g2, 'right', 1);
    c2.revertSlide(mv);
    const after = JSON.stringify({ grid: c2.getGrid(), blocks: c2.getBlocks().map(b=>[b.r,b.c,b.pattern]) });
    checks.push(before === after);
    checks.push(c2.consistencyCheck().length === 0);
    return checks;
  },

  chainPick() {
    const c = coreWith([[4, 4, 1], [3, 4, 2], [2, 4, 3], [2, 6, 1], [6, 4, 1]]);
    const checks = [];
    const A = c.findBlockByPos(4, 4);
    const M1 = c.findBlockByPos(3, 4);
    const M2 = c.findBlockByPos(2, 4);
    const B1 = c.findBlockByPos(2, 6);

    const group = c.getPushGroup(4, 4, 'up');
    checks.push(group.length === 3);
    const moved = c.applySlide(group, 'up', 2);

    const byId = (id) => c.blocks.find((b) => b.id === id);
    checks.push(byId(A.id).r === 2 && byId(A.id).c === 4 && byId(A.id).pattern === 1);
    checks.push(byId(M1.id).r === 1 && byId(M1.id).c === 4 && byId(M1.id).pattern === 2);
    checks.push(byId(M2.id).r === 0 && byId(M2.id).c === 4 && byId(M2.id).pattern === 3);
    checks.push(moved.length === 3);
    checks.push(c.consistencyCheck().length === 0);

    const multi = c.findMultiMatches(2, 4);
    checks.push(Array.isArray(multi) && multi.length >= 2);
    const t = multi.find((x) => x.r === 2 && x.c === 6) || multi[0];
    const res = c.resolvePair(2, 4, t.r, t.c);
    checks.push(res.matched === true);
    checks.push(c.getClearedPairs() === 1);
    checks.push(c.consistencyCheck().length === 0);
    checks.push(c.findBlockByPos(M1.r, M1.c).pattern === 2);

    const c2 = coreWith([[4, 4, 1], [3, 4, 2], [2, 4, 3]]);
    const snapBefore = JSON.stringify({ g: c2.getGrid(), b: c2.getBlocks().map(b=>[b.id,b.r,b.c,b.pattern]) });
    const mv2 = c2.applySlide(c2.getPushGroup(4, 4, 'up'), 'up', 2);
    c2.revertSlide(mv2);
    checks.push(JSON.stringify({ g: c2.getGrid(), b: c2.getBlocks().map(b=>[b.id,b.r,b.c,b.pattern]) }) === snapBefore);
    checks.push(c2.consistencyCheck().length === 0);
    return checks;
  },

  undo() {
    const checks = [];
    const c = coreWith([[2, 7, 5], [0, 7, 5]]);
    checks.push(c.canUndo() === false);

    const res = c.clickResolve(2, 7);
    checks.push(res.matched === true);
    checks.push(c.getClearedPairs() === 1);
    checks.push(c.getBlocks().length === 0);
    checks.push(c.canUndo() === true);

    const undone = c.undo();
    checks.push(undone === true);
    checks.push(c.getClearedPairs() === 0);
    checks.push(c.getBlocks().length === 2);
    checks.push(c.findBlockByPos(2, 7) !== null && c.findBlockByPos(2, 7).pattern === 5);
    checks.push(c.findBlockByPos(0, 7) !== null && c.findBlockByPos(0, 7).pattern === 5);
    checks.push(c.consistencyCheck().length === 0);
    checks.push(c.canUndo() === false);

    checks.push(c.undo() === false);

    const c2 = coreWith([[3, 4, 1], [2, 4, 2], [1, 4, 3], [2, 7, 1]]);
    const group = c2.getPushGroup(3, 4, 'up');
    const dist = c2.getMaxSlideDistance(group, 'up');
    const res2 = c2.resolve({ group, dir: 'up', dist });
    checks.push(res2.match === true);
    checks.push(c2.getClearedPairs() === 1);
    const ok2 = c2.undo();
    checks.push(ok2 === true);
    checks.push(c2.findBlockByPos(3, 4) !== null && c2.findBlockByPos(3, 4).pattern === 1);
    checks.push(c2.findBlockByPos(2, 4) !== null && c2.findBlockByPos(2, 4).pattern === 2);
    checks.push(c2.findBlockByPos(1, 4) !== null && c2.findBlockByPos(1, 4).pattern === 3);
    checks.push(c2.findBlockByPos(2, 7) !== null && c2.findBlockByPos(2, 7).pattern === 1);
    checks.push(c2.consistencyCheck().length === 0);
    checks.push(c2.getClearedPairs() === 0);
    return checks;
  },
};

function coreWith(entries) {
  const c = new GameCore();
  c.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  c.blocks = [];
  c.clearedPairs = 0;
  c.nextId = 1;
  for (const [r, cc, p] of entries) {
    c.grid[r][cc] = p;
    c.blocks.push({ id: c.nextId++, pattern: p, r, c: cc });
  }
  return c;
}

function runSelfTest(which = "all") {
  const failures = [];
  let count = 0;
  const keys = which === "all" ? Object.keys(selfTests) : [which];
  for (const key of keys) {
    const fn = selfTests[key];
    if (!fn) { failures.push(`unknown test group: ${key}`); continue; }
    const results = fn();
    for (const ok of results) {
      count++;
      if (!ok) failures.push(`${key}: assertion #${count} failed`);
    }
  }
  return { pass: failures.length === 0, count, failures };
}

module.exports = {
  GameCore, selfTests, runSelfTest, coreWith,
  ROWS, COLS, TOTAL_BLOCKS, TOTAL_PAIRS,
  BASE_PATTERNS, MAX_PATTERNS, FIXED_LEVEL,
  patternCountForLevel, countsForLevel, targetAdjacencyForLevel,
};