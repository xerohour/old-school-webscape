import { Actions, spawnGround, removeGround } from "./actions.js";
import { chat, UI } from "./ui.js";

/* ===========================================================================
   skydrop.js - the partyhat shower.

   Every five minutes a handful of partyhats falls out of the sky over the town
   and lands on the street as ordinary ground spawns: the same mesh a dropped
   item gets (src/actions.js#spawnGround -> src/locmodels.js), collected with the
   same "Take" click, and marked on the minimap by the same red ground-item dot
   everything else on the floor gets. Nothing here is a new kind of object - the
   only work is picking the tiles, starting the mesh high, and bringing it down.

   This is the one piece of this world that the 2007 game has no answer for at
   all: partyhats in the real game come out of crackers, one per cracker, and
   nothing in any client version has ever dropped them from the sky. The user
   asked for it by name, so it is written as a sandbox event rather than as a
   translation of content - and the hats themselves are still the real items
   (items.js#ARMOUR_TABLE, cache ids 1038-1048, real examine, real weight, the
   cache's own worn and ground models). */

/* Every five minutes, three to five of them. "A few, not a ton" - the six
   colours are drawn independently per hat, so a wave can repeat a colour. */
export const WAVE_MS = 5 * 60 * 1000;
export const WAVE_MIN = 3;
export const WAVE_MAX = 5;

/* How high a hat starts, in tiles, and how long it takes to come down. A tile
   is one world unit, so five tiles up is about four times the player's height -
   high enough to read as "from the sky" while the hat is still on screen for
   the whole fall at the game's own camera distance. The fall is `remaining =
   H * (1 - u^2)`, which is the shape gravity has: nothing at first, fastest at
   the end, and it lands exactly on the tile rather than near it. */
export const FALL_TILES = 5;
export const FALL_MS = 1400;

/* How many unclaimed hats the shower is allowed to leave lying about. A shower
   every five minutes is 3-5 hats, so a world nobody is picking them up in would
   otherwise walk the ground list (220 records, shared with every other drop)
   up to its cap over a few hours and start evicting other people's items. Thirty
   is eight waves' worth: enough that a hat is still there for anyone who
   answers the announcement, small enough that the shower can never crowd the
   ground out. Only *unclaimed* hats count, and only hats - a player's own drop
   is never touched. */
export const MAX_LIVE = 30;

/* The partyhats, in the cache's own id order rather than the wiki's colour
   order (1046 is the purple one and 1048 the white one - see the note in
   items.js#ARMOUR_TABLE). */
export const PARTYHATS = [
  "red_partyhat", "yellow_partyhat", "blue_partyhat", "green_partyhat",
  "purple_partyhat", "white_partyhat",
];

/* The town, as the rectangle its buildings and streets occupy (src/world.js:
   the bank at 58-67/47-55 down to the food store at 71-78/72-79, plus the
   clothes shop at 56-64/37-44 north of the lane). A hat lands on any tile in
   here that a player could stand on: walkable, not inside a building's
   footprint (a hat behind a counter is a hat nobody can pick up) and not
   under a prop. `TOWN` is a bounding box, not the town's own shape, so the
   rejections below are what actually keep the hats on the streets. */
export const TOWN = { x0: 44, z0: 35, x1: 82, z1: 82 };

let Sky = null;

/* The hats still in the air. Each is `{ mesh, x, z, baseY, t }`; the mesh is
   already in the scene and already a real ground item (see spawnGround), it is
   simply drawn `FALL_TILES` above the tile it belongs to and brought down. */
function falling() {
  return Sky.falling;
}

function frame(dt) {
  if (!Sky || !Sky.falling.length) return;
  const ms = dt * 1000;
  for (let i = Sky.falling.length - 1; i >= 0; i--) {
    const f = Sky.falling[i];
    f.t += ms;
    const u = Math.min(1, f.t / FALL_MS);
    f.mesh.position.y = f.baseY + FALL_TILES * (1 - u * u);
    /* a slow turn on the way down, so a fall in an otherwise empty street is
       still legible as an object and not a single pixel dropping */
    f.mesh.rotation.y += dt * 2.2;
    if (u >= 1) {
      f.mesh.position.y = f.baseY;
      f.mesh.rotation.y = 0;
      Sky.falling.splice(i, 1);
    }
  }
}

function tick(dt) {
  if (!Sky) return;
  Sky.since += dt * 1000;
  if (Sky.since >= WAVE_MS) {
    Sky.since = 0;
    spawnPartyWave();
  }
}

/* One tile a hat can land on: in the town box, walkable, not inside a building
   and not already carrying a prop (a tree, a counter, a well). The well and the
   plaza are deliberately still eligible - a hat on the plaza is the point. */
function tileFree(world, x, z) {
  if (x < TOWN.x0 || x > TOWN.x1 || z < TOWN.z0 || z > TOWN.z1) return false;
  if (!world.inBounds(x, z)) return false;
  if (world.isInsideBuilding && world.isInsideBuilding(x, z)) return false;
  if (world.objAt && world.objAt(x, z)) return false;
  return !!world.isWalkable(x, z);
}

/* The tiles a wave lands on: `n` distinct free tiles, chosen by rejection
   sampling over the town box. The attempt cap matters because the box is
   mostly buildings - if the town were ever emptied of walkable ground the wave
   is simply smaller rather than the loop spinning, and the count that actually
   landed is what the caller announces. */
function pickTiles(world, n) {
  const out = [];
  const seen = new Set();
  for (let tries = 0; tries < 600 && out.length < n; tries++) {
    const x = TOWN.x0 + Math.floor(Math.random() * (TOWN.x1 - TOWN.x0 + 1));
    const z = TOWN.z0 + Math.floor(Math.random() * (TOWN.z1 - TOWN.z0 + 1));
    const key = x + "," + z;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tileFree(world, x, z)) out.push([x, z]);
  }
  return out;
}

/* Drop a wave. `n` hats if given, otherwise the three-to-five the event rolls.
   Returns the number that actually landed, so a test (and the debug command)
   can tell an empty town from a working shower. */
export function spawnPartyWave(n) {
  const game = Sky && Sky.game;
  if (!game) return 0;
  const world = game.world;
  const count = Math.max(1, Math.min(12, n || WAVE_MIN + Math.floor(Math.random() * (WAVE_MAX - WAVE_MIN + 1))));
  /* Retire the oldest unclaimed hats first, so this wave cannot leave more than
     MAX_LIVE of them on the ground. A record that is no longer in
     `Actions.ground` was picked up (or taken by the global cap), so it drops out
     of the list here rather than being removed twice. */
  Sky.live = Sky.live.filter((g) => Actions.ground.includes(g));
  while (Sky.live.length + count > MAX_LIVE && Sky.live.length) {
    removeGround(Sky.live.shift());
  }
  const tiles = pickTiles(world, count);
  for (const [x, z] of tiles) {
    const id = PARTYHATS[Math.floor(Math.random() * PARTYHATS.length)];
    const g = spawnGround(id, 1, x, z);
    if (!g || !g.mesh) continue;
    Sky.live.push(g);
    const baseY = g.mesh.position.y;
    g.mesh.position.y = baseY + FALL_TILES;
    Sky.falling.push({ mesh: g.mesh, baseY, t: 0 });
  }
  if (tiles.length) {
    chat(tiles.length === 1 ? "A partyhat falls out of the sky over the town!"
      : "Partyhats fall out of the sky over the town: " + tiles.length + " of them!", "game");
  }
  return tiles.length;
}

/* Milliseconds until the next wave - the debug command's countdown. */
export function nextWaveIn() {
  return Sky ? Math.max(0, WAVE_MS - Sky.since) : 0;
}

/* Arms the shower: the clock and the falling meshes ride the game's own frame
   hook (the same one the minimap and the ghosts use), so a paused game pauses
   the shower too, and nothing here needs a timer of its own that could outlive
   the page. `::party` fires a wave by hand (src/ui.js#command) - it goes
   through `UI.actions` rather than an import, because ui.js is what
   src/actions.js and src/trade.js already use as the wiring point, and a
   module that both imports the interface and is imported by it is a cycle. */
export function initSkyDrops(game) {
  Sky = { game, since: 0, falling: [], live: [] };
  const priorFrame = game.hooks.onFrame;
  game.hooks.onFrame = (dt) => {
    if (priorFrame) priorFrame(dt);
    frame(dt);
  };
  const priorTick = game.hooks.onTick;
  game.hooks.onTick = (dt) => {
    if (priorTick) priorTick(dt);
    tick(dt);
  };
  UI.actions.skyDrop = (n) => spawnPartyWave(n);
  UI.actions.skyDropNext = () => nextWaveIn();
  return Sky;
}

/* Exposed for the tools/tests: the ground records whose meshes are still in the
   air. Empty once everything has landed. */
export function fallingHats() {
  return Sky ? Sky.falling.slice() : [];
}
