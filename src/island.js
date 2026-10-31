/* ===========================================================================
   island.js - Cairn Isle: a second landmass in the world's own sea, and the
   agility course that stands on it.

   The world has always been one island: 128x128 tiles (`src/world.js#W`, `#H`),
   one coast, one town. The user's ask (2026-09-25) is a new area "accessible via
   a teleport of your choosing ... i dont want it in the existing area though it
   can be its own large island for all i care", so the world's map is now
   **taller** - `H` is 192, not 128 - and the 64 rows the old map did not have
   are open sea with a second island in them. `MAIN_H` (also in world.js) is the
   old 128, and every rule that measures the *authored* world against its border
   is written against that number rather than against `H`, so the shape the
   mainland has had since the first commit is bit-for-bit what it always was.
   The map grew; the world did not move.

   This file is the isle's own geography and its course layout, split out of
   world.js because neither half is a terrain rule: the profile below is one
   island's authored shape, and `COURSE` is a list of obstacles with levels and
   experience on them, which `src/world.js` reads to place their models and
   `src/actions.js` reads to run them. Everything here is pure data and pure
   functions - no world, no scene, no game - so both of those can import it
   without dragging anything in.

   --- the isle's ground ----------------------------------------------------

   An island in this world is a *height field*, exactly as the mainland's coast
   is (see world.js's note on the coast): the ground is measured from the
   waterline, low near the shore and high inland, and world.js's tile classifier
   turns a height into sand, grass or water by the same rules it applies to every
   other tile on the map. So the isle is authored here as one number per tile -
   "metres above the waterline" - rather than as a list of tiles to paint, and it
   then gets a beach, a grass plateau and a shoreline because the shared
   classifier says it does. The three pieces are:

     * `isleProfile(d)` - the shape as a function of distance from the isle's
       centre, in metres above the waterline: a plateau, a slope, a beach shelf,
       then a fall to the sea bed.
     * `isleDistance(x, z, seed)` - that distance, with a low-frequency wobble on
       it so the shore runs in bays and points instead of being a circle.
     * `ISLE.reach` - how far the profile's blend runs before it hands back to
       the sea bed the surrounding ocean already has. Past this the isle does not
       exist as far as world.js is concerned and the corner keeps its own value,
       which is what makes the seam between isle and ocean invisible.

   The blend matters at both ends: at `reach` the authored height and the ambient
   sea bed are the same number, so there is no step in the terrain at the edge of
   the stamped box - and no step means no seam at the bottom of the sea.
*/

import { clamp, lerp, smoothstep, fbm } from "./util.js";

/* Where the isle is and how big it is.

   The shape it is measured on is a **squared-off ellipse**, not a circle, and
   that is the whole of the 2026-09-25 rebuild. The first cut of this island was
   a round dome with a crag, a knoll, a mere and a wandering gully on it, and the
   user's verdict was blunt: *"that's a complete disaster ... i dont know why you
   made it so hilly ... how about you just make it a flat field for now"*. So the
   ground is now ONE flat plateau - no knoll, no crag, no dips - and the only
   thing cut into it is the canal that splits it in two, which the water
   obstacles need and which a flat field does not mind.

   `rx`/`rz` are the two semi-axes of that squared ellipse. They are separate
   numbers rather than one `land` radius because the island wants to be wide and
   short: `W` is 128 tiles but the map is only 64 rows taller than the mainland,
   so the isle's north-south room is the scarce one. A 4th-power superellipse
   (`isleDistance`) rather than an ellipse proper, because a grid of obstacles
   needs a field with **corners** - a true ellipse would put the north-west and
   south-east corners of the field in the sea.

   `cz` and the box are not free either: the isle's stamped box (centre +/-
   `boxX`/`boxZ`) must not touch the mainland's coast rows or the bank-lift pass
   would see the isle's ground while it was still finishing the mainland's south
   shore. The mainland's last tile row is 127, so the box's north edge is pinned
   at 130; the map's last corner row is 192, so its south edge is pinned at 192.
   `boxZ` 31 with `cz` 161 gives exactly 130..192, and `boxX` is free (the map is
   far wider than the isle) at 42: x 22..106. */
export const ISLE = {
  name: "Cairn Isle",
  cx: 64,
  cz: 161,
  rx: 36,
  rz: 26,
  /* Where the authored profile starts blending back into the ocean's own sea
     bed. Inside `land + 4` the authored ground is exact; past `reach` the corner
     keeps the value the coast pass gave it. 28 is the largest this may be: the
     stamp box is `cz +/- boxZ` = 130..192, and the box has to be at least
     `reach` plus the wobble's own 2.25 tiles. */
  land: 22,
  reach: 28,
  /* The stamp box, in tiles. `boxZ` is pinned by the map (see above); `boxX` is
     whatever the island actually spans. world.js's stamp pass and `inIsleBox`
     both read these, so the box and the ground can never disagree. */
  boxX: 42,
  boxZ: 31,
  /* Where the teleport drops the player: the middle of the field's north shore,
     one tile in from the sand, with the way home (the portal) a couple of tiles
     east. Read through the spell row in src/magic.js. */
  landAt: [48.5, 142.5],
  /* What the return portal does: the mainland tile it puts you on. The
     crossroads outside the Lumbridge-fork bank's own door - the bank's door
     steps out at (62, 55) and the town's east-west street runs along z 56-57,
     so this is the pavement two tiles south of the step. */
  exitAt: [62.5, 58.5],
};

/* The profile: distance from the centre -> metres above the waterline. Control
   points rather than one formula, because two separate shapes are wanted and
   each is easier to read as a number than as a curve:

     0 .. 21.5   the plateau. This is the whole point of the rebuild - one flat
                 field, ~4.4 m above the waterline, with no relief on it at all
                 beyond a 25 cm breath of noise. The obstacles stand on this.
     21.5 .. 24.5 the shore shelf: the grass steps down to just above the sand.
     24.5 .. 28  the fall to the sea bed, steep on purpose - it is under water
                 and never seen, and it ends on the bed's own depth so the blend
                 to the ambient ocean has nothing left to do.

   The plateau's 4.4 m is not decoration. Sand is every tile below **2.3 m** -
   the isle's whole neighbourhood reads as "coast" to the tile classifier (it is
   measured against the mainland's border, which is nowhere near it), so the
   beach line is a height and the height is the only lever on how much of the
   isle is grass. The old 5.2 m plateau was fine; what was wrong was everything
   ON it. */
const PROFILE = [
  [0, 4.4], [21.5, 4.4], [24.5, 1.9], [28, -5.6],
];

/* The metres-above-waterline profile at a distance, smoothstepped between the
   control points so the ground has no crease at any of them. */
export function isleProfile(d) {
  if (d <= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) {
    const [d0, h0] = PROFILE[i - 1];
    const [d1, h1] = PROFILE[i];
    if (d <= d1) return lerp(h0, h1, smoothstep(d0, d1, d));
  }
  return PROFILE[PROFILE.length - 1][1];
}

/* "Distance from the isle's centre", in tile-equivalent units, with the
   shoreline wobble folded in.

   The shape is a **4th-power superellipse**: `(dx/rx)^4 + (dz/rz)^4`, taken to
   the quarter power and scaled by `rz`, so the answer is in the same units as
   `isleProfile`'s control points. The 4th power is what makes the island a
   squared-off blob rather than a disc - the field's corners are real corners,
   which is what lets a grid of obstacles be laid out on it - while still
   rounding the four edges enough to read as a landmass rather than as a
   rectangle of terrain dropped in the sea.

   The wobble is unchanged from the first cut, and it is the whole difference
   between a coastline and a cut-out: `fbm` at a wavelength of about eighteen
   tiles moves the shore in and out by up to four tiles, so the coast has
   headlands, bays and one or two coves. It is applied to the *distance* rather
   than to the height, so the beach shelf and the profile's own shape travel with
   the coast instead of a shelf being carved off the side of a blob. */
export function isleDistance(x, z, seed) {
  const dx = Math.abs(x - ISLE.cx) / ISLE.rx;
  const dz = Math.abs(z - ISLE.cz) / ISLE.rz;
  const shape = Math.pow(dx * dx * dx * dx + dz * dz * dz * dz, 0.25) * ISLE.rz;
  const wobble = (fbm(x * 0.04, z * 0.04, seed + 3300, 3) - 0.5) * 4.5;
  return shape + wobble;
}

/* The isle's own height field, as world.js's corner value.

   `waterLevel` is the world's sea level (world.js#createWorld measures it before
   it stamps anything) and `ambient` is the value the corner already has - the
   sea bed the coast pass left there. Inside the isle the corner becomes the
   waterline plus the profile; outside `reach` it is left exactly as it was; in
   between the two are blended, so the isle rises out of the ocean it is standing
   in rather than being dropped on top of it. */
export function isleHeight(x, z, waterLevel, seed, ambient) {
  const d = isleDistance(x, z, seed);
  if (d >= ISLE.reach) return ambient;
  const p = isleProfile(d);
  /* How much of this tile is *land* rather than shore or sea bed: 0 at the
     waterline, 1 from 2.2 m up. It scales both the micro-relief and the
     authored features, which is what keeps a knoll off the beach and stops the
     gully from cutting a trench through the sand. */
  const land = clamp(p / 2.2, 0, 1);
  /* Micro-relief: a breath of undulation on the plateau and the slope, and none
     at all on the beach or the sea bed, or the shoreline breaks into puddles.
     It is 25 cm because the user asked for a FLAT field: the first cut's 1.2 m
     of noise is what made a "plateau" read as rolling ground, and the whole
     point of this pass is that a player can see the ground the obstacles stand
     on is level. It is kept at all (rather than set to zero) so the field is not
     a perfect plane, which reads as a bug at this scale. */
  const relief = (fbm(x * 0.06, z * 0.06, seed + 9100, 2) - 0.5) * 0.5 * land;
  const authored = waterLevel + p + relief + isleFeatures(x, z, land);
  const w = 1 - smoothstep(ISLE.land + 4, ISLE.reach, d);
  return lerp(ambient, authored, w);
}

/* The one thing cut into the field: the **canal**.

   A flat field has no water on it, and half the agility kit - the rope swings,
   the rope bridge, the log balances, the stepping stones, the monkeybars - is
   defined by what it crosses. So the island is split in two by a straight
   north-south channel just east of the field: water on both banks, a crossing
   from either side, and the east lobe beyond it as somewhere to come out.

   Its numbers are all chosen so the banks stay GRASS and SAND. The tile
   classifier calls any tile whose corners differ by more than 1.5 m `GRAVEL`,
   and a gravel bank is a rocky gorge - which is the "hilly" the user objected
   to, in a different costume. A smoothstep rim of half-width 7.5 dropping 5.8 m
   has a steepest gradient of 1.5 x 5.8 / 7.5 = 1.16 a tile, and the tiles it
   passes through steepest are already below the 2.3 m sand line (so they are
   sand before the steepness test is ever reached). The result, measured on the
   built world: water at x 76..79, sand at 74..75 and 80..81, grass from 73 west
   and 82 east.

   `depth` is measured from the *plateau*, and the `lowland` factor is the same
   trick the old gully used: near the shore, where the profile has already fallen
   toward the waterline, the cut is scaled down so it does not dig a trench out
   through the beach - while still always cutting enough to reach water, which is
   what keeps the channel continuous from the north shore to the south. */
const CANAL = { x: 78, half: 7.5, depth: 5.8 };

function isleFeatures(x, z, land) {
  const d = Math.abs(x - CANAL.x);
  if (d >= CANAL.half) return 0;
  const lowland = 0.55 + 0.45 * land;
  return -CANAL.depth * smoothstep(CANAL.half, 0, d) * lowland;
}

/* Is this tile in the isle's neighbourhood at all? Read by world.js for the two
   places the isle has to be *excluded* rather than built: the general scatter is
   kept off the whole isle (its scenery is placed by hand), and the sealed-tile
   carve must not try to walk the sea bed out to the mainland - an unreachable
   island is one whose pockets can never be opened, so carving at them would just
   eat the isle's scenery one prop at a time.

   A bounding box rather than `isleDistance`, because both callers want a cheap
   answer and both want it *conservative*: a few sea tiles either side of the
   isle being called "isle" costs nothing (nothing is scattered there and no
   region is entirely inside the box that should not be). The box is the stamp
   box exactly (`ISLE.boxX`/`boxZ`), so "inside the isle's neighbourhood" and
   "inside the ground the isle authored" are the same question. */
export function inIsleBox(x, z) {
  return Math.abs(x - ISLE.cx) <= ISLE.boxX && Math.abs(z - ISLE.cz) <= ISLE.boxZ;
}

/* ===========================================================================
   the obstacle kit
   ===========================================================================

   The isle's second life, verbatim (2026-09-25): *"i dont know why you made it
   so hilly how about you just make it a flat field for now . expand one side of
   this island to be a flat big field please and import every single shortcut
   that you can possibly find or agility obstacle so that we cna get making
   specific rules for each one"*.

   The ground half of that is the top of this file: one flat plateau with the
   canal cut through it, and the west lobe - the field the ask expands - is where
   the obstacles stand. The content half is this section, and it is written as
   three separate things because the three change for three different reasons:

     PIECE      what an obstacle IS, one row per loc key: its name, its verb,
                the pose the player plays, what it needs and what it pays. This
                table is the RULES, and it is the one to edit: "the monkeybars
                are 20 xp", "the jagged wall is a level 40 jump-over" - one line
                each, and every placement of that key follows.
     COURSE     the twenty-four pieces that make a lap, in the order the lap is
                taken. The lap bonus is paid for these and only these
                (actions.js#applyAgility's `agilitySeq`).
     PRACTICE   every other piece on the field, in the order it is laid out. A
                practice piece pays its own experience on every completion and
                never advances a lap.
     SHORTCUTS  the six pieces that cross the canal, plus the one piece whose
                model is too long to stand in a cell. They are the only pieces
                placed by hand rather than poured into the grid, because a canal
                is a line, not a grid.

   `fieldCells` is the layout: the pieces are poured into a grid of cells in the
   order the two lists name them, twenty-four into the lap and the rest into the
   practice field, and the grid snakes west along each row so the lap reads as a
   line rather than a scatter. The pitch is five tiles and every footprint is
   capped at three, which leaves a two-tile corridor to the east and south of
   every piece: that corridor is the whole design brief, because it is what lets
   a player walk the field freely and click anything from any side, and it is
   what stops a piece with a footprint of its own from sealing a neighbour in.

   Two things about the layout are load-bearing and easy to get wrong:

     * a piece's `fx`/`fz` is what the OBJECT covers, not what its model looks
       like. The two disagree for exactly one family - the pieces built by
       repeating a one-tile model (the log balance, the rope bridge, the stepping
       stones) - and those carry `keys`, which tells world.js to one-tile the
       footprint so every tile draws its own log (see world.js's isle pass). The
       run's real length is `fx`; the object's is 1.
     * the crossing `from`/`to` are the two tiles the obstacle moves between, and
       they are always the tiles immediately OUTSIDE the footprint along the
       crossing axis - never a tile of it. A piece whose `from` is inside its own
       footprint is a piece that can never be used, because the action walks the
       player to `from` and a solid tile is not somewhere you can stand.

   Levels are kept low on purpose (1 to 35): this is the world's only course, the
   ask was to be able to *try* all of it, and a level-gated field would put most
   of the kit out of reach of the account the player is actually using. The
   experience values are the live game's per-obstacle figures for the Gnome
   Stronghold's and Barbarian Outpost's own pieces where the piece comes from one
   of them, and the same range (20-50) for everything else. */

export const PIECE = {
  /* ---- the pack's own kit -------------------------------------------------
     The 2007 furniture the first cut of the course was built from: the Gnome
     Stronghold's set (locs 2284-2325) and the Barbarian Outpost's. `anim` names
     the pose the player plays, from the 39 the player bake carries
     (bake.mjs#AGILITY_ANIMS) - the piece's own where the pack has one, and the
     nearest thing it does have where it does not (a "Ride" on an aged log is a
     walk along it, so it plays the log balance). */
  agile_net:              { name: "Obstacle net",    verb: "Climb-over",   anim: "agile_climb",            level: 1,  xp: 30, fx: 2 },
  agile_hurdle:           { name: "Hurdle",          verb: "Jump",         anim: "agile_jump_hurdle",      level: 1,  xp: 30, fx: 2, hop: 1 },
  agile_pipe:             { name: "Obstacle pipe",   verb: "Squeeze-through", anim: "agile_pipe_double",   level: 1,  xp: 30, fx: 2, cross: "ew"},
  agile_climbing_net:     { name: "Climbing net",    verb: "Climb",        anim: "agile_reach_ladder",     level: 5,  xp: 35 },
  agile_monkeybars:       { name: "Monkeybars",      verb: "Swing across", anim: "agile_hang_climb",       level: 10, xp: 40, fx: 3, cross: "ew", hop: 1, posts: "agile_monkeybars_end" },
  agile_tree_branch:      { name: "Tree branch",     verb: "Climb",        anim: "agile_climb_bookcase",   level: 5,  xp: 35 },
  agile_tree_branch_down: { name: "Tree branch",     verb: "Climb-down",   anim: "agile_climb_down",       level: 1,  xp: 30 },
  agile_rocky_ledge:      { name: "Rocky Ledge",     verb: "Climb-over",   anim: "agile_low_wall",         level: 10, xp: 35, hop: 1 },
  agile_climbing_rope:    { name: "Climbing rope",   verb: "Climb",        anim: "agile_climb_out",        level: 15, xp: 40 },
  agile_ledge:            { name: "Ledge",           verb: "Walk-across",  anim: "agile_ledge_walk_left",  level: 20, xp: 45 },
  agile_balance_beam:     { name: "Balance beam",    verb: "Stand-on",     anim: "agile_ledge_walk_right", level: 20, xp: 45 },
  agile_tunnel:           { name: "Tunnel",          verb: "Squeeze-through", anim: "agile_pipe_double",   level: 15, xp: 40 },
  /* ---- walls, fences and low obstacles ----------------------------------- */
  agile_novice_wall:      { name: "Low wall",        verb: "Climb-over",   anim: "agile_low_wall",         level: 1,  xp: 20, hop: 1 },
  agile_low_wall:         { name: "Low wall",        verb: "Climb-over",   anim: "agile_low_wall",         level: 1,  xp: 20, fx: 1, fz: 2, cross: "ew", hop: 1 },
  agile_wall_rubble:      { name: "Wall rubble",     verb: "Climb-over",   anim: "agile_low_wall",         level: 1,  xp: 20, hop: 1 },
  agile_broken_wall:      { name: "Broken wall",     verb: "Climb-over",   anim: "agile_low_wall",         level: 1,  xp: 20, cross: "ew", hop: 1 },
  agile_crumbled_wall:    { name: "Crumbled wall",   verb: "Climb-over",   anim: "agile_crumbled_wall",    level: 15, xp: 30, fx: 3, fz: 5, cross: "ew"},
  agile_crumbling_wall:   { name: "Crumbling wall",  verb: "Climb-over",   anim: "agile_crumbled_wall",    level: 15, xp: 30, cross: "ew", hop: 1 },
  agile_jagged_wall:      { name: "Jagged wall",     verb: "Jump-over",    anim: "agile_jump_hurdle",      level: 20, xp: 30, fx: 2, fz: 2, cross: "ew", hop: 1 },
  agile_castle_wall:      { name: "Castle wall",     verb: "Climb-under",  anim: "agile_crawl",            level: 20, xp: 30 },
  agile_crawl_wall:       { name: "Stone wall",      verb: "Crawl-under",  anim: "agile_crawl",            level: 15, xp: 25, cross: "ew"},
  agile_jutting_wall:     { name: "Jutting wall",    verb: "Squeeze-past", anim: "agile_pipe_squeeze",     level: 30, xp: 35, fx: 2 },
  agile_grapple_wall:     { name: "Grapple wall",    verb: "Grapple",      anim: "agile_throw_rope",       level: 35, xp: 45, hop: 1 },
  agile_jump_wall:        { name: "Jump wall",       verb: "Jump",         anim: "agile_long_jump",        level: 25, xp: 35, fx: 2, hop: 1 },
  agile_wall_opening:     { name: "Wall opening",    verb: "Enter",        anim: "agile_climb",            level: 1,  xp: 20 },
  agile_crate_wall:       { name: "Crate wall",      verb: "Climb-out",    anim: "agile_climb_out",        level: 10, xp: 25 },
  /* ---- rocks, ladders and stairs ----------------------------------------- */
  agile_climbing_rocks:   { name: "Climbing rocks",  verb: "Climb-up",     anim: "agile_reach_ladder",     level: 10, xp: 25 },
  agile_climbing_rocks_b: { name: "Climbing rocks",  verb: "Climb",        anim: "agile_climb",            level: 10, xp: 25 },
  agile_stone_ladder:     { name: "Stone ladder",    verb: "Climb-up",     anim: "agile_reach_ladder",     level: 10, xp: 25 },
  agile_stone_ladder_down: { name: "Stone ladder",   verb: "Climb-down",   anim: "agile_climb_down",       level: 10, xp: 25 },
  agile_staircase_up:     { name: "Stone staircase", verb: "Climb-up",     anim: "agile_reach_ladder",     level: 10, xp: 25, fx: 2, fz: 3 },
  agile_staircase_down:   { name: "Stone staircase", verb: "Climb-down",   anim: "agile_climb_down",       level: 10, xp: 25, fx: 2, cross: "ew"},
  agile_stone_ladder_b:   { name: "Stone ladder",    verb: "Climb-up",     anim: "agile_reach_ladder",     level: 10, xp: 25 },
  agile_wall_support:     { name: "Wall support",    verb: "Climb",        anim: "agile_climb_ready",      level: 10, xp: 25 },
  agile_ledge_climb:      { name: "Ledge",           verb: "Climb",        anim: "agile_climb_ready",      level: 10, xp: 25 },
  /* ---- ropes -------------------------------------------------------------- */
  agile_climbing_rope_b:  { name: "Climbing rope",   verb: "Climb",        anim: "agile_climb_out",        level: 15, xp: 40 },
  agile_climbing_rope_c:  { name: "Climbing rope",   verb: "Climb",        anim: "agile_climb_out",        level: 15, xp: 40 },
  agile_rope_climb:       { name: "Rope",            verb: "Climb",        anim: "agile_climb_out",        level: 15, xp: 40 },
  agile_rope_up:          { name: "Rope",            verb: "Climb-up",     anim: "agile_reach_ladder",     level: 15, xp: 40 },
  agile_rope_down:        { name: "Rope",            verb: "Climb-down",   anim: "agile_climb_down",       level: 15, xp: 40 },
  agile_rope_up_b:        { name: "Rope",            verb: "Climb-up",     anim: "agile_reach_ladder",     level: 15, xp: 40 },
  /* ---- pipes and tunnels -------------------------------------------------- */
  agile_pipe_b:           { name: "Obstacle pipe",   verb: "Squeeze-through", anim: "agile_pipe_double",   level: 5,  xp: 30, fx: 2, cross: "ew"},
  agile_pipe_c:           { name: "Obstacle pipe",   verb: "Squeeze-through", anim: "agile_pipe_double",   level: 5,  xp: 30, fx: 2, cross: "ew"},
  agile_pipe_d:           { name: "Pipe",            verb: "Squeeze-through", anim: "agile_pipe_double",   level: 5,  xp: 30, fx: 2, cross: "ew"},
  agile_pipe_climb:       { name: "Pipe",            verb: "Climb-up",     anim: "agile_pipe_squeeze",     level: 20, xp: 35, fx: 2, cross: "ew"},
  agile_pipe_e:           { name: "Obstacle pipe",   verb: "Squeeze-through", anim: "agile_pipe_double",   level: 5,  xp: 30, cross: "ew"},
  agile_tunnel_pass:      { name: "Tunnel",          verb: "Pass-through", anim: "agile_pipe_double",      level: 15, xp: 35 },
  agile_tunnel_enter:     { name: "Tunnel",          verb: "Enter",        anim: "agile_pipe_squeeze",     level: 15, xp: 35 },
  agile_tunnel_blocked:   { name: "Blocked tunnel",  verb: "Enter",        anim: "agile_pipe_squeeze",     level: 15, xp: 35 },
  agile_tunnel_stone:     { name: "Tunnel",          verb: "Enter",        anim: "agile_pipe_double",      level: 20, xp: 40, fx: 3, fz: 3 },
  agile_tunnel_walk:      { name: "Tunnel",          verb: "Walk-along",   anim: "agile_crawl_long",       level: 20, xp: 40 },
  agile_tunnel_wide:      { name: "Tunnel",          verb: "Squeeze-through", anim: "agile_pipe_double",   level: 20, xp: 40, fx: 3, cross: "ew" },
  agile_tunnel_wide_b:    { name: "Tunnel",          verb: "Squeeze-through", anim: "agile_pipe_double",   level: 20, xp: 40, fx: 2, cross: "ew" },
  agile_tunnel_enter_b:   { name: "Tunnel",          verb: "Enter",        anim: "agile_pipe_squeeze",     level: 15, xp: 35, fx: 2, cross: "ew"},
  agile_cart_tunnel:      { name: "Cart tunnel",     verb: "Crawl-through", anim: "agile_crawl_long",      level: 20, xp: 35 },
  agile_cart_tunnel_down: { name: "Cart tunnel",     verb: "Crawl-down",   anim: "agile_crawl",            level: 20, xp: 35 },
  agile_underwall:        { name: "Underwall tunnel", verb: "Climb-into",  anim: "agile_pipe_squeeze",     level: 25, xp: 35 },
  agile_trapdoor_tunnel:  { name: "Trapdoor tunnel", verb: "Climb-into",   anim: "agile_crawl",            level: 25, xp: 35 },
  /* ---- ledges, beams and gaps -------------------------------------------- */
  agile_balancing_ledge:  { name: "Balancing ledge", verb: "Walk-across",  anim: "agile_ledge_walk_left",  level: 25, xp: 40 },
  agile_balancing_rope:   { name: "Balancing rope",  verb: "Walk-on",      anim: "agile_log_balance",      level: 25, xp: 40, cross: "ew"},
  agile_balancing_rope_b: { name: "Balancing rope",  verb: "Walk-on",      anim: "agile_log_balance",      level: 25, xp: 40 },
  agile_balancing_ledge_b: { name: "Balancing ledge", verb: "Walk-across", anim: "agile_ledge_walk_right", level: 25, xp: 40 },
  agile_ledge_jump:       { name: "Ledge",           verb: "Jump-to",      anim: "agile_jump_stones",      level: 25, xp: 40, hop: 1 },
  agile_gap_stone:        { name: "Gap",             verb: "Cross",        anim: "agile_jump_stones",      level: 20, xp: 35, hop: 1 },
  agile_gap_squeeze:      { name: "Gap",             verb: "Squeeze-through", anim: "agile_pipe_squeeze",  level: 25, xp: 40, fx: 2, fz: 2 },
  agile_gap_wall:         { name: "Gap through the wall", verb: "Squeeze-through", anim: "agile_pipe_squeeze", level: 25, xp: 40 },
  /* ---- monkeybars and swings --------------------------------------------- */
  agile_monkeybars_b:     { name: "Monkeybars",      verb: "Swing across", anim: "agile_hang_climb",       level: 20, xp: 40, hop: 1 },
  agile_rope_swing_c:     { name: "Ropeswing",       verb: "Swing-on",     anim: "agile_rope_swing",       level: 30, xp: 40, hop: 1 },
  agile_rope_swing_d:     { name: "Ropeswing",       verb: "Swing-on",     anim: "agile_rope_swing_long",  level: 30, xp: 40, hop: 1, cross: "ew" },
  agile_obstacle_net_b:   { name: "Obstacle net",    verb: "Climb-over",   anim: "agile_climb",            level: 1,  xp: 30, fx: 2 },
  /* ---- stones and logs ---------------------------------------------------- */
  agile_stepping_stone_b: { name: "Stepping stone",  verb: "Jump-to",      anim: "agile_jump_stones",      level: 20, xp: 30, hop: 1 },
  agile_stepping_stone_c: { name: "Stepping stone",  verb: "Jump-to",      anim: "agile_spot_jump",        level: 20, xp: 30, hop: 1 },
  agile_stepping_log:     { name: "Stepping log",    verb: "Jump-to",      anim: "agile_jump_stones",      level: 20, xp: 30, hop: 1 },
  agile_aged_log:         { name: "Aged log",        verb: "Ride",         anim: "agile_log_balance",      level: 20, xp: 40, fx: 3, cross: "ew" },
  agile_balance_beam_b:   { name: "Balance beam",    verb: "Stand-on",     anim: "agile_ledge_walk_right", level: 20, xp: 40 },
  /* ---- spectacle ---------------------------------------------------------- */
  agile_wall_of_flame:    { name: "Wall of flame",   verb: "Jump-through", anim: "agile_jump_hurdle",      level: 30, xp: 45, cross: "ew", hop: 1 },
  agile_wall_of_flame_b:  { name: "Wall of flame",   verb: "Jump-through", anim: "agile_spot_jump",        level: 30, xp: 45, hop: 1 },
  agile_snow_jump:        { name: "Snow jump",       verb: "Jump",         anim: "agile_long_jump",        level: 35, xp: 50, fx: 3, fz: 2, hop: 1 },
  agile_snow_jump_b:      { name: "Snow jump",       verb: "Jump",         anim: "agile_long_jump",        level: 35, xp: 50, fx: 3, fz: 2, hop: 1 },
  agile_ice_ledge:        { name: "Ice ledge",       verb: "Step-off",     anim: "agile_ledge_off_left",   level: 35, xp: 50 },
  /* ---- the canal crossings ------------------------------------------------
     The pieces that do not stand in the field (see `SHORTCUTS` below): the five
     that go over the canal - four of them here and `agile_rope_swing_c` with the
     other swings - and `agile_tunnel_walk`, which lies along the north shore.
     None of them is in `COURSE` or `PRACTICE`, because a crossing is not a field
     piece: it crosses WATER, and its length is the width of the channel rather
     than a cell. `keys` on three of them is the run rule: the log balance, the
     stepping stones and the rope bridge are each ONE one-tile model repeated, so
     the object's footprint is one tile and every tile of the run draws its own
     segment (world.js's isle pass; eight identical logs would otherwise have to
     be eight copies of the same model, which is what the three wood tones exist
     to avoid). */
  agile_rope_swing:       { name: "Ropeswing",       verb: "Swing-on",     anim: "agile_rope_swing",       level: 1,  xp: 30, hop: 1 },
  agile_rope_swing_b:     { name: "Rope swing",      verb: "Swing-on",     anim: "agile_rope_swing_long",  level: 30, xp: 35, hop: 1 },
  agile_log:              { name: "Log balance",     verb: "Walk-on",      anim: "agile_log_balance",      level: 1,  xp: 35, keys: ["agile_log", "agile_log_b", "agile_log_c"] },
  agile_stepping_stone:   { name: "Stepping stone",  verb: "Cross",        anim: "agile_stepping_stone",   level: 20, xp: 35, hop: 1, keys: ["agile_stepping_stone"] },
  agile_rope_bridge:      { name: "Rope bridge",     verb: "Walk-across",  anim: "agile_crumbled_wall",    level: 15, xp: 40, keys: ["agile_rope_bridge"] },
};

/* The experience a completed LAP is worth, on top of the pieces' own. Paid only
   for the pieces taken in `COURSE` order, from the first, in one run - the same
   rule the live game's own courses use (actions.js#applyAgility). */
export const COURSE_XP_LAP = 300;

/* ===========================================================================
   the field
   ===========================================================================

   The grid the pieces stand on: eight columns by nine rows on the west lobe
   (the field the ask expands), two columns by nine on the east lobe beyond the
   canal, and the pieces poured into it in list order. Five-tile pitch with
   footprints capped at three is what leaves the two-tile corridors; see the
   section header above for why that matters.

   Every column is on grass for every row (the sand line moves out and in with
   the shore's own wobble, and the numbers below are inside it by better than a
   tile), and the two lobes' columns are named separately because the canal is
   between them - the pieces simply continue across it. */
const CELL_X = [37, 42, 47, 52, 57, 62, 67, 72];
const CELL_X_E = [86, 91];
const CELL_Z = [141, 146, 151, 156, 161, 166, 171, 176, 181];

/* The cells in the order the pieces are poured into them: west along a row,
   east along the next, and so on down - a snake, so consecutive pieces are
   neighbours and the lap reads as a line. The east lobe is filled after the
   whole of the west, which is why the field's overflow ends up out there. */
function fieldCells() {
  const cells = [];
  for (let r = 0; r < CELL_Z.length; r++) {
    const xs = r % 2 === 0 ? CELL_X : CELL_X.slice().reverse();
    for (const x of xs) cells.push([x, CELL_Z[r]]);
  }
  for (let r = 0; r < CELL_Z.length; r++) {
    const xs = r % 2 === 0 ? CELL_X_E : CELL_X_E.slice().reverse();
    for (const x of xs) cells.push([x, CELL_Z[r]]);
  }
  return cells;
}

/* One piece, standing on one cell, as `COURSE`/`PRACTICE` want it.

   The cell names the CENTRE of the piece - the tile the player walks to - and
   the footprint is laid around it, which is what makes a 3-wide piece still
   reachable from the corridor on either side. `from`/`to` are then the tiles
   just outside the footprint along the CROSSING AXIS, and that axis is the one
   thing about a piece that is not free: it is the axis the player actually
   travels, and it has to agree with the model that gets drawn, or the click
   looks like the player walked through a pipe sideways - which is exactly what
   the user caught. Two shapes of piece, two rules:

     * a piece you go ALONG - a pipe, a tunnel, the monkeybars, a log, a
       staircase, a balancing rope - is crossed along its own length, so the
       crossing axis is the model's own long axis;
     * a piece that is a BARRIER - a wall, a hurdle, a net, a flame sheet - is
       crossed the other way, so the crossing axis is PERPENDICULAR to its long
       axis.

   `cross: "ew"` says the crossing runs east-west (north-south is the default).
   The flag is per ROW, because it is a fact about that loc's model and not about
   the field: the model's own bounds in `locs.json` are the record of which way
   each one runs, and `tools/check-agility.mjs` re-reads them and fails if a row's
   flag stops agreeing with its model. */
function pieceEntry(key, X, Z) {
  const p = PIECE[key];
  const fx = p.fx || 1;
  const fz = p.fz || 1;
  const ax = X - ((fx - 1) >> 1);
  const az = Z - ((fz - 1) >> 1);
  const xc = ax + ((fx - 1) >> 1);
  const zc = az + ((fz - 1) >> 1);
  const ew = p.cross === "ew";
  const e = {
    key,
    name: p.name,
    verb: p.verb,
    anim: p.anim,
    x: ax, z: az, rot: 0, fx, fz,
    hop: !!p.hop,
    level: p.level,
    xp: p.xp,
    from: ew ? [ax - 1, zc] : [xc, az - 1],
    to: ew ? [ax + fx, zc] : [xc, az + fz],
  };
  /* The pieces built by repeating a one-tile model: the object's footprint goes
     back to one tile and the run is drawn tile by tile (world.js's isle pass). */
  if (p.keys) e.keys = p.keys;
  /* The monkeybars' own end posts: scenery either side of the bars, which is
     what the cache's own model set carries them as (locs.mjs#agile_monkeybars_end).
     They are drawn and nothing else - no row, no solidity - so a click on one
     falls through to the bars beside it. */
  if (p.posts) {
    e.decor = ew
      ? [[p.posts, ax - 1, zc, 0], [p.posts, ax + fx, zc, 0]]
      : [[p.posts, xc, az - 1, 0], [p.posts, xc, az + fz, 0]];
  }
  return e;
}

function field(keys, cells, from) {
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const [X, Z] = cells[from + i];
    out.push(pieceEntry(keys[i], X, Z));
  }
  return out;
}

/* ---- the course ----------------------------------------------------------
   The lap: the first three rows of the field, west to east and back, twelve
   pieces of the pack's own kit and twelve walls. It is a lap of one lap's
   length on purpose - every other piece in the kit is a practice piece, so the
   bonus stays something a player earns rather than something they trip over -
   and its order is the order below. */
const COURSE_KEYS = [
  "agile_net", "agile_hurdle", "agile_pipe", "agile_climbing_net",
  "agile_monkeybars", "agile_tree_branch", "agile_tree_branch_down",
  "agile_rocky_ledge", "agile_climbing_rope", "agile_ledge", "agile_balance_beam",
  "agile_tunnel",
  "agile_novice_wall", "agile_low_wall", "agile_wall_rubble", "agile_broken_wall",
  "agile_crumbled_wall", "agile_crumbling_wall", "agile_jagged_wall",
  "agile_castle_wall", "agile_crawl_wall", "agile_jutting_wall",
  "agile_grapple_wall", "agile_jump_wall",
];

/* ---- everything else ------------------------------------------------------
   The rest of the kit, in the order the bake lists it (locs.mjs), which is why
   the rows read as families: the walls and ladders, the ropes, the pipes and
   tunnels, the beams and gaps, the swings, the stones, and the five oddities at
   the end. A practice piece is worth its own experience on every completion and
   is not part of any lap. */
const PRACTICE_KEYS = [
  "agile_wall_opening", "agile_crate_wall",
  "agile_climbing_rocks", "agile_climbing_rocks_b", "agile_stone_ladder",
  "agile_stone_ladder_down", "agile_staircase_up", "agile_staircase_down",
  "agile_stone_ladder_b", "agile_wall_support", "agile_ledge_climb",
  "agile_climbing_rope_b", "agile_climbing_rope_c", "agile_rope_climb",
  "agile_rope_up", "agile_rope_down", "agile_rope_up_b",
  "agile_pipe_b", "agile_pipe_c", "agile_pipe_d", "agile_pipe_climb",
  "agile_pipe_e", "agile_tunnel_pass", "agile_tunnel_enter", "agile_tunnel_blocked",
  "agile_tunnel_stone", "agile_tunnel_wide", "agile_tunnel_wide_b",
  "agile_tunnel_enter_b", "agile_cart_tunnel", "agile_cart_tunnel_down",
  "agile_underwall", "agile_trapdoor_tunnel",
  "agile_balancing_ledge", "agile_balancing_rope", "agile_balancing_rope_b",
  "agile_balancing_ledge_b", "agile_ledge_jump", "agile_gap_stone",
  "agile_gap_squeeze", "agile_gap_wall",
  "agile_monkeybars_b", "agile_rope_swing_d",
  "agile_obstacle_net_b",
  "agile_stepping_stone_b", "agile_stepping_stone_c", "agile_stepping_log",
  "agile_aged_log", "agile_balance_beam_b",
  "agile_wall_of_flame", "agile_wall_of_flame_b", "agile_snow_jump",
  "agile_snow_jump_b", "agile_ice_ledge",
];

const CELLS = fieldCells();

export const COURSE = field(COURSE_KEYS, CELLS, 0);
export const PRACTICE = field(PRACTICE_KEYS, CELLS, COURSE.length);

/* ---- the crossings -------------------------------------------------------
   The pieces the grid cannot hold, and the only ones placed by hand.

   Six go over the canal - a canal is a line, not a grid - and each is given its
   west shore tile `x`, its `z`, how far the run reaches east (`fx`) and `surf`
   (how high above the water's own plane the model is drawn; see
   scene.js#_chunkLocs). The canal is water from x 76 to x 79 and sand either
   side, so a run of eight from x 74 puts its own shore tile on grass at 73 and
   comes out on sand at 82 - both walkable, which is the whole requirement. They
   are spaced eight rows apart down the channel, so the far lobe can be reached
   at six points, and the three built by repeating a one-tile model (the log
   balance, the stepping stones, the rope bridge) carry `keys` so every tile of
   the run draws its own segment rather than one model stretched over the whole
   crossing.

   The seventh is `agile_tunnel_walk`, whose model is nine tiles long: it runs
   east-west along the north shore instead (see the entry's own note).

   A crossing is a SHORTCUT in the plain sense: it pays its own experience and
   counts for nothing else. Taking one never advances a lap, because a lap is
   `COURSE` and none of these is in it. */
function crossEntry(key, x, z, fx, surf, fz = 1) {
  const p = PIECE[key];
  const e = {
    key,
    name: p.name,
    verb: p.verb,
    anim: p.anim,
    x, z, rot: 0, fx, fz,
    hop: !!p.hop,
    level: p.level,
    xp: p.xp,
    surf,
    from: [x - 1, z],
    to: [x + fx, z],
  };
  if (p.keys) e.keys = p.keys;
  return e;
}

export const SHORTCUTS = [
  crossEntry("agile_rope_swing_c", 74, 139, 8, 0.16),
  crossEntry("agile_rope_swing", 74, 147, 8, 0.16),
  crossEntry("agile_rope_swing_b", 74, 155, 8, 0.16),
  crossEntry("agile_log", 74, 163, 8, 0.16),
  crossEntry("agile_stepping_stone", 74, 171, 8, 0),
  crossEntry("agile_rope_bridge", 74, 179, 8, 0.16),
  /* The one piece whose model is the wrong size for the field: a `walk-along`
     tunnel is NINE tiles long and two deep, so it cannot stand in a five-tile
     cell without lying through its neighbours, and it cannot cross the canal
     either - a nine-tile tube over four tiles of water hangs a dark hole in the
     channel, which is exactly what it looked like when it was tried there. It
     goes along the island's own north shore instead, lying east-west on the sand
     with its two ends on dry ground. It is a SPAN rather than a crossing in the
     code's terms, which is why it is written the same way the crossings are: the
     same `crossEntry`, a footprint that reaches from one end to the other, and
     no `surf` (it is standing on the beach, not in the water). */
  crossEntry("agile_tunnel_walk", 40, 137, 9, null, 2),
];

/* The return gate: the cache's own magic portal, a few tiles east of where the
   teleport lands. It is an entry like the others - one tile to stand on, one to
   come out on, a verb - but it is not a crossing at all: it is a teleport, and
   actions.js#doAgilityObstacle pays it off with the standard teleport's own
   vanish/arrive pair. It is the way home that costs no law rune. */
export const PORTAL = {
  key: "agile_portal", name: "Portal", verb: "Enter", x: 59, z: 143, rot: 0, fx: 1, fz: 2,
  from: [58, 143], to: [58, 142], level: 1, xp: 0, portal: true,
};

/* Every placement, in the order the world stamps them (world.js's isle pass):
   the lap, the crossings, the practice field, and the gate. The split into
   lists is this file's business and nothing else's - everything downstream
   reads `ALL_AGILITY` or the lookups below. */
export const ALL_AGILITY = [...COURSE, ...SHORTCUTS, ...PRACTICE, PORTAL];

/* The verb and the name a tile's menu row shows, by object type. The object's
   type IS the baked loc key (see world.js's isle pass), so this is one lookup
   per click and `sceneryRowSpecs` can offer the client's own word for the piece
   without importing the course at all. */
export const AGILE_VERB = {};
export const AGILE_NAME = {};
for (const e of ALL_AGILITY) {
  const nm = e.name || "";
  for (const k of (e.keys || [e.key])) {
    AGILE_VERB[k] = e.verb;
    if (nm) AGILE_NAME[k] = nm;
  }
}

/* Every loc key the course PLACES, which is one set wider than the set of
   pieces a player can click: the monkeybars' end posts are drawn and offer no
   row. The renderer asks this question ("is this tile mine to draw" -
   scene.js#_locSpec's default case) and the menu asks `AGILE_VERB` ("is there a
   row for it"), so the two are built separately and neither has to know about
   the other's exceptions. Getting this wrong is silent in a way worth naming:
   an end post left out is a placed object the renderer refuses to draw, which
   reads as two decorative fenceposts simply missing from the world. */
const AGILE_KEYS = new Set(Object.keys(AGILE_VERB));
for (const e of ALL_AGILITY) for (const d of (e.decor || [])) AGILE_KEYS.add(d[0]);

/* Which entry covers a tile. Built once from the footprints, so the click
   handler asks "what course piece is this tile part of" instead of being handed
   the answer by the world - the world's objects carry no reference to the
   course (world.js's `objs` is a Map of plain objects and is serialised to the
   client in multiplayer, so it stays small). */
const TILE_ENTRY = new Map();
for (const e of ALL_AGILITY) {
  for (let dz = 0; dz < e.fz; dz++) {
    for (let dx = 0; dx < e.fx; dx++) TILE_ENTRY.set((e.x + dx) + "," + (e.z + dz), e);
  }
}
export function courseAt(x, z) {
  return TILE_ENTRY.get(x + "," + z) || null;
}
export function isAgileKey(key) {
  return AGILE_KEYS.has(key);
}

/* The trail the world paints between the pieces, as tiles.

   It is the LAP read back out of `COURSE`'s order - the landing, then each
   piece's two ends in the order that costs the least walking, then the gate -
   and it exists so a player who lands on the isle can see where the course goes
   without being told: a worn dirt trail across the grass, from the landing,
   round the lap, and back to the portal. The pieces themselves are left out (a
   path under a net or on a log is not a path), which is the world's own rule
   when it paints it (world.js's trail pass).

   The zigzag is real and correct: the pieces stand in rows and each one is
   crossed north-south, so a player running the lap walks along the lane between
   two rows and crosses each obstacle as they pass it. The trail shows exactly
   that. */
export const ROUTE = [];
{
  let at = [Math.floor(ISLE.landAt[0]), Math.floor(ISLE.landAt[1])];
  ROUTE.push(at);
  for (const e of COURSE) {
    const da = Math.hypot(e.from[0] - at[0], e.from[1] - at[1]);
    const db = Math.hypot(e.to[0] - at[0], e.to[1] - at[1]);
    const [first, second] = da <= db ? [e.from, e.to] : [e.to, e.from];
    ROUTE.push(first, second);
    at = second;
  }
  ROUTE.push([PORTAL.from[0], PORTAL.from[1]]);
}
