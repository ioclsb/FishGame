// Procedural canvas drawing of the six sea creatures, ported from the inline
// SVG bodies in push-slide-match.html. WeChat Mini Game canvases do NOT
// decode SVG data-URIs, so each 100x100 SVG is re-expressed as canvas paths.
// All drawing happens in a 0..100 unit space; the caller pre-scales the
// context to the desired pixel size.

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const OUT = 'rgba(15,30,48,0.72)';

// ctx.ellipse with a transform-based fallback for runtimes that lack it.
function ell(ctx, x, y, rx, ry, rot, a0, a1) {
  if (typeof ctx.ellipse === 'function') { ctx.ellipse(x, y, rx, ry, rot, a0, a1); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(rx, ry);
  ctx.arc(0, 0, 1, a0, a1);
  ctx.restore();
}

function drawClownfish(ctx) {
  const body = ctx.createLinearGradient(0, 33, 0, 69);
  body.addColorStop(0, '#ffb066');
  body.addColorStop(1, '#f4772e');
  const fin = ctx.createLinearGradient(0, 22, 0, 69);
  fin.addColorStop(0, '#ffd9a8');
  fin.addColorStop(1, '#ff9a4d');

  // tail fin
  ctx.beginPath();
  ctx.moveTo(70, 46); ctx.lineTo(93, 30);
  ctx.quadraticCurveTo(86, 49, 93, 69);
  ctx.lineTo(70, 53);
  ctx.closePath();
  ctx.fillStyle = fin; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  // top fin
  ctx.beginPath();
  ctx.moveTo(40, 34); ctx.quadraticCurveTo(54, 22, 66, 31); ctx.lineTo(60, 41); ctx.closePath();
  ctx.fillStyle = fin; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  // body
  ctx.beginPath();
  ell(ctx, 47, 51, 28, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // white stripes clipped to the body
  ctx.save();
  ctx.beginPath();
  ell(ctx, 47, 51, 28, 18, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.moveTo(33, 33); ctx.quadraticCurveTo(39, 30, 43, 33); ctx.lineTo(41, 69); ctx.quadraticCurveTo(37, 71, 33, 68); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(55, 32); ctx.quadraticCurveTo(60, 31, 63, 34); ctx.lineTo(62, 68); ctx.quadraticCurveTo(58, 70, 54, 68); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // eye
  ctx.beginPath(); ctx.arc(28, 45, 5.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(27, 46, 2.6, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  ctx.beginPath(); ctx.arc(28.2, 44, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  // mouth
  ctx.beginPath();
  ctx.moveTo(20, 55); ctx.quadraticCurveTo(24, 59, 29, 58);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
}

function drawBlueTang(ctx) {
  const body = ctx.createLinearGradient(0, 34, 0, 70);
  body.addColorStop(0, '#5f9dff');
  body.addColorStop(1, '#2456c9');
  const tail = ctx.createLinearGradient(0, 32, 0, 68);
  tail.addColorStop(0, '#ffe066');
  tail.addColorStop(1, '#ffc21e');

  // tail
  ctx.beginPath();
  ctx.moveTo(68, 48); ctx.lineTo(92, 32);
  ctx.quadraticCurveTo(87, 50, 92, 68);
  ctx.lineTo(68, 52); ctx.closePath();
  ctx.fillStyle = tail; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  // top fin
  ctx.beginPath();
  ctx.moveTo(36, 36); ctx.quadraticCurveTo(52, 22, 68, 33); ctx.lineTo(64, 42); ctx.closePath();
  ctx.fillStyle = '#1d3f8f'; ctx.fill();
  // body
  ctx.beginPath();
  ell(ctx, 48, 52, 27, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // dark mask stripe clipped to body
  ctx.save();
  ctx.beginPath();
  ell(ctx, 48, 52, 27, 18, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(30, 38); ctx.quadraticCurveTo(52, 32, 74, 42); ctx.quadraticCurveTo(56, 46, 30, 48); ctx.closePath();
  ctx.fillStyle = '#101c3a'; ctx.globalAlpha = 0.85; ctx.fill();
  ctx.restore();
  // mouth line
  ctx.beginPath();
  ctx.moveTo(40, 62); ctx.quadraticCurveTo(52, 66, 62, 61);
  ctx.strokeStyle = '#16307a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
  // eye
  ctx.beginPath(); ctx.arc(29, 47, 5.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(28, 48, 2.7, 0, Math.PI * 2); ctx.fillStyle = '#141a26'; ctx.fill();
  ctx.beginPath(); ctx.arc(29.2, 46, 1.3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

function drawTurtle(ctx) {
  const shell = ctx.createLinearGradient(0, 17, 0, 77);
  shell.addColorStop(0, '#57d68d');
  shell.addColorStop(1, '#1f9653');
  const flipper = ctx.createLinearGradient(0, 27, 0, 77);
  flipper.addColorStop(0, '#8ce7ae');
  flipper.addColorStop(1, '#4cbf7d');

  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  const fl = (x, y, rx, ry, rot) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ell(ctx, 0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = flipper; ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  fl(24, 34, 12, 7, -38 * Math.PI / 180);
  fl(76, 34, 12, 7, 38 * Math.PI / 180);
  fl(26, 66, 12, 7, 30 * Math.PI / 180);
  fl(74, 66, 12, 7, -30 * Math.PI / 180);
  // tail
  ctx.save();
  ctx.translate(50, 84);
  ctx.beginPath(); ell(ctx, 0, 0, 9, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = flipper; ctx.fill(); ctx.stroke();
  ctx.restore();
  // shell
  ctx.beginPath(); ctx.arc(50, 47, 30, 0, Math.PI * 2);
  ctx.fillStyle = shell; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // shell pattern
  ctx.beginPath();
  ctx.moveTo(50, 24); ctx.lineTo(66, 36); ctx.lineTo(60, 56); ctx.lineTo(40, 56); ctx.lineTo(34, 36); ctx.closePath();
  ctx.moveTo(50, 24); ctx.lineTo(50, 56);
  ctx.moveTo(34, 36); ctx.lineTo(40, 56);
  ctx.moveTo(66, 36); ctx.lineTo(60, 56);
  ctx.strokeStyle = '#157a42'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke();
  // inner ring
  ctx.beginPath(); ctx.arc(50, 47, 28, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3; ctx.stroke();
}

function drawPufferfish(ctx) {
  const body = ctx.createLinearGradient(0, 28, 0, 76);
  body.addColorStop(0, '#ffe27a');
  body.addColorStop(1, '#f7b62b');

  // spikes
  ctx.strokeStyle = '#e89b1c';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x1 = 50 + Math.cos(a) * 22, y1 = 52 + Math.sin(a) * 22;
    const x2 = 50 + Math.cos(a) * 33, y2 = 52 + Math.sin(a) * 33;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // body
  ctx.beginPath(); ctx.arc(50, 52, 24, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // belly
  ctx.beginPath(); ell(ctx, 50, 63, 15, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3c9'; ctx.globalAlpha = 0.85; ctx.fill();
  ctx.globalAlpha = 1;
  // tail fin
  ctx.beginPath();
  ctx.moveTo(28, 44); ctx.quadraticCurveTo(18, 40, 16, 32); ctx.quadraticCurveTo(26, 33, 31, 39); ctx.closePath();
  ctx.fillStyle = '#f7b62b'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  // eyes
  ctx.beginPath(); ctx.arc(41, 47, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(42, 48, 3, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  ctx.beginPath(); ctx.arc(43, 46, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(61, 47, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(60, 48, 3, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  ctx.beginPath(); ctx.arc(61, 46, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  // mouth
  ctx.beginPath();
  ctx.moveTo(46, 59); ctx.quadraticCurveTo(51, 63, 56, 59);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke();
}

function drawJellyfish(ctx) {
  const dome = ctx.createLinearGradient(0, 28, 0, 62);
  dome.addColorStop(0, '#cf9bff');
  dome.addColorStop(1, '#8a4be0');

  // tentacles
  ctx.strokeStyle = '#d9c6ff';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  const tents = [
    'M32 60 Q28 72 34 82 Q39 91 33 97',
    'M44 62 Q40 75 46 85 Q51 94 45 99',
    'M57 62 Q61 75 55 85 Q50 94 56 98',
    'M68 60 Q73 71 67 81 Q62 90 68 96',
  ];
  tents.forEach((d, i) => {
    ctx.globalAlpha = 0.95 - i * 0.08;
    ctx.beginPath();
    ctx.moveTo(32, 60);
    if (i === 0) { ctx.quadraticCurveTo(28, 72, 34, 82); ctx.quadraticCurveTo(39, 91, 33, 97); }
    else if (i === 1) { ctx.quadraticCurveTo(40, 75, 46, 85); ctx.quadraticCurveTo(51, 94, 45, 99); }
    else if (i === 2) { ctx.quadraticCurveTo(61, 75, 55, 85); ctx.quadraticCurveTo(50, 94, 56, 98); }
    else { ctx.quadraticCurveTo(73, 71, 67, 81); ctx.quadraticCurveTo(62, 90, 68, 96); }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // dome
  ctx.beginPath();
  ctx.moveTo(20, 55);
  ctx.arc(50, 55, 30, Math.PI, 0);
  ctx.quadraticCurveTo(70, 61, 60, 56);
  ctx.quadraticCurveTo(50, 61, 40, 56);
  ctx.quadraticCurveTo(30, 61, 20, 55);
  ctx.closePath();
  ctx.fillStyle = dome; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // highlight
  const gl = ctx.createRadialGradient(42, 40, 0, 42, 40, 20);
  gl.addColorStop(0, 'rgba(255,255,255,0.26)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.beginPath(); ell(ctx, 42, 40, 16, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = gl; ctx.fill();
  // dots
  ctx.beginPath(); ctx.arc(40, 47, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(60, 47, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

function drawCrab(ctx) {
  const body = ctx.createLinearGradient(0, 39, 0, 77);
  body.addColorStop(0, '#ff8a70');
  body.addColorStop(1, '#e83a28');
  const claw = ctx.createLinearGradient(0, 10, 0, 30);
  claw.addColorStop(0, '#ffa38c');
  claw.addColorStop(1, '#f04b38');

  ctx.lineCap = 'round';
  // legs
  ctx.strokeStyle = '#c93a2c';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(34, 58); ctx.quadraticCurveTo(20, 62, 15, 72); ctx.quadraticCurveTo(12, 79, 7, 81);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(66, 58); ctx.quadraticCurveTo(80, 62, 85, 72); ctx.quadraticCurveTo(88, 79, 93, 81);
  ctx.stroke();
  // arms
  ctx.strokeStyle = '#e8503a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(30, 44); ctx.quadraticCurveTo(18, 34, 20, 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(70, 44); ctx.quadraticCurveTo(82, 34, 80, 24);
  ctx.stroke();
  // claws
  const clawFn = (x, y, spikeDx, spikeDy) => {
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = claw; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + spikeDx, y + spikeDy);
    ctx.lineTo(x + spikeDx * 2.5, y + spikeDy * 2.5);
    ctx.lineTo(x + spikeDx * 0.9, y + spikeDy * 1.5);
    ctx.closePath();
    ctx.fillStyle = '#ffe9e2'; ctx.fill();
  };
  clawFn(20, 20, 1, -1);
  clawFn(80, 20, -1, -1);
  // body
  ctx.beginPath(); ell(ctx, 50, 58, 26, 19, 0, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  // eyestalks
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(36, 40); ctx.lineTo(38, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(64, 40); ctx.lineTo(62, 30); ctx.stroke();
  // eyes
  ctx.beginPath(); ctx.arc(38, 28, 4.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(38, 28, 2.3, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  ctx.beginPath(); ctx.arc(62, 28, 4.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(62, 28, 2.3, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  // mouth
  ctx.beginPath();
  ctx.moveTo(42, 62); ctx.quadraticCurveTo(50, 68, 58, 62);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
}

function drawCreature(ctx, pattern, color) {
  // 注入接近满色的填充，使 8–70 生物各自鲜明（原 1–7 用自己的渐变，不受影响）
  BODY = color ? shade(color, 12) : '#eef4fb';
  switch (pattern) {
    case 1: drawClownfish(ctx); break;
    case 2: drawBlueTang(ctx); break;
    case 3: drawTurtle(ctx); break;
    case 4: drawPufferfish(ctx); break;
    case 5: drawJellyfish(ctx); break;
    case 6: drawCrab(ctx); break;
    case 7: drawStarfish(ctx); break;
    case 8: drawSeahorse(ctx); break;
    case 9: drawOctopus(ctx); break;
    case 10: drawWhale(ctx); break;
    case 11: drawShark(ctx); break;
    case 12: drawDolphin(ctx); break;
    case 13: drawSquid(ctx); break;
    case 14: drawShrimp(ctx); break;
    case 15: drawLobster(ctx); break;
    case 16: drawRay(ctx); break;
    case 17: drawEel(ctx); break;
    case 18: drawSwordfish(ctx); break;
    case 19: drawAngler(ctx); break;
    case 20: drawNautilus(ctx); break;
    case 21: drawConch(ctx); break;
    case 22: drawScallop(ctx); break;
    case 23: drawClam(ctx); break;
    case 24: drawUrchin(ctx); break;
    case 25: drawSandDollar(ctx); break;
    case 26: drawCoral(ctx); break;
    case 27: drawGuppy(ctx); break;
    case 28: drawGoldfish(ctx); break;
    case 29: drawMarlin(ctx); break;
    case 30: drawParrot(ctx); break;
    case 31: drawSawfish(ctx); break;
    case 32: drawAnchovy(ctx); break;
    case 33: drawBeta(ctx); break;
    case 34: drawHammerhead(ctx); break;
    case 35: drawWhaleShark(ctx); break;
    case 36: drawManatee(ctx); break;
    case 37: drawBarracuda(ctx); break;
    case 38: drawFlyingfish(ctx); break;
    case 39: drawGrouper(ctx); break;
    case 40: drawManta(ctx); break;
    case 41: drawCuttlefish(ctx); break;
    case 42: drawSeahare(ctx); break;
    case 43: drawCoelacanth(ctx); break;
    case 44: drawLancetfish(ctx); break;
    case 45: drawSunfish(ctx); break;
    case 46: drawSpinyfish(ctx); break;
    case 47: drawTriggerfish(ctx); break;
    case 48: drawFilefish(ctx); break;
    case 49: drawPipefish(ctx); break;
    case 50: drawLeafy(ctx); break;
    case 51: drawHatchetfish(ctx); break;
    case 52: drawLionfish(ctx); break;
    case 53: drawNudibranch(ctx); break;
    case 54: drawChiton(ctx); break;
    case 55: drawConeShell(ctx); break;
    case 56: drawSpiralShell(ctx); break;
    case 57: drawWhelk(ctx); break;
    case 58: drawTurbanShell(ctx); break;
    case 59: drawBasketStar(ctx); break;
    case 60: drawFeatherStar(ctx); break;
    case 61: drawSalp(ctx); break;
    case 62: drawIsopod(ctx); break;
    case 63: drawSponge(ctx); break;
    case 64: drawBranchy(ctx); break;
    case 65: drawBrittleStar(ctx); break;
    case 66: drawSeaCucumber(ctx); break;
    case 67: drawHorseshoeCrab(ctx); break;
    case 68: drawAmmonite(ctx); break;
    case 69: drawTrilobite(ctx); break;
    case 70: drawCombJelly(ctx); break;
  }
}

function drawStarfish(ctx) {
  const base = ctx.createLinearGradient(0, 18, 0, 84);
  base.addColorStop(0, '#5fe0ef');
  base.addColorStop(1, '#16bccb');
  const cx = 50, cy = 52, R = 37, ri = 16, points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / points;
    const rad = (i % 2 === 0) ? R : ri;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = base; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
  // 中央圆盘 + 斑点
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fillStyle = shade('#16bccb', 34); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke();
  // 眼睛
  ctx.fillStyle = 'rgba(15,30,48,0.72)';
  ctx.beginPath(); ctx.arc(cx - 4.5, cy - 2, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4.5, cy - 2, 2.3, 0, Math.PI * 2); ctx.fill();
}

let BODY = '#eef4fb'; // 8–35 生物的填充色：由 drawCreature 按图案色提亮后注入，配深色描边
function _outlineStroke(ctx) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke(); }
function _eyes(ctx, x1, y1, x2, y2, r) {
  r = r || 3.2;
  for (const p of [[x1, y1], [x2, y2]]) {
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#20242c'; ctx.fill();
  }
}
// 亮→饱和竖向渐变填充（对齐 1–7 原始釉质风：上亮下饱和），仅同色系内明暗过渡
function _fillGloss(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(BODY, 24));
  g.addColorStop(0.5, BODY);
  g.addColorStop(1, shade(BODY, -34));
  ctx.fillStyle = g; ctx.fill(); _outlineStroke(ctx);
}

function drawSeahorse(ctx) {
  ctx.beginPath();
  ctx.moveTo(46, 30);
  ctx.bezierCurveTo(64, 34, 66, 54, 52, 60);
  ctx.bezierCurveTo(66, 66, 60, 80, 46, 82);
  ctx.quadraticCurveTo(40, 70, 44, 62);
  ctx.quadraticCurveTo(38, 50, 40, 42);
  ctx.bezierCurveTo(30, 44, 30, 34, 46, 30);
  ctx.closePath(); _fillGloss(ctx, 28, 84);
  ctx.beginPath(); ctx.moveTo(46, 82); ctx.quadraticCurveTo(60, 86, 56, 94); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 32); ctx.lineTo(28, 30); ctx.lineTo(32, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(52, 40); ctx.lineTo(64, 34); ctx.lineTo(58, 46); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 4; i++) { const y = 42 + i * 9; ctx.beginPath(); ctx.moveTo(38, y); ctx.quadraticCurveTo(52, y + 4, 60, y); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -28); ctx.stroke(); }
  _eyes(ctx, 40, 38, 40, 38, 3);
}
function drawOctopus(ctx) {
  ctx.beginPath(); ctx.arc(50, 40, 24, Math.PI, 0); ctx.lineTo(74, 52); ctx.quadraticCurveTo(50, 64, 26, 52); ctx.closePath(); _fillGloss(ctx, 18, 56);
  for (let i = 0; i < 4; i++) { const x = 30 + i * 13; ctx.beginPath(); ctx.moveTo(x, 52); ctx.quadraticCurveTo(x - 6, 74, x + 2, 90); ctx.lineWidth = 6; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
    for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.arc(x - 3 + s * 2, 60 + s * 10, 1.8, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -30); ctx.fill(); } }
  _eyes(ctx, 42, 38, 58, 38, 4);
}
function drawWhale(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 54, 32, 22, 0, 0, Math.PI * 2); _fillGloss(ctx, 32, 76);
  ctx.beginPath(); ctx.moveTo(74, 48); ctx.lineTo(92, 38); ctx.lineTo(90, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 34); ctx.lineTo(48, 20); ctx.lineTo(56, 34); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(20, 48); ctx.quadraticCurveTo(30, 44, 26, 54); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(40, 60, 16, 6, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 64, 50, 64, 50, 3);
}
function drawShark(ctx) {
  ctx.beginPath(); ctx.moveTo(14, 52); ctx.quadraticCurveTo(46, 30, 78, 48); ctx.lineTo(94, 44); ctx.lineTo(80, 60); ctx.quadraticCurveTo(46, 74, 14, 52); ctx.closePath(); _fillGloss(ctx, 30, 74);
  ctx.beginPath(); ctx.moveTo(44, 34); ctx.lineTo(54, 16); ctx.lineTo(60, 36); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(14, 52); ctx.lineTo(4, 44); ctx.lineTo(8, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 4; i++) { const x = 30 + i * 8; ctx.beginPath(); ctx.moveTo(x, 40); ctx.quadraticCurveTo(x + 4, 50, x, 60); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(78, 52); ctx.lineTo(90, 50); ctx.lineTo(78, 58); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  _eyes(ctx, 70, 46, 70, 46, 2.8);
}
function drawDolphin(ctx) {
  ctx.beginPath(); ctx.moveTo(16, 58); ctx.quadraticCurveTo(44, 36, 72, 46); ctx.quadraticCurveTo(86, 48, 92, 40); ctx.quadraticCurveTo(82, 58, 70, 62); ctx.quadraticCurveTo(46, 76, 16, 58); ctx.closePath(); _fillGloss(ctx, 34, 78);
  ctx.beginPath(); ctx.moveTo(44, 40); ctx.lineTo(50, 22); ctx.lineTo(58, 42); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(16, 58); ctx.lineTo(4, 52); ctx.lineTo(10, 64); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(60, 56); ctx.quadraticCurveTo(72, 62, 84, 56); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
  _eyes(ctx, 74, 46, 74, 46, 2.8);
}
function drawSquid(ctx) {
  ctx.beginPath(); ctx.moveTo(34, 20); ctx.quadraticCurveTo(66, 18, 66, 48); ctx.quadraticCurveTo(66, 62, 50, 62); ctx.quadraticCurveTo(34, 62, 34, 48); ctx.closePath(); _fillGloss(ctx, 18, 62);
  for (let i = 0; i < 5; i++) { const x = 38 + i * 6; ctx.beginPath(); ctx.moveTo(x, 60); ctx.quadraticCurveTo(x, 82, x + 2, 92); ctx.lineWidth = 4; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 44, 14, 8, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 44, 40, 56, 40, 3.4);
}
function drawShrimp(ctx) {
  ctx.beginPath(); ctx.moveTo(30, 40); ctx.quadraticCurveTo(70, 30, 72, 54); ctx.quadraticCurveTo(74, 74, 54, 80); ctx.quadraticCurveTo(40, 84, 34, 72); ctx.quadraticCurveTo(50, 64, 44, 50); ctx.quadraticCurveTo(40, 44, 30, 40); ctx.closePath(); _fillGloss(ctx, 28, 82);
  for (let i = 0; i < 5; i++) { const y = 46 + i * 7; ctx.beginPath(); ctx.moveTo(36, y); ctx.quadraticCurveTo(56, y + 4, 70, y); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(30, 40); ctx.quadraticCurveTo(20, 30, 16, 18); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = 46 + i * 6; ctx.beginPath(); ctx.moveTo(x, 76); ctx.lineTo(x - 2, 88); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  _eyes(ctx, 40, 44, 40, 44, 2.6);
}
function drawLobster(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 56, 18, 22, 0, 0, Math.PI * 2); _fillGloss(ctx, 34, 78);
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50, 40); ctx.quadraticCurveTo(50 + d * 20, 30, 50 + d * 30, 18); ctx.lineWidth = 9; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50 + d * 10, 40); ctx.lineTo(50 + d * 34, 30); ctx.lineWidth = 8; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.arc(50 + d * 34, 30, 6, 0, Math.PI * 2); ctx.fill(); _outlineStroke(ctx); }
  for (let i = 0; i < 4; i++) { const x = 44 + i * 4; ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x, 90); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  _eyes(ctx, 44, 44, 56, 44, 2.8);
}
function drawRay(ctx) {
  ctx.beginPath(); ctx.moveTo(50, 44); ctx.quadraticCurveTo(14, 26, 8, 52); ctx.quadraticCurveTo(36, 60, 50, 52); ctx.quadraticCurveTo(64, 60, 92, 52); ctx.quadraticCurveTo(86, 26, 50, 44); ctx.closePath(); _fillGloss(ctx, 24, 62);
  ctx.beginPath(); ctx.moveTo(50, 54); ctx.lineTo(50, 90); ctx.lineWidth = 5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(40, 40); ctx.quadraticCurveTo(26, 22, 42, 20); ctx.lineTo(48, 34); ctx.closePath(); ctx.fill(); _outlineStroke(ctx); }
  ctx.beginPath(); ctx.ellipse(50, 46, 16, 6, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 42, 40, 60, 40, 2.6);
}
function drawEel(ctx) {
  ctx.beginPath(); ctx.moveTo(20, 40);
  for (let i = 0; i <= 8; i++) { const x = 20 + i * 8; const y = 40 + Math.sin(i * 0.9) * 16; if (i) ctx.lineTo(x, y); }
  ctx.lineTo(84, 56); ctx.lineTo(84, 64);
  for (let i = 8; i >= 0; i--) { const x = 20 + i * 8; const y = 50 + Math.sin(i * 0.9) * 16; ctx.lineTo(x, y); }
  ctx.closePath(); _fillGloss(ctx, 30, 64);
  for (let i = 0; i < 6; i++) { const x = 28 + i * 9; ctx.beginPath(); ctx.arc(x, 40 + Math.sin(i * 0.9) * 16, 2, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -30); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(10, 36); ctx.lineTo(14, 46); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 22, 42, 22, 42, 2.6);
}
function drawSwordfish(ctx) {
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.quadraticCurveTo(50, 36, 76, 50); ctx.lineTo(90, 46); ctx.lineTo(76, 58); ctx.quadraticCurveTo(50, 70, 20, 52); ctx.closePath(); _fillGloss(ctx, 34, 70);
  ctx.beginPath(); ctx.moveTo(76, 50); ctx.lineTo(96, 48); ctx.lineTo(76, 56); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(46, 38); ctx.lineTo(52, 22); ctx.lineTo(60, 40); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(6, 44); ctx.lineTo(10, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 70, 48, 70, 48, 2.8);
}
function drawAngler(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 56, 28, 24, 0, 0, Math.PI * 2); _fillGloss(ctx, 32, 80);
  ctx.beginPath(); ctx.moveTo(26, 44); ctx.quadraticCurveTo(20, 24, 38, 30); ctx.quadraticCurveTo(44, 38, 34, 44); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(38, 30); ctx.quadraticCurveTo(48, 12, 56, 28); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.arc(54, 14, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(34, 60); ctx.quadraticCurveTo(50, 70, 66, 60); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  for (let i = 0; i < 5; i++) { const x = 36 + i * 7; ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x - 3, 68); ctx.lineTo(x + 3, 68); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); }
  _eyes(ctx, 44, 48, 44, 48, 3);
}
function drawNautilus(ctx) {
  ctx.beginPath(); ctx.arc(52, 52, 26, 0, Math.PI * 2); _fillGloss(ctx, 26, 78);
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(52, 52, 26 - i * 7, Math.PI * 0.1, Math.PI * 1.7); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const a = Math.PI * 0.2 + i * 0.4; ctx.beginPath(); ctx.moveTo(52 + Math.cos(a) * 8, 52 + Math.sin(a) * 8); ctx.quadraticCurveTo(52 + Math.cos(a) * 30, 52 + Math.sin(a) * 30, 52 + Math.cos(a) * 30, 52 + Math.sin(a) * 30); ctx.lineWidth = 3; ctx.strokeStyle = BODY; ctx.stroke(); }
  _eyes(ctx, 70, 56, 70, 56, 2.6);
}
function drawConch(ctx) {
  ctx.beginPath(); ctx.moveTo(34, 76); ctx.lineTo(32, 42); ctx.quadraticCurveTo(50, 22, 70, 42); ctx.lineTo(68, 76); ctx.closePath(); _fillGloss(ctx, 22, 78);
  ctx.beginPath(); ctx.ellipse(50, 42, 20, 10, 0, Math.PI, 0); ctx.fillStyle = shade(BODY, 40); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(50, 42); ctx.lineTo(50, 76); ctx.lineWidth = 1.8; ctx.strokeStyle = shade(BODY, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(36, 50); ctx.quadraticCurveTo(50, 44, 64, 52); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(34, 62); ctx.quadraticCurveTo(50, 56, 66, 64); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 40, 60, 40, 60, 2.4);
}
function drawScallop(ctx) {
  ctx.beginPath(); ctx.moveTo(24, 72); ctx.quadraticCurveTo(24, 36, 50, 34); ctx.quadraticCurveTo(76, 36, 76, 72); ctx.quadraticCurveTo(50, 82, 24, 72); ctx.closePath(); _fillGloss(ctx, 32, 78);
  for (let i = 0; i <= 6; i++) { const x = 28 + i * 8; ctx.beginPath(); ctx.moveTo(50, 36); ctx.lineTo(x, 74); ctx.lineWidth = 2; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 40, 16, 6, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 44, 52, 56, 52, 2.4);
}
function drawClam(ctx) {
  ctx.beginPath(); ctx.moveTo(24, 60); ctx.quadraticCurveTo(24, 36, 50, 36); ctx.quadraticCurveTo(76, 36, 76, 60); ctx.quadraticCurveTo(50, 78, 24, 60); ctx.closePath(); _fillGloss(ctx, 32, 78);
  ctx.beginPath(); ctx.moveTo(24, 60); ctx.quadraticCurveTo(50, 70, 76, 60); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -28); ctx.stroke();
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(50, 44, i * 9, 8, 0, Math.PI, 0); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 60, 10, 7, 0, 0, Math.PI); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
  _eyes(ctx, 44, 50, 56, 50, 2.2);
}
function drawUrchin(ctx) {
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 16, 52 + Math.sin(a) * 16); ctx.lineTo(50 + Math.cos(a) * 30, 52 + Math.sin(a) * 30); ctx.lineWidth = 3; ctx.strokeStyle = shade(BODY, -18); ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(50, 52, 16, 0, Math.PI * 2); _fillGloss(ctx, 36, 68);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(50 + Math.cos(a) * 7, 52 + Math.sin(a) * 7, 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill(); }
}
function drawSandDollar(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 52, 26, 28, 0, 0, Math.PI * 2); _fillGloss(ctx, 24, 80);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx.beginPath(); ctx.moveTo(50, 52); ctx.quadraticCurveTo(50 + Math.cos(a) * 10, 52 + Math.sin(a) * 10, 50 + Math.cos(a) * 20, 52 + Math.sin(a) * 20); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 52, 14, 14, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 60); ctx.quadraticCurveTo(50, 66, 60, 60); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -22); ctx.stroke();
}
function drawCoral(ctx) {
  for (const [x0, x1, y] of [[50, 30, 24], [50, 70, 28], [50, 50, 18]]) {
    ctx.beginPath(); ctx.moveTo(50, 86); ctx.quadraticCurveTo((x0 + x1) / 2, (y + 86) / 2, x1, y); ctx.lineWidth = 10; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke();
  }
  for (let i = 0; i < 4; i++) { const x = 34 + i * 11; ctx.beginPath(); ctx.moveTo(x, 86); ctx.lineTo(x, 64); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(50, 30); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
}
function drawGuppy(ctx) {
  ctx.beginPath(); ctx.ellipse(44, 52, 20, 15, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 68);
  ctx.beginPath(); ctx.moveTo(62, 52); ctx.lineTo(86, 38); ctx.lineTo(82, 52); ctx.lineTo(86, 66); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 38); ctx.lineTo(46, 26); ctx.lineTo(52, 40); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(38, 48, 6, 3, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 56, 48, 56, 48, 2.8);
}
function drawGoldfish(ctx) {
  ctx.beginPath(); ctx.ellipse(44, 54, 22, 17, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 72);
  ctx.beginPath(); ctx.moveTo(62, 54); ctx.quadraticCurveTo(86, 36, 90, 54); ctx.quadraticCurveTo(86, 72, 62, 54); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(48, 22); ctx.lineTo(56, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(36, 44); ctx.quadraticCurveTo(40, 48, 36, 52); ctx.lineWidth = 2; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 56, 50, 56, 50, 2.8);
}
function drawMarlin(ctx) {
  ctx.beginPath(); ctx.moveTo(18, 52); ctx.quadraticCurveTo(48, 36, 74, 48); ctx.lineTo(88, 46); ctx.lineTo(74, 58); ctx.quadraticCurveTo(48, 68, 18, 52); ctx.closePath(); _fillGloss(ctx, 34, 70);
  ctx.beginPath(); ctx.moveTo(74, 48); ctx.lineTo(98, 48); ctx.lineTo(74, 56); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(46, 38); ctx.lineTo(58, 20); ctx.lineTo(64, 40); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(18, 52); ctx.lineTo(6, 44); ctx.lineTo(10, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 68, 46, 68, 46, 2.8);
}
function drawParrot(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 54, 26, 18, 0, 0, Math.PI * 2); _fillGloss(ctx, 34, 74);
  ctx.beginPath(); ctx.moveTo(70, 52); ctx.lineTo(90, 44); ctx.lineTo(88, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(48, 22); ctx.lineTo(56, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(66, 56); ctx.lineTo(80, 60); ctx.lineTo(66, 64); ctx.closePath(); ctx.fillStyle = shade(BODY, 30); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(68, 56); ctx.lineTo(82, 62); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
  _eyes(ctx, 60, 48, 60, 48, 3);
}
function drawSawfish(ctx) {
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.quadraticCurveTo(48, 38, 72, 50); ctx.lineTo(84, 48); ctx.lineTo(72, 58); ctx.quadraticCurveTo(48, 68, 20, 52); ctx.closePath(); _fillGloss(ctx, 34, 70);
  ctx.beginPath(); ctx.moveTo(72, 50); ctx.lineTo(98, 50); ctx.lineTo(72, 56); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 6; i++) { const x = 76 + i * 4; ctx.beginPath(); ctx.moveTo(x, 48); ctx.lineTo(x, 44); ctx.moveTo(x, 56); ctx.lineTo(x, 60); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(8, 44); ctx.lineTo(12, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 66, 46, 66, 46, 2.6);
}
function drawAnchovy(ctx) {
  ctx.beginPath(); ctx.moveTo(22, 52); ctx.quadraticCurveTo(50, 40, 72, 50); ctx.lineTo(84, 48); ctx.lineTo(72, 56); ctx.quadraticCurveTo(50, 64, 22, 52); ctx.closePath(); _fillGloss(ctx, 38, 64);
  ctx.beginPath(); ctx.moveTo(44, 44); ctx.lineTo(50, 32); ctx.lineTo(56, 46); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(22, 52); ctx.lineTo(12, 46); ctx.lineTo(16, 58); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(40, 50, 8, 3, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  _eyes(ctx, 66, 48, 66, 48, 2.6);
}
function drawBeta(ctx) {
  ctx.beginPath(); ctx.ellipse(44, 52, 18, 14, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 68);
  ctx.beginPath(); ctx.moveTo(58, 52); ctx.quadraticCurveTo(82, 30, 90, 52); ctx.quadraticCurveTo(82, 74, 58, 52); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 38); ctx.quadraticCurveTo(46, 24, 52, 40); ctx.quadraticCurveTo(44, 30, 40, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(44, 64); ctx.quadraticCurveTo(50, 80, 56, 64); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 56, 48, 56, 48, 2.8);
}
function drawHammerhead(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 58, 22, 16, 0, 0, Math.PI * 2); _fillGloss(ctx, 40, 74);
  ctx.beginPath(); ctx.moveTo(70, 50); ctx.lineTo(92, 42); ctx.lineTo(92, 74); ctx.lineTo(70, 66); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(46, 42); ctx.lineTo(48, 26); ctx.lineTo(56, 44); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(6, 46); ctx.lineTo(12, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.arc(88, 50, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.arc(88, 66, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
}
function drawWhaleShark(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 54, 32, 22, 0, 0, Math.PI * 2); _fillGloss(ctx, 32, 76);
  ctx.beginPath(); ctx.moveTo(74, 48); ctx.lineTo(92, 38); ctx.lineTo(90, 60); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 34); ctx.lineTo(48, 20); ctx.lineTo(56, 34); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 5; i++) { const x = 30 + i * 8; ctx.beginPath(); ctx.arc(x, 50 + (i % 2) * 8, 2.4, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -28); ctx.fill(); }
  for (let i = 0; i < 4; i++) { const x = 32 + i * 9; ctx.beginPath(); ctx.moveTo(x, 40); ctx.quadraticCurveTo(x + 4, 50, x, 60); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  _eyes(ctx, 64, 50, 64, 50, 2.8);
}

// 36–70：新增海洋生物，沿用最初 HTML 版（push-slide-match.html）的釉质风——
// 浅→深竖向渐变（_fillGloss）+ 统一描边 + 白肚高光 + 带高光眼睛 + 特征细节。
function drawManatee(ctx) {
  ctx.beginPath(); ctx.ellipse(48, 56, 26, 20, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 76);
  ctx.beginPath(); ctx.moveTo(70, 56); ctx.lineTo(88, 46); ctx.lineTo(86, 66); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(30, 56); ctx.lineTo(20, 50); ctx.lineTo(24, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(44, 44, 14, 8, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(36, 44); ctx.lineTo(30, 36); ctx.moveTo(52, 44); ctx.lineTo(56, 36); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  _eyes(ctx, 40, 46, 56, 46, 2.8);
}
function drawBarracuda(ctx) {
  ctx.beginPath(); ctx.moveTo(16, 52); ctx.quadraticCurveTo(46, 38, 74, 50); ctx.lineTo(88, 48); ctx.lineTo(74, 58); ctx.quadraticCurveTo(46, 68, 16, 52); ctx.closePath(); _fillGloss(ctx, 34, 70);
  ctx.beginPath(); ctx.moveTo(46, 40); ctx.lineTo(52, 24); ctx.lineTo(60, 42); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(16, 52); ctx.lineTo(4, 46); ctx.lineTo(10, 58); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(24, 50); ctx.lineTo(36, 50); ctx.lineTo(30, 56); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = 40 + i * 8; ctx.beginPath(); ctx.moveTo(x, 42); ctx.lineTo(x + 4, 50); ctx.lineWidth = 1.2; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  _eyes(ctx, 68, 46, 68, 46, 2.6);
}
function drawFlyingfish(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 56, 24, 15, 0, 0, Math.PI * 2); _fillGloss(ctx, 38, 72);
  ctx.beginPath(); ctx.moveTo(66, 56); ctx.lineTo(86, 50); ctx.lineTo(84, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(30, 44); ctx.quadraticCurveTo(48, 24, 64, 42); ctx.lineTo(60, 50); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(30, 68); ctx.quadraticCurveTo(48, 88, 64, 70); ctx.lineTo(60, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 42); ctx.lineTo(46, 30); ctx.lineTo(52, 44); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 58, 52, 58, 52, 2.6);
}
function drawGrouper(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 54, 27, 21, 0, 0, Math.PI * 2); _fillGloss(ctx, 32, 76);
  ctx.beginPath(); ctx.moveTo(70, 54); ctx.lineTo(90, 42); ctx.lineTo(88, 66); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(46, 20); ctx.lineTo(52, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(34, 70); ctx.lineTo(48, 84); ctx.lineTo(52, 68); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 6; i++) { const x = 34 + i * 6; ctx.beginPath(); ctx.arc(x, 48 + (i % 2) * 10, 2.6, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -28); ctx.fill(); }
  _eyes(ctx, 58, 48, 58, 48, 3);
}
function drawManta(ctx) {
  ctx.beginPath(); ctx.moveTo(50, 46); ctx.quadraticCurveTo(14, 26, 8, 52); ctx.quadraticCurveTo(36, 60, 50, 50); ctx.quadraticCurveTo(64, 60, 92, 52); ctx.quadraticCurveTo(86, 26, 50, 46); ctx.closePath(); _fillGloss(ctx, 26, 60);
  ctx.beginPath(); ctx.moveTo(50, 52); ctx.lineTo(50, 88); ctx.lineWidth = 5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(38, 40); ctx.quadraticCurveTo(24, 22, 42, 20); ctx.lineTo(48, 34); ctx.closePath(); ctx.fill(); _outlineStroke(ctx); }
  ctx.beginPath(); ctx.ellipse(50, 46, 16, 6, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(50, 46); ctx.lineTo(50, 78); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 42, 40, 60, 40, 2.6);
}
function drawCuttlefish(ctx) {
  ctx.beginPath(); ctx.moveTo(34, 26); ctx.quadraticCurveTo(66, 22, 66, 48); ctx.quadraticCurveTo(66, 62, 50, 62); ctx.quadraticCurveTo(34, 62, 34, 48); ctx.closePath(); _fillGloss(ctx, 22, 64);
  ctx.beginPath(); ctx.moveTo(38, 30); ctx.quadraticCurveTo(58, 26, 62, 32); ctx.lineWidth = 3; ctx.strokeStyle = shade(BODY, -22); ctx.stroke();
  for (let i = 0; i < 5; i++) { const x = 38 + i * 6; ctx.beginPath(); ctx.moveTo(x, 60); ctx.quadraticCurveTo(x, 82, x + 2, 92); ctx.lineWidth = 3; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(46, 42, 14, 7, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 44, 42, 56, 42, 3);
}
function drawSeahare(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 56, 24, 19, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 76);
  ctx.beginPath(); ctx.moveTo(28, 52); ctx.quadraticCurveTo(14, 32, 38, 40); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 4; i++) { const x = 42 + i * 6; ctx.beginPath(); ctx.moveTo(x, 72); ctx.quadraticCurveTo(x, 88, x + 2, 92); ctx.lineWidth = 3; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(40, 50, 8, 5, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 38, 50, 38, 50, 2.4);
}
function drawCoelacanth(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 52, 26, 16, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 68);
  ctx.beginPath(); ctx.moveTo(68, 52); ctx.quadraticCurveTo(90, 42, 88, 52); ctx.quadraticCurveTo(90, 62, 68, 52); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(34, 36); ctx.lineTo(46, 20); ctx.lineTo(54, 38); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 66); ctx.lineTo(50, 82); ctx.lineTo(58, 66); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 5; i++) { const x = 34 + i * 7; ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, 60); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  _eyes(ctx, 58, 48, 58, 48, 2.6);
}
function drawLancetfish(ctx) {
  ctx.beginPath(); ctx.moveTo(16, 52); ctx.quadraticCurveTo(48, 40, 74, 52); ctx.lineTo(90, 48); ctx.lineTo(74, 58); ctx.quadraticCurveTo(48, 66, 16, 52); ctx.closePath(); _fillGloss(ctx, 36, 66);
  ctx.beginPath(); ctx.moveTo(74, 52); ctx.lineTo(94, 46); ctx.lineTo(94, 58); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 6; i++) { const x = 28 + i * 7; ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x + 2, 42); ctx.moveTo(x, 54); ctx.lineTo(x + 2, 62); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(40, 40); ctx.lineTo(46, 24); ctx.lineTo(54, 42); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 64, 48, 64, 48, 2.4);
}
function drawSunfish(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 52, 30, 27, 0, 0, Math.PI * 2); _fillGloss(ctx, 24, 80);
  ctx.beginPath(); ctx.moveTo(78, 52); ctx.lineTo(94, 42); ctx.lineTo(92, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 28); ctx.lineTo(50, 14); ctx.lineTo(60, 28); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(50, 52, 18, 18, 0, 0, Math.PI); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 64); ctx.quadraticCurveTo(50, 70, 60, 64); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -22); ctx.stroke();
  _eyes(ctx, 60, 46, 60, 46, 3);
}
function drawSpinyfish(ctx) {
  ctx.beginPath(); ctx.arc(50, 54, 22, 0, Math.PI * 2); _fillGloss(ctx, 32, 76);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 21, 54 + Math.sin(a) * 21); ctx.lineTo(50 + Math.cos(a) * 33, 54 + Math.sin(a) * 33); ctx.lineWidth = 4; ctx.strokeStyle = shade(BODY, -20); ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 60, 12, 7, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 40, 48, 60, 48, 3);
}
function drawTriggerfish(ctx) {
  ctx.beginPath(); ctx.moveTo(28, 34); ctx.quadraticCurveTo(62, 26, 74, 50); ctx.quadraticCurveTo(68, 78, 38, 74); ctx.quadraticCurveTo(26, 60, 28, 34); ctx.closePath(); _fillGloss(ctx, 26, 78);
  ctx.beginPath(); ctx.moveTo(68, 50); ctx.lineTo(90, 44); ctx.lineTo(88, 64); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(40, 32); ctx.lineTo(48, 16); ctx.lineTo(56, 34); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(52, 46, 6, 4, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  for (let i = 0; i < 3; i++) { const y = 52 + i * 7; ctx.beginPath(); ctx.moveTo(34, y); ctx.quadraticCurveTo(54, y + 4, 66, y); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -24); ctx.stroke(); }
  _eyes(ctx, 52, 46, 52, 46, 2.8);
}
function drawFilefish(ctx) {
  ctx.beginPath(); ctx.moveTo(26, 56); ctx.quadraticCurveTo(50, 34, 74, 44); ctx.lineTo(80, 56); ctx.quadraticCurveTo(50, 78, 26, 56); ctx.closePath(); _fillGloss(ctx, 34, 78);
  ctx.beginPath(); ctx.moveTo(60, 46); ctx.lineTo(90, 38); ctx.lineTo(88, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(34, 42); ctx.lineTo(42, 26); ctx.lineTo(50, 44); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 4; i++) { const y = 46 + i * 7; ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(62, y - 3); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -24); ctx.stroke(); }
  _eyes(ctx, 54, 50, 54, 50, 2.6);
}
function drawPipefish(ctx) {
  ctx.beginPath(); ctx.moveTo(18, 54);
  for (let i = 0; i <= 10; i++) { const x = 18 + i * 6; const y = 54 + (i % 2 ? 4 : -4); if (i) ctx.lineTo(x, y); }
  ctx.lineTo(80, 54); ctx.lineTo(80, 62);
  for (let i = 10; i >= 0; i--) { const x = 18 + i * 6; const y = 62 + (i % 2 ? 4 : -4); ctx.lineTo(x, y); }
  ctx.closePath(); _fillGloss(ctx, 44, 66);
  ctx.beginPath(); ctx.ellipse(80, 50, 8, 8, 0, 0, Math.PI * 2); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(86, 50); ctx.lineTo(94, 48); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = 30 + i * 10; ctx.beginPath(); ctx.moveTo(x, 54); ctx.lineTo(x, 64); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  _eyes(ctx, 80, 47, 80, 47, 2.2);
}
function drawLeafy(ctx) {
  ctx.beginPath(); ctx.moveTo(50, 22); ctx.quadraticCurveTo(80, 40, 72, 72); ctx.quadraticCurveTo(50, 84, 28, 72); ctx.quadraticCurveTo(20, 40, 50, 22); ctx.closePath(); _fillGloss(ctx, 22, 78);
  ctx.beginPath(); ctx.moveTo(50, 28); ctx.lineTo(50, 78); ctx.lineWidth = 2; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  for (let i = 0; i < 6; i++) { const yy = 32 + i * 8; ctx.beginPath(); ctx.moveTo(50, yy); ctx.quadraticCurveTo(32, yy - 6, 24, yy - 12); ctx.moveTo(50, yy); ctx.quadraticCurveTo(68, yy - 6, 76, yy - 12); ctx.lineWidth = 3; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(50, 38, 5, 3, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 50, 38, 50, 38, 2.4);
}
function drawHatchetfish(ctx) {
  ctx.beginPath(); ctx.moveTo(34, 44); ctx.quadraticCurveTo(66, 36, 64, 54); ctx.quadraticCurveTo(58, 82, 40, 78); ctx.quadraticCurveTo(30, 64, 34, 44); ctx.closePath(); _fillGloss(ctx, 34, 80);
  ctx.beginPath(); ctx.moveTo(60, 50); ctx.lineTo(88, 42); ctx.lineTo(86, 62); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(38, 40); ctx.lineTo(46, 26); ctx.lineTo(54, 42); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(48, 52, 8, 10, 0, 0, Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
  _eyes(ctx, 50, 46, 50, 46, 2.6);
}
function drawLionfish(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 54, 22, 15, 0, 0, Math.PI * 2); _fillGloss(ctx, 38, 70);
  ctx.beginPath(); ctx.moveTo(64, 54); ctx.lineTo(86, 44); ctx.lineTo(84, 64); ctx.closePath(); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + i * Math.PI / 8; ctx.beginPath(); ctx.moveTo(46 + Math.cos(a) * 16, 54 + Math.sin(a) * 11); ctx.lineTo(46 + Math.cos(a) * 34, 54 + Math.sin(a) * 26); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -18); ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const x = 34 + i * 7; ctx.beginPath(); ctx.arc(x, 50 + (i % 2) * 8, 2.2, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -26); ctx.fill(); }
  _eyes(ctx, 56, 50, 56, 50, 2.6);
}
function drawNudibranch(ctx) {
  ctx.beginPath(); ctx.ellipse(52, 60, 22, 15, 0, 0, Math.PI * 2); _fillGloss(ctx, 41, 79);
  for (let i = 0; i < 5; i++) { const x = 36 + i * 8; ctx.beginPath(); ctx.moveTo(x, 50); ctx.quadraticCurveTo(x - 6, 26, x + 3, 18); ctx.lineWidth = 4.5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const x = 36 + i * 8; ctx.beginPath(); ctx.moveTo(x, 74); ctx.quadraticCurveTo(x - 7, 86, x + 1, 90); ctx.lineWidth = 3.5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(30, 54, 9, 0, Math.PI * 2); ctx.fill(); _outlineStroke(ctx);
  _eyes(ctx, 28, 51, 28, 51, 2);
}
function drawChiton(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 54, 26, 16, 0, 0, Math.PI * 2); _fillGloss(ctx, 38, 72);
  for (let i = 0; i < 7; i++) { const x = 30 + i * 6.4; ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 68); ctx.lineWidth = 2; ctx.strokeStyle = shade(BODY, -28); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(50, 39); ctx.lineTo(50, 69); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -32); ctx.stroke();
}
function drawConeShell(ctx) {
  ctx.beginPath(); ctx.moveTo(34, 76); ctx.lineTo(34, 44); ctx.quadraticCurveTo(50, 24, 66, 44); ctx.lineTo(66, 76); ctx.closePath(); _fillGloss(ctx, 22, 76);
  ctx.beginPath(); ctx.moveTo(34, 76); ctx.lineTo(34, 44); ctx.quadraticCurveTo(50, 24, 66, 44); ctx.lineTo(66, 76); ctx.closePath(); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(50, 44, 16, 7, 0, Math.PI, 0); ctx.fillStyle = shade(BODY, 50); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(50, 44); ctx.lineTo(50, 76); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 44); ctx.lineTo(40, 70); ctx.moveTo(60, 44); ctx.lineTo(60, 70); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
}
function drawSpiralShell(ctx) {
  ctx.beginPath(); ctx.arc(52, 54, 23, 0, Math.PI * 2); _fillGloss(ctx, 31, 79);
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(52, 54, 19 - i * 5, Math.PI * 0.2, Math.PI * 1.9); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(52, 54, 4, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -28); ctx.fill();
}
function drawWhelk(ctx) {
  ctx.beginPath(); ctx.moveTo(40, 74); ctx.quadraticCurveTo(26, 38, 56, 30); ctx.quadraticCurveTo(78, 34, 72, 58); ctx.quadraticCurveTo(64, 72, 40, 74); ctx.closePath(); _fillGloss(ctx, 30, 76);
  ctx.beginPath(); ctx.arc(56, 48, 10, 0, Math.PI * 2); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(40, 60, 6, 10, -0.5, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, 40); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.moveTo(56, 38); ctx.quadraticCurveTo(48, 30, 40, 34); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
}
function drawTurbanShell(ctx) {
  ctx.beginPath(); ctx.moveTo(32, 76); ctx.lineTo(36, 44); ctx.quadraticCurveTo(50, 30, 64, 44); ctx.lineTo(68, 76); ctx.closePath(); _fillGloss(ctx, 27, 79);
  ctx.beginPath(); ctx.ellipse(50, 44, 14, 6, 0, Math.PI, 0); ctx.fillStyle = shade(BODY, 46); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 3; i++) { const y = 50 + i * 9; ctx.beginPath(); ctx.ellipse(50, y, 19 - i * 1.5, 4, 0, Math.PI, 0); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(40, 76); ctx.lineTo(44, 50); ctx.moveTo(60, 76); ctx.lineTo(56, 50); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -24); ctx.stroke();
}
function drawBasketStar(ctx) {
  ctx.beginPath(); ctx.arc(50, 50, 8, 0, Math.PI * 2); _fillGloss(ctx, 41, 59);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 8, 50 + Math.sin(a) * 8); ctx.quadraticCurveTo(50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30, 50 + Math.cos(a) * 42, 50 + Math.sin(a) * 14); ctx.lineWidth = 4.5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const mx = 50 + Math.cos(a) * 26, my = 50 + Math.sin(a) * 26; for (const d of [-0.4, 0.4]) { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + d) * 12, my + Math.sin(a + d) * 12); ctx.lineWidth = 2.4; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); } }
}
function drawFeatherStar(ctx) {
  ctx.beginPath(); ctx.arc(50, 56, 7, 0, Math.PI * 2); _fillGloss(ctx, 48, 64);
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(50, 56); ctx.quadraticCurveTo(50 + Math.cos(a) * 26, 56 + Math.sin(a) * 26, 50 + Math.cos(a) * 42, 56 + Math.sin(a) * 14); ctx.lineWidth = 4.5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); for (let k = 1; k <= 3; k++) { const t = k / 4; const x = 50 + Math.cos(a) * 42 * t, y = 56 + Math.sin(a) * 42 * t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + 1.3) * 7, y + Math.sin(a + 1.3) * 7); ctx.lineTo(x + Math.cos(a - 1.3) * 7, y + Math.sin(a - 1.3) * 7); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, 20); ctx.stroke(); } }
}
function drawSalp(ctx) {
  for (let i = 0; i < 3; i++) {
    const x = 32 + i * 18;
    ctx.beginPath(); ctx.ellipse(x, 50, 12, 19, 0, 0, Math.PI * 2); _fillGloss(ctx, 31, 69);
    ctx.beginPath(); ctx.ellipse(x, 42, 7, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 11, 50); ctx.lineTo(x + 11, 50); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, 33); ctx.lineTo(x - 4, 67); ctx.lineWidth = 1.3; ctx.strokeStyle = shade(BODY, -22); ctx.stroke();
  }
}
function drawIsopod(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 52, 25, 16, 0, 0, Math.PI * 2); _fillGloss(ctx, 36, 68);
  for (let i = 1; i < 7; i++) { const x = 30 + i * 8; ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 68); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  for (let i = 0; i < 7; i++) { const x = 32 + i * 6; ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x - 3, 84); ctx.moveTo(x, 38); ctx.lineTo(x - 3, 20); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(70, 50, 5, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  _eyes(ctx, 70, 50, 70, 50, 2.4);
}
function drawSponge(ctx) {
  ctx.beginPath(); ctx.moveTo(38, 84); ctx.lineTo(34, 36); ctx.quadraticCurveTo(50, 24, 66, 36); ctx.lineTo(62, 84); ctx.closePath(); _fillGloss(ctx, 24, 84);
  ctx.beginPath(); ctx.ellipse(50, 34, 16, 8, 0, Math.PI, 0); ctx.fillStyle = shade(BODY, 48); ctx.fill(); _outlineStroke(ctx);
  ctx.beginPath(); ctx.ellipse(52, 58, 7, 12, 0, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, 42); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 4; i++) { const y = 46 + i * 10; ctx.beginPath(); ctx.moveTo(38, y); ctx.lineTo(34, y); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -24); ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const x = 44 + i * 5; ctx.beginPath(); ctx.arc(x, 66, 2, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, 30); ctx.fill(); }
}
function drawBranchy(ctx) {
  ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(50, 52); ctx.lineWidth = 11; ctx.strokeStyle = BODY; ctx.stroke();
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50, 54); ctx.quadraticCurveTo(50 + d * 26, 44, 50 + d * 34, 24); ctx.lineWidth = 9; ctx.strokeStyle = BODY; ctx.stroke(); }
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50, 54); ctx.quadraticCurveTo(50 + d * 26, 44, 50 + d * 34, 24); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50 + d * 22, 36); ctx.quadraticCurveTo(50 + d * 27, 28, 50 + d * 31, 20); ctx.lineWidth = 6; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(50, 86); ctx.lineTo(50, 52); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
}
function drawBrittleStar(ctx) {
  ctx.beginPath(); ctx.arc(50, 50, 10, 0, Math.PI * 2); _fillGloss(ctx, 40, 60);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 10, 50 + Math.sin(a) * 10); ctx.quadraticCurveTo(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36, 50 + Math.cos(a) * 42, 50 + Math.sin(a) * 24); ctx.lineWidth = 3.5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const mx = 50 + Math.cos(a) * 22, my = 50 + Math.sin(a) * 22; for (const d of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + d) * 8, my + Math.sin(a + d) * 8); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); } }
}
function drawSeaCucumber(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 56, 23, 17, 0, 0, Math.PI * 2); _fillGloss(ctx, 39, 73);
  for (let i = 0; i < 6; i++) { const x = 40 + i * 4; ctx.beginPath(); ctx.arc(x, 40, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill(); }
  ctx.beginPath(); ctx.arc(28, 56, 7, 0, Math.PI * 2); ctx.fill(); _outlineStroke(ctx);
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(28 + Math.cos(a) * 6, 56 + Math.sin(a) * 6); ctx.lineTo(28 + Math.cos(a) * 11, 56 + Math.sin(a) * 11); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
  _eyes(ctx, 26, 54, 26, 54, 2);
}
function drawHorseshoeCrab(ctx) {
  ctx.beginPath(); ctx.ellipse(46, 50, 27, 19, 0, 0, Math.PI * 2); _fillGloss(ctx, 31, 69);
  ctx.beginPath(); ctx.moveTo(70, 50); ctx.lineTo(94, 50); ctx.lineWidth = 5; ctx.strokeStyle = BODY; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (let i = 0; i < 5; i++) { const x = 34 + i * 7; ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x - 3, 82); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(40, 44, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  _eyes(ctx, 40, 44, 40, 44, 2.4);
}
function drawAmmonite(ctx) {
  ctx.beginPath(); ctx.arc(50, 54, 25, 0, Math.PI * 2); _fillGloss(ctx, 29, 79);
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(50, 54, 21 - i * 4.5, Math.PI * 0.2, Math.PI * 1.85); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(50, 54, 3, 0, Math.PI * 2); ctx.fillStyle = shade(BODY, -28); ctx.fill();
}
function drawTrilobite(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 54, 25, 17, 0, 0, Math.PI * 2); _fillGloss(ctx, 37, 71);
  ctx.beginPath(); ctx.moveTo(50, 38); ctx.lineTo(50, 70); ctx.lineWidth = 2; ctx.strokeStyle = shade(BODY, -26); ctx.stroke();
  for (let i = 1; i < 5; i++) { const y = 42 + i * 6; ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(72, y); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, -26); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(36, 48, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  _eyes(ctx, 36, 48, 36, 48, 2.2);
}
function drawCombJelly(ctx) {
  ctx.beginPath(); ctx.ellipse(50, 52, 22, 30, 0, 0, Math.PI * 2); _fillGloss(ctx, 33, 71);
  ctx.beginPath(); ctx.moveTo(34, 36); ctx.quadraticCurveTo(34, 22, 50, 22); ctx.quadraticCurveTo(66, 22, 66, 36); ctx.quadraticCurveTo(66, 70, 50, 80); ctx.quadraticCurveTo(34, 70, 34, 36); ctx.closePath(); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(BODY, 24); ctx.stroke();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(50 + i * 9, 28); ctx.lineTo(50 + i * 11, 74); ctx.lineWidth = 2.6; ctx.strokeStyle = shade(BODY, -22); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(42, 38, 5, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(58, 38, 5, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
}

module.exports = { drawCreature, shade };