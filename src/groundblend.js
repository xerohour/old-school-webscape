import {
  splitClassPieces, nodeKey, ornamentPieces, ornHeightLab,
  detailCells, spillCells, sandSegsFromChords, sandSegsFromEdge, chordSides,
  bandStripOne, bandAlphaOne, goboFam,
} from "./mapgen/contour.js";
import { mulberry32 } from "./util.js";

export const GB_FAM = [0, 1, 9, 16];
export const GB_DETAIL_K = new Set([0, 1, 2, 4, 8, 9, 10, 16]);
export const GB_SPLIT_SET = new Set([0, 1, 2, 3, 4, 8, 9, 10, 16]);
export const GB_BASE_HEX = { 0: 0x327b5f, 1: 0x286f49, 9: 0x1e5e38, 4: 0xd3b07b, 10: 0x595959, 8: 0x7a7069, 2: 0x6b4a2c, 16: 0x587e2a };
export const GB_STROKE = { 0: 0.55, 1: 0.55, 9: 0.55, 4: 0.72, 10: 0.6, 8: 0.55, 2: 0.58, 16: 0.55 };
export const GB_STRENGTH = { 0: 0.6, 1: 0.6, 9: 0.6, 4: 0.7, 10: 0.5, 8: 0.6, 2: 0.55, 16: 0.6 };
export const GB_GRASS_W = 1.0;
export const GB_SPILL_W_TILES = 0.35;
export const GB_SPILL_STRENGTH = 0.42;
/* Underlayment classes: grass + sand no longer sample the baked cache
   textures at all. Their base is the flat underlayment color (GB_BASE_HEX)
   and all detail rides in the gobo overlay sheets. */
export const GB_UNDERLAY = new Set([0, 1, 4, 9, 16]);

const _cornerCache = new WeakMap();

export function cornerClsArray(world) {
  let e = _cornerCache.get(world);
  if (e) return e;
  const cls = new Int16Array(world.cw * (world.h + 1));
  const thr = world.waterLevel + 0.04;
  for (let cz = 0; cz <= world.h; cz++) {
    for (let cx = 0; cx <= world.w; cx++) {
      const h = world.corner[cz * world.cw + cx];
      if (!(h >= thr)) { cls[cz * world.cw + cx] = 5; continue; }
      const votes = [];
      for (const [tx, tz] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
        if (tx < 0 || tz < 0 || tx >= world.w || tz >= world.h) continue;
        const t = world.tiles[tz * world.w + tx];
        if (t !== 5) votes.push(t);
      }
      if (!votes.length) { cls[cz * world.cw + cx] = 5; continue; }
      const n = {};
      for (const v of votes) n[v] = (n[v] || 0) + 1;
      let best = votes[0], bn = -1;
      for (const k of Object.keys(n)) {
        const c = +k;
        if (n[k] > bn || (n[k] === bn && c < best)) { bn = n[k]; best = c; }
      }
      cls[cz * world.cw + cx] = best;
    }
  }
  _cornerCache.set(world, cls);
  return cls;
}

export function gbFacade(world) {
  return {
    w: world.w, h: world.h, cw: world.cw,
    corner: world.corner, cornerCls: cornerClsArray(world),
    waterLevel: world.waterLevel, tiles: world.tiles,
  };
}

const NW = [-1, -1], NE = [1, -1], SE = [1, 1], SW = [-1, 1];
const TILE_SQ = [NW, NE, SE, SW];

export function midsForCls(c4) {
  const E = [[NW, NE, c4[0], c4[1]], [NE, SE, c4[1], c4[2]], [SE, SW, c4[2], c4[3]], [SW, NW, c4[3], c4[0]]];
  const out = [];
  for (const [A, B, ca, cb] of E) {
    if (ca === 5 || cb === 5 || ca === cb) continue;
    out.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]);
  }
  return out;
}

export function slideGate(world, facade, x, z) {
  return (P) => {
    const mx = P[0], mz = P[1];
    let nx = x, nz = z;
    if ((mz === 1 || mz === -1) && mx === 0) nz = z + mz;
    else if ((mx === 1 || mx === -1) && mz === 0) nx = x + mx;
    else return true;
    if (nx < 0 || nz < 0 || nx >= world.w || nz >= world.h) return false;
    if (world.objAt) {
      const so = world.objAt(nx, nz);
      if (so && so.shaft) return false;
    }
    if (world.stepAt && world.stepAt(nx, nz)) return false;
    const cw = facade.cw, cc = facade.cornerCls, cn = facade.corner;
    const thr = world.waterLevel + 0.04;
    const hn = [cn[nz * cw + nx], cn[nz * cw + nx + 1], cn[(nz + 1) * cw + nx], cn[(nz + 1) * cw + nx + 1]];
    const nDry = hn.filter((v) => v >= thr).length;
    if (nDry > 0 && nDry < 4) {
      return typeof window === "undefined" ? true : window.__cutTiles !== false;
    }
    if (typeof window !== "undefined" && window.__groundBlend === false) return false;
    const tn = world.tiles[nz * world.w + nx];
    if (!GB_SPLIT_SET.has(tn)) return false;
    const c4n = [cc[nz * cw + nx], cc[nz * cw + nx + 1], cc[(nz + 1) * cw + nx + 1], cc[(nz + 1) * cw + nx]];
    const C = c4n[0];
    if (c4n.every((c) => c === C)) {
      if (C === tn || !GB_SPLIT_SET.has(tn)) return false;
      if (C !== 5 && !GB_SPLIT_SET.has(C)) return false;
      return true;
    }
    return c4n.every((c) => GB_SPLIT_SET.has(c));
  };
}

export function clsMapOf(c4) {
  const m = new Map();
  m.set(nodeKey(NW), c4[0]);
  m.set(nodeKey(NE), c4[1]);
  m.set(nodeKey(SE), c4[2]);
  m.set(nodeKey(SW), c4[3]);
  return m;
}

export function splitDryTile(world, facade, x, z, t) {
  const cc = facade.cornerCls, cw = facade.cw;
  const c4 = [cc[z * cw + x], cc[z * cw + x + 1], cc[(z + 1) * cw + x + 1], cc[(z + 1) * cw + x]];
  if (c4[0] === c4[1] && c4[1] === c4[2] && c4[2] === c4[3]) {
    const C = c4[0];
    if (C === t || !GB_SPLIT_SET.has(t)) return null;
    if (C !== 5 && !GB_SPLIT_SET.has(C)) return null;
    const B = C === 5 ? 5 : C, f = 0.5;
    const oct = [[-1 + f, -1], [1 - f, -1], [1, -1 + f], [1, 1 - f], [1 - f, 1], [-1 + f, 1], [-1, 1 - f], [-1, -1 + f]];
    const pieces = [{ poly: oct, cls: t }];
    const corners = [[NW, [-1 + f, -1], [-1, -1 + f]], [NE, [1, -1 + f], [1 - f, -1]], [SE, [1 - f, 1], [1, 1 - f]], [SW, [-1, 1 - f], [-1 + f, 1]]];
    const chords = [];
    for (const [cnr, P, Q] of corners) {
      pieces.push({ poly: [cnr, P, Q], cls: B });
      chords.push([P, Q]);
    }
    return { pieces, chords, mids: [], c4 };
  }
  for (const c of c4) if (!GB_SPLIT_SET.has(c)) return null;
  const clsOf = clsMapOf(c4);
  const mids = midsForCls(c4);
  const sp = splitClassPieces(TILE_SQ, clsOf, mids, t);
  ornamentPieces(facade, x, z, sp.pieces, mids, sp.chords, clsOf, slideGate(world, facade, x, z));
  return { pieces: sp.pieces, chords: sp.chords, mids, c4 };
}

export function splitShoreLoop(world, facade, x, z, loop, landCls, tileCls) {
  const cw = facade.cw, cc = facade.cornerCls;
  const c4 = [cc[z * cw + x], cc[z * cw + x + 1], cc[(z + 1) * cw + x + 1], cc[(z + 1) * cw + x]];
  const clsOf = clsMapOf(c4);
  const mids = midsForCls(c4).filter((M) => {
    for (let i = 0; i < loop.length; i++) {
      const A = loop[i], B = loop[(i + 1) % loop.length];
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-24) continue;
      let tt = ((M[0] - A[0]) * dx + (M[1] - A[1]) * dy) / l2;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      if (Math.hypot(M[0] - (A[0] + dx * tt), M[1] - (A[1] + dy * tt)) < 1e-9) return true;
    }
    return false;
  });
  const sp = splitClassPieces(loop, clsOf, mids, landCls ?? tileCls);
  ornamentPieces(facade, x, z, sp.pieces, mids, sp.chords, clsOf, slideGate(world, facade, x, z));
  return { pieces: sp.pieces, chords: sp.chords, mids, c4 };
}

export function nearHardTile(world, x, z, r) {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, tz = z + dz;
      if (tx < 0 || tz < 0 || tx >= world.w || tz >= world.h) continue;
      const t = world.tiles[tz * world.w + tx];
      if (t === 4 || t === 10) return true;
    }
  }
  return false;
}

export function grassRibbonJobs(pieces, chords, fam) {
  const jobs = [];
  for (const ch of chords || []) {
    const sides = chordSides(ch, pieces);
    if (sides.length !== 2) continue;
    if (!sides.every((c) => fam.includes(c))) continue;
    jobs.push({ ch, sides });
  }
  return jobs;
}

export function sandEdgeSegs(pieces, chords, fam, x, z, c4, tiles, w, h) {
  const segs = sandSegsFromChords(pieces, chords, fam, 0, 0);
  const edge = (ca, cb, nt, ax, az, bx, bz) => {
    if (ca !== 4 || cb !== 4) return;
    if (!fam.includes(nt)) return;
    segs.push({ ax, az, bx, bz, g: nt });
  };
  const nT = z > 0 ? tiles[(z - 1) * w + x] : -1;
  const sT = z + 1 < h ? tiles[(z + 1) * w + x] : -1;
  const wT = x > 0 ? tiles[z * w + x - 1] : -1;
  const eT = x + 1 < w ? tiles[z * w + x + 1] : -1;
  edge(c4[0], c4[1], nT, -1, -1, 1, -1);
  edge(c4[3], c4[2], sT, -1, 1, 1, 1);
  edge(c4[0], c4[3], wT, -1, -1, -1, 1);
  edge(c4[1], c4[2], eT, 1, -1, 1, 1);
  return segs;
}

export function sandSpillJob(w, facade, x, z, t, pieces, chords) {
  const cc = facade.cornerCls, cw = facade.cw;
  const c4 = [cc[z * cw + x], cc[z * cw + x + 1], cc[(z + 1) * cw + x + 1], cc[(z + 1) * cw + x]];
  const mixed = !(c4[0] === c4[1] && c4[1] === c4[2] && c4[2] === c4[3]);
  const eu = !mixed ? ((GB_DETAIL_K.has(t) && GB_DETAIL_K.has(c4[0])) ? c4[0] : t) : -1;
  const fam = (c) => GB_FAM.includes(c);
  const sandHere = mixed ? c4.includes(4) : eu === 4;
  let grassFacingSand = false;
  if (!sandHere && !mixed && fam(eu)) {
    const NB4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dz] of NB4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w.w || nz >= w.h) continue;
      if (w.tiles[nz * w.w + nx] === 4) { grassFacingSand = true; break; }
    }
  }
  let grassNear = mixed ? c4.some(fam) : fam(eu);
  if (sandHere && !grassNear) {
    const NB4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dz] of NB4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w.w || nz >= w.h) continue;
      if (fam(w.tiles[nz * w.w + nx])) { grassNear = true; break; }
    }
  }
  if (!((sandHere && grassNear) || grassFacingSand)) return null;
  const cP = pieces || [{ poly: TILE_SQ, cls: mixed ? -1 : eu }];
  const sandPolys = mixed ? (pieces || []).filter((p) => p.cls === 4).map((p) => p.poly) : (eu === 4 ? [TILE_SQ] : []);
  if (!sandPolys.length && !grassFacingSand) return null;
  const segs = sandSegsFromChords(cP, chords || [], GB_FAM, 0, 0);
  const edge = { n: false, s: false, w: false, e: false };
  const NBE = [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']];
  for (const [dx, dz, key] of NBE) {
    const nx = x + dx, nz = z + dz;
    let nPieces = null;
    if (nx >= 0 && nz >= 0 && nx < w.w && nz < w.h) {
      const nt = w.tiles[nz * w.w + nx];
      const ns = splitDryTile(w, facade, nx, nz, nt);
      nPieces = ns ? ns.pieces : [{ poly: TILE_SQ, cls: nt }];
    }
    const runs = sandSegsFromEdge(cP, nPieces, key, GB_FAM, dx * 2, dz * 2);
    if (runs.length) edge[key] = true;
    segs.push(...runs);
  }
  if (!segs.length) return null;
  return { segs, sandPolys, edge };
}

export function triAlpha(builder, a, b, c, col, aa, ab, ac, ua, ub, uc) {
  if (!builder.alphaArr) builder.alphaArr = new Array(builder.count()).fill(1);
  builder.triUV(a, b, c, [0, 1, 0], col, ua, ub, uc);
  builder.alphaArr.push(aa, ab, ac);
}

export function triAlpha3(builder, a, b, c, ca, cb, cc, aa, ab, ac, ua, ub, uc) {
  if (!builder.alphaArr) builder.alphaArr = new Array(builder.count()).fill(1);
  builder.triUV3(a, b, c, [0, 1, 0], ca, cb, cc, ua, ub, uc);
  builder.alphaArr.push(aa, ab, ac);
}

export function triAlpha3N(builder, a, b, c, na, nb, nc, ca, cb, cc, aa, ab, ac, ua, ub, uc) {
  if (!builder.alphaArr) builder.alphaArr = new Array(builder.count()).fill(1);
  builder.triUV3N(a, b, c, na, nb, nc, ca, cb, cc, ua, ub, uc);
  builder.alphaArr.push(aa, ab, ac);
}

export function makeGoboCanvas(kind, seed) {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const rnd = mulberry32(seed);
  /* Tileable: every mark is stamped at all 9 wrapped offsets so the
     4-tile repeat never cuts a stroke or pit at the sheet edge. */
  const eachWrap = (x, y, fn) => {
    for (let ox = -S; ox <= S; ox += S) {
      for (let oy = -S; oy <= S; oy += S) {
        const wx = x + ox, wy = y + oy;
        if (wx < -16 || wy < -16 || wx > S + 16 || wy > S + 16) continue;
        fn(wx, wy);
      }
    }
  };
  if (kind === "blades") {
    ctx.lineCap = "round";
    for (let i = 0; i < 370; i++) {
      const x = rnd() * S, y = rnd() * S;
      const len = 5 + rnd() * 8;
      const lean = (rnd() - 0.5) * 5;
      const a = 0.45 + rnd() * 0.5;
      const wdt = 1.6 + rnd() * 1.6;
      eachWrap(x, y, (wx, wy) => {
        ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + lean * 0.4, wy - len * 0.6, wx + lean, wy - len);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 85; i++) {
      const x = rnd() * S, y = rnd() * S;
      const r = 0.7 + rnd() * 1.6;
      const a = 0.35 + rnd() * 0.4;
      eachWrap(x, y, (wx, wy) => {
        const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r * 2);
        g.addColorStop(0, "rgba(255,255,255," + a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(wx, wy, r * 2, 0, 6.2832);
        ctx.fill();
      });
    }
  } else {
    for (let i = 0; i < 420; i++) {
      const x = rnd() * S, y = rnd() * S;
      const r = 2.5 + rnd() * 4.5;
      const a = 0.5 + rnd() * 0.45;
      eachWrap(x, y, (wx, wy) => {
        const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
        g.addColorStop(0, "rgba(255,255,255," + a.toFixed(3) + ")");
        g.addColorStop(0.7, "rgba(255,255,255," + (a * 0.45).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, 6.2832);
        ctx.fill();
      });
    }
  }
  void ctx.getImageData(0, 0, 1, 1);
  return cv;
}
