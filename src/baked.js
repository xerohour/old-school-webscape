/* ===========================================================================
   baked.js - the bake generation.

   Everything under src/models/, src/sprites/ and src/data/ is *output*: it is
   written by the offline bake in src/tools/cache-bake/ and then shipped as
   static files. The runtime wants those files to be cached hard - a player model
   is 2.8MB and nobody should ever download it twice - so the loaders fetch them
   with `cache: "force-cache"` (src/models3d.js, src/locmodels.js, ...).

   `force-cache` means "use the copy I already have, even if it is stale", so a
   re-bake is invisible to anybody who has played before: the browser keeps
   answering with the old file and the new content only appears for players who
   had never loaded it. That is a genuinely confusing failure (the code says one
   thing, the data says another, and the console is clean) and it is exactly how
   the emote animations - which live in the player models - can be missing for an
   existing player while working perfectly for a fresh one.

   Fix: the fetch URLs carry this generation string. `?v=` makes each bake a
   *new URL*, so the browser fetches it once and force-caches it from then on -
   hard caching for a new build, no stale data, no revalidation traffic on the
   ~112 model files the boot loads.

   BUMP `BAKED_VERSION` whenever the bake rewrites anything under src/models/,
   src/sprites/ or src/data/. Any unique string will do (a date plus a letter);
   it only ever needs to *change*.
   =========================================================================== */

export const BAKED_VERSION = "2026-10-30cay-coconut";

/* A path under src/, tagged with the current bake generation. */
export function bakedURL(path) {
  return path + (path.indexOf("?") === -1 ? "?v=" : "&v=") + BAKED_VERSION;
}

/* ------------------------------------------------------------- one fetch each

   Several modules want the same bake - the interface font atlases are needed by
   both the hitsplat overlay (src/fx.js) and the sharp-text pass (src/sharp.js),
   and the character-design interface by both the design screen and the name
   step - and two `fetch` calls for one URL really are two requests: the browser
   only collapses them when the second starts after the first has been cached,
   and two modules that both load at boot do not wait for each other. Measured
   on a cold load, `fonts.json` (71 KB) and `char-design.json` (13 KB) were each
   in flight twice, overlapping.

   So the *promise* is kept here, keyed by URL: the first caller starts the
   request, every later one gets the same one. `force-cache` is kept, so this
   only ever changes how many requests are made, never what they may return.

   The parsed object is shared, so callers must treat it as read-only - which is
   what every caller here already does (they read glyph masks and component
   boxes out of it). A rejected fetch is *not* remembered: the entry is dropped
   so a later caller can try again rather than inherit a failure forever. */
const _jsonInflight = new Map();
export function fetchBakedJSON(path) {
  const url = bakedURL(path);
  let p = _jsonInflight.get(url);
  if (!p) {
    p = fetch(url, { cache: "force-cache" }).then((r) => r.json());
    _jsonInflight.set(url, p);
    p.catch(() => _jsonInflight.delete(url));
  }
  return p;
}
