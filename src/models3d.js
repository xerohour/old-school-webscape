import * as THREE from "https://esm.sh/three@0.160.0";
import { bakedURL } from "./baked.js";
import { RenderOptions } from "./renderopts.js";

/* ---------------------------------------------------------------------------
   Real 2007 character models, driven by the game's own animation data.

   The cache stores each character as a low-poly mesh of *bone-group* vertices
   plus keyframe "translator" lists (per bone group: a pivot, a translation, an
   axis rotation in 1/8-degree units, or a scale). This module replays exactly
   that skinning on the CPU, per animation frame, then paints each triangle with
   its palette colour modulated by a single directional light - the same way the
   real client's software rasterizer does it. Flat shading + palette colours are
   what give RuneScape its look, so no textures and no GPU lighting are used.

   Data (src/models/<key>.json) is baked by src/tools/cache-bake/bake.mjs from
   an OSRS cache; see that folder's README for the rebuild recipe.
   --------------------------------------------------------------------------- */

export const UNIT = 128;
const LIGHT_LEVELS = 20;
const TICK_MS = 20;
/* seconds per tile of normal walking - the rate the client authors walk
   cycles against (one game tick of 600ms per tile). A run covers twice that
   ground per tick, so a cycle authored for a run reaches its stride at twice
   the speed. */
const TICK_SECONDS = 0.6;
const RUN_TILES_PER_TICK = 2;

/* --- the client's trigonometry tables (SINE[i] = 65536*sin(i*pi/1024)) --- */
const SINE = new Int32Array(2048);
const COSINE = new Int32Array(2048);
for (let i = 0; i < 2048; i++) {
  SINE[i] = Math.floor(65536 * Math.sin((i * Math.PI) / 1024));
  COSINE[i] = Math.floor(65536 * Math.cos((i * Math.PI) / 1024));
}

const HUE_OFFSET = 0.5 / 64;
const SAT_OFFSET = 0.5 / 8;

/* JagexColor.HSLtoRGB: the client's 6-bit hue / 3-bit sat / 7-bit lum palette,
   with `brightness` used as the gamma exponent (smaller = brighter). */
export function hslToRgb(hsl, brightness) {
  const hue = ((hsl >> 10) & 63) / 64 + HUE_OFFSET;
  const sat = ((hsl >> 7) & 7) / 8 + SAT_OFFSET;
  const lum = (hsl & 127) / 128;
  const chroma = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const l = lum - chroma / 2;
  let r = l, g = l, b = l;
  switch (Math.trunc(hue * 6)) {
    case 0: r += chroma; g += x; break;
    case 1: g += chroma; r += x; break;
    case 2: g += chroma; b += x; break;
    case 3: b += chroma; g += x; break;
    case 4: b += chroma; r += x; break;
    default: r += chroma; b += x; break;
  }
  let rr = Math.trunc(r * 256), gg = Math.trunc(g * 256), bb = Math.trunc(b * 256);
  rr = Math.trunc(Math.pow(rr / 256, brightness) * 256);
  gg = Math.trunc(Math.pow(gg / 256, brightness) * 256);
  bb = Math.trunc(Math.pow(bb / 256, brightness) * 256);
  if (rr === 0 && gg === 0 && bb === 0) rr = 1;
  return [Math.min(255, rr) / 255, Math.min(255, gg) / 255, Math.min(255, bb) / 255];
}

/* sRGB -> linear. three.js treats a vertex-colour attribute as linear data and
   encodes it back to sRGB on output, so every colour we bake into a mesh has to
   go through this first or the whole palette comes out washed out. */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/* The brightness the client builds its palette with (Rasterizer.calculatePalette
   is called with 0.8 at startup - see scratch/ref/317_Client.java:9655). */
const PALETTE_BRIGHTNESS = 0.8;

/* ------------------------------------------------------ client spotanim light

   Spell graphics are not lit the way a character is: the client hands every
   spotanim to the same call - `applyLighting(64 + ambient, 850 + contrast,
   -30, -50, -30, true)` (scratch/ref/317_Player.java:246) - whose light
   direction is fixed in *model space* and whose per-face/per-vertex maths is
   replayed below. That call is what a fire graphic's look actually comes from:
   a lightning-lit face of a saturated red comes out near-pink while the
   downward faces stay dark red, which is why a real cast burst reads as
   faceted flame instead of one flat polygon. Characters keep the generic
   camera-relative light they were tuned against (see buildMesh). */

/* The direction is the client's own (-30, -50, -30), and the client's space has
   +y pointing *down*, so it has to go through the same x, -y, -z remap the
   model vertices do (composite.mjs) before it means anything here. */
const CLIENT_LIGHT = [-30, 50, 30];
const CLIENT_LIGHT_MAG = Math.floor(Math.sqrt(CLIENT_LIGHT[0] ** 2 + CLIENT_LIGHT[1] ** 2 + CLIENT_LIGHT[2] ** 2));

/* Model.mixLightness: scale the colour's *luminance* (the low 7 bits of the
   packed HSL) by the light value and clamp it - hue and saturation are never
   touched, which is what separates this from a gamma curve. */
function mixLightness(colour, lightness) {
  let lum = (Math.trunc(lightness) * (colour & 0x7f)) >> 7;
  if (lum < 2) lum = 2; else if (lum > 126) lum = 126;
  return (colour & 0xff80) + lum;
}

/* A lit colour, cached: a graphic re-lights every frame and the same handful of
   (colour, lightness) pairs keeps coming back. */
const litRgbCache = new Map();
function clientLitColour(hsl, mod, mag, nrm, cnt, v) {
  const c = cnt[v] || 1;
  const lightness = mod + (CLIENT_LIGHT[0] * nrm[v * 3] + CLIENT_LIGHT[1] * nrm[v * 3 + 1] + CLIENT_LIGHT[2] * nrm[v * 3 + 2]) / (mag * c);
  const mixed = mixLightness(hsl, lightness);
  let rgb = litRgbCache.get(mixed);
  if (!rgb) {
    const c255 = hslToRgb(mixed, PALETTE_BRIGHTNESS);
    rgb = [lin(c255[0]), lin(c255[1]), lin(c255[2])];
    litRgbCache.set(mixed, rgb);
  }
  return rgb;
}

/* --- base64 -> typed array -------------------------------------------------- */
function b64bytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function i16(s) { return new Int16Array(b64bytes(s).buffer); }
function u16(s) { return new Uint16Array(b64bytes(s).buffer); }
function u8(s) { return b64bytes(s); }

/* --- model registry -------------------------------------------------------- */
export const modelData = new Map();
export const heldData = new Map();
/* The worn models of the items whose **female cut** is a different model from
   the male one (src/models/held-female.json - 568 of the 575 equippables, see
   tools/cache-bake/held.mjs). Loaded lazily: only a female character needs it,
   and the file is 1.2 MB, so a male player never fetches it. */
export const heldDataFemale = new Map();
let heldFemaleLoaded = false;
let heldFemalePending = null;
/* The female-cut sets are installed into the living scene when the file lands,
   so this is the list of characters that were built before it arrived. */
const femaleWaiters = new Set();
/* Spell graphics (src/models/gfx.json): spotanim models baked exactly like a
   character (same JSON shape, one "play" sequence), kept in their own map so
   they never show up in the modelKeys() listings the skin picker uses. */
export const gfxData = new Map();
export const modelCharacters = new Map();
let modelsLoaded = false;

export function modelsReady() { return modelsLoaded; }

export async function loadCharacterModels() {
  let index;
  try {
    const r = await fetch(bakedURL("src/models/index.json"), { cache: "force-cache" });
    index = await r.json();
  } catch (e) {
    console.warn("[models3d] model manifest unavailable", e);
    return false;
  }
  const keys = index.characters || [];
  const results = await Promise.all(keys.map(async (k) => {
    try {
      const r = await fetch(bakedURL("src/models/" + k + ".json"), { cache: "force-cache" });
      return [k, await r.json()];
    } catch (e) {
      console.warn("[models3d] failed to load model", k, e);
      return [k, null];
    }
  }));
  for (const [k, v] of results) if (v && !v.error) modelData.set(k, v);
  /* One human rig, one copy of it. `player_female.json` is the male body's
     geometry with the female kit parts in it; its 183 sequences are the male
     file's, byte for byte (`animsFrom` says so instead of carrying them - see
     src/tools/cache-bake/bake.mjs#IDENTITY_KITS), and the parsed object is
     simply shared here. That is 4.2 MB of the boot payload that used to be the
     same data twice. Every model that arrives without anims of its own but
     names the file it shares them with is wired up before anything can be
     compiled, so `prepareModel`/`compileAnims` see a normal model. */
  for (const v of modelData.values()) {
    if (v.anims || !v.animsFrom) continue;
    const src = modelData.get(v.animsFrom);
    if (src && src.anims) v.anims = src.anims;
  }
  modelsLoaded = true;
  return true;
}

export function modelKeys() { return [...modelData.keys()]; }

/* Chat-head models (src/models/heads.json): the small model a character speaks
   through in the chatbox dialogue (src/dialogue.js). One per character key, the
   same JSON shape as a body, and baked against its speaker's own idle sequence
   because the widget is animated - the server answers the interface's "give me a
   head" model with IF_SETANIM, which is what src/dialogue.js#headTick plays. A
   speaker whose cache block carries no sequence at all (the player's own kit
   heads, which are composed rather than baked - src/identikits.js#buildKitHead)
   carries the one synthetic no-bone rest frame a mesh needs to be drawn. They
   are kept out of `modelData` and never show up in the skin picker. */
export const headData = new Map();

export async function loadHeadModels() {
  try {
    const r = await fetch(bakedURL("src/models/heads.json"), { cache: "force-cache" });
    const j = await r.json();
    for (const [k, v] of Object.entries(j.heads || {})) if (v && !v.error) headData.set(k, v);
    return true;
  } catch (e) {
    console.warn("[models3d] head model manifest unavailable", e);
    return false;
  }
}

export function headKeys() { return [...headData.keys()]; }

export let chatExprDoc = null;

export async function loadChatExpr() {
  try {
    const r = await fetch(bakedURL("src/models/chat-expr.json"), { cache: "force-cache" });
    chatExprDoc = await r.json();
    return true;
  } catch (e) {
    console.warn("[models3d] chat expressions unavailable", e);
    return false;
  }
}

/* Stand-framemap group counts that mark a head as human (see exprInputsFor):
   224/227/228 are the rev-241 human stands every head is baked against. */
const HUMAN_HEAD_GROUPS = new Set([224, 227, 228]);

function exprInputsFor(key, data) {
  if (!chatExprDoc || !chatExprDoc.anims) return null;
  const g = data.anims && data.anims.stand && data.anims.stand.fm
    ? data.anims.stand.fm.groups.length : -1;
  const human = HUMAN_HEAD_GROUPS.has(g) || key === "player_male" || key === "player_female"
    || (typeof key === "string" && key.startsWith("kithead:"));
  const goblin = g === 152;
  if (!human && !goblin) return null;
  const want = human
    ? ["quizzical", "bored", "happy", "shocked", "confused", "neutral", "shifty", "scared", "drunk", "laughing", "sad", "angry"]
    : ["goblin"];
  const out = {};
  for (const name of want) {
    for (let v = 1; v <= 4; v++) {
      const src = chatExprDoc.anims[name + v];
      if (src) out["expr_" + name + v] = src;
    }
  }
  return out;
}

export function chatAnimName(key, expr, nlines) {
  const data = headData.get(key);
  if (!data || !data._anims) return null;
  const g = data.anims && data.anims.stand && data.anims.stand.fm
    ? data.anims.stand.fm.groups.length : -1;
  const human = HUMAN_HEAD_GROUPS.has(g) || key === "player_male" || key === "player_female"
    || (typeof key === "string" && key.startsWith("kithead:"));
  const name = (human ? (expr || "neutral") : "goblin").toLowerCase();
  const v = Math.max(1, Math.min(4, nlines | 0 || 1));
  const full = "expr_" + name + v;
  if (data._anims[full]) return full;
  const fb = "expr_neutral" + v;
  if (data._anims[fb]) return fb;
  return null;
}

/* A static mesh for a baked model. compileCharacter + buildMesh give the same
   geometry and material a character draws with, and the one update call writes
   the rest pose into the vertex buffer (see src/models3d.js#update - a mesh is
   only ever filled in by its own posing pass, so without it the buffer stays at
   zero and the head renders as a speck at the origin). `userData` carries the
   two numbers the chat-head camera needs - the model's foot in mesh units,
   whose flip the renderer has to undo, and the model's own scale - plus the
   character wrapper itself, because a chat head is *animated*: the dialogue
   box's widget is a type-6 model widget and the client advances its sequence
   every cycle (Client.java's IF_SETANIM), so the caller poses the mesh over
   time through `built.update(dt, {})` (src/dialogue.js#headTick). */
/* A chat head's pupils are authored coplanar with the eye white - the pupil fan
   sits in the same plane as the white fan behind it (both at z -46 on the
   shared human head, measured in the bake). The client never cares: it draws
   faces one at a time, sorted by average depth, so the tie always resolves to
   whichever the sort puts second. A depth buffer has no such notion - two
   fragments at the same depth resolve by rasteriser rounding, which is stable
   for the widget's fixed camera but picks the same winner every frame: the
   eye white, drawn second, so every head stared out of blank white eyes (and
   the old pinHeadPupils, which re-skinned the pupils onto the mouth bones on
   the strength of a color-127 vote, turned Hans's into a loose black blob).
   So decide it here, the way buildMesh decides the doubled sheets: every
   connected run of black faces small enough to be a pupil (all 37 heads carry
   exactly two 6-face runs; the fisherman's 22-face black bit and Hatius's
   monocle runs are the reason for the size guard) is drawn last, stably, so
   the depth test's own LEQUAL rule puts the pupils over the white on every
   head, present and future, with no geometry touched. That half is not enough
   on its own: the shared coplanar-overlay pass keys its plane buckets in mesh
   units and the widget's own camera sits close enough that a two-unit push can
   still tie, so the pupils also get two raw units of real geometry straight
   toward the viewer (raw z down is mesh z up, which is the widget's camera
   side). Two units is the engine's own OVERLAY_STEP, sub-pixel on screen and
   depth-only along the view axis, and it rides the bones with the rest of the
   eye - pupil and white already share their vertex groups (5/22 on the human
   head), which the old pinning used to break. */
function orderHeadPupils(data) {
  const fcount = data.fcount, colors = data._colors, faces = data._faces;
  if (!colors || !faces || !fcount) return;
  const rest = data._rest;
  if (data.key === "highwayman" && rest) {
    const eye = new Set(), other = new Set();
    for (let f = 0; f < fcount; f++) {
      const set = (colors[f] === 0 || colors[f] === 43303) ? eye : other;
      for (let k = 0; k < 3; k++) set.add(faces[f * 3 + k]);
    }
    for (const vi of eye) {
      if (other.has(vi)) continue;
      rest[vi * 3 + 1] += 6;
    }
  }
  const black = [];
  for (let f = 0; f < fcount; f++) if (colors[f] === 0) black.push(f);
  if (!black.length) return;
  const par = black.map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const seen = new Map();
  black.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      const v = faces[f * 3 + k];
      if (seen.has(v)) { const a = find(i), b = find(seen.get(v)); if (a !== b) par[a] = b; }
      else seen.set(v, i);
    }
  });
  const size = new Map();
  black.forEach((f, i) => { const r = find(i); size.set(r, (size.get(r) || 0) + 1); });
  const late = new Set();
  black.forEach((f, i) => { if (size.get(find(i)) <= 12) late.add(f); });
  if (!late.size) return;
  if (rest) {
    const moved = new Set();
    for (const f of late) {
      for (let k = 0; k < 3; k++) {
        const v = faces[f * 3 + k];
        if (moved.has(v)) continue;
        moved.add(v);
        rest[v * 3 + 2] -= 2;
      }
    }
  }
  const early = [];
  for (let f = 0; f < fcount; f++) if (!late.has(f)) early.push(f);
  const move = (arr, n) => {
    if (!arr) return arr;
    const out = new arr.constructor(arr.length);
    let i = 0;
    for (const f of early) for (let k = 0; k < n; k++) out[i++] = arr[f * n + k];
    for (const f of late) for (let k = 0; k < n; k++) out[i++] = arr[f * n + k];
    return out;
  };
  data._faces = move(data._faces, 3);
  data._colors = move(data._colors, 1);
  data._alpha = move(data._alpha, 1);
  data._alphaLabel = move(data._alphaLabel, 1);
  data._partOf = move(data._partOf, 1);
  data._tex = move(data._tex, 1);
  data._cover = move(data._cover, 1);
}

export function makeStaticMesh(key) {
  const data = headData.get(key);
  if (!data) return null;
  if (!data._prepared) {
    prepareRaw(data); orderHeadPupils(data); data._anims = compileAnims(data.anims);
    const extra = exprInputsFor(key, data);
    if (extra) Object.assign(data._anims, compileAnims(extra));
    data._prepared = true;
  }
  if (chatExprDoc && !data._exprMerged) {
    const extra = exprInputsFor(key, data);
    if (extra) Object.assign(data._anims, compileAnims(extra));
    data._exprMerged = true;
  }
  const compiled = compileCharacter([bodyPart(data)], data._anims, data.scale, data._anchor, axisScales(data), data.gfx != null);
  const built = buildMesh(compiled);
  built.update.call(built, 0.001, {});
  built.mesh.frustumCulled = false;
  /* The camera offset: mesh-local 0 is the frame point (neck for a baked head),
     and the widget centres a touch above it (the head's middle). A fallback
     portrait carries its own offset in mesh units instead. */
  built.mesh.userData.footY = data.headFootY != null ? data.headFootY : data.footY * data.scale;
  built.mesh.userData.modelScale = data.scale;
  if (data.headZoom) built.mesh.userData.headZoom = data.headZoom;
  built.mesh.userData.built = built;
  return built.mesh;
}

/* A fallback chat head for a speaker the cache baked no head for (most
   creatures - cow, guard, the dragons...). The wiki lists chatheads
   for these speakers, and the client draws a head for whoever is talking, so a
   blank widget is wrong: the speaker's own body model is portrait-framed
   instead, posed by its own idle sequence, so it stays animated like a baked
   head. The frame centres on the neck for a tall body (a bust) and on the
   torso for a wide one (a quadruped, whose head sits at the front rather than
   the top), zoomed out just enough to hold the body. Returns the head key, or
   null when there is no body to draw from. */
export function ensureFallbackHead(bodyKey) {
  const fbKey = "body:" + bodyKey;
  const have = headData.get(fbKey);
  if (have) return fbKey;
  const body = modelData.get(bodyKey);
  if (!body || !body.anims || !body.anims.stand) return null;
  const h = body.height || 1.5;
  const d = Math.max(body.depth || 1, body.width || 1);
  const tall = h >= d;
  const frac = tall ? 0.93 : 0.55;
  /* Raw cache y grows *downward*: the feet sit at `footY` and the head-top at
     `footY - height` (see the (footY - y) mesh convention). So the frame point
     is measured up from the feet, not up from zero. */
  const rawH = h / (body.scale || 1 / 128);
  const footY = Math.round((body.footY || 0) - rawH * frac);
  const span = Math.max(h, d);
  const headZoom = tall
    ? Math.round(796 * Math.max(0.9, Math.min(2.0, span / 1.5)))
    : Math.round(796 * Math.max(0.85, Math.min(2.4, span / 1.36)));
  const data = Object.assign({}, body, { key: fbKey, footY, headZoom, headFootY: tall ? 0.15 : 0.2, headFlip: !tall });
  /* Decode fresh from the shared base64 rather than inheriting the body's own
     prepared arrays: the body's `_anchor` is its feet, while this portrait is
     anchored at the frame point above. */
  for (const f of ["_prepared", "_rest", "_faces", "_colors", "_groupOf", "_alpha", "_alphaLabel", "_partOf", "_tex", "_flip", "_anchor", "_anims", "_raw"]) delete data[f];
  headData.set(fbKey, data);
  return fbKey;
}

/* src/models/gfx.json - every spell graphic the spell table can ask for. */
export async function loadGfxModels() {
  try {
    const r = await fetch(bakedURL("src/models/gfx.json"), { cache: "force-cache" });
    const j = await r.json();
    for (const [k, v] of Object.entries(j.models || {})) if (v && !v.error) gfxData.set(k, v);
    return true;
  } catch (e) {
    console.warn("[models3d] gfx model manifest unavailable", e);
    return false;
  }
}

export function gfxKeys() { return [...gfxData.keys()]; }

/* Held-item models (src/models/held.json): one entry per equippable weapon our
   item table defines, keyed by our item id. Loaded once at boot. */
export async function loadHeldModels() {
  try {
    const r = await fetch(bakedURL("src/models/held.json"), { cache: "force-cache" });
    const j = await r.json();
    for (const [k, v] of Object.entries(j.models || {})) heldData.set(k, v);
    return true;
  } catch (e) {
    console.warn("[models3d] held model manifest unavailable", e);
    return false;
  }
}

/* The skillcape emotes' props (src/models/capeprops.json). Same shape and same
   destination as the worn models above - they are wield models merged into the
   body for the length of a cape pose - but a file of their own, because they
   are not equipment and nothing in src/items.js knows them: they are the models
   the cape emote sequences name in their own `weapon`/`shield` fields (see
   src/tools/cache-bake/capeprops-bake-run.mjs). They land in the same map, so
   `setWorn` and the merge treat them exactly like any other worn model; a
   female body falls back to these entries the same way it falls back to the
   male cut of a single-cut item (prepareHeld). Loaded once at boot, beside
   loadHeldModels. */
export async function loadCapeProps() {
  try {
    const r = await fetch(bakedURL("src/models/capeprops.json"), { cache: "force-cache" });
    const j = await r.json();
    for (const [k, v] of Object.entries(j.models || {})) heldData.set(k, v);
    return true;
  } catch (e) {
    console.warn("[models3d] cape prop manifest unavailable", e);
    return false;
  }
}

export function heldKeys() { return [...heldData.keys()]; }

/* Is there a *male* baked worn model for this item id (src/models/held.json)?
   Used to decide whether an item can be drawn in the hand at all: the fishing
   tools have no wield model, so a pose that names one would otherwise leave the
   hand empty, taking the equipped weapon away and putting nothing there. */
export function hasHeldModel(id) { return heldData.has(id); }

export function femaleHeldKeys() { return [...heldDataFemale.keys()]; }

/* Fetch the female cuts, once. Called the first time a female character is
   built, and idempotent - a pending promise is shared, and a second call after
   it lands is a no-op. On arrival every character that was waiting gets
   re-dressed with its own cut (see `femaleWaiters`), so an armour set that was
   drawn with the male model for the fraction of a second before the file landed
   corrects itself without the player doing anything. */
export async function loadHeldModelsFemale() {
  if (heldFemaleLoaded) return true;
  if (heldFemalePending) return heldFemalePending;
  heldFemalePending = (async () => {
    try {
      const r = await fetch(bakedURL("src/models/held-female.json"), { cache: "force-cache" });
      const j = await r.json();
      for (const [k, v] of Object.entries(j.models || {})) heldDataFemale.set(k, v);
      heldFemaleLoaded = true;
    } catch (e) {
      console.warn("[models3d] female held model manifest unavailable", e);
      heldFemalePending = null;
      return false;
    }
    for (const c of [...femaleWaiters]) {
      femaleWaiters.delete(c);
      if (c.setWorn) c.setWorn(c._wornKeys || [], c._wornOpts, true);
    }
    return true;
  })();
  return heldFemalePending;
}

/* ---------------------------------------------------- the cache's textures

   A handful of baked models carry a *texture* on some of their faces instead of
   a palette colour (the fire cape's flame is texture 40, the granite shield 11,
   the lava battlestaves 31, and the farmer's and Fred's cloth is 18 - measured
   across every character, wield model and spell graphic in src/models/, that is
   the whole list). Each one is decoded out of the cache into its own PNG by
   src/tools/cache-bake/chartex.mjs and loaded here once at boot. There is no
   atlas: only a few models use these and each texture is small, so one texture
   per material slot keeps a cape's flame from bleeding into the granite next
   to it.

   `CHAR_TEX_TILES` says how many tiles one repeat of a texture covers. The
   cache stores a per-face coordinate table for textured faces; not decoded
   yet, so a face is projected instead (see buildMesh) and this is the scale
   that projection runs at. One tile per repeat is the same choice
   src/locmodels.js#TEX_TILES makes for scenery, and it is right for the
   granite shield and the lava staves; the fire cape is the one exception, and
   it is measured off the cape's own artwork rather than guessed - rendered
   beside the wiki's own equipped-cape image at the same camera, three quarters
   of a tile a repeat gives the four to five flame bands across the cape's
   width that the real item shows (a whole tile is visibly too coarse and half
   a tile visibly too fine). */
export const CHAR_TEXTURE_URLS = {
  11: "src/sprites/char/tex-11.png",
  18: "src/sprites/char/tex-18.png",
  31: "src/sprites/char/tex-31.png",
  40: "src/sprites/char/tex-40.png",
};
export const CHAR_TEX_TILES = { 11: 1, 18: 1, 31: 1, 40: 0.75 };
/* The textures whose cache def carries the animated-texture flag: the fire
   cape's flame flows, the way the water does. */
export const ANIMATED_CHAR_TEXTURES = new Set([40]);
/* One client cycle of texture animation is 20 ms (see src/tick.js) and the
   client's `animateTexture` shifts every animated texture by the same 2 texels
   a cycle, i.e. 100 texels a second - a full 128-texel repeat every 1.28 s. */
const CHAR_TEX_TEXELS = 128;
const CHAR_TEX_TEXELS_PER_SEC = 100;

const charTextures = new Map();

export function charTexture(id) { return charTextures.get(id) || null; }

export async function loadCharTextures() {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(CHAR_TEXTURE_URLS).map(async ([id, url]) => {
    try {
      const tex = await loader.loadAsync(bakedURL(url));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      /* The face projection runs past one repeat on a sheet bigger than a tile,
         so the texture has to tile rather than clamp. The cache's own image
         rows are uploaded top first (`flipY = false`), the same convention the
         scenery atlas uses, so a projected v reads up the image. */
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.flipY = false;
      charTextures.set(Number(id), tex);
    } catch (e) {
      console.warn("[models3d] texture " + id + " unavailable", e);
    }
  }));
  return charTextures.size;
}

/* The client's animated-texture shift, at the client's own rate and direction
   (src/scene.js does exactly this to the water). One shared texture instance
   feeds every material that samples it, so a single offset moves every fire
   cape on screen in phase - which is what the client's global shift does. */
export function animateCharTextures(dt) {
  if (!charTextures.size) return;
  for (const id of ANIMATED_CHAR_TEXTURES) {
    const t = charTextures.get(id);
    if (!t) continue;
    let off = t.offset.y - (CHAR_TEX_TEXELS_PER_SEC * dt) / CHAR_TEX_TEXELS;
    off -= Math.floor(off);
    t.offset.y = off;
  }
}

/* ---------------------------------------------------------------------------
   Character instance
   --------------------------------------------------------------------------- */

const scratchOffs = { x: 0, y: 0, z: 0 };

function applyTransform(groups, vx, vy, vz, type, map, dx, dy, dz, offs) {
  if (type === 0) {
    let count = 0;
    offs.x = 0; offs.y = 0; offs.z = 0;
    for (let k = 0; k < map.length; k++) {
      const bones = groups[map[k]];
      if (!bones) continue;
      for (let m = 0; m < bones.length; m++) {
        const v = bones[m];
        offs.x += vx[v]; offs.y += vy[v]; offs.z += vz[v];
        count++;
      }
    }
    if (count > 0) {
      offs.x = dx + Math.trunc(offs.x / count);
      offs.y = dy + Math.trunc(offs.y / count);
      offs.z = dz + Math.trunc(offs.z / count);
    } else { offs.x = dx; offs.y = dy; offs.z = dz; }
    return;
  }
  if (type === 1) {
    for (let k = 0; k < map.length; k++) {
      const bones = groups[map[k]];
      if (!bones) continue;
      for (let m = 0; m < bones.length; m++) {
        const v = bones[m];
        vx[v] += dx; vy[v] += dy; vz[v] += dz;
      }
    }
    return;
  }
  if (type === 2) {
    const aX = (dx & 255) * 8, aY = (dy & 255) * 8, aZ = (dz & 255) * 8;
    for (let k = 0; k < map.length; k++) {
      const bones = groups[map[k]];
      if (!bones) continue;
      for (let m = 0; m < bones.length; m++) {
        const v = bones[m];
        vx[v] -= offs.x; vy[v] -= offs.y; vz[v] -= offs.z;
        let s, c, tmp;
        if (aZ !== 0) {
          s = SINE[aZ & 2047]; c = COSINE[aZ & 2047];
          tmp = (s * vy[v] + c * vx[v]) >> 16;
          vy[v] = (c * vy[v] - s * vx[v]) >> 16;
          vx[v] = tmp;
        }
        if (aX !== 0) {
          s = SINE[aX & 2047]; c = COSINE[aX & 2047];
          tmp = (c * vy[v] - s * vz[v]) >> 16;
          vz[v] = (s * vy[v] + c * vz[v]) >> 16;
          vy[v] = tmp;
        }
        if (aY !== 0) {
          s = SINE[aY & 2047]; c = COSINE[aY & 2047];
          tmp = (s * vz[v] + c * vx[v]) >> 16;
          vz[v] = (c * vz[v] - s * vx[v]) >> 16;
          vx[v] = tmp;
        }
        vx[v] += offs.x; vy[v] += offs.y; vz[v] += offs.z;
      }
    }
    return;
  }
  if (type === 3) {
    for (let k = 0; k < map.length; k++) {
      const bones = groups[map[k]];
      if (!bones) continue;
      for (let m = 0; m < bones.length; m++) {
        const v = bones[m];
        vx[v] -= offs.x; vy[v] -= offs.y; vz[v] -= offs.z;
        vx[v] = Math.trunc((dx * vx[v]) / 128);
        vy[v] = Math.trunc((dy * vy[v]) / 128);
        vz[v] = Math.trunc((dz * vz[v]) / 128);
        vx[v] += offs.x; vy[v] += offs.y; vz[v] += offs.z;
      }
    }
  }
}

function makeSkinner(rest, groups, vcount) {
  return function pose(anim, frameIdx, out) {
    skinPose(rest, groups, anim.fm, anim.frames[frameIdx], out);
  };
}

/* Scenery use (src/locmodels.js#advanceLocAnims): the essence-mine portal plays
   its baked stand animation on the CPU - the same per-group origin/translate/
   rotate/scale application character meshes use, factored out so scenery does
   not need the character rig. `rest` is the bake-unit vertex array, `groups`
   the vertex indices per group id, `fm` the parsed {types, groups} framemap. */
export function skinPose(rest, groups, fm, frame, out) {
  const ox = out.x, oy = out.y, oz = out.z;
  const offs = { x: 0, y: 0, z: 0 };
  const vcount = ox.length;
  for (let i = 0, n = vcount * 3; i < n; i += 3) {
    ox[i / 3] = rest[i];
    oy[i / 3] = rest[i + 1];
    oz[i / 3] = rest[i + 2];
  }
  for (let j = 0; j < frame.ids.length; j++) {
    const g = frame.ids[j];
    const map = fm.groups[g];
    if (!map) continue;
    applyTransform(groups, ox, oy, oz, fm.types[g], map, frame.tx[j], frame.ty[j], frame.tz[j], offs);
  }
}

/* The type-5 (alpha) half of the same frame, for scenery (see above):
   `alphaFrameInto` is the client's own per-face alpha application. */
export function alphaPose(base, buckets, fm, frame, out) {
  alphaFrameInto(base, buckets, frame, fm, out);
}

/* One frame's per-face alpha, into `out`: the authored alpha array copied down,
   then every type-5 framemap entry of the frame added to the faces carrying its
   label, clamped at each step exactly as the client's Model.applyTransform does
   (`faceAlphas[face] += x * 8`, then clamp to 0..255). The label grouping is the
   caller's `labelFaces`; a label no face carries is skipped, and so is an entry
   whose delta is zero. `out` is always fully written, so the caller can read the
   result directly. */
function alphaFrameInto(base, labelFaces, frame, fm, out) {
  out.set(base);
  const ids = frame.ids;
  for (let j = 0; j < ids.length; j++) {
    const g = ids[j];
    if (fm.types[g] !== 5) continue;
    const d = frame.tx[j] * 8;
    if (!d) continue;
    const labels = fm.groups[g];
    if (!labels) continue;
    for (let k = 0; k < labels.length; k++) {
      const faces = labelFaces[labels[k]];
      if (!faces) continue;
      for (let m = 0; m < faces.length; m++) {
        const f = faces[m];
        let a = out[f] + d;
        if (a < 0) a = 0; else if (a > 255) a = 255;
        out[f] = a;
      }
    }
  }
}

/* Every face carrying each alpha *label*, grouped by label - the runtime's copy
   of the client's `faceLabelsAlpha`, which it builds from the model's faceSkins
   at decode and which is the set a framemap's type-5 transform moves about.
   Sparse on purpose: a label no face carries is absent, and the labels one
   sequence's framemap names are not necessarily contiguous. The buckets belong
   to the compiled model rather than to a mesh, so both users take the same
   ones: buildMesh (to move the labelled faces of a frame's alpha) and
   `deathSolidFrames` below (to measure the animation's fade). */
function alphaLabelBuckets(m) {
  if (!m.alpha || !m.alphaLabel) return null;
  let maxLabel = 0;
  for (let f = 0; f < m.fcount; f++) if (m.alphaLabel[f] > maxLabel) maxLabel = m.alphaLabel[f];
  const buckets = new Array(maxLabel + 1);
  const counts = new Int32Array(maxLabel + 1);
  for (let f = 0; f < m.fcount; f++) counts[m.alphaLabel[f]]++;
  for (let l = 0; l <= maxLabel; l++) if (counts[l]) buckets[l] = new Int32Array(counts[l]);
  const fill = new Int32Array(maxLabel + 1);
  for (let f = 0; f < m.fcount; f++) { const l = m.alphaLabel[f]; buckets[l][fill[l]++] = f; }
  return buckets;
}

/* A held item's baked model (src/models/held.json) is authored in *body* space
   and shares the body's vertex-group (bone) labels, so it can simply be merged
   into the character model and skinned by the character's own animation frames -
   which is exactly what the real client does (Player.getAnimatedModel merges
   every equipped item's wield model into the player's model before animating). */
/* A worn item's geometry. `sex` picks the **female cut** when the item has one:
   the cache authors a separate female wield model for most armour (568 of our
   575 equippables have one - see tools/cache-bake/held.mjs), and the male cut
   sits wrong on a female body, which is what the user saw. The female file is
   loaded lazily (only a female character needs it) and holds *only* the keys
   whose cut really differs, so an item with a single cut - or a hand-authored
   model like the Armadyl halberd - falls back to the male entry here. */
export function prepareHeld(key, sex) {
  let data = sex === "f" ? heldDataFemale.get(key) : null;
  if (!data) data = heldData.get(key);
  if (!data) return null;
  if (data._raw) return data;
  prepareRaw(data);
  return data;
}

/* The elemental and mind shields' equip pulse (see setWorn): the keys of the
   only items that play it. */
const RING_SHIELD_KEYS = new Set(["elemental_shield", "mind_shield"]);
/* How long the equip pulse runs: under half a second, felt as one beat. */
const SHIELD_PULSE_SEC = 0.45;
/* The superior staff's living flame (see
   src/tools/hand-models/ibans-superior-staff.mjs): the middle prong's three
   band colours - orange-red body, pale core, yellow tip. All three are
   absent from every other baked model and kit palette, so the per-frame
   update below can key on them directly. */
const STAFF_FLAME_COLS = new Set([2998, 7658, 8137]);
/* The ring shields' hit flash: how long the inner disc stays lit after a
   magic blow lands on its wearer - one short beat, the same length as the
   body's own red damage flash, so it reads as a flash and never as a glow. */
const SHIELD_FLASH_SEC = 0.3;
/* What the disc flashes to: a pale warm near-white in the shield's own orange
   hue - light, but not white. Its lightness is the kitchen check-white's
   ((248+233+210)/3 = 230, beside the measured white-cluster p90 of 231), and
   it is converted to linear on first use (see `shieldFlashLin`), because the
   colour buffer it lands in is linear data. */
const SHIELD_FLASH_SRGB = [248, 233, 210];
let shieldFlashLin = null;

/* Which body a baked character model is: "f" for a female one, "m" otherwise.
   An identity-kit body carries its own `kit.gender` (src/identikits.js); the two
   baked defaults are `player_female` / `player_male`. Everything else - NPC
   skins, creatures - is not a player body and has no female cut of its own. */
export function modelGender(data) {
  if (!data) return "m";
  if (data.kit && data.kit.gender === "female") return "f";
  const k = data.key || "";
  return k === "player_female" ? "f" : "m";
}

/* Per-model raw geometry + winding convention, shared by characters and items. */
function prepareRaw(data) {
  const vcount = data.vcount;
  data._rest = i16(data.verts);
  data._faces = u16(data.faces);
  data._colors = u16(data.colors);
  data._groupOf = u8(data.groupOf);
  /* Per-face alpha, in the cache's own convention (0 = opaque, 255 =
     invisible). Only spell graphics carry it. */
  data._alpha = data.faceAlpha ? u8(data.faceAlpha) : null;
  /* Per-face alpha *label* (the client's `faceLabels`/`faceSkins`): the framemap
     entries of type 5 move the alpha of every face carrying the entry's label
     (`faceAlphas[face] += x * 8`, see src/tools/cache-bake/README.md), and this
     is the label each face carries. Only present next to a `faceAlpha`. */
  data._alphaLabel = data.faceLabel ? u8(data.faceLabel) : null;
  /* Per-face body-part id (identity-kit bodies only - see
     tools/cache-bake/bake.mjs#IDENTITY_KITS): which of the seven kit parts each
     face belongs to, so setWorn can drop the part an equipped item replaces. */
  data._partOf = data.partOf ? u8(data.partOf) : null;
  /* Per-face garment level for portrait hat faces (see buildHeadgearHead):
     the entry carries it the same way baked models carry partOf. */
  data._cover = data.cover ? u8(data.cover) : null;
  /* Per-face texture id, -1 for a plain coloured face. Only a handful of baked
     models carry any (see src/tools/cache-bake/chartex.mjs) and they are the
     ones the cache paints with one of its own textures - the fire cape's flame
     is texture 40, the granite shield 11, the lava staves 31, the farmer's
     cloth 18 - instead of a palette colour. A textured face's palette colour is
     the 127 the parser substitutes (see model.mjs), so without this the fire
     cape is a white cape. */
  data._tex = data.texIds ? i16(data.texIds) : null;
  /* Spotanim light settings: a model that has them is lit by the client's own
     spotanim code rather than the generic directional light (see the
     clientLitColour block above). */
  data._light = data.lightAmbient == null ? null
    : { mod: 64 + data.lightAmbient, magMul: 850 + (data.lightContrast || 0) };
  data._flip = computeFlip(data._rest, data._faces, vcount);
  /* The vertical anchor: which model-space y is drawn *at* the entity's own
     spot. A character's model is authored with its origin at the feet (its
     highest raw y is a unit or two off zero - measured across all 119 baked
     characters the largest is 8 of the 128 units in a tile), so both answers
     are the same thing and `footY` (the bake's highest raw y) is the feet.

     A spotanim is not authored that way: its origin is wherever the artist put
     it. Ice Barrage's own model (gfx 369) hangs 512 units *below* its origin
     and pokes 24 above it, so the burst is authored to erupt out of the
     ground the graphic is played on; the god spells' strikes are authored the
     other way up - Claws of Guthix's model (gfx 77) has its origin 146 units
     below its lowest vertex. The client draws every Animable - body or
     graphic - with the model's own origin on the entity's spot, so a spotanim
     is drawn around raw y = 0. Anchoring it by `footY` instead lifted every
     graphic by its own overhang: 1.14 tiles for the Guthix claw, 0.78 for
     Saradomin's strike, and it floated Ice Barrage's 4-tile ice block a whole
     tile clear of the ground. */
  data._anchor = data.gfx != null ? 0 : data.footY;
  data._raw = true;
  return data;
}

/* The per-axis model scale, in three.js units per raw unit. The bake's `scale`
   already carries the spotanim/NPC def's own size factor (def.heightScale/128,
   divided by the 128 units in a tile), and `sx`/`sy`/`sz` carry the spotanim
   def's *width* scale on x/z (`SpotAnim.getModel`'s
   `model.resize(widthScale, heightScale, widthScale)`). For every model whose
   two scales agree - every character, and every graphic but one - this is the
   old uniform `scale` back again; only gfx 77 (Claws of Guthix, widthScale 56
   against heightScale 128) actually narrows. */
function axisScales(data) {
  const s = data.scale;
  const sy = data.sy || 1;
  return {
    x: s * ((data.sx || 1) / sy),
    y: s,
    z: s * ((data.sz || 1) / sy),
  };
}

export function prepareModel(key) {
  const data = modelData.get(key) || gfxData.get(key);
  if (!data) return null;
  if (data._prepared) return data;
  prepareRaw(data);
  data._anims = compileAnims(data.anims);
  data._prepared = true;
  return data;
}

function compileAnims(animsIn) {
  const out = {};
  for (const [name, a] of Object.entries(animsIn || {})) {
    if (!a || !a.frames || !a.frames.length) continue;
    const lengths = a.lengths && a.lengths.length === a.frames.length
      ? a.lengths : a.frames.map(() => 4);
    out[name] = {
      frames: a.frames,
      fm: a.fm,
      lengths,
      totalTicks: lengths.reduce((s, v) => s + v, 0),
      tickOffsets: lengths.reduce((acc, v) => { acc.push((acc[acc.length - 1] || 0) + v); return acc; }, []),
    };
  }
  return out;
}

/* Do the model's triangle normals (from the winding order) point away from the
   model's centroid? Decided once per model so the renderer can use one rule. */
export function computeFlip(rest, faces, vcount) {
  const cx = new Float64Array(3);
  for (let i = 0; i < vcount; i++) { cx[0] += rest[i * 3]; cx[1] += rest[i * 3 + 1]; cx[2] += rest[i * 3 + 2]; }
  cx[0] /= vcount; cx[1] /= vcount; cx[2] /= vcount;
  let vote = 0;
  const fcount = faces.length / 3;
  for (let f = 0; f < fcount; f++) {
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    const e1x = rest[b] - rest[a], e1y = rest[b + 1] - rest[a + 1], e1z = rest[b + 2] - rest[a + 2];
    const e2x = rest[c] - rest[a], e2y = rest[c + 1] - rest[a + 1], e2z = rest[c + 2] - rest[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const fx = (rest[a] + rest[b] + rest[c]) / 3 - cx[0];
    const fy = (rest[a + 1] + rest[b + 1] + rest[c + 1]) / 3 - cx[1];
    const fz = (rest[a + 2] + rest[b + 2] + rest[c + 2]) / 3 - cx[2];
    vote += (nx * fx + ny * fy + nz * fz) > 0 ? 1 : -1;
  }
  return vote < 0;
}

/* ---------------------------------------------------------------------------
   Model merge: character + held item(s) into one model, then the render state
   (palette, face colours, vertex<->bone-group lists) for it.
   --------------------------------------------------------------------------- */

/* The per-face *level* that a worn model's faces carry: one byte per face, all
   `lv`. It is what the garment depth bias is driven from (see COVER_Z_BIAS) -
   a body part is left null (level 0, shifted by nothing), a worn item gets
   level 1, a garment the client paints over *everything* - a cape - gets 2
   (see `drapeKeys` in src/game.js#wornOptsFor), and a neck-slot item, which
   hangs over chest and cape alike, gets 3 (see `topKeys` there).
   Levels rather than a flag
   because not every garment contest is body-vs-garment: a cape's hem grazes a
   *plateleg* just as closely as it grazes a bare kit shin, and two worn models
   sharing one level are shifted by the same amount, which leaves their contest
   exactly as it was. One level apart separates them by COVER_Z_BIAS. */
function allCovered(n, lv) {
  const a = new Uint8Array(n);
  a.fill(lv || 1);
  return a;
}

/* `drop` is a set of face indices to leave out (see coveredBodyFaces); the
   vertices stay, since the merged model's bone groups and the animation are
   keyed on all of them. `cover` is this part's garment level: falsy for a body
   part, 1 for a worn item, 2 for a cape, 3 for a neck-slot item (see allCovered). */
function bodyPart(data, drop, cover) {
  const base = { rest: data._rest, faces: data._faces, colors: data._colors, groupOf: data._groupOf,
    alpha: data._alpha, alphaLabel: data._alphaLabel, light: data._light, tex: data._tex,
    vcount: data.vcount, fcount: data.fcount, maxGroup: data.maxGroup | 0, flip: data._flip,
    cover: cover ? allCovered(data.fcount, cover) : (data._cover ? data._cover.subarray(0, data.fcount) : null) };
  if (!drop || !drop.size) return base;
  const keep = [];
  for (let f = 0; f < data.fcount; f++) if (!drop.has(f)) keep.push(f);
  if (keep.length === data.fcount) return base;
  const n = keep.length;
  const faces = new Uint16Array(n * 3);
  const colors = new Uint16Array(n);
  const alpha = data._alpha ? new Uint8Array(n) : null;
  const alphaLabel = data._alphaLabel ? new Uint8Array(n) : null;
  const tex = data._tex ? new Int16Array(n) : null;
  for (let i = 0; i < n; i++) {
    const f = keep[i];
    faces[i * 3] = data._faces[f * 3];
    faces[i * 3 + 1] = data._faces[f * 3 + 1];
    faces[i * 3 + 2] = data._faces[f * 3 + 2];
    colors[i] = data._colors[f];
    if (alpha) alpha[i] = data._alpha[f];
    if (alphaLabel) alphaLabel[i] = data._alphaLabel[f];
    if (tex) tex[i] = data._tex[f];
  }
  /* a worn part's flag is 1 on every face, so the shortened one is simply the
     same all-ones array at the new count */
  return Object.assign(base, { faces, colors, alpha, alphaLabel, tex, fcount: n,
    cover: cover ? allCovered(n, cover) : null });
}

/* A worn model is authored *over* the body part it covers, not on it: the
   torags platebody's chest plate crosses the torso's own triangles (11 of the
   torso's 476 faces have plate within a unit of them, another 8 within two),
   and its sleeve is a shell whose wall runs 2-7 units clear of the arm inside
   it. The client never draws both, because a worn model *replaces* a whole body
   part (Player.getAnimatedModel puts either the identity kit or the item into
   each appearance slot) - but our worn models are not whole body parts (a
   platebody leaves the forearm showing, a chainbody has no collar), so the
   renderer has to work out per face what the client got for free.

   Two questions decide it, both asked along the body face's outward normal n:

     1. Is armour *ahead* of this face? Then the face is inside the armour - an
        arm up a sleeve, the beard behind a full helm's visor - and the client
        would have replaced it, so it goes. The reach is generous (COVER_REACH)
        because this is a question about containment, not distance: the sleeve
        is up to seven units wider than the arm it hides.

     2. Is armour *in the same place*? Surfaces that cross or coincide cannot be
        ordered by the depth buffer at all - the winner flips from pixel to
        pixel, which is the flicker the shirt, the trousers and the beard were
        showing through the armour - so a face with worn geometry within
        COVER_TIE of it, on either side, goes too.

   Nothing else is dropped, and in particular a face *at* an opening keeps its
   place. The sleeve and the helm are open at the wrist, the armpit and the
   face, and the arm is what shows through those openings (the client draws the
   whole arm kit over the plate - it is a later appearance slot than the body).
   A test that merely asks "is armour nearby" gets that wrong and eats into the
   openings: on the full outfit a symmetric 1.5-unit threshold took the visible
   forearm from 174 px to 45 and left 30 px of see-through background behind it,
   and no threshold fixes it - 45 px at 1.5, 29 at 4, 28 at 6, and holes the
   whole way. The one-sided test leaves 22 px of arm showing through the sleeve
   openings and 16 px of holes, which is the client's own picture. */
const COVER_TIE = 0.25;
const COVER_REACH = 10;

/* The worn triangles go into a coarse grid first, so each body face only tests
   the handful of them nearby - a full platebody + legs + helm is ~1500
   triangles and a brute force pass over the 476 body faces would be ~700k
   ray-triangle tests on every equipment change. */
const COVER_CELL = 24;

/* The half-width of a cape's bell at height y: the widest |x| of its rest
   vertices within a wide band (see the note inside), falling back to the
   global widest. The cape-under drop uses it to tell a back panel (inside
   the bell, hidden behind the cloth from every outside angle) from a flared
   skirt side (outside the bell, legitimately visible beside the cape - see
   setWorn). */
/* Debug probe for the cape-under drop (see setWorn): which faces of an
   under-item the cape would remove, and why each kept face survives. For
   page_eval diagnosis only - returns plain data. */
export function capeDropInfo(underId, capeId, sex) {
  const under = prepareHeld(underId, sex);
  const cape = prepareHeld(capeId, sex);
  if (!under || !cape) return null;
  const bellHalf = capeBellHalf([cape]);
  const r = under._rest, faces = under._faces;
  const kept = [];
  const dropped = [];
  let droppedAhead = 0, droppedTie = 0, droppedBehind = 0;
  const cr = cape._rest, cf = cape._faces;
  const tri = new Float32Array(cape.fcount * 9);
  for (let i = 0, n = cape.fcount; i < n; i++) {
    const a = cf[i * 3] * 3, b = cf[i * 3 + 1] * 3, c = cf[i * 3 + 2] * 3;
    tri.set([cr[a], cr[a + 1], cr[a + 2], cr[b], cr[b + 1], cr[b + 2], cr[c], cr[c + 1], cr[c + 2]], i * 9);
  }
  const segHits = (cx, cy, cz, dx, dy, dz, t0, t1) => {
    let best = Infinity;
    for (let o = 0; o < tri.length; o += 9) {
      const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
      const e1x = tri[o + 3] - ax, e1y = tri[o + 4] - ay, e1z = tri[o + 5] - az;
      const e2x = tri[o + 6] - ax, e2y = tri[o + 7] - ay, e2z = tri[o + 8] - az;
      const ox = cx + dx * t0, oy = cy + dy * t0, oz = cz + dz * t0;
      const rx = dx * (t1 - t0), ry = dy * (t1 - t0), rz = dz * (t1 - t0);
      const px = ry * e2z - rz * e2y, py = rz * e2x - rx * e2z, pz = rx * e2y - ry * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (rx * qx + ry * qy + rz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t < 0 || t > 1) continue;
      const dist = t0 + t * (t1 - t0);
      if (dist < best) best = dist;
    }
    return best;
  };
  for (let f = 0; f < under.fcount; f++) {
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    const cx = (r[a] + r[b] + r[c]) / 3, cy = (r[a + 1] + r[b + 1] + r[c + 1]) / 3, cz = (r[a + 2] + r[b + 2] + r[c + 2]) / 3;
    const e1x = r[b] - r[a], e1y = r[b + 1] - r[a + 1], e1z = r[b + 2] - r[a + 2];
    const e2x = r[c] - r[a], e2y = r[c + 1] - r[a + 1], e2z = r[c + 2] - r[a + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    if (under._flip) { nx = -nx; ny = -ny; nz = -nz; }
    const tie = segHits(cx, cy, cz, nx, ny, nz, -COVER_TIE, COVER_TIE);
    if (tie !== Infinity) {
      droppedTie++;
      dropped.push({ c: [Math.round(cx), Math.round(cy), Math.round(cz)],
        n: [Math.round(nx * 100) / 100, Math.round(ny * 100) / 100, Math.round(nz * 100) / 100], reason: "tie", at: Math.round(tie * 100) / 100 });
      continue;
    }
    /* Same front-face guard as coveredBodyFaces: a panel looking at the
       camera is never the cape's to take, whatever its straps cross. Front
       is rest -z (see coveredBodyFaces). The neck column shares the
       exemption (see NECK_KEEP_HALF/NECK_KEEP_Y) - kept in step with the
       real pass above, except for the per-garment plug gate (see
       NECK_PLUG_FRAC): this probe has no kit body to read it from, so it
       reports the blanket rule and capeDropReal does too. */
    const probeNeckKeep = Math.abs(cx) < NECK_KEEP_HALF && cy < NECK_KEEP_Y;
    if (!probeNeckKeep && nz >= -BACKFACE_Z) {
      const ahead = segHits(cx, cy, cz, nx, ny, nz, 0.02, COVER_REACH);
      if (ahead !== Infinity) {
        droppedAhead++;
        dropped.push({ c: [Math.round(cx), Math.round(cy), Math.round(cz)],
          n: [Math.round(nx * 100) / 100, Math.round(ny * 100) / 100, Math.round(nz * 100) / 100], reason: "ahead", at: Math.round(ahead * 100) / 100 });
        continue;
      }
    }
    const capeR = cape._rest;
    let hemY = -Infinity;
    for (let i = 1; i < capeR.length; i += 3) if (capeR[i] > hemY) hemY = capeR[i];
    const bell = bellHalf(cy);
    if (!probeNeckKeep && nz > BACKFACE_Z && cy < hemY - CAPE_HEM_MARGIN && Math.abs(cx) < bell - CAPE_BELL_MARGIN) {
      droppedBehind++;
      dropped.push({ c: [Math.round(cx), Math.round(cy), Math.round(cz)],
        n: [Math.round(nx * 100) / 100, Math.round(ny * 100) / 100, Math.round(nz * 100) / 100], reason: "behind" });
      continue;
    }
    kept.push({ c: [Math.round(cx), Math.round(cy), Math.round(cz)],
      n: [Math.round(nx * 100) / 100, Math.round(ny * 100) / 100, Math.round(nz * 100) / 100],
      bell: Math.round(bell), hemY: Math.round(hemY),
      why: nz <= BACKFACE_Z ? "side" : (cy >= hemY - CAPE_HEM_MARGIN ? "belowHem" : "outsideBell") });
  }
  kept.sort((p, q) => p.c[1] - q.c[1]);
  return { total: under.fcount, droppedAhead, droppedTie, droppedBehind, kept, keptCount: kept.length, dropped };
}

/* Debug probe calling the REAL coveredBodyFaces exactly as setWorn does (see
   setWorn): same capeCover, same bellHalf closure, same hemY construction.
   For page_eval diagnosis only - returns the raw drop indices. */
export function capeDropReal(underId, capeId, sex) {
  const under = prepareHeld(underId, sex);
  const cape = prepareHeld(capeId, sex);
  if (!under || !cape) return null;
  const capeCover = [cape];
  const capeBell = capeBellHalf(capeCover);
  let capeHem = -Infinity;
  const r = cape._rest;
  for (let i = 1; i < r.length; i += 3) if (r[i] > capeHem) capeHem = r[i];
  const drop = coveredBodyFaces(under, capeCover, null,
    { backDrop: { hemY: capeHem, bellHalf: capeBell } });
  return { total: under.fcount, dropped: [...drop] };
}

export function capeBellHalf(capeDatas) {
  const pts = [];
  for (const w of capeDatas) {
    if (!w._rest) continue;
    const r = w._rest;
    for (let i = 0; i < r.length; i += 3) pts.push([r[i + 1], Math.abs(r[i])]);
  }
  let glob = 0;
  for (const p of pts) if (p[1] > glob) glob = p[1];
  return (y) => {
    /* Wide band: the cape's back is a couple of huge flat triangles, so a
       narrow slice can hold two vertices and read narrow where the cloth is
       wide (measured: attack cape reads 19 wide at y -156, 30+ on both
       sides). The bell is vertically smooth, so a wide slice is safe. */
    let m = -1;
    for (const p of pts) if (Math.abs(p[0] - y) <= 25 && p[1] > m) m = p[1];
    return m < 0 ? glob : m;
  };
}

/* How far behind a top/bottom face the cape-under pass looks for the cloth
   (see coveredBodyFaces): the cloth hangs a few units behind the back panels
   it covers, and the cape's own side wall sits just inside a flared tail -
   so the reach matches the ahead reach above. */
const CAPE_BEHIND_REACH = 10;

/* How far a face's normal may tilt off straight-back and still count as a back
   panel for the cape-under drop (see coveredBodyFaces). Rest +z is the
   character's back (the mesh transform maps rest (x,y,z) to (x,footY-y,-z),
   and the face the front doll camera sees is the rest -z side, with the
   cape's own bulk hanging at rest +z behind it) - so +0.25 keeps the
   straight-down hem rim (the underside still draws) while taking every panel
   a rear or oblique camera could see through the cloth. */
const BACKFACE_Z = 0.25;

/* A back panel below the cape's hem shows legitimately under it, so the
   cape-under drop stops this far above the hem's lowest rest vertex. */
const CAPE_HEM_MARGIN = 6;

/* A face counts as inside the bell only this far in from the cloth's edge:
   closer than that and it may be the flare showing beside the cape, which
   must stay. */
const CAPE_BELL_MARGIN = 4;

/* The neck column the cape-under pass must never take (see coveredBodyFaces):
   the shell's top opening sits between the shoulder straps, and the oblique
   sightlines through it reach the collar and neck-back panels without ever
   crossing cloth - so the ahead ray (cloth genuinely 1-3 units behind them)
   and the bell rule (orientation only) both delete faces no cloth covers from
   the side. The plate's own collar has already taken the body's neck behind
   them, so deleting the collar too opens a hole straight into the hollow
   torso (the user's "cape opens a gap in the back of the torso", measured at
   the neck with plate + attack cape). The strap coincidences are still the
   tie test's to take, which runs first and is not exempted. Units are the
   under-model's rest units: the column is shoulders-wide and starts above
   the shoulder line. */
const NECK_KEEP_HALF = 12;
const NECK_KEEP_Y = -145;
/* The neck column is only kept when the garment's own funnel needs plugging:
   the fraction of the garment's neck-column faces with kept kit body mass
   directly behind them (an 8-unit box reaching 30 back and 6 forward). A tall
   rigid collar leaves the funnel hollow - measured plugged fractions plate
   .84 and mystic .87 - while a loose robe back is backed by the body it hangs
   off - chain .59, fighter .50, void .47, dagonhai .33. Below the line the
   old behaviour holds (the cape covers cleanly); above it the column survives
   (otherwise the funnel opens into the hollow torso at oblique angles). */
const NECK_PLUG_FRAC = 0.7;

export function coveredBodyFaces(data, worn, onlyParts, opts) {
  const drop = new Set();
  const tri = [];
  for (const w of worn) {
    if (!w._rest || !w._faces) continue;
    const r = w._rest, f = w._faces;
    for (let i = 0, n = w.fcount; i < n; i++) {
      const a = f[i * 3] * 3, b = f[i * 3 + 1] * 3, c = f[i * 3 + 2] * 3;
      tri.push(r[a], r[a + 1], r[a + 2], r[b], r[b + 1], r[b + 2], r[c], r[c + 1], r[c + 2]);
    }
  }
  const tn = tri.length / 9;
  if (!tn) return drop;
  const cells = new Map();
  for (let i = 0; i < tn; i++) {
    const o = i * 9;
    const ix0 = Math.floor(Math.min(tri[o], tri[o + 3], tri[o + 6]) / COVER_CELL);
    const ix1 = Math.floor(Math.max(tri[o], tri[o + 3], tri[o + 6]) / COVER_CELL);
    const iy0 = Math.floor(Math.min(tri[o + 1], tri[o + 4], tri[o + 7]) / COVER_CELL);
    const iy1 = Math.floor(Math.max(tri[o + 1], tri[o + 4], tri[o + 7]) / COVER_CELL);
    const iz0 = Math.floor(Math.min(tri[o + 2], tri[o + 5], tri[o + 8]) / COVER_CELL);
    const iz1 = Math.floor(Math.max(tri[o + 2], tri[o + 5], tri[o + 8]) / COVER_CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = (ix + 64) * 16384 + (iy + 64) * 128 + (iz + 64);
          const list = cells.get(k);
          if (list) list.push(i); else cells.set(k, [i]);
        }
      }
    }
  }
  const rest = data._rest, faces = data._faces;
  const stamp = new Int32Array(tn);
  let query = 0;
  /* Does the segment `centroid + n*t0 .. centroid + n*t1` (n a unit vector)
     meet the worn triangles? t0 = -t1 is "is there armour in the same place",
     t0 = 0..t1 = COVER_REACH is "is there armour in front of me". */
  const hit = (cx, cy, cz, dx, dy, dz, t0, t1) => {
    query++;
    const ox = cx + dx * t0, oy = cy + dy * t0, oz = cz + dz * t0;
    const rx = dx * (t1 - t0), ry = dy * (t1 - t0), rz = dz * (t1 - t0);
    const ix0 = Math.floor(Math.min(ox, ox + rx) / COVER_CELL);
    const ix1 = Math.floor(Math.max(ox, ox + rx) / COVER_CELL);
    const iy0 = Math.floor(Math.min(oy, oy + ry) / COVER_CELL);
    const iy1 = Math.floor(Math.max(oy, oy + ry) / COVER_CELL);
    const iz0 = Math.floor(Math.min(oz, oz + rz) / COVER_CELL);
    const iz1 = Math.floor(Math.max(oz, oz + rz) / COVER_CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = cells.get((ix + 64) * 16384 + (iy + 64) * 128 + (iz + 64));
          if (!list) continue;
          for (const i of list) {
            if (stamp[i] === query) continue;
            stamp[i] = query;
            const o = i * 9;
            const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
            const e1x = tri[o + 3] - ax, e1y = tri[o + 4] - ay, e1z = tri[o + 5] - az;
            const e2x = tri[o + 6] - ax, e2y = tri[o + 7] - ay, e2z = tri[o + 8] - az;
            /* Möller-Trumbore, two-sided: a face is a hit whichever way the
               armour's triangle is wound (the two models disagree). A ray
               nearly parallel to the triangle divides by a near-zero
               determinant, and the resulting u/v/t are noise that lands in
               range half the time - so grazes are misses, exactly as the
               cape-under probe reads it (see capeDropInfo). Without this the
               fire cape's rest cloth, which hangs straight down through the
               torso while the posed cloth drapes behind it, "ties" with 65
               chest faces it never touches and the whole torso goes. */
            const px = ry * e2z - rz * e2y, py = rz * e2x - rx * e2z, pz = rx * e2y - ry * e2x;
            const det = e1x * px + e1y * py + e1z * pz;
            if (Math.abs(det) < 1e-12) continue;
            const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
            const u = (tx * px + ty * py + tz * pz) * inv;
            if (u < 0 || u > 1) continue;
            const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
            const v = (rx * qx + ry * qy + rz * qz) * inv;
            if (v < 0 || u + v > 1) continue;
            const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
            if (t < 0 || t > 1) continue;
            return true;
          }
        }
      }
    }
    return false;
  };
  for (let f = 0; f < data.fcount; f++) {
    if (onlyParts && (!data._partOf || !onlyParts.has(data._partOf[f]))) continue;
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    const cx = (rest[a] + rest[b] + rest[c]) / 3;
    const cy = (rest[a + 1] + rest[b + 1] + rest[c + 1]) / 3;
    const cz = (rest[a + 2] + rest[b + 2] + rest[c + 2]) / 3;
    /* a degenerate face has no normal to ask along, so it has no answer; the
       winding normal is only the outward one when the model's own convention
       says so (the same correction the per-frame lighting makes) */
    const e1x = rest[b] - rest[a], e1y = rest[b + 1] - rest[a + 1], e1z = rest[b + 2] - rest[a + 2];
    const e2x = rest[c] - rest[a], e2y = rest[c + 1] - rest[a + 1], e2z = rest[c + 2] - rest[a + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-6) continue;
    nx /= L; ny /= L; nz /= L;
    if (data._flip) { nx = -nx; ny = -ny; nz = -nz; }
    const capePass = !!(opts && opts.backDrop);
    /* The neck column (see NECK_KEEP_HALF/NECK_KEEP_Y): exempt from the ray and
       the bell rule, never from the tie test above - but only when the
       garment's funnel is hollow (see NECK_PLUG_FRAC, opts.neckKeep, setWorn).
       Callers without an opinion get the old blanket exemption. */
    const neckKeep = capePass && opts.neckKeep !== false && Math.abs(cx) < NECK_KEEP_HALF && cy < NECK_KEEP_Y;
    /* A clearly front-facing panel is never hidden by a cape: from the front
       the cloth sits behind it (depth and the cape's own backface culling do
       the covering where its front straps genuinely cross), and from behind
       the panel culls itself. Front is rest -z (the mesh maps rest (x,y,z) to
       (x,footY-y,-z), so the face the front camera sees is the rest -z side
       and the cape hangs at rest +z behind it). The ahead ray still hits
       there - the cape's shoulder straps hang in front of the upper thighs -
       and dropping those faces punches a hole the straps' own culled backsides
       cannot fill (measured: dragon platelegs lost 36 of 67 front faces, black
       patch on the thigh). Sideways wrap walls and back panels keep the ray.
       (2026-09-30: both facing tests were backwards - the guard immunised the
       character's back while the bell rule below dropped its chest and thigh
       fronts, the user's "fire cape is culling torso and d platelegs".) */
    if (hit(cx, cy, cz, nx, ny, nz, -COVER_TIE, COVER_TIE)
      || (!neckKeep && (!capePass || nz >= -BACKFACE_Z) && hit(cx, cy, cz, nx, ny, nz, 0.02, COVER_REACH))) drop.add(f);
    /* The cape-under extras (see setWorn): a back panel faces away from the
       cloth behind it, so neither test above can see it. Two shapes hide
       from the rays in different ways and each gets its own catch. (1) A
       wrap-around wall (3rd-age mage top's tail flare): its normal points
       sideways, but the cape's own side wall is right inside it - look
       behind the face, inside the bell only. (2) A flared bell (3rd-age mage
       robe): the panel's normal points down-out past the hem opening, so no
       ray along it ever meets the cloth - but a back-facing panel inside the
       bell above the hem is hidden behind the cloth from every outside angle
       the game draws, exactly as the client's own priority bands paint it,
       so it goes by orientation, no ray. Back is rest +z (see above). */
    else if (!neckKeep && opts && opts.backDrop && Math.abs(cx) < opts.backDrop.bellHalf(cy) - CAPE_BELL_MARGIN
      && (hit(cx, cy, cz, -nx, -ny, -nz, 0.02, CAPE_BEHIND_REACH)
        || (nz > BACKFACE_Z && cy < opts.backDrop.hemY - CAPE_HEM_MARGIN))) drop.add(f);
  }
  return drop;
}

/* REMOVED 2026-09-30: coveredCapeFaces, the reverse cape-under drop. It tested
   rest positions, but the overlap it was built for exists only in the posed
   mesh, so it dropped nothing - and the cloth was winning those pixels by
   depth, because the cape-under pass's facing tests were backwards and had
   deleted the armour in front of it (see coveredBodyFaces). Flipping the
   facing was the true fix. */

/* The body faces belonging to the parts an equipped item replaces (see
   items.js#EQUIP_BODY_PART). The client does exactly this: the appearance slot
   holds either the identity kit or the worn model, so a platebody means there is
   no torso kit in the model at all. Only an identity-kit body carries the
   per-face part ids; on an NPC skin the set comes back empty and the armour is
   simply merged over it, as it always was. */
export function replacedBodyFaces(data, parts) {
  const drop = new Set();
  const partOf = data._partOf;
  if (!parts || !parts.length || !partOf) return drop;
  const want = new Set(parts);
  for (let f = 0; f < data.fcount; f++) if (want.has(partOf[f])) drop.add(f);
  return drop;
}

/* The identity-kit part indices an equipped head item replaces. The scheme is
   the one models/player_*.json#partOf speaks - 0-6 in partKits order, see
   items.js#EQUIP_BODY_PART - where 0 is the head (hair included: the cache
   bakes the hair into the head part) and 1 the beard. */
const HEAD_PART = 0;
const JAW_PART = 1;
/* The arms slot - the fourth entry of identikits.js#BODY_PARTS (head, jaw,
   torso, arms, hands, legs, feet). A body-slot item whose worn model carries a
   second model takes this part over the same way a head item takes the head:
   see the `bodyKey` test in setWorn and held.mjs#bakeItemModel#secondary. */
const ARMS_PART = 3;
const HEAD_PARTS = new Set([HEAD_PART, JAW_PART]);
export const STRIPPED_HELM_HAIR = new Set([6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193, 4886]);
export const HELM_EYE_BODY_Y = -183;

/* Does a head item's worn model carry the character's own head? In the cache a
   head item sits in the same appearance slot as the head part, and every head
   model that is meant to show a face carries that face *itself*: the open
   helms, the coifs, the hoods and the big hats all paint their own skin and
   hair faces with the same palette indices the identity kit's head uses
   (4550 is the skin tone - 125 of the male kit's 141 head/beard faces - and
   6798 the hair). So the test is data-driven rather than a name list: how much
   of the item's model is painted in the character's own head colours?

   The two thresholds keep that honest. A colour only counts as one of the
   character's head colours if it covers at least a twentieth of the kit's
   head faces (the kit's remaining four faces are colour 0, the blank that
   turns up in every model in the cache, so colour 0 is ignored - otherwise a
   closed helm's eight black face-plate faces would read as a face). And the
   item must use those colours on at least a fifth of its own faces. Measured
   across all 40 head items in the cache the two groups do not come close:
   the items that carry a face sit at 0.30-0.75, and everything that does not
   at 0.00-0.03. */
const KIT_HEAD_COLOUR_SHARE = 0.05;
const HEAD_COLOUR_SHARE = 0.2;

export function itemSuppliesHead(data, hd) {
  if (!hd || !hd._colors || !data._partOf || !data._colors) return false;
  const counts = new Map();
  let total = 0;
  for (let f = 0; f < data.fcount; f++) {
    const p = data._partOf[f];
    if (p !== HEAD_PART && p !== JAW_PART) continue;
    total++;
    const c = data._colors[f];
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  if (!total) return false;
  const own = new Set();
  for (const [c, n] of counts) if (n / total >= KIT_HEAD_COLOUR_SHARE) own.add(c);
  let shared = 0;
  for (let f = 0; f < hd.fcount; f++) if (own.has(hd._colors[f])) shared++;
  return shared / hd.fcount >= HEAD_COLOUR_SHARE;
}

/* How much of the head a head item's model must enclose to be read as a closed
   helm rather than a hat, for the items whose model carries no face (see
   itemSuppliesHead). Measured over all 40 head items in the cache: the closed
   helms and the closed barrows helms - the only members of that group at this
   point - sit at 0.52-0.94 (guthans_helm is the lowest, at 0.52), while the
   three mystic hats come back at 0.22-0.36 and the splitbark helm at 0.29-0.34.
   Nothing lands in between, so this only has to be somewhere in the gap. */
export const HEAD_ENCLOSE_RATIO = 0.45;

/* Fraction of the kit's head + beard faces that a head item's worn *geometry*
   encloses, using the same outward-normal test `coveredBodyFaces` uses on the
   body. A closed helm wraps the whole skull and comes back near 1; a hat that
   sits on top of the head - the mystic hat, the splitbark helm - leaves the
   face, chin and underside of the skull open, so it comes back around a third
   and the kit's head is kept under it. This is what separates the two kinds of
   item whose model carries no face of its own. */
export function headEnclosure(data, hd) {
  if (!data._partOf || !hd) return 0;
  let total = 0, covered = 0;
  const drop = coveredBodyFaces(data, [hd], HEAD_PARTS);
  for (let f = 0; f < data.fcount; f++) {
    const p = data._partOf[f];
    if (p !== HEAD_PART && p !== JAW_PART) continue;
    total++;
    if (drop.has(f)) covered++;
  }
  return total ? covered / total : 0;
}

export function shellCrossingFaces(kitRest, kitFaces, kitFcount, helmRest, helmFaces, helmFcount, isCandidate, wantInside) {
  const out = new Set();
  if (!kitRest || !kitFaces || !helmRest || !helmFaces || !kitFcount || !helmFcount) return out;
  const rayCount = (px, py, pz, s) => {
    let n = 0;
    for (let i = 0; i < helmFcount; i++) {
      const a = helmFaces[i * 3] * 3, b = helmFaces[i * 3 + 1] * 3, c = helmFaces[i * 3 + 2] * 3;
      const ax = helmRest[a], ay = helmRest[a + 1], az = helmRest[a + 2];
      const e1x = helmRest[b] - ax, e1y = helmRest[b + 1] - ay, e1z = helmRest[b + 2] - az;
      const e2x = helmRest[c] - ax, e2y = helmRest[c + 1] - ay, e2z = helmRest[c + 2] - az;
      const pvy = -s * e2z, pvz = s * e2y;
      const det = e1y * pvy + e1z * pvz;
      if (det > -1e-9 && det < 1e-9) continue;
      const tvx = px - ax, tvy = py - ay, tvz = pz - az;
      const u = (tvy * pvy + tvz * pvz) / det;
      if (u < 0 || u > 1) continue;
      const qvx = tvy * e1z - tvz * e1y, qvy = tvz * e1x - tvx * e1z, qvz = tvx * e1y - tvy * e1x;
      const v = (s * qvx) / det;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qvx + e2y * qvy + e2z * qvz) / det;
      if (t > 1e-9) n++;
    }
    return n;
  };
  const memo = new Int8Array(kitRest.length / 3);
  const inside = (vi) => {
    if (memo[vi] !== 0) return memo[vi] === 1;
    const px = kitRest[vi * 3], py = kitRest[vi * 3 + 1], pz = kitRest[vi * 3 + 2];
    const r = ((rayCount(px, py, pz, 1) & 1) === 1) && ((rayCount(px, py, pz, -1) & 1) === 1);
    memo[vi] = r ? 1 : 2;
    return r;
  };
  for (let f = 0; f < kitFcount; f++) {
    if (!isCandidate(f)) continue;
    const n = (inside(kitFaces[f * 3]) ? 1 : 0) + (inside(kitFaces[f * 3 + 1]) ? 1 : 0) + (inside(kitFaces[f * 3 + 2]) ? 1 : 0);
    /* wantInside is the true clip: faces fully buried in the shell go with
       the crossing ones, so the hat cuts the hair instead of sitting in it. */
    if (n === 1 || n === 2 || (wantInside && n === 3)) out.add(f);
  }
  return out;
}

function compileCharacter(parts, anims, scale, footY, axis, doubleSided) {
  let vcount = 0, fcount = 0, maxGroup = -1;
  for (const p of parts) {
    vcount += p.vcount; fcount += p.fcount;
    if (p.maxGroup > maxGroup) maxGroup = p.maxGroup;
  }
  const flip = parts[0].flip;
  const rest = new Int16Array(vcount * 3);
  const faces = new Uint16Array(fcount * 3);
  const colors = new Uint16Array(fcount);
  const groupOf = new Uint8Array(vcount);
  /* per-face alpha, merged the same way colours are; all-zero (the common case)
     collapses back to null so opaque models take the cheap path */
  const alpha = new Uint8Array(fcount);
  let alphaUsed = false;
  /* per-face alpha label, merged the same way; only meaningful when an alpha
     array is present (see prepareRaw) */
  const alphaLabel = new Uint8Array(fcount);
  let alphaLabelUsed = false;
  /* per-face texture id, merged the same way; all -1 (the common case)
     collapses to null so a plain model allocates no uv attribute at all */
  const tex = new Int16Array(fcount);
  let texUsed = false;
  /* per-face *worn* flag, merged the same way (a worn item's faces are all 1,
     the body's all 0); all-zero collapses to null so a plain model allocates no
     cover attribute and gets no garment depth bias (see COVER_Z_BIAS) */
  const cover = new Uint8Array(fcount);
  let coverUsed = false;
  let light = null;
  let vo = 0, fo = 0;
  for (const p of parts) {
    rest.set(p.rest, vo * 3);
    colors.set(p.colors, fo);
    groupOf.set(p.groupOf, vo);
    if (p.light) light = p.light;
    if (p.alpha) {
      alpha.set(p.alpha.subarray(0, p.fcount), fo);
      for (let i = fo; i < fo + p.fcount; i++) if (alpha[i] !== 0) { alphaUsed = true; break; }
    }
    if (p.alphaLabel && p.alpha) {
      alphaLabel.set(p.alphaLabel.subarray(0, p.fcount), fo);
      for (let i = fo; i < fo + p.fcount; i++) if (alphaLabel[i] !== 0) { alphaLabelUsed = true; break; }
    }
    if (p.tex) {
      tex.set(p.tex.subarray(0, p.fcount), fo);
      for (let i = fo; i < fo + p.fcount; i++) if (tex[i] >= 0) { texUsed = true; break; }
    } else {
      tex.fill(-1, fo, fo + p.fcount);
    }
    if (p.cover) {
      cover.set(p.cover.subarray(0, p.fcount), fo);
      for (let i = fo; i < fo + p.fcount; i++) if (cover[i]) { coverUsed = true; break; }
    }
    const base = fo * 3;
    for (let i = 0, n = p.fcount * 3; i < n; i++) faces[base + i] = p.faces[i] + vo;
    /* parts merged from separate model files can disagree on winding - make the
       whole model follow the body's convention so the lighting is consistent */
    if (p.flip !== flip) {
      for (let i = 0; i < p.fcount; i++) {
        const o = (fo + i) * 3;
        const t = faces[o]; faces[o] = faces[o + 1]; faces[o + 1] = t;
      }
    }
    vo += p.vcount; fo += p.fcount;
  }

  /* bone label -> the vertices it drives (held items keep the body's labels).

     A mesh with no skeleton at all - a missile, say, whose model archive has no
     group table - declares a `maxGroup` of -1 while every one of its vertices
     carries the default label 0. There is no bone to drive it, so the labels
     mean nothing, but they still have to *resolve*: the array is built from the
     declared maximum, so -1 built an empty one and the very first
     `groups[0].push(i)` threw. Lifting the maximum to at least 0 gives such a
     mesh one catch-all group that no animation ever moves, which is exactly
     what a static model should have. */
  if (maxGroup < 0) maxGroup = 0;
  const groups = new Array(maxGroup + 1);
  for (let g = 0; g <= maxGroup; g++) groups[g] = [];
  for (let i = 0; i < vcount; i++) groups[groupOf[i]].push(i);
  const groupLists = groups.map((g) => Int32Array.from(g));

  /* per-face palette: distinct HSL values x light levels */
  const hslIndex = new Map();
  const faceHslIdx = new Uint16Array(fcount);
  const palettes = [];
  for (let f = 0; f < fcount; f++) {
    const hsl = colors[f];
    let idx = hslIndex.get(hsl);
    if (idx === undefined) {
      idx = palettes.length;
      hslIndex.set(hsl, idx);
      const entry = new Float32Array(LIGHT_LEVELS * 3);
      for (let l = 0; l < LIGHT_LEVELS; l++) {
        const t = l / (LIGHT_LEVELS - 1);
        const rgb = hslToRgb(hsl, 0.58 + t * 0.44);
        entry[l * 3] = lin(rgb[0]);
        entry[l * 3 + 1] = lin(rgb[1]);
        entry[l * 3 + 2] = lin(rgb[2]);
      }
      palettes.push(entry);
    }
    faceHslIdx[f] = idx;
  }

  const compiled = {
    vcount, fcount, rest, faces, colors, groups: groupLists, maxGroup,
    palettes, faceHslIdx, flip, scale, footY, anims,
    /* per-axis units-per-raw-unit (see `axisScales`) - equal to `scale` on all
       three axes for everything but the one widened/narrowed graphic */
    scaleX: axis ? axis.x : scale,
    scaleY: axis ? axis.y : scale,
    scaleZ: axis ? axis.z : scale,
    doubleSided: !!doubleSided,
    /* Per-face alpha, kept when EITHER the base array carries a value or the
       model has alpha *labels* for the frames to drive.

       The second half is the fix for the teleport swirl (the user's report,
       2026-09-22: *"you did NOT fix the teleport animation still … it has an
       ALPHA, LOOK IT UP"*). The cache authors the swirl's transparency
       entirely in its ANIMATION - spotanim 111's model (3091) carries labels
       0/1/2 and no base transparencies at all - so `alphaUsed` was false and
       the array was collapsed to null, which meant no 4-component colour
       attribute, which meant `hasAlpha` was false in buildMesh and the whole
       frame-driven alpha path (alphaFrameInto, the `alphaFaces` buckets, the
       per-frame `ca` write) was never reached: the swirl drew as an opaque
       lump around the caster. An all-zero base array with labels is not an
       opaque model, it is a model whose every face starts opaque and whose
       frames then move the labelled ones - which is the same thing the cache's
       own zero-filled `faceAlphas` allocation means (see
       src/tools/cache-bake/composite.mjs and bake.mjs's `alphaMoves`). */
    alpha: (alphaUsed || alphaLabelUsed) ? alpha : null,
    alphaLabel: ((alphaUsed || alphaLabelUsed) && alphaLabelUsed) ? alphaLabel : null,
    /* Does the model itself *author* a see-through face? An alpha array can be
       present for two quite different reasons (see the note above): the model
       paints some of its faces translucent (a spell burst's glow, a Barrows
       brother's skirt), or it authors none at all and merely carries the
       *labels* its sequences move - every creature in the cache is the second
       kind, because the death sequence fades the body out (`death`'s type-5
       transforms; the player's are the skillcape emotes' own fade). Only the
       first kind is translucent; the second is an opaque body whose alpha
       happens to be animated, and the renderer treats the two differently (see
       buildMesh's `opaqueFaces`). */
    authoredAlpha: alphaUsed,
    /* How much of the model is *visibly* see-through: the share of its faces
       the cache authored more than a hair off opaque. `authoredAlpha` above
       only says "some face, somewhere, is not 100% solid" - which is true of a
       model with one stray pane and of a ghost alike, and the renderer needs to
       tell those two apart before it decides whether to give the model a depth
       buffer (see SEE_THROUGH_SHARE). */
    seeThroughShare: (() => {
      if (!alphaUsed) return 0;
      let n = 0;
      for (let i = 0; i < fcount; i++) if (alpha[i] >= SEE_THROUGH_MIN_ALPHA) n++;
      return fcount ? n / fcount : 0;
    })(),
    tex: texUsed ? tex : null,
    cover: coverUsed ? cover : null,
    light,
  };
  compiled.skinner = makeSkinner(rest, groupLists, vcount);
  compiled.poseCache = new Map();
  return compiled;
}

/* The 128ths limits `deathBodyFrames` measures a death's squash by: a part is
   "coming down" once it is under about nine tenths of its size, and "taken
   away" once it is under a quarter. `UPRIGHT_HEIGHT` is the share of a
   sequence's tallest pose above which the pose still reads as standing rather
   than fallen (a lying humanoid measures 0.29-0.61 of its standing height, the
   quadrupeds 0.47-0.61, and a mid-fall pose 0.7 or more - see the proportions
   in src/README.md#death-corpses-and-respawn). */
const SHRINK_SCALE = 115;
const GONE_SCALE = 32;
const UPRIGHT_HEIGHT = 0.66;

/* How much of a death sequence is actually the body. Some cache authors finish
   a death by squashing the model out of existence: the zombie sinks through
   four frames at 99, 70, 41 and 13 hundredths of its height and then a
   zero-scale frame, the skeleton crumbles from 83 down to nothing the same way,
   and most animals simply scale to zero on their last frame. The client blends
   the sequence frame by frame, so a body visibly shrinks into the ground as it
   dies - which is not what a death looks like here: the creature falls, lies
   dead, and is then taken away.

   So a death sequence is played only up to the last frame that still shows the
   whole body, and that pose is held until the instant the sequence would have
   ended (src/models3d.js#update), keeping every authored beat - the fall, the
   settling - and then the body simply goes. All of that is decided by the last
   frame: if it does not scale a big share of the body down it is not a squash
   at all (every human model ends on a plain lying pose, and the hobgoblin and
   the dwarf end on theirs too), so the whole sequence plays, and a model with
   only one frame of sequence keeps that frame. If it does, the vanish is the
   unbroken run of frames at the end that take down at least as much of the body
   as it does - measuring the *share* is what skips a sub-part the artist hides
   for the whole sequence (the zombie zeroes a thirty-vertex patch on every
   frame from its fourth onwards, the ghost pinches a sliver the same way),
   since those always come down by less than the body itself does when the
   author finally takes it away. A scaling the author puts before the finish (a
   raised limb shrinking) is left alone, because the run has to be unbroken to
   the end. A run that swallows the *fall* itself - an author who scales the
   whole body down from the moment it topples, as the giants do - is caught by
   the posed-height check inside, which plays on to the frame the body is really
   taken away on rather than freezing the creature on its feet. Cached on the
   anim, which belongs to the shared compiled model. */
function deathBodyFrames(anim, m) {
  if (anim._bodyFrames != null) return anim._bodyFrames;
  const n = anim.frames.length;
  const minVerts = Math.max(2, Math.ceil(m.vcount * 0.05));
  /* how much of the body a frame scales down: the vertices under every type-3
     transform that covers a real share of the model and does not leave the size
     alone, i.e. under the given 128ths limit (a type-3 transform scales each axis
     in 128ths, 128 being unchanged, so a limit of 115 is "anything under about
     nine tenths of size is that part coming down", and one of 32 is "coming down
     to under a quarter") */
  const scaledMass = (f, limit) => {
    let total = 0;
    for (let j = 0; j < f.ids.length; j++) {
      const g = f.ids[j];
      if (anim.fm.types[g] !== 3) continue;
      const map = anim.fm.groups[g];
      if (!map) continue;
      let verts = 0;
      for (let k = 0; k < map.length; k++) verts += (m.groups[map[k]] || []).length;
      if (verts < minVerts) continue;
      const mn = Math.min(Math.abs(f.tx[j]), Math.abs(f.ty[j]), Math.abs(f.tz[j]));
      if (mn < limit) total += verts;
    }
    return total;
  };
  let cut = n;
  const endMass = scaledMass(anim.frames[n - 1], SHRINK_SCALE);
  if (endMass > 0) {
    while (cut > 1 && scaledMass(anim.frames[cut - 1], SHRINK_SCALE) >= endMass) cut--;
    /* The share test assumes the author keeps the body whole until the tail, and
       for most of the cache they do. The **giants** are the exception (the
       user's report, 2026-09-26: they *"stall out as they are halfway through
       dying and then they disappear"*): their death sequence scales the whole
       body down *from the moment it topples*, so the share test reads the last
       three quarters of the fall itself as "the body going away", freezes the
       pose while the giant is still on its feet, and only lets go at the
       terminal tick - a giant left standing mid-fall for the best part of three
       seconds and then removed. The ghost is the same shape one step smaller.
       So the run is only trusted when the frame it would freeze on is a *fallen*
       one: a pose still standing (two thirds of the sequence's tallest pose or
       more) means the run has swallowed the fall, and the body then ends at the
       last frame that has not been *taken away* - the frame before the first
       trailing one that has scaled the bulk of the body down to under a quarter
       of its size (`GONE_SCALE`), which is where both the share test's own tail
       and a fused one finally read as gone.

       Measured on the four giants (which share one death, 4659) and the ghost:
       the share test froze them on frames 9/9/9/9/15, all of them still on their
       feet (posed heights 79-121% of the sequence's tallest), where this ends
       the body on frames 12/12/12/12/17 - a body lying flat on the ground, 19-34%
       of standing - for each of the 106 death-bearing creatures in the manifest
       (the other 101 keep the frame the share test picked). */
    const heights = deathFrameHeights(anim, m);
    let tallest = 0;
    for (let i = 0; i < n; i++) if (heights[i] > tallest) tallest = heights[i];
    if (tallest > 0 && cut < n && heights[cut - 1] > UPRIGHT_HEIGHT * tallest) {
      const endGone = scaledMass(anim.frames[n - 1], GONE_SCALE);
      for (let i = cut; endGone > 0 && i < n; i++) {
        if (scaledMass(anim.frames[i], GONE_SCALE) >= endGone) { cut = i; break; }
      }
    }
  }
  anim._bodyFrames = cut;
  return cut;
}

/* The posed height of every frame of a sequence - the model's vertical extent
   with that frame played on it, in tiles (negative when the model cannot be
   posed at all). This is the same measure the bake-time scans call a pose
   "standing" or "flat" by (src/tools/cache-bake/deathscan.mjs#poseExtent), taken
   on the compiled model so it needs no second copy of the cache. Cached on the
   anim, like the frame count above it, because both belong to the one shared
   compiled model. */
function deathFrameHeights(anim, m) {
  if (anim._frameHeights) return anim._frameHeights;
  const n = anim.frames.length;
  const out = new Array(n).fill(-1);
  if (!m.skinner || !m.scaleY) { anim._frameHeights = out; return out; }
  const buf = { x: new Int32Array(m.vcount), y: new Int32Array(m.vcount), z: new Int32Array(m.vcount) };
  for (let i = 0; i < n; i++) {
    m.skinner(anim, i, buf);
    let minY = Infinity, maxY = -Infinity;
    for (let v = 0; v < m.vcount; v++) {
      const y = buf.y[v];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    out[i] = (maxY - minY) * m.scaleY;
  }
  anim._frameHeights = out;
  return out;
}

/* How much of a death sequence still shows the body *solid* - the alpha half
   of what `deathBodyFrames` measures in size, and the fix for the transparent
   corpse (the user's report, 2026-09-26: *"now its stuch at the very end of the
   death anim in a transparent state"*).

   Every creature in this cache ends its death by fading the body out as well as
   squashing it: the giants ramp the whole body from 0 to 255 (in the cache's
   units, 0 opaque) over their last eleven frames, the animals and the human
   NPCs over their last few, and it is a type-5 transform on each frame, so the
   fade *is* the tail. `deathBodyFrames` stops the pose at the last frame still
   whole in size - and for the four giants that is frame 12, which is the very
   frame the fade *begins* on: the giant collapsed flat on the ground, and its
   whole body already at 56-88 transparent, held for the remaining three seconds
   of the sequence. A corpse that lies there see-through, and then goes. (The
   giants are the only deaths in the manifest that suffer this: every other
   clamped death holds a frame that is still opaque, because the fade only
   starts once the pose has already been frozen - see the table in
   src/tools/check-deaths.mjs, which reports the held frame's transparency.)

   So the held beat takes its alpha from the last frame before the animation
   began fading the body, the same way it takes its pose from the last frame
   before the animation began taking it apart: the creature falls, lies dead
   *whole*, and is then removed. A frame counts as fading the body once
   `FADE_SHARE` of its faces have been moved `FADE_STEP` or more off the most
   opaque value they ever take in the sequence (a face's own resting alpha, so
   that the models the cache authors translucent to begin with - the ghost, the
   ice giant, the Barrows brothers - measure their *animation's* fade and not
   their authoring). Measuring the *share* rather than the average is what keeps
   a small flicker from counting: the zombie's death lights a handful of faces
   for three frames early in the sequence (a mean alpha of 9-19 against a resting
   0), which an average-based rule reads as an eleven-frame fade and clamps the
   whole dead zombie to a frame near its start. `FADE_SHARE` is a quarter, the
   same bar `SEE_THROUGH_SHARE` uses to call a model see-through at all.

   Only a death the clamp actually *holds* on is affected: one whose clamped pose
   is shown for longer than its own authored delay, i.e. whose pose cut leaves at
   least two frames of the sequence unshown (`deathBodyFrames` returning `n - 1`
   or less). A death clamped by a single frame holds nothing - its last whole
   pose is shown for exactly its own delay and the body is removed - so the cache
   is left to look the way it was authored, fades and all. Returns a frame
   *count*, like deathBodyFrames, and `n` when there is nothing to clamp. */
const FADE_STEP = 24;
const FADE_SHARE = 0.25;

function deathSolidFrames(anim, m) {
  if (anim._solidFrames != null) return anim._solidFrames;
  const n = anim.frames.length;
  let cut = n;
  if (n > 1 && deathBodyFrames(anim, m) <= n - 2) {
    const buckets = alphaLabelBuckets(m);
    if (buckets) {
      const fcount = m.fcount;
      const work = new Uint8Array(fcount);
      const rest = new Uint8Array(fcount);
      rest.fill(255);
      for (let i = 0; i < n; i++) {
        alphaFrameInto(m.alpha, buckets, anim.frames[i], anim.fm, work);
        for (let f = 0; f < fcount; f++) if (work[f] < rest[f]) rest[f] = work[f];
      }
      const minFaded = fcount * FADE_SHARE;
      for (let i = 1; i < n && cut === n; i++) {
        alphaFrameInto(m.alpha, buckets, anim.frames[i], anim.fm, work);
        let faded = 0;
        for (let f = 0; f < fcount; f++) if (work[f] - rest[f] >= FADE_STEP) faded++;
        if (faded >= minFaded) cut = i;
      }
    }
  }
  anim._solidFrames = cut;
  return cut;
}

function getPose(m, animName, frameIdx) {
  const key = animName + ":" + frameIdx;
  let p = m.poseCache.get(key);
  if (!p) {
    const anim = m.anims[animName];
    p = { x: new Int32Array(m.vcount), y: new Int32Array(m.vcount), z: new Int32Array(m.vcount) };
    m.skinner(anim, frameIdx % anim.frames.length, p);
    m.poseCache.set(key, p);
  }
  return p;
}

/* One pose of a *compiled* model, as the skinner itself produces it: one entry
   per vertex, in the bake's own units (128 to the tile, x east / y down from the
   model's foot / z across), i.e. exactly the numbers `update` turns into the
   drawn vertex buffer with `(x, footY - y, -z) * scale`.

   This exists so a *measurement* can be taken against the same skinning the
   renderer draws with, rather than against a second copy of it: it is what
   src/tools/anchor-scan.mjs reads to find where a weapon's muzzle actually sits
   at a given frame of an attack animation (and therefore where a missile has to
   leave from - see src/combat.js#MISSILE_ANCHORS). Nothing in the game calls
   it. */
export function poseVerts(m, animName, frameIdx) {
  if (!m || !m.anims || !m.anims[animName]) return null;
  return getPose(m, animName, frameIdx | 0);
}

/* Light: fixed relative to the camera (as in the real client, which lights the
   model after rotating it into view space), so a character's shading changes as
   it turns, and the sun always feels like it's up-left of the screen, behind
   the viewer. */
const lightScratch = new THREE.Vector3();

function lightInModel(yaw, pitch, dir, out) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  /* camera forward and screen-right in world space */
  const fx = -sy * cp, fy = -sp, fz = -cy * cp;
  const rx = cy, rz = -sy;
  let dx = -0.35 * rx + 0.0 * 0 + -0.45 * fx;
  let dy = 0.85 - 0.45 * fy;
  let dz = -0.35 * rz + -0.45 * fz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  /* world -> model space is a rotation by -dir about Y */
  const cd = Math.cos(-dir), sd = Math.sin(-dir);
  out.x = dx * cd + dz * sd;
  out.y = dy;
  out.z = -dx * sd + dz * cd;
  return out;
}

/* The largest scale any frame of any of this model's sequences applies (the
   cache's type-3 transform carries per-axis percentages, 128 = unchanged). Used
   only to size the bounding sphere, so it errs on the large side. */
function animScaleBound(anims) {
  let max = 1;
  for (const name of Object.keys(anims || {})) {
    const a = anims[name];
    for (const f of a.frames) {
      for (let j = 0; j < f.ids.length; j++) {
        const g = f.ids[j];
        if (a.fm.types[g] !== 3) continue;
        const m = Math.max(Math.abs(f.tx[j]), Math.abs(f.ty[j]), Math.abs(f.tz[j])) / 128;
        if (m > max) max = m;
      }
    }
  }
  return max;
}

/* Which texture slot each face belongs to, and the order the faces have to be
   drawn in so that each material's faces are one contiguous run of the vertex
   buffer (three.js draws one material per group, and a group is a range).
   Returns null for a model with no textures at all, which is everything but a
   handful - see src/tools/cache-bake/chartex.mjs. */
function faceSlotOrder(m) {
  const faceTex = m.tex;
  if (!faceTex) return null;
  const fcount = m.fcount;
  const texSlots = new Int32Array(fcount);
  const texUsed = [];
  let any = 0;
  for (let f = 0; f < fcount; f++) {
    const id = faceTex[f];
    const t = id >= 0 ? charTextures.get(id) : null;
    if (!t) continue;
    let k = texUsed.indexOf(id);
    if (k < 0) { k = texUsed.length; texUsed.push(id); }
    texSlots[f] = k + 1;
    any++;
  }
  if (!any) return null;
  /* Every plain face first, then each texture's faces in one run. */
  const faceOrder = new Int32Array(fcount);
  let o = 0;
  for (let s = 0; s <= texUsed.length; s++) {
    for (let f = 0; f < fcount; f++) if (texSlots[f] === s) faceOrder[o++] = f;
  }
  return { texSlots, texUsed, faceOrder };
}

/* A face's identity by *position*: its three corners in the cache's own
   (whole-number) units, rotated so the winding is preserved. Two runs of
   vertices at the same coordinates - which is how a doubled sheet is authored -
   therefore get the same key.

   The corners are compared **exactly** (rounded to the cache's own unit, 1/128
   of a tile). That is deliberately strict. A looser bucket was measured and
   rejected: rounding to four units - under a third of a pixel at any camera
   distance - already took ten faces off the *naked body* (551 -> 541 triangles)
   and nine more off the cape of legends, because a bucket merges any two
   surfaces that happen to straddle the same four-unit boundary, not just
   surfaces that are actually coincident. Ten faces of a bare torso is a real
   hole; every duplicate sheet the cache authors is at *identical* coordinates,
   so exactness costs nothing and cannot take anything that was not doubled.
   Two surfaces a unit or two apart are `coveredBodyFaces`' job (COVER_TIE
   0.25 .. COVER_REACH 10), not this one's. */
function facePositionKey(rest, faces, f, buf) {
  for (let k = 0; k < 3; k++) {
    const v = faces[f * 3 + k] * 3;
    buf[k] = Math.round(rest[v]) + "," + Math.round(rest[v + 1]) + "," + Math.round(rest[v + 2]);
  }
  let bi = 0;
  if (buf[1] < buf[bi]) bi = 1;
  if (buf[2] < buf[bi]) bi = 2;
  return buf[bi] + "|" + buf[(bi + 1) % 3] + "|" + buf[(bi + 2) % 3];
}

/* ------------------------------------------------------- coplanar overlays

   A garment's ornament is painted onto the same plane as the cloth it sits on.
   The attack cape (cache model 18920) is the measured example: its back is one
   flat sheet of triangles, and the emblem - the seven shades of the sword and
   its border - is a *second*, finer set of triangles lying in exactly the same
   plane, on top of the cloth's own (twelve of the emblem's faces share area
   with a cloth face, at the same plane offset to the last unit). The client
   never has to care: it draws
   faces in one fixed order and its own depth rule lets the later face through,
   so the emblem paints over the cloth, the same way every frame from every
   camera. A depth *buffer* has no such notion. The two sets of triangles
   interpolate their depth from *different* vertex coordinates, so the rounding
   of that interpolation decides each pixel on its own and the cloth and the
   emblem come out as a speckled mix - the "z fighting on the skillcapes and
   their logos" the user reported. (The dedupe above cannot catch this one: it
   only resolves faces at *identical* coordinates, and the emblem's corners are
   their own.)

   The fix is a fraction of a pixel of real geometry: within one coplanar group
   of faces, every face that is overlapped by an *earlier* face in the draw
   order is pushed a little way along the group's own normal, one step per level
   of overlap. Two overlapping faces are then never at the same depth again, the
   later one is in front by construction - which is the face the client shows -
   and the whole sheet moves by a couple of units of the 128 in a tile, a
   sixteenth of a pixel at the closest camera this world allows.

   Only a group carrying more than one colour is touched, and that is what makes
   this safe to run over every model in the world: a flat wall, a floor, the
   panes of a window are one colour throughout, and a group of one colour has
   nothing painted over anything. The plane bucket is deliberately loose (a
   60th of the normal, half a unit of plane offset) so that two triangles the
   artist authored as one plane land in one group even when the arithmetic of
   the two does not agree to the last bit; the position comparison the group
   itself rests on is exact, the same way `facePositionKey` is. */
const OVERLAY_STEP = 2;       /* raw units (1/128 tile) of push per overlap level */
const OVERLAY_MAX_STEP = 6;   /* the deepest chain a push is counted for */
const OVERLAY_GROUP_MAX = 64; /* a coplanar group bigger than this is left alone */
/* How much shared area counts as an overlap, in tiles. The ornaments this
   exists for are *small*: the attack cape's emblem sits on faces six units
   (a twentieth of a tile) across, so a tolerance of a whole unit - which is
   what "obviously overlapping" suggests at first - swallows the very overlaps
   the pass is looking for and finds nothing at all. Measured against the
   models: at 0.0005 tiles (a sixteenth of a unit) the pass separates 58 of the
   726 worn models - the attack cape's emblem (12 faces), the dragon chainbody
   (43), the snakeskin body (27), the green d'hide chaps (18), the full helms
   (8) - and at a unit it separates one. Two neighbours in a sheet, which merely
   share an edge, are still left alone by it. */
const OVERLAY_TOL = 0.0005;

/* Do two triangles share area? Both are known to lie in one plane, so the
   separating-axis test only needs the four in-plane axes: each triangle's three
   edge perpendiculars (edge x plane-normal). A touching pair - which is what
   two neighbours in a sheet are - is not an overlap, hence the gap the test
   insists on. */
function trisShareArea(A, B, nx, ny, nz) {
  for (const T of [A, B]) {
    for (let k = 0; k < 3; k++) {
      const p = T[k], q = T[(k + 1) % 3];
      const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2];
      const ax = ey * nz - ez * ny, ay = ez * nx - ex * nz, az = ex * ny - ey * nx;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v[0] * ax + v[1] * ay + v[2] * az; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = v[0] * ax + v[1] * ay + v[2] * az; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      if (a1 <= b0 + OVERLAY_TOL || b1 <= a0 + OVERLAY_TOL) return false;
    }
  }
  return true;
}

/* The per-face push, in mesh units, laid out as x,y,z per source face (all
   zero for a model that needs none - the common case, so the caller can skip
   the whole thing with one null check). `drawn` is the draw order: `drawFaces`
   from the dedupe, or `faceOrder`, or null for the plain 0..fcount order.

   This is the *runtime* half of the overlay story and it exists for the models
   whose bake left the two sheets alone - the ones with no per-face priority to
   say which is on top (the attack cape's sword emblem, above). A model that
   *does* carry per-face priorities is resolved one step earlier and more
   exactly, at bake time, where the client's own draw order is known
   (tools/cache-bake/faceprio.mjs#applyPriorityOverlays): there the higher
   priority face is the one moved. Both halves do the same thing to a depth
   buffer - separate two surfaces that the client separates with paint order -
   and a model never needs both. */
function coplanarOverlays(m, drawn) {
  const fcount = m.fcount;
  if (fcount > 4000 || fcount < 2) return null;
  const rest = m.rest, faces = m.faces, colors = m.colors;
  const scale = m.scale;
  const scaleX = m.scaleX == null ? scale : m.scaleX;
  const scaleY = m.scaleY == null ? scale : m.scaleY;
  const scaleZ = m.scaleZ == null ? scale : m.scaleZ;
  const footY = m.footY, flip = m.flip;
  const corner = (v, out) => {
    out[0] = rest[v] * scaleX;
    out[1] = (footY - rest[v + 1]) * scaleY;
    out[2] = -rest[v + 2] * scaleZ;
  };
  const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0];
  const groups = new Map();
  const n = drawn ? drawn.length : fcount;
  for (let oi = 0; oi < n; oi++) {
    const f = drawn ? drawn[oi] : oi;
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
    corner(a, c0); corner(b, c1); corner(c, c2);
    const e1x = c1[0] - c0[0], e1y = c1[1] - c0[1], e1z = c1[2] - c0[2];
    const e2x = c2[0] - c0[0], e2y = c2[1] - c0[1], e2z = c2[2] - c0[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!len) continue;                       /* a degenerate face has no plane */
    const s = (flip ? -1 : 1) / len;
    nx *= s; ny *= s; nz *= s;
    const off = nx * c0[0] + ny * c0[1] + nz * c0[2];
    const key = Math.round(nx * 60) + "," + Math.round(ny * 60) + "," + Math.round(nz * 60)
      + "|" + Math.round(off * 128);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    if (g.length <= OVERLAY_GROUP_MAX) g.push({ f, nx, ny, nz, d: 0 });
  }
  let any = null;
  for (const g of groups.values()) {
    if (g.length < 2 || g.length > OVERLAY_GROUP_MAX) continue;
    /* one colour throughout means there is nothing painted over anything */
    const first = colors[g[0].f];
    let multi = false;
    for (let i = 1; i < g.length; i++) if (colors[g[i].f] !== first) { multi = true; break; }
    if (!multi) continue;
    /* The chain: a face's level is one past the deepest face it overlaps that
       is drawn before it, which is the number of surfaces it may be buried
       under. Only faces that are actually covered get pushed at all. */
    const tri = (f) => {
      const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3;
      const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      corner(a, p[0]); corner(b, p[1]); corner(c, p[2]);
      return p;
    };
    for (let i = 0; i < g.length; i++) {
      const A = tri(g[i].f);
      for (let j = 0; j < i; j++) {
        const d = g[j].d + 1;
        if (d <= g[i].d) continue;
        if (trisShareArea(tri(g[j].f), A, g[i].nx, g[i].ny, g[i].nz)) g[i].d = d;
      }
    }
    for (const e of g) {
      if (!e.d) continue;
      const k = Math.min(e.d, OVERLAY_MAX_STEP) * OVERLAY_STEP * scale;
      if (!any) any = new Float32Array(fcount * 3);
      any[e.f * 3] = e.nx * k;
      any[e.f * 3 + 1] = e.ny * k;
      any[e.f * 3 + 2] = e.nz * k;
    }
  }
  return any;
}

/* The face indices to draw, in draw order, with the *coincident duplicates*
   left out - see the long note in buildMesh for why. Returns null when nothing
   has to be dropped, so a clean model - every creature, most items - keeps the
   plain order and pays nothing for this beyond the key pass.

   `faceOrder` (from faceSlotOrder) is the draw order the meshes are actually
   built in; the survivor of each coincident group has to be the face that wins
   today, which is the *last* of the group in that same order. */
function dedupeDrawOrder(m, faceOrder) {
  const fcount = m.fcount;
  const rest = m.rest, faces = m.faces;
  const keyBuf = ["", "", ""];
  const at = (oi) => (faceOrder ? faceOrder[oi] : oi);
  const last = new Map();
  for (let oi = 0; oi < fcount; oi++) last.set(facePositionKey(rest, faces, at(oi), keyBuf), oi);
  let dropped = 0;
  for (let oi = 0; oi < fcount; oi++) if (last.get(facePositionKey(rest, faces, at(oi), keyBuf)) !== oi) dropped++;
  if (!dropped) return null;
  const keep = new Int32Array(fcount - dropped);
  let n = 0;
  for (let oi = 0; oi < fcount; oi++) if (last.get(facePositionKey(rest, faces, at(oi), keyBuf)) === oi) keep[n++] = at(oi);
  return keep;
}

/* ---------------------------------------------------------------------------
   The garment depth bias: why a worn model is drawn a hair nearer the eye
   ---------------------------------------------------------------------------

   The client is a painter, not a depth test. Its rasteriser walks a model's
   faces *by priority band* and paints each one over whatever is already in the
   buffer (`Model.draw`'s band loop, and `drawFace` with no depth test at all),
   so a face in a higher band wins the pixels it covers whatever the two faces'
   depths are. The bands are how the cache's authors say "this is the garment,
   that is the body": the ordinary cape's model (18970, the model
   `construction_cape` wears) carries bands {5: 66, 6: 490, 7: 2}, while the
   identity kit's legs, torso, arms, hands and feet all carry band 0 or 1 - so
   a cape's cloth is always painted *over* the legs, and never the other way
   round.

   A depth buffer has no bands, and that is the leg the user sees in the
   bottom-left of a cape: once the stand pose is skinned onto the body (cpu,
   every frame - see `update`), the shins and the cape's hem come within a unit
   or two of one another, and wherever the leg's surface lands *in front* of
   the cloth the depth test picks the leg and a strip of it shows through. The
   grazing is real but tiny: scanning the posed mesh, 89 cells of the shins lie
   0 to 0.017 tiles in front of the hem (2 raw units at the widest).

   The bake cannot fix it: it sees one item's model and never the body it is
   worn over, and the crossing exists only under a pose. `coveredBodyFaces`
   cannot either - it drops *body* faces the armour contains, and a reach wide
   enough to catch these shins eats the arm showing at a sleeve opening
   instead (see COVER_REACH above).

   So the mesh keeps the client's own answer, in the one place it can be
   applied: a worn model's cloth is drawn a hair nearer the eye than it really
   is. Every vertex of a worn model carries `aCover` = 1 (a body vertex 0, a
   cape the same 1 - see "The garment ladder"), and the vertex shader shifts
   the garment's view-space z toward the camera before projecting. The shift
   is along the view axis, so it moves nothing on screen (a fraction of a tile
   at arm's length is a few hundredths of a pixel of perspective scale) - it
   only re-orders the depth test, exactly as the client's bands do.

   The size is the smallest that clears the grazing: 0.031 tiles (4 raw units)
   passes every one of the 89 cells with room to spare, while staying well
   under the ~0.3 tiles that separates a garment from the body it really does
   cover (a platebody's sleeve from the arm inside it), so nothing else in the
   picture moves. The size is measured against the *posed* body, not the
   authored one - resting, the hem is 12-17 units clear of the leg, and it is
   the stand pose that brings the two together - which is also why the shift
   has to be applied at draw time rather than baked into the vertices.

   A held item is left out (src/game.js#wornOptsFor's `heldKeys`): a weapon and
   a shield are held *in front of* the body rather than worn over it, and their
   models are what the hand closes around, so shifting them could let a grip
   swallow a fingertip.

   ## The garment ladder

   One shift is not enough when *both* surfaces are garments. The grazing above
   is a cape's hem against the *body's* shin, which a single level settles - but
   the same hem grazes a worn *plateleg* just as closely, and two worn models
   carrying the same level move together, so the contest survives untouched:
   the plateleg is authored over the body's own leg, and the two garment models
   are merged one after the other with no rank between them. That is the user's
   report of 2026-09-23 - *"you have the leg issue on the capes again tho"* -
   and it is why `aCover` is a level rather than a flag: the cape is a rank
   above the armour under it (see src/game.js#wornOptsFor's `drapeKeys`), so the
   cloth is shifted one whole COVER_Z_BIAS further toward the eye than the
   plateleg and the leg is behind the cloth again by the same margin the body's
   own shin is. Whatever the client's per-face priority bands say, they say the
   cape is painted last; a level per garment rank is that answer in the one form
   a depth buffer can take. (2026-09-30: the rank was briefly dropped to 1 on
   suspicion of painting the lining over the torso and legs from the front -
   but the dye tests proved the cloth won those pixels because the cape-under
   pass's facing tests were backwards and had deleted the armour in front of
   it. With the facing fixed the rank is back, and the front orders itself by
   the true posed depths.)
   --------------------------------------------------------------------------- */
/* The view-axis shift one garment level is worth. It covers grazing contacts
   only - the shin through the hem (0 to 0.017 tiles), the coinciding plateleg
   (measured: 2 848 px of leg inside the cape's silhouette with the cape at the
   armour's level, 0 one step above). Gross overlaps are the cape-under drop's
   job (see setWorn): it removes the back panels outright, from every angle,
   which no shift can do without also lifting the collar over the beard - the
   beard-to-collar gap is ~7 units, so anything past 6 eats the chin (measured
   on the attack cape's beard tip, front doll view). 4 units clears every graze
   with margin and stays an order of magnitude under the ~0.3 tiles (38 units)
   separating a garment from the body it *really* covers (a platebody's sleeve
   from the arm inside it). */
const COVER_Z_BIAS = 4 / 128;

/* The rank a cape sits at (see "The garment ladder" above): a cape's faces
   are shifted this many COVER_Z_BIASes toward the eye, so the cloth beats the
   armour it hangs over by one whole step. src/game.js#wornOptsFor decides which
   items are capes (`drapeKeys`). */
const DRAPE_LEVEL = 2;

/* The rank a neck-slot item sits at: an amulet hangs over whatever is on the
   chest - bare skin, a platebody, a robe - and over a cape too, exactly as the
   client paints it. src/game.js#wornOptsFor decides which items these are
   (`topKeys`). */
const TOP_LEVEL = 3;

/* The vertex shader chunk this mesh's garment shift replaces: three.js's own
   `project_vertex`, with the bias added to `mvPosition.z` between the
   model-view transform and the projection. It is inlined rather than inserted
   after the `#include` because three.js computes `gl_Position` *inside* the
   chunk - a line added after it would already be too late to change the
   projection. (r160's chunk, verbatim but for the added line.) */
const COVER_PROJECT_VERTEX = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );

#ifdef USE_BATCHING

	mvPosition = batchingMatrix * mvPosition;

#endif

#ifdef USE_INSTANCING

	mvPosition = instanceMatrix * mvPosition;

#endif

mvPosition = modelViewMatrix * mvPosition;

mvPosition.z += aCover * uCoverBias;

gl_Position = projectionMatrix * mvPosition;
`;

/* Give one material the `aCover` attribute and the shift above.
   `onBeforeCompile` is three.js's hook for editing a generated program: the
   declarations go on the front of the vertex shader and the chunk above takes
   the place of `project_vertex`. */
function applyCoverBias(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCoverBias = { value: COVER_Z_BIAS };
    shader.vertexShader = "attribute float aCover;\nuniform float uCoverBias;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", COVER_PROJECT_VERTEX);
  };
  /* Programs are cached by their source, and this source is one three.js
     generated - so name the variant, or a biased material and a plain one
     would be handed the same program and only whichever compiled first would
     win. */
  mat.customProgramCacheKey = () => "coverBias";
}

/* ------------------------------------------------- the depth buffer, and how
   much of a model has to be see-through before it gives it up

   A model carrying per-face alpha cannot be drawn with `depthWrite` on: the
   blended faces have to blend with each other, and a depth buffer would let the
   nearest one simply erase the others (see the long note in buildMesh). But
   "carries an alpha array" is a much weaker statement than "is a translucent
   model", and treating the two as the same thing cost 848 solid faces of the
   Lumbridge Guide their depth buffer on the strength of *one* face the cache
   authored at 250/255 - a stray pane at his feet. With no depth buffer the draw
   order alone decides every pixel, so his pack, which the cache authors behind
   his shoulder, painted straight over his chest (the user's report,
   2026-09-20: *"also vt the way his pack needs to be culled by his body, right
   now its rendering through his body"*).

   These three numbers decide the split, and the cache's own spread is what
   picks the middle one. Measured over all 69 baked models that carry an alpha
   array, the share of faces authored visibly see-through is either nothing
   (the label-only models), a few per cent or less (the guide 0.1%, the
   unicorn 2.5%, the dragons 7%, the giant bat 18%) or nearly all of it (the
   ice giants 95%, the ghosts 99.8%, the Barrows brothers 100%). There is no
   model in between, so SEE_THROUGH_SHARE is a quarter: at or above it the
   model is a see-through one and keeps the old draw exactly, below it the
   model is a solid one with stray panes, and those panes are drawn in a second
   pass that writes no depth, so the solid faces can have the depth buffer
   back. */
const SEE_THROUGH_SHARE = 0.25;
/* A face's alpha at or above this is more see-through than solid: it belongs in
   the second pass, where it is blended after everything solid and writes no
   depth - so a pane the cache authored as nearly invisible can never hide the
   body behind it either. */
const SHEER_ALPHA = 128;
/* ...and below this a face is opaque for any purpose a screen has: 3% of a
   face's own colour, which is under a bit of an 8-bit channel. A face between
   the two is one the cache means to be seen through, and it is what
   `seeThroughShare` counts. */
const SEE_THROUGH_MIN_ALPHA = 8;

function buildMesh(m) {
  const fcount = m.fcount;
  /* ## Coincident faces: why the winner has to be decided before the draw

     A cache garment is regularly authored as *two* sheets in the same place:
     the plain cape model is an outer panel and a lining at identical
     coordinates, a robeskirt's front and back panels are the same, and the
     body kits double a face wherever a shirt's shoulder meets a sleeve. The
     client never has to care - it draws faces one at a time, sorted by average
     depth, so two faces at the same depth resolve to whichever the sort put
     second: the same face every frame, from every camera. A depth *buffer* has
     no such notion. Two fragments at the same depth are resolved by the
     rasteriser's rounding, which is stable for one projection but not across a
     moving camera, so the pair flickers - which is exactly the garments (a
     cape, a skirt, a robe) that the user reported as "z fighting with the
     other types of clothes".

     So decide it here, in advance: of two faces at the same place with the same
     winding, only the *second* one is ever drawn (the depth test's own rule,
     `LEQUAL`, is last-drawn-wins), so the earlier one is simply left out of the
     buffer. The surface that was already winning still wins, the tie is gone,
     and the mesh is a few faces smaller.

     Faces at the same place with *opposite* windings are left alone: those are
     the two sides of a one-sided sheet, and the material's own `side` already
     picks one of them deterministically.

     A face is identified by the *positions* of its corners rather than by its
     vertex indices - a doubled sheet is usually two separate runs of vertices
     at the same coordinates, and catching that is the whole point. The
     positions are compared in the cache's own units (whole numbers, so no
     float noise), and the corner order is rotated so the winding survives the
     key. */
  const slots = faceSlotOrder(m);
  const faceOrder = slots ? slots.faceOrder : null;
  /* A model with per-face alpha is a *translucent* one - the spell bursts, and
     the Barrows brothers' NPC models, which the cache authors see-through. The
     dedupe below must not touch these: a translucent mesh is drawn with
     `depthWrite` off, so there is no depth-buffer tie to resolve in the first
     place (the draw order alone decides, every frame, from every camera), and a
     doubled sheet on such a model is deliberate - drawing the same face twice
     is how the cache's own renderer builds up density. Measured on Barrows'
     Guthan: dropping its 30 coincident faces visibly thinned his translucent
     skirt, which is exactly the sort of thing this pass exists to avoid. */
  const hasAlpha = !!m.alpha;
  /* ## Two kinds of alpha, and only one of them is see-through

     An alpha array reaches this point for two reasons (see compileCharacter's
     `authoredAlpha`): the model *paints* faces translucent - a spell burst's
     glow, a Barrows brother's skirt - or it authors none and merely carries
     the labels its sequences move, which is the whole animal kingdom in this
     cache (the death sequence fades the body out) and every identity-kit body
     besides (the skillcape emotes' own fade). `blended` below is the first kind
     and `opaqueFaces` the second: not one of the second kind's faces is
     see-through until an animation fades it.

     The distinction decides three things, and getting it wrong is what put a
     cape on the wrong side of the legs (the user's report, 2026-09-23:
     *"the skillcape im wearing and possible all capes are culling weirdly in
     front of the body"*, and *"the magic capes logo is not showing as a
     result"*): such a model is still blended (the fade has to work) but it
     *keeps its depth buffer*, and it takes the coincident-duplicate and
     coplanar-overlay passes that a translucent model must not. All three were
     off for every character and creature in the world, because the alpha array
     below is non-null for any model carrying labels.

     * **The depth buffer.** A translucent mesh is drawn with `depthWrite`
       off, so the draw order alone decides every pixel - which is what the
       client does and what a blend needs. For a body with no translucent face
       that is simply wrong: the buffer order is body first, then the worn
       models in equipment order (head, cape, ... body, legs, ...), so the legs
       were painted *over* the cape and the cape's cloth was drawn behind the
       limbs it hangs in front of.
     * **The coincident-duplicate pass** (see the long note below it): a cape is
       an outer panel and a lining at identical coordinates, and dropping the
       face the depth test's `LEQUAL` would lose is exactly how the tie is
       settled for an opaque sheet. The pass was skipped here, leaving both
       sheets in the buffer to fight.
     * **The coplanar-overlay push**: the few units of geometry that lift a
       garment's painted-on ornament (the magic cape's blue-and-gold emblem, the
       attack cape's sword) clear of the cloth it lies in the same plane as.
       Skipped, the emblem sat behind the cloth and the cape read as a plain
       beige sheet - the "logo not showing" above.

     `opaqueFaces` is therefore "an ordinary opaque model whose alpha array
     exists only to be *animated*", and it takes the depth buffer and both tie
     passes back; `blended` is everything a translucent or two-sided mesh was
     before, so those keep the behaviour they had. */
  const opaqueFaces = !m.authoredAlpha && !m.doubleSided;
  const blended = hasAlpha && !opaqueFaces;
  let drawFaces = blended ? null : dedupeDrawOrder(m, faceOrder);
  const drawCount0 = drawFaces ? drawFaces.length : fcount;
  /* ## The stray panes of an otherwise solid model

     With the two kinds of alpha separated (see SEE_THROUGH_SHARE), a model can
     now be *blended* - so it needs the 4-component colour attribute and the
     per-face blending - and still be made of opaque faces, all but a few. Those
     few are the panes the cache authored more than half see-through; the rest
     are solid and have no business going without a depth buffer. So the buffer
     is written in two runs: every solid face first, in the order the model was
     already drawn in, and the panes after them. The runs become the geometry
     groups below, and the material they are drawn with is the whole of the
     depth policy: the solid run writes depth, the pane run does not (it blends
     over what is already there, exactly as it always did).

     The panes are ordered *first* for the coincident-duplicate pass and swapped
     back afterwards, because that pass settles a doubled sheet by keeping the
     face that wins today - the last of the pair - and the one that has to
     survive a pair is the solid one. Measured across the baked models, no model
     that reaches this path has a coincident pair at all (the guide, the
     unicorn, the dragons, the bat: none), so the pass is here for correctness,
     not because anything needs it. */
  const solidDepth = blended && !m.doubleSided && (m.seeThroughShare || 0) < SEE_THROUGH_SHARE;
  let strayFrom = -1;
  if (solidDepth && hasAlpha && drawCount0) {
    const at = (oi) => (drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi));
    let stray = 0;
    for (let oi = 0; oi < drawCount0; oi++) if (m.alpha[at(oi)] >= SHEER_ALPHA) stray++;
    if (stray && stray < drawCount0) {
      const pre = new Int32Array(drawCount0);
      let i = 0, j = stray;
      for (let oi = 0; oi < drawCount0; oi++) {
        const f = at(oi);
        if (m.alpha[f] >= SHEER_ALPHA) pre[i++] = f; else pre[j++] = f;
      }
      const kept = dedupeDrawOrder(m, pre) || pre;
      let strayKept = 0;
      for (let k = 0; k < kept.length; k++) if (m.alpha[kept[k]] >= SHEER_ALPHA) strayKept++;
      const out = new Int32Array(kept.length);
      let s = kept.length - strayKept, t = 0;
      for (let k = 0; k < kept.length; k++) {
        const f = kept[k];
        if (m.alpha[f] >= SHEER_ALPHA) out[s++] = f; else out[t++] = f;
      }
      drawFaces = out;
      strayFrom = kept.length - strayKept;
    }
  }
  /* Faces the cache means to be seen through without being sheer (see
     SHEER_ALPHA): the beekeeper's veil over its face. They stay in the
     depth-writing run, but draw after its opaque faces, so the veil blends
     over the face instead of depth-hiding it. */
  if (solidDepth && hasAlpha && drawCount0) {
    const end = strayFrom > 0 ? strayFrom : drawCount0;
    const at = (oi) => (drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi));
    let veils = 0;
    for (let oi = 0; oi < end; oi++) {
      const a = m.alpha[at(oi)];
      if (a >= SEE_THROUGH_MIN_ALPHA && a < SHEER_ALPHA) veils++;
    }
    if (veils && veils < end) {
      const out = new Int32Array(drawCount0);
      let i = 0, j = end - veils;
      for (let oi = 0; oi < end; oi++) {
        const f = at(oi);
        const a = m.alpha[f];
        if (a >= SEE_THROUGH_MIN_ALPHA && a < SHEER_ALPHA) out[j++] = f; else out[i++] = f;
      }
      for (let oi = end; oi < drawCount0; oi++) out[oi] = at(oi);
      drawFaces = out;
    }
  }
  const drawCount = drawFaces ? drawFaces.length : drawCount0;
  const outVerts = drawCount * 3;
  const positions = new Float32Array(outVerts * 3);
  /* The coplanar-overlay push (see src/models3d.js#coplanarOverlays): the few
     units of real geometry that stop a garment's painted-on ornament from
     fighting the cloth it lies in the same plane as. Null for every model that
     has no such pairing, which is nearly all of them. */
  const overlays = blended ? null : coplanarOverlays(m, drawFaces || faceOrder);
  /* A model with per-face alpha needs a 4-component colour attribute: three.js
     reads that as USE_COLOR_ALPHA and blends each face at its own opacity. An
     opaque model (~everything except the spell travel/impact bursts) keeps the
     cheaper 3-component attribute and no blending at all. */
  const colorArr = new Float32Array(outVerts * (hasAlpha ? 4 : 3));
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colorArr, hasAlpha ? 4 : 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute("position", posAttr);
  geom.setAttribute("color", colAttr);
  /* Which vertices belong to a *worn* model, and how far up the garment ladder
     that model sits - the ones the garment depth bias shifts toward the eye
     (see COVER_Z_BIAS above). The level is per face in `m.cover` and is spelled
     out per output vertex here, once, in the same `oi -> f` order the draw loop
     below uses, so it survives the coincident-duplicate pass and the texture
     re-order without either of them knowing about it. A body with nothing worn
     (and every creature, every item on its own) allocates nothing. */
  const coverSrc = m.cover;
  const coverArr = coverSrc ? new Float32Array(outVerts) : null;
  if (coverArr) {
    for (let oi = 0; oi < drawCount; oi++) {
      const f = drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi);
      const c = coverSrc[f] || 0;
      coverArr[oi * 3] = c; coverArr[oi * 3 + 1] = c; coverArr[oi * 3 + 2] = c;
    }
    geom.setAttribute("aCover", new THREE.BufferAttribute(coverArr, 1));
  }

  const scale = m.scale;
  const scaleX = m.scaleX == null ? scale : m.scaleX;
  const scaleY = m.scaleY == null ? scale : m.scaleY;
  const scaleZ = m.scaleZ == null ? scale : m.scaleZ;
  const footY = m.footY;
  const rest = m.rest;
  /* Which texture each face wants, when the model has any, and the material
     slot each one lands in. A model with no `tex` at all - everything but a
     handful (see src/tools/cache-bake/chartex.mjs) - skips all of this: no uv
     attribute is even allocated. */
  const faceTex = m.tex;
  const texSlots = slots ? slots.texSlots : null;
  const texUsed = slots ? slots.texUsed : null;
  /* Three.js draws one material per *contiguous* range of the vertex buffer,
     so the faces are re-ordered: every plain face first, then each texture's
     faces in one run. (The buffer is non-indexed and written face by face, so
     "re-order" is just the order the loops below walk the faces in.) */
  let uvArr = null;
  if (slots) {
    uvArr = new Float32Array(outVerts * 2);
    geom.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  }
  const outSrc = m.faces;
  const faceHslIdx = m.faceHslIdx;
  const palettes = m.palettes;
  const flip = m.flip;
  const alphaSrc = m.alpha;
  const colors = m.colors;
  /* The faces carrying each alpha *label* (see alphaLabelBuckets): the set a
     framemap's type-5 transform moves. */
  const alphaFaces = hasAlpha ? alphaLabelBuckets(m) : null;
  /* The per-frame working alpha of a labelled model, and the second one the two
     blended frames need. */
  const alphaWork = alphaFaces ? new Uint8Array(fcount) : null;
  const alphaWorkB = alphaFaces ? new Uint8Array(fcount) : null;
  /* The client's spotanim light, pre-scaled: magnitude = (850 + contrast) *
     |L| >> 8, exactly as applyLighting computes it. */
  const clientLight = m.light
    ? { mod: m.light.mod, mag: (m.light.magMul * CLIENT_LIGHT_MAG) >> 8 }
    : null;

  /* A stable bounding sphere so three.js never recomputes it per frame - and,
     in the same pass, the model's authored box in the *mesh's* own convention
     (x right, y up from the feet, z toward the viewer). The box is what the
     renderer's interface paper-doll frames a character with (src/scene.js#
     drawDoll), and it has to come from the rest data rather than from the live
     vertex buffer: that buffer is all zeros until the first skinning pass runs
     (see below), so measuring the mesh instead of the model gives a
     point-sized box at the origin and a doll that frames - and renders -
     nothing. */
  let r2 = 0;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < m.vcount; i++) {
    const x = rest[i * 3] * scaleX, y = (footY - rest[i * 3 + 1]) * scaleY, z = -rest[i * 3 + 2] * scaleZ;
    const d = x * x + y * y + z * z;
    if (d > r2) r2 = d;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  /* The sphere is what the mesh's *bounding box* is built from rather than a
     box computed off the vertex buffer: Raycaster tests the box before the
     triangles, so picking a character (see Game.pickEntity) has to have a
     conservative box from the start - a box around the sphere is conservative,
     which is all the ray test needs. The bound must also cover the model as its
     *animation* can pose it, not just
     as it was authored: every spell graphic scales itself up many times over
     mid-sequence (the cast burst's first frame is a 10.7x scale), and a bound
     taken from the rest pose alone is small enough that three.js culls a
     graphic that is plainly on screen. */
  const r = Math.sqrt(r2) * animScaleBound(m.anims) + 0.05;
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), r);
  geom.boundingBox = new THREE.Box3(new THREE.Vector3(-r, -r, -r), new THREE.Vector3(r, r, r));

  /* Which face of a triangle is its front. The client draws *one* side of
     every face it has (a `Model` with no `renderAtOrigin`/mirror flag is drawn
     by the rasteriser's own hidden-face test), and the cache's winding order
     says which: `m.flip` is the model's own "do the triangle normals point
     inward" vote (see `computeFlip`), so a model whose wound normals face
     outward keeps its front faces, and one authored the other way round gets
     its back faces.

     Drawing both sides instead - which is what this did - is what put a dyed
     cape's *lining* on display: the ordinary cape model (323, the model every
     cape including the three god capes wears) is a double sheet, and with both
     sides drawn the white inner face of Saradomin's cape was painted over its
     blue outer one. One side chosen by the winding makes the panel we see the
     outside of the garment, exactly as the game shows it.

     A spotanim keeps both sides: its bursts are open shells of translucent
     faces (see `hasAlpha` below) authored to be seen through, and the client
     draws those with its own two-sided pass. */
  const side = m.doubleSided ? THREE.DoubleSide : (m.flip ? THREE.BackSide : THREE.FrontSide);
  const matOpts = { vertexColors: true, side };
  const mat = new THREE.MeshBasicMaterial(matOpts);
  /* A tint multiplies every face colour in the model. The material colour is a
     constant factor on the per-face vertex colours, so one hex recolours a
     whole animation - every frame of it - without touching the baked data.
     The two undead spells this world invented cast Crumble's own graphic in
     their own colour this way (see src/magic.js#SPELL_FX). `setHex` is the
     conversion the palettes use for the same reason: three.js keeps colour in
     linear space and setHex does the sRGB decode. With no tint the colour is
     plain white (1,1,1), which leaves the vertex colours untouched. */
  if (m.tint != null) mat.color.setHex(m.tint);
  const baseR = mat.color.r, baseG = mat.color.g, baseB = mat.color.b;
  if (hasAlpha) {
    /* A burst's translucent faces have to blend with each other, so they must
       not write depth (the client sorts them back to front for the same
       reason); depth *testing* stays on, so the caster's body still correctly
       hides the part of the graphic behind it.

       A model that only carries alpha *labels* - an opaque body whose death,
       or whose cape emote, fades it - still has to blend, so `transparent`
       stays on for it, but it keeps its depth buffer: not one of its faces is
       see-through until the animation says so, and without the buffer the draw
       order alone decides every pixel, which is what left every cape behind
       the legs (see `opaqueFaces`). */
    mat.transparent = true;
    /* The third case (see `solidDepth`) is the one this note is really about: a
       model with a handful of stray see-through panes among hundreds of solid
       faces is drawn with the buffer on for everything but the panes, which get
       a material of their own further down. */
    mat.depthWrite = !blended || solidDepth;
  }
  /* One material per (opacity pass, texture slot) *run* of the buffer, and one
     geometry group per run so three.js knows which faces belong to which. A
     textured face's vertex colours are the grey light multiplier written below
     (the same one src/locmodels.js gives a textured loc face): the cache's
     texture already carries the colour, so the face only supplies its shading.

     Most models have one pass, and then this is exactly the layout it always
     was: the plain material, then one per texture, in the slot order the face
     re-order above used. A model with stray panes has two: the solid faces in
     the same slots, and then the panes, whose materials are the plain and
     textured ones again but blended and with no depth write (see `solidDepth`).
     Group order is draw order, so the panes land on top of every solid face
     whichever order the cache authored them in - which is what a pane the cache
     means to be seen through wants. */
  const slotCount = texUsed ? texUsed.length + 1 : 1;
  const passes = strayFrom > 0 ? 2 : 1;
  let materials = mat;
  if (passes > 1 || (texUsed && texUsed.length)) {
    materials = [];
    for (let pass = 0; pass < passes; pass++) {
      for (let s = 0; s < slotCount; s++) {
        if (pass === 0 && s === 0) { materials.push(mat); continue; }
        const t = s === 0 ? null : charTextures.get(texUsed[s - 1]);
        const tm = new THREE.MeshBasicMaterial(t ? Object.assign({}, matOpts, { map: t }) : matOpts);
        if (m.tint != null) tm.color.setHex(m.tint);
        if (hasAlpha) { tm.transparent = true; tm.depthWrite = pass === 0 && (!blended || solidDepth); }
        materials.push(tm);
      }
    }
    /* The runs are counted off the faces that are really drawn, in the order
       the buffer is written, so a face the coincident-duplicate pass dropped
       cannot leave a gap in a group (see buildMesh), and a slot a pass does not
       reach simply gets no group. */
    const counts = new Int32Array(slotCount * passes);
    for (let oi = 0; oi < drawCount; oi++) {
      const f = drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi);
      const pass = strayFrom > 0 && oi >= strayFrom ? 1 : 0;
      counts[pass * slotCount + (texSlots ? texSlots[f] : 0)]++;
    }
    let start = 0;
    for (let k = 0; k < counts.length; k++) {
      const n = counts[k];
      if (n) geom.addGroup(start, n * 3, k);
      start += n * 3;
    }
  }
  if (coverArr) for (const sm of (Array.isArray(materials) ? materials : [materials])) applyCoverBias(sm);
  const mesh = new THREE.Mesh(geom, materials);
  mesh.frustumCulled = true;
  /* What the interface paper-doll frames this model with (src/scene.js#
     drawDoll): the authored box, in the mesh's own convention, with the same
     generous minimums the doll has always used (a touch under a tile wide and
     most of a tile tall, so a small or thin model is still framed sensibly). */
  mesh.userData.measure = {
    hgt: Math.max(0.8, maxY - minY),
    wid: Math.max(0.9, Math.max(Math.abs(minX), Math.abs(maxX)) * 2),
    minY,
  };

  const update = function update(dt, opts) {
    const o = opts || {};
    /* Remember the request. A mesh is not skinned until this runs once (the
       vertex buffer starts all zeros), so whoever swaps the geometry under a
       character - setPlayerAppearance, setWorn - replays these same options
       with no time passing to leave the new mesh posed exactly as the old one
       was (src/models3d.js#makeModelCharacter's `repose`). */
    this._lastOpts = o;
    /* A swing is a one-shot: the game raises `attack` for a moment, but the
       sequence has to keep playing after that flag decays (and must not loop),
       so the swing's remaining time is tracked here. `attackAnim` names the
       sequence to use - the weapon's fight-type animation, see
       src/items.js#attackAnimFor.

       `cast` names a casting sequence the same way (see
       src/tools/cache-bake/bake.mjs#CAST_ANIMS). `oneShot` marks the caller as
       one that keeps asking for the same sequence forever - a spell graphic in
       src/gfx.js, whose single authored sequence must play once and hold rather
       than start over. */
    const castName = o.cast && m.anims[o.cast] ? o.cast : null;
    const want = castName || (o.attack > 0
      ? (o.attackAnim && m.anims[o.attackAnim] ? o.attackAnim : (m.anims.attack ? "attack" : null))
      : null);
    const restarted = o.oneShot && castName && this._castPlayed === castName;
    /* A swing's request is a *moment* (`o.attack` decays back to zero), so the
       model can use "has the one-shot run out?" to know a fresh swing is due.
       A cast is not: the caller keeps asking for the pose for the whole cast
       (game.js#playerCastAnim), and that request outlives the sequence by up to
       a game tick - so when the sequence finished, `_swingLeft` hit zero and
       the still-raised request re-armed it, restarting the pose from the top.
       The caster visibly gathered the spell a second time the instant the
       missile left his hands. To tell "a new cast" from "the same cast still
       being asked for", each cast carries a token the caller bumps when a cast
       actually begins (game.js#playCastAnim); a cast pose is only armed when
       the token changes. A tokenless caller keeps the old one-shot rule. */
    /* A melee swing carries its own token exactly like a cast: the request flag
       outlives short sequences (a 600 ms tick against the greataxe's 0.44 s),
       so "has the one-shot run out" alone re-armed the swing mid-flag and every
       blow played twice. A new token means a new swing; the same token held
       across frames never re-arms. Tokenless callers keep the old rule. */
    const token = castName
      ? (o.castToken != null ? o.castToken : null)
      : (o.attackToken != null ? o.attackToken : null);
    let freshSwing = false;
    if (want && !restarted) {
      const due = token != null
        ? (castName ? this._castToken !== token : this._swingToken !== token)
        : (this._swing !== want || !(this._swingLeft > 0));
      if (due) {
        this._swing = want;
        this._swingLeft = m.anims[want].totalTicks * (TICK_MS / 1000);
        /* A *looping* work pose (the woodcutting swing - one 0.8 s chop that
           the client repeats for as long as the player keeps chopping) is the
           one pose whose length is shorter than the activity's own cycle, so
           it may not simply play out and drop: while its caller keeps asking
           for it, it is held and re-looped instead (see the swing branch
           below). Spells and every one-shot swing leave `castLoop` unset.

           `castTail` (src/game.js#playCastAnim) asks for the wrap to be entered
           at the sequence's *final* frame rather than at its first. The clock
           below is what normally does the entering - the reset at `animTime = 0`
           - and these work sequences all open on a short reaching pose (the
           mining swing's first four frames are the lean and reach out to the
           rock, 16 of its 439 cycles) and settle back in their last frame to the
           stance the body was already standing in, so entering at frame 0 shows
           the swing already reaching out. Entering at the last frame instead
           draws that rest pose first and then runs the whole wind-up and strike,
           which is what the user asked for (see src/actions.js#workAnim). */
        this._swingLoop = !!(castName && o.castLoop);
        this._swingTail = !!(castName && o.castLoop && o.castTail);
        if (castName) this._castPlayed = castName;
        if (token != null) {
          if (castName) this._castToken = token;
          else this._swingToken = token;
        }
        freshSwing = true;
      }
    }
    /* The loop is owned by the request: the moment the caller stops asking for
       it (the tree fell, the pack filled), the pose ends - not at the end of
       whichever loop it happened to be in. */
    if (this._swingLoop && castName !== this._swing) { this._swingLoop = false; this._swingTail = false; this._swingLeft = 0; }
    /* Death is a one-way, non-looping sequence: once requested the character
       stops obeying movement/attack flags, the fall plays through exactly
       once, and the body is then taken off screen (src/game.js#updateVisuals
       watches `fallDone` for that). The pose stops at the last frame that
       still shows the whole body - the cache ends a death by squashing the
       model away, see deathBodyFrames - while the clock still runs the
       sequence's full authored length, so the body lies dead for exactly as
       long as it always did. That makes the sequence's final frame the "the
       body is gone now" mark: the fall is over when offs[nFrames - 2]
       arrives. (Animal deaths spend that tail squashing to nothing; every
       human model holds its lying pose there instead, tagged with a gigantic
       delay - typically 20000 cycles, see src/tools/cache-bake/README.md.) */
    const deathSlot = typeof o.death === "string" ? o.death : "death";
    /* latch even when the creature has no authored death sequence (the
       lesser/greater demon) - the fallback tilt below still needs to know it is
       dying */
    if (o.death) this._dying = m.anims[deathSlot] ? deathSlot : true;
    /* An emote (src/emotes.js, played by src/game.js#playEmote). It is the
       lowest-priority pose there is, and the only one the *caller* can cut
       short: the client's rule is that anything else the character does - a
       step, a swing, a spell, an action - ends the emote on the spot, so the
       request simply stops arriving and the pose must stop with it. That is why
       this is not a latched one-shot like a swing: `o.emote` is the whole
       truth, and movement outranks it below even if a caller forgets to drop
       it (a ghost whose packets have not caught up with its feet).
       It is still restarted by token, for the other half of the client's rule:
       pressing the same emote again plays it from the top rather than leaving
       it wherever the first press had got to. */
    const emoteName = o.emote && m.anims[o.emote] ? o.emote : null;
    let freshEmote = false;
    if (emoteName) {
      const etok = o.emoteToken != null ? o.emoteToken : null;
      const emoteDue = etok != null ? this._emoteToken !== etok : this._emote !== emoteName;
      if (emoteDue) {
        this._emote = emoteName;
        if (etok != null) this._emoteToken = etok;
        freshEmote = true;
      }
    } else {
      this._emote = null;
    }
    let name;
    if (this._dying && m.anims[this._dying]) {
      name = this._dying;
    } else if (this._dying) {
      /* no death sequence in the cache for this creature (the lesser and
         greater demon) - fall back to toppling the mesh over and holding
         there, below */
      name = m.anims.stand ? "stand" : Object.keys(m.anims)[0];
    } else if (this._swingLeft > 0 || (this._swingLoop && castName === this._swing)) {
      /* A one-shot swing counts down and drops; a looping work pose (see the
         `_swingLoop` note where it is armed) does not - it is held and the
         sequence clock below wraps it, so the chop repeats back to back for
         as long as the activity keeps the request raised. */
      if (!this._swingLoop) this._swingLeft -= dt;
      name = this._swing;
    } else if (o.turn && m.anims[o.turn]) name = o.turn;
    else if (o.moving && o.running && m.anims.run) name = "run";
    else if (o.moving && m.anims.walk) name = "walk";
    else if (emoteName) name = emoteName;
    else if (m.anims.stand) name = "stand";
    else if (m.anims.walk) name = "walk";
    else name = Object.keys(m.anims)[0];
    if (!name) return;
    const anim = m.anims[name];
    if (!anim) return;
    /* The clock resets when the pose changes - and also when a fresh one-shot
       swing is armed over a pose *of the same name*. A second cast of the same
       spell posts the same animation name, so without that second half the new
       pose would drop in at whatever phase the previous one had reached: the
       gather would be half over before the cast began and the missile would
       leave the hands in the middle of an unrelated wind-up.

       A fresh arm carrying `_swingTail` starts the clock at the *start of the
       sequence's last frame* instead of at zero - the "enter the work loop where
       it returns to rest" rule spelled out where `_swingTail` is armed. It is
       still a reset (the same reset), just to a different point of the cycle. */
    if (name !== this.animName || (freshSwing && name === this._swing) || freshEmote) {
      this.animName = name;
      const tailStart = freshSwing && this._swingTail && name === this._swing;
      this.animTime = tailStart
        ? (anim.totalTicks - (anim.lengths[anim.lengths.length - 1] || 0)) * (TICK_MS / 1000)
        : 0;
    }
    /* Locomotion (walk/run) is advanced by distance travelled rather than by
       wall-clock time: the client authors a cycle to cover a fixed stretch of
       ground, so driving it from the ground the model actually covered keeps
       the feet planted no matter how fast the actor is moving. That stretch
       scales with the gait - running covers 2 tiles per 600ms tick where
       walking covers 1 - so the tiles-per-cycle has to be scaled by the same
       factor, otherwise a run sequence would be replayed a third too fast.
       At the authored speeds this works out to real-time playback: 600ms of
       animation per tile walked, 300ms per tile run. */
    const loopSeconds = anim.totalTicks * (TICK_MS / 1000);
    if ((name === "walk" || name === "run") && o.dist != null) {
      const speed = name === "run" ? RUN_TILES_PER_TICK : 1;
      const tilesPerLoop = (this.tilesPerLoop = loopSeconds / TICK_SECONDS * speed);
      this.animTime += loopSeconds * (o.dist / tilesPerLoop);
    } else {
      /* `rate` plays the sequence faster (>1) or slower (<1) than authored -
         the caller's whole clock runs fast, so a graphic hurried along still
         ends exactly when it finishes (src/gfx.js#play divides the lifetime by
         the same rate). Absent, the clock runs at the authored speed. */
      this.animTime += dt * (o.rate || 1);
    }

    let ticks = this.animTime / (TICK_MS / 1000);
    const total = anim.totalTicks;
    const nFrames = anim.lengths.length;
    const offs = anim.tickOffsets;
    /* `reverse` reads the very same sequence backwards: the clock is mirrored,
       so the frame walk below plays the frames from last to first (and each one
       in reverse within itself, because `prog` climbs towards the frame the walk
       is leaving) and the sequence settles on frame 0 instead of the last one.
       The teleport's arrival bubble is the one caller (src/actions.js#teleportJump
       plays the vanish's own spotanim this way), and only a `hold` sequence can
       be reversed - on a looping one the mirrored clock would run out of both
       ends of the wrap. */
    const rev = !!o.reverse;
    if (rev) ticks = total - ticks;
    /* `hold` marks a sequence the caller plays once and then drops - a live
       spell graphic (src/gfx.js plays every one with `hold`). Such a sequence
       must NOT be looped: the content authors its tail deliberately (see
       src/tools/cache-bake/README.md) - windstrike_casting, the ball that
       gathers in the caster's hands, shrinks frame by frame from a 106-unit
       ball to 10 units and then holds *three zero-size frames*, so that it
       vanishes exactly on the launch cycle (51 of its 74). Looping the clock
       made the last of those frames interpolate into frame 0, growing the
       graphic from nothing back to full size 0.4s after the missile had left
       the caster's hands - a bubble popping on the *caster* a beat after the
       spell had already burst on the victim. Clamping instead of wrapping
       plays the sequence through exactly once and holds its final pose.
       Locomotion and the travelling missiles (src/gfx.js#projectile) are
       genuinely cyclic and keep the wrap.

       An emote holds for the same reason and one more: its sequence ends by
       settling back into the idle pose (the client authors every emote that
       way), so clamping holds the character in the idle pose for the frame or
       two between the sequence's end and the caller dropping the request - and
       never, ever wraps a "yes" nod round to the start mid-emote. */
    /* `castClamp` is a *cast* the caller wants held rather than wrapped, for a
       sequence whose own first frame is a pose the caster must never snap back
       to: `cast_arrive` (715, the teleport's arrival) opens on the 20/128
       scale its vanish ended on, so wrapping its tail blended the character
       from full size down to a fifth of it in the sequence's last 60ms and
       then snapped to idle - see src/actions.js#teleportJump, which is the one
       caller that sets it. */
    const hold = !!o.hold || !!emoteName || !!o.castClamp;
    const dyingSeq = !!(this._dying && name === this._dying);
    /* A death ends with the body squashed away in the cache - see
       deathBodyFrames. The sequence is still allowed to run its full authored
       length, so the body lies there for exactly as long as the fall was always
       going to take; it is only the *pose* that stops at the last full-size
       frame instead of blending into the frames that take the body apart. */
    const bodyFrames = dyingSeq ? deathBodyFrames(anim, m) : nFrames;
    const lastBodyFi = bodyFrames - 1;
    /* ...and the alpha stops at the last frame the sequence had not *faded* the
       body on, which for a death the clamp really holds on is a different frame
       - see deathSolidFrames. The pose is the collapse, the alpha is the body
       still whole, so the held corpse is the cache's fallen pose in the cache's
       own colours instead of a body frozen half-way through its own fade. */
    const lastSolidFi = (dyingSeq ? deathSolidFrames(anim, m) : nFrames) - 1;
    /* When the corpse goes: the instant the last frame the body is *whole* in is
       done. Everything past that frame is the cache author's take-the-body-away
       tail - not a pose at all but a fade (the giants ramp the whole body from
       opaque to invisible over their last eleven frames, a 2.1 s dissolve; the
       skeleton and the zombie crumble the same way), which the clamp already
       withholds - so there is nothing left to show but a body waiting to be
       removed. The death therefore takes exactly as long as its fall, its own
       authored beats included (`offs` is cumulative, so `offs[bodyFrames - 1]`
       is the end of that frame's own delay), and no second beat is invented on
       top of the cache's timing.

       It used to run on to the sequence's own "arrival at the lying pose" frame
       and then hold, first for the whole authored tail and then (from the
       sixty-sixth report) for one capped beat past it. Both were the same
       mistake at different sizes: the tail is a fade, so the corpse sat on the
       ground doing nothing. The user's reports, 2026-09-26: *"the dead giant is
       remaining for too long"*, and then *"still just about a tick or 2 too
       long"* - which was the last 600 ms of hold plus the 180 ms between the
       last whole frame and the first frame of the fade. Measured on the compiled
       models, the giants went at 2.58 s and now go at 1.80 s (a tick and a
       quarter sooner), the three skeletons at 2.40 s → 1.90 s and the four
       zombies at 3.40 s → 3.00 s; every one of the other 95 deaths was already
       going at the end of its last whole frame and is untouched to the
       hundredth. A death with no fade tail at all (`bodyFrames === nFrames`,
       where the tail *is* the cache's own lying pose and there is nothing to
       skip) keeps `naturalEnd`. */
    const naturalEnd = offs[nFrames - 2] || 0;
    const deadEnd = bodyFrames < nFrames ? (offs[bodyFrames - 1] || naturalEnd) : naturalEnd;
    const terminal = (this._dying && name === this._dying && ticks >= deadEnd)
      || (hold && (rev ? ticks <= 0 : ticks >= total));
    /* Did the fall land? A dying creature is taken off screen the instant its
       death sequence reaches the lying pose it never leaves (the terminal
       keyframe, see the latch note above), rather than the frame it was hit
       - the render loop watches this flag (src/game.js#updateVisuals). The
       procedural topple below reports the same thing once its 0.7s is up. */
    if (this._dying && name === this._dying) this.fallDone = terminal;
    const t = terminal ? 0 : (hold ? ticks : ticks % total);
    /* the clamped pose is the sequence's own end - its last frame read
       forwards, its first read backwards */
    let fi = terminal ? (rev ? 0 : nFrames - 1) : 0;
    if (!terminal) {
      while (fi < nFrames - 1 && t >= offs[fi]) fi++;
    }
    if (fi > lastBodyFi) fi = lastBodyFi;
    const start = fi === 0 ? 0 : offs[fi - 1];
    const dur = anim.lengths[fi] || 1;
    let prog = terminal ? (rev ? 0 : 1) : (t - start) / dur;
    if (prog < 0) prog = 0; else if (prog > 1) prog = 1;
    /* the interpolation target wraps for a looping sequence and clamps on the
       final frame of a held one, so a one-shot never blends its last frame
       back into its first - and a death never blends into the frames that take
       the body apart, so the body stays whole until it is removed */
    const nextFi = Math.min(
      terminal ? fi : (fi + 1 < anim.frames.length ? fi + 1 : (hold ? fi : 0)),
      lastBodyFi,
    );

    const pa = getPose(m, name, fi);
    const pb = nextFi === fi ? pa : getPose(m, name, nextFi);

    /* vertex-space interpolation: always reaches the true keyframe pose at
       prog=1, and never distorts when consecutive frames key different bones
       (which is the norm - frames list only the bones they move).

       `RenderOptions.frameInterpolation` is the player's own switch for this
       (src/renderopts.js, on by default since 2026-09-20): on, the two poses
       are blended as before. Off, the blend is pinned to the frame's start, so
       each keyframe is shown flat for its own delay and the next one snaps in -
       the client's sequencer, which this world is also meant to be able to look
       like. `flat` is a per-call opt-out for the same: a caller that wants the
       client's own sequencer look (each keyframe held flat for its own delay,
       the next snapping in - the dialogue heads play this way) sets it and
       the global switch is skipped for that pose. */
    const blend = (RenderOptions.frameInterpolation && !o.flat) ? prog : 0;

    /* Per-face alpha for this instant. The model's authored alpha array is the
       *base* and a framemap's type-5 entries add to it (the client does the same
       in Model.applyTransform: `faceAlphas[face] += x * 8`, clamped at each
       step), so a burst authored to fade in, flare and fade out can be one
       graphic playing one sequence. Frame-to-frame the values are blended the
       same way the vertex poses are, which keeps the fade smooth; with the
       player's frame-interpolation switch off both this and the pose snap from
       keyframe to keyframe, exactly like the client. */
    if (alphaFaces) {
      const aFi = fi < lastSolidFi ? fi : lastSolidFi;
      const aNextFi = nextFi < lastSolidFi ? nextFi : lastSolidFi;
      alphaFrameInto(alphaSrc, alphaFaces, anim.frames[aFi], anim.fm, alphaWork);
      if (aNextFi !== aFi) {
        alphaFrameInto(alphaSrc, alphaFaces, anim.frames[aNextFi], anim.fm, alphaWorkB);
        for (let i = 0; i < fcount; i++) {
          const a = alphaWork[i], b = alphaWorkB[i];
          alphaWork[i] = (a + (b - a) * blend) | 0;
        }
      }
    }
    const ax = pa.x, ay = pa.y, az = pa.z, bx = pb.x, by = pb.y, bz = pb.z;
    const up = 1 - blend;
    const vcount = m.vcount;
    ensurePoseBuffer(vcount * 3);
    for (let i = 0; i < vcount; i++) {
      const rx = ax[i] * up + bx[i] * blend;
      const ry = ay[i] * up + by[i] * blend;
      const rz = az[i] * up + bz[i] * blend;
      poseBuf[i * 3] = rx * scaleX;
      poseBuf[i * 3 + 1] = (footY - ry) * scaleY;
      poseBuf[i * 3 + 2] = -rz * scaleZ;
    }
    /* The shield's equip pulse (see setWorn): while it runs, the shield's
       verts scale about their own centroid - the grip at the shield's centre -
       so the rim pulses outward from the hand and settles, once, and then the
       flag clears and the shield is simply worn. */
    if (this._shieldPulse && this._shieldPulse.t < SHIELD_PULSE_SEC) {
      const sp = this._shieldPulse;
      sp.t += dt;
      const t = Math.min(1, sp.t / SHIELD_PULSE_SEC);
      const e = 1 - Math.pow(1 - t, 3);
      const s = 0.25 + 0.75 * e + 0.12 * Math.sin(Math.PI * t) * (1 - t);
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < sp.count; k++) {
        const vi = (sp.start + k) * 3;
        cx += poseBuf[vi]; cy += poseBuf[vi + 1]; cz += poseBuf[vi + 2];
      }
      cx /= sp.count; cy /= sp.count; cz /= sp.count;
      for (let k = 0; k < sp.count; k++) {
        const vi = (sp.start + k) * 3;
        poseBuf[vi] = cx + (poseBuf[vi] - cx) * s;
        poseBuf[vi + 1] = cy + (poseBuf[vi + 1] - cy) * s;
        poseBuf[vi + 2] = cz + (poseBuf[vi + 2] - cz) * s;
      }
      if (t >= 1) this._shieldPulse = null;
    }

    /* --- lighting ---------------------------------------------------------

       A model carrying spotanim light settings is lit the way the client lights
       a spotanim: the light direction is fixed in model space, and each *vertex*
       carries its own shade (the client averages the surrounding face normals
       per vertex, so a low-poly flame gets a smooth dark-to-bright gradient
       across it). Everything else - characters, scenery, held items - keeps the
       camera-relative directional light with the gamma palette that the
       character look was tuned against. */
    let lx = 0, ly = 0, lz = 0, litNrm = null, litCnt = null;
    if (clientLight) {
      ensureNormalBuffers(vcount);
      litNrm = normalBuf; litCnt = normalCnt;
      litNrm.fill(0, 0, vcount * 3); litCnt.fill(0, 0, vcount);
      /* only the faces that are actually drawn: a spotanim's vertex shading is
         an average of the faces around it, and a face left out by the
         coincident-duplicate pass (see buildMesh) is not one of them */
      for (let oi = 0; oi < drawCount; oi++) {
        const f = drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi);
        const i0 = outSrc[f * 3], i1 = outSrc[f * 3 + 1], i2 = outSrc[f * 3 + 2];
        const ax = poseBuf[i0 * 3], ay = poseBuf[i0 * 3 + 1], az = poseBuf[i0 * 3 + 2];
        const bx = poseBuf[i1 * 3], by = poseBuf[i1 * 3 + 1], bz = poseBuf[i1 * 3 + 2];
        const cx = poseBuf[i2 * 3], cy = poseBuf[i2 * 3 + 1], cz = poseBuf[i2 * 3 + 2];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (cz - az) * (bx - ax);
        let nz = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        /* the client normalises every face normal to length 256 and sums them
           into its vertices; keeping that scale makes the divisor below the
           same one the client divides by (`magnitude * count`) */
        const s = 256 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        nx *= s; ny *= s; nz *= s;
        litNrm[i0 * 3] += nx; litNrm[i0 * 3 + 1] += ny; litNrm[i0 * 3 + 2] += nz;
        litNrm[i1 * 3] += nx; litNrm[i1 * 3 + 1] += ny; litNrm[i1 * 3 + 2] += nz;
        litNrm[i2 * 3] += nx; litNrm[i2 * 3 + 1] += ny; litNrm[i2 * 3 + 2] += nz;
        litCnt[i0]++; litCnt[i1]++; litCnt[i2]++;
      }
    } else {
      lightInModel(o.camYaw || 0, o.camPitch == null ? 0.94 : o.camPitch, o.dir || 0, lightScratch);
      lx = lightScratch.x; ly = lightScratch.y; lz = lightScratch.z;
    }

    const colStride = hasAlpha ? 12 : 9;
    /* Faces are walked in `faceOrder` when the model carries textures, so each
       material's faces are one contiguous run of the buffer (see the slot
       setup above). With no textures this is the plain 0..fcount order. */
    const uvAttr = uvArr ? geom.attributes.uv : null;
    const wantUV = uvArr && !this._uvDone;
    /* The ring shields' hit flash, burning down per rendered frame: `s` is the
       fade position, 1 on the frame the blow lands and 0 when it is over. */
    let shieldFlashS = 0;
    let shieldFlashK = 0;
    let shieldFlashF = 0;
    let shieldFlashR = 0;
    if (this._shieldFlashT > 0) {
      if (!shieldFlashLin) {
        shieldFlashLin = [lin(SHIELD_FLASH_SRGB[0] / 255), lin(SHIELD_FLASH_SRGB[1] / 255), lin(SHIELD_FLASH_SRGB[2] / 255)];
      }
      shieldFlashS = Math.min(1, this._shieldFlashT / SHIELD_FLASH_SEC);
      this._shieldFlashT = Math.max(0, this._shieldFlashT - dt);
    }
    const shieldFace = shieldFlashS > 0 ? this._shieldFace : null;
    const shieldFill = this._shieldFill;
    /* The staff flame's clock: seconds since the mesh was built, so the
       prong flicker below shimmers even while the wielder stands still. */
    this._flameT = (this._flameT || 0) + dt;
    const flameT = this._flameT;
    if (shieldFace) {
      const amt = Math.min(1, Math.max(0, this._shieldFlashAmt || 0));
      const amtDmg = amt * 99;
      shieldFlashK = shieldFlashS * (amtDmg >= 5 ? 1 : 0.85 + 0.03 * amtDmg);
      shieldFlashF = shieldFlashS * (0.15 + 0.85 * amt);
      shieldFlashR = shieldFace.discEdge + (shieldFace.maxR - shieldFace.discEdge) * amt;
    }
    /* `drawFaces` (see buildMesh) is the face order with the coincident
       duplicates already taken out, and it is also what the buffer was sized
       for; the two plain fallbacks are the untouched orders. */
    for (let oi = 0; oi < drawCount; oi++) {
      const f = drawFaces ? drawFaces[oi] : (faceOrder ? faceOrder[oi] : oi);
      const i0 = outSrc[f * 3], i1 = outSrc[f * 3 + 1], i2 = outSrc[f * 3 + 2];
      const a = i0 * 3, b = i1 * 3, c2 = i2 * 3;
      const axp = poseBuf[a], ayp = poseBuf[a + 1], azp = poseBuf[a + 2];
      const bxp = poseBuf[b], byp = poseBuf[b + 1], bzp = poseBuf[b + 2];
      const cxp = poseBuf[c2], cyp = poseBuf[c2 + 1], czp = poseBuf[c2 + 2];
      const o0 = oi * 9, co = oi * colStride;
      /* the three corners' colour slots (the colour array is 3 wide with no
         alpha and 4 wide with one) */
      const oA = co, oB = co + (hasAlpha ? 4 : 3), oC = co + (hasAlpha ? 8 : 6);

      if (clientLight) {
        const cA = clientLitColour(colors[f], clientLight.mod, clientLight.mag, litNrm, litCnt, i0);
        const cB = clientLitColour(colors[f], clientLight.mod, clientLight.mag, litNrm, litCnt, i1);
        const cC = clientLitColour(colors[f], clientLight.mod, clientLight.mag, litNrm, litCnt, i2);
        colorArr[oA] = cA[0]; colorArr[oA + 1] = cA[1]; colorArr[oA + 2] = cA[2];
        colorArr[oB] = cB[0]; colorArr[oB + 1] = cB[1]; colorArr[oB + 2] = cB[2];
        colorArr[oC] = cC[0]; colorArr[oC + 1] = cC[1]; colorArr[oC + 2] = cC[2];
      } else {
        const e1x = bxp - axp, e1y = byp - ayp, e1z = bzp - azp;
        const e2x = cxp - axp, e2y = cyp - ayp, e2z = czp - azp;
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const dot = (nx * lx + ny * ly + nz * lz) / len;
        let level = ((dot * 0.5 + 0.5) * (LIGHT_LEVELS - 1) + 0.5) | 0;
        if (level < 0) level = 0; else if (level > LIGHT_LEVELS - 1) level = LIGHT_LEVELS - 1;

        const pal = palettes[faceHslIdx[f]];
        const cr = pal[level * 3], cg = pal[level * 3 + 1], cb = pal[level * 3 + 2];
        colorArr[oA] = cr; colorArr[oA + 1] = cg; colorArr[oA + 2] = cb;
        colorArr[oB] = cr; colorArr[oB + 1] = cg; colorArr[oB + 2] = cb;
        colorArr[oC] = cr; colorArr[oC + 1] = cg; colorArr[oC + 2] = cb;
        /* A textured face hands its colour over to the cache's own texture: the
           palette entry (127 white, the parser's placeholder) is replaced by the
           face's *light level* as a grey multiplier, so the texture carries the
           colour and the face carries its shading - the same trade
           src/locmodels.js#buildLocGeometry makes for textured scenery. */
        if (texSlots && texSlots[f]) {
          const g = lin(0.58 + (level / (LIGHT_LEVELS - 1)) * 0.44);
          colorArr[oA] = g; colorArr[oA + 1] = g; colorArr[oA + 2] = g;
          colorArr[oB] = g; colorArr[oB + 1] = g; colorArr[oB + 2] = g;
          colorArr[oC] = g; colorArr[oC + 1] = g; colorArr[oC + 2] = g;
          if (wantUV) {
            /* Where on the texture this face samples. The cache stores, per
               textured face, a triangle of extra *texture vertices* whose
               projected positions are the face's texture coordinates; they are
               not decoded yet, so the face is projected along its own dominant
               axis instead - the same fallback src/locmodels.js uses for
               scenery. The projection is phased at the model's own corner and
               repeats every CHAR_TEX_TILES tiles, and the texture wraps, so a
               sheet bigger than one repeat simply tiles rather than stretching.

               **The vertical axis is mirrored (`maxY - y`, not `y - minY`)**,
               because the client's own v runs *down* the screen while this
               projection's v runs *up* the model: every mesh here is built from
               the cache's y, which grows downward, flipped into three.js's
               up-positive y (see the vertex transform above), and the client's
               texture coordinates are the projected - i.e. screen-space -
               positions of those texture vertices, so its v and our v point
               opposite ways. A tiling magma sheet hides the mirror in the static
               picture (which is why it went unnoticed), but it does not hide the
               *animation*: the client shifts every animated texture toward
               increasing v (src/scene.js#update, and Texture.animate in the
               client: direction 1 negates the shift, giving content that moves
               toward increasing row), so the fire cape's lava has to run the same
               way the water does - down the screen. With v phased off the feet
               the cape's lava ran up it, which is the "fire cape animation is
               upside down" the user reported. */
            const fnx = (byp - ayp) * (czp - azp) - (bzp - azp) * (cyp - ayp);
            const fny = (bzp - azp) * (cxp - axp) - (czp - azp) * (bxp - axp);
            const fnz = (bxp - axp) * (cyp - ayp) - (cxp - axp) * (byp - ayp);
            const fax = Math.abs(fnx), fay = Math.abs(fny), faz = Math.abs(fnz);
            const tiles = CHAR_TEX_TILES[faceTex[f]] || 1;
            const px = [axp, bxp, cxp], py = [ayp, byp, cyp], pz = [azp, bzp, czp];
            for (let k = 0; k < 3; k++) {
              let u, v2;
              if (fay >= fax && fay >= faz) { u = px[k] - minX; v2 = pz[k] - minZ; }
              else if (fax >= faz) { u = pz[k] - minZ; v2 = maxY - py[k]; }
              else { u = px[k] - minX; v2 = maxY - py[k]; }
              uvArr[(oi * 3 + k) * 2] = u / tiles;
              uvArr[(oi * 3 + k) * 2 + 1] = v2 / tiles;
            }
          }
        }
      }
      if (hasAlpha) {
        /* cache convention: 0 = opaque, 255 = invisible */
        const ca = (256 - (alphaFaces ? alphaWork[f] : alphaSrc[f])) / 256;
        colorArr[oA + 3] = ca; colorArr[oB + 3] = ca; colorArr[oC + 3] = ca;
      }
      /* The flash lands only on the shield's lit region: every lit corner
         walks the same fraction toward the pale warm target, so the region
         fills with light and falls back to its own colours as `s` burns down. */
      if (shieldFace && f >= shieldFace.start && f < shieldFace.start + shieldFace.count && (shieldFace.mask[f - shieldFace.start] || shieldFace.radii[f - shieldFace.start] <= shieldFlashR)) {
        const fr = shieldFlashLin[0], fg = shieldFlashLin[1], fb = shieldFlashLin[2];
        colorArr[oA] += (fr - colorArr[oA]) * shieldFlashK;
        colorArr[oA + 1] += (fg - colorArr[oA + 1]) * shieldFlashK;
        colorArr[oA + 2] += (fb - colorArr[oA + 2]) * shieldFlashK;
        colorArr[oB] += (fr - colorArr[oB]) * shieldFlashK;
        colorArr[oB + 1] += (fg - colorArr[oB + 1]) * shieldFlashK;
        colorArr[oB + 2] += (fb - colorArr[oB + 2]) * shieldFlashK;
        colorArr[oC] += (fr - colorArr[oC]) * shieldFlashK;
        colorArr[oC + 1] += (fg - colorArr[oC + 1]) * shieldFlashK;
        colorArr[oC + 2] += (fb - colorArr[oC + 2]) * shieldFlashK;
      }
      /* The superior staff's living flame: its three band colours shimmer in
         brightness and opacity on three incommensurate sines, phased per face
         by the golden angle so the prong ripples instead of pulsing as one. */
      if (hasAlpha && STAFF_FLAME_COLS.has(colors[f])) {
        const ph = (f * 2.39996) % 6.28318;
        const w = Math.sin(flameT * 11 + ph) * 0.5 + Math.sin(flameT * 23 + ph * 1.7) * 0.3 + Math.sin(flameT * 5 - ph) * 0.2;
        const k = 1 + w * 0.28;
        colorArr[oA] *= k; colorArr[oA + 1] *= k; colorArr[oA + 2] *= k;
        colorArr[oB] *= k; colorArr[oB + 1] *= k; colorArr[oB + 2] *= k;
        colorArr[oC] *= k; colorArr[oC + 1] *= k; colorArr[oC + 2] *= k;
        const ka = 1 + w * 0.18;
        colorArr[oA + 3] *= ka; colorArr[oB + 3] *= ka; colorArr[oC + 3] *= ka;
      }

      /* The hit-fill fan never draws in the main mesh: it collapses onto its
         own centre corner every frame, and the flash overlay (a transparent
         mesh fed these same corners, see setWorn) is what shows the hit. */
      if (shieldFill && f >= shieldFill.start && f < shieldFill.start + shieldFill.count) {
        let hxp = cxp, hyp = cyp, hzp = czp;
        if (i0 === shieldFill.c0 || i0 === shieldFill.c1) { hxp = axp; hyp = ayp; hzp = azp; }
        else if (i1 === shieldFill.c0 || i1 === shieldFill.c1) { hxp = bxp; hyp = byp; hzp = bzp; }
        const jo = (f - shieldFill.start) * 9, fa = shieldFill.posArr;
        fa[jo] = axp; fa[jo + 1] = ayp; fa[jo + 2] = azp;
        fa[jo + 3] = bxp; fa[jo + 4] = byp; fa[jo + 5] = bzp;
        fa[jo + 6] = cxp; fa[jo + 7] = cyp; fa[jo + 8] = czp;
        positions[o0] = hxp; positions[o0 + 1] = hyp; positions[o0 + 2] = hzp;
        positions[o0 + 3] = hxp; positions[o0 + 4] = hyp; positions[o0 + 5] = hzp;
        positions[o0 + 6] = hxp; positions[o0 + 7] = hyp; positions[o0 + 8] = hzp;
      } else {
        positions[o0] = axp + (overlays ? overlays[f * 3] : 0);
        positions[o0 + 1] = ayp + (overlays ? overlays[f * 3 + 1] : 0);
        positions[o0 + 2] = azp + (overlays ? overlays[f * 3 + 2] : 0);
        positions[o0 + 3] = bxp + (overlays ? overlays[f * 3] : 0);
        positions[o0 + 4] = byp + (overlays ? overlays[f * 3 + 1] : 0);
        positions[o0 + 5] = bzp + (overlays ? overlays[f * 3 + 2] : 0);
        positions[o0 + 6] = cxp + (overlays ? overlays[f * 3] : 0);
        positions[o0 + 7] = cyp + (overlays ? overlays[f * 3 + 1] : 0);
        positions[o0 + 8] = czp + (overlays ? overlays[f * 3 + 2] : 0);
      }
    }

    /* A couple of creatures (the lesser and greater demon) have no death
       sequence anywhere in this cache revision - every priority-10 sequence on
       their skeleton raises the arms and stays standing, so it is a gesture
       rather than a fall. For those, topple the mesh over its own feet and hold
       the fallen pose. The shadow lives on `group` (not `mesh`), so it stays
       flat on the ground. */
    if (this._dying && !m.anims[this._dying]) {
      const p = Math.min(1, (this._fallT = (this._fallT || 0) + dt) / 0.7);
      const e = p * p * (3 - 2 * p);
      mesh.rotation.x = e * 1.45;
      mesh.rotation.z = e * 0.35;
      if (p >= 1) this.fallDone = true;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    /* The hit-fill overlay follows the flash: shown only while it runs, in the
       pale flash colour, going from nearly see-through on a low hitsplat to
       solid at the top end (see setWorn). */
    if (shieldFill && shieldFill.mesh) {
      shieldFill.posAttr.needsUpdate = true;
      shieldFill.mesh.visible = shieldFlashS > 0;
      shieldFill.mat.opacity = shieldFlashF;
    }
    if (wantUV) { this._uvDone = true; uvAttr.needsUpdate = true; }
  };

  /* The red damage flash: it dims green and blue to leave red showing. It is a
     creature thing (see src/game.js#updateVisuals) and spells never flash, but
     it still has to scale from the model's own base colour rather than from
     white, or calling it would wipe a tint away. With no tint the base is white
     and this is exactly the (1, 1-0.7s, 1-0.7s) it always was. */
  const flash = function flash(strength) {
    const s = Math.max(0, Math.min(1, strength || 0));
    const mats = Array.isArray(materials) ? materials : [materials];
    for (const mm of mats) mm.color.setRGB(baseR, baseG * (1 - s * 0.7), baseB * (1 - s * 0.7));
  };

  const dispose = function dispose() {
    geom.dispose();
    const mats = Array.isArray(materials) ? materials : [materials];
    for (const mm of mats) mm.dispose();
  };

  return { mesh, geom, mat, update, flash, dispose };
}

/* A character render: the body model, optionally merged with the worn models of
   the items it has equipped (its weapon *and* its armour - see
   src/tools/cache-bake/held.mjs) so they ride the body through every animation.
   `setWorn(keys)` rebuilds the merged model when the equipment changes. */
export function makeModelCharacter(key, opts) {
  const data = prepareModel(key);
  if (!data) return null;
  /* An optional material tint (a hex) that multiplies the whole model - see
     buildMesh. It is carried on the object so setWorn can put it back on the
     mesh it rebuilds for a new equipment list. A spell graphic is the only
     caller that passes one (src/gfx.js#gfxCharacter). */
  const tint = opts && opts.tint != null ? opts.tint : null;
  /* `opaque` paints the model solid whatever the cache authored, by dropping
     the per-face alpha array before the mesh is built. An alpha array is
     exactly what sends a model down buildMesh's blending path (`hasAlpha`), so
     removing it here gives the graphics the same draw every opaque model in
     the world gets: no blending, the depth buffer kept, the 3-component colour
     attribute, and none of the per-frame alpha writes. The one caller is
     src/gfx.js#OPAQUE_GFX (Saradomin Strike's bolt, which the user asked to
     stop being see-through) - see that set for why the choice is made per
     graphic id and not for the whole spellbook. */
  const opaque = !!(opts && opts.opaque);
  /* A spotanim (a spell graphic) draws both sides of every face; a body, an
     item or a piece of scenery draws one, chosen by its winding (see
     buildMesh). */
  const doubleSided = data.gfx != null;
  const compiled = compileCharacter([bodyPart(data)], data._anims, data.scale, data._anchor, axisScales(data), data.gfx != null);
  if (tint != null) compiled.tint = tint;
  if (opaque) { compiled.alpha = null; compiled.alphaLabel = null; }
  const built = buildMesh(compiled);
  const group = new THREE.Group();
  group.add(built.mesh);

  const c = {
    data,
    group,
    mesh: built.mesh,
    _tint: tint,
    isModel: true,
    isSprite: false,
    height: data.height,
    /* Which body this is, which is what decides whether worn armour is drawn
       with the male or the female cut of the item (see prepareHeld). */
    sex: opts && opts.sex ? opts.sex : modelGender(data),
    animName: null,
    animTime: 0,
    flashStrength: 0,
    _shieldFlashT: 0,
    _shieldFlashAmt: 0,
    _shieldFace: null,
    _shieldFill: null,
    _shieldFillMesh: null,
    _cursor: 0,
    _wornSig: null,
    _wornKeys: null,
    _wornOpts: null,
    _dying: false,
    _fallT: 0,
    fallDone: false,
    _castPlayed: null,
    _castToken: null,
    _swingTail: false,
    _compiled: compiled,
    update: built.update,
    flash: built.flash,
    dispose: () => { femaleWaiters.delete(c); built.dispose(); },
  };
  /* A female body wants the female cuts, and they are not downloaded until
     something needs them. Ask now, and wait in the queue so the armour is
     redrawn the moment they land (see loadHeldModelsFemale). */
  if (c.sex === "f" && !heldFemaleLoaded) {
    femaleWaiters.add(c);
    loadHeldModelsFemale();
  }

  /* Rebuild the merged model from the equipment list. `keys` is in the client's
     own equipment order (head, cape, amulet, weapon, body, shield, legs, hands,
     feet, ring - see game.js#playerWornKeys), i.e. later slots are merged over
     earlier ones, exactly as Player.getAnimatedModel does it. Keys with no baked
     worn model are silently dropped, so a cape or a ring simply does not show.
     Rebuilds only when the list actually changes, so it is safe to call every
     frame. */
  c.setWorn = function (keys, opts, force) {
    const list = [];
    const worn = [];
    const cover = [];
    const coverKeys = opts && opts.coverKeys ? opts.coverKeys : null;
    /* The keys the character is *holding* rather than wearing (see
       src/game.js#wornOptsFor) - the weapon and the shield. They get no garment
       depth bias (see COVER_Z_BIAS): they are held in front of the body, and
       their models are what the fingers close around. `heldKeys` being present
       at all is what says the caller knows which models are garments; a caller
       that does not (a bare setWorn/setHeld) gets no bias rather than a guess. */
    const heldKeys = opts && opts.heldKeys ? opts.heldKeys : null;
    /* The garments the client paints over *everything*: a cape. It shares no
       level with the armour it hangs over - see the `allCovered` note in
       src/models3d.js. A garment contest between two worn models (a cape's hem
       against a plateleg, the case the user reported as "the leg issue on the
       capes") is not a *body* contest, so the body-coverage pass cannot settle
       it and a shared bias cannot either: both surfaces would move together.
       One level apart, the cape is drawn a hair nearer the eye than the armour
       beneath it, which is what the client's own priority bands do. */
    const drapeKeys = opts && opts.drapeKeys ? opts.drapeKeys : null;
    const topKeys = opts && opts.topKeys ? opts.topKeys : null;
    const garment = [];
    for (const k of keys || []) {
      if (!k) continue;
      const d = prepareHeld(k, this.sex);
      if (!d) continue;
      list.push(k);
      worn.push(d);
      const held = !!heldKeys && heldKeys.includes(k);
      garment.push(held ? 0 : (topKeys && topKeys.includes(k) ? TOP_LEVEL : (drapeKeys && drapeKeys.includes(k) ? DRAPE_LEVEL : 1)));
      if (coverKeys && coverKeys.includes(k)) cover.push(d);
    }
    /* `opts.hideParts` names the identity-kit parts the caller is covering (see
       items.js#EQUIP_BODY_PART), `opts.headKey` the head slot's item and
       `opts.bodyKey` the body slot's; all three are part of the signature
       because the same keys can hide a different set. */
    const hidden = new Set(opts && opts.hideParts ? opts.hideParts : null);
    const headKey = opts && opts.headKey ? opts.headKey : null;
    const bodyKey = opts && opts.bodyKey ? opts.bodyKey : null;
    /* A head-slot item shares one appearance slot with the head part, so in the
       client the kit's head is simply *not in the model* while it is worn - but
       only for the closed helms carrying the baked hidesHead flag (see
       tools/blank-mask-helmfix.mjs). Everything else keeps the head, or the
       character ends up headless under a floating hat. Dropping the kit's head
       *and* the beard is what finally stops the player's face and hair poking
       through a full helm. An identity kit is the only thing carrying
       `_partOf`, so an NPC skin simply keeps its head inside the helm, as it
       always did.
       Open-face helms whose blank face mask was stripped (see
       tools/blank-mask-helmfix.mjs#maskStripped) always keep the head, and the
       kit hair crossing through the shell is stripped so no fringe pokes out
       through it. */
    let openHelmHd = null;
    if (headKey) {
      const hd = prepareHeld(headKey, this.sex);
      if (hd && hd.hidesHead) {
        hidden.add(HEAD_PART);
        hidden.add(JAW_PART);
      } else if (hd && hd.maskStripped) {
        openHelmHd = hd;
      }
    }
    /* A body-slot item whose worn model carries a **second model** takes the
       arms appearance slot as well as the body one, exactly as a head item
       takes the head slot: in the client the kit's arms are then simply *not
       in the model*, and the item's own arms/sleeves are all there is. Every
       sleeved chest piece in the cache works this way - the platebodies, the
       robes, the d'hide and Barrows tops, the granite body - while a
       chainbody, a plain robe or a studded body has no second model and keeps
       the bare kit arms, which is exactly why those show skin. Without this the
       kit arms poke out through a platebody's shoulders, and worst on a female
       body, whose narrower sleeve leaves more of the male-cut arm geometry
       uncovered. */
    if (bodyKey) {
      const bd = prepareHeld(bodyKey, this.sex);
      if (bd && bd.secondary != null) hidden.add(ARMS_PART);
    }
    const sig = list.join("|") + "|" + [...hidden].sort().join(",");
    /* Remember the request, so the female-cut load can replay it (see
       loadHeldModelsFemale) - and so `force` has something to force with. The
       signature alone cannot see the difference: the keys are identical whether
       the armour resolved to the male cut or the female one. */
    this._wornKeys = list.slice();
    this._wornOpts = opts;
    if (sig === this._wornSig && !force) return true;
    const drop = replacedBodyFaces(data, hidden.size ? [...hidden] : null);
    if (openHelmHd && data._partOf && data._colors && openHelmHd._rest && openHelmHd._faces) {
      for (const f of shellCrossingFaces(data._rest, data._faces, data.fcount, openHelmHd._rest, openHelmHd._faces, openHelmHd.fcount,
        (g) => data._partOf[g] === HEAD_PART && STRIPPED_HELM_HAIR.has(data._colors[g]))) drop.add(f);
    }
    /* Only the body-armour slots take part in the coverage test. A weapon or a
       shield is *held in front of* the body, so a face with one of them within
       COVER_EPS of it would be dropped - and the legs behind a two-hander, or
       the fingers around a dagger's grip, would vanish. Those slots cover
       nothing; they are merely held near. */
    if (cover.length) for (const f of coveredBodyFaces(data, cover)) drop.add(f);
    /* Capes over tops and bottoms. A cape's hem grazes the body and leg-slot
       models just as closely as the kit underneath, and the garment depth bias
       alone cannot settle two worn surfaces that coincide - so the worn faces
       of every top and every bottom that the cape covers are left out, the same
       one-sided test the body gets, and the cape hangs over them instead of the
       armour poking through it. A back panel faces *away* from the cloth, so
       the one-sided test cannot see it; no depth shift reaches it from an
       oblique angle either (measured: bias 12 to 26 moves nothing); and on a
       flared bell its normal points down-out past the hem opening, so no ray
       along it ever meets the cloth - the pass therefore also drops every
       back-facing panel inside the cape's bell above its hem
       (see coveredBodyFaces), where the cloth hides it from every outside
       angle. The flared skirt sides, wider than the bell, and everything below
       the hem are kept: they show beside and under the cape, exactly as the
       client paints them. */
    let capeCover = null;
    const capeUnder = opts && opts.capeUnderKeys;
    if (capeUnder && capeUnder.length && drapeKeys && drapeKeys.length) {
      const capes = [];
      for (let i = 0; i < worn.length; i++) if (drapeKeys.includes(list[i])) capes.push(worn[i]);
      if (capes.length) capeCover = capes;
    }
    const capeBell = capeCover ? capeBellHalf(capeCover) : null;
    /* The hem is the cape's lowest rest vertex (rest y grows downward, so the
       maximum). The behind-drop stops a margin above it: panels below the hem
       show legitimately under the cloth. Initialised to -Infinity so the loop
       takes the maximum; starting at Infinity never updated and the drop ate
       every back panel in the bell at any height. */
    let capeHem = -Infinity;
    if (capeCover) for (const cd of capeCover) {
      if (!cd._rest) continue;
      const r = cd._rest;
      for (let i = 1; i < r.length; i += 3) if (r[i] > capeHem) capeHem = r[i];
    }
    const parts = [bodyPart(data, drop.size ? drop : null)];
    /* The kept kit centroids the neck-column plug test (see NECK_PLUG_FRAC)
       reads: only built when a cape is actually hanging over something. */
    let keptKit = null;
    if (capeCover && data._rest && data._faces) {
      keptKit = [];
      const kr = data._rest, kf = data._faces;
      for (let i = 0; i < data.fcount; i++) {
        if (drop.has(i)) continue;
        const a = kf[i * 3] * 3, b = kf[i * 3 + 1] * 3, c = kf[i * 3 + 2] * 3;
        keptKit.push([(kr[a] + kr[b] + kr[c]) / 3, (kr[a + 1] + kr[b + 1] + kr[c + 1]) / 3, (kr[a + 2] + kr[b + 2] + kr[c + 2]) / 3]);
      }
    }
    for (let i = 0; i < worn.length; i++) {
      let wd = null;
      if (capeCover && capeUnder.includes(list[i])) {
        /* Hollow funnels keep their neck column, backed ones do not (see
           NECK_PLUG_FRAC): the fraction of this garment's neck-column faces
           with kept kit mass in the box behind them. Garments with no column
           faces at all (every bottom) skip the scan and keep the default. */
        let neckKeep = true;
        const ud = worn[i];
        if (keptKit && ud._rest && ud._faces) {
          const ur = ud._rest, uf = ud._faces;
          let strip = 0, plugged = 0;
          for (let s = 0; s < ud.fcount; s++) {
            const a = uf[s * 3] * 3, b = uf[s * 3 + 1] * 3, c = uf[s * 3 + 2] * 3;
            const cx = (ur[a] + ur[b] + ur[c]) / 3, cy = (ur[a + 1] + ur[b + 1] + ur[c + 1]) / 3;
            if (Math.abs(cx) >= NECK_KEEP_HALF || cy >= NECK_KEEP_Y) continue;
            const cz = (ur[a + 2] + ur[b + 2] + ur[c + 2]) / 3;
            strip++;
            for (const k of keptKit) {
              if (Math.abs(k[0] - cx) < 8 && Math.abs(k[1] - cy) < 8 && k[2] > cz - 30 && k[2] < cz + 6) { plugged++; break; }
            }
          }
          if (strip > 0) neckKeep = (plugged / strip) >= NECK_PLUG_FRAC;
        }
        const d = coveredBodyFaces(worn[i], capeCover, null,
          { backDrop: { hemY: capeHem, bellHalf: capeBell }, neckKeep });
        if (d.size) wd = d;
      }
      parts.push(bodyPart(worn[i], wd, garment[i]));
    }
    /* The ring shields bake open in the middle: a nub at the centre, a rim at
       the edge, and no triangle at all across the whole inner annulus
       (measured on mind_shield: nothing between radius 8 and 44 of 56), so
       from the front you see straight through the shield's middle. Stitch a
       shallow cone fan across the hole - one fan per side, so the single-sided
       draw keeps one from each angle - with its colours left for the flash
       region below to paint in the disc's own interior entry (mask 2: the
       faint-to-full fill curve, not the slivers' gate). Built here, before the
       pulse scan, so the equip pulse and the flash region both take in the new
       faces. Everything is measured off the model in hand, so the female cut
       gets a fitting fan too. */
    for (let i = 0; i < worn.length; i++) {
      if (!RING_SHIELD_KEYS.has(list[i])) continue;
      const p = parts[1 + i], sd = worn[i];
      if (!p || !sd || !sd._rest || !p.rest || !p.faces || !p.colors || !p.groupOf) continue;
      if (p.fcount !== sd.fcount || p.vcount !== sd.vcount || p.fillN) continue;
      let cy = 0, cz = 0;
      for (let vi = 0; vi < sd.vcount; vi++) { cy += sd._rest[vi * 3 + 1]; cz += sd._rest[vi * 3 + 2]; }
      cy /= sd.vcount; cz /= sd.vcount;
      let xcC = 0, nC = 0, xcR = 0, nR = 0;
      for (let vi = 0; vi < sd.vcount; vi++) {
        const r = Math.hypot(sd._rest[vi * 3 + 1] - cy, sd._rest[vi * 3 + 2] - cz);
        if (r < 8) { xcC += sd._rest[vi * 3]; nC++; }
        else if (r >= 44 && r <= 52) { xcR += sd._rest[vi * 3]; nR++; }
      }
      if (!nC || !nR) continue;
      xcC /= nC; xcR /= nR;
      let gl = p.groupOf[0];
      { const seen = {}; let best = 0; for (let vi = 0; vi < sd.vcount; vi++) { const g = p.groupOf[vi]; seen[g] = (seen[g] || 0) + 1; if (seen[g] > best) { best = seen[g]; gl = g; } } }
      const SEG = 32, RR = 52, OFF = 1;
      const nv2 = sd.vcount + 2 + SEG * 2, nf2 = sd.fcount + SEG * 2;
      const rest = new Int16Array(nv2 * 3); rest.set(p.rest.subarray(0, sd.vcount * 3));
      const faces = new Uint16Array(nf2 * 3); faces.set(p.faces.subarray(0, sd.fcount * 3));
      const colors = new Uint16Array(nf2); colors.set(p.colors.subarray(0, sd.fcount));
      const groupOf = new Uint8Array(nv2); groupOf.set(p.groupOf.subarray(0, sd.vcount));
      const cF = sd.vcount, cB = sd.vcount + 1, rF = sd.vcount + 2, rB = sd.vcount + 2 + SEG;
      rest[cF * 3] = Math.round(xcC) + OFF; rest[cF * 3 + 1] = Math.round(cy); rest[cF * 3 + 2] = Math.round(cz);
      rest[cB * 3] = Math.round(xcC) - OFF; rest[cB * 3 + 1] = Math.round(cy); rest[cB * 3 + 2] = Math.round(cz);
      groupOf[cF] = gl; groupOf[cB] = gl;
      for (let k = 0; k < SEG; k++) {
        const th = k / SEG * Math.PI * 2;
        const y = Math.round(cy + RR * Math.sin(th)), z = Math.round(cz + RR * Math.cos(th));
        rest[(rF + k) * 3] = Math.round(xcR) + OFF; rest[(rF + k) * 3 + 1] = y; rest[(rF + k) * 3 + 2] = z;
        rest[(rB + k) * 3] = Math.round(xcR) - OFF; rest[(rB + k) * 3 + 1] = y; rest[(rB + k) * 3 + 2] = z;
        groupOf[rF + k] = gl; groupOf[rB + k] = gl;
        const k2 = (k + 1) % SEG;
        const fo = (sd.fcount + k) * 3, bo = (sd.fcount + SEG + k) * 3;
        faces[fo] = cF; faces[fo + 1] = rF + k; faces[fo + 2] = rF + k2;
        faces[bo] = cB; faces[bo + 1] = rB + k2; faces[bo + 2] = rB + k;
      }
      parts[1 + i] = Object.assign({}, p, { rest, faces, colors, groupOf, vcount: nv2, fcount: nf2, fillN: SEG * 2 });
    }
    /* The pulse shield's vertex range in the merged model: parts[0] is the
       body, then one part per worn key in order. The pulse scales the whole
       shield about its own centroid (see update). */
    let shieldStart = -1, shieldCount = 0, shieldNow = false;
    let shieldFaceStart = -1, shieldFaceCount = 0, shieldIdx = -1;
    for (let i = 0; i < worn.length; i++) {
      if (!RING_SHIELD_KEYS.has(list[i])) continue;
      let vo = parts[0].vcount;
      let fo = parts[0].fcount;
      for (let j = 0; j < i; j++) { vo += parts[1 + j].vcount; fo += parts[1 + j].fcount; }
      shieldStart = vo; shieldCount = parts[1 + i].vcount; shieldNow = true;
      shieldFaceStart = fo; shieldFaceCount = parts[1 + i].fcount; shieldIdx = i;
      break;
    }
    /* The pulse fires once, when the shield slot's content changes - a new
       shield arriving, not the same one surviving a rebuild. Tracked by key
       rather than by presence, so a kit change elsewhere (a new top), a fresh
       character built around an already-worn shield, or a skillcape pose
       ending and putting the shield back, all stay quiet - while swapping to
       another shield still pulses. */
    if (shieldNow && shieldCount > 0) {
      const ringKey = list[shieldIdx];
      if (this._wornRingKey !== ringKey) this._shieldPulse = { start: shieldStart, count: shieldCount, t: 0 };
      this._wornRingKey = ringKey;
    } else {
      this._shieldPulse = null;
      this._wornRingKey = null;
    }
    /* The flash faces: the inner disc of the shield in the merged
       model, so a magic hit can light it without touching the rim. Found in two
       steps: the disc's own palette entry is whatever paints the deep interior
       (under half the widest radius - the rim never reaches in there), and the
       mask is every face carrying it. Measured on the cut: the 94-face disc
       against the 64-face rim, identical on the female cut. Any other shield,
       or no shield, leaves no flash region at all. */
    this._shieldFace = null;
    this._shieldFill = null;
    if (shieldNow && shieldIdx >= 0 && RING_SHIELD_KEYS.has(list[shieldIdx]) && shieldFaceCount > 0) {
      const sd = worn[shieldIdx];
      const pd = parts[1 + shieldIdx];
      const fillN = (pd && pd.fillN) || 0;
      if (sd && sd._rest && pd && pd.rest && pd.faces && pd.colors && pd.fcount === shieldFaceCount && pd.fcount === sd.fcount + fillN) {
        let scx = 0, scy = 0, scz = 0;
        for (let vi = 0; vi < sd.vcount; vi++) {
          scx += sd._rest[vi * 3]; scy += sd._rest[vi * 3 + 1]; scz += sd._rest[vi * 3 + 2];
        }
        scx /= sd.vcount; scy /= sd.vcount; scz /= sd.vcount;
        const radii = new Float32Array(pd.fcount);
        let maxR = 0;
        for (let sf = 0; sf < pd.fcount; sf++) {
          let mr = 0;
          for (let k = 0; k < 3; k++) {
            const vv = pd.faces[sf * 3 + k] * 3;
            const dx = pd.rest[vv] - scx, dy = pd.rest[vv + 1] - scy, dz = pd.rest[vv + 2] - scz;
            mr += Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
          mr /= 3;
          radii[sf] = mr;
          if (mr > maxR) maxR = mr;
        }
        let discHsl = -1;
        for (let sf = 0; sf < sd.fcount; sf++) {
          if (radii[sf] < maxR * 0.5) { discHsl = pd.colors[sf]; break; }
        }
        if (discHsl >= 0) {
          const mask = new Uint8Array(pd.fcount);
          for (let sf = 0; sf < sd.fcount; sf++) if (pd.colors[sf] === discHsl) mask[sf] = 1;
          for (let sf = sd.fcount; sf < pd.fcount; sf++) { pd.colors[sf] = discHsl; mask[sf] = 2; }
          let discEdge = maxR * 0.5;
          for (let sf = 0; sf < sd.fcount; sf++) if (mask[sf] === 1 && radii[sf] > discEdge) discEdge = radii[sf];
          this._shieldFace = { start: shieldFaceStart, count: shieldFaceCount, mask, radii, maxR, discEdge };
          /* The fill fan's merged range and centre verts, so update can keep
             it collapsed to zero area while no flash runs (see the face loop):
             part-local fill faces sit right after the model's own, and the two
             fan centres right after its verts. */
          if (fillN) this._shieldFill = { start: shieldFaceStart + sd.fcount, count: fillN, c0: shieldStart + sd.vcount, c1: shieldStart + sd.vcount + 1 };
          /* The flash overlay: a transparent mesh holding one copy of the fill
             fan, fed its posed corners every frame by the face loop. It is the
             only thing that ever draws the fill - the main mesh keeps its copy
             collapsed - so the hit can show the pale flash colour with real
             transparency (nearly see-through low, solid high) instead of a
             lerp of the orange base. One mesh per character, reused across
             equipment rebuilds; it rides the character group, never raycasts,
             and writes no depth, so it cannot disturb clicks or sorting. */
          if (fillN && !this._shieldFillMesh) {
            const fg = new THREE.BufferGeometry();
            const farr = new Float32Array(fillN * 9);
            const fattr = new THREE.BufferAttribute(farr, 3);
            fattr.setUsage(THREE.DynamicDrawUsage);
            fg.setAttribute("position", fattr);
            const fmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
            fmat.color.setRGB(lin(SHIELD_FLASH_SRGB[0] / 255), lin(SHIELD_FLASH_SRGB[1] / 255), lin(SHIELD_FLASH_SRGB[2] / 255));
            const fm = new THREE.Mesh(fg, fmat);
            fm.visible = false; fm.frustumCulled = false; fm.raycast = () => {};
            group.add(fm);
            this._shieldFillMesh = fm;
          }
          if (fillN && this._shieldFill) {
            this._shieldFill.mesh = this._shieldFillMesh;
            this._shieldFill.mat = this._shieldFillMesh.material;
            this._shieldFill.posAttr = this._shieldFillMesh.geometry.attributes.position;
            this._shieldFill.posArr = this._shieldFill.posAttr.array;
          }
        } else {
          for (let sf = sd.fcount; sf < pd.fcount; sf++) pd.colors[sf] = pd.colors[0];
          this._shieldFace = { start: shieldFaceStart, count: shieldFaceCount, mask: new Uint8Array(pd.fcount), radii, maxR, discEdge: maxR * 0.5 };
        }
      }
    }
    /* No fill this rebuild, but an overlay left over from one that had: take
       it out of the group and drop it, or a bare-armed character would keep a
       stale transparent fan riding the hand. */
    if (!this._shieldFill && this._shieldFillMesh) {
      group.remove(this._shieldFillMesh);
      this._shieldFillMesh.geometry.dispose();
      this._shieldFillMesh.material.dispose();
      this._shieldFillMesh = null;
    }
    const comp = compileCharacter(parts, data._anims, data.scale, data._anchor, axisScales(data), doubleSided);    if (this._tint != null) comp.tint = this._tint;
    const b = buildMesh(comp);
    const old = this.mesh;
    if (old) {
      group.remove(old);
      old.geometry.dispose();
      /* a textured model carries a material *array* (one slot per texture -
         see buildMesh), so this has to dispose each of them */
      const olds = Array.isArray(old.material) ? old.material : [old.material];
      for (const om of olds) if (om && om.dispose) om.dispose();
    }
    group.add(b.mesh);
    this.mesh = b.mesh;
    this._compiled = comp;
    this._wornSig = sig;
    /* `_uvDone` lives on the *character* (it is what carries the other per-body
       state into `buildMesh`'s update, whose `this` is this object) while the
       uv buffer it describes lives on the *mesh* - and a rebuild makes a new,
       all-zero one. Left set, the new mesh never gets its texture coordinates
       and a cape regrown this way samples a single texel: the flame goes flat
       the first time a character's equipment changes twice. */
    this._uvDone = false;
    this.update = b.update;
    this.flash = b.flash;
    this.dispose = () => {
      b.dispose();
      if (this._shieldFillMesh) {
        group.remove(this._shieldFillMesh);
        this._shieldFillMesh.geometry.dispose();
        this._shieldFillMesh.material.dispose();
        this._shieldFillMesh = null;
      }
    };
    /* The new mesh is unskinned (see `repose` above): pose it at once, in the
       pose the character is already in, so an equipment change cannot blink the
       character - in the world or in the equipment window's doll - out of
       existence for a frame. */
    this.repose();
    return true;
  };

  /* One item only - the weapon case, and what setPlayerAppearance uses. */
  c.setHeld = function (itemKey) {
    return this.setWorn(itemKey ? [itemKey] : []);
  };

  /* Light the shield's inner disc for a hit: `s` is seconds of flash left
     (see src/combat.js#npcStrikeHit, the only caller) and `dmg` the hitsplat
     it landed for, on a 0-99 scale where 99 fills the whole face. Both take
     the maximum rather than assigning, so two blows landing on neighbouring
     frames do not cut each other's flash short, and update() burns the time
     down per rendered frame - which is what makes the 0.3s a smooth fade
     rather than one tick. */
  c.setShieldFlash = function (s, dmg) {
    if (s > 0) {
      this._shieldFlashT = Math.max(this._shieldFlashT || 0, Math.min(SHIELD_FLASH_SEC, s));
      this._shieldFlashAmt = Math.max(this._shieldFlashAmt || 0, Math.min(1, Math.max(0, (dmg || 0) / 99)));
    } else this._shieldFlashAmt = 0;
  };

  /* Re-post the pose this character was last given, with no time passing.

     A mesh is only skinned by `update`: buildMesh fills the vertex buffer with
     zeros and the first update writes the first real pose into it. So a mesh
     that has *just* been built renders as nothing at all - a degenerate cloud
     of triangles at the origin - and any drawing that happens before the render
     loop's next update (the equipment window's paper-doll, src/ui.js#
     drawEquipDoll, which runs on beforeRender) would come out blank. This is
     what the two geometry swaps call the instant they have a new mesh in place:
     a brand-new character poses standing, and a character whose worn armour was
     just rebuilt keeps exactly the pose it had (the same options replayed, so
     only the geometry under them changed). */
  c.repose = function () {
    this.update(0, this._lastOpts || {});
  };

  /* Back to a clean slate: used when a character respawns after a death. */
  c.resetAnim = function () {
    this._dying = false;
    this._fallT = 0;
    this.fallDone = false;
    this._swing = null;
    this._swingLeft = 0;
    this._castPlayed = null;
    this._castToken = null;
    this._swingTail = false;
    this._emote = null;
    this._emoteToken = null;
    this.animName = null;
    this.animTime = 0;
    if (this.mesh) this.mesh.rotation.set(0, 0, 0);
  };

  /* A brand-new character is unskinned until something poses it (see
     `repose`), and the first frame's update may be a tick away - by which time
     an interface that draws the character could already have drawn nothing. */
  c.repose();

  return c;
}

/* shared scratch for the per-instance pose output, sized on demand */
let poseBuf = new Float32Array(0);
export function ensurePoseBuffer(n) {
  if (poseBuf.length < n) poseBuf = new Float32Array(n);
}

/* shared scratch for the client-lit path's per-vertex normal sums (each one the
   sum of the surrounding face normals scaled to length 256) and the count of
   faces that contributed to each */
let normalBuf = new Float32Array(0);
let normalCnt = new Float32Array(0);
function ensureNormalBuffers(n) {
  if (normalBuf.length < n * 3) normalBuf = new Float32Array(n * 3);
  if (normalCnt.length < n) normalCnt = new Float32Array(n);
}
