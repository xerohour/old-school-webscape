import { modelData, headData, prepareHeld, coveredBodyFaces, shellCrossingFaces, STRIPPED_HELM_HAIR, HELM_EYE_BODY_Y, computeFlip } from "./models3d.js";
import { bakedURL } from "./baked.js";

/* ===========================================================================
   identikits.js - the character-design system: who the player looks like.

   A player body in this world is **seven identity-kit parts** - head, jaw,
   torso, arms, hands, legs, feet - merged in that order and then recoloured with
   five choices (hair, torso, legs, feet, skin). That is the client's own
   `CharacterDisplay`, and the two baked bodies (`player_male`, `player_female`)
   are exactly one choice out of each bucket.

   What this module does is the other half: every kit on its own was baked by
   `tools/cache-bake/itk-bake-run.mjs` into `src/models/identity-kits.json`, and
   `buildKitBody` merges whichever seven the player is wearing into a normal
   baked-looking model, registers it in `models3d.js#modelData` and hands back
   its key. Everything downstream - the renderer, the worn-armour merge, the
   chat-head, the hitbox - then treats it like any other baked character.

   Two things are the cache's, not ours:

   * **the palettes** are client data, not cache data, and they are typed out
     below in full from the 317 client (`anIntArrayArray1003`), colour for
     colour. Index 0 of every row is the *placeholder* the identity-kit models
     are painted with, which is why "no change" is simply "don't recolour": the
     kit geometry already carries the default colours;
   * **the second torso recolour** (`anIntArray1204`) is the sleeve/cloth colour
     the client applies alongside the shirt colour, and only for the torso row
     (`if(l2 == 1)` in its design screen). Reading it as another row would be
     wrong - the legs and feet rows have no second colour.

   The recolour is applied to the *merged* body by matching face colours, which
   is what the client's `Model.method476(find, replace)` does: one row at a time,
   every face painted in the row's placeholder colour takes the chosen colour.
   That is why a sleeve recolours with the shirt - both are painted 8741 by the
   kits that own them - and why the order matters if a replacement value ever
   collides with a later row's placeholder (the client goes hair, torso, legs,
   feet, skin, and so does this). */

export const BODY_PARTS = ["head", "jaw", "torso", "arms", "hands", "legs", "feet"];

/* The female buckets are the same seven parts seven kit ids later, and the
   female jaw bucket is empty - part id 8 carries no kits at all, because Jagex
   never authored a female beard. So a female body merges six parts. */
export const FEMALE_PART_OFFSET = 7;

/* One row per design-screen colour choice, in the client's own order. */
export const COLOUR_ORDER = ["hair", "torso", "legs", "feet", "skin"];

/* The one colour this world adds to a design-screen row. The client's own shoe
   row is six browns and near-blacks - the leather a pair of boots comes in - and
   nothing grey, so Saradomin's plain grey boots (src/archetypes.js, on the
   user's instruction: *"we can just remove his boots and just use regular grey
   ones"*) needed a seventh entry. It is the neutral grey the cache's own hafts
   are painted with: packed HSL hue 0, saturation 0, luminance 70, appended at
   the end so every existing pick keeps its index and index 0 stays the row's own
   placeholder. */
export const GREY_BOOTS = 70;

/* `anIntArrayArray1003`, verbatim - bar the one appended shoe colour above. */
export const PALETTES = {
  hair: [6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193],
  torso: [8741, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003, 25239],
  legs: [25238, 8742, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003],
  feet: [4626, 11146, 6439, 12, 4758, 10270, GREY_BOOTS],
  skin: [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574],
};

/* `anIntArray1204` - the torso's second recolour (the sleeves). Same length as
   the torso row, indexed by the same choice. */
export const TORSO_EXTRA = [9104, 10275, 7595, 3610, 7975, 8526, 918, 38802, 24466, 10145, 58654, 5027, 1457, 16565, 34991, 25486];

/* The placeholder colour each row matches on, i.e. every row's index 0. */
export const ROW_FIND = {
  hair: PALETTES.hair[0],
  torso: PALETTES.torso[0],
  legs: PALETTES.legs[0],
  feet: PALETTES.feet[0],
  skin: PALETTES.skin[0],
};

/* The classic "design a character" defaults: the first kit of each bucket, the
   same seven `bake.mjs#IDENTITY_KITS` merges into the baked player bodies, and
   colour choice 0 on every row (no recolour). */
export const DEFAULT_APPEARANCE = {
  gender: "male",
  parts: { head: 0, jaw: 10, torso: 18, arms: 26, hands: 33, legs: 36, feet: 42 },
  colours: { hair: 0, torso: 0, legs: 0, feet: 0, skin: 0 },
};

export const DEFAULT_FEMALE_APPEARANCE = {
  gender: "female",
  parts: { head: 48, jaw: -1, torso: 56, arms: 61, hands: 67, legs: 70, feet: 79 },
  colours: { hair: 0, torso: 0, legs: 0, feet: 0, skin: 0 },
};

export function defaultAppearance(gender) {
  return cloneAppearance(gender === "female" ? DEFAULT_FEMALE_APPEARANCE : DEFAULT_APPEARANCE);
}

export function cloneAppearance(a) {
  const base = a && a.gender === "female" ? DEFAULT_FEMALE_APPEARANCE : DEFAULT_APPEARANCE;
  const src = a || base;
  return {
    gender: src.gender === "female" ? "female" : "male",
    parts: Object.assign({}, base.parts, src.parts),
    colours: Object.assign({}, base.colours, src.colours),
  };
}

/* A body is a *choice*, so two different colour choices are two different
   models: the key has to carry every number that changes the geometry, and
   nothing else. That also makes it stable, so the same look is built once and
   reused - `setPlayerAppearance` can be called every frame without leaking a
   model per frame. */
export function appearanceKey(a) {
  if (typeof a === "string") return a;
  const app = cloneAppearance(a);
  const picks = picksFor(app);
  return "kit:" + (app.gender === "female" ? "f" : "m") + ":" + picks.join(".") + ":" +
    COLOUR_ORDER.map((row) => app.colours[row] | 0).join(".");
}

/* The key read back into an appearance, or null if it is not a kit key at all.

   The key is the *whole* state, in a string, which is what lets the rest of the
   game go on treating `Game.playerAppearance` as one string: the save writes it,
   the world server's kit packet carries it to every other player, and
   `resolvePlayerModel` (src/game.js) rebuilds the body from it. `::look` writes
   one, so a player's own design survives a reload, a login, and being seen by
   somebody else - with no second code path for appearance. */
export function appearanceFromKey(key) {
  if (typeof key !== "string" || !key.startsWith("kit:")) return null;
  const parts = key.split(":");
  if (parts.length !== 4) return null;
  const gender = parts[1] === "f" ? "female" : "male";
  const picks = parts[2].split(".").map(Number);
  const cols = parts[3].split(".").map(Number);
  if (picks.length !== BODY_PARTS.length || cols.length !== COLOUR_ORDER.length) return null;
  if (picks.some((n) => !Number.isFinite(n)) || cols.some((n) => !Number.isFinite(n))) return null;
  const app = defaultAppearance(gender);
  app.parts = {
    head: picks[0], jaw: picks[1], torso: picks[2], arms: picks[3],
    hands: picks[4], legs: picks[5], feet: picks[6],
  };
  COLOUR_ORDER.forEach((row, i) => { app.colours[row] = cols[i]; });
  if (gender === "female") app.parts.jaw = -1;
  return app;
}

/* Is this the key of a merged kit body? (`resolvePlayerModel` asks before it
   tries to build one - an unknown name is not an error, it just falls through
   to the baked skins.) */
export function isKitKey(key) {
  return appearanceFromKey(key) != null;
}

/* The seven kits in body order. The female jaw is not a choice - there is no
   such bucket - so it is always the -1 that means "no part". */
export function picksFor(a) {
  const p = (a && a.parts) || {};
  const d = defaultAppearance(a && a.gender);
  const get = (k) => (p[k] == null ? d.parts[k] : p[k] | 0);
  if ((a && a.gender) === "female") {
    return [get("head"), -1, get("torso"), get("arms"), get("hands"), get("legs"), get("feet")];
  }
  return [get("head"), get("jaw"), get("torso"), get("arms"), get("hands"), get("legs"), get("feet")];
}

/* ------------------------------------------------------------------ the bake */

let kitDoc = null;
let kitPromise = null;

export function kitsReady() { return !!kitDoc; }

export async function loadIdentityKits() {
  if (kitDoc) return kitDoc;
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
    try {
      const res = await fetch(bakedURL("src/models/identity-kits.json"), { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      kitDoc = await res.json();
    } catch (e) {
      console.warn("[identikits] identity-kit manifest unavailable", e);
      kitDoc = null;
    }
    return kitDoc;
  })();
  return kitPromise;
}

export function kitCount() { return kitDoc ? kitDoc.count : 0; }

export function headKitIds() {
  if (!kitDoc || !kitDoc.heads) return [];
  return Object.keys(kitDoc.heads).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

/* Per gender and body part, the kits the design screen's arrows may cycle: the
   cache marks the ones it does not offer with opcode 3 (`nonSelectable`), which
   the bake read once so nothing has to re-read it at runtime. */
export function selectableKits(gender) {
  if (!kitDoc) return null;
  return kitDoc.selectable[gender === "female" ? "female" : "male"] || {};
}

export function kitDef(id) {
  if (!kitDoc) return null;
  for (const d of kitDoc.defs) if (d.id === id) return d;
  return null;
}

/* ------------------------------------------------------------------- merging */

/* Base64 <-> little-endian typed arrays. The bake tools have the packers
   (`composite.mjs`); this is the one runtime module that *builds* baked model
   data rather than reading it, so it carries its own pair. */
function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function i16Of(b64) {
  const b = b64ToBytes(b64);
  const n = b.length / 2;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = ((b[i * 2] | (b[i * 2 + 1] << 8)) << 16) >> 16;
  return out;
}

function u16Of(b64) {
  const b = b64ToBytes(b64);
  const n = b.length / 2;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = b[i * 2] | (b[i * 2 + 1] << 8);
  return out;
}

function bytesOf(typed) {
  return new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
}

/* Apply one design-screen row: every face painted in the row's placeholder takes
   the chosen colour. Choice 0 is the placeholder itself, so it is skipped -
   exactly the client's `if(anIntArray990[l2] != 0)`. */
function recolourRow(colors, find, replace) {
  if (!replace || replace === find) return;
  for (let i = 0; i < colors.length; i++) if (colors[i] === find) colors[i] = replace;
}

/* A list of baked kit geometries merged into one, in list order, with `partOf`
   carrying the part each face came from - which is what lets an equipped helmet
   drop the head part and an equipped platebody the torso
   (`models3d.js#replacedBodyFaces`). The identity-kit bake tags each part's
   faces with its own body part, so the tag travels with the geometry; the merge
   only has to keep the offsets honest.

   `entries` is one baked geometry per body part (null for a part this body does
   not have, like the female jaw), which is what lets the body merge and the
   chat-head merge - different tables in the same file - share one merge. */
function mergeEntries(entries) {
  const verts = [], faces = [], colors = [], groupOf = [], partOf = [];
  let vertexBase = 0;
  for (let part = 0; part < entries.length; part++) {
    const kit = entries[part];
    if (!kit) continue;
    const v = i16Of(kit.verts);
    const f = u16Of(kit.faces);
    const c = u16Of(kit.colors);
    const g = kit.groupOf ? b64ToBytes(kit.groupOf) : null;
    const p = kit.partOf ? b64ToBytes(kit.partOf) : null;
    for (let i = 0; i < v.length; i++) verts.push(v[i]);
    for (let i = 0; i < f.length; i++) faces.push(f[i] + vertexBase);
    for (let i = 0; i < c.length; i++) colors.push(c[i]);
    for (let i = 0; i < v.length / 3; i++) groupOf.push(g ? g[i] : 0);
    for (let i = 0; i < f.length / 3; i++) partOf.push(p ? p[i] : part);
    vertexBase += v.length / 3;
  }
  if (!faces.length) return null;
  return { verts, faces, colors, groupOf, partOf };
}

/* The seven body parts, the way every caller names them: kit ids whose -1 means
   "no part". */
export function mergeKits(picks) {
  if (!kitDoc) return null;
  return mergeEntries(picks.map((id) => (id == null || id < 0 ? null : kitDoc.kits[id] || null)));
}

/* The recoloured geometry of a set of baked parts: merge, apply the five colour
   rows, and measure. Shared by the body and the chat head below, which differ
   only in which parts they merge (and where the result is registered). */
function composeParts(entries, colours) {
  const merged = mergeEntries(entries);
  if (!merged) return null;

  const colors = Uint16Array.from(merged.colors);
  for (const row of COLOUR_ORDER) {
    const choice = (colours[row] | 0) % PALETTES[row].length;
    recolourRow(colors, ROW_FIND[row], PALETTES[row][choice]);
    if (row === "torso") {
      recolourRow(colors, TORSO_EXTRA[0], TORSO_EXTRA[(colours.torso | 0) % TORSO_EXTRA.length]);
    }
  }

  const verts = Int16Array.from(merged.verts);
  const faces = Uint16Array.from(merged.faces);
  const groupOf = Uint8Array.from(merged.groupOf);
  const partOf = Uint8Array.from(merged.partOf);

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < verts.length; i += 3) {
    if (verts[i] < minX) minX = verts[i]; if (verts[i] > maxX) maxX = verts[i];
    if (verts[i + 1] < minY) minY = verts[i + 1]; if (verts[i + 1] > maxY) maxY = verts[i + 1];
    if (verts[i + 2] < minZ) minZ = verts[i + 2]; if (verts[i + 2] > maxZ) maxZ = verts[i + 2];
  }

  return { colors, verts, faces, groupOf, partOf, minX, maxX, minY, maxY, minZ, maxZ };
}

function composeKits(app, picks) {
  return composeParts(picks.map((id) => (id == null || id < 0 ? null : kitDoc.kits[id] || null)), app.colours);
}

/* Merge a whole appearance and turn it into a baked-looking model entry: the
   same shape `tools/cache-bake/bake.mjs#bakeModels` writes, so every reader
   downstream (prepareModel, compileCharacter, the worn merge, the chat head)
   needs no knowledge of where it came from.

   The rig comes from the baked body of the same gender - every `Human` model
   shares one framemap, so the animation data is a property of being human, not
   of the choice of hair. */
export function buildKitBody(appearance) {
  if (!kitDoc) return null;
  const fromKey = appearanceFromKey(appearance);
  if (typeof appearance === "string" && !fromKey) return null;
  const app = cloneAppearance(fromKey || appearance);
  const key = appearanceKey(app);
  if (modelData.has(key)) return key;
  const geo = composeKits(app, picksFor(app));
  if (!geo) return null;
  const { colors, verts, faces, groupOf, partOf } = geo;
  const { minX, maxX, minY, maxY, minZ, maxZ } = geo;

  const base = modelData.get(app.gender === "female" ? "player_female" : "player_male")
    || modelData.get("player_male");

  const data = {
    key,
    npcId: null,
    vcount: verts.length / 3,
    fcount: faces.length / 3,
    height: (maxY - minY) / 128,
    depth: (maxZ - minZ) / 128,
    width: (maxX - minX) / 128,
    scale: 1 / 128,
    sx: 1, sy: 1, sz: 1,
    bounds: [minX / 128, 0, -maxZ / 128, maxX / 128, (maxY - minY) / 128, -minZ / 128],
    verts: bytesToB64(bytesOf(verts)),
    /* The sole plane: the client measures a body from its feet, and every human
       body's sole is the same plane, so the merged geometry's own lowest point
       is the right value rather than a constant copied from a base body. */
    footY: maxY,
    faces: bytesToB64(bytesOf(faces)),
    colors: bytesToB64(bytesOf(colors)),
    texIds: null,
    faceAlpha: null,
    groupOf: bytesToB64(groupOf),
    maxGroup: groupOf.reduce((a, b) => (b > a ? b : a), 0),
    partOf: bytesToB64(partOf),
    anims: base ? base.anims : {},
    kit: { gender: app.gender, picks: picksFor(app), colours: Object.assign({}, app.colours) },
  };
  modelData.set(key, data);
  return key;
}

/* ------------------------------------------------------------ a borrowed head

   One body in this world does not wear a kit head at all: **Saradomin**'s. His
   head is the Lumbridge Guide's - the god in the northern woods is the town
   guide, and the town guide wears the long white hair and the beard no kit in
   the cache has ever drawn - so the head is *borrowed* from an NPC model
   instead: the usual kit body is merged, its head and jaw parts are dropped, and
   the donor model's own head is appended on the donor's own bones.

   Which bones are the head is measured off the donor, not assumed. In the
   Guide's model (NPC 2244, `src/models/lumbridge_guide.json`) bones 1, 2, 3 and
   69 are the only bones with a vertex above y -147 - they are his skull, nose,
   hair and beard, 154 of the model's 849 faces - and the *next* bone up the body
   is bone 8, his garment (y -163..-108, 134 vertices): so "take the Guide's head"
   is exactly these four bones, and none of his gloves (19/22/27/28), sleeves
   (21/23-25), shirt (8), leggings (32-37/42-44), boots (45/46/48) or staff (50)
   comes with it. The 13 faces that straddle the cutoff - one head-bone vertex
   and one neck vertex - go with the body, which leaves the head's underside open
   exactly where the robe's collar covers it, the same way a kit head is open
   under a helmet.

   The result is registered like any other composed body, so nothing downstream
   knows where the head came from: the bones it is hung on are the human
   skeleton's own, which every human model in the cache shares (see
   `buildKitBody` above), so the borrowed head animates with the body it is
   stitched to. Returns the key, or null when either model has not landed yet -
   the caller then falls back to the plain kit body. */
export const BORROWED_HEAD_MODEL = "lumbridge_guide";
export const BORROWED_HEAD_BONES = [1, 2, 3, 69];
const HEAD_PART = 0;
const JAW_PART = 1;

export function buildBorrowedHeadBody(appearance, modelKey = BORROWED_HEAD_MODEL, bones = BORROWED_HEAD_BONES) {
  const baseKey = buildKitBody(appearance);
  const base = baseKey ? modelData.get(baseKey) : null;
  const donor = modelKey ? modelData.get(modelKey) : null;
  if (!base || !base.partOf || !donor || !donor.groupOf) return null;
  /* The key carries non-default bones, so two borrows from one donor with
     different bone sets never share a mesh (the Bee keeper's veil hangs on
     bones the guide's head does not use). */
  const key = "borrowed:" + baseKey + ":" + modelKey + (bones === BORROWED_HEAD_BONES ? "" : ":" + bones.join("."));
  if (modelData.has(key)) return key;

  const verts = i16Of(base.verts);
  const faces = u16Of(base.faces);
  const colors = u16Of(base.colors);
  const groupOf = b64ToBytes(base.groupOf);
  const partOf = b64ToBytes(base.partOf);

  const outVerts = [], outFaces = [], outColors = [], outGroup = [], outPart = [];
  const push = (x, y, z, g) => { outVerts.push(x, y, z); outGroup.push(g); };

  /* the base body, minus the two head parts it came with */
  const map = new Int32Array(verts.length / 3).fill(-1);
  for (let f = 0; f < faces.length / 3; f++) {
    const part = partOf[f];
    if (part === HEAD_PART || part === JAW_PART) continue;
    for (let k = 0; k < 3; k++) {
      const v = faces[f * 3 + k];
      if (map[v] < 0) { map[v] = outVerts.length / 3; push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2], groupOf[v]); }
      outFaces.push(map[v]);
    }
    outColors.push(colors[f]);
    outPart.push(part);
  }

  /* the donor's head, face by face, on the donor's own bones - every face whose
     three vertices are all on a head bone, so nothing bridging head and neck is
     carried over */
  const wanted = new Set(bones);
  const dv = i16Of(donor.verts);
  const df = u16Of(donor.faces);
  const dc = u16Of(donor.colors);
  const dg = b64ToBytes(donor.groupOf);
  const dmap = new Int32Array(dv.length / 3).fill(-1);
  for (let f = 0; f < df.length / 3; f++) {
    const a = df[f * 3], b = df[f * 3 + 1], c = df[f * 3 + 2];
    if (!wanted.has(dg[a]) || !wanted.has(dg[b]) || !wanted.has(dg[c])) continue;
    for (const v of [a, b, c]) {
      if (dmap[v] < 0) { dmap[v] = outVerts.length / 3; push(dv[v * 3], dv[v * 3 + 1], dv[v * 3 + 2], dg[v]); }
      outFaces.push(dmap[v]);
    }
    outColors.push(dc[f]);
    outPart.push(HEAD_PART);
  }

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9, maxGroup = 0;
  for (let i = 0; i < outVerts.length; i += 3) {
    if (outVerts[i] < minX) minX = outVerts[i]; if (outVerts[i] > maxX) maxX = outVerts[i];
    if (outVerts[i + 1] < minY) minY = outVerts[i + 1]; if (outVerts[i + 1] > maxY) maxY = outVerts[i + 1];
    if (outVerts[i + 2] < minZ) minZ = outVerts[i + 2]; if (outVerts[i + 2] > maxZ) maxZ = outVerts[i + 2];
  }
  for (let i = 0; i < outGroup.length; i++) if (outGroup[i] > maxGroup) maxGroup = outGroup[i];

  const data = {
    key,
    npcId: null,
    vcount: outVerts.length / 3,
    fcount: outFaces.length / 3,
    height: (maxY - minY) / 128,
    depth: (maxZ - minZ) / 128,
    width: (maxX - minX) / 128,
    scale: 1 / 128,
    sx: 1, sy: 1, sz: 1,
    bounds: [minX / 128, 0, -maxZ / 128, maxX / 128, (maxY - minY) / 128, -minZ / 128],
    verts: bytesToB64(bytesOf(Int16Array.from(outVerts))),
    footY: maxY,
    faces: bytesToB64(bytesOf(Uint16Array.from(outFaces))),
    colors: bytesToB64(bytesOf(Uint16Array.from(outColors))),
    texIds: null,
    faceAlpha: null,
    groupOf: bytesToB64(bytesOf(Uint8Array.from(outGroup))),
    maxGroup,
    partOf: bytesToB64(bytesOf(Uint8Array.from(outPart))),
    anims: base.anims,
    kit: base.kit,
    borrowedHead: modelKey,
  };
  modelData.set(key, data);
  return key;
}

/* The stand sequence a composed chat head idles in - the baked player head's own
   `stand`, by gender (see `buildKitHead`), or the synthetic no-bone rest frame
   when the head bake is unavailable. */
function kitHeadStand(gender) {
  const female = typeof gender === "string" && gender.toLowerCase().startsWith("f");
  const baked = headData.get(female ? "player_female" : "player_male")
    || headData.get(female ? "player_male" : "player_female");
  const stand = baked && baked.anims && baked.anims.stand;
  if (stand && stand.frames && stand.frames.length) return stand;
  return { fm: { types: [], groups: [] }, frames: [{ ids: [], tx: [], ty: [], tz: [] }], lengths: [4] };
}

/* The player's *chat head*: the little model the dialogue box draws beside
   their name. It is not the head of the body model - the client draws a player
   head from the standalone head models each head kit carries (opcode 60, baked
   under `heads` by tools/cache-bake/itk-bake-run.mjs), which are authored in
   their own right and much larger, with the hair already in them, plus the jaw
   kit's own head model (the beard) merged behind it.

   So the pair is merged and recoloured exactly as the body is - the standalone
   head models carry the same placeholder colours, which is why the hair row
   paints the hair and the moustache while the skin row paints the face - and
   the result is registered in `headData` in `heads.json`'s shape, with the one
   synthetic rest frame a mesh needs to be drawn at all (these head kits carry no
   sequence of their own - opcode 60's head models have no animations - so a
   designed player's chat head idles in the rest pose, which is what the client
   draws for one too; the frame exists because a mesh is only filled in by its own
   posing pass - see src/models3d.js#makeStaticMesh). A speaker whose cache block
   *does* carry a sequence gets it baked instead, and the widget plays it - see
   src/dialogue.js#headTick.

   Returns the key, or null when the appearance is not a kit (a `::skin` body
   keeps its own baked head, and is looked up before this is ever reached). */
export function buildKitHead(appearance) {
  if (!kitDoc || !kitDoc.heads) return null;
  const fromKey = appearanceFromKey(appearance);
  if (typeof appearance === "string" && !fromKey) return null;
  const app = cloneAppearance(fromKey || appearance);
  const key = "kithead:" + appearanceKey(app);
  if (headData.has(key)) return key;
  const picks = picksFor(app);
  const entries = [picks[0], picks[1]].map((id) => (id == null || id < 0 ? null : kitDoc.heads[id] || null));
  const geo = composeParts(entries, app.colours);
  if (!geo) return null;
  const { colors, verts, faces, groupOf, partOf } = geo;
  const { minX, maxX, minY, maxY, minZ, maxZ } = geo;
  headData.set(key, {
    key,
    npcId: null,
    vcount: verts.length / 3,
    fcount: faces.length / 3,
    height: (maxY - minY) / 128,
    depth: (maxZ - minZ) / 128,
    width: (maxX - minX) / 128,
    scale: 1 / 128,
    sx: 1, sy: 1, sz: 1,
    bounds: [minX / 128, 0, -maxZ / 128, maxX / 128, (maxY - minY) / 128, -minZ / 128],
    verts: bytesToB64(bytesOf(verts)),
    faces: bytesToB64(bytesOf(faces)),
    colors: bytesToB64(bytesOf(colors)),
    /* Heads carry neither: the head models have no textures the renderer reads
       (src/models3d.js#prepareRaw ignores texIds) and no per-face alpha. */
    texIds: null,
    faceAlpha: null,
    groupOf: bytesToB64(groupOf),
    partOf: bytesToB64(partOf),
    maxGroup: groupOf.reduce((a, b) => (b > a ? b : a), 0),
    /* The neck plane, in the same master convention as the baked heads: the
       merge's own highest raw y is the sole of the model (see
       src/tools/cache-bake/bake.mjs#bakeModels), which for a head is the
       bottom of the neck - the plane the widget sits the model on. */
    footY: maxY,
    /* The chat head is **animated**, and the animation is the one the bake put
       on the two player heads (see src/tools/cache-bake/heads-bake-run.mjs): the
       human `stand` sequence those heads were baked against, which is what the
       dialogue box's widget plays over the head model (src/dialogue.js#headTick).
       A designed character's head is composed here rather than baked, but it is
       composed from *the same* standalone head kits the bake uses - the very
       models the stand sequence's frame groups are authored for - so the sequence
       transfers as-is and the head idles exactly as a baked one does.

       It used to carry the one synthetic no-bone rest frame instead, which left
       the player's own chat head the only *static* face in the game: every NPC
       nodded and shifted while yours did not. That was the user's report of
       2026-09-23 - the chatbox face should play its own pre-recorded animation,
       not a frozen pose. A bake that never landed leaves the synthetic frame as
       the fallback, because a mesh with no frames at all cannot be drawn. */
    anims: { stand: kitHeadStand(app.gender) },
  });
  return key;
}

export function helmFit(geo, kf, hd, bodyMaxY, headMaxY) {
  /* Hats perch on the head crown, not on the tallest beard hair: a tall jaw
     kit must not push the hat down (partyhat #2 sat 26 lower than #1). */
  let t = ((headMaxY == null ? geo.maxY : headMaxY) - bodyMaxY * 4);
  let hsx = 1, hsy = 1, hsz = 1, anchorK = 0, anchorH = 0, anchorF = 0;
  if (true) {
    if (!hd.hidesHead && hd.maskStripped) {
      let ey = 0, en = 0;
      for (let f = 0; f < kf; f++) {
        if (geo.colors[f] !== 43303) continue;
        const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
        ey += (geo.verts[a + 1] + geo.verts[b + 1] + geo.verts[c + 1]) / 3;
        en++;
      }
      if (en) t = ey / en - HELM_EYE_BODY_Y * 4;
    }
    return { t, hsx, hsy, hsz, anchorK, anchorH, anchorF, ey: null, skCrown: null, hmCrown: null, hmBase: null, helmW: null, skinW: null };
  }
  if (!hd.hidesHead) {
    let ey = 0, en = 0;
    for (let f = 0; f < kf; f++) {
      if (geo.colors[f] !== 43303) continue;
      const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
      ey += (geo.verts[a + 1] + geo.verts[b + 1] + geo.verts[c + 1]) / 3;
      en++;
    }
    if (en) ey /= en;
    let skMinX = 1e18, skMaxX = -1e18, skCrown = 1e18, skMinZ = 1e18, skMaxZ = -1e18;
    for (let f = 0; f < kf; f++) {
      if (geo.colors[f] !== 4550) continue;
      for (let k = 0; k < 3; k++) {
        const vi = geo.faces[f * 3 + k] * 3;
        const x = geo.verts[vi], y = geo.verts[vi + 1], z = geo.verts[vi + 2];
        if (x < skMinX) skMinX = x;
        if (x > skMaxX) skMaxX = x;
        if (y < skCrown) skCrown = y;
        if (z < skMinZ) skMinZ = z;
        if (z > skMaxZ) skMaxZ = z;
      }
    }
    const hv0 = hd._rest;
    let hmMinX = 1e18, hmMaxX = -1e18, hmCrown = 1e18, hmBase = -1e18, hmFront = 1e18, hmBack = -1e18, hmHalf = 0;
    for (let i = 0; i < hd.vcount; i++) {
      const x = hv0[i * 3], y = hv0[i * 3 + 1], z = hv0[i * 3 + 2];
      if (x < hmMinX) hmMinX = x;
      if (x > hmMaxX) hmMaxX = x;
      if (y < hmCrown) hmCrown = y;
      if (y > hmBase) hmBase = y;
      if (z < hmFront) hmFront = z;
      if (z > hmBack) hmBack = z;
    }
    hmHalf = (hmMaxX - hmMinX) / 2;
    /* The shell's head-band crown: a low percentile of the central band's
       heights, so horn tips, spikes and brim peaks (few verts, extreme y at
       large |x|) cannot shrink the measure while the cap plateau (many verts)
       still decides it. */
    let hmBand = 1e18;
    {
      const ys = [];
      for (let i = 0; i < hd.vcount; i++) {
        const x = hv0[i * 3], y = hv0[i * 3 + 1];
        if (Math.abs(x) <= hmHalf * 0.35) ys.push(y);
      }
      if (ys.length) {
        ys.sort((a, b) => a - b);
        hmBand = ys[Math.min(ys.length - 1, (ys.length * 0.15) | 0)];
      }
    }
    if (hmBand === 1e18) hmBand = hmCrown;
    const skinW = skMaxX > skMinX ? skMaxX - skMinX : 0;
    const helmW = hmMaxX > hmMinX ? (hmMaxX - hmMinX) * 4 : 0;
    /* The shell's cap width: across the band that actually wraps the head
       (crown down toward the eyes), so horns, brims and veils (wide, but
       above/below/outside the head) cannot dilute the measure. */
    let capW = 0;
    {
      let cMinX = 1e18, cMaxX = -1e18;
      const bandLo = hmBand, bandHi = hmBand + (HELM_EYE_BODY_Y - hmBand) * 0.8;
      for (let i = 0; i < hd.vcount; i++) {
        const x = hv0[i * 3], y = hv0[i * 3 + 1];
        if (y < bandLo || y > bandHi) continue;
        if (x < cMinX) cMinX = x;
        if (x > cMaxX) cMaxX = x;
      }
      if (cMaxX > cMinX) capW = (cMaxX - cMinX) * 4;
    }
    if (!(capW > 0)) capW = helmW;
    const skinD = skMaxZ > skMinZ ? skMaxZ - skMinZ : 0;
    const helmD = hmBack > hmFront ? (hmBack - hmFront) * 4 : 0;
    let domeW = 0;
    {
      let dMinX = 1e18, dMaxX = -1e18;
      for (let f = 0; f < kf; f++) {
        if (geo.colors[f] !== 4550) continue;
        for (let k = 0; k < 3; k++) {
          const vi = geo.faces[f * 3 + k] * 3;
          const x = geo.verts[vi], y = geo.verts[vi + 1];
          if (y < skCrown || y > skCrown + 15) continue;
          if (x < dMinX) dMinX = x;
          if (x > dMaxX) dMaxX = x;
        }
      }
      if (dMaxX > dMinX) domeW = dMaxX - dMinX;
    }
    if (window.__helmFitDbg) window.__helmFitDbg.push({ skCrown: Math.round(skCrown), ey: en ? Math.round(ey) : null, hmCrown, hmBase, hmBand: Math.round(hmBand), tTop: Math.round(geo.maxY - bodyMaxY * 4), veilTest: Math.round(hmBase * 4 + (geo.maxY - bodyMaxY * 4)), skinW: Math.round(skinW), helmW: Math.round(helmW), domeW: Math.round(domeW) });
    const growX = skinW > 0 && capW > 0 ? (skinW / capW) * 1.12 : 1;
    const growY = en && hmBand < HELM_EYE_BODY_Y ? ((ey - skCrown) / ((HELM_EYE_BODY_Y - hmBand) * 4)) * 1.35 : 1;
    const growZ = skinD > 0 && helmD > 0 ? (skinD / helmD) * 1.03 : 1;
    if (hd.maskStripped) {
      if (en) t = ey - HELM_EYE_BODY_Y * 4;
      if (en) {
        hsx = Math.min(1.5, Math.max(1, growX));
        hsy = Math.min(1.5, Math.max(1, growY));
        hsz = Math.min(1.5, Math.max(1, growZ));
        anchorK = ey;
        anchorH = HELM_EYE_BODY_Y * 4;
        anchorF = hmFront * 4;
        const posCrown = anchorK + (hmBand * 4 - anchorH) * hsy;
        if (posCrown < skCrown + 10) t += Math.min(16, skCrown + 10 - posCrown);
        if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "mask:" + hsx.toFixed(2) + "," + hsy.toFixed(2) + "," + hsz.toFixed(2) + " t=" + Math.round(t);
      }
    } else if (hmBase * 4 + t <= ey - 8) {
      if ((hmBase - hmCrown) < 14) {
        hsx = Math.min(1.5, Math.max(0.95, skinW > 0 && capW > 0 ? (skinW / capW) * 1.1 : 1));
        hsy = Math.min(1.5, Math.max(1, growY));
        hsz = Math.min(1.5, Math.max(1, growZ));
        anchorK = skCrown + 6;
        anchorH = hmBand * 4;
        anchorF = hmFront * 4;
        t = skCrown + 6 - hmBand * 4;
        {
          const posCrown = anchorK + (hmBand * 4 - anchorH) * hsy;
          if (posCrown < skCrown + 10) t += Math.min(16, skCrown + 10 - posCrown);
        }
        if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "veil:" + hsx.toFixed(2) + "," + hsy.toFixed(2) + "," + hsz.toFixed(2) + " t=" + Math.round(t);
      } else {
        t = geo.maxY - bodyMaxY * 4;
        hsx = 1;
        hsy = 1;
        anchorK = 0;
        anchorH = 0;
        if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "top";
      }
    } else if ((hmBase - hmCrown) < 14) {
      const hmMid = (hmCrown + hmBase) / 2;
      hsx = Math.min(1.5, Math.max(0.95, skinW > 0 && capW > 0 ? (skinW / capW) * 1.1 : 1));
      hsz = Math.min(1.4, Math.max(0.95, growZ));
      anchorF = hmFront * 4;
      t = skCrown + 2 - hmMid * 4 * hsy;
      anchorK = skCrown + 2;
      anchorH = hmMid * 4;
      if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "band:" + hsx.toFixed(2) + " t=" + Math.round(t);
    } else if (helmW > skinW * 1.5) {
      /* A brim far wider than the head cannot sink through the dome - the
         original top anchor already perches it right (wizard). */
      t = geo.maxY - bodyMaxY * 4;
      hsx = 1;
      hsy = 1;
      anchorK = 0;
      anchorH = 0;
      if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "top";
    } else {
      /* Closer-fitting crowns seat into the scalp (partyhat, chef). */
      const sink = Math.min(30, Math.max(10, (hmBase - hmCrown) * 4 * 0.22));
      t = skCrown + sink - hmBase * 4;
      anchorK = skCrown + sink;
      anchorH = hmBase * 4;
      if (window.__helmFitDbg) window.__helmFitDbg[window.__helmFitDbg.length - 1].branch = "seat:sink" + Math.round(sink) + " t=" + Math.round(t);
    }
    return { t, hsx, hsy, hsz, anchorK, anchorH, anchorF, ey: en ? ey : null, skCrown, hmCrown, hmBase, helmW, skinW };
  }
  return { t, hsx, hsy, hsz, anchorK, anchorH, anchorF, ey: null, skTop: null, hmCrown: null, hmBase: null, helmW: null, skinW: null };
}

const PORTRAIT_FUP = {
  adamant_helm: -20, black_helm: -20, bronze_helm: -20, iron_helm: -20, mithril_helm: -20, rune_helm: -20, steel_helm: -20, white_helm: -20, dragon_helm: -14,
  max_hood: 20, ahrims_hood: 4, ghostly_hood: 20, beekeeper_hat: -4,
  fremennik_helm: 0, rock_helm: 0, warrior_helm: 0, skeletal_helm: 0, granite_helm: 0, helm_of_neitiznot: 0, dharoks_helm: 32, third_age_full_helmet: 0,
  coif: 2, leather_coif: 2, third_age_range_coif: -4, karils_coif: 0,
  blue_partyhat: -12, green_partyhat: -12, purple_partyhat: -12, red_partyhat: -12, white_partyhat: -12, yellow_partyhat: -12, chef_hat: 12,
  mystic_dark_hat: 8, mystic_hat: 8, mystic_light_hat: 8,
  black_wizard_hat: -4, dark_wizard_hat: -4, wizard_hat: -4,
  air_tiara: 12, moonclan_helm: 8, tiara: 8,
  guthix_mitre: -4, saradomin_mitre: -4, zamorak_mitre: -4,
  snakeskin_bandana: 4, third_age_mage_hat: 16, enchanted_hat: 4, infinity_hat: 0,
  archer_helm: 0, berserker_helm: 0, spined_helm: 0, farseer_helm: 6, veracs_helm: 12,
};
const PORTRAIT_MUP = {
  agility_hood: -4, attack_hood: -4, construction_hood: -4, cooking_hood: -4, crafting_hood: -4, defence_hood: -4, farming_hood: -4, firemaking_hood: -4, fishing_hood: -4, fletching_hood: -4, herblore_hood: -4, hitpoints_hood: -4, hunter_hood: -4, magic_hood: -4, mining_hood: -4, prayer_hood: -4, quest_point_hood: -4, ranging_hood: -4, runecraft_hood: -4, slayer_hood: -4, smithing_hood: -4, strength_hood: -4, thieving_hood: -4, woodcutting_hood: -4, ahrims_hood: -8, beekeeper_hat: -4,
  coif: 2, leather_coif: 2,
  infinity_hat: -8, farseer_helm: 6,
  blue_partyhat: 4, green_partyhat: 4, purple_partyhat: 4, red_partyhat: 4, white_partyhat: 4, yellow_partyhat: 4, chef_hat: 4,
  mystic_dark_hat: 4, mystic_hat: 4, mystic_light_hat: 4,
  black_wizard_hat: 4, dark_wizard_hat: 4, wizard_hat: 4,
  air_tiara: 4, moonclan_helm: 4, tiara: 4,
  snakeskin_bandana: 4, splitbark_helm: 4, third_age_mage_hat: 4, enchanted_hat: 4,
};
const PORTRAIT_MRIGHT = new Set(["blue_partyhat", "green_partyhat", "purple_partyhat", "red_partyhat", "white_partyhat", "yellow_partyhat", "chef_hat", "mystic_dark_hat", "mystic_hat", "mystic_light_hat"]);
const PORTRAIT_MITRE = new Set(["guthix_mitre", "saradomin_mitre", "zamorak_mitre"]);
const PORTRAIT_BEARD = new Set(["granite_helm", "helm_of_neitiznot", "dharoks_helm",
  "ghostly_hood",
  "coif", "third_age_range_coif", "karils_coif", "beekeeper_hat", "veracs_helm",
  "guthix_mitre", "saradomin_mitre", "zamorak_mitre"]);
const PORTRAIT_FRINGE = new Set(["blue_partyhat", "green_partyhat", "purple_partyhat", "red_partyhat", "white_partyhat", "yellow_partyhat", "chef_hat",
  "mystic_dark_hat", "mystic_hat", "mystic_light_hat", "black_wizard_hat", "dark_wizard_hat", "wizard_hat",
  "air_tiara", "moonclan_helm", "tiara", "snakeskin_bandana", "splitbark_helm", "third_age_mage_hat", "enchanted_hat", "infinity_hat"]);
const PORTRAIT_FSCALE = { enchanted_hat: 1.12 };
const PORTRAIT_MALECUT = new Set(["beekeeper_hat", "berserker_helm", "archer_helm", "fremennik_helm", "spined_helm", "warrior_helm", "rock_helm", "skeletal_helm", "granite_helm", "helm_of_neitiznot", "karils_coif", "infinity_hat", "mystic_hat", "mystic_dark_hat", "mystic_light_hat", "agility_hood", "attack_hood", "construction_hood", "cooking_hood", "crafting_hood", "defence_hood", "farming_hood", "firemaking_hood", "fishing_hood", "fletching_hood", "herblore_hood", "hitpoints_hood", "hunter_hood", "magic_hood", "mining_hood", "prayer_hood", "quest_point_hood", "ranging_hood", "runecraft_hood", "slayer_hood", "smithing_hood", "strength_hood", "thieving_hood", "woodcutting_hood", "max_hood", "ahrims_hood", "farseer_helm", "third_age_full_helmet", "chef_hat", "coif", "leather_coif"]);
const PORTRAIT_CLIP = new Set(["agility_hood", "attack_hood", "construction_hood", "cooking_hood", "crafting_hood", "defence_hood", "farming_hood", "firemaking_hood", "fishing_hood", "fletching_hood", "herblore_hood", "hitpoints_hood", "hunter_hood", "magic_hood", "mining_hood", "prayer_hood", "quest_point_hood", "ranging_hood", "runecraft_hood", "slayer_hood", "smithing_hood", "strength_hood", "thieving_hood", "woodcutting_hood", "max_hood", "ahrims_hood", "beekeeper_hat", "farseer_helm", "archer_helm", "berserker_helm", "fremennik_helm", "spined_helm", "warrior_helm", "skeletal_helm"]);
const PORTRAIT_SKINSTRIP = new Set(["beekeeper_hat"]);
export const PORTRAIT_RULE_B = new Set([]);
const PORTRAIT_CLIPOPAQUE = new Set(["beekeeper_hat"]);
const PORTRAIT_FXZ = { adamant_helm: 1.35, black_helm: 1.35, bronze_helm: 1.35, iron_helm: 1.35, mithril_helm: 1.35, rune_helm: 1.35, steel_helm: 1.35, white_helm: 1.35, dragon_helm: 1.35, agility_hood: 1.1 };
const PORTRAIT_FWD = { farseer_helm: 2, spined_helm: 0 };
const PORTRAIT_FWD_M = { spined_helm: 0, farseer_helm: 2 };

export function buildHeadgearHead(appearance, headId) {
  if (!kitDoc || !kitDoc.heads || !headId) return null;
  const fromKey = appearanceFromKey(appearance);
  if (typeof appearance === "string" && !fromKey) return null;
  const app = cloneAppearance(fromKey || appearance);
  const key = "kithead:" + appearanceKey(app) + ":hat:" + headId;
  if (headData.has(key)) return key;
  const sex = app.gender === "female" ? "f" : "m";
  const hd = prepareHeld(headId, sex === "f" && PORTRAIT_MALECUT.has(headId) ? "m" : sex);
  if (!hd || !hd._rest || !hd._faces || !hd._colors || !hd._groupOf) return buildKitHead(appearance);
  const picks = picksFor(app);
  const entries = [picks[0], picks[1]].map((id) => (id == null || id < 0 ? null : kitDoc.heads[id] || null));
  const geo = composeParts(entries, app.colours);
  if (!geo) return null;
  const kitPart = kitDoc.kits[picks[0]];
  if (!kitPart) return buildKitHead(appearance);
  const kv = geo.verts.length / 3;
  const kf = geo.faces.length / 3;
  let bodyMaxY = -1e9;
  const bv = i16Of(kitPart.verts);
  for (let i = 1; i < bv.length; i += 3) if (bv[i] > bodyMaxY) bodyMaxY = bv[i];
  let headMaxY = null;
  if (entries[0] && entries[0].verts) {
    headMaxY = -1e9;
    const ev = i16Of(entries[0].verts);
    for (let i = 1; i < ev.length; i += 3) if (ev[i] > headMaxY) headMaxY = ev[i];
  }
  const fit = helmFit(geo, kf, hd, bodyMaxY, headMaxY);
  if (headId === "farseer_helm" || headId === "rock_helm") {
    let eyeY = null;
    {
      let sy = 0, sn = 0;
      for (let f = 0; f < kf; f++) {
        if (geo.colors[f] !== 43303) continue;
        for (let k = 0; k < 3; k++) sy += geo.verts[geo.faces[f * 3 + k] * 3 + 1];
        sn += 3;
      }
      if (sn > 0) eyeY = sy / sn;
    }
    if (eyeY != null) {
      const eyeVert = new Uint8Array(kv);
      for (let f = 0; f < kf; f++) {
        if (geo.colors[f] !== 43303) continue;
        for (let k = 0; k < 3; k++) eyeVert[geo.faces[f * 3 + k]] = 1;
      }
      for (let i = 0; i < kv; i++) {
        if (eyeVert[i]) continue;
        if (geo.verts[i * 3 + 1] > eyeY) geo.verts[i * 3] = Math.round(geo.verts[i * 3] * 0.82);
      }
    }
  }
  const pup = sex === "f" ? (PORTRAIT_FUP[headId] | 0) : (PORTRAIT_MUP[headId] | 0);
  const pright = sex === "m" && PORTRAIT_MRIGHT.has(headId) ? 8 : 0;
  const pfwd = sex === "m" && headId in PORTRAIT_FWD_M ? PORTRAIT_FWD_M[headId] : (PORTRAIT_FWD[headId] | 0);
  const pscale = sex === "f" ? (PORTRAIT_FSCALE[headId] || 1) : 1;
  const t = fit.t + pup, hsx = fit.hsx, hsy = fit.hsy, hsz = fit.hsz, anchorK = fit.anchorK, anchorH = fit.anchorH, anchorF = fit.anchorF;
  const hv = hd._rest, hf = hd._faces, hc = hd._colors, hg = hd._groupOf;
  const hvn = hd.vcount, hfn = hd.fcount;
  const hr = new Int16Array(hv.length);
  const tOff = t - anchorK + anchorH;
  for (let i = 0; i < hvn; i++) {
    hr[i * 3] = hv[i * 3] * 4 * hsx;
    hr[i * 3 + 1] = anchorK + (hv[i * 3 + 1] * 4 - anchorH) * hsy + tOff;
    hr[i * 3 + 2] = anchorF + (hv[i * 3 + 2] * 4 - anchorF) * hsz + pfwd;
  }
  const fxz = sex === "f" ? (PORTRAIT_FXZ[headId] || 1) : 1;
  if (fxz !== 1) {
    let zx0 = 1e18, zx1 = -1e18, zz0 = 1e18, zz1 = -1e18;
    for (let i = 0; i < hvn; i++) {
      const x = hr[i * 3], z = hr[i * 3 + 2];
      if (x < zx0) zx0 = x; if (x > zx1) zx1 = x;
      if (z < zz0) zz0 = z; if (z > zz1) zz1 = z;
    }
    const ccx = (zx0 + zx1) / 2, ccz = (zz0 + zz1) / 2;
    for (let i = 0; i < hvn; i++) {
      hr[i * 3] = ccx + (hr[i * 3] - ccx) * fxz;
      hr[i * 3 + 2] = ccz + (hr[i * 3 + 2] - ccz) * fxz;
    }
  }
  if (pscale !== 1 || pright) {
    let cMinX = 1e18, cMaxX = -1e18, cMinY = 1e18, cMaxY = -1e18;
    for (let i = 0; i < hvn; i++) {
      const x = hr[i * 3], y = hr[i * 3 + 1];
      if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x;
      if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
    }
    const ccx = (cMinX + cMaxX) / 2, ccy = (cMinY + cMaxY) / 2;
    for (let i = 0; i < hvn; i++) {
      hr[i * 3] = ccx + (hr[i * 3] - ccx) * pscale + pright;
      hr[i * 3 + 1] = ccy + (hr[i * 3 + 1] - ccy) * pscale;
    }
  }
  if (headId === "farseer_helm") {
    let hornSeen = false;
    const hornVert = new Uint8Array(hvn);
    for (let f = 0; f < hfn; f++) {
      const c = hc[f];
      if (c !== 8386 && c !== 8390 && c !== 8394 && c !== 8410 && c !== 8414 && c !== 8526 && c !== 8530 && c !== 8534) continue;
      hornSeen = true;
      for (let k = 0; k < 3; k++) hornVert[hf[f * 3 + k]] = 1;
    }
    if (hornSeen) for (let i = 0; i < hvn; i++) {
      if (!hornVert[i]) continue;
      hr[i * 3] *= 0.8;
      hr[i * 3 + 2] -= 6;
    }
  }
  /* The clip must use the headgear mesh AS DRAWN: hr carries the fit scale,
     the sex lift, widening and horn tucks, while hv is the raw bake. Testing
     cover against hv clips against a ghost - the drawn shell is what must
     clip the head. Cache units (hr is kit units, x4). */
  const helmCache = new Float64Array(hv.length);
  const refreshHelm = () => { for (let i = 0; i < hr.length; i++) helmCache[i] = hr[i] / 4; };
  refreshHelm();
  const helmBody = { _rest: helmCache, _faces: hf, _colors: hc, fcount: hfn };
  const small = new Float64Array(geo.verts.length);
  for (let i = 0; i + 2 < small.length; i += 3) {
    small[i] = geo.verts[i] / 4;
    small[i + 1] = (geo.verts[i + 1] - t) / 4;
    small[i + 2] = geo.verts[i + 2] / 4;
  }
  const pseudo = {
    _rest: small, _faces: geo.faces, _colors: geo.colors, _partOf: geo.partOf,
    fcount: kf, _flip: computeFlip(geo.verts, geo.faces, kv),
  };
  const hide = !!(hd && hd.hidesHead);
  const drop = new Set();
  let bandTop = -1e18;
  /* An open-face helm keeps the kit head, full stop - the same rule the body
     follows (see models3d.js#setWorn: only a hidesHead helm drops it). Its
     blank face mask was stripped because the face shows through the shell
     (see tools/blank-mask-helmfix.mjs), and the coverage test below cannot
     tell the face in the opening from the skull under the shell: the med
     helm's nasal and cheek flaps sit right on the face, so the test ate the
     whole face and the box went up a black void with smeared eyes. The fringe
     strip above already takes the hair that would poke out through the shell,
     and anything else the test would drop is depth-occluded under it, so for
     a mask-stripped helm the coverage drop is skipped outright. Hats keep the
     test - their fit was verified with it. */
  if (!hide && hd.maskStripped) {
    const skinStrip = PORTRAIT_SKINSTRIP.has(headId);
    let shf = hf, shfn = hfn;
    if (skinStrip && PORTRAIT_CLIPOPAQUE.has(headId) && hd._alpha) {
      const of = [];
      for (let f = 0; f < hfn; f++) if (!hd._alpha[f]) of.push(hf[f * 3], hf[f * 3 + 1], hf[f * 3 + 2]);
      if (of.length) { shf = Uint16Array.from(of); shfn = of.length / 3; }
    }
    for (const f of shellCrossingFaces(geo.verts, geo.faces, kf, hr, shf, shfn,
      (g) => geo.partOf[g] === 0 && (STRIPPED_HELM_HAIR.has(geo.colors[g]) || (skinStrip && geo.colors[g] === 4550)))) drop.add(f);
  }
  if (!hide && hd.maskStripped && PORTRAIT_CLIP.has(headId)) {
    let cover = [helmBody];
    if (PORTRAIT_CLIPOPAQUE.has(headId) && hd._alpha) {
      const of = [];
      for (let f = 0; f < hfn; f++) if (!hd._alpha[f]) of.push(hf[f * 3], hf[f * 3 + 1], hf[f * 3 + 2]);
      if (of.length) cover = [{ _rest: helmCache, _faces: Uint16Array.from(of), fcount: of.length / 3 }];
    }
    for (const f of coveredBodyFaces(pseudo, cover, new Set([0]))) {
      const c = geo.colors[f];
      if (c !== 4550 && !STRIPPED_HELM_HAIR.has(c)) continue;
      drop.add(f);
    }
  }
  if (!hide && !hd.maskStripped && PORTRAIT_FRINGE.has(headId)) {
    for (const f of shellCrossingFaces(geo.verts, geo.faces, kf, hr, hf, hfn,
      (g) => geo.partOf[g] === 0 && STRIPPED_HELM_HAIR.has(geo.colors[g]), true)) drop.add(f);
    /* The cone base sits inside the mane: bangs drape over the lower cone in
       front of its walls, past any depth bias (the drape stands a head-width
       ahead of the wall it covers). So the walls lose every depth contest, at
       every bias, and the hat reads buried. Drop the hair hanging in front of
       the cone's front wall: anything there is either inside the shell
       (invisible) or the drape over it (the bug) - hair beside or behind the
       shell falls outside and stays, and skin/beard are gated out below. */
    let cx = 0, cz = 0, hatLo = 1e18, hatHi = -1e18;
    for (let i = 0; i < hvn; i++) {
      cx += hr[i * 3]; cz += hr[i * 3 + 2];
      const y = hr[i * 3 + 1];
      if (y < hatLo) hatLo = y; if (y > hatHi) hatHi = y;
    }
    cx /= hvn; cz /= hvn;
    const wallAt = (y, xNotZ, wantMin) => {
      let m = wantMin ? 1e18 : -1e18, seen = false;
      for (let i = 0; i < hvn; i++) {
        if (Math.abs(hr[i * 3 + 1] - y) > 4) continue;
        seen = true;
        const v = xNotZ ? Math.abs(hr[i * 3] - cx) : hr[i * 3 + 2];
        if (wantMin ? v < m : v > m) m = v;
      }
      if (!seen) return null;
      return m;
    };
    /* A lock is dropped if ANY of its vertices would paint the shell: the
       middle of a long wisp can hang far in front of the wall while only one
       end nears it, so centroid tests let it through and the end draws teeth
       over the band. Below the rim the width gate closes to the wall itself
       so the side drape framing the face survives. */
    const vGate = (vx, vy, vz) => {
      if (vy < hatLo - 20 || vy > hatHi) return false;
      const wy = vy < hatLo + 4 ? hatLo + 4 : vy;
      const wl = wallAt(wy, false, true);
      if (wl == null || vz > wl + 4) return false;
      const rx = wallAt(wy, true, false);
      if (rx == null || rx <= 0) return false;
      const m = vy < hatLo + 10 ? 1.0 : 1.1;
      return Math.abs(vx - cx) / rx <= m;
    };
    for (let f = 0; f < kf; f++) {
      if (drop.has(f)) continue;
      if (geo.partOf[f] !== 0 || !STRIPPED_HELM_HAIR.has(geo.colors[f])) continue;
      const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
      const fx = (geo.verts[a] + geo.verts[b] + geo.verts[c]) / 3;
      const fy = (geo.verts[a + 1] + geo.verts[b + 1] + geo.verts[c + 1]) / 3;
      const fz = (geo.verts[a + 2] + geo.verts[b + 2] + geo.verts[c + 2]) / 3;
      /* Centroid gating misses long locks whose middle hangs deep while the
         tip paints the rim, so the y test is overlap, not centroid. */
      const fyLo = Math.min(geo.verts[a + 1], geo.verts[b + 1], geo.verts[c + 1]);
      const fyHi = Math.max(geo.verts[a + 1], geo.verts[b + 1], geo.verts[c + 1]);
      if (fyHi < hatLo - 20 || fyLo > hatHi) continue;
      if (vGate(fx, fy, fz) || vGate(geo.verts[a], geo.verts[a + 1], geo.verts[a + 2]) ||
          vGate(geo.verts[b], geo.verts[b + 1], geo.verts[b + 2]) ||
          vGate(geo.verts[c], geo.verts[c + 1], geo.verts[c + 2])) drop.add(f);
    }
    /* The ring clip: the rim is a closed ring around the head, so hair
       inside its disc at ring height is inside the hat and goes - the
       locks crossing the rim corners live here. Above the band the cone
       occludes, below it the drape frames the face: both stay. */
    const rxRim = wallAt(hatLo + 4, true, false);
    const backRim = wallAt(hatLo + 4, false, false);
    if (rxRim != null && rxRim > 0 && backRim != null) {
      for (let f = 0; f < kf; f++) {
        if (drop.has(f)) continue;
        if (geo.partOf[f] !== 0 || !STRIPPED_HELM_HAIR.has(geo.colors[f])) continue;
        const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
        const fx = (geo.verts[a] + geo.verts[b] + geo.verts[c]) / 3;
        const fy = (geo.verts[a + 1] + geo.verts[b + 1] + geo.verts[c + 1]) / 3;
        const fz = (geo.verts[a + 2] + geo.verts[b + 2] + geo.verts[c + 2]) / 3;
        const fyLo = Math.min(geo.verts[a + 1], geo.verts[b + 1], geo.verts[c + 1]);
        const fyHi = Math.max(geo.verts[a + 1], geo.verts[b + 1], geo.verts[c + 1]);
        if (fyHi < hatLo - 20 || fyLo > hatLo + 10) continue;
        if (fz > backRim + 4) continue;
        if (Math.abs(fx - cx) / rxRim > 1.25) continue;
        drop.add(f);
      }
    }
    /* The tip gate: what paints the rim is each lock's tip, but the centroid
       gates above test the lock's middle - a long wisp hanging past the rim
       has its middle deep behind the face, so every gate lets it through
       while its tip draws teeth over the band. Test the top vertex itself
       against the wall plane (the rim plane for tips below the edge). */
    const frontRim = wallAt(hatLo + 4, false, true);
    if (frontRim != null) {
      for (let f = 0; f < kf; f++) {
        if (drop.has(f)) continue;
        if (geo.partOf[f] !== 0 || !STRIPPED_HELM_HAIR.has(geo.colors[f])) continue;
        const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
        const ay = geo.verts[a + 1], by = geo.verts[b + 1], cy2 = geo.verts[c + 1];
        let tx, ty, tz;
        if (ay >= by && ay >= cy2) { tx = geo.verts[a]; ty = ay; tz = geo.verts[a + 2]; }
        else if (by >= cy2) { tx = geo.verts[b]; ty = by; tz = geo.verts[b + 2]; }
        else { tx = geo.verts[c]; ty = cy2; tz = geo.verts[c + 2]; }
        if (ty < hatLo - 20 || ty > hatHi) continue;
        const wy = ty < hatLo + 4 ? hatLo + 4 : ty;
        const wall = wallAt(wy, false, true);
        if (wall == null || tz > wall + 4) continue;
        const rx = wallAt(wy, true, false);
        if (rx == null || rx <= 0) continue;
        const m = ty < hatLo + 10 ? 1.4 : 1.1;
        if (Math.abs(tx - cx) / rx > m) continue;
        drop.add(f);
      }
    }
    /* The tiara must read fully in front of her mane: drop every lock
       crossing the band's own rectangle (face-framing drape below the
       band stays). Female-only, males keep their drape. */
    if (headId === "tiara" && sex === "f") {
      const bandTopF = hatLo + 12;
      const frontWall = wallAt(hatLo + 4, false, true);
      const bandRx = wallAt(hatLo + 4, true, false);
      if (frontWall != null && bandRx != null && bandRx > 0) {
        for (let f = 0; f < kf; f++) {
          if (drop.has(f)) continue;
          if (geo.partOf[f] !== 0 || !STRIPPED_HELM_HAIR.has(geo.colors[f])) continue;
          const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c2 = geo.faces[f * 3 + 2] * 3;
          const px = [geo.verts[a], geo.verts[b], geo.verts[c2]];
          const py = [geo.verts[a + 1], geo.verts[b + 1], geo.verts[c2 + 1]];
          const pz = [geo.verts[a + 2], geo.verts[b + 2], geo.verts[c2 + 2]];
          for (let k = 0; k < 3; k++) {
            if (py[k] < hatLo - 2 || py[k] > bandTopF) continue;
            if (Math.abs(px[k] - cx) > bandRx * 1.05) continue;
            if (pz[k] > frontWall + 4) continue;
            drop.add(f); break;
          }
        }
      }
    }
    /* The kit's black backing fans (colour 0, the eye/mouth seal) tie with the
       band wall in depth and draw last, printing a black nick over the band's
       lower left. Sink their verts a little deeper and the wall wins the tie
       cleanly. Portrait-only, chef-only; pupils and mouth tones untouched. */
    if (headId === "chef_hat") {
      const sunk = new Set();
      for (let f = 0; f < kf; f++) {
        if (geo.colors[f] !== 0) continue;
        for (let k = 0; k < 3; k++) sunk.add(geo.faces[f * 3 + k]);
      }
      for (const v of sunk) geo.verts[v * 3 + 2] += 4;
      /* The puff floats above its band with an authored void between them; the
         long triangles spanning it catch the portrait light at a grazing angle
         and shade near-black, a zigzag ring across the hat. Close the void to
         a 2-unit step (the small side, the puff, moves onto the band) so the
         span shades with the rest of the wall. */
      const ys = [];
      for (let i = 0; i < hvn; i++) ys.push(hr[i * 3 + 1]);
      ys.sort((a, b) => a - b);
      let gy = -1e18, gg = 0;
      for (let i = 1; i < ys.length; i++) {
        const g = ys[i] - ys[i - 1];
        if (g > gg) { gg = g; gy = ys[i - 1]; }
      }
      if (gg > 3) {
        let above = 0;
        for (let i = 0; i < hvn; i++) if (hr[i * 3 + 1] > gy) above++;
        const shut = gg - 2;
        if (above <= hvn / 2) for (let i = 0; i < hvn; i++) if (hr[i * 3 + 1] > gy) hr[i * 3 + 1] -= shut;
        else for (let i = 0; i < hvn; i++) if (hr[i * 3 + 1] <= gy) hr[i * 3 + 1] += shut;
      }
    }
    /* The rim skirt: the cone's lower edge is a zigzag of silhouette triangles,
       and a triangle culled at a grazing angle opens a nick through which the
       mane behind (or bare background) reads as dark teeth breaking the band.
       The wall's own bottom row reaches down a few units, moving the nicks
       onto the forehead and side drape that occlude them, so the edge reads
       solid. Portrait-only, inside the fringe block, so shells keep true depth
       and the world render is untouched. The reach stops clear of the eyes, so
       low-slung bands keep their framing; wide brims are exempt. */
    let eyeTopGeo = -1e18;
    for (let f = 0; f < kf; f++) {
      if (geo.colors[f] !== 43303) continue;
      const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c = geo.faces[f * 3 + 2] * 3;
      const ey = Math.min(geo.verts[a + 1], geo.verts[b + 1], geo.verts[c + 1]);
      if (ey > eyeTopGeo) eyeTopGeo = ey;
    }
    const clearance = eyeTopGeo - hatLo;
    const reach = clearance > 10 ? 6 : clearance > 6 ? clearance - 4 : 0;
    if (reach > 0 && rxRim != null && rxRim > 0 && rxRim < 48) {
      for (let i = 0; i < hvn; i++) {
        if (hr[i * 3 + 1] >= hatLo && hr[i * 3 + 1] < hatLo + 8) hr[i * 3 + 1] -= reach;
      }
      refreshHelm();
    }
    bandTop = hatLo + 16;
  }
  /* Skin graft removed per user (squared-off patch gone) - no skin quad is
     added for any mitre. The white cloth lappet (mitreCloth) stays. */
  const mitreCloth = (!hide && !hd.maskStripped && PORTRAIT_MITRE.has(headId))
    ? { x0: -52, x1: -32, y0: -24, y1: 44, z: 12 }
    : null;
  if (!hide && !hd.maskStripped) {
    for (const f of coveredBodyFaces(pseudo, [helmBody])) {
      const c = geo.colors[f];
      /* The helm clips the head: anything the shell covers goes, no patches.
         Eyes and the kit's interior seal stay. Mitres clip skin too; other
         hats keep skin (past a brim a dropped skin triangle is a black void
         the shell cannot fill). */
      if (c === 0 || c === 43303) continue;
      if (c === 4550 && !PORTRAIT_MITRE.has(headId)) continue;
      drop.add(f);
    }
  }
  /* Mitre female probe: her left temple carries bright texture flakes (kit
     colour 127, tight cluster beside the eye) that catch full light and read
     as a white sliver. They sit outside the shell, so no clip can take them,
     and behind them is background (dropping = a hole with a blue
     un-premultiply fringe - tried and reverted). They stay opaque and take
     the surrounding cheek tone instead, same as the wrap paint below. */
  const zamFlake = !hide && !hd.maskStripped && PORTRAIT_MITRE.has(headId) && sex === "f";
  const inFlakeBox = (f) => {
    const a = geo.faces[f * 3] * 3, b = geo.faces[f * 3 + 1] * 3, c2 = geo.faces[f * 3 + 2] * 3;
    const cx = (geo.verts[a] + geo.verts[b] + geo.verts[c2]) / 3;
    if (cx < -25 || cx > -5) return false;
    const cy = (geo.verts[a + 1] + geo.verts[b + 1] + geo.verts[c2 + 1]) / 3;
    if (cy < -26 || cy > -19) return false;
    const cz = (geo.verts[a + 2] + geo.verts[b + 2] + geo.verts[c2 + 2]) / 3;
    return cz >= -50 && cz <= -40;
  };
  let stripHair = false;
  if (!hide && hd._alpha && hd.fcount) {
    let an = 0;
    for (let f = 0; f < hd.fcount; f++) if (hd._alpha[f] !== 0) an++;
    stripHair = an / hd.fcount > 0.5;
  }
  const ruleB = PORTRAIT_RULE_B.has(headId);
  const ruleD = PORTRAIT_BEARD.has(headId);
  /* Snakeskin female: the bandana replaces her haircut entirely - full mane
     drop, bald skin under the shell. Males keep their drape. */
  const baldHer = headId === "snakeskin_bandana" && sex === "f";
  const dropCut = (stripHair || hd.maskStripped || ruleD || baldHer) && !ruleB;
  const dropBeard = ruleB || ruleD;
  if (dropCut || dropBeard) for (let f = 0; f < kf; f++) {
    if (!STRIPPED_HELM_HAIR.has(geo.colors[f])) continue;
    if (geo.partOf[f] === 0 ? dropCut : dropBeard) drop.add(f);
  }
  const keep = hide ? [] : (() => { const k = []; for (let f = 0; f < kf; f++) if (!drop.has(f)) k.push(f); return k; })();
  /* The beekeeper's veil is translucent over the whole face, and the two dark
     mouth colours read as black triangles through it - so the lips are painted
     over with the skin tone instead of dropped (dropping leaves a void slit). */
  const mouthTone = headId === "beekeeper_hat";
  const graftFaces = (mitreCloth ? 4 : 0);
  const graftVerts = (mitreCloth ? 4 : 0);
  const outV = (hide ? 0 : kv) + hvn + graftVerts;
  const outF = keep.length + hfn + graftFaces;
  const verts = new Int16Array(outV * 3);
  const groupOf = new Uint8Array(outV);
  if (!hide) {
    verts.set(geo.verts, 0);
    groupOf.set(geo.groupOf, 0);
  }
  verts.set(hr, (hide ? 0 : kv) * 3);
  groupOf.set(hg, hide ? 0 : kv);
  const faces = new Uint16Array(outF * 3);
  const colors = new Uint16Array(outF);
  for (let i = 0; i < keep.length; i++) {
    const f = keep[i];
    faces[i * 3] = geo.faces[f * 3];
    faces[i * 3 + 1] = geo.faces[f * 3 + 1];
    faces[i * 3 + 2] = geo.faces[f * 3 + 2];
    const gc = geo.colors[f];
    if ((mouthTone && (gc === 1944 || gc === 4661)) || (zamFlake && gc === 127 && inFlakeBox(f))) colors[i] = 4550;
    else colors[i] = gc;
  }
  const base = hide ? 0 : kv;
  /* Zamorak mitre: faces 17-19 are a wrap strip crossing the cheek on all
     three probes - paint them the skin tone so the cheek reads unbroken
     (the same 4550 as the skin around them, no new colour). */
  const zamPaint = !hide && headId === "zamorak_mitre" && hfn === 138;
  for (let f = 0; f < hfn; f++) {
    const e0 = hf[f * 3], e1 = hf[f * 3 + 1], e2 = hf[f * 3 + 2];
    faces[(keep.length + f) * 3] = e0 + base;
    faces[(keep.length + f) * 3 + 1] = e1 + base;
    faces[(keep.length + f) * 3 + 2] = e2 + base;
    colors[keep.length + f] = (zamPaint && (f === 17 || f === 18 || f === 19)) ? 4550 : hc[f];
  }
  if (PORTRAIT_MITRE.has(headId) && hfn === 138) {
    const seen = {};
    const ops = [[53, 67, -20, 30, 1, 0], [67, 73, 0, -30, 1, 0]];
    for (const mf of ops) {
      for (let f = mf[0]; f < mf[1] && f < hfn; f++) {
        for (let k = 0; k < 3; k++) {
          const vi = base + hf[f * 3 + k];
          if (seen[vi]) continue; seen[vi] = 1;
          verts[vi * 3] += mf[2];
          verts[vi * 3 + 2] += mf[3];
          if (mf[4] !== 1) verts[vi * 3] = mf[5] + (verts[vi * 3] - mf[5]) * mf[4];
        }
      }
    }
  }
  if (mitreCloth) {
    const gb = (hide ? 0 : kv) + hvn;
    const g = mitreCloth;
    verts[gb * 3] = g.x0; verts[gb * 3 + 1] = g.y0; verts[gb * 3 + 2] = g.z;
    verts[(gb + 1) * 3] = g.x1; verts[(gb + 1) * 3 + 1] = g.y0; verts[(gb + 1) * 3 + 2] = g.z;
    verts[(gb + 2) * 3] = g.x1; verts[(gb + 2) * 3 + 1] = g.y1; verts[(gb + 2) * 3 + 2] = g.z;
    verts[(gb + 3) * 3] = g.x0; verts[(gb + 3) * 3 + 1] = g.y1; verts[(gb + 3) * 3 + 2] = g.z;
    const fb = keep.length + hfn;
    const order = [0, 1, 2, 0, 2, 3, 0, 3, 2, 0, 2, 1];
    for (let i = 0; i < 4; i++) {
      faces[(fb + i) * 3] = gb + order[i * 3];
      faces[(fb + i) * 3 + 1] = gb + order[i * 3 + 1];
      faces[(fb + i) * 3 + 2] = gb + order[i * 3 + 2];
      colors[fb + i] = 105;
    }
  }
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < verts.length; i += 3) {
    if (verts[i] < minX) minX = verts[i]; if (verts[i] > maxX) maxX = verts[i];
    if (verts[i + 1] < minY) minY = verts[i + 1]; if (verts[i + 1] > maxY) maxY = verts[i + 1];
    if (verts[i + 2] < minZ) minZ = verts[i + 2]; if (verts[i + 2] > maxZ) maxZ = verts[i + 2];
  }
  const hatPartOf = () => {
    const p = new Uint8Array(outF);
    for (let i = 0; i < keep.length; i++) p[i] = geo.partOf[keep[i]];
    p.fill(255, keep.length);
    return p;
  };
  /* A hat perched on hair must win the depth contest against it: hat faces
     ride garment level 12 (see COVER_Z_BIAS) - the mane drape stands up to
     ~48 raw units in front of the rim from the portrait yaw, past what lower
     levels clear (measured 2026-10-24: 3 leaves hair over the rim, 8 clears
     the males, 12 clears all three probes). Portrait-only namespace (these
     entries merge head+hat alone, never capes), so the rank never competes
     with the world ladder. Scoped to the fringe-hat class - shells keep
     true depth. */
  const hatCover = () => {
    if (!PORTRAIT_FRINGE.has(headId)) return null;
    const c = new Uint8Array(outF);
    c.fill(12, keep.length);
    /* The rim band outranks the cone: the boundary fight against long front
       locks hanging just ahead of the wall is decided by raw margin, and the
       band needs the deeper rank to tuck them under its lower edge. */
    for (let f = 0; f < hfn; f++) {
      const a = hf[f * 3] * 3;
      if (bandTop > -1e17 && hr[a + 1] < bandTop) c[keep.length + f] = 20;
    }
    return bytesToB64(bytesOf(c));
  };
  let maxGroup = 0;
  for (let i = 0; i < groupOf.length; i++) if (groupOf[i] > maxGroup) maxGroup = groupOf[i];
  let headAlpha = null;
  if (hd._alpha) {
    const a = new Uint8Array(outF);
    for (let f = 0; f < hfn; f++) a[keep.length + f] = hd._alpha[f];
    for (let i = 0; i < outF; i++) if (a[i] !== 0) { headAlpha = a; break; }
  }
  let headAlphaLabel = null;
  if (hd._alphaLabel) {
    const l = new Uint8Array(outF);
    for (let f = 0; f < hfn; f++) l[keep.length + f] = hd._alphaLabel[f];
    for (let i = 0; i < outF; i++) if (l[i] !== 0) { headAlphaLabel = l; break; }
  }
  headData.set(key, {
    key,
    npcId: null,
    vcount: outV,
    fcount: outF,
    height: (maxY - minY) / 128,
    depth: (maxZ - minZ) / 128,
    width: (maxX - minX) / 128,
    scale: 1 / 128,
    sx: 1, sy: 1, sz: 1,
    bounds: [minX / 128, 0, -maxZ / 128, maxX / 128, (maxY - minY) / 128, -minZ / 128],
    verts: bytesToB64(bytesOf(verts)),
    faces: bytesToB64(bytesOf(faces)),
    colors: bytesToB64(bytesOf(colors)),
    texIds: null,
    faceAlpha: headAlpha ? bytesToB64(headAlpha) : null,
    faceLabel: headAlphaLabel ? bytesToB64(headAlphaLabel) : null,
    groupOf: bytesToB64(groupOf),
    partOf: bytesToB64(hatPartOf()),
    cover: hatCover(),
    maxGroup,
    footY: geo.maxY,
    anims: { stand: kitHeadStand(app.gender) },
  });
  return key;
}

/* Is this a name the character renderer can resolve at all? A skin name (the
   baked bodies and NPC skins) or an appearance object/kit key. */
export function isAppearance(value) {
  return !!value && typeof value === "object" && !!value.parts;
}

/* A random look, for `::look` with no arguments and for anything that needs a
   stranger to look like an individual. Only the kits the cache offers are
   picked, and the female jaw is left alone. */
export function randomAppearance(gender) {
  const g = gender === "female" ? "female" : gender === "male" ? "male" : (Math.random() < 0.5 ? "male" : "female");
  const app = defaultAppearance(g);
  const sel = selectableKits(g) || {};
  for (const part of BODY_PARTS) {
    const list = sel[part];
    if (!list || !list.length) continue;
    app.parts[part] = list[Math.floor(Math.random() * list.length)];
  }
  if (g === "female") app.parts.jaw = -1;
  for (const row of COLOUR_ORDER) {
    app.colours[row] = Math.floor(Math.random() * PALETTES[row].length);
  }
  return app;
}

/* The next/previous kit of one part, in the design screen's own order: the
   selectable list, wrapping. `step` is +1 or -1 (the client's forward and back
   arrows). Returns the new kit id, or the current one when the part has no
   choice at all. */
export function cycleKit(appearance, part, step) {
  const app = cloneAppearance(appearance);
  const list = (selectableKits(app.gender) || {})[part];
  if (!list || !list.length) return app.parts[part];
  const cur = list.indexOf(app.parts[part]);
  const i = cur < 0 ? 0 : (cur + step + list.length) % list.length;
  app.parts[part] = list[i];
  return app.parts[part];
}

/* The next/previous colour of one row, the same way. */
export function cycleColour(appearance, row, step) {
  const app = cloneAppearance(appearance);
  const n = PALETTES[row].length;
  app.colours[row] = ((app.colours[row] | 0) + step + n) % n;
  return app.colours[row];
}
