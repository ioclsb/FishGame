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

const OUT = 'rgba(15,30,48,0.55)';

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
  gl.addColorStop(0, 'rgba(255,255,255,0.55)');
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

function drawCreature(ctx, pattern) {
  switch (pattern) {
    case 1: drawClownfish(ctx); break;
    case 2: drawBlueTang(ctx); break;
    case 3: drawTurtle(ctx); break;
    case 4: drawPufferfish(ctx); break;
    case 5: drawJellyfish(ctx); break;
    case 6: drawCrab(ctx); break;
    case 7: drawStarfish(ctx); break;
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

module.exports = { drawCreature, shade };