import * as THREE from "https://esm.sh/three@0.160.0";
import { MeshBuilder } from "./mesh.js";
import { CHUNK, T, TILE_COLORS, BRIDGE_DECK_Y, TREE_FAMILIES, ROCKY_STEP_BASE, ROCKY_STEP_TOP, UP_Y, TUT_DECOR, TUT_SHROOM, TUT_ISLE, inTutIsleBox } from "./world.js";
import { hash01, hashPick, clamp } from "./util.js";
import { isAgileKey } from "./island.js";
import { makeAtlas } from "./textures.js";
import { makeModelCharacter, animateCharTextures } from "./models3d.js";
import { locGeometry, locAnimGeometry, locAnimIdsForModel, locAnimMaterial, locGlassGeometry, locGlowGeometry, locMask, locMaskData, advanceLocAnimTextures, advanceLocAnims, hasLoc, locsReady, locAtlas, locHeight, locFootprint, locMountY, ITEM_KEY } from "./locmodels.js";
import { contourTile, contourHeightOf, nodeKey, ornHeightLab, chordSides, bandStripOne, bandAlphaOne, goboFam, detailCells, spillCells, segDist, decorDrift } from "./mapgen/contour.js";
import { terrainReady, terrainTexture, terrainUv, waterTexture, foamStreakTexture, decorReady, decorTexture } from "./terrain.js";
import {
  gbFacade, splitDryTile, splitShoreLoop, sandSpillJob,
  nearHardTile, grassRibbonJobs, makeGoboCanvas, triAlpha, triAlpha3, triAlpha3N,
  GB_FAM, GB_DETAIL_K, GB_SPLIT_SET, GB_BASE_HEX, GB_STROKE, GB_STRENGTH,
  GB_GRASS_W, GB_UNDERLAY, GB_SPILL_W_TILES, GB_SPILL_STRENGTH,
} from "./groundblend.js";

const SKY = 0x9dc4e6;

function buildShroomCapTexture() {
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#cf3d27";
  ctx.fillRect(0, 0, S, S);
  let seed = 918273;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) | 0, ((seed >>> 0) % 10000) / 10000);
  for (let k = 0; k < 14; k++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 2.5 + rnd() * 3.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(245,240,225,0.95)");
    g.addColorStop(0.7, "rgba(245,240,225,0.9)");
    g.addColorStop(1, "rgba(245,240,225,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

function buildGravelDetailTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  let seed = 9182011;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) | 0, ((seed >>> 0) % 10000) / 10000);
  const ga = 0.5;
  const dot = (x, y, r, a) => {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.arc(x + ox * S, y + oy * S, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    }
  };
  for (let k = 0; k < 200; k++) {
    dot(rnd() * S, rnd() * S, 1.5 + rnd() * 2, ga * (0.5 + rnd() * 0.5));
  }
  for (let k = 0; k < 40; k++) {
    const x = rnd() * S, y = rnd() * S, rx = 4 + rnd() * 2.5, ry = rx * (0.55 + rnd() * 0.3);
    const rot = rnd() * Math.PI;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.ellipse(x + ox * S, y + oy * S, rx, ry, rot, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(ga * 0.6).toFixed(3)})`;
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  return t;
}

function buildRockDetailTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  let seed = 5518132;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) | 0, ((seed >>> 0) % 10000) / 10000);
  const ra = 0.6;
  ctx.lineCap = "round";
  for (let k = 0; k < 140; k++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${(ra * (0.65 + rnd() * 0.35)).toFixed(3)})`;
    ctx.lineWidth = 2 + Math.floor(rnd() * 2);
    const pts = [[x, y]];
    for (let s = 0; s < 3; s++) {
      a += (rnd() - 0.5) * 2.1;
      const l = 8 + rnd() * 8;
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      pts.push([x, y]);
    }
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + ox * S, pts[0][1] + oy * S);
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0] + ox * S, pts[s][1] + oy * S);
      ctx.stroke();
    }
  }
  for (let k = 0; k < 70; k++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 4, a0 = rnd() * Math.PI * 2;
    const P = [0, 1, 2].map((s) => [x + Math.cos(a0 + s * 2.1) * r, y + Math.sin(a0 + s * 2.1) * r]);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.moveTo(P[0][0] + ox * S, P[0][1] + oy * S);
      ctx.lineTo(P[1][0] + ox * S, P[1][1] + oy * S);
      ctx.lineTo(P[2][0] + ox * S, P[2][1] + oy * S);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${(ra * 0.7).toFixed(3)})`;
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  return t;
}

function buildDirtDetailTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  let seed = 7720134;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) | 0, ((seed >>> 0) % 10000) / 10000);
  const da = 0.55;
  const blob = (x, y, r, a) => {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.arc(x + ox * S, y + oy * S, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    }
  };
  for (let k = 0; k < 70; k++) {
    const x = rnd() * S, y = rnd() * S, n = 3 + Math.floor(rnd() * 3);
    for (let s = 0; s < n; s++) {
      blob(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 12, 2 + rnd() * 2, da * (0.5 + rnd() * 0.5));
    }
  }
  ctx.lineCap = "round";
  for (let k = 0; k < 80; k++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const l = 3 + rnd() * 3;
    ctx.strokeStyle = `rgba(255,255,255,${(da * (0.5 + rnd() * 0.5)).toFixed(3)})`;
    ctx.lineWidth = 2 + Math.floor(rnd() * 2);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.moveTo(x + ox * S, y + oy * S);
      ctx.lineTo(x + Math.cos(a) * l + ox * S, y + Math.sin(a) * l + oy * S);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  return t;
}

/* The material a loc's mesh is thrown together with for the picker
   (scene.js#_locMeshHit). Only its `side` is ever read - three.js's triangle
   test culls by it - and the scenery material is double-sided, so this is too. */
const _pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/* The line material the `::boxes` view outlines a loc's mesh with, drawn through
   the model so an edge behind a trunk is still visible. */
const _edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffe14d, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
_edgeMaterial.renderOrder = 900;

/* Edge lines for a loc geometry, built once per geometry: every loc of a kind
   shares one geometry (locmodels.js#locGeometry), so a whole forest's outlines
   come off the same few buffers. */
const _edgeCache = new WeakMap();
function _edgesFor(geom) {
  let e = _edgeCache.get(geom);
  if (!e) _edgeCache.set(geom, e = new THREE.EdgesGeometry(geom));
  return e;
}

/* The chatbox dialogue head's projection, straight out of the 317 client's
   drawInterface: a type-6 widget draws its animated model with
   `sine/cosine = SINE[rotationX] * modelZoom >> 16`, which puts the model
   `modelZoom` units in front of a camera of focal length CHAT_FOCAL - the
   client's own `<< 9` in `vertexScreenX = centreX + (x << 9) / z`, so 512
   pixels. The model's angles are in the client's own 2048-per-turn table.

   The focal is per *drawn* pixel, not per widget: the client draws the head
   into the chatbox's own 479x96 screen area and the widget's 32x32 component
   box is only the anchor its centre is taken from (`Rasterizer.centreX = x +
   width / 2`). It is worth being exact about this, because the head is much
   bigger than the box it is anchored to: the model is 126 units tall and sits
   at a distance of 796, so it projects to `126 * 512 / 796` = 81 pixels, i.e.
   the head fills most of the chatbox's height, and a 32-pixel canvas would show
   nothing but the middle of its face. So the field of view is a function of the
   canvas we are drawing into - `2*atan((height / 2) / 512)` keeps the client's
   own pixels-per-unit - and the caller hands us a canvas big enough to hold the
   head (src/dialogue.js#HEAD_DRAW). */
const CHAT_FOCAL = 512;
const ROT_UNITS = 2048;

/* Where the *visible* figure sits inside the box the camera frames. A body's
   authored box (src/models3d.js#buildMesh's measurement of the rest pose) holds
   the character plus the same sliver of air above the head that the feet spend
   below it, so a doll whose box is centred in its canvas stands a hair low: the
   drawn figure's own centre is this many model units *below* the box's, measured
   off the rendered canvas for both bodies (13.5 pixels at 230 pixels to the unit
   for the male, 12 for the female - 0.059 and 0.051 model units). Screens that
   want the figure itself centred (the character-design and name steps,
   src/dollstage.js#figureStage) hand this to drawDoll's `sink`. */
export const DOLL_SINK = 0.055;

/* The tree species the world knows, as lists of baked loc keys (`::trees`
   plants one of each in the row). A world object carries a `kind` naming one of
   these groups, or an explicit `key` naming one exact baked model.

   The table itself lives with the world now - world.js#TREE_FAMILIES, with the
   audit of the odd members (the snow trees, the Tirannwn tree, the arctic pine,
   the two dead-tree palettes) and the footprint of each model beside it in
   world.js#TREE_FOOT - because a tree's model and the tiles it covers have to be
   one decision, and it is the world that plants one. It is re-exported under the
   old name here: the renderer still asks it which model a `kind` draws, for the
   trees that carry no explicit key (the `::tree` specimens). */
export const TREE_GROUPS = TREE_FAMILIES;

const ORE_COLOR = {
  copper: 0xc47a3a,
  tin: 0xd6dadd,
  iron: 0x8a5b3c,
  coal: 0x2e2d2a,
  silver: 0xc8d0d8,
  gold: 0xe8c84a,
  mithril: 0x5b86c4,
  adamantite: 0x4f8f6f,
  runite: 0x5fb0d0,
  clay: 0xb8b09a,
  none: 0x9a9388,
};

const ORE_ROCK = {
  copper: 0x8d8477,
  tin: 0x8d8477,
  iron: 0x7d7268,
  coal: 0x6f6a63,
  silver: 0x8a857c,
  gold: 0x8b8474,
  mithril: 0x767c88,
  adamantite: 0x74807a,
  runite: 0x7a8490,
  clay: 0x9a9186,
  none: 0x8b8377,
};

const TILE_TEX = {
  [T.GRASS]: "grass",
  [T.GRASS_DARK]: "grass_dark",
  [T.TROP_GRASS]: "grass",
  [T.DIRT]: "dirt",
  [T.PATH]: "path",
  [T.SAND]: "sand",
  [T.WATERBED]: "waterbed",
  [T.FLOOR_WOOD]: "floor_wood",
  [T.FLOOR_STONE]: "floor_stone",
  [T.FLOOR_CHECK_W]: "check_white",
  [T.FLOOR_CHECK_B]: "check_black",
  [T.ROCKGROUND]: "rockground",
  [T.MARSH]: "marsh",
  [T.GRAVEL]: "gravel",
  [T.BRIDGE]: "plank",
  [T.VOID]: "rough_stone",
  [T.DIRTWALL]: "dirt",
};

/* The ground, painted with the cache's own floor textures (see src/terrain.js
   and src/tools/cache-bake/terrain.mjs). Each tile type says which baked
   material cell it samples and what colour that texture is multiplied by.

   The white multiplier is the client's own behaviour: a textured floor is drawn
   as the texture shaded by the tile's light, not as texture * floor colour. The
   other keys use a tint because this world has one tile type where the game had
   an underlay/overlay pair - a darker grass for the rough patches, a paler
   trodden dirt for the roads, a saturated green for the marsh - so the tint is
   the stand-in for the underlay colour that would have shown through in the
   real map. Values are LINEAR multipliers (what three.js multiplies a texture
   by), so they read roughly as the square of the sRGB value you would type. */
const TILE_MATERIAL = {
  [T.GRASS]: { key: "grass", tint: [1, 1, 1] },
  [T.GRASS_DARK]: { key: "grass", tint: [0.68, 0.8, 0.58] },
  [T.TROP_GRASS]: { key: "grass", tint: [1, 1, 1] },
  [T.DIRT]: { key: "dirt", tint: [0.9, 0.86, 0.8] },
  [T.PATH]: { key: "dirt", tint: [1.28, 1.22, 1.1] },
  [T.SAND]: { key: "sand", tint: [1, 1, 1] },
  [T.WATERBED]: { key: "sand", tint: [0.16, 0.32, 0.3] },
  [T.FLOOR_WOOD]: { key: "planks", tint: [0.8, 0.66, 0.5] },
  [T.FLOOR_STONE]: { key: "stone_tiles", tint: [1, 1, 1] },
  /* The check floor is the grey stone_tiles texture duplicated and recolored
     twice (terrain cells check_white/check_black): the stone detail and the
     grout lines are the cache's own, only the colours are remapped - tile
     faces warm almost-white, grout warm mid-grey on the white checks; tile
     faces dark charcoal, grout near-black on the black ones. The tint only
     cancels the scene lighting's own shading so the baked colours read as
     authored. */
  [T.FLOOR_CHECK_W]: { key: "check_white", tint: [2.2, 2.17, 2.1] },
  [T.FLOOR_CHECK_B]: { key: "check_black", tint: [1, 1, 1] },
  [T.ROCKGROUND]: { key: "rough_stone", tint: [1, 1, 1] },
  [T.MARSH]: { key: "grass", tint: [0.4, 0.56, 0.34] },
  [T.GRAVEL]: { key: "cobble", tint: [1, 1, 1] },
  [T.BRIDGE]: { key: "planks", tint: [1, 1, 1] },
  [T.VOID]: { key: "rough_stone", tint: [0.02, 0.02, 0.025] },
  [T.DIRTWALL]: { key: "dirt", tint: [0.5, 0.44, 0.38] },
};

/* The water's sheet: the cache's water overlay texture under one flat tint.
   There used to be a shallow-to-deep shade here; the user asked for a single
   shade of water everywhere, so depth no longer tints. */
const WATER_TINT = [0.36, 0.5, 0.86];

/* Standstill switch (user ask 2026-10-30): while true the water never moves -
   no texture scroll, no ebb - so other water effects can be tried against a
   calm surface. Flip it back to restore the classic motion. */
const WATER_STILL = true;

/* The client's water animation (`Client.animateTexture`): the texture shifts by
   `width * animationTimePassed * 2` bytes per client cycle, and the counter is
   reset every frame, so it is 2 texels per 20 ms cycle = 100 texels a second on
   a 128-texel texture (a full cycle every 1.28 s). */
const WATER_TEXELS = 128;
const WATER_TEXELS_PER_SEC = 100;

/* How tall each procedural object stands above its tile, in tiles. Only the
   fallbacks are listed: an object with a baked cache loc uses that model's own
   height (see View#objTopY), and these numbers only have to cover what the
   hand-built stand-in draws (see View#_addObject) - they are the clickable
   box's height, so a slightly generous figure is better than a short one. */
const OBJ_TOP = {
  tree: 3.8,
  deadtree: 2.9,
  rock: 0.75,
  fence: 1.1,
  bush: 1.0,
  flowers: 0.35,
  crate: 0.9,
  crate_b: 0.9,
  barrel: 0.95,
  chest: 0.9,
  table: 0.9,
  chair: 1.1,
  bench: 0.9,
  table_b: 0.9,
  boulder: 0.8,
  rockery: 0.35,
  rocky: 0.12,
  fern: 0.4,
  plant: 2.9,
  well: 3.0,
  altar: 1.45,
  statue: 2.3,
  tent: 2.1,
  signpost: 1.8,
  counter: 1.0,
  furnace: 2.7,
  anvil: 0.9,
  wheel: 1.15,
  range: 1.3,
  booth: 1.6,
  fire: 0.7,
  torch: 1.5,
  fishing: 0.35,
};

/* A ring tile draws its wall panels from the building geometry no matter what
   shares the tile (see `_chunkLocs`), so both stay solid and neither the
   solidity nor the pathing ever notice - the tile was already blocked by the
   wall. The smithy's furnace and pottery oven back rows stand on its north
   ring. */

/* A fishing spot's pick column is raised until it covers this many screen
   pixels vertically (see View#objTopY): a flat tile's box projects to a thin
   band at a low camera angle that no cursor can land in. */
const FISH_MIN_PX = 64;
/* ...but never more than this above its natural top, so the column cannot grow
   into the sightline of the bank behind the spot and steal those clicks. */
const FISH_RAISE_CAP = 2.6;

function mix(hex, s) {
  return new THREE.Color(0xffffff).lerp(new THREE.Color(hex), s);
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}

/* Ear-clipping triangulation over the XZ projection. The old fan-from-vertex-0
   triangulation bridges concave notches: where a grass tooth inserts into a
   sand piece, the fan spans the notch mouth and paints sand over the tooth
   (near-coplanar double cover: a dark seam from a static camera, shimmer on
   camera move). Convex polys keep the exact legacy fan (bit-identical output);
   only concave polys take the ear path. Returns index triples in input cyclic
   order (callers apply their usual facing swap); subset of input verts only,
   so colors/normals/uv/alpha ride along untouched. Falls back to the fan if
   the polygon is degenerate. */
function polyTris(pts) {
  const n = pts.length;
  const fanIdx = () => {
    const out = [];
    for (let i = 1; i + 1 < n; i++) out.push([0, i, i + 1]);
    return out;
  };
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  const cross = (A, B, C) => (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
  let s = 0;
  for (let i = 0; i < n; i++) { const A = pts[i], B = pts[(i + 1) % n]; s += A[0] * B[2] - B[0] * A[2]; }
  if (Math.abs(s) < 1e-18) return fanIdx();
  let convex = true;
  for (let i = 0; i < n; i++) {
    if (cross(pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]) * s < -1e-12) { convex = false; break; }
  }
  if (convex) return fanIdx();
  const inTri = (P, A, B, C) => {
    const d1 = cross(A, B, P), d2 = cross(B, C, P), d3 = cross(C, A, P);
    if (s > 0) return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12;
    return d1 < -1e-12 && d2 < -1e-12 && d3 < -1e-12;
  };
  const cur = [];
  for (let i = 0; i < n; i++) cur.push(i);
  const out = [];
  let guard = n * n + 4;
  while (cur.length > 3 && guard-- > 0) {
    let found = -1;
    for (let k = 0; k < cur.length; k++) {
      const p = cur[(k + cur.length - 1) % cur.length], ii = cur[k], nx = cur[(k + 1) % cur.length];
      if (cross(pts[p], pts[ii], pts[nx]) * s <= 1e-12) continue;
      let ok = true;
      for (const j of cur) {
        if (j === p || j === ii || j === nx) continue;
        if (inTri(pts[j], pts[p], pts[ii], pts[nx])) { ok = false; break; }
      }
      if (ok) { found = k; break; }
    }
    if (found < 0) return fanIdx();
    const k = found;
    const p = cur[(k + cur.length - 1) % cur.length], ii = cur[k], nx = cur[(k + 1) % cur.length];
    out.push([p, ii, nx]);
    cur.splice(k, 1);
  }
  if (cur.length === 3) out.push([cur[0], cur[1], cur[2]]);
  else return fanIdx();
  return out;
}

export class View {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      /* No MSAA: this world's anti-aliasing is the optional supersample in
         src/renderopts.js (`setAntialias`), which is **on by default**
         (2026-09-20) and doubles the drawing buffer in each direction; turned
         off, the drawing buffer is exactly one pixel per game pixel. */
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    /* The viewport is the real client's 512x334 and the whole frame is upscaled
       by CSS (see src/gameframe.js), so the drawing buffer is one pixel per game
       pixel - period-correct, and cheap - unless the supersample above raises it
       (twice that in each direction is what `setAntialias` sets). */
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.atlas = makeAtlas();
    this.uvs = this.atlas.uvs;
    this.atlasTex = new THREE.CanvasTexture(this.atlas.canvas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.magFilter = THREE.LinearFilter;
    this.atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlasTex.generateMipmaps = true;
    this.atlasTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 48, 118);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

    /* The interface paper-doll (the worn-equipment tab's character). A second
       scene holding ONE mesh that *shares* the player's live character geometry
       and material, so the doll shows whatever pose the world model is already
       in without a second skinning pass. Characters are drawn with
       MeshBasicMaterial (the client's own lighting is baked into the vertex
       colours), so the doll scene needs no lights at all. */
    this.dollScene = new THREE.Scene();
    this.dollCamera = new THREE.PerspectiveCamera(42, 0.48, 0.05, 40);
    this._dollRoot = new THREE.Group();
    this.dollScene.add(this._dollRoot);
    this._dollRT = null;
    this._dollPixels = null;
    this._dollImage = null;
    this._dollMesh = null;
    this._dollBox = null;

    /* The chatbox dialogue head (src/dialogue.js). It does not frame its model
       the way the doll does: the client draws a dialogue head with a focal
       length of CHAT_FOCAL pixels - so many pixels per model unit, in the
       chatbox's own screen space - which means the field of view follows the
       canvas the head is drawn into, and the model's size on screen is whatever
       the cache's modelZoom says. See drawChatHead. */
    this.headScene = new THREE.Scene();
    this.headCamera = new THREE.PerspectiveCamera(
      2 * Math.atan(0.5 / CHAT_FOCAL) * (180 / Math.PI), 1, 0.01, 40);
    this._headFov = null;
    this._headSpin = new THREE.Group();
    this._headInner = new THREE.Group();
    this._headSpin.add(this._headInner);
    this.headScene.add(this._headSpin);
    this._headRT = null;
    this._headPixels = null;
    this._headImage = null;
    this._headMesh = null;

    const hemi = new THREE.HemisphereLight(0xd6e9ff, 0x46512f, 0.74);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0cf, 1.22);
    sun.position.set(-0.55, 1.25, 0.7);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4f0, 0.2);
    fill.position.set(0.7, 0.5, -0.6);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.09));

    this.chunkRoot = new THREE.Group();
    this.objectRoot = new THREE.Group();
    this.waterRoot = new THREE.Group();
    this.stillWaterRoot = new THREE.Group();
    this.doorRoot = new THREE.Group();
    this.roofsHidden = false;
    this.roofRoot = new THREE.Group();
    this.upstairsRoot = new THREE.Group();
    this.fireRoot = new THREE.Group();
    this.scene.add(this.chunkRoot, this.objectRoot, this.waterRoot, this.stillWaterRoot, this.doorRoot, this.roofRoot, this.upstairsRoot, this.fireRoot);
    this.trapHole = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this.trapHole.rotation.x = -Math.PI / 2;
    this.trapHole.visible = false;
    this.scene.add(this.trapHole);

    /* The ground is the one surface in the scene that everything else stands or
       lies *on*: a character's feet are authored to rest exactly at tile height
       (models/player_*.json has `bounds` minY = 0), and a dropped item's model
       sits on the tile the same way. Those are exact coplanar ties, and the
       depth test then resolves them either way as the camera moves - a couple
       of pixels of shimmer at every creature's feet. Pushing the terrain a
       couple of depth units away from the camera lets everything placed on it
       win the tie, which is also what the client does by drawing the ground
       first. The offset scales with the depth slope, so it holds at every camera
       distance without re-tuning, and it is far too small to move the ground
       behind anything that is genuinely above or below it. */
    this.groundMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: terrainReady() ? terrainTexture() : this.atlasTex,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    });
    this.blendMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true, depthWrite: false,
    });
    this.underMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    });
    const bladeCv = makeGoboCanvas("blades", 4107);
    const pitCv = makeGoboCanvas("pits", 9021);
    this.bladeTex = new THREE.CanvasTexture(bladeCv);
    this.bladeTex.wrapS = THREE.RepeatWrapping;
    this.bladeTex.wrapT = THREE.RepeatWrapping;
    this.bladeTex.colorSpace = THREE.SRGBColorSpace;
    this.bladeTex.anisotropy = 16;
    this.pitTex = new THREE.CanvasTexture(pitCv);
    this.pitTex.wrapS = THREE.RepeatWrapping;
    this.pitTex.wrapT = THREE.RepeatWrapping;
    this.pitTex.colorSpace = THREE.SRGBColorSpace;
    this.pitTex.anisotropy = 16;
    this.goboBladeMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: this.bladeTex,
      transparent: true, depthWrite: false,
    });
    this.goboPitMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: this.pitTex,
      transparent: true, depthWrite: false,
    });
    this.gravelMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: buildGravelDetailTexture(),
      transparent: true, depthWrite: false,
    });
    this.rockMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: buildRockDetailTexture(),
      transparent: true, depthWrite: false,
    });
    this.dirtMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: buildDirtDetailTexture(),
      transparent: true, depthWrite: false,
    });
    this.groundDecorMat = new THREE.MeshLambertMaterial({
      vertexColors: true, map: null,
      transparent: true, depthWrite: false,
    });
    this.shroomCapTex = buildShroomCapTexture();
    this.shroomStemMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.shroomCapMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.shroomCapTex, side: THREE.DoubleSide });
    this.objectMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.atlasTex });
    this.roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.atlasTex, side: THREE.DoubleSide });
    this.doorMat = new THREE.MeshLambertMaterial({ map: this.atlasTex });

    /* Real cache scenery (trees, rocks, ...) is lit the way the client lights
       its models: the light level is baked into the vertex colours, so the
       material must not apply three.js lighting on top. The atlas holds the
       loc textures plus one white cell for the untextured faces.

       The atlas' alpha is the *cut-out* (see src/locmodels.js#packPage): the
       cache's leaf and bark sprites are a fifth holes, and the client's
       rasterizer draws nothing into a hole, so a canopy is a clump of leaves
       rather than a rectangle. The mask is a separate greyscale canvas because
       the colours under the holes had to be repaired for the mip chain, which
       leaves the sheet itself opaque - so the cut-out rides in `alphaMap`,
       which three.js multiplies into the fragment's alpha before `alphaTest`.
       The `white` cell the untextured faces sample is solid, so they pass. */
    this.locMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.locGlassMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false });
    /* Faces the cache authors translucent carry their own alpha in a 4-component
       colour attribute (see locmodels.js#locGlowGeometry), so this blends per
       face instead of at one flat opacity like the glass above. No depth write
       (a glow layering over itself must blend with itself); depth testing stays
       on so masonry still hides the glow it stands behind. */
    this.locGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    /* The scenery's own sheet is attached through the one method that knows how
       (see attachLocAtlas) rather than here, because the bake it comes from may
       land long after this object exists. */
    this.attachLocAtlas();

    /* The water is an ordinary textured floor tile in the client too: flat,
       opaque, and shaded by the same light as the ground it lies in. Its
       *motion* is not geometry - the client scrolls the water texture itself
       (see `update` below), so the wave displacement and the specular sheen this
       material used to carry are gone: both were this build's invention, and
       both read as "a shader" rather than as 2007 water. What is left is the
       cache's own water texture (id 24, the copy the client animates), one
       repeat per tile, under one flat tint (WATER_TINT) - a single shade of
       water everywhere. */
    this.waterMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: terrainReady() ? waterTexture() : null,
      side: THREE.DoubleSide,
    });
    /* Standing water (user ask 2026-10-30: the cay pond must not move): the
       same art as waterMat, but its own texture instance, so the update
       loop's scrolling offset never touches it. Pond quads go into
       stillWaterRoot (see _chunkWater), which also skips the shoreline ebb -
       still water neither flows nor breathes.
       still water neither flows nor breathes. */
    this.stillWaterMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: null,
      side: THREE.DoubleSide,
    });
    this._stillWaterSrc = null;
    this._syncStillWaterMap();

    this.chunks = new Map();
    this.doors = [];
    /* Lit fires: tile key -> the animated model instance. Kept out of the chunk
       meshes because they are real animated models, not merged static geometry
       (see addFire). */
    this.fires = new Map();
    this.plaques = new Map();
    this._fireKey = (x, z) => x + ":" + z;
    this._camYaw = 0;
    this._camPitch = 0.94;
    this.time = 0;
    /* Walk destination: {x,z} while the player is heading somewhere. The
       click cross itself is drawn by the 2D overlay (see src/fx.js); this only
       drives the minimap's destination flag (see ui.js). */
    this.dest = null;
    this._buildAll();
    this._buildRipples();
    this._buildStreaks();
    this._buildFish();
  }


  /* ----------------------------------------------------------------- click
     The click cross is NOT painted on the ground: it is a screen-space overlay
     drawn by src/fx.js - `setMarkerScreen` for a click on the viewer, and
     `setMarker` (a world point) for the right-click menu's "Walk here" row - so
     it keeps a constant size, stays flat to the camera and never z-fights with
     terrain. All this class keeps is the walk destination, which the minimap
     draws as a flag. */

  setDest(x, z) {
    this.dest = x == null ? null : { x, z };
  }

  clearDest() {
    this.dest = null;
  }

  setTileMarks(hoverX, hoverZ, destX, destZ) {
    if (!this._tileRoot) {
      const root = new THREE.Group();
      this.scene.add(root);
      const hoverGeom = new THREE.BufferGeometry().setAttribute(
        "position", new THREE.BufferAttribute(new Float32Array(12), 3));
      const hover = new THREE.LineLoop(hoverGeom, new THREE.LineBasicMaterial({ color: 0x54e0ff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }));
      hover.renderOrder = 900;
      hover.frustumCulled = false;
      hover.visible = false;
      root.add(hover);
      const dest = new THREE.LineLoop(hoverGeom.clone(), new THREE.LineBasicMaterial({ color: 0xffe14d, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }));
      dest.renderOrder = 900;
      dest.frustumCulled = false;
      dest.visible = false;
      root.add(dest);
      this._tileRoot = root;
      this._tileHover = hover;
      this._tileDest = dest;
    }
    const hov = this._tileHover, dst = this._tileDest;
    if (hoverX == null || hoverZ == null) hov.visible = false;
    else {
      const y = this.world.heightAt(hoverX + 0.5, hoverZ + 0.5) + 0.05;
      const a = hov.geometry.attributes.position.array;
      a[0] = hoverX; a[1] = y; a[2] = hoverZ;
      a[3] = hoverX + 1; a[4] = y; a[5] = hoverZ;
      a[6] = hoverX + 1; a[7] = y; a[8] = hoverZ + 1;
      a[9] = hoverX; a[10] = y; a[11] = hoverZ + 1;
      hov.geometry.attributes.position.needsUpdate = true;
      hov.visible = true;
    }
    if (destX == null || destZ == null) dst.visible = false;
    else {
      const y = this.world.heightAt(destX + 0.5, destZ + 0.5) + 0.05;
      const a = dst.geometry.attributes.position.array;
      a[0] = destX; a[1] = y; a[2] = destZ;
      a[3] = destX + 1; a[4] = y; a[5] = destZ;
      a[6] = destX + 1; a[7] = y; a[8] = destZ + 1;
      a[9] = destX; a[10] = y; a[11] = destZ + 1;
      dst.geometry.attributes.position.needsUpdate = true;
      dst.visible = true;
    }
    this._tileRoot.visible = hov.visible || dst.visible;
  }


  _buildAll() {
    const cw = Math.ceil(this.world.w / CHUNK);
    const ch = Math.ceil(this.world.h / CHUNK);
    for (let cz = 0; cz < ch; cz++) {
      for (let cx = 0; cx < cw; cx++) this.buildChunk(cx, cz);
    }
    this._buildRoofs();
    this._buildDoors();
    this._buildUpstairs();
    this._buildBridge();
  }

  _buildBridge() {
    const w = this.world;
    if (!w.bridgeTiles || !w.bridgeTiles.length) return;
    let x0 = Infinity, x1 = -Infinity;
    for (const [x] of w.bridgeTiles) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    const b = new MeshBuilder();
    b.setCell(this.uvs.plank);
    const y = BRIDGE_DECK_Y;
    const z0 = 55.98;
    const z1 = 58.02;
    const wood = mix(0x9a7448, 0.72);
    for (let z = 56; z <= 57; z++) {
      for (let x = x0; x <= x1; x++) {
        const tint = (x + z) % 2 === 0 ? 1.0 : 0.9;
        b.quad([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1], wood.clone().multiplyScalar(tint));
      }
    }
    const cx = (x0 + x1 + 1) / 2;
    const len = x1 - x0 + 1;
    for (const zz of [z0, z1]) {
      b.box(cx, y - 0.16, zz, len, 0.32, 0.34, 0x8a6a42);
    }
    for (const zz of [z0 + 0.14, z1 - 0.14]) {
      b.box(cx, y + 0.95, zz, len, 0.13, 0.13, 0x9a7448);
      b.box(cx, y + 0.55, zz, len, 0.1, 0.1, 0x8a6a42);
    }
    for (let x = x0; x <= x1 + 1; x += 2) {
      for (const zz of [z0 + 0.14, z1 - 0.14]) {
        b.box(x, y + 0.55, zz, 0.16, 1.15, 0.16, 0x8a6a42);
      }
    }
    for (let x = x0 + 1; x <= x1 - 1; x += 4) {
      const bedY = Math.min(w.cornerAt(x, 56), w.cornerAt(x, 58), w.cornerAt(x + 1, 56), w.cornerAt(x + 1, 58));
      const h = y - bedY;
      if (h > 0.6) {
        for (const zz of [56.5, 57.5]) b.box(x + 0.5, bedY + h / 2, zz, 0.42, h, 0.42, 0x6b5233);
      }
    }
    const mesh = new THREE.Mesh(b.build(), this.objectMat);
    this.objectRoot.add(mesh);
  }

  buildChunk(cx, cz) {
    const key = cx + "," + cz;
    const old = this.chunks.get(key);
    if (old) {
      for (const m of old) {
        m.parent && m.parent.remove(m);
        /* scenery instances share one geometry per (model, rotation) across the
           whole map, so only per-chunk geometry may be disposed here */
        if (!m.userData || !m.userData.sharedGeometry) m.geometry.dispose();
      }
    }
    const built = [];
    const g = this._chunkGround(cx, cz);
    if (g && g.ground) {
      const m = new THREE.Mesh(g.ground, this.groundMat);
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.under) {
      const m = new THREE.Mesh(g.under, this.underMat);
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.blend) {
      const m = new THREE.Mesh(g.blend, this.blendMat);
      m.renderOrder = 2;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.blades) {
      const m = new THREE.Mesh(g.blades, this.goboBladeMat);
      m.renderOrder = 4;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.pits) {
      const m = new THREE.Mesh(g.pits, this.goboPitMat);
      m.renderOrder = 3;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.gravel) {
      const m = new THREE.Mesh(g.gravel, this.gravelMat);
      m.renderOrder = 3;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.rock) {
      const m = new THREE.Mesh(g.rock, this.rockMat);
      m.renderOrder = 3;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.dirt) {
      const m = new THREE.Mesh(g.dirt, this.dirtMat);
      m.renderOrder = 3;
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.decor) {
      if (!this.groundDecorMat.map && decorReady()) {
        this.groundDecorMat.map = decorTexture();
        this.groundDecorMat.needsUpdate = true;
      }
      if (this.groundDecorMat.map) {
        const m = new THREE.Mesh(g.decor, this.groundDecorMat);
        m.renderOrder = 5;
        this.chunkRoot.add(m);
        built.push(m);
      }
    }
    if (g && g.stems) {
      const m = new THREE.Mesh(g.stems, this.shroomStemMat);
      this.chunkRoot.add(m);
      built.push(m);
    }
    if (g && g.caps) {
      const m = new THREE.Mesh(g.caps, this.shroomCapMat);
      this.chunkRoot.add(m);
      built.push(m);
    }
    const dais = this._chunkDais(cx, cz);
    if (dais) {
      const m = new THREE.Mesh(dais, this.groundMat);
      m.userData.chunk = key;
      m.userData.layer = "dais";
      this.chunkRoot.add(m);
      built.push(m);
    }
    const objs = this._chunkObjects(cx, cz);
    if (objs) {
      const m = new THREE.Mesh(objs, this.objectMat);
      this.objectRoot.add(m);
      built.push(m);
    }
    const scenery = this._chunkLocs(cx, cz);
    for (const im of scenery) this.objectRoot.add(im);
    for (const im of scenery) built.push(im);
    const water = this._chunkWater(cx, cz);
    if (water && water.moving) {
      const m = new THREE.Mesh(water.moving, this.waterMat);
      this.waterRoot.add(m);
      built.push(m);
    }
    if (water && water.still) {
      const m = new THREE.Mesh(water.still, this.stillWaterMat);
      this.stillWaterRoot.add(m);
      built.push(m);
    }
    /* Duplicate-mesh invariant (terrain-kit S1): every ground/water mesh is
       tagged with its (chunk, layer) so check-terrain-import can prove no
       chunk ever holds two copies of one layer after any rebuild path. */
    for (const m of built) {
      if (m.userData.layer) continue;
      const mt = m.material;
      m.userData.chunk = key;
      m.userData.layer =
        mt === this.groundMat ? "ground" : mt === this.underMat ? "under" :
        mt === this.blendMat ? "blend" : mt === this.goboBladeMat ? "blades" :
        mt === this.goboPitMat ? "pits" : mt === this.gravelMat ? "gravel" :
        mt === this.rockMat ? "rock" : mt === this.dirtMat ? "dirt" :
        mt === this.groundDecorMat ? "decor" : mt === this.shroomStemMat ? "stems" :
        mt === this.shroomCapMat ? "caps" : mt === this.waterMat ? "river" : mt === this.stillWaterMat ? "still" : "other";
    }
    this.chunks.set(key, built);
  }

  rebuildChunkAt(x, z) {
    this.buildChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  }

  gbProbe(x, z) {
    const facade = gbFacade(this.world);
    const t = this.world.tiles[z * this.world.w + x];
    const sp = splitDryTile(this.world, facade, x, z, t);
    if (!sp) return { t, uniform: true };
    return {
      t, c4: sp.c4,
      pieces: sp.pieces.map((p) => ({ cls: p.cls, n: p.poly.length })),
      chords: (sp.chords || []).length,
      jobs: grassRibbonJobs(sp.pieces, sp.chords, GB_FAM).map((j) => j.sides),
    };
  }

  setTrapHole(tx, tz, open) {
    this.trapHole.visible = !!open;
    if (open) {
      this.trapHole.position.set(
        tx + 0.5,
        this.world.heightAt(tx + 0.5, tz + 0.5) + 0.012,
        tz + 0.5
      );
    }
  }

  /* Paint the real scenery with the real scenery sheet.

     `locMat` is the one material every baked loc is drawn through
     (see _chunkLocs), and its atlas comes from the scenery bake - which main.js
     deliberately does NOT wait for (the boot races the bakes against an 8 s
     guard, so a slow connection gets the world instead of a loading card). A
     loc drawn through a material with no `map` is drawn in **flat white**: the
     geometry is the real cache model and the vertex colours are the client's own
     light, but the texture that carries every colour on top of them is simply
     absent. That is exactly what a player photographed on 2026-09-24 and what
     the user reported as "the wrong sprites that we had at the very very very
     beginning of development" - a world of real trees, tables and rocks drawn in
     white, standing on correctly-textured ground, because the *ground* material
     was re-textured when the terrain sheet arrived and this one never was.

     So the attachment lives here rather than in the constructor, and
     `rebuildAllChunks` (which is what runs when a bake lands late) calls it:
     by the time a real loc is placed, the material it is placed with is the one
     its own bake describes. Returns whether the material changed. */
  attachLocAtlas() {
    const atlas = locAtlas();
    if (!atlas || this.locMat.map === atlas) return false;
    const mask = locMask();
    this.locAtlasTex = atlas;
    this.locMat.map = atlas;
    this.locMat.alphaMap = mask || null;
    /* the atlas' alpha IS the leaf cut-out (see locmodels.js#packPage), and it
       rides in alphaMap with the test that turns its holes into holes */
    this.locMat.alphaTest = mask ? 0.5 : 0;
    this.locMat.needsUpdate = true;
    return true;
  }

  /* Real cache locs (trees, rocks, ...) are instanced and therefore only appear
     once the bake has loaded. If the world was built before then, every chunk is
     sitting on the procedural fallback scenery, so redraw them all. The same
     goes for the ground: without the terrain sheet the tiles are painted from
     the procedural atlas, so put the real floor textures on the two ground
     materials and redraw. Called by main.js when either bake lands late. */
  /* The still-water map tracks the live water art without ever scrolling: a
     private clone of the shared texture, pinned at offset zero (a clone made
     after scrolling started would inherit the shift). Called at boot and
     whenever the terrain lands late. */
  _syncStillWaterMap() {
    if (!terrainReady()) return;
    const swt = waterTexture();
    if (swt && this._stillWaterSrc !== swt) {
      const st = swt.clone();
      st.offset.set(0, 0);
      st.needsUpdate = true;
      this.stillWaterMat.map = st;
      this.stillWaterMat.needsUpdate = true;
      this._stillWaterSrc = swt;
    }
  }
  applyTerrainTextures() {
    if (!terrainReady()) return false;
    const tex = terrainTexture();
    const wt = waterTexture();
    if (this.groundMat.map !== tex) {
      this.groundMat.map = tex;
      this.groundMat.needsUpdate = true;
    }
    if (wt && this.waterMat.map !== wt) {
      this.waterMat.map = wt;
      this.waterMat.needsUpdate = true;
    }
    this._syncStillWaterMap();
    if (decorReady()) {
      const dt = decorTexture();
      if (this.groundDecorMat.map !== dt) {
        this.groundDecorMat.map = dt;
        this.groundDecorMat.needsUpdate = true;
      }
    }
    return true;
  }

  rebuildAllChunks() {
    /* Whatever is about to be drawn with the scenery sheet is drawn with the
       scenery sheet - this is the call that runs when the bake lands late
       (see attachLocAtlas), so it is where the material has to be brought up to
       date before a single real loc is placed. */
    this.attachLocAtlas();
    for (const key of [...this.chunks.keys()]) {
      const i = key.indexOf(",");
      this.buildChunk(+key.slice(0, i), +key.slice(i + 1));
    }
  }

  /* Roofs and doors are sized against the wall height, and the wall bake
     arrives asynchronously - so when the real walls land late, everything that
     lines up with them is rebuilt as well (main.js calls this right after
     rebuildAllChunks). */
  rebuildStructures() {
    for (const m of [...this.roofRoot.children]) this.roofRoot.remove(m);
    for (const m of [...this.doorRoot.children]) this.doorRoot.remove(m);
    for (const m of [...this.upstairsRoot.children]) {
      m.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      this.upstairsRoot.remove(m);
    }
    for (const bd of this.world.buildings) bd.roofMesh = null;
    for (const [, o] of this.world.objs) if (o.t === "door") o.mesh = null;
    this.doors.length = 0;
    this._buildRoofs();
    this._buildDoors();
    this._buildUpstairs();
  }

  /* The upper floor's slab: a wood ceiling over the ground room and the floor
     the upstairs walks on, spanning the building's whole footprint one level
     up. A plain box (closed faces read from both sides), rebuilt with the
     roofs it sits under. A tile carrying the upstairs flight stays open: the
     ladder comes up through its own stairwell hole, the way the real game's
     ladders pass through the floor above. */
  _buildUpstairs() {
    const up = this.world.upstairs;
    if (!up) return;
    let base = Infinity;
    for (let z = up.z0; z <= up.z1; z++) {
      for (let x = up.x0; x <= up.x1; x++) {
        base = Math.min(base, this.world.heightAt(x + 0.5, z + 0.5));
      }
    }
    if (!isFinite(base)) return;
    if (!this._upstairsMat) this._upstairsMat = new THREE.MeshLambertMaterial({ color: 0x9c7c50, emissive: 0x1c130a });
    const holes = new Set();
    for (let z = up.z0; z <= up.z1; z++) {
      for (let x = up.x0; x <= up.x1; x++) {
        const uo = this.world.upObjs.get(z * this.world.w + x);
        if (uo && (uo.t === "ladder_down" || uo.t === "ladder_up")) holes.add(x + "," + z);
      }
    }
    const thick = 0.15;
    const wb = new MeshBuilder();
    wb.setCell(this.uvs.solid);
    const slabCol = new THREE.Color(0x9c7c50);
    for (let z = up.z0; z <= up.z1; z++) {
      for (let x = up.x0; x <= up.x1; x++) {
        if (holes.has(x + "," + z)) continue;
        wb.box(x + 0.5, base + UP_Y - thick / 2, z + 0.5, 1, thick, 1, slabCol);
      }
    }
    const sgeo = wb.build();
    if (sgeo) this.upstairsRoot.add(new THREE.Mesh(sgeo, this._upstairsMat));
  }

  /* ------------------------------------------------------------------ fires
     A lit fire is an animated model (loc 2732 "Fire" -> src/models/fire.json:
     logs plus a flame that plays the game's own 600ms sequence), so it cannot
     be merged into a chunk's static geometry. Registered per tile instead, and
     stepped with its own clock. addFire is idempotent: a chunk rebuild calls it
     again for tiles that still hold a fire, and _chunkObjects drops the models
     of tiles that no longer do. */

  addFire(x, z, yOff = 0) {
    const key = this._fireKey(x, z);
    const existing = this.fires.get(key);
    if (existing) return existing;
    const ch = makeModelCharacter("fire");
    if (!ch) return null;
    ch.group.position.set(x + 0.5, this.world.heightAt(x + 0.5, z + 0.5) + yOff, z + 0.5);
    const w = this.world;
    if (w.cornerAt) {
      const h00 = w.cornerAt(x, z), h10 = w.cornerAt(x + 1, z);
      const h01 = w.cornerAt(x, z + 1), h11 = w.cornerAt(x + 1, z + 1);
      const vx = new THREE.Vector3(1, (h10 + h11) / 2 - (h00 + h01) / 2, 0);
      const vz = new THREE.Vector3(0, (h01 + h11) / 2 - (h00 + h10) / 2, 1);
      const n = new THREE.Vector3().crossVectors(vz, vx).normalize();
      ch.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    }
    this.fireRoot.add(ch.group);
    const f = { ch, x, z };
    this.fires.set(key, f);
    return f;
  }

  removeFire(x, z) {
    const key = this._fireKey(x, z);
    const f = this.fires.get(key);
    if (!f) return;
    this.fires.delete(key);
    if (f.ch.group.parent) f.ch.group.parent.remove(f.ch.group);
    if (f.ch.mesh) {
      f.ch.mesh.geometry.dispose();
      const mats = Array.isArray(f.ch.mesh.material) ? f.ch.mesh.material : [f.ch.mesh.material];
      for (const m of mats) if (m && m.dispose) m.dispose();
    }
  }

  addPlaque(x, z) {
    const key = x + ":" + z;
    if (this.plaques.has(key)) return this.plaques.get(key);
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, 512, 128);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "700 74px Georgia, 'Times New Roman', serif";
    g.fillStyle = "#d8d1bf";
    g.fillText("D I S C O R D", 256, 68);
    g.fillStyle = "#2b2823";
    g.fillText("D I S C O R D", 256, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    /* The engraving runs on all four faces of the plinth: one plane per side,
       each facing outward, all sharing the one texture. The plinth is 1.1 wide,
       so each face stands a hair past its half-width. */
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const y = this._baseY(x, z) + 0.2;
    const off = 0.55 + 0.006;
    const sides = [
      [x + 0.5, z + 0.5 + off, 0],
      [x + 0.5, z + 0.5 - off, Math.PI],
      [x + 0.5 + off, z + 0.5, Math.PI / 2],
      [x + 0.5 - off, z + 0.5, -Math.PI / 2],
    ];
    for (const [px, pz, ry] of sides) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.2375), mat);
      mesh.position.set(px, y, pz);
      mesh.rotation.y = ry;
      group.add(mesh);
    }
    this.objectRoot.add(group);
    this.plaques.set(key, group);
    return group;
  }

  /* Any fire this chunk no longer holds has been put out. */
  _pruneFires(x0, z0, x1, z1, live) {
    for (const [key, f] of this.fires) {
      if (live.has(key)) continue;
      if (f.x >= x0 && f.x < x1 && f.z >= z0 && f.z < z1) this.removeFire(f.x, f.z);
    }
  }

  _chunkGround(cx, cz) {
    const w = this.world;
    const b = new MeshBuilder();
    const gbOn = window.__groundBlend !== false;
    const bo = new MeshBuilder();
    const gb = new MeshBuilder();
    const gp = new MeshBuilder();
    const bu = new MeshBuilder();
    const eb = new MeshBuilder();
    const mst = new MeshBuilder();
    const mcp = new MeshBuilder();
    const gv = new MeshBuilder();
    const rk = new MeshBuilder();
    const dt = new MeshBuilder();
   const goboDest = (K) => (K === 0 || K === 1 || K === 9 || K === 16) ? gb
     : K === T.SAND ? gp : K === T.GRAVEL ? gv : K === T.ROCKGROUND ? rk : K === T.DIRT ? dt : gp;
    const L_RIBBON = 0.007, L_KIND = 0.013, L_BLADE = 0.019, L_SPILL = 0.025;
    const detLift = (dest) => dest === gb ? L_BLADE : L_KIND;
   const facade = gbOn ? gbFacade(w) : null;
    const famCornerCache = new Map();
    const famCornerRaw = (cx, cz) => {
      const k = cx + "," + cz;
      let c = famCornerCache.get(k);
      if (c === undefined) {
        let r = 0, g = 0, b = 0, n = 0;
        const ts = [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]];
        for (let i = 0; i < 4; i++) {
          const tx = ts[i][0], tz = ts[i][1];
          if (tx < 0 || tz < 0 || tx >= w.w || tz >= w.h) continue;
          const t2 = w.tiles[tz * w.w + tx];
          if (!GB_FAM.includes(t2)) continue;
          const cc = new THREE.Color(GB_BASE_HEX[t2]);
          r += cc.r; g += cc.g; b += cc.b; n++;
        }
        c = n ? [r / n, g / n, b / n] : null;
        famCornerCache.set(k, c);
      }
      return c;
    };
    const matCell = (cls) => {
      const gm = TILE_MATERIAL[cls] || TILE_MATERIAL[T.GRASS];
      return { mat: gm, cell: terrainUv(gm.key) || this.uvs[TILE_TEX[cls]] };
    };
    const fanEmit = (builder, pts, col, uvs, alphas) => {
      if (pts.length < 3) return;
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        s += A[0] * B[2] - B[0] * A[2];
      }
      const flip = s > 0;
      const UP = [0, 1, 0];
      for (const t of polyTris(pts)) {
        const ix = flip ? [t[0], t[2], t[1]] : t;
        if (alphas) triAlpha(builder, pts[ix[0]], pts[ix[1]], pts[ix[2]], col, alphas[ix[0]], alphas[ix[1]], alphas[ix[2]], uvs[ix[0]], uvs[ix[1]], uvs[ix[2]]);
        else builder.triUV(pts[ix[0]], pts[ix[1]], pts[ix[2]], UP, col, uvs[ix[0]], uvs[ix[1]], uvs[ix[2]]);
      }
    };
    const fanEmit3 = (builder, pts, cols, uvs, alphas, nrms) => {
      if (pts.length < 3) return;
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        s += A[0] * B[2] - B[0] * A[2];
      }
      const flip = s > 0;
      const UP = [0, 1, 0];
      for (const t of polyTris(pts)) {
        const ix = flip ? [t[0], t[2], t[1]] : t;
        if (alphas) triAlpha3N(builder, pts[ix[0]], pts[ix[1]], pts[ix[2]], nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], alphas[ix[0]], alphas[ix[1]], alphas[ix[2]], uvs[ix[0]], uvs[ix[1]], uvs[ix[2]]);
        else builder.triUV3N(pts[ix[0]], pts[ix[1]], pts[ix[2]], nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], uvs[ix[0]], uvs[ix[1]], uvs[ix[2]]);
      }
    };
    const strokeCol = (cls) => new THREE.Color(GB_BASE_HEX[cls] || 0xffffff).multiplyScalar(GB_STROKE[cls] || 0.6);
    const underCol = (cls, jt) => new THREE.Color(GB_BASE_HEX[cls] ?? 0xffffff).multiplyScalar(jt);
    const isUnder = (cls) => GB_UNDERLAY.has(cls);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, w.w);
    const z1 = Math.min(z0 + CHUNK, w.h);
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const t = w.tiles[z * w.w + x];
        const h00 = w.cornerAt(x, z);
        const h10 = w.cornerAt(x + 1, z);
        const h01 = w.cornerAt(x, z + 1);
        const h11 = w.cornerAt(x + 1, z + 1);
        const jit = (cx, cz) => 1 + (hash01(cx, cz, 17) * 0.07 - 0.035);
        const jx = [jit(x, z), jit(x + 1, z), jit(x + 1, z + 1), jit(x, z + 1)];
        const nrm = (cx, cz) => {
          const ax = Math.max(0, Math.min(w.w, cx - 1)), bx = Math.max(0, Math.min(w.w, cx + 1));
          const az = Math.max(0, Math.min(w.h, cz - 1)), bz = Math.max(0, Math.min(w.h, cz + 1));
          const dx = (w.cornerAt(ax, cz) - w.cornerAt(bx, cz)) / Math.max(1, bx - ax);
          const dz = (w.cornerAt(cx, az) - w.cornerAt(cx, bz)) / Math.max(1, bz - az);
          const l = Math.hypot(dx, 1, dz);
          return [dx / l, 1 / l, dz / l];
        };
        const jn = [nrm(x, z), nrm(x + 1, z), nrm(x + 1, z + 1), nrm(x, z + 1)];
        const vnorm = (u, v) => {
          const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
          const nx = jn[0][0] * w00 + jn[1][0] * w10 + jn[2][0] * w11 + jn[3][0] * w01;
          const ny = jn[0][1] * w00 + jn[1][1] * w10 + jn[2][1] * w11 + jn[3][1] * w01;
          const nz = jn[0][2] * w00 + jn[1][2] * w10 + jn[2][2] * w11 + jn[3][2] * w01;
          const l = Math.hypot(nx, ny, nz) || 1;
          return [nx / l, ny / l, nz / l];
        };
        const famTile = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([cx, cz], k) => {
          const c = famCornerRaw(cx, cz);
          if (!c) return null;
          const j = jx[k];
          return [c[0] * j, c[1] * j, c[2] * j];
        });
        const famCol = (cls, u, v) => {
          const fb = new THREE.Color(GB_BASE_HEX[cls] ?? 0xffffff);
          const A = famTile[0] || [fb.r * jx[0], fb.g * jx[0], fb.b * jx[0]];
          const B = famTile[1] || [fb.r * jx[1], fb.g * jx[1], fb.b * jx[1]];
          const C = famTile[2] || [fb.r * jx[2], fb.g * jx[2], fb.b * jx[2]];
          const D = famTile[3] || [fb.r * jx[3], fb.g * jx[3], fb.b * jx[3]];
          const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
          return new THREE.Color(
            A[0] * w00 + B[0] * w10 + C[0] * w11 + D[0] * w01,
            A[1] * w00 + B[1] * w10 + C[1] * w11 + D[1] * w01,
            A[2] * w00 + B[2] * w10 + C[2] * w11 + D[2] * w01
          );
        };
       const clsCorners = (() => {
         const cache = new Map();
          return (cls) => {
            let a = cache.get(cls);
            if (!a) {
              if (isUnder(cls)) {
                a = [0, 1, 2, 3].map((k) => {
                  const c = underCol(cls, jx[k]);
                  return [c.r, c.g, c.b];
                });
              } else {
                const gm = TILE_MATERIAL[cls] || TILE_MATERIAL[T.GRASS];
                a = [0, 1, 2, 3].map((k) => [gm.tint[0] * jx[k], gm.tint[1] * jx[k], gm.tint[2] * jx[k]]);
              }
              cache.set(cls, a);
            }
            return a;
          };
        })();
        const bilCol = (cls, u, v) => {
          if (GB_FAM.includes(cls)) return famCol(cls, u, v);
          const cc = clsCorners(cls);
          const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
          return new THREE.Color(
            cc[0][0] * w00 + cc[1][0] * w10 + cc[2][0] * w11 + cc[3][0] * w01,
            cc[0][1] * w00 + cc[1][1] * w10 + cc[2][1] * w11 + cc[3][1] * w01,
            cc[0][2] * w00 + cc[1][2] * w10 + cc[2][2] * w11 + cc[3][2] * w01
          );
        };
        const wdk = (h) => 1 - clamp(w.waterLevel - h, 0, 6) / 6 * 0.55;
        /* The second shaft's open pit (tile flagged src/world.js#shaft): the
           1x1 ground tile is sculpted out completely - no surface quad - and
           the hole drops three tiles straight down (past a full wall height),
           its four walls in the dirt texture tiled once per level, with a
           dark earth bottom face closing it. The town ladder stands sunk
           halfway into its mouth. Purely visual (the tile stays solid);
           chunked with the ground so rebuilds keep it. */
        const so = w.objAt(x, z);
        if (so && so.shaft) {
          const D = 3.0;
          const dirtCell = terrainUv("dirt");
          if (dirtCell) b.setCell(dirtCell);
          else b.setCell(this.uvs[TILE_TEX[T.DIRT]]);
          const dirtCol = new THREE.Color(0.9, 0.86, 0.8);
          b.tiledQuad([x, h00, z], [x, h00 - D, z], [x + 1, h10 - D, z], [x + 1, h10, z], dirtCol, 1, 3);
          b.tiledQuad([x + 1, h11, z + 1], [x + 1, h11 - D, z + 1], [x, h01 - D, z + 1], [x, h01, z + 1], dirtCol, 1, 3);
          b.tiledQuad([x, h01, z + 1], [x, h01 - D, z + 1], [x, h00 - D, z], [x, h00, z], dirtCol, 1, 3);
          b.tiledQuad([x + 1, h10, z], [x + 1, h10 - D, z], [x + 1, h11 - D, z + 1], [x + 1, h11, z + 1], dirtCol, 1, 3);
          const yb = Math.min(h00, h10, h01, h11) - D;
          b.quad([x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1], new THREE.Color(0.02, 0.02, 0.025));
          /* Flush turf collar: the ladder rides slimmed (sx/sz under 1) so its
             footplate sits inset from the tile edges. This ring fills that
             outset gap with the tile's own grass texture, flush at grade, so
             the mouth meets the turf with no step and no flat-green moat. The
             hole overlaps the plate edge slightly and sits a hair under its top
             edge, so no seam and no z-fight; it never touches the rails, which
             stand inside the plate footprint. Each strip samples the slice of
             the grass cell its own tile-local rect covers - the same texels the
             missing ground quad would have shown, at the same 1-repeat-per-tile
             density - never a squeezed whole cell, so the ring is
             pixel-continuous with the neighbouring turf. */
          const gmat = TILE_MATERIAL[t] || TILE_MATERIAL[T.GRASS];
          const gcell = terrainUv(gmat.key) || this.uvs[TILE_TEX[t]];
          if (!isUnder(t)) {
            if (terrainUv(gmat.key)) b.setCell(terrainUv(gmat.key));
            else b.setCell(this.uvs[TILE_TEX[t]]);
          }
          const gj = 1 + (hash01(x, z, 17) * 0.07 - 0.035);
          const gcol = isUnder(t) ? underCol(t, gj)
            : new THREE.Color(gmat.tint[0] * gj, gmat.tint[1] * gj, gmat.tint[2] * gj);
          const psx = (so.sx || 1), psz = (so.sz || 1);
          const ix0 = 0.5 - 0.5 * psx + 0.01, ix1 = 0.5 + 0.5 * psx - 0.01;
          const iz0 = 0.5 - 0.5 * psz + 0.01, iz1 = 0.5 + 0.5 * psz - 0.01;
          const gy = (u, v) => (h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v) - 0.002;
          const gx = (u) => x + u, gz = (v) => z + v;
          const UP = [0, 1, 0];
          const cuv = (u, v) => [gcell.u0 + u * (gcell.u1 - gcell.u0), gcell.v0 + v * (gcell.v1 - gcell.v0)];
          const strip = (u0, v0, u1, v1) => {
            const A = [gx(u0), gy(u0, v0), gz(v0)], B = [gx(u1), gy(u1, v0), gz(v0)];
            const C = [gx(u1), gy(u1, v1), gz(v1)], D = [gx(u0), gy(u0, v1), gz(v1)];
            const dst = isUnder(t) ? bu : b;
            /* up-facing winding: the (A,B,C)/(A,C,D) order faces down (it is
               the order quad() flips), so emit flipped like quad()'s ny<0
               branch does, or the GPU culls the ring from above */
            dst.triUV(A, C, B, UP, gcol, cuv(u0, v0), cuv(u1, v1), cuv(u1, v0));
            dst.triUV(A, D, C, UP, gcol, cuv(u0, v0), cuv(u0, v1), cuv(u1, v1));
          };
          /* Outset fill: the plate sits inset, so this ring covers the gap. */
          strip(0, 0, 1, iz0);
          strip(0, iz1, 1, 1);
          strip(0, iz0, ix0, iz1);
          strip(ix1, iz0, 1, iz1);
          continue;
        }
        /* Cut-tile shores (see src/mapgen/edge-rules.md): a tile straddling
           the waterline is divided by its true contour (src/mapgen/contour.js,
           vendored read-only) instead of drawn as one full quad. The land
           loop wears the tile's own texture, the water loop the bed texture,
           and the shared edge is derived from the shared corners alone, so
           neighbouring cut tiles agree exactly and no crack can open. The
           river surface over the water loop is emitted in _chunkWater. */
        const thr = w.waterLevel + 0.04;
        const nDry = (h00 >= thr ? 1 : 0) + (h10 >= thr ? 1 : 0) + (h11 >= thr ? 1 : 0) + (h01 >= thr ? 1 : 0);
        if (nDry > 0 && nDry < 4 && !(w.stepAt && w.stepAt(x, z)) && window.__cutTiles !== false) {
          const cut = contourTile(h00, h10, h01, h11, thr);
          const gy = (u, v) => h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h11 * u * v + h01 * (1 - u) * v;
          const ch = contourHeightOf(cut, gy, thr);
          const UP = [0, 1, 0];
          const lineSet = new Set(cut.line.map(nodeKey));
          const hgt = (P) => {
            if (gbOn) {
              const pin = ornHeightLab(facade, x, z, P);
              if (pin) {
                if (pin[1] === 1 || pin[1] === -1) {
                  const wz = z + (pin[1] + 1) / 2;
                  return (w.cornerAt(x, wz) + w.cornerAt(x + 1, wz)) / 2;
                }
                const wx = x + (pin[0] + 1) / 2;
                return (w.cornerAt(wx, z) + w.cornerAt(wx, z + 1)) / 2;
              }
            }
            if (lineSet.has(nodeKey(P))) return thr;
            const u = (P[0] + 1) / 2, v = (P[1] + 1) / 2;
            return gy(u, v);
          };
          const wpos = (P, lift) => [x + (P[0] + 1) / 2, hgt(P) + lift, z + (P[1] + 1) / 2];
          const emitGroundPieces = (pieces) => {
            const pnorm = (P) => vnorm((P[0] + 1) / 2, (P[1] + 1) / 2);
            for (const part of pieces) {
              const nrms = part.poly.map(pnorm);
              if (isUnder(part.cls)) {
                const pts = part.poly.map((P) => wpos(P, 0));
                const cols = part.poly.map((P) => bilCol(part.cls, (P[0] + 1) / 2, (P[1] + 1) / 2));
                const uvs = part.poly.map(() => [0.5, 0.5]);
                fanEmit3(bu, pts, cols, uvs, null, nrms);
                continue;
              }
              const { cell } = matCell(part.cls);
              const pts = part.poly.map((P) => wpos(P, 0));
              const cols = part.poly.map((P) => {
                const c = bilCol(part.cls, (P[0] + 1) / 2, (P[1] + 1) / 2);
                if (part.cls === T.WATERBED) return c.multiplyScalar(wdk(hgt(P)));
                return c;
              });
              const uvs = part.poly.map((P) => {
                const u = (P[0] + 1) / 2, v = (P[1] + 1) / 2;
                return [cell.u0 + u * (cell.u1 - cell.u0), cell.v0 + v * (cell.v1 - cell.v0)];
              });
              fanEmit3(b, pts, cols, uvs, null, nrms);
            }
          };
          const emitOverlays = (pieces, chords, c4, loop) => {
            const edgeNt = [
              z > 0 ? w.tiles[(z - 1) * w.w + x] : -1,
              z + 1 < w.h ? w.tiles[(z + 1) * w.w + x] : -1,
              x > 0 ? w.tiles[z * w.w + x - 1] : -1,
              x + 1 < w.w ? w.tiles[z * w.w + x + 1] : -1,
            ];
            for (const part of pieces) {
              const K = part.cls;
              if (!GB_DETAIL_K.has(K)) continue;
              const bounds = [];
              for (const chd of chords || []) {
                const sd = chordSides(chd, pieces);
                if (sd.length === 2 && sd.every((c) => goboFam(c) === goboFam(K))) continue;
                bounds.push([chd[0], chd[1]]);
              }
              const edges = [
                [NW_L, NE_L, c4[0], c4[1], edgeNt[0]],
                [SW_L, SE_L, c4[3], c4[2], edgeNt[1]],
                [NW_L, SW_L, c4[0], c4[3], edgeNt[2]],
                [NE_L, SE_L, c4[1], c4[2], edgeNt[3]],
              ];
              for (const [A, B, ca, cb, nt] of edges) {
                if (goboFam(ca) === goboFam(K) && goboFam(cb) === goboFam(K) && goboFam(nt) === goboFam(K)) continue;
                bounds.push([A, B]);
              }
              if (loop) {
                for (let i = 0; i < loop.length; i++) {
                  const A = loop[i], Bq = loop[(i + 1) % loop.length];
                  if (lineSet.has(nodeKey(A)) && lineSet.has(nodeKey(Bq))) bounds.push([A, Bq]);
                }
              }
              const strength = GB_STRENGTH[K] ?? 0.6;
              const cells = detailCells([part.poly], bounds, 4, 0, 0.25, strength);
              const sc = strokeCol(K);
              const dest = goboDest(K);
              for (const c of cells) {
                const pts = [], uvs = [], al = [];
                for (const [u, v, a] of c.poly) {
                  const L = [u * 2 - 1, v * 2 - 1];
                  pts.push([x + u, hgt(L) + detLift(dest), z + v]);
                  uvs.push([(x + u) / 4, (z + v) / 4]);
                  al.push(a);
                }
                fanEmit(dest, pts, sc, uvs, al);
              }
            }
          };
          const NW_L = [-1, -1], NE_L = [1, -1], SE_L = [1, 1], SW_L = [-1, 1];
          const TILE_SQ_L = [NW_L, NE_L, SE_L, SW_L];
          const emitLoop = (loop, cls) => {
            if (!gbOn) {
              const P = loop.map((L) => {
                const u = (L[0] + 1) / 2, v = (L[1] + 1) / 2;
                return { p: [x + u, ch(L), z + v], uv: [u, v] };
              });
              if (isUnder(cls)) {
                const cols = P.map((q) => bilCol(cls, q.uv[0], q.uv[1]));
                const nrms = P.map((q) => vnorm(q.uv[0], q.uv[1]));
                for (const t of polyTris(P.map((q) => q.p))) {
                  const ix = [t[0], t[2], t[1]];
                  bu.triUV3N(P[ix[0]].p, P[ix[1]].p, P[ix[2]].p, nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], P[ix[0]].uv, P[ix[1]].uv, P[ix[2]].uv);
                }
                return;
              }
              const gmat = TILE_MATERIAL[cls] || TILE_MATERIAL[T.GRASS];
              const cell = terrainUv(gmat.key) || this.uvs[TILE_TEX[cls]];
              const Q = P.map(({ p, uv }) => ({ p, uv: [cell.u0 + uv[0] * (cell.u1 - cell.u0), cell.v0 + uv[1] * (cell.v1 - cell.v0)] }));
              const cols = P.map((q) => {
                const c = bilCol(cls, q.uv[0], q.uv[1]);
                if (cls === T.WATERBED) return c.multiplyScalar(wdk(q.p[1]));
                return c;
              });
              const nrms = P.map((q) => vnorm(q.uv[0], q.uv[1]));
              for (const t of polyTris(Q.map((q) => q.p))) {
                const ix = [t[0], t[2], t[1]];
                b.triUV3N(Q[ix[0]].p, Q[ix[1]].p, Q[ix[2]].p, nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], Q[ix[0]].uv, Q[ix[1]].uv, Q[ix[2]].uv);
              }
              return;
            }
            if (cls === T.WATERBED) {
              const gmat = TILE_MATERIAL[cls] || TILE_MATERIAL[T.GRASS];
              const cell = terrainUv(gmat.key) || this.uvs[TILE_TEX[cls]];
              const P = loop.map((L) => {
                const u = (L[0] + 1) / 2, v = (L[1] + 1) / 2;
                return { p: [x + u, ch(L), z + v], uv: [cell.u0 + u * (cell.u1 - cell.u0), cell.v0 + v * (cell.v1 - cell.v0)], w: [u, v] };
              });
              const cols = P.map((q) => {
                const c = bilCol(cls, q.w[0], q.w[1]);
                return c.multiplyScalar(wdk(q.p[1]));
              });
              const nrms = P.map((q) => vnorm(q.w[0], q.w[1]));
              for (const t of polyTris(P.map((q) => q.p))) {
                const ix = [t[0], t[2], t[1]];
                b.triUV3N(P[ix[0]].p, P[ix[1]].p, P[ix[2]].p, nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], P[ix[0]].uv, P[ix[1]].uv, P[ix[2]].uv);
              }
              return;
            }
            const cw2 = facade.cw, cc2 = facade.cornerCls;
            const c4 = [cc2[z * cw2 + x], cc2[z * cw2 + x + 1], cc2[(z + 1) * cw2 + x + 1], cc2[(z + 1) * cw2 + x]];
            if (!GB_SPLIT_SET.has(cls) || c4.some((c) => c !== 5 && !GB_SPLIT_SET.has(c))) {
              if (isUnder(cls)) {
                const P = loop.map((L) => {
                  const u = (L[0] + 1) / 2, v = (L[1] + 1) / 2;
                  return { p: [x + u, ch(L), z + v], uv: [u, v] };
                });
                const cols = P.map((q) => bilCol(cls, q.uv[0], q.uv[1]));
                const nrms = P.map((q) => vnorm(q.uv[0], q.uv[1]));
                for (const t of polyTris(P.map((q) => q.p))) {
                  const ix = [t[0], t[2], t[1]];
                  bu.triUV3N(P[ix[0]].p, P[ix[1]].p, P[ix[2]].p, nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], P[ix[0]].uv, P[ix[1]].uv, P[ix[2]].uv);
                }
                return;
              }
              const gmat = TILE_MATERIAL[cls] || TILE_MATERIAL[T.GRASS];
              const cell = terrainUv(gmat.key) || this.uvs[TILE_TEX[cls]];
              const P = loop.map((L) => {
                const u = (L[0] + 1) / 2, v = (L[1] + 1) / 2;
                return { p: [x + u, ch(L), z + v], uv: [cell.u0 + u * (cell.u1 - cell.u0), cell.v0 + v * (cell.v1 - cell.v0)], w: [u, v] };
              });
              const cols = P.map((q) => bilCol(cls, q.w[0], q.w[1]));
              const nrms = P.map((q) => vnorm(q.w[0], q.w[1]));
              for (const t of polyTris(P.map((q) => q.p))) {
                const ix = [t[0], t[2], t[1]];
                b.triUV3N(P[ix[0]].p, P[ix[1]].p, P[ix[2]].p, nrms[ix[0]], nrms[ix[1]], nrms[ix[2]], cols[ix[0]], cols[ix[1]], cols[ix[2]], P[ix[0]].uv, P[ix[1]].uv, P[ix[2]].uv);
              }
              return;
            }
            const sc = splitShoreLoop(w, facade, x, z, loop, cls, cls);
            emitGroundPieces(sc.pieces);
            emitOverlays(sc.pieces, sc.chords, sc.c4, loop);
          };
          const landCls = (t === T.WATERBED) ? T.SAND : t;
          for (const loop of cut.land) emitLoop(loop, landCls);
          for (const loop of cut.water) emitLoop(loop, T.WATERBED);
          continue;
        }
        /* The client jitters a tile's light a little so a flat field is not a
           single flat colour; the same 7% here keeps the real textures from
           reading as a printed sheet. */
        const TILE_SQ_D = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        if (gbOn && !(w.stepAt && w.stepAt(x, z)) && GB_SPLIT_SET.has(t)) {
          const sp = splitDryTile(w, facade, x, z, t);
          if (sp) {
            const hgtD = (P) => {
              const pin = ornHeightLab(facade, x, z, P);
              if (pin) {
                if (pin[1] === 1 || pin[1] === -1) {
                  const wz = z + (pin[1] + 1) / 2;
                  return (w.cornerAt(x, wz) + w.cornerAt(x + 1, wz)) / 2;
                }
                const wx = x + (pin[0] + 1) / 2;
                return (w.cornerAt(wx, z) + w.cornerAt(wx, z + 1)) / 2;
              }
              const u = (P[0] + 1) / 2, v = (P[1] + 1) / 2;
              return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
            };
            const wposD = (P, lift) => [x + (P[0] + 1) / 2, hgtD(P) + lift, z + (P[1] + 1) / 2];
            const pnormD = (P) => vnorm((P[0] + 1) / 2, (P[1] + 1) / 2);
            for (const part of sp.pieces) {
              const nrms = part.poly.map(pnormD);
              if (isUnder(part.cls)) {
                const pts = part.poly.map((P) => wposD(P, 0));
                const cols = part.poly.map((P) => bilCol(part.cls, (P[0] + 1) / 2, (P[1] + 1) / 2));
                const uvs = part.poly.map(() => [0.5, 0.5]);
                fanEmit3(bu, pts, cols, uvs, null, nrms);
                continue;
              }
              const { cell: cc } = matCell(part.cls);
              const pts = part.poly.map((P) => wposD(P, 0));
              const cols = part.poly.map((P) => bilCol(part.cls, (P[0] + 1) / 2, (P[1] + 1) / 2));
              const uvs = part.poly.map((P) => {
                const u = (P[0] + 1) / 2, v = (P[1] + 1) / 2;
                return [cc.u0 + u * (cc.u1 - cc.u0), cc.v0 + v * (cc.v1 - cc.v0)];
              });
              fanEmit3(b, pts, cols, uvs, null, nrms);
            }
            const edgeNtD = [
              z > 0 ? w.tiles[(z - 1) * w.w + x] : t,
              z + 1 < w.h ? w.tiles[(z + 1) * w.w + x] : t,
              x > 0 ? w.tiles[z * w.w + x - 1] : t,
              x + 1 < w.w ? w.tiles[z * w.w + x + 1] : t,
            ];
            const spill = sandSpillJob(w, facade, x, z, t, sp.pieces, sp.chords);
            for (const part of sp.pieces) {
              const K = part.cls;
              if (!GB_DETAIL_K.has(K)) continue;
              const bounds = [];
              for (const chd of sp.chords || []) {
                const sd = chordSides(chd, sp.pieces);
                if (sd.length === 2 && sd.every((c) => goboFam(c) === goboFam(K))) continue;
                if (spill && goboFam(K) === 0 && sd.length === 2 && sd.includes(4) && sd.some((c) => goboFam(c) === 0)) continue;
                bounds.push([chd[0], chd[1]]);
              }
              const c4d = sp.c4;
              const egs = [
                ['n', [-1, -1], [1, -1], c4d[0], c4d[1], edgeNtD[0]],
                ['s', [-1, 1], [1, 1], c4d[3], c4d[2], edgeNtD[1]],
                ['w', [-1, -1], [-1, 1], c4d[0], c4d[3], edgeNtD[2]],
                ['e', [1, -1], [1, 1], c4d[1], c4d[2], edgeNtD[3]],
              ];
              for (const [ek, A, B, ca, cb, nt] of egs) {
                if (goboFam(ca) === goboFam(K) && goboFam(cb) === goboFam(K) && goboFam(nt) === goboFam(K)) continue;
                if (spill && spill.edge[ek] && goboFam(K) === 0) continue;
                bounds.push([A, B]);
              }
              const strength = GB_STRENGTH[K] ?? 0.6;
              const cells = detailCells([part.poly], bounds, 4, 0, 0.25, strength);
              /* One material per triangle: the spill claims these same cells
                 (same grid, same clip poly) for the blade sheet, so the pit
                 sheet stands down wherever the spill emits. */
              const spillHit = spill && spill.sandPolys.length && part.cls === T.SAND
                ? (u, v) => {
                  const L = [u * 2 - 1, v * 2 - 1];
                  let d = Infinity;
                  for (const s of spill.segs) {
                    const dd = segDist(L, [s.ax, s.az], [s.bx, s.bz]);
                    if (dd < d) d = dd;
                  }
                  return d <= GB_SPILL_W_TILES * 2;
                }
                : null;
              const sc = strokeCol(K);
              const dest = goboDest(K);
              for (const c of cells) {
                if (spillHit && c.poly.some(([u, v]) => spillHit(u, v))) continue;
                const pts = [], uvs = [], al = [];
                for (const [u, v, a] of c.poly) {
                  const L = [u * 2 - 1, v * 2 - 1];
                  pts.push([x + u, hgtD(L) + detLift(dest), z + v]);
                  uvs.push([(x + u) / 4, (z + v) / 4]);
                  al.push(a);
                }
                fanEmit(dest, pts, sc, uvs, al);
              }
            }
            if (spill && spill.sandPolys.length) {
              const spillCellsOut = spillCells(spill.sandPolys, spill.segs, 4, GB_SPILL_W_TILES * 2, GB_SPILL_STRENGTH);
              const ssc = strokeCol(0);
              for (const c of spillCellsOut) {
                const pts = [], uvs = [], al = [];
                for (const [u, v, a] of c.poly) {
                  const L = [u * 2 - 1, v * 2 - 1];
                  pts.push([x + u, hgtD(L) + L_SPILL, z + v]);
                  uvs.push([(x + u) / 4, (z + v) / 4]);
                  al.push(a);
                }
                fanEmit(gb, pts, ssc, uvs, al);
              }
            }
            this._groundDecor(eb, w, x, z, h00, h10, h01, h11);
            this._mushroomCircle(mst, mcp, w, x, z, h00, h10, h01, h11);
            continue;
          }
        }
        if (isUnder(t)) {
          const fc = GB_FAM.includes(t) ? famTile.map((c) => new THREE.Color(c[0], c[1], c[2])) : null;
          const c00 = fc ? fc[0] : underCol(t, jit(x, z)), c10 = fc ? fc[1] : underCol(t, jit(x + 1, z));
          const c11 = fc ? fc[2] : underCol(t, jit(x + 1, z + 1)), c01 = fc ? fc[3] : underCol(t, jit(x, z + 1));
          bu.quad3n([x, h00, z], [x + 1, h10, z], [x + 1, h11, z + 1], [x, h01, z + 1],
            jn[0], jn[1], jn[2], jn[3],
            c00, c10, c11, c01, [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]);
          if (GB_DETAIL_K.has(t)) {
            const nT = z > 0 ? w.tiles[(z - 1) * w.w + x] : t;
            const sT = z + 1 < w.h ? w.tiles[(z + 1) * w.w + x] : t;
            const wT = x > 0 ? w.tiles[z * w.w + x - 1] : t;
            const eT = x + 1 < w.w ? w.tiles[z * w.w + x + 1] : t;
            const spill = sandSpillJob(w, facade, x, z, t, null, null);
            const SPILL_W = GB_SPILL_W_TILES * 2;
            const spillLive = spill && spill.sandPolys.length
              ? (u, v) => {
                const L = [u * 2 - 1, v * 2 - 1];
                let d = Infinity;
                for (const s of spill.segs) {
                  const dd = segDist(L, [s.ax, s.az], [s.bx, s.bz]);
                  if (dd < d) d = dd;
                }
                return d <= SPILL_W;
              }
              : null;
            const gf = goboFam(t) === 0;
            const bounds = [];
            if (!(spill && spill.edge.n && gf) && goboFam(nT) !== goboFam(t)) bounds.push([[-1, -1], [1, -1]]);
            if (!(spill && spill.edge.s && gf) && goboFam(sT) !== goboFam(t)) bounds.push([[-1, 1], [1, 1]]);
            if (!(spill && spill.edge.w && gf) && goboFam(wT) !== goboFam(t)) bounds.push([[-1, -1], [-1, 1]]);
            if (!(spill && spill.edge.e && gf) && goboFam(eT) !== goboFam(t)) bounds.push([[1, -1], [1, 1]]);
            const hgtU = (P) => {
              const u = (P[0] + 1) / 2, v = (P[1] + 1) / 2;
              return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
            };
            const cells = detailCells([[[-1, -1], [1, -1], [1, 1], [-1, 1]]], bounds, 4, 0, 0.25, GB_STRENGTH[t] ?? 0.6);
            const sc = strokeCol(t);
            const dest = goboDest(t);
            for (const c of cells) {
              if (spillLive && c.poly.some(([u, v]) => spillLive(u, v))) continue;
              const pts = [], uvs = [], al = [];
              for (const [u, v, a] of c.poly) {
                const L = [u * 2 - 1, v * 2 - 1];
                pts.push([x + u, hgtU(L) + detLift(dest), z + v]);
                uvs.push([(x + u) / 4, (z + v) / 4]);
                al.push(a);
              }
              fanEmit(dest, pts, sc, uvs, al);
            }
            if (spill && spill.sandPolys.length) {
              const spillCellsOut = spillCells(spill.sandPolys, spill.segs, 4, GB_SPILL_W_TILES * 2, GB_SPILL_STRENGTH);
              const ssc = strokeCol(0);
              for (const c of spillCellsOut) {
                const pts = [], uvs = [], al = [];
                for (const [u, v, a] of c.poly) {
                  const L = [u * 2 - 1, v * 2 - 1];
                  pts.push([x + u, hgtU(L) + L_SPILL, z + v]);
                  uvs.push([(x + u) / 4, (z + v) / 4]);
                  al.push(a);
                }
                fanEmit(gb, pts, ssc, uvs, al);
              }
            }
          }
        } else {
        const mat = TILE_MATERIAL[t] || TILE_MATERIAL[T.GRASS];
        const cell = terrainUv(mat.key);
        /* the bed of the river darkens with depth, so the water above it
           reads as deep water rather than a flat sheet */
        const jitC = (cx, cz, h) => {
          const jj = jit(cx, cz);
          if (t === T.WATERBED) {
            const d = clamp(w.waterLevel - h, 0, 6) / 6;
            if (cell) return new THREE.Color(mat.tint[0] * jj, mat.tint[1] * jj, mat.tint[2] * jj).multiplyScalar(1 - d * 0.55);
            return new THREE.Color(1, 1, 1).lerp(new THREE.Color(0.34, 0.48, 0.42), d * 0.85);
          }
          if (cell) return new THREE.Color(mat.tint[0] * jj, mat.tint[1] * jj, mat.tint[2] * jj);
          return new THREE.Color(jj, jj, jj);
        };
        const d00 = jitC(x, z, h00), d10 = jitC(x + 1, z, h10), d11 = jitC(x + 1, z + 1, h11), d01 = jitC(x, z + 1, h01);
        if (cell) {
          b.setCell(cell);
          const u0 = cell.u0, u1 = cell.u1, v0 = cell.v0, v1 = cell.v1;
          b.quad3n([x, h00, z], [x + 1, h10, z], [x + 1, h11, z + 1], [x, h01, z + 1],
            jn[0], jn[1], jn[2], jn[3],
            d00, d10, d11, d01, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
        } else {
          b.setCell(this.uvs[TILE_TEX[t]]);
          const q = this.uvs[TILE_TEX[t]];
          b.quad3n([x, h00, z], [x + 1, h10, z], [x + 1, h11, z + 1], [x, h01, z + 1],
            jn[0], jn[1], jn[2], jn[3],
            d00, d10, d11, d01, [q.u0, q.v0], [q.u1, q.v0], [q.u1, q.v1], [q.u0, q.v1]);
        }
        if (GB_DETAIL_K.has(t)) {
          const nT = z > 0 ? w.tiles[(z - 1) * w.w + x] : t;
          const sT = z + 1 < w.h ? w.tiles[(z + 1) * w.w + x] : t;
          const wT = x > 0 ? w.tiles[z * w.w + x - 1] : t;
          const eT = x + 1 < w.w ? w.tiles[z * w.w + x + 1] : t;
          const spill = sandSpillJob(w, facade, x, z, t, null, null);
          /* One material per triangle: the spill claims these same cells
             (same grid, same clip square) for the blade sheet, so the pit
             sheet stands down wherever the spill emits. */
          const SPILL_W = GB_SPILL_W_TILES * 2;
          const spillLive = spill && spill.sandPolys.length
            ? (u, v) => {
              const L = [u * 2 - 1, v * 2 - 1];
              let d = Infinity;
              for (const s of spill.segs) {
                const dd = segDist(L, [s.ax, s.az], [s.bx, s.bz]);
                if (dd < d) d = dd;
              }
              return d <= SPILL_W;
            }
            : null;
          const gf = goboFam(t) === 0;
          const bounds = [];
          if (!(spill && spill.edge.n && gf) && goboFam(nT) !== goboFam(t)) bounds.push([[-1, -1], [1, -1]]);
          if (!(spill && spill.edge.s && gf) && goboFam(sT) !== goboFam(t)) bounds.push([[-1, 1], [1, 1]]);
          if (!(spill && spill.edge.w && gf) && goboFam(wT) !== goboFam(t)) bounds.push([[-1, -1], [-1, 1]]);
          if (!(spill && spill.edge.e && gf) && goboFam(eT) !== goboFam(t)) bounds.push([[1, -1], [1, 1]]);
          const hgtG = (u, v) => h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
          const cells = detailCells([[[-1, -1], [1, -1], [1, 1], [-1, 1]]], bounds, 4, 0, 0.25, GB_STRENGTH[t] ?? 0.6);
          const sc = strokeCol(t);
          const dest = goboDest(t);
          for (const c of cells) {
            if (spillLive && c.poly.some(([u, v]) => spillLive(u, v))) continue;
            const pts = [], uvs = [], al = [];
            for (const [u, v, a] of c.poly) {
              pts.push([x + u, hgtG(u, v) + detLift(dest), z + v]);
              uvs.push([(x + u) / 4, (z + v) / 4]);
              al.push(a);
            }
            fanEmit(dest, pts, sc, uvs, al);
          }
          if (spill && spill.sandPolys.length) {
            const spillCellsOut = spillCells(spill.sandPolys, spill.segs, 4, GB_SPILL_W_TILES * 2, GB_SPILL_STRENGTH);
            const ssc = strokeCol(0);
            for (const c of spillCellsOut) {
              const pts = [], uvs = [], al = [];
              for (const [u, v, a] of c.poly) {
                pts.push([x + u, hgtG(u, v) + L_SPILL, z + v]);
                uvs.push([(x + u) / 4, (z + v) / 4]);
                al.push(a);
              }
              fanEmit(gb, pts, ssc, uvs, al);
            }
          }
        }
        }
        this._groundDecor(eb, w, x, z, h00, h10, h01, h11);
        this._mushroomCircle(mst, mcp, w, x, z, h00, h10, h01, h11);
      }
    }
    return {
      ground: b.count() ? b.build() : null,
      under: bu.count() ? bu.build() : null,
      blend: bo.count() ? bo.buildWithAlpha() : null,
      blades: gb.count() ? gb.buildWithAlpha() : null,
      pits: gp.count() ? gp.buildWithAlpha() : null,
      decor: eb.count() ? eb.build() : null,
      stems: mst.count() ? mst.build() : null,
      caps: mcp.count() ? mcp.build() : null,
      gravel: gv.count() ? gv.buildWithAlpha() : null,
      rock: rk.count() ? rk.buildWithAlpha() : null,
      dirt: dt.count() ? dt.buildWithAlpha() : null,
    };
  }

  _groundDecor(eb, w, x, z, h00, h10, h01, h11) {
    if (!TUT_DECOR.on || !decorReady()) return;
    const thr = w.waterLevel + 0.04;
    const mn = Math.min(h00, h10, h01, h11);
    const mx = Math.max(h00, h10, h01, h11);
    const t = w.tiles[z * w.w + x];
    /* The cay's beaches draw the beach-life pool (shells + the island's own
       starfish/cockle row) instead of the mainland sand mix. Indexes 8+
       address beachCut past the end of cut. The sloped shore wears decals
       too (user ask 2026-10-30): the beach keeps tiles with any dry land
       (not just fully-dry ones) and rides far steeper banks than the
       mainland's flat-quad limit. */
    const isBeach = t === 4 && inTutIsleBox(x, z);
    if (isBeach ? mx < thr : mn < thr) return;
    if (mx - mn > (isBeach ? 1.2 : TUT_DECOR.slopeMax)) return;
    const pool = isBeach ? TUT_DECOR.beachPool : TUT_DECOR.pools[t];
    if (!pool || !pool.length) return;
    const drift = decorDrift(x, z);
    const rate = (t === 4 && inTutIsleBox(x, z)) ? TUT_DECOR.rate * (TUT_DECOR.beachRate || 1) : TUT_DECOR.rate;
    if (hash01(x, z, 5501) > (0.05 + drift * 0.62) * rate) return;
    const k = 1 + (hash01(x, z, 17) * 0.07 - 0.035);
    const tint = new THREE.Color(k, k, k);
    const gy = (u, v) => h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
    const UP = [0, 1, 0];
    const di = pool[hashPick(x, z, 5503, pool.length)];
    const cr = di < TUT_DECOR.cut.length ? TUT_DECOR.cut[di] : (TUT_DECOR.beachCut[di - TUT_DECOR.cut.length] || [0, 0, 0.25, 0.5, 1, 1]);
    const u0 = cr[0], v0 = cr[1], u1 = cr[2], v1 = cr[3];
    const node = hashPick(x, z, 5504, 9);
    const ox = (node % 3 - 1) * 0.25;
    const oz = (((node / 3) | 0) - 1) * 0.25;
    const r = TUT_DECOR.sizes[hashPick(x, z, 5506, TUT_DECOR.sizes.length)];
    const a = hashPick(x, z, 5507, 4) * Math.PI / 2;
    const cxp = x + 0.5 + ox, czp = z + 0.5 + oz;
    const y = gy(0.5 + ox, 0.5 + oz) + 0.035;
    const hx = r * cr[4], hz = r * cr[5];
    const cax = Math.cos(a) * hx, sax = Math.sin(a) * hx;
    const caz = Math.cos(a) * hz, saz = Math.sin(a) * hz;
    const P = (dx, dz) => [cxp + dx * cax - dz * saz, y, czp + dx * sax + dz * caz];
    const A = P(-1, -1), B = P(1, -1), C = P(1, 1), D = P(-1, 1);
    eb.triUV(A, C, B, UP, tint, [u0, v0], [u1, v1], [u1, v0]);
    eb.triUV(A, D, C, UP, tint, [u0, v0], [u0, v1], [u1, v1]);
  }
  _mushroomCircle(mst, mcp, w, x, z, h00, h10, h01, h11) {
    if (!TUT_SHROOM.on) return;
    const thr = w.waterLevel + 0.04;
    const mn = Math.min(h00, h10, h01, h11);
    if (mn < thr) return;
    if (Math.max(h00, h10, h01, h11) - mn > TUT_DECOR.slopeMax) return;
    const t = w.tiles[z * w.w + x];
    if (!TUT_SHROOM.classes.includes(t)) return;
    let calm = true;
    for (let dz = -1; dz <= 1 && calm; dz++) {
      for (let dx = -1; dx <= 1 && calm; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w.w || nz >= w.h) continue;
        const c = w.tiles[nz * w.w + nx];
        if (c !== 0 && c !== 1 && c !== 9) calm = false;
      }
    }
    if (!calm) return;
    if (hash01(x, z, 5601) > TUT_SHROOM.circleDensity) return;
    const k = 1 + (hash01(x, z, 17) * 0.07 - 0.035);
    const gy = (u, v) => h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
    const n = 5 + hashPick(x, z, 5721, 3);
    const R = (0.26 + hash01(x, z, 5722) * 0.08) * (2 + hash01(x, z, 5723) * 2);
    const ox = (hash01(x, z, 5602) - 0.5) * 0.6;
    const oz = (hash01(x, z, 5603) - 0.5) * 0.6;
    const yaw0 = hash01(x, z, 5604) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = yaw0 + (i / n) * Math.PI * 2;
      const cxp = x + 0.5 + ox + Math.cos(a) * R;
      const czp = z + 0.5 + oz + Math.sin(a) * R;
      const s = TUT_SHROOM.sizes[hashPick(x + i * 7, z - i * 13, 5605, TUT_SHROOM.sizes.length)];
      const y = gy(cxp - x, czp - z) - 0.005;
      const stemH = TUT_SHROOM.stemH * s, stemR = TUT_SHROOM.stemR * s, capR = TUT_SHROOM.capR * s;
      const cream = new THREE.Color(TUT_SHROOM.stemCream).multiplyScalar(k);
      const white = new THREE.Color(1, 1, 1).multiplyScalar(k);
      mst.cyl(cxp, y + stemH / 2, czp, stemR, stemH, cream, yaw0 + i);
      const wart = new THREE.Color(0xf2ecdc).multiplyScalar(k);
      const gill = cream.clone().multiplyScalar(0.88);
      const gillDark = cream.clone().multiplyScalar(0.6);
      this._shroomCap(mcp, mst, x + i * 13, z - i * 29, cxp, y + stemH, czp, capR, stemR, white.clone().multiplyScalar(1.25), gill, gillDark, wart);
    }
  }
  _shroomCap(cp, st, x, z, cxp, baseY, czp, r, stemR, white, gill, gillDark, wart) {
    const h = 0.7 * r;
    const R = 12, S = 20;
    const ringPt = (i, j) => {
      const th = (j / S) * Math.PI * 2;
      const rho = (i / R) * r;
      const px = cxp + Math.cos(th) * rho, pz = czp + Math.sin(th) * rho;
      const py = baseY + h * (1 - (rho / r) * (rho / r));
      const nx = 2 * h * (px - cxp) / (r * r), nz = 2 * h * (pz - czp) / (r * r);
      const il = 1 / Math.hypot(nx, 1, nz);
      return { p: [px, py, pz], n: [nx * il, il, nz * il], uv: [(px - cxp) / (2 * r) + 0.5, (pz - czp) / (2 * r) + 0.5] };
    };
    const apex = ringPt(0, 0);
    for (let j = 0; j < S; j++) {
      const A = ringPt(1, j), B = ringPt(1, j + 1);
      cp.triUV3N(apex.p, B.p, A.p, apex.n, B.n, A.n, white, white, white, apex.uv, B.uv, A.uv);
    }
    for (let i = 1; i < R; i++) {
      for (let j = 0; j < S; j++) {
        const A = ringPt(i, j), B = ringPt(i + 1, j), C = ringPt(i + 1, j + 1), D = ringPt(i, j + 1);
        cp.triUV3N(A.p, C.p, B.p, A.n, C.n, B.n, white, white, white, A.uv, C.uv, B.uv);
        cp.triUV3N(A.p, D.p, C.p, A.n, D.n, C.n, white, white, white, A.uv, D.uv, C.uv);
      }
    }
    const F = 10, drop = r * 0.23;
    const yaw0 = hash01(x, z, 5611) * Math.PI * 2;
    for (let f = 0; f < F; f++) {
      const th = yaw0 + (f / F) * Math.PI * 2;
      const dx = Math.cos(th), dz = Math.sin(th);
      const ro = r * 0.88;
      const topAt = (rho) => baseY + h * (1 - (rho / r) * (rho / r)) - 0.002;
      const a = [cxp + dx * stemR, topAt(stemR), czp + dz * stemR];
      const b = [cxp + dx * ro, topAt(ro), czp + dz * ro];
      const a2 = [a[0], a[1] - drop, a[2]], b2 = [b[0], b[1] - drop, b[2]];
      st.tri(a, b, b2, gill);
      st.tri(a, b2, a2, gill);
    }
    const NW = 12;
    for (let kk = 0; kk < NW; kk++) {
      const u = hash01(x, z, 5620 + kk), v = hash01(x, z, 5640 + kk);
      const rho = r * Math.pow(u, 2.2), th = v * Math.PI * 2;
      const px = cxp + Math.cos(th) * rho, pz = czp + Math.sin(th) * rho;
      const py = baseY + h * (1 - (rho / r) * (rho / r)) - 0.001;
      st.blob(px, py, pz, r * 0.18 * (0.8 + 0.4 * hash01(x, z, 5660 + kk)), wart, hash01(x, z, 5680 + kk) * 6, 0);
    }
    st.cyl(cxp, baseY - 0.003, czp, r * 0.5, 0.004, gillDark, 0);
  }

  /* ------------------------------------------------------------------ the dais
     The town square's two steps (see src/world.js#squareStepAt): a flat top per
     tile at the tile's own average ground plus its step, in the tile's own
     texture, and a vertical stone face on every edge where the neighbour
     stands lower. The corner field underneath stays flat - the tops sit over
     it, and each face runs a hand's breadth past the lower surface so no seam
     can open along the join. Chunked with the ground, in the same material. */
  _chunkDais(cx, cz) {
    const w = this.world;
    if (!w.stepAt) return null;
    const b = new MeshBuilder();
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, w.w);
    const z1 = Math.min(z0 + CHUNK, w.h);
    const avg = (x, z) => (w.cornerAt(x, z) + w.cornerAt(x + 1, z) + w.cornerAt(x, z + 1) + w.cornerAt(x + 1, z + 1)) / 4;
    const topAt = (x, z) => (w.inBounds(x, z) ? avg(x, z) + w.stepAt(x, z) : -1e6);
    const stoneCell = terrainUv("stone_tiles") || this.uvs[TILE_TEX[T.FLOOR_STONE]];
    const skirtCol = new THREE.Color(1, 1, 1);
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const s = w.stepAt(x, z);
        if (!s) continue;
        const t = w.tiles[z * w.w + x];
        const j = 1 + (hash01(x, z, 17) * 0.07 - 0.035);
        const mat = TILE_MATERIAL[t] || TILE_MATERIAL[T.GRASS];
        const cell = terrainUv(mat.key);
        let col;
        if (cell) {
          col = new THREE.Color(mat.tint[0] * j, mat.tint[1] * j, mat.tint[2] * j);
          b.setCell(cell);
        } else {
          b.setCell(this.uvs[TILE_TEX[t]]);
          col = new THREE.Color(j, j, j);
        }
        const yt = avg(x, z) + s;
        b.quad([x, yt, z], [x + 1, yt, z], [x + 1, yt, z + 1], [x, yt, z + 1], col);
        b.setCell(stoneCell);
        const faces = [
          [x, z - 1, [x, yt, z], [x + 1, yt, z], [x + 1, 0, z], [x, 0, z]],
          [x, z + 1, [x + 1, yt, z + 1], [x, yt, z + 1], [x, 0, z + 1], [x + 1, 0, z + 1]],
          [x - 1, z, [x, yt, z + 1], [x, yt, z], [x, 0, z], [x, 0, z + 1]],
          [x + 1, z, [x + 1, yt, z], [x + 1, yt, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z]],
        ];
        for (const [nx, nz, q0, q1, q2, q3] of faces) {
          const lower = topAt(nx, nz) - 0.06;
          if (yt <= lower + 0.06) continue;
          q2[1] = lower; q3[1] = lower;
          b.quad(q0, q1, q2, q3, skirtCol);
        }
      }
    }
    return b.count() ? b.build() : null;
  }

  _chunkWater(cx, cz) {
    const w = this.world;
    const b = new MeshBuilder();
    const s = new MeshBuilder();
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, w.w);
    const z1 = Math.min(z0 + CHUNK, w.h);
    const y = w.waterLevel + 0.06;
    /* Seamless tiling (user ask 2026-10-30: the per-tile repeat read as a
       grid): checkerboard mirror - odd-x tiles flip U, odd-z tiles flip V.
       Every shared edge then samples the same texel from both sides, so no
       seam can ever open, and neighbouring tiles no longer repeat identically.
       The art itself is untouched - same cache water, same scale. */
    const wuv = (x, z, u, v) => b._uvAt((x & 1) ? 1 - u : u, (z & 1) ? 1 - v : v);
    const wuvP = (x, z, p) => [(x & 1) ? 1 - p[0] : p[0], (z & 1) ? 1 - p[1] : p[1]];
    /* The cache's own water texture (the overlay the game paints its rivers
       with) carries the ripples; the vertex colour is one flat tint for
       every tile - a single shade of water, no depth shading (see
       WATER_TINT). One repeat per tile (the builder's default cell),
       because `waterMat`'s map is the water texture *alone* - see
       `terrain.js#buildWaterTexture` for why it does not sample the packed
       sheet with the rest of the ground. */
    /* Depth tint (user ask 2026-10-30): shallow water over the shelf runs
       pale turquoise, deep water the flat blue - per-vertex, so shores melt
       into the sea. Depth is water level minus the terrain under the vertex;
       the full range is ~1.2 tiles. The pond keeps its flat dark shade. */
    const SHALLOW = [0.5, 0.82, 0.8], DEEP = [0.24, 0.36, 0.64];
    const wcol = (fx, fz) => {
      const d = Math.min(1, Math.max(0, (w.waterLevel - w.heightAt(fx, fz)) / 1.2));
      const s = d * d * (3 - 2 * d);
      return new THREE.Color(
        SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * s,
        SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * s,
        SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * s);
    };
    /* Pond shade (user ask 2026-10-30, option 1): the same ripple art, one
       flat darker tint - deep still water, not jade. */
    const dark = new THREE.Color(0.2, 0.32, 0.62);
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const h00 = w.cornerAt(x, z), h10 = w.cornerAt(x + 1, z);
        const h01 = w.cornerAt(x, z + 1), h11 = w.cornerAt(x + 1, z + 1);
        /* The cay pond (user ask 2026-10-30): CUT the water level out and lay
           it back just above the sea, exactly inside its own shoreline - no
           river quad over it, no moving shore sliver round it. Pond water
           tiles and their sand rim all cut at the water level itself (not the
           +0.04 the river uses), so the surface meets the banks on the true
           contour; the bed the ground draws underneath covers everything the
           cuts leave out, so no gap can open. Still builder (never scrolled,
           never ebbed) throughout the region. */
        const pk = x + "," + z;
        if ((w.tutPondWater && w.tutPondWater.has(pk)) || (w.tutPondRim && w.tutPondRim.has(pk))) {
          const yS = w.waterLevel + 0.005;
          const cutS = contourTile(h00, h10, h01, h11, w.waterLevel);
          if (!cutS.water.length) {
            if (h00 < w.waterLevel && h10 < w.waterLevel && h01 < w.waterLevel && h11 < w.waterLevel) {
              s.quad([x, yS, z], [x + 1, yS, z], [x + 1, yS, z + 1], [x, yS, z + 1], dark);
            }
            continue;
          }
          const UP = [0, 1, 0];
          for (const loop of cutS.water) {
            if (!loop || loop.length < 3) continue;
            const P = loop.map((L) => [(L[0] + 1) / 2, (L[1] + 1) / 2]);
            for (const t of polyTris(P.map((q) => [q[0], 0, q[1]]))) {
              const ix = [t[0], t[2], t[1]];
              s.triUV([x + P[ix[0]][0], yS, z + P[ix[0]][1]], [x + P[ix[1]][0], yS, z + P[ix[1]][1]], [x + P[ix[2]][0], yS, z + P[ix[2]][1]],
                UP, dark, P[ix[0]], P[ix[1]], P[ix[2]]);
            }
          }
          continue;
        }
        const bb = b;
        const thr = w.waterLevel + 0.04;
        const nDry = (h00 >= thr ? 1 : 0) + (h10 >= thr ? 1 : 0) + (h11 >= thr ? 1 : 0) + (h01 >= thr ? 1 : 0);
        if (nDry === 4) continue;
        if (nDry === 0) {
          if (w.tiles[z * w.w + x] !== T.WATERBED) continue;
          bb.quad3([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1],
            wcol(x, z), wcol(x + 1, z), wcol(x + 1, z + 1), wcol(x, z + 1),
            wuv(x, z, 0, 0), wuv(x, z, 1, 0), wuv(x, z, 1, 1), wuv(x, z, 0, 1));
          continue;
        }
        /* A mixed WATERBED tile draws only its water loop below (see
           _chunkGround); a fully wet or fully dry one keeps its old quad. */
        if (window.__cutTiles === false) {
          if (w.tiles[z * w.w + x] === T.WATERBED) {
            bb.quad3([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1],
              wcol(x, z), wcol(x + 1, z), wcol(x + 1, z + 1), wcol(x, z + 1),
              wuv(x, z, 0, 0), wuv(x, z, 1, 0), wuv(x, z, 1, 1), wuv(x, z, 0, 1));
          }
          continue;
        }
        if (w.stepAt && w.stepAt(x, z)) {
          if (w.tiles[z * w.w + x] === T.WATERBED) {
            bb.quad3([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1],
              wcol(x, z), wcol(x + 1, z), wcol(x + 1, z + 1), wcol(x, z + 1),
              wuv(x, z, 0, 0), wuv(x, z, 1, 0), wuv(x, z, 1, 1), wuv(x, z, 0, 1));
          }
          continue;
        }
        const cut = contourTile(h00, h10, h01, h11, thr);
        const UP = [0, 1, 0];
        for (const loop of cut.water) {
          if (!loop || loop.length < 3) continue;
          const P = loop.map((L) => [(L[0] + 1) / 2, (L[1] + 1) / 2]);
          for (const t of polyTris(P.map((q) => [q[0], 0, q[1]]))) {
            const ix = [t[0], t[2], t[1]];
            bb.triUV3([x + P[ix[0]][0], y, z + P[ix[0]][1]], [x + P[ix[1]][0], y, z + P[ix[1]][1]], [x + P[ix[2]][0], y, z + P[ix[2]][1]],
              UP, wcol(x + P[ix[0]][0], z + P[ix[0]][1]), wcol(x + P[ix[1]][0], z + P[ix[1]][1]), wcol(x + P[ix[2]][0], z + P[ix[2]][1]),
              wuvP(x, z, P[ix[0]]), wuvP(x, z, P[ix[1]]), wuvP(x, z, P[ix[2]]));
          }
        }
      }
    }
    return { moving: b.count() ? b.build() : null, still: s.count() ? s.build() : null };
  }

  /* Shore ripples (user ask 2026-10-30): faint expanding rings where the sea
     meets the sand - the motion of the standstill sea. One ring per chosen
     shore tile, each looping expand+fade with its own phase/rate. The group
     hangs off waterRoot (rides the ebb if standstill is ever flipped off)
     but carries no chunk tag, so chunk rebuilds never touch it. */
  _buildRipples() {
    const w = this.world;
    const geo = new THREE.RingGeometry(0.66, 1.0, 24);
    geo.rotateX(-Math.PI / 2);
    const seaY = w.waterLevel + 0.06;
    const y = seaY + 0.008;
    /* Any sea tile touching shore qualifies - the ring sits on the tile's
       deepest sub-point so shallow shelves get rings right at the waterline
       instead of only deep water qualifying. */
    const SUB = [0.5, 0.3, 0.7];
    const spots = [];
    for (let z = 0; z < w.h; z++) {
      for (let x = 0; x < w.w; x++) {
        if (w.tiles[z * w.w + x] !== T.WATERBED) continue;
        const pk = x + "," + z;
        if ((w.tutPondWater && w.tutPondWater.has(pk)) || (w.tutPondRim && w.tutPondRim.has(pk))) continue;
        const nb = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
        let shore = false;
        for (const [nx, nz] of nb) {
          if (nx < 0 || nz < 0 || nx >= w.w || nz >= w.h ||
              w.tiles[nz * w.w + nx] !== T.WATERBED) { shore = true; break; }
        }
        if (!shore || hash01(x, z, 31337) >= 0.3) continue;
        let bx = 0.5, bz = 0.5, bd = 1e9;
        for (const ox of SUB) for (const oz of SUB) {
          const h = w.heightAt(x + ox, z + oz);
          if (h < bd) { bd = h; bx = ox; bz = oz; }
        }
        if (bd > seaY - 0.03) continue;
        spots.push([x + bx, z + bz]);
      }
    }
    /* Cap the mesh count on huge shorelines: stride the list, never cluster. */
    const MAX = 150;
    const step = Math.max(1, Math.ceil(spots.length / MAX));
    this.ripples = [];
    for (let i = 0; i < spots.length; i += step) {
      const [fx, fz] = spots[i];
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe4f2ec,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(fx, y, fz);
      m.renderOrder = 6;
      this.waterRoot.add(m);
      this.ripples.push({ m, mat, rate: 0.1 + 0.08 * hash01(ix, iz, 31338), phase: hash01(ix, iz, 31339) });
    }
  }

  /* Drifting foam streaks (user ask 2026-10-30): long thin wave streaks on
     OPEN water only - every tile in a 5x5 neighbourhood must be wet and the
     water deep, so a streak can never touch the shore. Each streak drifts
     slowly down-current inside a small wander box around its anchor, breathing
     in and out. Hung off waterRoot with no chunk tag, like the ripples. */
  _buildStreaks() {
    const w = this.world;
    const seaY = w.waterLevel + 0.06;
    const y = seaY + 0.008;
    const tex = foamStreakTexture();
    const wet = (x, z) => x < 0 || z < 0 || x >= w.w || z >= w.h || w.tiles[z * w.w + x] === T.WATERBED;
    const spots = [];
    for (let z = 0; z < w.h; z++) {
      for (let x = 0; x < w.w; x++) {
        if (w.tiles[z * w.w + x] !== T.WATERBED) continue;
        const pk = x + "," + z;
        if ((w.tutPondWater && w.tutPondWater.has(pk)) || (w.tutPondRim && w.tutPondRim.has(pk))) continue;
        let open = true;
        for (let dz = -2; dz <= 2 && open; dz++) {
          for (let dx = -2; dx <= 2 && open; dx++) {
            if (!wet(x + dx, z + dz)) open = false;
          }
        }
        if (!open) continue;
        if (w.waterLevel - w.heightAt(x + 0.5, z + 0.5) < 0.35) continue;
        if (hash01(x, z, 5150) >= 0.25) continue;
        spots.push([x, z]);
      }
    }
    /* Cap the mesh count: stride the list, never cluster. */
    const MAX = 120;
    const step = Math.max(1, Math.ceil(spots.length / MAX));
    const geos = [
      new THREE.PlaneGeometry(1.6, 0.22),
      new THREE.PlaneGeometry(2.4, 0.3),
      new THREE.PlaneGeometry(1.1, 0.16),
    ];
    for (const g of geos) g.rotateX(-Math.PI / 2);
    this.streaks = [];
    for (let i = 0; i < spots.length; i += step) {
      const [x, z] = spots[i];
      const fx = x + 0.5, fz = z + 0.5;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(geos[Math.floor(hash01(x, z, 5151) * 3) % 3], mat);
      m.position.set(fx, y, fz);
      /* One wind for the whole sea (user ask): every streak travels the same
         downwind line, with only a small per-streak angular wander so it
         reads as gusts, not opposing currents. The mesh lies along its own
         travel line. */
      const wa = 0.35 + (hash01(x, z, 5152) - 0.5) * 0.4;
      m.rotation.y = -wa;
      m.renderOrder = 5;
      this.waterRoot.add(m);
      this.streaks.push({
        m, mat,
        ax: fx, az: fz,
        wx: Math.cos(wa), wz: Math.sin(wa),
        ph: hash01(x, z, 5154),
        rate: 0.16 + 0.08 * hash01(x, z, 5155),
        peak: 0.28 + 0.22 * hash01(x, z, 5156),
      });
    }
  }

  /* Jumping fish (user ask 2026-10-30): offshore breaches in cay waters - a
     small dark back arcs out, hangs a beat, and drops with an expanding ring.
     A tiny cycling pool, always over open cay water, never the pond. */
  _buildFish() {
    const w = this.world;
    const seaY = w.waterLevel + 0.06;
    const fishGeo = new THREE.ConeGeometry(0.07, 0.4, 5);
    fishGeo.rotateX(Math.PI / 2);
    const fishMat = new THREE.MeshBasicMaterial({ color: 0x3a4a52 });
    const ringGeo = new THREE.RingGeometry(0.5, 1.0, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.fish = [];
    for (let i = 0; i < 3; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe4f2ec, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, seaY + 0.008, 0);
      ring.renderOrder = 6;
      ring.visible = false;
      this.waterRoot.add(ring);
      const fm = new THREE.Mesh(fishGeo, fishMat);
      fm.visible = false;
      this.waterRoot.add(fm);
      this.fish.push({
        ring, ringMat, fm,
        state: "wait", t: 1 + i * 2.5 + hash01(i, 3, 9201) * 3,
        x: 0, z: 0, dx: 1, dz: 0,
      });
    }
    this._fishSeaY = seaY;
  }

  _fishSpot() {
    const w = this.world;
    for (let n = 0; n < 12; n++) {
      const x = TUT_ISLE.x0 - 6 + Math.floor(hash01((Math.random() * 1e9) | 0, n, 9202) * (TUT_ISLE.x1 - TUT_ISLE.x0 + 13));
      const z = TUT_ISLE.z0 - 6 + Math.floor(hash01(n, (Math.random() * 1e9) | 0, 9203) * (TUT_ISLE.z1 - TUT_ISLE.z0 + 13));
      if (x < 0 || z < 0 || x >= w.w || z >= w.h) continue;
      if (w.tiles[z * w.w + x] !== T.WATERBED) continue;
      const pk = x + "," + z;
      if ((w.tutPondWater && w.tutPondWater.has(pk)) || (w.tutPondRim && w.tutPondRim.has(pk))) continue;
      const nb = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
      let ok = true;
      for (const [nx, nz] of nb) {
        if (nx < 0 || nz < 0 || nx >= w.w || nz >= w.h || w.tiles[nz * w.w + nx] !== T.WATERBED) { ok = false; break; }
      }
      if (ok) return [x + 0.5, z + 0.5];
    }
    return null;
  }

  _chunkObjects(cx, cz) {
    const w = this.world;
    const b = new MeshBuilder();
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, w.w);
    const z1 = Math.min(z0 + CHUNK, w.h);
    const fires = this._chunkFires || (this._chunkFires = new Set());
    fires.clear();
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const o = w.objs.get(z * w.w + x);
        if (!o) continue;
        if (o.t === "door") continue;
        /* Only the anchor tile of a tree stands the procedural stand-in this
           builds: the other tiles of its footprint carry the same object, and
           drawing it three times over would be three trees. The loc bake covers
           every tree, so this only matters in the moment before it lands. */
        if (o.ox != null && (o.ox !== x || o.oz !== z)) continue;
        if (o.t === "fire" || o.t === "torch") fires.add(this._fireKey(x, z));
        this._addObject(b, o, x, z);
      }
    }
    this._pruneFires(x0, z0, x1, z1, fires);
    return b.count() ? b.build() : null;
  }

  /* ------------------------------------------------------------------ scenery
     Real cache locs (see src/locmodels.js) are instanced rather than merged:
     one geometry per (model, quarter-turn) is shared by every instance on the
     map, so a few thousand trees cost a few hundred KB of buffers instead of
     tens of MB. A chunk gets one InstancedMesh per distinct (model, rotation)
     standing in it, which keeps frustum culling per chunk. */

  /* True when tile (x, z) is covered by a multi-tile loc whose own origin tile
     is somewhere to its west or north - i.e. when this tile is not the one that
     should draw the model. The origin is always the smallest x (then the
     smallest z) of the footprint, which is the tile the world's setObj calls
     name first (see world.js's altar placement). */
  _coveredByLoc(w, o, x, z, fx, fz, map) {    /* A tree carries its own anchor (`ox`/`oz` - world.js#stampFoot), so the one
       tile that draws it is the anchor and every other tile of its footprint is
       covered. That is exact, and it does not depend on what happens to stand
       next to it: two oaks side by side used to hide each other under the
       heuristic below. The heuristic is left for the props, which are stamped
       tile by tile and carry no anchor of their own. */
    if (o.ox != null && o.oz != null) return !(o.ox === x && o.oz === z);
    /* A run built by REPEATING a one-tile model (`keys` - the log balance is
       seven logs, the stepping-stone crossing five stones) is not a multi-tile
       loc at all: every tile of it is meant to draw its own model, picked by
       that tile's own hash. Covering them the way an altar covers its second
       tile would draw the whole crossing as ONE log standing at its west end,
       and nothing else in the build would say so - the tiles stay walkable, the
       click still works, and the only symptom is an obstacle that is visibly
       one model short of what the course data says it is. */
    if (o.keys) return false;
    if (fx <= 1 && fz <= 1) return false;
    /* `map` is the object map the loc lives in: the ground map for ground
       props, the upstairs map for upper-floor furniture (a 2x1 table stands
       once per level, and neither level's tiles hide the other's). */
    const m = map || w.objs;
    for (let dx = 1; dx < fx; dx++) {
      const no = m.get(z * w.w + (x - dx));
      if (no && no.t === o.t && this.locSpec(no, x - dx, z)) return true;
    }
    for (let dz = 1; dz < fz; dz++) {
      const no = m.get((z - dz) * w.w + x);
      if (no && no.t === o.t && this.locSpec(no, x, z - dz)) return true;
    }
    return false;
  }

  _chunkLocs(cx, cz) {
    if (!locsReady()) return [];
    const w = this.world;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, w.w);
    const z1 = Math.min(z0 + CHUNK, w.h);
    const groups = new Map();
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const o = w.objs.get(z * w.w + x);
        /* a door is its own one-off mesh (see _buildDoors) so its model can be
           swapped the moment it opens - it is not instanced with the scenery */
        if (o && o.t === "door") continue;
        /* Wall panels come from the building rings, not from the wall objects:
           a ring tile draws its panels whatever else shares it (a crate, a
           chair, a shrub - anything backed truly flush stands ON the ring
           tile, with the panel behind it), so furniture and panels coexist on
           one tile and no placement can ever remove the wall behind it. Only
           doors opt out: a door is its own one-off mesh (see _buildDoors) and
           its tile must stay open-able, and gaps (cave mouths, yard gates)
           draw nothing - the way in stays open. A hand-placed wall with no
           ring behind it still draws from its own object, below. */
        const ring = this._ringRots(x, z);
        if (ring.length && (!o || o.t !== "door")) {
          for (const rot of ring) {
            const key = "wall|" + rot + "|wall";
            let g = groups.get(key);
            if (!g) groups.set(key, (g = { key: "wall", rot, type: "wall", grey: false, list: [] }));
            g.list.push([x, z, 1, 1, o ? o.surf : undefined, 0, 0, 0, 0]);
          }
        }
        if (!o) continue;
        if (o.t === "wall" && ring.length) continue;
        const spec = this.locSpec(o, x, z);
        if (!spec) continue;
        /* A loc wider than one tile (the church altar is 2x1, a tree two or
           three) is placed ONCE, at the west/north tile of its footprint, while
           every tile it covers carries the same object so all of them are solid
           and clickable. The model's own origin is the *centre* of its
           footprint, so a 2x1 loc's mesh sits half a tile east of its origin
           tile - the same rule the client applies, where a loc's model origin is
           the corner of its south-west tile.

           Which footprint that is comes from the object when the world declared
           one (`fx`/`fz` - a tree's own, which is also what it is solid over)
           and from the model otherwise. The two differ on a felled tree: the
           stump model is smaller than the tree it stands in, and it is centred
           in the ground the tree held, so the stump of a 3x3 oak stands in the
           middle of it rather than at its north-west corner. */
        const [fx, fz] = (o.fx && o.fz) ? [o.fx, o.fz] : locFootprint(spec.key);
        if (this._coveredByLoc(w, o, x, z, fx, fz)) continue;
        /* A wall is a thin panel at ONE EDGE of its tile rather than a box that
           fills it (see the note on `_locSpec`'s `wall` case), so a corner tile -
           on two sides of its building at once - has to draw a panel for EACH side
           or every building has a one-tile hole in one of its walls at each of its
           four corners. `_wallRots` is that list of sides; every other object is a
           single instance. The object's own `t` rides the group key too, so a
           stepping stone and a plain mining rock - which share a model but are
           drawn at different heights (see `y` below) - can never be instanced
           together. */
        const rots = spec.key === "wall" ? this._wallRots(x, z, spec.rot) : [spec.rot];
        for (const rot of rots) {
          const spent = o.t === "rock" && o.empty;
          const key = spec.key + "|" + rot + "|" + o.t + (spent ? "|e" : "");
          let g = groups.get(key);
          if (!g) groups.set(key, (g = { key: spec.key, rot, type: o.t, grey: spent, list: [] }));
          g.list.push([x, z, fx, fz, o.surf, o.dy || 0, 0, o.dx || 0, o.dz || 0, o.sx || 1, o.sy || 1, o.sz || 1]);
          /* The shaft's longer ladder: an inert second length of the same mesh
             stacked exactly one ladder-height under the real one, so the drop
             reads as one long ladder into the dark. It instances with the
             chunk (bake-proof, same slimming), carries no object of its own -
             picks still resolve through the tile box to the real ladder -
             and changes nothing else. */
          if (o.shaft) {
            const drop = locHeight(spec.key) || 1.0625;
            /* the inert length wears the dirt-textured clone (see
               locmodels.js#textureShaftPlates), so it reads as soiled wood at
               the bottom of the pit while the top length stays grassy */
            const lk = hasLoc(spec.key + "_low") ? spec.key + "_low" : spec.key;
            const lgk = lk + "|" + rot + "|" + o.t + (spent ? "|e" : "");
            let lg = groups.get(lgk);
            if (!lg) groups.set(lgk, (lg = { key: lk, rot, type: o.t, grey: spent, list: [] }));
            lg.list.push([x, z, fx, fz, o.surf, (o.dy || 0) - drop, 0, o.dx || 0, o.dz || 0, o.sx || 1, o.sy || 1, o.sz || 1]);
          }
        }
      }
    }
    /* The upper floor (see world.js#UP_Y): its own pass over the chunk, since
       an upstairs tile's ground tile is usually empty. Upstairs furniture and
       stairs instance exactly like ground props but ride one level up (the
       `|up` group suffix keeps the heights apart), and the upper ring stands
       wall panels on every ring tile of an upper-storey building - door tiles
       included, since there is no upstairs door. */
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const uo = w.upObjs.get(z * w.w + x);
        if (uo && uo.t !== "door") {
          const uspec = this.locSpec(uo, x, z);
          if (uspec) {
            const [ufx, ufz] = (uo.fx && uo.fz) ? [uo.fx, uo.fz] : locFootprint(uspec.key);
            if (!this._coveredByLoc(w, uo, x, z, ufx, ufz, w.upObjs)) {
              const ukey = uspec.key + "|" + uspec.rot + "|" + uo.t + "|up";
              let ug = groups.get(ukey);
              if (!ug) groups.set(ukey, (ug = { key: uspec.key, rot: uspec.rot, type: uo.t, grey: false, list: [], up: true }));
              ug.list.push([x, z, ufx, ufz, uo.surf, uo.dy || 0, 1, uo.dx || 0, uo.dz || 0]);
            }
          }
        }
        const ubd = this._buildingAtTile(x, z);
        if (ubd && ubd.upperStorey && (x === ubd.x0 || x === ubd.x1 || z === ubd.z0 || z === ubd.z1)) {
          for (const urot of this._wallRots(x, z)) {
            const ukey = "wall|" + urot + "|wall|up";
            let ug = groups.get(ukey);
            if (!ug) groups.set(ukey, (ug = { key: "wall", rot: urot, type: "wall", grey: false, list: [], up: true }));
            ug.list.push([x, z, 1, 1, undefined, 0, 1]);
          }
        }
      }
    }
    const out = [];
    for (const g of groups.values()) {
      /* A mined-out rock draws the cache's own plain-grey rock (rock_a, loc
         450): every ore rock is the same base model 1390 as rock_a -
         byte-identical verts and faces in the bake, only the colours differ -
         so this is the same shape in the plain-rock grey (palette 24), which
         is the neutral grey the generic depleted mesh always was. The key the
         object answers never changes, so click box and pick mesh are
         untouched; the `|e` group only changes what is drawn. */
      const drawKey = g.grey ? "rock_a" : g.key;
      let geom = locGeometry(drawKey, g.rot);
      /* An ore the bake carries no loc for (rune essence has no cache rock of
         its own) falls back to the plain-grey boulder rather than drawing
         nothing - the audit's invisible-prop trap (src/tools/check-locs.mjs). */
      let key = drawKey;
      if (!geom && drawKey.startsWith("ore_")) { key = "rock_a"; geom = locGeometry(key, g.rot); }
      const animIds = locAnimIdsForModel(key);
      /* A loc the cache authors fully translucent (every runecrafting portal:
         all faces carry faceAlpha, so the solid pass is empty) keeps its whole
         mesh in the glow pass - dropping the group here left the essence-mine
         return portal and the Cairn gate portal invisible while hover and menu
         still answered. */
      if (!geom && !animIds.length && !locGlassGeometry(key, g.rot) && !locGlowGeometry(key, g.rot)) continue;
      const mats = [];
      const m = new THREE.Matrix4();
      for (const [x, z, fx, fz, surf, dy, plane, dx, dz, sx = 1, sy = 1, sz = 1] of g.list) {
        /* A fishing spot's tile is water, so the swirl rides the water surface
           rather than the waterbed under it - the cache authors the model for
           the surface (0.31 of a tile tall, 0.75 wide), exactly as the client
           draws locs on water tiles at the water's own height. The river and
           the lake are per-tile quads at waterLevel + 0.06 (see _chunkWater).
           There is only one sea now (the old flat ocean sheet was removed
           2026-10-30, its horizon run covered by the river quads; the quads
           sit midway between the sheet's old level and their original
           height, per the user's level asks). The +0.04 is measured against the
           river surface - it puts the swirl's flat base a twentieth of a tile
           above the surface so its rim reads as water in the water, not
           hovering, and not z-fighting with the quads either.

           A stepping stone's tile is water too, and the same measurement
           applies in reverse: the rock's base sits ON the water's own plane
           (`waterLevel + ROCKY_STEP_BASE`, ROCKY_STEP_BASE = 0), so a little
           under two hand's breadths of the rock is in the water and its flat
           top is `ROCKY_STEP_TOP` (0.66) above the surface - which is exactly
           where `world.heightAt` puts the person standing on it, so the rock
           and the player on the rock can never disagree. */
        /* The height a group is drawn at is a property of the OBJECT, never of
           the model: `rock_a` and `rock_b` are two models from the mine's own
           set, and the world draws plain mining rocks with them as well as its
           stepping stones, so keying the height off the model would stand every
           plain rock in the world at the water plane. The group carries its
           object type for exactly this (`type: o.t` above), and the two types
           whose surface is not their own ground are the only special cases. */
        /* ...and a third special case: a course piece that stands IN water. The
           rope bridge, the logs and the stepping stones are all placed on water
           tiles, and `_baseY` under a water tile is the sea BED - several metres
           down, so the model would be drawn under the channel it crosses.
           `surf` is the object's own answer: how far above the world's water
           level the world wants it drawn (see src/island.js#COURSE, which tunes
           it per piece - a log floats on the surface, a stepping stone is sunk
           into it). */
        const y = g.type === "fishing" ? this.world.waterLevel + 0.1
          : g.type === "rocky" ? this.world.waterLevel + ROCKY_STEP_BASE
          : surf != null ? this.world.waterLevel + surf
          /* The tutorial hat is the ground-drop model drawn as scenery: it
             rides the tile-centre surface like a drop (actions.js#groundMesh),
             not the min-corner props stand on, or the beach slope buries it.
             The beach's Dry Coconuts ride the same way (user ask 2026-10-30). */
          : g.type === "tut_hat" || g.type === "tut_dry_coconut" ? this.world.heightAt(x + 0.5, z + 0.5) + 0.02
          : this._baseY(x, z);
        /* Upstairs instances ride one level up (see world.js#UP_Y). Per-object
           draw scale (the shaft ladder's slimming) composes here; the default
           path stays a bare translation. */
        if (sx !== 1 || sy !== 1 || sz !== 1) {
          m.compose(
            new THREE.Vector3(x + 0.5 + (fx - 1) / 2 + (dx || 0), y + (dy || 0) + (plane || 0) * UP_Y, z + 0.5 + (fz - 1) / 2 + (dz || 0)),
            new THREE.Quaternion(),
            new THREE.Vector3(sx, sy, sz)
          );
        } else {
          m.makeTranslation(x + 0.5 + (fx - 1) / 2 + (dx || 0), y + (dy || 0) + (plane || 0) * UP_Y, z + 0.5 + (fz - 1) / 2 + (dz || 0));
        }
        mats.push({ m: m.clone() });
      }
      const emit = (geometry, material) => {
        if (!geometry || !material) return;
        const im = new THREE.InstancedMesh(geometry, material, mats.length);
        im.userData.sharedGeometry = true;
        im.userData.upstairs = !!g.up;
        for (let i = 0; i < mats.length; i++) {
          im.setMatrixAt(i, mats[i].m);
        }
        im.count = mats.length;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        out.push(im);
        return im;
      };
      emit(geom, this.locMat);
      emit(locGlassGeometry(key, g.rot), this.locGlassMat);
      /* The cache's own translucent faces (the furnace's firebox glow, potion
         glass, ghost robes) at their authored opacity - opaque rendering is
         what put solid orange slabs on the furnace. Null for most models. */
      emit(locGlowGeometry(key, g.rot), this.locGlowMat);
      /* A face that samples an animated texture needs a material of its own (a
         cell of a packed sheet cannot scroll - see src/locmodels.js), so every
         tree, spot and stone in this group is drawn a second time by a batch
         carrying just those faces, on the same matrices. Most groups have none
         and this costs nothing. */
      for (const id of animIds) emit(locAnimGeometry(key, g.rot, id), locAnimMaterial(id));
    }
    return out;
  }

  /* ---------------------------------------------------------------- walls
     A wall is the baked `wall` loc (loc 1583 - see locs.mjs): a **panel one
     tile long, 0.125 of a tile thick and 1.875 tall**, painted with the
     cache's grey wall texture (id 2). Because it is a panel and not a box, the
     tile it stands on has to say WHICH EDGE of the tile it is on - that is what
     `_locSpec`'s wall case and `_wallRots` are for - and a tile in the middle
     of a run draws one panel while a corner tile draws two. A run of them
     along a building's ring is then a continuous wall with the corners closed,
     the same way the real client draws a building. Door tiles carry a door
     instead (see _buildDoors). */

  /* The height the baked wall stands at (falls back to the procedural box's
     height when the loc bake is not loaded yet). Roofs and doors read it from
     here so a building can never come apart. */
  _wallHeight() {
    const h = hasLoc("wall") ? locHeight("wall") : 0;
    return h > 0.5 ? h : 1.9;
  }

  /* Which baked loc (and which quarter-turn) stands for a world object. Trees
     vary by hash so a forest is not one repeated model. Returns null when the
     object has no loc, or when its model is missing from the bake - in which
     case _addObject falls back to the procedural version so the map is never
     left with a hole.

     An object may also carry an explicit `key` (an exact baked loc key), which
     wins over the hash: that is how `::tree <spec>` stands one exact model on
     the specimen tile and how `::trees` plants one of each in the row. */
  locSpec(o, x, z) {
    if (!locsReady()) return null;
    const s = this._locSpec(o, x, z);
    return s && hasLoc(s.key) ? s : null;
  }

  _locSpec(o, x, z) {
    /* `hashPick` rather than `hash01` for everything here that chooses between
       alternatives - the quarter-turn and each family's model - because
       `hash01`'s high bits are correlated between seeds and these objects are
       placed by a scatter, which is exactly the case it fails (see
       util.js#hashPick: it is how two of the four bush models were never
       drawn). */
    const hx = o.ox != null ? o.ox : x;
    const hz = o.oz != null ? o.oz : z;
    const rot = hashPick(hx, hz, 7717, 4);
    const pair = hashPick(hx, hz, 7717, 2);
    switch (o.t) {
      case "tree": {
        if (o.stump) {
          /* A felled tree draws a stump, centred in the ground the tree held
             (the object's own `fx`/`fz` - see _chunkLocs). `key` names the tree
             the object grows back as, so the stump's own model is named beside
             it by the felling (src/actions.js#attemptWc); a stump placed as a
             specimen instead (`::tree stump_a`) carries the stump's own key and
             no `stumpKey`. Every stump model is smaller than the tree it
             replaces, so a stump with neither - none exists today - falls back
             to one picked by the tree's own size. */
          if (o.stumpKey) return { key: o.stumpKey, rot };
          if (o.key) return { key: o.key, rot };
          const small = (o.fx || 1) <= 1 && (o.fz || 1) <= 1;
          const pool = small ? ["stump_a"] : ["stump_b", "stump_c"];
          return { key: pool[hashPick(hx, hz, 3313, pool.length)], rot };
        }
        if (o.key) return { key: o.key, rot: o.rot != null ? (o.rot & 3) : rot };
        const list = TREE_GROUPS[o.kind] || TREE_GROUPS.tree;
        return { key: list[hashPick(hx, hz, 3313, list.length)], rot };
      }
      case "deadtree": {
        if (o.key) return { key: o.key, rot: o.rot != null ? (o.rot & 3) : rot };
        const list = TREE_GROUPS.deadtree;
        return { key: list[hashPick(hx, hz, 4241, list.length)], rot };
      }
      case "rock": {
        if (o.ore && o.ore !== "none") {
          if (o.ore === "essence") return { key: "essence_rock", rot: 0 };
          return { key: "ore_" + o.ore, rot: 0 };
        }
        return { key: pair ? "rock_b" : "rock_a", rot: 0 };
      }
      case "bush": {
        /* A bush knows its own model now (world.js#stampFoot): it is picked once,
           at the anchor, so the model and the ground it is stamped over agree.
           The hash and the order below are what the pick always was, so a bush
           that had no key yet draws the model it always drew. */
        if (o.key) return { key: o.key, rot };
        const list = ["bush_a", "bush_b", "bush_c", "bush_small"];
        return { key: list[hashPick(hx, hz, 5153, list.length)], rot };
      }
      /* Pond dressing (tutorial cay, user ask 2026-10-30): the reeds' own walkable type - t:"bush" is solid cover, these are waded through. The key is always carried, so this just hands it over. */
      case "reeds": return { key: o.key, rot };
      case "flowers": return { key: pair ? "flower_b" : "flower_a", rot };
      /* The village props (unit X's "baked keys nothing draws" list). Each type
         is the loc the world wants to place, and the two families that have two
         cache models pick between them per tile: `barrel` is the cache's 362 and
         363 (both plain "Barrel" with no actions, so either will do) and `fern`
         its 1298/1300. The rest are one model each. `crate` and `crate_b` are
         deliberately two types, not two models of one: their defs differ - 63 is
         "Hide-in", 354 is "Search" - so the tile's own type has to say which row
         it offers (see actions.js#sceneryRowSpecs). */
      case "crate": return { key: "crate", rot };
      case "crate_b": return { key: "crate_b", rot };
      case "barrel": return { key: hashPick(hx, hz, 9417, 2) ? "barrel_b" : "barrel", rot };
      case "boulder": return { key: "boulder", rot };
      case "rockery": return { key: "rockery", rot };
      /* The stepping stones (the cache's own "Rocks", locs 450/451). This used
         to be `rocky_shore` (loc 4559, model 4556) - a FLAT decal authored for
         the water shader: one zero-height quad with no texture of its own, so
         every stone in the river rendered as a blank grey square. The user's
         report: "making the rocky shore stuff actual stepping stones instead of
         rocky shore right now they just render as blank squares." So a stepping
         stone is now a real rock - the same two grey boulder models the plain
         mining rocks use, picked per tile - stood in the water on the water's
         own plane (see _chunkLocs and world.js#ROCKY_STEP_TOP). It is still not
         solid: standing on it is the whole point of its "Jump-to". */
      case "rocky": return { key: pair ? "rock_a" : "rock_b", rot: o.rot || 0 };
      case "fern": return { key: hashPick(hx, hz, 9311, 2) ? "fern_b" : "fern_a", rot };
      case "plant": return { key: "plant", rot: o.rot || 0 };
      case "table_b": return { key: "table_b", rot: o.rot || 0 };
      /* The churchyard's stones (unit T). Five variants hashed per tile so a
         rank of graves reads as a real churchyard rather than one stone copied
         twenty times - the same trick the trees and bushes use. `coffin` is the
         2x2 lid-on model (the crypt each brother lies in); `o.open` swaps it
         for the lid-off one. */
      case "grave": {
        const list = ["grave_a", "grave_b", "grave_c", "grave_d", "grave_e"];
        return { key: list[hashPick(hx, hz, 6151, list.length)], rot };
      }
      case "coffin": return { key: o.open ? "coffin_open" : "coffin", rot: o.rot || 0 };
      case "table": return { key: "table", rot };
      case "chair": return { key: "chair", rot };
      case "ladder_down": return { key: o.key || "agile_stone_ladder_down", rot: o.rot || 0 };
      case "ladder_up": return { key: o.key || "agile_stone_ladder", rot: o.rot || 0 };
      /* The authored props' quarter-turns are pinned by the world rather than
         hashed, the way the altar's and the stalls' already are: a bench and a
         chest have a front, and the world's placement (a bench beside a table,
         a chest in a church) is what decides which way it faces. A hashed
         quarter-turn on a 2x1 bench also turns its footprint across the tile
         the world laid it on. */
      case "bench": return { key: "bench", rot: o.rot || 0 };
      case "chest": return { key: "chest", rot: o.rot || 0 };
      case "well": return { key: "well", rot };
      /* The glassblower's sandpit (loc 22726, baked as "sandpit"): a 2x2 solid
         like the furnace, so the world stamps all four tiles and the anchor
         rule draws it once. */
      case "sandpit": return { key: "sandpit", rot: 0 };
      /* The kitchen sink: the cache's own Sink (loc 873, baked as "sink"). */
      case "sink": return { key: "sink", rot };
      /* The church altar - the 2x1 loc, so its quarter-turn is pinned by the
         world instead of hashed (see world.js, which places it `rot: 0`). */
      case "altar": return { key: "altar", rot: o.rot || 0 };
      /* The Air Altar is the cache's own runic altar (loc 2478, Craft-rune
         only) - no borrowing, no substitution. */
      case "air_altar": return { key: "air_altar", rot: o.rot || 0 };
      /* The mysterious ruins are the cache's own (loc 7104, Enter) - solid
         stone now, no shimmer (see locs.mjs#mysterious_ruins). */
      case "ruins": return { key: "mysterious_ruins", rot: 0 };
      /* The pillars: one world type, the baked key carried per tile (the bush
         pattern), so Cairn Isle holds the whole pillar family. */
      case "pillar": return { key: o.key || "pillar_stone", rot: o.rot || 0 };
      /* The isle portals are the essence mine's own return portal (loc 2492
         "Portal", model 2318, 1x1, Use, anim 504) - the animated swirl the
         runecrafting release gave every portal, not the square Magic Portal
         arch (loc 2156), which is Thormac's tower's doorway. */
      case "rc_portal": return { key: "essence_portal", rot: o.rot || 0 };
      /* The new island's portals: the cache's own essence swirl (loc 2492),
         the object the world places - the bush/pillar pattern, so a later
         portal can carry its own key. */
      case "portal": return { key: o.key || "agile_portal", rot: o.rot || 0 };
      /* The coin shrine north-east of the market: a merged bake (loc 6230's
         money pot standing on loc 9241's plinth), one tile, drawn as-is. */
      case "coin_shrine": return { key: "coin_shrine", rot: o.rot || 0 };
      /* The tutorial island's shipwrecks: one world type, the baked key
         carried per tile (the bush/pillar pattern), so the beach holds all
         thirty-seven wreck pieces. */
      case "wreck": return { key: o.key, rot: o.rot != null ? (o.rot & 3) : rot };
     case "tut_hat": return { key: ITEM_KEY + (o.item || "pirate_hat"), rot: 0 };
      /* Fallen coconuts (tutorial cay, user ask 2026-10-30): the cache's own
         coconut ground model (item 5974, baked like the pirate hat) stood as
         examine-only scenery under the palms - no Take, no item, no economy.
         The grove's nuts moved up into the Very Tall crowns; only the beach
         keeps fallen ones, weathered "Dry Coconut" (dry-coconut-bake.mjs). */
      case "tut_coconut": return { key: ITEM_KEY + "coconut", rot: hashPick(hx, hz, 7717, 4) };
      case "tut_dry_coconut": return { key: ITEM_KEY + (o.key === "dry_coconut_shell" ? "dry_coconut_shell" : "dry_coconut"), rot: hashPick(hx, hz, 7719, 4) };
      /* The smugglers' cache (user ask 2026-10-30): a stone at the foot
         of the east bluff - the dark crack it shelters is the fiction, carried
         by the examine and the Search row. Solid, walked round like a rock. */
      case "tut_cache": return { key: "rock_b", rot: 0 };
      /* A market stall (unit Q). `kind` is the stall's own model pair; once it
         has been robbed the world sets `looted` and the chunk is rebuilt, so the
         goods vanish and the bare frame is left standing until the stall
         restocks - the same mechanism an ore rock's `empty` uses (see
         actions.js#stealFrom and items.js#STALLS). The Keldagrim-era Crafting
         stall has a different frame from the other four, so it has an empty
         model of its own. `rot` is pinned by the world, not hashed: a row of
         stalls all faces the same way, the way a real market row does. */
      case "stall": {
        if (o.looted) return { key: o.kind === "crafting" ? "stall_crafting_empty" : "stall_empty", rot: o.rot || 0 };
        return { key: "stall_" + o.kind, rot: o.rot || 0 };
      }
      case "booth": return { key: "bank_booth", rot: o.rot != null ? (o.rot & 3) : 0 };
      /* A fishing spot (unit U): every "Fishing spot" loc in the archive is the
         same model 1491 - only its action list differs - so one baked key draws
         them all and the verbs are the world's per-kind business (see
         actions.js#SPOT_METHODS). It is instanced like any other loc; the water
         level is applied in _chunkLocs. */
      case "fishing": return { key: "fishing_spot", rot: o.rot || 0 };
      case "anvil": return { key: "anvil", rot };
      case "wheel": return { key: "spinning_wheel", rot };
      /* The potter's wheel (loc 2642, 1x1) and the pottery oven (loc 2643,
         1x2): the oven's quarter-turn is pinned like the counter's, since the
         world stamps both of its tiles and the model covers them rot-0. */
      case "potwheel": return { key: "potwheel", rot };
      case "potoven": return { key: "potoven", rot: o.rot || 0 };
      /* The flax field's crop (loc 2646, the cache's own "Flax" with "Pick").
         A picked plant draws nothing until it grows back - the same shape as a
         mined-out rock keeping its tile, except there is no stump or grey
         mesh to stand in: the live game's picked plant is simply gone. */
      case "flax": return o.picked ? null : { key: "flax", rot };
      /* The last four props to lose their procedural stand-ins (unit XIX). The
         furnace and the counter are multi-tile locs (3x3 and 2x1), so their
         quarter-turn is pinned: `locFootprint` describes the model in its
         unrotated axes and `_coveredByLoc` matches tiles on that basis. The
         counter is 2x1 so it stays at 0, but the furnace is 3x3 - a square, so
         any quarter-turn covers the same nine tiles - and the cache authors its
         fire mouth on the model's +x (east) face (model 1192's lava-lined
         firebox opens east). The smithy's furnace stands with its back edge on
         the north wall, so it is pinned to 3, which turns the mouth south into
         the room - the same facing the old procedural stand-in drew its mouth
         at. The range and the signpost are 1x1, so the hash may turn them
         freely - except the signpost, which the world places with its own
         facing and which therefore takes the pinned quarter-turn like the
         altar and the stalls do. */
      case "furnace": return { key: "furnace", rot: 3 };
      case "counter": return { key: "counter", rot: 0 };
      case "range": return { key: "range", rot: o.rot || 0 };
      case "signpost": return { key: "signpost", rot: o.rot || 0 };
      /* The baked wall FILLS its whole tile (locs.json: bounds -0.5..0.5 in x
         and z, 1.875 tall - loc 1583 "Wall", a solid box), so a run of them
         along a building's ring is already a continuous, closed wall and the
         corners close themselves - there is no separate corner piece and no
         hole for one. Nothing here is a thin panel glued to one edge, and
         because the box is centred and square its quarter-turn is cosmetic - do
         NOT "fix" the rotation numbers below on the theory that a wall is an
         edge panel. (Verified: every one of the nine buildings in the seeded
         town has a wall or door on every one of its perimeter tiles.) */
      case "wall": {
        /* Every wall tile is the same model, and its quarter-turn is what puts
           it on the right edge of its tile: the baked wall (loc 1583,
           locs.mjs#wall) is a **thin panel 0.125 of a tile thick and one tile
           long**, not a box - its own bounds are x -0.5..-0.375 at turn 0,
           0.375..0.5 at turn 2, and the same on z at turns 1 and 3. So the turn
           is load-bearing, and a corner tile - on two edges of its building at
           once - must draw TWO panels or the corner is half open. That is what
           `_wallRots` answers and `_chunkLocs` draws (the user's report: "the
           corners of lots of the buildings are not really closed off
           properly"). This case still answers with the single edge the tile is
           checked for first, which is what anything that asks the world what a
           tile IS wants; the drawing loop asks `_wallRots` instead. */
        const sd = this._wallSide(x, z);
        if (!sd) return { key: "wall", rot: 0 };
        return { key: "wall", rot: sd.w ? 0 : sd.s ? 1 : sd.e ? 2 : sd.n ? 3 : 0 };
      }
      /* A door is a baked loc as well (locs.mjs#door_closed - the wall shape set
         with the door's own retexture), but its mesh is built one-off by
         _buildDoors so it can be swapped the moment the leaf swings, and the
         chunk builders therefore skip it. Answering with its key anyway means
         everything that asks the world what a tile IS gets an answer for a door
         (the menu's def lookup, the loc audit) without the door being instanced
         with the walls - which is what would double-draw it. `wallRot` is the
         side of its building the panel faces, set by _buildDoors; before that
         runs the rotation is cosmetic and 0 will do. */
      case "door": return { key: "door_closed", rot: o.wallRot || 0 };
      /* A free-standing low ruined wall - the safespot test wall west of the
         churchyard skeletons. It draws the structuary ruin kits
         (crumbled_wall_low, converted to ruin_wall_low_a/b in locs.json with
         the cache stone texture 23, alternating mirror per tile like the
         kits' own ruinMirror rule), 0.75 tall so missiles visibly fly over.
         A type of its own rather than the agile_* keys so the tiles get no
         Climb-over row (actions.js only offers that for course pieces the
         isle placed). At rot 0 the panels run north-south like the baked
         wall, so a north-south line of them reads as one continuous low wall. */
      case "lowwall": {
        const k = (z & 1) ? "ruin_wall_low_b" : "ruin_wall_low_a";
        return { key: k, rot: 0 };
      }
      /* Wall decor (locs.mjs#LOCS's wall decor block): a hanging picture. Its
         model is authored flat against the tile's west face and carries the
         cache's own wall-mount marker (model type 4), so the whole placement is
         `wallRot` - the edge of its tile the wall is on - and locmodels.js draws
         it there rather than recentring it on the tile (see prepareLoc). */
      case "painting": return { key: o.kind || "painting", rot: o.wallRot || 0 };
      /* The isle's course (src/island.js#COURSE). Every piece is one object type
         whose own name IS the loc key it draws - `agile_net`, `agile_log`,
         `agile_rope_swing` - because that one name has to answer three separate
         questions: which model the bake carries (here), whether the tile blocks
         a step (world.js#SOLID_TYPES), and which verb its menu row shows
         (actions.js#AGILE_VERB). So the whole family needs one rule here: draw
         the model the type names, at the quarter-turn the world placed it with.
         The type is checked rather than the object's own `key` for the same
         reason: a course object carries no key, and a `::` command cannot
         invent one.

         `keys` is the one complication. The three log balances are one
         *obstacle* built from three cache models - the same object in three
         wood tones - so the crossing picks between them per tile with the same
         `hashPick` the trees and bushes use. Seven logs of one model would read
         as seven copies of one log, which is exactly what the hashing exists to
         avoid everywhere else in the world. */
      /* SEVER (object-picker): the hand-authoring ghost/stamp type. A prop
         draws whatever baked key it carries, at the world's own quarter-turn -
         the bush/pillar pattern - so the picker can stand any baked loc in the
         world without a per-loc world type. Delete this case to sever it. */
      case "prop": return o.key ? { key: o.key, rot: o.rot || 0 } : null;
      default: {
        if (!isAgileKey(o.t)) return null;
        const list = o.keys;
        return { key: list && list.length ? list[hashPick(hx, hz, 6161, list.length)] : o.t, rot: o.rot || 0 };
      }
    }
  }

  _buildingAtTile(x, z) {    for (const bd of this.world.buildings) {
      if (x >= bd.x0 && x <= bd.x1 && z >= bd.z0 && z <= bd.z1) return bd;
    }
    return null;
  }

  /* Which side of its building a wall tile sits on, in the wall model's own
     quarter-turn numbering: 0 = west edge, 1 = south edge, 2 = east edge,
     3 = north edge (see locs.mjs#wall). A tile on two sides at once is a
     CORNER, and it needs a panel for BOTH of them - that is `_wallRots`'s whole
     job, and `_buildDoors` reads these same four flags to face a door panel at
     the wall plane its tile sits in. */
  _wallSide(x, z) {
    const bd = this._buildingAtTile(x, z);
    if (!bd) return null;
    const w = x === bd.x0, e = x === bd.x1, n = z === bd.z0, s = z === bd.z1;
    return { w, e, n, s };
  }

  /* The panels a building ring puts on this tile, if any: every side of the
     ring the tile sits on (both, on a corner), nothing on a gap tile (a
     cave's mouth, a yard's gate - the way in stays open) and nothing off any
     ring. `_chunkLocs` draws these behind whatever prop shares the tile. */
  _ringRots(x, z) {
    const bd = this._buildingAtTile(x, z);
    if (!bd) return [];
    if (x !== bd.x0 && x !== bd.x1 && z !== bd.z0 && z !== bd.z1) return [];
    if (bd.gaps && bd.gaps.some((g) => g[0] === x && g[1] === z)) return [];
    return this._wallRots(x, z);
  }

  /* Every edge of its building a wall tile sits on, in the wall model's own
     quarter-turn numbering: 0 west, 1 south, 2 east, 3 north. A tile in the
     middle of a run answers with one side; a CORNER tile - on two sides at once
     - answers with two, and `_chunkLocs` draws a panel for each of them. That
     is the whole reason this exists: the baked wall is a thin panel standing at
     one edge of its tile (its own bounds are x 0.125 wide, not a box), so a
     corner drawn as a single panel is missing the other half of the corner and
     every building used to have four one-tile holes in its walls. `fallback` is
     the turn the object itself asked for, used when the tile is on no edge of
     any building (a wall the world placed by hand). */
  _wallRots(x, z, fallback = 0) {
    const sd = this._wallSide(x, z);
    if (!sd) return [fallback];
    const rots = [];
    if (sd.w) rots.push(0);
    if (sd.s) rots.push(1);
    if (sd.e) rots.push(2);
    if (sd.n) rots.push(3);
    return rots.length ? rots : [fallback];
  }

  _baseY(x, z) {
    const w = this.world;
    const base = Math.min(w.cornerAt(x, z), w.cornerAt(x + 1, z), w.cornerAt(x, z + 1), w.cornerAt(x + 1, z + 1));
    /* The square's dais: props stand on the steps, not under them. */
    return base + (w.stepAt ? w.stepAt(x, z) : 0);
  }

  _addObject(b, o, x, z) {
    /* Anything the loc bake covers is drawn as a real cache model by
       _chunkLocs (instanced, one shared geometry per model+rotation), so the
       procedural stand-in must not be emitted as well. */
    if (this.locSpec(o, x, z)) return;
    const r = hash01(x, z, 4441);
    const r2 = hash01(x, z, 9911);
    const cx = x + 0.5;
    const cz = z + 0.5;
    const gy = this._baseY(x, z);
    const U = this.uvs;
    b.setCell(U.solid);
    switch (o.t) {
      case "wall": {
        /* With the real cache wall baked, a wall is a loc instance (see
           _locSpec) and _addObject has already returned above. What is left is
           the fallback for the moment before the loc bake has landed: the same
           solid 1x1 box, at the baked wall's height so the roofs still land on
           it. */
        b.setCell(U.wall);
        const h = o.h || 1.9;
        const c = o.color || 0xcbbd96;
        b.boxTiled(cx, gy + h / 2 - 2, cz, 1.0, h + 2, 1.0, c, 1.0);
        b.box(cx, gy + h + 0.09, cz, 1.08, 0.2, 1.08, shade(c, 0.75));
        b.box(cx, gy + 0.12, cz, 1.04, 0.22, 1.04, shade(c, 0.68));
        break;
      }
      case "tree": {
        if (o.stump) {
          b.setCell(U.bark);
          b.cyl(cx, gy + 0.22, cz, 0.3, 0.44, mix(0x6a4a2c, 0.7).getHex(), r * 6);
          b.setCell(U.plank);
          b.cyl(cx, gy + 0.45, cz, 0.27, 0.05, mix(0xb59a6a, 0.7).getHex(), r * 6);
          break;
        }
        const s = 0.86 + r * 0.3;
        const kinds = {
          tree: { th: 1.35, tr: 0.15, leaf: 0x4b7c32, leaf2: 0x568c39, rad: 1.0, y: 0.78 },
          oak: { th: 1.7, tr: 0.21, leaf: 0x3f6b2b, leaf2: 0x4a7c33, rad: 1.3, y: 0.95 },
          willow: { th: 1.5, tr: 0.2, leaf: 0x5c8f43, leaf2: 0x6ea352, rad: 1.35, y: 0.75 },
          yew: { th: 1.9, tr: 0.2, leaf: 0x2f5a2a, leaf2: 0x3a6b32, rad: 1.25, y: 1.0 },
          maple: { th: 1.6, tr: 0.19, leaf: 0x6a8f3a, leaf2: 0x7fa34a, rad: 1.2, y: 0.9 },
          magic: { th: 2.1, tr: 0.22, leaf: 0x4a6f8a, leaf2: 0x5a86a2, rad: 1.3, y: 1.05 },
          evergreen: { th: 1.5, tr: 0.16, leaf: 0x2e5330, leaf2: 0x37633a, rad: 0.95, y: 0.85 },
          leafy: { th: 1.3, tr: 0.17, leaf: 0x578a3a, leaf2: 0x679f45, rad: 1.1, y: 0.72 },
        };
        const k = kinds[o.kind] || kinds.tree;
        const th = k.th * s;
        const tr = k.tr * s;
        b.setCell(U.bark);
        b.cyl(cx, gy + th / 2, cz, tr, th, mix(0x6b4a2b, 0.72).getHex(), r * 6);
        const ly = gy + th + k.y * s;
        const rad = k.rad * s;
        b.setCell(U.leaves);
        b.blob(cx, ly, cz, rad, mix(k.leaf, 0.6).getHex(), r2 * 6);
        b.blob(cx + rad * 0.45, ly + rad * 0.55, cz - rad * 0.25, rad * 0.72, mix(k.leaf2, 0.6).getHex(), r * 6 + 1);
        b.blob(cx - rad * 0.4, ly + rad * 0.4, cz + rad * 0.35, rad * 0.66, mix(shade(k.leaf, 0.88).getHex(), 0.6).getHex(), r2 * 6 + 2);
        if (o.kind === "willow") b.blob(cx, ly - rad * 0.5, cz, rad * 0.8, mix(k.leaf2, 0.6).getHex(), r * 6 + 3);
        break;
      }
      case "deadtree": {
        b.setCell(U.bark);
        const s = 0.9 + r * 0.5;
        const th = 2.4 * s;
        const dc = mix(0x5c4a38, 0.62).getHex();
        b.cyl(cx, gy + th / 2, cz, 0.17 * s, th, dc, r * 6);
        b.box(cx + 0.45 * s, gy + th * 0.82, cz, 1.0 * s, 0.13, 0.13, dc, 0.5);
        b.box(cx - 0.35 * s, gy + th * 0.68, cz + 0.3 * s, 0.8 * s, 0.12, 0.12, dc, -0.8);
        b.box(cx, gy + th * 0.9, cz - 0.4 * s, 0.7 * s, 0.11, 0.11, dc, 1.9);
        break;
      }
      case "rock": {
        b.setCell(U.rock);
        const grey = ORE_ROCK[o.ore] || ORE_ROCK.none;
        const n = o.empty ? 3 : 4;
        for (let i = 0; i < n; i++) {
          const a = r * 6.28 + i * 1.9;
          b.blob(
            cx + Math.cos(a) * (0.24 + (i % 2) * 0.1),
            gy + 0.26 + (i % 3) * 0.12,
            cz + Math.sin(a) * (0.24 + (i % 3) * 0.08),
            (o.empty ? 0.3 : 0.42) - (i % 2) * 0.05,
            mix(grey, 0.6 + (i % 2) * 0.16).getHex()
          );
        }
        if (!o.empty && o.ore !== "none") {
          const oc = ORE_COLOR[o.ore] || 0xffffff;
          for (let i = 0; i < 3; i++) {
            const a = r2 * 6.28 + i * 2.1;
            b.blob(cx + Math.cos(a) * 0.3, gy + 0.42 + i * 0.09, cz + Math.sin(a) * 0.3, 0.15, oc, 0);
          }
        }
        break;
      }
      case "fence": {
        /* Rails run from this tile's centre out to every neighbour that is also
           a fence, and the post stands at the centre - so a run reads as one
           continuous post-and-rail fence and a corner bends cleanly at the post
           instead of the two runs crossing each other. */
        const fenceAt = (dx, dz) => {
          const q = this.world.objAt(x + dx, z + dz);
          return !!(q && q.t === "fence");
        };
        const e = fenceAt(1, 0), wst = fenceAt(-1, 0);
        const n = fenceAt(0, -1), sf = fenceAt(0, 1);
        const railY = [0.82, 0.45];
        if (e || wst) {
          const sx = e && wst ? 1.0 : 0.5;
          const ox = (e ? 0.25 : 0) + (wst ? -0.25 : 0);
          for (const ry of railY) b.box(cx + ox, gy + ry, cz, sx, 0.09, 0.07, 0x7d6039);
        }
        if (n || sf) {
          const sz = n && sf ? 1.0 : 0.5;
          const oz = (sf ? 0.25 : 0) + (n ? -0.25 : 0);
          for (const ry of railY) b.box(cx, gy + ry, cz + oz, 0.07, 0.09, sz, 0x7d6039);
        }
        if (!e && !wst && !n && !sf) {
          for (const ry of railY) b.box(cx, gy + ry, cz, 1.0, 0.09, 0.07, 0x7d6039);
        }
        b.box(cx, gy + 0.5, cz, 0.15, 1.0, 0.15, 0x6d5233);
        b.box(cx, gy + 1.0, cz, 0.19, 0.08, 0.19, 0x5c4429);
        break;
      }
      case "rope": {
        const ropeAt = (dx, dz) => {
          const q = this.world.objAt(x + dx, z + dz);
          return !!(q && q.t === "rope");
        };
        const e = ropeAt(1, 0), wst = ropeAt(-1, 0);
        const n = ropeAt(0, -1), sf = ropeAt(0, 1);
        const post = 0xa88030, velvet = 0x8a1a2a;
        b.cyl(cx, gy + 0.5, cz, 0.09, 1.0, post, 0);
        b.blob(cx, gy + 1.05, cz, 0.12, post, 0);
        const rail = (alongX, from, to) => {
          const ys = [0.86, 0.76, 0.86];
          for (let i = 0; i < 3; i++) {
            const c = from + (to - from) * ((i + 0.5) / 3);
            const len = Math.abs(to - from) / 3 + 0.02;
            if (alongX) b.box(cx + c, gy + ys[i], cz, len, 0.07, 0.07, velvet, 0);
            else b.box(cx, gy + ys[i], cz + c, 0.07, 0.07, len, velvet, 0);
          }
        };
        if (e || wst) rail(true, wst ? -0.5 : 0, e ? 0.5 : 0);
        if (n || sf) rail(false, n ? -0.5 : 0, sf ? 0.5 : 0);
        if (!e && !wst && !n && !sf) rail(false, -0.5, 0.5);
        break;
      }
      case "bush": {
        b.setCell(U.leaves);
        b.blob(cx, gy + 0.35, cz, 0.45, mix(0x3d6b2c, 0.6).getHex(), r * 6);
        b.blob(cx + 0.22, gy + 0.5, cz - 0.16, 0.3, mix(0x4b8034, 0.6).getHex(), r2 * 6);
        break;
      }
      case "flowers": {
        const cols = [0xf2e35c, 0xe86a6a, 0xf0f0f0, 0x9a7de0, 0xe8a04a];
        for (let i = 0; i < 5; i++) {
          const a = r * 6.28 + i * 1.26;
          const px = cx + Math.cos(a) * (0.18 + (i % 3) * 0.1);
          const pz = cz + Math.sin(a) * (0.18 + (i % 2) * 0.12);
          b.box(px, gy + 0.12, pz, 0.05, 0.24, 0.05, 0x3f7a30);
          b.box(px, gy + 0.28, pz, 0.14, 0.1, 0.14, cols[(o.c || 0) + (i % 3)] || 0xf2e35c);
        }
        break;
      }
      case "booth": {
        b.box(cx, gy + 0.55, cz, 1.6, 1.1, 1.1, 0x7b5a35);
        b.box(cx, gy + 1.16, cz, 1.75, 0.14, 1.25, 0x9a7448);
        b.box(cx, gy + 1.35, cz, 1.5, 0.3, 0.1, 0x8a6a40, o.ry || 0);
        break;
      }
      case "counter": {
        b.box(cx, gy + 0.9, cz, 1.5, 0.14, 0.66, 0x9a7448, o.ry || 0);
        b.box(cx, gy + 0.45, cz, 1.4, 0.9, 0.55, 0x775536, o.ry || 0);
        break;
      }
      case "furnace": {
        b.box(cx, gy + 0.85, cz, 1.7, 1.7, 1.7, 0x7c7568);
        b.box(cx, gy + 2.05, cz, 1.1, 0.5, 1.1, 0x8d867a);
        b.box(cx, gy + 0.45, cz + 0.87, 0.8, 0.6, 0.12, 0x1a1410);
        b.box(cx, gy + 0.42, cz + 0.9, 0.6, 0.4, 0.08, 0xff7a1e);
        b.box(cx, gy + 2.2, cz, 0.4, 0.9, 0.4, 0x5c5348);
        break;
      }
      case "anvil": {
        b.box(cx, gy + 0.32, cz, 0.6, 0.64, 0.4, 0x3a3a3c);
        b.box(cx, gy + 0.72, cz, 1.0, 0.28, 0.44, 0x4a4a4c);
        b.box(cx + 0.62, gy + 0.72, cz, 0.35, 0.18, 0.3, 0x4a4a4c);
        b.box(cx, gy + 0.16, cz, 0.8, 0.32, 0.6, 0x5c4a34);
        break;
      }
      case "range": {
        b.box(cx, gy + 0.55, cz, 1.5, 1.1, 1.1, 0x7c7568);
        b.box(cx, gy + 1.16, cz, 1.6, 0.16, 1.2, 0x8d867a);
        b.box(cx, gy + 0.5, cz + 0.56, 0.9, 0.5, 0.1, 0xff7a1e);
        break;
      }
      case "well": {
        b.cyl(cx, gy + 0.4, cz, 0.62, 0.8, 0x8b8377, 0);
        b.cyl(cx, gy + 0.82, cz, 0.5, 0.05, 0x1b3a4a, 0);
        b.box(cx - 0.55, gy + 1.3, cz, 0.14, 1.8, 0.14, 0x6d5233);
        b.box(cx + 0.55, gy + 1.3, cz, 0.14, 1.8, 0.14, 0x6d5233);
        b.tri([cx - 0.8, gy + 2.2, cz + 0.6], [cx + 0.8, gy + 2.2, cz + 0.6], [cx, gy + 2.9, cz], 0x7b4a3c);
        b.box(cx, gy + 1.9, cz, 1.9, 0.12, 1.2, 0x6d5233);
        break;
      }
      case "table": {
        b.box(cx, gy + 0.82, cz, 1.5, 0.12, 1.0, 0x8a6a40);
        for (const [dx, dz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) {
          b.box(cx + dx, gy + 0.4, cz + dz, 0.12, 0.8, 0.12, 0x6d5233);
        }
        break;
      }
      case "chair": {
        b.box(cx, gy + 0.45, cz, 0.55, 0.1, 0.55, 0x8a6a40);
        b.box(cx, gy + 0.78, cz - 0.24, 0.55, 0.6, 0.1, 0x8a6a40);
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
          b.box(cx + dx, gy + 0.22, cz + dz, 0.1, 0.44, 0.1, 0x6d5233);
        }
        break;
      }
      case "crate": {
        b.box(cx, gy + 0.42, cz, 0.85, 0.85, 0.85, 0x9a7448, r * 6.28);
        b.box(cx, gy + 0.85, cz, 0.9, 0.08, 0.9, shade(0x9a7448, 0.78).getHex(), r * 6.28);
        break;
      }
      case "barrel": {
        b.cyl(cx, gy + 0.45, cz, 0.42, 0.9, 0x8a6a42, r * 6);
        b.cyl(cx, gy + 0.3, cz, 0.45, 0.08, 0x4a4a4a, r * 6);
        b.cyl(cx, gy + 0.62, cz, 0.45, 0.08, 0x4a4a4a, r * 6);
        break;
      }
      case "tent": {
        const c = 0x8a7a5a;
        const h = 1.9;
        b.tri([cx - 1.1, gy, cz - 1.1], [cx, gy + h, cz], [cx + 1.1, gy, cz - 1.1], c);
        b.tri([cx + 1.1, gy, cz + 1.1], [cx, gy + h, cz], [cx - 1.1, gy, cz + 1.1], shade(c, 0.82).getHex());
        b.tri([cx - 1.1, gy, cz + 1.1], [cx - 1.1, gy, cz - 1.1], [cx, gy + h, cz], shade(c, 0.7).getHex());
        b.tri([cx + 1.1, gy, cz - 1.1], [cx + 1.1, gy, cz + 1.1], [cx, gy + h, cz], shade(c, 0.7).getHex());
        b.box(cx, gy + 1.9, cz, 0.12, 0.4, 0.12, 0x5c4a34);
        break;
      }
      case "signpost": {
        b.box(cx, gy + 0.9, cz, 0.14, 1.8, 0.14, 0x6d5233);
        b.box(cx, gy + 1.5, cz, 1.1, 0.5, 0.1, 0x9a7448, o.ry || 0);
        break;
      }
      case "statue": {
        if (o.discord) this.addPlaque(x, z);
        b.box(cx, gy + 0.2, cz, 1.1, 0.4, 1.1, 0x8b8377);
        b.box(cx, gy + 1.1, cz, 0.6, 1.4, 0.5, 0xa8a196);
        b.blob(cx, gy + 1.95, cz, 0.32, 0xa8a196, 0);
        break;
      }
      case "fire": {
        /* the real firemaking fire (loc 2732: model 2260 + its own 600ms
           animation sequence) - an animated model instance, not merged
           geometry, so it is spawned here and lives outside the chunk mesh */
        this.addFire(x, z);
        break;
      }
      case "torch": {
        /* A permanent post torch: a stone foot, a short wooden stand and an
           iron fire basket carrying the same animated flame a campfire burns.
           The flame rides 0.72 above the ground so it sits in the basket, and
           the tile stays in the chunk's live-fire set (see _chunkObjects), so
           a rebuild re-hangs the flame instead of pruning it. */
        b.box(cx, gy + 0.1, cz, 0.5, 0.2, 0.5, 0x6b6259);
        b.cyl(cx, gy + 0.45, cz, 0.09, 0.55, 0x5a4128, r * 6);
        b.box(cx, gy + 0.72, cz, 0.42, 0.1, 0.42, 0x3d3d46);
        this.addFire(x, z, 0.72);
        break;
      }
      case "fishing": {
        const y = this.world.waterLevel + 0.2;
        for (let i = 0; i < 3; i++) {
          const a = r * 6.28 + i * 2.1;
          const px = cx + Math.cos(a) * 0.3;
          const pz = cz + Math.sin(a) * 0.3;
          b.quad([px - 0.14, y, pz - 0.14], [px + 0.14, y, pz - 0.14], [px + 0.14, y, pz + 0.14], [px - 0.14, y, pz + 0.14], 0xd8f0ff);
        }
        b.blob(cx, y + 0.06, cz, 0.12, 0xe8c8a0, 0);
        break;
      }
    }
  }

  _buildRoofs() {
    for (const bd of this.world.buildings) {
      let base = Infinity;
      for (let z = bd.z0; z <= bd.z1; z++) {
        for (let x = bd.x0; x <= bd.x1; x++) {
          base = Math.min(base, this.world.heightAt(x + 0.5, z + 0.5));
        }
      }
      bd.baseY = base;
      /* A cave has no roof to build (src/world.js#cave): the rock above a lair
         is not something this renderer draws, and a pitched roof on a ring of
         stone would just make the lair look like a cottage you cannot see into.
         `roofMesh` stays null, which is what `setRoofVisibility` and the
         Remove-Roofs toggle already expect of a building without one. */
      if (bd.noRoof) { bd.roofMesh = null; continue; }
      /* An upper storey carries the roof one level up: the eaves sit on the
         upper walls, not the ground ones. */
      const wallH = this._wallHeight() + (bd.upperStorey ? UP_Y : 0);
      const mb = new MeshBuilder();
      mb.setCell(this.uvs.roof);
      const x0 = bd.x0;
      const x1 = bd.x1 + 1;
      const z0 = bd.z0;
      const z1 = bd.z1 + 1;
      const h = bd.roofH;
      const oh = 0.3;
      const col = new THREE.Color(bd.roof);
      const ox0 = x0 - oh, ox1 = x1 + oh, oz0 = z0 - oh, oz1 = z1 + oh;
      const RT = 1.9;
      const lenX = ox1 - ox0;
      const lenZ = oz1 - oz0;
      if (bd.roofAxis === "x") {
        const zr = (oz0 + oz1) / 2;
        const slope = Math.hypot(lenZ / 2, h);
        const nu = lenX / RT, nv = slope / RT;
        mb.tiledQuad([ox0, wallH, oz0], [ox1, wallH, oz0], [ox1, wallH + h, zr], [ox0, wallH + h, zr], col.clone().multiplyScalar(1.06), nu, nv);
        mb.tiledQuad([ox1, wallH, oz1], [ox0, wallH, oz1], [ox0, wallH + h, zr], [ox1, wallH + h, zr], col.clone().multiplyScalar(0.84), nu, nv);
        mb.tri([ox0, wallH, oz0], [ox0, wallH + h, zr], [ox0, wallH, oz1], col.clone().multiplyScalar(0.68));
        mb.tri([ox1, wallH, oz1], [ox1, wallH + h, zr], [ox1, wallH, oz0], col.clone().multiplyScalar(0.68));
        mb.box(ox0, wallH + 0.06, zr, 0.3, 0.24, oz1 - oz0, shade(bd.roof, 0.6));
        mb.box(ox1, wallH + 0.06, zr, 0.3, 0.24, oz1 - oz0, shade(bd.roof, 0.6));
      } else {
        const xr = (ox0 + ox1) / 2;
        const slope = Math.hypot(lenX / 2, h);
        const nu = slope / RT, nv = lenZ / RT;
        mb.setSwap(true);
        mb.tiledQuad([ox0, wallH, oz0], [xr, wallH + h, oz0], [xr, wallH + h, oz1], [ox0, wallH, oz1], col.clone().multiplyScalar(1.06), nu, nv);
        mb.tiledQuad([ox1, wallH, oz1], [xr, wallH + h, oz1], [xr, wallH + h, oz0], [ox1, wallH, oz0], col.clone().multiplyScalar(0.84), nu, nv);
        mb.setSwap(false);
        mb.tri([ox1, wallH, oz0], [xr, wallH + h, oz0], [ox0, wallH, oz0], col.clone().multiplyScalar(0.68));
        mb.tri([ox0, wallH, oz1], [xr, wallH + h, oz1], [ox1, wallH, oz1], col.clone().multiplyScalar(0.68));
        mb.box(xr, wallH + 0.06, oz0, ox1 - ox0, 0.24, 0.3, shade(bd.roof, 0.6));
        mb.box(xr, wallH + 0.06, oz1, ox1 - ox0, 0.24, 0.3, shade(bd.roof, 0.6));
      }
      /* A chimney: a stone stack on the ridge at one gable end, tall enough to
         clear the ridge and capped, the way the era's houses are. It has to sit
         ON the ridge - a stack anywhere else ends up half-buried in a roof
         slope and reads as a grey box growing out of the tiles. */
      if (hash01(bd.x0, bd.z0, 77) > 0.12) {
        const ridgeY = wallH + h;
        const stackH = 1.7;
        const chx = bd.roofAxis === "x" ? x0 + 1.0 : (ox0 + ox1) / 2;
        const chz = bd.roofAxis === "x" ? (oz0 + oz1) / 2 : z0 + 1.0;
        mb.setCell(this.uvs.wall);
        mb.box(chx, ridgeY + stackH / 2 - 0.7, chz, 0.64, stackH, 0.64, 0xa8a496);
        mb.box(chx, ridgeY + stackH - 0.62, chz, 0.86, 0.2, 0.86, 0x8e8574);
        mb.setCell(this.uvs.solid);
        mb.box(chx, ridgeY + stackH - 0.5, chz, 0.34, 0.12, 0.34, 0x2b2b2b);
        mb.setCell(this.uvs.roof);
      }
      const geo = mb.build();
      if (base > 0.0001) geo.translate(0, base, 0);
      const mesh = new THREE.Mesh(geo, this.roofMat);
      mesh.userData.building = bd;
      this.roofRoot.add(mesh);
      bd.roofMesh = mesh;
    }
  }

  /* A door is a real cache loc as well (locs.mjs#door_closed: the wall shape
     set with the door's own retextures, i.e. the stone panel becomes a wooden
     door). A door tile is not instanced with the walls because its model has to
     change the moment the door opens, so each door gets a mesh of its own.

     The open door is the SAME panel turned a further quarter turn about the
     tile centre - which is what the client's door swap amounts to: the panel
     that lay in the wall plane ends up across the doorway, standing open beside
     the opening. The tile therefore reads as a passage you can walk through,
     with the leaf flat against the wall at the hinge side. */
  _buildDoors() {
    for (const [key, o] of this.world.objs) {
      if (o.t !== "door") continue;
      const x = key % this.world.w;
      const z = (key / this.world.w) | 0;
      /* the door panel is the same thin wall panel, so it has to face the side
         of the building its tile is on */
      const sd = this._wallSide(x, z);
      o.wallRot = sd ? (sd.w ? 0 : sd.s ? 1 : sd.e ? 2 : 3) : 0;
      /* where the leaf sits once swung open (see setDoorOpen) */
      o.openRot = (o.wallRot + 1) & 3;
      /* The open leaf is a wall in its own right: the panel that lay in the
         wall plane ends up across the doorway on the hinge side, so the open
         tile is a passage along the doorway axis but the leaf's own edge
         stays sealed - you walk through the doorway, never through the door
         itself (the user's rule, 2026-10-09). The mask is the leaf's edge in
         the same numbering blocksStep reads, so laterally the whole wall line
         - panels and leaves alike - reads continuous, while the passage stays
         open. A shut door never asks it: its tile is solid. */
      o.block = 1 << o.openRot;
      const geo = locGeometry("door_closed", o.open ? o.openRot : o.wallRot);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.locMat);
      mesh.userData.sharedGeometry = true;
      mesh.position.set(x + 0.5, this._baseY(x, z), z + 0.5);
      this.doorRoot.add(mesh);
      o.mesh = mesh;
      this.doors.push(mesh);
    }
  }

  setDoorOpen(o, open) {
    o.open = open;
    if (!o.mesh) return;
    const rot = open ? (o.openRot == null ? ((o.wallRot || 0) + 1) & 3 : o.openRot) : (o.wallRot || 0);
    const geo = locGeometry("door_closed", rot);
    if (geo) o.mesh.geometry = geo;
  }

  update(dt) {
    this.time += dt;
    /* The client's water animation, to the texel.

       `Client.animateTexture` shifts the water texture's bytes by
       `width * animationTimePassed * 2` per client cycle, and
       `animationTimePassed` is reset at the end of every frame's
       `drawGameScreen` - so the water moves exactly **2 texels per 20 ms cycle**,
       i.e. 100 texels a second: a full 128-texel tile every 1.28 s. The shift is
       toward increasing v (new row y takes the old row y - 2), which is south,
       which for the north-facing camera the game opens with is the downward flow
       the water has always shown.

       The offset is time-based rather than per-frame: the client's own rate is
       per cycle, not per rendered frame, so a 144 Hz display must not ripple
       three times as fast as a 50 Hz one. Both the river mesh and the ocean
       plane sample this one texture, so a single offset moves them in phase -
       which is what the client's global texture shift does too. */
    const wt = this.waterMat.map;
    if (wt && !WATER_STILL) {
      let off = wt.offset.y - (WATER_TEXELS_PER_SEC * dt) / WATER_TEXELS;
      off -= Math.floor(off);
      wt.offset.y = off;
    }
    /* Shore ripples expand+fade on their own clocks, standstill or not. */
    if (this.ripples) {
      for (const r of this.ripples) {
        const t = (this.time * r.rate + r.phase) % 1;
        const s = 0.12 + 0.5 * t;
        r.m.scale.set(s, 1, s);
        r.mat.opacity = 0.45 * (1 - t) * Math.min(1, t * 6);
      }
    }
    /* Foam streaks drift down-current inside a small wander box around their
       anchor and breathe in/out - always over deep open water, never ashore. */
    if (this.streaks) {
      for (const s of this.streaks) {
        const t = this.time * s.rate + s.ph;
        const drift = ((t % 1) + 1) % 1;
        s.m.position.x = s.ax + s.wx * (drift - 0.5) * 1.6;
        s.m.position.z = s.az + s.wz * (drift - 0.5) * 1.6;
        s.mat.opacity = s.peak * Math.sin(drift * Math.PI);
      }
    }
    /* Fish breach on their own clocks, ring the splash, then hide. */
    if (this.fish) {
      for (const f of this.fish) {
        if (f.state === "wait") {
          f.t -= dt;
          if (f.t <= 0) {
            const spot = this._fishSpot();
            if (spot) {
              f.x = spot[0]; f.z = spot[1];
              const fa = hash01((f.x * 97) | 0, (f.z * 57) | 0, 9204) * 6.28;
              f.dx = Math.cos(fa); f.dz = Math.sin(fa);
              f.state = "jump"; f.t = 0;
            } else {
              f.t = 2;
            }
          }
        } else {
          f.t += dt;
          const k = f.t / 0.8;
          if (k >= 1) {
            f.state = "wait";
            f.t = 3 + hash01((f.x * 31) | 0, (f.z * 77) | 0, 9205) * 6;
            f.fm.visible = false;
            f.ring.visible = false;
          } else {
            const px = f.x + f.dx * k * 0.55;
            const pz = f.z + f.dz * k * 0.55;
            f.fm.visible = true;
            f.fm.position.set(px, this._fishSeaY + 0.02 + 4 * k * (1 - k) * 0.55, pz);
            f.fm.rotation.y = Math.atan2(f.dx, f.dz);
            f.fm.rotation.x = (0.5 - k) * 1.6;
            f.ring.visible = true;
            f.ring.position.set(f.x, this._fishSeaY + 0.008, f.z);
            const rs = 0.12 + 0.5 * k;
            f.ring.scale.set(rs, 1, rs);
            f.ringMat.opacity = 0.5 * (1 - k);
          }
        }
      }
    }
    /* The shoreline ebb (user ask 2026-10-27, osws-terrain's coastline water):
       the water breathes slowly up and down against the shore, ±3cm on a ~7s
       swell plus a smaller ±1.5cm chop (4.5cm peak total, inside the 0.05
       terrain-kit ceiling so the sheet can never touch the pinned
       contour verts), so surf visibly laps in and out over flat beaches (the
       tutorial island's new near-sea-level shelf shows it best). The river
       quads are the sea now (the old flat ocean sheet was removed 2026-10-30)
       because the client's own water is one level everywhere. */
    if (this.waterRoot) {
      if (WATER_STILL) {
        this.waterRoot.position.y = 0;
      } else {
        const ebb = Math.sin(this.time * 0.9) * 0.03 + Math.sin(this.time * 1.7 + 1.3) * 0.015;
        this.waterRoot.position.y = ebb;
      }
    }
    /* The cache's other animated textures - the fire cape's flame - move on the
       same clock and in the same direction, because the client shifts them all
       with one counter (src/models3d.js#animateCharTextures). The scenery's own
       animated textures (the magic tree's sparkle shell, the fishing spot's
       sparkle) ride the same counter too, and are scrolled by their own cell's
       direction and speed out of the bake. */
    animateCharTextures(dt);
    advanceLocAnimTextures(dt);
    advanceLocAnims(dt);
    /* Fires are CPU-skinned models updated every frame, map-wide - including
       the dungeon's 16 torches while the runner is on the surface. Tiered by
       distance from the camera: near fires play full rate, mid fires quarter
       rate (dt x4 keeps the flicker in sync, just coarser), far fires freeze
       (past model LOD range - off-screen anyway). */
    this._fireTick = (this._fireTick | 0) + 1;
    const cp = this.camera.position;
    const camSet = cp.x !== 0 || cp.z !== 0;
    let fi = 0;
    for (const f of this.fires.values()) {
      fi++;
      let step = dt;
      if (camSet) {
        const fdx = f.x + 0.5 - cp.x, fdz = f.z + 0.5 - cp.z;
        const fd2 = fdx * fdx + fdz * fdz;
        if (fd2 > 2025) continue;
        if (fd2 > 625) {
          if (((this._fireTick + fi) & 3) !== 0) continue;
          step = dt * 4;
        }
      }
      f.ch.update(step, { camYaw: this._camYaw, camPitch: this._camPitch, dir: 0 });
    }
  }

  setRoofVisibility(playerBuilding) {
    /* `roofsHidden` is the options-tab "Remove Roofs" toggle: on, every roof
       comes off for good; off, only the roof of the building you are standing
       in is lifted (the client's own behaviour). */
    for (const bd of this.world.buildings) {
      if (bd.roofMesh) bd.roofMesh.visible = !this.roofsHidden && bd !== playerBuilding;
    }
  }

  /* The upper floor is drawn only when the player can see it: on the stairs'
     own level (always - the player standing up there must see their own
     room), or outside the building looking at the whole two-storey front,
     and only while roofs are on: a top floor lives on the roof plane, so
     the "Remove Roofs" toggle (`roofsHidden`, on by default) takes it off
     with the roofs - see the call in game.js#updateVisuals. Standing in
     the ground room with the upper walls, furniture and slab still drawn
     leaves the ceiling in the way of the camera and the room unreadable,
     so they go until the climb. New chunk meshes arrive visible, which is
     the right default for the common (shown) state; the hidden state
     re-hides them every frame, and the flip back re-shows them once. */
  setUpstairsVisibility(v) {
    v = !!v;
    if (this.upstairsRoot.visible !== v) this.upstairsRoot.visible = v;
    if (v) {
      if (this._upstairsVis === false) {
        for (const m of this.objectRoot.children) {
          if (m.userData.upstairs && !m.visible) m.visible = true;
        }
      }
    } else {
      for (const m of this.objectRoot.children) {
        if (m.userData.upstairs && m.visible) m.visible = false;
      }
    }
    this._upstairsVis = v;
  }

  /* The cave sky: inside the Kinshra Hideout the world above does not exist,
     so the sky and the fog go black instead of day-blue. `k` eases toward the
     target each frame so walking in through the ladder reads as descending,
     not as a cut. */
  setCaveSky(inside, dt) {
    const target = inside ? 1 : 0;
    const k = this._caveK == null ? target : this._caveK + Math.min(1, Math.max(-1, target - this._caveK)) * Math.min(1, dt * 2.5);
    this._caveK = k;
    if (!this._caveSkyCol) {
      this._caveSkyCol = new THREE.Color(SKY);
      this._caveBlack = new THREE.Color(0x000000);
    }
    this.scene.background.copy(this._caveSkyCol).lerp(this._caveBlack, k);
    this.scene.fog.color.copy(this._caveSkyCol).lerp(this._caveBlack, k);
  }

  setCamera(target, yaw, pitch, dist) {
    this._camYaw = yaw;
    this._camPitch = pitch;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    this.camera.position.set(
      target.x + Math.sin(yaw) * cp * dist,
      target.y + sp * dist,
      target.z + Math.cos(yaw) * cp * dist
    );
    this.camera.lookAt(target.x, target.y + 0.9, target.z);
  }

  /* The camera ray through a point on the canvas, shared by every picking
     routine below so the ground hit and the object hit are measured along one
     and the same line and can be compared by distance (the direction is a unit
     vector, so a `t` along the ray is a distance in tiles). */
  rayFromScreen(ndcX, ndcY) {
    if (!this._pickRay) {
      this._pickRay = new THREE.Raycaster();
      this._pickNdc = new THREE.Vector2();
    }
    this._pickNdc.set(ndcX, ndcY);
    this._pickRay.setFromCamera(this._pickNdc, this.camera);
    return this._pickRay.ray;
  }

  rayToGround(ndcX, ndcY) {
    const ray = this.rayFromScreen(ndcX, ndcY);
    return this._groundAlong(ray.origin, ray.direction);
  }

  /* Where a ray meets a flat level plane (the upstairs slab - see
     world.js#UP_Y): analytic, since the slab is levelled flat, unlike the
     terrain's fixpoint walk above. Null when the ray runs parallel or away. */
  rayToSlabPlane(ndcX, ndcY, y) {
    const ray = this.rayFromScreen(ndcX, ndcY);
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return {
      x: ray.origin.x + ray.direction.x * t,
      y,
      z: ray.origin.z + ray.direction.z * t,
      dist: t,
    };
  }

  /* Where a ray meets the terrain, and how far along the ray that is. The
     height field is not an analytic surface, so this walks to its fixpoint:
     guess the height where the ray reaches the current y, then take the height
     there for the next guess. Five passes is plenty for the world's 0.5-tile
     steps. */
  _groundAlong(o, d) {
    if (Math.abs(d.y) < 1e-6) return null;
    let y = 0;
    let t = 0;
    let p = null;
    for (let i = 0; i < 5; i++) {
      const tt = (y - o.y) / d.y;
      if (tt < 0) break;
      t = tt;
      p = { x: o.x + d.x * t, y, z: o.z + d.z * t };
      y = this.world.heightAt(p.x, p.z);
    }
    if (!p) return null;
    p.y = this.world.heightAt(p.x, p.z);
    p.dist = t;
    return p;
  }

  /* The box a world object occupies for a candidate click: its tile, from just
     under the ground it stands on up to the top of its model. A baked cache loc
     uses the model's own height, so the box matches what is drawn; the procedural
     fallbacks (used until the bake lands, and for the few objects with no cache
     model) use OBJ_TOP. This is only what makes a loc a *candidate* - whether a
     click really lands on it is the mesh test in `_tileHit` (`_locMeshHit`).
     Returns null for a tile with nothing to click. */
  objTopY(x, z, o) {
    const w = this.world;
    let base = this._baseY(x, z);
    /* A piece that stands in water is drawn at the water's own surface (see
       _chunkLocs' `surf` rule), not on the sea bed under it - and the pick
       column has to stand where the mesh is, or the click box floats metres
       off the model (the canal's ropeswings, whose 3.8-tile column rose from
       the bed instead of the surface). */
    if (o.surf != null) base = w.waterLevel + o.surf;
    /* a fishing spot floats on the water surface rather than on the waterbed,
       which is metres below it */
    if (base < w.waterLevel - 0.02 && w.tiles[z * w.w + x] === T.WATERBED) base = w.waterLevel - 0.05;
    base += (o.dy || 0) + (o.plane || 0) * UP_Y;
    let h;
    /* how far above the floor the drawn model starts: only a wall-mounted loc
       (a painting, a lever) answers anything but 0 - see locmodels.js#locMountY */
    let mount = 0;
    if (o.t === "door") h = this._wallHeight();
    else {
      const spec = this._locSpec(o, x, z);
      if (spec && hasLoc(spec.key)) {
        /* The column is the DRAWN mesh's own height, not the bake's raw
           bounds: a few cache locs carry a vertical scale (or a footY shift)
           the raw bounds do not include, so the JSON height and the mesh
           disagree - a stepping stone clickable two tiles into the sky, a
           wall of flame whose column ends at its knees. The geometry is what
           the picker ray-tests and what ::boxes outlines, so the candidate
           column is measured off it too. */
        const gg = locGeometry(spec.key, spec.rot || 0);
        if (gg) {
          if (!gg.boundingBox) gg.computeBoundingBox();
          h = gg.boundingBox.max.y;
        } else h = locHeight(spec.key);
        mount = locMountY(spec.key);
      } else {
        h = OBJ_TOP[o.t];
      }
    }
    /* A fishing spot answers for its whole tile (see _tileHit), so its box is
       given enough height to be caught in: the swirl itself is only a wisp
       above the water, and a short box would let shallow rays pass over the
       tile without ever entering it. A flat tile's column projects to a thin
       band at a low camera angle, so the top is raised until it covers
       FISH_MIN_PX on screen (capped by FISH_RAISE_CAP) - at a top-down angle
       the band is already tall and nothing is added. */
    if (o.t === "fishing" && h != null) h = Math.max(h, 0.6);
    if (h == null) return null;
    const lo = base + mount - 0.25;
    let hi = base + mount + Math.max(0.08, h);
    if (o.t === "fishing") hi = Math.max(hi, Math.min(this._fishColumnHi(x, z, lo), hi + FISH_RAISE_CAP));
    return { lo, hi };
  }

  /* The column top a fishing spot needs so that its pick box covers at least
     FISH_MIN_PX screen pixels vertically: project the tile-centre column's
     foot, then walk the top up until the band is tall enough. Only the height
     is ever raised - the column is already a whole tile wide. If the projection
     is flipped (the spot behind the camera) the natural top stands. */
  tileOnScreen(x, z) {
    const v = this._projScratch || (this._projScratch = new THREE.Vector3());
    v.set(x + 0.5, (this.world.heightAt(x + 0.5, z + 0.5) || 0) + 0.6, z + 0.5).project(this.camera);
    return v.z < 1 && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1;
  }

  _fishColumnHi(x, z, lo) {    const v = this._projScratch || (this._projScratch = new THREE.Vector3());
    const H = this.canvas.clientHeight || 334;
    const px = x + 0.5, pz = z + 0.5;
    const yOf = (y) => {
      v.set(px, y, pz).project(this.camera);
      return (1 - v.y) / 2 * H;
    };
    const yLo = yOf(lo);
    let hi = lo + 0.6, yHi = yOf(hi);
    for (let i = 0; i < 8 && (yLo - yHi) >= 0 && (yLo - yHi) < FISH_MIN_PX; i++) {
      hi += 0.4;
      yHi = yOf(hi);
    }
    return (yLo - yHi) >= 0 ? hi : lo + 0.6;
  }

  /* Every world object the ray runs into, nearest first, each as a tile plus how
     far along the ray it was hit.

     The tile grid is the CANDIDATE test: marching it (Amanatides-Woo) and
     clipping each cell against the ray's vertical slab is exact for tile-shaped
     boxes and costs a handful of steps, which is what finds the objects a ray
     could plausibly be pointing at. With `exact` on - which is how picking and
     the menus both use it now - every candidate is then put to `_tileHit`'s mesh
     test, so what comes back is what the ray actually meets: the model's own
     triangles, sampling the same texture cut-out the material's `alphaTest`
     does. Object picking used to stop at the box, which is why a click on the
     grass inside a tree's footprint chopped the tree (see `_locMeshHit`).

     The whole list is what the right-click menu is built from (unit XXVIII:
     src/game.js#Game.pickAll): "every loc the ray meets" *is* "every object under
     the cursor", which is the client's own menu test (`method310` scans the
     projected boxes of everything in the scene) - and the mesh makes it a tighter
     answer than the client's fudged box ever was. */
  rayLocs(ndcX, ndcY, maxDist, exact = false) {
    const ray = this.rayFromScreen(ndcX, ndcY);
    const o = ray.origin;
    const d = ray.direction;
    const limit = Math.min(maxDist > 0 ? maxDist : 80, 96);
    const invX = Math.abs(d.x) > 1e-9 ? 1 / Math.abs(d.x) : Infinity;
    const invZ = Math.abs(d.z) > 1e-9 ? 1 / Math.abs(d.z) : Infinity;
    const stepX = d.x >= 0 ? 1 : -1;
    const stepZ = d.z >= 0 ? 1 : -1;
    let tx = Math.floor(o.x);
    let tz = Math.floor(o.z);
    let tMaxX = invX === Infinity ? Infinity : (d.x >= 0 ? tx + 1 - o.x : o.x - tx) * invX;
    let tMaxZ = invZ === Infinity ? Infinity : (d.z >= 0 ? tz + 1 - o.z : o.z - tz) * invZ;
    let t = 0;
    const hits = [];
    for (let guard = 0; guard < 256; guard++) {
      const tExit = Math.min(Math.min(tMaxX, tMaxZ), limit);
      if (t > tExit) break;
      const hit = this._tileHit(tx, tz, o, d, t, tExit, ray, exact);
      if (hit) hits.push(hit);
      if (tExit >= limit) break;
      if (tMaxX < tMaxZ) { tx += stepX; t = tMaxX; tMaxX += invX; }
      else { tz += stepZ; t = tMaxZ; tMaxZ += invZ; }
    }
    /* With the mesh test on, a hit's distance is where the ray met the MODEL,
       not where it entered the tile's box, so the list has to be put back in
       ray order before the head of it means "the thing under the cursor". */
    if (exact && hits.length > 1) hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  /* The first of the list: what a pick resolves to. Kept as its own method
     because that is the only thing picking wants and it reads better at the
     call sites than `rayLocs(...)[0]` with a null guard. This is the exact
     list - a left click and the hover label resolve through the mesh, not the
     box (see `_tileHit`). */
  rayLoc(ndcX, ndcY, maxDist) {
    const hits = this.rayLocs(ndcX, ndcY, maxDist, true);
    return hits.length ? hits[0] : null;
  }

  /* ------------------------------------------------------- exact loc picking

     The tile box above is generous on purpose - a whole tile wide and as tall as
     the model - which meant a left click on a tree landed on the tree from
     anywhere inside that box, *including the grass beside its trunk* (the user's
     report, 2026-09-23: "lets say you tap inside the purple area. you are
     actually clicking on grass or rebbeach, but you end up clicking the tree
     still"). So the box is now only the *candidate* test: a click resolves to a
     loc only when the ray meets the loc's own drawn model - its triangles
     (`_locMeshHit`) *and* the cut-out of the texture it samples (`_uvOpaque`),
     which is exactly the test the scenery material's `alphaMap` + `alphaTest`
     make when the model is drawn. A ray that met only the box falls through to
     the ground beneath it, so a tap on the grass inside a tree's footprint
     walks there instead of chopping.

     The model's placement is the one `_chunkLocs` draws it at: a pure
     translation (the quarter-turn is baked into the geometry by
     locmodels.js#locGeometry), at the *anchor* tile of the footprint rather than
     the tile the cursor is over - a 2x2 tree's model stands at the centre of its
     whole footprint, one tile from a tile that merely carries the same object. */
  _locAnchor(x, z, o, fx, fz) {
    if (o.ox != null && o.oz != null) return [o.ox, o.oz];
    const w = this.world;
    let ax = x;
    let az = z;
    for (let i = 1; i < fx && ax > 0; i++) {
      const no = w.objs.get(az * w.w + (ax - 1));
      if (!no || no.t !== o.t || !this.locSpec(no, ax - 1, az)) break;
      ax -= 1;
    }
    for (let j = 1; j < fz && az > 0; j++) {
      const no = w.objs.get((az - 1) * w.w + ax);
      if (!no || no.t !== o.t || !this.locSpec(no, ax, az - 1)) break;
      az -= 1;
    }
    return [ax, az];
  }

  _locDrawTransform(x, z, o, spec) {
    const [fx, fz] = (o.fx && o.fz) ? [o.fx, o.fz] : locFootprint(spec.key);
    const [ax, az] = this._locAnchor(x, z, o, fx, fz);
    const y = o.t === "fishing" ? this.world.waterLevel + 0.2
      : o.t === "rocky" ? this.world.waterLevel + ROCKY_STEP_BASE
      : o.surf != null ? this.world.waterLevel + o.surf
      : this._baseY(ax, az);
    /* A door is drawn as ONE leaf swung by its own state (`setDoorOpen`), not as
       the wall-keyed loc `_locSpec` names it as, so the drawn quarter-turn is the
       leaf's and not the doorway's. */
    const rots = o.t === "door"
      ? [o.open ? (o.openRot == null ? ((o.wallRot || 0) + 1) & 3 : o.openRot) : (o.wallRot || 0)]
      : spec.key === "wall" ? this._wallRots(ax, az, spec.rot) : [spec.rot];
    return {
      px: ax + 0.5 + (fx - 1) / 2 + (o.dx || 0),
      py: y + (o.dy || 0) + (o.plane || 0) * UP_Y,
      pz: az + 0.5 + (fz - 1) / 2 + (o.dz || 0),
      rots,
    };
  }

  /* Is the texel this uv samples one the material would draw? The uv is in
     atlas space (locmodels.js#prepareLoc's `cellFace`), and the mask is the
     packed sheet's own cut-out - the same value three.js multiplies into the
     fragment's alpha before `alphaTest: 0.5`. */
  _uvOpaque(uv) {
    const m = locMaskData();
    if (!m) return true;
    let px = Math.floor(uv.x * m.w);
    let py = Math.floor(uv.y * m.h);
    if (px < 0) px = 0; else if (px >= m.w) px = m.w - 1;
    if (py < 0) py = 0; else if (py >= m.h) py = m.h - 1;
    return m.data[(py * m.w + px) * 4 + 1] > 127;
  }

  /* The nearest point at which the ray meets the loc's drawn model within
     `far`, or null. The mesh is thrown together per call - one geometry, one
     translation - because the scene's own copy is an InstancedMesh whose
     instance ids say nothing about which tile they stand on. */
  _locMeshHit(x, z, o, spec, ray, far) {
    const t = this._locDrawTransform(x, z, o, spec);
    let mesh = this._pickMesh;
    if (!mesh) {
      mesh = this._pickMesh = new THREE.Mesh(undefined, _pickMaterial);
    }
    mesh.position.set(t.px, t.py, t.pz);
    mesh.updateMatrixWorld(true);
    let rc = this._locPickRay;
    if (!rc) rc = this._locPickRay = new THREE.Raycaster();
    rc.set(ray.origin, ray.direction);
    rc.near = 0.01;
    rc.far = far > 0 ? far : Infinity;
    let best = null;
    for (const rot of t.rots) {
      const parts = [[locGeometry(spec.key, rot), -1]];
      const gg = locGlowGeometry(spec.key, rot);
      if (gg) parts.push([gg, -1]);
      for (const id of locAnimIdsForModel(spec.key)) parts.push([locAnimGeometry(spec.key, rot, id), id]);
      for (const [geom, animId] of parts) {
        if (!geom) continue;
        mesh.geometry = geom;
        for (const h of rc.intersectObject(mesh, false)) {
          /* The cut-out belongs to the sheet's own faces; an animated overlay
             (the magic tree's sparkle shell, the fishing spot's swirl) is a
             sparse decoration drawn over the object's art - 94 % of the sparkle
             cell is holes - so a texel test there would leave a fishing spot
             nearly unclickable. Those faces count as solid. */
          if (h.uv && animId < 0 && !this._uvOpaque(h.uv)) continue;
          if (best == null || h.distance < best) best = h.distance;
        }
      }
    }
    return best;
  }

  _tileHit(x, z, o, d, tEnter, tExit, ray, exact) {
    const w = this.world;
    if (!w.inBounds(x, z)) return null;
    /* Both levels answer: the ground object and whatever stands on the same
       tile upstairs (the stairs share (76,54) with each other). Each is tested
       on its own column and the nearest win carries its level on the object,
       so the menus offer the flight the clicker is standing on. */
    let best = null;
    for (let plane = 0; plane <= 1; plane++) {
      const obj = plane === 0 ? w.objAt(x, z) : w.upObjs.get(z * w.w + x);
      if (!obj) continue;
      const hit = this._tileHitObj(x, z, obj, o, d, tEnter, tExit, ray, exact);
      if (hit && (!best || hit.dist < best.dist)) best = hit;
    }
    return best;
  }

  _tileHitObj(x, z, obj, o, d, tEnter, tExit, ray, exact) {
    const box = this.objTopY(x, z, obj);
    if (!box) return null;
    /* the camera itself can end up inside an object's box (pulled in close
       against a wall) - being inside it is not "clicking on" it */
    if (tEnter <= 0 && o.y >= box.lo && o.y <= box.hi) return null;
    let s0 = -Infinity;
    let s1 = Infinity;
    if (Math.abs(d.y) >= 1e-9) {
      s0 = (box.lo - o.y) / d.y;
      s1 = (box.hi - o.y) / d.y;
      if (s0 > s1) { const s = s0; s0 = s1; s1 = s; }
    } else if (o.y < box.lo || o.y > box.hi) {
      return null;
    }
    const t0 = Math.max(tEnter, s0);
    const t1 = Math.min(tExit, s1);
    if (t0 > t1) return null;
    const dist = Math.max(t0, 0.05);
    if (dist > t1) return null;
    if (exact && ray) {
      const spec = this.locSpec(obj, x, z);
      /* a loc with no baked model (the procedural stand-in) has no mesh to
         test, so its box is all the answer there is */
      if (spec) {
        /* A fishing spot's drawn model is a wisp of bubbles much smaller than
           its tile, so the mesh test would leave most of the tile unclickable:
           the whole tile is the spot, and the tile's own box is the answer. A
           flax plant is the same trade the other way round: a few thin stalks
           the cursor slips between, so the tile's own (cyan, ::boxes) box is
           what a click resolves through rather than the (yellow) mesh. A
           ladder is a third: thin bars and rungs the ray passes between (a
           wall ladder edge-on is a sliver), and its tile is solid, so the box
           can only ever mean the ladder. */
        if (obj.t === "fishing" || obj.t === "flax" || obj.t === "ladder_up" || obj.t === "ladder_down") return { tx: x, tz: z, dist, obj };
        const meshDist = this._locMeshHit(x, z, obj, spec, ray, t1);
        if (meshDist == null) return null;
        return { tx: x, tz: z, dist: meshDist, obj };
      }
    }
    return { tx: x, tz: z, dist, obj };
  }

  /* --- the hit-box view (`::boxes`) ----------------------------------------

     The user's own idea, 2026-09-22: *"i like the hover only for drawing boxes
     and maybe you just type in ::boxes to turn that on and off, no gate
     required for now"* - and reshaped on 2026-09-23, once the picker itself
     moved from the tile box to the model: *"maybe try to move away from the idea
     of boxes, and more to exact hulls of the mesh?"*. While it is on, the object
     under the cursor draws, and only that object - nothing is drawn for the
     ground or for a tile that is merely near the cursor:

       * **yellow** is the loc's own MESH, drawn as its edge lines at the exact
         transform the renderer stands the instance at (`_locDrawTransform`), so
         what is outlined is what a click now resolves through. The texture's
         cut-out is part of that test too (`_uvOpaque`) and cannot be drawn as
         lines, so the wireframe is the *upper* bound of the clickable shape: a
         hole in the leaf art is not clickable even though a line runs past it.
         A loc with no baked model (a procedural stand-in) has no mesh, so its
         tile box is drawn instead.
       * **cyan** is the model's own bounding box - the honest answer to "how
         big is this thing", and the pair makes the difference between the
         art and the shape it is drawn as obvious at a glance.

     Both are drawn through the model (`depthTest` off) so an edge behind a trunk
     is still visible, which is the whole point of a debug view. The boxes are
     built once and only moved afterwards, the edge lines are cached per
     geometry, and everything is hidden whenever nothing is hovered. */
  setHoverBox(tx, tz, obj) {
    const hide = () => {
      if (this._boxClick) { this._boxClick.visible = false; this._boxModel.visible = false; }
      if (this._boxYaw) this._boxYaw.visible = false;
      if (this._boxEdges) this._boxEdges.visible = false;
      this._hideEntEdges();
    };
    if (!obj || tx == null) return hide();
    const click = this.objTopY(tx, tz, obj);
    if (!click) return hide();
    if (!this._boxClick) this._makeBoxes();
    /* The two hovering cases never both draw: a loc hides the creature's
       turned box and mesh outline. */
    if (this._boxYaw) this._boxYaw.visible = false;
    this._hideEntEdges();
    const spec = this.locSpec(obj, tx, tz);
    if (!spec || obj.t === "fishing") {
      /* a procedural stand-in has no mesh to outline - the box is all there is.
         A fishing spot's drawn swirl is a wisp of its tile while a click
         answers for the whole tile, so the tile's own click box is what is
         drawn here - the mesh outline would point at a target several times
         smaller than the real one. */
      if (this._boxEdges) this._boxEdges.visible = false;
      this._boxClick.box.set(
        new THREE.Vector3(tx, click.lo, tz),
        new THREE.Vector3(tx + 1, click.hi, tz + 1));
      this._boxClick.visible = true;
      this._boxModel.visible = false;
      return;
    }
    this._boxClick.visible = false;
    const t = this._locDrawTransform(tx, tz, obj, spec);
    this._showMeshEdges(spec, t);
    const geom = locGeometry(spec.key, t.rots[0]);
    if (geom) {
      if (!geom.boundingBox) geom.computeBoundingBox();
      const b = geom.boundingBox;
      this._boxModel.box.set(
        new THREE.Vector3(t.px + b.min.x, t.py + b.min.y, t.pz + b.min.z),
        new THREE.Vector3(t.px + b.max.x, t.py + b.max.y, t.pz + b.max.z));
      this._boxModel.visible = true;
    } else {
      this._boxModel.visible = false;
    }
  }

  /* The loc's mesh as edge lines, moved to `t` - one line per (rotation, animated
     texture) pair, reusing whole geometries from the cache so the outline of a
     thousand trees costs a map lookup. */
  _showMeshEdges(spec, t) {
    if (!this._boxEdges) {
      this._boxEdges = new THREE.Group();
      this.scene.add(this._boxEdges);
    }
    const parts = [];
    for (const rot of t.rots) {
      const g = locGeometry(spec.key, rot);
      if (g) parts.push(g);
      const gg2 = locGlowGeometry(spec.key, rot);
      if (gg2) parts.push(gg2);
      for (const id of locAnimIdsForModel(spec.key)) {
        const ag = locAnimGeometry(spec.key, rot, id);
        if (ag) parts.push(ag);
      }
    }
    let i = 0;
    for (const g of parts) {
      let line = this._boxEdges.children[i];
      if (!line) {
        line = new THREE.LineSegments(new THREE.BufferGeometry(), _edgeMaterial);
        this._boxEdges.add(line);
      }
      line.geometry = _edgesFor(g);
      line.position.set(t.px, t.py, t.pz);
      line.visible = true;
      i++;
    }
    for (; i < this._boxEdges.children.length; i++) this._boxEdges.children[i].visible = false;
    this._boxEdges.visible = true;
  }

  /* The creature half of `::boxes`: the box under the cursor when it is a
     character rather than an object (src/game.js#entityBoxWorld builds both
     boxes in world space). Yellow is the picker's box - the model's own bounds
     turned with the body's facing, which is the box a left click and the
     right-click menu resolve through - drawn turned with the body itself, so a
     long creature's turn reads as a turn: the old view drew only its
     axis-aligned bound, which balloons into a square at forty-five degrees and
     never looks like it follows the body. Cyan is the body's tile floor
     (src/game.js#npcFootBox) - the ground the creature owns, drawn flat on the
     ground where it stands. A footprint is tiles, so it never turns with the
     body: a dragon's 4x4 stays a 4x4 whichever way the model faces, which is
     why the cyan square does not rotate while the yellow box does. A 1x1 body
     owns only its own tile, so there the cyan box is the model's extent left
     unrotated, the same click-box/model-box pairing the loc view draws. The
     body's own mesh draws in yellow edge lines beside the boxes, the way a
     loc's does (src/scene.js#setHoverBox) - the posed geometry the picker
     raycasts, so the outline is what a click resolves through. It shares
     `_makeBoxes`' helpers with the loc view, so the two hovering cases never
     both draw and the toggle's cleanup hides them either way. */
  setHoverEnt(boxes, ent) {
    const hide = () => {
      if (this._boxClick) { this._boxClick.visible = false; this._boxModel.visible = false; }
      if (this._boxYaw) this._boxYaw.visible = false;
      if (this._boxEdges) this._boxEdges.visible = false;
      this._hideEntEdges();
    };
    if (!boxes) return hide();
    if (!this._boxClick) this._makeBoxes();
    if (this._boxEdges) this._boxEdges.visible = false;
    const set = (h, b) => h.box.set(
      new THREE.Vector3(b.min[0], b.min[1], b.min[2]),
      new THREE.Vector3(b.max[0], b.max[1], b.max[2]));
    /* The axis-aligned bound belongs to the loc view now - for a creature the
       turned box below says the same thing and follows the body. */
    this._boxClick.visible = false;
    /* A big body owns ground: draw its tile floor instead of the model's
       unrotated extent, flat on the ground where it stands. The floor never
       turns - it is tiles - while the yellow box above turns with the body, so
       the two answers stop looking like one box that forgot to rotate. */
    if (boxes.foot && boxes.foot.n > 1) {
      const f = boxes.foot;
      const gy = boxes.y + 0.05;
      set(this._boxModel, { min: [f.x0, gy, f.z0], max: [f.x1 + 1, gy, f.z1 + 1] });
    } else {
      set(this._boxModel, boxes.flat);
    }
    this._boxModel.visible = true;
    /* The turned box: the local extents stood on the body's feet and yawed
       with its facing - the same frame the picker tests the ray in. */
    if (boxes.box && Number.isFinite(boxes.yaw)) {
      const b = boxes.box;
      const ca = Math.cos(boxes.yaw), sa = Math.sin(boxes.yaw);
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2;
      this._boxYaw.position.set(
        boxes.x + ca * cx + sa * cz,
        boxes.y + (b[2] + b[3]) / 2,
        boxes.z - sa * cx + ca * cz);
      this._boxYaw.rotation.set(0, boxes.yaw, 0);
      this._boxYaw.scale.set(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
      this._boxYaw.visible = true;
    } else if (this._boxYaw) {
      this._boxYaw.visible = false;
    }
    this._showEntEdges(ent);
  }

  _makeBoxes() {
    const root = new THREE.Group();
    this.scene.add(root);
    const mk = (color) => {
      const h = new THREE.Box3Helper(new THREE.Box3(), color);
      h.material.depthTest = false;
      h.material.depthWrite = false;
      h.material.transparent = true;
      h.material.opacity = 0.9;
      h.renderOrder = 900;
      root.add(h);
      return h;
    };
    this._boxRoot = root;
    this._boxClick = mk(0xffe14d);
    this._boxModel = mk(0x54e0ff);
    /* The turned pick box: a unit cube's edges, posed per frame from the
       oriented box (position + yaw + extents), in the pick box's own yellow. */
    this._boxYaw = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), _edgeMaterial);
    this._boxYaw.visible = false;
    this._boxYaw.renderOrder = 900;
    this._boxYaw.frustumCulled = false;
    root.add(this._boxYaw);
    /* The hovered body's mesh as edge lines, rebuilt from its posed geometry
       (see _showEntEdges) - the creature twin of the loc view's mesh outline. */
    this._entEdges = new THREE.LineSegments(new THREE.BufferGeometry(), _edgeMaterial);
    this._entEdges.visible = false;
    this._entEdges.renderOrder = 900;
    this._entEdges.frustumCulled = false;
    this._entEdges.matrixAutoUpdate = false;
    root.add(this._entEdges);
    this._entMesh = null;
    this._entBuiltAt = 0;
  }

  /* The hovered creature's mesh as edge lines. The body's geometry is posed on
     the CPU every frame (src/models3d.js#buildMesh), so the outline follows the
     live pose rather than the rest stance - rebuilt at most every 120 ms (and
     at once when the body or its mesh changes), which is plenty for a debug
     view and keeps an EdgesGeometry build off the frame budget. A sprite
     billboard has no edges to draw, and a body with no mesh yet draws nothing
     rather than a stale outline. The threshold keeps the outline readable on
     smooth bodies: at the default 1 degree every triangulated edge of a dragon
     draws and the mesh renders as one solid yellow blob, while 25 degrees keeps
     only the hard lines - wing fingers, horns, the jaw - so the shape the
     outline draws is the shape a click resolves through. */
  _showEntEdges(ent) {
    const mesh = ent && ent.ch && ent.ch.mesh;
    if (!mesh || !mesh.geometry || ent.ch.isSprite) return this._hideEntEdges();
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (mesh !== this._entMesh || now - this._entBuiltAt > 120) {
      this._entMesh = mesh;
      this._entBuiltAt = now;
      const old = this._entEdges.geometry;
      this._entEdges.geometry = new THREE.EdgesGeometry(mesh.geometry, 25);
      if (old) old.dispose();
    }
    mesh.updateWorldMatrix(true, false);
    this._entEdges.matrix.copy(mesh.matrixWorld);
    this._entEdges.visible = true;
  }

  _hideEntEdges() {
    if (this._entEdges) this._entEdges.visible = false;
    this._entMesh = null;
  }

  resize() {
    const w = this.canvas.clientWidth || 512;
    const h = this.canvas.clientHeight || 334;
    if (w === this._rw && h === this._rh) return;
    this._rw = w;
    this._rh = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /* Anti-aliasing, the optional way (src/renderopts.js): the drawing buffer at
     twice the game's own resolution, with the canvas's `image-rendering` given
     back to the browser so the 512 CSS pixels are a real box-filtered
     downscale instead of a nearest-neighbour pick. Every frame of the world,
     the minimap and the doll all read the canvas the same way whatever this is
     set to - `drawingBufferWidth` is never read as a size anywhere (the
     picking code works in CSS pixels, from `getBoundingClientRect`). */
  setAntialias(on) {
    const ratio = on ? 2 : 1;
    if (this.renderer.getPixelRatio() === ratio) return;
    this.renderer.setPixelRatio(ratio);
    this.canvas.style.imageRendering = on ? "auto" : "pixelated";
    /* `resize` skips a size it has already applied, so clear the memory of the
       last one to make it re-apply at the new ratio */
    this._rw = 0;
    this._rh = 0;
    this.resize();
  }

  /* Draw the player's character mesh, front-on and spun by `yaw`, into the 2D
     canvas `outCanvas` (the worn-equipment panel's doll). The model is rendered
     into an offscreen target rather than the main canvas, so the doll can be
     any size, never flickers over the world view, and is not limited by how big
     the game viewport happens to be. The target is tagged sRGB so the doll's
     colours match the character's in-world colours exactly.

     `pitch` leans the model back and forth about its own feet - the design
     screen's preview is drawn tilted the way the cache's own model widget says
     to (see src/design.js).

     `fit` is how much of the canvas the authored box is fitted into: 0.55 (the
     default) leaves a wide margin either side, which is what a full-size
     preview wants, and the equipment doll asks for more because a *worn* model
     reaches a little below the authored box (boots, a shield's lower edge) and
     would otherwise be cut off by its own stage.

     `sink` drops the framing centre that many model units down the body, which
     lifts the drawn figure by the same amount (see DOLL_SINK): the authored box
     is not quite the figure, so a screen that wants the figure's *own* centre on
     a pixel asks for the difference here.

     `span`, when given, is how many model units the canvas is to show top to
     bottom, and it replaces `fit` entirely for the distance. `fit` leaves the
     camera to the larger of two constraints - the height and the width - and in
     a narrow canvas the width one quietly takes over, drawing the figure a few
     per cent bigger than `canvasH / (2 * fit)` says. A screen that wants the
     body a *known* number of pixels tall therefore asks for the span its height
     implies instead (src/dollstage.js#drawStage).

     What it hands back is the box the *drawing* came out at - `{top, bot, left,
     right}` in canvas pixels, measured off the flipped pixels - or null if the
     mesh drew nothing. A caller that needs the body a known number of pixels
     tall (or its centre on a known pixel) frames with this rather than trusting
     the arithmetic: the perspective above is what makes the two disagree. */
  drawDoll(mesh, outCanvas, yaw = 0, pitch = 0, fit = 0.55, sink = 0, span = 0) {
    const w = outCanvas.width, h = outCanvas.height;
    if (!mesh || w < 2 || h < 2) return;
    const r = this.renderer;

    if (!this._dollRT || this._dollRT.width !== w || this._dollRT.height !== h) {
      if (this._dollRT) this._dollRT.dispose();
      this._dollRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
      this._dollRT.texture.colorSpace = THREE.SRGBColorSpace;
      this._dollRT.texture.minFilter = THREE.NearestFilter;
      this._dollRT.texture.magFilter = THREE.NearestFilter;
      this._dollPixels = new Uint8Array(w * h * 4);
      this._dollImage = null;
      this._dollBox = null;
    }

    if (!this._dollMesh || this._dollMesh.geometry !== mesh.geometry) {
      if (this._dollMesh) this._dollRoot.remove(this._dollMesh);
      const dm = new THREE.Mesh(mesh.geometry, mesh.material);
      dm.frustumCulled = false;
      this._dollRoot.add(dm);
      this._dollMesh = dm;
      this._dollBox = null;
    }
    const dm = this._dollMesh;
    dm.position.set(0, 0, 0);
    this._dollRoot.rotation.set(pitch, yaw, 0);

    /* Frame the model once, from its *authored* box - the one buildMesh
       measured off the rest data (src/models3d.js#buildMesh). Measuring the live
       geometry instead is a trap twice over: a mesh whose buffer has not been
       skinned yet (one built this frame, before the render loop's own update
       has posted the first pose into it) has every vertex sitting at the
       origin, so computeBoundingBox() yields a point-sized box and the doll
       frames - and draws - nothing at all; and a live measurement taken later
       would frame the character for whatever pose it happened to be in at that
       moment, then make the doll jitter as the pose changed. The authored box
       is the same from the first instant to the last. A character is ~0.9 tiles
       wide at the shoulders, so the framing is the taller of "fit the height"
       and "fit a generous width". */
    if (!this._dollBox) {
      const measure = mesh.userData && mesh.userData.measure;
      if (measure) {
        this._dollBox = { hgt: measure.hgt, wid: measure.wid, minY: measure.minY };
      } else {
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        const hgt = Math.max(0.8, bb.max.y - bb.min.y);
        const wid = Math.max(0.9, Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) * 2);
        this._dollBox = { hgt, wid, minY: bb.min.y };
      }
    }
    const box = this._dollBox;
    const cam = this.dollCamera;
    cam.aspect = w / h;
    const halfV = Math.tan((cam.fov * Math.PI) / 360);
    const cy = box.minY + box.hgt * 0.5 - sink;
    const needH = box.hgt * fit;
    const needW = (box.wid * fit) / Math.max(0.01, cam.aspect);
    const D = (span > 0 ? span / 2 : Math.max(needH, needW)) / halfV;
    cam.position.set(0, cy, D);
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();

    const oldColor = r.getClearColor(new THREE.Color());
    const oldAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this._dollRT);
    r.render(this.dollScene, cam);
    r.readRenderTargetPixels(this._dollRT, 0, 0, w, h, this._dollPixels);
    r.setRenderTarget(null);
    r.setClearColor(oldColor, oldAlpha);

    /* GL reads bottom-up, ImageData is top-down: flip, un-premultiplying so the
       few antialiased edge pixels keep the character's colours.

       The flip is also where the figure's own extent is measured, because it
       already walks every pixel of the render: `top`/`bot`/`left`/`right` are
       the box the drawn body actually occupies, which is what the screens that
       want the figure a *known* height and centre frame against (see
       src/dollstage.js#drawStage - the projection is a perspective one, so the
       body draws a few per cent taller than the model units it was asked for). */
    const ctx = outCanvas.getContext("2d");
    if (!this._dollImage || this._dollImage.width !== w || this._dollImage.height !== h) {
      this._dollImage = ctx.createImageData(w, h);
    }
    const img = this._dollImage, src = this._dollPixels, dst = img.data, row = w * 4;
    let top = -1, bot = -1, left = -1, right = -1;
    for (let y = 0; y < h; y++) {
      const s = (h - 1 - y) * row, d = y * row;
      let rowLeft = -1, rowRight = -1;
      for (let i = 0; i < row; i += 4) {
        const a = src[s + i + 3];
        if (a === 0) {
          dst[d + i] = dst[d + i + 1] = dst[d + i + 2] = dst[d + i + 3] = 0;
        } else if (a === 255) {
          dst[d + i] = src[s + i];
          dst[d + i + 1] = src[s + i + 1];
          dst[d + i + 2] = src[s + i + 2];
          dst[d + i + 3] = 255;
        } else {
          const k = 255 / a;
          dst[d + i] = Math.min(255, src[s + i] * k);
          dst[d + i + 1] = Math.min(255, src[s + i + 1] * k);
          dst[d + i + 2] = Math.min(255, src[s + i + 2] * k);
          dst[d + i + 3] = a;
        }
        if (a > 8) {
          const x = i >> 2;
          if (rowLeft < 0) rowLeft = x;
          rowRight = x;
        }
      }
      if (rowLeft >= 0) {
        if (top < 0) top = y;
        bot = y;
        if (left < 0 || rowLeft < left) left = rowLeft;
        if (rowRight > right) right = rowRight;
      }
    }
    ctx.putImageData(img, 0, 0);
    return top < 0 ? null : { top, bot, left, right };
  }

  /* Draw a character's *head* into the dialogue box's canvas, the way the
     client's chatbox draws one.

     ## The projection is the cache's, not a framing choice

     A dialogue head is a type-6 widget, and drawInterface draws one as
     `model.renderSingle(rotationY, 0, rotationX, 0, sine, cosine)` with
     `sine = SINE[rotationX] * modelZoom >> 16` and the same for cosine. That
     translation is the client's way of placing the model in front of the
     camera: it moves the model `modelZoom` units away along the widget's own
     axis, and the final x-rotation by `rotationX` then lands the model's origin
     exactly on the view axis (the two are chosen together so the pitch cancels
     the offset). What is left is a plain pinhole camera at a distance of
     `modelZoom` model units with a focal length of 512 pixels - so the head's
     size on screen is entirely the cache's, and the canvas has to be big enough
     to hold it (see CHAT_FOCAL).

     ## Model space, camera space, and the one rotation that flips

     Our baked models live in the space src/models3d.js#buildMesh writes:
     `(x, footY - y, -z)` scaled by 1/128, i.e. the client's model space with y
     flipped about the foot and z negated. Undoing that is a 180-degree rotation
     about x, and conjugating the client's own `R_x(pitch) * R_y(yaw)` by it
     leaves the pitch alone and turns the yaw into its negative - which is
     exactly `(pitch, -yaw, 0)` in three.js's XYZ order. So one group per head,
     rotated by that and pushed `modelZoom` units down -z, with the mesh offset
     by -footY inside it, reproduces the client's pixels. */
  drawChatHead(mesh, outCanvas, opts = {}) {
    const w = outCanvas.width, h = outCanvas.height;
    if (!mesh || w < 2 || h < 2) return;
    const r = this.renderer;
    const ud = mesh.userData || {};
    const zoom = opts.zoom != null ? opts.zoom : 796;
    const scale = ud.modelScale || (1 / 128);
    const distance = zoom * scale;
    const pitch = ((opts.pitch != null ? opts.pitch : 40) / ROT_UNITS) * Math.PI * 2;
    const yaw = ((opts.yaw != null ? opts.yaw : 1882) / ROT_UNITS) * Math.PI * 2;

    if (!this._headRT || this._headRT.width !== w || this._headRT.height !== h) {
      if (this._headRT) this._headRT.dispose();
      this._headRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
      this._headRT.texture.colorSpace = THREE.SRGBColorSpace;
      this._headRT.texture.minFilter = THREE.NearestFilter;
      this._headRT.texture.magFilter = THREE.NearestFilter;
      this._headPixels = new Uint8Array(w * h * 4);
      this._headImage = null;
    }

    const inner = this._headInner;
    if (this._headMesh !== mesh) {
      inner.clear();
      inner.add(mesh);
      this._headMesh = mesh;
    }
    inner.position.set(0, -(ud.footY || 0) + (opts.dy || 0), 0);
    this._headSpin.rotation.set(pitch, -yaw, 0);
    this._headSpin.position.set(0, 0, -distance);

    const cam = this.headCamera;
    /* Pixels per model unit is the client's `<< 9 / z` for every canvas: the
       focal stays 512 pixels, so the vertical field of view is whatever makes
       `height / 2` land on 512 px at unit depth. */
    const fov = 2 * Math.atan((h / 2) / CHAT_FOCAL) * (180 / Math.PI);
    if (this._headFov !== fov) {
      cam.fov = fov;
      this._headFov = fov;
      cam.updateProjectionMatrix();
    }
    const near = Math.max(0.01, distance - 2.5);
    if (cam.near !== near || cam.far !== distance + 2.5) {
      cam.near = near;
      cam.far = distance + 2.5;
      cam.updateProjectionMatrix();
    }

    const oldColor = r.getClearColor(new THREE.Color());
    const oldAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this._headRT);
    r.render(this.headScene, cam);
    r.readRenderTargetPixels(this._headRT, 0, 0, w, h, this._headPixels);
    r.setRenderTarget(null);
    r.setClearColor(oldColor, oldAlpha);

    /* GL reads bottom-up, ImageData is top-down: flip, un-premultiplying so the
       antialiased edge pixels keep the head's own colours (same as drawDoll). */
    const ctx = outCanvas.getContext("2d");
    if (!this._headImage || this._headImage.width !== w || this._headImage.height !== h) {
      this._headImage = ctx.createImageData(w, h);
    }
    const img = this._headImage, src = this._headPixels, dst = img.data, row = w * 4;
    for (let y = 0; y < h; y++) {
      const s = (h - 1 - y) * row, d = y * row;
      for (let i = 0; i < row; i += 4) {
        const a = src[s + i + 3];
        if (a === 0) {
          dst[d + i] = dst[d + i + 1] = dst[d + i + 2] = dst[d + i + 3] = 0;
        } else if (a === 255) {
          dst[d + i] = src[s + i];
          dst[d + i + 1] = src[s + i + 1];
          dst[d + i + 2] = src[s + i + 2];
          dst[d + i + 3] = 255;
        } else {
          const k = 255 / a;
          dst[d + i] = Math.min(255, src[s + i] * k);
          dst[d + i + 1] = Math.min(255, src[s + i + 1] * k);
          dst[d + i + 2] = Math.min(255, src[s + i + 2] * k);
          dst[d + i + 3] = a;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  render() {
    /* some embeds resize the viewport without firing a window resize event, so
       re-check the element size periodically as a safety net */
    if ((this._rt = ((this._rt || 0) + 1) & 15) === 0) this.resize();
    this.renderer.render(this.scene, this.camera);
  }
}
