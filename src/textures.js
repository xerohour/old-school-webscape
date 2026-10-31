import { mulberry32 } from "./util.js";

const CELL = 64;
const PAD = 4;
const I = CELL - PAD * 2;
const COLS = 8;
const ROWS = 8;

const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);

function n(v) {
  return clampI(Math.round(v), 0, 255);
}

function noiseFill(put, rnd, base, amp, jitter) {
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      const f = 1 + (rnd() - 0.5) * 2 * (jitter ?? 0.14) + (amp || 0);
      put(x, y, base[0] * f, base[1] * f, base[2] * f);
    }
  }
}

function flecks(put, rnd, count, colors, maxSize) {
  for (let i = 0; i < count; i++) {
    const x = (rnd() * I) | 0;
    const y = (rnd() * I) | 0;
    const c = colors[(rnd() * colors.length) | 0];
    const w = 1 + ((rnd() * (maxSize || 2)) | 0);
    const h = 1 + ((rnd() * (maxSize || 2)) | 0);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, c[0], c[1], c[2]);
    }
  }
}

function blotches(put, rnd, count, colors, rmin, rmax) {
  for (let i = 0; i < count; i++) {
    const bx = (rnd() * I) | 0;
    const by = (rnd() * I) | 0;
    const r = rmin + ((rnd() * (rmax - rmin)) | 0);
    const c = colors[(rnd() * colors.length) | 0];
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        put(bx + x, by + y, c[0], c[1], c[2]);
      }
    }
  }
}

function planksH(put, rnd, base, rows) {
  const ph = I / rows;
  for (let r = 0; r < rows; r++) {
    const shade = 0.9 + rnd() * 0.2;
    const y0 = Math.round(r * ph);
    const y1 = Math.round((r + 1) * ph);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < I; x++) {
        const f = shade * (0.93 + rnd() * 0.14);
        put(x, y, base[0] * f, base[1] * f, base[2] * f);
      }
    }
    for (let i = 0; i < 3; i++) {
      const gx = (rnd() * I) | 0;
      const gf = 0.72 + rnd() * 0.16;
      for (let y = y0 + 1; y < y1; y++) put(gx, y, base[0] * gf, base[1] * gf, base[2] * gf);
    }
    for (let x = 0; x < I; x++) put(x, y1 - 1, base[0] * 0.4, base[1] * 0.38, base[2] * 0.36);
    for (let x = 0; x < I; x++) put(x, y0, base[0] * 1.16, base[1] * 1.16, base[2] * 1.16);
  }
}

function bricks(put, rnd, base, mortar, rowH, brickW, offset) {
  noiseFill(put, rnd, base, 0, 0.1);
  for (let y = 0; y < I; y++) {
    const inRow = y % rowH;
    const rowIdx = (y / rowH) | 0;
    const off = rowIdx % 2 === 1 ? offset : 0;
    if (inRow === 0 || inRow === rowH - 1) {
      put(-0, y, mortar[0], mortar[1], mortar[2]);
      for (let x = 0; x < I; x++) put(x, y, mortar[0], mortar[1], mortar[2]);
      continue;
    }
    for (let x = 0; x < I; x++) {
      const bx = (x + off) % brickW;
      if (bx === 0 || bx === brickW - 1) {
        put(x, y, mortar[0] * 1.05, mortar[1] * 1.05, mortar[2] * 1.05);
      } else if (inRow === 1) {
        const i = (y * I + x) * 4;
        put(x, y, base[0] * 1.13, base[1] * 1.13, base[2] * 1.13);
      }
    }
  }
  flecks(put, rnd, 90, [[mortar[0], mortar[1], mortar[2]], [base[0] * 0.85, base[1] * 0.85, base[2] * 0.85]], 1);
}

function shingles(put, rnd, base, rowH, tileW, offset) {
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      const rowIdx = (y / rowH) | 0;
      const off = rowIdx % 2 === 1 ? offset : 0;
      const bx = (x + off) % tileW;
      const inRow = y % rowH;
      let f = 0.94 + (rnd() - 0.5) * 0.14;
      f *= 1 - (inRow / rowH) * 0.22;
      if (inRow === 0) f *= 0.62;
      if (bx === 0) f *= 0.72;
      put(x, y, base[0] * f, base[1] * f, base[2] * f);
    }
  }
}

const PAINTERS = {};

function add(name, fn) {
  PAINTERS[name] = fn;
}

add("grass", (put, rnd) => {
  noiseFill(put, rnd, [96, 142, 66], 0, 0.13);
  blotches(put, rnd, 9, [[74, 114, 46], [116, 164, 76]], 5, 12);
  flecks(put, rnd, 260, [[68, 104, 44], [120, 168, 78], [80, 122, 52]], 2);
  flecks(put, rnd, 40, [[140, 186, 96]], 1);
});

add("grass_dark", (put, rnd) => {
  noiseFill(put, rnd, [80, 124, 56], 0, 0.13);
  blotches(put, rnd, 9, [[58, 92, 38], [102, 148, 66]], 5, 12);
  flecks(put, rnd, 260, [[56, 90, 36], [100, 146, 66], [66, 106, 44]], 2);
});

add("dirt", (put, rnd) => {
  noiseFill(put, rnd, [124, 104, 74], 0, 0.13);
  flecks(put, rnd, 200, [[98, 80, 56], [150, 130, 98], [112, 92, 66]], 2);
});

add("path", (put, rnd) => {
  noiseFill(put, rnd, [170, 150, 108], 0, 0.11);
  flecks(put, rnd, 320, [[196, 180, 142], [138, 120, 84], [158, 142, 104]], 2);
  flecks(put, rnd, 60, [[206, 196, 170]], 1);
});

add("sand", (put, rnd) => {
  noiseFill(put, rnd, [216, 202, 156], 0, 0.09);
  blotches(put, rnd, 8, [[198, 182, 136], [234, 224, 186]], 4, 10);
  flecks(put, rnd, 300, [[236, 226, 190], [188, 172, 128]], 2);
});

add("waterbed", (put, rnd) => {
  noiseFill(put, rnd, [76, 96, 76], 0, 0.14);
  blotches(put, rnd, 10, [[60, 80, 62], [96, 114, 92]], 4, 11);
  flecks(put, rnd, 200, [[58, 78, 62], [96, 116, 92], [110, 112, 96]], 2);
});

add("rockground", (put, rnd) => {
  noiseFill(put, rnd, [140, 132, 120], 0, 0.16);
  flecks(put, rnd, 300, [[166, 158, 146], [110, 104, 94], [122, 116, 106]], 3);
});

add("marsh", (put, rnd) => {
  noiseFill(put, rnd, [74, 104, 58], 0, 0.15);
  flecks(put, rnd, 220, [[52, 78, 42], [96, 128, 70], [64, 92, 52]], 2);
  for (let i = 0; i < 24; i++) {
    const x = (rnd() * I) | 0;
    const y = (rnd() * I) | 0;
    const h = 3 + ((rnd() * 5) | 0);
    for (let d = 0; d < h; d++) put(x, y + d, 118, 146, 74);
  }
});

add("gravel", (put, rnd) => {
  noiseFill(put, rnd, [148, 142, 130], 0, 0.15);
  flecks(put, rnd, 420, [[180, 174, 162], [112, 108, 100], [134, 128, 118], [160, 152, 140]], 2);
});

add("floor_wood", (put, rnd) => {
  planksH(put, rnd, [150, 112, 70], 4);
});

add("plank", (put, rnd) => {
  planksH(put, rnd, [166, 128, 80], 4);
});

add("floor_stone", (put, rnd) => {
  noiseFill(put, rnd, [176, 172, 164], 0, 0.1);
  const rows = 4;
  const rh = I / rows;
  for (let r = 0; r < rows; r++) {
    let x = r < 1 ? 0 : -((rnd() * 14) | 0);
    while (x < I) {
      const w = 14 + ((rnd() * 16) | 0);
      for (let y = r * rh; y < (r + 1) * rh; y++) {
        if (y < 0 || y >= I) continue;
        const edge = y === r * rh || y === (r + 1) * rh - 1 || x === Math.floor(x) || false;
        for (let dx = 0; dx < w; dx++) {
          if (y === Math.round(r * rh) || y === Math.round((r + 1) * rh) - 1) put(x + dx, y, 118, 114, 106);
          if (dx === 0) put(x + dx, y, 118, 114, 106);
        }
      }
      x += w;
    }
  }
});

add("wall", (put, rnd) => {
  bricks(put, rnd, [196, 190, 178], [140, 132, 120], 14, 28, 14);
});

add("roof", (put, rnd) => {
  shingles(put, rnd, [200, 194, 188], 16, 18, 9);
});

add("bark", (put, rnd) => {
  for (let x = 0; x < I; x++) {
    const f = 0.7 + rnd() * 0.46;
    for (let y = 0; y < I; y++) {
      const v = f * (0.86 + rnd() * 0.2);
      put(x, y, 198 * v, 170 * v, 140 * v);
    }
  }
  for (let i = 0; i < 36; i++) {
    const x = (rnd() * I) | 0;
    const y = (rnd() * I) | 0;
    const h = 8 + ((rnd() * 18) | 0);
    const dark = rnd() < 0.55;
    for (let d = 0; d < h; d++) {
      const xx = x + (d > h / 2 ? 1 : 0);
      if (dark) put(xx, y + d, 92, 74, 54);
      else put(xx, y + d, 236, 208, 172);
    }
  }
});

add("glass", (put, rnd) => {
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      const f = 0.5 + (1 - y / I) * 0.55;
      put(x, y, 54 * f, 92 * f, 126 * f);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x0 = (rnd() * I) | 0;
    const y0 = (rnd() * I) | 0;
    for (let d = 0; d < 16; d++) put(x0 + d, y0 + d, 168, 204, 230);
  }
  for (let i = 0; i < 50; i++) put((rnd() * I) | 0, (rnd() * I) | 0, 150, 190, 222);
});

add("leaves", (put, rnd) => {
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      const f = 0.84 + rnd() * 0.32;
      put(x, y, 146 * f, 182 * f, 116 * f);
    }
  }
  blotches(put, rnd, 14, [[78, 112, 54], [166, 198, 126]], 4, 10);
  flecks(put, rnd, 220, [[84, 116, 60], [112, 154, 80]], 3);
  flecks(put, rnd, 90, [[196, 220, 156]], 2);
});

add("rock", (put, rnd) => {
  noiseFill(put, rnd, [196, 194, 190], 0, 0.12);
  flecks(put, rnd, 180, [[150, 148, 146], [224, 222, 218]], 2);
  for (let i = 0; i < 16; i++) {
    const x = (rnd() * I) | 0;
    const y = (rnd() * I) | 0;
    const h = 3 + ((rnd() * 12) | 0);
    const hor = rnd() < 0.5;
    for (let d = 0; d < h; d++) {
      put(hor ? x + d : x, hor ? y : y + d, 122, 120, 118);
    }
  }
});

add("metal", (put, rnd) => {
  noiseFill(put, rnd, [180, 182, 186], 0, 0.09);
  for (let i = 0; i < 24; i++) {
    const y = (rnd() * I) | 0;
    const x = (rnd() * I) | 0;
    const w = 6 + ((rnd() * 16) | 0);
    for (let d = 0; d < w; d++) put(x + d, y, 208, 210, 214);
  }
});

add("cloth", (put, rnd) => {
  noiseFill(put, rnd, [206, 194, 168], 0, 0.07);
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      if ((x % 4 < 2) !== (y % 4 < 2)) {
        const i = (y * I + x) * 4;
        put(x, y, 182, 170, 146);
      }
    }
  }
});

add("thatch", (put, rnd) => {
  noiseFill(put, rnd, [204, 188, 140], 0, 0.09);
  for (let y = 0; y < I; y++) {
    for (let x = 0; x < I; x++) {
      if (rnd() < 0.22) put(x, y, 168, 148, 100);
      if (rnd() < 0.06) put(x, y, 226, 214, 170);
    }
  }
  for (let y = 0; y < I; y += 6) {
    for (let x = 0; x < I; x++) put(x, y, 150, 132, 92);
  }
});

add("solid", (put, rnd) => {
  noiseFill(put, rnd, [247, 247, 247], 0, 0.035);
});

export const TEX_NAMES = Object.keys(PAINTERS);

export function makeAtlas(seed = 20070) {
  const AW = CELL * COLS;
  const AH = CELL * ROWS;
  const canvas = document.createElement("canvas");
  canvas.width = AW;
  canvas.height = AH;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(AW, AH);
  const D = img.data;
  const buf = new Uint8ClampedArray(I * I * 4);

  const uvs = {};
  TEX_NAMES.forEach((name, index) => {
    const col = index % COLS;
    const row = (index / COLS) | 0;
    const ox = col * CELL + PAD;
    const oy = row * CELL + PAD;
    const rnd = mulberry32(9001 + index * 7919 + seed);
    const put = (x, y, r, g, b) => {
      const px = ((x % I) + I) % I;
      const py = ((y % I) + I) % I;
      const i = (py * I + px) * 4;
      buf[i] = n(r);
      buf[i + 1] = n(g);
      buf[i + 2] = n(b);
      buf[i + 3] = 255;
    };
    PAINTERS[name](put, rnd);
    for (let y = -PAD; y < I + PAD; y++) {
      for (let x = -PAD; x < I + PAD; x++) {
        const sx = clampI(x, 0, I - 1);
        const sy = clampI(y, 0, I - 1);
        const si = (sy * I + sx) * 4;
        const di = ((oy + y) * AW + (ox + x)) * 4;
        D[di] = buf[si];
        D[di + 1] = buf[si + 1];
        D[di + 2] = buf[si + 2];
        D[di + 3] = 255;
      }
    }
    uvs[name] = {
      u0: (ox) / AW,
      u1: (ox + I) / AW,
      v0: 1 - (oy + I) / AH,
      v1: 1 - oy / AH,
    };
  });

  ctx.putImageData(img, 0, 0);
  return { canvas, uvs };
}
