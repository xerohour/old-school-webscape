import { ITEMS } from "./items.js";
import { bakedURL } from "./baked.js";

const S = 64;

function rgb(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function sh(c, f) {
  const [r, g, b] = rgb(c);
  return "rgb(" + Math.min(255, Math.round(r * f)) + "," + Math.min(255, Math.round(g * f)) + "," + Math.min(255, Math.round(b * f)) + ")";
}
function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function fillPoly(ctx, pts, fill, stroke, lw) {
  poly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw || 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, fill, stroke, lw) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw || 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function ell(ctx, cx, cy, rx, ry, fill, stroke, lw) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw || 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function circle(ctx, cx, cy, r, fill, stroke, lw) {
  ell(ctx, cx, cy, r, r, fill, stroke, lw);
}

const OUT = "rgba(0,0,0,0.55)";
const WOOD = 0x8a6236;

function handle(ctx, x, y, w, h, col) {
  fillRR(ctx, x, y, w, h, Math.min(w, h) / 2, sh(col ?? WOOD, 1), sh(col ?? WOOD, 0.5), 2);
  ctx.fillStyle = sh(col ?? WOOD, 1.35);
  ctx.fillRect(x + w * 0.3, y + 1.5, w * 0.22, h - 3);
}

function grp(ctx) {
  return {
    grip(y, len) {
      fillRR(ctx, -4.5, y, 9, len, 3.5, "rgb(74,56,36)", "rgba(0,0,0,0.6)", 2);
      ctx.fillStyle = "rgb(116,90,58)";
      for (let i = 0; i < 3; i++) ctx.fillRect(-4.5, y + 3 + i * (len / 3.4), 9, 1.5);
    },
    pommel(y, r, col) {
      circle(ctx, 0, y, r, sh(col, 0.9), "rgba(0,0,0,0.6)", 2);
      circle(ctx, -r * 0.35, y - r * 0.35, r * 0.32, sh(col, 1.5));
    },
    guard(y, w, th, col) {
      fillRR(ctx, -w, y - th / 2, w * 2, th, 2, sh(col, 0.9), "rgba(0,0,0,0.6)", 2);
      ctx.fillStyle = sh(col, 1.5);
      ctx.fillRect(-w + 2, y - th / 2 + 1, w * 2 - 4, 1.4);
    },
    blade(L, w, tip, col) {
      fillPoly(ctx, [[-w, -2], [-w, -L], [0, -L - tip], [w, -L], [w, -2]], sh(col, 1), "rgba(0,0,0,0.6)", 2);
      fillPoly(ctx, [[-w + 1.4, -3], [-w + 1.4, -L + 1.5], [0, -L - tip + 2.5], [0, -3]], sh(col, 1.5));
      fillPoly(ctx, [[w - 1.4, -3], [w - 1.4, -L + 1.5], [0, -L - tip + 2.5], [0, -3]], sh(col, 0.62));
    },
  };
}

function bladeShape(ctx, col, kind) {
  const c = sh(col, 1);
  const cd = sh(col, 0.62);
  const cl = sh(col, 1.5);
  const metal = sh(0x9a9aa2, 1);
  ctx.save();
  ctx.translate(32, 34);
  ctx.rotate(Math.PI / 4);
  const g = grp(ctx);

  if (kind === "dagger") {
    g.grip(1, 9);
    g.guard(1, 7, 4, 0x9a9aa2);
    g.blade(12, 4.6, 6.5, col);
    g.pommel(10, 4, 0x9a9aa2);
  } else if (kind === "sword") {
    g.grip(2, 12);
    g.guard(2, 10, 4.5, 0x9a9aa2);
    g.blade(20, 5, 8, col);
    g.pommel(14, 4.4, 0x9a9aa2);
  } else if (kind === "longsword") {
    g.grip(2, 15);
    g.guard(2, 8, 4, 0x9a9aa2);
    g.blade(28, 4.4, 9, col);
    g.pommel(17, 4, 0x9a9aa2);
  } else if (kind === "2h" || kind === "two") {
    g.grip(2, 21);
    g.guard(2, 7, 4, 0x9a9aa2);
    g.blade(32, 5.4, 9, col);
    g.pommel(23, 4, 0x9a9aa2);
  } else if (kind === "scimitar") {
    g.grip(1, 12);
    g.guard(1, 9, 4, 0xd8b040);
    g.pommel(13, 4, 0xd8b040);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.quadraticCurveTo(-2, -20, 13, -37);
    ctx.quadraticCurveTo(2, -22, 3.5, 0);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.quadraticCurveTo(-0.5, -20, 11, -33);
    ctx.lineWidth = 3;
    ctx.strokeStyle = cl;
    ctx.stroke();
  } else if (kind === "mace") {
    g.grip(3, 15);
    g.pommel(18, 4, 0x9a9aa2);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + 0.4;
      fillPoly(ctx, [
        [Math.cos(ang) * 9, -13 + Math.sin(ang) * 9],
        [Math.cos(ang + 0.33) * 14.5, -13 + Math.sin(ang + 0.33) * 14.5],
        [Math.cos(ang - 0.33) * 14.5, -13 + Math.sin(ang - 0.33) * 14.5],
      ], cd, "rgba(0,0,0,0.5)", 1.5);
    }
    circle(ctx, 0, -13, 10, c, "rgba(0,0,0,0.6)", 2);
    circle(ctx, -3.5, -16.5, 3.6, cl);
  } else if (kind === "warhammer") {
    g.grip(3, 15);
    g.pommel(18, 4, 0x9a9aa2);
    fillRR(ctx, -13, -25, 26, 16, 3, c, "rgba(0,0,0,0.6)", 2);
    fillRR(ctx, -10.5, -23.5, 21, 5, 2, cl);
    ctx.fillStyle = cd;
    ctx.fillRect(-13, -11, 26, 2);
  } else if (kind === "axe" || kind === "battleaxe") {
    g.grip(4, 20);
    g.pommel(24, 4.2, 0x8a6236);
    const bladePolys = kind === "axe"
      ? [[[4, -21], [19, -25], [23, -3], [4, -1]]]
      : [[[4, -21], [19, -25], [23, -3], [4, -1]], [[-4, -21], [-19, -25], [-23, -3], [-4, -1]]];
    for (const pts of bladePolys) {
      fillPoly(ctx, pts, c, "rgba(0,0,0,0.6)", 2);
      fillPoly(ctx, pts.map(([x, y]) => [x * 0.72, y * 0.98]), cl);
    }
    fillPoly(ctx, [[-3, -21], [3, -21], [0, -31]], c, "rgba(0,0,0,0.6)", 1.5);
  } else if (kind === "pickaxe") {
    g.grip(4, 19);
    g.pommel(23, 4, 0x8a6236);
    ctx.beginPath();
    ctx.moveTo(-21, -13);
    ctx.quadraticCurveTo(0, -26, 21, -13);
    ctx.lineTo(21, -18.5);
    ctx.quadraticCurveTo(0, -31, -21, -18.5);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, -16.6);
    ctx.quadraticCurveTo(0, -25.5, 16, -16.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = cl;
    ctx.stroke();
  } else if (kind === "harpoon") {
    g.grip(4, 20);
    g.pommel(24, 4, 0x8a6236);
    ctx.beginPath();
    ctx.arc(0, 26, 4, 0.2, Math.PI - 0.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = sh(0xc8b890, 1);
    ctx.stroke();
    fillPoly(ctx, [[-13, -30], [-3, -26], [-3, -37]], cd, "rgba(0,0,0,0.5)", 1.5);
    fillPoly(ctx, [[13, -30], [3, -26], [3, -37]], cd, "rgba(0,0,0,0.5)", 1.5);
    fillPoly(ctx, [[-4, -24], [4, -24], [5, -39], [0, -44], [-5, -39]], c, "rgba(0,0,0,0.6)", 2);
    fillPoly(ctx, [[-1.6, -26], [1.6, -26], [1.6, -38], [0, -42]], cl);
  } else if (kind === "shaftonly") {
    fillRR(ctx, -2.6, -30, 5.2, 58, 2.6, sh(WOOD, 1), "rgba(0,0,0,0.55)", 2);
    fillRR(ctx, -1, -29, 2, 56, 1, sh(WOOD, 1.4));
  } else if (kind === "arrow" || kind === "headless") {
    fillRR(ctx, -2.4, -30, 4.8, 56, 2.4, sh(WOOD, 1), "rgba(0,0,0,0.55)", 2);
    if (kind === "arrow") {
      fillPoly(ctx, [[-5, -27.5], [5, -27.5], [0, -43]], sh(col, 1), "rgba(0,0,0,0.55)", 1.6);
      fillPoly(ctx, [[-1.6, -29.5], [1.6, -29.5], [0, -41]], sh(col, 1.5));
    }
    ctx.fillStyle = sh(0xe8e0d0, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 2, 12);
      ctx.lineTo(s * 12, 22);
      ctx.lineTo(s * 2, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function bowShape(ctx, col, isLong) {
  const c = sh(col, 1);
  const cd = sh(col, 0.6);
  ctx.save();
  const sx = isLong ? 1 : 0.84;
  ctx.translate(32, 34);
  ctx.scale(1, sx);
  ctx.beginPath();
  ctx.moveTo(-12, -30);
  ctx.quadraticCurveTo(-25, 0, -12, 30);
  ctx.lineWidth = 5;
  ctx.strokeStyle = c;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12, -30);
  ctx.quadraticCurveTo(-20, 0, -12, 30);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = cd;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-11, -31);
  ctx.lineTo(-11, 31);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(240,240,230,0.85)";
  ctx.stroke();
  if (isLong) {
    ctx.beginPath();
    ctx.moveTo(-12, -30);
    ctx.lineTo(-4, -36);
    ctx.moveTo(-12, 30);
    ctx.lineTo(-4, 36);
    ctx.lineWidth = 4;
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(20, 0);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = sh(0x9a9aa2, 1);
  ctx.stroke();
  fillPoly(ctx, [[20, -5], [30, 0], [20, 5]], sh(0xc8c8d0, 1), "rgba(0,0,0,0.5)", 1.5);
  ctx.restore();
}

function staffShape(ctx, col, runeCol) {
  ctx.save();
  ctx.translate(32, 34);
  ctx.rotate(Math.PI / 4);
  fillRR(ctx, -3.2, -26, 6.4, 56, 3, sh(WOOD, 1), "rgba(0,0,0,0.6)", 2);
  ctx.fillStyle = sh(0xd8c8a0, 1);
  ctx.fillRect(-3.2, 2, 6.4, 2.4);
  ctx.fillRect(-3.2, 18, 6.4, 2.4);
  ctx.fillRect(-3.2, -14, 6.4, 2.4);
  circle(ctx, 0, 24, 4, sh(WOOD, 0.7), "rgba(0,0,0,0.5)", 1.6);
  const rc = runeCol || 0x9a8ad8;
  fillPoly(ctx, [[-6.5, -28], [0, -40], [6.5, -28], [0, -18]], sh(rc, 1), "rgba(0,0,0,0.6)", 2);
  fillPoly(ctx, [[-3, -28], [0, -37], [0, -22]], sh(rc, 1.6));
  fillPoly(ctx, [[3, -28], [0, -37], [0, -22]], sh(rc, 0.62));
  ctx.restore();
}


function sh0(c, f) {
  if (!sh0.done) { sh0.done = true; }
  return sh(c, f);
}

const PAINT = {
  dagger: (c, col) => bladeShape(c, col, "dagger"),
  sword: (c, col) => bladeShape(c, col, "sword"),
  longsword: (c, col) => bladeShape(c, col, "longsword"),
  "2h": (c, col) => bladeShape(c, col, "2h"),
  scimitar: (c, col) => bladeShape(c, col, "scimitar"),
  mace: (c, col) => bladeShape(c, col, "mace"),
  battleaxe: (c, col) => bladeShape(c, col, "battleaxe"),
  axe: (c, col) => bladeShape(c, col, "axe"),
  warhammer: (c, col) => bladeShape(c, col, "warhammer"),
  pickaxe: (c, col) => bladeShape(c, col, "pickaxe"),
  harpoon: (c, col) => bladeShape(c, col, "harpoon"),

  medhelm: (c, col) => {
    c.beginPath();
    c.moveTo(12, 40);
    c.quadraticCurveTo(10, 12, 32, 10);
    c.quadraticCurveTo(54, 12, 52, 40);
    c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    fillRR(c, 10, 36, 44, 8, 3, sh(col, 0.72), OUT, 2);
    fillPoly(c, [[29, 42], [35, 42], [35, 58], [32, 63], [29, 58]], sh(col, 1.15), OUT, 2);
    c.beginPath(); c.moveTo(19, 34); c.quadraticCurveTo(18, 17, 28, 14);
    c.lineWidth = 3; c.strokeStyle = sh(col, 1.5); c.stroke();
  },

  fullhelm: (c, col) => {
    c.beginPath();
    c.moveTo(10, 46);
    c.quadraticCurveTo(8, 12, 32, 10);
    c.quadraticCurveTo(56, 12, 54, 46);
    c.quadraticCurveTo(48, 53, 32, 53);
    c.quadraticCurveTo(16, 53, 10, 46);
    c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    fillRR(c, 14, 29, 36, 7, 2, "#141414", OUT, 1.5);
    fillPoly(c, [[29, 27], [35, 27], [35, 51], [32, 55], [29, 51]], sh(col, 1.2), OUT, 1.5);
    c.beginPath(); c.moveTo(17, 46); c.quadraticCurveTo(32, 51, 47, 46);
    c.lineWidth = 2; c.strokeStyle = sh(col, 0.7); c.stroke();
    c.beginPath(); c.moveTo(17, 20); c.quadraticCurveTo(21, 14, 27, 12);
    c.lineWidth = 2.6; c.strokeStyle = sh(col, 1.55); c.stroke();
  },

  coif: (c, col) => {
    c.beginPath();
    c.moveTo(15, 32);
    c.quadraticCurveTo(13, 12, 32, 11);
    c.quadraticCurveTo(51, 12, 49, 32);
    c.quadraticCurveTo(49, 52, 32, 56);
    c.quadraticCurveTo(15, 52, 15, 32);
    c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(19, 26); c.quadraticCurveTo(32, 19, 45, 26);
    c.lineWidth = 2; c.strokeStyle = sh(col, 0.62); c.stroke();
    for (let x = 21; x <= 43; x += 7) { c.beginPath(); c.moveTo(x, 30); c.lineTo(x, 50); c.lineWidth = 1.3; c.strokeStyle = sh(col, 0.72); c.stroke(); }
  },

  chainbody: (c, col) => {
    const pts = [[16, 14], [24, 10], [32, 16], [40, 10], [48, 14], [53, 26], [51, 54], [13, 54], [11, 26]];
    c.save();
    poly(c, pts);
    c.clip();
    c.fillStyle = sh(col, 1);
    c.fillRect(0, 0, S, S);
    c.strokeStyle = sh(col, 0.5); c.lineWidth = 1.2;
    for (let y = 14; y < 58; y += 5) {
      const odd = ((y / 5) | 0) % 2;
      for (let x = 8; x < 58; x += 5) { c.beginPath(); c.arc(x + (odd ? 2.5 : 0), y, 2.1, 0, Math.PI * 2); c.stroke(); }
    }
    c.strokeStyle = sh(col, 1.5); c.lineWidth = 2;
    for (let y = 20; y < 56; y += 11) { c.beginPath(); c.moveTo(8, y); c.lineTo(58, y); c.stroke(); }
    c.restore();
    poly(c, pts);
    c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(26, 11); c.quadraticCurveTo(32, 23, 38, 11);
    c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,0.5)"; c.stroke();
  },

  platebody: (c, col) => {
    const pts = [[16, 14], [24, 9], [32, 15], [40, 9], [48, 14], [53, 26], [51, 55], [13, 55], [11, 26]];
    c.save();
    poly(c, pts);
    c.clip();
    c.fillStyle = sh(col, 1);
    c.fillRect(0, 0, S, S);
    c.fillStyle = sh(col, 1.38);
    c.fillRect(14, 15, 36, 5);
    c.fillStyle = sh(col, 0.66);
    c.fillRect(10, 27, 44, 2.6);
    c.fillRect(10, 43, 44, 2.6);
    c.fillStyle = sh(col, 1.18);
    c.fillRect(11, 30, 42, 13);
    c.restore();
    poly(c, pts);
    c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    fillPoly(c, [[11, 17], [22, 10], [25, 19], [14, 25]], sh(col, 1.3), OUT, 2);
    fillPoly(c, [[53, 17], [42, 10], [39, 19], [50, 25]], sh(col, 1.3), OUT, 2);
    c.beginPath(); c.moveTo(25, 9); c.quadraticCurveTo(32, 24, 39, 9);
    c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,0.55)"; c.stroke();
  },

  platelegs: (c, col) => {
    fillRR(c, 15, 11, 34, 10, 3, sh(col, 1.2), OUT, 2);
    for (const s of [-1, 1]) {
      const cx = 32 + s * 9;
      const pts = [[cx - 8, 20], [cx + 8, 20], [cx + 7, 45], [cx + 5, 58], [cx - 6, 58], [cx - 7, 45]];
      fillPoly(c, pts, sh(col, 1), OUT, 2);
      c.beginPath(); c.moveTo(cx - 7, 26); c.lineTo(cx + 7, 26);
      c.lineWidth = 2; c.strokeStyle = sh(col, 0.68); c.stroke();
      c.beginPath(); c.moveTo(cx - 6.5, 46); c.lineTo(cx + 5.5, 46);
      c.lineWidth = 2; c.strokeStyle = sh(col, 1.3); c.stroke();
    }
    c.beginPath(); c.moveTo(32, 22); c.lineTo(32, 33);
    c.lineWidth = 2.4; c.strokeStyle = sh(col, 0.6); c.stroke();
  },

  plateskirt: (c, col) => {
    fillRR(c, 15, 11, 34, 9, 3, sh(col, 1.2), OUT, 2);
    const pts = [[16, 20], [48, 20], [55, 57], [9, 57]];
    c.save();
    poly(c, pts);
    c.clip();
    c.fillStyle = sh(col, 1);
    c.fillRect(0, 0, S, S);
    c.strokeStyle = sh(col, 0.66); c.lineWidth = 1.8;
    for (let i = 1; i < 8; i++) { const t = i / 8; c.beginPath(); c.moveTo(16 + 32 * t, 20); c.lineTo(9 + 46 * t, 57); c.stroke(); }
    c.beginPath(); c.moveTo(6, 35); c.lineTo(58, 35); c.strokeStyle = sh(col, 1.4); c.lineWidth = 2.2; c.stroke();
    c.restore();
    poly(c, pts);
    c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
  },

  sqshield: (c, col) => {
    const pts = [[11, 13], [53, 13], [55, 33], [32, 55], [9, 33]];
    fillPoly(c, pts, sh(col, 1), OUT, 2);
    c.save(); poly(c, pts); c.clip();
    c.fillStyle = sh(col, 1.35); c.fillRect(11, 13, 42, 6);
    c.strokeStyle = sh(col, 0.68); c.lineWidth = 2.4;
    poly(c, [[15, 17], [49, 17], [51, 33], [32, 50], [13, 33]]); c.stroke();
    c.restore();
    circle(c, 32, 31, 8.5, sh(col, 1.22), OUT, 2);
    circle(c, 29, 28, 3.2, sh(col, 1.7));
  },

  kiteshield: (c, col) => {
    const pts = [[9, 15], [20, 9], [32, 15], [44, 9], [55, 15], [52, 34], [32, 58], [12, 34]];
    fillPoly(c, pts, sh(col, 1), OUT, 2);
    c.save(); poly(c, pts); c.clip();
    c.fillStyle = sh(col, 1.3); c.fillRect(9, 11, 46, 5);
    c.beginPath(); c.moveTo(32, 17); c.lineTo(32, 56);
    c.lineWidth = 1.6; c.strokeStyle = sh(col, 0.7); c.stroke();
    c.restore();
    c.save(); poly(c, [[13, 17], [51, 17], [48, 33], [32, 53], [16, 33]]);
    c.lineWidth = 2.2; c.strokeStyle = sh(col, 0.7); c.stroke(); c.restore();
    circle(c, 32, 30, 6.5, sh(col, 1.25), OUT, 2);
  },

  leatherbody: (c, col) => {
    fillPoly(c, [[17, 16], [27, 10], [37, 10], [47, 16], [52, 44], [12, 44]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(32, 12); c.lineTo(32, 44); c.lineWidth = 2; c.strokeStyle = sh(col, 0.6); c.stroke();
    for (let y = 18; y < 42; y += 7) { circle(c, 22, y, 1.8, sh(0xcfcfc0, 1)); circle(c, 42, y, 1.8, sh(0xcfcfc0, 1)); }
  },
  chaps: (c, col) => {
    fillPoly(c, [[17, 8], [47, 8], [44, 30], [40, 56], [30, 56], [32, 32], [32, 32], [24, 56], [12, 56], [20, 30]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(32, 10); c.lineTo(32, 32); c.lineWidth = 2; c.strokeStyle = sh(col, 0.5); c.stroke();
  },
  amulet: (c, col) => {
    c.beginPath(); c.arc(32, 26, 18, Math.PI * 1.12, Math.PI * 1.88); c.lineWidth = 5; c.strokeStyle = sh(0xc8a038, 1); c.stroke();
    fillPoly(c, [[32, 36], [42, 46], [32, 60], [22, 46]], sh(col, 1), OUT, 2);
    fillPoly(c, [[32, 40], [37, 46], [32, 54]], sh(col, 1.5));
  },

  log: (c, col) => {
    const h = (((col * 2654435761) >>> 0) % 997) / 997;
    const variant = h < 0.34 ? 0 : h < 0.67 ? 1 : 2;
    const draw = (cx, cy, ang, w, L, colr) => {
      c.save();
      c.translate(cx, cy);
      c.rotate(ang);
      c.save();
      rr(c, -L / 2, -w / 2, L, w, w / 2 - 1);
      c.clip();
      c.fillStyle = sh(colr, 1);
      c.fillRect(-L, -w, L * 2, w * 2);
      c.strokeStyle = sh(colr, 0.66);
      c.lineWidth = 1.4;
      for (let x = -L / 2 + 5; x < L / 2; x += 6) {
        c.beginPath(); c.moveTo(x, -w); c.lineTo(x + 2.6, w); c.stroke();
      }
      c.fillStyle = sh(colr, 1.3);
      c.fillRect(-L / 2, -w / 2 + 1.6, L, 3.2);
      c.restore();
      rr(c, -L / 2, -w / 2, L, w, w / 2 - 1);
      c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
      ell(c, -L / 2 + 1, 0, 4.4, w / 2 - 1.6, sh(colr, 1.4), OUT, 1.6);
      ell(c, -L / 2 + 1, 0, 1.9, w / 5.5, sh(colr, 0.72));
      c.restore();
    };
    if (variant === 0) {
      draw(33, 35, -0.5, 13 + h * 4, 40 + h * 10, col);
    } else if (variant === 1) {
      draw(25, 45, -0.62, 12, 38, sh0(col, 0.82));
      draw(39, 23, -0.38, 13, 42, col);
    } else {
      draw(24, 24, 0.72, 12.5, 40, sh0(col, 0.86));
      draw(41, 42, -0.46, 13.5, 42, col);
    }
  },

  ore: (c, col) => {
    fillPoly(c, [[12, 50], [8, 34], [20, 24], [40, 22], [54, 34], [52, 50]], sh(0x8b8377, 1), OUT, 2);
    fillPoly(c, [[20, 24], [40, 22], [44, 34], [16, 36]], sh(0x9d9689, 1));
    for (const p of [[24, 32], [36, 30], [30, 42], [42, 40], [21, 44]]) circle(c, p[0], p[1], 4, sh(col, 1), OUT, 1.5);
  },
  /* An elemental talisman: the staff-like pendant on its cord, head ellipted
     and cord looped, in the item's own colour. */
  talisman: (c, col) => {
    c.beginPath(); c.arc(32, 16, 7, 0, Math.PI * 2);
    c.lineWidth = 3; c.strokeStyle = sh(col, 0.7); c.stroke();
    fillPoly(c, [[26, 22], [38, 22], [36, 52], [28, 52]], sh(col, 1), OUT, 2);
    fillPoly(c, [[28, 26], [36, 26], [34, 48], [30, 48]], sh(col, 1.5));
    circle(c, 32, 34, 2.5, sh(col, 1.9));
  },
  bar: (c, col) => {
    fillPoly(c, [[8, 44], [26, 34], [56, 34], [38, 44]], sh(col, 1.3));
    fillPoly(c, [[8, 44], [38, 44], [38, 54], [8, 54]], sh(col, 0.85), OUT, 2);
    fillPoly(c, [[38, 44], [56, 34], [56, 44], [38, 54]], sh(col, 0.62), OUT, 2);
    fillPoly(c, [[14, 46], [34, 46], [34, 49], [14, 49]], sh(col, 1.5));
  },
  rune: (c, col) => {
    fillPoly(c, [[14, 56], [10, 26], [34, 8], [54, 24], [50, 56]], sh(0x8f8f96, 1), OUT, 2);
    fillPoly(c, [[20, 52], [18, 30], [34, 16], [46, 28], [44, 52]], sh(col, 1));
    c.beginPath(); c.moveTo(32, 20); c.lineTo(40, 34); c.lineTo(32, 46); c.lineTo(24, 34); c.closePath();
    c.fillStyle = sh(col, 1.9); c.fill(); c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,0.8)"; c.stroke();
  },
  gem: (c, col) => {
    fillPoly(c, [[32, 8], [52, 23], [46, 45], [32, 58], [18, 45], [12, 23]], sh(col, 1), OUT, 2);
    fillPoly(c, [[32, 8], [12, 23], [24, 25]], sh(col, 1.3));
    fillPoly(c, [[32, 8], [52, 23], [40, 25]], sh(col, 1.55));
    fillPoly(c, [[12, 23], [24, 25], [40, 25], [52, 23], [46, 45], [32, 58], [18, 45]], sh(col, 0.78));
    fillPoly(c, [[32, 58], [46, 45], [40, 25], [24, 25], [18, 45]], sh(col, 1.05));
    c.beginPath(); c.moveTo(24, 25); c.lineTo(40, 25);
    c.lineWidth = 1.3; c.strokeStyle = "rgba(255,255,255,0.5)"; c.stroke();
  },

  gem_uncut: (c, col) => {
    fillPoly(c, [[13, 53], [9, 34], [18, 20], [16, 12], [30, 8], [44, 14], [52, 26], [56, 44], [46, 55]], sh(0x847f77, 1), OUT, 2);
    fillPoly(c, [[20, 46], [16, 32], [24, 22], [22, 16], [32, 13], [42, 19], [48, 29], [50, 43], [40, 49]], sh(col, 1), OUT, 2);
    fillPoly(c, [[24, 22], [22, 16], [32, 13], [36, 20]], sh(col, 1.45));
    fillPoly(c, [[32, 13], [42, 19], [48, 29], [50, 43], [40, 49]], sh(col, 1.16));
    fillPoly(c, [[24, 22], [32, 13], [38, 24], [28, 31]], sh(col, 1.6));
    fillPoly(c, [[20, 46], [26, 33], [38, 40], [40, 49]], sh(col, 0.72));
    c.beginPath(); c.moveTo(32, 14); c.lineTo(28, 31); c.lineTo(38, 24);
    c.lineWidth = 1.2; c.strokeStyle = "rgba(255,255,255,0.45)"; c.stroke();
  },
  heart: (c, col) => {
    c.beginPath();
    c.moveTo(32, 56);
    c.bezierCurveTo(-8, 30, 12, 2, 32, 22);
    c.bezierCurveTo(52, 2, 72, 30, 32, 56);
    c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    circle(c, 22, 21, 5, sh(col, 1.55));
  },
  boots: (c, col) => {
    fillPoly(c, [[20, 8], [34, 8], [34, 34], [52, 34], [52, 52], [20, 52]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(22, 20); c.lineTo(34, 20); c.lineWidth = 2; c.strokeStyle = sh(col, 0.6); c.stroke();
    c.beginPath(); c.moveTo(20, 44); c.lineTo(52, 44); c.stroke();
  },
  /* A pair of gloves: two cuffed mitts, thumb inward. Nothing else in the set
     paints a hand, and the mystic gloves are the game's first item to use one. */
  gloves: (c, col) => {
    for (const dx of [0, 26]) {
      fillRR(c, 8 + dx, 22, 16, 24, 4, sh(col, 1), OUT, 2);
      fillRR(c, 20 + dx, 16, 7, 13, 3, sh(col, 1.18), OUT, 2);
      c.beginPath(); c.moveTo(8 + dx, 30); c.lineTo(24 + dx, 30); c.lineWidth = 2; c.strokeStyle = sh(col, 1.5); c.stroke();
    }
  },
  /* A ring: a gold band seen three-quarter on, with the gem in the bezel. The
     jewellery slot had no painter because no item in the world used it; the
     rings (src/items.js) are the first, and this is only their fallback icon -
     every one of them resolves a real cache sprite, so this draws only if a
     sprite lookup fails. */
  ring: (c, col) => {
    c.beginPath();
    c.ellipse(32, 36, 15, 13, 0, 0, Math.PI * 2);
    c.lineWidth = 6;
    c.strokeStyle = sh(0xd8b048, 1);
    c.stroke();
    c.lineWidth = 1.6;
    c.strokeStyle = OUT;
    c.stroke();
    fillPoly(c, [[32, 14], [41, 22], [32, 32], [23, 22]], sh(col, 1.1), OUT, 2);
    fillPoly(c, [[32, 17], [37, 22], [32, 28]], sh(col, 1.6));
  },
  herb: (c, col) => {
    c.beginPath(); c.moveTo(32, 56); c.lineTo(32, 26); c.lineWidth = 3; c.strokeStyle = sh(col, 0.7); c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(32, 40); c.quadraticCurveTo(32 + s * 20, 30, 32 + s * 18, 12);
      c.quadraticCurveTo(32 + s * 6, 26, 32, 36); c.closePath();
      c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 1.8; c.strokeStyle = OUT; c.stroke();
    }
  },
  mask: (c, col) => {
    c.beginPath(); c.moveTo(10, 22); c.quadraticCurveTo(32, 12, 54, 22);
    c.quadraticCurveTo(48, 50, 32, 54); c.quadraticCurveTo(16, 50, 10, 22); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    ell(c, 23, 30, 6, 4, "#1c1c1c"); ell(c, 41, 30, 6, 4, "#1c1c1c");
    c.beginPath(); c.moveTo(20, 42); c.quadraticCurveTo(32, 48, 44, 42); c.lineWidth = 2; c.strokeStyle = sh(col, 0.6); c.stroke();
  },
  trap: (c, col) => {
    fillRR(c, 10, 34, 44, 16, 3, sh(col, 1), OUT, 2);
    for (let i = 0; i < 5; i++) fillPoly(c, [[14 + i * 9, 34], [18 + i * 9, 18], [22 + i * 9, 34]], sh(col, 1.3), OUT, 1.5);
    fillRR(c, 10, 30, 44, 6, 2, sh(col, 0.7), OUT, 2);
  },
  seed: (c, col) => {
    ell(c, 32, 34, 14, 20, sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(32, 16); c.quadraticCurveTo(36, 10, 42, 8); c.lineWidth = 3; c.strokeStyle = sh(0x4a8a34, 1); c.stroke();
    fillPoly(c, [[36, 10], [50, 14], [38, 22]], sh(0x4a8a34, 1), OUT, 1.5);
  },
  bones: (c, col) => {
    c.save();
    c.translate(32, 33);
    c.rotate(-0.62);
    fillRR(c, -20, -4.6, 40, 9.2, 4.2, sh(col, 1), OUT, 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(c, sx * 20, sy * 6.4, 6.1, sh(col, 1), OUT, 2);
    c.fillStyle = sh(col, 1.35);
    c.fillRect(-14, -3.4, 28, 2.8);
    c.restore();
  },

  hide: (c, col) => {
    c.beginPath();
    c.moveTo(12, 16); c.quadraticCurveTo(32, 6, 52, 16);
    c.quadraticCurveTo(60, 34, 48, 52); c.quadraticCurveTo(32, 58, 16, 52);
    c.quadraticCurveTo(4, 34, 12, 16); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(20, 24); c.quadraticCurveTo(32, 32, 44, 24);
    c.lineWidth = 2; c.strokeStyle = sh(col, 0.65); c.stroke();
    c.beginPath(); c.moveTo(22, 40); c.quadraticCurveTo(32, 46, 42, 40); c.stroke();
  },
  feather: (c, col) => {
    c.save();
    c.translate(33, 33);
    c.rotate(-0.7);
    fillPoly(c, [[0, 27], [-7.5, 6], [-6.5, -14], [0, -28], [6.5, -14], [7.5, 6]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(0, 30); c.lineTo(0, -30);
    c.lineWidth = 1.8; c.strokeStyle = sh(col, 0.6); c.stroke();
    c.strokeStyle = sh(col, 0.76); c.lineWidth = 1.1;
    for (let y = -23; y < 22; y += 5.5) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(-6, y + 6);
      c.moveTo(0, y); c.lineTo(6, y + 6);
      c.stroke();
    }
    c.restore();
  },

  bait: (c, col) => {
    for (const [dx, dy, r] of [[-9, 1, -0.5], [8, -3, 0.42], [1, 9, 0.18]]) {
      c.save();
      c.translate(32 + dx, 34 + dy);
      c.rotate(r);
      ell(c, 0, 0, 12, 8, sh(col, 1), OUT, 2);
      c.strokeStyle = sh(col, 0.62); c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(-3, -8); c.lineTo(-3, 8);
      c.moveTo(3, -8); c.lineTo(3, 8);
      c.stroke();
      c.restore();
    }
  },
  coins: (c, col) => {
    for (let i = 0; i < 3; i++) {
      const y = 42 - i * 9;
      ell(c, 32, y, 20, 8, sh(col, 0.8 + i * 0.12), OUT, 2);
      ell(c, 32, y - 2, 20, 8, sh(col, 1.1 + i * 0.12), OUT, 2);
    }
  },
  ashes: (c, col) => {
    c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(32, 18, 54, 50); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    for (const p of [[24, 40], [38, 42], [32, 34], [20, 45]]) circle(c, p[0], p[1], 3, sh(0x6a6a63, 1));
  },
  tinderbox: (c, col) => {
    fillPoly(c, [[11, 23], [44, 18], [54, 27], [21, 32]], sh(col, 1.28), OUT, 2);
    fillPoly(c, [[11, 23], [21, 32], [21, 55], [11, 46]], sh(col, 0.78), OUT, 2);
    fillPoly(c, [[21, 32], [54, 27], [54, 49], [21, 55]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(21, 43); c.lineTo(54, 39);
    c.lineWidth = 1.6; c.strokeStyle = sh(col, 0.66); c.stroke();
    fillRR(c, 38, 7, 17, 13, 3, sh(0x9a9aa2, 1), OUT, 2);
    c.beginPath(); c.moveTo(46, 20); c.lineTo(50, 27); c.lineTo(43, 27); c.closePath();
    c.fillStyle = sh(0x2a2a2a, 1); c.fill();
    c.beginPath(); c.moveTo(29, 41); c.lineTo(33, 30);
    c.lineWidth = 2.4; c.strokeStyle = sh(0xffe28a, 1); c.stroke();
    circle(c, 28, 45, 4, sh(0xf0c040, 1), OUT, 1.5);
  },

  net: (c, col) => {
    const pts = [[9, 24], [55, 21], [47, 56], [17, 56]];
    poly(c, pts);
    c.save();
    c.clip();
    c.fillStyle = sh(col, 1);
    c.fillRect(0, 0, S, S);
    c.strokeStyle = sh(col, 0.58);
    c.lineWidth = 1.4;
    for (let k = -32; k < 92; k += 7) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 30, 64); c.stroke();
      c.beginPath(); c.moveTo(k, 64); c.lineTo(k + 30, 0); c.stroke();
    }
    c.restore();
    poly(c, pts);
    c.lineWidth = 2.2;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.moveTo(9, 24);
    c.quadraticCurveTo(32, 13, 55, 21);
    c.lineWidth = 2.6;
    c.strokeStyle = sh(0x6a5a3a, 1);
    c.stroke();
    c.beginPath();
    c.moveTo(29, 14); c.lineTo(22, 7);
    c.moveTo(35, 14); c.lineTo(42, 8);
    c.lineWidth = 2;
    c.strokeStyle = sh(0x6a5a3a, 1);
    c.stroke();
  },
  rod: (c, col) => {
    c.save();
    c.translate(32, 33);
    c.rotate(0.85);
    fillRR(c, -3, -6, 6, 30, 3, sh(col, 0.78), OUT, 2);
    fillRR(c, -2, -36, 4, 32, 2, sh(col, 1), OUT, 2);
    c.restore();
    c.beginPath(); c.moveTo(55, 9); c.quadraticCurveTo(62, 32, 46, 44);
    c.lineWidth = 1.4; c.strokeStyle = "rgba(240,240,232,0.9)"; c.stroke();
    c.beginPath(); c.arc(44, 47, 4.5, 0.2, 4.4);
    c.lineWidth = 2; c.strokeStyle = sh(0xc8c8d0, 1); c.stroke();
    circle(c, 55, 8, 3.6, sh(0xd04030, 1), OUT, 1.4);
  },

  chisel: (c, col) => {
    fillRR(c, 28, 8, 9, 34, 3, sh(col, 1), OUT, 2);
    fillPoly(c, [[26, 42], [39, 42], [36, 56], [29, 56]], sh(col, 0.7), OUT, 2);
    fillPoly(c, [[29, 52], [36, 52], [33, 60], [31, 60]], sh(col, 1.5));
  },
  hammer: (c, col) => {
    c.save(); c.translate(32, 32); c.rotate(-0.6);
    fillRR(c, -4, -6, 8, 34, 3, sh(WOOD, 1), OUT, 2);
    fillRR(c, -18, -22, 36, 16, 3, sh(col, 1), OUT, 2);
    c.restore();
  },
  knife: (c, col) => {
    fillPoly(c, [[30, 4], [40, 26], [32, 34], [26, 18]], sh(col, 1), OUT, 2);
    fillRR(c, 26, 32, 10, 26, 4, sh(0x6a4a2c, 1), OUT, 2);
  },
  bucket: (c, col) => {
    fillPoly(c, [[16, 20], [48, 20], [44, 56], [20, 56]], sh(col, 1), OUT, 2);
    ell(c, 32, 20, 16, 5, sh(col, 1.3), OUT, 2);
    c.beginPath(); c.arc(32, 20, 15, Math.PI, 0); c.lineWidth = 2.5; c.strokeStyle = sh(col, 0.6); c.stroke();
  },
  pot: (c, col) => {
    c.beginPath(); c.arc(11, 28, 6, 1.25, 4.4);
    c.lineWidth = 3; c.strokeStyle = sh(col, 0.8); c.stroke();
    c.beginPath(); c.arc(53, 28, 6, -1.25, 1.9);
    c.lineWidth = 3; c.strokeStyle = sh(col, 0.8); c.stroke();
    c.beginPath(); c.moveTo(20, 22); c.quadraticCurveTo(16, 40, 24, 54);
    c.lineTo(40, 54); c.quadraticCurveTo(48, 40, 44, 22); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    fillRR(c, 14, 16, 36, 8, 3, sh(col, 1.22), OUT, 2);
    ell(c, 32, 20, 14, 4, "#2e2620", OUT, 1.5);
    c.beginPath(); c.moveTo(21, 34); c.quadraticCurveTo(24, 25, 29, 24);
    c.lineWidth = 2.4; c.strokeStyle = sh(col, 1.5); c.stroke();
  },

  jug: (c, col) => {
    c.beginPath(); c.arc(50, 34, 8.5, -1.25, 1.25);
    c.lineWidth = 3.4; c.strokeStyle = sh(col, 0.86); c.stroke();
    fillPoly(c, [[19, 20], [45, 20], [53, 50], [11, 50]], sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(20, 20); c.quadraticCurveTo(32, 26, 44, 20);
    c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    fillRR(c, 22, 10, 20, 11, 3, sh(col, 1.12), OUT, 2);
    fillPoly(c, [[23, 11], [17, 3], [27, 8]], sh(col, 1.12), OUT, 1.8);
    c.beginPath(); c.moveTo(36, 10); c.quadraticCurveTo(40, 4, 46, 5);
    c.lineWidth = 3; c.strokeStyle = sh(col, 1.12); c.stroke();
    ell(c, 32, 52, 21, 5.5, sh(col, 0.78), OUT, 2);
    c.beginPath(); c.moveTo(22, 30); c.quadraticCurveTo(26, 24, 31, 24);
    c.lineWidth = 2.2; c.strokeStyle = sh(col, 1.5); c.stroke();
  },

  spade: (c, col) => {
    fillRR(c, 28, 6, 8, 34, 3, sh(WOOD, 1), OUT, 2);
    fillPoly(c, [[14, 38], [50, 38], [44, 56], [20, 56]], sh(col, 1), OUT, 2);
  },
  rope: (c, col) => {
    for (let i = 0; i < 4; i++) {
      ell(c, 32, 22 + i * 9, 20 - i * 2, 7, "rgba(0,0,0,0)", sh(col, 1), 5);
    }
  },
  needle: (c, col) => {
    c.save(); c.translate(32, 32); c.rotate(0.6);
    fillPoly(c, [[-2, -26], [3, -26], [1, 24], [-2, 24]], sh(col, 1), OUT, 1.5);
    c.beginPath(); c.arc(0, -18, 2.5, 0, 7); c.lineWidth = 2; c.strokeStyle = sh(col, 0.5); c.stroke();
    c.restore();
  },
  thread: (c, col) => {
    ell(c, 32, 32, 18, 18, sh(col, 1), OUT, 2);
    ell(c, 32, 32, 6, 6, "rgba(0,0,0,0.3)");
    for (let a = 0; a < 8; a++) { c.beginPath(); c.arc(32, 32, 12, a, a + 0.5); c.lineWidth = 1.5; c.strokeStyle = sh(col, 0.75); c.stroke(); }
  },
  wool: (c, col) => {
    circle(c, 32, 32, 20, sh(col, 1), OUT, 2);
    for (let a = 0; a < 5; a++) { c.beginPath(); c.arc(32, 32, 6 + a * 3.2, 0, 6.28); c.lineWidth = 1.6; c.strokeStyle = sh(col, 0.78); c.stroke(); }
  },
  flax: (c, col) => {
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(32 + i * 3.2, 56);
      c.quadraticCurveTo(32 + i * 8 + 5, 34, 32 + i * 6 - 2, 10 + Math.abs(i) * 5);
      c.lineWidth = 3.4;
      c.lineCap = "round";
      c.strokeStyle = sh(col, i % 2 ? 1.15 : 0.88);
      c.stroke();
    }
    fillRR(c, 24, 45, 16, 7.5, 3, sh(0x8a6a3a, 1), OUT, 1.8);
  },

  shaft: (c, col) => bladeShape(c, col, "shaftonly"),

  arrow: (c, col) => bladeShape(c, col, "arrow"),

  bow: (c, col) => bowShape(c, col, false),

  staff: (c, col) => staffShape(c, col, col),

  fish: (c, col) => {
    c.beginPath(); c.moveTo(8, 32); c.quadraticCurveTo(30, 8, 50, 32); c.quadraticCurveTo(30, 56, 8, 32); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    fillPoly(c, [[8, 32], [0, 20], [2, 32], [0, 44]], sh(col, 0.7), OUT, 2);
    circle(c, 40, 26, 3.5, "#2b2b2b");
    c.beginPath(); c.arc(28, 32, 12, -1.1, 1.1); c.lineWidth = 2; c.strokeStyle = sh(col, 0.65); c.stroke();
  },
  fish_cooked: (c, col) => {
    c.beginPath(); c.moveTo(8, 32); c.quadraticCurveTo(30, 10, 50, 32); c.quadraticCurveTo(30, 54, 8, 32); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    fillPoly(c, [[8, 32], [0, 20], [2, 32], [0, 44]], sh(col, 0.72), OUT, 2);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(16 + i * 8, 20); c.lineTo(20 + i * 8, 44); c.lineWidth = 1.6; c.strokeStyle = sh(col, 0.7); c.stroke(); }
    circle(c, 41, 26, 3, "#2b2b2b");
  },
  bread: (c, col) => {
    c.beginPath(); c.moveTo(8, 46); c.quadraticCurveTo(6, 20, 32, 16); c.quadraticCurveTo(58, 20, 56, 46); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(16 + i * 12, 24); c.lineTo(22 + i * 12, 40); c.lineWidth = 2.4; c.strokeStyle = sh(col, 0.7); c.stroke(); }
  },
  cake: (c, col) => {
    fillRR(c, 12, 26, 40, 26, 3, sh(col, 1), OUT, 2);
    fillRR(c, 12, 20, 40, 8, 3, sh(col, 1.25), OUT, 2);
    circle(c, 26, 20, 3, sh(0xd04040, 1), OUT, 1.5);
    circle(c, 40, 20, 3, sh(0xd04040, 1), OUT, 1.5);
  },
  cheese: (c, col) => {
    fillPoly(c, [[8, 48], [56, 48], [56, 20], [8, 34]], sh(col, 1), OUT, 2);
    fillPoly(c, [[8, 34], [56, 20], [30, 12]], sh(col, 1.25));
    for (const p of [[24, 40], [40, 36], [34, 26]]) circle(c, p[0], p[1], 3.2, sh(col, 0.7));
  },
  meat: (c, col) => {
    fillRR(c, 28, 26, 9, 30, 4, sh(0xe8e0d0, 1), OUT, 2);
    circle(c, 24, 22, 14, sh(col, 1), OUT, 2);
    circle(c, 40, 22, 12, sh(col, 1), OUT, 2);
    circle(c, 30, 18, 5, sh(col, 1.35));
  },
  meat_raw: (c, col) => {
    fillRR(c, 28, 26, 9, 30, 4, sh(0xf0e8dc, 1), OUT, 2);
    circle(c, 24, 22, 14, sh(col, 1), OUT, 2);
    circle(c, 40, 22, 12, sh(col, 1), OUT, 2);
    for (const p of [[22, 20], [36, 26], [44, 18]]) circle(c, p[0], p[1], 3, sh(0xf0d8d0, 1));
  },
  apple: (c, col) => {
    circle(c, 32, 36, 19, sh(col, 1), OUT, 2);
    c.beginPath(); c.moveTo(32, 18); c.quadraticCurveTo(34, 8, 40, 6); c.lineWidth = 3; c.strokeStyle = sh(0x5a4028, 1); c.stroke();
    fillPoly(c, [[38, 8], [52, 12], [40, 20]], sh(0x4a8a34, 1), OUT, 1.5);
    circle(c, 24, 28, 5, sh(col, 1.4));
  },
  banana: (c, col) => {
    c.beginPath(); c.moveTo(12, 12); c.quadraticCurveTo(14, 52, 52, 52);
    c.quadraticCurveTo(46, 40, 40, 30); c.quadraticCurveTo(30, 18, 12, 12); c.closePath();
    c.fillStyle = sh(col, 1); c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = sh(col, 0.6); c.beginPath(); c.arc(12, 12, 3.5, 0, 7); c.fill();
  },
  bigbone: (c, col) => {
    c.save();
    c.translate(30, 35);
    c.rotate(-0.5);
    fillRR(c, -23, -5.5, 46, 11, 5, sh(col, 1), OUT, 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(c, sx * 23, sy * 7.6, 7.4, sh(col, 1), OUT, 2);
    c.fillStyle = sh(col, 1.32);
    c.fillRect(-16, -4, 32, 3.6);
    c.restore();
    c.save();
    c.translate(36, 27);
    c.rotate(0.75);
    fillRR(c, -13, -3.4, 26, 6.8, 3.2, sh(col, 0.86), OUT, 1.8);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(c, sx * 13, sy * 4.6, 4.4, sh(col, 0.86), OUT, 1.8);
    c.restore();
  },
  longbow: (c, col) => bowShape(c, col, true),
  headless: (c, col) => bladeShape(c, col, "headless"),
};

const cache = new Map();

/* ---------------------------------------------------------- real sprites
   Authentic item artwork, shipped as ONE atlas: `src/sprites/item-atlas.png`
   plus `src/sprites/item-atlas.json`, which maps each icon key to its
   [x, y, w, h] cell inside it. The icons used to be one ~0.7 kB PNG each -
   1302 of them - and the boot fetched every one; measured with Resource
   Timing, that many requests was the largest single cost of the whole load.
   The atlas is what `src/tools/item-atlas.mjs` packs from
   `src/sprites/items/<id>.png` (the individual files stay the source, and are
   still what the bake tools write), so re-run that tool and bump
   `src/baked.js#BAKED_VERSION` after adding or changing an icon.

   A "sprite" is therefore `{ img, sx, sy, sw, sh }` - the shared atlas image
   plus the icon's own rect inside it - rather than an image to itself, and the
   per-icon width/height is what preserves the relative scale (an arrow really
   is smaller than a 2h sword). The procedural painters in PAINT stay as the
   fallback for any item without a sprite. */

const sprites = new Map();
let spritesReady = false;

/* A stack's sprite changes with the quantity: the client's item def carries a
   list of (count, item) pairs and draws the *last* pair whose count the stack has
   reached, so 1, 2, 3, 4 and 5+ coins are five different sprites (and 25, 100,
   250, 1000 and 10000 coins four more) - the same for bolts, arrows and every
   other stackable. Those tier sprites are baked into
   `src/sprites/items/<item>_<count>.png` from the osrsbox item dump, read at the
   cache's own variant item ids (the item def's pairs), so the art belongs to the
   same generation as every other icon here - the wiki's current files do not (its
   bolts have since been redrawn). `src/data/item-stacks.json` is the table:
   item key -> ascending [count, sprite id] pairs. */
const stackTiers = new Map();

/* The tier a stack of `qty` draws - the last pair whose count it has reached -
   or null when the item has no tier table, or nothing to speak of. A quantity
   of 1 lands on the table's 1-count tier (the whole reason the table starts
   there): a lone coin, bolt or arrow draws its own small icon rather than the
   pile the base sprite happens to be. The tier key names both the sprite in the
   atlas and, for the items that have them baked, the ground model
   (src/actions.js#groundKeyFor), so the walk lives here once and
   `stackSpriteFor` is just this plus "is that sprite in the atlas". */
export function stackTierKey(id, qty) {
  if (!(qty >= 1)) return null;
  const tiers = stackTiers.get(id);
  if (!tiers) return null;
  let hit = null;
  for (const [count, spr] of tiers) {
    if (qty >= count) hit = spr;
    else break;
  }
  return hit;
}

/* The sprite a stack of `qty` draws, or null to keep the item's own icon (what
   an item with no tier table, and every qty-less caller, gets). */
export function stackSpriteFor(id, qty) {
  const key = stackTierKey(id, qty);
  return key && sprites.has(key) ? key : null;
}

export function hasItemSprite(id) {
  return sprites.has(id);
}

export function spritesLoaded() {
  return spritesReady;
}

export async function loadItemSprites() {
  /* Two requests, not 1302: the atlas and its rect table. The icons are only
     registered once BOTH have landed - a rect with no image (or an image with
     no rects) would draw every icon as a procedural stand-in for a moment,
     which reads as a flash of wrong art rather than as a missing one. */
  try {
    const [jsonRes, img] = await Promise.all([
      fetch(bakedURL("src/sprites/item-atlas.json"), { cache: "force-cache" }),
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("item atlas failed to decode"));
        im.src = bakedURL("src/sprites/item-atlas.png");
      }),
    ]);
    if (jsonRes.ok) {
      const rects = (await jsonRes.json()).items || {};
      for (const [id, r] of Object.entries(rects)) {
        sprites.set(id, { img, sx: r[0], sy: r[1], sw: r[2], sh: r[3] });
      }
    }
  } catch (e) {
    console.warn("[icons] item atlas unavailable:", e && e.message);
  }
  try {
    const res = await fetch(bakedURL("src/data/item-stacks.json"));
    if (res.ok) for (const [id, tiers] of Object.entries(await res.json())) stackTiers.set(id, tiers);
  } catch (e) { /* no tier table — every stack keeps its base sprite */ }
  spritesReady = true;
  cache.clear();
  return sprites.size;
}

export function iconCanvas(id, size = 34, qty = 0) {
  const spr = stackSpriteFor(id, qty) || id;
  const key = spr + ":" + size;
  if (cache.has(key)) return cache.get(key);
  const item = ITEMS[id];
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const sprite = sprites.get(spr);
  if (sprite) {
    /* The icon is a rect of the shared atlas: same pixels, same relative size
       (the source rect's own w/h is what `m` measures, not the atlas's), and
       drawn with the same centring and smoothing rule as before. */
    const m = Math.max(sprite.sw, sprite.sh);
    const s = m > size ? size / m : 1;
    const w = sprite.sw * s;
    const h = sprite.sh * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite.img, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      (size - w) / 2, (size - h) / 2, w, h);
    cache.set(key, cv);
    return cv;
  }
  ctx.save();
  ctx.scale(size / S, size / S);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const painter = item && PAINT[item.shape];
  if (painter) {
    try { painter(ctx, item.colour); } catch (e) { ctx.restore(); ctx.fillStyle = "#8a8a84"; ctx.fillRect(size * 0.3, size * 0.3, size * 0.4, size * 0.4); }
  } else {
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(6, 6, 52, 52);
    ctx.fillStyle = "#d8d8d0";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item ? item.name.slice(0, 1).toUpperCase() : "?", 32, 34);
  }
  ctx.restore();
  cache.set(key, cv);
  return cv;
}

export function iconUrl(id, size = 34, qty = 0) {
  return iconCanvas(id, size, qty).toDataURL();
}

/* --------------------------------------------------------------- bank notes
   A note is not a different sprite in our item set: it is the same artwork
   warmed to parchment brown with the top-right corner folded over, which is
   how the game's own note icons read. */
const noteCache = new Map();

export function noteCanvas(id, size = 34) {
  const key = id + ":" + size;
  if (noteCache.has(key)) return noteCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.drawImage(iconCanvas(id, size), 0, 0, size, size);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(122, 84, 36, 0.52)";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  const f = size * 0.30;
  const fold = () => {
    ctx.beginPath();
    ctx.moveTo(size - f, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(size, f);
    ctx.closePath();
  };
  ctx.globalCompositeOperation = "destination-out";
  fold();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  fold();
  ctx.fillStyle = "rgba(232, 220, 186, 0.95)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, size / 18);
  ctx.strokeStyle = "rgba(60, 40, 16, 0.75)";
  ctx.stroke();
  noteCache.set(key, cv);
  return cv;
}

export function noteUrl(id, size = 32) {
  return noteCanvas(id, size).toDataURL();
}

/* ----------------------------------------------------- the item in the hand

   The white ring the client puts on the pack slot holding the item that Use was
   picked from. `ItemDefinition.getSprite` renders an item's 32x32 sprite and
   then runs two outline passes over it: the first turns every transparent pixel
   with a solid 4-neighbour into the sprite's black outline (pixel value 1), and
   the second turns every pixel that is *still* transparent and has a neighbour
   of value 1 into the outline colour it was asked for. The interface drawing
   asks for 0xFFFFFF for exactly the selected slot
   (`Client.drawInterface`, 317 client: `itemSelected && lastItemSelectedSlot ==
   item && lastItemSelectedInterface == childInterface.id`), so the ring the
   player sees is one pixel of white *outside* the art - and, because the black
   pass has already run, outside the black outline too.

   This is that second pass over the icon's own pixels, in the same four
   cardinal directions and with the same one-pass-at-a-time rule: the ring's
   positions are all collected before any of them is written, so the ring cannot
   thicken itself (the client's own writes are the outline colour and never
   value 1, so its pass cannot cascade either). Our icons already carry their
   black outline in their pixels, so the white lands where the client's does.
   `note` rings the parchment a noted stack is drawn as, into which the client
   would have drawn the ringed item. */
const ringCache = new Map();

export function ringedIconCanvas(id, size = 32, qty = 0, note = false) {
  const key = (stackSpriteFor(id, qty) || id) + ":" + size + (note ? "N" : "") + ":ring";
  if (ringCache.has(key)) return ringCache.get(key);
  const base = note ? noteCanvas(id, size) : iconCanvas(id, size, qty);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.drawImage(base, 0, 0);
  const data = ctx.getImageData(0, 0, size, size);
  const p = data.data;
  const solid = (x, y) => p[(y * size + x) * 4 + 3] > 127;
  const ring = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (p[(y * size + x) * 4 + 3] > 127) continue;
      if ((x > 0 && solid(x - 1, y)) || (y > 0 && solid(x, y - 1))
        || (x < size - 1 && solid(x + 1, y)) || (y < size - 1 && solid(x, y + 1))) ring.push(x, y);
    }
  }
  for (let i = 0; i < ring.length; i += 2) {
    const o = (ring[i + 1] * size + ring[i]) * 4;
    p[o] = 255; p[o + 1] = 255; p[o + 2] = 255; p[o + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  ringCache.set(key, cv);
  return cv;
}

export function ringedIconUrl(id, size = 32, qty = 0, note = false) {
  return ringedIconCanvas(id, size, qty, note).toDataURL();
}

const shapeCache = new Map();

export function shapeCanvas(shape, colour, size = 34) {
  const key = shape + ":" + colour + ":" + size;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.save();
  ctx.scale(size / S, size / S);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const painter = PAINT[shape];
  if (painter) painter(ctx, colour);
  ctx.restore();
  shapeCache.set(key, cv);
  return cv;
}

export function shapeUrl(shape, colour, size = 34) {
  return shapeCanvas(shape, colour, size).toDataURL();
}

export const ICON_SHAPES = Object.keys(PAINT);
