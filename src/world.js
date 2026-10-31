import { mulberry32, fbm, noise2, clamp, hash01, hashPick } from "./util.js";
import { ISLE, isleHeight, inIsleBox, ALL_AGILITY, ROUTE } from "./island.js";
import { contourTile } from "./mapgen/contour.js";

export const W = 128;
/* The world's map grew southwards twice: first for the isle (src/island.js):
   it was 128x128 and became 128x192, with the 64 new rows of open sea holding
   Cairn Isle; then for the underbelly (the dungeon far south), it became
   128x256, with the 64 newest rows holding open sea plus the buried dirt mass;
   then for the underbelly's own region, 128x512, with the far south a
   full-width dirt continent holding the dungeon. The continent sits 128 rows
   of open ocean past Cairn Isle - its own region on the minimap, reachable
   only by the town trapdoor.

   `MAIN_H` is the old 128, and it is the number every rule that describes the
   *authored* world is written against - the coast's distance term, the sea
   level's percentile. That is the whole trick of either extension: the mainland's
   terrain is a function of the tile's own coordinates and of its distance to the
   map's original border, so pinning those two to `MAIN_H` leaves every mainland
   tile with exactly the height, the tile type and the objects it has always had.
   `H` moves; the world does not. Verified by hashing `tiles`/`objs`/`corner`
   before and after (see TODO.md, the isle report). */
export const H = 512;
export const MAIN_W = 128;
export const MAIN_H = 128;
export const CHUNK = 16;

export const KINSHRA = { x0: 112, z0: 156, x1: 120, z1: 162 };

export function inKinshra(x, z) {
  return x >= KINSHRA.x0 && x <= KINSHRA.x1 && z >= KINSHRA.z0 && z <= KINSHRA.z1;
}

/* The underbelly's own box: the buried dirt mass far south holding the
   dungeon. Shared with the stamp at the end of this file and the cave-sky
   test (src/game.js), exactly the way KINSHRA is shared with its void. */
export const UNDER = { x0: 0, z0: 384, x1: 127, z1: 511 };

export function inUnderbelly(x, z) {
  return x >= UNDER.x0 && x <= UNDER.x1 && z >= UNDER.z0 && z <= UNDER.z1;
}

/* The new island's own box: a large blank landmass in the open sea between
   Cairn Isle and the underbelly's dirt continent, reached only by the portal
   west of the town trapdoor. Blank for now - grass and sand, nothing on it
   but the return portal. `inNewIsleBox` keeps the scatter off it (see
   `noScatter`) and the sealed-tile carve out of it, the way `inIsleBox`
   does for Cairn Isle. */
export const NEW_ISLE = { x0: 24, z0: 245, x1: 104, z1: 315 };

export function inNewIsleBox(x, z) {
  return x >= NEW_ISLE.x0 && x <= NEW_ISLE.x1 && z >= NEW_ISLE.z0 && z <= NEW_ISLE.z1;
}

/* The minigame dungeon's own box: a buried dirt mass in the open sea south of
   the new island, holding the instanced speed-clear dungeon (src/minigame.js).
   Same construction as the underbelly - solid DIRTWALL with rooms carved back
   to floor height - reached only by the island's two trapdoor mouths. Shared
   with the cave-sky test (src/game.js) and the trapdoor no-anim rule
   (src/actions.js#climbLadder), exactly the way UNDER is. The box holds both
   shafts 61 tiles apart, so the west shaft's offset from the west mouth
   matches the east shaft's offset from the east mouth exactly (+11,+56 on the
   ladders, +13,+58 on the landings - the same congruency rule as the town
   pairing). */
export const MINIGAME = { x0: 34, z0: 330, x1: 112, z1: 375 };

export function inMinigame(x, z) {
  return x >= MINIGAME.x0 && x <= MINIGAME.x1 && z >= MINIGAME.z0 && z <= MINIGAME.z1;
}

/* The tutorial island's own box: a small narrow jungle island in the open sea
   between Cairn Isle and the new island (the z 193..236 band is pure ocean -
   verified empty of land), reached only by teleport when the tutorial goes in.
   75 long east-west, ~14 wide north-south on average: the stamp below tapers
   the ends and wobbles the shoreline, so this box holds the land plus its
   beach margin. `inTutIsleBox` keeps the general scatter off it (own jungle
   pass plants it instead) and the sealed-tile carve out of it, the way
   `inIsleBox` does for Cairn Isle. */
export const TUT_ISLE = { x0: 16, z0: 200, x1: 112, z1: 228 };

export function inTutIsleBox(x, z) {
  return x >= TUT_ISLE.x0 && x <= TUT_ISLE.x1 && z >= TUT_ISLE.z0 && z <= TUT_ISLE.z1;
}

/* The cay's own no-troll box (user ask 2026-10-30): the whole island plus its
   beaches and pond - neither river nor ocean troll waves rise inside it, and
   strays of either family that wander in are culled (see game.js
   #tickRiverTrollEvent). */
export const TUT_CAY_SAFE = { x0: 12, z0: 202, x1: 78, z1: 228 };

export function inTutCaySafe(x, z) {
  return x >= TUT_CAY_SAFE.x0 && x <= TUT_CAY_SAFE.x1 && z >= TUT_CAY_SAFE.z0 && z <= TUT_CAY_SAFE.z1;
}

/* The tutorial hat: a baked, permanent-per-player scenery fixture (t:"tut_hat",
   src/scene.js#_locSpec draws the pirate_hat ground model as scenery), NOT a
   ground item and NOT in the shared ledger. Each client owns its own phase:
   hat visible + Scully hidden until this player takes it, then hat gone +
   Scully standing. The island itself will be instanced per player later; this
   is the client-side prototype of that instancing (phase in localStorage +
   save, visibility applied locally, never reported). */
export const TUT_HAT = { x: 47, z: 218, id: "pirate_hat" };

/* The second storey: one building (the Armour Shop) has a real upper floor at
   the same XZ as its ground floor, stood UP_Y above it. `plane` is 0 on the
   ground and 1 upstairs, and rides every tile/object/height query that takes
   one (defaulting to 0, so the whole single-level world is untouched). */
export const UP_Y = 2.0;

export const T = {
  GRASS: 0,  GRASS_DARK: 1,
  DIRT: 2,
  PATH: 3,
  SAND: 4,
  WATERBED: 5,
  FLOOR_WOOD: 6,
  FLOOR_STONE: 7,
  ROCKGROUND: 8,
  MARSH: 9,
  GRAVEL: 10,
  BRIDGE: 11,
  /* The black nothingness a cave pocket sits in: unwalkable, unscattered-on,
     painted near-black (see the Kinshra void stamp at the end of this file). */
  VOID: 12,
  /* The Lumbridge-kitchen check floor: two tile types painted in parity
     (see `building`'s "check" floor), so the ground alternates black and white
     the way the castle kitchen's does. Both are ordinary walkable indoor floor. */
  FLOOR_CHECK_W: 13,
  FLOOR_CHECK_B: 14,
  /* Solid buried dirt: the underbelly's own rock. Unwalkable, unscattered-on,
     painted as dark packed earth (see the underbelly stamp at the end of this
     file). Unlike VOID it renders as ground - a wall-high dirt mass, not
     black nothingness - so the dungeon reads as carved underground. */
  DIRTWALL: 15,
  /* Tropical grass: the tutorial cay's own lawn (user ask 2026-10-30). Same
     machinery as grass - underlayment + grass gobo, melts with the grass
     family, walkable like grass - only the underlayment colour is lighter,
     matched to the mid green of the palm-leaf mesh. Painted onto the isle's
     GRASS/GRASS_DARK just before the jungle pass (below); the general scatter
     never sees it (it keeps off the isle box) and the jungle tests accept it
     alongside GRASS/GRASS_DARK/MARSH. */
  TROP_GRASS: 16,
};

export const TILE_COLORS = {
  [T.GRASS]: 0x6f9f4a,
  [T.GRASS_DARK]: 0x679845,
  [T.DIRT]: 0x8d7a55,
  [T.PATH]: 0xb9a578,
  [T.SAND]: 0xdccf9c,
  [T.WATERBED]: 0x4a6b57,
  [T.FLOOR_WOOD]: 0x9c7c50,
  [T.FLOOR_STONE]: 0x8f8c85,
  [T.ROCKGROUND]: 0x8b8377,
  [T.MARSH]: 0x5b7a45,
  [T.GRAVEL]: 0x9a9186,
  [T.BRIDGE]: 0x8a6b45,
  [T.VOID]: 0x000000,
  [T.FLOOR_CHECK_W]: 0xe9e2d2,
  [T.FLOOR_CHECK_B]: 0x141414,
  [T.DIRTWALL]: 0x4a3a28,
  [T.TROP_GRASS]: 0x5a7d28,
};

/* The plank deck is two tiles wide, and the rails are drawn just outside it -
   see scene.js#_buildBridge (the deck spans z 56..58, i.e. the two rows 56 and
   57, with a rail at 55.98 and one at 58.02). This footprint must therefore be
   exactly those two rows: while it covered a third row (z1 = 58) the tile at
   z 58 was still river bed but `walkableTile` let it through, so the player
   walked out past the far rail and on to the water. */
export const BRIDGE = { x0: 31, x1: 49, z0: 56, z1: 57 };
export const BRIDGE_DECK_Y = 0.12;

export function isBridgeArea(x, z) {
  return x >= BRIDGE.x0 && x <= BRIDGE.x1 && z >= BRIDGE.z0 && z <= BRIDGE.z1;
}

/* Types that block a tile outright. A door is listed here too: it blocks while
   shut and `world.isWalkable` lets it through once it is open, which is what
   makes a closed door something you have to open rather than a permanent hole
   in a building's wall. */
export const SOLID_TYPES = new Set([
  /* "wall" is deliberately NOT here: a wall is a thin panel on
     one edge of its tile, so the tile itself is standable - the sealed faces
     ride the object's own `block` mask and `blocksStep` refuses crossing them.
     "lowwall" IS here: the freestanding ruin wall has no floor under it, so
     standing on its tile reads as standing ON the wall itself (the user's
     report, 2026-10-09 - seen standing on the row). It is a barrier you walk
     round, not ground you stand on.
     Doors stay listed: a shut door blocks every side as a tile. */
  "tree", "rock", "fence", "booth", "furnace", "anvil", "crate",
  "barrel", "table", "tent", "signpost", "well", "sink", "range", "counter", "statue",
  "rope",
  /* The glassblower's sandpit: the cache's own solid flag is set on its def,
     so it is cover you walk around like the well. */
  "sandpit",
  "door", "altar", "stall", "grave", "coffin", "wheel",
  /* The potter's wheel and the pottery oven: solid furniture like the wheel,
     the oven covering both of its 1x2 tiles. */
  "potwheel", "potoven",
  "tut_cache",
  /* The runecrafting sites are stone you walk round: the ruins, the Air
     Altar, and the two isle portals. */
  "ruins", "air_altar", "rc_portal",
  /* The new island's portals: the cache's own essence swirl (loc 2492),
     solid stone you walk round like the runecrafting portals above. */
  "portal",
  /* The coin shrine: the cache's own solid flag is set on the money pot's
     def, so it is cover you walk around like the portals above. */
  "coin_shrine",
  "lowwall",
  "ladder_down", "ladder_up",
  /* A burning post torch: solid, like a statue, so nobody walks through it. */
  "torch",
  /* the dead trees: the cache's own solid flag is set on all four models
     (dead_a..dead_d - see src/data/loc-cache-menus.json), so the wilderness's
     dead tree field is cover to weave through rather than scenery you walk
     through. They are stamped over their footprint the same way a living tree
     is (world.js#stampFoot). */
  "deadtree",
  /* the village props (unit X): the ones that are solid in the cache's own
     model - a boulder, a rockery, a chest, a bench, a round table, the second
     crate. A fern and the rocky shore are deliberately NOT here: you walk over
     a fern and you stand ON the rocky shore, which is the whole of what its
     "Jump-to" is for. */
  "crate_b", "chest", "bench", "table_b", "boulder", "rockery", "plant", "chair", "hollow", "dense_forest", "log",
  /* The tutorial island's shipwrecks: every def carries the cache's own solid
     flag, so a wreck is cover you walk round like the boulders above. */
  "wreck",
  /* Cairn Isle's pillars (and the ruined ring on the ruins' point): the
     cache's own solid flag is set on every one of these defs, so they are
     cover you walk around like the boulders above. */
  "pillar",
  /* the bushes. All four of the cache's bush defs carry the solid flag
     (`bush_a`/`bush_b`/`bush_c` at 2x2, `bush_small` at 1x1 - see
     src/data/loc-cache-menus.json), so a bush is cover you walk around, not
     undergrowth you walk through. They used to be the largest thing in the
     world you could stand inside: a bush is one OBJECT over its model's whole
     footprint (world.js#BUSH_FOOT, #stampFoot), so the tile it is stamped on
     and the ground its art covers are the same ground - the user's report,
     2026-09-22: *"you have to add collisions for bushes"*. */
  "bush",
  /* The isle's agility kit (src/island.js#PIECE). This list is the cache's own
     solid flag, transcribed: every obstacle whose def blocks its tile is here
     and every one whose def leaves it passable is deliberately absent. That
     split is not decoration - a log you walk along, a ledge you edge along, a
     stepping stone, the monkeybars you swing across and the two snow jumps are
     all ground you move OVER, while a net, a pipe, a hurdle, a wall, a rock
     face and a tunnel mouth are things in the way that have to be answered with
     a climb. Getting one of them wrong is a player standing inside a wall.

     The list grew from 12 keys to 69 on 2026-09-25, when the whole agility kit
     was baked and the field was laid out (src/island.js#PIECE): the first 12
     were the original course's own, and the rest arrived with the kit. The
     object's type IS its loc key for this whole family (see scene.js#_locSpec's
     default case), which is why these read as the locs themselves rather than
     as a `course` type with a per-object flag. `tools/check-locs.mjs` holds
     this list against src/data/loc-cache-menus.json, so a key the def calls
     solid and this list leaves out is a fault the audit reports - not a wall
     somebody walks through without ever being told. */
  /* walls, fences and low obstacles */
  "agile_novice_wall", "agile_low_wall", "agile_wall_rubble", "agile_broken_wall",
  "agile_crumbled_wall", "agile_crumbling_wall", "agile_jagged_wall",
  "agile_castle_wall", "agile_crawl_wall", "agile_jutting_wall",
  "agile_grapple_wall", "agile_jump_wall", "agile_wall_opening", "agile_crate_wall",
  /* rocks, ladders and stairs */
  "agile_climbing_rocks", "agile_climbing_rocks_b", "agile_stone_ladder",
  "agile_stone_ladder_down", "agile_staircase_up", "agile_staircase_down",
  "agile_stone_ladder_b", "agile_wall_support", "agile_ledge_climb",
  /* ropes */
  "agile_climbing_rope", "agile_climbing_rope_b", "agile_climbing_rope_c",
  "agile_rope_up", "agile_rope_down", "agile_rope_up_b",
  /* pipes and tunnels */
  "agile_pipe", "agile_pipe_b", "agile_pipe_c", "agile_pipe_d", "agile_pipe_e",
  "agile_pipe_climb", "agile_tunnel", "agile_tunnel_pass", "agile_tunnel_enter",
  "agile_tunnel_blocked", "agile_tunnel_stone", "agile_tunnel_walk",
  "agile_tunnel_wide", "agile_tunnel_wide_b", "agile_tunnel_enter_b",
  "agile_cart_tunnel", "agile_cart_tunnel_down", "agile_underwall",
  "agile_trapdoor_tunnel",
  /* ledges, beams and gaps */
  "agile_balancing_ledge", "agile_balance_beam", "agile_balance_beam_b",
  "agile_gap_stone", "agile_gap_squeeze", "agile_gap_wall",
  /* the crossing family */
  "agile_net", "agile_obstacle_net_b", "agile_hurdle", "agile_rocky_ledge",
  "agile_rope_bridge", "agile_stepping_log", "agile_stepping_stone_b",
  "agile_stepping_stone_c", "agile_ice_ledge",
  /* and the flames, which block like the walls they stand in */
  "agile_wall_of_flame", "agile_wall_of_flame_b",
  /* the way home */
  "agile_portal",
]);

/* The object types a tile can lose and lose nothing: pure scenery, the sort of
   thing this file scatters by the hundred and that nobody walks anywhere for
   its own sake. Two places read this set and it is why it is exported:

     * `createWorld`'s sealed-tile pass (further down) takes one of these back
       when it is the thing that closed a tile in on itself - a hole in the
       walkable map, and a creature whose spawn landed on one can never step off
       it;
     * `tools/check-world.mjs` reads it to tell a pocket that matters (it holds a
       spawn, a room, or a thing) from a sliver between four trees (it holds
       none of them), so the audit reports the first and only notes the second.

   A mining rock is deliberately absent: a rock is content, however it is
   placed. So are the gravestones and coffins of the churchyard, which is the
   other half of why the brothers' alcoves were a hard fault to open. */
export const SCATTER_TYPES = new Set([
  "tree", "bush", "flowers", "fern", "deadtree", "barrel", "crate", "crate_b",
  "plant", "rockery", "table_b", "bench",
]);

/* How big a pocket of walkable ground has to be before the sealed-tile pass
   bothers opening it when there is nothing in it. Below this a pocket is what a
   scatter of scenery leaves behind - the gap between four trees, the two tiles
   an alcove's neighbours fence off - and a player who can never step into one
   has lost nothing; at this size the ground is worth walking on, so if nothing
   can reach it and scenery is what stands in the way, a prop comes back out.
   `tools/check-world.mjs` reads the same number, and holds the pass to it: a
   pocket this size that still has scenery on its edge is the pass having
   failed, and the audit says so. */
export const MIN_POCKET = 8;

/* --- wall decor ------------------------------------------------------------
   Environmental items that hang ON a wall rather than standing in the tile: the
   leaf of an open door, a wall lever, a painting, a portrait, a hanging banner.
   The cache authors every one of them as a thin model flat against one face of
   its tile (its model type is 4 - see locmodels.js#prepareLoc), so this world
   places them the same way and gives them two properties that a prop does not
   have:

     * **a wall-decor tile is walkable.** The item is against the wall face, not
       in the middle of the floor, so there is nothing to walk into: a person can
       stand in (or beside) the tile without clipping the model. That is the
       user's own rule (2026-09-22, standing preference P4) and
       it is why none of these types is in `SOLID_TYPES`.
     * **it may still block a DIRECTION.** Some wall-mounted things do seal a
       face of their tile - a lever's bracket, a portcullis, the leaf of a door
       that is only half open. An object carries that as `o.block`: a 4-bit mask
       in the same quarter-turn numbering the walls and doors use (bit 0 = the
       west edge, 1 = south, 2 = east, 3 = north). `0`/absent blocks nothing,
       `15` blocks every side. `world.blocksStep` is what reads it and
       `pathfind.js` and `game.js#stepEntity` are what honour it, so a
       walkable-but-directional item is respected by routes and by steps alike.

   A door is the class's first member and its two states are the two halves of
   the idea: shut, it is a wall - it is in `SOLID_TYPES` and blocks every side;
   open, the leaf lies against the jamb and its tile is walkable, with nothing
   blocked (`world.isWalkable` reads the `open` flag). */
export const WALL_DECOR_TYPES = new Set(["painting", "lever", "banner", "wall_decor"]);

export function isWallDecor(o) {
  return !!o && WALL_DECOR_TYPES.has(o.t);
}

/* The edge of a tile a step crosses, in the same numbering as `o.block` and the
   wall rotations: a step to the east (dx > 0) crosses the tile's WEST edge. */
function edgeCrossed(dx, dz) {
  return dx > 0 ? 0 : dx < 0 ? 2 : dz > 0 ? 3 : 1;
}

/* Does this step cross a face the object seals? `from`/`to` are tile
   coordinates. Only a walkable object can seal a face - the ones that are not
   walkable refuse the step outright through `world.isWalkable` - and the check
   is symmetric, so an object blocks entering from a sealed side and leaving
   through it. Walls are the family's thin members: a wall tile is walkable
   (the panel stands on one edge, the middle of the tile is free), so the mask
   is what keeps the wall a wall. A wall object with no mask seals every side -
   fail closed, so a placement that forgot its faces behaves like the old solid
   tile rather than a hole. A diagonal step is read as its two L-paths round the
   corner it cuts: every one of the four tiles meeting at that corner owns two
   of the eight faces there, and the four cardinal half-steps between them ask
   every face, so a diagonal can neither slip a wall line through the joint
   between two panels nor clip a corner post - while a diagonal past a wall's
   open end, where no face seals, stays free. In sight mode (`sight = true`)
   low ruin walls do not count: they are knee height, so a bow or a spell
   flies over them while feet still walk round - the safespot rule. */
function faceBlocked(world, fx, fz, tx, tz, sight, plane = 0) {
  const dx = tx - fx;
  const dz = tz - fz;
  if ((dx === 1 || dx === -1) && (dz === 1 || dz === -1)) {
    return faceBlocked(world, fx, fz, fx + dx, fz, sight, plane)
      || faceBlocked(world, fx, fz, fx, fz + dz, sight, plane)
      || faceBlocked(world, fx + dx, fz, tx, tz, sight, plane)
      || faceBlocked(world, fx, fz + dz, tx, tz, sight, plane);
  }
  for (const [x, z, ex, ez] of [[tx, tz, dx, dz], [fx, fz, -dx, -dz]]) {
    const o = world.objAt(x, z, plane);
    /* A tile that is not walkable refuses the step by itself (a shut door is a
       wall to every route, the player's included - standing preference P3). Only
       an item standing on a walkable tile can seal a FACE of it. */
    if (!o || !world.isWalkable(x, z, plane)) continue;
    if (sight && o.t === "lowwall") continue;
    const mask = o.block != null ? o.block : (o.t === "wall" || o.t === "lowwall" ? 15 : 0);
    if (!mask) continue;
    if (mask & (1 << edgeCrossed(ex, ez))) return true;
  }
  return false;
}

export function blocksStep(world, fx, fz, tx, tz, plane = 0) {
  return faceBlocked(world, fx, fz, tx, tz, false, plane);
}

/* Whether a bow or a spell can fly between two bodies: the tile-centre ray is
   walked tile to tile (Amanatides-Woo, so every tile the line touches is
   visited and corner touches read as diagonals), and no visited transition
   may cross a sealed face. Faces only, never tiles - trees, fences and props
   do not block sight (the user's rule, 2026-10-09: arrows and spells fly
   through trees), and low ruin walls do not either (above). A shut door does:
   its tile is unwalkable so no face ever answers for it, and a ray through it
   would otherwise fly down the corridor it closes. True = no line of sight to
   any of the tiles (a big body is hittable through any clear face of its
   floor). */
export function losBlocked(world, aTiles, bTiles) {
  for (const a of aTiles) {
    for (const b of bTiles) {
      if (losTo(world, a.x, a.z, b.x, b.z)) return false;
    }
  }
  return true;
}

function losTo(world, ax, az, tx, tz) {
  if (ax === tx && az === tz) return true;
  const x0 = ax + 0.5;
  const z0 = az + 0.5;
  const dx = (tx + 0.5) - x0;
  const dz = (tz + 0.5) - z0;
  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX !== 0 ? (stepX > 0 ? (ax + 1 - x0) / dx : (x0 - ax) / -dx) : Infinity;
  let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? (az + 1 - z0) / dz : (z0 - az) / -dz) : Infinity;
  let cx = ax;
  let cz = az;
  for (let i = 0; i < 512; i++) {
    let nx = cx;
    let nz = cz;
    if (tMaxX < tMaxZ) { nx = cx + stepX; tMaxX += tDeltaX; }
    else if (tMaxZ < tMaxX) { nz = cz + stepZ; tMaxZ += tDeltaZ; }
    else { nx = cx + stepX; nz = cz + stepZ; tMaxX += tDeltaX; tMaxZ += tDeltaZ; }
    if (faceBlocked(world, cx, cz, nx, nz, true)) return false;
    if (nx !== tx || nz !== tz) {
      const o = world.objAt(nx, nz);
      if (o && o.t === "door" && !o.open) return false;
    }
    cx = nx;
    cz = nz;
    if (cx === tx && cz === tz) return true;
  }
  return true;
}

/* Whether a MELEE blow can be struck between two bodies: every tile pair the
   swing could cross - each attacker-floor tile against each victim-floor tile
   at orthogonal distance one - is asked `blocksStep`, and the blow lands only
   through an unsealed face. Same-tile pairs are skipped (a blow from
   underneath lands - the step-out rule, not the wall rule), and a diagonal
   neighbour has no orthogonal pair at all (a melee reach never accepts one -
   see combat.js#reachDistance). So a blade beside a wall panel waits for a
   clear side instead of hitting through it, while bows and spells keep the
   distance-only reach they always had. */
export function swingBlocked(world, aTiles, bTiles) {
  let adjacent = false;
  for (const a of aTiles) {
    for (const b of bTiles) {
      if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1) continue;
      adjacent = true;
      if (!blocksStep(world, a.x, a.z, b.x, b.z)) return false;
    }
  }
  return adjacent;
}

/* --------------------------------------------------------------- the trees

   The tree families the cache gives us: one entry per world `kind`, listing the
   baked loc models that kind draws. This table lives here rather than with the
   renderer (it was scene.js#TREE_GROUPS) because the *world* is what plants a
   tree now, and the model a tree draws and the tiles it occupies have to be one
   decision - see TREE_FOOT below. scene.js re-exports it under its old name and
   still reads it for the trees the world does not place (the `::tree`/`::trees`
   specimens, ui.js#TREE_KINDS).

   A kind is either the scattered species (tree, oak, willow, yew, magic, maple,
   evergreen, leafy), the dead trees, or one of the specimen-only families.
   Within a family the members are usually the same species in different skins
   and sizes; the odd ones are called out here, because several ids that look
   like ordinary forest trees are not (audited against the cache's own
   ObjectDefinitions - every loc name below is the one the cache itself stores -
   and cross-checked against the OSRS wiki by object id):

     * `oak` is loc 1281, the ordinary oak. `arctic_pine` is `oak_b` = loc 3037,
       which the cache *also* names "Oak" (it is the snowy pine of the far
       north, and why it was once swept into the oak group). `snow` is
       tree_d/e/f = loc 1330/1331/1332, "Tree (snow)" - 3x3 pale canopies that
       only exist on Trollweiss Mountain, the Frozen Waste Plateau and Waterbirth
       Isle, so they are deliberately NOT in the forest scatter.
     * `tirannwn` is tree_g = 3879, "Tree (Tirannwn)", which paints its canopy
       with the fern texture rather than the leaf one.
     * `deadtree` is every dead tree, in three palettes and two sizes: dead_a and
       dead_c are 2x2, dead_b and dead_d are 1x1 (dead_c is loc 1290, "Dead tree
       (sandy)", dead_d 1383 "Dead tree (old)").
     * `evergreen` mixes sizes too: evergreen_a is 2x2, b/c/d are 3x3.
     * `stump` is what a felled tree leaves: stump_a 1x1, stump_b/stump_c 2x2.

   So the forest scatter uses tree, oak, willow, yew, leafy and evergreen, and
   the out-of-place variants are kept for the `::trees` row.

   `TREE_FOOT` is the footprint (in tiles, `[sizeX, sizeY]`) each of those models
   stands in: every tree in the cache covers more than the tile it is anchored
   on, and this world makes each of them solid over exactly that footprint -
   "you cannot stand under a tree, or inside its trunk". The sizes are the
   cache's own (`src/models/locs.json`, ObjectDefinition sizeX/sizeY), written
   out here because the world is built before the loc bake has landed - the same
   reason PROP_FOOT below is hand-declared - and `tools/check-locs.mjs` holds
   every one of them to the bake, so the two cannot drift.

   The two sizes worth remembering, because they are what a player feels as "how
   close can I stand": a small tree (tree_a/b/c, the willow, the maple, the
   magic tree, the leafy tree, the achey, the small evergreen) takes a 2x2, and
   an oak or anything like one (the yew, the large evergreens, the snow trees)
   takes a 3x3. A couple of dead trees and the hollow tree are 1x1, and the
   dense forests are 3x2. */
export const TREE_FAMILIES = {
  tree: ["tree_a", "tree_b", "tree_c"],
  leafy: ["leafy"],
  oak: ["oak"],
  willow: ["willow"],
  yew: ["yew"],
  maple: ["maple"],
  magic: ["magic"],
  evergreen: ["evergreen_a", "evergreen_b", "evergreen_c", "evergreen_d"],
  hollow: ["hollow"],
  achey: ["achey"],
  dense_forest: ["dense_forest", "dense_forest_b"],
  deadtree: ["dead_a", "dead_b", "dead_c", "dead_d"],
  stump: ["stump_a", "stump_b", "stump_c"],
  snow: ["tree_d", "tree_e", "tree_f"],
  tirannwn: ["tree_g"],
  arctic_pine: ["oak_b"],
};

export const TREE_FOOT = {
  tree_a: [2, 2], tree_b: [2, 2], tree_c: [2, 2],
  tree_d: [3, 3], tree_e: [3, 3], tree_f: [3, 3], tree_g: [3, 3],
  oak: [3, 3], oak_b: [3, 3], willow: [2, 2], yew: [3, 3],
  maple: [2, 2], magic: [2, 2], leafy: [2, 2],
  hollow: [1, 1], achey: [2, 2],
  evergreen_a: [2, 2], evergreen_b: [3, 3], evergreen_c: [3, 3], evergreen_d: [3, 3],
  dense_forest: [3, 2], dense_forest_b: [3, 2],
  dead_a: [2, 2], dead_b: [1, 1], dead_c: [2, 2], dead_d: [1, 1],
  stump_a: [1, 1], stump_b: [2, 2], stump_c: [2, 2],
  jungle_tree_a: [2, 2], palm_a: [2, 2], banana_tree: [2, 2], palm_leafy: [1, 1], palm_trunk_high: [1, 1], palm_opt_c: [1, 1], palm_opt_d: [1, 1],
};

/* The same table for the bushes, and for the same reason: a bush is stamped
   over the ground its model covers instead of standing on one tile with the art
   spilling over its neighbours (world.js#stampFoot). Three of the cache's four
   bush models are 2x2 (`bush_a` loc 1118, `bush_b` 1119, `bush_c` 1122 - see
   src/data/loc-cache-menus.json) and the fourth, `bush_small` (1125), is 1x1,
   so a bush is a two-tile obstacle about three quarters of the time. */
export const BUSH_FOOT = { bush_a: [2, 2], bush_b: [2, 2], bush_c: [2, 2], bush_small: [1, 1], jungle_bush_a: [1, 1] };

/* The same table for the shipwrecks (tutorial island): every wreck key's own
   footprint, taken from its loc def's sizeX/sizeY (see the bake table in
   src/tools/cache-bake/locs.mjs) and held against the bake by
   tools/check-locs.mjs. A wreck is stamped over its footprint the same way a
   tree is (world.js#stampFoot). */
export const WRECK_FOOT = {
  wreck_a: [1, 1], wreck_b: [2, 2], wreck_c: [2, 2], wreck_d: [1, 2], wreck_e: [2, 2],
  wreck2_01: [3, 2], wreck2_02: [3, 1],
  wreck2_03: [1, 1], wreck2_04: [1, 1], wreck2_05: [1, 1], wreck2_06: [1, 1],
  wreck2_07: [1, 1], wreck2_08: [1, 1], wreck2_09: [1, 1], wreck2_10: [1, 1],
  wreck2_11: [2, 1], wreck2_12: [3, 1], wreck2_13: [1, 1], wreck2_14: [3, 1],
  wreck2_15: [3, 1], wreck2_16: [1, 1], wreck2_17: [1, 1], wreck2_18: [1, 1],
  wreck2_19: [1, 1], wreck2_20: [3, 1], wreck2_21: [3, 2], wreck2_22: [3, 2],
  wreck2_23: [1, 1], wreck2_24: [1, 1], wreck2_25: [1, 1], wreck2_26: [1, 1],
  wreck2_27: [1, 1],
  broken_boat_a: [2, 3], broken_boat_b: [2, 3], broken_boat_c: [2, 3],
  broken_boat_d: [2, 3], broken_boat_e: [2, 3],
  ship_hull_a: [2, 1], ship_hull_b: [2, 1], ship_hull_c: [1, 1], ship_hull_d: [2, 1],
  ship_mast_a: [1, 1], ship_mast_tall: [1, 1],
  ship_wheel: [1, 1], ship_gang: [1, 1], ship_boat: [3, 3],
};

/* The bush models, in the order scene.js#_locSpec has always picked them, so a
   bush still draws the model it drew before it learned its own footprint. */
export const BUSH_KEYS = ["bush_a", "bush_b", "bush_c", "bush_small"];

export function bushKeyAt(x, z) {
  return BUSH_KEYS[hashPick(x, z, 5153, BUSH_KEYS.length)];
}

/* The tree family a world `kind` draws, and the model of it at a tile. The pick
   is the same hash the renderer used to make per tile - the two seeds are the
   ones scene.js#_locSpec used, 3313 for the living trees and 4241 for the dead
   ones - so a forest's mix of models is unchanged. What changed is *when* it is
   made: once per tree, at the tree's anchor (world.js#stampFoot), so the model
   and the footprint it is stamped with are the same choice. */
export function treeFamilyOf(kind) {
  return TREE_FAMILIES[kind] || TREE_FAMILIES.tree;
}

export function treeKeyAt(kind, x, z) {
  const list = treeFamilyOf(kind);
  return list[hashPick(x, z, kind === "deadtree" ? 4241 : 3313, list.length)];
}

/* The model a felled tree leaves. All three stump models are smaller than the
   tree they replace, so the pick follows the tree's own size - a 1x1 tree (the
   hollow tree, the two small dead ones) leaves the small stump, anything wider
   one of the two large ones - and the anchor tile is what makes it stable: the
   same tree always leaves the same stump. */
export function stumpKeyFor(x, z, fx, fz) {
  const pool = (fx <= 1 && fz <= 1) ? ["stump_a"] : ["stump_b", "stump_c"];
  return pool[hashPick(x, z, 3313, pool.length)];
}

function riverCenterX(z) {
  return 34 + 11 * Math.sin(z * 0.05) + 4 * Math.sin(z * 0.13 + 1.7);
}

function riverWidth(z) {
  return 4.0 + 1.3 * Math.sin(z * 0.09 + 0.4);
}

const FLAT_ZONES = [
  { x0: 36, z0: 38, x1: 90, z1: 88, feather: 12 },
  { x0: 90, z0: 36, x1: 110, z1: 58, feather: 8 },
  { x0: 90, z0: 60, x1: 110, z1: 80, feather: 8 },
  { x0: 52, z0: 98, x1: 78, z1: 120, feather: 8 },
  { x0: 14, z0: 52, x1: 40, z1: 62, feather: 7 },
];

function flatMask(x, z) {
  let m = 1;
  for (const zn of FLAT_ZONES) {
    const dx = Math.max(zn.x0 - x, 0, x - zn.x1);
    const dz = Math.max(zn.z0 - z, 0, z - zn.z1);
    const d = Math.hypot(dx, dz);
    if (d >= zn.feather) continue;
    const t = d / zn.feather;
    m = Math.min(m, t * t * (3 - 2 * t));
  }
  return m;
}

/* --- the coast ------------------------------------------------------------
   The height field used to stop dead at the border: the last row of land was
   the same height as the row before it, and past it there was nothing but the
   ocean plane, so the map read as a square slab cut out of a larger world
   instead of as an island. What a real landmass has, and what this adds, is
   the ground sinking into the sea over the last few tiles.

   The dip is a blend toward a sea bed, `h + (bed - h) * w`, not a cliff: the
   shape the land already had is squashed into the water rather than sliced
   off, so a hill becomes a headland that reaches further out and a hollow a
   bay. The *distance* to the border is run through a low-frequency noise
   first, which is what runs the shoreline in bays and points instead of
   wrapping the map in a rectangle with rounded corners.

   The bed is `SEA_FLOOR` plus a quarter of the land's own relief, so it is not
   a mirror-flat plate underneath (a hill leaves a shoal, a hollow scours a
   channel) and so the water is at its deepest - the depth the ocean plane out
   beyond the border is drawn at - well before the border is reached.

   The blend alone is not enough, though: it is proportional, so the border's
   own ground - which this seed plants at two to four metres, higher than the
   middle of the map, since the middle is where the town is levelled and the
   river and the lake are carved - keeps most of its height and the map's edge
   is still a wall of land with a puddle against it. So the coast also cuts:
   the land is held down to a shore profile that rises from the bed at the
   border to `CLIFF` at the coast's inland limit, which is what a sea does to a
   hill - a cliff, and a rocky one, since a profile steep enough to reach the
   water from this height in a few tiles is steeper than the ground's own
   slope (`slope > 1.5` in the tile classifier). Where the land is low the
   blend reaches further in than the profile does and the shore is a bay with
   a beach; where it is high the profile wins and the shore is rock. */
const COAST = 11;
const COAST_WOBBLE = 9;
const SEA_FLOOR = -6.8;
const CLIFF = 11.5;

/* How much further up the shore the sand reaches than the waterline's own
   half-metre shelf (`avg < waterLevel + 0.5` in the tile classifier). The
   coastal ground climbs at a bit over a metre per tile, so the plain window
   catches only one shore tile in three and the coast reads as grass running
   straight into the sea; this is what makes it a beach. It is applied before
   the steepness test, so the map's four corners - where the profile's gradient
   is diagonal and therefore twice as steep - keep their rock. */
const BEACH = 2.3;

function coastDip(x, z, seed) {
  const edge = Math.min(x, z, W - x, MAIN_H - z);
  return edge + (fbm(x * 0.045, z * 0.045, seed + 2200, 3) - 0.5) * COAST_WOBBLE;
}

function coastal(h, x, z, seed) {
  const d = coastDip(x, z, seed);
  if (d >= COAST) return h;
  const c = clamp(d / COAST, 0, 1);
  const w = Math.pow(1 - c, 1.7);
  const bed = SEA_FLOOR + (h - 1.7) * 0.25;
  const out = h + (bed - h) * w;
  const lid = bed + CLIFF * Math.pow(c, 1.35);
  return out > lid ? lid : out;
}

/* The land's own height, with no coast in it. This is what the sea level is
   measured from - see the note in createWorld on why that order matters - and
   what the coast is then docked to. Exported alongside `rawHeight` for the
   tooling that has to reason about the coast as a thing apart (see
   src/tools/check-world.mjs). */
export function landHeight(x, z, seed) {
  let h = (fbm(x * 0.019, z * 0.019, seed, 4) - 0.5) * 9;
  h += (fbm(x * 0.06, z * 0.06, seed + 77, 3) - 0.5) * 1.7;
  h += 1.7;
  h *= flatMask(x, z);
  const dr = x - riverCenterX(z);
  const rw = riverWidth(z);
  const t = clamp(1 - Math.abs(dr) / (rw + 4.5), 0, 1);
  h -= 9.0 * t * t;
  const dl = Math.hypot(x - 101, z - 99);
  const tl = clamp(1 - dl / 26, 0, 1);
  h -= 8.5 * tl * tl;
  /* Micro-relief fades out with the flat mask as well: a town's ground is
     authored level, so the last half-metre of noise must not survive inside a
     flattened zone or every building would sit on a slight slope (which is
     what pushes an uphill wall through its roof). */
  h += (noise2(x * 0.14, z * 0.14, seed + 5) - 0.5) * 0.5 * flatMask(x, z);
  return h;
}

export function rawHeight(x, z, seed) {
  return coastal(landHeight(x, z, seed), x, z, seed);
}

/* --- the stepping stones ----------------------------------------------------
   The `rocky` object is a stepping stone: one of the cache's own grey rocks
   (rock_a / rock_b, 0.66 and 0.70 tiles tall) stood in the water, which a
   player leaps on to and then leaps from to the next one (see
   src/actions.js#jumpToRocky). `heightAt` has to know how high the stone's top
   is, because a stander is placed on the *surface* of the thing they are
   standing on and a stone's surface is not its ground - it is a rock standing
   in the river. Both numbers are needed by scene.js as well (it sits the models
   at ROCKY_STEP_BASE and this file puts a stander at ROCKY_STEP_TOP), so they
   live here, next to the water level they are measured from. */
export const ROCKY_STEP_BASE = 0;
export const ROCKY_STEP_TOP = 0.66;

/* --- the town square's dais -------------------------------------------------
   The square (tiles x 58-66, z 47-55) stands as two shallow steps: the outer
   ring a quarter tile up, the cobbled inner floor half a tile up, each with a
   vertical stone face. `squareStepAt` is the overlay every height in the world
   is read through - `heightAt` below adds it, and scene.js stands its props on
   it (`_baseY`) and draws the platforms themselves (`_chunkDais`). The corner
   field underneath stays flat, so the tile classifier, the bank pass and the
   walkability tests never know the dais is there: it is decorative height, and
   bodies walk up it rather than around it. */
export const SQUARE = { x0: 58, z0: 47, x1: 66, z1: 55 };
export const SQUARE_STEP_OUTER = 0.25;
export const SQUARE_STEP_INNER = 0.5;
export function squareStepAt(bx, bz) {
  if (bx < SQUARE.x0 || bx > SQUARE.x1 || bz < SQUARE.z0 || bz > SQUARE.z1) return 0;
  const inner = bx > SQUARE.x0 && bx < SQUARE.x1 && bz > SQUARE.z0 && bz < SQUARE.z1;
  return inner ? SQUARE_STEP_INNER : SQUARE_STEP_OUTER;
}

export function createWorld(seed = 2007) {
  const cw = W + 1;
  const corner = new Float32Array(cw * (H + 1));
  for (let z = 0; z <= H; z++) {
    for (let x = 0; x <= W; x++) corner[z * cw + x] = landHeight(x, z, seed);
  }

  const sorted = [];
  for (let z = 0; z <= MAIN_H; z++) {
    for (let x = 0; x <= W; x++) sorted.push(corner[z * cw + x]);
  }
  sorted.sort((a, b) => a - b);
  const waterLevel = Math.round(sorted[Math.floor(sorted.length * 0.075)] * 4) / 4;

  /* The sea level is measured on the land's own heights, above, and only then
     is the land docked to it. Doing it the other way round would let the sea
     pick its own level out of the ground it had just drowned - the percentile
     would drop to the bed, and every tile on the map that keys off this one
     number (the beach, the marsh, the river bed, the walkable test) would be
     reclassified against a sea five metres lower than the river. */
  for (let z = 0; z <= H; z++) {
    for (let x = 0; x <= W; x++) {
      const i = z * cw + x;
      corner[i] = coastal(corner[i], x, z, seed);
    }
  }

  /* --- Cairn Isle ----------------------------------------------------------

     The second landmass (src/island.js). It is stamped here, on the corners,
     between the coast pass and the bank pass, and the placement is the whole of
     why it is a real island rather than a lump: by the time this runs the
     southern rows of the map have been dragged down to the sea bed by the coast
     pass, so the isle's profile is written *over* an ocean that already exists,
     and the bank pass immediately below then does to the isle's shore exactly
     what it does to the mainland's - lifts the shin-deep tiles until they clear
     the waterline, so the shore is a shelf rather than a step. Nothing in the
     tile classifier or anything after it knows the isle is there; it is a second
     landmass on the shared height field, and it gets its grass, its sand and its
     water from the same four lines of rules every other tile on the map does.

     The stamp is a blend, not a write: `isleHeight` returns the corner's own
     value untouched outside the isle's neighbourhood and an authored height
     inside it, and it meets the sea bed at the same number at the box's edge so
     the join has no step. Only the box is visited (`ISLE.boxX`/`boxZ` - the box
     is not square, because the isle is not: the map's own height is the scarce
     direction), so the mainland's corners are not merely unchanged by this -
     they are not read by it. */
  for (let z = Math.max(0, ISLE.cz - ISLE.boxZ); z <= Math.min(H, ISLE.cz + ISLE.boxZ); z++) {
    for (let x = Math.max(0, ISLE.cx - ISLE.boxX); x <= Math.min(W, ISLE.cx + ISLE.boxX); x++) {
      const i = z * cw + x;
      corner[i] = isleHeight(x, z, waterLevel, seed, corner[i]);
    }
  }
  for (let z = 131; z <= 149; z++) {
    for (let x = 107; x <= 126; x++) {
      const dx = (x - 116) / 7;
      const dz = (z - 140) / 6;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1.6) continue;
      const t = Math.max(0, Math.min(1, (1.6 - d) / 0.6));
      const s = t * t * (3 - 2 * t);
      const i = z * cw + x;
      corner[i] = corner[i] + (waterLevel + 2.1 - corner[i]) * s;
    }
  }
  /* The western twin of the islet above (runecrafting): the same rise in the
     mirror position, so the essence mine stands on its own island the way the
     Air Altar stands on the eastern one. Same numbers, mirrored in x. */
  for (let z = 150; z <= 168; z++) {
    for (let x = 1; x <= 20; x++) {
      const dx = (x - 11) / 7;
      const dz = (z - 159) / 6;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1.6) continue;
      const t = Math.max(0, Math.min(1, (1.6 - d) / 0.6));
      const s = t * t * (3 - 2 * t);
      const i = z * cw + x;
      corner[i] = corner[i] + (waterLevel + 2.1 - corner[i]) * s;
    }
  }
  /* The ruins' point (runecrafting): a NEW peninsula for the mysterious
     ruins, east of the mine and beyond the beach - the same rise the two
     islets above use, so the bank pass below shelves its shores exactly the
     way it shelves theirs and the tile classifier hands it the same sand.
     No per-tile edge work is needed for the waterline: the ground is one
     continuous height field, so a stamped rise meets the sea in a smooth
     shore by construction (the perchance.org/pathing stamp set is for 2D
     overlay path tiles and does not apply here). It is one broad headland,
     not a bump: the wide ellipse pushes dry land out to x125 with room to
     walk right round the ruins, and its long flanks curve back to meet the
     straight beach north and south, so the sea wraps three sides with a
     single smooth coastline and no channels. x126 and out stay wet (two sea
     tiles past the tip - the audit's three-wide minimum is waived here at
     the user's explicit request for more room east). */
  for (let z = 60; z <= 84; z++) {
    for (let x = 117; x <= 126; x++) {
      const dx = (x - 122) / 3.0;
      const dz = (z - 72) / 7;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1.6) continue;
      const t = Math.max(0, Math.min(1, (1.6 - d) / 0.6));
      const s = t * t * (3 - 2 * t);
      const i = z * cw + x;
      corner[i] = corner[i] + (waterLevel + 2.1 - corner[i]) * s;
    }
  }

  /* The new island (blank for now): a large grass landmass in the open sea
     between Cairn Isle and the underbelly, centred (64,280), 60 by 52. The
     same elliptical smoothstep rise the runecrafting islets above use, wider:
     flat grass inside (the bank pass and the tile classifier below give it
     its sand rim for free), meeting the sea bed past d 1.6 with no step. The
     rise is waterLevel + 2.6, not the islets' + 2.1: this far south every tile
     reads as coast to the classifier (coastDip < COAST), so ground below
     waterLevel + 2.3 is beach - the islets' height would leave the whole
     island sand. */
  for (let z = 236; z <= 324; z++) {
    for (let x = 14; x <= 114; x++) {
      const dx = (x - 64) / 30;
      const dz = (z - 280) / 26;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1.6) continue;
      const t = Math.max(0, Math.min(1, (1.6 - d) / 0.6));
      const s = t * t * (3 - 2 * t);
      const i = z * cw + x;
      corner[i] = corner[i] + (waterLevel + 2.6 - corner[i]) * s;
    }
  }

  /* The tutorial island (terrain only for now - script, wreck and Scully come
     later): a narrow jungle island in the empty sea between Cairn Isle and the
     new island, 75 long east-west and ~14 wide north-south on average. Same
     elliptical smoothstep rise as the stamps above: the shoreline wobbles with
     two sine bends so the width runs ~8-20 around the 14 mean and the ends
     taper to sand points, and the rise is waterLevel + 0.7 so the classifier
     below hands it a sand rim and a grass core the same way it does the new
     isle. The island sits barely above the waterline - a flat near-sea-level
     shelf, not a raised dome (user ask 2026-10-27). The land sits near d <= 1.2
     (past that the blend falls back to the sea bed), so the axes are 75/2.4 by
     14/2.4. Stamped over open sea, so the blend to the bed past d 1.6 is
     seamless, and nothing outside the box is read or written. */
  for (let z = 200; z <= 228; z++) {
    for (let x = 16; x <= 112; x++) {
      const wob = 1.2 * Math.sin(x * 0.23 + 1.0) + 0.8 * Math.sin(x * 0.11 + 0.5);
      const dx = (x - 64) / 31;
      const dz = (z - 214 - wob) / 6.8;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1.6) continue;
      const t = Math.max(0, Math.min(1, (1.6 - d) / 0.6));
      const s = t * t * (3 - 2 * t);
      const i = z * cw + x;
      corner[i] = corner[i] + (waterLevel + 0.7 - corner[i]) * s;
    }
  }

  /* --- the bank ------------------------------------------------------------
     The shallow water's own surface is drawn at `waterLevel + 0.16` (the river
     quads - see scene.js#_chunkWater), so a land tile whose ground averages
     below that plane reads as a player wading along the shore: the ground
     under their feet is under the water beside them, and the water quad laps
     over the tile's own edge. Coast and river both leave a row or two of bank
     in exactly that window, so this lifts them: any land tile whose average
     sits below the plane is raised until it clears it by a hand's breadth, and
     half of that lift is passed to the ring of corners around it so the bank
     is a shelf rather than a step.

     It runs to a fixed point - the first pass can reveal a sliver of new bank
     where the lift has already raised a water tile's own average over the
     waterline - and it runs on the corners, before the tiles are classified,
     so the shoreline itself is then measured from the banked ground. */
  {
    const BANK = waterLevel + 0.22;
    /* The lift reaches a little *into* the water as well, or the frontier of
       new bank would only ever advance one tile per pass (a lift raises the
       corner it shares with the shallow tile beside it, and that tile is only
       then revealed as land). Everything shallower than a quarter of a metre
       goes into the bank, which is one row of a beach or a river's edge. */
    const REACH = waterLevel - 0.14;
    for (let pass = 0; pass < 8; pass++) {
      const lift = new Float32Array(cw * (H + 1));
      let worst = 0;
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const i = z * cw + x;
          const avg = (corner[i] + corner[i + 1] + corner[i + cw] + corner[i + cw + 1]) / 4;
          if (avg >= BANK || avg < REACH) continue;
          const def = BANK - avg;
          if (def > worst) worst = def;
          if (def > lift[i]) lift[i] = def;
          if (def > lift[i + 1]) lift[i + 1] = def;
          if (def > lift[i + cw]) lift[i + cw] = def;
          if (def > lift[i + cw + 1]) lift[i + cw + 1] = def;
        }
      }
      if (!worst) break;
      for (let z = 0; z <= H; z++) {
        for (let x = 0; x <= W; x++) {
          const i = z * cw + x;
          const l = lift[i];
          let skirt = 0;
          if (x > 0 && lift[i - 1] > skirt) skirt = lift[i - 1];
          if (x < W && lift[i + 1] > skirt) skirt = lift[i + 1];
          if (z > 0 && lift[i - cw] > skirt) skirt = lift[i - cw];
          if (z < H && lift[i + cw] > skirt) skirt = lift[i + cw];
          corner[i] += l + skirt * 0.5;
        }
      }
    }
  }

  const tiles = new Uint8Array(W * H);
  const objs = new Map();
  /* The upstairs object map (see `objAt`): the upper floor's furniture and its
     down-stairs, keyed exactly like `objs` but read only on plane 1. */
  const upObjs = new Map();
  const rng = mulberry32(seed ^ 0x5f3a);

  const cornerAt = (x, z) => corner[z * cw + x];
  const groundAt = (x, z) => {
    const xf = clamp(x, 0, W);
    const zf = clamp(z, 0, H);
    const xi = Math.floor(xf);
    const zi = Math.floor(zf);
    const tx = xf - xi;
    const tz = zf - zi;
    const a = corner[zi * cw + xi] * (1 - tx) + corner[zi * cw + xi + 1] * tx;
    const b = corner[(zi + 1) * cw + xi] * (1 - tx) + corner[(zi + 1) * cw + xi + 1] * tx;
    return a * (1 - tz) + b * tz;
  };
  const heightAt = (x, z, plane = 0) => {
    /* Upstairs is the same ground stood UP_Y higher: the floor slab is flat
       (the footprint is levelled), so no rocky/bridge/dais rule applies up
       there. */
    if (plane === 1) return groundAt(x, z) + UP_Y;
    /* A stepping stone (the `rocky` object) is the one object whose SURFACE is
       not the ground it stands on: it is a rock standing in the river, so a
       player standing on one has to be put on the rock's own flat top - the
       same height scene.js stands the model at - or the leap that got them
       there would drop them into the river bed and the next one would start
       from under the water. Read by tile, because the callers hand this
       continuous coordinates (scene.js#updateEntityTransform passes the
       interpolated render position). */
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const o = objAt(bx, bz);
    if (o && o.t === "rocky") return waterLevel + ROCKY_STEP_TOP;
    const g = groundAt(x, z);
    /* The deck is asked in TILE coordinates too, exactly as `walkableTile` asks
       it. `BRIDGE` names the two rows the deck covers (z 56 and 57), which in
       continuous coordinates is z 56.0..58.0 - so asking `isBridgeArea(x, z)`
       with the walker's interpolated position answered "no bridge" for the whole
       southern row, and a player halfway across at z 57.5 was drawn at the river
       bed three tiles under the planks (walking the span by hand is what caught
       it; the check in tools/check-world.mjs holds it now). */
    if (isBridgeArea(bx, bz)) return Math.max(g, BRIDGE_DECK_Y);
    /* The square's dais (see `squareStepAt`): decorative height over the flat
       corner field, so bodies, props and picks all stand on the steps. */
    return g + squareStepAt(bx, bz);
  };

  const idx = (x, z) => z * W + x;
  const inBounds = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  /* A tree (or a bush) is *one* object over its whole footprint
     (world.js#TREE_FOOT, #BUSH_FOOT), not one object per tile of it: the same
     instance goes on every tile it covers, so a chop, a felling and a regrow are
     a single mutation and every tile of the tree answers the same way. That is
     what makes any of its tiles a click target and all of them solid, and what
     lets the renderer draw one model for the tree (see scene.js#_chunkLocs).

     `ox`/`oz` are the anchor - the west/north tile of the footprint, the one the
     model stands on - and `fx`/`fz` the footprint itself, remembered on the
     object so a felled tree's stump (a smaller model, see scene.js#_locSpec)
     still knows how much ground it is standing on. A footprint wider than it is
     deep only fits one way round, so such a tree is pinned to the unrotated
     model. */
  const stampFoot = (o, x, z) => {
    const ox = o.ox != null ? o.ox : x;
    const oz = o.oz != null ? o.oz : z;
    /* An object with no key of its own - a `kind` only, which is how the `::tree`
       specimens are written - settles on its model here, at its anchor, and the
       key is kept. Every tree and every bush in the world therefore knows which
       model it draws, which is what lets the footprint below be taken from it. A
       bush is picked out of the four the bake carries with the same hash and the
       same order scene.js#_locSpec used before the footprint existed, so it
       still draws the model it always drew. */
    if (!o.key) {
      o.key = o.t === "bush" ? bushKeyAt(ox, oz)
        : treeKeyAt(o.t === "deadtree" ? "deadtree" : (o.kind || "tree"), ox, oz);
    }
    const foot = o.t === "bush" ? BUSH_FOOT : o.t === "wreck" ? WRECK_FOOT : TREE_FOOT;
    const [fx, fz] = (o.fx && o.fz) ? [o.fx, o.fz] : (foot[o.key] || [1, 1]);
    o.ox = ox; o.oz = oz; o.fx = fx; o.fz = fz;
    if (fx !== fz && o.rot == null) o.rot = 0;
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        if (inBounds(ox + dx, oz + dz)) objs.set(idx(ox + dx, oz + dz), o);
      }
    }
    return o;
  };
  const setObj = (x, z, o) => {
    if (!inBounds(x, z)) return null;
    if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush" || o.t === "wreck")) return stampFoot(o, x, z);
    objs.set(idx(x, z), o);
    return o;
  };
  const objAt = (x, z, plane = 0) => {
    if (!inBounds(x, z)) return null;
    /* The upper floor's own objects live in their own map: a tile holds one
       ground object and one upstairs object, so the stairs stand on (76,54)
       on both levels without either evicting the other. */
    if (plane === 1) return upObjs.get(idx(x, z)) || null;
    return objs.get(idx(x, z)) || null;
  };
  /* Clearing ground means clearing the tree, not one tile of it. The sealed-tile
     pass at the end of this file and the `::tree` commands (ui.js) both delete a
     tile expecting the thing under it to be gone, and half a tree left standing
     is exactly the state this whole section exists to make impossible. The
     footprint is re-derived from the object rather than trusted, so a tile that
     was never stamped cannot take a neighbour's object away. A bush is cleared
     the same way. */
  const setUpObj = (x, z, o) => {
    if (!inBounds(x, z)) return null;
    if (o) o.plane = 1;
    upObjs.set(idx(x, z), o);
    return o;
  };
  const delUpObj = (x, z) => {
    upObjs.delete(idx(x, z));
  };
  const delObj = (x, z) => {
    const o = objAt(x, z);
    if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush")) {
      const fx = o.fx || 1, fz = o.fz || 1;
      const ox = o.ox != null ? o.ox : x, oz = o.oz != null ? o.oz : z;
      for (let dz = 0; dz < fz; dz++) {
        for (let dx = 0; dx < fx; dx++) {
          if (inBounds(ox + dx, oz + dz) && objs.get(idx(ox + dx, oz + dz)) === o) objs.delete(idx(ox + dx, oz + dz));
        }
      }
      return;
    }
    objs.delete(idx(x, z));
  };

 for (let z = 0; z < H; z++) {
   for (let x = 0; x < W; x++) {
     const c0 = cornerAt(x, z);
     const c1 = cornerAt(x + 1, z);
     const c2 = cornerAt(x, z + 1);
     const c3 = cornerAt(x + 1, z + 1);
     const avg = (c0 + c1 + c2 + c3) / 4;
     const hi = Math.max(c0, c1, c2, c3);
     const lo = Math.min(c0, c1, c2, c3);
     const slope = hi - lo;
     const jitter = hash01(x, z, 991);
     let t;
     if (avg < waterLevel + 0.04) t = T.WATERBED;
     else if (avg < waterLevel + (coastDip(x, z, seed) < COAST ? BEACH : 0.5)) t = T.SAND;
     else if (slope > 1.5) t = T.GRAVEL;
     else if (avg < waterLevel + 0.85) t = jitter > 0.6 ? T.MARSH : T.GRASS_DARK;
     else {
       const f = fbm(x * 0.028, z * 0.028, seed + 400, 3);
       t = f > 0.545 ? T.GRASS_DARK : T.GRASS;
     }
     tiles[idx(x, z)] = t;
   }
 }

  const isWaterTile = (x, z) => {
    if (!inBounds(x, z)) return true;
    const t = tiles[idx(x, z)];
    return t === T.WATERBED;
  };

  const pathPaint = (x, z, type = T.PATH) => {
    if (!inBounds(x, z)) return;
    if (tiles[idx(x, z)] === T.WATERBED) return;
    tiles[idx(x, z)] = type;
  };

  const hRoad = (x0, x1, z, w = 2) => {
    for (let zz = z; zz < z + w; zz++) for (let xx = x0; xx <= x1; xx++) pathPaint(xx, zz);
  };
  const vRoad = (z0, z1, x, w = 2) => {
    for (let xx = x; xx < x + w; xx++) for (let zz = z0; zz <= z1; zz++) pathPaint(xx, zz);
  };

  for (const z of [44, 56, 68, 80]) hRoad(40, 86, z);
  for (const x of [44, 56, 67, 80]) vRoad(40, 86, x);
  hRoad(18, 40, 56);
  vRoad(20, 44, 60, 1);
  vRoad(86, 96, 44);
  vRoad(86, 96, 80, 2);
  hRoad(86, 98, 56, 2);

  const bridgeTiles = [];
  for (let z = BRIDGE.z0; z <= BRIDGE.z1; z++) {
    for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
      if (inBounds(x, z) && tiles[idx(x, z)] === T.WATERBED) bridgeTiles.push([x, z]);
    }
  }
  for (let z = 56; z <= 57; z++) {
    for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
      if (inBounds(x, z) && tiles[idx(x, z)] === T.WATERBED) tiles[idx(x, z)] = T.BRIDGE;
    }
  }

  const buildings = [];
  /* The one building with a second storey, filled in by `building` above. */
  let upstairsSpec = null;

  /* Level the ground under a building's footprint (and one corner of apron,
     half-blended) to the footprint's HIGHEST corner. Real maps are authored
     flat under a building, and this is what keeps a building honest on a slope:
     every wall tile then stands at the same height as the roof's eaves, and a
     footprint that runs down into a river stays dry instead of filling with
     water. Taking the highest corner (not the mean) is what keeps it dry. */
  function levelFootprint(x0, z0, x1, z1) {
    let lvl = -Infinity;
    for (let z = z0; z <= z1 + 1; z++) {
      for (let x = x0; x <= x1 + 1; x++) {
        if (x < 0 || z < 0 || x > W || z > H) continue;
        lvl = Math.max(lvl, corner[z * cw + x]);
      }
    }
    if (lvl === -Infinity) return;
    /* A footprint that the coast has partly drowned is levelled UP to the
       shore, not down to the sea bed: taking the highest corner above already
       does that when any corner of the footprint is dry, and this catches the
       case where the coast has taken the whole of it, which is what would
       otherwise sink a lair at the water's edge (the two crags are the closest
       buildings to the border there are). */
    lvl = Math.max(lvl, waterLevel + 0.5);
    for (let z = z0; z <= z1 + 1; z++) {
      for (let x = x0; x <= x1 + 1; x++) {
        if (x < 0 || z < 0 || x > W || z > H) continue;
        corner[z * cw + x] = lvl;
      }
    }
    for (let z = z0 - 1; z <= z1 + 2; z++) {
      for (let x = x0 - 1; x <= x1 + 2; x++) {
        if (x < 0 || z < 0 || x > W || z > H) continue;
        if (x >= x0 && x <= x1 + 1 && z >= z0 && z <= z1 + 1) continue;
        corner[z * cw + x] = (corner[z * cw + x] + lvl) * 0.5;
      }
    }
  }

  function building(spec) {
    const { x0, z0, x1, z1 } = spec;
    levelFootprint(x0, z0, x1, z1);
    /* `floor: "none"` (see `yard` below) leaves the ground itself alone: a
       walled graveyard stands on the grass it was levelled on, not on a stone
       floor, and -1 is the "write no floor" sentinel used below. `floor:
       "check"` alternates the two check tiles by parity, the castle kitchen's
       black-and-white floor. */
    const floorTile = spec.floor === "stone" ? T.FLOOR_STONE
      : spec.floor === "cave" ? T.ROCKGROUND
      : spec.floor === "none" ? -1
      : spec.floor === "check" ? -2
      : T.FLOOR_WOOD;
    /* A `gap` is a perimeter tile the wall skips entirely. It is what gives a
       lair its *cave mouth* (see `cave` below): an opening you simply walk
       through, with no door to open and no wall to click. Ordinary buildings
       have none, so their ring stays closed except for the door tile - and a
       door is still listed in SOLID_TYPES, which is what keeps the gap the
       only way in. */
    const gaps = new Set((spec.gaps || []).map((g) => g[0] + "," + g[1]));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!inBounds(x, z)) continue;
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        /* A wall is a thin panel at one edge of its tile (scene.js#_wallRots),
           so the floor runs under the whole ring tile and the wall stands on the
           outer edge of it - the tile reads right from outside and from the
           inside face once the roof comes off. */
        if (floorTile >= 0) tiles[idx(x, z)] = floorTile;
        else if (floorTile === -2) tiles[idx(x, z)] = ((x + z) & 1) ? T.FLOOR_CHECK_B : T.FLOOR_CHECK_W;
        if (edge && !gaps.has(x + "," + z)) {
          /* A building may carry a second door (`door2` - the smithy's west
             door). Either tile gets the same hinged leaf; the swing plane comes
             off the tile's own edge, which reads identically to the old
             door-coordinate test for every existing single door. */
          const isDoor = (spec.door && x === spec.door.x && z === spec.door.z) ||
            (spec.door2 && x === spec.door2.x && z === spec.door2.z);
          if (isDoor) {
            const onXEdge = x === x0 || x === x1;
            setObj(x, z, {
              t: "door",
              dir: onXEdge ? "ns" : "ew",
              open: false,
              hingeAt: onXEdge ? "z0" : "x0",
            });
          } else {
            /* The procedural cube is only the fallback before the real cache
               wall bake lands; its height should match the baked wall's
               (loc 22373 is 1.875 tiles) so the building does not visibly
               shrink when the panels replace it. */
            /* The panel is thin and stands on the tile's outer edge, so the
               tile itself is standable ground: the object carries the sealed
               faces as its `block` mask (bit 0 west, 1 south, 2 east, 3 north -
               the same numbering `blocksStep` reads), and the tile is walkable
               (wall is not in SOLID_TYPES). Crossing the panel's face is refused
               by `blocksStep`; standing in the middle of the tile is free, so
               props and players sit flush against walls the kitchen crates do.
               Corners seal both faces. Door tiles carry no mask: a shut door
               stays a solid tile, an open one a free tile. */
            let block = 0;
            if (x === x0) block |= 1;
            if (z === z1) block |= 2;
            if (x === x1) block |= 4;
            if (z === z0) block |= 8;
            setObj(x, z, { t: "wall", color: spec.wall, h: spec.wallH || 1.9, block });
          }
        }
      }
    }
    buildings.push(spec);
    /* A building with an upper storey stands a second ring of walls on its own
       ring tiles, one level up: the upper floor's walls, written into the
       upstairs map (never into `objs`, which keeps the ground floor's). Every
       ring tile gets one, door tiles included - there is no upstairs door, so
       the wall above the ground door stays sealed. The floor paint and the
       scatter rules are the ground floor's own and are left alone. */
    if (spec.upperStorey) {
      upstairsSpec = spec;
      for (let z = spec.z0; z <= spec.z1; z++) {
        for (let x = spec.x0; x <= spec.x1; x++) {
          if (!inBounds(x, z)) continue;
          const edge = x === spec.x0 || x === spec.x1 || z === spec.z0 || z === spec.z1;
          if (!edge) continue;
          let block = 0;
          if (x === spec.x0) block |= 1;
          if (z === spec.z1) block |= 2;
          if (x === spec.x1) block |= 4;
          if (z === spec.z0) block |= 8;
          setUpObj(x, z, { t: "wall", color: spec.wall, h: spec.wallH || 1.9, block });
        }
      }
    }
    return spec;
  }

  const B = (name, x0, z0, x1, z1, door, opt = {}) =>
    building({
      name, x0, z0, x1, z1, door,
      door2: opt.door2 || null,
      floor: opt.floor || "wood",
      wall: opt.wall || 0xcbbd96,
      roof: opt.roof || 0x7b4a3c,
      roofH: opt.roofH || 2.7,
      roofAxis: opt.roofAxis || "x",
      upperStorey: !!opt.upperStorey,
    });

  /* A `cave` is a lair: a building with no roof and an open mouth instead of a
     door. A real cave's roof is the rock above it, which this world has no way
     to draw - a pitched roof on a square of stone walls would read as a cottage,
     and you would see straight into it from outside anyway. So a cave is built
     exactly like a building and left open to the sky: a ring of the cache's own
     stone wall, a rough-stone floor, and a two-tile gap where you walk in. A
     proper multi-level dungeon with a rock ceiling is future work (see
     src/TODO.md); until then this is the honest version of a cave on one layer.
     `scene.js#_buildRoofs` skips a `noRoof` building outright. */
  const cave = (name, x0, z0, x1, z1, gaps, opt = {}) =>
    building({
      name, x0, z0, x1, z1, door: null, gaps,
      floor: opt.floor || "stone",
      wall: opt.wall || 0x8a8272,
      roof: 0x2e2b28, roofH: 0,
      noRoof: true, cave: true,
    });

  /* A `yard` is an enclosure with no roof and no floor: a ring of the cache's
     own wall with a gate (a two-tile `gap`, exactly as a cave's mouth is), and
     the ground it stands on left as the grass it was levelled to. It is the
     right shape for a walled burial ground - the Barrows' own ground south of
     town - and it earns its place as a `building` for the three things that
     come with one: `levelFootprint` levels it, `isInsideBuilding` keeps the
     tree scatter out of it (a graveyard with trees growing through it is not a
     graveyard), and it costs no roof because `noRoof` is set. */
  const yard = (name, x0, z0, x1, z1, gaps, opt = {}) =>
    building({
      name, x0, z0, x1, z1, door: null, gaps,
      floor: "none",
      wall: opt.wall || 0x9a9186,
      roof: 0x2e2b28, roofH: 0,
      noRoof: true, yard: true,
    });

  B("General Store", 47, 48, 54, 55, { x: 50, z: 55 }, { wall: 0xc9b98a, roof: 0x84543f });
  /* The town is a row of storefronts either side of the crossroads: the bank,
     the general store and the smithy on the main street, and the specialist
     shops (armour, swords, archery, fishing, food) around them. Each shop's
     keeper is a spawn carrying that shop's key (see src/actions.js#SHOPS). */
  B("Armour Shop", 70, 50, 77, 55, { x: 73, z: 55 }, { wall: 0xd0c6a0, roof: 0x6f4a3a, upperStorey: true });
  /* No Sword Shop building: the sword sellers stand open-air on the town square
     itself (their spawns are with the other keepers below), so there is nothing
     on the spawn. The old free-standing plot south-west of town is open grass,
     and the "Sword Shop" minimap badge rides with the sellers, not a door. */
  B("Smithy", 59, 60, 66, 67, { x: 62, z: 67 }, { floor: "stone", wall: 0xb8a98a, roof: 0x6d4437, door2: { x: 59, z: 63 } });
  /* The church's door is on its WEST wall, not the south one. The south wall is
     where the churchyard's rank of stones is, and that is a wall in its own
     right: a line of headstones across the strip between the street and the
     shops, so a south door opens on to the stones and nothing else. The west
     wall faces the alley between the church and the smithy, which is a street,
     and it is the side the real Lumbridge church's own door is on. */
  B("Church", 71, 60, 78, 67, { x: 71, z: 64 }, { floor: "stone", wall: 0xd6d0bd, roof: 0x6f4a6a, roofH: 3.4, roofAxis: "z" });
  B("Archery Shop", 48, 72, 54, 79, { x: 51, z: 79 }, { wall: 0xc9bb90, roof: 0x6a5a3a });
  B("Fishing Shop", 59, 72, 66, 79, { x: 62, z: 79 }, { wall: 0xbcc6c4, roof: 0x4a5a6a });
  B("Food Store", 71, 72, 78, 79, { x: 74, z: 79 }, { wall: 0xd6c9a6, roof: 0x7a5a3a });
  /* The kitchen: the Cooking skill's test room, east of the church across the
     north-south road, door on the west wall facing town. A range and the sink
     side by side against the north wall (no queue), stocked searchable crates down the west
     and east rings, and a pantry row along
     the south ring with one crate per raw food - beef, chicken, shrimps and
     trout, the full level-1-to-20 spread, so every burn curve and
     every cook XP step can be tried without leaving the room. Higher fish come
     from the water like everything else; the sink on the north wall fills jugs
     and bowls as well as buckets, and water on flour opens the dough choice,
     so bread, pies, pizzas and cakes all bake on the ranges too. */
  B("Kitchen", 82, 58, 89, 65, { x: 82, z: 61 }, { floor: "check", wall: 0xd8c096, roof: 0x8a4a3a });
  /* The bank, in the building north of the old one: stone floor, a row of five
     booths along the north wall with a banker behind each, and the middle of
     the room left clear to queue in - the live game's own bank shape. */
  B("Bank", 56, 37, 64, 44, { x: 60, z: 44 }, { floor: "stone", wall: 0xd8ceae, roof: 0x7a4636, roofH: 3.2 });

  /* --- the lairs (src/PLAN.md unit I) ---------------------------------------
     The two places the bosses live. Both are as far from the town as the map
     allows, because every one of their occupants is aggressive with no level
     ceiling (src/combat.js#AGGRO) and would otherwise camp the road out of
     Lumbridge.

     * The **King Black Dragon's lair** is in the north-east highlands above the
       blue dragon's crag: dragon country, and the corner of the world furthest
       from everything. Its mouth is on the south wall, so you walk in facing it.
     * The **Dagannoth crag** is in the far south-east, out past the deadtree
       field and the rogues. Its mouth is on the north wall, the side you
       approach from. Three kings share the one room.

     Both are placed here, with the ordinary buildings, and not later: the
     scattered forest is planted below (see `noScatter`), which skips anything
     inside a building's footprint, so putting the lairs first is what keeps
     trees from growing through their floors. */
  cave("King Black Dragon Lair", 104, 4, 120, 20, [[111, 20], [112, 20]]);
  cave("Dagannoth Crag", 106, 106, 122, 122, [[113, 106], [114, 106]]);
  /* The Black Dragon Lair (src/PLAN.md unit P). The black dragons need a home
     far from the road and from the other two lairs, and the south-west wild is
     the one corner of the map with nothing in it: the x4-22 / z102-120 block is
     all dry ground (the river turns north of it) and holds no building, so the
     room can be carved without moving anything. Its mouth is on the NORTH wall
     with the approach coming down from the town, which is also why the rock
     ring inside skips those two tiles. */
  cave("Black Dragon Lair", 6, 104, 20, 118, [[12, 104], [13, 104]]);
  /* The Kinshra Hideout's own rect, shared with the void stamp at the end of
     this file and the torches below: the one footprint that stays cave floor
     while everything around it goes black. */
  cave("Kinshra Hideout", KINSHRA.x0, KINSHRA.z0, KINSHRA.x1, KINSHRA.z1, [], { floor: "cave" });
  /* The hideout's own light: three burning post torches along the walls, clear
     of the ladder tile (113,157), the table (116,159) and the knight spawns.
     A torch is permanent scenery (type "torch", never "fire"), so the
     firemaking clock that burns player fires down never touches them. */
  for (const [tx, tz] of [[119, 157], [113, 161], [119, 161]]) {
    if (!objAt(tx, tz)) setObj(tx, tz, { t: "torch" });
  }

  /* The lairs' furniture. A cave is not a cottage, so instead of counters and
     ranges these two get the cache's own rocks - `t: "rock"` with no ore, i.e.
     the same rock_a / rock_b boulders the mine scatters (src/scene.js#_locSpec).
     They line the inside of each wall one tile in, which from above reads as a
     rough bowl of stone, and they deliberately leave the middle of the room
     clear: the King Black Dragon's own body is nearly five tiles across and the
     three Kings need a rock each to circle. The tiles just inside a mouth are
     skipped so the entrance can never be rubble-blocked. */
  for (const [x0, z0, x1, z1, mouth] of [
    [104, 4, 120, 20, [[111, 19], [112, 19]]],
    [106, 106, 122, 122, [[113, 107], [114, 107]]],
    [6, 104, 20, 118, [[12, 105], [13, 105]]],
  ]) {
    const skip = new Set(mouth.map((m) => m[0] + "," + m[1]));
    for (let z = z0 + 1; z < z1; z++) {
      for (let x = x0 + 1; x < x1; x++) {
        if (!(x === x0 + 1 || x === x1 - 1 || z === z0 + 1 || z === z1 - 1)) continue;
        if (skip.has(x + "," + z)) continue;
        if (objAt(x, z)) continue;
        if (hash01(x, z, 8402) > 0.5) setObj(x, z, { t: "rock", ore: "none", empty: false });
      }
    }
  }

  /* --- the Barrows (the brothers' own ground) -------------------------------

     The six coffins and the six brothers used to stand in the churchyard
     between the church and the shops - a crypt row laid across the town's
     east-west street (z 68/69 is a road tile the whole way from x 40 to 86), so
     the coffins and the front rank of stones sat *in the road* and walled off
     the tiles they stood on. The user's report: "i dont want crap like coffins
     in the middle of the road cause you cant walk through that area ... move
     the barrows brothers to their own separate area close by, maybe directly
     south."

     So the crypt is now its own walled ground, directly south of the town and
     reached from the road that already ran that way: the north-south street at
     x 67-68 runs south to z 96, and the gate is the two tiles that street
     runs into.
     Inside: the six crypts (2x2 coffins, loc 398) along the south side, a rank
     of headstones in front of each, and Dharok..Ahrim standing in front of
     their own crypt facing the gate - the same west-to-east order their pages
     are written in, which is the order the old churchyard used.

     The fence line of stones at z 99/101 keeps the ground reading as a proper
     churchyard and leaves the central aisle (x 67-68, painted as a path from
     the old street to the gate and on to the crypts) and the five alleys between the crypts open, so every brother can
     be walked up to from the gate. */
  yard("Barrows", 60, 96, 79, 106, [[67, 96], [68, 96]]);
  /* The ground the yard moves onto is forest: clear woody scatter from the
     interior so no tree stands in a crypt. The exclusion in
     `isInsideBuilding` only keeps later scatter out, and this runs before the
     crypts below go in (the ring is untouched - walls are never trees). */
  for (let z = 97; z <= 105; z++) {
    for (let x = 61; x <= 78; x++) {
      const o = objAt(x, z);
      if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush")) delObj(x, z);
    }
  }
  for (let i = 0; i < 6; i++) {
    const cx = 61 + i * 3;
    for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) setObj(cx + dx, 104 + dz, { t: "coffin", rot: 0 });
    setObj(cx, 103, { t: "grave" });
    setObj(cx, 99, { t: "grave" });
    setObj(cx, 101, { t: "grave" });
  }
  for (let z = 87; z <= 103; z++) {
    if (tiles[idx(67, z)] !== T.WATERBED) tiles[idx(67, z)] = T.PATH;
    if (tiles[idx(68, z)] !== T.WATERBED) tiles[idx(68, z)] = T.PATH;
  }

  /* Minimap badges. The real client puts a 15x15 badge - a frame of the cache's
     `mapfunction` sprite group - on the minimap at each "map function"'s tile
     (bank, altar, shops, mining site, ...). The minimap is 4 screen pixels per
     tile in both the client and here, so the badge is drawn 1:1, exactly as the
     client's `mapIcons[type].draw(x, y)` does.

     The badge is placed one tile *inside* the building's door (stepped toward
     the footprint's centre) rather than on the door tile itself, so it sits
     over the building like the client's does instead of being lost under the
     player's own marker when you stand in the doorway.

     All 75 non-empty `mapfunN` frames of that group are baked into the interface
     atlas (see src/tools/cache-bake/frame.mjs: frame index == map function type,
     frame 5 == bank), so labelling a shop, altar or range later is just another
     row in MAP_BADGES. */
  const MAP_BADGES = {
    "Bank": "mapfun5",
    /* Frame 0 is the cache's own shop badge (verified by diffing it against
       the wiki's General store icon: best of all 75 frames by an order of
       magnitude), so the General Store keeps it and each other trade wears
       its own art. */
    "General Store": "mapfun0",
    /* Each trade wears its own art: sword (1), helmet (4), bow (11),
       rod (25), shirt (27), food basket (30). The rod is the shop's badge -
       frame 26's leaping fish is the fishing *spot's* mark. */
    "Armour Shop": "mapfun4",
    /* No "Sword Shop" row: the sellers stand open-air, so their badge rides
       with them in the keeper loop below (mapfun1 at 62,54). */
    "Archery Shop": "mapfun11",
    "Fishing Shop": "mapfun25",
    "Food Store": "mapfun30",
  };
  const mapIcons = [];
  for (const b of buildings) {
    const part = MAP_BADGES[b.name];
    if (!part || !b.door) continue;
    /* one tile from the door toward the footprint centre, on the dominant axis */
    const dx = (b.x0 + b.x1) / 2 - b.door.x;
    const dz = (b.z0 + b.z1) / 2 - b.door.z;
    const x = Math.abs(dx) > Math.abs(dz) ? b.door.x + Math.sign(dx) : b.door.x;
    const z = Math.abs(dx) > Math.abs(dz) ? b.door.z : b.door.z + Math.sign(dz);
    mapIcons.push({ x, z, part, name: b.name });
  }
  /* The shops with no building: the market-stall keepers (the herbalist and
     Bob at their stalls, the clothes seller in the square's open end, the Wise
     Old Man in the square's open end) and the
     Magic Store owner in the grove. Their badge sits on their own tile - they
     stand still (radius 0), so the tile is the shop, and the keeper's own
     yellow dot draws over the middle of it, leaving the badge readable
     round it. */
  for (const [x, z, name, part] of [
    [75, 36, "Herbalist", "mapfun20"], [76, 40, "Bob's Axes", "mapfun3"],
    [70, 42, "Skillcapes", "mapfun29"], [67, 43, "Clothes", "mapfun27"], [17, 25, "Magic Store", "mapfun13"],
    [65, 47, "Sword Shop", "mapfun1"],
  ]) mapIcons.push({ x, z, part, name });

  const isInsideBuilding = (x, z) => {
    for (const b of buildings) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    }
    return false;
  };

  /* The tiles a doorway opens on to, and the ring around them. A door and a
     cave's mouth are both just a way in, and the one thing that must never
     stand in front of either is a tree: the building's own wall ring means
     there is no way round, so a tree planted two tiles from a mouth is a lair
     nobody can enter. This used to be checked for the hand-placed props only
     (the props section below owns `nearDoor` now that this is up here), which
     left the *scatter* free to seal one, and the Black Dragon Lair's mouth was
     exactly that: four trees in front of it, and its whole interior cut off
     from the map. The terrain audit is what found it (tools/check-world.mjs,
     the one-region check). */
  const pkey = (x, z) => x + "," + z;
  const doorTiles = new Set();
  for (const b of buildings) {
    if (b.door) doorTiles.add(pkey(b.door.x, b.door.z));
    if (b.door2) doorTiles.add(pkey(b.door2.x, b.door2.z));
    for (const [gx, gz] of b.gaps || []) doorTiles.add(pkey(gx, gz));
  }
  const nearDoor = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (doorTiles.has(pkey(x + dx, z + dz))) return true;
    }
    return false;
  };

  /* The bank's row (unit XIX): five booths along the north wall, each with its
     own banker behind it - the live game's own bank shape, a counter line you
     queue in front of. The booths face south into the room (ry PI, the same
     way the old single booth faced its door) and the middle of the room stays
     clear from the door. */
  for (let x = 58; x <= 62; x++) {
    setObj(x, 39, { t: "booth", rot: 0 });
  }
  /* The smithy's kit lives inside the smithy (x 59..66, z 60..67); the door is
     at (62,67), so the middle of the room stays clear. A second door on the
     west wall (59,63) opens toward the sandpit. The furnace is the
     cache's own 3x3 Lumbridge furnace (loc 2781, "Furnace", its own "Smelt"), so
     it takes nine tiles - the church altar's 2x1 rule at a larger size: every
     tile of the footprint carries the object and the model is drawn once, at the
     north-west tile. The nine tiles it takes (x 63..65, z 60..62) put its back
     row ON the north ring (user, 2026-10-12: one tile north) - the wall objects
     there are replaced, and the ring panels still draw behind the model
     (scene.js#_ringRots) - leaving the west side of the room and the strip
     south of it open, so the anvil at (61,63) is still reached from the door.
     No ranges in here (user, 2026-10-11) - cooking stays on the kitchen range
     at (84,59). The mouth flag rides the middle of the south row (64,62). */
  for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) setObj(63 + dx, 60 + dz, { t: "furnace", mouth: dx === 1 && dz === 2 });
  setObj(61, 63, { t: "anvil" });
  /* The potter's kit, in the same room: the cache's own Potter's Wheel
     (loc 2642, 1x1) two tiles south of where it was, and the cache's Pottery
     Oven (loc 2643, 1x2) west of the furnace, on the north ring with its back
     to the wall (user, 2026-10-12: one tile north), turned a quarter clockwise
     so it lies along it. Both tiles of the oven carry the object because both
     are solid and clickable; scene.js draws the model once, at the west tile,
     because it knows the footprint, and the ring panel draws behind it
     (scene.js#_ringRots). The door path (x62 from (62,67)) stays clear. */
  setObj(60, 66, { t: "potwheel" });
  setObj(60, 60, { t: "potoven", rot: 3, fx: 2, fz: 1 });
  setObj(61, 60, { t: "potoven", rot: 3, fx: 2, fz: 1 });
  /* The glassblower's sandpit, in the open grass west of the smithy - three
     tiles off the west door's path, so the door stays clear. The cache's own
     2x2 Sandpit (loc 22726), stamped over all four tiles the furnace's way so
     every tile is solid and clickable and the anchor rule draws it once.
     Buckets fill from it (src/actions.js#fillSand). */
  for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) setObj(54 + dx, 62 + dz, { t: "sandpit" });
  /* The kitchen's kit (the room itself is with the other buildings, above):
     a range and the sink side by side against the north wall, backs to it
     and fronts to the room (the range's `rot: 3` lays the 1.62-wide side
     along the wall with the fire mouth facing south - `rot: 1` turns the
     mouth into the wall); the pantry row
     along the south ring; and crates down the west and east rings. Every crate
     stands ON its ring tile with the wall panel drawn behind it (scene.js
     draws panels from the rings, so prop and panel coexist), truly flush - the
     closest the room gets, since the panels stand on the ring tiles
     themselves. Every crate is the braced `crate`, stocked (`searchOnly`: the
     room offers Search and never Hide-in - see actions.js#sceneryRowSpecs).
     Nothing shares the north row: the range model is 1.68 tiles wide and
     swallows anything stood beside it, and its corners clip the z60 tiles
     too, so those stay clear with it; the door path (z61 from the west door)
     stays clear as well. `setObj`, not `placeProp`: this block runs before
     `placeProp` is defined. */
  setObj(84, 59, { t: "range", rot: 3 });
  /* The sink where the second range stood (user, 2026-10-07: remove the
     east-ring sink, replace one range with it instead): the cache's own Sink
     (loc 873, 1x2), back to the north wall beside the remaining range. Both
     tiles carry the object so both are solid and clickable; scene.js draws
     the model once, at the north tile, because it knows the footprint. The
     hash at (87,59) gives the same quarter-turn the east-ring sink had, so
     the orientation is unchanged. (87,60) was already kept clear for the
     range's corners; the door path (z61) stays clear as well.
     Moved one tile north onto the wall line (user, 2026-10-07: flush with
     the wall, sharing the ring tile - the crates' own rule): the north tile
     sits ON the north ring, panel drawn behind it (scene.js#_ringRots). */
  setObj(87, 58, { t: "sink" });
  setObj(87, 59, { t: "sink" });
  setObj(82, 60, { t: "crate", searchOnly: true, loot: { id: "raw_beef", qty: 10 } });
  setObj(82, 62, { t: "crate", searchOnly: true, loot: { id: "raw_chicken", qty: 10 } });
  setObj(82, 63, { t: "crate", searchOnly: true, loot: { id: "raw_sardine", qty: 10 } });
  setObj(82, 64, { t: "crate", searchOnly: true, loot: { id: "raw_shrimp", qty: 15 } });
  setObj(89, 60, { t: "crate", searchOnly: true, loot: { id: "raw_herring", qty: 10 } });
  setObj(89, 61, { t: "crate", searchOnly: true, loot: { id: "raw_trout", qty: 10 } });
  setObj(89, 62, { t: "crate", searchOnly: true, loot: { id: "raw_salmon", qty: 8 } });
  setObj(89, 63, { t: "crate", searchOnly: true, loot: { id: "raw_pike", qty: 8 } });
  setObj(84, 65, { t: "crate", searchOnly: true, loot: { id: "raw_beef", qty: 10 } });
  setObj(85, 65, { t: "crate", searchOnly: true, loot: { id: "raw_chicken", qty: 10 } });
  setObj(86, 65, { t: "crate", searchOnly: true, loot: { id: "raw_anchovies", qty: 10 } });
  setObj(87, 65, { t: "crate", searchOnly: true, loot: { id: "raw_mackerel", qty: 10 } });
  setObj(88, 65, { t: "crate", searchOnly: true, loot: { id: "raw_trout", qty: 10 } });
  setObj(83, 65, { t: "barrel" });
  /* The spinning wheel: the cache's loc 2644, whose single action is "Spin".
     It used to stand in the Clothes Shop, whose counter traded in wool - but
     that building is the bank now, so the wheel has moved into the General
     Store's quiet north-west corner, out of the way of the counter. */
  setObj(48, 50, { t: "wheel" });
  /* The town well. It used to be placed at (46,46), which the terrain pass
     (src/PLAN.md unit G) left in the middle of the river - a well standing in
     open water, with no walkable tile within reach of it. It now stands on the
     bank, on the plaza west of the bank building, one tile from the water's
     edge and on the square side, which is where a town well belongs and the
     only tile it can actually be filled from (actions.js#fillBucket). */
  setObj(52, 46, { t: "well" });
  /* The archery shop's own table and chair. The table is the cache's 2x1 loc
     (loc 594, model 1213), so BOTH tiles of its footprint carry the object -
     the same rule the altar, the counters and the stalls follow. It used to
     carry only the one tile it was named at, which left the model's other half
     standing on a tile that was still walkable: the user's report, "in the
     archery shop there is a table that npcs are able to walk through". The
     chair is solid too (it is a chair), which is why `world.js#SOLID_TYPES`
     lists `chair` with the rest of the furniture. */
  setObj(49, 74, { t: "table" });
  setObj(50, 74, { t: "table" });
  setObj(52, 74, { t: "chair" });
  /* The church's altar (x 71..78, z 60..67, door at (74,67)). It is the world's
     only way to refill the prayer book - see actions.js#prayAtAltar - so it
     stands against the north wall, on the two tiles the cache's own 2x1 altar
     model covers (loc 409, sizeX 2). Both tiles carry the object because both
     are solid and clickable; scene.js#_chunkLocs draws the model once, at the
     west tile, because it knows the footprint (locmodels.js#locFootprint). */
  setObj(74, 61, { t: "altar", rot: 0 });
  setObj(75, 61, { t: "altar", rot: 0 });
  /* The Armour Shop's upstairs display room: the same XZ as the shop below
     it, one level up (plane 1). The climb is the cache's own matched ladder
     set, locs 9558+9559 (sequential ids, "Ladder" both, Climb-up below and
     Climb-down above - the top and bottom of one shaft, the way the real game
     pairs them): a narrow tanwood ladder below (1.81, no foot frame, so no
     square on the shop floor) and its short head piece above, sunk so only
     the handholds stand over the slab round the stairwell hole. No staircase
     objects anywhere. The old floor-hatch ladder (ladder_wood) is the town end
     of the second dungeon shaft now - see below. Both flights climb on the proven
     ladder_up/ladder_down path, with `toPlane` naming the level the climb
     lands on. The room is a stockroom: two crates along the north wall, the
     2x1 display table and a chair along the south wall, the middle of the
     floor left clear. The narrow ladder needs no sink (no foot frame); the
     head piece is sunk by dy so only handholds stand over the slab. */
  setObj(76, 54, { t: "ladder_up", key: "shop_ladder_up", rot: 1, to: [75, 54], toPlane: 1 });
  setUpObj(76, 54, { t: "ladder_down", key: "shop_ladder_down", rot: 1, dy: -0.31, to: [75, 54], toPlane: 0 });
  setUpObj(71, 51, { t: "crate" });
  setUpObj(72, 51, { t: "crate" });
  setUpObj(71, 53, { t: "table" });
  setUpObj(72, 53, { t: "table" });
  setUpObj(73, 53, { t: "chair" });
  /* The demolished separate upstairs (x 82..87, z 50..54): that attempt put
     the second floor in its own footprint east of the shop, which read as a
     second shop rather than an upper level. Its tiles go back to open grass;
     the levelling it did stays (a flat pad, invisible under the grass). */
  for (let z = 50; z <= 54; z++) {
    for (let x = 82; x <= 87; x++) {
      if (inBounds(x, z)) tiles[idx(x, z)] = T.GRASS;
    }
  }

  /* --- the churchyard (the church's own stones) -----------------------------

     One rank of headstones along the strip between the street and the shops
     (z 70), facing the road, with the walkway behind them at z 71. It used to
     be two ranks with the six Barrows crypts among them, and the front rank
     stood at z 68 - which is *the road*: `hRoad(40, 86, 68)` paints z 68 and
     69, so the stones and the coffins sat in the middle of the street the whole
     length of the church. The crypt moved to its own ground south of town (see
     the Barrows, above) and this rank moved back off the road, which is what
     the user asked for ("i dont want crap like coffins in the middle of the
     road").

     The stones skip x 74 so the rank is broken by a way through it rather than
     being a wall, and they skip x 67 and x 80, which are the two north-south
     roads (`vRoad(40, 86, 67)` and `vRoad(40, 86, 80)`) - a headstone may not
     stand in the street either. They are the cache's own five stones (loc
     400..405, hashed per tile) exactly as before. */
  for (const x of [66, 70, 72, 76, 78, 82, 86]) setObj(x, 70, { t: "grave" });

  /* --- the market square (unit Q, moved by user request) --------------------
     The five stalls used to stand in the street the player spawns in - x 49..62
     at z 57..58, between the two rows of shops - which dropped a row of 2x2
     obstacles, and two muggers, on to every brand-new player. They now have a
     square of their own at the head of the north-east street: x 65..79, z 34..43
     is paved, and the street the town already had (x 67..68, which stopped dead
     at z 40) now runs into it, so the market is the widening at the end of a
     street, which is what a market square is. North of it the ground climbs
     towards the hill giants, east is the sheep pen's fence at x 80, and south is
     the east-west crossroads.

     A stall is the cache's own **2x2** loc (loc 2561 and friends -
     tools/cache-bake/locs.mjs#LOCS; the 2x1 in the model is the wooden counter,
     the footprint the def declares is 2x2). All four of its tiles therefore
     carry the object, because all four are solid and all four are clickable,
     and scene.js#_chunkLocs draws the model once, centred on the footprint,
     because it knows the size (locmodels.js#locFootprint). Five 2x2 stalls need
     two rows in a square ten tiles wide, so the Thieving ladder runs west to
     east along each row: the baker's and the crafting stall at 5, then the fish
     stall at 42, across the north; the silver stall at 50 and the gem stall at
     75 along the south. Neighbours are a tile apart (two for the stall, one to
     walk between), which is what the live marketplaces do: you step into the gap
     and steal over the counter. */
  for (let z = 34; z <= 43; z++) for (let x = 65; x <= 79; x++) pathPaint(x, z);
  for (const [kind, x] of [["bakery", 66], ["crafting", 69], ["fish", 72]]) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) setObj(x + dx, 35 + dz, { t: "stall", kind, rot: 0 });
    }
  }
  for (const [kind, x] of [["silver", 66], ["gem", 72]]) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) setObj(x + dx, 39 + dz, { t: "stall", kind, rot: 0 });
    }
  }

  /* --- the town square ------------------------------------------------------
     Where the old bank stood (x 58..67, z 47..55): the bank has moved into the
     old Clothes Shop building up north, so the vacated footprint is paved over
     into an open square instead - cobbles (GRAVEL) with a stone curb ring,
     a monument in the middle, and flowers in the four corners. Nothing else
     solid stands in it, so the whole square stays walkable. */
  for (let z = 47; z <= 55; z++) for (let x = 58; x <= 66; x++) pathPaint(x, z, T.GRAVEL);
  for (let x = 58; x <= 66; x++) {
    pathPaint(x, 47, T.FLOOR_STONE);
    pathPaint(x, 55, T.FLOOR_STONE);
  }
  for (let z = 47; z <= 55; z++) {
    pathPaint(58, z, T.FLOOR_STONE);
    pathPaint(66, z, T.FLOOR_STONE);
  }
  for (let x = 58; x <= 66; x++) pathPaint(x, 46);
  setObj(62, 51, { t: "statue", discord: true });
  for (const [fx, fz] of [[59, 48], [65, 48], [59, 54], [65, 54]]) {
    setObj(fx, fz, { t: "flowers", c: (hash01(fx, fz, 88) * 5) | 0 });
  }

  /* The green dragons' nesting pads: the south-west wild is forest, and a 4x4
     body needs 4x4 of open ground, so each pad below is a trampled clearing
     the scatter keeps out of. Listed as the footprint's south-west tile (the
     same tile the spawn table stands the dragon on, see the chromatic dragons
     below), 4 across. A tree seals up to 3x3 from its anchor (TREE_FOOT, grown
     east and south from the west/north tile), so the exclusion runs two tiles
     past the pad on every side - that is what keeps a neighbour's trunk from
     sealing the pad's own edge. Bushes and rocks go through the same
     `noScatter`, so one test clears the whole pad. */
  const DRAGON_PADS = [[4, 88], [12, 88], [17, 88], [5, 95]];
  const inDragonPad = (x, z) => {
    for (const [px, pz] of DRAGON_PADS) {
      if (x >= px - 2 && x <= px + 3 && z >= pz - 5 && z <= pz) return true;
    }
    return false;
  };
  /* The pad's own tiles, for the footprint test in `treeFits` below. */
  const inDragonPadFoot = (x, z) => {
    for (const [px, pz] of DRAGON_PADS) {
      if (x >= px && x <= px + 3 && z >= pz - 3 && z <= pz) return true;
    }
    return false;
  };

  const inTownSquare = (x, z) => x >= 58 && x <= 66 && z >= 47 && z <= 55;
  const noScatter = (x, z) =>
    /* A tile that already carries an object is taken: since the props section
       below places hand-authored scenery (and its own banks of rock and fern)
       through the same `setObj`, a later scatter that ran over it would erase
       it silently - `setObj` overwrites. The hand-placed tree deco, then the
       tree/bush scatter, are its first readers and the bank of ferns its last,
       which is what keeps a fern from growing through a crate. */
    !!objAt(x, z) ||
    isInsideBuilding(x, z) ||
    tiles[idx(x, z)] === T.PATH ||
    tiles[idx(x, z)] === T.BRIDGE ||
    tiles[idx(x, z)] === T.FLOOR_WOOD ||
    tiles[idx(x, z)] === T.FLOOR_STONE ||
    tiles[idx(x, z)] === T.ROCKGROUND ||
    isWaterTile(x, z) ||
    tiles[idx(x, z)] === T.SAND ||
    inTownSquare(x, z) ||
    nearDoor(x, z) ||
    /* The green dragons' nesting pads (see DRAGON_PADS above): trampled clear
       ground in the wild's forest, where no tree, bush, rock or fern grows. */
    inDragonPad(x, z) ||
    /* Cairn Isle scatters nothing: its trees, rocks and its whole course are
       placed by hand in the isle pass at the end of this function. A scatter
       over it would plant woodland through the obstacles and, worse, could seal
       a pocket on ground that is unreachable by walking - the isle has no land
       connection to the mainland, so the carve pass below could never open one
       (see the note there). `inIsleBox` is a bounding box, so a few sea tiles
       either side of the isle are skipped too; nothing is scattered in open
       water in any case. */
    inIsleBox(x, z) ||
    /* The new island stays blank: the same deal as the isle above - its one
       portal is hand-placed at the end, and no scatter tree may seal ground
       on land with no walkable way off it. */
    inNewIsleBox(x, z) ||
    /* The tutorial island: same deal - its own jungle pass below plants it,
       the general scatter keeps off. */
    inTutIsleBox(x, z) ||
    flatMask(x, z) < 0.35;

  const forestDensity = (x, z) => {
    let d = fbm(x * 0.035, z * 0.035, seed + 900, 3);
    if (x < 34) d += 0.14;
    if (z < 40) d += 0.06;
    if (x > 86 && z > 84) d -= 0.16;
    if (x > 88 && z < 60) d -= 0.25;
    return d;
  };

  const treeKindAt = (x, z) => {
    const r = hash01(x, z, 3211);
    const nearWater = Math.min(
      Math.abs(x - riverCenterX(z)),
      Math.hypot(x - 101, z - 99) - 18
    ) < 7;
    if (nearWater && r < 0.75) return "willow";
    if (x < 30 && z < 60 && r < 0.5) return "oak";
    if (x < 26 && z > 60 && r < 0.35) return "yew";
    if (r < 0.30) return "oak";
    if (r > 0.955) return "evergreen";
    if (r > 0.92) return "leafy";
    return "tree";
  };

  /* --- planting a tree -------------------------------------------------------

     A tree is planted at an anchor tile and occupies its model's own footprint
     from there (TREE_FOOT), stamped by `setObj` on every one of those tiles. So
     a tree is planted in two steps that have to agree: which model it draws
     (which decides how much ground it covers) and whether that ground is free.
     `treeKeyAt` is the first - the family's own pick, made once, at the anchor -
     and `treeFits` the second, the whole footprint asked tile by tile. A tile
     the world is willing to put a tree on is one `noScatter` says yes to, the
     same test the scatter has always used.

     `plantTreeNear` is the planter for a tree a person put somewhere - the town
     deco below, and the grove - and it is allowed to move: a 3x3 oak may no
     longer fit on the exact tile it was named on now that it needs three tiles
     of clearance, and a tree a tile or two off is better than no tree. It
     searches outwards in rings, nearest first, and plants nothing at all if the
     whole neighbourhood is taken - the same answer the props give an anchor that
     does not suit (there is no fallback that drops it at a random spot). */

  /* --- the god's glade -----------------------------------------------------

     The one hole in the north-western wood: an open clearing around
     **Saradomin's** tile (this file's grove spawns, below). The user's ask
     (2026-09-24): *"you could maybe clear some of the trees around him a bit to
     make it slightly more of an open area"*.

     It is a rule on the *ground a tree may cover* rather than a list of trees to
     fell, and it is checked inside `treeFits` for exactly that reason: a tree is
     planted as its model's whole footprint (a 3x3 oak stamps nine tiles), so an
     anchor just outside the glade would otherwise lean its canopy over the
     middle of the clearing - which is what the first cut of this did, leaving
     twenty-two tree tiles in an "empty" glade, all of them the north and west
     rim. Asked here instead, a tree whose *model* touches the glade is simply not
     planted there, and `plantTreeNear` walks a hand-placed one out to the nearest
     tile that clears it.

     Five tiles is the radius, i.e. an 11x11 clearing. That is measured from the
     god rather than guessed at: his strike reaches one tile, his assailants
     spawn on a ring six to eight tiles out (below), and five tiles of clear
     ground is what puts the whole ring outside the wood, so the charge in is
     across open grass rather than out of the treeline. It is a *tree* rule only -
     flowers and ferns are decals that nothing is planned around, and a bare ring
     of grass with nothing on it reads as a car park rather than as a clearing. */
  const GLADE = { x: 16, z: 34, r: 5 };
  const inGlade = (x, z) => Math.max(Math.abs(x - GLADE.x), Math.abs(z - GLADE.z)) <= GLADE.r;

  /* --- the coin shrine's clearing ------------------------------------------
     The one hole in the north-eastern wood: an open clearing around the coin
     shrine's own tile (this file's shrine placement, below), the same device
     as the god's glade above - a rule on the ground a tree's model may cover,
     checked inside `treeFits`, so no canopy leans in over the shrine. Three
     tiles is the radius, i.e. a 7x7 clearing: the shrine is one tile, Hatius
     stands beside it, and his cat wanders the open ground. It is a tree rule
     only, like the glade - flowers and ferns may stay. */
  const SHRINE_GLADE = { x: 86, z: 28, r: 3 };
  const inShrineGlade = (x, z) => Math.max(Math.abs(x - SHRINE_GLADE.x), Math.abs(z - SHRINE_GLADE.z)) <= SHRINE_GLADE.r;

  const treeFits = (x, z, fx, fz, test, pad = 0) => {
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        if (!inBounds(x + dx, z + dz) || test(x + dx, z + dz)) return false;
        if (inGlade(x + dx, z + dz)) return false;
        if (inShrineGlade(x + dx, z + dz)) return false;
        /* A dragon's pad is ground no canopy may lean over either: like the
           glade above, any tree whose footprint touches it is not planted. */
        if (inDragonPadFoot(x + dx, z + dz)) return false;
      }
    }
    /* The breathing room, `pad` tiles deep around the footprint. A scattered
       tree has to stand on ground `test` accepts, but the tiles around it only
       have to be clear of OBJECTS - another tree, a bush, a prop. That is the
       user's own note (2026-09-22: *"i would generally recommend that you allow a
       bit more space between trees"*), and it is what stops two canopies growing
       into each other now that a tree owns the ground its model covers: without
       it a candidate may stand in the one-tile gap between two existing trees,
       which reads as a wall of trunks rather than a wood.

       It is a one-deep strip along the four SIDES, not a ring around the
       corners: a tree may still stand diagonally beside another, which keeps the
       wood's clusters and its lanes where the noise put them. Asking for the
       whole ring was measured and rejected - it takes the forest from 580 trees
       to 245, because every candidate inside a cluster has a corner occupied,
       and a wood a third of the size is not "a bit more space between trees".
       The strip is not asked to be walkable either, so a tree at the water's
       edge or against a building wall is still fine. */
    const occupied = (xx, zz) => inBounds(xx, zz) && !!objAt(xx, zz);
    for (let d = 1; d <= pad; d++) {
      for (let dx = 0; dx < fx; dx++) {
        if (occupied(x + dx, z - d) || occupied(x + dx, z + fz - 1 + d)) return false;
      }
      for (let dz = 0; dz < fz; dz++) {
        if (occupied(x - d, z + dz) || occupied(x + fx - 1 + d, z + dz)) return false;
      }
    }
    return true;
  };
  /* Plant one tree at `x`,`z`. The hp is how many logs it holds before it falls
     (src/actions.js#attemptWc), the same per-kind count the scatter has always
     given: a yew four, a willow three, everything else two - and three for the
     hand-placed trees, which are the ones a player meets first. */
  const plantTree = (x, z, kind, hp, key = null) => {
    const k = key || treeKeyAt(kind, x, z);
    return setObj(x, z, { t: "tree", kind, key: k, stump: false, hp, ox: x, oz: z });
  };
  const plantTreeNear = (kind, x, z, hp, test, radius = 3, pad = 0) => {
    const foot = (xx, zz) => TREE_FOOT[treeKeyAt(kind, xx, zz)] || [1, 1];
    const [fx, fz] = foot(x, z);
    if (treeFits(x, z, fx, fz, test, pad)) return plantTree(x, z, kind, hp);
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const [gx, gz] = foot(x + dx, z + dz);
          if (!treeFits(x + dx, z + dz, gx, gz, test, pad)) continue;
          return plantTree(x + dx, z + dz, kind, hp);
        }
      }
    }
    return null;
  };

  /* A bush is planted exactly the way a tree is: the model is picked at the
     anchor (which decides whether the ground it covers is one tile or four -
     world.js#BUSH_FOOT), the whole footprint has to be free of the same things a
     tree's has to be free of, and a bush that does not fit is left out rather
     than stamped over whatever is already standing there. It is `setObj` with a
     key, so the footprint and the solidity follow from the object itself. */
  const plantBush = (x, z) => setObj(x, z, { t: "bush", key: bushKeyAt(x, z) });
  const bushFits = (x, z, test) => treeFits(x, z, ...(BUSH_FOOT[bushKeyAt(x, z)] || [1, 1]), test);
  /* A hand-placed bush is allowed to move, the same way a hand-placed tree is
     (see `plantTreeNear` above): the nearest tile that fits, or nothing. */
  const plantBushNear = (x, z, test, radius = 3) => {
    if (bushFits(x, z, test)) return plantBush(x, z);
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!bushFits(x + dx, z + dz, test)) continue;
          return plantBush(x + dx, z + dz);
        }
      }
    }
    return null;
  };

  /* The test a hand-placed tree is planted under: ground a tree can stand on -
     dry, empty, outside any building, clear of a doorway - but *not* the
     scatter's own rules. The town's tree line and the grove stand inside the
     flat zone the town occupies, which is exactly where `noScatter` refuses to
     put a scattered tree (that rule is what keeps the forest off the streets),
     so a hand-placed tree is judged by this instead. */
  const treeGround = (x, z) => !inBounds(x, z) || isWaterTile(x, z) || !!objAt(x, z) || isInsideBuilding(x, z) || nearDoor(x, z) || tiles[idx(x, z)] === T.PATH || tiles[idx(x, z)] === T.BRIDGE || tiles[idx(x, z)] === T.DIRTWALL;

  /* The west row is the tree line along the riverbank. The river meanders
     east as it comes south - its centre is at x 44 here and x 24 by z 76 - so
     the northern tree stands three tiles further in than its two neighbours,
     which is where its bank actually is. (It used to stand at x 41, in the
     water: the river is drawn from its own carve and no scatter reads it, so
     nothing ever complained about a tree growing out of the shallows.) */
  const TOWN_DECO = [
    ["tree", 38, 50], ["tree", 41, 64], ["tree", 41, 76],
    ["tree", 88, 50], ["tree", 83, 64], ["tree", 83, 76],
    ["oak", 38, 48], ["oak", 86, 84], ["willow", 40, 84],
    ["bush", 55, 55], ["bush", 55, 46], ["bush", 58, 70], ["bush", 78, 58],
    ["flowers", 43, 58], ["flowers", 84, 70], ["flowers", 61, 82], ["flowers", 47, 82],
    ["signpost", 46, 58], ["signpost", 70, 58],
  ];
  for (const [kind, x, z] of TOWN_DECO) {
    if (kind === "flowers") setObj(x, z, { t: "flowers", c: (hash01(x, z, 88) * 5) | 0 });
    else if (kind === "bush") plantBushNear(x, z, treeGround, 3);
    else if (kind === "signpost") setObj(x, z, { t: "signpost", ry: 0 });
    else plantTreeNear(kind, x, z, 3, treeGround, 3, 1);
  }

  /* --- the rare trees on the eastern shore ----------------------------------
     One of each of the four species the world otherwise scatters thinly - a
     willow, a maple, a yew and a magic tree - planted together on the island's
     east coast, so all four can be walked up to and tried in one trip. The
     user's request, 2026-09-22: *"put all of the rare trees like put one willow,
     one maple, one yew, one magic all on the eastern shore for me to test"*.

     The anchor is *found*, not hard-coded, so the row cannot end up in the sea
     when the coastline moves: for each row the scan walks in from the map's edge
     and stops on the last grass tile before the sand, which is the shore itself.
     `plantTreeNear` still walks a tree inland if that tile is taken or its
     footprint would hang over the water (the willow's 2x2 and the yew's 3x3 are
     both allowed to take the step), and `shoreGround` keeps the whole footprint
     on grass. The hp is the same per-kind count the scatter gives - a yew four
     logs, a willow three, the rest two - so a test tree behaves like a real one. */
  const EAST_SHORE = [["willow", 44], ["maple", 48], ["yew", 52], ["magic", 56]];
  const shoreGround = (x, z) =>
    treeGround(x, z) ||
    (tiles[idx(x, z)] !== T.GRASS && tiles[idx(x, z)] !== T.GRASS_DARK);
  for (const [kind, z] of EAST_SHORE) {
    let x = -1;
    for (let xx = W - 2; xx > 40; xx--) {
      const t = tiles[idx(xx, z)];
      if (t === T.GRASS || t === T.GRASS_DARK) { x = xx; break; }
    }
    if (x < 0) continue;
    plantTreeNear(kind, x - 1, z, kind === "yew" ? 4 : kind === "willow" ? 3 : 2, shoreGround, 4, 1);
  }

  /* --- the wood ------------------------------------------------------------
     The scatter runs in three passes over the same tiles - the trees, then the
     bushes, then the flowers - rather than in one loop with an `else if` chain.
     The tile each pass looks at is the same tile the old chain did (`hash01(x,
     z, 7331)` picks the branch, and the three branches' windows do not overlap),
     so nothing about *where* a thing is scattered changed. What changed is the
     ORDER, and it is the bushes that made the difference: a bush is now a 2x2
     obstacle stamped over its model's ground (world.js#BUSH_FOOT), and in one
     loop a bush planted early stole four tiles from every tree candidate behind
     it. Planting the wood first and the undergrowth into what the wood left
     gives the forest its structure back - trunk, gap, bush - instead of a bush
     sitting where a tree would have been.

     The first pass is the trees: */
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (noScatter(x, z)) continue;
      const d = forestDensity(x, z);
      const r = hash01(x, z, 7331);
      const threshold = 0.60 - (d - 0.5) * 0.9;
      /* The window is the one the scatter always used, opened a little: a tree
         now occupies the ground its model covers (four tiles for a small one,
         nine for an oak) instead of standing on one tile with a canopy
         overhanging its neighbours, so the *wood was thinner than it had been*,
         and the one-tile margin below (`pad`) takes out more of it - the
         candidates that would have stood in the last gap between two existing
         trunks. Opening the window from ±0.16 to ±0.22 buys back most of what
         the margin costs while the margin keeps every remaining tree's ground
         its own. The user's note, 2026-09-22: *"allow a bit more space between
         trees"*. */
      if (r > threshold - 0.22 && r < threshold + 0.22) {
        /* A candidate whose whole footprint is not free is simply not planted:
           the trees that got there first own the ground under them, since a
           tree marks every tile it covers. `radius 0` is what says so - this is
           a scatter, so it takes the tile or leaves it, and the next candidate
           along is another tile entirely. The hp is how many logs the tree
           holds before it falls (src/actions.js#attemptWc): a yew four, a
           willow three, everything else two. */
        const kind = treeKindAt(x, z);
        const hp = kind === "yew" ? 4 : kind === "willow" ? 3 : 2;
        plantTreeNear(kind, x, z, hp, noScatter, 0, 1);
      }
    }
  }

  /* The second pass: the bushes, into the gaps the wood left. A bush owns the
     ground its model covers the same way a tree does, so it goes through the
     same fit test - `radius 0` here too, so a bush whose footprint is not free
     is simply not scattered, never stamped over a neighbour - but it is *not*
     asked to keep a margin: a bush beside a trunk is undergrowth, which is what
     makes the wood read as a wood and not as an orchard. */
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (noScatter(x, z)) continue;
      if (hash01(x, z, 7331) > 0.93) plantBushNear(x, z, noScatter, 0);
    }
  }

  /* And the third: the flowers, on the open grass the two passes left. */
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (noScatter(x, z)) continue;
      if (hash01(x, z, 7331) < 0.035 && tiles[idx(x, z)] === T.GRASS) {
        setObj(x, z, { t: "flowers", c: Math.floor(hash01(x, z, 88) * 5) });
      }
    }
  }

  /* The tutorial island's jungle, boat and arrival lane live at the END of
     the build (before `return world`), after the tile-rewriting passes. */

  /* The dead tree field in the south, bandit country (see the wilderness
     section). A dead tree is a tree too, and the cache is explicit about it: all
     four models (`dead_a`..`dead_d`) carry the solid flag, so they are stamped
     over their own footprint like any other - which is why the field reads as
     cover to weave through rather than as a picture of dead trees to walk
     through. The two sizes in the family (2x2 and 1x1) are picked per tree, at
     the anchor, exactly as the living trees are. */
  for (let z = 100; z < 122; z++) {
    for (let x = 50; x < 80; x++) {
      if (isWaterTile(x, z)) continue;
      /* Not in the Barrows' ground (moved south onto the field's own north
         edge): the yard wall is no trellis. */
      if (x >= 60 && x <= 79 && z >= 96 && z <= 106) continue;
      if (hash01(x, z, 5150) > 0.865) {
        const key = treeKeyAt("deadtree", x, z);
        const [fx, fz] = TREE_FOOT[key] || [1, 1];
        if (treeFits(x, z, fx, fz, (xx, zz) => isWaterTile(xx, zz) || !!objAt(xx, zz))) {
          setObj(x, z, { t: "deadtree", key, ox: x, oz: z });
        }
      }
    }
  }

  const rocks = [];
  /* One seam row's rock. The point a row asks for is where the seam OUGHT to
     stand, and every seam below runs south-east towards the water, so a row can
     land on the sea bed or on something a scatter already planted - and a
     skipped row is silent: the ore simply does not exist in the world, which is
     exactly what `src/tools/check-locs.mjs` reported about `ore_runite` (the
     mine's top tier had no rock at all, because its own point, 96,89, is under
     the beach in this seed). So a row whose point is unusable is placed on the
     nearest dry, free tile instead, searched by ring outwards from the point
     that was asked for.

     "Dry" is measured the way scene.js stands a rock on its ground: at the LOW
     of the tile's four corner heights (`_baseY` - a rock is not allowed to float
     over the downhill side of a slope), and that low corner has to clear the
     water line. The looser test - the tile is not a water tile - is not enough
     at the shore, which is where the top of this seam wants to live: the runite
     row's first fallback, 96,88, passes the loose test, but its low corner sits
     at 1.474, a fifth of a tile under the ocean plane at 1.29, so the rock would
     stand with its base in the sea and its boulder half-drowned. Two passes, so
     a row lands on ground that is properly clear of the water when there is any,
     and only falls back to the looser test when the whole neighbourhood is
     shoreline. A row that finds nothing either way is still skipped, but nothing
     in these seams does. */
  const baseYOf = (x, z) => Math.min(cornerAt(x, z), cornerAt(x + 1, z), cornerAt(x, z + 1), cornerAt(x + 1, z + 1));
  const placeRock = (ore, x, z) => {
    const free = (xx, zz) => inBounds(xx, zz) && !isWaterTile(xx, zz) && !objAt(xx, zz);
    const dry = (xx, zz) => free(xx, zz) && baseYOf(xx, zz) > waterLevel;
    const nearest = (test) => {
      if (test(x, z)) return [x, z];
      for (let r = 1; r <= 6; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            if (test(x + dx, z + dz)) return [x + dx, z + dz];
          }
        }
      }
      return null;
    };
    const at = nearest(dry) || nearest(free);
    if (!at) return null;
    setObj(at[0], at[1], { t: "rock", ore, empty: false });
    tiles[idx(at[0], at[1])] = T.ROCKGROUND;
    rocks.push(at);
    return at;
  };
  const oreRows = [
    ["copper", 94, 64], ["tin", 98, 64], ["copper", 102, 64],
    ["iron", 95, 68], ["iron", 99, 68], ["tin", 103, 69],
    ["coal", 94, 72], ["coal", 99, 73], ["iron", 103, 72],
    ["mithril", 98, 76],
  ];
  for (const [ore, x, z] of oreRows) placeRock(ore, x, z);
  for (const [x, z] of [[96, 61], [101, 61], [92, 70], [105, 66], [100, 70]]) {
    if (!isWaterTile(x, z)) setObj(x, z, { t: "rock", ore: "none", empty: false });
  }

  const deepRocks = [
    ["silver", 94, 78], ["silver", 98, 79],
    ["gold", 100, 82], ["gold", 96, 83],
    ["adamantite", 93, 85], ["adamantite", 99, 86],
    /* Runite: the deepest tier of all, and the one the user asked for more of
       ("you should also add in runite rocks too please" - they could not tell
       the single row that already stood here from a mithril rock until the two
       locs were un-swapped, see src/tools/cache-bake/locs.mjs). Three rows now,
       so the tier reads as a tier the way the six above it do: the original
       point, plus one either side along the same south-east line. All three are
       placed through `placeRock`'s dry fallback, so which tile each one
       actually stands on is the shoreline's decision and not this list's. */
    ["runite", 96, 89], ["runite", 100, 88], ["runite", 92, 87],
  ];
  for (const [ore, x, z] of deepRocks) placeRock(ore, x, z);

  /* The clay seam (unit L3 of PLAN.md): the mine's lowest tier, and the only
     rock a **bracelet of clay** cares about - a worn bracelet turns each clay
     into soft clay (src/actions.js#attemptMine). Clay is mined at level 1 and
     is the first thing a new player swings a pickaxe at, so the seam sits on
     the near side of the mine, in front of the copper and tin. A tile that is
     occupied or under water is simply skipped, like the deep seams above. */
  const clayRocks = [[94, 62], [98, 62], [102, 62], [96, 59], [100, 59]];
  for (const [x, z] of clayRocks) placeRock("clay", x, z);

  /* The rune essence mine (runecrafting): ONE big rock - the cache's own
     5x5 "Rune Essence" (loc 2491, model 863, the grey boulder with the
     scaffolding poles) - standing on the western islet, far enough that
     Sedridor's teleport is the sane way there. The clearing is cut first -
     the scatter has already run, so anything it grew here is taken out before
     the rock goes down. The rock is one shared instance over its whole
     footprint (the tree pattern: ox/oz/fx/fz), so every tile of it answers
     the same way and the renderer draws one model. A return portal stands on
     the shore, bound for Sedridor. */
  for (let z = 152; z <= 166; z++) for (let x = 4; x <= 18; x++) {
    const o = objAt(x, z);
    if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush" || o.t === "rock")) delObj(x, z);
  }
  const essenceRock = { t: "rock", ore: "essence", ox: 9, oz: 157, fx: 5, fz: 5 };
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) setObj(9 + dx, 157 + dz, essenceRock);
  const essencePortal = { t: "rc_portal", to: [57.5, 50.5], ox: 15, oz: 162, fx: 1, fz: 1, rot: 0 };
  setObj(15, 162, essencePortal);

  /* The mysterious ruins (runecrafting): the cache's own 3x3 "Mysterious
     ruins" (loc 7104, models 9625+9624), standing on their own point east of
     the mine and beyond the beach (see the peninsula stamp in the isle pass),
     clear of the workings, an air talisman's step-through to the Air Altar.
     A ring of ruined pillars stands with it, a little further out. */
  for (let z = 64; z <= 81; z++) for (let x = 117; x <= 126; x++) {
    const o = objAt(x, z);
    if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush" || o.t === "rock")) delObj(x, z);
  }
  const ruins = { t: "ruins", ox: 121, oz: 71, fx: 3, fz: 3 };
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) setObj(121 + dx, 71 + dz, ruins);
  const ruinRing = [["ruined_a", 120, 69], ["ruined_b", 123, 69], ["ruined_c", 120, 76], ["ruined_crystal_a", 123, 76], ["ruined_crystal_b", 119, 72], ["ruined_crystal_c", 124, 72]];
  for (const [key, x, z] of ruinRing) {
    if (!objAt(x, z) && !isWaterTile(x, z)) setObj(x, z, { t: "pillar", key });
  }

  /* The Air Altar (runecrafting): the cache's own 3x3 "Altar" (loc 2478,
     model 2304, Craft-rune only), standing on its own islet in the eastern
     sea, reached only through the ruins. The clearing comes first for the
     same reason as the mine's. An exit portal stands beside it, bound for
     the ruins. */
  for (let z = 133; z <= 147; z++) for (let x = 109; x <= 123; x++) {
    const o = objAt(x, z);
    if (o && (o.t === "tree" || o.t === "deadtree" || o.t === "bush" || o.t === "rock")) delObj(x, z);
  }
  const airAltar = { t: "air_altar", ox: 115, oz: 139, fx: 3, fz: 3, rot: 0 };
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) setObj(115 + dx, 139 + dz, airAltar);
  const altarPortal = { t: "rc_portal", to: [122.5, 74.5], ox: 111, oz: 142, fx: 1, fz: 1, rot: 0 };
  setObj(111, 142, altarPortal);

  /* The mine's own working. The seams above sit on the map's ordinary grass, so
     the courtyard used to read as a lawn with rocks on it; the real thing is
     bare ground. Ragged it with the same noise the terrain uses, and leave any
     tile that carries scenery alone so nothing is painted out from under it. */
  const inMine = (x, z) => {
    const dx = (x - 98.5) / 10;
    const dz = (z - 71.5) / 12.5;
    return Math.hypot(dx, dz) - (fbm(x * 0.12, z * 0.12, seed + 1300, 3) - 0.5) * 0.9 < 1;
  };
  for (let z = 56; z < 88; z++) {
    for (let x = 86; x < 112; x++) {
      if (!inBounds(x, z) || isWaterTile(x, z) || objAt(x, z)) continue;
      if (!inMine(x, z)) continue;
      const t = tiles[idx(x, z)];
      if (t !== T.GRASS && t !== T.GRASS_DARK) continue;
      tiles[idx(x, z)] = hash01(x, z, 6101) > 0.7 ? T.GRAVEL : T.ROCKGROUND;
    }
  }

  const grove = [["maple", 16, 28], ["maple", 18, 31], ["maple", 21, 26], ["magic", 12, 22], ["magic", 14, 25], ["magic", 10, 27]];
  for (const [kind, x, z] of grove) {
    plantTreeNear(kind, x, z, kind === "magic" ? 5 : 4, treeGround);
  }

  const penX0 = 92, penZ0 = 42, penX1 = 106, penZ1 = 56;
  for (let x = penX0; x <= penX1; x++) {
    tiles[idx(x, penZ0)] = T.DIRT;
    tiles[idx(x, penZ1)] = T.DIRT;
  }
  for (let z = penZ0; z <= penZ1; z++) {
    tiles[idx(penX0, z)] = T.DIRT;
    tiles[idx(penX1, z)] = T.DIRT;
  }
  for (let x = penX0; x <= penX1; x++) {
    if (x !== 99 && x !== 100) {
      setObj(x, penZ0, { t: "fence" });
      if (x < penX1 - 3 || x > penX1 - 1) setObj(x, penZ1, { t: "fence" });
    }
  }
  for (let z = penZ0 + 1; z < penZ1; z++) {
    setObj(penX0, z, { t: "fence" });
    setObj(penX1, z, { t: "fence" });
  }
  for (let z = penZ0 + 1; z < penZ1; z++) {
    for (let x = penX0 + 1; x < penX1; x++) {
      tiles[idx(x, z)] = hash01(x, z, 4242) > 0.7 ? T.MARSH : T.GRASS_DARK;
    }
  }

  /* The sheep paddock - the farm's other field, west of the cow pen. Same
     construction as the pen above: a dirt margin carrying the fence run, open
     grass inside. Jagex's sheep live in a fenced pen too, and the flock is a
     mix of both sheep skins with a couple of rams (game.js#NPC_MODEL_VARIANTS
     picks the skin per spawn). */
  const shX0 = 80, shZ0 = 39, shX1 = 90, shZ1 = 48;
  for (let x = shX0; x <= shX1; x++) {
    tiles[idx(x, shZ0)] = T.DIRT;
    tiles[idx(x, shZ1)] = T.DIRT;
  }
  for (let z = shZ0; z <= shZ1; z++) {
    tiles[idx(shX0, z)] = T.DIRT;
    tiles[idx(shX1, z)] = T.DIRT;
  }
  for (let x = shX0; x <= shX1; x++) {
    if (x !== shX0 + 4 && x !== shX0 + 5) {
      setObj(x, shZ0, { t: "fence" });
      setObj(x, shZ1, { t: "fence" });
    }
  }
  for (let z = shZ0 + 1; z < shZ1; z++) {
    setObj(shX0, z, { t: "fence" });
    setObj(shX1, z, { t: "fence" });
  }
  for (let z = shZ0 + 1; z < shZ1; z++) {
    for (let x = shX0 + 1; x < shX1; x++) {
      tiles[idx(x, z)] = hash01(x, z, 7717) > 0.75 ? T.MARSH : T.GRASS_DARK;
    }
  }

  /* The flax field - the farm's Seers-style crop, east of the cow pen. Same
     construction as the two pens above: a dirt margin carrying the fence run,
     the crop in rows inside. The south fence leaves a gate at x 109-110, and
     the spinning wheel stands just outside it - pick the flax, step out, spin
     it into bow strings (src/actions.js#pickFlax, #spinAt). A tile that is
     occupied or under water is skipped, so the scatter's flowers and the
     forest's edge trees are never planted over. */
  const flX0 = 107, flZ0 = 44, flX1 = 112, flZ1 = 51;
  for (let x = flX0; x <= flX1; x++) {
    tiles[idx(x, flZ0)] = T.DIRT;
    tiles[idx(x, flZ1)] = T.DIRT;
  }
  for (let z = flZ0; z <= flZ1; z++) {
    tiles[idx(flX0, z)] = T.DIRT;
    tiles[idx(flX1, z)] = T.DIRT;
  }
  for (let x = flX0; x <= flX1; x++) {
    if (!objAt(x, flZ0) && !isWaterTile(x, flZ0)) setObj(x, flZ0, { t: "fence" });
    if ((x < 109 || x > 110) && !objAt(x, flZ1) && !isWaterTile(x, flZ1)) setObj(x, flZ1, { t: "fence" });
  }
  for (let z = flZ0 + 1; z < flZ1; z++) {
    if (!objAt(flX0, z) && !isWaterTile(flX0, z)) setObj(flX0, z, { t: "fence" });
    if (!objAt(flX1, z) && !isWaterTile(flX1, z)) setObj(flX1, z, { t: "fence" });
  }
  for (let z = flZ0 + 1; z < flZ1; z++) {
    for (let x = flX0 + 1; x < flX1; x++) {
      if (objAt(x, z) || isWaterTile(x, z)) continue;
      setObj(x, z, { t: "flax" });
    }
  }
  if (!objAt(109, 52) && !isWaterTile(109, 52)) setObj(109, 52, { t: "wheel" });
  /* The sheep paddock's own wheel, outside its south gate (the fence leaves
     x 84-85 open): the flock's wool spins where it is shorn, the way the flax
     field's wheel stands outside its gate. */
  if (!objAt(84, 49) && !isWaterTile(84, 49)) setObj(84, 49, { t: "wheel" });

  /* --- the village props (unit X, "baked loc keys nothing draws") ------------

     The bake carries fifteen loc keys no part of this world drew, which the
     scenery audit (src/tools/check-locs.mjs) lists as `unused`: the fern and
     the marsh plant, the crate and its searchable cousin, the chest, the two
     barrels, the round table, the bench, the boulder, the rockery and the rocky
     shore (the bush skins were a separate fault - see util.js#hashPick). Four of
     them carry a real cache verb, so they are placed with a purpose and wired
     up in src/actions.js:

       * `rocky`   - "Jump-to". The rocky shore, in two forms: stepping stones
                     across the river, and the odd stone in the shallows. It is
                     the only object in the world whose surface is not its
                     ground (see `heightAt` above), and leaping is the only way
                     on to one (actions.js#jumpToRocky).
       * `crate`   - "Hide-in". Three of them at the bandits' camp, where hiding
                     behind a rock actually saves your life.
       * `crate_b` - "Search". The mine's and the market's, one thing
                     inside each (the smithy's hammer crate is the braced
                     `crate`, below - it moved for the Bee keeper).
       * `chest`   - "Open". The church's, which is empty (see the crypt, above).

     Everything else is examine-only scenery: boulders and rockery on the mine's
     own bare ground, ferns through the forest undergrowth, marsh plants in the
     wet hollows, and a small set of barrels and market furniture that give the
     town the clutter a 2007 village had.

     Placement is by hand-authored anchor, not by noise: a prop is a thing a
     person put there. An anchor that does not fit (a tile under water, taken by
     the scatter, or inside a doorway) is walked out to the nearest tile that
     does, and a prop that fits nowhere within a few tiles is simply not placed -
     there is no fallback that drops it at a random spot instead. */
  const PROP_FOOT = {
    boulder: [2, 2],
    table_b: [2, 2],
    plant: [3, 2],
    bench: [2, 1],
    dense_forest: [3, 2],
    /* the archery shop's table (loc 594) - a hand-placed prop rather than one
       through `placeProp`, but its footprint belongs here with the rest so
       src/tools/check-locs.mjs can hold it against the bake's own loc size. */
    table: [2, 1],
  };
  /* The runecrafting footprints (see the isle pass): the ruins and the Air
     Altar are 3x3, the isle portals are the 1x1 essence portal. */
  PROP_FOOT.ruins = [3, 3];
  PROP_FOOT.air_altar = [3, 3];
  PROP_FOOT.rc_portal = [1, 1];
  /* The pillars are all 1x1 in the bake (the 2x1/3x1 runs were deliberately
     not baked), so one footprint covers the whole family. */
  PROP_FOOT.pillar = [1, 1];
  const propTaken = new Set();
  /* `pkey`, `doorTiles` and `nearDoor` are defined with the buildings, above:
     the tree scatter has to keep away from a doorway too, not just a prop. */
  const propFree = (x, z, opt = {}) => {
    if (!inBounds(x, z)) return false;
    if (isWaterTile(x, z)) return false;
    if (objAt(x, z) || propTaken.has(pkey(x, z))) return false;
    const inside = isInsideBuilding(x, z);
    if (opt.indoor === true && !inside) return false;
    if (opt.indoor === false && inside) return false;
    if (opt.ground && !opt.ground.includes(tiles[idx(x, z)])) return false;
    if (opt.doors !== false && nearDoor(x, z)) return false;
    return true;
  };
  const propFits = (t, x, z, opt) => {
    const [fx, fz] = PROP_FOOT[t] || [1, 1];
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) if (!propFree(x + dx, z + dz, opt)) return false;
    }
    return true;
  };
  const placeProp = (t, x, z, extra = {}, opt = {}) => {
    if (propFits(t, x, z, opt)) {
      const [fx, fz] = PROP_FOOT[t] || [1, 1];
      for (let dz = 0; dz < fz; dz++) {
        for (let dx = 0; dx < fx; dx++) {
          propTaken.add(pkey(x + dx, z + dz));
          setObj(x + dx, z + dz, { t, ...extra });
        }
      }
      return [x, z];
    }
    if (opt.strict) return null;
    for (let r = 1; r <= (opt.radius || 3); r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (propFits(t, x + dx, z + dz, opt)) return placeProp(t, x + dx, z + dz, extra, { ...opt, strict: true });
        }
      }
    }
    return null;
  };

  /* Hide-in: the wilderness crates. The bandits' camp is the one place in the
     world where crouching in a box is worth anything - the bandits are
     aggressive with a level-45 ceiling (src/combat.js#AGGRO) and the deadtree
     field has no cover at all except what is put there. A hidden player is
     skipped by the aggro pass entirely (src/combat.js#tickAggro), so a crate is
     a way out of a fight that has gone badly, which is what the verb is for. */
  placeProp("crate", 49, 104, {}, { indoor: false });
  placeProp("crate", 55, 106, {}, { indoor: false });
  placeProp("crate", 52, 110, {}, { indoor: false });

  /* Search: the mine's crate keeps a spare pick, the smithy's a hammer, and the
     market's a purse. The loot is this world's own content - the cache gives a
     crate no table (src/items.js#NPC_DROPS is where those live and a loc is not
     a creature) - so each one is a single authored thing rather than a roll. */
  placeProp("crate_b", 92, 66, { loot: { id: "bronze_pickaxe", qty: 1 } }, { indoor: false });
  /* The smithy's hammer crate is the braced `crate`, not the plain one: the Bee
     keeper stands where it stood (64,66), so it moved one tile east - and the
     move takes it off the `crate_b` mesh, whose shimmer the user reported, onto
     the kitchen's proven one. Same Search, same hammer: a stocked crate is
     searched, never hidden in (see actions.js#sceneryRowSpecs). */
  placeProp("crate", 65, 66, { loot: { id: "hammer", qty: 1 } }, { indoor: true });
  placeProp("crate_b", 76, 35, { loot: { id: "coins", qty: 12 } }, { indoor: false });

  /* Open: the church's chest, and it is empty. The crypt it stands beside is
     already the churchyard's whole story (`coffin`, above), so a full chest
     would be a second, smaller treasure where the first one is a fight. */
  placeProp("chest", 72, 63, { rot: 0 }, { indoor: true, ground: [T.FLOOR_STONE] });

  /* Barrels: the town's clutter, and the barrel is one of the two keys whose
     skin is picked per tile (`barrel`/`barrel_b`, scene.js#_locSpec), so a town
     with four barrels in it can perfectly well hold four of the same skin and
     draw the other model nowhere - which is exactly what happened, and what the
     audit reported as "baked with nothing drawing it: barrel_b". A barrel in
     every shop and a pair out at the well is both the busier, more 2007 town
     and enough of them that both skins are on show. */
  placeProp("barrel", 48, 49, {}, { indoor: true });
  placeProp("barrel", 59, 49, {}, { indoor: true });
  placeProp("barrel", 53, 62, {}, { indoor: true });
  placeProp("barrel", 49, 74, {}, { indoor: true });
  placeProp("barrel", 60, 73, {}, { indoor: true });
  placeProp("barrel", 72, 74, {}, { indoor: true });
  placeProp("barrel", 64, 73, {}, { indoor: true });
  placeProp("barrel", 78, 37, {}, { indoor: false });
  placeProp("barrel", 53, 43, {}, { indoor: false });
  placeProp("barrel", 54, 43, {}, { indoor: false });
  placeProp("barrel", 51, 47, {}, { indoor: false });

  /* The market square's furniture: a table with a bench either side, in the
     square's south-east corner, on the two rows the stalls do not use (the
     stall rows are z 35-36 and z 39-40, so z 41-43 is the open end). It is
     solid, so it also gives the square's two guards something to walk around.
     The quarter-turns are pinned rather than hashed (scene.js#_locSpec): a
     2x1 bench laid on a north-south tile would stick out of the row it is
     standing in, and a bench with a front is not a thing to spin at random. */
  placeProp("table_b", 76, 41, { rot: 0 }, { indoor: false });
  placeProp("bench", 74, 42, { rot: 0 }, { indoor: false });
  placeProp("bench", 78, 41, { rot: 0 }, { indoor: false });

  /* Boulders (2x2, solid): the mine's outcrops. The cache's own rock scatter
     (`rock_a`/`rock_b`) is small ore-bearing piles, so the mine's bare ground
     had no big rock on it; three of these ring the working. */
  placeProp("boulder", 89, 62, {}, { indoor: false });
  placeProp("boulder", 108, 74, {}, { indoor: false });
  placeProp("boulder", 92, 88, {}, { indoor: false });

  /* Rockery (solid, 1x1): the piles the mine's ground wants standing on it
     rather than lying flat. Scattered over the same ellipse the working is
     painted on (`inMine`, above) and only on its own rock ground, hashed at one
     tile in nine so the pile reads as part of the floor. */
  for (let z = 56; z < 90; z++) {
    for (let x = 86; x < 112; x++) {
      if (!inMine(x, z)) continue;
      const t = tiles[idx(x, z)];
      if (t !== T.ROCKGROUND && t !== T.GRAVEL) continue;
      if (hashPick(x, z, 6307, 9) !== 0) continue;
      /* ...and its three-by-three neighbourhood clear of rock and of other piles.
         A rockery's model is wider than the tile it stands on, so a pile beside
         an ore rock reads as a pile pushed through it, and two piles side by side
         read as one broken one. Both were visible in the mine shot before this
         test existed. */
      let crowded = false;
      for (let dz = -1; dz <= 1 && !crowded; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const no = objAt(x + dx, z + dz);
          if (no && (no.t === "rock" || no.t === "rockery" || no.t === "boulder")) { crowded = true; break; }
        }
      }
      if (crowded) continue;
      placeProp("rockery", x, z, {}, { indoor: false, strict: true });
    }
  }

  /* Ferns (walk-over, 1x1): the forest's undergrowth, one tile in twenty-two,
     wherever the same density field that plants the trees is at its thickest.
     They carry no collision at all, so they may stand anywhere the forest is -
     including on the paths the trees keep away from. */
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      const t = tiles[idx(x, z)];
      if (t !== T.GRASS && t !== T.GRASS_DARK) continue;
      /* None on the new island: it stays blank for now. */
      if (inNewIsleBox(x, z)) continue;
      /* None on the tutorial island either: the jungle pass owns its floor. */
      if (inTutIsleBox(x, z)) continue;
      if (forestDensity(x, z) < 0.55) continue;
      if (hashPick(x, z, 9109, 22) !== 0) continue;
      placeProp("fern", x, z, {}, { indoor: false, strict: true });
    }
  }

  /* Marsh plants (3x2, solid): the wet hollows, where the ground goes to MARSH.
     They are big - six tiles - and the marsh is only scattered patches, so a
     candidate has to find all six clear at once and most do not; the gate is
     therefore one tile in ten rather than the forest's one in twenty-two. A
     plant that does not fit whole is skipped rather than nudged, or the clumps
     would pile up around the first tile that refused. The model (loc 1313) is a
     tall swamp plant with a trunk and fronds, which is why it reads as a marsh
     tree rather than as ground cover - one every few dozen tiles of bog is
     about the density the real thing grows at. */
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (tiles[idx(x, z)] !== T.MARSH) continue;
      if (hashPick(x, z, 7411, 10) !== 0) continue;
      placeProp("plant", x, z, {}, { indoor: false, strict: true });
    }
  }

  /* The rocky shore, first form: the stepping stones. Two rows of them laid
     across the river, one stone every other tile, so the far bank is reached by
     leaping from stone to stone rather than by walking round (actions.js#
     jumpToRocky) - and each row is extended to within one tile of both banks, so
     no crossing has a last hop nobody can make. A row whose water run is not a
     river's width is skipped: that test is what keeps this off the lake, where
     the same code would pave a causeway across open water. */
  for (const z of [38, 76]) {
    const cx = Math.round(riverCenterX(z));
    if (!inBounds(cx, z) || !isWaterTile(cx, z)) continue;
    let x0 = cx;
    let x1 = cx;
    while (x0 - 1 >= 0 && isWaterTile(x0 - 1, z)) x0--;
    while (x1 + 1 < W && isWaterTile(x1 + 1, z)) x1++;
    if (x1 - x0 > 22) continue;
    /* Both banks must be walkable, because the first and last hop of a crossing
       is made from them: a stone whose only approach tile carries a bush has no
       way on to it from that side at all. The two approach tiles are cleared of
       undergrowth (a crossing is a thing people make a way to), but a row whose
       approach is walled or is somehow not land is skipped whole rather than
       knocked through. */
    const ends = [[x0 - 1, z], [x1 + 1, z]];
    let blocked = false;
    for (const [ex, ez] of ends) {
      if (!inBounds(ex, ez) || isWaterTile(ex, ez)) { blocked = true; break; }
      const eo = objAt(ex, ez);
      if (eo && (eo.t === "wall" || eo.t === "door")) { blocked = true; break; }
    }
    if (blocked) continue;
    for (const [ex, ez] of ends) if (objAt(ex, ez)) delObj(ex, ez);
    const stones = [];
    for (let x = x0; x <= x1; x += 2) stones.push(x);
    if (stones[stones.length - 1] < x1 - 1) stones.push(x1);
    for (const x of stones) {
      if (objAt(x, z)) continue;
      setObj(x, z, { t: "rocky", rot: hashPick(x, z, 8801, 4) });
    }
  }

  /* ...and second, the scattered shore: the odd rock in the shallows where the
     water meets sand, hashed at one tile in nine so a beach reads as rocky
     shallows rather than as a causeway. These are the ones the "Jump-to" is
     really for - a flat rock in the water you can stand on to fish from, or
     hop along the coast from. */
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (!isWaterTile(x, z) || objAt(x, z)) continue;
      /* None on the new island's shores: it stays blank for now. */
      if (inNewIsleBox(x, z)) continue;
      /* None on the tutorial island's shores either. */
      if (inTutIsleBox(x, z)) continue;
      const sand =
        tiles[idx(x - 1, z)] === T.SAND || tiles[idx(x + 1, z)] === T.SAND ||
        tiles[idx(x, z - 1)] === T.SAND || tiles[idx(x, z + 1)] === T.SAND;
      if (!sand) continue;
      if (hashPick(x, z, 6607, 9) !== 0) continue;
      setObj(x, z, { t: "rocky", rot: hashPick(x, z, 8801, 4) });
    }
  }

  /* --- wall decor (the fork's twenty-first report) ---------------------------------

     Paintings and portraits, hung where a person would hang one: on the inside
     face of a building's wall, on the floor tile that touches it. These are the
     cache's own hanging decorations (locs.mjs#LOCS's wall decor block), and the
     one thing they need from the world is which way they face - the edge of
     their own tile that the wall is on, in the same quarter-turn numbering the
     walls and doors use (0 west, 1 south, 2 east, 3 north). It is read off the
     building rather than guessed: the decor tile's north neighbour must really
     be a wall tile, or the hanging is not placed at all.

     Two properties make these different from a prop, and both are the user's
     own spec (2026-09-22, standing preference P4):

       * the tile stays WALKABLE - the picture hangs against the wall, not in the
         middle of the floor, so a person can stand on the tile (and walk under
         the frame) without clipping it. Nothing here is in `SOLID_TYPES`;
       * an item of this class may still seal a DIRECTION if it needs to, through
         the `block` mask (see WALL_DECOR_TYPES and `blocksStep`). A painting
         blocks nothing - that is what the flag being absent means - but the
         class is there for the ones that do.

     They carry no verb: every painting and portrait in this cache revision is
     examine-only scenery, which is why there is no row to wire up in
     src/actions.js and nothing for check-locs.mjs to report. */
  const hangPicture = (kind, x, z, face) => {
    if (!inBounds(x, z)) return null;
    if (objAt(x, z) || propTaken.has(pkey(x, z))) return null;
    const [wx, wz] = face === 0 ? [x - 1, z] : face === 1 ? [x, z + 1] : face === 2 ? [x + 1, z] : [x, z - 1];
    const behind = objAt(wx, wz);
    if (!behind || behind.t !== "wall") return null;
    propTaken.add(pkey(x, z));
    setObj(x, z, { t: "painting", kind, wallRot: face });
    return [x, z];
  };
  /* One per building, at hand-picked anchors on the inside face of a wall
     (`hangPicture` refuses a spot with no wall behind it, so a stale anchor
     after a remodel hangs nothing rather than floating): the bank's north
     wall, the church (where a portrait belongs), the fishing shop, the food
     store and the old clothes shop's wall inside the bank, with all three
     baked pictures used at least once (`painting`, its taller cut
     `painting_b`, and the `portrait`). */
  hangPicture("painting", 63, 38, 3);      // Bank - the north wall, east of the bankers
  hangPicture("portrait", 72, 61, 3);      // Church - beside the altar, not behind it
  hangPicture("painting", 61, 73, 3);      // Fishing Shop
  hangPicture("portrait", 73, 73, 3);      // Food Store
  hangPicture("painting_b", 57, 38, 3);    // Clothes Shop wall (inside the bank now)

  const spawns = [];
  /* The minigame dungeon's cast (src/minigame.js): the same shape as a spawn
     row, but NEVER in `spawns` - each runner's client raises its own private
     copy on entry (spawnIx 0xffff, no census, no drops, no respawn), so one
     player's clear is nobody else's. Read by src/minigame.js#spawnMgNpcs. */
  const mgSpawns = [];
  for (let i = 0; i < 9; i++) {
    spawns.push({ type: "cow", x: penX0 + 2 + ((i * 3) % 11), z: penZ0 + 3 + ((i * 5) % 10), radius: 7 });
  }
  for (let i = 0; i < 7; i++) {
    spawns.push({ type: "sheep", x: shX0 + 1 + ((i * 3) % 9), z: shZ0 + 1 + ((i * 5) % 8), radius: 3 });
  }
  spawns.push({ type: "ram", x: shX0 + 6, z: shZ0 + 3, radius: 3 });
  spawns.push({ type: "ram", x: shX0 + 3, z: shZ0 + 6, radius: 3 });
  for (let i = 0; i < 6; i++) {
    spawns.push({ type: "chicken", x: penX0 + 2 + ((i * 4) % 12), z: penZ0 + 2 + ((i * 7) % 11), radius: 7 });
  }
  /* The rest of the herd: the calves the cows wander with, and the farmer who
     keeps them. (The cow and chicken *skins* are picked per spawn - see
     game.js#NPC_MODEL_VARIANTS - so this one pen holds the whole mixed herd.) */
  spawns.push({ type: "cow_calf", x: 95, z: 46, radius: 5 });
  spawns.push({ type: "cow_calf", x: 101, z: 50, radius: 5 });
  spawns.push({ type: "cow_calf", x: 97, z: 54, radius: 5 });
  spawns.push({ type: "farmer", x: 98, z: 48, radius: 3 });
  spawns.push({ type: "farmer", x: 103, z: 52, radius: 3 });
  /* A banker behind every booth of the bank's new row, facing south to the
     customers queuing in front of them. */
  for (let x = 58; x <= 62; x++) {
    spawns.push({ type: "banker", x, z: 38, radius: 0, dir: 0 });
  }
  spawns.push({ type: "shopkeeper", x: 50, z: 51, radius: 2, shop: "general" });
  /* The tanner (src/PLAN.md unit O), who stands at his trade beside the well:
     talking to him opens the tanning list (actions.js#openTanMenu) and his own
     model is the cache's NPC 804. He keeps still and faces south into the
     square, exactly like the specialist shopkeepers below. */
  spawns.push({ type: "tanner", x: 54, z: 46, radius: 0, dir: 0 });
  /* Wizard Sedridor, west of the town square facing into it: the runecrafting
     teleport and the air talisman (src/actions.js#sedridorScreens). He keeps
     still - an archmage does not wander. */
  spawns.push({ type: "sedridor", x: 57, z: 49, radius: 0, dir: Math.PI / 2 });
  /* The herbalist, at the market square (Herblore, unit T12): the fish stall
     ends at x 73 on the square's north row (the market square block above), so
     she stands at its east end facing south across the aisle, with her own
     stall-space behind her. Her stock is SHOPS.herbalist in src/actions.js. */
  spawns.push({ type: "herbalist", x: 75, z: 36, radius: 0, dir: 0, shop: "herbalist" });
  /* Bob's Brilliant Axes (src/PLAN.md unit C3), the axe shop Lumbridge has
     that our market square was missing. Bob is the cache's dwarf NPC 519; he
     stands at the east end of the square's south stall row (the stalls
     themselves end at x 73 on z 39-40), facing north into the aisle - the
     mirror of the herbalist opposite him. His stock is SHOPS.axes, and his
     talk tree is bobScreens in src/actions.js. */
  spawns.push({ type: "bob", x: 76, z: 40, radius: 0, dir: Math.PI, shop: "axes" });
  /* Dommik's Crafting Store: the cache's Dommik (npc 545) keeps the jeweller's
     moulds and the glassmaker's shelf on the market square's north aisle,
     facing south to the customers between the stall rows. Served by
     actions.js#interactNpc with no code of its own, like every keeper. */
  spawns.push({ type: "dommik", x: 74, z: 37, radius: 0, dir: 0, shop: "craft" });
  /* Brother Jered, who blesses unblessed symbols into holy symbols (31 Prayer,
     src/actions.js#blessJered): inside the church on its east side, facing
     west into the room - beside the altar but off the door path from the west
     door at (71,64). */
  spawns.push({ type: "jered", x: 77, z: 62, radius: 0, dir: -Math.PI / 2 });
  /* The Spirit of Scorpius, who blesses unpowered symbols into unholy symbols
     for nothing (src/actions.js#blessScorpius): by the churchyard rank, just
     off the walkway behind the stones, facing south to whoever walks up. */
  spawns.push({ type: "scorpius", x: 84, z: 71, radius: 0, dir: 0 });
  /* Fred the Farmer: the cache's NPC 758, standing in the yard just outside
     his own sheep pen's north gate (the
     pen's two gaps are at x 84-85 on z 39; he keeps a couple of tiles back so
     the gate stays walkable) and facing south into the flock. His conversation
     is fredScreens in src/actions.js. */
  spawns.push({ type: "fred", x: 85, z: 36, radius: 2, dir: 0 });
  /* The Duke of Lumbridge: the cache's own Duke Horacio (npc 741), standing
     in the yard east of Fred along the sheep pen's north fence and facing
     south into the flock with him. His conversation is a single outraged
     line in src/actions.js#NPC_LINES. */
  spawns.push({ type: "duke", x: 88, z: 36, radius: 0, dir: 0 });
  /* The Bee keeper (npc 4416 "Bee keeper"): in the smithy, facing north where
     the hammer crate stood (it moved one tile east to 65,66) - standing still
     (radius 0), whip in hand, talking through dialogue.js#NPC_TALK. */
  spawns.push({ type: "beekeeper", archetype: "beekeeper", x: 64, z: 66, radius: 0, dir: Math.PI });
  /* The coin shrine in the clearing north-east of the market (see
     SHRINE_GLADE above): the merged bake - loc 6230's money pot standing on
     loc 9241's plinth - solid stone you walk round, answered from alongside.
     Hatius Cosaintus, the cache's own 3rd-age fop (build-95 npc 5523),
     stands beside it facing south to whoever walks up, and his yellow cat
     Crassus wanders the open ground. */
  setObj(86, 28, { t: "coin_shrine", rot: 0 });
  spawns.push({ type: "hiatus", x: 87, z: 28, radius: 0, dir: 0 });
  spawns.push({ type: "crassus", x: 85, z: 28, radius: 3 });
  /* The specialist shops' keepers. Like the town shopkeeper they are the shop:
     a spawn with a `shop` key is served by actions.js#interactNpc with no code
     of its own, and standing still (radius 0) keeps each one behind its own
     counter instead of wandering off with the stock. `dir: 0` turns every
     keeper to face south - i.e. toward their own door, and so toward the
     customer walking in (see game.js#createNpc). */
  spawns.push({ type: "armour_shop_owner", x: 73, z: 51, radius: 0, dir: 0, shop: "armour" });
  /* The lone sword seller, open-air in the town square's north-east corner -
     no building, so the spawn stays clear. He serves SHOPS.sword like any
     counter keeper (actions.js#interactNpc), facing south into the square
     toward the customers arriving from the spawn. */
  spawns.push({ type: "sword_shop_owner", x: 65, z: 47, radius: 0, dir: 0, shop: "sword" });
  spawns.push({ type: "archery_shop_owner", x: 51, z: 73, radius: 0, dir: 0, shop: "archery" });
  spawns.push({ type: "fishing_shop_owner", x: 62, z: 73, radius: 0, dir: 0, shop: "fishing" });
  spawns.push({ type: "food_shop_owner", x: 74, z: 73, radius: 0, dir: 0, shop: "food" });
  /* The town's cape rack (see src/actions.js#SHOPS.clothes): no longer behind a
     counter - its building is the bank now - so its keeper stands in the market
     square's open air south-west of the Wise Old Man and the Makeover Mage,
     facing north with them. */
  spawns.push({ type: "clothes_shop_owner", x: 67, z: 43, radius: 0, dir: Math.PI, shop: "clothes" });
  /* Mac, the capes of accomplishment' seller: this world's stand-in for OSRS's
     Mac, drawn from his own baked model (npc 6481, Oct 2015) - blond beard,
     green shirt, grey kilt, black boots, the Max cape on his back - over his
     own mechanics (a level-0
     pacifist whose def carries nothing but Talk-to). He stands in the market
     square's open south end (x 70, z 42 - the two rows the stalls
     use are z 35-36 and z 39-40, and the table with its benches takes the
     square's south-east corner at x 74-78), facing back down the street a new
     player arrives by. His stock is SHOPS.skillcape in src/actions.js, and the
     24 capes on it are each gated on level 99 in their own skill - which is why
     he is here rather than in one of the shops: a cape of accomplishment is not
     bought with money alone. The town square's own Wise Old Man is untouched. */
  spawns.push({ type: "mac", x: 70, z: 42, radius: 0, dir: Math.PI, shop: "skillcape" });
  spawns.push({ type: "makeover_mage", x: 72, z: 42, radius: 0, dir: Math.PI });
  /* The market square's own two guards (the market square block above): one at
     either end of the aisle between the stall rows, so every stall is in
     somebody's sight and a raid has to be timed. src/combat.js#callMarketGuards
     is what rings the alarm when a theft is seen. */
  spawns.push({ type: "guard", x: 65, z: 38, radius: 3 });
  spawns.push({ type: "guard", x: 74, z: 38, radius: 3 });
  /* A guard dog beside each of the town's two guards (unit C1: the model and a
     drop table had existed since the bestiary pass, but no spawn record, so the
     creature was unreachable - and its stat line was this world's own invention
     rather than the published dog's, which the same unit corrected). */
  spawns.push({ type: "guard_dog", x: 65, z: 39, radius: 3 });
  spawns.push({ type: "guard_dog", x: 74, z: 39, radius: 3 });
  spawns.push({ type: "man", x: 56, z: 68, radius: 6 });
  spawns.push({ type: "man", x: 76, z: 68, radius: 6 });
  spawns.push({ type: "woman", x: 48, z: 44, radius: 5 });
  for (let i = 0; i < 7; i++) {
    spawns.push({ type: "goblin", x: 55 + ((i * 5) % 22), z: 103 + ((i * 7) % 14), radius: 9 });
  }
  /* Goblins Against Shovels: the camp's organised faction, picketing its own
     corner south of the ordinary diggings. Shovels came out recently and five
     pairs of hands are suddenly spare, so the band marches here - Talk-to one
     for the platform, and stand close a while to hear the shouting. */
  spawns.push({ type: "gas_goblin", x: 57, z: 105, radius: 4 });
  spawns.push({ type: "gas_goblin", x: 62, z: 112, radius: 4 });
  spawns.push({ type: "gas_goblin", x: 67, z: 114, radius: 4 });
  spawns.push({ type: "gas_goblin", x: 72, z: 107, radius: 4 });
  spawns.push({ type: "gas_goblin", x: 64, z: 108, radius: 4 });
  for (let i = 0; i < 5; i++) {
    spawns.push({ type: "rat", x: 52 + ((i * 9) % 30), z: 44 + ((i * 6) % 36), radius: 5 });
  }
  /* The churchyard, west of the square: the town's graves, and what walks
     between them after dark. Zombies, skeletons and ghosts all come for you
     (unit C1's audit found the skeletons and ghosts had no `AGGRO` row at all,
     so they stood by while a zombie two tiles away charged); all of them are of
     the undead class, so Crumble Undead hits them properly. The monks and
     priests who keep the graves carry that class too (the user's request) even
     though they are level-0 humans - see game.js#NPC_STATS.

     The two **monks of Zamorak** are here rather than in a temple this map has
     no region for: they are the crypt's own clergy, undead by the same rule,
     and they stand among the outer graves with the skeleton band. */
  spawns.push({ type: "monk", x: 74, z: 64, radius: 2 });
  spawns.push({ type: "monk", x: 73, z: 65, radius: 2 });
  spawns.push({ type: "monk_of_zamorak", x: 41, z: 72, radius: 3 });
  spawns.push({ type: "monk_of_zamorak", x: 53, z: 74, radius: 3 });
  spawns.push({ type: "zombie", x: 45, z: 71, radius: 4 });
  spawns.push({ type: "zombie", x: 47, z: 74, radius: 4 });
  spawns.push({ type: "zombie", x: 51, z: 73, radius: 4 });
  spawns.push({ type: "skeleton", x: 44, z: 75, radius: 4 });
  spawns.push({ type: "skeleton", x: 50, z: 70, radius: 4 });
  spawns.push({ type: "skeleton", x: 43, z: 72, radius: 4 });
  spawns.push({ type: "ghost", x: 46, z: 69, radius: 5 });
  spawns.push({ type: "ghost", x: 49, z: 76, radius: 5 });
  spawns.push({ type: "ghost", x: 52, z: 68, radius: 5 });
  /* The Barrows (the brothers' ground, south of town - see the `yard` above):
     one at the foot of each coffin, west to east Dharok, Guthan, Verac, Torag,
     Karil, Ahrim - the order their own pages are written in. A radius of 0
     keeps each brother at his own grave instead of pacing the yard, and they
     all face north, back up the aisle toward the gate (dir 0 faces south, so
     the reverse is PI), which is the way a player walks in. */
  spawns.push({ type: "dharok", x: 61, z: 102, radius: 0, dir: Math.PI });
  spawns.push({ type: "guthan", x: 64, z: 102, radius: 0, dir: Math.PI });
  spawns.push({ type: "verac", x: 67, z: 102, radius: 0, dir: Math.PI });
  spawns.push({ type: "torag", x: 70, z: 102, radius: 0, dir: Math.PI });
  spawns.push({ type: "karil", x: 73, z: 102, radius: 0, dir: Math.PI });
  spawns.push({ type: "ahrim", x: 76, z: 102, radius: 0, dir: Math.PI });
  /* The mine's spiders - they nest in the seams, as in the live game. */
  spawns.push({ type: "giant_spider", x: 92, z: 64, radius: 5 });
  spawns.push({ type: "giant_spider", x: 100, z: 72, radius: 5 });
  spawns.push({ type: "giant_spider", x: 104, z: 80, radius: 5 });
  spawns.push({ type: "giant_spider", x: 98, z: 82, radius: 5 });
  spawns.push({ type: "giant_spider", x: 94, z: 86, radius: 5 });
  /* The wizards' circle east of the mine, amidst the rocks (open ground
     x104-112 on the z73-75 rows, boulders between the bodies). The middle blue
     wizard keeps its `cast` override (see src/combat.js#NPC_CAST's
     tower_wizard row) and hits the hardest of the five; the other blue wizard
     throws the base Fire Strike, the level-20 dark wizards Earth Bolt and the
     level-7 young one Earth Strike. None of them will walk up to a high-level
     tester on their own - attack one with a ring shield worn and every strike
     that lands lights the shield's inner disc. */
  spawns.push({ type: "dark_wizard", x: 105, z: 74, radius: 2 });
  spawns.push({ type: "dark_wizard_young", x: 107, z: 73, radius: 2 });
  spawns.push({ type: "wizard", x: 109, z: 73, radius: 2 });
  spawns.push({ type: "wizard", x: 106, z: 75, radius: 2, cast: "tower_wizard" });
  spawns.push({ type: "dark_wizard", x: 111, z: 74, radius: 2 });
  /* Giant rats in the rubble south of the goblin camp (kept clear of the
     Barrows' new ground). */
  spawns.push({ type: "giant_rat", x: 64, z: 114, radius: 6 });
  spawns.push({ type: "giant_rat", x: 68, z: 116, radius: 6 });
  spawns.push({ type: "giant_rat", x: 70, z: 114, radius: 6 });
  spawns.push({ type: "giant_rat", x: 65, z: 114, radius: 6 });
  /* The wild north-west: imps round the magic grove, and the dark wizards who
     work it - the rune source a budding mage can actually farm. */
  spawns.push({ type: "imp", x: 12, z: 16, radius: 4 });
  spawns.push({ type: "imp", x: 14, z: 10, radius: 4 });
  spawns.push({ type: "imp", x: 15, z: 15, radius: 4 });
  spawns.push({ type: "dark_wizard", x: 11, z: 20, radius: 3 });
  spawns.push({ type: "dark_wizard", x: 17, z: 19, radius: 3 });

  /* ------------------------------------------------- Saradomin's grove (2026-09-24)

     The god himself, and the congregation of his enemies that never stops
     coming for him. `radius: 0` is the whole of his movement: a spawn of zero is
     the one thing the creature AI reads as "this one does not wander"
     (src/game.js#createNpc sets `wander = spawn.radius > 0`), so he stands on
     his tile and never leaves it. The tile is the centre of the glade carved out
     of the deep trees north-west of the magic grove (the user's ask: *"he should
     be on the northwest side of the map somewhere in the trees"*, and *"you
     could maybe clear some of the trees around him a bit to make it slightly
     more of an open area"* - the clearing itself is the `GLADE` in the
     tree-planting section above, which no tree's model may cover), and all eight
     of its neighbours are walkable, which is what lets his 3x3 strike actually
     reach something.

     Around him, on a ring **six to eight tiles out**, the creatures that are
     sworn to bring him down: six imps, three monks of Zamorak, two dark wizards
     and two lesser demons. Two things about the placement are the user's own
     (2026-09-24):

       * *"have demons and imps spawning a bit further away and then instantly
         aggroing towards him"* - so every home is on the ring rather than in a
         scrum around his feet, and the open glade between ring and god is the
         ground they charge across. Each tile is chosen to be clear ground, and
         each demon's anchor is chosen so its 2x2 body is wholly on open ground -
         otherwise it is drawn with a tree growing through it;
       * *"they would be aggroed only towards saradomin ... they would not have
         an attack option for players only, only an examine text"* - the
         **`godFoe`** flag on every one of these spawns (src/game.js#createNpc) is
         what swears it to the god: the player's creature menu offers it nothing
         but Examine (src/actions.js#npcCanAttack) and its fight is run on the
         god's own clock (src/saradomin.js#tickGodFoe) rather than by the
         creature AI, which steps over it entirely.

     The Zamorakians and the demons are still the whole point of the placement:
     Saradomin's strike is three times as hard on a demon or a Zamorakian as on
     anything else (src/game.js#isHolyFoe), and watching him take an imp's eight
     hitpoints and a lesser demon's seventy-nine in the same crack tells you so
     without a word of explanation. Nothing here wanders far from where it stands
     (`radius` 1-2) - it does not need to, because it is always being called to
     him. */
  spawns.push({ type: "saradomin", archetype: "saradomin", x: 16, z: 34, radius: 0, dir: 0 });
  /* The imps, all round him: two west, one north-west, one south-west, one due
     south and one east. */
  spawns.push({ type: "imp", x: 10, z: 34, radius: 2, godFoe: true });
  spawns.push({ type: "imp", x: 11, z: 27, radius: 2, godFoe: true });
  spawns.push({ type: "imp", x: 9, z: 39, radius: 2, godFoe: true });
  spawns.push({ type: "imp", x: 16, z: 40, radius: 2, godFoe: true });
  spawns.push({ type: "imp", x: 24, z: 33, radius: 2, godFoe: true });
  spawns.push({ type: "imp", x: 22, z: 30, radius: 2, godFoe: true });
  /* The Zamorakians: the monks of his rival's order and the dark wizards of the
     wilds, the two of whom his strike is worth triple. */
  spawns.push({ type: "monk_of_zamorak", x: 8, z: 34, radius: 1, godFoe: true });
  spawns.push({ type: "monk_of_zamorak", x: 16, z: 41, radius: 1, godFoe: true });
  spawns.push({ type: "monk_of_zamorak", x: 23, z: 30, radius: 1, godFoe: true });
  spawns.push({ type: "dark_wizard", x: 9, z: 30, radius: 1, godFoe: true });
  spawns.push({ type: "dark_wizard", x: 24, z: 38, radius: 1, godFoe: true });
  /* The demons, whose 2x2 bodies are the reason their two anchors were picked
     tile by tile: an open four-tile block each. */
  spawns.push({ type: "lesser_demon", x: 20, z: 40, radius: 1, godFoe: true });
  spawns.push({ type: "lesser_demon", x: 7, z: 29, radius: 1, godFoe: true });
  /* Solus Dellagar (user request 2026-09-28): the Wanted! quest's warrior-mage,
     baked from the cache's own Talk-to variant (npc 2747). He stands well
     south of the grove on open ground - fifteen tiles from the god, clear of
     the assailants' ring - and is standalone content: no godFoe flag, nothing
     to do with Saradomin's fight. `radius: 0`, so he stands on his tile and
     never leaves it. */
  spawns.push({ type: "solus_dellagar", x: 16, z: 49, radius: 0, dir: 0 });
  /* The Ranger (user request 2026-09-28): the Wanted! quest's Temple Knight
     ranger, baked from the cache's own Attack variant (npc 2779) as the wiki
     lists, standing two tiles east of Solus on the same open ground. */
  spawns.push({ type: "ranger", x: 18, z: 49, radius: 0, dir: 0 });
  spawns.push({ type: "surok_magis", x: 20, z: 49, radius: 0, dir: 0 });
  spawns.push({ type: "surok_magis_dagonhai", x: 22, z: 49, radius: 0, dir: 0 });
  /* Unicorns on the open grass east of the pen, with a foal trailing them. */
  spawns.push({ type: "unicorn", x: 100, z: 24, radius: 7 });
  spawns.push({ type: "unicorn", x: 106, z: 28, radius: 7 });
  spawns.push({ type: "unicorn", x: 112, z: 22, radius: 7 });
  spawns.push({ type: "unicorn", x: 104, z: 32, radius: 7 });
  spawns.push({ type: "unicorn_foal", x: 108, z: 30, radius: 4 });
  spawns.push({ type: "unicorn_foal", x: 101, z: 27, radius: 4 });
  /* Wizard Thormac (user request 2026-10-08): the tower wizard who enchants
     elemental battlestaves into mystic staves at 40,000 coins each
     (src/actions.js#thormacScreens). He keeps by the shore path two tiles west
     of the eastern magic tree's trunk - the staff-enchanter where the row's
     best staff grows. First considered, the grove's wizards' circle stands
     inside the patrol of two level-82 lesser demons, and the town counter
     after it; the user asked for the east-shore tree. He stands his tile
     (`radius: 0`) like the other vendors, facing the path. */
  spawns.push({ type: "thormac", x: 112, z: 56, radius: 0, dir: 0 });

  /* --- the wider population ------------------------------------------------
     The town's own people (knight/soldier/warrior woman on the streets, the
     priest at his church), the wilds' humanoids (barbarians on the west bank,
     the druid and wizard circles in the magic grove, highwaymen and rogues on
     the outer roads), and the creatures that live with them (wolves and a bear
     cub in the deadtree grove, dwarves and hobgoblins at the mine's far end).
     Every spawn type carries authentic 2007 combat stats - see game.js#NPC_STATS. */
  spawns.push({ type: "knight_of_ardougne", x: 64, z: 50, radius: 4 });
  spawns.push({ type: "knight_of_ardougne", x: 53, z: 54, radius: 4 });
  spawns.push({ type: "soldier", x: 47, z: 59, radius: 4 });
  spawns.push({ type: "soldier", x: 68, z: 60, radius: 4 });
  spawns.push({ type: "warrior_woman", x: 51, z: 45, radius: 5 });
  spawns.push({ type: "warrior_woman", x: 72, z: 47, radius: 5 });
  spawns.push({ type: "priest", x: 75, z: 63, radius: 2 });
  spawns.push({ type: "priest", x: 73, z: 66, radius: 2 });

  spawns.push({ type: "barbarian", x: 38, z: 46, radius: 5 });
  spawns.push({ type: "barbarian", x: 36, z: 50, radius: 5 });
  spawns.push({ type: "barbarian", x: 33, z: 54, radius: 5 });
  spawns.push({ type: "wizard", x: 16, z: 24, radius: 4 });
  spawns.push({ type: "wizard", x: 12, z: 28, radius: 4 });
  spawns.push({ type: "druid", x: 19, z: 27, radius: 4 });
  spawns.push({ type: "druid", x: 13, z: 24, radius: 4 });
  /* The Magic Shop owner keeps her counter in the north-west corner of the
     town square (the `shop` key names her stock, src/actions.js#SHOPS),
     where the full magic range is bought. She has radius 0: a vendor stands
     at her counter, she does not wander off with the shop. `hideLabel`
     drops the floating name other archetype bodies carry. */
  spawns.push({ type: "magic_store_owner", archetype: "wizard_shopkeeper", x: 60, z: 48, radius: 0, shop: "magic", hideLabel: true });
  spawns.push({ type: "highwayman", x: 24, z: 60, radius: 5 });
  spawns.push({ type: "highwayman", x: 20, z: 64, radius: 5 });
  spawns.push({ type: "rogue", x: 52, z: 99, radius: 6 });
  spawns.push({ type: "rogue", x: 86, z: 100, radius: 6 });
  /* The two muggers (user request: off the spawn street). They used to stand in
     the market street itself - five tiles either side of the tile a new player
     spawns on - and since a mugger is aggressive up to combat level 40, the
     first thing a brand-new account met was a fist. They now waylay travellers
     on the west road, out past the bridge and short of the highwaymen's stretch,
     which is where a mugger belongs. */
  spawns.push({ type: "mugger", x: 30, z: 56, radius: 4 });
  spawns.push({ type: "mugger", x: 25, z: 57, radius: 4 });
  spawns.push({ type: "black_knight", x: 104, z: 88, radius: 6 });
  spawns.push({ type: "black_knight", x: 54, z: 120, radius: 6 });

  spawns.push({ type: "wolf", x: 60, z: 116, radius: 7 });
  spawns.push({ type: "wolf", x: 70, z: 114, radius: 7 });
  spawns.push({ type: "wolf", x: 74, z: 118, radius: 7 });
  spawns.push({ type: "bear_cub", x: 64, z: 120, radius: 6 });
  spawns.push({ type: "bear_cub", x: 76, z: 116, radius: 6 });
  /* The kitchen's cook: the dwarf that wandered the mine scrub at (88,60) is
     gone, and the cache's own cook (npc 278, whose tree already offers his
     range) stands still in the kitchen instead, facing south to the door. He
     trades baking supplies through SHOPS.cook (see actions.js). */
  spawns.push({ type: "cook", x: 83, z: 61, radius: 0, dir: 0, shop: "cook" });
  spawns.push({ type: "dwarf", x: 109, z: 83, radius: 4 });
  spawns.push({ type: "dwarf", x: 94, z: 70, radius: 4 });
  spawns.push({ type: "hobgoblin", x: 100, z: 64, radius: 5 });
  spawns.push({ type: "hobgoblin", x: 94, z: 76, radius: 5 });
  spawns.push({ type: "hobgoblin", x: 106, z: 80, radius: 5 });
  spawns.push({ type: "skeleton_mage", x: 47, z: 78, radius: 3 });
  spawns.push({ type: "skeleton_mage", x: 41, z: 68, radius: 3 });
  /* The outer graves, furthest from the chapel: a proper rank of skeletons on
     their own, so the churchyard's undead read as a band to fight through
     rather than three strays mixed in with the zombies. */
  spawns.push({ type: "skeleton", x: 39, z: 77, radius: 5 });
  spawns.push({ type: "skeleton", x: 43, z: 80, radius: 5 });
  spawns.push({ type: "skeleton", x: 48, z: 81, radius: 5 });
  spawns.push({ type: "skeleton", x: 53, z: 79, radius: 5 });
  spawns.push({ type: "skeleton_mage", x: 45, z: 83, radius: 3 });
  /* A dark wizard haunting the churchyard's edge, among the skeletons. */
  spawns.push({ type: "dark_wizard", x: 49, z: 76, radius: 3 });
  /* Iban's field, moved 2026-10-10 about 10 west / 15 south of the churchyard
     (46,79) at the user's request - the exact tile (36,94) is a tree, so he
     stood one tile west of it - then 5 north / 5 east again, landing here. The
     foes keep their formation round him. */
  spawns.push({ type: "iban", archetype: "iban", x: 40, z: 89, radius: 0, dir: 0 });
  spawns.push({ type: "skeleton", x: 37, z: 89, radius: 1, ibanFoe: true });
  spawns.push({ type: "skeleton", x: 38, z: 92, radius: 1, ibanFoe: true });
  spawns.push({ type: "skeleton", x: 43, z: 92, radius: 1, ibanFoe: true });
  spawns.push({ type: "skeleton", x: 43, z: 89, radius: 1, ibanFoe: true });
  /* The safespot test wall: five tiles of low ruined wall running north-south
     on the open grass west of the outer-graves skeleton band. The structuary's
     own crumbled ruin kits (ruin_wall_low_a/b, alternating mirror per tile),
     standable like any wall tile but sealing both east-west faces (block 5),
     so skeletons still path around the ends - and only ~0.7 tall, so missiles
     visibly fly over, exactly the shape safespotting needs. Combat measures
     reach by distance only (no line-of-sight block), so spells and arrows cross
     it either way; the low model is what makes that read true. */
  for (let z = 75; z <= 79; z++) setObj(37, z, { t: "lowwall", v: z === 77 ? 1 : z === 79 ? 2 : 0, block: 1 });

  /* Wildfowl on the water's edge: ducks and ducklings along the riverbank, the
     gulls on the lake shore. Small radius so they potter about the bank rather
     than wandering off into the fields. */
  spawns.push({ type: "duck", x: 34, z: 22, radius: 3 });
  spawns.push({ type: "duck", x: 37, z: 30, radius: 3 });
  spawns.push({ type: "duck", x: 40, z: 38, radius: 3 });
  spawns.push({ type: "duck", x: 34, z: 54, radius: 3 });
  spawns.push({ type: "duck", x: 26, z: 62, radius: 3 });
  spawns.push({ type: "duckling", x: 45, z: 22, radius: 2 });
  spawns.push({ type: "duckling", x: 48, z: 30, radius: 2 });
  spawns.push({ type: "duckling", x: 39, z: 62, radius: 2 });
  /* The lake's north shore carries the flock proper. It is the one beach on the
     map wide enough to read as one - six tiles of sand at z 84..88, between the
     mine's gravel and the water - and it is the shore the metadata image looks
     along, so the gulls were thinned out over it rather than bunched on the
     single tile that used to hold two of them: five more stand on the strip
     either side of the old pair, and the whole flock fishes the same shallows
     (the net-and-bait spots at (94,94) and (101,86)). */
  spawns.push({ type: "seagull", x: 90, z: 84, radius: 3 });
  spawns.push({ type: "seagull", x: 94, z: 86, radius: 3 });
  spawns.push({ type: "seagull", x: 89, z: 86, radius: 3 });
  spawns.push({ type: "seagull", x: 95, z: 87, radius: 3 });
  spawns.push({ type: "seagull", x: 88, z: 88, radius: 3 });
  spawns.push({ type: "seagull", x: 92, z: 86, radius: 3 });
  spawns.push({ type: "seagull", x: 96, z: 88, radius: 3 });
  spawns.push({ type: "seagull", x: 104, z: 102, radius: 3 });

  /* --- the town's own people (src/PLAN.md unit J) ----------------------------
     The NPCs that make the town a place rather than a set of buildings. Each is
     placed where the trade its own name promises actually happens, and the
     wander radius is what reads as a *life*: the shop assistant stands still at
     her counter like every other vendor (radius 0), the gardener works the
     churchyard a few tiles either way, and Hans - the servant every 2007 player
     met first - has a radius that covers the whole town, so he is somewhere
     different every time you look for him. All thirteen are level 0 pacifists
     (src/game.js#NPC_STATS) and none is aggressive, so the town stays a town. */
  spawns.push({ type: "hans", x: 60, z: 59, radius: 11 });
  spawns.push({ type: "lumbridge_guide", x: 55, z: 57, radius: 0 });
  /* The Wise Old Man's tutorial post: one tile west and four tiles south of
     the square's statue (62,51), facing the tile new players spawn into
     (62,57) - from his post (61,55) that is Math.atan2(1, 2) - standing
     still like a landmark. He is the same type as the skillcape
     vendor across town (who keeps his shop), but with no shop this spawn falls
     through to his mentor tree (src/dialogue.js). When a conversation ends he
     turns back to this facing ten ticks later (src/game.js#updateNpcs reads
     the timer src/dialogue.js#endDialogue stamps). */
  spawns.push({ type: "wise_old_man", x: 61, z: 55, radius: 0, dir: Math.atan2(1, 2) });
  spawns.push({ type: "cook", x: 73, z: 75, radius: 2 });
  spawns.push({ type: "beggar", x: 57, z: 60, radius: 1 });
  spawns.push({ type: "child", x: 64, z: 60, radius: 4 });
  spawns.push({ type: "schoolgirl", x: 66, z: 57, radius: 4 });
  spawns.push({ type: "drunken_man", x: 56, z: 54, radius: 2 });
  /* The armour shop's own assistant, at her counter beside it: she serves the
     same till as the owner (her spawn carries `shop`), the way the live game's
     shop assistants are the same conversation as the keeper - only the face
     behind the counter differs. */
  spawns.push({ type: "shop_assistant", x: 75, z: 52, radius: 0, dir: 0, shop: "armour" });
  spawns.push({ type: "gardener", x: 80, z: 63, radius: 2 });
  spawns.push({ type: "apprentice", x: 14, z: 27, radius: 3 });
  /* The two working people who are out on the map rather than in the town: the
     miner at his seam (the mine's own working, src/world.js `inMine`) and the
     fisherman on the bank beside the fishing spots the river already carries. */
  spawns.push({ type: "miner", x: 91, z: 67, radius: 2 });
  spawns.push({ type: "fisherman", x: 50, z: 45, radius: 2 });

  /* --- the wider bestiary (src/PLAN.md unit E) ------------------------------
     The classic 2007 monsters the world had no spawn for yet. Each band is
     placed where its real counterpart lives and, importantly, well away from
     the town square and the cow pen - several of these are aggressive and
     would otherwise make the starting area unplayable.

       * the north woods (z ~15-32): black bears and a hill/moss giant band,
         with the fire giants further up the same valley;
       * the north-east heights: ice giants, and a blue dragon on the crag
         above the shore;
       * the far north-west beyond the magic grove: the demons, the earth
         warriors who guard the way in, and chaos druids in the grove itself;
       * the mine's deeper seams: giant bats, crawling hands and scorpions;
       * the goblin camp's south edge: banshees among the graves, deadly red
         spiders in the rubble. */
  spawns.push({ type: "black_bear", x: 60, z: 22, radius: 6 });
  spawns.push({ type: "black_bear", x: 68, z: 18, radius: 6 });
  spawns.push({ type: "black_bear", x: 52, z: 26, radius: 6 });
  spawns.push({ type: "hill_giant", x: 74, z: 20, radius: 5 });
  spawns.push({ type: "hill_giant", x: 80, z: 26, radius: 5 });
  spawns.push({ type: "hill_giant", x: 66, z: 15, radius: 5 });
  spawns.push({ type: "moss_giant", x: 86, z: 18, radius: 5 });
  spawns.push({ type: "moss_giant", x: 78, z: 30, radius: 5 });
  spawns.push({ type: "fire_giant", x: 70, z: 12, radius: 5 });
  spawns.push({ type: "fire_giant", x: 62, z: 10, radius: 5 });

  spawns.push({ type: "ice_giant", x: 100, z: 22, radius: 5 });
  spawns.push({ type: "ice_giant", x: 116, z: 22, radius: 5 });
  spawns.push({ type: "ice_giant", x: 100, z: 14, radius: 5 });
  spawns.push({ type: "blue_dragon", x: 118, z: 24, radius: 6 });

  spawns.push({ type: "earth_warrior", x: 24, z: 34, radius: 5 });
  spawns.push({ type: "earth_warrior", x: 18, z: 38, radius: 5 });
  spawns.push({ type: "lesser_demon", x: 12, z: 32, radius: 5 });
  spawns.push({ type: "lesser_demon", x: 20, z: 30, radius: 5 });
  spawns.push({ type: "greater_demon", x: 7, z: 25, radius: 5 });
  spawns.push({ type: "chaos_druid", x: 14, z: 22, radius: 4 });
  spawns.push({ type: "chaos_druid", x: 21, z: 25, radius: 4 });

  spawns.push({ type: "giant_bat", x: 96, z: 68, radius: 6 });
  spawns.push({ type: "giant_bat", x: 106, z: 76, radius: 6 });
  spawns.push({ type: "giant_bat", x: 90, z: 80, radius: 6 });
  spawns.push({ type: "crawling_hand", x: 90, z: 74, radius: 4 });
  spawns.push({ type: "crawling_hand", x: 102, z: 62, radius: 4 });
  spawns.push({ type: "scorpion", x: 98, z: 86, radius: 5 });
  spawns.push({ type: "scorpion", x: 108, z: 84, radius: 5 });
  spawns.push({ type: "scorpion", x: 92, z: 60, radius: 5 });

  spawns.push({ type: "banshee", x: 50, z: 98, radius: 5 });
  spawns.push({ type: "banshee", x: 62, z: 94, radius: 5 });
  spawns.push({ type: "deadly_red_spider", x: 48, z: 96, radius: 5 });
  spawns.push({ type: "deadly_red_spider", x: 44, z: 102, radius: 5 });
  spawns.push({ type: "deadly_red_spider", x: 50, z: 108, radius: 5 });

  /* --- the bosses (src/PLAN.md unit I) --------------------------------------
     One room each, in the lairs built above (`cave`). The King Black Dragon has
     its crag to itself; the three Dagannoth Kings share their rock, each in a
     separate corner of it, and because all three are aggressive with no level
     ceiling, walking in means all three at once - which is exactly what
     stepping on to their rock is like. Every spawn is kept a body's width off
     its own wall so nothing clips, and off the mouth's approach so the entrance
     stays clear. */
  spawns.push({ type: "king_black_dragon", x: 112, z: 11, radius: 6 });
  spawns.push({ type: "dagannoth_supreme", x: 110, z: 110, radius: 4 });
  spawns.push({ type: "dagannoth_prime", x: 118, z: 110, radius: 4 });
  spawns.push({ type: "dagannoth_rex", x: 114, z: 118, radius: 4 });

  /* --- the chromatic dragons and the snake (src/PLAN.md unit P) --------------
     The green dragons hold the south-west wild, far enough from the town road
     that a wanderer cannot stumble into one; the red dragons share the north-
     east highlands with the blue; the black dragons live inside the lair built
     above; and the four snakes are in the marsh grass by the mine, which is
     where this map already keeps its damp, low, vermin sort of ground. Every
     spawn below is the footprint's south-west tile (see src/game.js#npcFootBox)
     and the whole floor was checked walkable and empty before it was written
     down - a 4x4 dragon standing one tile off would hang its body over a wall.
     The greens stand on trampled pads the forest scatter keeps out of (see
     DRAGON_PADS above), which is what keeps the wild a wood with dragons in it
     rather than a wood with dragons somewhere underneath it. The dragons are
     3.3 tiles tall like the blue dragon, and
     the snake's spawns are close together because it never hunts far. */
  spawns.push({ type: "green_dragon", x: 4, z: 88, radius: 5 });
  spawns.push({ type: "green_dragon", x: 12, z: 88, radius: 5 });
  spawns.push({ type: "green_dragon", x: 17, z: 88, radius: 5 });
  spawns.push({ type: "green_dragon", x: 5, z: 95, radius: 5 });
  spawns.push({ type: "red_dragon", x: 118, z: 34, radius: 5 });
  spawns.push({ type: "red_dragon", x: 118, z: 28, radius: 5 });
  spawns.push({ type: "red_dragon", x: 117, z: 38, radius: 5 });
  spawns.push({ type: "black_dragon", x: 10, z: 108, radius: 4 });
  spawns.push({ type: "black_dragon", x: 13, z: 112, radius: 4 });
  spawns.push({ type: "black_dragon", x: 9, z: 112, radius: 4 });
  spawns.push({ type: "snake", x: 100, z: 54, radius: 4 });
  spawns.push({ type: "snake", x: 104, z: 58, radius: 4 });
  spawns.push({ type: "snake", x: 108, z: 50, radius: 4 });
  spawns.push({ type: "snake", x: 98, z: 60, radius: 4 });

  /* --- the wilderness band (unit C2, the creature families) ------------------
     The classic Wilderness population, placed as one band across the south wild
     rather than scattered: the dark warriors on the wild's northern fringe
     where the rogues already camp, the bandits a step deeper, the black
     unicorns grazing the middle of it, the grizzly bears on the northern edge
     where the wild meets the fields (so a wanderer meets a bear before a
     bandit), the chaos dwarves down the mine's deeper seams with the ordinary
     dwarves, and two black demons in the far north-west past the greater demon
     - the end of the demon line the map already builds towards.

     Every tile below was checked walkable, with the whole 3x3 ring around it
     walkable too (the demon and the bears are wide models) and no object, water
     or building on it, the same check the chromatic dragons' spawns carry. */
  spawns.push({ type: "dark_warrior", x: 45, z: 95, radius: 4 });
  spawns.push({ type: "dark_warrior", x: 49, z: 100, radius: 4 });
  spawns.push({ type: "dark_warrior", x: 54, z: 100, radius: 4 });
  spawns.push({ type: "bandit", x: 47, z: 107, radius: 5 });
  spawns.push({ type: "bandit", x: 52, z: 105, radius: 5 });
  spawns.push({ type: "bandit", x: 57, z: 112, radius: 5 });
  spawns.push({ type: "black_unicorn", x: 50, z: 112, radius: 5 });
  spawns.push({ type: "black_unicorn", x: 55, z: 110, radius: 5 });
  spawns.push({ type: "black_unicorn", x: 60, z: 110, radius: 5 });
  spawns.push({ type: "grizzly_bear", x: 32, z: 90, radius: 5 });
  spawns.push({ type: "grizzly_bear", x: 37, z: 90, radius: 5 });
  spawns.push({ type: "grizzly_bear", x: 32, z: 97, radius: 5 });
  spawns.push({ type: "chaos_dwarf", x: 93, z: 66, radius: 4 });
  spawns.push({ type: "chaos_dwarf", x: 98, z: 71, radius: 4 });
  spawns.push({ type: "chaos_dwarf", x: 93, z: 80, radius: 4 });
  spawns.push({ type: "black_demon", x: 9, z: 15, radius: 5 });
  spawns.push({ type: "black_demon", x: 7, z: 10, radius: 5 });

  /* The three spot kinds the river carries (src/items.js#FISH holds the fish
     that live in each): the shallows are net-and-bait water, the middle stretch
     is lure-and-bait water, and the deep north end is the cage-and-harpoon water, where a
     lobster pot or a harpoon works. Every kind has to exist somewhere or its
     fish cannot be caught at all - before this the river held net, fly and
     "lobster" spots only, so sardine, herring, pike, tuna and swordfish were
     unreachable and the harpoon's own pose never played. */
  const riverKind = (z) => (z <= 46 ? "net_bait" : z <= 80 ? "lure_bait" : "cage_harpoon");
  const landOK = (x, z) => inBounds(x, z) && tiles[idx(x, z)] !== T.WATERBED && tiles[idx(x, z)] !== T.VOID && tiles[idx(x, z)] !== T.DIRTWALL && !objAt(x, z);
  const trySpot = (x, z, kind) => {
    if (!inBounds(x, z) || tiles[idx(x, z)] !== T.WATERBED) return false;
    if (objAt(x, z)) return false;
    let ok = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (landOK(x + dx, z + dz)) { ok = true; break; }
    }
    if (!ok) return false;
    setObj(x, z, { t: "fishing", kind });
    return true;
  };
  for (const z of [30, 44, 70, 64, 84, 96, 110]) {
    const cx = Math.round(riverCenterX(z));
    const kind = riverKind(z);
    let placed = 0;
    for (let dx = -4; dx <= 4 && placed < 2; dx++) {
      if (trySpot(cx + dx, z, kind)) placed++;
    }
  }
  for (const z of [20, 34, 58, 90, 102]) {
    const kind = riverKind(z);
    const cx = Math.round(riverCenterX(z));
    let placed = 0;
    for (let dx = -4; dx <= 4 && placed < 2; dx++) if (trySpot(cx + dx, z, kind)) placed++;
  }
  /* The lake is net-and-bait water, the same as the shallows of the river, and
     its deep middle is this world's one stand-in for the sea: the cache puts
     shrimp, tuna, swordfish and shark on **net-and-harpoon** sea spots (loc
     2030), and this is the only water wide enough to carry them, so the two
     biggest fish have somewhere to live at all - their gates, 50 and 76, would
     otherwise be dead content. */
  const lakeSpots = [[94, 94], [108, 100], [101, 86], [97, 108]];
  for (const [x, z] of lakeSpots) {
    if (trySpot(x, z, "net_bait")) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (trySpot(x + dx, z + dz, "net_bait")) break;
  }
  /* A spot has to be water with land beside it to be reachable, and the middle
     of the lake is a guess at where the deep water lies, so each of these walks
     out through its own ring until it finds a tile that fits. */
  const tryNear = (x, z, kind) => {
    if (trySpot(x, z, kind)) return true;
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (trySpot(x + dx, z + dz, kind)) return true;
        }
      }
    }
    return false;
  };
  for (const [x, z] of [[101, 97], [105, 95], [100, 103]]) tryNear(x, z, "net_harpoon");
  for (const [x, z] of [[28, 78], [28, 79], [19, 77]]) tryNear(x, z, "lure_bait");
  /* The two newer shore kinds (src/items.js#FISH): eel water and boiling
     water at the lake's edge and middle - the deep middle stands in for Mor Ul
     Rek the way it already stands in for the sea. */
  for (const [x, z] of [[96, 90], [104, 105]]) tryNear(x, z, "bait");
  /* Eels like slow water too: two more bait spots on the river's south
     shallows, on tiles the net-and-bait loops above never visit. */
  for (const z of [24, 38]) {
    const cx = Math.round(riverCenterX(z));
    for (let dx = -4; dx <= 4; dx++) if (trySpot(cx + dx, z, "bait")) break;
  }
  for (const [x, z] of [[103, 99], [99, 101]]) tryNear(x, z, "oily");
  /* Karambwan water (src/items.js): two spots in the lake's deep middle, where
     the small net lands karambwanji and the vessel lands karambwan - the lake
     stands in for the jungle pools the way it already stands in for the sea
     and Mor Ul Rek. */
  for (const [x, z] of [[100, 97], [102, 100]]) tryNear(x, z, "karambwan_spot");

  /* --- the sea (unit XII's coast) -------------------------------------------
     The map has open water along its whole border now, so the lake no longer
     has to stand in for the sea: a walk of the coast places net-and-harpoon
     spots - loc 2030's own kind, the one the cache authors for sea fishing -
     in the deep water within a tile of the beach. Spots keep 30 tiles apart
     (Chebyshev), which is what spreads them round the island instead of
     crowding the first stretch the walk happens to reach, and the walk starts
     at the north-west corner and is fully deterministic, like every other
     placement here.

     The one filter is depth: the very shallowest water against the beach is
     skipped, so a spot sits in water that reads as sea rather than in the wash
     at the sand's own edge. Reachability is trySpot's business - a spot needs a
     dry walkable tile beside it - and that is also what keeps a spot off the
     cliff stretches where the water is deep right up to the rock. */
  let seaSpots = 0;
  const seaPlaced = [];
  for (let z = 3; z < H - 3 && seaSpots < 10; z++) {
    for (let x = 3; x < W - 3 && seaSpots < 10; x++) {
      if (tiles[idx(x, z)] !== T.WATERBED || objAt(x, z)) continue;
      /* The sea, not the river: the coastal band is the one definition of that
         which does not have to be re-derived here, and without it this walk
         finds the river first - and the river's deep water is a hundred tiles
         inland. */
      if (coastDip(x, z, seed) >= COAST) continue;
      /* Against every spot already placed, not just the last one: the walk is
         row by row, so its own last placement is usually in the row above and
         the row above that is a whole map-width away. */
      let near = false;
      for (const [sx, sz] of seaPlaced) {
        if (Math.max(Math.abs(x - sx), Math.abs(z - sz)) < 26) { near = true; break; }
      }
      if (near) continue;
      const avg = (corner[z * cw + x] + corner[z * cw + x + 1] + corner[(z + 1) * cw + x] + corner[(z + 1) * cw + x + 1]) / 4;
      if (waterLevel - avg < 0.6) continue;
      /* The three sea faces rotate round the coast: net-and-harpoon water,
         big-net-and-harpoon water, and harpoon-only rock (src/items.js#FISH).
         The index rotates rather than scattering per kind, so all three exist
         no matter how short the walk's run of deep water is. */
      const seaKinds = ["net_harpoon", "bignet_harpoon", "harpoon"];
      if (trySpot(x, z, seaKinds[seaSpots % seaKinds.length])) {
        seaPlaced.push([x, z]);
        seaSpots++;
      }
    }
  }
  const world = {
    w: W,
    h: H,
    seed,
    waterLevel,
    tiles,
    objs,
    buildings,
    mapIcons,
    spawns,
    /* The minigame dungeon's private cast (see `mgSpawns` above): data, not
       spawns - spawnNpcs never sees it. */
    mgSpawns,
    rocks,
    corner,
    cw,
    inBounds,
    idx,
    objAt,
    setObj,
    delObj,
    /* The upstairs map and its setters (see `objAt`): the renderer iterates
       `upObjs` to draw the upper floor, and nothing else reads it directly. */
    upObjs,
    setUpObj,
    delUpObj,
    upstairs: upstairsSpec,
    heightAt,
    cornerAt,
    /* The square's dais overlay (see `squareStepAt`) for scene.js. */
    stepAt: squareStepAt,
    isWaterTile,
    /* Ocean check for the troll event (baked as oceanTiles above, after the
       last tile write): out of bounds reads as ocean, like isWaterTile reads
       water, so a wave can never be refused for standing near the edge. */
    isOceanTile: (x, z) => (!inBounds(x, z) ? true : world.oceanTiles.has(idx(x, z))),
    isInsideBuilding,
    /* The footprint (in tiles) this world places each multi-tile prop with, so
       src/tools/check-locs.mjs can hold it against the bake's own loc sizes
       (src/models/locs.json). The two disagreeing means the props are solid
       over a different set of tiles than the model covers - a silent fault
       either way, which is exactly what that audit is for. */
    propFoot: PROP_FOOT,
    /* The footprint every tree model stands in, declared for the same reason
       and held to the bake the same way (src/tools/check-locs.mjs). */
    treeFoot: TREE_FOOT,
    /* And the bushes', which are stamped over their models' own ground too
       (world.js#BUSH_FOOT) - held to the bake by the same audit. */
    bushFoot: BUSH_FOOT,
    /* And the wrecks', stamped over their models' ground like the trees
       (world.js#WRECK_FOOT) - held to the bake by the same audit. */
    wreckFoot: WRECK_FOOT,
    /* The wall-decor rule (see the note by WALL_DECOR_TYPES): a step that
       crosses a face an item seals is refused. Bound to this world so every
       caller passes two tile coordinates rather than an object. */
    blocksStep: (fx, fz, tx, tz, plane = 0) => blocksStep(world, fx, fz, tx, tz, plane),
    swingBlocked: (aTiles, bTiles) => swingBlocked(world, aTiles, bTiles),
    losBlocked: (aTiles, bTiles) => losBlocked(world, aTiles, bTiles),
    tileAt: (x, z) => (inBounds(x, z) ? tiles[idx(x, z)] : T.WATERBED),
  };

  world.walkableTile = (x, z) => {
    if (!inBounds(x, z)) return false;
    if (isBridgeArea(x, z)) return true;
    /* Water-majority tiles refuse steps (user ask 2026-10-30): more than half
       the tile under water, by the exact contour area the renderer draws.
       Bridge decks stay walkable; WATERBED/VOID/DIRTWALL were already out. */
    if (world.halfWet && world.halfWet.has(idx(x, z))) return false;
    if (tiles[idx(x, z)] === T.WATERBED) return false;
    if (tiles[idx(x, z)] === T.VOID) return false;
    if (tiles[idx(x, z)] === T.DIRTWALL) return false;
    return true;
  };

  world.isBridgeArea = isBridgeArea;
  world.bridgeTiles = bridgeTiles;

  world.isWalkable = (x, z, plane = 0) => {
    if (plane === 1) {
      /* Upstairs: only the upper floor's own interior is standable ground -
         the same XZ as the shop below it, but a different level. The ring
         tiles are the upper walls (solid), the stairs and furniture are solid
         objects, and everything outside the footprint is open air. */
      const up = world.upstairs;
      if (!up || x <= up.x0 || x >= up.x1 || z <= up.z0 || z >= up.z1) return false;
      if (!world.walkableTile(x, z)) return false;
      const o = upObjs.get(idx(x, z));
      if (!o) return true;
      if (o.t === "rocky") return false;
      if (o.t === "furnace" && o.mouth) return true;
      /* SEVER (object-picker): a hand-placed prop is solid exactly when its
         own def is - solidity rides the object, not the type. Delete with it. */
      if (o.t === "prop") return !o.solid;
      if (!SOLID_TYPES.has(o.t)) return true;
      if (o.t === "door") return !!o.open;
      return false;
    }
    if (!world.walkableTile(x, z)) return false;
    const o = objAt(x, z);
    if (!o) return true;
    /* A rocky shore tile is a tile you can only *get to* by jumping: it is a
       flat decal over the river bed, so the walkable-tile rule above already
       refuses it, and this line keeps a route off it even if one is ever placed
       on dry ground. `actions.js#jumpToRocky` deliberately does not ask - a leap
       is not a route (see the props section). It is standable once you are on
       it, which is what `world.heightAt` gives it. */
    if (o.t === "rocky") return false;
    if (o.t === "furnace" && o.mouth) return true;
    /* SEVER (object-picker): a hand-placed prop is solid exactly when its
       own def is - solidity rides the object, not the type. Delete with it. */
    if (o.t === "prop") return !o.solid;
    if (!SOLID_TYPES.has(o.t)) return true;
    /* A tree stump is solid too: the cache sets the flag on all three stump
       models (stump_a/b/c), so a felled tree keeps the ground it stood on until
       it grows back - you cannot stand inside the stump any more than inside
       the trunk. It is the same footprint as the tree was (`fx`/`fz` on the
       object), so nothing new is closed off by the felling itself. */
    if (o.t === "door") return !!o.open;
    return false;
  };

  /* --- open the sealed tiles ------------------------------------------------
     Every prop is placed after the ground, so a prop can close a corner of
     walkable ground in on itself: four trees around a spawn, a barrel in a
     shop's own corner. A tile like that is a hole - nothing can stand on it and
     a creature whose spawn landed on one can never take a step, which stays
     silent until a player walks over to it and finds nothing there. The two
     holes the audit found were the churchyard's inner alcoves (before the
     graves in front of the crypts moved, Verac and Torag were fenced into the
     two tiles between their neighbours' headstones and the Food Store's north
     wall) and a barrel sealing the Clothes Shop's north-west corner. This pass
     is the general fix for the class: the next prop that happens to seal a tile
     is opened at boot rather than by hand.

     A pocket is worth opening when it holds something a player has business
     with - a spawn, a tile inside a building's footprint (a room's own corner),
     or any object that is not scenery (a grave, a door, a rock with ore in it) -
     or when it is `MIN_POCKET` tiles or more of open ground, which is a piece
     of the map rather than a crack between props. The pocket is opened one tile
     at a time by taking back the first `SCATTER_TYPES` prop along its edge, and
     the flood is redone after every removal, because the tile that just came
     free may still be another pocket's edge - a spawn ringed by trees is opened
     by carving a way out, a tree at a time, which is what a player would do with
     an axe. A pocket walled by stone or by water cannot be opened this way at
     all (the brothers' alcoves, before the fix above; the islets off the shore)
     and is left for tools/check-world.mjs to report. Both the flood and the walk
     order are fixed, so the carve is the same on every boot. */
  const carveDirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const passable = (x, z) => {
    /* Wall tiles join no region: ordinary walls are standable ground with
       sealed faces (see the note on `blocksStep`) while the ruin lowwall is
       solid again, but this flood models *sealed*, not *standable*, either
       way - exactly as when all walls were solid tiles. Letting the flood
       the flood step onto them would leak every room's region through its own
       panels and dissolve pocket detection (a pocket touching a wall would
       "hold" the wall object as content, and bare slivers would cross
       MIN_POCKET on wall tiles alone). Reachability of wall tiles themselves
       is by construction - every panel sits on an outer face, so every wall
       tile keeps an open inner face - and is covered live, not here. */
    const o = objAt(x, z);
    if (o && (o.t === "wall" || o.t === "lowwall")) return false;
    if (world.isWalkable(x, z)) return true;
    if (!o) return false;
    return o.t === "door";
  };
  const regionsOf = () => {
    const seen = new Int8Array(W * H);
    const out = [];
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        if (seen[i] || !passable(x, z)) continue;
        const q = [i];
        seen[i] = 1;
        const region = [];
        while (q.length) {
          const j = q.pop();
          region.push(j);
          const jx = j % W;
          const jz = (j / W) | 0;
          for (const [dx, dz] of carveDirs) {
            const nx = jx + dx;
            const nz = jz + dz;
            if (!inBounds(nx, nz)) continue;
            const k = idx(nx, nz);
            if (seen[k] || !passable(nx, nz)) continue;
            seen[k] = 1;
            q.push(k);
          }
        }
        out.push(region);
      }
    }
    return out;
  };
  const spawnTiles = new Set(spawns.map((s) => idx(s.x, s.z)));
  const roomTiles = new Set();
  for (const b of buildings) {
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) roomTiles.add(idx(x, z));
  }
  const worthOpening = (region) => {
    if (region.length >= MIN_POCKET) return true;
    for (const j of region) {
      if (spawnTiles.has(j) || roomTiles.has(j)) return true;
      const o = objAt(j % W, (j / W) | 0);
      if (o && o.t !== "door" && !SCATTER_TYPES.has(o.t)) return true;
    }
    return false;
  };
  /* One prop per pocket per round, then the whole map is flooded again: a
     carve of twenty trees is twenty rounds, but each round only ever takes one
     prop from each pocket in the way, so the cost is the longest carve times
     the flood, not the number of pockets. The bound is the map's own width -
     a carve cannot be longer than the map is wide without having arrived. */
  for (let round = 0; round < W + 8; round++) {
    const regions = regionsOf();
    if (regions.length < 2) break;
    regions.sort((a, b) => b.length - a.length);
    let carved = false;
    for (const region of regions.slice(1)) {
      if (!worthOpening(region)) continue;
      /* A region that is entirely Cairn Isle is unreachable overland and always
         will be: the strait between the two landmasses is not a prop, so there is
         nothing to carve and a round that picked one of the isle's own trees out
         of the way would achieve nothing except to delete that tree - once per
         round, for as many rounds as the pass is allowed, because the pocket is
         still separate afterwards. Asked of the region rather than of the prop
         the loop would pick next, because "can this pocket ever be reached at
         all" is the only question here. */
      if (region.every((j) => inIsleBox(j % W, (j / W) | 0))) continue;
      /* The new island, same as the isle above: unreachable overland by
         design, reached by portal - nothing to carve, so hands off. */
      if (region.every((j) => inNewIsleBox(j % W, (j / W) | 0))) continue;
      /* The tutorial island, same as both above: unreachable overland by
         design - nothing to carve, so hands off. */
      if (region.every((j) => inTutIsleBox(j % W, (j / W) | 0))) continue;
      region.sort((a, b) => a - b);
      let prop = null;
      for (const j of region) {
        const jx = j % W;
        const jz = (j / W) | 0;
        for (const [dx, dz] of carveDirs) {
          const o = objAt(jx + dx, jz + dz);
          if (o && SCATTER_TYPES.has(o.t)) {
            prop = [jx + dx, jz + dz];
            break;
          }
        }
        if (prop) break;
      }
      if (prop) {
        delObj(prop[0], prop[1]);
        carved = true;
      }
    }
    if (!carved) break;
  }

  /* ======================================================================
     Cairn Isle, part two: what stands on it (src/island.js#COURSE)

     The isle's *ground* is stamped up with the coast and the bank, but its
     contents are placed here, at the very end of the world, for the reason
     every other placement in this file is ordered the way it is: an object may
     only settle on ground that already exists, and on ground nothing else has
     claimed. Two things make this pass different from all of them:

       * the general scatter is kept off the whole isle (`noScatter`), so every
         tree, bush and prop on the island is planted here, by hand. There is no
         density function, no forest noise and no ore field out here - the isle
         is authored, all the way down;
       * it runs AFTER the sealed-tile carve above, not before it. The carve
         skips isle regions outright (`region.every(inIsleBox)`), so this is
         belt and braces - but a course obstacle is content, and content a
         flood-fill is allowed to delete is not content.

     An obstacle is stamped over its WHOLE footprint, tile by tile, the way the
     church's 2x1 altar is: every tile the model covers carries the same object,
     because that is what makes every one of them solid and every one of them
     clickable, and `scene.js#_coveredByLoc` is what stops the model being drawn
     once per tile. The object carries no `key` of its own - its TYPE is its
     baked loc key - so `setObj`'s tree handling (which is keyed off the type)
     must not see one, and does not: a course type is not a tree, a bush or a
     deadtree, so it takes the plain `objs.set` path.
  */
  for (const e of ALL_AGILITY) {
    /* A `keys` run is the ONE case where the object's own footprint is not the
       piece's: the run is built by REPEATING a one-tile model (the seven logs of
       a log balance, the eight segments of the canal's rope bridge), and every
       tile of it has to draw its own model - `_coveredByLoc` skips a `keys`
       object outright, and `_chunkLocs` places what it is given at the centre of
       the object's footprint. Leave `fx`/`fz` at the run's real length and all
       seven tiles push a matrix for the SAME position, so the crossing draws as
       seven logs stacked on one tile - which is what the tiles have always been
       told to do and is silent everywhere else. One tile of footprint per model,
       and the run is stamped by iterating the entry's own `e.fx`/`e.fz` below. */
    const o = { t: e.key, rot: e.rot || 0, fx: e.keys ? 1 : e.fx, fz: e.keys ? 1 : e.fz };
    /* The pieces that stand in water are drawn at the water's own surface (see
       scene.js#_chunkLocs): a loc's y otherwise comes from the ground under it,
       and under the strait that is the sea bed. */
    if (e.surf != null) o.surf = e.surf;
    /* `keys` marks an obstacle built from several models of the same object, so
       the tile's own hash picks which (the three log balances). The type stays
       the first of them, which is what the menu and the solidity read. */
    if (e.keys) o.keys = e.keys;
    for (let dz = 0; dz < e.fz; dz++) {
      for (let dx = 0; dx < e.fx; dx++) setObj(e.x + dx, e.z + dz, o);
    }
    for (const [dk, dx, dz, drot] of (e.decor || [])) setObj(dx, dz, { t: dk, rot: drot || 0 });
  }

  /* --- the pillars ---------------------------------------------------------
     Every plain "Pillar" and "Ruined Pillar" of the cache, standing on Cairn
     Isle (the user's ask: find them all and put them out here). One world
     type, `pillar`, with the baked key carried per tile (the bush pattern:
     `scene.js#_locSpec` draws `o.key`), so the isle holds the whole family -
     the hall set, the crystal-carrying ruined set, and the one-off stones -
     without a type per stone. They are placed BEFORE the wood below, so the
     hand-planted trees route around them; each placement skips an occupied or
     wet tile rather than forcing one. The south-shore avenue is the intact
     stones, the rims mix the rest, and the ruins' own point carries the
     ruined ring (see the ruins block - those six are placed with the ruins,
     not here). */
  const ISLE_PILLARS = [
    ["pillar_stone", 40, 184], ["pillar_d", 46, 184], ["pillar_f", 52, 184],
    ["pillar_b", 58, 184], ["pillar_stone_b", 64, 184], ["pillar_g", 70, 184],
    ["pillar_c", 95, 148], ["pillar_e", 95, 154], ["pillar_h", 95, 160],
    ["pillar_i", 95, 166], ["pillar_single", 95, 172],
    ["pillar_ancient", 30, 148], ["pillar_j", 30, 154], ["pillar_k", 30, 160],
    ["pillar_late_a", 30, 166], ["pillar_late_b", 30, 172],
  ];
  for (const [key, x, z] of ISLE_PILLARS) {
    if (objAt(x, z) || isWaterTile(x, z)) continue;
    setObj(x, z, { t: "pillar", key });
  }

  /* --- the trail ----------------------------------------------------------
     The course as a path: a worn dirt trail through the grass, from the landing
     round the lap to the gate (src/island.js#ROUTE). It is what turns a field
     of scattered obstacles into a course you can follow without being told
     where to go, and it is painted the way the town's streets are
     (`pathPaint`) - so it respects the water and the ground's own tiles - with
     one rule of its own: a tile something already stands on is left alone. A
     path under a net or across a log is not a path. */
  for (let i = 0; i < ROUTE.length; i++) {
    const [x1, z1] = ROUTE[i];
    const [x0, z0] = i ? ROUTE[i - 1] : ROUTE[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
    for (let k = 0; k <= n; k++) {
      const x = x0 + sx * k, z = z0 + sz * k;
      if (!inBounds(x, z) || objAt(x, z)) continue;
      pathPaint(x, z);
    }
  }

  /* --- the wood -----------------------------------------------------------
     The isle's trees, planted by hand because nothing scatters out here, and
     now planted on the isle's FRINGE rather than through its middle: the middle
     is the field (see src/island.js#PIECE), where 78 obstacles stand on a
     five-tile grid with two-tile corridors between them, and a tree dropped in
     a corridor is a tree the player has to walk around for no reason. So every
     seed below is on the isle's own edge - the west shore, the north and south
     beaches, the strip east of the canal, and the east lobe's outer rim - and
     the trees gather into a wood the field sits inside.

     Nothing stops a seed walking inland: `plantTreeNear` takes the nearest tile
     that fits, up to four tiles away. It is `treeFits` that keeps it out of the
     field, and it does it exactly: a tree needs a one-tile strip around its own
     footprint clear of OBJECTS, and every obstacle is one. A tree can therefore
     never stand in a corridor (both its neighbours are pieces), never on a
     piece's launch tile, and never on one of the canal crossings' shores -
     which is the whole of why the field's own ground can be left to the field.

     The kinds are the mainland's own - oak and plain tree mostly, with a couple
     of yews for the look of the place - and the hand-placed hp is three logs
     apiece, as it is in the town. `treeGround` is the same test the town's tree
     line uses (dry, empty, outside a building, clear of a doorway); the trail is
     added to it, so a tree never grows through the path a player is meant to
     follow. */
  const isleTreeGround = (x, z) => treeGround(x, z) || !inBounds(x, z) || tiles[idx(x, z)] === T.PATH;
  const ISLE_TREES = [
    /* the west shore */
    ["tree", 33, 145], ["oak", 33, 152], ["tree", 33, 160], ["oak", 33, 168],
    ["tree", 33, 175], ["oak", 34, 181], ["tree", 32, 138], ["yew", 34, 164],
    /* the north beach */
    ["oak", 40, 137], ["tree", 46, 136], ["oak", 55, 136], ["tree", 65, 136],
    ["oak", 70, 137], ["yew", 37, 143],
    /* the south shore */
    ["tree", 50, 184], ["oak", 58, 185], ["tree", 66, 184], ["oak", 72, 183],
    ["yew", 44, 182],
    /* east of the canal, between the crossings */
    ["oak", 84, 143], ["tree", 84, 151], ["oak", 84, 159], ["tree", 84, 167],
    ["oak", 84, 175], ["tree", 84, 183],
    /* the east lobe, and its own outer rim */
    ["oak", 86, 137], ["tree", 90, 137], ["tree", 96, 142], ["oak", 96, 150],
    ["tree", 97, 158], ["oak", 96, 166], ["tree", 97, 174], ["oak", 96, 181],
    ["oak", 88, 185], ["tree", 92, 184],
  ];
  for (const [kind, x, z] of ISLE_TREES) plantTreeNear(kind, x, z, 3, isleTreeGround, 4, 1);

  const holeSpots = [[33, 156], [32, 156], [34, 156], [33, 157], [33, 155], [34, 157], [32, 157], [34, 155], [35, 156], [31, 156]];
  let hole = null;
  for (const [hx, hz] of holeSpots) {
    if (objAt(hx, hz) || !world.isWalkable(hx, hz)) continue;
    hole = [hx, hz];
    break;
  }
  if (hole) {
    let back = null;
    for (const [bx, bz] of [[hole[0] + 1, hole[1]], [hole[0] - 1, hole[1]], [hole[0], hole[1] + 1], [hole[0], hole[1] - 1]]) {
      if (objAt(bx, bz) || !world.isWalkable(bx, bz)) continue;
      back = [bx, bz];
      break;
    }
    if (back) {
      setObj(hole[0], hole[1], { t: "ladder_down", to: [115, 157] });
      setObj(113, 157, { t: "ladder_up", to: back });
      placeProp("table", 116, 159, { rot: 0 });
      spawns.push({ type: "black_knight", x: 115, z: 158, radius: 1 });
      spawns.push({ type: "black_knight", x: 118, z: 158, radius: 1 });
      spawns.push({ type: "black_knight", x: 116, z: 161, radius: 1 });
    }
  }

  const KIN_MEM = [
    ["ladder_wood", 32, 142], ["ladder_old", 34, 144], ["ladder_ship", 31, 146], ["ladder_ship_b", 32, 148],
    ["manhole", 34, 150], ["manhole_b", 31, 152], ["manhole_c", 32, 154], ["trapdoor", 34, 158],
    ["trapdoor_b", 31, 160], ["trapdoor_c", 32, 162], ["trapdoor_d", 34, 164], ["trapdoor_e", 31, 166],
    ["hole", 32, 168], ["hole_b", 34, 170], ["dark_hole", 31, 172], ["staircase", 32, 174],
    ["staircase_b", 34, 176], ["stairs", 31, 178], ["stairs_b", 32, 180], ["iron_ladder", 34, 182],
    ["bamboo_ladder", 50, 137], ["copper_ladder", 58, 137], ["troll_ladder", 61, 137], ["secret_entrance", 67, 137],
    ["entrance", 73, 137], ["ruin_entrance", 76, 137], ["old_well", 79, 137], ["smokey_well", 52, 184],
    ["spikey_chain", 60, 184], ["bone_chain", 68, 184], ["rope_hang", 95, 152], ["vine_drip", 95, 168],
    ["ruin_entrance", 31, 143], ["old_well", 30, 147], ["iron_ladder", 31, 149],
  ];
  for (const [mesh, ax, az] of KIN_MEM) {
    for (const [sx, sz] of [[ax, az], [ax - 1, az], [ax, az + 1], [ax, az - 1], [ax + 1, az]]) {
      if (objAt(sx, sz) || !world.isWalkable(sx, sz)) continue;
      setObj(sx, sz, { t: "ladder_down", key: mesh, verb: "Climb-down", to: [115, 157] });
      break;
    }
  }

  /* The black nothingness the Kinshra Hideout sits in. The pocket used to be
     a small island in the sea; now the whole rock around the cave goes black:
     every tile of the box that is not the cave's own floor becomes VOID, its
     corners are lifted clear of the water plane so no sea renders over them,
     and anything the scatter left standing on them is cleared. The cave
     interior (walls, ladders, table, torches, spawns) is never touched, and
     the box stays clear of Cairn Isle's own box (x <= 106). */
  {
    const lift = waterLevel + 0.6;
    for (let z = 149; z <= 170; z++) {
      for (let x = 107; x <= 127; x++) {
        const i = z * cw + x;
        if (corner[i] < lift) corner[i] = lift;
        if (corner[i + 1] < lift) corner[i + 1] = lift;
        if (corner[i + cw] < lift) corner[i + cw] = lift;
        if (corner[i + cw + 1] < lift) corner[i + cw + 1] = lift;
      }
    }
    for (let z = 149; z <= 170; z++) {
      for (let x = 107; x <= 127; x++) {
        if (inKinshra(x, z)) continue;
        if (objAt(x, z)) delObj(x, z);
        tiles[idx(x, z)] = T.VOID;
      }
    }
  }

  /* --- the underbelly ------------------------------------------------------
     The dungeon far south, and deliberately NOT the Kinshra trick: no black
     void pocket nearby, but a teleport far away into a mass of buried dirt
     that fills the view to the walls in every direction. The whole box goes
     up to wall height as solid DIRTWALL, then the rooms and corridors are
     carved back down to floor height - so the dungeon reads as dug out of
     the ground, with solid earth overhead in every direction but up (and up
     is black sky, see the cave-sky test in src/game.js).

     Entry is a covered trapdoor on the grass south of the market, on the
     armour shop's block (a `ladder_down` swapping the cache's own flat red
     hatch for its upright open hatch, not the KIN_MEM convention) landing
     in the entry shaft; the shaft's
     own iron ladder climbs back to town. Layout: entry shaft, corridor, great
     hall
      with side rooms, south corridor, deep chamber. Spawns are an underground
      cast (skeletons, a mage, rats), not the surface table. */
  {
    const top = waterLevel + 3;
    const floorH = waterLevel + 0.3;
    for (let z = UNDER.z0; z <= UNDER.z1; z++) {
      for (let x = UNDER.x0; x <= UNDER.x1; x++) {
        const i = z * cw + x;
        if (corner[i] < top) corner[i] = top;
        if (corner[i + 1] < top) corner[i + 1] = top;
        if (corner[i + cw] < top) corner[i + cw] = top;
        if (corner[i + cw + 1] < top) corner[i + cw + 1] = top;
      }
    }
    const carve = (x0, z0, x1, z1) => {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = z * cw + x;
          corner[i] = floorH;
          corner[i + 1] = floorH;
          corner[i + cw] = floorH;
          corner[i + cw + 1] = floorH;
          if (objAt(x, z)) delObj(x, z);
          tiles[idx(x, z)] = T.ROCKGROUND;
        }
      }
    };
    carve(60, 430, 64, 434);
    carve(61, 435, 63, 442);
    carve(55, 443, 69, 453);
    carve(54, 445, 54, 448);
    carve(47, 444, 53, 449);
    carve(70, 445, 70, 448);
    carve(71, 444, 77, 449);
    carve(61, 454, 63, 459);
    carve(57, 460, 67, 466);
    for (let z = UNDER.z0; z <= UNDER.z1; z++) {
      for (let x = UNDER.x0; x <= UNDER.x1; x++) {
        if (tiles[idx(x, z)] === T.ROCKGROUND) continue;
        if (objAt(x, z)) delObj(x, z);
        tiles[idx(x, z)] = T.DIRTWALL;
      }
    }
    for (const [tx, tz] of [
      [60, 434], [64, 434], [64, 430],
      [55, 443], [69, 443], [55, 453], [69, 453],
      [57, 460], [67, 466], [47, 444], [77, 449],
    ]) {
      if (!objAt(tx, tz)) setObj(tx, tz, { t: "torch" });
    }
    for (const [tx, tz] of [[56, 444], [68, 452], [58, 452], [60, 464], [64, 461]]) {
      if (!objAt(tx, tz)) setObj(tx, tz, { t: "rock", ore: "none", empty: false });
    }
    setObj(60, 430, { t: "ladder_up", key: "iron_ladder", to: null });
    /* The second shaft's own end: the ascending ladder type - the same
       shop_ladder_up object as the ground-level ascending ladder in the
       store (not a descending-ladder type, and the sub-level factor is
       skipped) - at the deep chamber's south end, climbing back up beside
       it. Rungs north like the town end. */
    setObj(62, 466, { t: "ladder_up", key: "shop_ladder_up", verb: "Climb-up", rot: 2, to: [75, 83] });
    spawns.push({ type: "skeleton", x: 58, z: 448, radius: 1 });
    spawns.push({ type: "skeleton", x: 66, z: 448, radius: 1 });
    spawns.push({ type: "skeleton", x: 62, z: 463, radius: 2 });
    spawns.push({ type: "skeleton_mage", x: 64, z: 464, radius: 1 });
    spawns.push({ type: "giant_rat", x: 50, z: 446, radius: 2 });
    spawns.push({ type: "giant_rat", x: 74, z: 447, radius: 2 });
    const mouthSpots = [[73, 48], [72, 48], [74, 48], [73, 47], [72, 47], [74, 47]];
    let mouth = null;
    for (const [hx, hz] of mouthSpots) {
      if (objAt(hx, hz) || !world.isWalkable(hx, hz)) continue;
      mouth = [hx, hz];
      break;
    }
    if (mouth) {
      let back = null;
      for (const [bx, bz] of [[mouth[0] + 1, mouth[1]], [mouth[0] - 1, mouth[1]], [mouth[0], mouth[1] + 1], [mouth[0], mouth[1] - 1]]) {
        if (objAt(bx, bz) || !world.isWalkable(bx, bz)) continue;
        back = [bx, bz];
        break;
      }
      if (back) {
        setObj(mouth[0], mouth[1], { t: "ladder_down", key: "trapdoor_d", verb: "Climb-down", trapdoor: true, open: false, to: [62, 432] });
        const up = objAt(60, 430);
        if (up) up.to = back;
        mapIcons.push({ x: mouth[0], z: mouth[1], part: "mapfun51", name: "Underbelly" });
      }
    }
  }

  /* The new island's portals: the cache's own 1x1 essence swirl (loc 2492,
     "Portal", Use - src/actions.js#usePortal), standing on the grass two
     tiles west of the mouth and landing on the island's open turf, with its
     twin a few tiles east of the landing going back to the mouth's own side.
     Both ends are solid 1x1s answered from alongside; the island is blank
     grass and sand (see the stamp above), so both landings are open ground
     by construction. */
  setObj(71, 48, { t: "portal", key: "essence_portal", to: [63.5, 280.5], place: "the island" });
  setObj(66, 280, { t: "portal", key: "essence_portal", to: [72.5, 48.5], place: "the mainland" });

  /* The minigame dungeon: the underbelly's whole recipe a second time, south
     of the new island - a solid DIRTWALL mass with rooms carved back to floor
     height, torch-lit, entered by two covered trapdoor mouths on the island
     (the west (33,280) and east (94,280) tiles) and left by iron ladders back
     up beside them. What is NOT the underbelly's: the cast below goes to
     `mgSpawns`, never `spawns` - every runner raises a private copy on entry
     (src/minigame.js) - and nothing here respawns. The two shafts sit exactly
     61 tiles apart, the same distance as the two mouths, so each shaft's
     offset from its mouth matches the other's exactly: ladders (44,336) and
     (105,336) are both (+11,+56) from their mouths, landings (46,338) and
     (107,338) both (+13,+58) - the same congruency rule as the town pairing.
     Layout: two entry shafts, corridors joining a great hall with side rooms,
     a south corridor to a deep chamber. Ten bodies: five skeletons and a mage
     in the hall, rats in the sides and the deep room. */
  {
    const top = waterLevel + 3;
    const floorH = waterLevel + 0.3;
    for (let z = MINIGAME.z0; z <= MINIGAME.z1; z++) {
      for (let x = MINIGAME.x0; x <= MINIGAME.x1; x++) {
        const i = z * cw + x;
        if (corner[i] < top) corner[i] = top;
        if (corner[i + 1] < top) corner[i + 1] = top;
        if (corner[i + cw] < top) corner[i + cw] = top;
        if (corner[i + cw + 1] < top) corner[i + cw + 1] = top;
      }
    }
    const mgCarve = (x0, z0, x1, z1) => {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = z * cw + x;
          corner[i] = floorH;
          corner[i + 1] = floorH;
          corner[i + cw] = floorH;
          corner[i + cw + 1] = floorH;
          if (objAt(x, z)) delObj(x, z);
          tiles[idx(x, z)] = T.ROCKGROUND;
        }
      }
    };
    mgCarve(44, 336, 48, 340);
    mgCarve(105, 336, 109, 340);
    mgCarve(45, 341, 47, 348);
    mgCarve(106, 341, 108, 348);
    mgCarve(45, 347, 62, 349);
    mgCarve(92, 347, 108, 349);
    mgCarve(62, 349, 92, 359);
    mgCarve(50, 350, 57, 355);
    mgCarve(97, 350, 104, 355);
    mgCarve(75, 360, 77, 365);
    mgCarve(68, 366, 86, 371);
    for (let z = MINIGAME.z0; z <= MINIGAME.z1; z++) {
      for (let x = MINIGAME.x0; x <= MINIGAME.x1; x++) {
        if (tiles[idx(x, z)] === T.ROCKGROUND) continue;
        if (objAt(x, z)) delObj(x, z);
        tiles[idx(x, z)] = T.DIRTWALL;
      }
    }
    for (const [tx, tz] of [
      [44, 340], [48, 340], [48, 336],
      [105, 340], [109, 340], [109, 336],
      [52, 348], [102, 348],
      [63, 350], [91, 350], [62, 359], [92, 359],
      [50, 355], [104, 355],
      [68, 366], [86, 371],
    ]) {
      if (!objAt(tx, tz)) setObj(tx, tz, { t: "torch" });
    }
    /* The ways back up: each shaft's own iron ladder, climbing to the island
       tile beside its mouth (`mgOut` runs the minigame exit, not a plain
       climb - src/actions.js). */
    setObj(44, 336, { t: "ladder_up", key: "iron_ladder", mgOut: true, to: [34, 280] });
    setObj(105, 336, { t: "ladder_up", key: "iron_ladder", mgOut: true, to: [93, 280] });
    /* The ways down: the cache's own flat red plate, shut until opened
       (`mgIn` runs the minigame entry - src/actions.js). Closed lids offer
       Open only, exactly like the town mouth. */
    setObj(33, 280, { t: "ladder_down", key: "trapdoor_d", verb: "Climb-down", trapdoor: true, open: false, mgIn: true, to: [46, 338] });
    setObj(94, 280, { t: "ladder_down", key: "trapdoor_d", verb: "Climb-down", trapdoor: true, open: false, mgIn: true, to: [107, 338] });
    /* The record boards: a sign two tiles outside each mouth showing the top
       twenty (src/minigame.js#openMgBoard, via Read) - plus a third beside
       the arrival portal, so the board is in front of you the moment you
       land on the island. */
    setObj(31, 280, { t: "signpost", mgBoard: true });
    setObj(96, 280, { t: "signpost", mgBoard: true });
    setObj(64, 280, { t: "signpost", mgBoard: true });
    /* The private cast: ten bodies, hall-weighted. See `mgSpawns` above for
       why this is data and not spawns. */
    mgSpawns.push(
      { type: "skeleton", x: 68, z: 352, radius: 1 },
      { type: "skeleton", x: 78, z: 351, radius: 1 },
      { type: "skeleton", x: 86, z: 355, radius: 1 },
      { type: "skeleton", x: 72, z: 356, radius: 1 },
      { type: "skeleton", x: 82, z: 350, radius: 1 },
      { type: "skeleton_mage", x: 77, z: 353, radius: 1 },
      { type: "giant_rat", x: 57, z: 352, radius: 2 },
      { type: "giant_rat", x: 99, z: 353, radius: 2 },
      { type: "giant_rat", x: 73, z: 368, radius: 2 },
      { type: "giant_rat", x: 80, z: 369, radius: 2 },
    );
  }

  {
   const FAM = new Set([T.GRASS, T.GRASS_DARK, T.MARSH]);
   const FILL_OK = new Set([T.WATERBED, T.SAND, T.GRASS, T.GRASS_DARK, T.MARSH]);
   const smallDeco = (x, z) => {
     const o = objAt(x, z);
     if (!o) return false;
     if (o.t === "flowers") return true;
     if (o.t !== "bush") return false;
     return (o.key || bushKeyAt(x, z)) === "bush_small";
   };
   const reachOf = (x, z) => {
      const n = fbm(x * 0.02, z * 0.02, seed + 9241, 1);
      return 2 + (n > 0.55 ? 1 : 0) + (n > 0.72 ? 1 : 0);
    };
    const landFor = (x, z) => {
      const c0 = cornerAt(x, z), c1 = cornerAt(x + 1, z);
      const c2 = cornerAt(x, z + 1), c3 = cornerAt(x + 1, z + 1);
      const avg = (c0 + c1 + c2 + c3) / 4;
      const slope = Math.max(c0, c1, c2, c3) - Math.min(c0, c1, c2, c3);
      if (slope > 1.5) return T.GRAVEL;
      if (avg < waterLevel + 0.85) return hash01(x, z, 991) > 0.6 ? T.MARSH : T.GRASS_DARK;
      return fbm(x * 0.028, z * 0.028, seed + 400, 3) > 0.545 ? T.GRASS_DARK : T.GRASS;
    };
    const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const wdist = new Int16Array(W * H).fill(3000);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (tiles[idx(x, z)] === T.WATERBED) wdist[idx(x, z)] = 0;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = idx(x, z);
      if (wdist[i] === 0) continue;
      let m = 3000;
      if (x > 0 && z > 0 && wdist[i - W - 1] + 1 < m) m = wdist[i - W - 1] + 1;
      if (z > 0 && wdist[i - W] + 1 < m) m = wdist[i - W] + 1;
      if (x + 1 < W && z > 0 && wdist[i - W + 1] + 1 < m) m = wdist[i - W + 1] + 1;
      if (x > 0 && wdist[i - 1] + 1 < m) m = wdist[i - 1] + 1;
      if (m < wdist[i]) wdist[i] = m;
    }
    for (let z = H - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
      const i = idx(x, z);
      if (wdist[i] === 0) continue;
      let m = wdist[i];
      if (x + 1 < W && z + 1 < H && wdist[i + W + 1] + 1 < m) m = wdist[i + W + 1] + 1;
      if (z + 1 < H && wdist[i + W] + 1 < m) m = wdist[i + W] + 1;
      if (x > 0 && z + 1 < H && wdist[i + W - 1] + 1 < m) m = wdist[i + W - 1] + 1;
      if (x + 1 < W && wdist[i + 1] + 1 < m) m = wdist[i + 1] + 1;
      wdist[i] = m;
    }
    const ring = new Uint8Array(W * H);
    const stepOf = new Int16Array(W * H).fill(-1);
    const queue = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = idx(x, z);
      if (tiles[i] === T.WATERBED) { ring[i] = 1; stepOf[i] = 0; queue.push(i); }
    }
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h], s = stepOf[i], x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of N8) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const ni = idx(nx, nz);
        if (ring[ni] || !FILL_OK.has(tiles[ni])) continue;
        if (s + 1 > reachOf(nx, nz)) continue;
        ring[ni] = 1; stepOf[ni] = s + 1; queue.push(ni);
      }
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = idx(x, z), t = tiles[i];
      if (isBridgeArea(x, z) || (objAt(x, z) && !smallDeco(x, z))) continue;
      if (FAM.has(t) && ring[i]) tiles[i] = T.SAND;
      else if (t === T.SAND && !ring[i]) tiles[i] = landFor(x, z);
    }
    for (let pass = 0; pass < 8; pass++) {
      const snap = tiles.slice(), kill = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        if (snap[i] !== T.SAND || isBridgeArea(x, z) || (objAt(x, z) && !smallDeco(x, z))) continue;
        let n = 0;
        for (const [dx, dz] of N8) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          if (snap[idx(nx, nz)] === T.SAND) n++;
        }
        if (n <= 1) kill.push(i);
      }
      if (!kill.length) break;
      for (const i of kill) tiles[i] = landFor(i % W, (i / W) | 0);
    }
    {
      const snap = tiles.slice(), comp = new Int32Array(W * H).fill(-1);
      let nc = 0;
      const sizes = [], touchBridge = [], hasObj = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        if (snap[i] !== T.SAND || comp[i] >= 0) continue;
        const q = [i];
        comp[i] = nc;
        let n = 0, tb = false, ho = false;
        for (let h = 0; h < q.length; h++) {
          const j = q[h], jx = j % W, jz = (j / W) | 0;
          n++;
          if (isBridgeArea(jx, jz)) tb = true;
          if (objAt(jx, jz) && !smallDeco(jx, jz)) ho = true;
          for (const [dx, dz] of N8) {
            const nx = jx + dx, nz = jz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            const ni = idx(nx, nz);
            if (snap[ni] !== T.SAND || comp[ni] >= 0) continue;
            comp[ni] = nc; q.push(ni);
          }
        }
        sizes.push(n); touchBridge.push(tb); hasObj.push(ho); nc++;
      }
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z), c = comp[i];
        if (c < 0 || sizes[c] >= 5 || touchBridge[c] || hasObj[c]) continue;
        tiles[i] = landFor(x, z);
      }
    }
    {
      const snap = tiles.slice(), comp = new Int32Array(W * H).fill(-1);
      let nc = 0;
      const sizes = [], touchBridge = [], locked = [], touchSand = [], edge = [], hasObj = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        if (!FAM.has(snap[i]) || comp[i] >= 0) continue;
          const q = [i];
        comp[i] = nc;
        let n = 0, tb = false, lk = true, ts = false, eg = false, ho = false;
        for (let h = 0; h < q.length; h++) {
          const j = q[h], jx = j % W, jz = (j / W) | 0;
          n++;
          if (isBridgeArea(jx, jz)) tb = true;
          if (objAt(jx, jz) && !smallDeco(jx, jz)) ho = true;
          if (jx === 0 || jz === 0 || jx === W - 1 || jz === H - 1) { eg = true; lk = false; }
          for (const [dx, dz] of N8) {
            const nx = jx + dx, nz = jz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            const nt = snap[idx(nx, nz)];
            if (FAM.has(nt)) { if (comp[idx(nx, nz)] < 0) { comp[idx(nx, nz)] = nc; q.push(idx(nx, nz)); } continue; }
            if (nt !== T.WATERBED) lk = false;
            if (nt === T.SAND) ts = true;
          }
        }
        sizes.push(n); touchBridge.push(tb); locked.push(lk); touchSand.push(ts); edge.push(eg); hasObj.push(ho); nc++;
      }
      const minComp = Math.max(1, Math.round(25 * W * H / 65536));
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z), c = comp[i];
        if (c < 0 || sizes[c] >= minComp || touchBridge[c] || locked[c] || edge[c] || hasObj[c]) continue;
        tiles[i] = touchSand[c] ? T.SAND : T.GRAVEL;
      }
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = idx(x, z);
      if (!FAM.has(tiles[i]) || isBridgeArea(x, z)) continue;
      if ((x > 0 && tiles[i - 1] === T.WATERBED) || (x + 1 < W && tiles[i + 1] === T.WATERBED) ||
        (z > 0 && tiles[i - W] === T.WATERBED) || (z + 1 < H && tiles[i + W] === T.WATERBED)) tiles[i] = T.SAND;
    }
    for (let pass = 0; pass < 8; pass++) {
      const snap = tiles.slice(), kill = [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        if (!FAM.has(snap[i]) || isBridgeArea(x, z) || (objAt(x, z) && !smallDeco(x, z))) continue;
        if (x === 0 || z === 0 || x === W - 1 || z === H - 1) continue;
        let fam = 0, sand = 0;
        for (const [dx, dz] of N8) {
          const nt = snap[idx(x + dx, z + dz)];
          if (FAM.has(nt)) fam++;
          else if (nt === T.SAND) sand++;
        }
        if ((fam <= 1 && sand >= 2) || (fam <= 3 && sand >= 4 && pass === 0)) kill.push(i);
      }
      if (!kill.length) break;
      for (const i of kill) tiles[i] = T.SAND;
    }
  }

  /* The second shaft's town end: the shop's old floor-hatch ladder
     (ladder_wood) south of town, dimensionally placed so its offset from the
     mouth matches the dungeon end's offset from the shaft exit exactly:
     mouth (73,48) -> here (75,84) is (+2,+36), the same as exit (60,430) ->
     deep chamber (62,466). The tile was probed free - no object (so no
     wall), walkable, approachable on all four sides, outside any building.
     Rungs north (rot 2) toward its landing; `shaft` sculpts its 1x1 ground
     tile out into a dirt-walled pit (src/scene.js#_chunkGround), and the
     ladder stands with its floor-plate rim top-flush at grade (dy -0.125 =
     the rim's own height) the way the cache authors inset-floor ladders,
     the plate dyed grass-green to blend with the turf; the drop below is
     the inert second length. The cache model is 1.05 wide but
     the shaft is exactly 1.0, so it rides slightly slimmed (sx/sz draw
     scale, the stairs precedent) to clear the dirt walls. */
  /* --- the tutorial island's tropical lawn -----------------------------------
     Painted just before the jungle pass below (and after every repaint, so
     nothing overwrites it): the isle's GRASS/GRASS_DARK/MARSH all become
     TROP_GRASS, the lighter tropical underlayment. (MARSH included: a third
     of the isle's interior reads as marsh, and dark hollows would break the
     light lawn; nothing marsh-specific lives on the isle - the marsh-plant
     loop runs earlier and its objects stay put.) The jungle tests below
     accept all four classes either way. */
  for (let z = TUT_ISLE.z0; z <= TUT_ISLE.z1; z++) {
    for (let x = TUT_ISLE.x0; x <= TUT_ISLE.x1; x++) {
      if (!inBounds(x, z) || !inTutIsleBox(x, z)) continue;
      const i = idx(x, z);
      if (tiles[i] === T.GRASS || tiles[i] === T.GRASS_DARK || tiles[i] === T.MARSH) tiles[i] = T.TROP_GRASS;
    }
  }
  /* --- the tutorial island's jungle (END of build) --------------------------------
     Planted LAST (see below): the shoreline ring + breadth passes rewrite tile
     classes, so planting earlier reads pre-ring SAND and plants nothing.
     The island's own planting, since the general scatter keeps off it. Real
     cache jungle (user ask 2026-10-27): the trial-baked karamja set, not the
     procedural fan palm - jungle_tree_a, palm_a and banana_tree (all 2x2),
     palm_opt_c (1x1, survey-winning Tall Palm), palm_opt_d (1x1, Very Tall
     Palm: swollen ~22 mast almost to the top, short finishing taper, 1.2x
     crown) and jungle_bush_a (1x1). Very-Tall-heavy grove by user ask
     2026-10-30: six Very Tall slots against two Tall, one palm_a and one
     jungle, and the gates
     below plant roughly a third of the west grass and half of the east. Pad
     1 keeps the lanes walkable
     on a 14-wide island now that the wood is dense, the crown rule below
     keeps every tree's effective 3x3 clear of the next so no leaves
     interfere, and only grass takes trees so the beach stays open sand. Kind "jungle" carries no log table,
     so a Chop row answers the evergreen way ("You can't chop this tree.");
     the banana's Pick and the palm's Shake are examine-only here, the live
     game's own answer. */
  /* Very-Tall-heavy by user ask 2026-10-30: fill every remaining spot, six
     Very Tall slots against two Tall, one palm_a and one jungle per ten. */
  const JUNGLE_TREES = ["palm_opt_d", "palm_opt_d", "palm_opt_d", "palm_opt_d", "palm_opt_d", "palm_opt_d", "palm_opt_c", "palm_opt_c", "palm_a", "jungle_tree_a", "banana_tree"];
  /* Crown rule (user ask 2026-10-30): every cay tree owns an effective 3x3 -
     its footprint grown one tile in every direction (1x1 -> 3x3, 2x2 -> 4x4)
     - and two crowns may not share a tile. Cheap integer-box test against the
     trees this loop plants (seeded from any tree already standing, anchor
     tiles only so a 2x2 counts once). Bushes stay out of it: they are low,
     a crown rides over them. treeFits' pad strip still keeps trunks off
     bushes and wrecks on the four sides. */
  const jungleCrowns = [];
  const crownClear = (x, z, fx, fz) => {
    const ax0 = x - 1, ax1 = x + fx, az0 = z - 1, az1 = z + fz;
    for (const t of jungleCrowns) {
      if (ax0 <= t.x1 && t.x0 <= ax1 && az0 <= t.z1 && t.z0 <= az1) return false;
    }
    return true;
  };
  const crownClaim = (x, z, fx, fz) => jungleCrowns.push({ x0: x - 1, x1: x + fx, z0: z - 1, z1: z + fz });
  const plantJungleTreeNear = (x, z, test, radius = 3, pad = 0) => {
    const trySpot = (xx, zz) => {
      const key = JUNGLE_TREES[hashPick(xx, zz, 6105, JUNGLE_TREES.length)];
      const [fx, fz] = TREE_FOOT[key] || [1, 1];
      if (!treeFits(xx, zz, fx, fz, test, pad) || !crownClear(xx, zz, fx, fz)) return null;
      const o = plantTree(xx, zz, "jungle", 2, key);
      if (o) crownClaim(xx, zz, fx, fz);
      return o;
    };
    const hit = trySpot(x, z);
    if (hit) return hit;
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const o = trySpot(x + dx, z + dz);
          if (o) return o;
        }
      }
    }
    return null;
  };
  const plantJungleBushNear = (x, z, test, radius = 3) => {
    const fits = (xx, zz) => treeFits(xx, zz, ...(BUSH_FOOT.jungle_bush_a), test);
    if (fits(x, z)) return setObj(x, z, { t: "bush", key: "jungle_bush_a" });
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!fits(x + dx, z + dz)) continue;
          return setObj(x + dx, z + dz, { t: "bush", key: "jungle_bush_a" });
        }
      }
    }
    return null;
  };
  const tutJungleGround = (x, z) => {
    if (!inBounds(x, z) || !inTutIsleBox(x, z) || isWaterTile(x, z) || !!objAt(x, z)) return true;
    const t = tiles[idx(x, z)];
    return t !== T.GRASS && t !== T.GRASS_DARK && t !== T.TROP_GRASS && t !== T.MARSH;
  };
  /* --- the tutorial island's watering hole (user ask 2026-10-30) ------------
      An elongated irregular pond mid-island, carved BEFORE the planting loop
      so the jungle tests (grass only, never water or sand) keep every trunk
      and bush out of it. The audit demands sand against water (famTouchWater
      - the ring pass ran earlier), so the rim is laid by hand and the inner
      corners dipped to waterLevel - 0.25 so the banks slope. The debris
      scatter below skips the bounding box too. */
  const TUT_POND = { x0: 62, z0: 212, x1: 69, z1: 217 };
  /* Elongated irregular water: 7 wide at the middle row, ragged banks east
     and west, a narrow north arm, a south tail, and a sand notch cut into
     the south shore (x65,z215) - no symmetry anywhere. */
  const TUT_POND_WATER = new Set([
    "64,212", "65,212",
    "63,213", "64,213", "65,213", "66,213", "67,213",
    "62,214", "63,214", "64,214", "65,214", "66,214", "67,214", "68,214",
    "63,215", "64,215", "66,215", "67,215", "68,215",
    "64,216", "65,216", "66,216", "67,216",
    "65,217", "66,217",
  ]);
  {
    const pondRim = new Set();
    for (const k of TUT_POND_WATER) {
      const [wx, wz] = k.split(",").map(Number);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = wx + dx, nz = wz + dz;
          if (!inBounds(nx, nz)) continue;
          const nk = nx + "," + nz;
          if (!TUT_POND_WATER.has(nk)) pondRim.add(nk);
        }
      }
    }
    for (let z = TUT_POND.z0; z <= TUT_POND.z1; z++) {
      for (let x = TUT_POND.x0; x <= TUT_POND.x1; x++) {
        const k = x + "," + z;
        if (TUT_POND_WATER.has(k)) {
          const o = objAt(x, z);
          if (o) delObj(x, z);
          tiles[idx(x, z)] = T.WATERBED;
        } else if (pondRim.has(k)) {
          const o = objAt(x, z);
          if (o) delObj(x, z);
          tiles[idx(x, z)] = T.SAND;
        }
      }
    }
    /* Bank slope: a corner dips only where all four tiles sit inside the
       pond (water or rim). A rim tile fully enclosed by the pond (the sand
       notch) keeps all four of its corners at grade - dipping any of them
       would sink its centre under the wading plane the audit holds the
       banks to. */
    const enclosedSand = (x, z) => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nk = (x + dx) + "," + (z + dz);
          if (!TUT_POND_WATER.has(nk) && !pondRim.has(nk)) return false;
        }
      }
      return true;
    };
    for (let cz = TUT_POND.z0; cz <= TUT_POND.z1 + 1; cz++) {
      for (let cx = TUT_POND.x0; cx <= TUT_POND.x1 + 1; cx++) {
        const q = [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]];
        if (q.every(([qx, qz]) => TUT_POND_WATER.has(qx + "," + qz) || pondRim.has(qx + "," + qz)) &&
            q.every(([qx, qz]) => !(!TUT_POND_WATER.has(qx + "," + qz) && enclosedSand(qx, qz)))) {
          corner[cz * cw + cx] = waterLevel - 0.15;
        }
      }
    }
    world.tutPondRim = pondRim;
  }
  /* Standing-water lookup for the renderer (scene.js#_chunkWater): the
     pond's own tiles plus their sand rim, so the pond surface can replace
     the river water exactly inside the shoreline cuts. */
  world.tutPondWater = TUT_POND_WATER;
  for (let z = TUT_ISLE.z0; z <= TUT_ISLE.z1; z++) {
   for (let x = TUT_ISLE.x0; x <= TUT_ISLE.x1; x++) {
     const o = objAt(x, z);
      if (o && (o.t === "tree" || o.t === "deadtree") && o.ox === x && o.oz === z) {
        const [fx, fz] = TREE_FOOT[o.key] || [1, 1];
        crownClaim(x, z, fx, fz);
      }
    }
  }
  for (let z = TUT_ISLE.z0; z <= TUT_ISLE.z1; z++) {
    for (let x = TUT_ISLE.x0; x <= TUT_ISLE.x1; x++) {
      const t = tiles[idx(x, z)];
      if (t !== T.GRASS && t !== T.GRASS_DARK && t !== T.TROP_GRASS && t !== T.MARSH) continue;
      if (objAt(x, z)) continue;
      const gate = x < 36 ? 0.08 : 0.25;
      if (hash01(x, z, 6101) < gate * 2) {
        plantJungleTreeNear(x, z, tutJungleGround, 1, 1);
     } else if (hashPick(x, z, 6103, 14) === 0) {
        plantJungleBushNear(x, z, tutJungleGround, 1);
      }
    }
  }
  /* --- west banana swap + extra jungle (user ask 2026-10-30) ---------------
     The scatter above plants exactly one banana on the west grass (35,214):
     it becomes a jungle tree, a second jungle joins it nearby, and a few more
     go in around the island - all explicit jungle_tree_a (2x2, the banana's
     own foot), all through the same fits/crown gates, so nothing else moves. */
  const plantJungleKeyNear = (x, z, key, radius = 4, pad = 1) => {
    const [fx, fz] = TREE_FOOT[key] || [1, 1];
    const trySpot = (xx, zz) => {
      /* Never on the arrival lane: the scatter already crowds z213, and the
         walk-in starts there. */
      if (zz <= 213 && 213 < zz + fz) return null;
      /* Trunks keep the pad-1 breathing room and grass-only ground, but crowns
         may touch: the isle is full under the crown rule (one free 2x2 on the
         whole island), and a jungle clump reads as jungle. */
      if (!treeFits(xx, zz, fx, fz, tutJungleGround, pad)) return null;
      const o = plantTree(xx, zz, "jungle", 2, key);
      if (o) crownClaim(xx, zz, fx, fz);
      return o;
    };
    const hit = trySpot(x, z);
    if (hit) return hit;
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const o = trySpot(x + dx, z + dz);
          if (o) return o;
        }
      }
    }
    return null;
  };
  {
    const bw = objAt(35, 214);
    if (bw && bw.t === "tree" && bw.key === "banana_tree") {
      delObj(35, 214);
      const o = plantTree(35, 214, "jungle", 2, "jungle_tree_a");
      if (o) crownClaim(35, 214, 2, 2);
    }
    /* West second jungle first - due east of the swap, not on (31,214): that
       anchor is a writer clearing (the arranged-wreck EDITS delete by anchor,
       so anything planted there is lifted again). The pad drops to 0 for it
       alone, trunk to trunk with the swap. Then one per region eastward.
       Anchors are wishes, the spiral takes the nearest trunk-fitting grass;
       misses plant nothing. */
    plantJungleKeyNear(37, 214, "jungle_tree_a", 4, 0);
    for (const [jx, jz] of [[46, 209], [72, 214], [86, 216]]) {
      plantJungleKeyNear(jx, jz, "jungle_tree_a");
    }
  }

  /* --- the tutorial cay's pond dressing (user ask 2026-10-30, on the shore
     2026-10-30): Tall Reeds (loc 2944, non-solid) stand on the divided
     shoreline tiles - rim sand/grass with water across the edge - and Dock
     Leaf (loc 13434) floats inside them. Shore reeds ride the ground like
     drops (no surf); floaters ride the water level itself
     (scene.js#_chunkLocs) since _baseY under a water tile is the bed. All
     examine-only, and reeds ride t:"reeds" (their own walkable type -
     t:"bush" is solid ground cover here). */
  {
    for (const k of world.tutPondRim) {
      const [wx, wz] = k.split(",").map(Number);
      let shore = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (TUT_POND_WATER.has((wx + dx) + "," + (wz + dz))) { shore = true; break; }
      }
      if (!shore || objAt(wx, wz)) continue;
      if (wx === 65 && wz === 215) continue;
      if (hash01(wx, wz, 6151) < 0.7) setObj(wx, wz, { t: "reeds", key: "tall_reeds" });
    }
    for (const k of TUT_POND_WATER) {
      const [wx, wz] = k.split(",").map(Number);
      if (objAt(wx, wz)) continue;
      if (hash01(wx, wz, 6155) < 0.25) setObj(wx, wz, { t: "reeds", key: "dock_leaf", surf: 0.02 });
    }
  }
    /* --- the pond's isolated sand (user ask 2026-10-30) ----------------------
     The pond keeps its one connected sandmass (the east band, the largest
     pond-touching group); the isolated speckles - the west patches and the
     water-enclosed notch - become lawn. Bare tiles only, so nothing standing
     is ever taken. Runs before the dry nuts (which skip the pond
     neighbourhood anyway) and before the half-wet rule below. */
  {
    const seen = new Set(), groups = [];
    for (let z = TUT_ISLE.z0; z <= TUT_ISLE.z1; z++) {
      for (let x = TUT_ISLE.x0; x <= TUT_ISLE.x1; x++) {
        const k = x + "," + z;
        if (seen.has(k) || tiles[idx(x, z)] !== T.SAND) continue;
        const q = [[x, z]], comp = [];
        seen.add(k);
        while (q.length) {
          const [cx, cz] = q.pop();
          comp.push([cx, cz]);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, nz = cz + dz, nk = nx + "," + nz;
            if (!inBounds(nx, nz) || seen.has(nk) || tiles[idx(nx, nz)] !== T.SAND) continue;
            seen.add(nk);
            q.push([nx, nz]);
          }
        }
        groups.push(comp);
      }
    }
    const touchesPond = (comp) => comp.some(([cx, cz]) => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (TUT_POND_WATER.has((cx + dx) + "," + (cz + dz))) return true;
        }
      }
      return false;
    });
    const pondGroups = groups.filter(touchesPond);
    pondGroups.sort((a, b) => b.length - a.length);
    for (let gi = 1; gi < pondGroups.length; gi++) {
      for (const [cx, cz] of pondGroups[gi]) {
        if (!objAt(cx, cz)) tiles[idx(cx, cz)] = T.TROP_GRASS;
      }
    }
  }

  /* --- the tutorial island's beached ship -----------------------------------
     The Lady Lumbridge beat (user ask 2026-10-27, screenshot reference): no
     single "ship" loc exists in the cache, so she is assembled from the real
     part locs - two hull sections chained bow-to-stern, the tall mast and a
     short mast, the ship's wheel on the stern, a gangplank and a rowboat
     alongside - beached on the west-tip sand, not floating. Debris from the
     existing wreck bake (broken boats + fragments) litters the sand around
     her. Everything is t:"wreck": examine-only, solid over its own
     footprint, drawn from the bake (see scene.js#_locSpec). The arrival
     tile (28,213) stays clear: the composition is planted south of lane
     row z213, and the lane sweep below lifts stragglers. */
  {
    const sandAt = (x, z) =>
      inBounds(x, z) && inTutIsleBox(x, z) && !isWaterTile(x, z) && !objAt(x, z) &&
      (tiles[idx(x, z)] === T.SAND) && z !== 213;
    const fitsFoot = (x, z, fx, fz) => {
      for (let dz = 0; dz < fz; dz++)
        for (let dx = 0; dx < fx; dx++)
          if (!sandAt(x + dx, z + dz)) return false;
      return true;
    };
    /* A 7-wide 2-deep sand bed south of the lane, westernmost wins: three
       hull sections chained along X (bow west), masts and wheel riding the
       row behind them like deck furniture, gangplank and stern castle on
       the east end. One tile holds one object, so nothing overlaps. */
    let bed = null;
    for (let x = 24; x <= 60 && !bed; x++)
      for (let z = 208; z <= 219 && !bed; z++)
        if (z !== 213 && z + 1 !== 213 && fitsFoot(x, z, 7, 2)) bed = [x, z];
    const putWreck = (x, z, key, rot = 0) => {
      if (!inBounds(x, z) || objAt(x, z)) return false;
      setObj(x, z, { t: "wreck", key, rot });
      return true;
    };
    if (bed) {
      const [bx, bz] = bed;
      putWreck(bx, bz, "ship_hull_a", 0);
      putWreck(bx + 2, bz, "ship_hull_b", 0);
      putWreck(bx + 4, bz, "ship_hull_d", 0);
      putWreck(bx + 1, bz + 1, "ship_mast_tall", 0);
      putWreck(bx + 3, bz + 1, "ship_mast_a", 0);
      putWreck(bx + 5, bz + 1, "ship_wheel", 0);
      putWreck(bx + 6, bz, "ship_gang", 1);
      putWreck(bx + 6, bz + 1, "ship_hull_c", 0);
    }
    /* The rowboat rides the sand off the stern quarter. Near the ship first,
       anywhere on the island's sand as fallback. */
    let boatSpot = null;
    const bx0 = bed ? bed[0] : 24;
    const boatLand = (x, z) =>
      inBounds(x, z) && inTutIsleBox(x, z) && !isWaterTile(x, z) && !objAt(x, z) && z !== 213;
    const fitsBoat = (x, z) => {
      for (let dz = 0; dz < 3; dz++)
        for (let dx = 0; dx < 3; dx++)
          if (!boatLand(x + dx, z + dz)) return false;
      return true;
    };
    for (let x = Math.max(24, bx0 - 2); x <= Math.min(60, bx0 + 12) && !boatSpot; x++)
      for (let z = 208; z <= 220 && !boatSpot; z++)
        if (fitsFoot(x, z, 3, 3)) boatSpot = [x, z];
    if (!boatSpot)
      for (let x = Math.max(16, bx0 - 4); x <= Math.min(109, bx0 + 14) && !boatSpot; x++)
        for (let z = 205; z <= 223 && !boatSpot; z++)
          if (fitsBoat(x, z)) boatSpot = [x, z];
    if (boatSpot) putWreck(boatSpot[0], boatSpot[1], "ship_boat", 1);
    /* Debris field: broken-boat hulls + wreck fragments on open sand near
       the ship, hash-gated, never on the lane and never over an object. */
    const DEBRIS = ["broken_boat_a", "broken_boat_b", "broken_boat_c", "wreck_a", "wreck_c", "wreck2_01", "wreck2_12", "wreck2_20"];
    for (let z = TUT_ISLE.z0; z <= TUT_ISLE.z1; z++) {
      for (let x = TUT_ISLE.x0; x <= TUT_ISLE.x1; x++) {
        if (z === 213 || objAt(x, z) || isWaterTile(x, z)) continue;
        if (x >= TUT_POND.x0 && x <= TUT_POND.x1 && z >= TUT_POND.z0 && z <= TUT_POND.z1) continue;
        if (tiles[idx(x, z)] !== T.SAND) continue;
        if (hash01(x, z, 6141) > 0.035) continue;
        const key = DEBRIS[hashPick(x, z, 6143, DEBRIS.length)];
        const [fx, fz] = WRECK_FOOT[key] || [1, 1];
        if (!fitsFoot(x, z, fx, fz)) continue;
        putWreck(x, z, key, hashPick(x, z, 6145, 4));
      }
    }
    /* The tutorial hat: baked scenery at the east-beach sand (47,218),
       permanent per player (phase-gated client-side, never in the ledger).
       Displaces anything the debris scatter left there. */
    if (inBounds(TUT_HAT.x, TUT_HAT.z) && inTutIsleBox(TUT_HAT.x, TUT_HAT.z)) {
      const ho = objAt(TUT_HAT.x, TUT_HAT.z);
      if (ho) delObj(TUT_HAT.x, TUT_HAT.z);
      setObj(TUT_HAT.x, TUT_HAT.z, { t: "tut_hat", item: TUT_HAT.id });
    }
    /* Dry coconuts (user ask 2026-10-30, extended east + grass 2026-10-30):
       the Very Tall palms carry the fresh nuts up in their crowns now, so the
       ground gets the weathered kind - "Dry Coconut": full nuts (cache
       5974's model) and half-open shells (cache 5978's own shell model),
       re-skinned dark grey-brown with black cracks (dry-coconut-bake.mjs).
       Walkable, examine-only, like the reeds - sand or grass, never the
       lane, never the pond. The far-west one is gone by user ask. */
    {
      const dryGround = (x, z) =>
        inBounds(x, z) && inTutIsleBox(x, z) && !isWaterTile(x, z) && !objAt(x, z) && z !== 213 &&
        (tiles[idx(x, z)] === T.SAND || tiles[idx(x, z)] === T.GRASS || tiles[idx(x, z)] === T.GRASS_DARK ||
         tiles[idx(x, z)] === T.TROP_GRASS || tiles[idx(x, z)] === T.MARSH) &&
        !(x >= TUT_POND.x0 && x <= TUT_POND.x1 && z >= TUT_POND.z0 && z <= TUT_POND.z1) &&
        !(world.tutPondWater && world.tutPondWater.has(x + "," + z)) &&
        !(world.tutPondRim && world.tutPondRim.has(x + "," + z));
      /* Keepers from the first pass, minus the far-west one the user had
         removed - each re-checked, never displacing. */
      for (const [kx, kz, kk] of [[40, 216, "dry_coconut_shell"], [41, 208, "dry_coconut"], [43, 216, "dry_coconut_shell"]]) {
        if (dryGround(kx, kz)) setObj(kx, kz, { t: "tut_dry_coconut", key: kk });
      }
      /* A few more on the east side, full and shell alternating. */
      const spots = [];
      for (let z = 206; z <= 221; z++) {
        for (let x = 48; x <= 100; x++) {
          if (!dryGround(x, z)) continue;
          spots.push([x, z, hash01(x, z, 6173)]);
        }
      }
      spots.sort((a, b) => a[2] - b[2]);
      const DRY = ["dry_coconut", "dry_coconut_shell", "dry_coconut", "dry_coconut_shell", "dry_coconut"];
      for (let i = 0; i < DRY.length && i < spots.length; i++) {
        setObj(spots[i][0], spots[i][1], { t: "tut_dry_coconut", key: DRY[i] });
      }
    }
    /* The smugglers' cache (user ask 2026-10-30): a stone at the foot of the
       east bluff, sheltering the dark crack Scully remembers. First dry,
       empty land tile scanning the east side; the Search row (stage-gated in
       actions.js) holds the knife. Never displaces. */
    {
      const cacheGround = (x, z) =>
        inBounds(x, z) && inTutIsleBox(x, z) && !isWaterTile(x, z) && !objAt(x, z) && z !== 213 &&
        (tiles[idx(x, z)] === T.SAND || tiles[idx(x, z)] === T.GRASS || tiles[idx(x, z)] === T.GRASS_DARK ||
          tiles[idx(x, z)] === T.TROP_GRASS || tiles[idx(x, z)] === T.MARSH || tiles[idx(x, z)] === T.ROCK) &&
        !(x >= TUT_POND.x0 && x <= TUT_POND.x1 && z >= TUT_POND.z0 && z <= TUT_POND.z1) &&
        !(world.tutPondWater && world.tutPondWater.has(x + "," + z)) &&
        !(world.tutPondRim && world.tutPondRim.has(x + "," + z));
      let placed = false;
      for (let z = 206; z <= 222 && !placed; z++) {
        for (let x = 98; x <= 110 && !placed; x++) {
          if (cacheGround(x, z)) {
            setObj(x, z, { t: "tut_cache" });
            placed = true;
          }
        }
      }
    }
    /* Scully, the marooned teacher: a skeleton in a pirate hat, and otherwise
       just a skeleton (src/game.js#NPC_STATS, src/models/skully.json - the
       skeleton bake with the pirate's hat merged onto its head bone). He is
       buried IN the hat spot on the east beach (per-player phase: hidden until
       this player takes the hat, then standing on that same tile -
       src/actions.js#applyTutPhase), facing north up at the arrival lane, and
       never wanders (radius 0) - half-buried in the fiction, standing in the
       mechanics, since no buried pose exists. His Talk-to is his own
       (src/dialogue.js#NPC_TALK), his menu borrows the skeleton's def through
       the synthetic row in src/data/npc-cache-menus.json. */
    {
      let sk = null;
      if (inBounds(TUT_HAT.x, TUT_HAT.z) && inTutIsleBox(TUT_HAT.x, TUT_HAT.z)) sk = [TUT_HAT.x, TUT_HAT.z];
      if (!sk && bed) {
        const [bx, bz] = bed;
        for (let r = 1; r <= 4 && !sk; r++)
          for (let dz = -r; dz <= r && !sk; dz++)
            for (let dx = -r; dx <= r && !sk; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
              const x = bx + 3 + dx, z = bz + dz;
              if (z === 213 || !inBounds(x, z) || !inTutIsleBox(x, z)) continue;
              if (isWaterTile(x, z) || objAt(x, z) || tiles[idx(x, z)] !== T.SAND) continue;
              sk = [x, z];
            }
      }
     if (sk) spawns.push({ type: "scully", x: sk[0], z: sk[1], radius: 0, dir: Math.PI });
   }
    /* Cay beach life (user ask 2026-10-30): gulls working the beaches and
       crabs (cache npc 2706, combat 0, no actions - ambient wanderers, never
       targets) scuttling beside them. All cache, no custom motion. The gulls
       roam the whole island (user ask 2026-10-31: radius 100 covers the
       96-wide isle box from any home tile, so every gull can meet the east-
       point snakes). */
    spawns.push({ type: "seagull", x: 44, z: 216, radius: 100 });
    spawns.push({ type: "seagull", x: 50, z: 217, radius: 100 });
    /* Two of the seven gulls work the far eastern point instead - the snakes
       are out there with nothing to fight otherwise (user ask 2026-10-31:
       gulls-vs-snakes needs the species within meeting range). */
    spawns.push({ type: "seagull", x: 95, z: 213, radius: 100 });
    spawns.push({ type: "seagull", x: 92, z: 210, radius: 100 });
    spawns.push({ type: "seagull", x: 40, z: 215, radius: 100 });
    spawns.push({ type: "seagull", x: 58, z: 216, radius: 100 });
    spawns.push({ type: "seagull", x: 36, z: 212, radius: 100 });
    spawns.push({ type: "crab", x: 49, z: 216, radius: 2 });
    spawns.push({ type: "crab", x: 43, z: 219, radius: 2 });
    spawns.push({ type: "crab", x: 31, z: 210, radius: 2 });
    /* Two more crabs by Scully (user ask 2026-10-31), a middle-north-shore
       cluster, and a south-shore-west cluster. */
    spawns.push({ type: "crab", x: 45, z: 218, radius: 2 });
    spawns.push({ type: "crab", x: 51, z: 218, radius: 2 });
    spawns.push({ type: "crab", x: 58, z: 209, radius: 2 });
    spawns.push({ type: "crab", x: 61, z: 209, radius: 2 });
    spawns.push({ type: "crab", x: 29, z: 216, radius: 2 });
    spawns.push({ type: "crab", x: 32, z: 216, radius: 2 });
    /* East-side snakes (user ask 2026-10-31): three small ones on the far
       eastern point, off the tutorial path. noDrops, so these three drop
       nothing at all - no bones, no snakeskin (mainland snakes keep their
       table). They keep the mainland snake's temper (AGGRO range 3). */
    spawns.push({ type: "snake", x: 97, z: 212, radius: 3, noDrops: true });
    spawns.push({ type: "snake", x: 95, z: 211, radius: 3, noDrops: true });
    spawns.push({ type: "snake", x: 93, z: 213, radius: 3, noDrops: true });
 }
  /* The arrival lane: the island is fourteen tiles wide and the jungle can
     wall it clean across, so the audit's teleport link (28,213) would land in
     a sealed west pocket. Row z213 stays clear beach to jungle, x24 to x44 -
     any scattered tree or bush on it is lifted (the ship is planted off the
     row and the debris scatter skips it). */
  for (let x = 24; x <= 44; x++) {
    const o = objAt(x, 213);
    if (o && (o.t === "tree" || o.t === "bush" || o.t === "deadtree")) delObj(x, 213);
  }

  /* Writer-arranged wreck (picker grab-carry, 2026-10-28): the beached ship's
     pieces as the writer left them - moves (del at the baked spot + add at
     the new one), in-place rotations, and deletions. Applied last so nothing
     overwrites them. An add whose tile still holds another piece displaces
     it: the ghost preview only ever stood on free tiles, so anything in the
     way necessarily left during arranging. */
  {
    const EDITS = [
      { x: 32, z: 210, key: "ship_boat", del: true },
      { x: 34, z: 217, key: "ship_hull_c", del: true },
      { x: 28, z: 217, key: "ship_hull_c", del: true },
      { x: 33, z: 217, key: "ship_wheel", del: true },
      { x: 32, z: 215, key: "ship_wheel", del: true },
      { x: 29, z: 215, key: "ship_mast_tall", del: true },
      { x: 38, z: 217, key: "wreck2_12", del: true },
      { x: 41, z: 216, key: "wreck_c", del: true },
      { x: 45, z: 218, key: "wreck2_20", del: true },
      { x: 49, z: 218, key: "broken_boat_c", del: true },
      { x: 58, z: 221, key: "wreck2_01", del: true },
      { x: 87, z: 208, key: "wreck2_01", del: true },
      { x: 82, z: 209, key: "wreck_a", del: true },
      { x: 75, z: 208, key: "wreck_a", del: true },
      { x: 79, z: 210, key: "wreck_a", del: true },
      { x: 29, z: 212, key: "broken_boat_c", del: true },
      { x: 34, z: 213, key: "broken_boat_c", del: true },
      /* Cleared live by the writer (user session 2026-10-28): the bed's last
         mast plus the two trees flanking the arrival path. */
      { x: 31, z: 217, key: "ship_mast_a", del: true },
      { x: 29, z: 215, key: "tree_a", t: "prop", del: true },
      { x: 31, z: 214, key: "tree_a", t: "prop", del: true },
      /* The bed's own pieces the writer cleared (user session 2026-10-28):
         baked adds had displaced these originals, so dropping the adds
         resurrected them - these dels keep them gone. */
      { x: 28, z: 216, key: "ship_hull_a", del: true },
      { x: 30, z: 216, key: "ship_hull_b", del: true },
      { x: 29, z: 217, key: "ship_mast_tall", del: true },
      { x: 34, z: 216, key: "ship_gang", del: true },
      /* Original scatter under a cleared arranged piece (same story). */
      { x: 37, z: 216, key: "wreck_a", del: true },
      { x: 21, z: 202, key: "ship_boat", rot: 1 },
      { x: 47, z: 44, key: "ship_boat", rot: 1, surf: 0.17 }, // river by the tanner; surf floats the hull on the river plane instead of the bed
      { x: 46, z: 214, key: "wreck_a", rot: 0 },
      /* The broken boat by Scully, tipped off the shore edge (user request
         2026-10-28): a tile south so its stern hangs over the drop at z218,
         sunk a tile so it slumps over the edge. */
      { x: 32, z: 216, key: "broken_boat_c", rot: 0, dy: -1 },
    ];
    const dropFoot = (x, z) => {
      const o = objAt(x, z);
      if (!o) return;
      const fx = o.fx || 1, fz = o.fz || 1;
      const ox = o.ox != null ? o.ox : x, oz = o.oz != null ? o.oz : z;
      for (let dz = 0; dz < fz; dz++) {
        for (let dx = 0; dx < fx; dx++) {
          if (objAt(ox + dx, oz + dz) === o) delObj(ox + dx, oz + dz);
        }
      }
      delObj(ox, oz);
    };
    for (const e of EDITS) {
      if (!e.del) continue;
      const o = objAt(e.x, e.z);
      /* A del matches by key OR by anchor position: the log names what the
         writer grabbed, but a baked add may have displaced a different
         original underneath, so the key on a cleared tile can't be trusted.
         Safe: dels run before adds, and none of these tiles anchors a keeper. */
      if (o && (o.key === e.key || (o.ox ?? e.x) === e.x && (o.oz ?? e.z) === e.z)) dropFoot(e.x, e.z);
    }
    for (const e of EDITS) {
      if (e.del) continue;
      const cur = objAt(e.x, e.z);
      if (cur && cur.key === e.key) { cur.rot = e.rot; if (e.surf != null) cur.surf = e.surf; if (e.dy != null) cur.dy = e.dy; continue; }
      if (cur) dropFoot(e.x, e.z);
      setObj(e.x, e.z, { t: "wreck", key: e.key, rot: e.rot, ...(e.surf != null ? { surf: e.surf } : {}), ...(e.dy != null ? { dy: e.dy } : {}) });
    }
  }

  setObj(75, 84, { t: "ladder_down", key: "ladder_wood", verb: "Climb-down", rot: 2, dy: -0.125, sx: 0.88, sz: 0.9, shaft: true, to: [62, 465] });

  /* --- water-majority tiles are unwalkable (user ask 2026-10-30) -----------
     Any tile more than half water refuses steps: the exact contour water area
     (same cuts the renderer draws, at the river's own threshold), tile by
     tile over the whole map. Fully-submerged non-waterbed tiles count too.
     Runs last, after every tile write, so the set is final; walkableTile
     reads it (bridge decks exempt there). */
  world.halfWet = (() => {
    const s = new Set();
    const thr = waterLevel + 0.04;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, z);
        const t = tiles[i];
        if (t === T.WATERBED || t === T.VOID || t === T.DIRTWALL || t === T.BRIDGE) continue;
        const h00 = cornerAt(x, z), h10 = cornerAt(x + 1, z), h01 = cornerAt(x, z + 1), h11 = cornerAt(x + 1, z + 1);
        const cut = contourTile(h00, h10, h01, h11, thr);
        if (!cut.water.length) {
          if (h00 < thr && h10 < thr && h01 < thr && h11 < thr) s.add(i);
          continue;
        }
        let a = 0;
        for (const loop of cut.water) {
          let q = 0;
          for (let k = 0; k < loop.length; k++) {
            const A = loop[k], B = loop[(k + 1) % loop.length];
            q += A[0] * B[1] - B[0] * A[1];
          }
          a += Math.abs(q) / 2;
        }
        if (a / 4 > 0.5) s.add(i);
      }
    }
    return s;
  })();

  /* Ocean vs river (user ask 2026-10-30): the sea is the one water body that
     touches the map border - every other water tile is a river, lake or pond.
     Baked once, after every tile write, so the set is final. Read by the
     troll event (river trolls rise only from non-ocean water) via isOceanTile
     below; the renderer does not need it. */
  world.oceanTiles = (() => {
    const s = new Set();
    const q = [];
    const push = (x, z) => {
      if (x < 0 || z < 0 || x >= W || z >= H) return;
      const i = idx(x, z);
      if (tiles[i] !== T.WATERBED || s.has(i)) return;
      s.add(i);
      q.push(i);
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let z = 0; z < H; z++) { push(0, z); push(W - 1, z); }
    while (q.length) {
      const i = q.pop();
      const x = i % W, z = (i / W) | 0;
      push(x + 1, z); push(x - 1, z); push(x, z + 1); push(x, z - 1);
    }
    return s;
  })();

  return world;
}

/* Ground-decor decals (v37): the osws DECOR set — daisy, tuft, pebble,
   litter, stone, shell, mushroom, sprig — plus the cay's own beach-life
   row (starfish, cockle shell: hand-drawn for the tutorial island, user
   ask 2026-10-30 — the one custom art this pass allows) as flat
   renderer-side quads, NOT map objects. Deterministic pure function of
   (tile, tile class): drift-clumped odds (two-octave smooth noise, bare
   ground between drifts, never a lattice), SNAP-NODE placement (v39c:
   center on one of the inner 9 nodes of the tile's halves+quarters
   25-node subdivision, quarter-turn rotation about its own center), 3 SNAP
   SIZES (mean 0.085 = half the old 0.11-0.23 mean; min 25% under / max 25%
   over the mean), +0.03 above the bilinear ground, tinted by the tile's own
   light (brightness ratio only — the art keeps its hue). Same transparent
   layer discipline as the other ground overlays (lifted, no depth write,
   one merged mesh per chunk). No collision, no footprint, no world.json
   entry, no tile or corner changes. Pools are per OUR classes:
   grass/dark = their grass pool MINUS the mushroom (v39: the flat red
   mushroom is retired — a 3D ring stands in its place, see TUT_SHROOM),
   sand = pebble/shell/sprig cells of the same atlas (v38 contract),
   gravel, dirt, rock, marsh — except on the tutorial cay, where the sand
   pool is the beach-life one (shells + starfish, scene.js#_groundDecor).
   Shore-cut and underwater tiles get none (clipped surfaces), steep tiles
   none (a flat quad can't lie on a gorge wall). Atlas:
   src/sprites/decor-atlas.png (4x3: the 8 osws cells, green keyed out,
   plus the cay's starfish + cockle row). */
export const TUT_DECOR = {
  on: true,
  pools: {
    0: [0, 1, 3, 7],
    1: [0, 1, 3, 7],
    9: [7, 3, 1],
    16: [0, 1, 3, 7],
    4: [2, 5, 7],
    10: [2, 4, 3, 7],
    2: [1, 3, 0, 7],
    8: [4, 2, 4, 2],
  },
  savPool: [1, 3, 1, 4, 3, 1, 4, 0],
  tundraPool: [4, 2, 3, 4, 2, 3, 4, 7],
  desertPool: [4, 2, 4, 2, 4, 2, 3, 3],
  junglePool: [7, 1, 3, 7, 1, 7, 3, 1],
  forestPool: [3, 1, 7, 3, 1, 7, 1, 3],
  volcPool: [4, 2, 3, 4, 2, 4, 2, 3],
  snowPool: [4, 2, 3, 4, 2, 3],
  rate: 1,
  /* Bigger ground decals (user ask 2026-10-30: starfish and shells were too
     small to see): 7 standard snaps from 1.2x the old default (0.085) to
     2.4x the old max (0.106), RNG-picked per tile as before. */
  sizes: [0.102, 0.127, 0.153, 0.178, 0.204, 0.229, 0.254],
  slopeMax: 0.5,
  cut: [
    [0.0801, 0.1680, 0.1699, 0.3320, 1, 0.9130],
    [0.3145, 0.1406, 0.4336, 0.3555, 1, 0.9032],
    [0.5625, 0.1445, 0.6836, 0.3477, 1, 0.8413],
    [0.8262, 0.1875, 0.9199, 0.3047, 1, 0.6327],
    [0.0996, 0.7031, 0.1484, 0.7891, 1, 0.8846],
    [0.3535, 0.7148, 0.3945, 0.7813, 1, 0.8182],
    [0.6094, 0.7148, 0.6387, 0.7773, 0.9412, 1],
    [0.8535, 0.7031, 0.8926, 0.7930, 0.875, 1],
  ],
  /* The cay's beach-life row (user ask 2026-10-30): starfish + cockle shell,
     bottom row of the 4x3 atlas, full-cell cuts. Claimed only by the
     island beach pool in scene.js#_groundDecor - nowhere else. */
  beachCut: [
    [0, 0.6667, 0.25, 1, 1, 0.9],
    [0.25, 0.6667, 0.5, 1, 1, 1],
  ],
  /* The island sand pool: shells first, starfish + cockle alongside, one
     pebble for variety. Index 8/9 address beachCut above (cut index =
     cut.length + beach index - see scene.js#_groundDecor). */
  /* The island sand pool (user ask 2026-10-30: more starfish + seashells):
     starfish and cockle shell dominate, one mainland shell and one pebble
     for variety. Index 8/9 address beachCut above (cut index = cut.length +
     beach index - see scene.js#_groundDecor). */
  beachPool: [8, 9, 8, 5, 9, 8, 9, 2, 8, 9],
  /* The cay's beaches get decals far more often than mainland sand: the
     density gate below is multiplied by this on island sand. */
  beachRate: 1.87,
};

/* Red-cap mushrooms (v39): the flat mushroom decal (cell 6) never looked
   right, so it stands no more — in its place a small Amanita muscaria
   ring grows on the grass to the geometric spec (v39b): paraboloid cap
   (h = 0.7r, sharp planar rim), geometric veil warts riding the surface
   (apex-dense), real gill-fin geometry under the cap, cream stem.
   Renderer-side like the decals (deterministic pure function of tile:
   density roll, offset, yaw and 1-of-3 size snaps are all hash-seeded,
   so rebuilds and the stream window agree exactly). Same gates as the
   decals (dry, gentle slopes only) on the grass-family classes the flat
   mushroom used to haunt (0/1/9). OPAQUE solids (own chunk meshes, depth
   on) — no lift, no renderOrder games. No collision, no footprint, no
   tile/corner writes: walkable decor. Mainland divergence: singles are
   retired — each winning tile grows a small fairy ring of 5-7 (ring
   count/radius hash-seeded, salts 5721/5722), so the red-caps read as one
   circle, never scatter. */
export const TUT_SHROOM = {
  on: true,
  classes: [0, 1, 9, 16],
  density: 0.025,
  circleDensity: 0.0005,
  stemH: 0.12,
  stemR: 0.016,
  capR: 0.06,
  capRed: 0xb83322,
  stemCream: 0xe8dcc0,
  sizes: [0.75, 1.0, 1.25],
};
