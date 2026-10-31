/* ==========================================================================
   The pathfinder — the live engine's own algorithm, transcribed.

   A route is found the way the game finds one, not the way an A* would:

   * it is a **breadth-first search** over the tile grid, every step (diagonal
     included) costing one tile, so the answer is a shortest path in tiles;
   * neighbours are expanded in a fixed order — **West, East, South, North,
     South-west, South-east, North-west, North-east** — which is what makes a
     route prefer long straight cardinal runs (the cardinal neighbours are
     queued before the diagonals, so they win the tie a shortest path leaves);
   * the search is confined to a **128x128 window** with the start on the
     middle tile (this world is exactly that size, so the world *is* the
     window — see the note below), and a path to an **entity** is only
     attempted at all when it is **within 101x101** of the start;
   * a **diagonal** may not squeeze between two blocked tiles — both tiles it
     passes between have to be open (this is the engine's own three-flag test:
     `StepValidator#isBlockedSouthWest` asks the destination for
     `BLOCK_SOUTH_WEST` *and* the tile to its west for `BLOCK_WEST` *and* the
     tile to its south for `BLOCK_SOUTH`, and a solid tile sets all three).
     **This build reduces that test to terrain only** (`open`, below): for a
     world whose obstacles are *solid tiles*, all three flags move together, so
     "both tiles the diagonal passes between are walkable" is exactly the test.
     It is *not* equivalent for a **directional** obstacle - an ornamental fence,
     a one-tile water corner, a loc you can see through - which sets one flag
     alone. The day one is added, this test has to become the three flags (see
     `ENGINE-CHANGES.md` E-04);
   * when nothing reaches the requested tile, a second pass over a **21x21
     window** at the destination picks the reachable tile that gets closest to
     it (this is the engine's "walk as close as you can", and it is why
     clicking across a river walks you to the bank);
   * the route the character is actually given is only the first **25 corners**
     of that path, each checkpoint joined to the next by "follow mode" (walk
     diagonally towards it, then straight). A long click therefore stops after
     the 25th turn.

   Two references were read rather than remembered (2026-09-22):

   * the OSRS Wiki's *Pathfinding* article, which states the neighbour order,
     both window sizes, the 101x101 reachability rule and the 25-corner
     truncation; and
   * `rsmod/rsmod`'s `engine/routefinder` — `RouteFinding.kt` (the 128x128
     search map, the `findClosestApproachPoint` fallback's 21x21 window, its
     `cost < lowestCost || (cost == lowestCost && maxAlternativePath >
     distances[x, z])` rule and its `maxWaypoints = 25`) and `StepValidator.kt`
     (the diagonal test). rsmod's z runs north, this world's runs south, which
     is the one conversion between the two; in this world's coordinates the
     order above is exactly the one rsmod walks.

   The world's own additions ride on top without changing any of that:
   `opts.blocked` (tiles taken by another character — a *preference*, never a
   wall: see the note on `blocked` below), `opts.goalTest` (a goal *set* rather
   than one tile, for a chase), `opts.crossed` (the wall-decor rule: a face of a
   walkable tile an item seals - see world.js#blocksStep) and `opts.reach`
   (stop within N tiles of the target).
   ========================================================================== */

const MAX_WAYPOINTS = 25;  // a route is the first 25 corners of the path
const APPROACH_RANGE = 10; // the second pass searches dest +/- 10 (a 21x21 window)
const SEEK_LIMIT = 100;    // ... and only trusts a tile whose path is under 100
const REACH_RANGE = 50;    // an *entity* further than 101x101 away (50 each way) is not attempted

/* The engine's search map is 128x128 tiles with the start on the middle tile,
   and a path may not leave it. This world is 128x192 (src/world.js#W, #H), so
   the search here is not the engine's fixed window at all - the scratch arrays
   below are sized from the world's own `w`/`h`, the bounds test reads both, and
   the whole map is searchable. A click further than 64 tiles away would be
   refused by the live engine; here the world is the scene, so it is walked. */

/* West, East, South, North, South-west, South-east, North-west, North-east —
   the engine's own expansion order. In this world x runs east and z runs
   south, so "south" is +z. */
const NEIGHBOURS = [
  [-1, 0], [1, 0], [0, 1], [0, -1],
  [-1, 1], [1, 1], [-1, -1], [1, -1],
];

/* The engine's own walk, used for the leg between two checkpoints *and* by the
   NPC follow: step diagonally towards the target while both axes differ, then
   straight along what is left. It is not a search — it walks into the first
   obstacle it meets and stops. `free(x, z)` is the caller's own passability
   test, so the same routine serves a player (who may cross a shut door) and a
   creature (who may not). Returns the tiles from (but not including) the start
   to wherever it got. */
export function naivePath(sx, sz, tx, tz, free) {
  const out = [];
  let x = sx;
  let z = sz;
  const stepX = Math.sign(tx - x);
  const stepZ = Math.sign(tz - z);
  let guard = 0;
  while ((x !== tx || z !== tz) && guard++ < 512) {
    let dx = stepX;
    let dz = stepZ;
    if (x === tx) dx = 0;
    if (z === tz) dz = 0;
    const nx = x + dx;
    const nz = z + dz;
    if (!free(nx, nz)) break;
    if (dx && dz && (!free(x + dx, z) || !free(x, z + dz))) break;
    x = nx;
    z = nz;
    out.push({ x, z });
  }
  return out;
}

/* The engine's fallback, transcribed: scan the 21x21 window at the
   destination (western priority, then southern), keep the reached tile whose
   squared distance to the destination is smallest, and on a tie keep the one
   with the longer path — `cost < lowestCost || (cost == lowestCost &&
   maxAlternativePath > distances[x, z])`, which is rsmod's own comparison. */
function closestApproach(dist, gen, searchId, W, H, tx, tz) {
  let best = -1;
  let bestCost = Infinity;
  let bestDist = 0;
  for (let x = tx - APPROACH_RANGE; x <= tx + APPROACH_RANGE; x++) {
    /* southern priority first: this world's z runs south, so it counts down */
    for (let z = tz + APPROACH_RANGE; z >= tz - APPROACH_RANGE; z--) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const i = z * W + x;
      /* "reached" is now the stamp, not a -1 sentinel - see the scratch note */
      if (gen[i] !== searchId) continue;
      const d = dist[i];
      if (d >= SEEK_LIMIT) continue;
      const dx = x - tx;
      const dz = z - tz;
      const cost = dx * dx + dz * dz;
      if (cost < bestCost || (cost === bestCost && d > bestDist)) {
        best = i;
        bestCost = cost;
        bestDist = d;
      }
    }
  }
  return best;
}

function reconstruct(from, cur, W) {
  const out = [];
  while (cur >= 0) {
    out.push({ x: cur % W, z: (cur / W) | 0 });
    cur = from[cur];
  }
  out.reverse();
  return out;
}

/* The search's four arrays, reused across calls.

   `findPath` runs on every click, every combat repath and every wander, and was
   measured at ~78 calls a second in normal play. Allocating four Int32Array(W*H)
   (16,384 entries, ~64 KiB) per call is a few MB/s of short-lived typed arrays
   for the garbage collector to clear inside a 16.6 ms frame budget - and the
   search does not need fresh memory, only zeroed memory. It is not re-entrant
   either (`walkTo`'s blocked and creature-free passes, `pickWanderTarget`'s
   retry loop and the chase all run one after the other, never nested), so one
   set is enough. The buffers grow when the world does.

   **"Zeroed" is now done by a generation stamp rather than a fill.** The first
   cut of this pool cleared all three arrays at the top of every search
   (`dist.fill(-1, 0, total)` and friends) - which is 196 KiB of writes per call
   whatever the route's length, and at ~30 wander picks a tick that fixed cost
   was the largest single item in the whole game (measured live 2026-09-22: a
   bounded wander search that expands ~80 nodes still cost ~50 us, essentially
   all of it the three fills). Instead `_gen[i]` carries the number of the
   search that last visited tile `i`, and a tile is unvisited when that number
   is not the current one: `_searchId` is bumped per call instead of the arrays
   being cleared, so a search now costs only the tiles it actually touches.
   `_occ` and `_from` need no stamp of their own - both are only ever read for a
   tile whose `_gen` already matched - and `_from[startI] = -1` is written
   explicitly, since the start is the one node the reconstruction walks back
   from and a stale -1 from the previous search must not be trusted. The
   counter is reset (with a real clear) once it reaches the Int32 ceiling, which
   is ~2 billion searches away and would wrap to a false hit if it were not. */
let _scratchLen = 0;
let _dist = null;
let _occ = null;
let _from = null;
let _queue = null;
let _gen = null;
let _searchId = 0;
function scratchFor(n) {
  if (_scratchLen >= n) return;
  _scratchLen = n;
  _dist = new Int32Array(n);
  _occ = new Int32Array(n);
  _from = new Int32Array(n);
  _queue = new Int32Array(n);
  /* zero-filled by construction, and `_searchId` is always >= 1, so a fresh
     buffer never looks visited */
  _gen = new Int32Array(n);
}

/* The route a character is given is the path cut at its 25th corner. The
   engine stores the *checkpoints* and walks each leg with `naivePath`; between
   two consecutive corners of a breadth-first path the leg is already a single
   straight run, so the walked tiles are the path's own prefix. (The two differ
   only when the ground changes under a walk — a door opening across the leg —
   where the engine's naive leg walks into the change and the client re-plans;
   that is `game.js#stepSim`'s stale-plan retry here.) */
function cutAtWaypoints(path) {
  if (path.length <= 2) return path;
  let corners = 0;
  let dx = path[1].x - path[0].x;
  let dz = path[1].z - path[0].z;
  for (let i = 2; i < path.length; i++) {
    const nx = path[i].x - path[i - 1].x;
    const nz = path[i].z - path[i - 1].z;
    if (nx === dx && nz === dz) continue;
    dx = nx;
    dz = nz;
    if (++corners >= MAX_WAYPOINTS) return path.slice(0, i);
  }
  return path;
}

/* `opts.blocked(x, z)` marks tiles that are walkable terrain but already taken
   by another character (see src/game.js#entityBlockTest). Characters are
   walk-through in this world, so it is a **preference and never a wall**: the
   search still steps onto an occupied tile when that is the shortest thing to
   do, and only *among routes of the same length* does it take the one that
   stands on the fewest bodies. That distinction is the whole reason the search
   is a two-part cost rather than a boolean (see the BFS below).

   It used to be a wall, and it was consulted for both tiles a diagonal step
   squeezes between as well — which is not what the engine does (its three-flag
   corner test reads the collision map, and no character is in the collision
   map) and made a *diagonal* click pathological: with a body standing east of
   you, a click on the tile north-east of you was refused the one-tile diagonal
   and walked a six-tile detour round the pair instead (measured live,
   2026-09-22). The user's report: *"sometimes npcs or the player is moving an l
   shape to get to a square tile that is diagonal immediately, thats incorect
   actually the player should just move diagonally directly onto the tile thats
   diagonal to them"*. Now the corner test reads terrain only, and a body can
   never lengthen a route by even one tile — at most it picks a different
   shortest one.

   An occupied *destination* used to be swapped for `nearestWalkable(...,
   blocked)` here, which is what made a click on a cow walk you *up to* the cow.
   It is not any more: creatures are walk-through, so a walk to a tile a body is
   standing on walks onto it and you stand underneath. `walkTo` keeps that swap
   for the one kind of walk that is *for* something - an interaction's
   `reach`-bounded approach, which stops beside its target - so the rule lives
   with the caller that wants it, and this search treats occupancy as the
   preference its own note describes.

   `opts.goalTest(x, z)` replaces the *single* destination tile with "any tile
   that passes this test", which is how a melee approach asks for "a tile beside
   the creature" rather than one particular neighbour — *which* one must come
   out of the search. A goal-set search has no fallback (see the note on the
   closest-approach pass below).

   `opts.crossed(fromX, fromZ, toX, toZ)` vetoes a step between two tiles that
   are both walkable - the wall-decor rule (world.js#blocksStep): a painting or a
   lever stands on a floor tile and can still seal one face of it, and a route
   that respects tiles but not faces walks through the wall the picture hangs
   on. Consulted for every step the search takes, diagonals included.

   `opts.stand(x, z)` is the mover's own size: whether its south-west corner
   may stand at (x, z), i.e. whether its whole floor is walkable there. A 1x1
   mover never passes it and the search reads one tile; a dragon's 4x4 reads
   sixteen, on every step and round every corner, so a wide body can neither
   stop nor pass with its flank inside a wall.
   `maxNodes` is a vestigial safety valve: the 128x128 window already bounds the
   search, so a cap below one full window can only ever cut a legitimate route
   short. Pass 0 (the default) to let the window be the bound; `walkTo` does.

   `opts.limit` bounds the search by **distance from the start**: no tile further
   than `limit` steps away is expanded, and a goal past that is not reached at
   all (the closest-approach pass below can still answer with a tile inside the
   searched area). It exists for the one caller whose route is *decorative*: a
   wander (src/game.js#pickWanderTarget) is a few tiles of amble around a
   creature's home, and refusing an absurdly long route to a short request costs
   the creature nothing - it simply waits and picks again.

   What it saves is the failure case. An unbounded BFS that cannot reach its
   goal drains the whole 16,384-tile window and gives up, and a wander target
   picked around a creature's home lands *inside* a building often enough (the
   interior tiles are walkable; the only way in is a shut door a creature cannot
   open) that those full-window drains were the single largest CPU cost in the
   game: measured live 2026-09-22 at 11 ms median / 19 ms worst per tick for one
   `updateNpcs`, with 141,297 `world.isWalkable` calls in the worst tick. A
   bounded search explores a diamond instead of the world, so the bound is what
   makes a wander cost microseconds. Pass 0 (the default) for no depth bound;
   `walkTo` keeps 0 so a player's own click is never cut short. */
export function findPath(world, sx, sz, tx, tz, maxNodes = 0, opts = {}) {
  const blocked = opts.blocked || null;
  const goalTest = opts.goalTest || null;
  const crossed = opts.crossed || null;
  const reach = opts.reach ?? 0;
  const limit = opts.limit ?? 0;
  /* The level the route is planned on (see world.js#UP_Y): every tile test
     below reads it, so a route upstairs never steps onto ground-floor ground
     and nothing else changes. Callers that never pass it plan on the ground. */
  const plane = opts.plane ?? 0;
  if (!world.inBounds(sx, sz)) return null;
  /* The start tile is deliberately **not** required to be walkable, and this is
     the rule rather than an omission. The engine lets an actor always leave the
     tile it is standing on: a player who is somehow on a shut door's tile, or on
     a spot a build moved under them, must be able to step back onto the ground
     instead of freezing. So the search never tests `open(sx, sz)`; it requires
     only that every tile the walk *steps onto* - and both tiles a diagonal
     passes between - is open. `src/tools/check-engine.mjs`'s "start tile"
     case asserts a legal route off a blocked start, so the rule cannot be
     changed by accident. */

  /* What the search may not walk *through*: terrain, and nothing else. A body is
     deliberately not in here — see the note on `blocked` above — and neither is
     a shut door: a door is strictly a toggle (the user's rule, standing
     preference P3), so no route crosses a shut leaf and nothing here opens one.
     `opts.stand(x, z)` swaps the one-tile test below for "this mover's own
     south-west corner may stand here" - a big body's whole floor has to be
     walkable everywhere the corner goes, diagonals included (the corner rule
     below reads the same test, so a wide body does not drag its flank through
     a wall it turns). Absent, the mover is one tile and the test is the tile.
     Supplied by src/game.js#walkTo from the walker's own `foot`. */
  const open = opts.stand || ((x, z) => world.isWalkable(x, z, plane));
  /* ... and what it would rather not stand on, counted per tile. */
  const occAt = blocked ? (x, z) => (blocked(x, z) ? 1 : 0) : null;

  if (goalTest) {
    /* "the south-west tile of an object destination must be within a 101x101
       tile area around the starting location" — beyond that the engine does not
       even attempt the path. A goal *set* is a creature, a player or a piece of
       scenery (which is the kind of destination the rule is written for); a
       plain tile click is not, so it is not refused. */
    if (Math.abs(tx - sx) > REACH_RANGE || Math.abs(tz - sz) > REACH_RANGE) return null;
    /* already standing on an acceptable goal: the caller still gets a path, so
       it does not have to special-case "it is already there" */
    if (goalTest(sx, sz)) return [{ x: sx, z: sz }];
  } else {
    if (!world.inBounds(tx, tz)) return null;
    /* A tile that is not walkable is swapped for the nearest walkable one ("walk
       to the river's edge", the ground-item grab, the clicked wall). A tile a
       **body** is standing on is *not*: creatures are walk-through, so a walk to
       a creature's tile walks onto it, standing underneath (`walkTo`'s note on
       this has the report and the reasoning, including the one caller for which
       the swap is kept - an interaction's `reach`-bounded approach, which
       swaps the tile itself before this search ever runs). Occupancy is a
       preference and nothing else here, which is what `blocked`'s own note
       above claims; this line used to be the exception to that claim. */
    if (!open(tx, tz) || (reach > 0 && Math.max(Math.abs(tx - sx), Math.abs(tz - sz)) <= reach)) {
      const near = nearestWalkable(world, tx, tz, opts.searchRadius ?? 12, blocked, plane);
      if (!near) return null;
      tx = near.x;
      tz = near.z;
    }
    if (sx === tx && sz === tz) return [{ x: sx, z: sz }];
  }

  /* ---------------------------------------------------------------- BFS ---
     The search map is the engine's own - 128x128 tiles, indexed by the tile
     itself - but this world is 128x192, so the scratch below is sized from
     `world.w`/`world.h` and the bounds test reads both (see the note above).

     Each node carries two numbers: `dist` (how many steps from the start) and
     `occ` (how many bodies that shortest route stands on). The queue is plain
     breadth-first, so `dist` is exact; `occ` is refined while the queue drains,
     which is exact too, because a tile at distance k is only ever relaxed by
     tiles at distance k-1, and every tile at k-1 is dequeued before any tile at
     k. So when a tile comes off the queue both numbers are final - reading them
     in that order is a lexicographic "shortest first, emptiest second", and a
     body can never cost the route a tile. */
  const W = world.w;
  const H = world.h;
  const total = W * H;
  scratchFor(total);
  const dist = _dist;
  const occ = _occ;
  const from = _from;
  const queue = _queue;
  const gen = _gen;
  /* the generation stamp instead of a per-call clear - see the scratch note */
  if (_searchId >= 0x7ffffffe) { gen.fill(0); _searchId = 0; }
  const searchId = ++_searchId;
  const startI = sz * W + sx;
  dist[startI] = 0;
  occ[startI] = 0;
  from[startI] = -1;
  gen[startI] = searchId;
  let head = 0;
  let tail = 0;
  queue[tail++] = startI;
  const cap = maxNodes > 0 ? maxNodes : total;
  let expanded = 0;
  let found = -1;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % W;
    const cz = (cur / W) | 0;
    if (goalTest ? goalTest(cx, cz) : (cx === tx && cz === tz)) { found = cur; break; }
    /* The queue is drained in non-decreasing `dist` (plain breadth-first), so
       the first node at the depth bound ends the search: every node still in
       the queue is at least as far from the start. This is the `opts.limit`
       bound - see the note on the options above. */
    if (limit > 0 && dist[cur] >= limit) break;
    if (++expanded > cap) break;
    const nd = dist[cur] + 1;
    for (let d = 0; d < 8; d++) {
      const ox = NEIGHBOURS[d][0];
      const oz = NEIGHBOURS[d][1];
      const nx = cx + ox;
      const nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const ni = nz * W + nx;
      const seen = gen[ni] === searchId;
      if (seen && dist[ni] !== nd) continue;
      if (!open(nx, nz)) continue;
      if (crossed && crossed(cx, cz, nx, nz)) continue;
      if (ox && oz) {
        /* a diagonal may not squeeze between two blocked tiles: both tiles it
           passes between have to be open (StepValidator#isBlockedSouthWest).
           Terrain only, as in the engine - a body in the corner is not a wall,
           and treating one as one is what turned a diagonal step into an
           L-shaped walk (see the note on `blocked` above). */
        if (!open(cx + ox, cz) || !open(cx, cz + oz)) continue;
      }
      const nocc = occ[cur] + (occAt ? occAt(nx, nz) : 0);
      if (!seen) {
        gen[ni] = searchId;
        dist[ni] = nd;
        occ[ni] = nocc;
        from[ni] = cur;
        queue[tail++] = ni;
      } else if (nocc < occ[ni]) {
        /* the same length, standing on fewer bodies: take this parent instead */
        occ[ni] = nocc;
        from[ni] = cur;
      }
    }
  }

  let goal = found;
  if (goal < 0) {
    /* Nothing reached the requested tile. A goal-*set* search has no "close
       enough" answer: its goal was "any tile beside the victim", and being near
       the victim was already true when the search began - a partial route there
       changes nothing, it just parks the attacker on some arbitrary tile (the
       one closest to the victim, which is on the far side of whatever fenced
       the victim in) and the chase then retries, silently and forever. Null
       says what is actually true: there is no tile to attack from, so the
       caller refuses the target (src/combat.js#tickCombat's "I can't reach
       that!"). */
    if (goalTest) return null;
    /* The nearest tile the search reached. The start counts, and that is
       deliberate: a goal the walker is already as close to as the terrain allows
       - a tile one step beyond a shut door, with the walker standing at the door
       - has the start as its closest reached node, so the answer is "nowhere to
       go" (null) rather than a step to one of the equally-near tiles beside it.
       The fallback is what walks you up to a door when you clicked across it
       from further away (the tile at the door is then the nearest reached node),
       and what takes you to the far bank of a river. */
    goal = closestApproach(dist, gen, searchId, W, H, tx, tz);
    if (goal < 0) return null;
  }
  return cutAtWaypoints(reconstruct(from, goal, W));
}

export function nearestWalkable(world, x, z, radius = 12, blocked = null, plane = 0) {
  if (world.isWalkable(x, z, plane) && !(blocked && blocked(x, z))) return { x, z };
  for (let r = 1; r <= radius; r++) {
    let best = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (!world.isWalkable(nx, nz, plane)) continue;
        if (blocked && blocked(nx, nz)) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = { x: nx, z: nz }; }
      }
    }
    if (best) return best;
  }
  return null;
}
