import * as THREE from "https://esm.sh/three@0.160.0";
import { hslToRgb, skinPose, alphaPose } from "./models3d.js";
import { MeshBuilder } from "./mesh.js";
import { bakedURL } from "./baked.js";

/* ---------------------------------------------------------------------------
   Real 2007 scenery.

   Every tree, rock, bush, table and barrel in the world is an actual cache
   ObjectDefinition (loc), baked by src/tools/cache-bake/locs-bake-run.mjs into
   `src/models/locs.json`. This module feeds those models into the same
   MeshBuilder the procedural scenery used, so a whole chunk of the map is still
   one draw call.

   Two details make the difference between "low-poly brown thing" and
   RuneScape:

   * Palette. A face's colour is a 15-bit HSL value in the client's own
     palette (see models3d.js#hslToRgb), and it is *lit per face* - the client's
     software rasterizer picks one of 20 light levels from the face normal
     against a fixed light. Scenery is static, so the light is baked into the
     vertex colours here and the geometry is drawn unlit, exactly like the
     character models.

   * Textures. A tree's canopy is not a coloured surface: those faces carry a
     texture id in their colour slot and the client paints them with the cache's
     leaf texture (id 8; tree stumps use id 9, the bark/wood-ring texture). The
     ids are baked per face, and the textures themselves are packed into one
     atlas (`src/sprites/loc/tex-atlas.png`). Untextured faces point their UVs at
     a white cell of that atlas so a single material draws everything.

   The cache also stores, per textured face, the *texture coordinates* the
   client walks across the triangle (the model's coordinate table, indexed by
   the face's texture flag >> 2). Those are not decoded yet, so faces are given
   a planar projection instead - fine detail of the leaf texture is preserved,
   only its exact alignment across a face differs from the original client.
   --------------------------------------------------------------------------- */

const LIGHT_LEVELS = 20;

/* three.js lighting space: the client's HSLtoRgb output is sRGB, vertex colours
   are linear, so palette entries are linearized before they are handed over. */
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/* The sun the world is lit by (scene.js's DirectionalLight, normalized). */
const SUN = new THREE.Vector3(-0.55, 1.25, 0.7).normalize();

/* Tile units: model vertices are stored in the client's 1/128-of-a-tile units. */
const U = 1 / 128;
/* How many tiles one repeat of a loc texture covers. Tuned against the leaf
   texture: smaller = the leaf pattern is magnified, larger = it tiles finer. */
const TEX_TILES = 1;

export const locData = new Map();
let atlasTexture = null;
let atlasMask = null;
let atlasMeta = null;
let loaded = false;

/* The animated texture layers (the magic tree's sparkle shell, the fishing
   spot's own sparkle): one scrolling texture + material each, copied out of the
   sheet at load time. See `loadLocModels`. */
const animLayers = new Map();

/* Ground items (`src/models/items.json`) ride the same pipeline as scenery: a
   dropped item is a real cache item model standing on the tile, and once it is
   in `locData` it decodes, lights and caches exactly like a loc. The key is
   namespaced so an item can never collide with a scenery key. */
export const ITEM_KEY = "item:";
export function isItemKey(key) { return key.startsWith(ITEM_KEY); }

/* The level-up interfaces' icon models (`src/models/levelup.json`) ride it too -
   a chatbox icon widget is a 3D model in the client, and the same decode/light
   path draws it - so they get their own namespace and the same `locGeometry`
   read. See src/levelup.js. */
export const ICON_KEY = "icon:";
export function isIconKey(key) { return key.startsWith(ICON_KEY); }

export function locsReady() { return loaded; }
export function locAtlas() { return atlasTexture; }
/* The sheet's cut-out (see `packPage`): the scenery material's `alphaMap`. */
export function locMask() { return atlasMask; }

/* The cut-out's pixels, for the picker (src/scene.js#_locMeshHit). The scenery
   material draws a texel only when `alphaTest: 0.5` passes against this mask, so
   a click that lands on one of the artist's holes must fall through to whatever
   is behind it - which is the half of "click the tree, not the grass" a triangle
   test alone cannot answer (a canopy face is a rectangle the leaf art does not
   fill). Returned as `{ data, w, h }` with the alpha in the green channel, which
   is the one three.js reads an `alphaMap` from. Read once: the packed mask never
   changes after load. */
let atlasMaskData = null;
export function locMaskData() {
  if (!atlasMaskData && atlasMask && atlasMask.image) {
    const cv = atlasMask.image;
    atlasMaskData = { data: cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
  }
  return atlasMaskData;
}
const animMaskDataCache = new Map();
/* The same read for an animated layer's own copy of the mask (a cut-out of its
   cell, sampled with `RepeatWrapping` - see `loadLocModels`). Unused by the
   picker on purpose: an animated overlay is a sparse decoration drawn over the
   object's art, so a texel test there would make a fishing spot nearly
   unclickable (src/scene.js#_locMeshHit). Kept beside `locMaskData` because the
   two are the same idea and are read the same way. */
export function locAnimMaskData(id) {
  let d = animMaskDataCache.get(id);
  if (d === undefined) {
    const a = animLayers.get(id);
    const cv = a && a.mask && a.mask.image;
    d = cv ? { data: cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height } : null;
    animMaskDataCache.set(id, d);
  }
  return d;
}
export function locAnimMaterial(id) {
  const a = animLayers.get(id);
  return a ? a.material : null;
}
/* Which animated textures a model's faces sample - a model can have more than
   one, and a mesh can only carry one material, so the renderer draws one extra
   instance batch per (model, rotation, texture). */
export function locAnimIdsForModel(key) {
  const p = prepareLoc(key);
  if (!p) return [];
  const ids = [];
  for (let f = 0; f < p.fcount; f++) {
    const t = p.texIds ? p.texIds[f] : -1;
    if (p.animFace[f] && ids.indexOf(t) < 0) ids.push(t);
  }
  return ids;
}
/* Advance the animated loc textures by the client's own rule
   (`Texture.animate`): `pixels[i] = pixels[i - size*speed*cycles]`, i.e. `speed`
   rows of the texture per 20 ms cycle. Every animated texture this cache carries
   has speed 2, and so moves 100 texels a second - exactly the water's rate and
   direction, which src/scene.js#update and src/models3d.js#animateCharTextures
   already apply to their own textures.
   The client's texture is one indexed image, colour and cut-out together, so
   the whole thing moves as one. This build splits it into a colour map and an
   alphaMap mask, which means BOTH offsets have to move together: scrolling the
   colour alone only re-tints the stars, because the frozen mask keeps cutting
   the same holes, and the sparkle reads as static. */
export function advanceLocAnimTextures(dt) {
  for (const a of animLayers.values()) {
    let off = a.horizontal
      ? a.map.offset.x + (a.texelsPerSec * dt) / a.width
      : a.map.offset.y + (a.texelsPerSec * dt) / a.height;
    off -= Math.floor(off);
    if (a.horizontal) { a.map.offset.x = off; a.mask.offset.x = off; }
    else { a.map.offset.y = off; a.mask.offset.y = off; }
  }
}
export function hasLoc(key) { return locData.has(key); }

/* The baked atlas packs its cells shoulder to shoulder (a one pixel gap that is
   fully transparent). Filtering across a cell edge would therefore sample the
   gap, which reads as a black seam across every leaf face. So the atlas is
   re-packed once at load time with a gutter around every cell, edge-extended so
   the gutter repeats the cell's own border texels - mipmapped foliage then fades
   into itself instead of into a neighbour. */
const PAD = 4;

/* The texture sprites carry an alpha channel, and that channel is the *cut-out*:
   ~19% of the leaf sprite is transparent - palette index 0, stored pure black -
   and the 2007 rasterizer writes a texel only when the whole packed pixel is
   non-zero (`if ((var3 = var1[...]) != 0)` in `Rasterizer3D_textureAlpha`), so
   those texels are holes the client leaves whatever is behind them showing
   through. A canopy is a dozen overlapping faces, and the holes are its
   silhouette: that is what makes it read as a clump of leaves rather than as a
   rectangle. So the material cuts them away (`packPage` builds the mask).

   The colour under a hole still matters, though, because a mipmap averages a
   texel's colour with its neighbours *before* the alpha test runs - and those
   texels are stored black, so a leaf's edge would blend towards black and every
   canopy would wear a dark fringe. So each transparent texel's colour is
   inpainted from its opaque neighbours (a multi-source dilation) as the sheet is
   uploaded, and only the *colour* is repaired: the mask is taken from the sheet
   before any of this touches it, so the hole stays a hole. */
function inpaintTransparent(ctx, x, y, w, h) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const n = w * h;
  /* Multi-source BFS outwards from every opaque texel. A pass-counted dilation
     (the obvious way to write this) only reaches as deep as its pass limit, and
     every texel it never reaches stays transparent - then the "force the atlas
     opaque" step turns it into opaque BLACK. A queue has no depth limit, so no
     texel can be missed. enq: 0 = untouched, 1 = queued, 2 = opaque. */
  const queue = new Int32Array(n);
  const enq = new Uint8Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 8) enq[i] = 2;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      if (enq[i]) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        const ny = yy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = xx + dx;
          if (nx < 0 || nx >= w) continue;
          if (enq[ny * w + nx] === 2) { touch = true; break; }
        }
      }
      if (touch) { enq[i] = 1; queue[qt++] = i; }
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const yy = (i / w) | 0;
    const xx = i - yy * w;
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = yy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        /* only texels that ALREADY carry a colour contribute; the ones merely
           queued for later are still transparent */
        if (d[j * 4 + 3] <= 8) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; cnt++;
      }
    }
    if (cnt) {
      d[i * 4] = (r / cnt) | 0;
      d[i * 4 + 1] = (g / cnt) | 0;
      d[i * 4 + 2] = (b / cnt) | 0;
      /* A 2D canvas stores premultiplied alpha, so a colour written into a
         fully transparent texel is multiplied away to nothing and reads back
         as black. The inpainted texel has to become opaque for its colour to
         survive at all - which is also what an opaque material samples. */
      d[i * 4 + 3] = 255;
    }
    for (let dy = -1; dy <= 1; dy++) {
      const ny = yy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (!enq[j]) { enq[j] = 1; queue[qt++] = j; }
      }
    }
  }
  ctx.putImageData(img, x, y);
}

function killBlackTexels(ctx, width, height) {
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const n = width * height;
  let black = 0;
  for (let i = 0; i < n; i++) {
    if (d[i * 4] === 0 && d[i * 4 + 1] === 0 && d[i * 4 + 2] === 0) black++;
  }
  if (!black) return;
  const queue = new Int32Array(n);
  const enq = new Uint8Array(n);
  const isBlack = (i) => d[i * 4] === 0 && d[i * 4 + 1] === 0 && d[i * 4 + 2] === 0;
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    if (!isBlack(i)) continue;
    let touch = false;
    const yy = (i / width) | 0, xx = i - yy * width;
    for (let dy = -1; dy <= 1 && !touch; dy++) {
      const ny = yy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx;
        if (nx < 0 || nx >= width) continue;
        if (!isBlack(ny * width + nx)) { touch = true; break; }
      }
    }
    if (touch) { enq[i] = 2; queue[qt++] = i; }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const yy = (i / width) | 0, xx = i - yy * width;
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = yy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx;
        if (nx < 0 || nx >= width) continue;
        const j = ny * width + nx;
        if (isBlack(j)) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; cnt++;
      }
    }
    if (cnt) {
      d[i * 4] = (r / cnt) | 0;
      d[i * 4 + 1] = (g / cnt) | 0;
      d[i * 4 + 2] = (b / cnt) | 0;
    } else {
      d[i * 4] = 64; d[i * 4 + 1] = 74; d[i * 4 + 2] = 30;
    }
    for (let dy = -1; dy <= 1; dy++) {
      const ny = yy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx;
        if (nx < 0 || nx >= width) continue;
        const j = ny * width + nx;
        if (enq[j]) continue;
        if (!isBlack(j)) continue;
        enq[j] = 2; queue[qt++] = j;
      }
    }
  }
  /* anything the BFS could not reach (a fully black island) gets the olive
     fallback directly */
  for (let i = 0; i < n; i++) {
    if (!isBlack(i)) continue;
    d[i * 4] = 64; d[i * 4 + 1] = 74; d[i * 4 + 2] = 30;
  }
  ctx.putImageData(img, 0, 0);
}

/* Grow a cell's own border texels outwards into the gutters around it, so a
   mipmapped sample that runs a little past a cell reads more of the same cell
   instead of the empty canvas behind it. Shared by the sheet and its mask, which
   have to stay in step: a mask whose gutter is black where the sheet's is leaf
   would cut a notch out of every face's edge at distance. */
function extendGutters(ctx, src, width, height, placed, whiteId) {
  for (const [id, c, dx, dy] of placed) {
    const rightW = width - (dx + c.w);
    const leftW = dx;
    const bottomH = id === whiteId ? height - (dy + c.h) : PAD;
    if (rightW > 0) ctx.drawImage(src, dx + c.w - 1, dy, 1, c.h, dx + c.w, dy, rightW, c.h);
    if (leftW > 0) ctx.drawImage(src, dx, dy, 1, c.h, dx - leftW, dy, leftW, c.h);
    ctx.drawImage(src, dx, dy, c.w, 1, dx, dy - PAD, c.w, PAD);
    ctx.drawImage(src, dx, dy + c.h - 1, c.w, 1, dx, dy + c.h, c.w, bottomH);
    if (rightW > 0) {
      ctx.drawImage(src, dx + c.w - 1, dy, 1, 1, dx + c.w, dy - PAD, rightW, PAD);
      ctx.drawImage(src, dx + c.w - 1, dy + c.h - 1, 1, 1, dx + c.w, dy + c.h, rightW, bottomH);
    }
    if (leftW > 0) {
      ctx.drawImage(src, dx, dy, 1, 1, dx - leftW, dy - PAD, leftW, PAD);
      ctx.drawImage(src, dx, dy + c.h - 1, 1, 1, dx - leftW, dy + c.h, leftW, bottomH);
    }
  }
}

/* Pack the baked sheet (one cell per texture - see
   src/tools/cache-bake/locs-bake-run.mjs) into the canvas the scenery samples,
   with a gutter around every cell, and build the **cut-out mask** that goes with
   it.

   The mask is a greyscale canvas, white where a texel of the sheet is opaque and
   black where it is one of the artist's holes. It is taken from the sheet's own
   alpha BEFORE the colour is inpainted - inpainting has to force those texels
   opaque, because a canvas stores premultiplied alpha and a colour written into
   a transparent texel would be multiplied away to nothing. It becomes the
   material's `alphaMap`, which three.js multiplies into the fragment's alpha
   before applying `alphaTest` - so a hole is a hole, exactly as the software
   rasterizer's `!= 0` test makes it, and the repaired colour underneath is never
   seen because no fragment there survives the test. */
/* How much of a cell a *repeat* of that texture should sample.

   The cache's cell is 128x128 whatever its art does, and the client repeats the
   cell every 128 units - `Rasterizer3D_textureAlpha` masks the sample index to
   seven bits (`var1[(var2 & 16256) + (var2 >>> 25)]`), so the seven empty columns
   past texture 8's art are sampled by every repeat. The leaf sprites are worse
   than that: their art *dissolves* towards one edge - the last third of texture
   8's cell is a thinning rag of single leaf texels that ends in nothing at all
   (column 92 is ~80% leaves, column 120 is 2%) - and a repeat that samples those
   columns draws a see-through band right across the middle of every canopy. The
   projection here tiles the sheet per face on a world-space axis, so a whole
   canopy face can land on that band: that is what a magic tree's canopy looked
   like, a round gap with the sky through it, and why some trees read as sparse.

   So a cell is trimmed to the run of columns (or rows) the art *really* fills
   before it is packed, and the same factor is applied to every face's uv
   (`prepareLoc`), which keeps one texel at one texel - a repeat gets denser, not
   stretched. Only an axis whose outermost line is empty is trimmed, and only its
   low-coverage ramp: a texture that merely tapers towards an edge (the leaf
   clump's round top and bottom) keeps its full extent, because that taper is the
   clump's silhouette rather than a margin. A sparse overlay (the sparkles, the
   fishing spot) is left alone entirely: it is mostly empty by design, there is no
   ramp to trim, and the emptiness is the point. */
function tileExtent(data, imgW, x0, y0, w, h) {
  const colC = new Int32Array(w);
  const rowC = new Int32Array(h);
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[((y0 + y) * imgW + x0 + x) * 4 + 3] > 8) { colC[x]++; rowC[y]++; opaque++; }
    }
  }
  if (opaque < w * h * 0.5) return null;
  let maxCol = 0, maxRow = 0;
  for (let i = 0; i < w; i++) if (colC[i] > maxCol) maxCol = colC[i];
  for (let i = 0; i < h; i++) if (rowC[i] > maxRow) maxRow = rowC[i];
  let x1 = 0, x2 = w - 1, y1 = 0, y2 = h - 1;
  const ramp = (arr, from, step, limit, threshold) => {
    let i = from;
    while (i !== limit && arr[i] < threshold) i += step;
    return i;
  };
  if (maxCol && colC[w - 1] <= maxCol * 0.1) x2 = ramp(colC, w - 1, -1, 0, maxCol * 0.9);
  if (maxCol && colC[0] <= maxCol * 0.1) x1 = ramp(colC, 0, 1, w - 1, maxCol * 0.9);
  if (maxRow && rowC[h - 1] <= maxRow * 0.1) y2 = ramp(rowC, h - 1, -1, 0, maxRow * 0.9);
  if (maxRow && rowC[0] <= maxRow * 0.1) y1 = ramp(rowC, 0, 1, h - 1, maxRow * 0.9);
  const nw = x2 - x1 + 1, nh = y2 - y1 + 1;
  if (nw === w && nh === h) return null;
  if (nw < 8 || nh < 8) return null;
  return { x: x1, y: y1, w: nw, h: nh };
}

function packPage(img, meta) {
  const entries = Object.entries(meta.cells).map(([id, c]) => [id, c]);
  if (meta.white) entries.push(["white", meta.white]);
  const whiteId = meta.white ? "white" : null;
  /* the sheet's own alpha decides what each cell's art covers - see `tileExtent` */
  const sheetCv = document.createElement("canvas");
  sheetCv.width = img.width;
  sheetCv.height = img.height;
  const sheetCtx = sheetCv.getContext("2d", { willReadFrequently: true });
  sheetCtx.drawImage(img, 0, 0);
  const sheetData = sheetCtx.getImageData(0, 0, img.width, img.height).data;
  const tiles = {};
  const scale = {};
  for (const [id, c] of entries) {
    const t = tileExtent(sheetData, img.width, c.x, c.y, c.w, c.h);
    tiles[id] = t || { x: 0, y: 0, w: c.w, h: c.h };
    if (t && (t.w !== c.w || t.h !== c.h)) scale[id] = [t.w / c.w, t.h / c.h];
  }
  let height = PAD;
  for (const [id] of entries) height += tiles[id].h + PAD * 2;
  const width = PAD + Math.max(128, ...entries.map(([id]) => tiles[id].w)) + PAD;
  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const cells = {};
  const placed = [];
  let y = PAD;
  for (const [id, c] of entries) {
    const t = tiles[id];
    const dx = PAD;
    const dy = y;
    ctx.drawImage(img, c.x + t.x, c.y + t.y, t.w, t.h, dx, dy, t.w, t.h);
    cells[id] = { x: dx, y: dy, w: t.w, h: t.h };
    placed.push([id, { x: c.x + t.x, y: c.y + t.y, w: t.w, h: t.h }, dx, dy]);
    y += t.h + PAD * 2;
  }
  const maskCv = document.createElement("canvas");
  maskCv.width = width;
  maskCv.height = height;
  const maskCtx = maskCv.getContext("2d", { willReadFrequently: true });
  {
    const shot = ctx.getImageData(0, 0, width, height);
    const d = shot.data;
    for (let i = 0; i < width * height; i++) {
      const a = d[i * 4 + 3];
      d[i * 4] = a; d[i * 4 + 1] = a; d[i * 4 + 2] = a; d[i * 4 + 3] = 255;
    }
    maskCtx.putImageData(shot, 0, 0);
  }
  for (const [, c, dx, dy] of placed) inpaintTransparent(ctx, dx, dy, c.w, c.h);
  /* The sheet is sampled by an opaque material, so throw away the remaining
     alpha: a texel that is still translucent would otherwise keep its
     premultiplied (darkened) colour. */
  const full = ctx.getImageData(0, 0, width, height);
  const fd = full.data;
  for (let i = 3; i < fd.length; i += 4) fd[i] = 255;
  ctx.putImageData(full, 0, 0);
  /* Safety net: ANY texel that is still pure black shows up as a black speck
     streaked across the scenery if both it and its mask survive, and it is what
     the mip chain averages towards at a leaf's edge. Pull such a texel's colour
     from its neighbours (repeatedly, so gaps wider than one texel are bridged)
     and, if a region is stubbornly wide, fall back to the mean of the atlas. */
  killBlackTexels(ctx, width, height);
  extendGutters(ctx, cv, width, height, placed, whiteId);
  extendGutters(maskCtx, maskCv, width, height, placed, whiteId);
  return { canvas: cv, mask: maskCv, cells, white: whiteId ? cells[whiteId] : null, width, height, placed, scale };
}

export async function loadLocModels() {
  try {
    const [locsRes, itemsRes, iconsRes, metaRes] = await Promise.all([
      fetch(bakedURL("src/models/locs.json"), { cache: "force-cache" }),
      fetch(bakedURL("src/models/items.json"), { cache: "force-cache" }).catch(() => null),
      fetch(bakedURL("src/models/levelup.json"), { cache: "force-cache" }).catch(() => null),
      fetch(bakedURL("src/sprites/loc/tex-atlas.json"), { cache: "force-cache" }),
    ]);
    const locs = await locsRes.json();
    const meta = await metaRes.json();
    /* The scenery bake is a WRAPPER - `{source, unit, locs}` - so this reads
       `locs.locs`, and it read only that for exactly as long as it took to write
       one bake flat: a `locs.json` whose top level is the keys themselves makes
       `locs.locs` undefined, so EVERY scenery loc in the world quietly fell back
       to its procedural stand-in and the only visible symptom was that a bake
       appeared to have changed nothing. Both shapes are read now, and the flat
       one is recovered by the `verts` test, exactly as the item reader below
       recovers a changed wrapper - the same class of failure, the same answer. */
    let locsBag = locs.locs || null;
    if (!locsBag) {
      locsBag = {};
      for (const [k, v] of Object.entries(locs)) {
        if (v && typeof v === "object" && v.verts) locsBag[k] = v;
      }
    }
    for (const [k, v] of Object.entries(locsBag)) {
      if (v && !v.error) locData.set(k, v);
    }
    textureShaftPlates();
    if (itemsRes && itemsRes.ok) {
      const items = await itemsRes.json();
      /* The file is `{ models: {...} }`, one entry per our item id - the item
         bake's own output shape, the same wrapper `held.json` uses. The reader
         below asked for `items.items` for a long time, which silently matched
         nothing: dropping *any* item (or killing a creature that drops one)
         therefore found no geometry and put nothing on the tile. Read both
         keys so a bake whose wrapper changes again cannot break the ground
         the same silent way - and, failing those, the file's own top level, so
         a *flat* bake (which happened once, and cost every baked ground model)
         degrades to working instead of to an empty ground. `verts` is the test
         because the file also carries a `handAuthored` list and a `note`. */
      let bag = items.items || items.models || null;
      if (!bag) {
        bag = {};
        for (const [k, v] of Object.entries(items)) {
          if (v && typeof v === "object" && v.verts) bag[k] = v;
        }
      }
      for (const [k, v] of Object.entries(bag)) {
        if (v && !v.error) locData.set(ITEM_KEY + k, v);
      }
    }
    if (iconsRes && iconsRes.ok) {
      const icons = await iconsRes.json();
      for (const [k, v] of Object.entries(icons.models || {})) {
        if (v && !v.error) locData.set(ICON_KEY + k, v);
      }
    }
    const img = await new Promise((resolve, reject) => {
      const t = new THREE.TextureLoader().load(
        bakedURL("src/sprites/loc/tex-atlas.png"),
        () => resolve(t.image),
        undefined,
        reject
      );
    });
    const packed = packPage(img, meta);
    atlasMeta = { ...meta, cells: packed.cells, white: packed.white, scale: packed.scale, width: packed.width, height: packed.height };
    const tex = new THREE.CanvasTexture(packed.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    /* the atlas cell rects are top-left origin, so the image must not be flipped
       on upload (v = y from the top) */
    tex.flipY = false;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    atlasTexture = tex;
    atlasMask = new THREE.CanvasTexture(packed.mask);
    /* The mask is data, not colour: leave its colour space alone so the green
       channel three.js reads is the value that was written, and let it mip the
       same way the sheet does so a hole erodes from its edge rather than
       popping whole. */
    atlasMask.flipY = false;
    atlasMask.magFilter = THREE.NearestFilter;
    atlasMask.minFilter = THREE.LinearMipmapLinearFilter;
    atlasMask.generateMipmaps = true;
    atlasMask.anisotropy = 8;
    /* A cell inside a packed sheet cannot scroll, so every animated texture is
       copied into a texture of its own with wrapping enabled - the same reason
       and the same shape as the water (src/terrain.js#buildWaterTexture). Both
       cells are 128x128, i.e. a power of two, so `RepeatWrapping` works whatever
       the renderer's WebGL version. The mask comes with it: without it the
       sparkle shell would be drawn as an opaque rectangle of stars. */
    for (const [idText, a] of Object.entries(meta.animated || {})) {
      const id = Number(idText);
      const c = packed.cells[id];
      if (!c) continue;
      const cut = (src) => {
        const out = document.createElement("canvas");
        out.width = c.w;
        out.height = c.h;
        out.getContext("2d").drawImage(src, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
        return out;
      };
      const map = new THREE.CanvasTexture(cut(packed.canvas));
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = false;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.NearestFilter;
      /* No mip chain here, and that is deliberate. The rasterizer the client
         uses has none either - it samples one texel - so a sparkle texture,
         which is 94% holes, keeps its stars at every distance: a minified face
         shows a scattered handful of them at full strength. A mipmap would
         instead average each star with the holes around it, and an alpha test of
         0.5 would erase whole regions of the shell as soon as the mip level
         dropped, so the magic tree would lose its sparkle exactly when you
         noticed it most. */
      map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
      map.anisotropy = 1;
      const mask = new THREE.CanvasTexture(cut(packed.mask));
      mask.flipY = false;
      mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
      mask.magFilter = THREE.NearestFilter;
      mask.minFilter = THREE.NearestFilter;
      mask.generateMipmaps = false;
      mask.anisotropy = 1;
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, map, alphaMap: mask, alphaTest: 0.5,
      });
      animLayers.set(id, {
        map, mask, material, width: c.w, height: c.h,
        /* `Texture.animate` shifts by `size * speed * cycles` indices, i.e.
           `speed` rows (or columns) of the texture per 20 ms cycle, so
           `speed * 50` a second - 100 for the cache's own speed of 2. The sign
           below is chosen by looking, not by the deobfuscation: the old sign
           (the water's own, verified south-flowing on the flat water plane)
           read as upward/inward on the canopy, and the tree wants its sparkles
           falling from the crown, so the shell scrolls the other way. The
           water is untouched - its plane maps v to the ground, the canopy
           maps it up the trunk, so one offset direction cannot serve both. */
        texelsPerSec: a.speed * 50 * (a.dir === 1 || a.dir === 2 ? 1 : -1),
        horizontal: a.dir === 2 || a.dir === 4,
      });
    }
    loaded = true;
    return true;
  } catch (e) {
    console.warn("[locmodels] scenery models unavailable", e);
    return false;
  }
}

function b64bytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/* The second shaft's footplates (see scene.js#_chunkGround): the ladder's rim
   + foot strips are untextured cache faces, so they paint as one flat colour.
   Real turf/dirt instead: atlas cells 100/101 hold the terrain's own grass and
   soil (appended to src/sprites/loc/tex-atlas by hand - they are NOT cache
   textures, so a cache re-bake of the sheet drops them; re-append after). The
   upper ladder's plate samples grass, the inert lower length's dirt. Both are
   applied here at load - never in locs.json - so a model re-bake cannot lose
   them: the plate face indices are a fact of the cache model, re-applied every
   boot. Textured faces want the neutral tint (127, the same the leaf faces
   carry) or the palette colour multiplies the texture. */
const SHAFT_GRASS_TEX = 100;
const SHAFT_DIRT_TEX = 101;
const SHAFT_PLATE_FACES = { ladder_wood: [0, 1, 2, 3, 4, 5, 6, 7, 44, 45, 56, 57] };

function textureShaftPlates() {
  for (const [key, faces] of Object.entries(SHAFT_PLATE_FACES)) {
    const d = locData.get(key);
    if (!d || d._plateTextured || !d.texIds) continue;
    const setFaces = (entry, tex) => {
      const cb = b64bytes(entry.colors);
      const tb = b64bytes(entry.texIds);
      const cc = new Uint16Array(cb.buffer, cb.byteOffset, entry.fcount);
      const tc = new Int16Array(tb.buffer, tb.byteOffset, entry.fcount);
      for (const f of faces) {
        if (f >= entry.fcount) continue;
        tc[f] = tex;
        cc[f] = 127;
      }
      entry.colors = b64encode(cb);
      entry.texIds = b64encode(tb);
    };
    setFaces(d, SHAFT_GRASS_TEX);
    d._plateTextured = true;
    if (!locData.has(key + "_low")) {
      const low = { ...d, key: key + "_low" };
      setFaces(low, SHAFT_DIRT_TEX);
      low._plateTextured = true;
      locData.set(key + "_low", low);
    }
  }
}

/* Per-model decode + palette, done once per loc key. */
const prepared = new Map();

export function prepareLoc(key) {
  const cached = prepared.get(key);
  if (cached) return cached;
  const d = locData.get(key);
  if (!d) return null;
  const verts = new Int16Array(b64bytes(d.verts).buffer);
  const faces = new Uint16Array(b64bytes(d.faces).buffer);
  const colors = new Uint16Array(b64bytes(d.colors).buffer);
  const texIds = d.texIds ? new Int16Array(b64bytes(d.texIds).buffer) : null;
  /* Per-face translucency in the cache's own convention (0 = opaque, 255 =
     invisible) - the byte the model's header flags (see
     src/tools/cache-bake/model.mjs#parseModel). Most models author none; the
     furnace's firebox glow, potion glass and ghost robes do, and the runtime
     draws those faces in the glow pass (see `buildLocGeometry`), blended at
     (256 - alpha) / 256 exactly like src/models3d.js does. A short array is
     treated as absent rather than trusted. */
  const faceAlphaRaw = d.faceAlpha ? b64bytes(d.faceAlpha) : null;
  /* A WALL-MOUNTED loc - the cache's model type 4, which is every painting,
     portrait, hanging banner and wall lever in the archive - is placed the way
     the client places it, and that is different from a prop in two ways:

       * it is NOT recentred on its tile. Its model is authored flat against one
         face of the tile (a painting's whole box is x -64..-60 of the 128-unit
         tile), and that offset IS the placement: run it through the prop
         recentring and the picture floats in the middle of the room instead of
         hanging on the wall;
       * it is NOT dropped to the ground. A prop's y is measured from its own
         top (`footY`), so a model that is authored up at head height would be
         dragged down to the floor; a wall-mounted model's y is measured from
         the *floor* (a painting's vertices run -227..-157, i.e. 1.23..1.77 tiles
         up), so it is emitted against 0 and stays where the artist put it.

     `mount` is that authored height in tiles (0 for every ordinary loc), kept
     for whoever has to build the model's click box - see scene.js#objTopY. */
  const wallMount = d.modelType === 4;
  const p = {
    key,
    d,
    mount: wallMount ? -d.footY / 128 : 0,
    verts, faces, colors, texIds,
    faceAlpha: faceAlphaRaw && faceAlphaRaw.length === d.fcount ? faceAlphaRaw : null,
    vcount: d.vcount,
    fcount: d.fcount,
    /* per-axis scale (loc scaleX/Y/Z / 128) - the client scales each axis
       independently, which a few locs (wells, some trees) actually use */
    sx: d.sx, sy: d.sy, sz: d.sz,
    footY: wallMount ? 0 : d.footY,
    bounds: d.bounds,
    sizeX: d.sizeX | 0 || 1,
    sizeY: d.sizeY | 0 || 1,
    /* how the model's own bounding box sits relative to the loc's footprint:
       the client places the model with its box centred on the tile, so the
       world position is the footprint centre plus this correction. A
       wall-mounted model keeps its authored offset instead - that offset is the
       whole placement (see the note above). */
    cx: wallMount ? 0 : -(d.bounds[0] + d.bounds[3]) / 2 * d.sx,
    cz: wallMount ? 0 : -(d.bounds[2] + d.bounds[5]) / 2 * d.sz,
    palette: new Map(),
    /* UVs live per face corner (not per vertex): a vertex can be shared by two
       faces that want different parts of the atlas, and storing them per corner
       lets each face keep its own projection. */
    uvFace: new Float32Array(d.fcount * 6),
    /* the atlas rect every face samples from, normalized as (x, y, w, h) */
    cellFace: new Float32Array(d.fcount * 4),
    /* 1 for a face that samples an animated texture - those live in a texture of
       their own (see `loadLocModels`), so they are drawn by a separate mesh and
       their UV space is that whole texture */
    animFace: new Uint8Array(d.fcount),
  };
  /* Local texture coordinates, one pair per face corner, in CELL units: 1.0 is
     exactly one repeat of that face's texture, 0.5 is half of it. Nothing is
     wrapped, clamped or squeezed here - a 1.875-tall wall face simply runs v
     from 0 to 1.875 - because the repeat is done by the geometry:
     buildLocGeometry cuts such a face at every integer boundary so the texture
     repeats across it, exactly like the client's own texture walk.

     (The client reads a per-face texture coordinate table instead of
     projecting; those tables are not decoded by the bake yet, so a face falls
     back to what the software renderer does with no table - pick the face's
     dominant axis and use the other two world axes as (u, v), one repeat per
     TEX_TILES tiles. World-space projection keeps the mapping continuous across
     every triangle and tile of a model, which is what the eye expects.) */
  const AW = atlasMeta.width, AH = atlasMeta.height;
  const whiteCell = atlasMeta.white;
  let ringU = null, ringV = null;
  if (key.startsWith("stump") && texIds) {
    let su = 0, sv = 0, sn = 0;
    for (let f = 0; f < d.fcount; f++) {
      if (texIds[f] !== 9) continue;
      const q0 = faces[f * 3], q1 = faces[f * 3 + 1], q2 = faces[f * 3 + 2];
      const qx0 = verts[q0 * 3] * p.sx * U, qx1 = verts[q1 * 3] * p.sx * U, qx2 = verts[q2 * 3] * p.sx * U;
      const qy0 = (p.footY - verts[q0 * 3 + 1]) * p.sy * U, qy1 = (p.footY - verts[q1 * 3 + 1]) * p.sy * U, qy2 = (p.footY - verts[q2 * 3 + 1]) * p.sy * U;
      const qz0 = -verts[q0 * 3 + 2] * p.sz * U, qz1 = -verts[q1 * 3 + 2] * p.sz * U, qz2 = -verts[q2 * 3 + 2] * p.sz * U;
      const d1x = qx1 - qx0, d1y = qy1 - qy0, d1z = qz1 - qz0;
      const d2x = qx2 - qx0, d2y = qy2 - qy0, d2z = qz2 - qz0;
      const qnx = d1y * d2z - d1z * d2y, qny = d1z * d2x - d1x * d2z, qnz = d1x * d2y - d1y * d2x;
      if (Math.abs(qny) < Math.abs(qnx) || Math.abs(qny) < Math.abs(qnz)) continue;
      su += (qx0 + qx1 + qx2) / 3; sv += (qz0 + qz1 + qz2) / 3; sn++;
    }
    if (sn) { ringU = su / sn - 0.5 * TEX_TILES; ringV = sv / sn - 0.5 * TEX_TILES; }
  }
  for (let f = 0; f < d.fcount; f++) {
    const tex = texIds ? texIds[f] : -1;
    /* A cell trimmed by `tileExtent` holds less than a whole tile's worth of
       texels, so its uv is stretched by the same factor: one texel stays one
       texel, and the pattern just repeats a little more often. */
    const sc = (tex >= 0 && atlasMeta.scale && atlasMeta.scale[tex]) || null;
    if (tex >= 0 && animLayers.has(tex)) {
      /* an animated face samples its own scrolling texture, so its cell rect is
         that whole texture, one repeat across the cell */
      p.animFace[f] = 1;
      p.cellFace[f * 4] = 0;
      p.cellFace[f * 4 + 1] = 0;
      p.cellFace[f * 4 + 2] = 1;
      p.cellFace[f * 4 + 3] = 1;
    } else {
      const cell = (tex >= 0 && atlasMeta.cells[tex]) || whiteCell;
      p.cellFace[f * 4] = cell.x / AW;
      p.cellFace[f * 4 + 1] = cell.y / AH;
      p.cellFace[f * 4 + 2] = cell.w / AW;
      p.cellFace[f * 4 + 3] = cell.h / AH;
    }
    if (tex < 0 || !atlasMeta.cells[tex]) {
      /* an untextured face paints itself from the middle of the white cell */
      for (let k = 0; k < 3; k++) {
        p.uvFace[f * 6 + k * 2] = 0.5;
        p.uvFace[f * 6 + k * 2 + 1] = 0.5;
      }
      continue;
    }
    const i0 = faces[f * 3], i1 = faces[f * 3 + 1], i2 = faces[f * 3 + 2];
    const x0 = verts[i0 * 3] * p.sx * U, y0 = (p.footY - verts[i0 * 3 + 1]) * p.sy * U, z0 = -verts[i0 * 3 + 2] * p.sz * U;
    const x1 = verts[i1 * 3] * p.sx * U, y1 = (p.footY - verts[i1 * 3 + 1]) * p.sy * U, z1 = -verts[i1 * 3 + 2] * p.sz * U;
    const x2 = verts[i2 * 3] * p.sx * U, y2 = (p.footY - verts[i2 * 3 + 1]) * p.sy * U, z2 = -verts[i2 * 3 + 2] * p.sz * U;
    const e1 = [x1 - x0, y1 - y0, z1 - z0];
    const e2 = [x2 - x0, y2 - y0, z2 - z0];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const corners = [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]];
    /* Phase the projection at the model's own minimum corner, so the pattern
       starts on a tile corner and a whole tile's worth of it fits exactly one
       repeat: a wall one tile wide then holds the stone texture exactly once,
       instead of straddling a repeat boundary through the middle of the tile. */
    const bx0 = d.bounds[0], by0 = d.bounds[1], bz0 = d.bounds[2];
    for (let k = 0; k < 3; k++) {
      const vx = corners[k][0], vy = corners[k][1], vz = corners[k][2];
      let u, v;
      /* project along the face's dominant axis - the same choice the client's
         software renderer makes when it walks a textured triangle */
      if (ay >= ax && ay >= az) { u = vx - (tex === 9 && ringU !== null ? ringU : bx0); v = vz - (tex === 9 && ringV !== null ? ringV : bz0); }
      else if (ax >= az) { u = vz - bz0; v = vy - by0; }
      else { u = vx - bx0; v = vy - by0; }
      p.uvFace[f * 6 + k * 2] = u / TEX_TILES / (sc ? sc[0] : 1);
      p.uvFace[f * 6 + k * 2 + 1] = v / TEX_TILES / (sc ? sc[1] : 1);
    }
  }
  prepared.set(key, p);
  return p;
}

export function locKeys() { return [...locData.keys()]; }
export function locFootprint(key) {
  const p = prepareLoc(key);
  return p ? [p.sizeX, p.sizeY] : [1, 1];
}
export function locHeight(key) {
  const p = prepareLoc(key);
  return p ? (p.bounds[4] - p.bounds[1]) : 1;
}
/* How far above its tile's floor a baked loc's model starts, in tiles: 0 for
   every prop, and the authored height for a wall-mounted model (a painting
   hangs about 1.2 tiles up). Used to build the click box that matches what is
   actually drawn - see scene.js#objTopY. */
export function locMountY(key) {
  const p = prepareLoc(key);
  return p ? p.mount : 0;
}

/* The number of distinct (palette colour, light level) pairs is small, so each
   model keeps the RGB it has already resolved - building a chunk then costs a
   few lookups per face instead of an HSL conversion. */
function faceColor(p, color, level) {
  const key = color * LIGHT_LEVELS + level;
  let c = p.palette.get(key);
  if (c !== undefined) return c;
  const t = level / (LIGHT_LEVELS - 1);
  const rgb = hslToRgb(color, 0.58 + t * 0.44);
  c = [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])];
  p.palette.set(key, c);
  return c;
}

/* Clip a convex polygon (a list of [u, v] points) against the half-plane
   sd(u, v) >= 0, keeping the inside part. Standard Sutherland-Hodgman. */
function clipHalf(poly, sd) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = sd(a[0], a[1]), db = sd(b[0], b[1]);
    if (da >= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/* Cut one textured triangle into the pieces that each draw a single repeat of
   its texture, so a face taller or wider than one repeat shows the pattern
   repeating instead of a stretched copy of it (a wall face is 1.875 repeats
   tall; a canopy triangle is a couple of repeats across). A face's three
   corners carry cell-space texture coordinates where 1.0 = one full repeat, so
   the pieces are the unit squares of that uv space.

   The face is a triangle, hence planar, hence position is affine in (u, v):
   solving position = A + s*(B-A) + t*(C-A) for (s, t) from the corner uvs gives
   the world point of ANY uv, so each clipped piece is rebuilt at its exact
   original position with its uv shifted into the cell rect (x, y, w, h). */
function wrapFace(P, uv, rect, mirror = true) {
  const A = P[0], B = P[1], C = P[2];
  const uA = uv[0][0], vA = uv[0][1];
  const du1 = uv[1][0] - uA, dv1 = uv[1][1] - vA;
  const du2 = uv[2][0] - uA, dv2 = uv[2][1] - vA;
  const det = du1 * dv2 - dv1 * du2;
  /* Every other repeat is MIRRORED, in both axes. The leaf and bark sprites fade
     out towards one edge of their cell, so butting two plain repeats together
     leaves a hard straight line of holes across every canopy - a grid that the
     real tree does not have (its own renderer projects the texture in camera
     space, where the repeats never line up with anything). Flipping alternate
     repeats makes the faded edge meet itself instead, so what the eye sees is a
     symmetric clump of leaves, and the only join left is where two solid edges of
     the art meet - which is what an overlapping mass of foliage looks like.
     Animated overlays (the magic tree's sparkle shell, the fishing spot's own
     sparkle) are EXEMPT: the client's `Texture.animate` shifts the texture's
     pixels with a plain wrap, so every repeat slides the same way. Mirroring an
     overlay's repeats turns its own scroll against itself - the magic shell's
     side faces span three repeats vertically, so the middle band's stars rose
     while the bands above and below fell. The caller passes mirror=false for
     the animated pass, and the repeats butt plainly, exactly like the client. */
  const at = (u, v, k, m) => [
    rect[0] + (mirror && (k & 1) ? k + 1 - u : u - k) * rect[2],
    rect[1] + (mirror && (m & 1) ? m + 1 - v : v - m) * rect[3],
  ];
  const minU = Math.min(uA, uv[1][0], uv[2][0]), maxU = Math.max(uA, uv[1][0], uv[2][0]);
  const minV = Math.min(vA, uv[1][1], uv[2][1]), maxV = Math.max(vA, uv[1][1], uv[2][1]);
  const k0 = Math.floor(minU), k1 = Math.floor(maxU - 1e-6);
  const m0 = Math.floor(minV), m1 = Math.floor(maxV - 1e-6);
  if (Math.abs(det) < 1e-9) {
    /* the face is edge-on to its projection axis and all three corners share a
       texel: keep it whole and just pin that texel inside the cell */
    const cu = Math.min(Math.max(uA, 0.02), 0.98);
    const cv = Math.min(Math.max(vA, 0.02), 0.98);
    const t = at(cu, cv, 0, 0);
    return [[[A, t], [B, t], [C, t]]];
  }
  if ((k1 - k0 + 1) * (m1 - m0 + 1) > 256) {
    /* absurd span for one triangle (a texture seen almost edge-on through a
       stretched loc): fall back to one squeezed copy rather than emitting
       hundreds of slivers */
    const su = maxU > 1 ? 1 / (maxU - minU) : 1, sv = maxV > 1 ? 1 / (maxV - minV) : 1;
    const ou = maxU > 1 ? -minU * su : 0, ov = maxV > 1 ? -minV * sv : 0;
    const t = uv.map(([u, v]) => at(u * su + ou, v * sv + ov, 0, 0));
    return [[[A, t[0]], [B, t[1]], [C, t[2]]]];
  }
  const pos = (u, v) => {
    const s = ((u - uA) * dv2 - (v - vA) * du2) / det;
    const t = ((v - vA) * du1 - (u - uA) * dv1) / det;
    return [
      A[0] + s * (B[0] - A[0]) + t * (C[0] - A[0]),
      A[1] + s * (B[1] - A[1]) + t * (C[1] - A[1]),
      A[2] + s * (B[2] - A[2]) + t * (C[2] - A[2]),
    ];
  };
  const pieces = [];
  for (let k = k0; k <= k1; k++) {
    for (let m = m0; m <= m1; m++) {
      let poly = clipHalf([[uA, vA], uv[1], uv[2]], (u) => u - k);
      if (poly.length < 3) continue;
      poly = clipHalf(poly, (u) => k + 1 - u);
      if (poly.length < 3) continue;
      poly = clipHalf(poly, (u, v) => v - m);
      if (poly.length < 3) continue;
      poly = clipHalf(poly, (u, v) => m + 1 - v);
      if (poly.length < 3) continue;
      for (let i = 1; i + 1 < poly.length; i++) {
        const q0 = poly[0], q1 = poly[i], q2 = poly[i + 1];
        pieces.push([
          [pos(q0[0], q0[1]), at(q0[0], q0[1], k, m)],
          [pos(q1[0], q1[1]), at(q1[0], q1[1], k, m)],
          [pos(q2[0], q2[1]), at(q2[0], q2[1], k, m)],
        ]);
      }
    }
  }
  return pieces;
}

/* Emit one loc's geometry into a MeshBuilder, rotated by `rot` (multiples of 90
   degrees - the game itself only ever rotates scenery in quarter turns). The
   model is centred on its own footprint centre, so an instance's world position
   is simply the centre of the tile it stands on.
   
   The light level of every face depends on its rotated normal, so each
   (model, rotation) pair is its own geometry - which is exactly what the
   instanced renderer wants: 51 models x 4 rotations is a handful of small
   buffers, no matter how many thousand trees the map holds. */
export function buildLocGeometry(key, rot, animId = null, glassOnly = false, glowOnly = false) {
  const p = prepareLoc(key);
  if (!p) return null;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const builder = new MeshBuilder();
  const glassBuilder = new MeshBuilder();
  const glowBuilder = new MeshBuilder();
  const cx = p.cx, cz = p.cz;
  const locOut = (f) => {
    const i0 = p.faces[f * 3], i1 = p.faces[f * 3 + 1], i2 = p.faces[f * 3 + 2];
    const out = [];
    for (const i of [i0, i1, i2]) {
      const mx = p.verts[i * 3] * p.sx * U + cx;
      const my = (p.footY - p.verts[i * 3 + 1]) * p.sy * U;
      const mz = -p.verts[i * 3 + 2] * p.sz * U + cz;
      out.push(
        mx * cos + mz * sin,
        my,
        -mx * sin + mz * cos
      );
    }
    return out;
  };
  const locNrm = (out) => {
    const e1x = out[3] - out[0], e1y = out[4] - out[1], e1z = out[5] - out[2];
    const e2x = out[6] - out[0], e2y = out[7] - out[1], e2z = out[8] - out[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const dropSet = new Set();
  if (!glassOnly && !glowOnly) {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    const jobs = [];
    for (let f = 0; f < p.fcount; f++) {
      const ftex = p.texIds ? p.texIds[f] : -1;
      if (animId === null ? p.animFace[f] : ftex !== animId) continue;
      if (p.colors[f] === 43129) continue;
      const fa = p.faceAlpha ? p.faceAlpha[f] : 0;
      if (animId === null && !!fa) continue;
      const out = locOut(f);
      const N = locNrm(out);
      const q = (v) => Math.round(v * 4096);
      const P = [[q(out[0]), q(out[1]), q(out[2])], [q(out[3]), q(out[4]), q(out[5])], [q(out[6]), q(out[7]), q(out[8])]];
      let uk = "";
      if (ftex >= 0) {
        const T = [[p.uvFace[f * 6], p.uvFace[f * 6 + 1]], [p.uvFace[f * 6 + 2], p.uvFace[f * 6 + 3]], [p.uvFace[f * 6 + 4], p.uvFace[f * 6 + 5]]];
        const S = [[P[0], T[0]], [P[1], T[1]], [P[2], T[2]]].sort((a, b) => (a[0][0] - b[0][0]) || (a[0][1] - b[0][1]) || (a[0][2] - b[0][2]));
        uk = S.map((s) => s[0].join(",") + "|" + s[1].join(",")).join(";");
      } else {
        const S = [P[0], P[1], P[2]].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
        uk = S.map((s) => s.join(",")).join(";");
      }
      jobs.push({ f, out, N, key: ftex + "#" + uk, ftex, cen: [(out[0] + out[3] + out[6]) / 3, (out[1] + out[4] + out[7]) / 3, (out[2] + out[5] + out[8]) / 3] });
      for (let k = 0; k < 9; k += 3) {
        const vx = out[k], vy = out[k + 1], vz = out[k + 2];
        if (vx < mnx) mnx = vx; if (vx > mxx) mxx = vx;
        if (vy < mny) mny = vy; if (vy > mxy) mxy = vy;
        if (vz < mnz) mnz = vz; if (vz > mxz) mxz = vz;
      }
    }
    const ccx = (mnx + mxx) / 2, ccy = (mny + mxy) / 2, ccz = (mnz + mxz) / 2;
    for (const j of jobs) {
      const e1x = j.out[3] - j.out[0], e1y = j.out[4] - j.out[1], e1z = j.out[5] - j.out[2];
      const e2x = j.out[6] - j.out[0], e2y = j.out[7] - j.out[1], e2z = j.out[8] - j.out[2];
      j.area = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / 2;
      j.dot = j.N[0] * (j.cen[0] - ccx) + j.N[1] * (j.cen[1] - ccy) + j.N[2] * (j.cen[2] - ccz);
    }
    const best = new Map();
    for (const j of jobs) {
      const prev = best.get(j.key);
      if (!prev || j.dot > prev.dot) best.set(j.key, { dot: j.dot, f: j.f });
    }
    const keep = new Set();
    for (const v of best.values()) keep.add(v.f);
    for (const j of jobs) if (!keep.has(j.f)) dropSet.add(j.f);
    const pq = (v) => Math.round(Math.abs(v) * 256);
    const inTri = (px, py, ax, ay, bx, by, cx2, cy2) => {
      const v0x = cx2 - ax, v0y = cy2 - ay, v1x = bx - ax, v1y = by - ay, v2x = px - ax, v2y = py - ay;
      const d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y;
      const d20 = v2x * v0x + v2y * v0y, d21 = v2x * v1x + v2y * v1y;
      const den = d00 * d11 - d01 * d01;
      if (Math.abs(den) < 1e-14) return false;
      const vv = (d11 * d20 - d01 * d21) / den, ww = (d00 * d21 - d01 * d20) / den;
      return vv >= -1e-4 && ww >= -1e-4 && (vv + ww) <= 1.0001;
    };
    const planeKept = new Map();
    const coverJobs = jobs.filter((j) => !dropSet.has(j.f)).sort((a, b) => ((b.dot > 0) - (a.dot > 0)) || (b.area - a.area) || (b.dot - a.dot));
    for (const j of coverJobs) {
      const d0 = j.N[0] * j.cen[0] + j.N[1] * j.cen[1] + j.N[2] * j.cen[2];
      const gkey = pq(j.N[0]) + "," + pq(j.N[1]) + "," + pq(j.N[2]) + "@" + pq(d0);
      let list = planeKept.get(gkey);
      if (!list) { list = []; planeKept.set(gkey, list); }
      const ax = Math.abs(j.N[0]), ay = Math.abs(j.N[1]), az = Math.abs(j.N[2]);
      const pr = (v) => (ax >= ay && ax >= az) ? [v[1], v[2]] : (ay >= az ? [v[0], v[2]] : [v[0], v[1]]);
      const jp = [0, 3, 6].map((k) => [j.out[k], j.out[k + 1], j.out[k + 2]]);
      const jq = [jp[0], jp[1], jp[2], j.cen].map(pr);
      const cover = [];
      const coverArea = [];
      for (const k of list) {
        if (Math.abs(j.N[0] * k.N[0] + j.N[1] * k.N[1] + j.N[2] * k.N[2]) < 0.9999995) continue;
        const dk = k.N[0] * k.cen[0] + k.N[1] * k.cen[1] + k.N[2] * k.cen[2];
        if (Math.min(Math.abs(d0 - dk), Math.abs(d0 + dk)) > 0.00005) continue;
        cover.push([0, 3, 6].map((kk) => [k.out[kk], k.out[kk + 1], k.out[kk + 2]]).map(pr));
        coverArea.push(k.area);
      }
      let covered = false;
      let maxCover = 0;
      if (cover.length) {
        covered = true;
        for (const q of jq) {
          let best = 0;
          for (let ci = 0; ci < cover.length; ci++) {
            const kq = cover[ci];
            if (inTri(q[0], q[1], kq[0][0], kq[0][1], kq[1][0], kq[1][1], kq[2][0], kq[2][1])) {
              if (coverArea[ci] > best) best = coverArea[ci];
            }
          }
          if (!best) { covered = false; break; }
          if (best > maxCover) maxCover = best;
        }
      }
      if (covered && (j.ftex < 0 || j.area < 0.15 * maxCover)) dropSet.add(j.f);
      else list.push(j);
    }
  }
  for (let f = 0; f < p.fcount; f++) {
    if (dropSet.has(f)) continue;
    const ftex = p.texIds ? p.texIds[f] : -1;
    /* `animId` picks the half of the model to emit: the sheet's own faces (null,
       every face that samples a still texture) or the faces of one animated
       texture, which a second mesh draws with its scrolling material. */
    if (animId === null ? p.animFace[f] : ftex !== animId) continue;
    const glass = p.colors[f] === 43129;
    if (glassOnly !== glass) continue;
    /* Faces the cache authors translucent (see `prepareLoc#faceAlpha`) leave
       the solid pass for the glow one, which the caller draws blended
       (`locGlowGeometry`) - rendering them opaque is what put solid orange
       slabs on the furnace's firebox. The animated-texture and glass passes
       keep their faces as before. */
    const fa = p.faceAlpha ? p.faceAlpha[f] : 0;
    if (animId === null && !glassOnly) {
      if (glowOnly ? (!fa || glass) : !!fa) continue;
    }
    const BD = glass ? glassBuilder : (glowOnly ? glowBuilder : builder);
    const glowA = glowOnly ? (256 - fa) / 256 : 1;
    const out = locOut(f);
    const ax = out[0], ay = out[1], az = out[2];
    const bx = out[3], by = out[4], bz = out[5];
    const gx = out[6], gy = out[7], gz = out[8];
    const N = locNrm(out);
    const nx = N[0], ny = N[1], nz = N[2];
    const dot = nx * SUN.x + ny * SUN.y + nz * SUN.z;
    let level = ((dot * 0.5 + 0.5) * (LIGHT_LEVELS - 1) + 0.5) | 0;
    if (level < 0) level = 0; else if (level > LIGHT_LEVELS - 1) level = LIGHT_LEVELS - 1;

    const tex = ftex;
    const A = [ax, ay, az], B = [bx, by, bz], C = [gx, gy, gz];
    const rect = [p.cellFace[f * 4], p.cellFace[f * 4 + 1], p.cellFace[f * 4 + 2], p.cellFace[f * 4 + 3]];
    let col;
    if (tex >= 0) {
      /* Textured faces ride on the atlas: the light level becomes a grey
         multiplier so the leaf texture darkens and brightens like any other
         face of the same model. Corner uvs are in cell units and may run past
         1, so the face is cut into one piece per repeat first. */
      const t = level / (LIGHT_LEVELS - 1);
      const b = lin(0.58 + t * 0.44);
      col = [b, b, b];
      const uv = [
        [p.uvFace[f * 6], p.uvFace[f * 6 + 1]],
        [p.uvFace[f * 6 + 2], p.uvFace[f * 6 + 3]],
        [p.uvFace[f * 6 + 4], p.uvFace[f * 6 + 5]],
      ];
      for (const piece of wrapFace([A, B, C], uv, rect, animId === null)) {
        if (glowOnly) BD.triUVA(piece[0][0], piece[1][0], piece[2][0], N, col, glowA, piece[0][1], piece[1][1], piece[2][1]);
        else BD.triUV(piece[0][0], piece[1][0], piece[2][0], N, col, piece[0][1], piece[1][1], piece[2][1]);
      }
    } else {
      col = faceColor(p, p.colors[f], level);
      if (key === "plant" && col[1] > col[0] && col[1] > col[2]) {
        const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
        col = [lum + (col[0] - lum) * 0.45, lum + (col[1] - lum) * 0.45, lum + (col[2] - lum) * 0.45];
      }
      const wu = rect[0] + rect[2] * 0.5, wv = rect[1] + rect[3] * 0.5;
      if (glowOnly) BD.triUVA(A, B, C, N, col, glowA, [wu, wv], [wu, wv], [wu, wv]);
      else BD.triUV(A, B, C, N, col, [wu, wv], [wu, wv], [wu, wv]);
    }
  }
  if (glassOnly) {
    const n = glassBuilder.count();
    return n ? glassBuilder.build() : null;
  }
  if (glowOnly) {
    const n = glowBuilder.count();
    return n ? glowBuilder.buildWithAlpha() : null;
  }
  const n = builder.count();
  if (!n) return null;
  const g = builder.build();
  return g;
}

const geomCache = new Map();

/* The geometry for one model at one quarter-turn, built at most once. This is
   the sheet's half of the model: a face that samples an animated texture is
   *not* in it - `locAnimGeometry` carries those. */
export function locGeometry(key, rotIdx) {
  const ck = key + "|" + rotIdx;
  let g = geomCache.get(ck);
  if (g) return g;
  g = buildLocGeometry(key, (rotIdx & 3) * Math.PI / 2, null);
  if (g) geomCache.set(ck, g);
  return g;
}

/* The animated half: only the faces that sample texture `animId`, so the caller
   can draw them in one batch with that texture's scrolling material. Null when
   the model has no such face - which is every model but the magic tree, the
   fishing spots and whatever else the cache gives a scrolling texture to. */
export function locAnimGeometry(key, rotIdx, animId) {
  const ck = key + "|" + rotIdx + "|a" + animId;
  let g = geomCache.get(ck);
  if (g) return g;
  g = buildLocGeometry(key, (rotIdx & 3) * Math.PI / 2, animId);
  if (g) geomCache.set(ck, g);
  return g;
}

export function locGlassGeometry(key, rotIdx) {
  const ck = key + "|" + rotIdx + "|glass";
  let g = geomCache.get(ck);
  if (g) return g;
  g = buildLocGeometry(key, (rotIdx & 3) * Math.PI / 2, null, true);
  if (g) geomCache.set(ck, g);
  return g;
}

/* The translucent half: only the faces the cache authors a transparency for,
   with their authored alpha in the colour attribute, so the caller draws them
   blended (see scene.js#locGlowMat). Null when the model authors none - most
   models. The furnace's firebox lining lives here: 24 lava faces at 160..224
   (12..37% opacity), which is the glow in the mouth rather than orange slabs
   standing outside it. */
export function locGlowGeometry(key, rotIdx) {
  const ck = key + "|" + rotIdx + "|glow";
  let g = geomCache.get(ck);
  if (g) return g;
  g = buildLocGeometry(key, (rotIdx & 3) * Math.PI / 2, null, false, true);
  if (g) geomCache.set(ck, g);
  return g;
}

export function locGeomCacheSize() { return geomCache.size; }

/* The essence-mine return portal's own motion (loc 2492, anim 504): the one
   scenery loc with a baked skeletal animation - a 39-frame 1.6 s loop of
   scale pulse, slight rotation and alpha shimmer over its translucent swirl.
   Scenery shares one geometry per model+rotation, so there is nothing to pose
   per instance: the cached glow geometries are re-skinned in place and every
   portal moves together (they are never on screen at once). Only this key can
   take this path - the rig refuses any model that is not untextured,
   all-translucent and single-pass, so face order in the buffer is exactly face
   order in the bake. Colours stay as built (the wobble is small); positions,
   normals and per-face alpha are rewritten when the frame changes. */
const portalAnim = { t: 0, frame: -1, rig: null, done: false };
function portalRig() {
  if (portalAnim.rig || portalAnim.done) return portalAnim.rig;
  portalAnim.done = true;
  const d = locData.get("essence_portal");
  const p = d && prepareLoc("essence_portal");
  const a = d && d.anims && d.anims.stand;
  if (!p || !a || !a.frames || !a.frames.length) return null;
  for (let f = 0; f < p.fcount; f++) {
    if ((p.texIds ? p.texIds[f] : -1) >= 0 || p.animFace[f]) return null;
    if (p.colors[f] === 43129) return null;
    if (!(p.faceAlpha && p.faceAlpha[f])) return null;
  }
  const fm = typeof a.fm === "string" ? JSON.parse(a.fm) : a.fm;
  if (!fm || !fm.types || !fm.groups) return null;
  const groupOf = b64bytes(d.groupOf);
  if (!groupOf || groupOf.length < p.vcount) return null;
  const groups = [];
  for (let i = 0; i < p.vcount; i++) {
    const g = groupOf[i];
    (groups[g] || (groups[g] = [])).push(i);
  }
  const lengths = a.lengths && a.lengths.length === a.frames.length ? a.lengths : a.frames.map(() => 4);
  const tickOffsets = [];
  let acc = 0;
  for (const l of lengths) { tickOffsets.push(acc); acc += l; }
  const label = d.faceLabel ? b64bytes(d.faceLabel) : null;
  const buckets = [];
  for (let f = 0; f < p.fcount; f++) {
    const l = label && label.length === p.fcount ? label[f] : 0;
    (buckets[l] || (buckets[l] = [])).push(f);
  }
  portalAnim.rig = {
    p, fm, frames: a.frames, tickOffsets, totalTicks: acc, groups,
    rest: new Int16Array(b64bytes(d.verts).buffer),
    pose: { x: new Int32Array(p.vcount), y: new Int32Array(p.vcount), z: new Int32Array(p.vcount) },
    baseAlpha: Uint8Array.from(p.faceAlpha), buckets,
    alphaWork: new Uint8Array(p.fcount),
  };
  return portalAnim.rig;
}

function writePortalPose(g, rig, rot) {
  const p = rig.p;
  const posA = g.attributes.position, norA = g.attributes.normal, colA = g.attributes.color;
  if (!posA || !norA || !colA || posA.count !== p.fcount * 3) return;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const pos = posA.array, nor = norA.array, col = colA.array;
  const faces = p.faces, pose = rig.pose, alpha = rig.alphaWork;
  let vi = 0;
  for (let f = 0; f < p.fcount; f++) {
    const i0 = faces[f * 3], i1 = faces[f * 3 + 1], i2 = faces[f * 3 + 2];
    const mx0 = pose.x[i0] * p.sx * U + p.cx, my0 = (p.footY - pose.y[i0]) * p.sy * U, mz0 = -pose.z[i0] * p.sz * U + p.cz;
    const mx1 = pose.x[i1] * p.sx * U + p.cx, my1 = (p.footY - pose.y[i1]) * p.sy * U, mz1 = -pose.z[i1] * p.sz * U + p.cz;
    const mx2 = pose.x[i2] * p.sx * U + p.cx, my2 = (p.footY - pose.y[i2]) * p.sy * U, mz2 = -pose.z[i2] * p.sz * U + p.cz;
    const ax = mx0 * cos + mz0 * sin, ay = my0, az = -mx0 * sin + mz0 * cos;
    const bx = mx1 * cos + mz1 * sin, by = my1, bz = -mx1 * sin + mz1 * cos;
    const gx = mx2 * cos + mz2 * sin, gy = my2, gz = -mx2 * sin + mz2 * cos;
    pos[vi * 3] = ax; pos[vi * 3 + 1] = ay; pos[vi * 3 + 2] = az;
    pos[vi * 3 + 3] = bx; pos[vi * 3 + 4] = by; pos[vi * 3 + 5] = bz;
    pos[vi * 3 + 6] = gx; pos[vi * 3 + 7] = gy; pos[vi * 3 + 8] = gz;
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = gx - ax, e2y = gy - ay, e2z = gz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 3; k++) {
      nor[vi * 3 + k * 3] = nx; nor[vi * 3 + k * 3 + 1] = ny; nor[vi * 3 + k * 3 + 2] = nz;
      col[(vi + k) * 4 + 3] = (256 - alpha[f]) / 256;
    }
    vi += 3;
  }
  posA.needsUpdate = true; norA.needsUpdate = true; colA.needsUpdate = true;
  g.computeBoundingSphere();
}

/* Advance the portal loop by `dt` seconds (called from View.update, beside the
   water and texture animation). The clock runs at the authored speed: one tick
   is a 20 ms client cycle, the same unit the bake's frame lengths and the
   character animator use. */
export function advanceLocAnims(dt) {
  const rig = portalRig();
  if (!rig) return;
  portalAnim.t += dt;
  const tt = (portalAnim.t / 0.02) % rig.totalTicks;
  let fi = 0;
  while (fi < rig.frames.length - 1 && rig.tickOffsets[fi + 1] <= tt) fi++;
  if (fi === portalAnim.frame) return;
  portalAnim.frame = fi;
  skinPose(rig.rest, rig.groups, rig.fm, rig.frames[fi], rig.pose);
  alphaPose(rig.baseAlpha, rig.buckets, rig.fm, rig.frames[fi], rig.alphaWork);
  for (let r = 0; r < 4; r++) {
    const g = geomCache.get("essence_portal|" + r + "|glow");
    if (g) writePortalPose(g, rig, r * Math.PI / 2);
  }
}
