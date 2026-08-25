// 一致性模糊测试：随机走子，校验 core 的 grid/blocks 同步与消除/提示语义。
// 直接镜像 core 的 resolve / findHint 逻辑（基于“动作前”快照），避免模型自身口径错误。
const core = require('../js/core.js');
const GameCore = core.GameCore;
const DIRS = GameCore.DIRS;
const ROWS = 12, COLS = 9;

const snap = c => c.getGrid().map(r => r.slice());

function slideOverlay(before, group, dir, dist) {
  const d = DIRS[dir];
  const vacated = new Set(), occupied = new Map();
  for (const m of group) {
    vacated.add(m.r + ',' + m.c);
    occupied.set((m.r + d.dr * dist) + ',' + (m.c + d.dc * dist), before[m.r][m.c]);
  }
  return { vacated, occupied };
}

function firstInDir(before, r, c, dir, overlay) {
  const d = DIRS[dir];
  let cr = r + d.dr, cc = c + d.dc;
  while (cr >= 0 && cr < ROWS && cc >= 0 && cc < COLS) {
    let v;
    if (overlay.occupied.has(cr + ',' + cc)) v = overlay.occupied.get(cr + ',' + cc);
    else if (overlay.vacated.has(cr + ',' + cc)) v = 0;
    else v = before[cr][cc];
    if (v !== 0) return { r: cr, c: cc, v };
    cr += d.dr; cc += d.dc;
  }
  return null;
}

function checkMatchOn(before, r, c, overlay) {
  const pat = overlay.occupied.has(r + ',' + c) ? overlay.occupied.get(r + ',' + c)
    : overlay.vacated.has(r + ',' + c) ? 0 : before[r][c];
  if (pat === 0) return null;
  for (const dir of Object.keys(DIRS)) {
    const hit = firstInDir(before, r, c, dir, overlay);
    if (hit && hit.v === pat) return { r: hit.r, c: hit.c };
  }
  return null;
}

// 镜像 resolve：返回“消除后预期盘面”与“被消除的两格图案”。
function expectedAfterResolve(c, group, dir, dist, before) {
  const d = DIRS[dir];
  const exp = before.map(r => r.slice());
  const newPos = {};
  for (const m of group) newPos[m.id] = { r: m.r + d.dr * dist, c: m.c + d.dc * dist };
  for (const m of group) exp[m.r][m.c] = 0; // 清空原组格
  const a = group[0];
  const aR = a.r + d.dr * dist, aC = a.c + d.dc * dist;
  const overlay = slideOverlay(before, group, dir, dist);
  const hit = checkMatchOn(before, aR, aC, overlay);
  if (!hit) return { exp, elim: [] }; // 不匹配：resolve 不改盘面
  let bNew = null;
  for (const m of group) if (newPos[m.id].r === hit.r && newPos[m.id].c === hit.c) bNew = m.id;
  for (const m of group) {
    if (m.id === a.id) continue;       // head 被消除
    if (bNew !== null && m.id === bNew) continue; // 落点即目标的成员被消除
    exp[newPos[m.id].r][newPos[m.id].c] = before[m.r][m.c];
  }
  exp[aR][aC] = 0;
  exp[hit.r][hit.c] = 0; // 消除目标格
  const bPat = bNew !== null ? before[group.find(m => m.id === bNew).r][group.find(m => m.id === bNew).c]
    : before[hit.r][hit.c];
  return { exp, elim: [before[a.r][a.c], bPat] };
}

// 纯平移：镜像 applySlide
function expectedAfterApplySlide(group, dir, dist, before) {
  const d = DIRS[dir];
  const exp = before.map(r => r.slice());
  for (const m of group) exp[m.r][m.c] = 0;
  for (const m of group) exp[m.r + d.dr * dist][m.c + d.dc * dist] = before[m.r][m.c];
  return exp;
}

let bad = 0, elims = 0, picks = 0, hintsChecked = 0, syncChecks = 0, tested = 0;
const fail = (tag, info) => { bad++; console.log(tag, JSON.stringify(info)); };

for (const L of [1, 2, 3, 10, 60, 150, 250, 300, 400, 500]) {
  for (let trial = 0; trial < 8; trial++) {
    const c = new GameCore(L);
    for (let step = 0; step < 300 && c.getPatternCount() > 0; step++) {
      const g = c.getGrid();
      for (const b of c.getBlocks()) {
        syncChecks++;
        if (g[b.r][b.c] !== b.pattern) fail('✗同步', { L, r: b.r, c: b.c, grid: g[b.r][b.c], p: b.pattern });
      }
      const moves = [];
      for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
        const v = g[r][col]; if (!v) continue;
        if (col + 1 < COLS && g[r][col + 1] === v) moves.push({ t: 'click', a: { r, c: col } });
        if (r + 1 < ROWS && g[r + 1][col] === v) moves.push({ t: 'click', a: { r, c: col } });
      }
      const seen = new Set();
      for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
        if (!g[r][col]) continue;
        for (const dir of ['up', 'down', 'left', 'right']) {
          const grp = c.getPushGroup(r, col, dir); if (!grp) continue;
          const k = grp.map(m => m.id).join(',') + dir; if (seen.has(k)) continue; seen.add(k);
          const md = c.getMaxSlideDistance(grp, dir);
          for (let d = 1; d <= md; d++) moves.push({ t: 'slide', grp, dir, d });
        }
      }
      if (!moves.length) break;
      const mv = moves[(Math.random() * moves.length) | 0];
      const before = snap(c);

      if (mv.t === 'click') {
        const res = c.clickResolve(mv.a.r, mv.a.c);
        if (res && res.matched) {
          const af = snap(c), emp = [];
          for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++)
            if (before[r][col] > 0 && af[r][col] === 0) emp.push(before[r][col]);
          elims++;
          if (emp.length !== 2 || emp[0] !== emp[1]) fail('✗点击消除异图', { L, emp });
        }
      } else {
        const d = DIRS[mv.dir], head = mv.grp[0];
        const land = { r: head.r + d.dr * mv.d, c: head.c + d.dc * mv.d };
        const overlay = slideOverlay(before, mv.grp, mv.dir, mv.d);
        const multi = checkMatchOn(before, land.r, land.c, overlay) ? null : null; // 占位
        const multiHit = c.findMultiMatches(land.r, land.c, overlay);
        if (multiHit) {
          picks++;
          c.pushSnapshot(); c.applySlide(mv.grp, mv.dir, mv.d);
          const mid = snap(c), expSlide = expectedAfterApplySlide(mv.grp, mv.dir, mv.d, before);
          for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++)
            if (mid[r][col] !== expSlide[r][col]) fail('✗pick滑动落子不符', { L, r, col });
          const lp = mid[land.r][land.c];
          for (const t of multiHit) if (mid[t.r][t.c] !== lp) fail('✗pick目标异图', { L, t, lp });
          const ts = [...multiHit];
          for (let i = 0; i + 1 < ts.length; i += 2) {
            const b2 = snap(c), res = c.clickResolve(ts[i].r, ts[i].c);
            if (res && res.matched) {
              const af = snap(c), emp = [];
              for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++)
                if (b2[r][col] > 0 && af[r][col] === 0) emp.push(b2[r][col]);
              elims++;
              if (emp.length !== 2 || emp[0] !== emp[1]) fail('✗pick消除异图', { L, emp });
            }
          }
          c.undoSnapshot = null;
        } else {
          const res = c.resolve({ group: mv.grp, dir: mv.dir, dist: mv.d });
          if (res.match) {
            const { exp, elim } = expectedAfterResolve(c, mv.grp, mv.dir, mv.d, before);
            const af = snap(c);
            for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++)
              if (af[r][col] !== exp[r][col]) fail('✗滑动落子与模型不符', { L, r, col, exp: exp[r][col], got: af[r][col] });
            elims++;
            if (elim.length !== 2 || elim[0] !== elim[1]) fail('✗滑动消除异图', { L, elim });
          } else {
            const af = snap(c);
            for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++)
              if (af[r][col] !== before[r][col]) fail('✗不匹配滑动却改盘', { L, r, col });
          }
        }
        tested++;
      }
      if (step % 5 === 0) {
        const cur = snap(c); // 提示基于“走子后”的当前盘面
        const h = c.findHint();
        if (h) {
          hintsChecked++;
          const hb = c.getBlocks().find(b => b.id === h.blockId);
          if (!hb || !h.target) { fail('✗提示缺块', { L }); continue; }
          if (h.dir == null || h.dist === 0) {
            if (cur[h.target.r][h.target.c] !== hb.pattern) fail('✗点击提示异图', { L });
          } else {
            const d = DIRS[h.dir], headh = h.group[0];
            const ar = headh.r + d.dr * h.dist, ac = headh.c + d.dc * h.dist;
            const overlay = slideOverlay(cur, h.group, h.dir, h.dist);
            const hit = checkMatchOn(cur, ar, ac, overlay);
            if (!hit || hit.r !== h.target.r || hit.c !== h.target.c) fail('✗滑动提示无相遇', { L, hp: hb.pattern, hit, target: h.target });
          }
        }
      }
    }
  }
}
console.log(`消除:${elims} | pick轮:${picks} | 测试滑动动作:${tested} | 提示校验:${hintsChecked} | 同步断言:${syncChecks} | 违规:${bad}`);
process.exit(bad ? 1 : 0);
