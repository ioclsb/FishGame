// GameCore extracted verbatim from push-slide-match.html (pure logic, no
// DOM/canvas dependency) and wrapped as a CommonJS module for the WeChat
// Mini Game runtime. Logic is byte-for-byte the web version; only the
// export wrapper and the debug/env plumbing differ.
require('./debug.js'); // guarantees G.dbg / dbgStep
const { G } = require('./globals.js');

const DEBUG = G.__DEBUG_ENABLED === true;

const COLS = 9, ROWS = 12;      // 竖屏 9x12 布局（117 为奇数无法配对，取偶数 108）
const TOTAL_BLOCKS = COLS * ROWS; // 棋盘铺满 = 108 块
const TOTAL_PAIRS = TOTAL_BLOCKS / 2; // 54 对

// 难度（图案种数）排程：每关启用的“不同图案种数”D 随棋盘容量走带状区间——
// 下限 ⌈N/4⌉（同图案至多 4 个仍能铺满的最少种数）、上限 min(MAX_PATTERNS, ⌊N/3⌋)
// （⌊N/3⌋ 保证四连图案 ≥ 半数，从数学上杜绝“整盘全是两消”的极难局面）；
// L3 起沿 ease-out 曲线在带内爬升，PATTERN_FIXED_LEVEL 后封顶，仅剩排布难度继续变化。
// 每种图案每局固定 2 或 4 个：先各给 2 个，剩余块成对升级为 4。
const MAX_PATTERNS = 46;        // 手绘贴图总数（assets/patterns/01..46.png）
const PATTERN_FIXED_LEVEL = 250;// 图案种数约第 250 关到达带上限，之后不再新增；曲线前快后平
const LAYOUT_FIXED_LEVEL = 500; // 仅排布难度继续爬升到 500 关后封顶

// 预览用：设为非空数组时，棋盘只铺这些图案（真实编号），其余暂不登场。
// 设为 null 即恢复按关卡难度带正常轮换。后台绘制/配色数据均保留不动。
const RETAINED_PATTERNS = null;

// 非海洋主题彩蛋图（两张小人 + 一只小狗，编号取末三位）：
// 仅在“整十关”（第 10、20、30……关）加入轮换池，其余关卡不出现
const LATE_PATTERN_IDS = [44, 45, 46];

function isEggLevel(level) {
  return level >= 10 && level % 10 === 0;
}

function activePatternIds(level) {
  if (RETAINED_PATTERNS && RETAINED_PATTERNS.length) return RETAINED_PATTERNS.slice();
  // 组建本关可用的图案池：非整十关不含彩蛋图
  const egg = isEggLevel(level);
  const pool = [];
  for (let id = 1; id <= MAX_PATTERNS; id++) {
    if (!egg && LATE_PATTERN_IDS.indexOf(id) !== -1) continue;
    pool.push(id);
  }
  const D = Math.min(pool.length, regionPatternCount(level));
  // 关卡轮换窗口起点：让全部手绘图随关卡推进轮番登场
  const start = ((Math.max(1, level) - 1) * D) % pool.length;
  return Array.from({ length: D }, (_, i) => pool[(start + i) % pool.length]);
}

// 前期“体验版”棋盘：L1–L2 不满格（仅高度递减），但用满 9 列宽避免“空一格”；L3 起满格 9x12。
function boardDimsForLevel(level) {
  if (level <= 0) return { rows: 4, cols: 4 }; // 教学关
  if (level >= 3) return { rows: ROWS, cols: COLS }; // 第 3 关起满格 9x12
  const table = {
    1: { rows: 6, cols: 9 },
    2: { rows: 8, cols: 9 },
  };
  return table[level] || { rows: ROWS, cols: COLS };
}

// 每关启用图案种数：带状区间内沿 ease-out 曲线爬升（教学关哨兵固定 2 种）
function regionPatternCount(level) {
  if (level <= 0) return 2; // 教学关只用 2 种
  const { rows, cols } = boardDimsForLevel(level);
  const N = rows * cols;
  const dMin = Math.max(2, Math.ceil(N / 4));             // 全部 ≤4 个仍能铺满的最少种数
  const dMax = Math.min(MAX_PATTERNS, Math.floor(N / 3)); // 四连 ≥ 半数的最多种数
  const t = Math.min(1, Math.max(0, (level - 3) / (PATTERN_FIXED_LEVEL - 3)));
  const eased = 1 - (1 - t) * (1 - t);
  return Math.max(dMin, Math.min(dMax, Math.round(dMin + (dMax - dMin) * eased)));
}

// 把 N 块按“每种 2 或 4 个”分配给当前启用的图案集（和=N，每种均为偶数，可两两消完；
// 且必含四连——禁止出现整盘每个图案只剩 2 个的极难局面）。
function countsForLevel(level, totalBlocks) {
  const pids = activePatternIds(level);
  const P = pids.length;
  const N = (totalBlocks != null) ? totalBlocks : TOTAL_BLOCKS;
  const counts = new Array(P).fill(2);   // 先每种 2 个
  let rem = N - 2 * P;                    // 剩余成对升级为 4（带状约束保证 rem/2 ≤ P）
  for (let i = 0; rem > 0 && i < P; i++, rem -= 2) counts[i] += 2;
  for (let j = 0; rem > 0; j++, rem -= 2) counts[j % P] += 2; // 兜底（理论不触发）
  return counts;
}

// 相邻同图案“目标上限”：以随机铺满的期望对数 randomExp 为基准乘系数；
// 后期只“适度”去聚堆（比例 0.9→0.7），并加随种数 P 增长的绝对下限——
// 保证盘面上始终有适量可点消的相邻对，显著降低“无可消除”死局概率，
// 同时上限封住大团聚集（不会出现很多连片图案）。
function targetAdjacencyForLevel(level) {
  const P = activePatternIds(level).length;
  const adjTotal = COLS * (ROWS - 1) + (COLS - 1) * ROWS; // 棋盘全部相邻边数
  const randomExp = adjTotal / P;                         // 随机铺满的期望相邻同图案对数
  const t = Math.min(1, Math.max(0, (Math.max(1, level) - 1) / (LAYOUT_FIXED_LEVEL - 1)));
  const ratio = 0.9 - t * (0.9 - 0.7);                    // L1≈0.9（接近随机）… 后期≈0.7
  return Math.max(Math.round(P * 0.25), Math.round(randomExp * ratio));
}


class GameCore {
  constructor(level = 1) {
    this.grid = null;      // ROWS x COLS, 0 = empty, 1..P = pattern
    this.blocks = null;    // [{id, pattern, r, c}]
    this.clearedPairs = 0;
    this.nextId = 1;
    this.undoSnapshot = null; // snapshot of the board before the last elimination
    this.level = 1;
    this.rows = ROWS;
    this.cols = COLS;
    this.r0 = 0;           // 活动区域在本关网格中的起始行（随 _generateLayout 更新）
    this.c0 = 0;           // 活动区域起始列
    this.totalBlocks = TOTAL_BLOCKS;
    this.totalPairs = TOTAL_PAIRS;
    this.init(level);
  }

  init(level) {
    if (level != null) this.level = level | 0; // 允许 0（教学关哨兵）
    for (let attempt = 0; attempt < 100; attempt++) {
      this._generateLayout();
      if (this.findHint() !== null) return;
    }
    this._generateLayout();
  }

  // 首启教学关：小棋盘（4x4）+ 2 种图案的引导盘面
  loadTutorial() {
    this.level = 0;
    this._generateLayout();
  }

  _generateLayout() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.blocks = [];
    this.clearedPairs = 0;
    this.nextId = 1;
    this.undoSnapshot = null;   // a fresh board has no undo history

    const { rows, cols } = boardDimsForLevel(this.level);
    this.rows = rows;
    this.cols = cols;
    this.totalBlocks = rows * cols;
    this.totalPairs = this.totalBlocks / 2;
    const r0 = Math.floor((ROWS - rows) / 2);
    const c0 = Math.floor((COLS - cols) / 2);
    this.r0 = r0;
    this.c0 = c0;

    const pids = activePatternIds(this.level);
    const counts = countsForLevel(this.level, this.totalBlocks);
    const target = targetAdjacencyForLevel(this.level);

    const range = this._adjacencyRange();
    let best = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      const bag = [];
      counts.forEach((cnt, i) => { for (let k = 0; k < cnt; k++) bag.push(pids[i]); });
      this._shuffleArray(bag);
      let bi = 0;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          this.grid[r0 + r][c0 + c] = bag[bi++];

      const stats = this._adjacencyStats();
      const rangeGap = stats.adj < range.min ? range.min - stats.adj : Math.max(0, stats.adj - range.max);
      const progress = rangeGap === 0 && stats.chain === 0 ? this._clickClearProgress() : 0;
      const score = rangeGap * 1000 + stats.chain * 200 + (this.totalPairs - progress) * 10 + Math.abs(stats.adj - target);
      if (!best || score < best.score) best = { score, grid: this.grid.map(row => row.slice()) };
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          this.grid[r0 + r][c0 + c] = 0; // 仅清空区域以便下次尝试
    }
    if (best) this.grid = best.grid;

    // 由最终 grid 重建 blocks
    this.blocks = [];
    this.nextId = 1;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = this.grid[r][c];
        if (v) this.blocks.push({ id: this.nextId++, pattern: v, r, c });
      }

  }

  _adjacencyRange() {
    return this.level >= 50 ? { min: 3, max: 5 } : { min: 3, max: 8 };
  }

  _adjacencyStats() {
    const degree = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let adj = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const value = this.grid[r][c];
      if (!value) continue;
      if (c + 1 < COLS && this.grid[r][c + 1] === value) {
        adj++; degree[r][c]++; degree[r][c + 1]++;
      }
      if (r + 1 < ROWS && this.grid[r + 1][c] === value) {
        adj++; degree[r][c]++; degree[r + 1][c]++;
      }
    }
    let chain = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (degree[r][c] > 1) chain += degree[r][c] - 1;
      const value = this.grid[r][c];
      if (value && c + 2 < COLS && this.grid[r][c + 1] === value && this.grid[r][c + 2] === value) chain++;
      if (value && r + 2 < ROWS && this.grid[r + 1][c] === value && this.grid[r + 2][c] === value) chain++;
    }
    return { adj, chain };
  }

  _clickClearProgress() {
    const grid = this.grid.map(row => row.slice());
    const firstMatch = (r, c) => {
      const pattern = grid[r][c];
      if (!pattern) return null;
      for (const dir of Object.values(GameCore.DIRS)) {
        let nr = r + dir.dr, nc = c + dir.dc;
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          if (grid[nr][nc]) {
            if (grid[nr][nc] === pattern) return { r: nr, c: nc };
            break;
          }
          nr += dir.dr;
          nc += dir.dc;
        }
      }
      return null;
    };

    let cleared = 0;
    while (true) {
      const moves = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        const hit = firstMatch(r, c);
        if (hit) moves.push({ r, c, hit });
      }
      if (!moves.length) return cleared;
      let bestMove = moves[0];
      let bestNext = -1;
      for (const move of moves) {
        const a = grid[move.r][move.c], b = grid[move.hit.r][move.hit.c];
        grid[move.r][move.c] = 0;
        grid[move.hit.r][move.hit.c] = 0;
        let next = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!grid[r][c]) continue;
          if (firstMatch(r, c)) next++;
        }
        grid[move.r][move.c] = a;
        grid[move.hit.r][move.hit.c] = b;
        if (next > bestNext) { bestNext = next; bestMove = move; }
      }
      grid[bestMove.r][bestMove.c] = 0;
      grid[bestMove.hit.r][bestMove.hit.c] = 0;
      cleared++;
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
  getTotalPairs() { return this.totalPairs; }
  getClearedPairs() { return this.clearedPairs; }
  getProgress() { return this.clearedPairs / this.totalPairs; }
  getPatternCount() { return this.blocks.length; }
  getTotalBlocks() { return this.totalBlocks; }
  getRows() { return this.rows; }
  getCols() { return this.cols; }

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
    // 只在本关活动区域内滑行：区域外虽是空格，但那是可见棋盘之外，不可推入
    while (this._inPlayBounds(cr, cc) && this.grid[cr][cc] === 0) {
      dist++;
      cr += d.dr;
      cc += d.dc;
    }
    if (!this._probing) {
      dbg({ type: 'maxSlideDistance', dir, front: { r: front.r, c: front.c, p: front.pattern }, dist,
            stop: this._inPlayBounds(cr, cc) ? { r: cr, c: cc, p: this.grid[cr][cc] } : 'boundary' });
    }
    return dist;
  }

  // 本关活动区域边界：前两关棋盘不满格时，方块不能滑出可见棋盘范围
  _inPlayBounds(r, c) {
    return r >= this.r0 && r < this.r0 + this.rows && c >= this.c0 && c < this.c0 + this.cols;
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
      // 只在本关活动区域内洗牌：区域外是可见棋盘之外，不可放置方块
      for (let r = this.r0; r < this.r0 + this.rows; r++)
        for (let c = this.c0; c < this.c0 + this.cols; c++)
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
    const c = new GameCore(300); // 满棋盘关卡校验结构不变
    const checks = [];
    checks.push(c.getGrid().length === ROWS);
    checks.push(c.getGrid().every(row => row.length === COLS));
    checks.push(c.getPatternCount() === TOTAL_BLOCKS);
    checks.push(c.getTotalPairs() === TOTAL_PAIRS);
    const expected = countsForLevel(300, TOTAL_BLOCKS);
    const pids = activePatternIds(300);
    const counts = new Array(Math.max.apply(null, pids) + 1).fill(0);
    for (const b of c.getBlocks()) counts[b.pattern]++;
    checks.push(pids.every((pid, i) => counts[pid] === expected[i]));
    checks.push(pids.every(pid => counts[pid] > 0 && counts[pid] % 2 === 0));
    let empty = 0;
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++)
        if (c.getGrid()[r][col] === 0) empty++;
    checks.push(empty === 0);
    return checks;
  },

  experience() {
    const checks = [];
    const c = new GameCore(1);
    checks.push(c.getCols() === 9 && c.getRows() === 6);
    checks.push(c.getTotalBlocks() === 54 && c.getPatternCount() === 54);
    const pids = activePatternIds(1);
    checks.push(pids.length === 14); // L1：6x9=54 格，带状下限 ⌈54/4⌉=14 种
    const counts = {};
    for (const b of c.getBlocks()) counts[b.pattern] = (counts[b.pattern] || 0) + 1;
    checks.push(pids.every(p => counts[p] % 2 === 0 && counts[p] > 0));
    let empty = 0;
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++)
        if (c.getGrid()[r][col] === 0) empty++;
    checks.push(empty === ROWS * COLS - 54);
    checks.push(c.findHint() !== null);
    // 教学关
    const t = new GameCore(0);
    checks.push(t.getCols() === 4 && t.getRows() === 4);
    checks.push(t.getTotalBlocks() === 16 && t.getPatternCount() === 16);
    const tpids = activePatternIds(0);
    checks.push(tpids.length === 2);
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
  // 自定义盘面横跨整个网格：显式声明为满盘区域，滑动边界与旧整盘语义一致
  c.rows = ROWS;
  c.cols = COLS;
  c.r0 = 0;
  c.c0 = 0;
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
  MAX_PATTERNS, PATTERN_FIXED_LEVEL, LAYOUT_FIXED_LEVEL,
  countsForLevel, targetAdjacencyForLevel,
};
