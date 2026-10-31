export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise2(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function fbm(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, (seed + i * 1013) | 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function hash01(x, y, seed = 0) {
  return hash2(x, y, seed);
}

/* The picker every N-way variant choice reads - bush models, tree groups, grave
   stones, a prop's quarter-turn.

   It exists because `hash01`'s HIGH BITS are correlated between seeds. `hash01`
   is `hash2`, and `hash2`'s top two bits do not fill the 16 cells a pair of
   independent hashes would: over the whole map, two seeds' top two bits only
   ever produce 12 of them. So `(hash01(x, z, seed) * N) | 0`, which reads
   exactly those bits, degrades badly whenever the input tiles are a *subset* of
   the plane - and a placement scatter always is one. The world scatters bushes
   where `hash01(x, z, 7331) > 0.93`, and on those tiles the bush variant index
   `(hash01(x, z, 5153) * 4) | 0` could only ever be 0 or 3: **half the bush art
   this revision carries was drawn nowhere in the world** (299 `bush_small`, 198
   `bush_a`, 0 `bush_b`, 0 `bush_c` out of 497 bushes). It is the same reason a
   variant's quarter-turn skews the same way on a scatter.

   One more avalanche round and a modulus instead of a scaled fraction. Measured
   on the bush tiles: 286/280/302/269 where the old pick gave 448/0/0/689, and
   still 22/24/23/24 on the 93 tiles of the finest selection that scatter makes
   (`hash01(x, z, 7331) > 0.995`), which is the case that broke the old one.

   `hash2` itself is left alone on purpose: it is what `noise2` interpolates, so
   changing it would move every seed's terrain (and terrain does not suffer -
   `noise2` averages four corners, so a biased one cancels). Only the *pickers*
   read this. */
export function hashPick(x, y, seed, n) {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) % n;
}

/* The level cap, and there is exactly one - a skill can never be trained past
   it, no matter what: `xpForLevel`, `levelForXp`, `addXp`, the starting build,
   the debug commands and the save's own reader all measure against this one
   number. It is 99 because that is the game's own cap - the highest a skill
   goes in the 2007 revision, and what the skill tab's level 99 / 13,034,431 XP
   line means. (Combat level is a *separate* formula and does reach 126 for a
   maxed account - see src/skills.js#combatLevel - so the 126s in
   src/combat.js#AGGRO are about combat level, not this.) */
export const MAX_LEVEL = 99;

const XP_TABLE = (() => {
  const t = new Float64Array(MAX_LEVEL + 1);
  let total = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    t[l] = Math.floor(total / 4);
    total += Math.floor(l + 300 * Math.pow(2, l / 7));
  }
  return t;
})();

export function xpForLevel(level) {
  return XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, level))];
}

export function levelForXp(xp) {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/* The client's own stack-count format (getAmountString in the 317 client):
   plain digits below 100,000, then thousands, then millions. */
export function amountString(n) {
  n = Math.floor(n);
  if (n < 100000) return String(n);
  if (n < 10000000) return ((n / 1000) | 0) + "K";
  return ((n / 1000000) | 0) + "M";
}

export function formatNum(n) {
  const s = Math.floor(n).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
}
