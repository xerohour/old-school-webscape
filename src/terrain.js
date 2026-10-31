import * as THREE from "https://esm.sh/three@0.160.0";
import { bakedURL } from "./baked.js";

/* ---------------------------------------------------------------------------
   The ground's real textures.

   `src/sprites/terrain/terrain-atlas.png` is baked from the cache by
   `src/tools/cache-bake/terrain.mjs`: the index 9 textures the game gives its
   own floors, packed shoulder to shoulder with a gutter that repeats each
   cell's own border texels (mipmapped ground would otherwise fade into the
   neighbouring cell and read as a grid of seams).

   `terrain.json` carries the packed width/height and, per material key, the
   cell's UV rect and where it came from (the overlay def whose texture it is,
   or - for a ground the game has no floor for - that it is the cache's nearest
   equivalent art).

   This module is the runtime half: it fetches both, makes ONE texture, and
   answers `terrainUv(key)`. `scene.js#_chunkGround` samples it per tile, one
   repeat per tile, which is exactly what the client does with a textured
   floor. Ground built before the sheet lands falls back to the procedural
   atlas; main.js rebuilds the chunks the same way it does when the scenery
   bake arrives late (see locmodels.js#locsReady).
   --------------------------------------------------------------------------- */

const URL_BASE = "src/sprites/terrain/";

let meta = null;
let texture = null;
let waterTex = null;
let loaded = false;

export function terrainReady() { return loaded; }
export function terrainTexture() { return texture; }
export function terrainMeta() { return meta; }

/* The water, lifted OUT of the sheet into a texture of its own.

   The client's water is not geometry and not a shader: it is the ordinary
   ground texture, *scrolled* (`Client.animateTexture` shifts the water texture
   2 texels per 20 ms cycle - see `scene.js#update`). A repeating sampler can be
   scrolled through `map.offset`; a cell inside a packed sheet cannot, because
   scrolling it would pull the neighbouring cells into view. So the water cell is
   drawn into a canvas of its own here and wrapped, and the river mesh and the
   ocean plane both sample it - one texture, one offset, so they ripple in phase,
   which is also what the client's global shift does. */
function buildWaterTexture(image, cell) {
  const cv = document.createElement("canvas");
  cv.width = cell.w;
  cv.height = cell.h;
  cv.getContext("2d").drawImage(image, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  /* the same convention as the sheet: the bake packs rows downwards */
  t.flipY = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  return t;
}

export function waterTexture() { return waterTex; }

/* Sparkle glints (user ask 2026-10-30): a sparse sheet of tiny plus-shaped
   sun glints on transparent. Scattered over fully-wet water tiles by
   scene.js#_chunkWater and drifted slowly in update() - the living part of
   an otherwise still sea. Fixed seed, tileable in x like the foam sheet. */
let sparkTex = null;
export function sparkleTexture() {
  if (sparkTex) return sparkTex;
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, S, S);
  let seed = 777001;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 36; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 1.5, len = 6 + rnd() * 8;
    for (const ox of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r * 2);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + ox, y, r * 2, 0, 7);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.45)";
      g.fillRect(x + ox - len / 2, y - 0.5, len, 1);
      g.fillRect(x + ox - 0.5, y - len / 2, 1, len);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  sparkTex = t;
  return t;
}

/* Whitecaps (user ask 2026-10-30): small crisp foam flecks for open water -
   short broken dashes, not the soft shore rings and not the plus-shaped sun
   glints. Static ink (scene.js never animates it): the texture IS the wave.
   Fixed seed, tileable in x. */
let capTex = null;
export function whitecapTexture() {
  if (capTex) return capTex;
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, S, S);
  let seed = 5150;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, len = 22 + rnd() * 18, wd = 6 + rnd() * 4;
    for (const ox of [-S, 0, S]) {
      const gr = g.createLinearGradient(x + ox - len / 2, 0, x + ox + len / 2, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.25, "rgba(255,255,255,0.95)");
      gr.addColorStop(0.75, "rgba(255,255,255,0.95)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x + ox - len / 2, y - wd / 2, len, wd);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 3;
    for (const ox of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r * 2);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + ox, y, r * 2, 0, 7);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  capTex = t;
  return t;
}

/* Drifting foam streaks (user ask 2026-10-30): long soft horizontal wisps
   for open water - the texture is one feathered band, tileable in x, so each
   mesh reads as a single wave streak, never a dot or circle. */
let streakTex = null;
export function foamStreakTexture() {
  if (streakTex) return streakTex;
  const S = 128, H = 32;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = H;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, S, H);
  const draw = (y, wd, a) => {
    for (const ox of [-S, 0, S]) {
      const gx = g.createLinearGradient(ox - 8, 0, ox + S + 8, 0);
      gx.addColorStop(0, "rgba(255,255,255,0)");
      gx.addColorStop(0.2, `rgba(255,255,255,${a})`);
      gx.addColorStop(0.8, `rgba(255,255,255,${a})`);
      gx.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gx;
      g.fillRect(ox - 8, y - wd / 2, S + 16, wd);
    }
  };
  draw(16, 7, 0.85);
  draw(11, 3, 0.4);
  draw(22, 3, 0.4);
  const gy = g.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, "rgba(0,0,0,1)");
  gy.addColorStop(0.3, "rgba(0,0,0,0)");
  gy.addColorStop(0.7, "rgba(0,0,0,0)");
  gy.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = gy;
  g.fillRect(0, 0, S, H);
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  streakTex = t;
  return t;
}

export function terrainUv(key) {
  if (!meta) return null;
  return meta.cells[key] || null;
}

export function terrainKeys() {
  return meta ? Object.keys(meta.cells) : [];
}

export async function loadTerrain() {
  if (loaded) return true;
  /* A failed attempt is NOT a permanent state, and this used to latch one: an
     error set a `failed` flag the very next call respected, so a single
     transient network error left the whole world on the procedural ground for
     the rest of the session - and main.js's art repair, whose whole job is to
     re-run a bake that never landed, could not get past it. The guard is
     `loaded` alone; a second attempt simply fetches again (`force-cache` makes
     a retry that succeeded before free, and a failure is cheap). */
  try {
    const res = await fetch(bakedURL(URL_BASE + "terrain.json"));
    if (!res.ok) throw new Error("terrain.json " + res.status);
    const json = await res.json();
    const image = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        bakedURL(URL_BASE + "terrain-atlas.png"),
        (t) => resolve(t.image),
        undefined,
        reject
      );
    });
    const tex = new THREE.CanvasTexture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    /* the cell rects are top-left origin (the bake packs rows downwards), so
       the image must not be flipped on upload */
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    /* the client's rasterizer point-samples its floor textures - nearest
       magnification is what makes a 2007 field look like one */
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    texture = tex;
    meta = json;
    if (json.cells && json.cells.water) waterTex = buildWaterTexture(image, json.cells.water);
    loaded = true;
    return true;
  } catch (e) {
    console.warn("[terrain] ground textures unavailable", e);
    return false;
  }
}

/* Ground-decor decal sheet (v37): src/sprites/decor-atlas.png, 4x2 cells
   (daisy, tuft, pebble, litter / stone, shell, mushroom, sprig), extracted
   from osws-renderer's labelled strip with the green keyed out and the
   art's own RGB bled under the transparent pixels for a clean mip chain.
   Same sampler convention as the ground sheet (no flip, nearest mag). */
let decorTex = null;
let decorLoaded = false;

export function decorReady() { return decorLoaded; }
export function decorTexture() { return decorTex; }

export async function loadDecor() {
  if (decorLoaded) return true;
  try {
    const image = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        bakedURL("src/sprites/decor-atlas.png"),
        (t) => resolve(t.image),
        undefined,
        reject
      );
    });
    const tex = new THREE.CanvasTexture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    decorTex = tex;
    decorLoaded = true;
    return true;
  } catch (e) {
    console.warn("[terrain] decor atlas unavailable", e);
    return false;
  }
}
