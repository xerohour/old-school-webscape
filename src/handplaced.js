import { fetchBakedJSON } from "./baked.js";

function isGoodPlacement(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) && typeof p.key === "string" && p.key.length > 0;
}

export async function loadHandPlaced(world, view) {
  let data = null;
  try {
    data = await fetchBakedJSON("src/data/hand-placed.json");
  } catch (e) {
    return { placed: 0, skipped: 0 };
  }
  const list = data && Array.isArray(data.placements) ? data.placements : [];
  if (!list.length) return { placed: 0, skipped: 0 };
  let menus = null;
  try {
    menus = await fetchBakedJSON("src/data/loc-cache-menus.json");
  } catch (e) {
    return { placed: 0, skipped: list.length };
  }
  let placed = 0, skipped = 0;
  for (const p of list) {
    if (!isGoodPlacement(p)) { skipped++; continue; }
    const def = menus[p.key];
    if (!def) { skipped++; continue; }
    const x = Math.floor(p.x), z = Math.floor(p.z);
    const fx = def.sizeX || 1, fz = def.sizeY || 1;
    if (!world.inBounds(x, z) || !world.inBounds(x + fx - 1, z + fz - 1)) { skipped++; continue; }
    /* A stamp never takes a wall or a door with it: furniture goes next to a
       wall, never instead of it. A placement whose footprint covers a wall or
       door tile is skipped whole (the writer re-exports it one tile over)
       rather than fracturing the building. */
    let clash = false;
    for (let dz = 0; dz < fz && !clash; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        const o = world.objAt(x + dx, z + dz);
        if (o && (o.t === "wall" || o.t === "door")) { clash = true; break; }
      }
    }
    if (clash) { skipped++; continue; }
    const o = { t: "prop", key: p.key, rot: (p.rot | 0) & 3, solid: !!def.solid, ghost: false, ox: x, oz: z, fx: fx, fz: fz };
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        world.setObj(x + dx, z + dz, o);
      }
    }
    placed++;
  }
  if (placed && view && view.rebuildAllChunks) view.rebuildAllChunks();
  return { placed: placed, skipped: skipped };
}
