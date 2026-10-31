/* Contour-cut shore tiles (v8 contour pass — exact geometry, no catalog).
 *
 * Every mixed water/land tile is divided by the TRUE waterline contour of
 * its own bilinear corner field (marching-squares topology from corner
 * signs), not by a catalog chord. The user rule this obeys: every cut
 * vertex is a snap node (halves/quarters top-down, quarter crossings in
 * side view), and every triangle connects snap nodes to snap nodes.
 *
 * Conventions (shared with the snap pass and the audit — one function, so
 * the three cannot disagree):
 * - corner order [NW, NE, SE, SW] = bits 0..3 of the mask (bit = LAND =
 *   dry, i.e. h >= thr; wet is strict h < thr, same as everywhere else);
 * - lab units: tile-local [-1,1], center 0,0, second axis south-positive
 *   (same as src/stamps.js). Corners: NW=[-1,-1], NE=[1,-1], SE=[1,1],
 *   SW=[-1,1]. Tile fractions u=(X+1)/2, v=(Z+1)/2;
 * - edge crossings sit at the shared quarterNode() fraction of the edge
 *   (0.25/0.50/0.75 — the side-view snap nodes). The same function targets
 *   the snap solver (world.js#flatSnapWaterline) and rounds contour
 *   crossings here;
 * - contour vertices are drawn at EXACT thr (the height where coast meets
 *   water is exactly where the mesh is cut). Shared edges agree because
 *   both tiles round the same shared corners through the same function to
 *   the same node at the same height;
 * - regular masks are built by a boundary-walk filter, so loop winding is
 *   boundary order and every piece is a convex triangle, quad or pentagon
 *   (fan triangulation is exact — verified per tile by the audit);
 * - saddles (0101/1010) resolve by center sign (mean of corners, strict
 *   wet test, exact equality counts dry): two contour chords, a hexagon
 *   plus two triangles. No center vertex, no FULL fallback;
 * - all loop vertices lie on the 16-node boundary lattice (corners + edge
 *   halves/quarters). There are no interior vertices anywhere.
 *
 * Pure + dependency-free. No DOM. Imported by world.js (quarterNode for
 * snap targets), scene.js (emission) and tilecuts.js (audit).
 */

/* The one rounding rule: an edge-crossing fraction lands on a quarter
 * node. Deterministic total function — fixed boundary choice, so both
 * tiles sharing an edge round identically. */
export function quarterNode(f) {
  if (!(f >= 0)) return 0.25;
  if (!(f <= 1)) return 0.75;
  return f < 0.375 ? 0.25 : f < 0.625 ? 0.5 : 0.75;
}

/* Canonical key for a lattice node (exact binary fractions — toFixed is
 * exact here). Shared by renderer and audit for line-membership tests. */
export function nodeKey(p) {
  return p[0].toFixed(3) + "," + p[1].toFixed(3);
}

const LATTICE = new Set([-1, -0.5, 0, 0.5, 1]);

/* True when p is a 16-node boundary lattice point (corner or edge
 * half/quarter). Exact comparison — contourTile only builds such points. */
export function isLatticeNode(p) {
  if (!LATTICE.has(p[0]) || !LATTICE.has(p[1])) return false;
  return Math.abs(p[0]) === 1 || Math.abs(p[1]) === 1;
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // NW, NE, SE, SW

/* Divide one tile by its waterline contour.
 * h00=NW, h10=NE, h11=SE, h01=SW corner heights; thr = waterLevel + 0.04.
 * Returns { mask, saddle, centerWet, land: [loops], water: [loops],
 * line: [contour nodes] }. Interior masks return one side empty (caller
 * draws FULL). Total function — never throws, never returns null. */
export function contourTile(h00, h10, h01, h11, thr) {
  const H = [h00, h10, h11, h01]; // index = corner bit (NW,NE,SE,SW)
  const dry = H.map((h) => h >= thr);
  let mask = 0;
  for (let i = 0; i < 4; i++) if (dry[i]) mask |= 1 << i;
  const out = { mask, saddle: false, centerWet: false, land: [], water: [], line: [] };
  if (mask === 15 || mask === 0) return out;
  /* Edge crossings from the tile's own corners (same linear solve the snap
   * pass inverts). Clamp guards float spill; every straddling edge of a
   * mixed mask strictly straddles, so f lands in (0,1) and rounds to a
   * quarter node — never a corner. */
  const cross = (a, b, at) => {
    if ((a < thr) === (b < thr)) return null;
    let f = (thr - a) / (b - a);
    if (!(f > 0)) f = 1e-9;
    if (!(f < 1)) f = 1 - 1e-9;
    const q = quarterNode(f);
    return at(q);
  };
  const nX = cross(h00, h10, (q) => [2 * q - 1, -1]);
  const eX = cross(h10, h11, (q) => [1, 2 * q - 1]);
  const sX = cross(h01, h11, (q) => [2 * q - 1, 1]);
  const wX = cross(h00, h01, (q) => [-1, 2 * q - 1]);
  const NW = CORNERS[0], NE = CORNERS[1], SE = CORNERS[2], SW = CORNERS[3];
  if (mask === 0b0101 || mask === 0b1010) {
    /* Saddle: the bilinear contour is a hyperbola with two branches — two
     * disjoint chords, paired by the center sign (the asymptotic decider).
     * The hexagon is the square minus two opposite corner triangles, hence
     * convex. */
    out.saddle = true;
    const c = (h00 + h10 + h01 + h11) / 4;
    out.centerWet = c < thr;
    out.line = [nX, eX, sX, wX];
    if (mask === 0b0101) {
      // NW + SE dry; NE + SW wet.
      if (out.centerWet) {
        out.land = [[NW, nX, wX], [SE, eX, sX]];
        out.water = [[nX, NE, eX, sX, SW, wX]];
      } else {
        out.water = [[NE, eX, nX], [SW, wX, sX]];
        out.land = [[NW, nX, eX, SE, sX, wX]];
      }
    } else {
      // NE + SW dry; NW + SE wet.
      if (out.centerWet) {
        out.land = [[NE, nX, eX], [SW, sX, wX]];
        out.water = [[eX, SE, sX, wX, NW, nX]];
      } else {
        out.water = [[SE, eX, sX], [NW, wX, nX]];
        out.land = [[NE, eX, sX, SW, wX, nX]];
      }
    }
    return out;
  }
  /* Regular mask: walk the boundary once, dealing each vertex to its side.
   * Crossings sit between their corners in walk order, so both loops come
   * out in boundary order — convex triangle/quad/pentagon pieces. */
  const walk = [NW, nX, NE, eX, SE, sX, SW, wX];
  const isCross = (p) => p !== NW && p !== NE && p !== SE && p !== SW;
  const land = [], water = [];
  for (const p of walk) {
    if (!p) continue;
    if (isCross(p)) { land.push(p); water.push(p); continue; }
    const ci = p === NW ? 0 : p === NE ? 1 : p === SE ? 2 : 3;
    (dry[ci] ? land : water).push(p);
  }
  out.land = [land];
  out.water = [water];
  out.line = walk.filter((p) => p && isCross(p));
  return out;
}

/* Height lookup shared by renderer and audit: contour-line vertices sit
 * at exactly thr, everything else bilinear. Both sides build it from the
 * same contour, so edge geometry agrees exactly. */
export function contourHeightOf(contour, gy, thr) {
  const line = new Set(contour.line.map(nodeKey));
  return (p) => (line.has(nodeKey(p)) ? thr : gy((p[0] + 1) / 2, (p[1] + 1) / 2));
}

/* Class-boundary partition (v10 class cuts — exact geometry, no catalog).
 *
 * Splits one convex lattice loop (tile-local lab coords: the full square
 * for dry tiles, one contour land loop for shore tiles) along its
 * class boundaries into single-class convex pieces. clsOf maps each
 * loop vert's nodeKey to a class id, or null for classless verts
 * (waterline nodes, edge midpoints). mids are the tile-edge midpoints
 * where the tile's dry corners change class, in loop-boundary order
 * (caller-filtered to this loop); extra chord endpoints may be any loop
 * verts (dry corners first, waterline nodes last).
 *
 * Every chord joins two boundary lattice nodes, so convex splits
 * introduce no new verts except chord endpoints already on the boundary
 * — everything stays corners, edge midpoints and waterline nodes, and
 * every triangle downstream connects snap nodes to snap nodes. Shared
 * tile edges carry only corners and midpoints, derived from the shared
 * corner classes through this same function, so neighbours agree by
 * construction. Interior routing may differ per tile, but interior
 * verts are tile-local: both adjacent pieces of a split share the
 * chord's own refs, so no crack can open.
 *
 * Deterministic total function. Returns { pieces: [{poly, cls}],
  * splits, fallbacks }: fallbacks (mixed piece with no valid chord) paint
  * the tile class; still exact geometry, counted loudly. chords lists
  * the routed boundary segments ([A, B] lab refs) for the mix overlay. */
export function splitClassPieces(poly, clsOf, mids, tileCls, inheritCls = null) {
  const stats = { splits: 0, fallbacks: 0 };
  const pieces = [];
  const keyOf = (p) => nodeKey(p);
  const classOf = (p) => {
    const c = clsOf.get(keyOf(p));
    return c == null ? null : c;
  };
  const distinctIn = (pl) => {
    const s = new Set();
    for (const p of pl) {
      const c = classOf(p);
      if (c != null) s.add(c);
    }
    return s;
  };
  /* Boundary node sequence: poly verts in order with the usable mids
   * spliced onto their edges (a mid belongs to exactly one loop edge —
   * callers pass tile-edge midpoints, which sit on tile edges, and all
   * loop edges are either tile edges or waterline chords). */
  const boundaryNodes = (pl, md) => {
    const seq = [];
    for (let i = 0; i < pl.length; i++) {
      const A = pl[i], B = pl[(i + 1) % pl.length];
      seq.push({ p: A, kind: classOf(A) != null ? "corner" : "line" });
      for (const M of md) {
        /* A mid coinciding with a loop vert is that vert (a waterline
           node can sit exactly on a tile-edge midpoint): splicing it
           again would duplicate the node and corrupt the chord search. */
        if (keyOf(M) === keyOf(A) || keyOf(M) === keyOf(B)) continue;
        if (onSegment(M, A, B)) seq.push({ p: M, kind: "mid" });
      }
    }
    return seq;
  };
  const adjacent = (a, b, n) => {
    const d = Math.abs(a - b);
    return d === 1 || d === n - 1;
  };
  /* Split a convex poly along the chord between its own verts ia, ib
   * (by index, non-adjacent): both pieces keep parent winding, share the
   * chord's refs, stay convex. Null when the chord is degenerate. */
  const splitChord = (pl, ia, ib) => {
    const n = pl.length;
    if (ia === ib || adjacent(ia, ib, n)) return null;
    const A = [], B = [];
    for (let i = ia; ; i = (i + 1) % n) {
      A.push(pl[i]);
      if (i === ib) break;
    }
    for (let i = ib; ; i = (i + 1) % n) {
      B.push(pl[i]);
      if (i === ia) break;
    }
    if (A.length < 3 || B.length < 3) return null;
    return [A, B];
  };
  const scoreChord = (seq, ia, ib) => {
    /* Isolation first (a chord isolating a single-class side is the
     * honest boundary), chord honesty second: mid-mid, then mid-corner,
     * then corner-corner; waterline-node chords last (they run the line
     * into the water). Ties break by index order (deterministic). A side
     * with no dry corners is a water-only sliver the water split owns —
     * never a useful chord. Returns Infinity when unusable. */
    if (keyOf(seq[ia].p) === keyOf(seq[ib].p)) return Infinity;
    const ka = seq[ia].kind, kb = seq[ib].kind;
    const tier = (ka === "mid" && kb === "mid") ? 0 :
      (ka === "mid" || kb === "mid") ? 1 :
      (ka === "corner" && kb === "corner") ? 2 : 3;
    const n = seq.length;
    const arc = (a, b) => {
      const s = new Set();
      for (let i = a; ; i = (i + 1) % n) {
        const c = seq[i].kind === "corner" ? classOf(seq[i].p) : null;
        if (c != null) s.add(c);
        if (i === b) break;
      }
      return s;
    };
    const sa = arc(ia, ib), sb = arc(ib, ia);
    if (!sa.size || !sb.size) return Infinity;
    const iso = Math.min(sa.size, sb.size);
    return iso * 8 + tier;
  };
  const midsOn = (pl, md) => md.filter((M) => {
    for (let i = 0; i < pl.length; i++) {
      if (onSegment(M, pl[i], pl[(i + 1) % pl.length])) return true;
    }
    return false;
  });
  let guard = 0;
  const chords = [];
  const work = [{ pl: poly.slice(), md: mids.slice(), label: inheritCls }];
  while (work.length) {    if (++guard > 64) {
      const w = work.pop();
      pieces.push({ poly: w.pl, cls: w.label ?? tileCls });
      stats.fallbacks++;
      continue;
    }
    const { pl, md, label } = work.pop();
    const dist = distinctIn(pl);
    if (dist.size <= 1) {
      pieces.push({ poly: pl, cls: dist.size ? [...dist][0] : (label ?? tileCls) });
      continue;
    }
    const usable = midsOn(pl, md);
    const seq = boundaryNodes(pl, usable);
    let best = null, bestScore = Infinity;
    for (let ia = 0; ia < seq.length; ia++) {
      for (let ib = ia + 1; ib < seq.length; ib++) {
        if (adjacent(ia, ib, seq.length)) continue;
        const s = scoreChord(seq, ia, ib);
        if (s < bestScore) {
          bestScore = s;
          best = [seq[ia].p, seq[ib].p];
        }
      }
    }
    if (!best) {
      pieces.push({ poly: pl, cls: tileCls });
      stats.fallbacks++;
      continue;
    }
    /* Map chord endpoints back to poly indices (spliced mids are not
     * poly verts yet: insert them on their edge so the chord has real
     * endpoints — binary-exact halves, the same doubles both tiles
     * compute, so neighbours agree). */
    const idxOf = (P) => pl.findIndex((q) => keyOf(q) === keyOf(P));
    const insertMid = (M) => {
      for (let i = 0; i < pl.length; i++) {
        if (onSegment(M, pl[i], pl[(i + 1) % pl.length]) && keyOf(pl[i]) !== keyOf(M) && keyOf(pl[(i + 1) % pl.length]) !== keyOf(M)) {
          pl.splice(i + 1, 0, M);
          return;
        }
      }
    };
    if (idxOf(best[0]) < 0) insertMid(best[0]);
    const ia = idxOf(best[0]);
    if (idxOf(best[1]) < 0) insertMid(best[1]);
    const ib = idxOf(best[1]);
    const parts = (ia >= 0 && ib >= 0) ? splitChord(pl, ia, ib) : null;
    if (!parts) {
      pieces.push({ poly: pl, cls: tileCls });
      stats.fallbacks++;
      continue;
    }
    stats.splits++;
    chords.push([best[0], best[1]]);
    for (const part of parts) {
      work.push({ pl: part, md: usable.slice(), label });
    }
  }
  /* No T-junctions: every tile-edge midpoint on a piece's boundary
   * becomes a vert of that piece — even where no chord routed through
   * it. Both tiles sharing the edge derive the same midpoint from the
   * same corner classes and splice it the same way, so the shared edge
   * carries the identical vertex set at identical heights from both
   * sides (collinear splices fan into zero-area tris both sides skip
   * at the same 1e-12 threshold — no pixels, no seam). */
  for (const piece of pieces) {
    const pl = piece.poly;
    for (const M of mids) {
      if (pl.some((q) => keyOf(q) === keyOf(M))) continue;
      for (let i = 0; i < pl.length; i++) {
        if (onSegment(M, pl[i], pl[(i + 1) % pl.length])) {
          pl.splice(i + 1, 0, M);
          break;
        }
      }
    }
  }
  return { pieces, splits: stats.splits, fallbacks: stats.fallbacks, chords };
}

/* Decorative cut ornament (v32g — user: no grass|sand straight longer
   than 2x the tile-quad hypotenuse, smoothed with decorative cuts).
   Render-level ONLY (tiles, census, walkability and every audit stay
   exact — the audit never calls this): tile-edge midpoints on dry
   grass|sand edges slide laterally ±0.15 tile with alternating
   2-tile wavelength, so every rendered chord chain zigzags (longest
   straight ≈ 0.7 tile, axis and diagonal alike). Applied per
   splitClassPieces call via ornamentPieces, in place on the call's
   private mid objects (fresh _classMids per call — every piece and
   chord sharing the ref moves together). Cross-tile agreement by
   construction: edge identity, endpoint classes, dryness and phase
   all derive from shared world arrays + world coords, so both tiles
   compute the identical offset. Scope (v36 rock joins, v8 dirt/crag
   join): one endpoint hard — sand (4), gravel (10), crag (8) or
   dirt (2) — with the other light/dark grass (0/1), plus hard-hard
   pairs (the same teeth wherever two hard kinds meet), AND the edge
   above water (both endpoint corners dry —
   the waterline never crosses it, so splitWaterline stays exact
   and the snap regime is untouched; shore tiles qualify on
   their dry edges, which is what makes beach boundaries
   ornament consistently from both sides); marsh pairs keep
   today's cuts, and the grass-grass 0:1 seam stays smooth (the
   approved seamless look). The fourteen ornamented pairs are every
   pair in {0,1,2,4,8,10} with a hard member except 0:1.
   Agreement is verified headless by recomputing both sides of every
   edge (ornEdgeOff is pure and exported for that). */
export const ORN_AMP = 0.3; // lab units (0.15 tile) lateral zigzag
const ORN_DONE = new WeakSet(); // mid objects already slid (loops share one mids array)
/* Local fan-cover check (v32h — same math as stamps.js#fanSafe, which
 * contour.js must not import under its dependency-free discipline):
 * the fan from the first (rewound) vertex covers exactly the loop
 * area. Ornament kinks revert when this fails, so the renderer never
 * bails an ornamented tile to FULL while the audit keeps pieces. */
function polyFanCovers(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const b = poly[(i + 1) % poly.length];
    a += poly[i][0] * b[1] - b[0] * poly[i][1];
  }
  a /= 2;
  const vs = a > 0 ? poly.slice().reverse() : poly;
  const ax = vs[0][0], az = vs[0][1];
  let s = 0;
  for (let i = 1; i + 1 < vs.length; i++) {
    const B = vs[i], C = vs[i + 1];
    s += Math.abs((B[0] - ax) * (C[1] - az) - (C[0] - ax) * (B[1] - az)) / 2;
  }
  return Math.abs(s - Math.abs(a)) < 1e-9;
}
export function ornEdgeOff(w, x, z, mx, mz) {
  // (mx,mz) = lab edge-mid of tile (x,z). Returns [dx,dz] or null.
  const hE = (mz === 1 || mz === -1) && mx === 0;
  const vE = (mx === 1 || mx === -1) && mz === 0;
  if (!hE && !vE) return null;
  const W = w.w, H = w.h, cw = w.cw;
  const thr = w.waterLevel + 0.04;
  const hAt = (cx, cz) => (cx < 0 || cz < 0 || cx > W || cz > H) ? -Infinity : w.corner[cz * cw + cx];
  const cAt = (cx, cz) => (cx < 0 || cz < 0 || cx > W || cz > H) ? -1 : w.cornerCls[cz * cw + cx];
  let ex0, ez0, ex1, ez1;
  if (hE) {
    const wz = z + (mz + 1) / 2;
    ex0 = x; ez0 = wz; ex1 = x + 1; ez1 = wz;
  } else {
    const wx = x + (mx + 1) / 2;
    ex0 = wx; ez0 = z; ex1 = wx; ez1 = z + 1;
  }
  if (hAt(ex0, ez0) < thr || hAt(ex1, ez1) < thr) return null;
  const ca = cAt(ex0, ez0), cb = cAt(ex1, ez1);
  /* v36 rock pairs + v8 ground kinds: one endpoint sand (4),
     gravel (10), crag (8) or dirt (2), the other light/dark grass
     (0/1) — every hard-kind edge gets the same teeth as grass+sand.
     Marsh pairs stay unornamented (same scope line the grass+sand
     pair always had). */
  const okA = (c) => c === 4 || c === 10 || c === 8 || c === 2;
  const okB = (c) => c === 0 || c === 1;
  const ok = (okA(ca) && okB(cb)) || (okA(cb) && okB(ca));
  if (!ok) return null;
  /* Alternation key: world-mid coordinate SUM parity. Single-axis
     steps always flip it (axis runs zigzag); diagonal same-type
     steps would not — but those cannot occur on one boundary
     (a diagonal always alternates h/v edges, whose offset AXES
     differ, so staircases zigzag whatever the signs). */
  const mwx = x + (hE ? 0.5 : (mx + 1) / 2), mwz = z + (hE ? (mz + 1) / 2 : 0.5);
  const s = ((Math.floor(mwx) + Math.floor(mwz)) % 2 + 2) % 2 === 0 ? 1 : -1;
  return hE ? [0, s * ORN_AMP] : [s * ORN_AMP, 0];
}
/* Dress-isoline regions (phase d — the dress CUT): marching squares
 * over the four corner savannah weights at 0.5, so the tint melt
 * follows the biome contour instead of the quad diagonal. Returns
 * loops in quad rotational order (P0 SW, P1 SE, P2 NE, P3 NW — the
 * flat quad's facing convention), or null when the dress is
 * unanimous (no straddle). The 2-vs-2 diagonal saddle pairs by the
 * center weight, mirroring contourTile's center-sign rule: two
 * corner triangles + hexagon, no center vertex. Crossing fractions
 * are linear along edges, so both tiles sharing an edge compute the
 * identical point. Pure. */
export function dressRegions(sw, centerW) {
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const above = sw.map((v) => v >= 0.5);
  const n = above.filter(Boolean).length;
  if (n === 0 || n === 4) return null;
  const cross = (A, B) => {
    const a = sw[A], b = sw[B];
    if ((a >= 0.5) === (b >= 0.5)) return null;
    const f = (0.5 - a) / (b - a);
    return [P[A][0] + (P[B][0] - P[A][0]) * f, P[A][1] + (P[B][1] - P[A][1]) * f];
  };
  const X = [cross(0, 1), cross(1, 2), cross(2, 3), cross(3, 0)];
  const xi = [0, 1, 2, 3].filter((e) => X[e]);
  if (xi.length === 2) {
    // two boundary runs: corners from one crossing to the next, inclusive
    const runs = [];
    for (let r = 0; r < 2; r++) {
      const a = xi[r], b = xi[(r + 1) % 2];
      const corners = [];
      for (let k = (a + 1) % 4; ; k = (k + 1) % 4) {
        corners.push(P[k]);
        if (k === b) break;
      }
      runs.push({ from: X[a], to: X[b], corners });
    }
    return runs.map((run) => [run.from, ...run.corners, run.to]);
  }
  // saddle: 4 crossings — isolate the two off-center-side corners as
  // triangles, join the center side through the hexagon (the forward
  // boundary minus the isolated corners; chords shared
  // endpoint-to-endpoint with the triangles: same segments, opposite
  // directions — no crack, no overlap).
  const savSide = centerW >= 0.5;
  const loops = [];
  for (let i = 0; i < 4; i++) {
    if (above[i] !== savSide) loops.push([X[(i + 3) % 4], P[i], X[i]]);
  }
  const hex = [];
  for (let i = 0; i < 4; i++) {
    if (above[i] === savSide) hex.push(P[i]);
    hex.push(X[i]);
  }
  loops.push(hex);
  return loops;
}
/* Weight-triangle split (phase e — dress cut inside class pieces): split
 * the triangle (A,B,C) with corner weights (wa,wb,wc) along the 0.5
 * isoline. Returns 1 triangle (no straddle) or 3 (1-vs-2: the single-
 * side corner triangle + the quad split in two). Crossing fractions
 * are linear in the endpoint weights — the same convention as
 * dressRegions#cross, so a crossing on a tile edge shared with a
 * dress-cut neighbour lands on the identical point. Rotation is
 * cyclic only (never swaps), so every emitted triangle keeps the
 * parent's orientation. A crossing landing exactly on a vertex yields
 * a zero-area triangle the caller skips (same 1e-12 rule as the fan
 * loops). Pure. */
export function splitTriByWeight(A, B, C, wa, wb, wc) {
  const s = [wa >= 0.5, wb >= 0.5, wc >= 0.5];
  const n = (s[0] ? 1 : 0) + (s[1] ? 1 : 0) + (s[2] ? 1 : 0);
  if (n === 0 || n === 3) return [[A, B, C]];
  let P = [A, B, C], W = [wa, wb, wc], S = s;
  if (n === 1) {
    while (!S[0]) { P = [P[1], P[2], P[0]]; W = [W[1], W[2], W[0]]; S = [S[1], S[2], S[0]]; }
  } else {
    while (S[0]) { P = [P[1], P[2], P[0]]; W = [W[1], W[2], W[0]]; S = [S[1], S[2], S[0]]; }
  }
  const f1 = (0.5 - W[0]) / (W[1] - W[0]), f2 = (0.5 - W[0]) / (W[2] - W[0]);
  const X1 = [P[0][0] + (P[1][0] - P[0][0]) * f1, P[0][1] + (P[1][1] - P[0][1]) * f1];
  const X2 = [P[0][0] + (P[2][0] - P[0][0]) * f2, P[0][1] + (P[2][1] - P[0][1]) * f2];
  return [[P[0], X1, X2], [X1, P[1], P[2]], [X1, P[2], X2]];
}
/* Slid-mid height pin (v34 — kills the 1px ocean pinholes). The
 * ornament slides edge-mids laterally (±ORN_AMP) but each tile
 * extrapolated the slid point's HEIGHT bilinearly from its OWN
 * corners — and the two tiles sharing the edge extrapolate
 * DIFFERENTLY (different far corners), opening a vertical seam
 * ribbon between their edge polylines (measured live: Δy=0.0011
 * on (10,77)S/(10,78)N) that reads as sparse steel-blue dots at
 * oblique pitch. The pin recovers the UNSLID lattice mid for a
 * slid point (null for everything else: corners, kink Ms,
 * waterline nodes, unslid mids) so both tiles evaluate the
 * edge-corner-only interpolation — bitwise-identical heights,
 * seam closed. XZ/UV/color/alpha stay slid (the zigzag look is
 * untouched); only the Y lookup is pinned. 1e-9 tolerance absorbs
 * lab→tile→lab float round-trips in the gobo cell path. */
export function ornHeightLab(w, x, z, P) {
  const RX = Math.round(P[0]), RZ = Math.round(P[1]);
  const hE = (RZ === 1 || RZ === -1) && RX === 0;
  const vE = (RX === 1 || RX === -1) && RZ === 0;
  if (!hE && !vE) return null;
  const o = ornEdgeOff(w, x, z, RX, RZ);
  if (!o) return null;
  if (Math.abs(P[0] - (RX + o[0])) > 1e-9 || Math.abs(P[1] - (RZ + o[1])) > 1e-9) return null;
  return [RX, RZ];
}
export function ornamentPieces(w, x, z, pieces, mids, chords, clsOf, canSlide) {
  if (!w || !w.cornerCls || !w.corner) return 0;
  const set = new Set(mids); // reference identity: spliced mids only (never waterline lookalikes)
  let n = 0;
  for (const part of pieces) {
    for (const P of part.poly) {
      if (!set.has(P) || ORN_DONE.has(P)) continue;
      const o = ornEdgeOff(w, x, z, P[0], P[1]);
      if (o && (!canSlide || canSlide(P))) { P[0] += o[0]; P[1] += o[1]; ORN_DONE.add(P); n++; }
    }
  }
  /* Corner-corner chords (tile diagonals): no edge midpoint rides
     them, and mid–mid / mid–corner chords route most tile staircases,
     so long axis runs through tile centers would render straight
     without this (measured live: a vertical 0:4 boundary sat at
     x=10.5 exact over 5 tiles — edge-mid slides run ALONG such
     chords, never across them). Split EVERY ornamented-pair boundary
     chord at its midpoint, kinked laterally ±ORN_AMP by hash phase
     (tile-interior: no cross-tile sharing, determinism only — but
     magnitude is always full, so every chord kinks and no straight
     longer than one chord-half (~0.7 tile max) can survive, axis
     and diagonal alike). Chord endpoints must be corners or this
     tile's edge mids (identity: splitClassPieces splices the same
     refs) — anything else is a waterline node, and the waterline
     stays exact. A kink that breaks the fan cover reverts (same
     math as fanSafe, local: contour.js stays dependency-free), so
     the renderer never bails an ornamented tile to FULL while the
     audit keeps pieces. The chords list is rewritten to its halves
     so chord consumers (detail bounds) follow the kink. */
  if (chords && clsOf) {
    const thr = w.waterLevel + 0.04, cw = w.cw, W = w.w, H = w.h;
    const cornerH = (cx, cz) => (cx < 0 || cz < 0 || cx > W || cz > H) ? -Infinity : w.corner[cz * cw + cx];
    // Bilinear field dryness at a lab point (corners exact, mids genuine).
    const dryLab = (X, Z) => {
      const u = (X + 1) / 2, v = (Z + 1) / 2;
      const h = cornerH(x, z) * (1 - u) * (1 - v) + cornerH(x + 1, z) * u * (1 - v) +
        cornerH(x, z + 1) * (1 - u) * v + cornerH(x + 1, z + 1) * u * v;
      return h > thr + 1e-9;
    };
    const kinkable = (P) => {
      if (Math.abs(P[0]) === 1 && Math.abs(P[1]) === 1) return true;
      for (const M of mids) if (M === P) return true;
      return false;
    };
    for (let ci = 0; ci < chords.length; ci++) {
      const [A, B] = chords[ci];
      if (!kinkable(A) || !kinkable(B)) continue;
      const sides = new Set(chordSides([A, B], pieces));
      /* v36 rock pairs + v8 dirt/crag pairs kink exactly like
         grass+sand — every pair in {0,1,2,4,8,10} with a hard member
         (2, 4, 8, 10) kinks except the grass-grass 0:1 seam; marsh 9
         and water 5 never qualify (same scope line as the slides). */
      if (sides.size !== 2) continue;
      const inSet = (c) => c === 0 || c === 1 || c === 2 || c === 4 || c === 8 || c === 10;
      const isHard = (c) => c === 2 || c === 4 || c === 8 || c === 10;
      const [pA, pB] = [...sides].sort((a, b) => a - b);
      if (!(inSet(pA) && inSet(pB)) || !(isHard(pA) || isHard(pB))) continue;
      if (pA === 0 && pB === 1) continue;
      if (!dryLab(A[0], A[1]) || !dryLab(B[0], B[1])) continue;
      const kA = nodeKey(A), kB = nodeKey(B);
      const F = kA < kB ? A : B, Tt = kA < kB ? B : A;
      const dx = Tt[0] - F[0], dz = Tt[1] - F[1];
      const len = Math.hypot(dx, dz) || 1;
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      if (!dryLab(M[0], M[1])) continue;
      const mwx = x + (M[0] + 1) / 2, mwz = z + (M[1] + 1) / 2;
      const s0 = _hash2i(Math.floor(mwx * 4), Math.floor(mwz * 4)) < 0.5 ? 1 : -1;
      const nx = -dz / len, nz = dx / len;
      const touched = [];
      const spliceIn = () => {
        touched.length = 0;
        for (const part of pieces) {
          const pl = part.poly;
          for (let i = 0; i < pl.length; i++) {
            const P = pl[i], Q = pl[(i + 1) % pl.length];
            if ((P === A && Q === B) || (P === B && Q === A)) { pl.splice(i + 1, 0, M); touched.push(part); break; }
          }
        }
      };
      const spliceOut = () => {
        for (const part of touched) {
          const pl = part.poly, ix = pl.indexOf(M);
          if (ix >= 0) pl.splice(ix, 1);
        }
      };
      const covers = () => {
        if (!touched.length) return false;
        for (const part of touched) if (!polyFanCovers(part.poly)) return false;
        return true;
      };
      // Fan-cover guard (see polyFanCovers): hash side first, then the
      // mirror — a kink either side breaks every straight, so take
      // whichever the fan covers; revert only when neither fits.
      M[0] += nx * s0 * ORN_AMP;
      M[1] += nz * s0 * ORN_AMP;
      spliceIn();
      if (!covers()) {
        spliceOut();
        M[0] -= 2 * nx * s0 * ORN_AMP;
        M[1] -= 2 * nz * s0 * ORN_AMP;
        spliceIn();
        if (!covers()) { spliceOut(); continue; }
      }
      chords.splice(ci, 1, [A, M], [M, B]);
      ci++; // skip the first half (its midpoint endpoint is no longer kinkable)
      n++;
    }
  }
  return n;
}

/* True when M lies on segment AB (inclusive, exact for lattice nodes —
 * midpoints are binary-exact halves of lattice endpoints). */
function onSegment(M, A, B) {
  const cross = (B[0] - A[0]) * (M[1] - A[1]) - (B[1] - A[1]) * (M[0] - A[0]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (M[0] - A[0]) * (B[0] - A[0]) + (M[1] - A[1]) * (B[1] - A[1]);
  if (dot < -1e-9) return false;
  const len2 = (B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1]);
  return dot <= len2 + 1e-9;
}

/* Mix-overlay band geometry (v14 trial, pure, shared by scene + audit).
 * The band is the ±w strip around chord AB, clipped to one class piece
 * (convex in, convex out), so strips never leave their tile: only verts
 * landing ON a tile edge are shared, everything else is tile-local.
 * Alpha orients +side to 1: bandAlpha is 0.5 + s/(2w), clamped. */
export function bandFrame(A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return null;
  return { A, ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len };
}

export function bandAlpha(P, fr, w, sigma) {
  const s = (P[0] - fr.A[0]) * fr.nx + (P[1] - fr.A[1]) * fr.ny;
  const a = 0.5 + sigma * s / (2 * w);
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

/* One-sided bleed alpha (v16, pure, shared by scene + audit). The source
 * texture is drawn over the far flank only: 1 at the chord, falling to 0
 * at distance w into the flank. v17d: LINEAR falloff, not smoothstep.
 * Gouraud interpolation reproduces a linear field exactly at any
 * tessellation, so wide tile-sized strips show no creases; smoothstep
 * values sampled at sparse fan verts interpolated linearly instead —
 * dark faceted triangles wherever strips grew big. Ends stay exact
 * (1 invisible at the chord, 0 invisible far out). */
export function bandAlphaOne(P, fr, w, side) {
  const s = (P[0] - fr.A[0]) * fr.nx + (P[1] - fr.A[1]) * fr.ny;
  const t = 1 - side * s / w;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function polyContains(poly, P) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > P[1]) !== (yj > P[1])) && (P[0] < (xj - xi) * (P[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function clipHalf(poly, sOf, bound, keep) {
  const out = [];
  const n = poly.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const P = poly[i], Q = poly[(i + 1) % n];
    const sp = sOf(P) - bound, sq = sOf(Q) - bound;
    const inp = keep < 0 ? sp <= 1e-12 : sp >= -1e-12;
    const inq = keep < 0 ? sq <= 1e-12 : sq >= -1e-12;
    if (inp) out.push(P);
    if (inp !== inq) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}

/* The ±w strip of chord AB clipped to poly (convex); the caller emits
 * it as overlay. Only the mid part is returned: sides stay purely
 * opaque ground. */
export function bandStrip(poly, A, B, w) {
  const fr = bandFrame(A, B);
  if (!fr) return { mid: [], fr: null };
  const sOf = (P) => (P[0] - A[0]) * fr.nx + (P[1] - A[1]) * fr.ny;
  return { mid: clipHalf(clipHalf(poly, sOf, w, -1), sOf, -w, 1), fr };
}

/* One-sided strip (v16d, pure, shared by scene + audit): chord to +w on
 * the far flank, plus a small overlap `over` past the chord onto the
 * source side. The overlap draws the source texture at alpha 1 over
 * source ground (texel-identical, invisible) and moves the strip's cut
 * edge off the visible boundary, so any chord-edge sliver or seam hides
 * where it cannot show. side is +1 on the +normal flank, -1 below it.
 * v16e: the overlap is ALSO freed from the piece clip (tile-clipped
 * near band). The far piece's own edge can end hair-short of the chord
 * (splice epsilon), and a piece-clipped overlap never reaches past it —
 * leaving a bare-sand sliver between wash and grass that reads as a
 * pale dotted hairline (convex blends can never EMIT paler-than-both,
 * so the line had to be uncovered substrate). Returns { mid, near }:
 * the piece-clipped far wash plus the tile-clipped ±over near band. */
export function bandStripOne(poly, A, B, w, side, over, tilePoly) {
  const fr = bandFrame(A, B);
  if (!fr) return { mid: [], near: [], fr: null };
  const sOf = (P) => (P[0] - A[0]) * fr.nx + (P[1] - A[1]) * fr.ny;
  const mid = side > 0
    ? clipHalf(clipHalf(poly, sOf, w, -1), sOf, -over, 1)
    : clipHalf(clipHalf(poly, sOf, over, -1), sOf, -w, 1);
  const near = clipHalf(clipHalf(tilePoly, sOf, over, -1), sOf, -over, 1);
  return { mid, near, fr };
}

/* Grass overlayment cells (v19, pure, shared by scene + audit; v21
 * clips instead of dropping). The tile square [0,1]^2 is split into an
 * n*n grid; each subcell square is clipped against the (convex) grass
 * pieces and the surviving polygon is emitted as a fan — paint bleeds
 * EXACTLY to every grass edge (chords and grass-facing tile borders),
 * never past it. Alpha is strength * the distance ramp past `inset`
 * (the overlay's OWN fade channel: 0 on the boundary itself, full
 * `ramp` tiles inside; the global material opacity is the second
 * channel). v21 sets inset 0: the fade — not a geometry margin — does
 * the transition work. Vertex order out is vertex order in (the cell
 * square's), so the emitter's flipped-triplet fan stays up-facing. */
export function segDist(P, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return Math.hypot(P[0] - A[0], P[1] - A[1]);
  let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(P[0] - (A[0] + dx * t), P[1] - (A[1] + dy * t));
}
const ss01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
/* Winding-independent convex clip of subject against clipPoly (v21 as
 * the detailCells closure, top-level since v23): inside is whichever
 * side of each edge holds the clip polygon's centroid (splitter loops
 * are convex; a degenerate zero-area clip matches nothing and
 * contributes nothing). Built on clipHalf, which carries the 1e-12
 * edge tolerance. */
export function clipConvex(subject, clipPoly) {
  let cx = 0, cz = 0;
  for (const P of clipPoly) { cx += P[0]; cz += P[1]; }
  cx /= clipPoly.length; cz /= clipPoly.length;
  let out = subject;
  for (let e = 0; e < clipPoly.length && out.length; e++) {
    const A = clipPoly[e], B = clipPoly[(e + 1) % clipPoly.length];
    const ex = B[0] - A[0], ez = B[1] - A[1];
    if (ex * ex + ez * ez < 1e-24) continue;
    const sOf = (P) => (P[0] - A[0]) * ez - (P[1] - A[1]) * ex;
    const sC = sOf([cx, cz]);
    if (Math.abs(sC) < 1e-12) return [];
    out = clipHalf(out, sOf, 0, sC < 0 ? -1 : 1);
  }
  return out;
}
/* Clip-output scrub (v21 inline, top-level since v23): S-H emits a
 * vertex AND an intersection when an edge endpoint sits exactly on a
 * chord, plus collinear runs along straight clip edges — both leave
 * duplicate/collinear consecutive verts whose fan triplets have exactly
 * zero area (cross = 0, not up-facing). Returns the cleaned polygon,
 * or [] when fewer than 3 verts or < 1e-9 area survive. The cyclic
 * order survives. */
export function scrubPoly(poly) {
  const cl = [];
  for (const P of poly) {
    const L = cl[cl.length - 1];
    if (!L || Math.hypot(P[0] - L[0], P[1] - L[1]) > 1e-9) cl.push(P);
  }
  if (cl.length > 1) {
    const F = cl[0], L = cl[cl.length - 1];
    if (Math.hypot(F[0] - L[0], F[1] - L[1]) <= 1e-9) cl.pop();
  }
  let changed = true;
  while (changed && cl.length > 3) {
    changed = false;
    for (let i = 0; i < cl.length; i++) {
      const A = cl[(i + cl.length - 1) % cl.length], B = cl[i], C = cl[(i + 1) % cl.length];
      const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (Math.abs(cr) < 1e-12) { cl.splice(i, 1); changed = true; break; }
    }
  }
  if (cl.length < 3) return [];
  let s = 0;
  for (let i = 0; i < cl.length; i++) {
    const P = cl[i], Q = cl[(i + 1) % cl.length];
    s += P[0] * Q[1] - Q[0] * P[1];
  }
  return Math.abs(s / 2) < 1e-9 ? [] : cl;
}
/* Gobo families (v25, extended v26): classes sharing one gobo
 * detail type. The overlay fades only at FAMILY boundaries — the whole
 * grass family (light 0, dark 1, marsh 9) is interior, so the pattern
 * runs across 0:1, 0:9 and 1:9 edges seamlessly (same sheet, same
 * world UVs, no border ramp). Fades survive only toward non-grass
 * (sand, gravel, water). v28: sand (4) stays SOLO on purpose — it
 * gets its own faint pit sheet (world.js#TUT_DETAIL.sand) while its
 * COLOR still dissolve-fades with grass (TUT_DISSOLVE.cls). */
export function goboFam(c) {
  return (c === 0 || c === 1 || c === 9 || c === 16) ? 0 : c;
}
/* Per-class dissolve feather (v28, pure, shared by scene + audit):
 * sand blurs narrower than grass (high contrast needs less width to
 * read); every other dissolve class uses the global feather. Grass
 * fields are therefore bit-identical with or without sand nearby —
 * except where sand weight actually fades in, the approved grass
 * look cannot move. */
export function dissolveFeather(dz, c) {
  if (c === 4) return dz.featherSand ?? dz.feather ?? 4;
  return dz.feather ?? 4;
}
/* Micro-blend distance law (v32d trial, pure, shared by scene +
 * audit): the v14 geometry done right — alpha from GEOMETRIC
 * distance to the sand contour, never from remapped weight fields.
 * (Staircase plateaus in the measured field bottom out near 0.5
 * over whole tiles; no pointwise remap can resolve a sub-tile band
 * there, and sharpening a blurred field just steepens its wide
 * opaque core. Distance has the sub-tile position; the field does
 * not.) d in TRUE TILES: 0.5 at the contour (v14's 0.5-anchored
 * chord) fading to 0 at micro. Peak 0.5 by construction — no
 * opaque core, ever. */
export function dissolveDistAlpha(d, micro) {
  if (!(micro > 0) || !(d < micro)) return 0;
  return 0.5 * (1 - d / micro);
}
/* Dissolve sand pullback (v32j — user: absolutely none of the flat
 * underlay wash may fade in near sand; the gobo strokes keep full
 * reach to the cut). Transparent-wash alpha multiplier from world
 * tile coords: 0 while sand sits within SAND_PULL_DRY tiles,
 * smoothstep to 1 at SAND_PULL_FULL. Pure (tiles + coords only) so
 * scene emission and the audit mirror agree exactly. The opaque
 * base and both gobo sheets ignore it entirely. */
export const SAND_PULL_DRY = 1.0, SAND_PULL_FULL = 2.0;
export function sandPullback(w, wx, wz) {
  const W = w.w, H = w.h, tiles = w.tiles;
  const cx = Math.floor(wx), cz = Math.floor(wz);
  let dmin = Infinity;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const tx = cx + dx, tz = cz + dz;
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) continue;
    if (tiles[tz * W + tx] !== SAND_CLS) continue;
    const d = Math.hypot(tx + 0.5 - wx, tz + 0.5 - wz);
    if (d < dmin) dmin = d;
  }
  if (!(dmin <= SAND_PULL_FULL)) return 1;
  if (dmin <= SAND_PULL_DRY) return 0;
  const t = (dmin - SAND_PULL_DRY) / (SAND_PULL_FULL - SAND_PULL_DRY);
  return t * t * (3 - 2 * t);
}
const SAND_CLS = 4;
/* The non-sand dissolve class of a sand pair, or null: set must be
 * exactly {4, G} with G a non-sand dissolve class. Junctions and
 * same-class meetings return null (caller splits or skips). */
function sandPairOther(set, fam) {
  if (!set.has(SAND_CLS)) return null;
  let g = null;
  for (const c of set) {
    if (c === SAND_CLS) continue;
    if (!fam.includes(c)) return null;
    if (g != null) return null;
    g = c;
  }
  return g;
}
/* Classes of the pieces touching point P (inside, or within 1e-9 of
 * an edge — samples sit exactly on shared boundaries and must see
 * both sides; ray-cast alone is unreliable on-boundary). */
export function pieceClassesAt(pieces, P) {
  const s = new Set();
  for (const p of pieces) {
    if (polyContains(p.poly, P)) { s.add(p.cls); continue; }
    const pl = p.poly;
    for (let i = 0; i < pl.length; i++) {
      if (segDist(P, pl[i], pl[(i + 1) % pl.length]) < 1e-9) { s.add(p.cls); break; }
    }
  }
  return s;
}
/* Sand-contour segments from one tile's split chords (pure): each
 * chord sampled at eighths; consecutive samples seeing exactly one
 * sand pair group into a seg carrying g (the non-sand side class).
 * Junctions split the chord honestly. Endpoints tile-local lab +
 * (ox, oz). Chords carry no class info, so pairs are measured from
 * the pieces (shared rule with the audit). */
export function sandSegsFromChords(pieces, chords, fam, ox, oz) {
  const segs = [];
  for (const ch of chords || []) {
    const [A, B] = ch;
    let run = null;
    const flush = () => {
      if (run && run.pts.length > 1) {
        const P0 = run.pts[0], P1 = run.pts[run.pts.length - 1];
        segs.push({ ax: P0[0] + ox, az: P0[1] + oz, bx: P1[0] + ox, bz: P1[1] + oz, g: run.g });
      }
      run = null;
    };
    for (let k = 1; k <= 7; k++) {
      const S = [A[0] + (B[0] - A[0]) * (k / 8), A[1] + (B[1] - A[1]) * (k / 8)];
      const g = sandPairOther(pieceClassesAt(pieces, S), fam);
      if (g == null || (run && run.g !== g)) flush();
      if (g == null) continue;
      if (!run) run = { g, pts: [[A[0] + (B[0] - A[0]) * ((k - 1) / 8), A[1] + (B[1] - A[1]) * ((k - 1) / 8)]] };
      run.pts.push(S);
    }
    flush();
  }
  return segs;
}
/* Sand-contour segments along ONE tile edge (pure): the shared edge
 * between center pieces and the across-neighbour pieces, in center
 * lab. edge: 'n' (z=−1), 's' (z=+1), 'w' (x=−1), 'e' (x=+1).
 * (ox, oz) maps neighbour tile-local lab to center lab. Null
 * neighbour pieces (wet/absent) contribute nothing — water is
 * exempt. Covers the unanimous-vs-unanimous straight runs, which
 * have no chords anywhere. T-spliced vertex sets coincide, so
 * interval endpoints match; 1e-9 absorbs float dust. */
export function sandSegsFromEdge(cPieces, nPieces, edge, fam, ox, oz) {
  const segs = [];
  if (!nPieces) return segs;
  const horiz = (edge === 'n' || edge === 's');
  const lineV = (edge === 'n' || edge === 'w') ? -1 : 1;
  const runsOf = (pieces, mx, mz) => {
    const runs = [];
    for (const p of pieces) {
      const pl = p.poly;
      for (let i = 0; i < pl.length; i++) {
        const A = [pl[i][0] + mx, pl[i][1] + mz], B = [pl[(i + 1) % pl.length][0] + mx, pl[(i + 1) % pl.length][1] + mz];
        const aL = horiz ? A[1] : A[0], bL = horiz ? B[1] : B[0];
        if (Math.abs(aL - lineV) > 1e-9 || Math.abs(bL - lineV) > 1e-9) continue;
        const aT = horiz ? A[0] : A[1], bT = horiz ? B[0] : B[1];
        if (Math.abs(bT - aT) < 1e-12) continue;
        runs.push({ t0: Math.min(aT, bT), t1: Math.max(aT, bT), cls: p.cls });
      }
    }
    return runs;
  };
  const rc = runsOf(cPieces, 0, 0), rn = runsOf(nPieces, ox, oz);
  const cuts = new Set([-1, 1]);
  for (const r of [...rc, ...rn]) { cuts.add(r.t0); cuts.add(r.t1); }
  const ts = [...cuts].sort((a, b) => a - b);
  const at = (runs, m) => {
    for (const r of runs) if (m >= r.t0 - 1e-9 && m <= r.t1 + 1e-9) return r.cls;
    return null;
  };
  const labPt = (t) => horiz ? [t, lineV] : [lineV, t];
  for (let i = 0; i + 1 < ts.length; i++) {
    const m = (ts[i] + ts[i + 1]) / 2;
    if (m < -1 || m > 1) continue;
    const s = new Set([at(rc, m), at(rn, m)]);
    s.delete(null);
    const g = sandPairOther(s, fam);
    if (g == null) continue;
    const P0 = labPt(ts[i]), P1 = labPt(ts[i + 1]);
    if (Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) < 1e-12) continue;
    segs.push({ ax: P0[0], az: P0[1], bx: P1[0], bz: P1[1], g });
  }
  return segs;
}
/* Chord side classes (v25, pure, shared): the piece classes adjacent
 * to chord [A,B], found by midpoint-on-boundary (T-junction splices
 * can split the chord into collinear runs, so endpoint matching would
 * miss). Returns 0-2+ classes; callers only skip on exactly-2
 * same-family sides (anything else keeps the old bound). */
export function chordSides(chord, pieces) {
  const M = [(chord[0][0] + chord[1][0]) / 2, (chord[0][1] + chord[1][1]) / 2];
  const sides = [];
  for (const p of pieces) {
    const poly = p.poly;
    for (let i = 0; i < poly.length; i++) {
      if (segDist(M, poly[i], poly[(i + 1) % poly.length]) < 1e-9) { sides.push(p.cls); break; }
    }
  }
  return sides;
}
export function detailCells(grassPolys, bounds, n, inset, ramp, strength) {  const insetLab = inset * 2, rampLab = Math.max(ramp * 2, 1e-6);
  const cells = [];
  const distLab = ([X, Z]) => {
    let d = Infinity;
    for (const [A, B] of bounds) {
      const dd = segDist([X, Z], A, B);
      if (dd < d) d = dd;
    }
    return d;
  };
  const toLab = ([u, v]) => [u * 2 - 1, v * 2 - 1];
  const toTile = ([X, Z]) => [(X + 1) / 2, (Z + 1) / 2];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const sqLab = [toLab([u0, v0]), toLab([u1, v0]), toLab([u1, v1]), toLab([u0, v1])];
      for (const gp of grassPolys) {
        const cl = scrubPoly(clipConvex(sqLab, gp));
        if (!cl.length) continue;
        cells.push({
          poly: cl.map((L) => {
            const [u, v] = toTile(L);
            return [u, v, strength * ss01((distLab(L) - insetLab) / rampLab)];
          }),
        });
      }
    }
  }
  return cells;
}
/* Grass-spill cells (v33, pure, shared by scene + audit): the gobo
 * overlay spilling from grass onto sand. Same grid-and-clip shape
 * as detailCells, opposite fade: alpha peaks AT the sand contour
 * (strength) and dies linearly to 0 at spillWLab — a fade-OUT, not
 * a border ramp. Clip polys are the SAND pieces (lab), segs the
 * measured sand-contour segments (center lab). Cells fully past
 * the spill width are dropped (fewer tris); the audit re-derives
 * through this same function and checks the fade independently. */
export function spillCells(sandPolys, segs, n, spillWLab, strength) {
  const cells = [];
  const distSegs = ([X, Z]) => {
    let d = Infinity;
    for (const s of segs) {
      const dd = segDist([X, Z], [s.ax, s.az], [s.bx, s.bz]);
      if (dd < d) d = dd;
    }
    return d;
  };
  const toLab = ([u, v]) => [u * 2 - 1, v * 2 - 1];
  const toTile = ([X, Z]) => [(X + 1) / 2, (Z + 1) / 2];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const sqLab = [toLab([u0, v0]), toLab([u1, v0]), toLab([u1, v1]), toLab([u0, v1])];
      for (const sp of sandPolys) {
        const cl = scrubPoly(clipConvex(sqLab, sp));
        if (!cl.length) continue;
        const poly = [];
        let live = false;
        for (const L of cl) {
          const d = distSegs(L);
          const a = d <= spillWLab ? strength * (1 - d / spillWLab) : 0;
          if (a > 1e-9) live = true;
          const [u, v] = toTile(L);
          poly.push([u, v, a]);
        }
        if (live) cells.push({ poly });
      }
    }
  }
  return cells;
}
/* Smooth-alpha dissolve coverage (v24, family-wide v27, pure,
 * shared by scene + audit). The osws-renderer mechanism, ported to
 * our class geometry: a measured per-tile 4x4 coverage field PER
 * FAMILY CLASS (row-major, north->south), each averaged into 2x2
 * half-tile sub-cells (their _cutCell), then per-vertex weights on the
 * tile's 3x3 half-grid — each vertex the mean of the up-to-4
 * sub-cells meeting there, so weights sum to 1 and neighbouring tiles
 * derive identical shared vertices. Coverage is MEASURED from the
 * split pieces (exact clip areas), never from chord distance — their
 * "contour wins over shape" rule falls out: a half-chord covering an
 * eighth of the tile measures an eighth. All coords lab ([-1,1]).
 * One raster pass accumulates every family class (pieces partition
 * the tile, so buckets never overlap); non-family ground reads 0 in
 * every field.
 *
 * dissolveCoverageFam(famPieces, FAM, res): {c: res*res fractions}.
 * dissolveSubcells(cov4): the 2x2 means of each 2x2 block.
 * dissolveVertWeight(subOf, vx, vz): weight at half-grid vertex
 * (vx, vz) (world tile coords, half-integers), where subOf(tx, tz)
 * returns the owning tile's 2x2 sub-cell array (or uniform number),
 * or null past the map edge (mean of the available cells).
 * dissolveTileJob(subOfC, x, z, FAM): the tile's full paint job —
 * {W: {c: 9 vertex weights}} over the shared half-grid. The layer
 * pick at any point is the dominant non-own family weight there
 * (first-max in FAM order, deterministic); {own, 0} when nothing
 * fades in (layer invisible there). */
export const DISSOLVE_RES = 4;
const polyArea = (poly) => {
  let s = 0;
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length];
    s += P[0] * Q[1] - Q[0] * P[1];
  }
  return Math.abs(s / 2);
};
export function dissolveCoverageFam(famPieces, FAM, res = DISSOLVE_RES) {
  const out = {};
  for (const c of FAM) out[c] = new Array(res * res).fill(0);
  const w = 2 / res;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x0 = -1 + i * w, x1 = x0 + w, z0 = -1 + j * w, z1 = z0 + w;
      const cell = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (const fp of famPieces) {
        const cl = clipConvex(fp.poly, cell);
        if (cl.length > 2) {
          const k = j * res + i;
          out[fp.cls][k] += polyArea(cl) / (w * w);
          if (out[fp.cls][k] > 1) out[fp.cls][k] = 1;
        }
      }
    }
  }
  return out;
}
export function dissolveSubcells(cov4) {
  const sub = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      let s = 0;
      for (let dj = 0; dj < 2; dj++) {
        for (let di = 0; di < 2; di++) s += cov4[(2 * j + dj) * 4 + 2 * i + di];
      }
      sub.push(s / 4);
    }
  }
  return sub;
}
export function dissolveVertWeight(subOf, vx, vz) {
  /* Half-grid vertex in world tile coords: HX/HZ count half-tiles, so
     the 4 meeting sub-cells are half-index pairs around it. */
  const HX = Math.round(vx * 2), HZ = Math.round(vz * 2);
  let s = 0, n = 0;
  for (let dj = 0; dj <= 1; dj++) {
    for (let di = 0; di <= 1; di++) {
      const hi = HX - 1 + di, hj = HZ - 1 + dj;
      const tx = Math.floor(hi / 2), tz = Math.floor(hj / 2);
      const si = ((hi % 2) + 2) % 2, sj = ((hj % 2) + 2) % 2;
      const sub = subOf(tx, tz);
      if (sub == null) continue;
      s += typeof sub === "number" ? sub : sub[sj * 2 + si];
      n++;
    }
  }
  return n ? s / n : 0;
}
export function dissolveTileJob(subOfC, x, z, FAM) {
  const W = {};
  for (const c of FAM) {
    const w9 = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) w9.push(dissolveVertWeight((tx, tz) => subOfC(tx, tz, c), x + i / 2, z + j / 2));
    }
    W[c] = w9;
  }
  return { W };
}
/* Feathered coverage (v24c, pure, shared by scene + audit): tent-blur
 * the quarter grid by R quarter-cells before sub-cell averaging, so
 * the fade band widens symmetrically around the slice contour (a
 * symmetric blur keeps the 0.5 crossing on straight boundaries;
 * curves breathe slightly — expected for a taste knob). R=0 is the
 * identity (raw quarters, v24b look). Null cells (map edge, water)
 * are skipped with renormalization. qOf(tx, tz) returns the tile's
 * 16-array, a uniform number, or null — globals, so neighbours agree.
 * Returns the tile's blurred 2x2 sub means, or null when nothing was
 * available. */
export function dissolveBlurredSub(qOf, tx, tz, R) {
  if (!R) {
    const q = qOf(tx, tz);
    if (q == null) return null;
    return dissolveSubcells(typeof q === "number" ? new Array(16).fill(q) : q);
  }
  const qAt = (qx, qz) => {
    const ttx = Math.floor(qx / 4), ttz = Math.floor(qz / 4);
    const q = qOf(ttx, ttz);
    if (q == null) return null;
    if (typeof q === "number") return q;
    return q[(qz - ttz * 4) * 4 + (qx - ttx * 4)];
  };
  const blurQ = (qx, qz) => {
    let s = 0, wsum = 0;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const v = qAt(qx + di, qz + dj);
        if (v == null) continue;
        const wgt = R + 1 - Math.max(Math.abs(di), Math.abs(dj));
        s += v * wgt; wsum += wgt;
      }
    }
    return wsum ? s / wsum : null;
  };
  const sub = [];
  for (let sj = 0; sj < 2; sj++) {
    for (let si = 0; si < 2; si++) {
      let s = 0, n = 0;
      for (let dj = 0; dj <= 1; dj++) {
        for (let di = 0; di <= 1; di++) {
          const v = blurQ(tx * 4 + si * 2 + di, tz * 4 + sj * 2 + dj);
          if (v == null) continue;
          s += v; n++;
        }
      }
      if (!n) return null;
      sub.push(s / n);
    }
  }
  return sub;
}
/* Wandering + breakup value noise (v18 idea B, pure, shared by scene
 * + audit). hash2i: deterministic integer-lattice hash; vnoise:
 * smootherstep-interpolated value noise over absolute tile coords, so
 * tiles and chunks agree exactly. bandWanderMax caps wander at 30% of
 * reach; bandAlphaB: solid-source plateau (alpha exactly 1 from the
 * source side to the wandered zero line) then linear ramp over the
 * local reach — the geometric chord is always fully covered. */
function hash2i(ix, iz) {
  return _hash2i(ix, iz);
}
/* Deterministic integer-lattice hash in [0,1) (exported for the cut
   ornament's chord-mid phase — tile-interior, determinism only). */
export function _hash2i(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm01 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2i(ix, iz), b = hash2i(ix + 1, iz);
  const c = hash2i(ix, iz + 1), d = hash2i(ix + 1, iz + 1);
  const ux = sm01(fx), uz = sm01(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/* Ground-decor drift (v37): the two-octave smooth field the decal odds
   read — bare ground between drifts of flowers, never an even lattice
   (their numbers: x*0.11, z*0.27). Pure function of (x, z), so chunk
   rebuilds agree exactly. */
export function decorDrift(x, z) {
  return 0.6 * vnoise(x * 0.11, z * 0.27) + 0.4 * vnoise(x * 0.22 + 3.7, z * 0.54 - 1.2);
}
/* Max wander in LAB units, capped at 30% of the reach so the chord
 * stays well painted (anchor >= ~0.7) even on narrow pairs. */
export function bandWanderMax(wLab, opt) {
  return Math.min((opt.wander ?? 0) * 2, 0.3 * wLab);
}
export function bandAlphaB(P, fr, w, side, wx, wz, opt) {
  const wMax = bandWanderMax(w, opt);
  const wf = 1 / (opt.wanderLen ?? 5), bf = 1 / (opt.breakupLen ?? 1.25);
  const shift = wMax * (vnoise(wx * wf, wz * wf) - 0.5) * 2;
  const bb = opt.breakup ?? 0;
  const wEff = w * Math.max(0.25, 1 + bb * (vnoise(wx * bf + 7.3, wz * bf - 3.1) - 0.5) * 2);
  const s = (P[0] - fr.A[0]) * fr.nx + (P[1] - fr.A[1]) * fr.ny;
  /* Solid-source plateau: alpha is exactly 1 from the source side up
   * to the wandered zero line (or the chord, whichever reaches farther
   * into the flank), then ramps linearly over the local reach. The
   * geometric chord is therefore always fully covered — no step at the
   * cut — and the visible solid→blend transition MEANDERS with the
   * wander noise instead of tracing the straight chord. Far edge:
   * ragged via wEff, always 0 inside the widened clip. */
  const u = side * s;
  const edge = Math.max(0, side * shift);
  const t = u <= edge ? 1 : 1 - (u - edge) / wEff;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
/* Smooth heightfield normal (taste batch item 1: slope shading): the
 * unit normal of the bilinear corner field at lattice node (x, z) from
 * central differences, borders clamped. Pure + import-free like the
 * rest of this file; scene.js#smoothN bilinear-interpolates these at
 * any (x, z), so shared tile edges agree on both sides and slopes
 * shade continuously instead of in tile squares. */
export function nodeNormal(corner, cw, W, H, x, z) {
  const h = (xx, zz) => corner[Math.min(Math.max(zz, 0), H) * cw + Math.min(Math.max(xx, 0), W)];
  const dx = (h(x + 1, z) - h(x - 1, z)) / 2;
  const dz = (h(x, z + 1) - h(x, z - 1)) / 2;
  const len = Math.hypot(dx, 1, dz) || 1;
  return [-dx / len, 1 / len, -dz / len];
}
