import * as THREE from "https://esm.sh/three@0.160.0";
import { bakedURL } from "./baked.js";

/* Real OSRS NPC artwork, shipped in src/sprites/npc/<key>.png. The images are
   trimmed to their alpha bounding box, so each key carries its own aspect
   ratio (recorded in index.json) and only the world height has to be chosen
   by hand to match the proportions of the game's models. */

const HEIGHTS = {
  man: 1.82,
  woman: 1.74,
  guard: 1.88,
  banker: 1.8,
  shopkeeper: 1.8,
  goblin: 1.36,
  chicken: 0.62,
  cow_1: 1.12,
  cow_2: 1.12,
  cow_3: 1.12,
  rat: 0.34,
  player_male: 1.87,
  player_female: 1.8,
};

export const PLAYER_SPRITES = { male: "player_male", female: "player_female" };

export const NPC_SPRITE_KEYS = {
  man: ["man"],
  woman: ["woman"],
  guard: ["guard"],
  banker: ["banker"],
  shopkeeper: ["shopkeeper"],
  goblin: ["goblin"],
  chicken: ["chicken"],
  cow: ["cow_1", "cow_2", "cow_3"],
  rat: ["rat"],
};

const textures = new Map();
let meta = {};
let ready = false;

export function npcSpritesReady() {
  return ready;
}

export function npcTexture(key) {
  return textures.get(key) || null;
}

export function npcSpriteHeight(key) {
  return HEIGHTS[key] || 1.5;
}

export function npcSpriteAspect(key) {
  const m = meta[key];
  if (m && m.aspect) return m.aspect;
  const t = textures.get(key);
  if (t && t.image) return t.image.width / t.image.height;
  return 0.45;
}

export function pickNpcSprite(type, i = 0) {
  const keys = NPC_SPRITE_KEYS[type];
  if (!keys || !keys.length) return null;
  return keys[((i % keys.length) + keys.length) % keys.length];
}

export async function loadNpcSprites() {
  try {
    const res = await fetch(bakedURL("src/sprites/npc/index.json"));
    if (res.ok) meta = await res.json();
  } catch (e) {
    meta = {};
  }
  const keys = Object.keys(meta);
  if (!keys.length) return 0;
  const loader = new THREE.TextureLoader();
  await Promise.all(
    keys.map(
      (k) =>
        new Promise((resolve) => {
          loader.load(
            bakedURL("src/sprites/npc/" + k + ".png"),
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.generateMipmaps = true;
              tex.anisotropy = 4;
              tex.premultiplyAlpha = false;
              textures.set(k, tex);
              resolve();
            },
            undefined,
            () => resolve()
          );
        })
    )
  );
  ready = textures.size > 0;
  return textures.size;
}
