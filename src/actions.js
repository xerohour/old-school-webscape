import * as THREE from "https://esm.sh/three@0.160.0";
import { ITEMS, itemDef, itemName, isStackable, itemValue, MAX_STACK, SMITH_ITEMS, BOLT_SMITH, BOLT_FEATHER, BOLT_TIP_ATTACH, BOLT_TIP_FROM_GEM, BOLT_ENCHANT, BOLT_EFFECTS, BOW_FLETCH, BOW_STRING, CRAFT_RECIPES, TAN_FEES, PICKPOCKET, PICKPOCKET_STUN_MOVE, PICKPOCKET_STUN_CD, PICKPOCKET_PP_GRACE, STALLS, HERBS, POTIONS, POTION_BY_ITEM, POISON_VARIANTS, POISON_COAT, JEWELLERY, STRING_RECIPES, STRING_XP, POTTERY_SHAPE, POTTERY_FIRE, GLASSBLOWING } from "./items.js";
import { invAdd, invRemove, invRemoveAt, invCount, invFree, invHasAll, equippedId, useRingCharge, tutStageOf, setTutStage } from "./player.js";
import { addXp, levelOf, boosted, combatLevel, SKILLS } from "./skills.js";
import { walkTo, placeEntity, NPC_NAMES, playCastAnim, playEmote, playCapeEmote, followPlayer, stopFollowing, setNpcModel, npcModelKey, NO_MODS, clickMods, creatureBySpawnIx, npcDrawCX, npcDrawCZ, sayOverhead, freezeEntity } from "./game.js";
import { archetypeByKey, archetypeExamine } from "./archetypes.js";
import { nearestWalkable } from "./pathfind.js";
import { iconUrl, stackTierKey } from "./icons.js";
import { ITEM_KEY, locGeometry, locGlowGeometry, hasLoc } from "./locmodels.js";
import { stumpKeyFor, inUnderbelly, inMinigame, inTutIsleBox } from "./world.js";
import { courseAt, COURSE, COURSE_XP_LAP, AGILE_VERB, AGILE_NAME, ISLE } from "./island.js";
import { chat, mark, openModal, closeModal, openShop, openThormac, refreshThormac, openTanCounter, refreshTanCounter, openCtx, hideCtx, setTab, UI, cycleBook, cancelUse, acceptsAid, applyPotionEffects, closeOnWalk, closeBankOnTeleport, openAmountPrompt } from "./ui.js";
import { Net, netEmote, netSpell, netCast, netGrabFx, netGfx, netArrive, netStats, netMyId, netLoc, netGround } from "./net.js";
import { mgActive, voidRun, startRun, finishRun, openMgBoard } from "./minigame.js";
import { Fx, MARK_WALK, MARK_ACTION } from "./fx.js";
import { spellById, spellStatus, spendRunes, RUNE_ID, SPELL_TARGET, beginCast, flightSeconds, spellTravelSeconds, projDelayCycles, castReady, RING_ENCHANT, Cast, BOOKS, bookById, castAnimFor, bodyHeight, impactHeight, CENTRE_HEIGHT, TELEBLOCK_TICKS, MISSILE_IN_FLIGHT } from "./magic.js";
import { RUN_UNITS } from "./run.js";
import { Gfx } from "./gfx.js";
import { startDialogue, NPC_TALK, Dialogue, endDialogue, linesAsScreens, then, npc, player, say, opt } from "./dialogue.js";
import { skillcapeEmote } from "./emotes.js";
import { modelsReady, prepareModel } from "./models3d.js";
import { Frame } from "./gameframe.js";
import { refreshSharpText } from "./sharp.js";
import { DesignScreen } from "./design.js";
import { QUESTS, questState, setQuestState, addQuestPoints, sheepShearerWool, setSheepShearerWool, allQuestsDone, QUEST_STARTED, QUEST_COMPLETE, SHEEP_SHEARER_WOOL, SHEEP_SHEARER_COINS, SHEEP_SHEARER_XP } from "./quests.js";

const TICK = 0.6;

const TREE_LOGS = {};
const ORE_ITEMS = {};
const RAW_TO_COOKED = {};
const FISH_BY_SPOT = {};
const FISH_TOOL_ITEM = {};
const TOOL_IDS = {};
const AXES = [];
const PICKS = [];
/* Every empty vessel this world can fill with water, off the items' own
   `fillFrom` field: `{ emptyId: fullId }`. The field is what the batch-water
   fill (Humidify, and any future well/bucket station) reads, so a vessel added
   to src/items.js with a `fillFrom` starts being filled by the spell with no
   change here - exactly how `RAW_TO_COOKED` picks up a new food. */
const WATER_VESSELS = {};

for (const [id, d] of Object.entries(ITEMS)) {
  if (d.tree) TREE_LOGS[d.tree] = id;
  if (d.rock) ORE_ITEMS[d.rock] = id;
  if (d.kind === "axe" || d.chops) AXES.push(id);
  if (d.kind === "pickaxe") PICKS.push(id);
  if (d.tool) {
    TOOL_IDS[d.tool] = id;
    if (d.toolSkill === "fishing") FISH_TOOL_ITEM[d.tool] = id;
  }
  if (d.spots && d.kind === "fish") {
    for (const sp of d.spots) {
      if (!FISH_BY_SPOT[sp]) FISH_BY_SPOT[sp] = [];
      FISH_BY_SPOT[sp].push({ id, xp: d.xp || 0, levelReq: d.levelReq || 1, tool: d.tool });
    }
  }
  if (d.cookOf) {
    if (d.heal) RAW_TO_COOKED[d.cookOf] = id;
    else RAW_TO_COOKED[id] = d.cookOf;
  }
  if (d.fillFrom) WATER_VESSELS[d.fillFrom] = id;
}
for (const k of Object.keys(FISH_BY_SPOT)) {
  const seen = new Set();
  FISH_BY_SPOT[k] = FISH_BY_SPOT[k].filter((f) => !seen.has(f.id) && seen.add(f.id));
  FISH_BY_SPOT[k].sort((a, b) => a.levelReq - b.levelReq || a.xp - b.xp);
}

const LOG_FM_XP = [40, 60, 90, 135, 202.5, 303.8];
const LOG_ORDER = ["logs", "oak_logs", "willow_logs", "maple_logs", "yew_logs", "magic_logs"];

export const Actions = {
  game: null,
  act: null,
  ground: [],
  groundAt: new Map(),
  depleted: [],
  fires: [],
  traps: [],
  anim: 0,
  /* things the game has been asked to do after a delay, in game ticks - the
     teleport that has to wait for the spin to finish, an item that arrives with
     a spell graphic. Ticked on the 600ms game tick, not on wall-clock time, so
     a paused game does not teleport you behind your back. */
  pending: [],
  /* the same thing on the *render* clock: work that has to land on a moment in
     a pose rather than on a tick boundary. Only the teleport's jump uses it
     (see `holdForTeleport`); one game tick is 600ms, which is far too coarse
     to catch the 80ms frame a caster's model finishes collapsing on. */
  frames: [],
  groundCap: 220,
  aimLog: [],
  /* Sticky chop/mine focus (see `aimBias`): null, or "chop"/"mine" once the
     player has proven they are locked in. Serves hysteresis, not the log -
     entering is hard (ten yields) and leaving takes real switching (the rival
     reaching ten flips straight over; focus fading below four releases). */
  aimMode: null,
  /* Installed by src/combat.js#initCombat and src/combat.js#initCombat's
     guard-call. `strikePlayer` is the blow-lands-on-the-player routine (a
     failed pickpocket's stun damage goes through it so it can kill you
     properly); `guardCalled` is the market's own alarm, rung when a stall is
     robbed inside a guard's sight. Both are hooks because actions.js is the
     module combat.js imports, never the other way round. */
  strikePlayer: null,
  guardCalled: null,
};

/* Run `fn` after `ticks` game ticks (1 tick = 600ms). */
export function afterTicks(ticks, fn) {
  Actions.pending.push({ left: Math.max(0, ticks | 0), fn });
}

/* Run `fn` after `seconds` of *rendered* time. This is not the game clock:
   `tickActionFrames` is driven by the frame loop's own `dt` (main.js#onFrame,
   the same clock src/models3d.js animates on), so a paused game runs neither
   the tick clock nor this one. It exists so a beat that is part of a *pose* can
   be hit to the frame - see `holdForTeleport`. */
export function afterSeconds(seconds, fn) {
  Actions.frames.push({ left: Math.max(0, seconds), fn });
}

export function tickActionFrames(dt) {
  for (let i = Actions.frames.length - 1; i >= 0; i--) {
    const w = Actions.frames[i];
    w.left -= dt;
    if (w.left > 0) continue;
    Actions.frames.splice(i, 1);
    w.fn();
  }
}

let G = null;
let P = null;

function tk(x, z) {
  return x + "," + z;
}
function skillLvl(id) {
  /* The boosted level, not the base one: a temporary boost is what the skill's
     own checks read in the live game (a Woodcutting boost really does improve
     your odds and clear a level requirement), which is what makes the dragon
     axe's Lumber Up special worth pressing. What you may *wield* is a base-level
     rule and is asked of `levelOf` in src/player.js#canEquip instead. */
  return boosted(G.ps.skills, id);
}
function pct(a) {
  return Math.max(0, Math.min(1, a));
}
function distT(x, z, e) {
  return Math.hypot(x + 0.5 - e.x, z + 0.5 - e.z);
}
function nearTile(act, e, r) {
  const tx = Math.round(e.x - 0.5);
  const tz = Math.round(e.z - 0.5);
  return Math.max(Math.abs(tx - act.x), Math.abs(tz - act.z)) <= r;
}

/* ------------------------------------------------- acting across a counter

   The bank's counter and its booth are solid, and the banker stands behind them
   - and in the live client you talk to (and bank with) a banker across the
   counter, from the customer's side, exactly as you do through a bank booth.
   Walking round to the staff side, which is what a plain one-tile reach makes
   you do here, is not something a player ever does.

   `npcReachTile` is that rule for one creature: standing beside it is always
   enough, and so is standing beside a counter or a booth that the creature is
   itself standing beside. It is used as BOTH the arrival test and the walk-in's
   own goal set (`walkTo`'s `opts.goalTest`), so the route the player walks and
   the test that ends it can never disagree - the walk stops on the tile the
   interaction was planned for. */
const COUNTER_TYPES = new Set(["counter", "booth"]);
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function npcReachTile(npc) {
  const nx = Math.floor(npc.x);
  const nz = Math.floor(npc.z);
  return (x, z) => {
    if (Math.max(Math.abs(x - nx), Math.abs(z - nz)) <= 1) return true;
    for (const [ox, oz] of SIDES) {
      const cx = x + ox;
      const cz = z + oz;
      if (Math.max(Math.abs(cx - nx), Math.abs(cz - nz)) > 1) continue;
      const o = G.world.objAt(cx, cz);
      if (o && COUNTER_TYPES.has(o.t)) return true;
    }
    return false;
  };
}

/* Is the player standing where this activity may be run from? Normally within
   `r` tiles of its target; an activity carrying its own `reachTest` (the NPC
   across the counter above, or the four sides of a rock) is judged by that
   **and nothing else**. `nearTile` is Chebyshev, the eight tiles including the
   corners, so leaving it as a fallback quietly undid every orthogonal reach
   test - a rock click answered from a corner because `nearTile` said the corner
   was near. A reach test is a superset of "beside" for the activities that bring
   one (see `npcReachTile`, which accepts the whole eight), so trusting it costs
   those nothing. */
function actNear(act, e, r) {
  if (act.reachTest) return !!act.reachTest(Math.round(e.x - 0.5), Math.round(e.z - 0.5));
  return nearTile(act, e, r);
}

/* (Re)plan an activity's walk-in: to its target tile, or - when the activity
   carries a reach test - to the nearest tile that passes it. An activity may
   also carry a `walkTest`: the tile the walk itself prefers (a ground pile's
   own tile - the user's rule, 2026-10-09: a pickup walks onto the pile and
   only takes from the side tiles when its own tile cannot be stood on). The
   arrival test stays the reach test either way, so a walker that cannot move
   at all still works from where it stands. */
function actWalk(act, e) {
  if (act.walkTest) {
    if (walkTo(e, G.world, act.x, act.z, 0, NO_MODS, false, { goalTest: act.walkTest })) return true;
  }
  if (act.reachTest) return walkTo(e, G.world, act.x, act.z, 0, NO_MODS, false, { goalTest: act.reachTest });
  return walkTo(e, G.world, act.x, act.z, 1, NO_MODS);
}
function invFreeSlots() {
  return invFree(G.ps);
}

/* --------------------------------------------------------------- tools */

function bestTool(list, valKey) {
  const ps = G.ps;
  let best = null;
  let bestV = 0;
  const consider = (id) => {
    const d = ITEMS[id];
    if (!d) return;
    const v = d[valKey] || 0;
    if (v > bestV) { bestV = v; best = id; }
  };
  for (const s of ps.inv) if (s && list.includes(s.id)) consider(s.id);
  for (const s of Object.values(ps.equip)) if (s && list.includes(s.id)) consider(s.id);
  return best;
}

/* The axe in the player's *hand*, or null. `equippedId` is the same read the
   combat code makes of the weapon slot, so "the equipped weapon" here means
   exactly what it means everywhere else. The test is the item's own tool skill
   rather than its name: every real axe - bronze through rune, plus the dragon
   axe the pack predates - carries `toolSkill: "woodcutting"`, and every
   battleaxe-kind weapon is marked `chops: true` (src/items.js), because the
   real game lets a battleaxe fell a tree like any other axe. */
function axeInHand() {
  const id = equippedId(G.ps, "weapon");
  const d = id ? ITEMS[id] : null;
  return d && (d.kind === "axe" || d.toolSkill === "woodcutting" || d.chops) ? id : null;
}

/* --------------------------------------------------------------- work poses

   Every skill plays the pose the cache authors for it (see
   src/tools/cache-bake/bake.mjs#SKILL_ANIMS) rather than the weapon swing the
   game used to borrow: the real client cuts a tree with a different animation
   for a bronze axe than for a rune one, and the tool decides which. The two
   tables below are the only poses that depend on what the player is holding;
   every other one is named at its call site. */
const TOOL_POSES = {
  bronze_axe: "wc_bronze", iron_axe: "wc_iron", steel_axe: "wc_steel",
  black_axe: "wc_black", mithril_axe: "wc_mithril", adamant_axe: "wc_adamant",
  rune_axe: "wc_rune",
  /* the dragon axe is a 2005 tool the pack predates, so it swings the rune
     sequence - the top tier the cache authors */
  dragon_axe: "wc_rune",
  /* Battleaxes chop too (see `axeInHand`), and they swing the woodcutting
     pose of the metal they're forged from, capped at rune like the dragon axe.
     White is a cosmetic recolour of black, so it uses black's pose. */
  bronze_battleaxe: "wc_bronze", iron_battleaxe: "wc_iron",
  steel_battleaxe: "wc_steel", black_battleaxe: "wc_black",
  white_battleaxe: "wc_black", mithril_battleaxe: "wc_mithril",
  adamant_battleaxe: "wc_adamant", rune_battleaxe: "wc_rune",
  dragon_battleaxe: "wc_rune", dharoks_greataxe: "wc_rune",
  /* Every pickaxe swings the cache's own mining animation for it - sequence 625
     for bronze through 624 for rune (bake.mjs#SKILL_ANIMS). The tier is
     nominal in *this* cache: all six sequences carry byte-identical frame ids
     and frame lengths (checked against the cache, see the thirty-third report
     in TODO.md), so the table is faithful rather than cosmetic - the client
     picks the sequence by the pickaxe in hand, and this world's cache happens to
     author one swing for all of them.

     **This is where `mine_old` (642) was, and the history matters** because the
     pose was swapped in on request and then swapped back out on request, and
     both times for a reason worth keeping:
       * 2026-09-23 (first): *"i want you to use the OLD mining animation (npcs
         can still use the current animation they are using), however the mining
         animation for the player should be the old one, its a very simple
         animation"* - so every pickaxe was mapped to 642. It is *not* a simple
         animation: RuneLite's `AnimationID` names 642 `MINING_DRAGON_PICKAXE_
         UPGRADED` (and the preserved 2004/2005 content pack, which predates that
         reuse, names it `human_mining_pickaxe_handle`) - it is the **upgraded
         dragon pickaxe's** swing, the one flourish in the game that throws the
         pickaxe up over the head, six frames and 31 cycles (0.62 s) per swing.
       * 2026-09-23 (second), the user playing it: *"i think youre actually
         swinging the gravity in the wrong direction, if you take a look at it,
         youre putting the majority of the actual swing towards over your head,
         thats wrong, the weight of the piackaxe is stupposed to strike the
         rock, not be above you r head, also tis very choppy idk"*. Measured at
         the model, they were right: of 642's 31 cycles the pickaxe is above the
         head for 23 of them (74%), its centroid is at head height or higher for
         61%, the *fastest* motion in the loop is the 40 ms raise (frame 0 into
         frame 1) while the descent takes 340 ms, and its lowest frame still
         holds the pickaxe at chest height. The tiered sequences are the
         opposite: 439 cycles of a swing that keeps the pickaxe out at the rock,
         never above the head in its first 116 cycles (2.3 s - the whole of a
         short mining session), with the occasional bigger swing later in the
         loop, and every frame 4 cycles (80 ms) so the interpolation has nothing
         to snap across. That is the swing the user is describing, and it is the
         one the cache authors for a pickaxe, so the player swings it again.

     642 stays baked (the model carries it, and bake.mjs#SKILL_ANIMS keeps the
     archaeology) and nothing swings it now - it is there for a creature that
     should look like it is flailing a pickaxe handle, which is what the 2005
     pack authored it for. */
  bronze_pickaxe: "mine_bronze", iron_pickaxe: "mine_iron",
  steel_pickaxe: "mine_steel", mithril_pickaxe: "mine_mithril",
  adamant_pickaxe: "mine_adamant", rune_pickaxe: "mine_rune",
};

/* Fishing is one pose per method, so the tool in hand picks it. */
const FISH_POSES = {
  net: "fish_smallnet", rod_bait: "fish_cast", fly: "fish_cast",
  harpoon: "fish_harpoon", cage: "fish_cage",
  bignet: "fish_bignet", oily: "fish_cast", vessel: "fish_cage",
};

/* Raise a working pose, unless the same one is already playing, and return how
   many seconds of it are left to run. `tool` is the item the pose is performed
   with, which the hand holds in place of the equipped weapon for as long as the
   pose lasts (src/game.js#wornKeysFor reads `Game.player.castTool`). The
   fishing tools ride along too now that the bake carries their wield models
   (src/models/held.json) - an item with no baked worn model still cannot be
   drawn, and simply keeps the weapon where it is (src/game.js#wornKeysFor's
   `hasHeldModel` gate).

   A work action re-runs every few ticks
   (`act.timer`), and re-arming the pose each time would snap it back to its
   first frame: the mining sequences are 439 cycles (8.8 seconds, several
   swings), so a fresh arm every 1.8 seconds would show the first swing over and
   over and never the rest. Arming once lets the authored sequence play out to
   its end and restarts it then.

   The seconds returned are what lets a caller whose attempt is shorter than its
   pose - fishing, whose cast is 3.52s against a 1.8s swing - hold the next
   attempt back until the pose it just raised has finished, so the character
   keeps fishing instead of standing idle between casts. A caller that ignores
   the return keeps the old fixed-timer behaviour.

   `loop` keeps a pose raised across attempts (the model wraps it back to back
   - see game.js#playCastAnim) with `WORK_POSE_HOLD` slack refreshed on every
   attempt. It is for the mining sequence, whose 8.8 s run outlives the roll
   cycle. Woodcutting deliberately does not loop: its 0.8 s chop plays once
   per 1.8 s roll with the axe resting between, and looping it showed two
   swings per roll.

   `tail` is the third thing a looping work pose needs, and it is about the very
   first frame rather than the last. Every one of these cache sequences opens on
   a *reaching* pose and settles back to the tool-at-rest pose in its final
   frame - the mining swing is 107 frames over 439 cycles and its first four
   (16 cycles, 0.32 s) are the lean and reach out to the rock, while its last
   four are the settled stance the body comes to rest in - so a loop armed at
   the top of the sequence drops the body straight into that reach, and what the
   player actually sees is the swing appear *already reaching out* (the user's
   report, 2026-09-23: *"the mining animation is starting in the middle of the
   animation"*, said of the old `mine_old` loop, whose first frame was a 40 ms
   flick from the pickaxe low). Asking for `tail` makes the model enter the loop
   at the start of that final frame instead - the model's own rule,
   src/models3d.js#update - so the first thing drawn is the tool at rest, and
   the swing is then seen from its wind-up through its strike, which is the
   whole of it. */
const WORK_POSE_HOLD = 5;
function workAnim(name, loop, tool, tail) {
  const p = G.player;
  if (!name) return 0;
  /* Which tick this activity last asked for this pose. `tickActions` lets a
     looping work pose outlive the activity for exactly the tick named here, so a
     session that ends on the attempt that raised - or refreshed - its swing
     still draws that swing once before the pose is taken away (see the dropping
     rule there, and `raiseMineSwing`). */
  p.castAnimTick = G.tickCount;
  if (p.castLeft > 0 && p.castAnim === name) {
    if (loop) { p.castLoop = true; p.castLeft = Math.max(p.castLeft, WORK_POSE_HOLD); }
    /* the same pose asked for again keeps the same tool in the hand - the
       activity re-asks on every attempt, and the item it names cannot have
       changed under a pose it never dropped */
    p.castTool = tool || null;
    return p.castLeft;
  }
  playCastAnim(p, name, loop ? WORK_POSE_HOLD : undefined, loop, tool, tail);
  return p.castLeft;
}

/* --------------------------------------------------------- the world ledger

   The client half of the shared world (index.html's ledger block is the server
   half, src/net.js#netLoc/#netGround the wire). Everything here is about state
   that belongs to the *world* rather than to a player: a tile's own condition (a
   door's leaf, a tree's stump, a rock's ore, a stall's shelf, a lit fire) and
   the items lying on the ground. All of it used to be private scenery - every
   client built its own copy of a deterministic world and then mutated it alone -
   which is why two players in one doorway looked at two different doors (the
   user's report, 2026-09-25).

   Three rules hold it together. **The caller applies first, then speaks**: every
   local change still goes through the function it always did and then reports,
   so nothing about a single-player game changes and, with no socket, the report
   is a silent no-op. **A record is an absolute state, never a delta** - a tile
   has bits, a pile has a count - so the server's echo of our own change and a
   ring snapshot re-applied can only ever say what the world already says.
   And **a remote change is applied through the same code the local one used**,
   with `remoteApply` set so the application cannot bounce back onto the wire.

   Every kind of tile travels: a tree another player fells is a stump here the
   moment the record lands, and it grows back here when the world says so, no
   matter which client's clock armed the timer. A resource is one thing in one
   place for everybody, exactly like a door or a fire (the user's rule,
   2026-09-26: two players chopping one tree must see the same tree - one of them
   felling it takes it from both, and the chop option is gone for both until it
   grows back).

   The bits are the tile's whole story, and must match index.html's own numbers:

     LOC_OPEN   a door or a lid is open
     LOC_DEAD   a resource is used up (a stump, an empty rock, a looted stall)
     LOC_FIRE   a lit fire is standing on the tile */

const LOC_OPEN = 1, LOC_DEAD = 2, LOC_FIRE = 4;
const WORLD_CHUNK = 16;
const TRAP_OPEN_SECS = 120;
const TRAP_SEEN_TILES = 20;

/* True while a *remote* record is being applied. The apply paths run through
   the very functions the player's own click runs through - that is the point of
   them - so without this a change from the server would be reported straight
   back to the server, and two clients would talk to each other forever. */
let remoteApply = false;
let quietGround = false;

/* A tile's bits, read off the object the world really holds - one function, so
   the reporter and the applier can never disagree about what a stump is. */
function locBits(o) {
  if (!o) return 0;
  let bits = 0;
  if (o.open) bits |= LOC_OPEN;
  if (o.stump || o.empty || o.looted || o.picked) bits |= LOC_DEAD;
  if (o.t === "fire") bits |= LOC_FIRE;
  return bits;
}

/* Tell the world what a tile is now. `remain` is how long the record should
   live, in seconds (0 = until something else changes it): the rest of a tree's
   or a rock's respawn, the rest of a fire's ninety. Called after the local
   change, never before - a click must not wait on a round trip.

   A tile with nothing on it reports *no bits*, which is how a burnt-out fire is
   announced: its object is gone by the time the clock takes it, so the tile
   itself is the only thing left to describe. */
function reportLoc(x, z, remain) {
  if (remoteApply) return;
  const o = G.world.objAt(x, z);
  netLoc(x, z, locBits(o), o && o.hp != null ? o.hp : 0, remain || 0);
}

/* The same for a pile on the ground, told as the pile's *new total* for that
   item on that tile - read back off the world rather than tracked alongside it,
   so a merge, a split and a pickup all report the same way and none of them can
   drift from what is drawn. `base` is the pile's total before this change,
   which is what the take-priority rule judges fights on (see
   `trackGroundTake`): callers pass the pre-change total, never a fresh read. */
function noteGround(x, z, id, base) {
  if (remoteApply || quietGround) return;
  let total = 0;
  for (const g of groundItemsAt(x, z)) if (g.id === id) total += g.qty;
  netGround(x, z, id, Math.min(MAX_STACK, total), base == null ? total : base);
}

/* The local clock for a record that has a deadline. The same two lists the
   local clicks write into (`Actions.depleted` for a resource, `Actions.fires`
   for a fire) are the ones that put the world back, so whichever client is
   standing there when the timer runs out is the one that restores it and says
   so - see `restoreResource` and the fire clock in `tickActions`. An entry is
   *replaced* rather than added, because the echo of our own felling lands here
   too and two timers for one stump would restore it twice. */
function armWorldClock(x, z, o, bits, remain) {
  const left = Math.max(0, remain | 0);
  const keepD = Actions.depleted.filter((d) => d.x !== x || d.z !== z);
  Actions.depleted.length = 0;
  for (const d of keepD) Actions.depleted.push(d);
  if (bits & LOC_DEAD) {
    const kind = o && o.t === "tree" ? "tree" : o && o.t === "rock" ? "rock" : o && o.t === "stall" ? "stall" : o && o.t === "flax" ? "flax" : null;
    if (kind) Actions.depleted.push({ x, z, at: (G.time || 0) + left, kind });
  }
  const keepF = Actions.fires.filter((f) => f.x !== x || f.z !== z);
  Actions.fires.length = 0;
  for (const f of keepF) Actions.fires.push(f);
  if (bits & LOC_FIRE) Actions.fires.push({ x, z, expire: (G.time || 0) + left });
}

/* One tile's state arriving from the world (src/net.js#S_WORLD, and the records
   inside a ring snapshot). It is the same change the local click makes, down to
   the chunk rebuild, so the two ends really are looking at the same leaf; what
   it does *not* run is any of the machinery around it - the walk, the reach
   rule, the click, the animation - because the player on the other end already
   did that and this client only has to watch. A record with no bits is the
   world's default, which is what a ring reset lays down. */
function applyLocState(x, z, bits, hp, remain) {
  const w = G.world;
  const had = w.objAt(x, z);
  /* A fire is an object rather than a flag (`lightFire` makes it and the tick's
     own clock takes it away), so it is the one record that can create and
     destroy the thing standing on the tile. */
  const fire = !!(bits & LOC_FIRE);
  if (had && had.t === "fire" && !fire) {
    w.delObj(x, z);
    G.view.rebuildChunkAt(x, z);
  } else if (!had && fire) {
    w.setObj(x, z, { t: "fire" });
    G.view.rebuildChunkAt(x, z);
  }
  const o = w.objAt(x, z);
  let changed = false;
  if (o && o.t !== "fire") {
    /* Everything else is a flag on an object that is already there. `changed`
       is what keeps a record that says what the tile already says - which is
       every echo of our own change - from rebuilding a chunk for nothing. */
    if (o.t === "door" || o.t === "coffin") {
      const open = !!(bits & LOC_OPEN);
      if (!!o.open !== open) {
        o.open = open;
        changed = true;
        /* A door's leaf is its own mesh outside the chunks (scene.js#_buildDoors),
           so the chunk rebuild below moves nothing - the leaf has to swing here.
           Without this a state arriving from the world (a ring snapshot after a
           reload, or another player's hand) sets the flag while the mesh stays
           shut, and the menu offers Close on a door that reads closed. */
        if (o.t === "door" && G.view) G.view.setDoorOpen(o, open);
      }
    }
    if (o.trapdoor) {
      const open = !!(bits & LOC_OPEN);
      if (!!o.open !== open) setTrapdoor(x, z, open);
    }
    const dead = !!(bits & LOC_DEAD);
    if (o.t === "tree" && !!o.stump !== dead) { o.stump = dead; changed = true; }
    else if (o.t === "rock" && !!o.empty !== dead) { o.empty = dead; changed = true; }
    else if (o.t === "stall" && !!o.looted !== dead) { o.looted = dead; changed = true; }
    else if (o.t === "flax" && !!o.picked !== dead) { o.picked = dead; changed = true; }
    /* A tree's log count is part of its state (a felled tree grows back with
       the count it had - see `restoreResource`), so the count travels too. */
    if (o.t === "tree" && hp) {
      if (o.hpMax == null) o.hpMax = hp;
      if (o.hp !== hp) { o.hp = hp; changed = true; }
    }
    if (changed) {
      w.setObj(x, z, o);
      /* A coffin's lid is one model per 2x2 block, standing on its west/north
         tile, which may be the neighbouring chunk - so the whole block is
         rebuilt rather than the tile that changed. */
      if (o.t === "coffin") {
        for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) G.view.rebuildChunkAt(x - dx, z - dz);
      } else {
        G.view.rebuildChunkAt(x, z);
      }
    }
  }
  armWorldClock(x, z, o, bits, remain);
}

/* A tile's state from the server, from outside this module (wired in
   src/main.js). */
export function remoteLocState(x, z, bits, hp, remain) {
  remoteApply = true;
  try {
    applyLocState(x, z, bits, hp, remain);
  } finally {
    remoteApply = false;
  }
}

/* A pile on the ground from the server: the tile's pile of that item is
   *replaced* by the count the record carries, rather than adjusted by it, which
   is what makes a re-applied record safe. The pile is re-laid through
   `spawnGround` (so the stack tiers, the meshes and the under/over ordering are
   all built the way a local drop builds them) with `remoteApply` set, so none
   of it is reported back.

   `from` is the sender's connection id (null for a ring snapshot, which names
   none): it runs the take-priority rule (see `trackGroundTake`). Our own echo
   confirms a tracked take; a foreign record against an unconfirmed take fought
   off the same base and the lower id keeps the pile; a foreign record against
   a confirmed take came off our remainder and is adopted with the tracking
   rebased. */
export function remoteGroundState(from, x, z, id, qty, base) {
  remoteApply = true;
  try {
    const k = groundTakeKey(x, z, id);
    let take = groundTakes.get(k);
    if (take && (G.time || 0) - take.at > GROUND_TAKE_WINDOW) { groundTakes.delete(k); take = null; }
    const me = netMyId();
    if (take && from != null && from === me) {
      if (qty === take.reported && !take.lost) {
        take.confirmed = true;
        /* A ring snapshot can wipe and re-lay a pile our report has not
           reached yet: the echo confirms the take, so the ground is healed to
           match it rather than left disagreeing with the pack. */
        if (pileTotal(x, z, id) !== qty) applyGroundRecord(x, z, id, qty);
      }
    } else if (take && from != null && from !== me && base != null && base === take.base) {
      /* Same base: a same-tick race off the same pile - or a late record from
         one already fought. An already-lost take ignores them all: the
         winner's truth stands and every same-base record is stale against it.
         Otherwise the lower id keeps the pile: the loser reverts and lays the
         winner's record down, the winner keeps what is already on the ground
         and says nothing further. */
      if (take.lost) return;
      const mineFirst = me != null && me >= 0 && from >= 0 ? me < from : true;
      if (!mineFirst) {
        revertGroundTake(x, z, id, take, qty);
        take.got = 0;
        take.lost = true;
        return;
      }
      return;
    } else if (take && from != null && from !== me) {
      /* Any other base: sequential - a take off our remainder, a drop onto
         it, or a stale record from before our take. Adopted, and the tracking
         rebased onto the new truth; the take's own base is left alone, so a
         late same-base record still reads as the stale racer it is. */
      take.reported = qty;
      take.at = G.time || 0;
    }
    applyGroundRecord(x, z, id, qty);
  } finally {
    remoteApply = false;
  }
}

/* The whole ledger of the 3x3 chunks this client has just walked into (or been
   handed on entering the world) - index.html's S_WORLD_SNAP, which the server
   sends on every chunk change.

   The ring is *reset* first and the records laid over it second, which is the
   whole point of the packet being complete rather than a diff: anything this
   client still believed about these chunks that the server does not say is
   something the server does not know, and that means the world's default. It is
   therefore the repair as well as the introduction - a server that has
   restarted, a change we never heard because we were a chunk away, a client
   that has been standing still while the world moved on. */
export function applyWorldRing(cx, cz, records) {
  remoteApply = true;
  try {
    const x0 = Math.max(0, (cx - 1) * WORLD_CHUNK);
    const x1 = (cx + 2) * WORLD_CHUNK - 1;
    const z0 = Math.max(0, (cz - 1) * WORLD_CHUNK);
    const z1 = (cz + 2) * WORLD_CHUNK - 1;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const o = G.world.objAt(x, z);
        /* A tile holding a change the ledger should know about is laid back to
           the world's default first, and the records put over it second - so a
           tile the server says nothing about is bare again, however this client
           last saw it. */
        if (o && (o.t === "fire" || o.open || o.stump || o.empty || o.looted)) applyLocState(x, z, 0, 0, 0);
        const arr = groundItemsAt(x, z);
        if (arr.length) for (const g of arr.slice()) removeGround(g);
      }
    }
    for (const r of records) {
      if (r.kind === 1) applyLocState(r.x, r.z, r.bits, r.hp, r.remain);
      else if (r.kind === 2) {
        for (const g of groundItemsAt(r.x, r.z).slice()) if (g.id === r.id) removeGround(g);
        if (r.qty > 0) spawnGround(r.id, r.qty, r.x, r.z);
        /* A snapshot that names our reported remainder confirms the take it
           reports - the server has it, so no later record of it is a race. */
        const take = groundTakes.get(groundTakeKey(r.x, r.z, r.id));
        if (take && !take.lost && r.qty === take.reported) take.confirmed = true;
      }
    }
    try { applyTutPhase(); } catch (e) {}
  } finally {
    remoteApply = false;
  }
}

/* --------------------------------------------------------------- ground items */

/* How long a drop lies before it vanishes: ten minutes, the live game's own
   rule. The clock is per pile (tile + item): the first object down starts it
   and later drops joining the pile do not refresh it, and the server keeps the
   same clock (index.html's GROUND_DESPAWN_SEC) so every client agrees. */
const GROUND_DESPAWN_SEC = 600;

/* True while the despawn sweep below is removing old piles. A removal normally
   reports itself to the world (removeGround -> noteGround), but an expiry is
   not news from this client: the server's own clock says the same thing, so
   this only takes the local models off. */

/* A dropped item is the item's own cache model standing on the tile - the same
   model the 2007 client draws for a ground item (see
   src/tools/cache-bake/itemmodels.mjs) - not a billboarded inventory icon. The
   geometry comes through the scenery pipeline, so faces are lit the client's
   way and identical items share one cached buffer. */
function groundMesh(id) {
  const geom = locGeometry(ITEM_KEY + id, 0);
  if (!geom) return null;
  /* A drop lies almost coplanar with its tile, so the depth buffer alone
     cannot always tell them apart and the tile shimmers through the item. The
     clone below is the same material with a polygon offset, which pulls the
     drop decisively in front whatever the camera distance; one clone serves
     every drop. (The snakeskin's own orange backing quad and its coplanar
     detail layer are repaired at bake time instead — see
     src/tools/cache-bake/item-fixes.mjs — since no offset can fix coplanar
     geometry.) */
  if (!G.view.dropMat || G.view.dropMat.userData.base !== G.view.locMat) {
    G.view.dropMat = G.view.locMat.clone();
    G.view.dropMat.userData.base = G.view.locMat;
    G.view.dropMat.polygonOffset = true;
    G.view.dropMat.polygonOffsetFactor = -2;
    G.view.dropMat.polygonOffsetUnits = -2;
  }
  G.view.dropMat.depthWrite = false;
  const mesh = new THREE.Mesh(geom, G.view.dropMat);
  mesh.renderOrder = 2;
  /* A drop with translucent faces (potion glass, gems, ghost robes) draws them
     blended at their authored alpha (see src/locmodels.js#locGlowGeometry) -
     without this the glow pass split would leave the drop's glass out. The
     group keeps the one-mesh contract every caller relies on. */
  const ggeom = locGlowGeometry(ITEM_KEY + id, 0);
  if (!ggeom) return mesh;
  if (!G.view.dropGlowMat || G.view.dropGlowMat.userData.base !== G.view.locGlowMat) {
    G.view.dropGlowMat = G.view.locGlowMat.clone();
    G.view.dropGlowMat.userData.base = G.view.locGlowMat;
    G.view.dropGlowMat.polygonOffset = true;
    G.view.dropGlowMat.polygonOffsetFactor = -2;
    G.view.dropGlowMat.polygonOffsetUnits = -2;
  }
  G.view.dropGlowMat.depthWrite = false;
  const glow = new THREE.Mesh(ggeom, G.view.dropGlowMat);
  glow.renderOrder = 3;
  const grp = new THREE.Group();
  grp.add(mesh);
  grp.add(glow);
  return grp;
}

/* The ground model a stack of `qty` uses. A stackable item draws the same tier
   art on the ground as it does in the pack: the count -> item pairs are the
   client's own, and the bake put one model per tier in src/models/items.json
   (see src/icons.js#stackTierKey for the walk). So two coins on a tile are the
   two-coin pile, not the base model every size used to share. Only tiers that
   were actually baked as models are used; the rest - the 1-count tier, whose
   art *is* the base model, and every stack with no baked tiers at all - fall
   back to the item's own model, which is what the client draws for them too. */
export function groundKeyFor(id, qty) {
  if (!isStackable(id)) return id;
  const key = stackTierKey(id, qty);
  if (key && key !== id && hasLoc(ITEM_KEY + key)) return key;
  return id;
}

/* Re-dress a stack that has just changed size (a drop joining a pile, or part
   of one being picked up). The mesh is the only per-stack state, so it is
   rebuilt in place - and only when the tier actually changes, which for most
   stacks is never. */
function syncGroundMesh(g) {
  const key = groundKeyFor(g.id, g.qty);
  if (g.meshKey === key) return;
  const mesh = groundMesh(key);
  if (!mesh) return;
  const gy = G.world.heightAt(g.x + 0.5, g.z + 0.5);
  mesh.position.set(g.x + 0.5, gy + 0.02, g.z + 0.5);
  if (g.mesh && g.mesh.parent) g.mesh.parent.remove(g.mesh);
  G.view.scene.add(mesh);
  g.mesh = mesh;
  g.meshKey = key;
}

/* A pile's despawn clock: the expiry the tile's pile of this item already
   carries, or a fresh ten minutes if this drop starts the pile. Every object of
   one pile therefore shares one clock, and the whole pile goes at once. */
function pileExpires(x, z, id) {
  for (const o of groundItemsAt(x, z)) if (o.id === id && o.expires != null) return o.expires;
  return (G.time || 0) + GROUND_DESPAWN_SEC;
}

const TUT_HAT_POS = { x: 47, z: 218, id: "pirate_hat" };
const TUT_HAT_TAKEN_KEY = "osw:tutHatTaken";
const TUT_TAKEN_KEY = "osw:tutTaken";
export function tutHatTaken() {
  try {
    if (G && G.ps && G.ps.tutHatTaken) return true;
    if (localStorage.getItem(TUT_HAT_TAKEN_KEY) === "1") return true;
    const raw = localStorage.getItem(TUT_TAKEN_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.some((s) => typeof s === "string" && s.includes("pirate_hat"))) return true;
    }
  } catch (e) {}
  return false;
}
function rememberTutHatTake() {
  try {
    if (G && G.ps) G.ps.tutHatTaken = true;
    localStorage.setItem(TUT_HAT_TAKEN_KEY, "1");
  } catch (e) {}
  try { if (G) saveTutHatSoon(); } catch (e) {}
}
let tutHatSaveT = 0;
function saveTutHatSoon() {
  const now = Date.now();
  if (now - tutHatSaveT < 5000) return;
  tutHatSaveT = now;
  try {
    import("./save.js").then((m) => { try { m.saveGame(G, true, true); } catch (e) {} }).catch(() => {});
  } catch (e) {}
}
export function applyTutPhase() {
  if (!G || !G.world) return;
  const taken = tutHatTaken();
  const w = G.world;
  const o = w.objAt(TUT_HAT_POS.x, TUT_HAT_POS.z);
  if (taken) {
    if (o && o.t === "tut_hat") {
      w.delObj(TUT_HAT_POS.x, TUT_HAT_POS.z);
      try { G.view.rebuildChunkAt(TUT_HAT_POS.x, TUT_HAT_POS.z); } catch (e) {}
    }
  } else {
    if (!o) {
      try {
        if (w.inBounds ? w.inBounds(TUT_HAT_POS.x, TUT_HAT_POS.z) : true) {
          w.setObj(TUT_HAT_POS.x, TUT_HAT_POS.z, { t: "tut_hat", item: TUT_HAT_POS.id });
          try { G.view.rebuildChunkAt(TUT_HAT_POS.x, TUT_HAT_POS.z); } catch (e) {}
        }
      } catch (e) {}
    }
  }
  try {
    for (const n of G.npcs || []) {
      if (n && n.type === "scully") {
        const hide = !taken;
        n.hidden = hide;
        if (n.ch && n.ch.group) n.ch.group.visible = !hide;
      }
    }
  } catch (e) {}
  try { updateTutObj(); } catch (e) {}
}
let tutGuideT = 0;
let tutGuideOn = false;
function updateTutObj() {
  const taken = tutHatTaken();
  const p = G && G.player;
  const show = !taken && !!p && inTutIsleBox(p.x, p.z);
  if (taken) {
    if (tutGuideT) { clearTimeout(tutGuideT); tutGuideT = 0; }
    if (tutGuideOn) { tutGuideOn = false; try { Fx.clearGuide(); } catch (e) {} }
  } else if (show && !tutGuideT && !tutGuideOn) {
    tutGuideT = setTimeout(() => {
      tutGuideT = 0;
      if (tutHatTaken()) return;
      try {
        /* Only point at the hat if the player is actually lost - stood
           beside it, they can see it. Near it, keep waiting instead. */
        const dx = p.x - (TUT_HAT_POS.x + 0.5), dz = p.z - (TUT_HAT_POS.z + 0.5);
        if (dx * dx + dz * dz < 64) return;
        const gy = G.world.heightAt(TUT_HAT_POS.x + 0.5, TUT_HAT_POS.z + 0.5, 0);
        Fx.setGuide(TUT_HAT_POS.x + 0.5, gy, TUT_HAT_POS.z + 0.5);
        tutGuideOn = true;
      } catch (e) {}
    }, 90000);
  }
  /* Walked up to the hat on their own: the arrow did its job, drop it. */
  if (tutGuideOn && !taken && p) {
    try {
      const dx = p.x - (TUT_HAT_POS.x + 0.5), dz = p.z - (TUT_HAT_POS.z + 0.5);
      if (dx * dx + dz * dz < 36) { tutGuideOn = false; Fx.clearGuide(); }
    } catch (e) {}
  }
}
export function takeTutHat(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "tut_hat") return false;
  const reach = (px, pz) => (px === tx && pz === tz) || (Math.abs(px - tx) + Math.abs(pz - tz) === 1 && G.world.isWalkable(px, pz));
  approach(tx, tz, () => attemptTakeTutHat(tx, tz), reach);
  return true;
}
function attemptTakeTutHat(tx, tz) {
  const w = G.world;
  const o = w.objAt(tx, tz);
  if (!o || o.t !== "tut_hat") return;
  faceTarget(G.player, tx, tz);
  if (tutHatTaken()) { applyTutPhase(); return; }
  /* The hat is never granted as an item: taking it consumes the fixture and
     wakes Scully, who wears it. No inventory checks - nothing is picked up. */
  workAnim("pickup");
  rememberTutHatTake();
  w.delObj(tx, tz);
  try { G.view.rebuildChunkAt(tx, tz); } catch (e) {}
  applyTutPhase();
  try {
    const sk = (G.npcs || []).find((n) => n && n.type === "scully" && !n.dead);
    if (sk) {
      /* He pops up out of the very spot the hat lay on: snap him onto the
         hat tile (kills any in-flight step so there is no glide in). */
      sk.x = tx + 0.5; sk.z = tz + 0.5; sk.px = sk.x; sk.pz = sk.z;
      if (sk.path) sk.path.length = 0; sk.stepPts = null; sk.moving = false;
      /* The pop knocks the player back one tile, straight away from the hat,
         whichever side they took it from - diagonal takeoff included. Blocked
         landing falls back to a sidestep, then to standing put. */
      const p = G.player;
      const ptx = Math.floor(p.x), ptz = Math.floor(p.z);
      let kdx = Math.sign(ptx - tx), kdz = Math.sign(ptz - tz);
      if (!kdx && !kdz) {
        kdx = Math.round(Math.sin(p.dir || 0)); kdz = Math.round(Math.cos(p.dir || 0));
        if (!kdx && !kdz) kdz = -1;
      }
      const land = [[ptx + kdx, ptz + kdz]];
      if (kdx && kdz) land.push([ptx + kdx, ptz], [ptx, ptz + kdz]);
      else land.push([ptx + kdz, ptz + kdx], [ptx - kdz, ptz - kdx]);
      for (const [nx, nz] of land) {
        if ((nx !== ptx || nz !== ptz) && w.isWalkable(nx, nz)) {
          p.x = nx + 0.5; p.z = nz + 0.5; p.px = p.x; p.pz = p.z;
          if (p.path) p.path.length = 0; p.stepPts = null; p.moving = false;
          break;
        }
      }
      /* Face each other across the tile, whatever the approach was: the
         player at Scully, Scully at the player (his talking flag then tracks
         the player every frame - src/game.js#desiredYawOf). */
      faceTarget(p, tx, tz);
      sk.dir = Math.atan2(p.x - sk.x, p.z - sk.z);
      /* Grave-pop: his death played backwards - a crumble that un-crumbles
         and stands up. Armed as a reversed one-shot (src/game.js#updateVisuals
         reads popAnim/popReverse/popHold); the swing drops back to stand by
         itself when its own clock runs out. He stays buried through the tail
         of the reversed sequence, then the pile shows and rises. */
      sk.hidden = true;
      if (sk.ch && sk.ch.group) sk.ch.group.visible = false;
      sk.popAnim = "death";
      sk.popReverse = true; sk.popHold = true;
      setTimeout(() => {
        try {
          sk.hidden = false;
          if (sk.ch && sk.ch.group) sk.ch.group.visible = true;
          sk.attackAnim = 1;
        } catch (e) {}
      }, 900);
      /* The headless "OW!" goes up with the pickup itself; the greeting
         waits for the rise: when the one-shot is done the pose is stand
         again (8s cap so a missed arm still talks instead of hanging). */
      startDialogue(sk, [say("OW!")]);
      const popAt = Date.now();
      const finishPop = () => {
        let risen = true;
        try { risen = !sk.ch || sk.ch.animName === "stand"; } catch (e) {}
        if (risen || Date.now() - popAt > 8000) {
          sk.popAnim = null; sk.popReverse = false; sk.popHold = false;
          endDialogue();
          const tree = NPC_TALK.scully;
          if (tree) startDialogue(sk, typeof tree === "function" ? tree(sk) : tree);
        } else setTimeout(finishPop, 200);
      };
      setTimeout(finishPop, 1200);
    }
  } catch (e) {}
}

/* Scully's stage hub (user ask 2026-10-30, the rope-and-coconut beginning).
   Stage 0 is the first meeting (the NPC_TALK tree, played by the grave-pop);
   every later Talk-to routes here. Stages: 1 rope quest, 2 rope in hand,
   3 coconuts down, 4 cache known, 5 knife in hand, 6 first drink. */
function tutCacheRumor() {
  try {
    if (G && G.ps) setTutStage(G.ps, 4);
  } catch (e) {}
}

function talkToScully(sk) {
  const s = tutStageOf(G && G.ps);
  if (s <= 0) {
    const tree = NPC_TALK.scully;
    startDialogue(sk, typeof tree === "function" ? tree(sk) : tree);
    return;
  }
  if (s === 1) {
    startDialogue(sk, [
      npc(["Back already? Then listen slowly,",
        "the way the old listen to the sea:",
        "the rigging."]),
      npc(["Your wreck wears it still -",
        "the broken hull on the sand, east along the beach."]),
      npc(["Strip what the sea left",
        "and bring me back a good length of it."], {
        options: [
          opt("Who are you, exactly?", [
            player("Who are you, exactly?"),
            npc(["Old. That is the whole of it, and the whole",
              "of it is a great deal. Captain once.",
              "Cargo once. Now: crabs."]),
            npc(["Two hundred forty years of sand in my boots.",
              "Ask the sand. It remembers me wrong."]),
          ]),
          opt("On my way.", [
            player("On my way."),
            npc(["Mind the splinters. They grade themselves,",
              "and they never give full marks."]),
          ]),
        ],
      }),
    ]);
    return;
  }
  if (s === 2) {
    startDialogue(sk, [
      npc(["Salt-stiff, honest rope.",
        "Outlives the ship. Outlives the crew.",
        "Outlives... well. Me."]),
      npc(["Now. The young palms, the bendy ones,",
        "not the old giants. Tie fast,",
        "climb hand over hand,"]),
      npc(["and haul the crown down to where",
        "you can reach it. The nuts will",
        "jump into your arms. The crabs insist."], {
        options: [
          opt("I'll bend a palm.", [
            player("I'll bend a palm."),
            npc(["And mind the landing. The sand is soft,",
              "which is more than can be said for my marking."]),
          ]),
        ],
      }),
    ]);
    return;
  }
  if (s === 3) {
    startDialogue(sk, [
      npc(["Coconuts! Water in locked boxes,",
        "just as I said. I am never wrong.",
        "Ask the crabs."]),
      npc(["And now, pupil, we come",
        "to the matter of keys."], {
        options: [
          opt("Keys?", [
            player("Keys?"),
            npc(["There is a hole in this island,",
              "under the east bluff where the rock",
              "bares its teeth,"]),
            npc(["the smugglers kept a store in it.",
              "Casks. Coin. And -",
              "this is the part that concerns us - blades."]),
            npc(["A knife went down there and never came up.",
              "Bring it to me, and I shall show you",
              "the inside of a coconut."], {
              next: then(tutCacheRumor),
            }),
          ]),
        ],
      }),
    ]);
    return;
  }
  if (s === 4) {
    startDialogue(sk, [
      npc(["The hole, pupil. East, under the bluff,",
        "where the rock bares its teeth."]),
      npc(["Mind the dark in there -",
        "it has had a long time to practise."], {
        options: [
          opt("I'll find it.", [
            player("I'll find it."),
          ]),
        ],
      }),
    ]);
    return;
  }
  if (s === 5) {
    startDialogue(sk, [
      npc(["Ah. Hold her up - yes, she has an edge still.",
        "Smuggler steel, and better than anything",
        "you will loot off that wreck."]),
      npc(["Now, pupil: the coconut in one hand,",
        "the knife in the other.",
        "You know what to do."]),
      npc(["Use the blade on the nut,",
        "and drink like a king."], {
        options: [
          opt("To water.", [
            player("To water.")
          ])
        ]
      })
    ]);
    return;
  }
  startDialogue(sk, [
    npc(["Water! From a locked box",
      "you opened yourself."]),
    npc(["Six out of ten for the whole beginning -",
      "the rope-work wanted confidence,",
      "but the thirst was honest."]),
    npc(["Now. About that fire... no. Rest first.",
      "Even teachers... no. I never rest.",
      "But you should."], {
      options: [
        opt("Thank you, Scully.", [
          player("Thank you, Scully."),
          npc(["Thank me by staying alive, pupil.",
            "The only homework that matters."])
        ])
      ]
    })
  ]);
}

/* The cay wreck's rigging (stage 1 -> 2): one good length of rope, once.
   Before the quest it is set dressing with a hint; after the taking it is
   picked clean. Mainland wrecks never reach this function (the row above is
   cay-gated). */
function searchCayWreck(tx, tz) {
  approach(tx, tz, () => {
    const o = G.world.objAt(tx, tz);
    if (!o || o.t !== "wreck") return;
    faceTarget(G.player, tx, tz);
    if (o.tutRopeTaken) {
      chat("Salt-stiff rigging and broken spars. Nothing else worth taking.", "game");
      return;
    }
    if (tutStageOf(G.ps) < 1) {
      chat("You pick through the wreckage - salt-stiff rigging, broken spars. It all looks useful.", "game");
      return;
    }
    if (!invFree(G.ps)) {
      chat("Your inventory is too full to carry any more loot.", "warn");
      return;
    }
    invAdd(G.ps, "rope", 1);
    o.tutRopeTaken = true;
    setTutStage(G.ps, 2);
    mark("inv");
    chat("You strip a good length of rigging from the wreck.", "you");
    chat("That is rope, and good rope. Scully will want to see it. (Talk to Scully.)", "game");
  });
}

/* A fresh coconut off the sand: Take carries it home. Only the bent-crown
   kind (tut_coconut) answers - the weathered ground nuts stay dressing. */
function takeCoconut(tx, tz) {
  approach(tx, tz, () => {
    const o = G.world.objAt(tx, tz);
    if (!o || o.t !== "tut_coconut") return;
    faceTarget(G.player, tx, tz);
    if (!invFree(G.ps)) {
      chat("Your inventory is too full to carry any more loot.", "warn");
      return;
    }
    invAdd(G.ps, "coconut", 1);
    G.world.delObj(tx, tz);
    try {
      G.view.rebuildChunkAt(tx, tz);
    } catch (e) {}
    mark("inv");
    chat("You pick a fat coconut.", "you");
  });
}

/* The bend (stage 2 -> 3): rope tied fast, climbed hand over hand, crown
   hauled down. Two nuts drop at the roots; the rope stays in hand. */
function bendPalmTree(tx, tz) {
  approach(tx, tz, () => {
    const o = G.world.objAt(tx, tz);
    if (!o || o.t !== "tree") return;
    if (tutStageOf(G.ps) !== 2 || !invCount(G.ps, "rope")) return;
    faceTarget(G.player, tx, tz);
    const spots = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = tx + dx, nz = tz + dz;
      if (G.world.isWalkable(nx, nz) && !G.world.objAt(nx, nz)) {
        spots.push([nx, nz]);
        if (spots.length >= 2) break;
      }
    }
    if (!spots.length) {
      chat("There is no room around the roots to drop the nuts.", "warn");
      return;
    }
    for (const [nx, nz] of spots) {
      G.world.setObj(nx, nz, { t: "tut_coconut" });
      try {
        G.view.rebuildChunkAt(nx, nz);
      } catch (e) {}
    }
    setTutStage(G.ps, 3);
    chat("You tie the rope fast, climb hand over hand, and haul the crown down to where you can reach it.", "you");
    chat("Two fat coconuts drop at your feet. Scully will want to hear about this. (Talk to Scully.)", "game");
  });
}

/* The smugglers' cache (stage 4 -> 5): one oil-black knife, once. Before the
   rumor it answers with the glint it is - visible, unreachable, unexplained. */
function searchTutCache(tx, tz) {
  approach(tx, tz, () => {
    const o = G.world.objAt(tx, tz);
    if (!o || o.t !== "tut_cache") return;
    faceTarget(G.player, tx, tz);
    if (o.tutLooted) {
      chat("Old casks and dust. The smugglers took everything worth taking - except, apparently, one knife.", "game");
      return;
    }
    if (tutStageOf(G.ps) < 4) {
      chat("A crack in the bluff, half-choked with sand. Something glints further in, but you cannot reach it from here - and you have no reason to try.", "game");
      return;
    }
    if (!invFree(G.ps)) {
      chat("Your inventory is too full to carry any more loot.", "warn");
      return;
    }
    invAdd(G.ps, "knife", 1);
    o.tutLooted = true;
    setTutStage(G.ps, 5);
    mark("inv");
    chat("Your fingers close on cold steel - a smuggler's knife, oil-black and still edged.", "you");
    chat("The coconut, the knife. Use the blade on the nut. (Talk to Scully if you forget why.)", "game");
  });
}
/* The wash-up opening, hidden test command ::caystart. Resets the tut phase in
   the LIVE copy only (no saveGame call, so a refresh restores the real save
   unless an autosave lands mid-preview), collapses the body, holds the
   wake-up line on black, fades the scene in, plays the slow stand, shows the
   title card, then the explore box. The copy is left at phase 0 on the wash
   tile, standing - a fresh tutorial start the user can keep playing. */
const CAY_LINE = "You wake up on the shore amidst your wrecked boat.";
const CAY = { lie: "death", lieRev: false, rise: "agile_pipe_unsqueeze", reverse: false, rate: 0.5, blackout: true, tile: [30.5, 217.5], face: [30, 216] };
function cayAnims(ch) {
  try { return (ch && ch.data && ch.data._anims) || null; } catch (e) { return null; }
}
function cayReset() {
  try { cayBlackout(false, true); } catch (e) {}
  try { document.getElementById("cayTitle")?.remove(); } catch (e) {}
  try { document.getElementById("cayExplore")?.remove(); } catch (e) {}
  try { if (G) G.cayCamLock = false; } catch (e) {}
  try { endDialogue(); } catch (e) {}
  const p = G.player;
  if (G.ps) G.ps.tutHatTaken = false;
  try { localStorage.removeItem(TUT_HAT_TAKEN_KEY); } catch (e) {}
  try {
    const raw = localStorage.getItem(TUT_TAKEN_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const kept = arr.filter((s) => !(typeof s === "string" && s.includes("pirate_hat")));
        if (kept.length) localStorage.setItem(TUT_TAKEN_KEY, JSON.stringify(kept));
        else localStorage.removeItem(TUT_TAKEN_KEY);
      }
    }
  } catch (e) {}
  try { cancelAction(); } catch (e) {}
  freezeEntity(p);
  p.actionAnim = 0; p.popAnim = null; p.popReverse = false; p.popHold = false; p.popRate = null;
  p.washedUp = null; p.emoteAnim = null; p.emoteLeft = 0; p.cayLift = 0; p.cayMoved = 0;
  try { if (p.ch) { p.ch._dying = false; p.ch.fallDone = false; } } catch (e) {}
  applyTutPhase();
}
function caySnapCamera(x, z) {
  try {
    G.authPan = false;
    G.cameraTarget.x = x; G.cameraTarget.z = z;
    try { G.cameraTarget.y = G.world.heightAt(x, z, 0); } catch (e) { G.cameraTarget.y = 0; }
    G.yaw = 0; G.pitch = 0.94; G.dist = 15;
  } catch (e) {}
}
/* The black beat (user ask 2026-10-29): the cutscene cuts the 3D viewport to
   black before the opening, so the wake-up line is the first thing ever shown
   on a black game window with the dialogue box ("click here to continue")
   visible. The inventory is emptied (pack + worn) and a guard loop keeps it
   empty while the black is up; the rest of the interface stays visible.
   Continue fades the black out and the animation runs on the revealed beach. */
let cayBlackTimer = 0;
function cayStripGear() {
  try {
    const ps = G && G.ps;
    if (!ps) return;
    if (Array.isArray(ps.inv)) ps.inv.fill(null);
    if (ps.equip) for (const k in ps.equip) ps.equip[k] = null;
    /* The opening state is checked and enforced for the whole black beat:
       run off, prayer at zero. */
    ps.runEnabled = false;
    ps.prayerPoints = 0;
    mark("inv", "equip", "orbs");
  } catch (e) {}
}
/* The player's own death sequence lives on the Human-model NPCs, never on the
   player rig - same graft combat.js#playerDeath does, so the "fully collapsed"
   lie is available to the wash-up variants on a fresh page too. */
function cayGraftDeath() {
  try {
    const ch = G.player && G.player.ch;
    const anims = ch && ch.data && ch.data._anims;
    if (!anims || anims.death) return !!(anims && anims.death);
    const donor = prepareModel("banker") || prepareModel("man") || prepareModel("woman") || prepareModel("guard");
    const raw = donor && donor.anims && donor.anims.death;
    if (!raw || !raw.frames || !raw.frames.length || !raw.fm || !raw.fm.types) return false;
    const stand = anims.stand;
    if (!stand || !stand.fm || stand.fm.types.length !== raw.fm.types.length) return false;
    const lengths = raw.lengths && raw.lengths.length === raw.frames.length ? raw.lengths : raw.frames.map(() => 4);
    anims.death = {
      frames: raw.frames,
      fm: raw.fm,
      lengths,
      totalTicks: lengths.reduce((s, v) => s + v, 0),
      tickOffsets: lengths.reduce((acc, v) => { acc.push((acc[acc.length - 1] || 0) + v); return acc; }, []),
    };
    return true;
  } catch (e) { return false; }
}
function cayBlackout(on, instant, dur, cb) {
  try {
    if (!Frame || !Frame.layers || !Frame.layers.viewport) return;
    const vp = Frame.layers.viewport;
    let ov = document.getElementById("cayBlack");
    if (ov && ov.parentNode !== vp) { try { ov.remove(); } catch (e) {} ov = null; }
    if (on) {
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "cayBlack";
        ov.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;background:#000;z-index:10;";
        vp.appendChild(ov);
      }
      ov.style.transition = "none";
      ov.style.display = "";
      ov.style.opacity = "1";
      cayStripGear();
      if (cayBlackTimer) clearInterval(cayBlackTimer);
      cayBlackTimer = setInterval(cayStripGear, 400);
    } else {
      if (cayBlackTimer) { clearInterval(cayBlackTimer); cayBlackTimer = 0; }
      if (ov) {
        if (instant) { ov.style.display = "none"; try { cb && cb(); } catch (e) {} }
        else {
          const ms = Math.max(0, dur || 600);
          ov.style.transition = "opacity " + (ms / 1000) + "s";
          ov.style.opacity = "0";
          setTimeout(() => { try { ov.style.display = "none"; } catch (e) {} try { cb && cb(); } catch (e) {} }, ms + 100);
        }
      } else { try { cb && cb(); } catch (e) {} }
    }
  } catch (e) {}
}
function cayFastForward(ch, name, rev) {
  const anims = cayAnims(ch);
  const a = anims && anims[name];
  if (!a) return false;
  const o = {
    moving: false, running: false, attack: 0, attackAnim: null, attackToken: null,
    cast: null, castToken: null, castLoop: false, castTail: false, castClamp: false,
    reverse: !!rev, hold: true, emote: null, emoteToken: null,
    death: name, turn: null, dir: 0, camYaw: 0, camPitch: 0, dist: 0,
  };
  for (let i = 0; i < 1500 && !ch.fallDone; i++) {
    try { ch.update(0.05, o); } catch (e) { return false; }
  }
  return !!ch.fallDone;
}
let cayDone = true;
let cayWatchdog = 0;
let cayGen = 0;
export function cayStart() {
  const v = CAY;
  const g = ++cayGen;
  try {
    cayReset();
    const p = G.player;
    if (!modelsReady() || !p.ch) {
      try { chat("caystart: models not ready, try again in a moment.", "warn"); } catch (e) {}
      return false;
    }
    if (!cayGraftDeath()) {
      try { chat("caystart: the collapse would not hold.", "warn"); } catch (e) {}
      return false;
    }
    const anims = cayAnims(p.ch);
    for (const name of [v.lie, v.rise]) {
      if (!anims || !anims[name]) { try { chat("caystart: player is missing " + name + ".", "warn"); } catch (e) {} return false; }
    }
    cayDone = false;
    if (cayWatchdog) clearTimeout(cayWatchdog);
    cayWatchdog = setTimeout(() => {
      try { if (g === cayGen && !cayDone && !(Dialogue.active) && G.ps) G.ps.stunTicks = 0; } catch (e) {}
    }, 60000);
    placeEntity(p, v.tile[0], v.tile[1], p.dir || 0, 0);
    faceTarget(p, v.face[0], v.face[1]);
    freezeEntity(p);
    caySnapCamera(v.tile[0], v.tile[1]);
    /* Camera stays put for the whole wake-up: yaw/pitch/zoom inputs are locked
       (src/game.js#cayCamLock) until the stand finishes. */
    G.cayCamLock = true;
    p.washedUp = v.lie;
    p.popReverse = !!v.lieRev; p.popHold = true;
    try { p.ch._dying = false; p.ch.fallDone = false; } catch (e) {}
    if (!cayFastForward(p.ch, v.lie, v.lieRev)) {
      try { chat("caystart: the lie would not hold.", "warn"); } catch (e) {}
      p.washedUp = null; cayDone = true;
      G.cayCamLock = false;
      return false;
    }
    try { if (G.ps) G.ps.stunTicks = 100000; } catch (e) {}
    cayBlackout(true);
    startDialogue("narrator", [say(CAY_LINE)], () => { if (g !== cayGen) return; cayRiseFromWashup(g); });
    return true;
  } catch (e) {
    try { chat("caystart: " + (e && e.message ? e.message : e), "warn"); } catch (e2) {}
    try { if (G) G.cayCamLock = false; } catch (e3) {}
    return false;
  }
}
const CAY_EXPLORE = "Explore the island.";
/* Continue on the wake-up line: the black fades (a real fade, not a cut),
   revealing the collapsed body; only once the scene is fully in does the rise
   play. After the rise finishes, the title card appears; dismissing it brings
   up the explore prompt, and only dismissing THAT hands back control. */
function cayRiseFromWashup(g) {
  if (g !== cayGen) return;
  const fade = () => {
    if (g !== cayGen) return;
    cayPlayRise(g, () => cayTitleCard(g));
  };
  cayBlackout(false, false, 1800, fade);
}
function cayPlayRise(g, done) {
  const v = CAY;
  const p = G.player;
  if (cayDone || g !== cayGen) return;
  try {
    p.washedUp = null;
    try { if (p.ch) { p.ch._dying = false; p.ch.fallDone = false; } } catch (e) {}
    p.popAnim = v.rise; p.popReverse = !!v.reverse; p.popHold = true;
    p.popRate = v.rate || null;
    p.actionAnim = 1; p.swingId = (p.swingId || 0) + 1;
  } catch (e) { done(); return; }
  const at = Date.now();
  const poll = () => {
    if (cayDone || g !== cayGen) return;
    let stood = true;
    try { stood = !p.ch || p.ch.animName === "stand"; } catch (e) {}
    if (stood || Date.now() - at > 9000) {
      p.popAnim = null; p.popReverse = false; p.popHold = false; p.actionAnim = 0;
      p.popRate = null;
      /* The body is up: movement and camera are free from here, even while
         the title card and the explore box still play out. */
      try { if (G.ps) G.ps.stunTicks = 0; } catch (e) {}
      try { G.cayCamLock = false; } catch (e) {}
      done();
    } else setTimeout(poll, 200);
  };
  setTimeout(poll, 800);
}
/* The Cay title, tracked out: each glyph is its own plate with fixed trailing
   air, so the spacing never depends on anything animating. */
function caySpaced(text, scale, colour, tracking) {
  try {
    const f = Fx.labelFont || Fx.font;
    if (!f || !Fx._textCache) return null;
    const s = String(text);
    const frag = document.createElement("span");
    frag.style.cssText = "display:inline-block;white-space:pre;";
    for (let i = 0; i < s.length; i++) {
      const cv = Fx.plate("cay", f, s[i], colour || "#ffec99");
      cv.style.imageRendering = "pixelated";
      /* The frame pins every viewport canvas to the corner
         (src/style.css#.viewport canvas) - the title plate is DOM content, so it
         opts back out or it can never be centred. */
      cv.style.position = "static";
      cv.style.display = "inline";
      cv.style.width = (cv.width * scale) + "px";
      cv.style.height = (cv.height * scale) + "px";
      if (i < s.length - 1) cv.style.marginRight = (tracking || 0) + "px";
      frag.appendChild(cv);
    }
    return frag;
  } catch (e) { return null; }
}
function cayTitleCard(g) {
  if (g !== cayGen) return;
  try {
    if (!Frame || !Frame.layers || !Frame.layers.viewport) { cayExplore(g); return; }
    const vp = Frame.layers.viewport;
    let t = document.getElementById("cayTitle");
    if (t) { try { t.remove(); } catch (e) {} }
    t = document.createElement("div");
    t.id = "cayTitle";
    t.style.cssText = "position:absolute;left:0;top:50%;width:100%;text-align:center;z-index:11;pointer-events:none;filter:drop-shadow(2px 2px 0 #000);opacity:0;";
    const cv = caySpaced("The Cay", 3, "#ffec99", 6);
    if (cv) t.appendChild(cv);
    else { t.textContent = "The Cay"; t.style.cssText += "font-family:serif;font-size:40px;color:#ffec99;"; }
    vp.appendChild(t);
    /* Slight delay, then a long slow fade-up as the stand-up finishes, a hold,
       a slow fade-down, a beat of nothing, and only much later the explore
       box. Nothing here is clickable - the timeline plays itself. WAAPI, not
       CSS transitions: this element's transition clock wedges at zero. */
    let gone = false;
    const step = (ms, fn) => { setTimeout(() => { if (!gone && g === cayGen) fn(); }, ms); };
    try {
      t.animate(
        [{ opacity: "0", transform: "translateY(-50%) scale(.94)" }, { opacity: "1", transform: "translateY(-50%) scale(1)" }],
        { duration: 3000, delay: 1000, fill: "forwards", easing: "ease-out" },
      );
    } catch (e) { try { t.style.opacity = "1"; } catch (e2) {} }
    step(1000 + 3000 + 3000, () => {
      try {
        t.animate(
          [{ opacity: "1" }, { opacity: "0" }],
          { duration: 2500, fill: "forwards", easing: "ease-in" },
        );
      } catch (e) { try { t.style.opacity = "0"; } catch (e2) {} }
    });
    step(1000 + 3000 + 3000 + 2500 + 1000, dismiss);
    function dismiss() {
      if (gone || g !== cayGen) return;
      gone = true;
      try { t.remove(); } catch (e) {}
      setTimeout(() => { if (g === cayGen) cayExplore(g); }, 8000);
    }
  } catch (e) { cayExplore(g); }
}
function cayExplore(g) {
  if (g !== cayGen) return;
  const free = () => {
    try { if (G.ps) G.ps.stunTicks = 0; } catch (e) {}
    cayDone = true;
  };
  try {
    if (!Frame || !Frame.layers || !Frame.layers.viewport) { free(); return; }
    const vp = Frame.layers.viewport;
    let x = document.getElementById("cayExplore");
    if (x) { try { x.remove(); } catch (e) {} }
    x = document.createElement("div");
    x.id = "cayExplore";
    x.style.cssText = "position:absolute;left:3%;top:4%;z-index:11;pointer-events:none;display:flex;align-items:center;background:rgba(88,88,88,.55);border:1px solid #000;padding:5px 12px 5px 38px;perspective:200px;font-family:\"rs-plain12\",monospace;font-size:12px;line-height:13px;color:#fff;text-shadow:1px 1px 0 #000;white-space:pre;opacity:0;";
    const ar = document.createElement("span");
    /* Out of the line's flow with its slot reserved in padding: the text sits
       exactly where it sits whether the arrow has arrived or not. */
    ar.style.cssText = "position:absolute;left:9px;top:50%;width:20px;height:14px;flex:none;";
    const shaft = document.createElement("span");
    shaft.style.cssText = "position:absolute;left:0;top:6px;width:12px;height:3px;background:#ffff00;box-shadow:1px 1px 0 #000;";
    const head = document.createElement("span");
    head.style.cssText = "position:absolute;right:0;top:2px;width:0;height:0;border-left:7px solid #ffff00;border-top:5px solid transparent;border-bottom:5px solid transparent;filter:drop-shadow(1px 1px 0 #000);";
    ar.appendChild(shaft); ar.appendChild(head);
    x.appendChild(ar);
    const label = document.createElement("span");
    label.textContent = CAY_EXPLORE;
    x.appendChild(label);
    vp.appendChild(x);
    /* Arrive: box slides in from the left while the arrow rolls up toward the
       viewer (a single rotateX), each played exactly once. The arrow carries
       its own vertical centring in the keyframes so the line never moves. */
    try {
      x.animate(
        [{ opacity: 0, transform: "translateX(-10px)" }, { opacity: 1, transform: "translateX(0)" }],
        { duration: 600, fill: "both", easing: "ease-out" },
      );
      ar.animate(
        [{ opacity: 0, transform: "translateY(-50%) rotateX(-90deg)" }, { opacity: 1, transform: "translateY(-50%) rotateX(0deg)" }],
        { duration: 700, fill: "both", easing: "ease-out" },
      );
    } catch (e) { try { x.style.opacity = "1"; } catch (e2) {} }
    let gone = false;
    const finish = () => {
      if (gone || g !== cayGen) return;
      gone = true;
      try {
        x.style.transition = "opacity 1s ease-in";
        x.style.opacity = "0";
        setTimeout(() => { try { x.remove(); } catch (e) {} }, 1100);
      } catch (e) { try { x.remove(); } catch (e2) {} }
      free();
    };
    /* 90 seconds, then a slow fade and control in any case. Not clickable -
       the box is cursor-transparent and removes itself. */
    setTimeout(finish, 90000);
  } catch (e) { free(); }
}

function spawnGroundOne(id, qty, x, z, opts) {
  if (!itemDef(id) || qty <= 0) return null;
  if (isStackable(id)) {
    const arr = Actions.groundAt.get(tk(x, z));
    if (arr) {
      const same = arr.find((g) => g.id === id);
      if (same) { same.qty += qty; syncGroundMesh(same); return same; }
    }
  } else if (qty > 1) {
    /* A non-stackable thing cannot lie as a *count*: six sharks are six items.
       Each is taken on its own (a Take row works through its own kind at two
       per tick), each is its own row when the tile is right-clicked, and only the
       first of them is drawn - the rest are underneath (below). The first is
       returned, which is what a caller logging "the drop" wants. */
    let first = null;
    for (let k = 0; k < qty; k++) {
      const g = spawnGroundOne(id, 1, x, z, opts);
      if (!first) first = g;
    }
    return first;
  }
  /* A second one of a kind already lying on this tile is *underneath* it: the
     models are identical and would land on exactly the same spot, so it is given
     no mesh at all and the tile keeps drawing only its first (a pile of six
     sharks reads as one shark). It still goes into the tile's list, in order, so
     taking the top one promotes the next - see removeGround. */
  const arr0 = Actions.groundAt.get(tk(x, z));
  const under = !isStackable(id) && !!arr0 && arr0.some((g) => g.id === id);
  const key = groundKeyFor(id, qty);
  let mesh = null;
  if (!under) {
    mesh = groundMesh(key);
    if (!mesh) return null;
    const gy = G.world.heightAt(x + 0.5, z + 0.5);
    mesh.position.set(x + 0.5, gy + 0.02, z + 0.5);
    G.view.scene.add(mesh);
  }
  const g = {
    id, qty, x, z, mesh, meshKey: mesh ? key : null,
    owner: (opts && opts.owner) || null,
    expires: pileExpires(x, z, id),
  };
  Actions.ground.push(g);
  if (!Actions.groundAt.has(tk(x, z))) Actions.groundAt.set(tk(x, z), []);
  Actions.groundAt.get(tk(x, z)).push(g);
  if (Actions.ground.length > Actions.groundCap) removeGround(Actions.ground[0], true);
  return g;
}

/* A pile appears or grows - the exported face of the above, and the place the
   world is told about it. The report is made once, at the outermost call, as the
   tile's *new total* for that item: a six-shark drop (six separate objects) is
   one record, a drop merging into a pile is one record, and neither of them has
   to know how the other was written. `removeGround` reports its own removals, so
   a pile that the cap pushes off the end is announced too. */
export function spawnGround(id, qty, x, z, opts) {
  const base = pileTotal(x, z, id);
  const g = spawnGroundOne(id, qty, x, z, opts);
  noteGround(x, z, id, base);
  return g;
}

/* Take one drop off the ground. Called by the cap inside spawnGround and by
   clearGround; exported because a caller that owns a *subset* of the ground may
   need to clean up its own (src/skydrop.js retires the oldest unclaimed hats
   when a new wave lands, so a shower cannot slowly fill the ground list). Keep
   the bookkeeping here rather than duplicating it - `groundAt` is a map of tile
   keys to the arrays in `ground`, and the two getting out of step is silent. */
export function removeGround(g) {
  /* The base the take-priority rule judges on (see `noteGround`): the pile's
     total with this drop still in it. Read before anything is spliced. */
  const base = pileTotal(g.x, g.z, g.id);
  const i = Actions.ground.indexOf(g);
  if (i >= 0) Actions.ground.splice(i, 1);
  const arr = Actions.groundAt.get(tk(g.x, g.z));
  if (arr) {
    const j = arr.indexOf(g);
    if (j >= 0) arr.splice(j, 1);
    if (!arr.length) Actions.groundAt.delete(tk(g.x, g.z));
  }
  /* the geometry and the loc material are shared, so only the mesh goes */
  if (g.mesh && g.mesh.parent) g.mesh.parent.remove(g.mesh);
  /* If it was the one drawn, the next of its kind on the tile comes up: the pile
     under the cursor is always one model deep, so taking the top item of six
     reveals the second rather than emptying the tile's picture. */
  if (g.mesh) {
    const rest = Actions.groundAt.get(tk(g.x, g.z));
    const next = rest && rest.find((o) => o.id === g.id && !o.mesh);
    if (next) syncGroundMesh(next);
  }
  /* ...and the world hears about it: this is the one path every removal goes
     through (a pickup, a spell's grab, a wave of partyhats being retired, the
     ground cap pushing the oldest pile off the end), so it is the one place that
     has to say the tile no longer holds what it held. */
  noteGround(g.x, g.z, g.id, base);
}

/* Who takes a pile nobody else has touched yet, when two players take it on
   the same tick: the lower connection id. Both clients applied their own take
   locally before either record arrived, so without a rule both keep the item
   and it duplicates. The rule is deterministic and both sides run it, so the
   same side wins twice and the loser is the only one who moves: the loser
   takes the item back out of the pack, lays the winner's record down as the
   truth, and says the live game's own "Too late - it's gone!".

   The unit is one pile (tile + item), tracked from a local take until the
   world confirms it. A foreign record naming the take's own base raced it off
   the same pile, so it is always a priority fight: the lower id keeps the
   pile, the loser reverts. A foreign record naming any other base is
   sequential - a take off our remainder, a drop onto it, or a stale record
   from before our take - and is adopted with the tracking rebased. The echo
   of our own report only confirms. A foreign record with no tracked take is
   applied as today. Records never re-report on this path (`remoteApply`), so
   a fight is one round, not a loop. */
const groundTakes = new Map();
const GROUND_TAKE_WINDOW = 60;
function groundTakeKey(x, z, id) { return x + "," + z + "," + id; }
function pileTotal(x, z, id) {
  let n = 0;
  for (const g of groundItemsAt(x, z)) if (g.id === id) n += g.qty;
  return n;
}
/* A successful local take, called after the pack holds it and the pile shows
   the remainder: `got` is what came up, and the pile's new total is what the
   report we just sent carries. A second take inside the window folds into the
   first - the pack holds both, so a lost fight reverts both. Offline takes
   track nothing: with nobody to race, there is nothing to arbitrate. */
function trackGroundTake(x, z, id, got) {
  if (!got || Net.status !== "online") return;
  const k = groundTakeKey(x, z, id);
  const now = G.time || 0;
  const reported = pileTotal(x, z, id);
  const prev = groundTakes.get(k);
  /* A second take folds into the first only when the pile is exactly where
     the first left it: anything else touched the pile in between (a foreign
     record adopted, a rebase), so the new take is computed from a new base
     and starts a fresh entry. Folding across interference would judge the new
     take's fights on the old take's base. */
  if (prev && now - prev.at < GROUND_TAKE_WINDOW && reported + got === prev.reported) {
    prev.got += got;
    prev.reported = reported;
    prev.at = now;
  } else {
    /* `base` is the pile the take was computed from - the post-take total
       plus what came up, which is the pre-take total in a world where nothing
       else moved between the two (single-threaded: nothing can). */
    groundTakes.set(k, { base: reported + got, got, reported, confirmed: false, lost: false, at: now });
  }
}
/* The losing half of a priority fight: the taken pile comes back out of the
   pack (whatever of it is still there - a shark already eaten cannot come
   back), the winner's record is laid down as the truth without a word back to
   the world, and the player hears why. */
function revertGroundTake(x, z, id, take, winnerQty) {
  const ps = G.ps;
  invRemove(ps, id, take.got);
  mark("inv");
  applyGroundRecord(x, z, id, winnerQty);
  chat("Too late - it's gone!", "game");
}
function applyGroundRecord(x, z, id, qty) {
  for (const g of groundItemsAt(x, z).slice()) if (g.id === id) removeGround(g);
  if (qty > 0) spawnGround(id, qty, x, z);
}

export function groundItemsAt(x, z) {
  return Actions.groundAt.get(tk(x, z)) || [];
}

export function clearGround() {
  while (Actions.ground.length) removeGround(Actions.ground[0]);
}

export function dropFromInventory(where, index, qty) {
  const ps = G.ps;
  if (where !== "inv") return;
  const stack = ps.inv[index];
  if (!stack) return;
  const n = Math.min(stack.qty, qty || stack.qty);
  const id = stack.id;
  stack.qty -= n;
  if (stack.qty <= 0) ps.inv[index] = null;
  spawnGround(id, n, Math.floor(G.player.x), Math.floor(G.player.z), { owner: ps.name });
  chat("You drop the " + itemName(id).toLowerCase() + (n > 1 ? " x" + n : "") + ".", "you");
  mark("inv");
}

/* The inventory menu's "Drop all" (src/ui.js#openItemMenu). It drops *one
   kind*, from every slot of it: a non-stackable thing is one item per slot, so
   a pack holding four sharks is four slots and the menu's own "Drop" empties one
   of them. The option only appears when there is more than one of the kind to
   drop - a lone bronze pickaxe gets "Drop" and nothing else, because there is
   nothing for a "Drop all" to mean. It goes on the ground as a single pile, the
   way every other drop does. */
export function dropAllOfKind(where, index) {
  const ps = G.ps;
  if (where !== "inv") return;
  const s = ps.inv[index];
  if (!s) return;
  const id = s.id;
  let n = 0;
  for (let i = 0; i < ps.inv.length; i++) {
    const st = ps.inv[i];
    if (!st || st.id !== id) continue;
    n += st.qty;
    ps.inv[i] = null;
  }
  spawnGround(id, n, Math.floor(G.player.x), Math.floor(G.player.z), { owner: ps.name });
  chat("You drop the " + itemName(id).toLowerCase() + (n > 1 ? " x" + n : "") + ".", "you");
  mark("inv");
}

/* --------------------------------------------------------------- activity core */

export function cancelAction(reason) {
  if (!Actions.act) {
    if (Actions.onCancel) Actions.onCancel();
    return;
  }
  Actions.act = null;
  if (Actions.onCancel) Actions.onCancel();
  if (reason) chat(reason, "warn");
}

/* End the hidden state a crate gives the player (see `hideInCrate` below, and
   src/combat.js#tickAggro, which is what the state is for). Every route out of
   hiding runs through here - stepping, starting any activity, attacking, or a
   leap - so the flag and the message can never come apart. Returns whether
   anything actually ended. */
export function revealPlayer(msg) {
  const p = G && G.player;
  if (!p || !p.hidden) return false;
  p.hidden = false;
  if (msg) chat(msg, "game");
  return true;
}

function begin(kind, x, z, data) {
  /* A climb in progress owns the player until its own arrival lands them: no
     other activity starts mid-climb (src/actions.js#climbLadder). Silent - the
     climb is two ticks long. */
  if (G.player && G.player.climbLock) return;
  /* Starting an activity is the player doing something, so a level-up panel
     that is up is cleared by it - before the "you are stunned" refusal below,
     which is itself a response to the player's action (src/dialogue.js#
     dismissLevelUp). */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  /* A stunned player cannot start anything - with one exception: a pickup
     (the user's rule, 2026-10-09). A rooted player cannot walk onto the pile,
     but the walk stalls beside it and the side-tile fallback gathers from
     where they stand, so the click still starts the take instead of refusing
     it. Every other activity still refuses outright: the published nine ticks
     root you to the spot, and every path into an activity walks through here
     (or through walkTo, which refuses too - see src/game.js#walkTo). Checked
     before the cancel so a stun never quietly drops a fight you are already
     in. */
  if (kind !== "take" && G.ps && G.ps.stunTicks > 0) { chat("You are stunned and cannot move!", "warn"); return; }
  if (G.ps && G.ps.emoteLockTicks > 0) return;
  /* Starting anything at all is also climbing out of the crate: hiding is not a
     state you can act from, and every click that is not on the crate itself
     comes through here. */
  revealPlayer("You climb out of the crate.");
  /* Starting anything at all abandons a queued crossing (see `clearLeaps`). */
  clearLeaps();
  if (Actions.onCancel) Actions.onCancel();
  /* Starting an activity ends a follow (src/game.js#followPlayer): the route
     this is about to plan is the player's own, and a follow left running would
     re-plan over it on the very next tick. */
  stopFollowing();
  /* A bare function is shorthand for `{ fn }` - the "walk there and do this"
     activity that runAttempt's "goto" case runs on arrival. Normalising it here
     means a caller cannot get the shape wrong: passing the function straight
     through used to leave `act.data.fn` undefined, so the walk-in worked but
     the action it walked you in for silently never happened. */
  if (typeof data === "function") data = { fn: data };
  data = data || {};
  /* A production activity is a deliberate non-chop, non-mine intent, so it
     counts against a locked-in focus in `aimBias` - the user's "anything else"
     (2026-10-06). Only the production skills log here: chop and mine log one
     intent per yield instead (attemptWc/attemptMine on each log/ore received),
     so clicks that never produce anything - refusals, misclicks, a Talk-to
     that stole the click - can neither build nor break focus. NPC
     intents log in runNpcRow, and movement-ish kinds (goto walks, take
     pickups, jump/agility crossings, steal walk-ins) stay neutral like walking
     itself, so walking around neither builds nor breaks the mode. */
  if (kind === "fish" || kind === "cook" || kind === "cookone" || kind === "smelt" || kind === "jewel" ||
      kind === "smith" || kind === "craft" || kind === "spin" || kind === "mix" || kind === "grind" ||
      kind === "fletch" || kind === "string" || kind === "potshape" || kind === "potfire" ||
      kind === "moltenglass" || kind === "glassblow" || kind === "fillsand") {
    noteAim("other");
  }
  /* `data.reachTestOf` is the same thing written as a factory - a reach test
     that belongs to whichever tile the activity is currently aimed at rather
     than to the click that started it - which is what lets `retarget` keep it
     true when a miner moves on to the next rock (see `retarget`); an activity
     carrying a plain `reachTest` (the creature behind a bank counter, whose
     reach is about the creature) keeps it for life. */
  Actions.act = {
    kind, x, z, phase: "walk", timer: 0, stuck: 0, walkTimer: 0, data,
    reachTest: data.reachTest || (data.reachTestOf ? data.reachTestOf(x, z) : null),
    walkTest: data.walkTest || null,
  };
  G.player.actionAnim = 0;
  /* A new intent drops any per-click run override the walk before it pinned:
     `runClick` belongs to *one* walk (see src/game.js#walkTo), and carrying a
     shift-click's "walk this one" into an activity's own walk-in is what made
     the tree click walk while the run orb read on. The walk-in below posts its
     own (no-modifier) answer a moment later; this clears the gap. */
  G.player.runClick = null;
  actWalk(Actions.act, G.player);
  /* `data.inReach` marks an act the click already has the player in position for
     (a ground pile, a rock the player is already standing beside). The walk phase
     it was about to enter is a no-op - `walkTo` refuses a destination the player
     is already beside - so it starts in its work phase here instead, and the
     first attempt lands on the *next* tick rather than the one after it. A click
     from across the room is left alone: that walk is real, and it arrives through
     the tick like any other. */
  if (data.inReach && actNear(Actions.act, G.player, 1)) {
    Actions.act.phase = "work";
    /* A swing that starts in the work phase starts here rather than on the
       walk-in handover in `tickActions` - and its pose has to go up with it, or
       the first attempt (`act.timer` is already spent, so it runs on the very
       next tick) would raise and drop the swing inside one tick and never draw
       it. See `raiseMineSwing`.

       Not, though, when the click landed mid-step: the player is beside the rock
       by tile but *drawn* on the tile they stepped off, and raising the swing
       then is the "swinging while still walking into the rock" the user reported
       (2026-09-23). Left to the first attempt, the pose goes up on the next
       tick, by which time the step is drawn through and the body is standing on
       the rock's ring tile. */
    if (kind === "mine" && !midStep(G.player)) raiseMineSwing(Actions.act);
  }
}

function retarget(act, x, z) {
  act.x = x;
  act.z = z;
  /* An activity whose reach is *about its target* has to be given the reach for
     the target it has just been pointed at: mining's ring test is written around
     the rock it was begun on (`rockReachTest`), and `retarget` is exactly the
     move-from-one-rock-to-the-next path. Left stale, the test kept accepting the
     tile beside the rock the player had already emptied - so the walk-in to the
     new rock was "already there" and planned nothing, the activity went straight
     back to its work phase eight tiles away from the rock it was swinging at, and
     the ore landed in the pack from the far side of the mine. `data.reachTestOf`
     is the factory that rebuilds it; an activity with no reach of its own (a
     tree, a fishing spot) leaves it unset and nothing here changes. */
  if (act.data && act.data.reachTestOf) act.reachTest = act.data.reachTestOf(x, z);
  act.phase = "walk";
  act.stuck = 0;
  act.walkTimer = 0;
  actWalk(act, G.player);
}

function faceTarget(e, x, z) {
  e.dir = Math.atan2(x + 0.5 - e.x, z + 0.5 - e.z);
}

/* Is the character *drawn* one tile short of its own logical tile right now?

   It is, for the whole of a tick in which it took a step. `stepEntity` moves the
   tile the instant the tick's step is made (src/game.js#stepEntity), and the
   frame only walks the body across that tile over the rest of the tick
   (`renderPos` + `Game.tickProgress`), so at the moment the tick's own code runs
   the model is still standing on the tile it stepped *off*. Everything that
   animates "on arrival" has to wait for `stepPts` to come back to a single
   entry, which is the tick after the step (see `mineRock`'s work phase and
   `tickActions`' handover). */
function midStep(e) {
  return !!(e && e.stepPts && e.stepPts.length > 1);
}


function stopMsg(msg) {
  cancelAction(msg);
}

/* Abandon any leaps still queued (see `leapTo`): anything the player starts that
   is NOT a leap - a walk of their own, an activity, an interaction - means the
   crossing they queued a moment ago is not what they are doing any more, and a
   queue that outlived its intent would carry on hopping them out of the shop
   they had just opened. `leapTo` deliberately does not come through here: it
   calls `cancelAction` directly, so ordering the next hop of a crossing never
   drops the hops already queued behind it. */
export function clearLeaps(p) {
  const e = p || (G && G.player);
  if (e && e.pendingLeaps && e.pendingLeaps.length) e.pendingLeaps.length = 0;
}

export function isBusy() {
  return !!Actions.act;
}

export function tickActions(game, dt) {
  G = game;
  const ps = game.ps;
  try { updateTutObj(); } catch (e) {}

  /* delayed work first: a teleport that waited for its spin, a telegrabbed
     item that arrives with its graphic */
  for (let i = Actions.pending.length - 1; i >= 0; i--) {
    const w = Actions.pending[i];
    w.left -= 1;
    if (w.left > 0) continue;
    Actions.pending.splice(i, 1);
    w.fn();
  }

  /* A leap ordered by a click runs at the END of the tick it was ordered in, so
     that the flight is drawn over a whole tick's interpolation window rather than
     over the remainder of whichever tick the click landed in (see `leapTo`). It
     is re-tested here from the tile the player is actually on: a step between the
     click and the tick would have moved them, and the leap it was ordered for may
     no longer be a legal line. A leap that fails the test is simply dropped -
     `jumpToRocky` has already answered the player - and so is the whole rest of
     the queue behind it, since every later order was made from the tile this one
     was going to land on and no longer means anything. */
  if (game.player.pendingLeaps && game.player.pendingLeaps.length && !(ps.stunTicks > 0)) {
    const L = game.player.pendingLeaps.shift();
    const p0 = game.player;
    const n = leapLine(game.world, { x: Math.floor(p0.x), z: Math.floor(p0.z) }, L.tx, L.tz);
    if (n) applyLeap(p0, L.tx, L.tz, n);
    else game.player.pendingLeaps.length = 0;
  }

  /* A hidden player who has just taken a step is out of the crate: `lastMoveTick`
     is stamped on the tick a step lands (src/game.js#stepSim), and this runs at
     the end of that same tick. A click on an object rather than a tile never
     steps at all, which is why `begin` ends a hiding as well. */
  if (game.player.hidden && ps.lastMoveTick === game.tickCount) revealPlayer("You climb out of the crate.");

  const act = Actions.act;
  if (act) {
    const p = game.player;
    if (act.phase === "walk") {
      act.walkTimer += dt;
      /* A pickup's walk ends on the pile's own tile - passing a side tile on
         the way in is not arriving (the user's rule, 2026-10-09: stepping on
         is always preferred, the sides only the fallback). The fallback fires
         when the walk is visibly dead - no steps for a few ticks while beside
         the pile (frozen, sealed step, sealed tile) - so a rooted player still
         gathers from where they stand. */
      let arrived = actNear(act, p, 1);
      if (arrived && act.kind === "take" && !(Math.floor(p.x) === act.x && Math.floor(p.z) === act.z))
        arrived = act.stuck >= 2 && !p.moving;
      if (arrived) {
        act.phase = "work";
        act.timer = 1;
        p.path.length = 0;
        /* A pickup made standing on the pile itself faces nowhere: turning in
           place to the tile underfoot only snaps the body south, which is the
           one facing with nothing in front of it. Pack-work (fletch, craft,
           mix, grind, string) never faces anywhere either: its target is the
           player's own tile, so every tick of it would do the same snap -
           the user playing it, 2026-10-08: the character "auto rotates to
           face south when the action is received to make bows". `noFace`
           marks those activities, and both facings below honour it. */
        if (FURNACE_ACTS.has(act.kind)) faceFurnace(p);
        else if (!act.data.noFace && !(act.kind === "take" && Math.floor(p.x) === act.x && Math.floor(p.z) === act.z)) faceTarget(p, act.x, act.z);
        /* The swing is deliberately *not* raised here. The reach test reads the
           logical tile, and the logical tile is the one the tick's step moved
           the player on to - while the frame is still drawing them walking into
           it. Raising the pose on this tick is what made the character swing
           the pickaxe over the last stride of the walk-in (the user's report,
           2026-09-23: *"you cant play the mining animation until the character
           arrives at the adjacanet tile to the rock"*). The first attempt lands
           on the next tick (`act.timer = 1` above, and the work branch below
           spends it), that tick takes no step, and by then `renderPos` has
           caught up - so the pose `attemptMine` raises is the first thing drawn
           with the body standing still on the ring tile. See `raiseMineSwing`,
           and `castAnimTick` for the other half of the pair. */
      } else if (!p.moving && !p.path.length) {
        act.stuck++;
        if (act.stuck > 2) stopMsg("I can't reach that!");
        else actWalk(act, p);
      } else if (act.walkTimer > 14) {
        stopMsg("You stop.");
      }
    } else if (!actNear(act, p, 2)) {
      act.phase = "walk";
      act.stuck = 0;
      act.walkTimer = 0;
      actWalk(act, p);
    } else {
      /* Same rule as the walk-in handover above: a pickup from the pile's own
         tile never turns the body, on any tick of the work - and pack-work
         with `noFace` never turns it either. */
      if (FURNACE_ACTS.has(act.kind)) faceFurnace(p);
        else if (!act.data.noFace && !(act.kind === "take" && Math.floor(p.x) === act.x && Math.floor(p.z) === act.z)) faceTarget(p, act.x, act.z);
      act.timer -= 1;
      if (act.timer <= 0) runAttempt(act);
    }
  }

  /* A looping work pose belongs to the activity that raised it, not to the
     clock: it is kept up while the activity runs and dropped the moment it
     stops (the tree fell, the pack filled), so the axe never goes on swinging at
     a stump. `workAnim` refreshes the hold on every attempt while the act lives;
     this is the other half of that pair.

     Only while the swing is actually being made, too: a woodcutter or a miner
     retargeted from a felled tree / an emptied rock to the next one is *walking*,
     and the tool must be down for the walk, exactly as it would be if the ground
     had been clicked.

     **Mining is covered now, and that is two of the user's asks at once**
     (2026-09-23): *"the mining animation stops as soon as the ore has been taken
     and the rock becomes depleted"* and *"the animation needs to stop while the
     player is moving from one rock to another"*. Both fall out of the same rule,
     because both are the activity leaving its work phase - a session whose rock
     is emptied with nowhere to go ends (`stopMsg`), and one that retargets to the
     next rock goes back to `phase: "walk"`. The swing used to be exempt from
     this on purpose: it was one 8.8 s *sequence* raised as a one-shot, so
     dropping it would have left the pickaxe frozen mid-air, and a rock holding a
     single ore ended the activity in the very tick the pose was raised. The old
     swing is a 0.62 s loop instead, so it drops and re-raises cleanly, and it is
     raised the moment the player is in position rather than on the first attempt
     (see `raiseMineSwing`) - which is what makes the drop safe. */
  const kind = Actions.act && Actions.act.kind;
  const swinging = !!Actions.act && (kind === "wc" || kind === "mine") && Actions.act.phase === "work";
  /* ...unless the pose went up this very tick. A session that ends on the
     attempt that raised its first swing - a rock parting with its ore on the
     first roll, which is common at a low level - would otherwise have its pose
     armed and dropped inside one tick, before a single frame of it was drawn,
     and the player would stand perfectly still while the ore appeared in their
     pack. `workAnim` stamps the tick it raised a pose on (`castAnimTick`); this
     is the one tick that stamp protects, so the swing is always seen at least
     once whatever happens to the activity around it. See `raiseMineSwing`. */
  const justRaised = game.player.castAnimTick === game.tickCount;
  if (game.player.castLoop && !swinging && !justRaised) {
    game.player.castLoop = false;
    game.player.castTail = false;
    game.player.castAnim = null;
    game.player.castLeft = 0;
  }

  /* ...and the tool that pose is being performed with goes in the player's
     *hand*, for as long as the pose lasts: the axe a tree is chopped with, the
     pickaxe a rock is mined with. It is not an equipment change - the weapon
     slot keeps whatever it held and `setWorn` is handed the tool instead of it
     for as long as `castTool` is set (src/game.js#wornKeysFor) - which is what
     lets a player in a whip chop with an axe out of the pack and be holding the
     whip again the moment the swing stops. Tied to the *pose* rather than to the
     activity so the hand changes exactly when the animation does, and dropped
     with the pose - the woodcutting loop is dropped by the rule just above the
     moment the activity stops swinging, walk between two trees included, so the
     axe is down for the walk exactly as it would be if the ground had been
     clicked.

     The tool rides on the pose itself (`playCastAnim`'s own argument) rather
     than being read back out of the activity, which is what this used to do:
     `Actions.act` ends the moment the last ore is out of a rock, while the
     mining sequence it raised is 8.8 seconds long and goes on playing, so the
     pickaxe used to leave the hand in the middle of the swing it was being
     swung with - and on a rock that yields one ore, that was most of the
     animation. Here the only rule left is that a tool cannot outlive its pose. */
  const working = game.player.castAnim && (game.player.castLeft || 0) > 0;
  /* The hand the work is done with, held past the pose itself: a sandpit
     session dips a bucket a beat apart, and the weapon must stay out of the
     hand for the whole session - not just while each dip's pose is up - so
     the bucket rides the hold from the first walk-in to the last bucket
     (src/actions.js#attemptFillSand; the pose names it too, which covers the
     dips themselves). */
  const holdTool = (swinging && kind === "wc" && Actions.act.data ? Actions.act.data.axe : null)
    || (Actions.act && Actions.act.kind === "fillsand" ? "bucket" : null);
  game.player.castToolHold = holdTool || null;
  if (holdTool) game.player.castTool = holdTool;
  else if (!working && game.player.castTool) game.player.castTool = null;

  const now = game.time || 0;

  /* The sheep's fleece grows back - 50 ticks after the shears, the shorn model
     goes away and the woolly one comes back (src/actions.js#attemptShear). A
     walk over every creature once a tick is cheap, and doing it here rather
     than lazily on the next click is what keeps the field honest: a shorn sheep
     that nobody has touched still turns woolly again in front of you. */
  /* A sheep shorn by somebody else (the census's own bit - src/game.js
     #applyNpcStates sets `netSheared` from it). The model is swapped and the
     fleece's own thirty-second clock started, exactly as the shears do it, so
     the field looks the same on every screen; the walk below then puts the
     woolly model back when that clock runs out. */
  for (const npc of game.npcs || []) {
    if (!npc.netSheared) continue;
    npc.netSheared = false;
    if (npc.dead || npc.sheared) continue;
    npc.sheared = true;
    npc.regrowAt = now + SHEEP_REGROW_SECONDS;
    setNpcModel(npc, SHEEP_SHORN_MODEL);
  }

  for (const npc of game.npcs || []) {
    if (!npc.sheared || now < (npc.regrowAt || 0)) continue;
    npc.sheared = false;
    npc.regrowAt = 0;
    setNpcModel(npc, SHEEP_WOOLLY_MODEL);
  }

  /* Doors stay as they were left (the user's rule, 2026-09-22 - standing
     preference P3). They used to shut themselves nine seconds
     after the last character left the doorway, exactly like the real client's;
     the client is no longer the authority here, so there is no door clock to
     tick and nothing to keep a list of. A door is closed by clicking it. */

  for (let i = Actions.depleted.length - 1; i >= 0; i--) {
    const d = Actions.depleted[i];
    if (now >= d.at) {
      restoreResource(d);
      Actions.depleted.splice(i, 1);
    }
  }

  for (let i = Actions.fires.length - 1; i >= 0; i--) {
    const f = Actions.fires[i];
    if (now >= f.expire) {
      const o = game.world.objAt(f.x, f.z);
      if (o && o.t === "fire") {
        game.world.delObj(f.x, f.z);
        game.view.rebuildChunkAt(f.x, f.z);
        spawnGround("ashes", 1, f.x, f.z);
        /* The fire is gone and the tile is bare again: the record is cleared
           (no bits), and the ashes announce themselves as a ground pile in
           `spawnGround`. */
        reportLoc(f.x, f.z, 0);
      }
      Actions.fires.splice(i, 1);
    }
  }

  for (let i = Actions.traps.length - 1; i >= 0; i--) {
    const t = Actions.traps[i];
    const o = game.world.objAt(t.x, t.z);
    if (!o || !o.trapdoor || !o.open) { Actions.traps.splice(i, 1); continue; }
    if (now >= t.expire && !trapdoorSeen(game, t.x, t.z)) {
      setTrapdoor(t.x, t.z, false);
    }
  }

  for (let i = Actions.ground.length - 1; i >= 0; i--) {
    const g = Actions.ground[i];
    if (g.expires != null && now >= g.expires) {
      quietGround = true;
      try {
        removeGround(g);
      } finally {
        quietGround = false;
      }
    }
  }

  for (let i = 0; i < Actions.ground.length; i++) {
    const g = Actions.ground[i];
    if (g.mesh) {
      g.mesh.position.y = game.world.heightAt(g.x + 0.5, g.z + 0.5) + 0.02;
    }
  }
}

function runAttempt(act) {
  /* Every skilling cycle comes through here, so an activity that is already
     running clears a level-up the moment it raises its next attempt
     (src/dialogue.js#dismissLevelUp) - the panel is seen for the second or two
     between the level and the next log/fish/ore, exactly as long as the client
     leaves it on screen before the swing that follows overwrites it. */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  switch (act.kind) {
    case "wc": return attemptWc(act);
    case "mine": return attemptMine(act);
    case "fish": return attemptFish(act);
    case "cook": return attemptCook(act);
    case "cookone": return attemptCookOne(act);
    case "smelt": return attemptSmelt(act);
    case "smith": return attemptSmith(act);
    case "jewel": return attemptJewel(act);
    case "potshape": return attemptShape(act);
    case "potfire": return attemptFirePot(act);
    case "moltenglass": return attemptMolten(act);
    case "glassblow": return attemptBlow(act);
    case "fillsand": return attemptFillSand(act);
    case "craft": return attemptCraft(act);
    case "mix": return attemptMix(act);
    case "grind": return attemptGrind(act);
    case "spin": return attemptSpin(act);
    case "fletch": return attemptFletch(act);
    case "string": return attemptString(act);
    /* The pickup: `TAKE_PER_TICK` items per tick, re-arming a one-tick timer
       (see the pickup section below for the rate and why it is two). */
    case "take": return attemptTake(act);
    case "steal": return attemptSteal(act);
    /* The rocky shore's own activity (see the props' verbs section below): the
       player has walked to a launch tile (or is already on one) and either
       leaps or is walked the rest of the way to a tile they can leap from. */
    case "jump": {
      const w = G.world;
      const p = G.player;
      const tx = act.data.tx;
      const tz = act.data.tz;
      const from = { x: Math.floor(p.x), z: Math.floor(p.z) };
      const n = leapLine(w, from, tx, tz);
      if (n) { leapTo(tx, tz, n); return; }
      const launch = bestLaunch(w, from, tx, tz);
      if (!launch) { cancelAction(); chat("You can't reach that rock from here.", "warn"); return; }
      /* Not on a launch tile yet: aim the act at the nearest one and walk there
         exactly. `reach 0` matters here and is the reason this is not `begin`'s
         own walk - that one stops within a tile of its goal, and a stone is
         usually two. */
      act.x = launch.x;
      act.z = launch.z;
      act.phase = "walk";
      act.stuck = 0;
      act.walkTimer = 0;
      walkTo(p, w, launch.x, launch.z, 0, NO_MODS);
      return;
    }
    case "goto": {
      const fn = act.data.fn;
      cancelAction();
      if (fn) fn();
      return;
    }
    /* The isle's course: the walk-in has landed the player on the piece's launch
       tile (the act's own reach test is "exactly on it", so this fires once, on
       the right tile), and the pose goes up. */
    case "agility": return startAgility(act.data.spec, act.data.from, act.data.to);
    default: cancelAction();
  }
}

/* --------------------------------------------------------------- woodcutting */

export function chopTree(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "tree") return false;
  if (o.stump) { chat("There is no tree here to chop.", "warn"); return true; }
  const treeKind = o.kind || "tree";
  const logId = TREE_LOGS[treeKind];
  if (!logId) { chat("You can't chop this tree.", "warn"); return true; }
  const def = ITEMS[logId];
  /* The axe rides along for the pose, but refuses nothing here - see above. */
  const axe = axeInHand() || bestTool(AXES, "power");
  /* The axe, the level and the pack are all asked on arrival, never at the
     click: the user's rule (2026-10-06) is that a refusal is only received
     standing on a side face of the tree, so a click from anywhere else walks
     there first (the reach below) and attemptWc answers. What the click *does*
     decide is the tree: a stump, an unchoppable kind, and a repeated click on
     the running session all answer here. */
  const [tx, tz] = treeTileNear(o, x, z);
  const ox = o.ox != null ? o.ox : x, oz = o.oz != null ? o.oz : z;
  if (Actions.act && Actions.act.kind === "wc" && Actions.act.data.treeOx === ox && Actions.act.data.treeOz === oz) return true;
  /* The reach rides a factory, not the click's object: `nextTree` retargets
     the session onto neighbouring trees mid-session, and a test written around
     the first tree would call every later one "already there" (see `retarget`
     - mining's `reachTestOf` is the same shape for the same reason). */
  const reachTestOf = (ax, az) => treeReachTest(G.world.objAt(ax, az) || {}, ax, az);
  begin("wc", tx, tz, { logId, treeKind, axe, treeOx: ox, treeOz: oz, reachTestOf, inReach: true });
  return true;
}

/* The tile of a tree the player works from. A tree covers its whole footprint
   (world.js#TREE_FOOT) and every tile of it is the same tree, so the tile a
   click plans the walk to is the tile of that footprint nearest the player: a
   3x3 oak is chopped from the side the player is already standing on, not from
   its anchor corner on the far side of the trunk. A one-tile tree (a specimen
   stump, a hollow tree) answers with its own tile, as it always did. */
function treeTileNear(o, x, z) {
  const p = G.player;
  const fx = o.fx || 1, fz = o.fz || 1;
  const ox = o.ox != null ? o.ox : x, oz = o.oz != null ? o.oz : z;
  const px = Math.round(p.x - 0.5), pz = Math.round(p.z - 0.5);
  return [
    Math.min(Math.max(px, ox), ox + fx - 1),
    Math.min(Math.max(pz, oz), oz + fz - 1),
  ];
}

function treeIsAnchor(q, qx, qz) {
  return q.ox == null || (q.ox === qx && q.oz === qz);
}

function nextTree(act) {
  const alt = findObjectNear(act.x, act.z, (q, qx, qz) => q.t === "tree" && !q.stump && treeIsAnchor(q, qx, qz) && (q.kind || "tree") === act.data.treeKind, 9);
  if (!alt) return false;
  const o = G.world.objAt(alt[0], alt[1]);
  const [tx, tz] = treeTileNear(o, alt[0], alt[1]);
  if (o.ox != null) { act.data.treeOx = o.ox; act.data.treeOz = o.oz; }
  retarget(act, tx, tz);
  return true;
}

/* The per-roll chance of a log, given the *effective* woodcutting level, the
   tree's requirement and the axe's tier (1 bronze .. 8 dragon, `power` in
   src/items.js). Exported so it can be probed live.

   Wiki-grounded, constants tuned (Jagex never published them): the wiki's
   mechanics say rolls happen **every 4 ticks**, the chance depends on the
   player's level, the axe and the tree, and a high level with a good axe
   reaches **100% on lower trees**. So the roll interval is the constant and
   the chance is the variable - unlike mining, where this world's model (taken
   from the wiki's own ticks-between-rolls table) keeps the chance fixed and
   lets the pickaxe set the rate. Level and tier are both worth much more than
   the old fudge (`0.34 + 0.014/level + 0.055/tier`), whose 34% floor is what
   made every axe feel identical: bronze now opens at 40% on its own tree
   while each tier is worth about four levels, and the cap is a real 1. */
export function wcChance(level, req, power) {
  return pct(Math.min(1, 0.40 + Math.max(0, level - req) * 0.012 + Math.max(0, (power || 1) - 1) * 0.045));
}

function attemptWc(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "tree" || o.stump) {
    if (nextTree(act)) return;
    return stopMsg("This tree has been chopped down.");
  }
  /* Arrival-gated refusals (the user's NSEW rule - see chopTree): the axe,
     the level and the pack are answered from the side face, never from across
     the map. The pose below only rises once all three pass, so a refusal never
     lifts the axe. */
  const axe = axeInHand() || bestTool(AXES, "power");
  if (!axe) return stopMsg("You need an axe to chop down this tree.");
  const need = ITEMS[act.data.logId];
  if (skillLvl("woodcutting") < need.levelReq) {
    return stopMsg("You need a Woodcutting level of " + need.levelReq + " to chop this tree.");
  }
  if (invFreeSlots() < 1) return stopMsg("Your inventory is too full to hold any more logs.");
  /* One chop per roll: the 0.8 s sequence plays once as a one-shot and the
     axe rests for the remainder of the 4-tick (2.4 s) cycle - the wiki's own
     roll interval - exactly like the live game's swing-pause-swing. Looping
     it wrapped the chop back to back so every roll showed two swings. Raised
     only once the attempt can actually happen, so a refusal never lifts the
     axe. The axe is re-read every roll rather than kept from the click, so
     swapping to a better axe mid-session speeds the session up. */
  const liveAxe = axeInHand() || bestTool(AXES, "power");
  if (liveAxe) act.data.axe = liveAxe;
  workAnim(TOOL_POSES[act.data.axe] || "wc_bronze", true, act.data.axe);
  const def = ITEMS[act.data.logId];
  const chance = wcChance(skillLvl("woodcutting"), def.levelReq, (ITEMS[act.data.axe] || {}).power || 1);
  if (Math.random() < chance) {
    invAdd(G.ps, act.data.logId, 1);
    addXp(G.ps, "woodcutting", def.xp);
    noteAim("chop");
    chat("You get some " + itemName(act.data.logId).toLowerCase() + ".", "game");
    mark("inv");
    /* Remember how many logs this tree holds the first time it is swung at, so
       a regrown stump (restoreResource) comes back with its own count and not
       with the single log a zeroed `hp` would give it. */
    if (o.hpMax == null) o.hpMax = o.hp || 1;
    o.hp = (o.hp || 1) - 1;
    if (o.hp <= 0) {
      /* Felled: the tree draws a stump until it grows back, and keeps the ground
         it stood on (the same footprint - see world.js#isWalkable, which is what
         makes the stump solid). `key` is left alone, because it is the *tree*
         the object grows back as; the stump's own model is named beside it. */
      o.stump = true;
      o.stumpKey = stumpKeyFor(o.ox != null ? o.ox : act.x, o.oz != null ? o.oz : act.z, o.fx || 1, o.fz || 1);
      w.setObj(act.x, act.z, o);
      G.view.rebuildChunkAt(act.x, act.z);
      /* The tree's own respawn, one roll for both the local clock and the
         world's - and the *number of seconds* is what travels, not a deadline,
         so every client arms its own timer from it and no two clocks have to
         agree (see "the world ledger"). */
      const regrow = 10 + Math.random() * 22;
      Actions.depleted.push({ x: act.x, z: act.z, at: (G.time || 0) + regrow, kind: "tree" });
      reportLoc(act.x, act.z, regrow);
      if (nextTree(act)) { act.timer = 4; return; }
      stopMsg(null);
    } else {
      /* A tree with logs left has a count, and the count is part of its state -
         the logs it will grow back with (see `restoreResource`) and the swing
         that will bring it down. */
      reportLoc(act.x, act.z, 0);
    }
  } else if (Math.random() < 0.15) {
    chat("You swing your axe at the tree.", "game");
  }
  act.timer = 4;
}

function findObjectNear(x, z, pred, radius) {
  const w = G.world;
  let best = null;
  let bestD = Infinity;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const o = w.objAt(x + dx, z + dz);
      if (!o || !pred(o, x + dx, z + dz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [x + dx, z + dz]; }
    }
  }
  return best;
}

function restoreResource(d) {
  const w = G.world;
  const o = w.objAt(d.x, d.z);
  if (!o) return;
  /* One else-if chain, one flag each: the object only ever restores its own
     kind. */
  /* A regrown stump comes back with the count of logs it held, remembered the
     first time it was chopped (`o.hpMax`). Without this it grew back with
     `hp` 0, and `(0 || 1) - 1` felled it on the first swing - every tree in
     the world gave one log instead of its full two to five after the first
     felling. */
  if (d.kind === "tree" && o.t === "tree") {
    /* Grown back: the canopy model returns (`key` was never changed - the stump
       named its own model beside it) and `setObj` re-stamps the tree's whole
       footprint, so every tile it covers is the tree again. */
    o.stump = false;
    if (o.hpMax) o.hp = o.hpMax;
  }
  else if (d.kind === "stall" && o.t === "stall") o.looted = false;
  else if (d.kind === "rock" && o.t === "rock") o.empty = false;
  else if (d.kind === "flax" && o.t === "flax") o.picked = false;
  /* An emptied crate comes back with the stock it held, remembered on the
     first search (`o.loot0`) - the same shape as a regrown tree's log count.
     A crate that never held anything (or a chest, which stays one-and-done)
     has no `loot0` and is left alone. */
  else if (d.kind === "crate" && (o.t === "crate" || o.t === "crate_b") && o.loot0) {
    o.loot = { id: o.loot0.id, qty: o.loot0.qty };
  }
  w.setObj(d.x, d.z, o);
  G.view.rebuildChunkAt(d.x, d.z);
  /* Told to the world after the fact, the rule every other change follows: the
     tree has grown back here, so the tile has no bits again and every other
     client lays the canopy back down with it. */
  reportLoc(d.x, d.z, 0);
}

/* --------------------------------------------------------------- mining */

/* The tiles a rock may be worked from: **the four sides and never a corner**,
   as long as the tile is open ground.

   This exists because the **north side** used to be the only one the player
   could mine from, and it was not a rule anybody wrote - it is what the
   pathfinder's own fallback does. A rock's tile is solid (`world.SOLID_TYPES`),
   so a walk whose destination is the rock itself is swapped for "the nearest
   walkable tile", and `pathfind.js#nearestWalkable` scans a ring from `dz = -r`
   *upwards*, so the first tile of the innermost ring it ever reaches is the one
   due north (`dz -1, d = 1` beats every corner). The route then ends there and
   the arrival test - which has always been "within one tile on any side" - is
   satisfied, so the player mined from the north face of every rock in the world
   and nowhere else (the user's report, 2026-09-23: *"you should be able to mine
   the rock from whatever is the closest available side tile, whether its north
   south east or west as long as its unobstructed obviously"*).

   The fix is to say the goal out loud instead of letting the fallback choose it:
   the activity carries this as its `reachTest`, which `actWalk` passes to
   `walkTo` as the walk's own `goalTest` (src/game.js#walkTo), so the search stops
   on the first ring tile it *reaches* - the genuinely nearest one, whichever
   side that is - and `actNear` judges arrival by the same predicate, so the route
   and the test that ends it can never disagree. The walkability test is what
   makes "as long as its unobstructed" true: a tile taken by another rock, a
   wall or water is not a goal, so the player walks round to a face they can
   actually swing at.

   **The ring is the four sides, not the eight tiles around it** (the user's
   report, 2026-09-23: *"for mining and prospecting rocks, they must be next to
   the tile just like when you attack npcs, with melee, you must also stand
   immediately to one adjacent tile but not a diagonal tile"*). It was Chebyshev
   distance - a side or a corner - and that is exactly the flaw combat's melee
   reach had: a diagonal is not a face you can swing at, so a player standing on
   a corner could start a rock (and prospect it) that they were not beside. The
   measure is now Manhattan, the same statement as `combat.js#reachDistance` for
   a melee blow and as `walkTo`'s own `opts.orthogonal` ring, and this predicate
   is the *only* reach test for a rock: `actNear` and `approach` both read it
   instead of their own eight-tile default when an activity brings one (see
   `actNear`). */
function rockReachTest(rx, rz) {
  /* Adjacent means Manhattan 1 to ANY tile of the footprint: a 1x1 rock is
     the old single-tile test, and the 5x5 essence rock is swung at from the
     side the player is already on (the tree rule - see treeReachTest). The
     object is read at call time, so a test built for one tile of a footprint
     still answers for the whole of it. */
  return (x, z) => {
    if (!G.world.isWalkable(x, z)) return false;
    const o = G.world.objAt(rx, rz);
    const ox = (o && o.ox != null) ? o.ox : rx, oz = (o && o.oz != null) ? o.oz : rz;
    const fx = (o && o.fx) || 1, fz = (o && o.fz) || 1;
    for (let dx = 0; dx < fx; dx++) for (let dz = 0; dz < fz; dz++) {
      if (Math.abs(x - (ox + dx)) + Math.abs(z - (oz + dz)) === 1) return true;
    }
    return false;
  };
}

/* The four sides of one tile: cardinally adjacent, never a diagonal. This is
   the measure behind the user's standing rule (2026-10-06) - a refusal message
   ("no tool", "too low", "pack full", "nothing to process") is only ever
   received standing on a tile NSEW-adjacent to the target object, so a click
   from anywhere else walks to a side face first and the message fires on
   arrival. Target-*state* answers (a stump, an empty rock, an already-looted
   stall) stay immediate - they describe the world, not the player - but every
   player-state refusal below goes through this test, at the click for the
   already-there case and through the walk-in's goal otherwise. */
function sideReachTest(rx, rz) {
  return (x, z) => Math.abs(x - rx) + Math.abs(z - rz) === 1 && G.world.isWalkable(x, z);
}

function furnaceMouthTile() {
  const w = G.world;
  if (w.furnaceMouth) return w.furnaceMouth;
  for (const [k, o] of w.objs) {
    if (o && o.t === "furnace" && o.mouth) {
      w.furnaceMouth = { x: k % w.w, z: Math.floor(k / w.w) };
      return w.furnaceMouth;
    }
  }
  return null;
}

function furnaceMouthTest() {
  const m = furnaceMouthTile();
  return (x, z) => !!m && x === m.x && z === m.z;
}

/* The furnace acts - smelting, jewellery and molten glass - all work from the
   mouth tile, standing ON the furnace's own footprint. Facing the act's tile
   would turn the worker to the ground underfoot (the south snap), so these
   face the furnace's body instead: one tile north of the mouth, the middle of
   the 3x3 the stamp lays. */
const FURNACE_ACTS = new Set(["smelt", "jewel", "moltenglass"]);
function faceFurnace(p) {
  const m = furnaceMouthTile();
  if (m) faceTarget(p, m.x, m.z - 1);
}

/* The same four-sides rule for a multi-tile footprint (a 3x3 oak is chopped
   from the side the player is already on): adjacent means Manhattan 1 to ANY
   tile of the block. */
function treeReachTest(o, x, z) {
  const ox = o.ox != null ? o.ox : x, oz = o.oz != null ? o.oz : z;
  const fx = o.fx || 1, fz = o.fz || 1;
  return (px, pz) => {
    if (!G.world.isWalkable(px, pz)) return false;
    for (let dx = 0; dx < fx; dx++) for (let dz = 0; dz < fz; dz++) {
      if (Math.abs(px - (ox + dx)) + Math.abs(pz - (oz + dz)) === 1) return true;
    }
    return false;
  };
}

export function mineRock(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "rock") return false;
  if (o.empty) { chat("There is no ore currently available in this rock.", "warn"); return true; }
  if (o.ore === "none") { chat("This rock contains no ore.", "warn"); return true; }
  const oreId = ORE_ITEMS[o.ore];
  const def = oreId && ITEMS[oreId];
  if (!def) { chat("You can't mine this rock.", "warn"); return true; }
  /* The pick, the level and the pack are all asked on arrival (the user's NSEW
     rule - see sideReachTest): the click only decides the rock - empty,
     oreless and unmineable answer here - and the session below walks to a side
     face first, where attemptMine answers. */
  if (Actions.act && Actions.act.kind === "mine" && Actions.act.x === x && Actions.act.z === z) return true;
  begin("mine", x, z, { oreId, rock: o.ore, pick: bestTool(PICKS, "power"), reachTestOf: rockReachTest, inReach: true });
  return true;
}

/* Prospecting: the client's own extra option on every rock, right below Mine.
   It never consumes anything and always answers, whether or not the rock still
   holds ore.

   It is a **reach** like every other world interaction, and that is the whole of
   the change the user asked for on 2026-09-23: *"the player cannot prospect
   rocks unless they are standing directly next to them. and if they are
   standing on an angle, when you click prospect, the player actually turns
   directly toward the rock to prospect it."* The check used to happen at the
   click, from wherever the player happened to be standing, so a rock could be
   identified from the far side of the mine. It now goes through `approach` with
   the same ring test mining uses: a player already beside the rock prospects it
   on the spot, and one who is not walks to the nearest open tile around it
   first. `approach`'s own arrival turns the player towards the object's centre
   (the `faceTarget` in the walk-to-work handover, and the one below for the
   already-there case), which is what makes a diagonal click read correctly: the
   body swings round to look straight at the rock rather than answering off the
   shoulder. The line itself is read again inside the callback, because the walk
   is at best a tick away and somebody else may have emptied the rock in the
   meantime. */
export function prospectRock(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "rock") return false;
  approach(x, z, () => {
    faceTarget(G.player, x, z);
    const q = w.objAt(x, z);
    if (!q || q.t !== "rock") return;
    if (q.empty) chat("This rock has been mined out.", "game");
    else if (!q.ore || q.ore === "none") chat("This rock contains no ore.", "game");
    else chat("This rock contains " + itemName(ORE_ITEMS[q.ore]).toLowerCase() + ".", "game");
  }, rockReachTest(x, z));
  return true;
}

/* Raise the mining swing the moment a click starts a session at a rock the
   player is *already standing beside* (`begin`'s `inReach` shortcut - see
   `mineRock`), so the pickaxe is swinging from the click rather than from the
   first attempt a tick later.

   The pose is refreshed by every attempt anyway (`attemptMine`), so the only
   thing this adds is the first tick - and standing at the rock already, that
   tick is a tick the character is standing still for. A walk-in does **not**
   come through here: on the tick the walk's last step is taken the reach test
   is satisfied while the frame is still drawing the body walking into the tile,
   so the session is left to raise its own pose on the first attempt, which is
   the tick after (see the handover in `tickActions`, and `midStep`). */
function raiseMineSwing(act) {
  /* Gated like the attempt itself: a refusal never lifts the pick, including
     the click the player is already standing beside for (see attemptMine). */
  if (!bestTool(PICKS, "power")) return;
  const oreId = ORE_ITEMS[act.data.rock];
  const def = oreId && ITEMS[oreId];
  if (!def || skillLvl("mining") < def.levelReq) return;
  if (invFreeSlots() < 1) return;
  workAnim(TOOL_POSES[act.data.pick] || "mine_bronze", true, act.data.pick, true);
}

/* How often the game rolls for an ore, in ticks, per pickaxe - the OSRS wiki's
   own "Ticks between rolls" column (Bronze pickaxe 8, iron 7, steel 6, mithril
   5, adamant 4, rune 3). This is the *only* thing the pickaxe changes: as Mod
   Ash put it, "your level affects the chance of getting ore each time the game
   rolls; your pickaxe affects how often that happens" (28 Oct 2019, quoted on
   the wiki's Mining page). The old code let a better pickaxe raise the *chance*
   (a flat +5.5% a tier) and rolled every three ticks for everyone, so a rune
   pickaxe at a clay rock was a certainty and the tier was worth nothing else.

   Nothing in this world hammers the roll, so the two fractional rows the wiki
   lists below rune (dragon 2.83, crystal 2.75) have no item behind them. */
const MINE_ROLL_TICKS = {
  bronze_pickaxe: 8, iron_pickaxe: 7, steel_pickaxe: 6,
  mithril_pickaxe: 5, adamant_pickaxe: 4, rune_pickaxe: 3,
};

/* The skilling success function, the client's own one (the OSRS wiki's
   "Skilling success rate" page): two constants per rock - `low`, the numerator
   at level 1, and `high`, the numerator at level 99 - and a straight line
   between them, rounded to the nearest of 256. `+ 0.5` under the floor() is the
   function's own rounding, and the bounds matter in both directions: below the
   level requirement the numbers are still defined, and above level 99 (a boost)
   the sum runs past 256 and has to be pinned at 1 rather than reported as a
   probability of 1.4. */
function mineChance(low, high, level) {
  const l = Math.max(1, Math.min(99, level));
  const v = Math.floor((low * (99 - l)) / 98 + (high * (l - 1)) / 98 + 0.5);
  return pct((1 + v) / 256);
}

function attemptMine(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "rock" || o.empty || o.ore !== act.data.rock) {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "rock" && !q.empty && q.ore === act.data.rock, 8);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You have mined all the nearby ore.");
  }
  /* Arrival-gated refusals (the user's NSEW rule - see sideReachTest): the
     pick, the level and the pack are answered from the side face. All three
     come before the swing below, so a refusal never lifts the pick. */
  const pick = bestTool(PICKS, "power");
  if (!pick) return stopMsg("You need a pickaxe to mine this rock.");
  const need = ITEMS[act.data.oreId];
  if (skillLvl("mining") < need.levelReq) {
    return stopMsg("You need a Mining level of " + need.levelReq + " to mine this rock.");
  }
  if (invFreeSlots() < 1) return stopMsg("Your inventory is too full to hold any more ore.");
  /* the swing loops for as long as the session does - see `raiseMineSwing`, and
     the note on the dropping rule in `tickActions` */
  workAnim(TOOL_POSES[act.data.pick] || "mine_bronze", true, act.data.pick, true);
  const def = ITEMS[act.data.oreId];
  /* Rune essence never misses and never runs out (the wiki's own "Mining
     speed" and "Respawn time: N/A"): every roll lands, and the rock stays
     standing, so the session just keeps swinging until the pack fills or the
     player walks away. The pickaxe still matters - MINE_ROLL_TICKS below. */
  const essence = act.data.rock === "essence";
  const chance = essence ? 1 : mineChance(def.mineLow, def.mineHigh, skillLvl("mining"));
  if (Math.random() < chance) {
    /* The bracelet of clay (unit L3): a worn bracelet turns every clay this
       pickaxe breaks into **soft clay**, one charge at a time, and crumbles on
       the twenty-eighth. Only clay is affected - every other rock gives what it
       always gave - and the charge is spent on the *yield*, so a bracelet on an
       empty rock is never charged for nothing. */
    const bracelet = act.data.rock === "clay" && equippedId(G.ps, "hands") === "bracelet_of_clay";
    const give = bracelet ? "soft_clay" : act.data.oreId;
    invAdd(G.ps, give, 1);
    addXp(G.ps, "mining", def.xp);
    noteAim("mine");
    if (bracelet) {
      const r = useRingCharge(G.ps, "hands");
      mark("equip");
      chat("You mine some soft clay.", "game");
      if (r.crumbled) chat("Your bracelet of clay crumbles to dust.", "game");
    } else {
      chat("You manage to mine some " + itemName(act.data.oreId).toLowerCase() + ".", "game");
    }
    mark("inv");
    if (!essence) {
    o.empty = true;
    w.setObj(act.x, act.z, o);
    G.view.rebuildChunkAt(act.x, act.z);
    const respawn = 8 + Math.random() * 18;
    Actions.depleted.push({ x: act.x, z: act.z, at: (G.time || 0) + respawn, kind: "rock" });
    reportLoc(act.x, act.z, respawn);
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "rock" && !q.empty && q.ore === act.data.rock, 8);
    if (alt) retarget(act, alt[0], alt[1]);
    else stopMsg(null);
    }
  } else if (Math.random() < 0.15) {
    chat("You swing your pickaxe at the rock.", "game");
  }
  act.timer = MINE_ROLL_TICKS[act.data.pick] || 3;
}

/* ---------------------------------------------------------- runecrafting */

/* Where Sedridor's teleport lands (the essence mine's own island, south-west
   in the southern sea) and where the ruins step through to (the Air Altar's
   own island, east in the open sea). Neither isle can be walked to: the mine
   is left through its return portal (bound for Sedridor), the altar through
   its exit portal (bound for the ruins). */
const ESSENCE_MINE = [11, 165];
const AIR_ALTAR_AT = [116, 146];
/* The jumps with no spell behind them - Sedridor's trip, the ruins, the isle
   portals, the course gate. They vanish and arrive with the standard
   teleport's own pair, so they announce under its id (30, Lumbridge: the row
   whose cast pose is `cast_teleport` and whose bubble is 111, exactly what is
   played here) - otherwise the vanish plays only at home and the arrival
   never leaves it, because both packets need an id. That is the visibility
   rule: a teleport with nobody to announce it is still a teleport everybody
   standing around watches (src/tools/check-visibility.mjs). */
const TELEPORT_FX = { id: 30, arrive: "cast_arrive", start: 111, startH: 92 };

/* Brother Jered's blessing: every unblessed symbol of Saradomin carried
   becomes a holy symbol. The live game asks 31 Prayer of it - the monastery
   door's own entry requirement - and no experience either way. */
function blessJered() {
  const n = invCount(G.ps, "unblessed_symbol");
  if (!n) { chat("You have no unblessed symbols for Brother Jered to bless.", "game"); return; }
  if (skillLvl("prayer") < 31) { chat("You need a Prayer level of 31 to have a symbol blessed.", "warn"); return; }
  invRemove(G.ps, "unblessed_symbol", n);
  invAdd(G.ps, "holy_symbol", n);
  chat("Brother Jered blesses your symbol" + (n === 1 ? "." : "s."), "game");
  mark("inv");
}

function jeredScreens() {
  return [{
    ...npc("Greetings, traveller. I am Brother Jered, a priest of Saradomin. Do you seek his blessing?"),
    options: [
      opt("Please bless my unblessed symbols.", [
        player("Please bless my unblessed symbols."),
        then(() => blessJered()),
      ]),
      opt("What does a holy symbol do?", [
        player("What does a holy symbol do?"),
        npc("It is Saradomin's own protection, and it lends its wearer strength in prayer. Bring me the symbol strung but unblessed and I shall bless it."),
      ]),
    ],
  }];
}

/* The Spirit of Scorpius's blessing: every unpowered symbol of Zamorak
   carried becomes an unholy symbol, freely - the grave asks nothing. */
function blessScorpius() {
  const n = invCount(G.ps, "unpowered_symbol");
  if (!n) { chat("You have no unpowered symbols for the spirit to bless.", "game"); return; }
  invRemove(G.ps, "unpowered_symbol", n);
  invAdd(G.ps, "unholy_symbol", n);
  chat("The spirit blesses your symbol" + (n === 1 ? "." : "s."), "game");
  mark("inv");
}

function scorpiusScreens() {
  return [{
    ...npc("Who disturbs the rest of Scorpius? Ah - a follower of the dark god. Do you carry an emblem of Zamorak?"),
    options: [
      opt("Please bless my unpowered symbols.", [
        player("Please bless my unpowered symbols."),
        then(() => blessScorpius()),
      ]),
      opt("What does an unholy symbol do?", [
        player("What does an unholy symbol do?"),
        npc("It is Zamorak's own mark, and it lends its wearer strength in battle and in prayer. Bring me the emblem strung but unpowered and I shall bless it."),
      ]),
    ],
  }];
}

/* Wizard Sedridor's own tree: the essence-mine teleport, the air talisman,
   and what runecrafting is. He stands west of the town square (src/world.js);
   the mine is on its own island, which is what the teleport is for. */
function sedridorScreens() {
  return [{
    ...npc("Greetings, traveller. I am Sedridor, Archmage of the Wizards' Tower. Do you seek the essence of magic itself?"),
    options: [
      opt("Teleport me to the rune essence mine, please.", [
        player("Teleport me to the rune essence mine, please."),
        npc("One moment - hold still.", { next: then(() => { endDialogue(); sedridorTeleport(); }) }),
      ]),
      opt("Can I have an air talisman?", [
        player("Can I have an air talisman?"),
        then(() => giveAirTalisman()),
      ]),
      opt("What is runecrafting?", [
        player("What is runecrafting?"),
        npc("Mine rune essence from the great rock on the island I send you to - its portal brings you back here. Then carry the essence with an air talisman to the mysterious ruins on their point east of the mine, past the beach. Step through to the Air Altar's island, bind the essence into air runes there, and leave through its portal."),
      ]),
    ],
  }];
}

function sedridorTeleport() {
  chat("Sedridor weaves a teleport spell.", "game");
  playCastAnim(G.player, "cast_teleport");
  if (Net.status === "online") netCast(TELEPORT_FX.id);
  afterSeconds(1.2, () => teleportJump({ at: ESSENCE_MINE, place: "the essence mine", ...TELEPORT_FX }));
}

/* The air talisman is never consumed by travel and never stacked: one in the
   pack is enough for every trip - but the tiara binding below EATS one, so a
   player who bound theirs needs another, and Sedridor always hands one over. */
function giveAirTalisman() {
  invAdd(G.ps, "air_talisman", 1);
  chat("Sedridor hands you an air talisman.", "game");
  mark("inv");
}

/* Through the mysterious ruins to the Air Altar: the talisman rides in the
   pack, it is not spent - and an air tiara opens them too, worn on the head
   or carried, since it carries the talisman's own power. Without either the
   stones are only stones. */
function enterAirAltar(tx, tz) {
  approach(tx, tz, () => {
    faceTarget(G.player, tx, tz);
    const pass = invCount(G.ps, "air_talisman") || invCount(G.ps, "air_tiara") ||
      equippedId(G.ps, "head") === "air_tiara";
    if (!pass) { chat("You need an air talisman to enter these ruins.", "warn"); return; }
    chat("You hold the talisman up to the ruins...", "game");
    playCastAnim(G.player, "cast_teleport");
    if (Net.status === "online") netCast(TELEPORT_FX.id);
    afterSeconds(1.2, () => teleportJump({ at: AIR_ALTAR_AT, place: "the Air Altar", ...TELEPORT_FX }));
  });
}

/* Binding at the Air Altar: every rune essence carried becomes air runes in
   one act - one per essence at level 1, an extra per essence every 11 levels
   (ten per essence at 99), five Runecrafting xp per essence, the live game's
   own numbers. */
function craftAirRunes(tx, tz) {
  approach(tx, tz, () => {
    faceTarget(G.player, tx, tz);
    const n = invCount(G.ps, "rune_essence");
    if (!n) { chat("You have no rune essence to bind.", "warn"); return; }
    /* The channel itself: the arms-raised pose and the cache's own purple
       swirl (spotanim 186) on the player, the live game's own effect - hung
       at the standard on-player height (gfx.js: 92 = mid-chest) and riding
       the body, the way the client merges a caster's spotanim into its own
       model. */
    playCastAnim(G.player, "runecraft");
    Gfx.play(186, { x: G.player.x, z: G.player.z, target: G.player, height: 92 });
    /* The swirl plays on the neighbours' screens too, riding the ghost
       (src/net.js#C_GFX) - the pose goes out as work state, but no spell
       carries this graphic. */
    if (Net.status === "online") netGfx(186, 92);
    const per = 1 + Math.floor(skillLvl("runecrafting") / 11);
    invRemove(G.ps, "rune_essence", n);
    invAdd(G.ps, "air_rune", n * per);
    addXp(G.ps, "runecrafting", 5 * n);
    chat("You bind " + (n * per) + " air rune" + (n * per === 1 ? "" : "s") + ".", "game");
    mark("inv");
  });
}

/* The isle portals (runecrafting): the essence portal's own Enter, bound for
   wherever the portal was placed to go (src/world.js#essencePortal,
   #altarPortal). Same spin-and-jump as every other teleport. */
function usePortal(tx, tz) {
  const o = G.world.objAt(tx, tz);
  const to = (o && o.to) || [62, 57];
  /* What the far side is called. The runecrafting portals predate the field
     and land on "the other side"; the island portals name theirs. */
  const place = (o && o.place) || "the other side";
  approach(tx, tz, () => {
    faceTarget(G.player, tx, tz);
    chat("You step through the portal...", "game");
    playCastAnim(G.player, "cast_teleport");
    if (Net.status === "online") netCast(TELEPORT_FX.id);
    afterSeconds(1.2, () => teleportJump({ at: to, place, ...TELEPORT_FX }));
  });
}

/* --------------------------------------------------------------- fishing */

/* Every fishing spot in the cache is the same mesh (model 1491, locs 2028,
   2029, 2030, 2031, 3032 and 8986); the only thing that tells the kinds apart
   is the loc's own action list, and the world records which list a spot was
   placed from in its `kind` field (src/world.js#fishSpots). So the verb on the
   menu is the loc's word, never ours, and the tool under it is the `tool` field
   of the fish that live there (src/items.js#FISH). Order matters: index 0 is
   the loc's first action, which is the client's left-click verb. The four
   classic spots each carry both of the loc's own options - Net/Bait (2028),
   Lure/Bait (10087 "Ominous Fishing Spot" ["Lure","Bait"]), Cage/Harpoon
   (2029) and Net/Harpoon (2030) - and a method narrows the spot to one tool's
   fish, so Bait on a Lure/Bait spot can never land a trout. */
const METHOD_VERB = { net: "Net", rod_bait: "Bait", fly: "Lure", cage: "Cage", harpoon: "Harpoon", bignet: "Net", oily: "Bait", vessel: "Fish" };
const SPOT_METHODS = {
  net_bait: [{ verb: "Net", tool: "net" }, { verb: "Bait", tool: "rod_bait" }],
  lure_bait: [{ verb: "Lure", tool: "fly" }, { verb: "Bait", tool: "rod_bait" }],
  cage_harpoon: [{ verb: "Cage", tool: "cage" }, { verb: "Harpoon", tool: "harpoon" }],
  net_harpoon: [{ verb: "Net", tool: "net" }, { verb: "Harpoon", tool: "harpoon" }],
  bignet_harpoon: [{ verb: "Net", tool: "bignet" }, { verb: "Harpoon", tool: "harpoon" }],
  bait: [{ verb: "Bait", tool: "rod_bait" }],
  harpoon: [{ verb: "Harpoon", tool: "harpoon" }],
  oily: [{ verb: "Bait", tool: "oily" }],
  /* Karambwan water (src/items.js): karambwanji on the small net, karambwan
     itself on the vessel - one spot, two methods, like every classic kind. */
  karambwan_spot: [{ verb: "Net", tool: "net" }, { verb: "Fish", tool: "vessel" }],
};

/* Three of the methods spend a consumable per catch, exactly as the 2007
   client's do: a rod with Bait needs *fishing bait* in the pack (sardine,
   herring, pike) and the Fly rod needs *feathers* (trout, salmon) - and a
   karambwan vessel needs *raw karambwanji*, netted at the same spot. Net,
   harpoon and lobster pot need nothing, which is what keeps the level-1 net a
   working start with no shop trip. The item is spent only when a fish is
   actually landed, and `fishSpot` will not even begin a session without one -
   so the player is told before they swing, not after. */
const FISH_BAIT_ITEM = { rod_bait: "fishing_bait", fly: "feather", oily: "fishing_bait", vessel: "raw_karambwanji" };
const FISH_BAIT_WORD = { rod_bait: "fishing bait", fly: "feathers", oily: "fishing bait", vessel: "raw karambwanji" };

/* The actions at a spot, in the loc's own order. A kind nobody has tabulated
   falls back to its fish, lowest level first - which reproduces every tabulated
   list above, because the fish in each kind happen to enter by level in the
   order the loc's actions name their tools. */
function spotMethods(kind) {
  const known = SPOT_METHODS[kind];
  if (known) return known;
  const out = [];
  for (const f of FISH_BY_SPOT[kind] || []) {
    if (!METHOD_VERB[f.tool] || out.some((m) => m.tool === f.tool)) continue;
    out.push({ verb: METHOD_VERB[f.tool], tool: f.tool });
  }
  return out.length ? out : [{ verb: "Fish", tool: null }];
}

export function fishSpot(x, z, method) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "fishing") return false;
  const list = FISH_BY_SPOT[o.kind] || [];
  if (!list.length) { chat("There are no fish here.", "warn"); return true; }
  /* A method narrows the spot to one tool's fish, so Net at a Net/Bait spot can
     never land a herring and Harpoon at a Cage/Harpoon spot can never land a
     lobster. No method (the left-click path passes the spot's first action)
     keeps the "best this spot and this pack allow" pick. */
  const pool = method ? list.filter((f) => f.tool === method) : list;
  if (!pool.length) { chat("There are no fish here.", "warn"); return true; }
  /* The click only decides the spot: the level, the tool, the bait and the
     pack are all answered on arrival (the user's NSEW rule - see
     sideReachTest), and attemptFish below says the same lines from the side
     face. The level comes first, the tool second, and the bait last, and the
     tool named is the one for the lowest-level fish the player's level could
     reach - a cage-and-harpoon spot tells a cageless angler about the cage,
     not the harpoon. */
  if (Actions.act && Actions.act.kind === "fish" && Actions.act.x === x && Actions.act.z === z) return true;
  /* The method's tool rides along, not one chosen fish: every attempt re-rolls
     which of the method's fish is on the hook (see attemptFish), so a fly spot
     lands trout *and* salmon at a ratio instead of salmon forever once its
     level is reached. */
  const meth = method || (pool[0] && pool[0].tool);
  begin("fish", x, z, { spot: o.kind, method: meth, reachTestOf: (ax, az) => sideReachTest(ax, az), inReach: true });
  return true;
}

/* Which of one method's fish is on the hook this attempt. Every fish the
   level, tool and bait allow stays in the draw, weighted 1/levelReq - so trout
   (20) outnumbers salmon (30) three to two, shrimp outnumber anchovies, and a
   harpoon still lands its tuna past 50. The one-fish method this replaced
   (always the best allowed) meant trout simply never existed past 30. Weights
   are invented - the client rolls per-fish catch chances nothing publishes. */
export function pickFish(cands) {
  let total = 0;
  for (const f of cands) total += 1 / Math.max(1, f.levelReq);
  let r = Math.random() * total;
  for (const f of cands) {
    r -= 1 / Math.max(1, f.levelReq);
    if (r <= 0) return f;
  }
  return cands[cands.length - 1];
}

function attemptFish(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "fishing" || o.kind !== act.data.spot) {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "fishing" && q.kind === act.data.spot, 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't fish here anymore.");
  }
  /* The draw for this attempt, out of the method's own fish: the level, the
     tool and the consumable all still gate, so an empty draw stops with the
     client's own line rather than swinging at bare water. `act.data.method`
     is the tool the click's method fishes with (see fishSpot) - old saves
     carry a fixed `fish` instead, which keeps working for its one session. */
  const lvl = skillLvl("fishing");
  let f = act.data.fish || null;
  if (!f) {
    const cands = (FISH_BY_SPOT[act.data.spot] || []).filter((q) =>
      q.tool === act.data.method && q.levelReq <= lvl &&
      invCount(G.ps, FISH_TOOL_ITEM[q.tool] || "") &&
      (!FISH_BAIT_ITEM[q.tool] || invCount(G.ps, FISH_BAIT_ITEM[q.tool])));
    if (!cands.length) {
      /* Nothing on the hook: answered exactly as the click's own lines read -
         the level first, the tool second, the bait last (see fishSpot) - but
         from the side face, after the walk. The bait line is also the one a
         session ends on when the consumable runs out mid-session. */
      const pool = (FISH_BY_SPOT[act.data.spot] || []).filter((q) => q.tool === act.data.method);
      if (!pool.length) return stopMsg("You can't fish here anymore.");
      const reachable = pool.filter((q) => q.levelReq <= lvl);
      if (!reachable.length) return stopMsg("You need a Fishing level of " + pool[0].levelReq + " to fish here.");
      if (!reachable.some((q) => invCount(G.ps, FISH_TOOL_ITEM[q.tool] || ""))) {
        return stopMsg("You need a " + itemName(FISH_TOOL_ITEM[reachable[0].tool] || "").toLowerCase() + " to fish here.");
      }
      const short = reachable.find((q) => FISH_BAIT_ITEM[q.tool] && !invCount(G.ps, FISH_BAIT_ITEM[q.tool]));
      return stopMsg("You need some " + (short ? FISH_BAIT_WORD[short.tool] : "fishing bait") + " to fish here.");
    }
    f = pickFish(cands);
  }
  /* The bait can run out mid-session (the catch that spent the last one), so it
     is re-checked on every attempt - the session stops with the client's own
     line rather than swinging at bare water. */
  const bait = FISH_BAIT_ITEM[f.tool];
  if (bait && !invCount(G.ps, bait)) return stopMsg("You need some " + FISH_BAIT_WORD[f.tool] + " to fish here.");
  if (invFreeSlots() < 1) return stopMsg("Your inventory is too full to hold any more fish.");
  /* How long the cast runs is the pose's own length, not a fixed three ticks:
     the cast sequences are 3.52s (176 cycles) against a 1.8s swing, so a fixed
     timer let the pose die and the character stand idle between attempts. The
     next attempt is now scheduled for exactly when this pose ends. */
  const poseSecs = workAnim(FISH_POSES[f.tool] || "fish_smallnet", undefined, FISH_TOOL_ITEM[f.tool]);
  const chance = pct(0.46 + (skillLvl("fishing") - f.levelReq) * 0.011);
  if (Math.random() < chance) {
    if (bait) invRemove(G.ps, bait, 1);
    invAdd(G.ps, f.id, 1);
    addXp(G.ps, "fishing", f.xp);
    const caught = itemName(f.id).toLowerCase().replace(/^raw /, "");
    chat("You catch " + fishPhrase(caught) + ".", "game");
    mark("inv");
  } else if (Math.random() < 0.2) {
    chat("You attempt to catch a fish.", "game");
  }
  act.timer = Math.max(1, Math.round(poseSecs / TICK));
}

/* "You catch a shrimp.", but "You catch some anchovies." - the one plural fish
   in the table would otherwise read "a anchovies". */
function fishPhrase(name) {
  if (/s$/.test(name)) return "some " + name;
  return (/^[aeiou]/.test(name) ? "an " : "a ") + name;
}

/* "with an amulet mould", but "with a ring mould". */
function withArticle(name) {
  return (/^[aeiou]/i.test(name) ? "an " : "a ") + name;
}

/* --------------------------------------------------------------- cooking */

export function findCookSource(maxDist) {
  const p = G.player;
  const w = G.world;
  const px = Math.round(p.x - 0.5);
  const pz = Math.round(p.z - 0.5);
  let best = null;
  let bestD = (maxDist + 0.5) * (maxDist + 0.5);
  for (let dz = -maxDist; dz <= maxDist; dz++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const o = w.objAt(px + dx, pz + dz);
      if (!o || (o.t !== "fire" && o.t !== "range")) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [px + dx, pz + dz, o.t]; }
    }
  }
  return best;
}

export function cookFood(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || (o.t !== "fire" && o.t !== "range")) return false;
  /* Nothing is asked at the click: "nothing to cook" (and the level behind
     it) is answered from a side face, after the walk (the user's NSEW rule -
     see sideReachTest). attemptCook already answers both on arrival. */
  if (Actions.act && Actions.act.kind === "cook" && Actions.act.x === x && Actions.act.z === z) return true;
  begin("cook", x, z, { reachTestOf: (ax, az) => sideReachTest(ax, az), inReach: true });
  return true;
}

function bestRawFood() {
  const ps = G.ps;
  let best = null;
  for (const rawId of Object.keys(RAW_TO_COOKED)) {
    if (!invCount(ps, rawId)) continue;
    const info = cookInfo(rawId);
    if (info.levelReq > skillLvl("cooking")) continue;
    if (!best || info.xp > best.xp) best = { rawId, xp: info.xp };
  }
  return best;
}

function cookInfo(rawId) {
  const cookedId = RAW_TO_COOKED[rawId];
  const raw = ITEMS[rawId] || {};
  const ck = ITEMS[cookedId] || {};
  return {
    cookedId,
    xp: ck.cookXp != null ? ck.cookXp : (raw.cookXp != null ? raw.cookXp : 30),
    burn: ck.burn != null ? ck.burn : (raw.burn != null ? raw.burn : 0.3),
    levelReq: ck.levelReq != null ? ck.levelReq : (raw.levelReq != null ? raw.levelReq : 1),
  };
}

function attemptCook(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || (o.t !== "fire" && o.t !== "range")) {
    const src = findCookSource(10);
    if (src) return retarget(act, src[0], src[1]);
    return stopMsg("You can't cook here.");
  }
  const raw = bestRawFood();
  if (!raw) return stopMsg(cookBlocker() || "You have no more food to cook.");
  if (raw.rawId === "pitta_dough" && o.t !== "range") {
    const src = findCookSource(10);
    if (src && src[2] === "range") return retarget(act, src[0], src[1]);
    return stopMsg("You need to use a range to bake pitta bread.");
  }
  /* the range and the fire are two different poses: a range is waist high, a
     fire is on the ground. Raised after the food check so a bare-handed click
     on a range does not play a cooking pose. */
  workAnim(o.t === "range" ? "cook_range" : "cook_fire");
  const ps = G.ps;
  const info = cookInfo(raw.rawId);
  invRemove(ps, raw.rawId, 1);
  const lvl = skillLvl("cooking");
  const burnChance = (raw.rawId === "pitta_dough" || raw.rawId === "seaweed") ? 0 :
    Math.max(0.015, info.burn - (lvl - info.levelReq) * 0.012 - lvl * 0.003);
  if (Math.random() < burnChance) {
    invAdd(ps, burntOf(info.cookedId), 1);
    chat("You accidentally burn the " + shortFood(raw.rawId) + ".", "warn");
  } else {
    invAdd(ps, info.cookedId, 1);
    addXp(ps, "cooking", info.xp);
    chat("You successfully cook the " + shortFood(raw.rawId) + ".", "game");
  }
  /* The cake bakes in its tin, and the tin comes back whether the cake lived
     or not - the wiki's own rule ("after cooking the cake, successfully or
     burnt, the player will receive back their cake tin"). */
  if (raw.rawId === "uncooked_cake") invAdd(ps, "cake_tin", 1);
  mark("inv");
  act.timer = 3;
}

function cookOne(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "range") return false;
  if (Actions.act && Actions.act.kind === "cookone" && Actions.act.x === x && Actions.act.z === z) return true;
  begin("cookone", x, z, { reachTestOf: (ax, az) => sideReachTest(ax, az), inReach: true });
  return true;
}

function attemptCookOne(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "range") return stopMsg("You can't cook here.");
  if (!invCount(G.ps, "raw_karambwan")) return stopMsg("You have no karambwan to cook.");
  const info = cookInfo("raw_karambwan");
  if (info.levelReq > skillLvl("cooking")) return stopMsg("You need a Cooking level of " + info.levelReq + " to cook Raw karambwan.");
  workAnim("cook_range");
  const ps = G.ps;
  invRemove(ps, "raw_karambwan", 1);
  const lvl = skillLvl("cooking");
  const burnChance = Math.max(0.015, info.burn - (lvl - info.levelReq) * 0.012 - lvl * 0.003);
  if (Math.random() < burnChance) {
    invAdd(ps, burntOf(info.cookedId), 1);
    chat("You accidentally burn the karambwan.", "warn");
  } else {
    invAdd(ps, info.cookedId, 1);
    addXp(ps, "cooking", info.xp);
    chat("You successfully cook the karambwan.", "game");
  }
  mark("inv");
  cancelAction();
}

function burntOf(cookedId) {
  /* Bread, pies, cakes and pizzas each burn into their own published item
     (burnt bread 2311, burnt pie 2329, burnt cake 1903, burnt pizza 2305);
     everything else keeps the old fish/meat split. */
  if (cookedId === "bread") return "burnt_bread";
  if (/pie$/.test(cookedId)) return "burnt_pie";
  if (/cake$/.test(cookedId)) return "burnt_cake";
  if (/pizza$/.test(cookedId)) return "burnt_pizza";
  if (cookedId === "karambwan") return "burnt_karambwan";
  return /meat|chicken|rat/.test(cookedId) ? "burnt_meat" : "burnt_fish";
}

function shortFood(rawId) {
  return itemName(rawId).toLowerCase().replace(/^raw /, "");
}

/* --------------------------------------------------------------- firemaking */

function fireStepTile(x, z) {
  const w = G.world;
  const cand = [[x - 1, z], [x + 1, z], [x, z + 1], [x, z - 1]];
  for (const [nx, nz] of cand) {
    if (!w.isWalkable(nx, nz)) continue;
    /* The step off the fire's tile is a step like any other: it must not cross
       a sealed wall face (lighting a fire from a wall tile must step back into
       the room, not through the panel). */
    if (w.blocksStep && w.blocksStep(x, z, nx, nz)) continue;
    const o = w.objAt(nx, nz);
    if (o && o.t === "fire") continue;
    return [nx, nz];
  }
  return null;
}

export function lightFire(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const def = ITEMS[s.id];
  if (!def || def.kind !== "log") { chat("You can't light that.", "warn"); return; }
  if (!invCount(ps, "tinderbox")) { chat("You need a tinderbox to light a fire.", "warn"); return; }
  /* The log's own `levelReq` is the Firemaking level for its tier - the two
     ladders run together in the era (oak 15, willow 30, maple 45, yew 60, magic
     75), so the same field the Woodcutting gate reads is the right one here.
     A magic log was lightable at Firemaking 1 without this. */
  if (skillLvl("firemaking") < (def.levelReq || 1)) {
    chat("You need a Firemaking level of " + def.levelReq + " to light this log.", "warn");
    return;
  }
  const x = Math.floor(G.player.x);
  const z = Math.floor(G.player.z);
  if (G.world.objAt(x, z) || !G.world.isWalkable(x, z)) {
    chat("You can't light a fire here.", "warn");
    return;
  }
  const c0 = G.world.cornerAt(x, z), c1 = G.world.cornerAt(x + 1, z);
  const c2 = G.world.cornerAt(x, z + 1), c3 = G.world.cornerAt(x + 1, z + 1);
  if (Math.max(c0, c1, c2, c3) - Math.min(c0, c1, c2, c3) > 0.6745) {
    chat("You can't light a fire here.", "warn");
    return;
  }
  const idx = Math.max(0, LOG_ORDER.indexOf(s.id));
  invRemove(ps, s.id, 1);
  mark("inv");
  playCastAnim(G.player, "firemaking");
  addXp(ps, "firemaking", LOG_FM_XP[idx] || 40);
  G.world.setObj(x, z, { t: "fire" });
  G.view.rebuildChunkAt(x, z);
  /* Ninety seconds, in the same breath as the local clock - so a fire somebody
     lights in the square is a fire everybody can see (and cook on) until it
     burns down, and the ashes that follow are shared like any other drop. */
  Actions.fires.push({ x, z, expire: (G.time || 0) + 90 });
  reportLoc(x, z, 90);
  /* The light is lit on the tile the player stands on, so the player steps one
     tile off it: west, east, south, north, first walkable one wins. */
  const step = fireStepTile(x, z);
  if (!step) {
    chat("That would be exceptionally hot.", "game");
    return;
  }
  chat("You light a fire.", "you");
  if (walkTo(G.player, G.world, step[0], step[1], 0, NO_MODS)) {
    afterTicks(1, () => {
      const p = G.player;
      if (Math.floor(p.x) === step[0] && Math.floor(p.z) === step[1]) faceTarget(p, x, z);
    });
  } else {
    placeEntity(G.player, step[0] + 0.5, step[1] + 0.5);
    faceTarget(G.player, x, z);
  }
}

/* --------------------------------------------------------------- smelting */

export function smeltAt(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "furnace") return false;
  /* Nothing is asked at the click, like the range above: attemptSmelt answers
     "nothing to smelt" (and the level behind it) from the side face. */
  if (Actions.act && Actions.act.kind === "smelt" && Actions.act.x === x && Actions.act.z === z) return true;
  begin("smelt", x, z, { reachTestOf: () => furnaceMouthTest(), inReach: true });
  faceFurnace(G.player);
  return true;
}

function bestSmeltable() {
  const ps = G.ps;
  let best = null;
  for (const d of Object.values(ITEMS)) {
    if (d.kind !== "bar" || !d.inputs) continue;
    if (d.levelReq > skillLvl("smithing")) continue;
    if (!invHasAll(ps, d.inputs)) continue;
    if (!best || d.xp > best.xp) best = { id: d.id, xp: d.xp, inputs: d.inputs };
  }
  return best;
}

function attemptSmelt(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "furnace") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "furnace", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't smelt here.");
  }
  const bar = bestSmeltable();
  if (!bar) return stopMsg(smeltBlocker() || "You have no more ore to smelt.");
  workAnim("smelt_furnace");
  const ps = G.ps;
  for (const id of bar.inputs) invRemove(ps, id, 1);
  /* Iron is the one metal that can fail, and the ring of forging is the one
     thing that stops it: "Iron ore has a 50% chance of failing to smelt into
     an iron bar, unless the player is wearing a ring of forging" - the ring
     "does not prevent the ore from being consumed" either way, which is why the
     inputs come off before this check. A failed smelt wastes the ore and gives
     nothing, not even experience, exactly as in the live game.

     Note this is the *plain* iron bar only: a player holding iron ore and two
     lumps of coal is making steel, and steel never fails (see bestSmeltable,
     which prefers the higher-xp bar). */
  if (bar.id === "iron_bar") {
    const forging = equippedId(ps, "ring") === "ring_of_forging";
    if (forging) {
      const r = useRingCharge(ps);
      if (r.crumbled) { chat("Your ring of forging crumbles to dust.", "game"); mark("equip"); }
    } else if (Math.random() < 0.5) {
      chat("You accidentally burn the iron ore.", "warn");
      act.timer = 4;
      mark("inv");
      return;
    }
  }
  invAdd(ps, bar.id, 1);
  addXp(ps, "smithing", bar.xp);
  mark("inv");
  chat("You retrieve a bar of " + itemName(bar.id).toLowerCase().replace(" bar", "") + ".", "game");
  act.timer = 4;
}

function smeltBlocker() {
  const ps = G.ps;
  let levelGate = null;
  for (const d of Object.values(ITEMS)) {
    if (d.kind !== "bar" || !d.inputs) continue;
    if (invHasAll(ps, d.inputs) && d.levelReq > skillLvl("smithing")) {
      if (!levelGate || d.levelReq < levelGate.levelReq) levelGate = d;
    }
  }
  if (levelGate) return "You need a Smithing level of " + levelGate.levelReq + " to smelt " + levelGate.name.toLowerCase() + ".";
  if (invCount(ps, "copper_ore") && !invCount(ps, "tin_ore")) return "You need tin ore to smelt bronze.";
  if (invCount(ps, "tin_ore") && !invCount(ps, "copper_ore")) return "You need copper ore to smelt bronze.";
  if (invCount(ps, "iron_ore") && invCount(ps, "coal") < 2) return "You need two lumps of coal to smelt steel.";
  return null;
}

/* The cooking twin of `smeltBlocker` above: it answers the question "why can't
   I cook anything right now?" when the pack *does* hold raw food, so a player
   carrying only lobsters at Cooking 12 is told the level instead of the bare
   "You have nothing to cook." (the live game names the level too). */
function cookBlocker() {
  const ps = G.ps;
  let levelGate = null;
  for (const rawId of Object.keys(RAW_TO_COOKED)) {
    if (!invCount(ps, rawId)) continue;
    const info = cookInfo(rawId);
    if (info.levelReq > skillLvl("cooking")) {
      if (!levelGate || info.levelReq < levelGate.levelReq) levelGate = { levelReq: info.levelReq, name: itemName(rawId) };
    }
  }
  if (levelGate) return "You need a Cooking level of " + levelGate.levelReq + " to cook " + levelGate.name.toLowerCase() + ".";
  return null;
}

/* ---------------------------------------------------------- the jeweller's bench

   The furnace's *second* trade (unit L3 of PLAN.md). `smeltAt` above is the
   ore half - click a furnace with ore and it makes bars - and this is the half
   the live game opens by **using a bar on a furnace**: interface 446, the
   jewellery window. The recipe data is `src/items.js#JEWELLERY` (the published
   Crafting level and experience of every ring, necklace, amulet, bracelet,
   silver piece and bolt batch) and
   `STRING_RECIPES` (the ball of wool step); everything here is the machinery.

   This world has no use-with-object mode yet (see src/ui.js#resolveUse: a
   carried item can only be used on another *carried* item), so the client's own
   gesture - use the bar on the furnace - has no way in. The bench is therefore
   reached the same way the needle's recipes are: a **"Craft"** option, on the
   gold bar's own menu when a furnace is in reach and a mould is carried, and on
   the furnace's own menu. The window it opens is one icon per piece the player
   could actually make, the anvil's and the tanner's modal again (interface 446
   is not mapped in this build either); the levels, the materials and the
   experience printed on it are the published ones.

   Three ticks a piece, the client's own furnace tick, and the pose is the
   furnace's own (`smelt_furnace`, the sequence both halves of the trade play).
   A mould is a tool: it is checked and never consumed. */

/* Every recipe *any* carried mould could make, at the player's level, with the
   materials for it in the pack - what the furnace's window and the gold bar's
   "Craft" option both list. */
/* Every mould the jeweller's bench reads, so the furnace's Craft row and the
   bar's own Craft row answer for the whole bench rather than three moulds. */
const JEWEL_MOULDS = ["ring_mould", "necklace_mould", "amulet_mould", "bracelet_mould",
  "holy_mould", "unholy_mould", "sickle_mould", "tiara_mould", "bolt_mould"];

/* Which bar a bench recipe eats: gold unless the row says silver. */
function jewelBar(r) {
  return r.bar || "gold_bar";
}

function jewelleryList(lvl) {
  const ps = G.ps;
  const out = [];
  for (const r of JEWELLERY) {
    if (!ITEMS[r.id]) continue;
    if (!invCount(ps, r.mould)) continue;
    if (r.level > lvl) continue;
    if (invCount(ps, jewelBar(r)) < 1) continue;
    if (r.gem && invCount(ps, r.gem) < 1) continue;
    out.push(r);
  }
  out.sort((a, b) => a.level - b.level || ITEMS[a.id].value - ITEMS[b.id].value);
  return out;
}

/* How many of this recipe the pack could make right now. */
export function jewelleryCount(r) {
  const ps = G.ps;
  let n = Math.min(invCount(ps, jewelBar(r)), 28);
  if (r.gem) n = Math.min(n, invCount(ps, r.gem));
  if (!isStackable(r.id)) n = Math.min(n, invFreeSlots() + 1);
  return Math.max(0, n);
}

/* The right-click "Craft" on a bar, and the furnace's own menu entry.
   Both only make sense standing at a furnace, which is what this checks. */
export function jewelleryFromInv(index) {
  const ps = G.ps;
  const s = ps.inv[index];
  const bar = s && (s.id === "gold_bar" || s.id === "silver_bar") ? s.id : null;
  if (!bar) { chat("You have nothing to make jewellery from.", "warn"); return; }
  const furnace = findObjectNear(Math.floor(G.player.x), Math.floor(G.player.z), (q) => q.t === "furnace", 12);
  if (!furnace) { chat("You need to be near a furnace to make jewellery.", "warn"); return; }
  openJewelleryMenu(furnace[0], furnace[1], bar);
}

export function jewelleryAt(x, z, bar) {
  const o = G.world.objAt(x, z);
  if (!o || o.t !== "furnace") return false;
  if (bar !== "gold_bar" && bar !== "silver_bar") {
    if (invCount(G.ps, "gold_bar")) bar = "gold_bar";
    else if (invCount(G.ps, "silver_bar")) bar = "silver_bar";
  }
  /* The bar is answered on arrival (the user's NSEW rule): the click walks
     to a side face first, and the window only opens once one is carried. */
  approach(x, z, () => {
    if (!invCount(G.ps, bar)) { chat("You have nothing to make jewellery from.", "warn"); return; }
    openJewelleryMenu(x, z, bar);
  }, furnaceMouthTest());
  return true;
}

export function openJewelleryMenu(x, z, bar) {
  const ps = G.ps;
  if (bar !== "silver_bar") bar = "gold_bar";
  const barName = itemName(bar).toLowerCase();
  const lvl = skillLvl("crafting");
  const byId = new Map();
  for (const r of JEWELLERY) {
    if (!ITEMS[r.id]) continue;
    if ((r.bar || "gold_bar") !== bar) continue;
    byId.set(r.id, r);
  }
  const rows = [...byId.values()].sort((a, b) => a.level - b.level);
  const start = (n) => {
    const r = jewelPick && byId.get(jewelPick);
    if (!r) return;
    let max = invCount(ps, jewelBar(r));
    if (r.gem) max = Math.min(max, invCount(ps, r.gem));
    if (max < 1) { chat("You don't have the materials to make " + itemName(r.id).toLowerCase() + ".", "warn"); return; }
    /* The decision is made: face the furnace with the click, the way the arrival
       handover faces it below - the menu may have been opened from any side. */
    faceFurnace(G.player);
    closeModal();
    makeJewellery(r, x, z, Math.max(1, Math.min(n, max)));
  };
  const startQty = (q) => {
    if (q === "X") { if (!jewelPick) return; closeModal(); openAmountPrompt("make", 0, { cb: (n) => { jewelPick && start(n || 1); } }); return; }
    if (q === "All") return start(1e9);
    start(q);
  };
  jewelPick = null;
  let paintQty = null;
  let saveScroll = null;
  openModal("What would you like to make?", (body) => {
    if (!invCount(ps, bar)) {
      body.appendChild(mkEl("div", "note", "You need " + withArticle(barName) + " to make jewellery with."));
      return;
    }
    const wrap = mkEl("div", "jewelWrap");
    const grid = mkEl("div", "jewelGrid");
    for (const r of rows) {
      const name = itemName(r.id);
      const barName = itemName(jewelBar(r)).toLowerCase();
      const short = r.level > lvl ? "Requires " + r.level + " Crafting to make " + name.toLowerCase() + "."
        : !invCount(ps, r.mould) ? "You need " + withArticle(itemName(r.mould).toLowerCase()) + " to make " + name.toLowerCase() + "."
        : invCount(ps, jewelBar(r)) < 1 ? "You need " + withArticle(barName) + " to make " + name.toLowerCase() + "."
        : r.gem && invCount(ps, r.gem) < 1 ? "You need " + withArticle(itemName(r.gem).toLowerCase()) + " to make " + name.toLowerCase() + "."
        : null;
      const cell = mkEl("div", "jewelCell");
      const iconWrap = mkEl("div", "jewelIconWrap");
      const img = mkEl("img", "jewelIcon");
      img.src = iconUrl(r.id, 32);
      img.draggable = false;
      img.alt = name;
      iconWrap.appendChild(img);
      iconWrap.appendChild(mkEl("div", "jewelQty", "x" + jewelleryCount(r)));
      cell.appendChild(iconWrap);
      cell.appendChild(mkEl("div", "jewelName", name));
      const costEl = mkEl("div", "jewelCost", "1 " + barName + (r.gem ? " + " + itemName(r.gem).toLowerCase() : ""));
      if (short && (invCount(ps, jewelBar(r)) < 1 || (r.gem && invCount(ps, r.gem) < 1))) costEl.classList.add("need");
      cell.appendChild(costEl);
      if (short) {
        cell.classList.add("dim");
        cell.title = short;
      } else {
        cell.title = name + " - Crafting " + r.level + ", " + r.xp + " xp each - " + jewelleryMatsText(r);
        cell.addEventListener("click", () => {
          jewelPick = r.id;
          startQty(jewelQtySel);
        });
        cell.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          jewelPick = r.id;
          openCtx(ev.clientX, ev.clientY, name, [
            { label: "Make 1", fn: () => start(1) },
            { label: "Make 5", fn: () => start(5) },
            { label: "Make 10", fn: () => start(10) },
            { label: "Make X", fn: () => startQty("X") },
            { label: "Make All", fn: () => start(1e9) },
            { label: "Cancel", fn: () => {} },
          ]);
        });
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    const side = mkEl("div", "jewelSide");
    const btns = new Map();
    paintQty = () => {
      for (const [q, b] of btns) b.classList.toggle("sel", q === jewelQtySel);
      refreshSharpText();
    };
    for (const q of JEWEL_QTYS) {
      const b = mkEl("button", "jewelBtn", String(q));
      b.title = q === "X" ? "Make a set amount" : q === "All" ? "Make all you can" : "Make " + q;
      b.addEventListener("click", () => {
        jewelQtySel = q;
        storeJewelQty(q);
        paintQty();
      });
      btns.set(q, b);
      side.appendChild(b);
    }
    wrap.appendChild(side);
    body.appendChild(wrap);
    fitGridRows(wrap, grid);
    paintQty();
    loadJewelQty().then(paintQty);
    saveScroll = persistScroll(body, "jewelScroll");
    const head = UI.els.modalBox.querySelector(".cHead");
    if (head && !head.querySelector(".jewelX")) {
      const xBtn = mkEl("button", "jewelX", "X");
      xBtn.addEventListener("click", closeModal);
      head.appendChild(xBtn);
    }
  }, [], { boxClass: "jewelBox", onClose: () => { if (saveScroll) saveScroll(); } });
}

const JEWEL_QTYS = [1, 5, 10, "X", "All"];
const JEWEL_QTY_KEY = "jewelQty";
let jewelQtySel = 1;
let jewelPick = null;
function loadJewelQty() {
  const folder = smithKv();
  if (!folder) return Promise.resolve();
  return folder.get(JEWEL_QTY_KEY).then((v) => {
    if (JEWEL_QTYS.includes(v)) jewelQtySel = v;
  }).catch(() => {});
}
function storeJewelQty(q) {
  const folder = smithKv();
  if (!folder) return;
  folder.set(JEWEL_QTY_KEY, q).catch(() => {});
}

function jewelleryMatsText(r) {
  const mats = ["1 x " + itemName(jewelBar(r)).toLowerCase()];
  if (r.gem) mats.push("1 x " + itemName(r.gem).toLowerCase());
  return mats.join(", ") + " (with " + withArticle(itemName(r.mould).toLowerCase()) + ")";
}

function makeJewellery(r, x, z, left) {
  const ps = G.ps;
  if (skillLvl("crafting") < r.level) {
    chat("You need a Crafting level of " + r.level + " to make " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (!invCount(ps, r.mould)) { chat("You need a " + itemName(r.mould).toLowerCase() + " to make that.", "warn"); return; }
  if (!invCount(ps, jewelBar(r)) || (r.gem && !invCount(ps, r.gem))) {
    chat("You don't have the materials to make " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (!isStackable(r.id) && invFreeSlots() < 1) { chat("You need a free inventory slot.", "warn"); return; }
  if (Actions.act && Actions.act.kind === "jewel" && Actions.act.data.id === r.id) return;
  /* The mouth tile, like smelt and molten glass below: the menu opens with the
     player standing on it, and the work must start there too - without the
     pair the walk-in below routes to the side of the clicked furnace tile and
     drags the worker off the mouth (the tiara walk-off). Already-there stays
     put through the same inReach short-circuit smelt relies on. */
  begin("jewel", x, z, { id: r.id, mould: r.mould, gem: r.gem, bar: jewelBar(r), qty: r.qty || 1, level: r.level, xp: r.xp, left: left == null ? null : Math.max(1, left), reachTestOf: () => furnaceMouthTest(), inReach: true });
}

function attemptJewel(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "furnace") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "furnace", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't make jewellery here.");
  }
  const ps = G.ps;
  const d = act.data;
  if (d.left != null && d.left <= 0) { cancelAction(); return; }
  const bar = d.bar || "gold_bar";
  if (!invCount(ps, bar)) return stopMsg("You have run out of " + itemName(bar).toLowerCase() + "s.");
  if (d.gem && !invCount(ps, d.gem)) return stopMsg("You have run out of " + itemName(d.gem).toLowerCase() + "s.");
  if (skillLvl("crafting") < d.level) return stopMsg("You need a Crafting level of " + d.level + " to make that.");
  if (!isStackable(d.id) && invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
  invRemove(ps, bar, 1);
  if (d.gem) invRemove(ps, d.gem, 1);
  invAdd(ps, d.id, d.qty || 1);
  addXp(ps, "crafting", d.xp);
  mark("inv");
  workAnim("smelt_furnace");
  chat("You make " + (d.qty > 1 ? d.qty + " sets of " : "a ") + itemName(d.id).toLowerCase() + ".", "game");
  if (d.left != null) {
    d.left--;
    if (d.left <= 0) return;
  }
  /* three ticks a piece, the live game's own furnace tick for jewellery */
  act.timer = 3;
}

/* --------------------------------------------------------------- smithing */

export function smithAt(x, z, barId) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "anvil") return false;
  /* The hammer and the bars are answered on arrival (the user's NSEW rule):
     the click walks to a side face first, and the menu only opens once both
     pass. */
  approach(x, z, () => {
    /* A fresh click on the anvil is a new intent: a hammering run already
       underway stops here and never resumes, whether this menu then opens or
       refuses (the far case is covered the same way - approach's walk-in is a
       fresh begin, which replaces the run). */
    cancelAction();
    if (!invCount(G.ps, "hammer")) { chat("You need a hammer to work the metal.", "warn"); return; }
    /* One metal per screen, like the client's own: a bar used on the anvil
       names it, otherwise the best bar in the pack does. */
    let bar = SMITH_BARS.includes(barId) && invCount(G.ps, barId) > 0 ? barId : null;
    if (!bar) for (let i = SMITH_BARS.length - 1; i >= 0; i--) {
      if (invCount(G.ps, SMITH_BARS[i]) > 0) { bar = SMITH_BARS[i]; break; }
    }
    if (!bar) { chat("You don't have the bars to smith anything.", "warn"); return; }
    openSmithMenu(x, z, bar, smithMetalRows(bar));
  }, sideReachTest(x, z));
  return true;
}

/* Every anvil row for one bar - the weapon rows (src/items.js#SMITH_ITEMS)
   plus that bar's unfinished bolts (src/items.js#BOLT_SMITH) - levels
   included, so the screen can grey what the level does not cover yet. */
export function smithMetalRows(bar) {
  const out = [];
  for (const [id, s] of Object.entries(SMITH_ITEMS)) {
    if (s.bar !== bar || !ITEMS[id]) continue;
    out.push({ id, bars: s.bars, qty: s.qty || 1, level: s.level, xp: s.xp, bar, skill: "smithing" });
  }
  /* The bolt rows (src/items.js#BOLT_SMITH): one bar in, **ten** unfinished
     bolts out, which is why they carry a `qty` the weapon rows have no use for.
     Silver is not among them: silver bolts are a Crafting recipe at a furnace
     with a bolt mould (src/items.js#JEWELLERY), never an anvil recipe. */
  const b = BOLT_SMITH[bar];
  if (b && ITEMS[b.id] && ITEMS[bar]) {
    out.push({ id: b.id, bars: 1, qty: b.qty, level: b.level, xp: b.xp, bar, skill: b.smithing ? "smithing" : "crafting" });
  }
  return out;
}

const SMITH_BARS = ["bronze_bar", "iron_bar", "steel_bar", "mithril_bar", "adamant_bar", "rune_bar"];

/* Screen names per cell, exactly as the client's own screen writes them. */
const SMITH_NAMES = { dagger: "Dagger", axe: "Axe", chainbody: "Chainbody", medhelm: "Medium helm", darttips: "Dart tips", bolts: "Bolts", sword: "Sword", mace: "Mace", platelegs: "Plate legs", fullhelm: "Full helm", arrowtips: "Arrowtips", limbs: "Limbs", scimitar: "Scimitar", warhammer: "Warhammer", plateskirt: "Plateskirt", sqshield: "Square shield", knives: "Knives", javelinheads: "Javelin heads", longsword: "Longsword", battleaxe: "Battle axe", platebody: "Platebody", kiteshield: "Kiteshield", grapple: "Grapple Tip", "2h": "2-handed sword", claws: "Claws", nails: "Nails" };

/* Item class per screen cell, so each row lands in its wiki slot whatever the
   metal: the weapon id minus its bar prefix (bronze_helm is the med helm,
   bronze_knife the knives row), bolts under their own name. */
function smithClassOf(bar, id) {
  if (id === (BOLT_SMITH[bar] || {}).id) return "bolts";
  const stem = id.startsWith(bar.slice(0, -4) + "_") ? id.slice(bar.length - 3) : id;
  if (stem === "helm") return "medhelm";
  if (stem === "knife") return "knives";
  return stem;
}

/* The client's own anvil screen ("What would you like to make?"): a packed
   grid of item rows - icon, name, green bar cost, yellow make-count where one
   bar makes several - and the 1 / 5 / 10 / X / All buttons down the right
   side. The set quantity button shows white and is remembered across visits;
   a left-click makes the picked row in that quantity, a right-click names its
   own (Make 1 / 5 / 10 / X / All, X asking through the chatbox amount
   prompt). Rows below the level or short on bars show greyed with the
   reason. */
const SMITH_GRID = [
  ["dagger", "axe", "bolts", "sword"],
  ["mace", "chainbody", "medhelm", "scimitar"],
  ["warhammer", "platelegs", "fullhelm", "longsword"],
  ["battleaxe", "plateskirt", "sqshield", "knives"],
  ["platebody", "kiteshield", "2h", "claws"],
];

export function openSmithMenu(x, z, bar, list) {
  const ps = G.ps;
  const lvl = skillLvl("smithing");
  const barName = itemName(bar).toLowerCase();
  const byClass = new Map();
  for (const it of list) byClass.set(smithClassOf(bar, it.id), it);
  const start = (n) => {
    const it = smithPick && byClass.get(smithPick);
    if (!it) return;
    const max = Math.floor(invCount(ps, it.bar) / it.bars);
    if (max < 1) { chat("You have run out of bars.", "warn"); return; }
    closeModal();
    begin("smith", x, z, { itemId: it.id, bars: it.bars, qty: it.qty || 1, xp: it.xp, bar: it.bar, skill: it.skill || "smithing", left: Math.max(1, Math.min(n, max)) });
  };
  /* Left-click makes the picked row in the set quantity; the right-click menu
     names its own. */
  const startQty = (q) => {
    if (q === "X") { if (!smithPick) return; closeModal(); openAmountPrompt("make", 0, { cb: (n) => { smithPick && start(n || 1); } }); return; }
    if (q === "All") return start(1e9);
    start(q);
  };
  let smithPick = null;
  let paintQty = null;
  let saveScroll = null;
  openModal("What would you like to make?", (body) => {
    const wrap = mkEl("div", "smithWrap");
    const grid = mkEl("div", "smithGrid");
    for (const row of SMITH_GRID) {
      for (const cls of row) {
        const cell = mkEl("div", "smithCell");
        if (!cls) { cell.classList.add("empty"); grid.appendChild(cell); continue; }
        const it = byClass.get(cls);
        if (!it) { cell.classList.add("empty"); grid.appendChild(cell); continue; }
        const have = Math.floor(invCount(ps, it.bar) / it.bars);
        const short = it.level > lvl ? "Requires " + it.level + " Smithing to smith " + itemName(it.id).toLowerCase() + "." : have < 1 ? "You need " + it.bars + " " + barName + (it.bars === 1 ? "" : "s") + " to smith " + itemName(it.id).toLowerCase() + "." : null;
        const iconWrap = mkEl("div", "smithIconWrap");
        const img = mkEl("img", "smithIcon");
        img.src = iconUrl(it.id, 32);
        img.draggable = false;
        img.alt = itemName(it.id);
        iconWrap.appendChild(img);
        if ((it.qty || 1) > 1) iconWrap.appendChild(mkEl("div", "smithQty", "" + it.qty));
        cell.appendChild(iconWrap);
        const nm = itemName(it.id).replace(/^(Bronze|Iron|Steel|Mithril|Adamant|Runite) /i, "");
        cell.appendChild(mkEl("div", "smithName", SMITH_NAMES[cls] || nm.charAt(0).toUpperCase() + nm.slice(1)));
        const barsEl = mkEl("div", "smithBars", it.bars === 1 ? "1 bar" : it.bars + " bars");
        /* Short on the cost of even one: the green cost reads red, alongside
           the row's greyed dimming. */
        if (have < 1) barsEl.classList.add("need");
        cell.appendChild(barsEl);
        if (short) {
          cell.classList.add("dim");
          cell.title = short;
        } else {
          cell.title = (it.qty > 1 ? it.qty + " " : "") + itemName(it.id) + " - " + it.bars + " " + barName;
          cell.addEventListener("click", () => {
            smithPick = cls;
            startQty(smithQtySel);
          });
          cell.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            smithPick = cls;
            openCtx(ev.clientX, ev.clientY, itemName(it.id), [
              { label: "Make 1", fn: () => start(1) },
              { label: "Make 5", fn: () => start(5) },
              { label: "Make 10", fn: () => start(10) },
              { label: "Make X", fn: () => startQty("X") },
              { label: "Make All", fn: () => start(1e9) },
            ]);
          });
        }
        grid.appendChild(cell);
      }
    }
    wrap.appendChild(grid);
    const side = mkEl("div", "smithSide");
    const btns = new Map();
    paintQty = () => {
      for (const [q, b] of btns) b.classList.toggle("sel", q === smithQtySel);
      /* Class flips are not DOM mutations, so the text painter (src/sharp.js)
         is blind to them - without this the set button's white never paints
         (the same reason a hovered context-menu row needs its pointer events).
         This is the same call the bank's own scroll state makes. */
      refreshSharpText();
    };
    for (const q of SMITH_QTYS) {
      const b = mkEl("button", "smithBtn", String(q));
      b.title = q === "X" ? "Make a set amount" : q === "All" ? "Make all you can" : "Make " + q;
      b.addEventListener("click", () => {
        smithQtySel = q;
        storeSmithQty(q);
        paintQty();
      });
      btns.set(q, b);
      side.appendChild(b);
    }
    wrap.appendChild(side);
    body.appendChild(wrap);
    fitGridRows(wrap, grid);
    paintQty();
    loadSmithQty().then(paintQty);
    saveScroll = persistScroll(body, "smithScroll");
    const head = UI.els.modalBox.querySelector(".cHead");
    if (head && !head.querySelector(".smithX")) {
      const xBtn = mkEl("button", "smithX", "X");
      xBtn.addEventListener("click", closeModal);
      head.appendChild(xBtn);
    }
  }, [], { boxClass: "smithBox", onClose: () => { if (saveScroll) saveScroll(); } });
}

/* The set make-quantity on the screen's side buttons (1 / 5 / 10 / X / All):
   white text marks the set one, and the choice is remembered in the world's
   own storage so it survives closing the screen and coming back next visit.
   The menu reads the cached value synchronously and refreshes it behind the
   open screen when storage answers, so a slow store never holds the screen
   up. */
const SMITH_QTYS = [1, 5, 10, "X", "All"];
const SMITH_QTY_KEY = "smithQty";
let smithQtySel = 1;
function smithKv() {
  try {
    const r = typeof root !== "undefined" ? root : null;
    const store = (r && r.kv) || null;
    return store ? store.webscape : null;
  } catch (e) {
    return null;
  }
}
function loadSmithQty() {
  const folder = smithKv();
  if (!folder) return Promise.resolve();
  return folder.get(SMITH_QTY_KEY).then((v) => {
    if (SMITH_QTYS.includes(v)) smithQtySel = v;
  }).catch(() => {});
}
function storeSmithQty(q) {
  const folder = smithKv();
  if (!folder) return;
  folder.set(SMITH_QTY_KEY, q).catch(() => {});
}

/* A production window's grid, distributed when it is short: rows are counted
   by height (grid content vs the wrap it stretches in), and when they fit the
   grid deals its free space evenly - outer margins equal to the distance
   between rows - instead of hugging the title bar. Runs on the next frame
   because the modal is still hidden while it builds. Every production window
   of this shape calls it. */
function fitGridRows(wrap, grid) {
  requestAnimationFrame(() => {
    try { grid.classList.toggle("short", grid.scrollHeight <= wrap.clientHeight + 1); } catch (e) {}
  });
}

/* A production window's scroll position, persisted per window in the world's
   own storage so a tall grid reopens where it was left - across closings and
   across logouts. The caller keeps the returned save and runs it from the
   modal's onClose; scrolls also save throttled while they happen, so a client
   that never cleanly closes still keeps most of the position. Restoring rides
   the store's own promise, so it lands after layout. Only windows whose grid
   can outgrow the body ever move - the value sits at 0 otherwise. */
function persistScroll(body, key) {
  const folder = smithKv();
  const save = () => {
    if (!folder) return;
    try { folder.set(key, body.scrollTop).catch(() => {}); } catch (e) {}
  };
  if (folder) folder.get(key).then((v) => {
    if (typeof v === "number" && isFinite(v)) body.scrollTop = v;
  }).catch(() => {});
  let last = 0;
  body.addEventListener("scroll", () => {
    const now = Date.now();
    if (now - last > 400) { last = now; save(); }
  });
  return save;
}

function mkEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function attemptSmith(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "anvil") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "anvil", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't smith here.");
  }
  const ps = G.ps;
  const d = act.data;
  if (d.left != null && d.left <= 0) { cancelAction(); return; }
  if (!invCount(ps, "hammer")) return stopMsg("You need a hammer to work the metal.");
  if (invCount(ps, d.bar) < d.bars) return stopMsg("You have run out of bars.");
  for (let i = 0; i < d.bars; i++) invRemove(ps, d.bar, 1);
  const qty = d.qty || 1;
  invAdd(ps, d.itemId, qty);
  /* A bolt row's experience is per *bar*, not per item: the ten bolts one bar
     becomes are the one action, so they pay the one number
     (src/items.js#BOLT_SMITH). */
  addXp(ps, d.skill || "smithing", d.xp);
  mark("inv");
  workAnim("smith_anvil");
  const made = (qty > 1 ? qty + " " : "") + itemName(d.itemId).toLowerCase();
  chat("You hammer the " + itemName(d.bar).toLowerCase().replace(" bar", "") + " into " + (qty > 1 ? qty + " " : /^[aeiou]/.test(made) ? "an " : "a ") + made + ".", "game");
  if (d.left != null) {
    d.left--;
    if (d.left <= 0) return;
  }
  act.timer = 4;
}

/* --------------------------------------------------------------- crafting / fletching */

export function cutGem(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d || !d.cut) { chat("You can't cut that.", "warn"); return; }
  if (!invCount(ps, "chisel")) { chat("You need a chisel to cut gems.", "warn"); return; }
  /* The cut's own Crafting level (unit L3): 20 for a sapphire up to 67 for an
     onyx, the published gates. They were not enforced before the jewellery
     bench existed, because nothing downstream of a cut gem was gated either. */
  if (skillLvl("crafting") < (d.cutLevel || 1)) {
    chat("You need a Crafting level of " + d.cutLevel + " to cut " + itemName(s.id).toLowerCase() + ".", "warn");
    return;
  }
  invRemove(ps, s.id, 1);
  invAdd(ps, d.cut, 1);
  addXp(ps, "crafting", d.cutXp || 50);
  mark("inv");
  playCastAnim(G.player, gemPose(d.cut));
  chat("You cut the " + itemName(s.id).toLowerCase() + " into " + withArticle(itemName(d.cut).toLowerCase()) + ".", "game");
}

/* The cut is named for the gem, not the level. The pack authors eight cuts and
   this world's gem table carries six: onyx has none (it is a 2005 gem), so it
   borrows the dragonstone cut, the highest tier the cache has. */
function gemPose(cut) {
  return "cut_" + (cut === "onyx" ? "dragonstone" : cut);
}

/* The knife on logs: the production-window picker, the dragonhide craft menu's
   twin - 15 shafts or the log's shortbow (u) / longbow (u) as cells with the
   stone 1 / 5 / 10 / X / All buttons down the right. A click fletches in the
   set quantity, a right-click names its own, and the window closes behind the
   work. Rows above the level show greyed with the reason, like the glass
   screen. One log per action; shafts pay 5 XP for the 15. */
const FLETCH_QTYS = [1, 5, 10, "X", "All"];
const FLETCH_QTY_KEY = "fletchQty";
let fletchQtySel = 1;
let paintFletchQty = null;
function loadFletchQty() {
  const folder = smithKv();
  if (!folder) return Promise.resolve();
  return folder.get(FLETCH_QTY_KEY).then((v) => {
    if (FLETCH_QTYS.includes(v)) fletchQtySel = v;
  }).catch(() => {});
}
function storeFletchQty(q) {
  const folder = smithKv();
  if (!folder) return;
  folder.set(FLETCH_QTY_KEY, q).catch(() => {});
}
export function openFletchMenu(logId) {
  const ps = G.ps;
  if (!ps.inv.some((s) => s && s.id === logId)) return;
  const lvl = skillLvl("fletching");
  const fb = BOW_FLETCH[logId] || {};
  const rows = [
    { id: "arrow_shaft", level: 1, xp: 5, note: "15 shafts" },
    fb.short ? { id: fb.short.id, level: fb.short.level, xp: fb.short.xp } : null,
    fb.long ? { id: fb.long.id, level: fb.long.level, xp: fb.long.xp } : null,
  ].filter(Boolean);
  const start = (r, n) => {
    const max = invCount(G.ps, logId);
    if (max < 1) { chat("You have run out of logs.", "warn"); return; }
    closeModal();
    startFletchRepeat(logId, r.id, Math.max(1, Math.min(n, max)));
  };
  const startSel = (r) => {
    if (fletchQtySel === "X") { closeModal(); openAmountPrompt("make", 0, { cb: (n) => start(r, n || 1) }); return; }
    if (fletchQtySel === "All") return start(r, 1e9);
    start(r, fletchQtySel);
  };
  openModal("What would you like to make?", (body) => {
    const have = invCount(G.ps, logId);
    const wrap = mkEl("div", "craftWrap");
    const grid = mkEl("div", "craftGrid");
    for (const r of rows) {
      const cell = mkEl("div", "craftCell");
      const iconWrap = mkEl("div", "craftIconWrap");
      const img = mkEl("img", "craftIcon");
      img.src = iconUrl(r.id, 32);
      img.draggable = false;
      img.alt = itemName(r.id);
      iconWrap.appendChild(img);
      iconWrap.appendChild(mkEl("div", "craftQty", "x" + have));
      cell.appendChild(iconWrap);
      cell.appendChild(mkEl("div", "craftName", r.note ? itemName(r.id) + " " + r.note : itemName(r.id)));
      const cost = mkEl("div", "craftCost", "1 x " + itemName(logId).toLowerCase());
      cost.classList.add(have > 0 ? "ok" : "need");
      cell.appendChild(cost);
      const short = r.level > lvl ? "Requires " + r.level + " Fletching to make " + itemName(r.id).toLowerCase() + "." : null;
      if (short) {
        cell.classList.add("dim");
        cell.title = short;
      } else {
        cell.title = itemName(r.id) + " - level " + r.level + " - " + Math.round(r.xp * 10) / 10 + " XP";
        cell.addEventListener("click", () => startSel(r));
        cell.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          openCtx(ev.clientX, ev.clientY, itemName(r.id), [
            { label: "Make 1", fn: () => start(r, 1) },
            { label: "Make 5", fn: () => start(r, 5) },
            { label: "Make 10", fn: () => start(r, 10) },
            { label: "Make X", fn: () => { closeModal(); openAmountPrompt("make", 0, { cb: (n) => start(r, n || 1) }); } },
            { label: "Make All", fn: () => start(r, 1e9) },
            { label: "Cancel", fn: () => {} },
          ]);
        });
      }
      grid.appendChild(cell);
    }
    grid.style.gridTemplateColumns = "repeat(" + Math.max(1, Math.min(rows.length, 4)) + ", auto)";
    wrap.appendChild(grid);
    const side = mkEl("div", "craftSide");
    const btns = new Map();
    paintFletchQty = () => {
      for (const [q, b] of btns) b.classList.toggle("sel", q === fletchQtySel);
      refreshSharpText();
    };
    for (const q of FLETCH_QTYS) {
      const b = mkEl("button", "craftBtn", String(q));
      b.title = q === "X" ? "Make a set amount" : q === "All" ? "Make all you can" : "Make " + q;
      b.addEventListener("click", () => {
        fletchQtySel = q;
        storeFletchQty(q);
        paintFletchQty();
      });
      btns.set(q, b);
      side.appendChild(b);
    }
    wrap.appendChild(side);
    body.appendChild(wrap);
    fitGridRows(wrap, grid);
    paintFletchQty();
    loadFletchQty().then(() => { if (paintFletchQty) paintFletchQty(); });
    const head = UI.els.modalBox.querySelector(".cHead");
    if (head && !head.querySelector(".craftX")) {
      const xBtn = mkEl("button", "craftX", "X");
      xBtn.addEventListener("click", closeModal);
      head.appendChild(xBtn);
    }
  }, [], { boxClass: "craftBox", onClose: () => { paintFletchQty = null; } });
}
export function fletchLogs(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d || d.kind !== "log") { chat("You can't fletch that.", "warn"); return; }
  if (!invCount(ps, "knife")) { chat("You need a knife to fletch.", "warn"); return; }
  openFletchMenu(s.id);
}

/* Feathers on shafts go through the same make screen: the product is fixed
   (headless arrows) and only the quantity is asked. */
export function fletchArrows(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s || s.id !== "arrow_shaft") return;
  if (!invCount(ps, "feather")) { chat("You need feathers to fletch arrows.", "warn"); return; }
  openFletchMake("arrow_shaft", "headless_arrow");
}

/* The make screen object: "How many would you like to make?" with Make 1
   / 5 / 10 / X / All, for the feather work (a shaft stock into headless
   arrows). X asks through the chatbox
   amount prompt - via `then`, so the prompt opens after the box's own
   teardown instead of being cleared by it; the rest start the repeat
   directly, capped by what the pack holds. */
function makeScreenFor(fromId, outId) {
  const max = fletchActions(fromId);
  if (max < 1) { chat("You have nothing to make that with.", "warn"); return; }
  const start = (f, o, n) => startFletchRepeat(f, o, n);
  const go = (n) => () => start(fromId, outId, Math.max(1, Math.min(n, max)));
  const remax = () => fletchActions(fromId);
  return {
    title: "How many would you like to make?",
    options: [
      opt("Make 1.", go(1)),
      opt("Make 5.", go(5)),
      opt("Make 10.", go(10)),
      opt("Make X.", [then(() => openAmountPrompt("make", 0, { cb: (n) => start(fromId, outId, Math.max(1, Math.min(n, remax()))) }))]),
      opt("Make All.", go(max)),
    ],
  };
}

function openFletchMake(fromId, outId) {
  const sc = makeScreenFor(fromId, outId);
  if (sc) startDialogue("fletch", [sc]);
}

/* How many fletching actions the pack currently affords: one log each for
   shafts and bows, one 15-batch each for headless arrows. */
function fletchActions(fromId) {
  const ps = G.ps;
  if (fromId === "arrow_shaft") return Math.max(0, Math.min(Math.ceil(invCount(ps, "arrow_shaft") / 15), Math.ceil(invCount(ps, "feather") / 15)));
  return invCount(ps, fromId);
}

/* Start the repeat: the client's "make all" is the only mode, so a count is a
   cap on it, not a separate behaviour - the activity stops itself when the
   count is done, the materials run out, or anything else stops it like every
   other skilling action. */
export function startFletchRepeat(fromId, outId, count) {
  const ps = G.ps;
  if (fletchActions(fromId) < 1) { chat("You have nothing to make that with.", "warn"); return; }
  if (fromId !== "arrow_shaft" && !invCount(ps, "knife")) { chat("You need a knife to fletch.", "warn"); return; }
  if (fromId === "arrow_shaft" && !invCount(ps, "feather")) { chat("You need feathers to fletch arrows.", "warn"); return; }
  if (Actions.act && Actions.act.kind === "fletch" && Actions.act.data.fromId === fromId && Actions.act.data.outId === outId) return;
  const tx = Math.floor(G.player.x);
  const tz = Math.floor(G.player.z);
  begin("fletch", tx, tz, { fromId, outId, left: count, noFace: true });
}

function attemptFletch(act) {
  const ps = G.ps;
  const d = act.data;
  if (d.left <= 0) { cancelAction(); return; }
  if (d.fromId !== "arrow_shaft" && !invCount(ps, "knife")) return stopMsg("You need a knife to fletch.");
  if (d.fromId === "arrow_shaft" && !invCount(ps, "feather")) return stopMsg("You need feathers to fletch arrows.");
  if (d.outId === "arrow_shaft") {
    if (!invCount(ps, d.fromId)) return stopMsg("You have run out of logs.");
    if (invFree(ps) < 1 && !invCount(ps, "arrow_shaft")) return stopMsg("You need a free inventory slot.");
    invRemove(ps, d.fromId, 1);
    invAdd(ps, "arrow_shaft", 15);
    addXp(ps, "fletching", 5);
    mark("inv");
    workAnim("fletch");
    chat("You carefully cut the logs into 15 arrow shafts.", "game");
  } else if (d.outId === "headless_arrow") {
    const n = Math.min(invCount(ps, "arrow_shaft"), invCount(ps, "feather"), 15);
    if (n < 1) return stopMsg("You have run out of arrow shafts or feathers.");
    invRemove(ps, "arrow_shaft", n);
    invRemove(ps, "feather", n);
    invAdd(ps, "headless_arrow", n);
    addXp(ps, "fletching", n);
    mark("inv");
    workAnim("fletch");
    chat("You attach feathers to " + n + " arrow shafts.", "game");
  } else {
    const fb = BOW_FLETCH[d.fromId] || {};
    const r = fb.short && fb.short.id === d.outId ? fb.short : (fb.long && fb.long.id === d.outId ? fb.long : null);
    if (!r) { cancelAction(); return; }
    if (skillLvl("fletching") < r.level) return stopMsg("You need a Fletching level of " + r.level + " to make " + itemName(r.id).toLowerCase() + ".");
    if (!invCount(ps, d.fromId)) return stopMsg("You have run out of logs.");
    if (invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
    invRemove(ps, d.fromId, 1);
    invAdd(ps, r.id, 1);
    addXp(ps, "fletching", r.xp);
    mark("inv");
    workAnim("fletch");
    chat("You carefully cut the logs into " + withArticle(itemName(r.id).toLowerCase()) + ".", "game");
  }
  d.left -= 1;
  /* three ticks a piece, the integer the live client's own recipe timings use */
  act.timer = 3;
}

/* Stringing a bow: a bow string onto an unstrung bow, one of each per action,
   at the recipe's own Fletching level and experience. No box is asked - the
   "String" row and either Use order string the whole pack straight into the
   repeat below, which stops itself when the bows or the strings run out. */
export function stringBow(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const r = BOW_STRING[s.id];
  if (!r) { chat("You can't string that.", "warn"); return; }
  if (!invCount(ps, "bow_string")) { chat("You need a bow string to string it.", "warn"); return; }
  if (skillLvl("fletching") < r.level) {
    chat("You need a Fletching level of " + r.level + " to string " + itemName(s.id).toLowerCase() + ".", "warn");
    return;
  }
  startStringRepeat(s.id, 1e9);
}

/* The stringing pose names the bow, not the level: the live game's own
   per-bow sequence, shorts 6678..6683 then longs 6684..6689 in wood order
   (bake.mjs#SKILL_ANIMS). 45 frames each; the shorts run 237 cycles (4.74 s),
   the longs 251 (5.02 s). */
const STRING_ANIM = {
  shortbow_u: "string_shortbow", oak_shortbow_u: "string_oak_shortbow",
  willow_shortbow_u: "string_willow_shortbow", maple_shortbow_u: "string_maple_shortbow",
  yew_shortbow_u: "string_yew_shortbow", magic_shortbow_u: "string_magic_shortbow",
  longbow_u: "string_longbow", oak_longbow_u: "string_oak_longbow",
  willow_longbow_u: "string_willow_longbow", maple_longbow_u: "string_maple_longbow",
  yew_longbow_u: "string_yew_longbow", magic_longbow_u: "string_magic_longbow",
};
function stringAnimFor(unbow) {
  return STRING_ANIM[unbow] || "fletch";
}

/* How many stringings the pack currently affords: one unstrung bow and one
   bow string each. */
function stringActions(unbow) {
  const ps = G.ps;
  return Math.max(0, Math.min(invCount(ps, unbow), invCount(ps, "bow_string")));
}

/* One bow strung on the spot: the use-with's single, same-tick stringing -
   no activity, no pose, just the swap, the experience and the line, like the
   other instant bench crafts (tiara binding, pie shells). The repeat lives
   behind the "String" row (stringBow above, startStringRepeat below). */
function stringOneNow(unbow) {
  const ps = G.ps;
  const r = BOW_STRING[unbow];
  if (!r) return;
  if (skillLvl("fletching") < r.level) {
    chat("You need a Fletching level of " + r.level + " to string " + itemName(unbow).toLowerCase() + ".", "warn");
    return;
  }
  if (!invCount(ps, unbow)) return;
  if (!invCount(ps, "bow_string")) { chat("You need a bow string to string it.", "warn"); return; }
  invRemove(ps, unbow, 1);
  invRemove(ps, "bow_string", 1);
  invAdd(ps, r.id, 1);
  addXp(ps, "fletching", r.xp);
  mark("inv");
  chat("You string the " + itemName(unbow).toLowerCase() + ".", "game");
}

/* Start the repeat: the client's "make all" is the only mode, so a count is a
   cap on it, not a separate behaviour - the activity stops itself when the
   count is done, the materials run out, or anything else stops it like every
   other skilling action. Pack-work, so `noFace`: there is no world target and
   nothing to turn to. */
export function startStringRepeat(unbow, count) {
  const ps = G.ps;
  if (stringActions(unbow) < 1) { chat("You have nothing to make that with.", "warn"); return; }
  if (!invCount(ps, "bow_string")) { chat("You need a bow string to string it.", "warn"); return; }
  if (Actions.act && Actions.act.kind === "string" && Actions.act.data.unbow === unbow) return;
  const tx = Math.floor(G.player.x);
  const tz = Math.floor(G.player.z);
  begin("string", tx, tz, { unbow, left: count, noFace: true });
}

function attemptString(act) {
  const ps = G.ps;
  const d = act.data;
  if (d.left <= 0) { cancelAction(); return; }
  const r = BOW_STRING[d.unbow];
  if (!r) { cancelAction(); return; }
  if (skillLvl("fletching") < r.level) return stopMsg("You need a Fletching level of " + r.level + " to string " + itemName(d.unbow).toLowerCase() + ".");
  if (!invCount(ps, d.unbow)) return stopMsg("You have run out of " + itemName(d.unbow).toLowerCase() + ".");
  if (!invCount(ps, "bow_string")) return stopMsg("You have run out of bow string.");
  /* No free-slot check: two stacks leave (one always frees its slot) and one
     arrives, so a stringing always fits whatever the pack holds. */
  invRemove(ps, d.unbow, 1);
  invRemove(ps, "bow_string", 1);
  invAdd(ps, r.id, 1);
  addXp(ps, "fletching", r.xp);
  mark("inv");
  /* Fresh arm every bow, holding the unstrung bow itself (its wield model is
     baked like every other held model, so the poseTool gate lets it through).
     The live game re-sends the motion with every 2-tick action, so the full
     ~5 s sequence is never seen through - what plays is its opening, restarted
     per bow, which is what this does too. */
  playCastAnim(G.player, stringAnimFor(d.unbow), undefined, false, d.unbow);
  chat("You string the " + itemName(d.unbow).toLowerCase() + ".", "game");
  d.left -= 1;
  /* two ticks a piece: the live rate (up to 2,400 strung an hour including the
     banking, which a 3-tick cycle could never reach). */
  act.timer = 2;
}

/* ------------------------------------------------------ the bolt fletching

   The three Fletching steps of the bolt chain (src/items.js's
   `BOLT_TIP_FROM_GEM`, `BOLT_FEATHER` and `BOLT_TIP_ATTACH`), all reached from
   the item's own right-click menu the way the arrow-shaft fletching above is:
   a cut gem offers **Make bolt tips**, a stack of unfinished bolts offers
   **Fletch bolts** (one feather each), and a stack of tips offers **Attach to
   bolts** (ten tips to ten of the metal bolt the live game pairs them with).

   Each works on the *whole stack, or as much of it as the other ingredient
   covers*, and pays the published experience for what it actually made - which
   is why each table's experience is in its own unit and is scaled here:

     * `BOLT_FEATHER` prints experience **per bolt** (0.5 for bronze, 10 for
       runite - each page's own "yielding N Fletching experience per bolt"), so
       ten pay ten times it;
     * `BOLT_TIP_ATTACH` prints it **per action of ten** (16 for opal tips, 94
       for onyx), so a finished bolt pays a tenth of it;
     * `BOLT_TIP_FROM_GEM` prints it **per gem cut** (1.5 for an opal, 9.4 for an
       onyx), which is one action whatever the gem yields.

   The unit is stated on each table in src/items.js rather than guessed at here,
   and the recipe levels are the items' own printed ones. */

export function makeBoltTips(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const recipe = BOLT_TIP_FROM_GEM[s.id];
  if (!recipe) { chat("You can't make bolt tips from that.", "warn"); return; }
  if (!invCount(ps, "chisel")) { chat("You need a chisel to cut gems.", "warn"); return; }
  if (skillLvl("fletching") < recipe.level) {
    chat("You need a Fletching level of " + recipe.level + " to make " + itemName(recipe.id).toLowerCase() + ".", "warn");
    return;
  }
  if (invFree(ps) < 1) { chat("You need a free inventory slot.", "warn"); return; }
  invRemoveAt(ps, invIndex, 1);
  invAdd(ps, recipe.id, recipe.per);
  addXp(ps, "fletching", recipe.xp);
  mark("inv");
  playCastAnim(G.player, gemPose(s.id));
  chat("You cut the " + itemName(s.id).toLowerCase() + " into " + recipe.per + " " + itemName(recipe.id).toLowerCase() + ".", "game");
}

export function fletchBoltFeathers(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const recipe = BOLT_FEATHER[s.id];
  if (!recipe) { chat("You can't fletch those.", "warn"); return; }
  if (!invCount(ps, "feather")) { chat("You need feathers to fletch bolts.", "warn"); return; }
  if (skillLvl("fletching") < recipe.level) {
    chat("You need a Fletching level of " + recipe.level + " to fletch " + itemName(recipe.id).toLowerCase() + ".", "warn");
    return;
  }
  const n = Math.min(s.qty, invCount(ps, "feather"));
  invRemoveAt(ps, invIndex, n);
  invRemove(ps, "feather", n);
  invAdd(ps, recipe.id, n);
  addXp(ps, "fletching", recipe.xp * n);
  mark("inv");
  playCastAnim(G.player, "fletch");
  chat("You attach feathers to " + n + " unfinished bolt" + (n === 1 ? "" : "s") + ".", "game");
}

export function attachBoltTips(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const recipe = BOLT_TIP_ATTACH[s.id];
  if (!recipe) { chat("Those tips fit no bolt.", "warn"); return; }
  if (skillLvl("fletching") < recipe.level) {
    chat("You need a Fletching level of " + recipe.level + " to make " + itemName(recipe.id).toLowerCase() + ".", "warn");
    return;
  }
  const bolts = invCount(ps, recipe.bolt);
  if (!bolts) {
    chat("You need " + itemName(recipe.bolt).toLowerCase() + " to attach those tips to.", "warn");
    return;
  }
  const n = Math.min(s.qty, bolts);
  invRemoveAt(ps, invIndex, n);
  invRemove(ps, recipe.bolt, n);
  invAdd(ps, recipe.id, n);
  addXp(ps, "fletching", recipe.xp / 10 * n);
  mark("inv");
  playCastAnim(G.player, "fletch");
  chat("You attach the tips to " + n + " " + itemName(recipe.bolt).toLowerCase() + ", making " + itemName(recipe.id).toLowerCase() + ".", "game");
}

/* ------------------------------------------------------- leather crafting

   The needle-and-thread half of Crafting (src/PLAN.md unit O). The recipes
   themselves are data - `CRAFT_RECIPES` in src/items.js - and everything here
   is the machinery around them: the menu, the work, and the tanner who prepares
   the leathers.

   The flow is the client's, mapped onto this world's one modal window: a
   material's own right-click "Craft" opens the recipe list for whatever that
   material can become (the item icons, the way the anvil's menu works), and
   each icon starts a "craft" action that repeats every three ticks until the
   materials run out, exactly like smithing's make-all.

   Two deliberate deviations, both recorded in src/PLAN.md unit O:

   * the real client opens the crafting *interface* (231 for leather, 219 for
     the tanner) and draws its own level/quantity buttons; neither interface is
     mapped in this build, so the anvil's modal stands in for both - the recipes,
     the levels and the numbers printed on it are the published ones, only the
     window is ours;
   * the thread is charged by the running count in `ps.threadUnits` (see
     src/items.js#CRAFT_RECIPES), which is the real rule and not an
     approximation: five pieces of leather, one thread - so nothing is consumed
     on the first four leather items a player ever sews and every fifth one costs
     a thread. */

/* Every recipe the given material is an ingredient of, cheapest level first. */
export function recipesFor(materialId) {
  const out = [];
  for (const [id, r] of Object.entries(CRAFT_RECIPES)) {
    if (!ITEMS[id]) continue;
    if (r.mats.some(([m]) => m === materialId)) out.push(Object.assign({ id }, r));
  }
  out.sort((a, b) => a.level - b.level || ITEMS[a.id].value - ITEMS[b.id].value);
  return out;
}

/* How many threads the next `units` pieces of leather will cost, given the
   running count: the fifth piece of every five is the one that eats a thread,
   so a player on four is charged on their next piece and a player on zero is
   not charged for four more. `ps.threadUnits` is a 0..4 remainder. */
export function threadsFor(ps, units) {
  const used = ps.threadUnits || 0;
  return Math.floor((used + units) / 5) - Math.floor(used / 5);
}

/* How many of a recipe the player could make right now, materials and thread
   both counted - what the menu prints under each icon. */
export function craftable(r) {
  const ps = G.ps;
  let n = Infinity;
  for (const [m, q] of r.mats) n = Math.min(n, Math.floor(invCount(ps, m) / q));
  if (!isFinite(n)) n = 0;
  if (r.units > 0) {
    const th = threadsFor(ps, r.units);
    if (th > 0) n = Math.min(n, Math.floor(invCount(ps, "thread") / th));
  }
  if (!isStackable(r.id)) n = Math.min(n, invFreeSlots() + 1);
  return Math.max(0, n);
}

function canCraftNow(r) {
  const ps = G.ps;
  for (const [m, q] of r.mats) if (invCount(ps, m) < q) return false;
  if (threadsFor(ps, r.units) > invCount(ps, "thread")) return false;
  return true;
}

/* The right-click "Craft" on a material. The client's own wording for the menu
   entry and the window title is kept; what the window *lists* is only what the
   player can actually make, so a level-1 player with a leather sees one icon
   and a note telling them what the next one costs. */
export function craftFromInv(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const all = recipesFor(s.id);
  if (!all.length) { chat("You can't craft anything from that.", "warn"); return; }
  if (!invCount(ps, "needle")) { chat("You need a needle to sew with.", "warn"); return; }
  if (!invCount(ps, "thread")) { chat("You need some thread to sew with.", "warn"); return; }
  const lvl = skillLvl("crafting");
  /* Dragonhide graduated to the production window (see
     openProductionCraftMenu below) - the rest follow one material at a time. */
  if (s.id === "green_dragon_leather" || s.id === "blue_dragon_leather" ||
      s.id === "red_dragon_leather" || s.id === "black_dragon_leather" ||
      s.id === "leather" || s.id === "hard_leather" ||
      s.id === "snakeskin") return openProductionCraftMenu(s.id, all, lvl);
  openCraftMenu(s.id, all, lvl);
}

function openCraftMenu(materialId, all, lvl) {
  const ps = G.ps;
  const usable = all.filter((r) => r.level <= lvl);
  openModal("What would you like to make?", (body) => {
    if (!usable.length) {
      const next = all[0];
      body.appendChild(mkEl("div", "note", "You need a Crafting level of " + next.level +
        " to make " + itemName(next.id).toLowerCase() + "."));
      return;
    }
    const grid = mkEl("div", "shopGrid");
    for (const r of usable) {
      const can = craftable(r);
      const d = mkEl("div", "slot");
      const img = mkEl("img");
      img.src = iconUrl(r.id, 44);
      img.draggable = false;
      img.alt = itemName(r.id);
      d.appendChild(img);
      d.appendChild(mkEl("span", "qty", "x" + can));
      d.title = itemName(r.id) + " - level " + r.level + " - " + matsText(r) + " - " + Math.round(r.xp * 10) / 10 + " XP";
      d.addEventListener("click", () => {
        closeModal();
        craftItem(r);
      });
      grid.appendChild(d);
    }
    body.appendChild(grid);
  });
}

function matsText(r) {
  return r.mats.map(([m, q]) => q + " x " + itemName(m).toLowerCase()).join(", ");
}

/* Production-window leather crafting, now serving all four dragonhides: the
   bank-type window at the viewer seat with the product's own large icons and
   the stone 1 / 5 / 10 / X / All buttons down the right, like the anvil and
   glass screens. The menu is generic over whatever recipe list it is given -
   other materials graduate from openCraftMenu above one at a time (see
   craftFromInv). Left-click sews the set quantity, right-click names its own,
   and the window closes behind the work exactly like the anvil's. */
const CRAFT_QTYS = [1, 5, 10, "X", "All"];
const CRAFT_QTY_KEY = "craftQty";
let craftQtySel = 1;
let paintCraftQty = null;
function loadCraftQty() {
  const folder = smithKv();
  if (!folder) return Promise.resolve();
  return folder.get(CRAFT_QTY_KEY).then((v) => {
    if (CRAFT_QTYS.includes(v)) craftQtySel = v;
  }).catch(() => {});
}
function storeCraftQty(q) {
  const folder = smithKv();
  if (!folder) return;
  folder.set(CRAFT_QTY_KEY, q).catch(() => {});
}
export function openProductionCraftMenu(materialId, all, lvl) {
  const ps = G.ps;
  const usable = all.filter((r) => r.level <= lvl);
  const start = (r, n) => {
    const max = craftable(r);
    if (max < 1) { chat("You don't have the materials to make " + itemName(r.id).toLowerCase() + ".", "warn"); return; }
    closeModal();
    craftItem(r, Math.max(1, Math.min(n, max)));
  };
  const startSel = (r) => {
    if (craftQtySel === "X") { closeModal(); openAmountPrompt("make", 0, { cb: (n) => start(r, n || 1) }); return; }
    if (craftQtySel === "All") return start(r, 1e9);
    start(r, craftQtySel);
  };
  openModal("What would you like to make?", (body) => {
    if (!usable.length) {
      const next = all[0];
      body.appendChild(mkEl("div", "note", "You need a Crafting level of " + next.level +
        " to make " + itemName(next.id).toLowerCase() + "."));
      return;
    }
    const wrap = mkEl("div", "craftWrap");
    const grid = mkEl("div", "craftGrid");
    for (const r of usable) {
      const cell = mkEl("div", "craftCell");
      const can = craftable(r);
      const iconWrap = mkEl("div", "craftIconWrap");
      const img = mkEl("img", "craftIcon");
      img.src = iconUrl(r.id, 32);
      img.draggable = false;
      img.alt = itemName(r.id);
      iconWrap.appendChild(img);
      iconWrap.appendChild(mkEl("div", "craftQty", "x" + can));
      cell.appendChild(iconWrap);
      cell.appendChild(mkEl("div", "craftName", itemName(r.id)));
      const cost = mkEl("div", "craftCost", matsText(r));
      cost.classList.add(can > 0 ? "ok" : "need");
      cell.appendChild(cost);
      cell.title = itemName(r.id) + " - level " + r.level + " - " + matsText(r) + " - " + Math.round(r.xp * 10) / 10 + " XP";
      cell.addEventListener("click", () => startSel(r));
      cell.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        openCtx(ev.clientX, ev.clientY, itemName(r.id), [
          { label: "Make 1", fn: () => start(r, 1) },
          { label: "Make 5", fn: () => start(r, 5) },
          { label: "Make 10", fn: () => start(r, 10) },
          { label: "Make X", fn: () => { closeModal(); openAmountPrompt("make", 0, { cb: (n) => start(r, n || 1) }); } },
          { label: "Make All", fn: () => start(r, 1e9) },
          { label: "Cancel", fn: () => {} },
        ]);
      });
      grid.appendChild(cell);
    }
    /* One track per column actually used (capped at four): an empty explicit
       track still takes its share of the even spacing and doubles the far
       edge, so the track count follows the row. */
    grid.style.gridTemplateColumns = "repeat(" + Math.max(1, Math.min(usable.length, 4)) + ", auto)";
    wrap.appendChild(grid);
    const side = mkEl("div", "craftSide");
    const btns = new Map();
    paintCraftQty = () => {
      for (const [q, b] of btns) b.classList.toggle("sel", q === craftQtySel);
      /* Class flips are not DOM mutations, so the text painter (src/sharp.js)
         is blind to them - without this the set button's white never paints. */
      refreshSharpText();
    };
    for (const q of CRAFT_QTYS) {
      const b = mkEl("button", "craftBtn", String(q));
      b.title = q === "X" ? "Make a set amount" : q === "All" ? "Make all you can" : "Make " + q;
      b.addEventListener("click", () => {
        craftQtySel = q;
        storeCraftQty(q);
        paintCraftQty();
      });
      btns.set(q, b);
      side.appendChild(b);
    }
    wrap.appendChild(side);
    body.appendChild(wrap);
    fitGridRows(wrap, grid);
    paintCraftQty();
    loadCraftQty().then(() => { if (paintCraftQty) paintCraftQty(); });
    const head = UI.els.modalBox.querySelector(".cHead");
    if (head && !head.querySelector(".craftX")) {
      const xBtn = mkEl("button", "craftX", "X");
      xBtn.addEventListener("click", closeModal);
      head.appendChild(xBtn);
    }
  }, [], { boxClass: "craftBox", onClose: () => { paintCraftQty = null; } });
}

/* Start sewing. The action repeats itself (see attemptCraft), so the client's
   "make all" is the only mode - a click on the icon sews until the leather or
   the thread runs out, and any click elsewhere stops it like every other
   skilling action. */
export function craftItem(r, count) {
  const ps = G.ps;
  if (!invCount(ps, "needle")) { chat("You need a needle to sew with.", "warn"); return; }
  if (!invCount(ps, "thread")) { chat("You need some thread to sew with.", "warn"); return; }
  if (skillLvl("crafting") < r.level) {
    chat("You need a Crafting level of " + r.level + " to make " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (!canCraftNow(r)) {
    chat("You don't have the materials to make " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (!isStackable(r.id) && invFreeSlots() < 1) { chat("You need a free inventory slot.", "warn"); return; }
  if (Actions.act && Actions.act.kind === "craft" && Actions.act.data.id === r.id) return;
  const tx = Math.floor(G.player.x);
  const tz = Math.floor(G.player.z);
  /* A count caps the repeat (the side buttons / right-click menu); without one
     the repeat sews until the materials run out, exactly as before. */
  const data = { id: r.id, level: r.level, xp: r.xp, mats: r.mats, units: r.units, noFace: true };
  if (count != null) data.left = Math.max(1, Math.min(count, craftable(r)));
  begin("craft", tx, tz, data);
}

function attemptCraft(act) {
  const ps = G.ps;
  const d = act.data;
  if (d.left != null && d.left <= 0) { cancelAction(); return; }
  if (!invCount(ps, "needle")) return stopMsg("You need a needle to sew with.");
  for (const [m, q] of d.mats) {
    if (invCount(ps, m) < q) return stopMsg("You have run out of " + itemName(m).toLowerCase() + ".");
  }
  const th = threadsFor(ps, d.units);
  if (th > 0 && invCount(ps, "thread") < th) return stopMsg("You have run out of thread.");
  if (!isStackable(d.id) && invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
  for (const [m, q] of d.mats) invRemove(ps, m, q);
  if (th > 0) {
    invRemove(ps, "thread", th);
    ps.threadUnits = ((ps.threadUnits || 0) + d.units) % 5;
  } else {
    ps.threadUnits = (ps.threadUnits || 0) + d.units;
  }
  invAdd(ps, d.id, 1);
  addXp(ps, "crafting", d.xp);
  mark("inv");
  workAnim("leathercraft");
  chat("You make the " + itemName(d.id).toLowerCase() + ".", "game");
  /* three ticks a piece, the integer the live client's own recipe timings use */
  if (d.left != null) {
    d.left--;
    if (d.left <= 0) return;
  }
  act.timer = 3;
}

/* --------------------------------------------------------------- the tanner

   The one NPC in this world who turns a hide into leather. His trade is the
   published one (src/items.js#TAN_FEES) and his face is the cache's own (NPC
   804, baked like every other character - see tools/cache-bake/bake.mjs).

   His counter is Thormac's riveted shell (src/ui.js#openTanCounter) with the
   tanning list's own cells: the "What would you like tanned?" title, one
   cell per conversion, each with the leather's own large icon stacked over
   its name and fee. A cell reads red without the hide, cyan with the hide
   but short on coins, and green when the batch can go. A left-click tans every hide of that kind the coins
   cover (the live game tans the whole carried batch); a right-click offers
   Tan 1 / 5 / 10 / X / All, and a tan rebuilds the shelf in place, so it
   never jumps. The counter opens even with nothing to tan - the pick then
   says so in the chatbox, so a right-click always answers. He charges per
   hide, never per batch, and he does not care
   what Crafting level the customer has - which is what TAN_FEES says. */
export function openTanMenu() {
  openTanCounter({
    title: "What would you like tanned?",
    build: () => {
      const ps = G.ps;
      const coins = invCount(ps, "coins");
      return {
        rows: TAN_FEES.map((row) => {
          const fee = row.fee + (row.fee === 1 ? " coin" : " coins");
          return {
            icon: iconUrl(row.to, 56),
            name: row.label,
            fee,
            state: invCount(ps, row.from) < 1 ? "short" : (Math.floor(coins / row.fee) > 0 ? "ready" : "ok"),
            tip: itemName(row.from) + " into " + itemName(row.to).toLowerCase() + " - " + row.fee + " gp each",
            fromName: itemName(row.from),
            pick: () => {
              if (invCount(G.ps, row.from) < 1 || Math.floor(invCount(G.ps, "coins") / row.fee) < 1) return;
              tanHidesQty(row.from, row.to, 1e9);
            },
            pickN: (qty) => tanHidesQty(row.from, row.to, qty),
          };
        }),
      };
    },
  });
}



/* Tan up to `count` hides of one kind in one go - the count caps what the
   pack holds and what the coins cover, so Tan 1 / 5 / 10 / X / All are all
   the same call. No experience is granted: tanning is a shop service, not
   a Crafting action, which is exactly why the Crafting guide prints a level
   against the leather and never against the hide. */
export function tanHidesQty(fromId, toId, count) {
  const ps = G.ps;
  const row = TAN_FEES.find((r) => r.from === fromId && r.to === toId);
  if (!row) return;
  const have = invCount(ps, fromId);
  if (!have) { chat("You have no " + itemName(fromId).toLowerCase() + " to tan.", "warn"); return; }
  const afford = Math.floor(invCount(ps, "coins") / row.fee);
  if (afford < 1) { chat("You can't afford to tan those.", "warn"); return; }
  const n = Math.max(1, Math.min(count || 1, have, afford));
  invRemove(ps, fromId, n);
  invRemove(ps, "coins", n * row.fee);
  invAdd(ps, toId, n);
  mark("inv");
  refreshTanCounter();
  chat("The tanner hands you " + n + " " + itemName(toId).toLowerCase() + (n > 1 ? "s" : "") + ".", "game");
}

export function tanHides(fromId, toId) {
  tanHidesQty(fromId, toId, 1e9);
}

/* Thormac's own trade: he enchants elemental battlestaves into mystic staves
   at 40,000 coins each (the live game's own fee, taken in batches like the
   tanner's hides). There is no quest gate here - this world has no Scorpion
   Catcher - so the fee itself is the gate, exactly as the magic counter's
   prices stand in for the orb recipe he would otherwise need
   (src/actions.js#SHOPS.magic). No plain battlestaff row: the live game makes
   no mystic out of one either. */
const THORMAC_UPGRADES = [
  { from: "air_battlestaff", to: "mystic_air_staff", fee: 40000 },
  { from: "water_battlestaff", to: "mystic_water_staff", fee: 40000 },
  { from: "earth_battlestaff", to: "mystic_earth_staff", fee: 40000 },
  { from: "fire_battlestaff", to: "mystic_fire_staff", fee: 40000 },
  { from: "lava_battlestaff", to: "mystic_lava_staff", fee: 40000 },
  { from: "mud_battlestaff", to: "mystic_mud_staff", fee: 40000 },
];

/* Which of the pack's staves Thormac can lay hands on: his own counter in the
   shop's riveted window (src/ui.js#openThormac), listing only the kinds the
   pack actually holds with the count the coins cover. A pick enchants the
   whole affordable batch and the shelf rebuilds in place. */
function openThormacMenu() {
  openThormac({
    title: "Which staves shall I enchant?",
    build: () => {
      const ps = G.ps;
      const coins = invCount(ps, "coins");
      const rows = [];
      let held = false;
      for (const row of THORMAC_UPGRADES) {
        const have = invCount(ps, row.from);
        if (have) held = true;
        const afford = Math.min(have, Math.floor(coins / row.fee));
        const short = row.from.split("_")[0].replace(/^./, (c) => c.toUpperCase());
        rows.push({
          icon: iconUrl(row.to, 56),
          name: short,
          fee: row.fee.toLocaleString("en-US") + " coins",
          have,
          ok: have > 0 && afford >= 1,
          tip: itemName(row.from) + " into " + itemName(row.to).toLowerCase() + " - " + row.fee + " gp each",
          fromName: itemName(row.from),
          pick: () => thormacEnchant(row.from, row.to),
          pickN: (n) => thormacEnchantQty(row.from, row.to, n),
        });
      }
      let note = "";
      return { rows, note };
    },
  });
}

/* Enchant every staff of one kind the player can pay for, in one go - the
   batch the tanner works in, and no experience: enchanting is his service, not
   the player's spell. */
export function thormacEnchant(fromId, toId) {
  thormacEnchantQty(fromId, toId, 1e9);
}

export function thormacEnchantQty(fromId, toId, n) {
  const ps = G.ps;
  const row = THORMAC_UPGRADES.find((r) => r.from === fromId && r.to === toId);
  if (!row) return;
  const have = invCount(ps, fromId);
  if (!have) { chat("You have no " + itemName(fromId).toLowerCase() + " for Thormac to enchant.", "warn"); return; }
  const afford = Math.floor(invCount(ps, "coins") / row.fee);
  if (afford < 1) { chat("You can't afford Thormac's fee.", "warn"); return; }
  const count = Math.max(1, Math.min(n || 1, have, afford));
  invRemove(ps, fromId, count);
  invRemove(ps, "coins", count * row.fee);
  invAdd(ps, toId, count);
  mark("inv");
  refreshThormac();
  chat("Thormac hands you " + count + " " + itemName(toId).toLowerCase() + (count > 1 ? "s" : "") + ".", "game");
}

/* Filling buckets with sand at the glassblower's sandpit (world.js, west of
   the smithy). One Fill works the whole pack, but one bucket at a time: each
   dip is its own two-tick attempt of a repeating session, so walking away -
   or re-clicking - interrupts it like any other skilling. Both routes land
   here: the Fill row and an empty bucket used on the pit. The pit is 2x2, so
   the reach is its whole ring rather than one tile's neighbours. */
const SANDPIT = { x0: 54, z0: 62, x1: 55, z1: 63 };
function fillSand(tx, tz) {
  begin("fillsand", tx, tz, {
    reachTest: (x, z) => x >= SANDPIT.x0 - 1 && x <= SANDPIT.x1 + 1 && z >= SANDPIT.z0 - 1 && z <= SANDPIT.z1 + 1 &&
      !(x >= SANDPIT.x0 && x <= SANDPIT.x1 && z >= SANDPIT.z0 && z <= SANDPIT.z1),
  });
}
function attemptFillSand(act) {
  const ps = G.ps;
  if (!invCount(ps, "bucket")) return stopMsg("You need a bucket to fill with sand.");
  invRemove(ps, "bucket", 1);
  invAdd(ps, "bucket_of_sand", 1);
  mark("inv");
  workAnim("fill_bucket", false, "bucket");
  chat("You fill a bucket with sand.", "game");
  act.timer = 2;
}

/* Filling a bucket at the town well (world.js, `{ t: "well" }`). The well is
   the world's only water source and a bucket of water is what Humidify makes
   and what Plank Make's sawmill trip needs, so this is the one interaction that
   ties the well to the Lunar book. The client's own message and its own option
   name ("Fill", the option the well carries when a bucket is in the pack) are
   kept; without a bucket the refusal is the honest one. */
function fillBucket(tx, tz) {
  /* The bucket is answered on arrival; the walk comes first and only knows
     the four sides (the user's NSEW rule). */
  approach(tx, tz, () => {
    const ps = G.ps;
    if (!invCount(ps, "bucket")) { chat("You need a bucket to fill with water.", "warn"); return; }
    invRemove(ps, "bucket", 1);
  invAdd(ps, "bucket_of_water", 1);
  mark("inv");
  playCastAnim(G.player, "fill_bucket");
  chat("You fill the bucket with water.", "game");
  });
}

/* Filling any empty water vessel at the kitchen sink (update 1) - the sink's
   own Fill rows and the use-with half both land here. The vessel's full id
   comes off its own `fillFrom`, so this never names water ids directly. */
const VESSEL_WORD = { bucket: "bucket", jug: "jug", bowl: "bowl" };
function fillVessel(tx, tz, emptyId) {
  approach(tx, tz, () => {
    const ps = G.ps;
    const fullId = WATER_VESSELS[emptyId];
    if (!fullId || !invCount(ps, emptyId)) { chat("You need a " + (VESSEL_WORD[emptyId] || "vessel") + " to fill with water.", "warn"); return; }
    invRemove(ps, emptyId, 1);
    invAdd(ps, fullId, 1);
    mark("inv");
    playCastAnim(G.player, "fill_bucket");
    chat("You fill the " + (VESSEL_WORD[emptyId] || "vessel") + " with water.", "game");
  });
}

/* ------------------------------------------------------- shearing and spinning

   The two clicks of the fleece chain in items.js:

   * **Shear** - a woolly sheep's own action, and the only one the cache gives
     it (npc 43's option list is exactly "Shear"; the shorn npc 42 has no
     options at all). So the two bakes *are* the two states, and shearing is a
     model swap on the one animal (src/game.js#setNpcModel). One fleece per
     shear, and it grows back after 50 ticks - the live game's own 30 seconds,
     which the wiki's sheep page states outright. Rams are never shearable,
     which is also the wiki's rule ("Wool cannot be obtained from rams") and the
     cache's: a ram's option list carries only Attack.
   * **Spin** - the wheel's own action ("Spin" is the option its cache loc
     carries). The live game answers it with a question in the chat box; this
     build has no use-with mode, so the wheel opens the same skill window the
     anvil, the tanner and the herbalist use (see openSpinMenu below) and lists
     every thread the pack can make. Spinning runs until the material is gone,
     three ticks a ball, which is the rate the game's own recipe tables publish
     (3 ticks, 2.5 experience for wool, 15 for flax).

   Both poses are the pack's own (`human_shearing` and `human_spinningwheel`,
   baked into the player model as `shear` and `spin` - see bake.mjs#SKILL_ANIMS),
   so the player really does hold the shears and work the wheel. */
const SHEEP_WOOLLY_MODEL = "sheep_2";
const SHEEP_SHORN_MODEL = "sheep";
const SHEEP_REGROW_SECONDS = 30;

const SPIN_RECIPES = [
  { from: "wool", to: "ball_of_wool", level: 1, xp: 2.5 },
  { from: "flax", to: "bow_string", level: 10, xp: 15 },
];

/* A sheep has its fleece on unless it has just been shorn and the 30 seconds
   are up. `regrowAt` is a `game.time` stamp (src/game.js#Game.time), and the
   fleece is put back by the tick below - lazily would leave a shorn sheep
   standing in the field for as long as nobody clicked it. */
function sheepWoolly(npc) {
  return !npc.sheared;
}

export function shearSheep(npc) {
  if (!npc || npc.dead || !sheepWoolly(npc)) return false;
  /* The shears are answered on arrival (the user's NSEW rule): the click
     walks to a side face first, where the refusal fires faced at the sheep. */
  approach(Math.floor(npc.x), Math.floor(npc.z), () => {
    if (!invCount(G.ps, "shears")) {
      /* The refusal the client gives, and it is enough: a sheep carries the
         Shear option whether or not you have the tool (it is the animal's own
         option, not a conditional one). */
      chat("You need a pair of shears to shear a sheep.", "warn");
      return;
    }
    attemptShear(npc);
  }, sideReachTest(Math.floor(npc.x), Math.floor(npc.z)));
  return true;
}

function attemptShear(npc) {
  const ps = G.ps;
  if (!npc || npc.dead || !sheepWoolly(npc)) return;
  if (!invCount(ps, "shears")) return;
  faceTarget(G.player, Math.floor(npc.x), Math.floor(npc.z));
  workAnim("shear");
  npc.sheared = true;
  npc.regrowAt = (G.time || 0) + SHEEP_REGROW_SECONDS;
  setNpcModel(npc, SHEEP_SHORN_MODEL);
  invAdd(ps, "wool", 1);
  mark("inv");
  chat("You get some wool.", "game");
}

/* Crassus's own verbs (see npcVerbUsable): Pick-up is refused - he belongs to
   Hatius - and Interact-with strokes him. Both walk up first and answer
   faced, the shear's own shape. */
export function pickupCat(npc) {
  if (!npc || npc.dead || npc.type !== "crassus") return false;
  approach(Math.floor(npc.x), Math.floor(npc.z), () => {
    faceTarget(G.player, Math.floor(npc.x), Math.floor(npc.z));
    chat("Crassus slips out of your reach. He belongs to Hatius.", "game");
  }, sideReachTest(Math.floor(npc.x), Math.floor(npc.z)));
  return true;
}

export function strokeCat(npc) {
  if (!npc || npc.dead || npc.type !== "crassus") return false;
  approach(Math.floor(npc.x), Math.floor(npc.z), () => {
    faceTarget(G.player, Math.floor(npc.x), Math.floor(npc.z));
    playCastAnim(npc, "stroke");
    playCastAnim(G.player, "pickup");
    sayOverhead(npc, "Purrrr....");
    chat("You stroke Crassus. He purrs contentedly.", "game");
  }, sideReachTest(Math.floor(npc.x), Math.floor(npc.z)));
  return true;
}

/* The flax field's crop (world.js places the field by the cow pen): the cache's
   own "Pick" (loc 2646). One pick per plant, then the plant is gone until it
   grows back on the depleted clock - the same shape as a felled tree, except
   the picked plant draws nothing at all (scene.js#_locSpec). */
const FLAX_REGROW_MIN = 20, FLAX_REGROW_VAR = 20;

export function pickFlax(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "flax") return false;
  /* Answered on arrival (the user's NSEW rule): the click walks to a side
     face first, where the refusal fires faced at the plant. */
  approach(tx, tz, () => attemptPickFlax(tx, tz), sideReachTest(tx, tz));
  return true;
}

function attemptPickFlax(tx, tz) {
  const ps = G.ps;
  const w = G.world;
  const o = w.objAt(tx, tz);
  if (!o || o.t !== "flax") return;
  faceTarget(G.player, tx, tz);
  if (o.picked) {
    chat("There is no flax here at the moment.", "game");
    return;
  }
  if (invFree(ps) < 1 && !invCount(ps, "flax")) {
    chat("You don't have enough inventory space.", "warn");
    return;
  }
  workAnim("pickup");
  invAdd(ps, "flax", 1);
  mark("inv");
  o.picked = true;
  w.setObj(tx, tz, o);
  G.view.rebuildChunkAt(tx, tz);
  const regrow = FLAX_REGROW_MIN + Math.random() * FLAX_REGROW_VAR;
  Actions.depleted.push({ x: tx, z: tz, at: (G.time || 0) + regrow, kind: "flax" });
  reportLoc(tx, tz, regrow);
  chat("You pick some flax.", "game");
}

/* The spinning wheel's own option (world.js places one in the town's clothes
   shop and gives the tile `{ t: "wheel" }`). */
export function spinAt(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "wheel") return false;
  /* The menu answers "nothing to spin" on arrival; the walk comes first and
     only knows the four sides (the user's NSEW rule). */
  approach(tx, tz, () => openSpinMenu(tx, tz), sideReachTest(tx, tz));
  return true;
}

/* The wheel's window: every thread this world can make from what is in the
   pack, each slot carrying the level and the experience the game's own recipe
   tables give it. A row the player cannot spin yet stays on the list and
   refuses on the click - the same choice the stalls and the rocks make, since
   a menu that silently changes shape teaches nothing. */
function openSpinMenu(tx, tz) {
  const ps = G.ps;
  openModal("What would you like to spin?", (body) => {
    let any = false;
    const grid = mkEl("div", "shopGrid");
    for (const r of SPIN_RECIPES) {
      const have = invCount(ps, r.from);
      if (!have) continue;
      any = true;
      const can = skillLvl("crafting") >= r.level;
      const d = mkEl("div", "slot");
      const img = mkEl("img");
      img.src = iconUrl(r.to, 44);
      img.draggable = false;
      img.alt = itemName(r.to);
      d.appendChild(img);
      d.appendChild(mkEl("span", "qty", "x" + have));
      d.title = can
        ? itemName(r.from) + " into " + itemName(r.to).toLowerCase() + " - Crafting " + r.level + ", " + r.xp + " xp each"
        : "You need a Crafting level of " + r.level + " to spin " + itemName(r.from).toLowerCase() + ".";
      d.addEventListener("click", () => {
        closeModal();
        startSpin(r, tx, tz);
      });
      grid.appendChild(d);
    }
    if (!any) body.appendChild(mkEl("div", "note", "You have nothing to spin."));
    body.appendChild(grid);
  });
}

function startSpin(r, tx, tz) {
  const ps = G.ps;
  if (skillLvl("crafting") < r.level) {
    chat("You need a Crafting level of " + r.level + " to spin " + itemName(r.from).toLowerCase() + ".", "warn");
    return;
  }
  if (invCount(ps, r.from) < 1) {
    chat("You have no " + itemName(r.from).toLowerCase() + " to spin.", "warn");
    return;
  }
  begin("spin", tx, tz, { from: r.from, to: r.to, level: r.level, xp: r.xp });
}

function attemptSpin(act) {
  const ps = G.ps;
  const r = act.data;
  if (skillLvl("crafting") < r.level) {
    return stopMsg("You need a Crafting level of " + r.level + " to spin " + itemName(r.from).toLowerCase() + ".");
  }
  if (invCount(ps, r.from) < 1) return stopMsg("You have run out of " + itemName(r.from).toLowerCase() + ".");
  /* A full pack refuses before the material is taken - unless taking it frees
     the slot the product needs (a non-stackable material does; a stackable one
     never does, which is how 4 wool were spun into 0 balls with a full pack).
     Verified live both ways. */
  if (invFree(ps) + (isStackable(r.from) ? 0 : 1) < 1 && !invCount(ps, r.to))
    return stopMsg("You don't have enough inventory space.");
  invRemove(ps, r.from, 1);
  invAdd(ps, r.to, 1);
  addXp(ps, "crafting", r.xp);
  mark("inv");
  workAnim("spin");
  chat("You spin the " + itemName(r.from).toLowerCase() + " into " +
    (r.to === "ball_of_wool" ? "a ball of wool." : "a bow string."), "game");
  act.timer = 3;
}

/* --------------------------------------------------------------- pottery

   Soft clay shaped on a potter's wheel, fired in a pottery oven. Both steps
   pay experience (src/items.js#POTTERY_SHAPE / #POTTERY_FIRE), the wheel is
   the cache's own Potter's Wheel (loc 2642, no actions - soft clay is used on
   it) and the oven the cache's Pottery Oven (loc 2643, "Fire" - an unfired
   piece is used on it). The poses are the pack's own: `pot` is
   HUMAN_POTTERYWHEEL (883); firing plays none, which is the live game too. */

export function potAt(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "potwheel") return false;
  /* The clay is answered on arrival (the user's NSEW rule): the click walks
     to a side face first, and the window only opens for carried soft clay. */
  approach(tx, tz, () => {
    if (!invCount(G.ps, "soft_clay")) { chat("You need soft clay to shape on the wheel.", "warn"); return; }
    openPotMenu(tx, tz);
  }, sideReachTest(tx, tz));
  return true;
}

function openPotMenu(tx, tz) {
  const ps = G.ps;
  openModal("What would you like to make?", (body) => {
    if (!invCount(ps, "soft_clay")) {
      body.appendChild(mkEl("div", "note", "You need soft clay to shape on the wheel."));
      return;
    }
    const grid = mkEl("div", "shopGrid");
    for (const r of POTTERY_SHAPE) {
      const can = skillLvl("crafting") >= r.level;
      const d = mkEl("div", "slot");
      const img = mkEl("img");
      img.src = iconUrl(r.id, 44);
      img.draggable = false;
      img.alt = itemName(r.id);
      d.appendChild(img);
      d.appendChild(mkEl("span", "qty", "x" + invCount(ps, "soft_clay")));
      d.title = can
        ? itemName(r.id) + " - Crafting " + r.level + ", " + r.xp + " xp shaping"
        : "You need a Crafting level of " + r.level + " to shape " + itemName(r.id).toLowerCase() + ".";
      d.addEventListener("click", () => {
        closeModal();
        startShape(r, tx, tz);
      });
      grid.appendChild(d);
    }
    body.appendChild(grid);
  });
}

function startShape(r, tx, tz) {
  const ps = G.ps;
  if (skillLvl("crafting") < r.level) {
    chat("You need a Crafting level of " + r.level + " to shape " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (invCount(ps, "soft_clay") < 1) {
    chat("You have no soft clay to shape.", "warn");
    return;
  }
  begin("potshape", tx, tz, { id: r.id, level: r.level, xp: r.xp });
}

function attemptShape(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "potwheel") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "potwheel", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't shape clay here.");
  }
  const ps = G.ps;
  const d = act.data;
  if (skillLvl("crafting") < d.level) return stopMsg("You need a Crafting level of " + d.level + " to shape that.");
  if (invCount(ps, "soft_clay") < 1) return stopMsg("You have run out of soft clay.");
  if (!isStackable(d.id) && invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
  invRemove(ps, "soft_clay", 1);
  invAdd(ps, d.id, 1);
  addXp(ps, "crafting", d.xp);
  mark("inv");
  workAnim("pot");
  chat("You shape the soft clay into " + withArticle(itemName(d.id).toLowerCase().replace("unfired ", "")) + ".", "game");
  act.timer = 3;
}

/* An unfired piece used on the pottery oven: one piece per firing, the
   oven's own tick. No pose - the live game fires by hand with none. */
export function firePottery(tx, tz, unfId) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "potoven") return false;
  begin("potfire", tx, tz, { unf: unfId });
  return true;
}

function attemptFirePot(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "potoven") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "potoven", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't fire pottery here.");
  }
  const ps = G.ps;
  const r = POTTERY_FIRE[act.data.unf];
  if (!r) return stopMsg("That will not fire into anything.");
  if (skillLvl("crafting") < r.level) return stopMsg("You need a Crafting level of " + r.level + " to fire that.");
  if (invCount(ps, act.data.unf) < 1) return stopMsg("You have run out of unfired pieces.");
  if (!isStackable(r.id) && invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
  invRemove(ps, act.data.unf, 1);
  invAdd(ps, r.id, 1);
  addXp(ps, "crafting", r.xp);
  mark("inv");
  chat("You fire the clay in the oven.", "game");
  act.timer = 3;
}

/* The oven's firing window: every unfired piece carried, each slot naming
   the level and the firing experience, the wheel's shaping window again. */
function openFireMenu(tx, tz) {
  const ps = G.ps;
  openModal("What would you like to fire?", (body) => {
    const ids = Object.keys(POTTERY_FIRE).filter((u) => invCount(ps, u));
    if (!ids.length) {
      body.appendChild(mkEl("div", "note", "You need an unfired piece to fire in the oven."));
      return;
    }
    const grid = mkEl("div", "shopGrid");
    for (const u of ids) {
      const r = POTTERY_FIRE[u];
      const can = skillLvl("crafting") >= r.level;
      const d = mkEl("div", "slot");
      const img = mkEl("img");
      img.src = iconUrl(u, 44);
      img.draggable = false;
      img.alt = itemName(u);
      d.appendChild(img);
      d.appendChild(mkEl("span", "qty", "x" + invCount(ps, u)));
      d.title = can
        ? itemName(r.id) + " - Crafting " + r.level + ", " + r.xp + " xp firing"
        : "You need a Crafting level of " + r.level + " to fire " + itemName(u).toLowerCase() + ".";
      d.addEventListener("click", () => {
        closeModal();
        approach(tx, tz, () => firePottery(tx, tz, u), sideReachTest(tx, tz));
      });
      grid.appendChild(d);
    }
    body.appendChild(grid);
  });
}

/* --------------------------------------------------------------- glassblowing

   A bucket of sand and soda ash smelted at a furnace (20 Crafting, the bucket
   comes back empty), then a glassblowing pipe used on the molten glass. The
   smelt plays the furnace's own pose; the blowing plays the pack's own
   HUMAN_GLASSBLOWING (884). Levels and experience are the wiki's own
   (src/items.js#GLASSBLOWING). */

export function moltenGlassAt(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "furnace") return false;
  begin("moltenglass", tx, tz, { reachTestOf: () => furnaceMouthTest(), inReach: true });
  faceFurnace(G.player);
  return true;
}

function attemptMolten(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  if (!o || o.t !== "furnace") {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "furnace", 10);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't make glass here.");
  }
  const ps = G.ps;
  if (!invCount(ps, "bucket_of_sand")) return stopMsg("You need a bucket of sand to make glass.");
  if (!invCount(ps, "soda_ash")) return stopMsg("You need soda ash to make glass.");
  invRemove(ps, "bucket_of_sand", 1);
  invRemove(ps, "soda_ash", 1);
  invAdd(ps, "bucket", 1);
  invAdd(ps, "molten_glass", 1);
  addXp(ps, "crafting", 20);
  mark("inv");
  workAnim("smelt_furnace");
  chat("You heat the sand and soda ash in the furnace.", "game");
  act.timer = 3;
}

/* The glassblowing screen ("What would you like to blow?"): the anvil
   screen's twin (src/actions.js#openSmithMenu) - a packed grid of item rows,
   icon, name, green glass cost, and the 1 / 5 / 10 / X / All buttons down the
   right side. The set quantity button shows white and is remembered across
   visits under its own key; a left-click blows the picked row in that
   quantity, a right-click names its own (Make 1 / 5 / 10 / X / All, X asking
   through the chatbox amount prompt). Rows below the level or short on molten
   glass show greyed with the reason. */
const GLASS_GRID = [
  ["beer_glass", "empty_candle_lantern", "oil_lamp", "vial"],
  ["fishbowl", "unpowered_orb", "lantern_lens", "empty_light_orb"],
];
const GLASS_QTYS = [1, 5, 10, "X", "All"];
const GLASS_QTY_KEY = "glassQty";
let glassQtySel = 1;
let glassPick = null;

export function openGlassMenu() {
  const ps = G.ps;
  const lvl = skillLvl("crafting");
  const byId = new Map();
  for (const r of GLASSBLOWING) byId.set(r.id, r);
  const start = (n) => {
    const r = glassPick && byId.get(glassPick);
    if (!r) return;
    const max = invCount(ps, "molten_glass");
    if (max < 1) { chat("You have run out of molten glass.", "warn"); return; }
    closeModal();
    startBlow(r, Math.max(1, Math.min(n, max)));
  };
  /* Left-click blows the picked row in the set quantity; the right-click menu
     names its own. */
  const startQty = (q) => {
    if (q === "X") { if (!glassPick) return; closeModal(); openAmountPrompt("make", 0, { cb: (n) => { glassPick && start(n || 1); } }); return; }
    if (q === "All") return start(1e9);
    start(q);
  };
  glassPick = null;
  let paintQty = null;
  let saveScroll = null;
  openModal("What would you like to blow?", (body) => {
    const have = invCount(ps, "molten_glass");
    const wrap = mkEl("div", "glassWrap");
    const grid = mkEl("div", "glassGrid");
    for (const row of GLASS_GRID) {
      for (const id of row) {
        const cell = mkEl("div", "glassCell");
        const r = byId.get(id);
        if (!id || !r || !ITEMS[id]) { cell.classList.add("empty"); grid.appendChild(cell); continue; }
        const short = r.level > lvl ? "Requires " + r.level + " Crafting to blow " + itemName(id).toLowerCase() + "." : have < 1 ? "You need molten glass to blow " + itemName(id).toLowerCase() + "." : null;
        const iconWrap = mkEl("div", "glassIconWrap");
        const img = mkEl("img", "glassIcon");
        img.src = iconUrl(id, 32);
        img.draggable = false;
        img.alt = itemName(id);
        iconWrap.appendChild(img);
        cell.appendChild(iconWrap);
        cell.appendChild(mkEl("div", "glassName", itemName(id)));
        const costEl = mkEl("div", "glassCost", "1 glass");
        /* Short on the cost of even one: the green cost reads red, alongside
           the row's greyed dimming. */
        if (have < 1) costEl.classList.add("need");
        cell.appendChild(costEl);
        if (short) {
          cell.classList.add("dim");
          cell.title = short;
        } else {
          cell.title = itemName(id) + " - Crafting " + r.level + ", " + r.xp + " xp each";
          cell.addEventListener("click", () => {
            glassPick = id;
            startQty(glassQtySel);
          });
          cell.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            glassPick = id;
            openCtx(ev.clientX, ev.clientY, itemName(id), [
              { label: "Make 1", fn: () => start(1) },
              { label: "Make 5", fn: () => start(5) },
              { label: "Make 10", fn: () => start(10) },
              { label: "Make X", fn: () => startQty("X") },
              { label: "Make All", fn: () => start(1e9) },
              { label: "Cancel", fn: () => {} },
            ]);
          });
        }
        grid.appendChild(cell);
      }
    }
    wrap.appendChild(grid);
    const side = mkEl("div", "glassSide");
    const btns = new Map();
    paintQty = () => {
      for (const [q, b] of btns) b.classList.toggle("sel", q === glassQtySel);
      /* Class flips are not DOM mutations, so the text painter (src/sharp.js)
         is blind to them - without this the set button's white never paints
         (the same reason a hovered context-menu row needs its pointer events).
         This is the same call the bank's own scroll state makes. */
      refreshSharpText();
    };
    for (const q of GLASS_QTYS) {
      const b = mkEl("button", "glassBtn", String(q));
      b.title = q === "X" ? "Make a set amount" : q === "All" ? "Make all you can" : "Make " + q;
      b.addEventListener("click", () => {
        glassQtySel = q;
        storeGlassQty(q);
        paintQty();
      });
      btns.set(q, b);
      side.appendChild(b);
    }
    wrap.appendChild(side);
    body.appendChild(wrap);
    fitGridRows(wrap, grid);
    paintQty();
    loadGlassQty().then(paintQty);
    saveScroll = persistScroll(body, "glassScroll");
    const head = UI.els.modalBox.querySelector(".cHead");
    if (head && !head.querySelector(".glassX")) {
      const xBtn = mkEl("button", "glassX", "X");
      xBtn.addEventListener("click", closeModal);
      head.appendChild(xBtn);
    }
  }, [], { boxClass: "glassBox", onClose: () => { if (saveScroll) saveScroll(); } });
}

/* The set make-quantity on the glass screen's side buttons (1 / 5 / 10 / X /
   All): white text marks the set one, and the choice is remembered in the
   world's own storage under its own key so it never trades places with the
   anvil's. The menu reads the cached value synchronously and refreshes it
   behind the open screen when storage answers, so a slow store never holds
   the screen up. */
function loadGlassQty() {
  const folder = smithKv();
  if (!folder) return Promise.resolve();
  return folder.get(GLASS_QTY_KEY).then((v) => {
    if (GLASS_QTYS.includes(v)) glassQtySel = v;
  }).catch(() => {});
}
function storeGlassQty(q) {
  const folder = smithKv();
  if (!folder) return;
  folder.set(GLASS_QTY_KEY, q).catch(() => {});
}

function startBlow(r, left) {
  const ps = G.ps;
  if (skillLvl("crafting") < r.level) {
    chat("You need a Crafting level of " + r.level + " to blow " + itemName(r.id).toLowerCase() + ".", "warn");
    return;
  }
  if (!invCount(ps, "glassblowing_pipe")) { chat("You need a glassblowing pipe to blow glass.", "warn"); return; }
  if (invCount(ps, "molten_glass") < 1) { chat("You have no molten glass to blow.", "warn"); return; }
  if (Actions.act && Actions.act.kind === "glassblow" && Actions.act.data.id === r.id) return;
  begin("glassblow", Math.floor(G.player.x), Math.floor(G.player.z), { id: r.id, level: r.level, xp: r.xp, left: left == null ? null : Math.max(1, left), noFace: true });
}

function attemptBlow(act) {
  const ps = G.ps;
  const d = act.data;
  if (d.left != null && d.left <= 0) { cancelAction(); return; }
  if (skillLvl("crafting") < d.level) return stopMsg("You need a Crafting level of " + d.level + " to blow that.");
  if (!invCount(ps, "glassblowing_pipe")) return stopMsg("You need a glassblowing pipe to blow glass.");
  if (invCount(ps, "molten_glass") < 1) return stopMsg("You have run out of molten glass.");
  if (!isStackable(d.id) && invFreeSlots() < 1) return stopMsg("You need a free inventory slot.");
  invRemove(ps, "molten_glass", 1);
  invAdd(ps, d.id, 1);
  addXp(ps, "crafting", d.xp);
  mark("inv");
  workAnim("glassblow");
  chat("You blow the molten glass into " + withArticle(itemName(d.id).toLowerCase()) + ".", "game");
  if (d.left != null) {
    d.left--;
    if (d.left <= 0) return;
  }
  act.timer = 3;
}

/* --------------------------------------------------------------- herblore

   The skill's three clicks, each where the client puts it:

   * **Clean** - a right-click on a grimy herb, exactly the option the client
     offers. It is instant and it grants the herb's own cleaning experience
     (src/items.js#HERB_TABLE); the herb changes in the slot it occupies.
   * **Mix** - a right-click shortcut for the client's own use-withs, which
     this world now also has in full (src/actions.js#useOnInv): a clean herb
     with a vial of water in the pack offers "Mix" (no experience - an
     unfinished potion is worth nothing), an unfinished potion with its
     secondary in the pack offers "Mix" again for the finished potion's own
     experience and three doses, and the two coconut-milk poisons add a third
     shape - a cactus spine or a cave nightshade with its vial of coconut milk
     opens the vial, and the unfinished potion it leaves then takes its second
     ingredient. The right-click is kept beside the use-with because it is how
     the skill is *found*: nothing on a grimy herb says which vial it wants.
   * **Grind** - the pestle and mortar on anything with a `crushTo` (a unicorn
     horn, a dragon scale, a chocolate bar). No experience, two ticks, the
     cache's own `human_herbing_grind` pose.

   Because there is no use-with mode, the herbalist also keeps a "Mix potions"
   option that lists every recipe the player can currently make (see
   src/actions.js#openHerbMenu) - the same modal the anvil and the tanner use,
   which is how the rest of the skills in this build reach their windows. That
   option is this world's convenience and is not a client action.

   Mixing repeats while the ingredients last, on the same three-tick beat as
   smithing and leather working (the client makes one per click; a stack of
   grimy herbs is no fun to click twenty times). Nothing is invented about the
   numbers - the levels, the experience and the doses are all the wiki's. */

const POTION_BY_ID = {};
const UNF_TO_POTION = {};
for (const p of POTIONS) {
  POTION_BY_ID[p.id] = p;
  /* The unfinished potion this row's second ingredient finishes. For the
     fourteen herb potions it is the herb's own unf item; the two coconut-milk
     weapon poisons have no herb, so their rows name it themselves (see
     src/items.js#POTIONS' `unf`). */
  const unf = p.unf || (HERBS[p.herb] && HERBS[p.herb].unfId);
  if (unf) UNF_TO_POTION[unf] = p;
}

/* The ingredient a coconut-milk vial is *opened* with - a cactus spine for the
   weapon poison(+), a cave nightshade for the (++) - each mapping to the potion
   row it belongs to. Nothing else in the skill works this way: a herb potion
   has one ingredient and a vial of water, where these have two ingredients and
   a vial of coconut milk. */
const FIRST_TO_POTION = {};
for (const p of POTIONS) {
  if (p.first) FIRST_TO_POTION[p.first] = p;
}

/* The item a potion row's mixing produces: the (3) for the ordinary potions,
   and the whole vial for weapon poison, which the client sells as a single
   dose and therefore has no (1)/(2)/(3) family (src/items.js#POTIONS). */
function potionProduct(p) {
  return p.doses === 1 ? p.id : p.id + "_3";
}

/* Every unfinished potion the pack can make right now: a clean herb and a vial
   of water, at the herb's own unfinished level. */
export function mixableUnf(ps) {
  const out = [];
  if (invCount(ps, "vial_of_water")) {
    for (const [id, h] of Object.entries(HERBS)) {
      if (invCount(ps, id) < 1) continue;
      out.push({ stage: "unf", herb: id, unf: h.unfId, level: h.unfLevel });
    }
  }
  /* The two coconut-milk poisons open their vial with a *first* ingredient
     rather than a herb (src/items.js#POTIONS' base/first/unf), so they are a
     stage of their own - the only recipes in the skill that are two
     ingredient-steps rather than one. */
  for (const p of POTIONS) {
    if (!p.base || !p.first) continue;
    if (invCount(ps, p.base) < 1 || invCount(ps, p.first) < 1) continue;
    out.push({ stage: "base", potion: p.id, base: p.base, first: p.first, unf: p.unf, level: p.level });
  }
  return out;
}

/* Every finished potion the pack can make right now: the unf potion and the
   row's own secondary. */
export function mixablePotions(ps) {
  const out = [];
  for (const p of POTIONS) {
    const unf = p.unf || (HERBS[p.herb] && HERBS[p.herb].unfId);
    if (!unf) continue;
    if (invCount(ps, unf) < 1 || invCount(ps, p.secondary) < 1) continue;
    out.push({ stage: "potion", potion: p.id, unf, level: p.level, xp: p.xp });
  }
  return out;
}

function startMix(data) {
  begin("mix", Math.floor(G.player.x), Math.floor(G.player.z), Object.assign({ noFace: true }, data));
}

/* A right-click "Clean": the herb becomes its clean self in place. */
export function cleanHerb(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d || !d.cleanTo) { chat("You can't clean that.", "warn"); return; }
  if (skillLvl("herblore") < d.cleanLevel) {
    chat("You need a Herblore level of " + d.cleanLevel + " to clean this herb.", "warn");
    return;
  }
  ps.inv[invIndex] = { id: d.cleanTo, qty: 1 };
  addXp(ps, "herblore", d.cleanXp);
  mark("inv");
  chat("You clean the " + itemName(s.id).toLowerCase() + ".", "game");
}

/* A right-click "Mix" on a clean herb with a vial of water, or on an unf
   potion with its secondary. Both walk into the same action. */
export function mixHerb(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d) return;
  if (d.unf) {
    if (!invCount(ps, "vial_of_water")) { chat("You need a vial of water to mix that in.", "warn"); return; }
    startMix({ stage: "unf", herb: s.id, unf: d.unf, level: d.unfLevel });
    return;
  }
  if (d.potionHerb) {
    const p = UNF_TO_POTION[s.id];
    if (!p) { chat("You can't mix that.", "warn"); return; }
    if (invCount(ps, p.secondary) < 1) {
      chat("You need " + itemName(p.secondary).toLowerCase() + " to finish this potion.", "warn");
      return;
    }
    startMix({ stage: "potion", potion: p.id, unf: s.id, level: p.level, xp: p.xp });
    return;
  }
  /* The first ingredient of a coconut-milk potion - a cactus spine or a cave
     nightshade - with its vial in the pack: the opening step, which pays no
     experience (src/actions.js#attemptMix's `base` stage). */
  const p = FIRST_TO_POTION[s.id];
  if (p) {
    if (invCount(ps, p.base) < 1) {
      chat("You need a vial of " + itemName(p.base).toLowerCase() + " to mix that in.", "warn");
      return;
    }
    startMix({ stage: "base", potion: p.id, base: p.base, first: s.id, unf: p.unf, level: p.level });
    return;
  }
  chat("You can't mix that.", "warn");
}

export function grindItem(invIndex) {
  const ps = G.ps;
  const s = ps.inv[invIndex];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d || !d.crushTo) { chat("You can't grind that.", "warn"); return; }
  if (!invCount(ps, "pestle_and_mortar")) {
    chat("You need a pestle and mortar to grind that.", "warn");
    return;
  }
  begin("grind", Math.floor(G.player.x), Math.floor(G.player.z), { from: s.id, noFace: true });
}

function attemptMix(act) {
  const ps = G.ps;
  const d = act.data;
  if (d.stage === "unf") {
    const h = HERBS[d.herb];
    if (!h) return cancelAction();
    if (skillLvl("herblore") < h.unfLevel) {
      return stopMsg("You need a Herblore level of " + h.unfLevel + " to mix this potion.");
    }
    if (invCount(ps, d.herb) < 1) return stopMsg("You have run out of " + itemName(d.herb).toLowerCase() + ".");
    if (invCount(ps, "vial_of_water") < 1) return stopMsg("You have run out of vials of water.");
    invRemove(ps, d.herb, 1);
    invRemove(ps, "vial_of_water", 1);
    invAdd(ps, h.unfId, 1);
    mark("inv");
    workAnim("herb_mix");
    chat("You mix the " + itemName(d.herb).toLowerCase() + " into the vial of water.", "game");
    /* three ticks a potion, the same beat smithing and leather working use */
    act.timer = 3;
    return;
  }
  const p = POTION_BY_ID[d.potion];
  if (!p) return cancelAction();
  if (skillLvl("herblore") < p.level) {
    return stopMsg("You need a Herblore level of " + p.level + " to mix this potion.");
  }
  /* The opening step of a coconut-milk potion: the first ingredient and the
     vial it goes into, which leaves the unfinished potion and pays no
     experience at all - only the second ingredient's step does (190 xp for
     both weapon poisons, the potion rows' own). Both items are spent and the
     unfinished potion takes their place, and the beat repeats while the pack
     still has another pair, exactly as the other two stages do. */
  if (d.stage === "base") {
    if (!p.base || !d.first) return cancelAction();
    if (invCount(ps, d.base) < 1) return stopMsg("You have run out of vials of " + itemName(p.base).toLowerCase() + ".");
    if (invCount(ps, d.first) < 1) return stopMsg("You have run out of " + itemName(d.first).toLowerCase() + ".");
    invRemove(ps, d.base, 1);
    invRemove(ps, d.first, 1);
    invAdd(ps, p.unf, 1);
    mark("inv");
    workAnim("herb_mix");
    chat("You mix the " + itemName(d.first).toLowerCase() + " into the vial of " + itemName(p.base).toLowerCase() + ".", "game");
    act.timer = 3;
    return;
  }
  if (invCount(ps, d.unf) < 1) return stopMsg("You have run out of " + itemName(d.unf).toLowerCase() + ".");
  if (invCount(ps, p.secondary) < 1) return stopMsg("You have run out of " + itemName(p.secondary).toLowerCase() + ".");
  invRemove(ps, d.unf, 1);
  invRemove(ps, p.secondary, 1);
  invAdd(ps, potionProduct(p), 1);
  addXp(ps, "herblore", p.xp);
  mark("inv");
  workAnim("herb_mix");
  chat("You mix the " + itemName(p.secondary).toLowerCase() + " into your unfinished potion.", "game");
  act.timer = 3;
}

function attemptGrind(act) {
  const ps = G.ps;
  const d = act.data;
  if (!invCount(ps, "pestle_and_mortar")) return stopMsg("You need a pestle and mortar to grind that.");
  if (invCount(ps, d.from) < 1) return stopMsg("You have run out of " + itemName(d.from).toLowerCase() + ".");
  const to = ITEMS[d.from].crushTo;
  invRemove(ps, d.from, 1);
  invAdd(ps, to, 1);
  mark("inv");
  workAnim("herb_grind");
  chat("You grind the " + itemName(d.from).toLowerCase() + " into " + itemName(to).toLowerCase() + ".", "game");
  act.timer = 2;
}

/* The herbalist's window: every recipe the pack can make right now, in the two
   stages the skill actually has (a clean herb and a vial of water, then the
   unfinished potion and its secondary), each slot carrying its level and its
   experience so the menu teaches the skill the way the guide does. */
export function openHerbMenu() {
  const ps = G.ps;
  openModal("What would you like to make?", (body) => {
    const unfs = mixableUnf(ps);
    const pots = mixablePotions(ps);
    if (!unfs.length && !pots.length) {
      body.appendChild(mkEl("div", "note", "You have nothing to mix. Bring clean herbs and vials of water, or unfinished potions and their secondaries."));
      return;
    }
    const section = (title, rows, make) => {
      if (!rows.length) return;
      body.appendChild(mkEl("div", "note", title));
      const grid = mkEl("div", "shopGrid");
      for (const r of rows) {
        const d = mkEl("div", "slot");
        const img = mkEl("img");
        img.src = iconUrl(make(r).id, 44);
        img.draggable = false;
        img.alt = itemName(make(r).id);
        d.appendChild(img);
        d.appendChild(mkEl("span", "qty", "x" + make(r).qty));
        d.title = itemName(make(r).id) + " - level " + r.level + (r.xp ? ", " + r.xp + " xp" : ", no experience");
        d.addEventListener("click", () => {
          closeModal();
          startMix(r);
        });
        grid.appendChild(d);
      }
      body.appendChild(grid);
    };
    /* The two stages of the skill are shown as the three shapes they actually
       have: a herb into a vial of water, a first ingredient into a vial of
       coconut milk (the two weapon poisons), and an unfinished potion into its
       second ingredient. */
    section("Unfinished potions (no experience)", unfs.filter((r) => r.stage === "unf"), (r) => ({ id: r.unf, qty: Math.min(invCount(ps, r.herb), invCount(ps, "vial_of_water")) }));
    section("Coconut milk potions (no experience)", unfs.filter((r) => r.stage === "base"), (r) => ({ id: r.unf, qty: Math.min(invCount(ps, r.first), invCount(ps, r.base)) }));
    section("Potions", pots, (r) => ({ id: potionProduct(POTION_BY_ID[r.potion]), qty: Math.min(invCount(ps, r.unf), invCount(ps, POTION_BY_ID[r.potion].secondary)) }));
  });
}

/* --------------------------------------------------------------- pickup

   A pickup is paced by the tick, like every other activity - by a *fast* tick.
   `attemptTake` takes `TAKE_PER_TICK` items of the clicked kind off the tile in
   the tick it runs and
   re-arms a one-tick timer, so a pile empties at two items per 600ms. That is the
   middle the user asked for on 2026-09-22: the original was one item per
   *three*-tick (1.8s) timer, which is too slow - *"picking up items should not
   be locked by ticks ... you should be able to click and pick up many very
   rapidly"* - and the frame-paced drain that first answered it was too fast:
   *"picked it up way too quickly, it does in fact need to be tick based, but i
   think maybe you should be able to pick them up at a rate of 2 per tick"*. The
   click still starts the act promptly: `takeGround` marks it `inReach`, and
   `begin` skips the no-op walk tick when the target is already within reach. */

const TAKE_PER_TICK = 2;

export function takeGround(x, z, id) {
  /* Drops live on the ground level (see `groundItemsAt`): upstairs there is
     nothing to pick up, so the click falls through to a walk (which itself
     goes nowhere off the upper floor). */
  if (G && G.player && (G.player.plane || 0) !== 0) return false;
  const pile = groundItemsAt(x, z);
  if (!pile.length) return false;
  const targetId = id || pile[pile.length - 1].id;
  if (!pile.some((g) => g.id === targetId)) return false;
  /* Already taking this exact kind off this exact tile: leave it be, so
     re-clicking a pile does not restart its walk-in or its timer. */
  if (Actions.act && Actions.act.kind === "take" && Actions.act.x === x && Actions.act.z === z &&
    Actions.act.data && Actions.act.data.targetId === targetId) return true;
  /* The walk ends on the pile itself when the player is already standing on
     it: the reach is the tile plus its four side faces (the user's rule,
     2026-10-07 - a pickup must not step off the tile it is standing on), so
     a click from across the room still walks in while the standing click
     starts work at once. `inReach` is the pile's own tile only (the user's
     rule, 2026-10-09): from a side tile the walk-in still runs, onto the pile.
     The pack is answered per item on arrival, so a pile you can only half
     carry still gives you the half that fits. */
  const ppx = Math.round(G.player.x - 0.5), ppz = Math.round(G.player.z - 0.5);
  begin("take", x, z, { inReach: ppx === x && ppz === z, targetId, walkTest: (px, pz) => px === x && pz === z, reachTest: (px, pz) =>
    Math.abs(px - x) + Math.abs(pz - z) <= 1 && ((px === x && pz === z) || G.world.isWalkable(px, pz)) });
  return true;
}

/* Take one drop of the targeted kind off a tile and answer whether anything
   came up: the one body of a pickup. The pack is refused *per item* here
   rather than up front on the click, so a pile you can only half carry still
   gives you the half that fits. */
function takeOne(x, z, id) {
  const ps = G.ps;
  const arr = groundItemsAt(x, z);
  const g = id ? arr.find((o) => o.id === id) : arr[arr.length - 1];
  if (!g) return false;
  if (!isStackable(g.id) && invFree(ps) < 1) { chat("You don't have enough inventory space.", "warn"); return false; }
  const want = isStackable(g.id) ? g.qty : Math.min(g.qty, invFree(ps));
  const got = invAdd(ps, g.id, want);
  if (!got) { chat("You don't have enough inventory space.", "warn"); return false; }
  workAnim("pickup");
  g.qty -= got;
  if (g.qty <= 0) removeGround(g);
  else { syncGroundMesh(g); noteGround(g.x, g.z, g.id, g.qty + got); }
  trackGroundTake(g.x, g.z, g.id, got);
  mark("inv");
  chat("You pick up the " + itemName(g.id).toLowerCase() + (got > 1 ? " x" + got : "") + ".", "you");
  return true;
}

/* One tick of a pickup: up to `TAKE_PER_TICK` items of the clicked kind, then a
   single tick to the next pair. It stops - and ends the act - the moment no more
   of that kind is left on the tile or the
   pack has no room for the next item, so a full pack is refused once rather than
   on every tick it has something to say. */
function attemptTake(act) {
  const id = act.data && act.data.targetId;
  for (let n = 0; n < TAKE_PER_TICK; n++) {
    if (!takeOne(act.x, act.z, id)) { cancelAction(); return; }
    if (!groundItemsAt(act.x, act.z).some((g) => !id || g.id === id)) { cancelAction(); return; }
  }
  act.timer = 1;
}

/* --------------------------------------------------------------- thieving

   The two halves of the Thieving skill (src/PLAN.md unit Q), both driven off
   the tables in src/items.js#PICKPOCKET / #STALLS.

   A stall is the 2x2 loc the market square carries (src/world.js). All four of
   its tiles hold the same world object, so a theft has to bare all four at once
   and restock them together - `stallTiles` is the only place that decides what
   "the stall" means. The theft itself is a single work step, pays one weighted
   pull off the stall's own loot row, and leaves the bare frame standing until
   its published respawn has passed, on the same `Actions.depleted` clock ore
   and trees use.

   Pickpocketing is a roll, not a certainty. The wiki publishes the level a
   target needs and the level at which it stops failing (src/items.js#PICKPOCKET
   carries both), but not the curve between them, so the chance here is a
   straight line across that span - the one invented number in the skill. A
   failure is a real blow: the target turns and hits the thief for its published
   stun damage and roots them for the published nine ticks of movement (eight
   before the next attempt, which is the shorter of the two timers). */

/* Every tile one stall stands on. A stall is the cache's 2x2 loc (see
   src/world.js#stalls), so it is placed on a 2x2 block of tiles that all carry
   the same object - the four halves of one stall and never two stalls, because
   the row leaves a tile of street between neighbours. The walk is a flood fill
   over the block rather than a ring of neighbours: the tile diagonally opposite
   the clicked one is not a neighbour of it, so a one-step scan would leave that
   corner standing full while the rest of the stall emptied. */
function stallTiles(x, z, kind) {
  const w = G.world;
  const seen = new Set([x + "," + z]);
  const out = [];
  const queue = [[x, z]];
  while (queue.length) {
    const [cx, cz] = queue.shift();
    out.push([cx, cz]);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz, key = nx + "," + nz;
      if (seen.has(key)) continue;
      const o = w.objAt(nx, nz);
      if (!o || o.t !== "stall" || o.kind !== kind) continue;
      seen.add(key);
      queue.push([nx, nz]);
    }
  }
  return out;
}

/* The tiles a thief may steal from: the four **sides** of the stall's whole
   2x2 block - the ring a rock is mined from, said for a counter (the user's
   ask, 2026-09-23: *"for thieving stalls, same as the rocks and trees, 1 tile
   away adjacent and accessible from any side"*). Before this the click simply
   carried `begin`'s own Chebyshev reach against the one tile that was clicked,
   so which sides worked was an accident of where the nearest-walkable fallback
   happened to drop the player - the north face of every stall, the same fault
   the rocks had. The test is built from the stall's *whole* block rather than
   from the clicked tile, because a stall is one object on four tiles and the
   counter can be reached over from either long face; the walkability half is
   what makes "accessible" true, so a side sealed by a wall or another stall is
   not a goal and the walk-in goes round to a face that can be reached. */
function stallReachTest(rx, rz, kind) {
  const tiles = stallTiles(rx, rz, kind);
  return (x, z) => G.world.isWalkable(x, z)
    && tiles.some(([sx, sz]) => Math.abs(x - sx) + Math.abs(z - sz) === 1);
}

/* One weighted pull off a stall's loot row. */
function rollStallLoot(list) {
  let total = 0;
  for (const row of list) total += row[1];
  let r = Math.random() * total;
  for (const row of list) {
    r -= row[1];
    if (r < 0) return row[0];
  }
  return list[list.length - 1][0];
}

export function stealFrom(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "stall") return false;
  const stall = STALLS[o.kind];
  if (!stall) { chat("You can't work out how to steal from this stall.", "warn"); return true; }
  /* The level and the pack are answered on arrival (the user's NSEW rule -
     see sideReachTest): the click only decides the stall - unknown and
     already-looted answer here - and attemptSteal answers from a side face. */
  if (o.looted) { chat("You have already stolen from this stall.", "warn"); return true; }
  if (Actions.act && Actions.act.kind === "steal" && Actions.act.x === x && Actions.act.z === z) return true;
  /* The reach is the ring around the whole stall, and `reachTestOf` rebuilds it
     for whichever tile `retarget` moves the activity on to - the same shape
     mining uses (`rockReachTest`). `inReach` starts the theft on the spot when
     the player is already standing at a face of the counter. */
  begin("steal", x, z, {
    kind: o.kind,
    reachTestOf: (ax, az) => stallReachTest(ax, az, o.kind),
    inReach: true,
  });
  return true;
}

function attemptSteal(act) {
  const w = G.world;
  const o = w.objAt(act.x, act.z);
  const stall = STALLS[act.data.kind];
  if (!o || o.t !== "stall" || o.kind !== act.data.kind || o.looted) {
    const alt = findObjectNear(act.x, act.z, (q) => q.t === "stall" && q.kind === act.data.kind && !q.looted, 8);
    if (alt) return retarget(act, alt[0], alt[1]);
    return stopMsg("You can't steal from that any more.");
  }
  /* Arrival-gated refusals (the user's NSEW rule): the level and the pack are
     answered from the side face, before the reach-over pose below. */
  if (skillLvl("thieving") < stall.level) {
    return stopMsg("You need a Thieving level of " + stall.level + " to steal from this stall.");
  }
  if (invFreeSlots() < 1) return stopMsg("Your inventory is too full to carry any more loot.");
  /* the reach over the counter - the cache's own `human_pickuptable` (832) */
  playCastAnim(G.player, "pickup_table");
  const id = rollStallLoot(stall.loot);
  invAdd(G.ps, id, 1);
  addXp(G.ps, "thieving", stall.xp);
  mark("inv", "skills");
  chat("You steal " + itemName(id).toLowerCase() + " from the stall.", "game");
  for (const [sx, sz] of stallTiles(act.x, act.z, act.data.kind)) {
    const so = w.objAt(sx, sz);
    if (!so || so.t !== "stall") continue;
    so.looted = true;
    w.setObj(sx, sz, so);
    G.view.rebuildChunkAt(sx, sz);
    Actions.depleted.push({ x: sx, z: sz, at: (G.time || 0) + stall.respawn, kind: "stall" });
    reportLoc(sx, sz, stall.respawn);
  }
  /* A stall in a guard's sight is called in on: the stall owner shouts and the
     nearest guard takes the thief as its target. The published rule is that a
     stall is a certainty only while no owner or guard can see you steal, so the
     market's own two guards are what makes a raid on the street a risk rather
     than free money. The check is a plain distance ring, because this world's
     line of sight is its walkability and a market street has no cover anyway. */
  if (Actions.guardCalled) Actions.guardCalled(act.x, act.z);
  stopMsg(null);
}

/* The published stun: nine ticks rooted to the spot, eight before the next
   attempt. `strikePlayer` is src/combat.js's own blow-lands-on-the-player
   routine, so a pickpocket failure that kills you kills you properly (it is
   installed in initCombat, the same way `npcAttack` and `guardCalled` are). */
function stunPlayer(npc, row) {
  const ps = G.ps;
  ps.stunTicks = PICKPOCKET_STUN_MOVE;
  ps.pickpocketCd = PICKPOCKET_STUN_CD;
  cancelAction();
  /* The flinch the cache authors for being stunned (`848 human_stunned`, baked
     as src/tools/cache-bake/bake.mjs#SKILL_ANIMS.skill_stunned). It is a short
     one-shot, so it plays once as the hand is caught and the thief is left
     standing there for the rest of the freeze. */
  playCastAnim(G.player, "skill_stunned");
  if (Actions.strikePlayer) Actions.strikePlayer(row.stunDamage, npc);
  else {
    Fx.hitsplat(G.player, row.stunDamage);
    ps.hp = Math.max(0, ps.hp - row.stunDamage);
    G.player.hitFlash = 0.3;
  }
  chat(npcDisplayName(npc) + ": What do you think you're doing?", "other");
  chat("You are stunned and cannot move!", "warn");
}

export function pickpocket(npc) {
  if (!npc || npc.dead || !PICKPOCKET[npc.type]) return false;
  const x = Math.floor(npc.x);
  const z = Math.floor(npc.z);
  /* The level is answered on arrival (the user's NSEW rule): the click walks
     to a side face first, where attemptPickpocket answers. */
  approach(x, z, () => attemptPickpocket(npc), sideReachTest(x, z));
  return true;
}

function attemptPickpocket(npc) {
  const ps = G.ps;
  const row = PICKPOCKET[npc.type];
  if (!row || npc.dead) return;
  if (ps.stunTicks > 0) { chat("You are stunned and cannot move!", "warn"); return; }
  /* The two-tick cooldown between attempts. The live client lets you go again
     the moment the xp lands; this is the half of that rule that stops a held
     click spamming the roll every frame. */
  if (ps.pickpocketCd > 0) return;
  const lvl = skillLvl("thieving");
  if (lvl < row.level) {
    chat("You need a Thieving level of " + row.level + " to pick this " + npcDisplayName(npc).toLowerCase() + "'s pocket.", "warn");
    return;
  }
  faceTarget(G.player, Math.floor(npc.x), Math.floor(npc.z));
  playCastAnim(G.player, "skill_pickpocket");
  ps.pickpocketCd = 2;
  /* The invented curve between the two published levels (see the section note):
     50% at the level that unlocks the target, 100% at the level it stops
     failing, floored so a very high target is never a certainty. */
  const span = Math.max(1, row.failLevel - row.level);
  const chance = pct(Math.max(0.05, 0.5 + 0.5 * (lvl - row.level) / span));
  if (Math.random() < chance) {
    const coins = row.coins[0] + ((Math.random() * (row.coins[1] - row.coins[0] + 1)) | 0);
    invAdd(ps, "coins", coins);
    ps.stats.gpEarned = (ps.stats.gpEarned || 0) + coins;
    addXp(ps, "thieving", row.xp);
    mark("inv", "skills");
    /* The mark's grace: ten ticks before the theft can become a kill (the
       user's rule - src/items.js#PICKPOCKET_PP_GRACE, refused in
       src/combat.js#attackNpc). */
    npc.ppGrace = PICKPOCKET_PP_GRACE;
    chat("You pick the " + npcDisplayName(npc).toLowerCase() + "'s pocket and find " + coins + " coins.", "game");
  } else {
    stunPlayer(npc, row);
  }
}

/* --------------------------------------------------------------- examine text */

const OBJ_NAMES = {
  tree: "tree", rock: "rock", fishing: "fishing spot", furnace: "furnace", anvil: "anvil",
  potwheel: "potter's wheel", potoven: "pottery oven",
  range: "cooking range", fire: "Fire", well: "well", booth: "bank booth", counter: "counter",
  crate: "crate", barrel: "barrel", table: "table", chair: "chair", tent: "tent", statue: "statue",
  /* The village props (unit X). `crate_b` is the cache's OTHER crate - loc 354,
     "Search" where loc 63 is "Hide-in" - and reads as a plain crate to the
     player, which is what the cache calls it; `table_b` is its other table, and
     `rocky` the "Rocky shore" the def names (one word in the world's own
     vocabulary so the row reads "Jump-to Rocky shore" rather than "Jump-to
     rocky"). */
  crate_b: "crate", chest: "chest", table_b: "table", bench: "bench",
  boulder: "boulder", rockery: "rockery", rocky: "rocky shore", fern: "fern", plant: "plant",
  /* Cairn Isle's pillars: the cache's own "Pillar" / "Ruined Pillar" wins
     through menuName wherever the tile resolves to a loc with a def (see
     below), so this word is only the fallback for a tile that resolves to
     none - the same arrangement the graves keep. */
  pillar: "pillar",
  /* The tutorial island's shipwrecks: examine-only scenery, so the cache's
     own "Wreck" / "Broken boat" wins through menuName wherever the tile
     resolves to a loc with a def (see below) - this word is only the fallback
     for a tile that resolves to none, the same arrangement the pillars keep. */
  wreck: "wreck",
 tut_hat: "Pirate's Hat",
  tut_coconut: "coconut",
  tut_dry_coconut: "Dry Coconut",
  tut_cache: "hole",
  reeds: "reeds",
  /* The cache calls the flower locs "Flower" (1187/1188). The world's own name
     was "flowers" - plural, and lower case - which read as "A flowers." on the
     examine and as a name the cache never uses; the loc audit reports the two
     against each other. */
  signpost: "signpost", bush: "bush", flowers: "flower", fence: "fence", deadtree: "dead tree", rope: "rope barrier",
  ladder_down: "ladder", ladder_up: "ladder",
  lowwall: "crumbled wall",
  torch: "torch", flax: "flax",
  wall: "wall", door: "door", altar: "altar", wheel: "spinning wheel", sink: "sink",
  /* The churchyard (unit T): these lines are the *examine* fallback and the
     fallback for a loc the bake does not carry - the rows themselves show the
     cache's own "Small gravestone", "Grave marker", "Large grave stone" and
     "Gravestone" (`menuName`). Since unit XVIII every type here is only a
     fallback: the cache's name wins wherever the tile resolves to a loc with a
     def, and these words are what is left for the one family that keeps the
     world's name, the stalls, and for the objects this world still draws itself
     (the fence and a fire). The furnace, range, counter and signpost left this
     list in unit XIX, when they became real cache locs (2781/2729/612/1034), so
     their rows now read the cache's own "Smelt Furnace", "Cook Range". */
  grave: "gravestone", coffin: "coffin",
  /* The runecrafting sites are real cache locs (ruins 7104, air altar 2478),
     so the rows show the cache's own names; these words are only the fallback
     for a tile that resolves to no loc. */
  ruins: "mysterious ruins", air_altar: "air altar",
  /* The new island's portals are a real cache loc (the essence swirl 2492),
     so the rows show the cache's own name; this is only the fallback. */
  portal: "portal",
  /* The coin shrine is a merged bake (a plinth wearing a money pot), so its
     rows show the cache's own "Pile of coins" through menuName; this is only
     the fallback for a tile that resolves to no loc. */
  coin_shrine: "pile of coins",
};

/* A scenery row (and the top-left hover line, and the examine's own name) calls
   the object what the **cache** calls the loc the tile resolves to, and every
   object whose tile asks for a baked loc therefore shows the client's own name:
   "Chop down Oak", "Open Door", "Spin Spinning wheel", "Small gravestone" /
   "Grave marker" / "Large grave stone", "Mine Rocks". The rule is by exclusion -
   `WORLD_NAME_TYPES` and the three tree kinds below are all that keep this
   world's word - because the default should be the client's, and the exceptions
   should each have a reason.

   The history is worth keeping, because this was an open decision for a long
   time (unit V left it, unit X began it with the graves, unit XVIII finished
   it). Unit X's first family was the churchyard's five stones - locs 400, 401,
   403, 404/405, five distinct objects a player can tell apart, where this
   world's single word "gravestone" was throwing four of the names away.

   Unit V's objection was that the cache's names are *less* informative for two
   families, and it was only half right:

     * **ore rocks.** Every ore rock's def says "Rocks" and nothing else, so
       "Mine copper rock" was this world's way of saying which ore is in it -
       and the cache has its own way, on the same def: **Prospect**, the second
       action of all thirteen rock locs, which `prospectRock` answers with "This
       rock contains copper ore." (it has since the mining unit). So the row can
       be the client's own "Mine Rocks" and the player loses nothing: you
       prospect the rock to learn what it holds, exactly as in 2007. That is the
       reason the action exists in the def at all.
     * **trees.** The objection assumed the cache says "Tree" for every tree. It
       does not: the forest's species are named by their locs - "Oak", "Willow",
       "Yew", "Maple tree", "Magic tree", "Evergreen", "Leafy tree", "Dead
       tree", "Tree stump" - and only the plain tree is just "Tree". The world's
       old names ("oak tree", "evergreen tree") were those same words with a
       redundant noun and a lower-case first letter.

   A `stump` is a `tree` object with `stump: true`, so `locKeyOf` hands back the
   stump loc (stump_a/b/c) and the row reads "Tree stump" - the cache's name for
   what is actually drawn.

   Note the two registers, both deliberate: the *rows* and the hover line carry
   the cache's name as the client prints it (title case, "Oak"), while the
   *examine* sentences keep this world's lower-case vocabulary ("An oak." -
   `objExamine`), because the era's examine lines are sentence case and the
   client's examine text for a loc is not in the cache at all. */
/* The tutorial cache is drawn with a rock model (scene.js#_locSpec borrows
   rock_b) but it is not a rock - Scully calls it a hole, and so does the
   menu. Without this the def lookup names it "Rocks". */
const WORLD_NAME_TYPES = new Set(["stall", "tut_cache"]);

/* The three tree kinds that keep the world's own name, and they are the only
   ones: `snow` (loc tree_d/e/f), `tirannwn` (tree_g) and `arctic_pine` (oak_b)
   are *placements* of a generic tree loc - the cache calls the first two "Tree"
   and the third "Oak", because that is what those locs are - and this world's
   names for them are how the `::tree`/`::trees` specimen row tells them apart
   from the plain tree. None of the three is ever placed by the world (the
   forest's own kinds are tree, oak, willow, yew, maple, magic, leafy and
   evergreen), so this changes nothing a player can walk up to; it keeps the
   specimen row from contradicting its own label. The world's old name for the
   arctic pine was the raw kind key, "arctic_pine tree" - an underscore in a
   player-visible string - so this is an improvement even there. */
const TREE_KIND_NAME = { snow: "snow tree", tirannwn: "Tirannwn tree", arctic_pine: "Arctic pine" };

/* What a row calls the object: the cache's own loc name, everywhere the cache
   has one for the loc the tile resolves to, and this world's word for the two
   exceptions above and for an object with no loc at all (the fence and a fire
   are the only two scenery types left that this world draws itself). */
function menuName(o, x, z) {
  if (o.name) return o.name;  if (o.t === "tree" && !o.stump && o.kind && TREE_KIND_NAME[o.kind]) return TREE_KIND_NAME[o.kind];
  if (!WORLD_NAME_TYPES.has(o.t)) {
    const def = locDefFor(locKeyOf(o, x, z));
    if (def && def.name) return def.name;
  }
  return objName(o);
}

/* What a scenery verb gets appended in the menu and the hover line. The client
   builds both from `object.actions[action] + " " + object.name`, so a row is
   never a bare verb - "Smelt Furnace", "Spin Spinning wheel", not "Smelt" and
   "Spin". The world's own object names are what get appended here (its trees,
   rocks and stalls already read the way the menu needs); the one exception is
   the range, whose name in this world is the phrase "cooking range", which reads
   badly after the verb, so the menu calls it a Range and the examine line keeps
   the longer name. */
function menuNoun(o, x, z) {
  if (o.t === "range") return "Range";
  return menuName(o, x, z);
}

/* The client tags the target's name inside every menu row with the colour of its
   kind - `" @cya@"` for scenery, `" @yel@"` for a creature, `" @lre@"` for an
   item, in all three of its menu builders - and its string renderer colours the
   rest of the line with it. `ui.js#tagMarkup` paints the tags, so the row reads
   "Chop down" in the menu's own colour and "tree" in cyan, which is what the
   real menu looks like. The top-left hover shows the menu's row 0 with those
   same tags (317's drawTooltip draws 0xFFFFFF and the tags recolour the name),
   so the hover line tags its noun exactly the way the row does. */
const NAME_TAG = { scenery: "@cya@", npc: "@yel@", item: "@lre@" };
export function named(verb, name, kind) { return verb + " " + NAME_TAG[kind] + name; }
/* The hover line's verb: the tooltip's base colour is white, so the verb is
   the line's untagged start - "Chop down" white, "Tree" cyan. */
function actVerb(verb) { return verb; }

export function objName(o) {
  if (!o) return "something";
  if (o.t === "tree") {
    const k = o.kind && o.kind !== "tree" ? o.kind : "";
    return o.stump ? "tree stump" : (k ? k + " tree" : "tree");
  }
  if (o.t === "rock") return o.ore && o.ore !== "none" ? o.ore + " rock" : "rock";
  /* A piece of the isle's course (src/island.js#COURSE) is named by the cache loc
     its type *is*: the type is the loc key (src/scene.js#_locSpec's default
     case), so the lookup needs no tile. That is what keeps the hover line, the
     menu row the verb is appended to and the examine sentence all calling a rope
     swing a "Ropeswing" - the word the piece's own def carries - rather than the
     raw key. The three log variants share one name, and `o.t` is the first of
     them, which is the one the def carries. */
  if (AGILE_VERB[o.t]) {
    const def = locDefFor(o.t);
    return (def && def.name) || AGILE_NAME[o.t] || o.t;
  }
  /* A stall's own name is the one its loot table carries (src/items.js#STALLS),
     so the menu, the hover text and the skill guide can never disagree about
     what a given stall is called. */
  if (o.t === "stall") return (STALLS[o.kind] && STALLS[o.kind].name) || "market stall";
  /* SEVER (object-picker): a hand-placed prop is named by its own cache def -
     the type is the picker's, the name is the loc's. Delete with it. */
  if (o.t === "prop") { const def = locDefFor(o.key); return (def && def.name) || "prop"; }
  /* Wall decor carries its own key in `kind`, so the noun is the cache's name
     for that hanging ("Painting", "Portrait") rather than the type. */
  if (o.t === "painting") return o.kind === "portrait" ? "portrait" : "painting";
  return OBJ_NAMES[o.t] || o.t;
}

export function objExamine(o, x, z) {
  if (!o) return "It's something.";
  /* A piece of the isle's course (src/island.js#COURSE). The cache's own loc
     name in the era's sentence case, the same rule the trees and the hangings
     below follow, so the line reads "A Ropeswing." rather than "A
     agile_rope_swing." - the type's own key is not a word. */
  if (AGILE_VERB[o.t]) {
    const n = menuName(o, x, z).toLowerCase();
    return (/^[aeiou]/.test(n) ? "An " : "A ") + n + ".";
  }
  switch (o.t) {
    /* A tree's examine is the cache's own name in the sentence case the era's
       examine lines are written in ("An oak.", "A magic tree."), which is also
       what fixes the old line's grammar: "A " + the world's raw name produced
       "A oak tree." and, for the arctic pine, "A arctic_pine tree.". The article
       follows the word, so the evergreens and the achey tree read correctly too.
       (A dead tree keeps its own line below - "A dead tree." is already the
       cache's name in sentence case.) */
    case "tree": {
      if (o.stump) return "This tree has been chopped down.";
      const n = menuName(o, x, z).toLowerCase();
      return (/^[aeiou]/.test(n) ? "An " : "A ") + n + ".";
    }
    case "rock": return o.empty ? "This rock has been mined out." : (o.ore === "essence" ? "The source of all runes." : "A rocky outcrop with traces of ore.");
    case "stall": return o.looted ? "The stall has been picked clean." : "There's " + (o.kind === "bakery" ? "food" : "merchandise") + " on this stall.";
    case "fishing": return "A spot to catch fish.";
    case "furnace": return "A hot furnace, used for smelting ore.";
    case "anvil": return "An anvil for smithing bars into items.";
    case "wheel": return "A spinning wheel, for turning wool into balls.";
    case "range": return "A cooking range.";
    case "fire": return "A crackling fire.";
    case "booth": return "A bank booth.";
    case "statue": return o.discord
      ? "A monument to the town's founders. A plaque is fixed to its base."
      : "A weathered stone statue.";
    case "well": return "A well. The water looks clean.";
    case "sandpit": return "A pit of fine sand, for making glass.";
    case "sink": return "A kitchen sink. The water looks clean.";
    case "crate": return o.loot ? "There's something rattling around inside this crate." : "A sturdy wooden crate.";
    case "crate_b": return o.loot ? "There's something rattling around inside this crate." : "An empty crate.";
    case "chest": return o.loot ? "A chest. It looks like there's something inside it." : "An empty chest.";
    case "bench": return "A wooden bench.";
    case "table_b": return "A round wooden table.";
    case "ladder_down":
    case "ladder_up":
    case "lowwall": {
      if (o.trapdoor) return o.open ? "The trapdoor is open. It is dark down there." : "A closed trapdoor.";
      const n = menuName(o, x, z).toLowerCase();
      return ((/rubble/.test(n) ? "Some " : (/^[aeiou]/.test(n) ? "An " : "A "))) + n + ".";
    }
    case "boulder": return "A boulder. It's not going anywhere.";
    case "rockery": return "A pile of decorative rocks.";
    /* A pillar's examine is the cache's own name in sentence case ("A
       pillar.", "A ruined pillar."), the same rule the low wall follows. */
    case "pillar": {
      const n = menuName(o, x, z).toLowerCase();
      return "A " + n + ".";
    }
    /* A wreck's examine is the cache's own name in sentence case ("A
       wreck.", "A broken boat."), the same rule the pillar follows. */
    case "wreck": {
      const n = menuName(o, x, z).toLowerCase();
      return "A " + n + ".";
    }
   case "tut_hat": return "A battered Pirate's Hat, washed up with the tide.";
    case "tut_coconut": return "A fallen coconut.";
    case "tut_dry_coconut": return o.key === "dry_coconut_shell"
      ? "A cracked-open coconut shell, gnawed clean and sun-bleached."
      : "A dry coconut, weathered grey and cracked by the sun.";
    case "tut_cache": return o.tutLooted
      ? "A crack in the bluff, picked clean. Old casks and dust."
      : "A dark crack under the bluff, half-choked with sand. Something glints further in.";
    case "reeds": return o.key === "dock_leaf" ? "A broad dock leaf." : "A stand of tall reeds.";
    case "rocky": return "The rocks here look safe enough to jump between.";
    case "fern": return "A leafy fern.";
    case "plant": return "A tall plant, rooted in the marsh.";
    case "flax": return o.picked ? "The flax plant has been picked clean." : "A flax plant, ready for picking.";
    case "altar": return "A marble altar, worn smooth by years of prayers.";
    case "ruins": return "Ancient stones, humming faintly with elemental air.";
    case "air_altar": return "A mysterious power emanates from this shrine.";
    case "rc_portal": return "A portal from this mystical place.";
    case "portal": return "A magic portal, humming faintly.";
    case "coin_shrine": return "A big, fat, pile-a-money.";
    case "grave": return "Somebody is buried here. The name has worn away.";
    case "coffin": return o.open
      ? "The lid has been pushed aside, and the coffin is empty."
      : "The lid is still on. Something inside it does not sound settled.";
    case "door": return o.open ? "The door is open." : "The door is closed.";
    /* A hanging is the one piece of scenery whose examine is fixed by what it
       is rather than by its state: the cache's own name for it, in the era's
       sentence case ("A painting.", "A portrait."). */
    case "painting": {
      const def = locDefFor(locKeyOf(o, x, z));
      const n = (def && def.name) || objName(o);
      return "A " + n.toLowerCase() + ".";
    }
    /* SEVER (object-picker): the cache's own name in sentence case, like a
       painting - delete with the picker. */
    case "prop": {
      const n = menuName(o, x, z).toLowerCase();
      return ((/^[aeiou]/.test(n) ? "An " : "A ")) + n + ".";
    }
    default: return "A " + objName(o) + ".";
  }
}

/* --------------------------------------------------------------- shops */

/* Every shop in the world, keyed by the name a spawn's own `shop` field uses
   (src/world.js). `talk` is the vendor's conversation (see `shopScreens` below);
   `sellRate` is the fraction of an item's value the shop pays for it, and the
   stock rows are the shelf: an explicit `price` is what the shop charges, so
   omitting it just charges the item's own value (src/ui.js#shopPrice). */
/* ------------------------------------------------ the capes of accomplishment

   The seller's own rules, in one place (src/items.js carries the data: every
   cape of accomplishment has a `skillcape` skill on it, and 24 skills' worth of
   them exist, plain, trimmed and hood). Two seams in src/ui.js#buyFromShop let
   a shop ask before it takes the coins and hand something over after: this file
   is what fills them in for the cape counter.

     * **`skillcapeCanBuy`** - the level. A cape or hood needs 99 in its own
       skill; the (t) cut needs a *second* 99 as well, which is the live game's
       own rule for the trim; the Quest point cape needs every quest in this
       world's journal finished instead of any skill level at all; and the Max
       cape needs 99 in *every* skill, which is the whole point of it. The
       refusal is a chat line, not a hidden row: the shelf shows everything
       whatever level you are, exactly as a master's does, and the master
       says no.
     * **`skillcapeBought`** - the hood. Buying a cape hands over its hood as
       well, free, which is what the live game does ("a hood is also received");
       the hood rows on the shelf are the replacements at their own value.

   `SKILLCAPES` is read off the item table rather than written out a second
   time, so a cape that exists in src/items.js cannot be missing here. */
const SKILLCAPES = new Map();
for (const [id, d] of Object.entries(ITEMS)) {
  if (!d || !d.skillcape) continue;
  let e = SKILLCAPES.get(d.skillcape);
  if (!e) { e = { cape: null, trimmed: null, hood: null }; SKILLCAPES.set(d.skillcape, e); }
  if (d.hooded) e.hood = id; else if (d.trimmed) e.trimmed = id; else e.cape = id;
}

function capeStock() {
  const rows = [];
  /* the skills' own order, with the quest journal's cape and then the Max cape
     last - the Max is the shelf's summit, as it is the game's */
  for (const skill of SKILLS.map((s) => s.id).concat(["quest", "max"])) {
    const e = SKILLCAPES.get(skill);
    if (!e) continue;
    for (const id of [e.cape, e.trimmed, e.hood]) {
      if (id) rows.push({ id, qty: 10, price: ITEMS[id].value });
    }
  }
  return rows;
}

function skillName(id) {
  const s = SKILLS.find((k) => k.id === id);
  return s ? s.name : id;
}

function skillsAt99(ps) {
  let n = 0;
  for (const s of SKILLS) if (levelOf(ps.skills, s.id) >= 99) n++;
  return n;
}

function skillcapeCanBuy(stock) {
  const def = ITEMS[stock.id];
  if (!def || !def.skillcape) return true;
  const ps = G.ps;
  if (!ps) return false;
  const skill = def.skillcape;
  if (skill === "quest") {
    /* The Quest point cape is bought with the journal rather than a level:
       **every quest in this world's log finished**, which is one quest so far
       (Sheep Shearer). It keeps its shelf row whatever your levels - the
       counter shows all 24 - and the master refuses while anything is
       unfinished. The equip path asks the same question of the same function
       (src/player.js#canEquip, through the item's own `reqQuests`), so a cape
       that cannot be bought cannot be smuggled on either. */
    if (!allQuestsDone(ps)) {
      chat("You need to have completed every quest before you can buy that cape.", "warn");
      return false;
    }
    return true;
  }
  if (skill === "max") {
    /* The Max cape is bought with every skill at once: 99 in all 23, which is
       what `reqMax` on the item means to the equip path too
       (src/player.js#canEquip) - so a cape that cannot be bought cannot be
       smuggled on either. The price is the live game's own 99,000 per skill
       mastered, counted over this world's 23. */
    if (skillsAt99(ps) < SKILLS.length) {
      chat("You need level 99 in every skill before you can buy that cape.", "warn");
      return false;
    }
    return true;
  }
  if (levelOf(ps.skills, skill) < 99) {
    chat("You need level 99 " + skillName(skill) + " to buy that cape.", "warn");
    return false;
  }
  if (def.trimmed && skillsAt99(ps) < 2) {
    chat("You need a second skill at level 99 before you can buy the trimmed cape.", "warn");
    return false;
  }
  return true;
}

function skillcapeBought(stock) {
  const def = ITEMS[stock.id];
  if (!def || !def.skillcape || def.hooded) return;
  const hood = (SKILLCAPES.get(def.skillcape) || {}).hood;
  if (!hood) return;
  const ps = G.ps;
  if (!ps || invCount(ps, hood) > 0) return;
  invAdd(ps, hood, 1);
  mark("inv");
  chat("He hands you the hood to go with it.", "game");
}

export const SHOPS = {
  general: {
    name: "General Store",
    /* The general store's own script: LostCityRS/Content branch 274,
       scripts/shop/scripts/generalshop.rs2, the `generalshop_help` label that
       every general storekeeper and assistant in the game shares. */
    talk: {
      ask: "Can I help you at all?",
      yes: "Yes please. What are you selling?",
      answer: "Take a look.",
      no: "No thanks.",
    },
    sellRate: 0.55,
    stock: [
      { id: "bronze_axe", qty: 10, price: 16 },
      { id: "bronze_pickaxe", qty: 10, price: 16 },
      { id: "bronze_sword", qty: 8, price: 26 },
      { id: "bronze_dagger", qty: 8, price: 12 },
      { id: "bronze_sqshield", qty: 6, price: 44 },
      { id: "leather_body", qty: 5, price: 42 },
      { id: "leather_chaps", qty: 5, price: 38 },
      { id: "leather_coif", qty: 5, price: 22 },
      { id: "tinderbox", qty: 20, price: 3 },
      { id: "small_fishing_net", qty: 20, price: 5 },
      { id: "fishing_rod", qty: 20, price: 5 },
      { id: "fly_fishing_rod", qty: 10, price: 5 },
      { id: "harpoon", qty: 5, price: 5 },
      { id: "lobster_pot", qty: 5, price: 5 },
      { id: "fishing_bait", qty: 300, price: 3 },
      { id: "hammer", qty: 20, price: 1 },
      { id: "chisel", qty: 20, price: 1 },
      { id: "shears", qty: 20, price: 1 },
      { id: "knife", qty: 20, price: 6 },
      { id: "bucket", qty: 20, price: 2 },
      { id: "pot", qty: 20, price: 1 },
      { id: "jug", qty: 20, price: 1 },
      { id: "spade", qty: 20, price: 3 },
      { id: "rope", qty: 10, price: 18 },
      { id: "needle", qty: 20, price: 1 },
      { id: "thread", qty: 100, price: 1 },
      /* The jeweller's moulds used to sit on this counter (unit L3); they have
         moved to Dommik's crafting shop on the market square, which is their
         real source - the general store keeps the needle, the thread and the
         chisel. */
      /* The cleaning cloth, the one way a coated weapon comes clean again. Its
         real sources are Karamja rum, silk and a Tai Bwo Wannai quest, none of
         which this map has a region for. */
      { id: "cleaning_cloth", qty: 20, price: 70 },
      { id: "bread", qty: 30, price: 12 },
      { id: "cheese", qty: 30, price: 8 },
      { id: "cake", qty: 10, price: 50 },
      { id: "bronze_arrow", qty: 200, price: 2 },
      { id: "air_rune", qty: 200, price: 4 },
      { id: "mind_rune", qty: 200, price: 4 },
    ],
  },
  /* Dommik's Crafting shop on the market square: the jeweller's moulds' real
     source (Dommik's and Rommik's both keep the moulds in the live game), plus
     the needle, the thread and the chisel the general store also keeps, and
     the glassmaker's shelf - a pipe, seaweed and buckets of sand, the three
     things a furnace cannot give. Moulds are 5 gp, the live game's own price;
     the rest charge the item's own value. */
  craft: {
    name: "Dommik's Crafting Store",
    talk: {
      ask: "Would you like to buy some crafting equipment?",
      yes: "Yes please. What are you selling?",
      answer: "Take a look.",
      no: "No thanks.",
    },
    sellRate: 0.55,
    stock: [
      { id: "needle", qty: 20, price: 1 },
      { id: "thread", qty: 100, price: 1 },
      { id: "chisel", qty: 20, price: 1 },
      { id: "ring_mould", qty: 20, price: 5 },
      { id: "amulet_mould", qty: 20, price: 5 },
      { id: "bracelet_mould", qty: 20, price: 5 },
      { id: "necklace_mould", qty: 20, price: 5 },
      { id: "holy_mould", qty: 20, price: 5 },
      { id: "unholy_mould", qty: 20, price: 5 },
      { id: "sickle_mould", qty: 20, price: 5 },
      { id: "tiara_mould", qty: 20, price: 5 },
      { id: "bolt_mould", qty: 20, price: 5 },
      { id: "glassblowing_pipe", qty: 10 },
      { id: "seaweed", qty: 50 },
      { id: "bucket_of_sand", qty: 50 },
    ],
  },
  /* The Wizards' Guild's own store. In the live game this is where the blue
     mystic set comes from ("The blue mystic boots can be bought from the
     Wizards' Guild in Yanille" - and the same for the rest of the set), which
     is the whole reason the mage's armour is stocked rather than dropped. The
     runes and staves are the guild's other counters, priced the way the town
     shop prices its own. */
  magic: {
    name: "Magic Guild Store",
    /* Betty's magic emporium, the game's own magic-shop conversation
       (scripts/areas/area_port_sarim/scripts/betty.rs2). */
    talk: {
      ask: "Welcome to the magic emporium.",
      yes: "Can I see your wares?",
      answer: "Yes.",
      no: "Sorry I'm not into magic.",
      decline: "Send anyone my way who is.",
    },
    sellRate: 0.5,
    stock: [
      { id: "air_rune", qty: 300, price: 4 },
      { id: "water_rune", qty: 300, price: 4 },
      { id: "earth_rune", qty: 300, price: 4 },
      { id: "fire_rune", qty: 300, price: 4 },
      { id: "mind_rune", qty: 300, price: 4 },
      { id: "body_rune", qty: 200, price: 4 },
      { id: "chaos_rune", qty: 100, price: 5 },
      /* The astral rune, and the reason this counter carries one at all: it is
         the Lunar spellbook's own rune (every one of the thirty-nine rows
         spends at least one), and in the live game the only source is the
         Astral Altar on Lunar Isle. This world has no Lunar Isle and no
         Runecrafting for it, so without this row the whole book is dead -
         every spell refuses for want of a rune nothing can give the player.
         The price is the era's own traded value (astral runes have never been
         sold by a shop) and the stock is this world's stand-in. */
      { id: "astral_rune", qty: 300, price: 100 },
      { id: "staff_of_air", qty: 5, price: 1500 },
      { id: "staff_of_water", qty: 5, price: 1500 },
      { id: "staff_of_earth", qty: 5, price: 1500 },
      { id: "staff_of_fire", qty: 5, price: 1500 },
      { id: "mystic_hat", qty: 1, price: 15000 },
      { id: "mystic_robe_top", qty: 1, price: 120000 },
      { id: "mystic_robe_bottom", qty: 1, price: 80000 },
      { id: "mystic_gloves", qty: 1, price: 10000 },
      { id: "mystic_boots", qty: 1, price: 10000 },
      { id: "dagonhai_hat", qty: 1, price: 9000 },
      { id: "dagonhai_robe_top", qty: 1, price: 60000 },
      { id: "dagonhai_robe_bottom", qty: 1, price: 45000 },
      /* The jewellery the Enchant spells work on. The live game's own source
         for these is a furnace and a ring mould (a gold bar, then a cut gem),
         which this world has no jewellery bench for; the guild's counter is
         the stand-in, priced at each ring's own value. */
      { id: "sapphire_ring", qty: 5, price: 900 },
      { id: "ruby_ring", qty: 5, price: 2025 },
      { id: "diamond_ring", qty: 5, price: 3525 },
      { id: "dragonstone_ring", qty: 5, price: 17625 },
      /* The Mage Arena's three god staves and their three capes. In the live
         game they are the reward for finishing Mage Arena I: the player picks a
         god and is given that god's cape, and the chamber guardian sells the
         other two staves (and the one they did not pick) for 80,000 coins. This
         world has no Mage Arena yet, so the guild keeps them behind its own
         counter at those same prices - the cape for its own value of 10, since
         the arena gives it away. The god spells they unlock need the matching
         staff wielded (src/magic.js#spellStatus), and the god capes are the
         other half of the Charge bonus (src/combat.js#spellMaxHit). */
      { id: "saradomin_staff", qty: 1, price: 80000 },
      { id: "guthix_staff", qty: 1, price: 80000 },
      { id: "zamorak_staff", qty: 1, price: 80000 },
      { id: "saradomin_cape", qty: 1, price: 10 },
      { id: "guthix_cape", qty: 1, price: 10 },
      { id: "zamorak_cape", qty: 1, price: 10 },
      /* The ancient staff is Desert Treasure's reward in the live game, and
         this world has no such quest either; the guild's counter is again the
         stand-in, at the staff's own value. */
      { id: "ancient_staff", qty: 1, price: 100000 },
      /* The boot and glove slots of each magic family (unit L of PLAN.md).
         Infinity is Mage Training Arena stock and the Moonclan set is Lunar
         Isle's in the live game; this world has no such content, so the guild
         counter is the stand-in at each item's own value, exactly as it
         already is for the jewellery and the god staves. Wizard boots are a
         treasure-trail reward and are sold here for the same reason. */
      { id: "infinity_gloves", qty: 1, price: 12000 },
      { id: "infinity_boots", qty: 1, price: 12000 },
      { id: "moonclan_gloves", qty: 1, price: 900 },
      { id: "moonclan_boots", qty: 1, price: 900 },
      { id: "wizard_boots", qty: 1, price: 200 },
      /* The rest of the Infinity and Moonclan sets (unit L2 of
         PLAN.md) - hat/top/bottoms, and the Moonclan helm/armour/skirt/cape.
         Same stand-in reasoning as the block above. */
      { id: "infinity_hat", qty: 1, price: 17000 },
      { id: "infinity_top", qty: 1, price: 140000 },
      { id: "infinity_bottoms", qty: 1, price: 90000 },
      /* The battlestaves and the mystic staves. In the live game the plain and
         elemental battlestaves are Crafting (an orb on a battlestaff - which is
         why the orb-charging spells exist) and the mystic set is Thormac's
         40,000-coin upgrade; this world has neither an orb in its roster nor a
         recipe for one, so the guild counter is the stand-in at
         each staff's own value. Thormac himself now keeps by the eastern
         magic tree (src/actions.js#thormacScreens, src/world.js) and performs his own
         upgrade there - the counter's finished staves stay for the player who
         would rather buy than enchant. The four elemental battlestaves are the
         real find: they are a staff of air/water/earth/fire that also *hits*,
         and the lava and mud ones supply two elements at once. */
      { id: "battlestaff", qty: 5, price: 7000 },      { id: "air_battlestaff", qty: 5, price: 15500 },
      { id: "water_battlestaff", qty: 5, price: 15500 },
      { id: "earth_battlestaff", qty: 5, price: 15500 },
      { id: "fire_battlestaff", qty: 5, price: 15500 },
      { id: "lava_battlestaff", qty: 2, price: 17000 },
      { id: "mud_battlestaff", qty: 2, price: 17000 },
      { id: "mystic_air_staff", qty: 1, price: 42500 },
      { id: "mystic_water_staff", qty: 1, price: 42500 },
      { id: "mystic_earth_staff", qty: 1, price: 42500 },
      { id: "mystic_fire_staff", qty: 1, price: 42500 },
      { id: "mystic_lava_staff", qty: 1, price: 45000 },
      { id: "mystic_mud_staff", qty: 1, price: 45000 },
     /* The four staves whose real source is a quest or a slayer master - and
         whose spell (Iban Blast, fairy rings) this world does not have - sold
         for their own value so the weapon itself is obtainable. */
      { id: "ibans_staff", qty: 1, price: 42500 },
      { id: "ibans_superior_staff", qty: 1, price: 250000 },
      { id: "slayers_staff", qty: 1, price: 21000 },
      { id: "white_magic_staff", qty: 5, price: 200 },
      { id: "dramen_staff", qty: 5, price: 15 },
      { id: "magic_staff", qty: 5, price: 200 },
      /* The robe sets (unit L5 of PLAN.md), each at its own published value -
         the same stand-in the block above uses. The real sources, for the
         record: the *blue wizard*, *black wizard* and *dark wizard* robes are plain magic-shop stock; the
         *prayer* robes (monk's, druid's, shade, and the Zamorak monk's own) are
         worn for their prayer bonus and come from the monastery, Taverley and
         the Shades of Mort'ton; the *ghostly* set is Desert Treasure's; the
         *enchanted* set is Mage Training Arena stock; and the *3rd age* robes,
         the *vestments* (mitre, top, legs) and their stoles and croziers are
         Treasure Trails rewards. Every number is the item page's own. */
      { id: "wizard_hat", qty: 5, price: 2 },
      { id: "black_wizard_hat", qty: 5, price: 2 },
      { id: "wizard_robe", qty: 5, price: 15 },
      { id: "blue_skirt", qty: 5, price: 2 },
      { id: "black_robe", qty: 5, price: 13 },
      { id: "black_skirt", qty: 5, price: 2 },
      { id: "dark_wizard_hat", qty: 5, price: 2 },
      { id: "dark_wizard_robe_top", qty: 5, price: 13 },
      { id: "dark_wizard_robe_bottom", qty: 5, price: 2 },
      { id: "monks_robe_top", qty: 5, price: 40 },
      { id: "monks_robe", qty: 5, price: 30 },
      { id: "druids_robe_top", qty: 5, price: 40 },
      { id: "druids_robe", qty: 5, price: 30 },
      { id: "shade_robe_top", qty: 5, price: 40 },
      { id: "shade_robe", qty: 5, price: 30 },
      { id: "zamorak_monk_top", qty: 5, price: 40 },
      { id: "zamorak_monk_bottom", qty: 5, price: 30 },
      { id: "ghostly_hood", qty: 1, price: 30 },
      { id: "ghostly_robe_top", qty: 1, price: 30 },
      { id: "ghostly_robe_bottom", qty: 1, price: 30 },
      { id: "ghostly_gloves", qty: 1, price: 30 },
      { id: "ghostly_boots", qty: 1, price: 30 },
      { id: "ghostly_cloak", qty: 1, price: 25 },
      { id: "enchanted_hat", qty: 1, price: 15000 },
      { id: "enchanted_top", qty: 1, price: 120000 },
      { id: "enchanted_robe", qty: 1, price: 80000 },
      { id: "third_age_mage_hat", qty: 1, price: 50400 },
      { id: "third_age_robe_top", qty: 1, price: 50800 },
      { id: "third_age_robe", qty: 1, price: 50600 },
      { id: "saradomin_mitre", qty: 1, price: 5000 },
      { id: "saradomin_robe_top", qty: 1, price: 7000 },
      { id: "saradomin_robe_legs", qty: 1, price: 7000 },
      { id: "guthix_mitre", qty: 1, price: 5000 },
      { id: "guthix_robe_top", qty: 1, price: 7000 },
      { id: "guthix_robe_legs", qty: 1, price: 7000 },
      { id: "zamorak_mitre", qty: 1, price: 5000 },
      { id: "zamorak_robe_top", qty: 1, price: 7000 },
      { id: "zamorak_robe_legs", qty: 1, price: 7000 },
      { id: "saradomin_stole", qty: 1, price: 2500 },
      { id: "guthix_stole", qty: 1, price: 2500 },
      { id: "zamorak_stole", qty: 1, price: 2500 },
      { id: "saradomin_crozier", qty: 1, price: 5000 },
      { id: "guthix_crozier", qty: 1, price: 5000 },
      { id: "zamorak_crozier", qty: 1, price: 5000 },
      { id: "moonclan_helm", qty: 1, price: 1000 },
      { id: "moonclan_armour", qty: 1, price: 1000 },
      { id: "moonclan_skirt", qty: 1, price: 1000 },
      { id: "moonclan_cape", qty: 1, price: 200 },
      /* The dark and light mystic sets, the splitbark and skeletal sets, and
         Ahrim's full set with its staff: every remaining magic family, at each
         item's own value, same stand-in as the rows above. */
      { id: "mystic_dark_hat", qty: 1, price: 15000 },
      { id: "mystic_dark_robe_top", qty: 1, price: 120000 },
      { id: "mystic_dark_robe_bottom", qty: 1, price: 80000 },
      { id: "mystic_dark_gloves", qty: 1, price: 10000 },
      { id: "mystic_dark_boots", qty: 1, price: 10000 },
      { id: "mystic_light_hat", qty: 1, price: 15000 },
      { id: "mystic_light_robe_top", qty: 1, price: 120000 },
      { id: "mystic_light_robe_bottom", qty: 1, price: 80000 },
      { id: "mystic_light_gloves", qty: 1, price: 10000 },
      { id: "mystic_light_boots", qty: 1, price: 10000 },
      { id: "splitbark_helm", qty: 1, price: 10000 },
      { id: "splitbark_body", qty: 1, price: 45000 },
      { id: "splitbark_legs", qty: 1, price: 40000 },
      { id: "splitbark_gauntlets", qty: 1, price: 5000 },
      { id: "splitbark_boots", qty: 1, price: 5000 },
      { id: "skeletal_helm", qty: 1, price: 10000 },
      { id: "skeletal_top", qty: 1, price: 45000 },
      { id: "skeletal_bottoms", qty: 1, price: 40000 },
      { id: "skeletal_gloves", qty: 1, price: 650 },
      { id: "skeletal_boots", qty: 1, price: 650 },
      { id: "ahrims_hood", qty: 1, price: 13000 },
      { id: "ahrims_robetop", qty: 1, price: 50000 },
      { id: "ahrims_robeskirt", qty: 1, price: 47000 },
      { id: "ahrims_staff", qty: 1, price: 85000 },
      { id: "farseer_helm", qty: 1, price: 60000 },
      { id: "void_knight_top", qty: 1, price: 48000 },
      { id: "void_knight_robe", qty: 1, price: 45000 },
      { id: "void_knight_gloves", qty: 1, price: 6052 },
      { id: "elemental_shield", qty: 1, price: 20 },
      { id: "mind_shield", qty: 1, price: 3000 },
      { id: "magic_cape", qty: 1, price: 99000 },
      { id: "magic_cape_t", qty: 1, price: 99000 },
      { id: "magic_hood", qty: 1, price: 1 },
      { id: "third_age_druidic_top", qty: 1, price: 200000 },
      { id: "third_age_druidic_bottoms", qty: 1, price: 200000 },
      { id: "third_age_druidic_cloak", qty: 1, price: 200000 },
      /* The onyx, and the amulet it makes (unit L2 of PLAN.md). This is the one
         gem in the Enchant table whose input the counter had to supply for the
         spell to work at all: Lvl-6 Enchant's own refusal message promises "Onyx
         Amulets and Rings", and an onyx amulet enchanted there *is* an amulet of
         fury, the same recipe the live game uses. The uncut gem is here too, so
         the Crafting chain (cut an onyx at 67 Crafting) is walkable. */
      { id: "uncut_onyx", qty: 5, price: 200000 },
      { id: "onyx", qty: 5, price: 200000 },
      { id: "onyx_amulet", qty: 5, price: 201000 },
    ],
  },
  /* The town's own counters, one per storefront (src/world.js): the armourer,
     the sword shop, the archery shop, the fishing shop and the food store.
     Each is priced above the item's own value, the way a shop's stock is, and
     the tiers stop where the drops and the anvil take over - a shop sells the
     bronze-to-black range, mithril and rune are earned. */
  armour: {
    name: "Armour Shop",
    /* Horvik the armourer's own script (scripts/areas/area_varrock/scripts/
       horvik.rs2). */
    talk: {
      ask: "Hello, do you need any help?",
      yes: "Do you want to trade?",
      answer: "Yes, I have a fine selection of armour.",
      no: "No thanks. I'm just looking around.",
      decline: "Well, come and see me if you're ever in need of armour!",
    },
    sellRate: 0.55,
    stock: [
      { id: "bronze_helm", qty: 10, price: 20 },
      { id: "iron_helm", qty: 10, price: 45 },
      { id: "steel_helm", qty: 8, price: 110 },
      { id: "black_helm", qty: 5, price: 200 },
      { id: "bronze_fullhelm", qty: 10, price: 55 },
      { id: "iron_fullhelm", qty: 10, price: 110 },
      { id: "steel_fullhelm", qty: 8, price: 275 },
      { id: "black_fullhelm", qty: 5, price: 490 },
      { id: "bronze_chainbody", qty: 10, price: 110 },
      { id: "iron_chainbody", qty: 10, price: 220 },
      { id: "steel_chainbody", qty: 8, price: 550 },
      { id: "black_chainbody", qty: 5, price: 990 },
      { id: "bronze_platebody", qty: 10, price: 220 },
      { id: "iron_platebody", qty: 8, price: 440 },
      { id: "steel_platebody", qty: 6, price: 1100 },
      { id: "black_platebody", qty: 4, price: 1980 },
      { id: "bronze_platelegs", qty: 10, price: 165 },
      { id: "iron_platelegs", qty: 8, price: 330 },
      { id: "steel_platelegs", qty: 6, price: 825 },
      { id: "black_platelegs", qty: 4, price: 1490 },
      { id: "bronze_plateskirt", qty: 10, price: 165 },
      { id: "iron_plateskirt", qty: 8, price: 330 },
      { id: "steel_plateskirt", qty: 6, price: 825 },
      { id: "black_plateskirt", qty: 4, price: 1490 },
      { id: "bronze_sqshield", qty: 10, price: 75 },
      { id: "iron_sqshield", qty: 10, price: 150 },
      { id: "steel_sqshield", qty: 8, price: 370 },
      { id: "black_sqshield", qty: 5, price: 660 },
      { id: "bronze_kiteshield", qty: 10, price: 130 },
      { id: "iron_kiteshield", qty: 8, price: 260 },
      { id: "steel_kiteshield", qty: 6, price: 645 },
      { id: "black_kiteshield", qty: 4, price: 1160 },
      /* The two slots the armoury had nothing for at all before unit L of
         PLAN.md. The metal families run bronze to black like the tiers above:
         the shop stocks the low ones and leaves mithril on up to be earned. */
      { id: "leather_gloves", qty: 10, price: 6 },
      { id: "hardleather_gloves", qty: 10, price: 55 },
      { id: "bronze_gloves", qty: 10, price: 110 },
      { id: "iron_gloves", qty: 8, price: 275 },
      { id: "steel_gloves", qty: 6, price: 550 },
      { id: "black_gloves", qty: 4, price: 1100 },
      { id: "bronze_boots", qty: 10, price: 26 },
      { id: "iron_boots", qty: 8, price: 92 },
      { id: "steel_boots", qty: 6, price: 330 },
      { id: "black_boots", qty: 4, price: 634 },
      /* Everything else in the two slots is a quest, a minigame, a clue scroll
         or a monster drop in the live game, and this world has none of those to
         give. The armourer keeps them behind the counter at each item's own
         value - the same stand-in the Magic Guild uses for the god staves and
         the Mage Arena's capes. The real source is named per block so a later
         unit can hand it back:
           * climbing boots - Death Plateau
           * fighting/fancy boots - the Stronghold of Security
           * white boots - the Temple Knights' armoury
           * white/adamant/rune boots - monster drops (cave crawlers on up)
           * dragon/barrows gloves - Recipe for Disaster's Culinaromancer chest
           * void knight gloves - Pest Control
           * penance gloves, runner boots - Barbarian Assault
           * rogue boots/gloves - the Rogue's Den
           * combat/regen bracelet - a gem plus a bracelet mould at a furnace
             (see unit K of PLAN.md)
           * the four gauntlets and Klank's - Family Crest, Underground Pass
           * ice gloves - Heroes' Quest; ghostly gloves - Desert Treasure;
             gloves of silence - Hunter
           * the three god bracers - treasure trails */
      { id: "climbing_boots", qty: 4, price: 12 },
      { id: "fighting_boots", qty: 4, price: 1 },
      { id: "fancy_boots", qty: 4, price: 1 },
      { id: "white_boots", qty: 4, price: 634 },
      { id: "adamant_boots", qty: 2, price: 2112 },
      { id: "rune_boots", qty: 1, price: 12500 },
      { id: "dragon_gloves", qty: 1, price: 100000 },
      { id: "barrows_gloves", qty: 1, price: 100000 },
      { id: "void_knight_gloves", qty: 2, price: 6052 },
      { id: "penance_gloves", qty: 2, price: 65001 },
      { id: "runner_boots", qty: 2, price: 65003 },
      { id: "rogue_boots", qty: 2, price: 250 },
      { id: "rogue_gloves", qty: 2, price: 250 },
      { id: "combat_bracelet", qty: 2, price: 21040 },
      { id: "regen_bracelet", qty: 2, price: 202000 },
      { id: "cooking_gauntlets", qty: 2, price: 1 },
      { id: "goldsmith_gauntlets", qty: 2, price: 1 },
      { id: "chaos_gauntlets", qty: 2, price: 1 },
      { id: "steel_gauntlets", qty: 2, price: 1 },
      { id: "klanks_gauntlets", qty: 4, price: 6 },
      { id: "fremennik_gloves", qty: 4, price: 500 },
      { id: "ice_gloves", qty: 4, price: 6 },
      { id: "ghostly_gloves", qty: 4, price: 30 },
      { id: "gloves_of_silence", qty: 4, price: 600 },
      { id: "zamorak_bracers", qty: 4, price: 4000 },
      { id: "guthix_bracers", qty: 4, price: 6000 },
      { id: "saradomin_bracers", qty: 4, price: 4000 },
      /* Unit L2 of PLAN.md: the granite and Void sets, the Penance fighter's
         torso and the two TzHaar capes. Same stand-in as the block above and at
         each item's own value - the real sources are the Fight Caves (the fire
         cape), the TzHaar shops (obsidian), the Barbarian Assault (the torso)
         and Pest Control (Void). The amulet of fury is deliberately *not* here:
         it has its real source now - an onyx amulet and Lvl-6 Enchant, both at
         the Magic Guild's counter. */
      { id: "granite_helm", qty: 2, price: 46000 },
      { id: "granite_body", qty: 2, price: 80000 },
      { id: "granite_legs", qty: 2, price: 66000 },
      { id: "granite_shield", qty: 2, price: 56000 },
      { id: "fighter_torso", qty: 1, price: 65006 },
      { id: "void_knight_top", qty: 2, price: 48000 },
      { id: "void_knight_robe", qty: 2, price: 45000 },
      { id: "void_knight_mace", qty: 2, price: 12000 },
      { id: "obsidian_cape", qty: 1, price: 60000 },
      { id: "fire_cape", qty: 1, price: 65007 },
    ],
  },
  sword: {
    name: "Sword Shop",
    /* The Varrock sword shop's own script (scripts/areas/area_varrock/scripts/
       varrock_swordshop.rs2). Its greeting is the `|`-split two-line box, and
       its "yes" opens the counter without a further line. */
    talk: {
      ask: ["Hello, bold adventurer!", "Can I interest you in some swords?"],
      yes: "Yes, please!",
      answer: [],
      no: "No, I'm okay for swords right now.",
    },
    sellRate: 0.55,
    stock: [
      { id: "bronze_dagger", qty: 10, price: 12 },
      { id: "iron_dagger", qty: 10, price: 24 },
      { id: "steel_dagger", qty: 8, price: 60 },
      { id: "black_dagger", qty: 5, price: 110 },
      { id: "mithril_dagger", qty: 8, price: 200 },
      { id: "adamant_dagger", qty: 6, price: 450 },
      { id: "rune_dagger", qty: 4, price: 4500 },
      { id: "dragon_dagger", qty: 1, price: 18000 },
      { id: "bronze_sword", qty: 10, price: 16 },
      { id: "iron_sword", qty: 10, price: 32 },
      { id: "steel_sword", qty: 8, price: 80 },
      { id: "black_sword", qty: 5, price: 145 },
      { id: "mithril_sword", qty: 8, price: 260 },
      { id: "adamant_sword", qty: 6, price: 600 },
      { id: "rune_sword", qty: 4, price: 6000 },
      { id: "bronze_longsword", qty: 10, price: 40 },
      { id: "iron_longsword", qty: 10, price: 80 },
      { id: "steel_longsword", qty: 8, price: 200 },
      { id: "black_longsword", qty: 5, price: 360 },
      { id: "mithril_longsword", qty: 6, price: 650 },
      { id: "adamant_longsword", qty: 4, price: 1500 },
      { id: "rune_longsword", qty: 2, price: 9000 },
      { id: "dragon_longsword", qty: 1, price: 60000 },
      { id: "bronze_scimitar", qty: 10, price: 50 },
      { id: "iron_scimitar", qty: 8, price: 100 },
      { id: "steel_scimitar", qty: 6, price: 250 },
      { id: "black_scimitar", qty: 4, price: 450 },
      { id: "mithril_scimitar", qty: 6, price: 800 },
      { id: "adamant_scimitar", qty: 4, price: 2000 },
      { id: "rune_scimitar", qty: 2, price: 12000 },
      { id: "dragon_scimitar", qty: 1, price: 60000 },
      { id: "bronze_mace", qty: 10, price: 30 },
      { id: "iron_mace", qty: 8, price: 60 },
      { id: "steel_mace", qty: 6, price: 150 },
      { id: "black_mace", qty: 4, price: 270 },
      { id: "mithril_mace", qty: 6, price: 450 },
      { id: "adamant_mace", qty: 4, price: 1000 },
      { id: "rune_mace", qty: 2, price: 7000 },
      { id: "dragon_mace", qty: 1, price: 30000 },
      { id: "bronze_battleaxe", qty: 10, price: 60 },
      { id: "iron_battleaxe", qty: 8, price: 120 },
      { id: "steel_battleaxe", qty: 6, price: 300 },
      { id: "black_battleaxe", qty: 4, price: 540 },
      { id: "mithril_battleaxe", qty: 6, price: 900 },
      { id: "adamant_battleaxe", qty: 4, price: 2000 },
      { id: "rune_battleaxe", qty: 2, price: 14000 },
      { id: "dragon_battleaxe", qty: 1, price: 120000 },
      { id: "bronze_warhammer", qty: 10, price: 60 },
      { id: "iron_warhammer", qty: 8, price: 120 },
      { id: "steel_warhammer", qty: 6, price: 300 },
      { id: "black_warhammer", qty: 4, price: 540 },
      { id: "mithril_warhammer", qty: 6, price: 900 },
      { id: "adamant_warhammer", qty: 4, price: 2000 },
      { id: "rune_warhammer", qty: 2, price: 14000 },
      { id: "bronze_2h", qty: 10, price: 80 },
      { id: "iron_2h", qty: 8, price: 280 },
      { id: "steel_2h", qty: 6, price: 1000 },
      { id: "black_2h", qty: 4, price: 1920 },
      { id: "mithril_2h", qty: 4, price: 2600 },
      { id: "adamant_2h", qty: 3, price: 6400 },
      { id: "rune_2h", qty: 2, price: 30000 },
      { id: "dragon_2h", qty: 1, price: 110000 },
    ],
  },
  /* Bob's Brilliant Axes, the town's axe shop and the only shop in Lumbridge
     besides the general store (src/PLAN.md unit C3). The shelf is the shop's
     own published stock, in its own order - the two low axes, a pickaxe (Bob
     really does sell one), and the three battleaxes above them. Every row
     omits `price`, so each charges the item's own value, which is this
     world's convention for every counter (the real shop's own store table
     also carries the buy/sell multipliers 600/1000, a stock-delta pricing
     system nothing here models). Bob's conversation is not the `talk` shape
     the other vendors use: it is his own three-option tree, bobScreens. */
  axes: {
    name: "Bob's Brilliant Axes",
    sellRate: 0.55,
    stock: [
      { id: "bronze_pickaxe", qty: 5 },
      { id: "bronze_axe", qty: 10 },
      { id: "iron_axe", qty: 5 },
      { id: "steel_axe", qty: 3 },
      { id: "iron_battleaxe", qty: 5 },
      { id: "steel_battleaxe", qty: 2 },
      { id: "mithril_battleaxe", qty: 1 },
    ],
  },
  archery: {
    name: "Archery Shop",
    /* Lowe's Archery Emporium (scripts/areas/area_varrock/scripts/lowe.rs2),
       including his opinion of people who buy swords instead. */
    talk: {
      ask: ["Welcome to Lowe's Archery Emporium.", "Do you want to see my wares?"],
      yes: "Yes please.",
      answer: [],
      no: "No, I prefer to bash things close up.",
      decline: "Humph, philistine.",
    },
    sellRate: 0.5,
    stock: [
      { id: "shortbow", qty: 10, price: 150 },
      { id: "oak_shortbow", qty: 10, price: 265 },
      { id: "willow_shortbow", qty: 8, price: 380 },
      { id: "maple_shortbow", qty: 6, price: 550 },
      { id: "yew_shortbow", qty: 4, price: 890 },
      { id: "longbow", qty: 10, price: 190 },
      { id: "oak_longbow", qty: 10, price: 320 },
      { id: "willow_longbow", qty: 8, price: 470 },
      { id: "maple_longbow", qty: 6, price: 680 },
      { id: "yew_longbow", qty: 4, price: 1040 },
      /* The crossbows and the composite bows (unit XVII of PLAN.md). Lowe's
         really does keep the plain crossbow - the item page says so outright
         ("The crossbow and the bolts can be bought from Lowe's Archery Emporium
         in Varrock") - and this world has no other archery shop, so the rest of
         the ladder is here at the item's own value, the same stand-in the
         armour shop uses for the Barrows gear. The composite bows are Treasure
         Trail rewards in the live game, and there are no clue scrolls here, so
         they are on the same shelf for the same reason. */
      { id: "crossbow", qty: 10, price: 70 },
      { id: "bronze_crossbow", qty: 10, price: 73 },
      { id: "blurite_crossbow", qty: 8, price: 93 },
      { id: "phoenix_crossbow", qty: 10, price: 4 },
      { id: "iron_crossbow", qty: 8, price: 157 },
      { id: "steel_crossbow", qty: 6, price: 360 },
      { id: "mithril_crossbow", qty: 4, price: 783 },
      { id: "adamant_crossbow", qty: 3, price: 1767 },
      { id: "rune_crossbow", qty: 1, price: 16200 },
      { id: "dorgeshuun_crossbow", qty: 2, price: 2000 },
      { id: "hunters_crossbow", qty: 2, price: 1300 },
      { id: "willow_comp_bow", qty: 4, price: 300 },
      { id: "yew_comp_bow", qty: 2, price: 1800 },
      { id: "magic_comp_bow", qty: 1, price: 2500 },
      { id: "bronze_arrow", qty: 300, price: 3 },
      { id: "iron_arrow", qty: 300, price: 4 },
      { id: "steel_arrow", qty: 200, price: 7 },
      { id: "mithril_arrow", qty: 100, price: 12 },
      /* The top three rungs of the arrow ladder. Every metal arrow in the cache
         carries the same nominal value of **2 coins**, so the six metal rows wear
         the shop's own small markup ladder instead of a published price - and the
         top three are here because the ladder used to stop at mithril: this is
         the only archery shop in this world and nothing anywhere else sold or
         dropped an adamant or a rune arrow, so a character with a magic longbow
         could not buy arrows for it. The dragon arrow is the exception to the
         markup and wears its own published **800**, because it is the tier whose
         live-game source - dragon talons, at 90 Fletching - this world has no
         items for; Lowe's shelf is the same stand-in the dark bow just above
         uses. */
      { id: "adamant_arrow", qty: 50, price: 20 },
      { id: "rune_arrow", qty: 20, price: 35 },
      { id: "dragon_arrow", qty: 10, price: 800 },
      /* The bolts, the metal ones first and then the gem-tipped. A crossbow
         fires only bolts (src/items.js#METAL_BOLTS). Lowe now sells the **bolt
         tips** as well, because the fletching chain below cannot make all ten
         of them: opal, jade, pearl and red topaz are gems this world has no cut
         for, so their tips are bought rather than chipped (the other six are
         made from a cut gem with a chisel - see src/actions.js#makeBoltTips and
         the Fletching guide). Bolt racks are here too, which is what the bolt
         rack's own note in src/items.js always claimed the archery shop did. */
      { id: "bronze_bolts", qty: 500, price: 3 },
      { id: "blurite_bolts", qty: 200, price: 2 },
      { id: "silver_bolts", qty: 200, price: 5 },
      { id: "iron_bolts", qty: 300, price: 2 },
      { id: "steel_bolts", qty: 200, price: 8 },
      { id: "mithril_bolts", qty: 100, price: 20 },
      { id: "adamant_bolts", qty: 50, price: 58 },
      { id: "runite_bolts", qty: 20, price: 300 },
      { id: "barbed_bolts", qty: 20, price: 200 },
      { id: "bone_bolts", qty: 100, price: 3 },
      { id: "kebbit_bolts", qty: 100, price: 18 },
      { id: "long_kebbit_bolts", qty: 50, price: 31 },
      { id: "opal_bolts", qty: 100, price: 7 },
      { id: "jade_bolts", qty: 100, price: 12 },
      { id: "pearl_bolts", qty: 100, price: 13 },
      { id: "topaz_bolts", qty: 50, price: 22 },
      { id: "sapphire_bolts", qty: 50, price: 37 },
      { id: "emerald_bolts", qty: 50, price: 53 },
      { id: "ruby_bolts", qty: 30, price: 125 },
      { id: "diamond_bolts", qty: 20, price: 192 },
      { id: "dragon_bolts", qty: 10, price: 967 },
      { id: "onyx_bolts", qty: 5, price: 13633 },
      { id: "bolt_rack", qty: 50, price: 50 },
      /* The bolt tips that can be *made* are the six gems this world can cut -
         a chisel turns one cut gem into `tipPer` tips at the tip's own level
         (src/items.js#BOLT_TIP_FROM_GEM). The other four have no source here
         (rev 241's gem rocks and the opal/jade/pearl/topaz cuts are not in this
         world), so Lowe stocks all ten at the tip's own value and the chain is
         never blocked on one nobody can supply. */
      { id: "opal_bolt_tips", qty: 100, price: 7 },
      { id: "jade_bolt_tips", qty: 100, price: 10 },
      { id: "pearl_bolt_tips", qty: 100, price: 12 },
      { id: "topaz_bolt_tips", qty: 100, price: 13 },
      { id: "sapphire_bolt_tips", qty: 100, price: 17 },
      { id: "emerald_bolt_tips", qty: 100, price: 33 },
      { id: "ruby_bolt_tips", qty: 50, price: 67 },
      { id: "diamond_bolt_tips", qty: 50, price: 133 },
      { id: "dragon_bolt_tips", qty: 20, price: 667 },
      { id: "onyx_bolt_tips", qty: 10, price: 1000 },
      /* The thrown weapons (src/items.js#THROWN), every metal of all four
         families - a dart, a knife, a throwing axe and a javelin - at the
         item's own value, the same stand-in the crossbows and composite bows
         above use. Lowe is the only archery shop in this world, and a thrown
         weapon *is* its ammunition, so a ranger who fights that way buys them
         here or not at all. */
      { id: "bronze_dart", qty: 500, price: 1 },
      { id: "iron_dart", qty: 400, price: 2 },
      { id: "steel_dart", qty: 300, price: 10 },
      { id: "mithril_dart", qty: 200, price: 25 },
      { id: "adamant_dart", qty: 100, price: 65 },
      { id: "rune_dart", qty: 50, price: 350 },
      { id: "bronze_knife", qty: 400, price: 1 },
      { id: "iron_knife", qty: 300, price: 3 },
      { id: "steel_knife", qty: 200, price: 11 },
      { id: "mithril_knife", qty: 150, price: 27 },
      { id: "adamant_knife", qty: 100, price: 66 },
      { id: "rune_knife", qty: 50, price: 167 },
      { id: "bronze_thrownaxe", qty: 200, price: 3 },
      { id: "iron_thrownaxe", qty: 150, price: 7 },
      { id: "steel_thrownaxe", qty: 100, price: 26 },
      { id: "mithril_thrownaxe", qty: 50, price: 70 },
      { id: "adamant_thrownaxe", qty: 25, price: 176 },
      { id: "rune_thrownaxe", qty: 10, price: 440 },
      { id: "bronze_javelin", qty: 200, price: 4 },
      { id: "iron_javelin", qty: 150, price: 6 },
      { id: "steel_javelin", qty: 100, price: 24 },
      { id: "mithril_javelin", qty: 50, price: 64 },
      { id: "adamant_javelin", qty: 25, price: 160 },
      { id: "rune_javelin", qty: 10, price: 400 },
      /* The two bows that are not made of logs (src/items.js): the dark bow and
         the Seercull. The dark bow is a dark-beast drop and the Seercull a
         Fremennik one in the live game, and neither creature is in this world -
         so they sit on Lowe's shelf at their own values, the same stand-in the
         Barrows gear and the composite bows use. */
      { id: "dark_bow", qty: 1, price: 120002 },
      { id: "seercull", qty: 2, price: 8000 },
      { id: "arrow_shaft", qty: 500, price: 2 },
      { id: "headless_arrow", qty: 300, price: 3 },
      { id: "bow_string", qty: 100, price: 60 },
      { id: "flax", qty: 200, price: 10 },
      { id: "leather_body", qty: 10, price: 65 },
      { id: "leather_chaps", qty: 10, price: 65 },
      { id: "leather_coif", qty: 10, price: 35 },
      { id: "studded_body", qty: 6, price: 350 },
      { id: "studded_chaps", qty: 6, price: 260 },
      { id: "coif", qty: 8, price: 130 },
      /* The ranger's boot and wrist slots (unit L of PLAN.md). The shopkeeper
         keeps the leathers the vambraces are cut from, and the pieces the cache
         calls "vamb" are here rather than at a Crafting bench because this
         world has no needle-and-thread recipe for them yet (see unit K of
         PLAN.md); the d'hide vambraces are 57 Crafting and the snakeskin pair
         45-47 Crafting in the live game. Ranger boots and frog-leather boots
         are clue and Temple of Ikov rewards there - sold here at their own
         values, the same stand-in the Magic Guild uses. */
      { id: "snakeskin_boots", qty: 6, price: 250 },
      { id: "snakeskin_vambraces", qty: 6, price: 434 },
      { id: "frog_leather_boots", qty: 6, price: 200 },
      { id: "ranger_boots", qty: 2, price: 200 },
      { id: "green_dhide_vambraces", qty: 6, price: 2500 },
      { id: "blue_dhide_vambraces", qty: 4, price: 3000 },
      { id: "red_dhide_vambraces", qty: 3, price: 3600 },
      { id: "black_dhide_vambraces", qty: 2, price: 4320 },
    ],
  },
  fishing: {
    name: "Fishing Shop",
    /* Gerrant's Fishy Business (scripts/areas/area_port_sarim/scripts/
       gerrant.rs2), minus the members' lava-eel branch. */
    talk: {
      ask: ["Welcome! You can buy fishing equipment at my store.", "We'll also buy anything you catch off you."],
      yes: "Let's see what you've got then.",
      answer: [],
      no: "Sorry, I'm not interested.",
    },
    sellRate: 0.5,
    stock: [
      { id: "small_fishing_net", qty: 20, price: 8 },
      { id: "fishing_rod", qty: 20, price: 8 },
      { id: "fly_fishing_rod", qty: 20, price: 8 },
      { id: "harpoon", qty: 10, price: 8 },
      { id: "lobster_pot", qty: 10, price: 8 },
      { id: "big_fishing_net", qty: 10, price: 20 },
      { id: "oily_fishing_rod", qty: 5, price: 50 },
      { id: "karambwan_vessel", qty: 10, price: 8 },
      { id: "feather", qty: 500, price: 3 },
      { id: "fishing_bait", qty: 1000, price: 3 },
      { id: "knife", qty: 20, price: 10 },
    ],
  },
  food: {
    name: "Food Store",
    /* Wydin's food store (scripts/areas/area_port_sarim/scripts/wydin.rs2),
       the "Yes please." branch. */
    talk: {
      ask: "Welcome to my food store! Would you like to buy anything?",
      yes: "Yes please.",
      answer: [],
      no: "No, thank you.",
    },
    sellRate: 0.5,
    stock: [
      { id: "bread", qty: 30, price: 18 },
      { id: "cake", qty: 10, price: 75 },
      { id: "chocolate_cake", qty: 8, price: 110 },
      { id: "plain_pizza", qty: 8, price: 60 },
      { id: "meat_pizza", qty: 6, price: 70 },
      { id: "anchovy_pizza", qty: 6, price: 80 },
      { id: "apple_pie", qty: 6, price: 60 },
      { id: "redberry_pie", qty: 6, price: 40 },
      { id: "meat_pie", qty: 6, price: 50 },
      { id: "cheese", qty: 30, price: 14 },
      { id: "cooked_meat", qty: 20, price: 30 },
      { id: "cooked_chicken", qty: 20, price: 22 },
      { id: "shrimp", qty: 15, price: 90 },
      { id: "trout", qty: 10, price: 200 },
      { id: "apple", qty: 20, price: 10 },
      { id: "banana", qty: 20, price: 10 },
      { id: "peaches", qty: 20, price: 8 },
    ],
  },
  /* The kitchen's cook: every raw food in the world, the baking and pie and
     cake ingredients, and the cooking equipment - flour, eggs and milk for the
     dough, bread dough, pastry dough and pizza bases for the pies, redberries, cooking apples
     and chocolate for the fillings, grapes, the stew veg and spice, and the
     chef's hat itself. He trades through the standard shop dialogue (Trade on
     his menu, talk first like every other keeper). */
  cook: {
    name: "Cook's Kitchen Supplies",
    talk: {
      ask: "Hello! I sell cooking supplies - everything a cook needs.",
      yes: "Can I see what you've got?",
      answer: "Take a look.",
      no: "No thanks, I'm just browsing.",
    },
    sellRate: 0.5,
    stock: [
      { id: "pot_of_flour", qty: 30, price: 10 },
      { id: "eggs", qty: 30, price: 8 },
      { id: "bucket_of_milk", qty: 30, price: 10 },
      { id: "bread_dough", qty: 20, price: 8 },
      { id: "pastry_dough", qty: 20, price: 8 },
      { id: "pizza_base", qty: 20, price: 8 },
      { id: "pitta_dough", qty: 20, price: 8 },
      { id: "pie_dish", qty: 10, price: 15 },
      { id: "pie_shell", qty: 20, price: 8 },
      { id: "cake_tin", qty: 10, price: 15 },
      { id: "redberries", qty: 30, price: 5 },
      { id: "apple", qty: 30, price: 10 },
      { id: "grapes", qty: 20, price: 4 },
      { id: "chocolate_bar", qty: 10, price: 20 },
      { id: "potato", qty: 30, price: 4 },
      { id: "onion", qty: 30, price: 6 },
      { id: "tomato", qty: 30, price: 8 },
      { id: "cabbage", qty: 30, price: 4 },
      { id: "garlic", qty: 20, price: 6 },
      { id: "spice", qty: 10, price: 250 },
      { id: "cheese", qty: 20, price: 14 },
      { id: "raw_beef", qty: 20, price: 12 },
      { id: "raw_chicken", qty: 20, price: 8 },
      { id: "raw_bear_meat", qty: 10, price: 4 },
      { id: "raw_duck", qty: 10, price: 10 },
      { id: "raw_mutton", qty: 10, price: 10 },
      { id: "raw_shrimp", qty: 20, price: 30 },
      { id: "raw_sardine", qty: 15, price: 60 },
      { id: "raw_herring", qty: 15, price: 90 },
      { id: "raw_anchovies", qty: 15, price: 120 },
      { id: "raw_trout", qty: 10, price: 150 },
      { id: "raw_salmon", qty: 10, price: 210 },
      { id: "raw_pike", qty: 10, price: 180 },
      { id: "raw_tuna", qty: 10, price: 240 },
      { id: "raw_lobster", qty: 10, price: 270 },
      { id: "raw_swordfish", qty: 5, price: 300 },
      { id: "bowl", qty: 10, price: 8 },
      { id: "pot", qty: 10, price: 5 },
      { id: "jug", qty: 10, price: 5 },
      { id: "bucket", qty: 10, price: 5 },
      { id: "knife", qty: 10, price: 12 },
      { id: "chef_hat", qty: 10, price: 10 },
      { id: "bread", qty: 20, price: 18 },
    ],
  },
  /* The town herbalist, who keeps a space on the market square's north row
     (Herblore, unit T12; src/world.js). Her stall is the skill's whole supply
     chain in one
     place, which the live game spreads over the wilderness, Karamja, Mort Myre
     and a dozen monster drop tables: the grimy herbs (clean them yourself - that
     is the point), the vials, a pestle and mortar, and every secondary the
     twenty-two potions need that no creature here drops. The *free* paths stay
     the real ones - limpwurt roots from hobgoblins, unicorn horns from unicorns,
     grimy herbs off the druids and chaos druids - and her prices are this
     world's own (she is a stand-in for sources this map has no region for), set
     a little over each item's value. */
  herbalist: {
    name: "Herbalist",
    /* The live game has no herbalist page to transcribe - the trade has no
       shopkeeper of its own in this era - so this follows the general store's
       three-line shape (scripts/shop/scripts/generalshop.rs2) in the trade's
       own words. */
    talk: {
      ask: "Can I help you at all?",
      yes: "Yes please. What have you got?",
      answer: "Take a look.",
      no: "No thanks.",
    },
    sellRate: 0.5,
    stock: [
      { id: "grimy_guam_leaf", qty: 20, price: 18 },
      { id: "grimy_marrentill", qty: 20, price: 19 },
      { id: "grimy_tarromin", qty: 20, price: 20 },
      { id: "grimy_harralander", qty: 20, price: 21 },
      { id: "grimy_ranarr_weed", qty: 10, price: 35 },
      { id: "grimy_toadflax", qty: 10, price: 24 },
      { id: "grimy_irit_leaf", qty: 10, price: 22 },
      { id: "grimy_avantoe", qty: 10, price: 23 },
      { id: "grimy_kwuarm", qty: 10, price: 25 },
      { id: "grimy_snapdragon", qty: 5, price: 26 },
      { id: "grimy_cadantine", qty: 5, price: 27 },
      { id: "grimy_lantadyme", qty: 5, price: 28 },
      { id: "grimy_dwarf_weed", qty: 5, price: 29 },
      { id: "grimy_torstol", qty: 5, price: 30 },
      { id: "vial", qty: 100, price: 3 },
      { id: "vial_of_water", qty: 100, price: 4 },
      { id: "pestle_and_mortar", qty: 5, price: 6 },
      { id: "eye_of_newt", qty: 100, price: 4 },
      { id: "limpwurt_root", qty: 20, price: 10 },
      { id: "red_spiders_eggs", qty: 20, price: 10 },
      { id: "chocolate_bar", qty: 20, price: 12 },
      { id: "white_berries", qty: 20, price: 14 },
      { id: "toads_legs", qty: 20, price: 4 },
      { id: "goat_horn_dust", qty: 20, price: 16 },
      { id: "snape_grass", qty: 20, price: 14 },
      { id: "mort_myre_fungus", qty: 20, price: 3 },
      { id: "blue_dragon_scale", qty: 20, price: 60 },
      { id: "wine_of_zamorak", qty: 20, price: 3 },
      { id: "potato_cactus", qty: 20, price: 3 },
      { id: "jangerberries", qty: 20, price: 3 },
      { id: "crushed_nest", qty: 5, price: 220 },
      /* The three Farming produce the two stronger weapon poisons are built
         from, and the vial they are mixed in. In the live game all four are
         grown or cracked rather than bought (see src/items.js), and this map
         has no patch or palm tree, so the herbalist's counter keeps them - the
         same stand-in the blue dragon scale takes, at the same one-fifth-over
         price. */
      { id: "cactus_spine", qty: 20, price: 3 },
      { id: "cave_nightshade", qty: 10, price: 40 },
      { id: "poison_ivy_berries", qty: 10, price: 80 },
      { id: "coconut_milk", qty: 20, price: 3 },
    ],
  },
  /* The town's clothier, north of the bank (src/world.js). The capes are here
     because there is nowhere else for them to be: the seven dyed capes come
     from a clothes shop in the live game too, and the Cape of Legends is a
     Legends' Guild award this world has no guild to hand out - the clothier's
     rack is its stand-in, at the cape's own value. */
  clothes: {
    name: "Clothes Shop",
    /* Thessalia's fine clothes, the branch that leads to the counter
       (scripts/areas/area_varrock/scripts/thessalia.rs2). */
    talk: {
      ask: "Do you want to buy any fine clothes?",
      yes: "What have you got?",
      answer: [],
      no: "No, thank you.",
    },
    sellRate: 0.5,
    stock: [
      { id: "red_cape", qty: 10, price: 2 },
      { id: "black_cape", qty: 10, price: 7 },
      { id: "blue_cape", qty: 10, price: 32 },
      { id: "yellow_cape", qty: 10, price: 32 },
      { id: "green_cape", qty: 10, price: 32 },
      { id: "purple_cape", qty: 10, price: 32 },
      { id: "orange_cape", qty: 10, price: 32 },
      { id: "cape_of_legends", qty: 1, price: 450 },
      { id: "leather_body", qty: 10, price: 42 },
      { id: "leather_chaps", qty: 10, price: 38 },
      { id: "leather_coif", qty: 10, price: 22 },
      { id: "leather_vambraces", qty: 10, price: 24 },
      /* The five dyed leather gloves (src/items.js). The clothier already sells
         the seven dyed capes and the leather set - the same rack the cache's
         own clothes shop carries - so the dyed gloves belong on it; their 500gp
         is the cache's own price. They are the only glove in the world a player
         can buy, and the only reason to pick a colour over the 6gp leather pair
         is the dye. */
      { id: "grey_gloves", qty: 10, price: 500 },
      { id: "red_gloves", qty: 10, price: 500 },
      { id: "yellow_gloves", qty: 10, price: 500 },
      { id: "teal_gloves", qty: 10, price: 500 },
      { id: "purple_gloves", qty: 10, price: 500 },
    ],
  },

  /* The capes of accomplishment. Every one of the 24 is on the shelf - the
     plain cut, its gold-trimmed (t) cut and the hood that goes with it - and
     the price is the item's own 99,000 coins; above them all sits the Max cape
     at 99,000 per skill mastered (2,277,000 for this world's 23), gated on 99
     in every skill at once. What is *not* on the shelf is a
     right to buy one: `req` on each cape is level 99 in its own skill
     (src/items.js), so the seller's stock is the whole list and the level is
     the gate (see `skillcapeCanBuy` below, which the shop asks before it takes
     the coins - `shopBuyCheck` in src/ui.js#buyFromShop). The (t) cut is the
     one extra rule: a second skill at 99 is what unlocks the trim, exactly as
     the live game's masters do it. The hood rides along free with the cape
     (`skillcapeBought`), which is why it is also on the shelf at its own value
     of one coin - that is what a replacement costs.

     The seller is Mac (src/world.js, his own baked model and mechanics), and his
     conversation is this world's own words: the age has no script for it, and
     the live game has no single cape-master to transcribe (each master sells
     their own cape). He asks the one question that matters. */
  skillcape: {
    name: "Capes of Accomplishment",
    talk: {
      ask: "A cape of accomplishment? They are not bought with coin alone - you must have mastered the skill.",
      yes: "I have.",
      answer: "Then let us see what you have made of yourself.",
      no: "Not yet.",
      decline: "Come back when you have something to be proud of.",
    },
    sellRate: 0.1,
    stock: capeStock(),
  },
};

/* ------------------------------------------------------------ a shop's talk

   Every vendor's conversation is the live game's own shop script: the keeper
   asks a question, the player picks one of two answers, and the answer either
   opens the counter or declines it. The words live on the shop row above
   (`talk`), because they are the trade's, and this is the one place that turns
   them into a conversation. The interface opens *after* the box closes, which
   is the order the client does it in (`~chatplayer` then `~openshop_activenpc`,
   the box already gone by the time the window is up).

   A shop whose `answer` is empty is one whose script opens the counter straight
   off the player's own line - the sword shop and Lowe's both do - so the
   player's box carries the hand-off instead of a reply. */
function shopScreens(shop, open) {
  const t = shop.talk;
  const yes = [{ who: "player", lines: [t.yes] }];
  if (t.answer && t.answer.length) yes.push({ who: "npc", lines: t.answer, next: then(open) });
  else yes[yes.length - 1].next = then(open);
  const no = [{ who: "player", lines: [t.no] }];
  if (t.decline && t.decline.length) no.push({ who: "npc", lines: t.decline });
  return [{
    who: "npc",
    lines: [].concat(t.ask),
    options: [
      { text: t.yes, go: yes },
      { text: t.no, go: no },
    ],
  }];
}

/* The banker, from the game's own `talk_to_banker` (scripts/interface_bank/
   scripts/banker.rs2): the two questions a player asks at the counter, and the
   second one's own two follow-ups, including the Bank of Varrock's sign. */
function bankerScreens(open) {
  const place = [
    { who: "player", lines: ["What is this place?"] },
    { who: "npc", lines: "This is a branch of the Bank of RuneScape. We have branches in many towns.", options: [
      { text: "And what do you do?", go: [
        { who: "player", lines: ["And what do you do?"] },
        { who: "npc", lines: "We will look after your items and money for you. Leave your valuables with us if you want to keep them safe." },
      ] },
      { text: "Didn't you used to be called the Bank of Varrock?", go: [
        { who: "player", lines: ["Didn't you used to be called the Bank of Varrock?"] },
        { who: "npc", lines: "Yes we did, but people kept on coming into our branches outside of Varrock and telling us that our signs were wrong." },
        { who: "npc", lines: "They acted as if we didn't know what town we were in or something." },
      ] },
    ] },
  ];
  return [{
    who: "npc",
    lines: "Good day, how may I help you?",
    options: [
      { text: "I'd like to access my bank account, please.", go: [
        { who: "player", lines: ["I'd like to access my bank account, please."] },
        then(open),
      ] },
      { text: "What is this place?", go: place },
    ],
  }];
}

/* Bob's own conversation, transcribed from the live game's own script
   (scripts/areas/area_lumbridge/scripts/bob.rs2). Bob is the one vendor whose
   talk is not the two-line `talk` shape: his script branches three ways, so his
   greeting is a three-option box - a joke quest ("Get yer own!"), the counter
   (the second option is what reaches the shop, after his line, exactly where
   the script's own `~openshop_activenpc` sits), and his offer to repair an axe.
   That third branch's repair half is the script's `use an item on Bob` handler,
   which this world cannot reach: nothing in it ever breaks an axe, so the offer
   stands as the line the game gives when you ask, and leads nowhere. */
function bobScreens(open) {
  return [{
    ...npc("Hello. How can I help you?"),
    options: [
      opt("Give me a quest!", [
        player("Give me a quest!"),
        npc("Get yer own!"),
      ]),
      opt("Have you anything to sell?", [
        player("Have you anything to sell?"),
        npc("Yes! I buy and sell axes! Take your pick (or axe)!", { next: then(open) }),
      ]),
      opt("Can you repair my items for me?", [
        player("Can you repair my items for me?"),
        npc("Of course I'll repair it, though the materials may cost you. Just hand me the item and I'll have a look."),
      ]),
    ],
  }];
}

/* The Makeover Mage, beside the Wise Old Man in the market square: talking to
   her opens the character-design screen, where the skin colour row sits among
   the other colours. */
function mageScreens() {
  const open = () => { if (!DesignScreen.show()) chat("The makeover mirror is unavailable.", "warn"); };
  return [{
    ...npc("Hello! I am the Makeover Mage. I can change your whole look - hair, clothes, even your skin - and it won't cost you a coin!"),
    options: [
      opt("Change my appearance.", [
        player("Change my appearance."),
        npc("Step in front of the mirror, then, and choose!", { next: then(open) }),
      ]),
      opt("No thanks.", [
        player("No thanks."),
        npc("Come back any time, dearie!"),
      ]),
    ],
  }];
}

/* Wizard Thormac, who keeps by the eastern magic tree: his
   greeting names the trade, the first option reaches it (the enchant window
   opens on a clear screen, after his line, the way Bob's counter does), the
   second is what a mystic staff is, and the third sends the player off. */
function thormacScreens() {
  const open = () => openThormacMenu();
  return [{
    ...npc(["Greetings, traveller. I am Thormac, an enchanter", "of staves. Bring me an elemental battlestaff and", "40,000 coins, and I will make it a mystic staff."]),
    options: [
      opt("Please enchant my staves.", [
        player("Please enchant my staves."),
        npc("With pleasure.", { next: then(open) }),
      ]),
      opt("What does a mystic staff do?", [
        player("What does a mystic staff do?"),
        npc(["A mystic staff strikes truer and casts with greater", "force than the battlestaff it is made from. Air,", "water, earth and fire - aye, and lava and mud", "besides."]),
      ]),
      opt("No thanks.", [
        player("No thanks."),
        npc("Very well. The grove will keep me busy until you return."),
      ]),
    ],
  }];
}

/* ------------------------------------------------------- Fred, and his quest

   Fred the Farmer's conversation
   (scripts/areas/area_lumbridge/scripts/fred_the_farmer.rs2). He is this
   world's first quest giver, which is why he is not in `NPC_TALK` with the
   other townsfolk: his talk is a **function of the quest's state**, so
   `fredScreens` reads it once, as the box opens, and hands back one of three
   trees - `fredStart` (state 0: the greeting and the offer), `fredProgress`
   (state 1: the hand-in, and what is left to do) and `fredAfterQuest` (state 2:
   the man himself, with the quest behind him). The state itself lives in
   src/quests.js, and nothing here ever reads `ps.quests` directly.

   The words are the era's own script, cross-checked against the live quest
   transcript, and the trees follow that script's own branch points: the "not
   very exciting" and "What do you mean, The Thing?" detours both loop back to
   the same "Yes okay. I can do that." label, as the script writes it.

   Three things are this world's own judgement rather than a transcription, and
   each says so where it lives: the **shears gift** (the era's script leaves the
   player to buy them from the general store, and the hand-out is the live
   game's own later line - kept because it is what makes the quest doable
   without a shop visit), the **single-`then` hand-in** (the script takes one
   ball a tick with the interface closed and this dialogue box cannot do that
   mid-sentence), and the **journal's wording** (src/quests.js). */
function fredScreens(who) {
  const ps = G.ps;
  const state = questState(ps, "sheep_shearer");
  if (state >= QUEST_COMPLETE) return fredAfterQuest();
  if (state >= QUEST_STARTED) return fredProgress(ps, who);
  return fredStart(who);
}

/* "I'm looking for something to kill." and "I'm lost.": the greeting's other
   two answers, and the only two options Fred has once the quest is behind him
   (`fred_something_to_kill` / `fred_im_lost`, the script's own labels). */
function fredKillScreens() {
  return [
    player("I'm looking for something to kill."),
    npc("What, on my land? Leave my livestock alone you scoundrel!"),
  ];
}

function fredLostScreens() {
  return [
    player("I'm lost."),
    npc("How can you be lost? Just follow the road east and south. You'll end up in Lumbridge fairly quickly."),
  ];
}

/* "Yes okay. I can do that." - the script's `fred_yes_okay` label, with the
   shears hand-out folded into it. The pair lands in the pack as the line about
   it is *read* (`onShow`), not after the box goes, so a player who reads the
   line and clicks away still has them; a player who already owns a pair is told
   so rather than being handed a second one (the live game's own branch). The
   accept runs as a `then`, so the state change and the journal's flash land on
   a clear screen rather than under the box that caused them. */
function fredYesScreens() {
  const ps = G.ps;
  const out = [player("Yes okay. I can do that.")];
  if (invCount(ps, "shears") > 0) {
    out.push(npc("Good! You're half way there already - you have a set of shears in your inventory. Just use them on one of my sheep."));
  } else {
    out.push(npc("Well, first things first, you need a pair of shears. I've got some here you can use.", {
      onShow: () => {
        if (invCount(ps, "shears") > 0) return;
        invAdd(ps, "shears", 1);
        mark("inv");
      },
    }));
    out.push(say("Fred gives you a set of shears."));
  }
  out.push(npc("Ok I'll see you when you have some wool."));
  out.push(then(fredAccept));
  return out;
}

/* The accept, run with the box already down (it is a `then`). */
function fredAccept() {
  const ps = G.ps;
  if (!ps) return;
  setQuestState(ps, "sheep_shearer", QUEST_STARTED);
  mark("quests");
  UI.flashTabs.add(2);
}

/* State 0: the greeting, the offer, and the two detours the script writes
   around it. `yes` is built once so all three branch points reach the same
   label, as the script's `@multi3` / `@multi2` do. */
function fredStart(who) {
  const yes = fredYesScreens();
  const excitement = [
    player("That doesn't sound a very exciting quest."),
    npc("Well what do you expect if you ask a farmer for a quest? Now are you going to help me or not?", {
      options: [
        opt("Yes okay. I can do that.", yes),
        opt("No, I'll give it a miss.", [player("No, I'll give it a miss.")]),
      ],
    }),
  ];
  const theThing = [
    player("What do you mean, The Thing?"),
    npc("I wouldn't worry about it. Something ate all the previous shearers. They probably got unlucky. So are you going to help me?", {
      options: [
        opt("Yes okay. I can do that.", yes),
        opt("Erm, I'm a bit worried about this thing.", [
          player("Erm, I'm a bit worried about this thing."),
          npc("I'm sure it's nothing to worry about. It's possible the other shearers aren't dead at all. And are just hiding in the woods or something."),
          player("I'm not convinced."),
        ]),
      ],
    }),
  ];
  return [
    npc("What are you doing on my land? You're not the one keeps leaving all my gates open and letting out all my sheep?", {
      options: [
        opt("I'm looking for a quest.", [
          player("I'm looking for a quest."),
          npc("You're after a quest, you say? Actually I could do with a bit of help."),
          npc("My sheep are getting mighty woolly. I'd be much obliged if you could shear them. And while you're at it spin the wool for me too."),
          npc("Yes, that's it. Bring me 20 balls of wool. And I'm sure I could sort out some sort of payment. Of course, there's the small matter of The Thing.", {
            options: [
              opt("Yes okay. I can do that.", yes),
              opt("That doesn't sound a very exciting quest.", excitement),
              opt("What do you mean, The Thing?", theThing),
            ],
          }),
        ]),
        opt("I'm looking for something to kill.", fredKillScreens()),
        opt("I'm lost.", fredLostScreens()),
      ],
    }),
  ];
}

/* State 1: mid-quest. The script's `fred_progressed` - if the pack holds wool
   he takes the lot (see `fredHandIn`), and if it holds none he has nothing to
   do but ask after the sheep. */
function fredProgress(ps, who) {
  if (invCount(ps, "ball_of_wool") > 0) {
    return [
      npc("How are you doing getting those balls of wool?"),
      player("I have some."),
      npc("Give 'em here then.", {
        next: then(() => {
          fredTakeWool(ps);
          startDialogue(who, fredHandIn());
        }),
      }),
    ];
  }
  return [
    npc("How are you doing getting those balls of wool?"),
    player("I haven't got any at the moment."),
    npc("Ah well at least you haven't been eaten."),
  ];
}

/* Take the wool. It runs with the box already down (its caller is a `then`),
   which is the only moment the chat line can be printed: `ui.js#chat` holds a
   line back while a dialogue is up, so a message sent between the two boxes
   would be swallowed by the first. The count is capped at the 20 Fred asked
   for, so a player who brings more keeps the rest. */
function fredTakeWool(ps) {
  const want = SHEEP_SHEARER_WOOL - sheepShearerWool(ps);
  if (want <= 0) return 0;
  const given = invRemove(ps, "ball_of_wool", want);
  if (given <= 0) return 0;
  setSheepShearerWool(ps, sheepShearerWool(ps) + given);
  mark("inv", "quests");
  chat("You give Fred " + given + (given === 1 ? " ball" : " balls") + " of wool.", "game");
  return given;
}

/* The box that follows the hand-in, opened fresh by `fredProgress`'s `then`.
   The payment pair if that was the twentieth ball, and the "how many more" pair
   if it was not - which is what makes a half-finished hand-in something a
   player can walk away from and come back to: the count lives in
   `ps.quests.sheep_shearer_wool` (src/quests.js#sheepShearerWool). */
function fredHandIn() {
  const ps = G.ps;
  if (sheepShearerWool(ps) >= SHEEP_SHEARER_WOOL) {
    return [
      player("That's the last of them."),
      npc("I guess I'd better pay you then."),
      then(fredReward),
    ];
  }
  const left = SHEEP_SHEARER_WOOL - sheepShearerWool(ps);
  return [
    player("That's all I've got so far."),
    npc("I need " + left + " more before I can pay you."),
    player("Ok, I'll work on it."),
  ];
}

/* The reward, as a `then` so the completion lines land in the chat log on a
   clear screen. The quest's own figures (`quest_sheep.rs2`): one quest point,
   60 coins and 150 Crafting experience - the coins are ordinary coins and count
   towards the coins-earned stat, exactly as a pickpocket's do. The live game
   also pays 50 more Crafting experience when the player spun the balls
   themselves; this world does not model it, because an item here carries no
   record of who made it. */
function fredReward() {
  const ps = G.ps;
  const def = QUESTS.find((q) => q.id === "sheep_shearer");
  if (!ps || !def) return;
  setQuestState(ps, "sheep_shearer", QUEST_COMPLETE);
  addQuestPoints(ps, def.points);
  invAdd(ps, "coins", SHEEP_SHEARER_COINS);
  ps.stats.gpEarned = (ps.stats.gpEarned || 0) + SHEEP_SHEARER_COINS;
  addXp(ps, "crafting", SHEEP_SHEARER_XP);
  mark("inv", "skills", "quests");
  UI.flashTabs.add(2);
  chat("Congratulations, you have completed the Sheep Shearer quest!", "lvlup");
  chat("You are awarded " + def.points + " quest point.", "lvlup");
}

/* State 2: the quest behind him, Fred is just the man on his land again
   (`fred_post_quest`, whose greeting is shorter than the first one's). */
function fredAfterQuest() {
  return [
    npc("What are you doing on my land?", {
      options: [
        opt("I'm looking for something to kill.", fredKillScreens()),
        opt("I'm lost.", fredLostScreens()),
      ],
    }),
  ];
}

/* --------------------------------------------------------------- npc interaction */

/* The NPCs that have something to say - the list's own keys are the definition,
   and the right-click menu shows a Talk-to option for them. A vendor gets one
   too, from the `shop` its spawn carries, because serving you is itself a way
   of being spoken to (see interactNpc). The farm animals and the pests
   deliberately have no lines: a cow is not someone you can have a conversation
   with, so a cow's only options are Attack and Examine. (This also removes the
   trap where "talking" to a cow looked like an attack that dealt no damage -
   i.e. a cow with unlimited life.) */
const NPC_LINES = {
  man: ["Hello there.", "Nice weather we're having.", "I'm a bit busy right now."],
  woman: ["Good day to you.", "Have you been to the bank yet?", "Mind the goblins south of town."],
  child: ["Can you teach me to fight?", "I'm not allowed south of the river!", "I can run faster than you!"],
  guard: ["Move along, citizen.", "Keep your weapon sheathed in town.", "Mind the goblins to the south."],
  banker: ["Good day. How may I help you?", "Your items are safe with us."],
  shopkeeper: ["Welcome to my shop!", "Take a look at my wares."],
  goblin: ["Grrr!", "Nasty human!"],
  gas_goblin: ["You joinin' the march, humie? G.A.S. meets at sundown. Bring yer own hands.", "Shovels! First they take the diggin', next they'll take the holes themselves!", "Me cousin used a shovel once. Once. We don't talk about him no more.", "Sign the petition, humie! Written in mud. Real mud. None of yer paper nonsense.", "Used to dig six holes a day, me. SIX. Now I supervise the... the standin' here.", "The foreman says 'adapt'. I says the foreman can kiss me blisters."],

  /* The town's own people (src/PLAN.md unit J). Each one is written in the
     voice its own name promises, because the point of this row is that the
     town stops being scenery: a fisherman talks about the river, the
     apprentice about his master, and Hans - the servant every 2007 player met
     first - about the town itself. */
  hans: ["Hello. What are you doing here?", "I'm the servant of the Duke of Lumbridge.", "This town is a lot busier than it used to be."],
  lumbridge_guide: ["Welcome to Lumbridge, adventurer!", "There are many things to do here, but be careful out there.", "Talk to the townsfolk - most of them have something to say."],
  cook: ["I'm far too busy to talk now.", "The Duke will be wanting his dinner before long.", "If you find any ingredients, bring them to me."],
  fisherman: ["I've been fishing these waters for years.", "The trout are biting further upstream.", "You'll be wanting a rod if you mean to fish."],
  miner: ["Mind the rocks - some of them are worth more than they look.", "You'll need a pickaxe to make a start.", "The deeper seams hold the better ore. And the worse company."],
  beggar: ["Spare a coin for a poor man?", "Bless you, friend.", "It's a hard life, it is."],
  schoolgirl: ["Have you seen the sheep?", "My brother says there are goblins down south.", "Don't tell my mother where I've got to."],
  gardener: ["Mind the flowerbeds, please.", "The churchyard doesn't weed itself.", "I've been tending this ground since before you were born."],
  shop_assistant: ["Can I help you find anything?", "Ask the owner if you want to buy something.", "We've just had a delivery of armour in."],
  apprentice: ["The master says I'm not ready for real spells yet.", "I'm only allowed to practise on the rats.", "Don't touch anything - he'll know."],
  drunken_man: ["*hic* Good evening... or is it morning?", "Have you tried the ale in this town? *hic*", "I'm not drunk, I'm just... resting my eyes."],
  /* Solus Dellagar, south of the grove: the Wanted! quest's warrior-mage,
     keeping to the quiet ground well clear of the god's fight. */
  solus_dellagar: ["Well met, traveller.", "I walked here from Burthorpe, if you can believe it.", "The grove is restless of late. I keep to the south path."],
  surok_magis: ["You should not be speaking to me.", "My work here is... delicate.", "The stones remember more than the seers admit."],
  surok_magis_dagonhai: ["The Dagon'hai watch from below.", "You wear the ignorance of the surface well.", "Ask nothing of the deep orders."],
  /* The Duke of Lumbridge, by the sheep pen (src/world.js): outraged at the
     sight of a spinning wheel that is not the King's. His line, word for
     word as the user wrote it. */
  duke: ["How dare you craft your own spinning wheel? How dare you not use the KING'S CAPITAL??"],

  /* The tanner (src/PLAN.md unit O). Talking to him opens his trade rather than
     a line - see src/actions.js#openTanMenu - so these are what he says when
     there is nothing to tan, which is the only time his own voice is heard. */
  tanner: ["Bring me a hide and I'll tan it for you.", "Cowhide, dragonhide - I'll tan the lot.", "You don't have any hides for me to tan."],
  /* Hatius Cosaintus, keeper of the coin shrine north-east of the market:
     the cache's own 3rd-age fop (build-95 npc 5523) - "hate us 'cause they
     ain't us", three clue scrolls, all of it. He brags about the gold, and
     the bragging keeps sliding into the truth: sitting with a pile teaches
     you who keeps whom. */
  hiatus: ["Three clue scrolls, friend. Three. Most people open hundreds and get buttons and beige. I got third age. Some of us are simply built different.", "You know what they say - hate us 'cause they ain't us. ...Do you ever wonder if they're right to, though? I do. Every evening. Between seven and... seven. Anyway. Don't touch the pile.", "I come down here to sit with the gold. Someone has to. Hours I sit. Days. You start to wonder who's keeping whom, you know? Crassus gets it - he sits by it all day and wants nothing from it. Stupid animal. Perfect animal. ...What were we talking about? Right. Me."],
  /* Crassus, his yellow cat: the cache gives it Talk-to, so it says what a
     cat says. */
  crassus: ["Meow.", "Purr...", "Mew!"],
};

/* People who are talked to through a branch of their own in interactNpc rather
   than through NPC_TALK or NPC_LINES: the banker and the tanner open an
   interface, the vendors serve from a counter, and Bob and Fred each run a
   conversation that has to *do* something as well as speak (Bob's opens his
   shop, Fred's counts wool). Every one of them still needs a Talk-to option in
   the right-click menu, and this is the list the menu consults for the ones
   with no lines of their own to look up. Keep it in step with the branches in
   interactNpc below. */
const TALK_BRANCHES = new Set(["banker", "tanner", "bob", "fred", "makeover_mage", "thormac", "sedridor", "jered", "scorpius"]);

/* The creature on tile (tx, tz). `prefer` is the creature the cursor actually
   picked (see Game.pickEntity): when it really is standing on this tile it is
   returned as-is, so the action taken is always performed on the thing that was
   clicked rather than on whichever neighbour happens to be nearest the tile's
   centre. Without that, two creatures close together could trade places between
   the click and the action. */
export function npcAt(tx, tz, prefer) {
  if (prefer && prefer.kind !== "ghost" && !prefer.dead && !prefer.hidden && Math.hypot(prefer.x - (tx + 0.5), prefer.z - (tz + 0.5)) <= 1.0) return prefer;
  let best = null;
  let bestD = 1.0;
  for (const n of G.npcs) {
    if (n.dead || n.hidden) continue;
    const d = Math.hypot(n.x - (tx + 0.5), n.z - (tz + 0.5));
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/* What a creature is *called*: an archetype (src/archetypes.js) carries its own
   name, because its `type` is only the base class it inherits its mechanics
   from - a "Dark mystical wizard" body still reads "Dark Wizard" from that base
   otherwise. Everything else keeps the base's own name. */
export function npcDisplayName(n) {
  const arch = n.archetype ? archetypeByKey(n.archetype) : null;
  if (arch) return arch.name;
  if (NPC_NAMES[n.type]) return NPC_NAMES[n.type];
  if (ITEMS[n.type] && ITEMS[n.type].name) return ITEMS[n.type].name;
  return n.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/* A creature's Examine line. An archetype's is its own: it reads the outfit out
   (src/archetypes.js#archetypeExamine), which is the whole point of the lineup -
   you click a candidate and it tells you what it is wearing. */
function npcExamine(npc) {
  const arch = npc.archetype ? archetypeByKey(npc.archetype) : null;
  if (arch) return archetypeExamine(arch);
  if (npc.type === "mac") return "Seller of the Max cape.";
  /* Hatius's own line, from the live game. */
  if (npc.type === "hiatus") return "Attracts a lot of attention.";
  /* Thormac's own line, from the live game. */
  if (npc.type === "thormac") return "Nice hat.";
  if (npc.type === "sedridor") return "The Archmage of the Wizards' Tower.";
  if (npc.type === "dommik") return "He sells crafting supplies.";
  if (npc.type === "jered") return "A holy man of Saradomin.";
  if (npc.type === "scorpius") return "The restless spirit of Scorpius.";
  if (npc.type === "gas_goblin") return "A member of Goblins Against Shovels. Nervous around spades.";
  if (npc.type === "imp") return "A cheeky little imp.";
  if (npc.type === "scully") return "A skeleton in a battered pirate hat. He seems to be counting crabs.";
  if (npc.type === "river_troll_79" || npc.type === "river_troll_120" || npc.type === "river_troll_159") return "Likes fish... hates people.";
  if (npc.type === "river_troll_199") return "Da big one. Touch it an' get stomped.";
  if (npc.type === "ocean_troll_79" || npc.type === "ocean_troll_120" || npc.type === "ocean_troll_159") return "Likes salt fish... hates people.";
  if (npc.type === "ocean_troll_199") return "Da big blue one. Touch it an' get stomped.";
  return "It's a " + npcDisplayName(npc).toLowerCase() + ".";
}

/* The client writes an attackable NPC's combat level after its name, in the
   hover text and in the right-click menu alike: "Attack Goblin (level 2)".
   The suffix's colour is the client's own combat-level *difference* scale
   (`317_Client.java#getCombatLevelDifferenceColour`), eight bands measured
   from the player's own combat level, so a row already tells you whether the
   thing will eat you: `red` when it is ten or more above you, through
   `or3`/`or2`/`or1`, `yel` for a draw, down to `gre` at ten or more
   below. The colour is spent only on a menu row (`tagged`): the hover line is
   drawn in this game's own dim grey, a deliberate deviation (README, "World
   hover text"), and a stray tag there would break it.

   Two of that reference client's own flourishes are deliberately NOT copied.
   It prints the suffix as "(level-N)" and it appends a "(@whi@id@gre@)" debug
   tail to every examine row; both are that private-server build's additions
   (its examine rows are the only place an id is ever shown), and the suffix
   here keeps the spaced "(level N)" that this project's spec, README and
   hover all already use, so the menu and the hover can never disagree about
   how a creature's level reads.

   A spell picked in the spellbook replaces the verb with the cast, the way the
   live client's menu reads "Cast <spell> on <name>" - the client's own
   `spellTooltip` is built from the interface's "Cast on" action name and the
   spell's own name (317_Client.java:2504), and it is that exact string that
   every menu entry and the top-left hover text are built from. */
export function npcLevelTag(difference) {
  if (difference < -9) return "red";
  if (difference < -6) return "or3";
  if (difference < -3) return "or2";
  if (difference < 0) return "or1";
  if (difference > 9) return "gre";
  if (difference > 6) return "gr3";
  if (difference > 3) return "gr2";
  if (difference > 0) return "gr1";
  return "yel";
}

/* The wiki's own hex behind each band above (OSRS Wiki, "Combat level"): red
   ff0000, or3 ff3000, or2 ff7000, or1 ffb000, yel ffff00, gr1 c0ff00,
   gr2 80ff00, gr3 40ff00, gre 00ff00. The menu spends the `@tag@` form; the
   top-left hover line spends this form through the tip's own `<col=>` markup. */
const LEVEL_TAG_HEX = {
  red: "ff0000", or3: "ff3000", or2: "ff7000", or1: "ffb000", yel: "ffff00",
  gr1: "c0ff00", gr2: "80ff00", gr3: "40ff00", gre: "00ff00",
};

/* Another player's band on that scale, from the level their own client sent
   (see `playerMenuName`). Null while it has not arrived, which callers read as
   "write no level colour at all". */
export function playerCombatTag(ghost) {
  const lvl = ghost && ghost.combatLevel;
  if (!lvl) return null;
  return npcLevelTag(combatLevel(G.ps.skills) - lvl);
}

export function npcAttackLabel(npc, tagged) {
  const picked = UI.spell != null ? spellById.get(UI.spell) : null;
  const aimed = picked && (picked.on & SPELL_TARGET.NPC);
  const verb = aimed ? "Cast " + picked.name + " on " : "Attack ";
  if (!npc.level) return verb + npcDisplayName(npc);
  return verb + (tagged ? "@yel@" : "") + npcDisplayName(npc)
    + (tagged ? "@" + npcLevelTag(combatLevel(G.ps.skills) - npc.level) + "@" : "") + " (level " + npc.level + ")";
}

/* The line the client draws at the top-left of the game screen while a spell
   has been picked but nothing is under the cursor: the spell's own pending
   action, "Cast <spell> on..." (317_Client.java#drawTooltip builds it from
   `spellTooltip + "..."`). Without it a picked spell is invisible the moment
   the pointer leaves the book. */
export function pickedSpellHover() {
  const picked = UI.spell != null ? spellById.get(UI.spell) : null;
  return picked ? "Cast " + picked.name + " -> " : null;
}

/* Above the horizon: the ray meets scenery but no ground, so there is no tile
   to walk to and no "Walk here". Hovering something examinable there reads
   "Examine <name>" (the user's rule); hovering nothing examinable is a dead
   line, exactly as the click below is a dead click. A manually picked combat
   spell ignores even that - the tree against the sky is nothing until the cast
   lands or the pick is cancelled. */
export function skyHoverLabel(x, y) {
  const cast = manualNpcSpell();
  if (cast) return actVerb("Cast " + cast.name + " -> ");
  const g = UI.game;
  if (!g || !g.pickAll) return null;
  let loc = null;
  try {
    const pick = g.pickAll(x, y);
    if (pick && !pick.ground && pick.locs && pick.locs.length && pick.locs[0].obj) loc = pick.locs[0];
  } catch (e) { loc = null; }
  if (!loc) return null;
  return actVerb("Examine") + " " + menuName(loc.obj, loc.tx, loc.tz);
}

/* The click twin of the above, called from src/game.js#handleClick when the
   ray found neither a creature nor a tile. Examining is neither a walk nor an
   action, so it draws no cross. With an item in hand or a combat spell picked
   the click is dead instead: the mode survives, the pick survives. */
export function skyClick(x, y) {
  if (UI.useItem || manualNpcSpell()) return false;
  const g = UI.game;
  if (!g || !g.pickAll) return false;
  let pick = null;
  try { pick = g.pickAll(x, y); } catch (e) { return false; }
  if (!pick || pick.ground || !pick.locs || !pick.locs.length) return false;
  const h = pick.locs[0];
  if (!h || !h.obj) return false;
  chat(objExamine(h.obj, h.tx, h.tz), "game");
  return true;
}

/* ------------------------------------------------- the creature menu (unit W)

   A creature's menu is the cache's own **action list** for its NPC def, written
   out in the def's order - the same rule the scenery rows follow
   (`317_Client.java#buildMenuForNPC` reads `definition.actions` and appends
   `actions[i] + " @yel@" + displayName`). Three things fall out of that, and all
   three were wrong before this unit:

     * **Action 0 is the default.** The client loops the def's actions from 4
       down to 0 so that action 0 is appended last, and the menu draws that block
       with the last-appended row at the top; so the def's first action is both
       the top row and the left click. The left click here used to be "Attack"
       for every creature that was not a vendor, which is why a gardener, a monk,
       a drunk and the tanner were all attacked by a plain click. A gardener is
       `["Talk-to","Attack"]` - his left click talks; a tanner is
       `["Talk-to",null,"Trade"]` - his left click talks and his counter is the
       row underneath it.
     * **The rows come in the def's order.** `Pickpocket` sits under `Attack` for
       a farmer (`[null,"Attack","Pickpocket"]`), and under `Talk-to` for a man
       (`["Talk-to","Attack","Pickpocket"]`) - the menu orders them, not the
       weapon.
     * **The world only adds what the def leaves out.** This is not the live
       game: the world has its own dialogue for a creature the cache gives no
       Talk-to (the goblin), its own Pickpocket roll, its own attackability rule
       and its own convenience rows (the herbalist's "Mix potions"). Those are
       appended *after* the def's rows rather than allowed to reorder them.

   The one deliberate departure from the cache is **attackability**. The defs say
   who may be attacked at all - hans, the cook, the child, the beggar, the guide,
   the miner and the rest have no Attack action - but this world lets you attack
   any creature that is not a banker or a vendor, because README's "The notes
   that are deliberate" documents those level-0 townspeople as *attackable
   pacifists*: the attack label carries no level for them and they hit back for
   nothing. Taking the attack away would remove content, so the row stays and
   `src/tools/check-menus.mjs` reports every type where the def and the world
   disagree instead. */
let NPC_DEF_MENUS = {};

/* The cache's own action lists, keyed by this world's spawn type
   (src/data/npc-cache-menus.json, the sibling of npc-cache-levels.json - both
   come from the same parse of config archive 2 index 9, `defs.mjs#parseNpc`).
   Loaded once at boot by src/main.js. With no data the menu falls back to the
   world's own ordering, which is what it used before this unit, so a fetch that
   never lands degrades to the old menu rather than to an empty one. */
export function setNpcDefMenus(data) { NPC_DEF_MENUS = data || {}; }

/* Does this world serve a Talk-to for the creature? The same test the menu has
   always used, and a creature with nothing to say cannot be talked to (user
   requirement, see "NPC interaction" in README) - which is why the barbarian's
   def says Talk-to and his menu does not offer it yet: the world has no line for
   him. The audit reports that gap. */
function npcCanTalk(npc) {
  return !!(NPC_TALK[npc.type] || NPC_LINES[npc.type] || npc.shop || TALK_BRANCHES.has(npc.type));
}

/* The world's own answer to "may I attack this?". The cache's answer is the
   def's Attack action; the *engine's* is `combat.js#attackNpc`, which refuses a
   banker or a vendor outright and serves you instead, so the row follows the
   engine - a row that cannot be carried out is not a row.

   The third refusal is this world's own: a creature spawned as one of
   **Saradomin's assailants** (`godFoe`, src/game.js#createNpc) is sworn to the
   god and not to the player, so the player is offered nothing on it but
   Examine - the user's ask of 2026-09-24, *"they would not have an attack option
   for players only, only an examine text"*. Such a creature has no other rows
   either (its def is the imp's or the demon's, `[null,"Attack",...]`), so the
   whole menu collapses to the one Examine line, and a left click on it is not
   swallowed: it falls through to the walk (src/actions.js#onClickTile). */
/* The cay's crabs are ambient beach life, not targets: the cache def (npc
   2706) carries no actions at all, so there is no Attack row to begin with,
   and this keeps aimed casts off them too (see combat.js#attackNpc). */
function npcCanAttack(npc) { return !(npc.type === "banker" || npc.type === "thormac" || npc.type === "sedridor" || npc.type === "scully" || npc.type === "crab" || npc.shop || npc.godFoe || npc.ibanFoe); }

/* Rows the world adds that no cache def names. The herbalist is this world's
   herblore master and there is no use-with mode, so her window is a menu row; it
   keeps its own wording (a cache verb like "Trade" is tagged and appended to the
   creature's name, an extra row is the world's own sentence). */
const NPC_WORLD_ROWS = {
  herbalist: [{ verb: "Mix potions", extra: true, run: (npc) => interactNpc(npc, "herbs") }],
  /* Wizard Sedridor's Teleport row (the live game gives him Talk-to +
     Teleport): straight to the essence mine, no dialogue first. It sits after
     the promoted Talk-to, so his menu reads Talk-to / Teleport. */
  sedridor: [{ verb: "Teleport", run: (npc) => approach(Math.floor(npc.x), Math.floor(npc.z), () => sedridorTeleport()) }],
};

/* Can this world actually carry the verb out for this creature? A verb it cannot
   perform is dropped rather than shown and then doing nothing - which is how a
   def's Trade on a creature with no shop, or a shorn sheep's Shear, leaves the
   menu. Every drop is a data question the audit surfaces. */
function npcVerbUsable(verb, npc) {
  switch (verb.toLowerCase()) {
    case "attack": return npcCanAttack(npc);
    case "talk-to": return npcCanTalk(npc);
    case "trade": return npc.type === "tanner" || !!(npc.shop && SHOPS[npc.shop]);
    case "bank": return npc.type === "banker";
    case "pickpocket": return !!PICKPOCKET[npc.type];
    case "shear": return npc.type === "sheep" && !npc.sheared;
    /* Crassus's own verbs, from the cache's Cat def (npc 768): Pick-up is
       refused - he is Hatius's cat, not a stray - and Interact-with strokes
       him. Both answer on arrival, faced, like the shear above. */
    case "pick-up": return npc.type === "crassus";
    case "interact-with": return npc.type === "crassus";
    default: return false;
  }
}

/* The def's own verbs, in the def's own order. Two lookups, because this world
   reuses the cache's bodies: the spawn type's own entry, and - when that entry
   carries no actions of its own - the entry for the model the type is drawn from
   (`game.js#NPC_MODEL_ALIASES`). The alias matters for two families:

     * the ten shop owners are the shopkeeper's body, so they are the
       shopkeeper's def, `["Talk-to",null,"Trade"]`;
     * the world's `sheep` type is the cache's **shorn** animal (NPC 42, whose
       action list is empty) drawn from the woolly NPC 43, whose single action is
       exactly the Shear that a shorn sheep must lose - which is why the rule
       prefers a non-empty list over a same-named empty one. */
function npcDefVerbs(npc) {
  const own = NPC_DEF_MENUS[npc.type];
  if (own && own.actions && own.actions.some(Boolean)) return own.actions.filter(Boolean);
  const key = npcModelKey(npc.type);
  const alias = key && key !== npc.type ? NPC_DEF_MENUS[key] : null;
  if (alias && Array.isArray(alias.actions)) return alias.actions.filter(Boolean);
  return own && Array.isArray(own.actions) ? own.actions.filter(Boolean) : [];
}

/* The verbs of one creature's menu, in order: the def's, then - only if the def
   did not already carry them - this world's own. The world's order is the order
   the menu has always built (the people's talk, the counter, the theft, the
   weapon), so a type the data does not carry keeps the pre-unit-W menu. */
function npcRowSpecs(npc) {
  const specs = [];
  const seen = new Set();
  const push = (s) => { const k = s.verb.toLowerCase(); if (seen.has(k)) return; seen.add(k); specs.push(s); };
  /* Talk-to is always the left click when the world has a line for the
     creature (the user's hover rule - per-def exceptions that swap rows back
     would come later, but none exist yet). The seen-set keeps the def's own
     Talk-to from doubling it below. */
  if (npcVerbUsable("Talk-to", npc)) push({ verb: "Talk-to" });
  for (const v of npcDefVerbs(npc)) if (npcVerbUsable(v, npc)) push({ verb: v });
  for (const v of ["Bank", "Trade", "Pickpocket", "Attack", "Shear"]) {
    if (npcVerbUsable(v, npc)) push({ verb: v });
  }
  for (const s of NPC_WORLD_ROWS[npc.type] || []) push(s);
  return specs;
}

/* A row's text. A cache verb names the creature ("Mix potions" does not), the
   attack row goes through `npcAttackLabel` because only it knows the level
   suffix and a picked spell, and the `tagged` flag is what keeps the colour tags
   in the menu and out of the dim-grey hover line. */
function npcRowLabel(spec, npc, nm, tagged) {
  if (spec.extra) return spec.verb;
  if (spec.verb.toLowerCase() === "attack") return npcAttackLabel(npc, tagged);
  return tagged ? named(spec.verb, nm, "npc") : spec.verb + " " + nm;
}

function runNpcRow(npc, spec) {
  if (spec.run || spec.verb.toLowerCase() !== "attack") dropWindPick();
  if (spec.run) { noteAim("npc"); return spec.run(npc); }
  switch (spec.verb.toLowerCase()) {
    case "talk-to": noteAim("npc"); return interactNpc(npc, "talk");
    case "trade": noteAim("npc"); return interactNpc(npc, "trade");
    case "bank": noteAim("npc"); return interactNpc(npc, "bank");
    case "pickpocket": noteAim("npc"); return pickpocket(npc);
    case "shear": noteAim("npc"); return shearSheep(npc);
    case "pick-up": noteAim("npc"); return pickupCat(npc);
    case "interact-with": noteAim("npc"); return strokeCat(npc);
    case "attack": noteAim("attack"); return Actions.npcAttack ? Actions.npcAttack(npc) : undefined;
  }
  noteAim("npc");
  return undefined;
}

/* The creature's menu block, in the def's own order. The right-click menu, the
   left click (`interactNpc(npc, "left")`) and the top-left hover line all come
   from it, so the three can never disagree about a creature's first action. */
export function npcMenuRows(npc) {
  const nm = npcDisplayName(npc);
  return npcRowSpecs(npc).map((s) => ({ label: npcRowLabel(s, npc, nm, true), fn: () => runNpcRow(npc, s) }));
}

/* The default left-click action on an NPC, as the top-left hover line shows it:
   the first row of the block above, untagged. Returns null only for a creature
   with no rows at all, which nothing in this world spawns. */
export function npcActionLabel(npc) {
  const specs = npcRowSpecs(npc);
  if (!specs.length) return null;
  return npcRowLabel(specs[0], npc, npcDisplayName(npc), false);
}

/* A diagnostic view of one creature's menu, for src/tools/check-menus.mjs and
   nothing else: what the cache's def says, what this world's menu shows, which
   of the def's verbs the world cannot carry out (`dropped` - the cache says you
   may pick a pocket and nothing happens, which is a silent gap), which rows the
   world adds that the def does not name (`added` - the attack this world allows
   on a pacifist townsperson, and the herd's own Talk-to), and the world's own
   extra rows. `spawn` is the creature's spawn record (or a live entity) when the
   caller has one: only its `shop` is read, because a vendor's rows come from the
   spawn table rather than from the type's name, and the rest of the world's own
   facts are the def's. */
export function npcMenuAudit(type, spawn) {
  const stub = { type, shop: spawn && spawn.shop, sheared: false, godFoe: !!(spawn && spawn.godFoe) };
  const own = NPC_DEF_MENUS[type];
  const key = npcModelKey(type);
  const viaAlias = !(own && own.actions && own.actions.some(Boolean)) && key !== type && NPC_DEF_MENUS[key] ? key : null;
  const source = viaAlias ? NPC_DEF_MENUS[viaAlias] : own;
  const defVerbs = source && Array.isArray(source.actions) ? source.actions.filter(Boolean) : [];
  const specs = npcRowSpecs(stub);
  const rowVerbs = specs.filter((s) => !s.extra).map((s) => s.verb);
  const extras = specs.filter((s) => s.extra).map((s) => s.verb);
  const low = (s) => s.toLowerCase();
  return {
    type,
    hasDef: !!own,
    viaAlias,
    npcId: source ? source.npcId : null,
    defName: source ? source.name : null,
    defVerbs,
    rowVerbs,
    extras,
    dropped: defVerbs.filter((v) => !rowVerbs.some((r) => low(r) === low(v))),
    added: rowVerbs.filter((r) => !defVerbs.some((v) => low(v) === low(r))),
  };
}

/* The single line the client draws at the top-left of the game screen for
   whatever the cursor is over: the thing's default left-click action and
   nothing else - and, with an item in the hand, the use. The examine line
   belongs to the right-click menu and is never part of the hover text, except
   above the horizon (see `skyHoverLabel`). Returns null when the cursor is
   over plain ground with empty hands, which the client leaves unlabelled. */
/* A combat spell picked by hand (the yellow square), as opposed to an armed
   autocast (the white square), which leaves UI.spell alone - so a cast line on
   the hover always means a manual pick. Ground-aimed spells are excluded: they
   name their item in `hoverTargetLabel` instead. */
function manualNpcSpell() {
  const s = UI.spell != null ? spellById.get(UI.spell) : null;
  return s && (s.on & SPELL_TARGET.NPC) && !(s.on & SPELL_TARGET.GROUND) ? s : null;
}
export function hoverLabel(npc, tx, tz, picked, front) {
  /* With an item in the hand the line IS the use, always: the client writes it
     "Use <item> -> <target>", naming the target rather than the action, and it
     is the only place the game tells you which of two identical daggers you are
     carrying at the moment of the click. Even an item with no rule for the
     target is named (the user's rule - the Use always trumps the default), and
     the refusal, if one comes, arrives on the click. Bare ground leaves the
     target empty and the click walks; above the world altogether (no tile) the
     line stays empty, because the click up there cannot walk anywhere. */
  if (UI.useItem) {
    if (!npc && tx == null) return null;
    const name = useTargetName(npc, tx, tz, picked, front);
    return actVerb("Use") + " " + itemName(UI.useItem.id) + " -> " + (name || "");
  }
  const label = hoverTargetLabel(npc, tx, tz, picked);
  if (!label) return null;
  return label;
}

/* The use line names the target the click will act on - the same resolution
   `useOnWorld` runs, so the two can never disagree. A creature's name carries
   no level suffix here, and a player is named by name alone. */
function useTargetName(npc, tx, tz, picked, front) {
  const id = UI.useItem ? UI.useItem.id : null;
  const objAt = picked === undefined ? (tx == null ? null : G.world.objAt(tx, tz)) : picked;
  if (npc && npc.kind === "ghost") {
    /* A player standing on an object's tile: the click takes the object (see
       `useOnWorld`), so the line does too. */
    if (objAt) return menuName(objAt, tx, tz);
    return npc.name || "Player";
  }
  if (npc) {
    /* The body the ray itself met (`front`) wins no matter what is in the
       hand; a body the tile scan found behind the object loses to a station
       the item is designated for, while the creature keeps every click the
       item means for it (shears on a sheep, a hide on the tanner). */
    if (objAt && !front && useRuleForLoc(objAt, tx, tz, id) && !useRuleForNpc(npc, id)) return menuName(objAt, tx, tz);
    return npcDisplayName(npc);
  }
  if (tx == null) return null;
  if (objAt) return menuName(objAt, tx, tz);
  /* Ground items ARE use targets - tinderbox onto logs lying there lights
     them (see `useRuleForGround`) - and the line names the pile's top item,
     the one the click will take the rule from. */
  const g = groundItemsAt(tx, tz);
  if (g.length) {
    const top = g[g.length - 1];
    return itemName(top.id) + (top.qty > 1 ? " x" + top.qty : "");
  }
  return null;
}

function npcHoverLabel(npc) {
  const specs = npcRowSpecs(npc);
  if (!specs.length) return null;
  const spec = specs[0];
  const nm = npcDisplayName(npc);
  if (spec.extra) return actVerb(spec.verb);
  if (spec.verb.toLowerCase() === "attack") {
    const picked = UI.spell != null ? spellById.get(UI.spell) : null;
    const aimed = picked && (picked.on & SPELL_TARGET.NPC);
    const verb = aimed ? actVerb("Cast " + picked.name + " on ") : actVerb("Attack ");
    /* No HP numbers on the hover line, ever (the user's rule - the world bars
       in src/fx.js are where health is read). */
    if (!npc.level) return verb + "<col=ffff00>" + nm + "</col>";
    return verb + "<col=ffff00>" + nm + "</col><col=" + LEVEL_TAG_HEX[npcLevelTag(combatLevel(G.ps.skills) - npc.level)] + "> (level " + npc.level + ")</col>";
  }
  return actVerb(spec.verb) + " <col=ffff00>" + nm + "</col>";
}

function hoverTargetLabel(npc, tx, tz, picked) {
  /* Another player: no verb, no HP, no level colour games (there is no PvP
     yet, and when it comes its hide-attack settings will decide). Until then
     a player is a walk - or the cast, when a player-aimed spell is picked and
     the menu leads with the same row. */
  if (npc && npc.kind === "ghost") {
    const spell = pickedPlayerSpell();
    if (spell) return actVerb("Cast " + spell.name + " on ") + playerMenuName(npc);
    return "Walk here";
  }
  if (npc) return npcHoverLabel(npc);
  if (tx == null) return null;
  /* The object the ray met, when the caller has a ray (see `onClickTile`): the
     hover line and the click must name the same thing, or the line promises an
     action the click will not take - which is exactly the "grass beside the
     trunk" report. */
  const o = picked === undefined ? G.world.objAt(tx, tz) : picked;
  if (o) {
    /* A manually picked combat spell ignores scenery: the line is the cast
       with an empty target until it is cast or cancelled. An armed autocast
       never reaches this - it leaves UI.spell unset, so the tree wins by
       focus exactly as the user ruled. */
    const cast = manualNpcSpell();
    if (cast) return actVerb("Cast " + cast.name + " -> ");
    /* The line is the top row of the object's own block - the very
       function the menu builds its rows from (see `sceneryRowSpecs`), so the
       two can never disagree. It is the client's own rule: the object's action
       0 and its name, and nothing else. A mined-out rock keeps "Mine Rocks",
       which is what the client shows and what a click then answers with its
       refusal; the menu used to drop the row and leave the hover line alone. */
    const label = sceneryActionLabel(o, tx, tz);
    if (label) return label;
  }
  const g = groundItemsAt(tx, tz);
  const pickedFirst = UI.spell != null ? spellById.get(UI.spell) : null;
  if (g.length) {
    /* With a ground-aimed spell picked the line is the cast, not the Take -
       the same first-row rule the menu follows (see `itemMenuBlock`) and the
       creature hover follows with a combat spell picked (see `npcHoverLabel`).
       The cast names the tile's own top item, exactly like the standard grab -
       the greater grab's sweep only happens on landing, never in the aim. */
    const picked = pickedFirst;
    if (picked && (picked.on & SPELL_TARGET.GROUND)) {
      const top = g[g.length - 1];
      return actVerb("Cast " + picked.name + " on ") + " <col=ff9040>" + itemName(top.id) +
        (top.qty > 1 ? " x" + top.qty : "") + "</col>";
    }
    return actVerb("Take") + " <col=ff9040>" + itemName(g[g.length - 1].id) + (g[g.length - 1].qty > 1 ? " x" + g[g.length - 1].qty : "") + "</col>";
  }
  return null;
}

/* Walk up to (x, z) and only then run `fn` - talking to a person, opening the
   bank or a shop, using a booth. The client runs these interactions from ONE
   tile away and no further, so anything outside that ring walks you in first
   and the action fires on arrival (the "goto" phase in tickActions, then
   runAttempt). A generous distance here let a shop be opened - or a stranger
   spoken to - from across the room, which is not the game. */
function approach(x, z, fn, reachTest) {
  /* No interaction starts mid-climb (see `begin`'s guard, same rule). */
  if (G.player && G.player.climbLock) return;
  const p = G.player;
  /* A caller bringing its own reach test is judged by it alone, for the reason
     `actNear` gives: `nearTile` is the eight tiles, so as a fallback it let a
     corner satisfy an interaction whose own rule is the four sides - which is
     how a rock could still be prospected from a diagonal after the reach test
     itself was made orthogonal. */
  const there = () => reachTest
    ? !!reachTest(Math.round(p.x - 0.5), Math.round(p.z - 0.5))
    : nearTile({ x, z }, p, 1);
  if (there()) {
    /* A click on something you are already standing beside is still an
       interaction, and the client turns the player to *face* what they
       interacted with before it answers - the same `faceTarget` the walk-in
       path sets when the walk hands over to the work phase (`tickActions`).
       Only the arrival path did it, so a handler that plays a pose from here -
       the altar's kneel is the one - was drawn in whatever direction the player
       happened to be facing, which for a player who walked up and stopped could
       be anywhere, including with their back to the altar. Asking `there()`
       first (and returning early) is exactly the shape that skipped the turn. */
    faceTarget(p, x, z);
    fn();
    return;
  }
  begin("goto", x, z, { fn, reachTest });
}

/* A refusal walks first: the message fires on arrival at a side face, or on
   the spot for the already-there case (faced, like every other interaction).
   The only caller left is the agility obstacle - every skilling refusal rides
   its own session's attempt instead, so the walk it arrives on is the work's
   own walk-in rather than a second one. */
function refuseAt(x, z, msg) {
  const p = G.player;
  const test = sideReachTest(x, z);
  const there = test(Math.round(p.x - 0.5), Math.round(p.z - 0.5));
  if (there) { faceTarget(p, x, z); chat(msg, "warn"); return; }
  begin("goto", x, z, { fn: () => { faceTarget(G.player, x, z); chat(msg, "warn"); }, reachTest: test });
}

/* --------------------------------------------------- the village props' verbs

   The four cache verbs the props section of src/world.js places objects for.
   Each is the def's own action (the `sceneryRowSpecs` block below offers exactly
   these words) and each is a mechanic rather than a message:

   * `Jump-to` (rocky shore) - a leap over water, one to three tiles in a
     straight line with every tile between them water. It is how the stepping
     stones are crossed and how a rock in the shallows is got on to at all: the
     rock is a water tile, so `world.isWalkable` refuses it and no route may be
     planned on to it. A leap is not a route - it ignores walkability at both
     ends - which is why it is written by hand here instead of being asked of
     the pathfinder.
   * `Hide-in` (crate) - the player leaves the board: not drawn, and skipped by
     every creature's aggro pass (src/combat.js#tickAggro). Any step or activity
     ends it (`begin` and the tick below), so hiding can never strand anyone
     invisible.
   * `Search` / `Open` (crate_b, chest) - the container's `loot`, which the world
     sets on the mine's, the smithy's and the market's crates, and deliberately
     does not set on the church's chest. The verb stays on the object once it is
     empty, exactly as a mined-out rock keeps Mine: a container that suddenly
     had no menu would read as scenery, and the audit would report the row as
     dropped.

   A leap's geometry is decided from the PLAYER's own tile, never from a chosen
   launch tile, and that is what makes the approach safe to retry: the walk to a
   launch tile can stop a tile short of it (walkTo's own reach), so "am I
   standing somewhere I can leap from" has to be asked again after every step,
   and answered with the same walk when the answer is no. */

const LEAP_RANGE = 3;

/* The distance of a legal leap from (from.x, from.z) to the rock at (tx, tz):
   one to three tiles, along one of the four straight lines, with every tile
   strictly between them water. 0 when the line is not a leap at all. */
function leapLine(w, from, tx, tz) {
  const dx = tx - from.x;
  const dz = tz - from.z;
  const n = Math.max(Math.abs(dx), Math.abs(dz));
  if (n < 1 || n > LEAP_RANGE) return 0;
  /* Straight lines only: a diagonal leap would cross the corner of a tile the
     client's own movement never crosses, and the arc reads wrong over one. */
  if (dx !== 0 && dz !== 0) return 0;
  const sx = Math.sign(dx);
  const sz = Math.sign(dz);
  for (let i = 1; i < n; i++) if (!w.isWaterTile(from.x + sx * i, from.z + sz * i)) return 0;
  return n;
}

/* The launch tile nearest the player that a leap to this rock can be made from,
   or null when there is none in range. Only land is a candidate: a launch tile
   the player has to walk to must be walkable, and the only non-land tiles a leap
   ever starts from are the stones themselves - which `leapLine` has already
   answered from wherever the player is standing. */
function bestLaunch(w, from, tx, tz) {
  const spots = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let n = 1; n <= LEAP_RANGE; n++) {
      const lx = tx + dx * n;
      const lz = tz + dz * n;
      if (!w.inBounds(lx, lz)) break;
      let clear = true;
      for (let i = 1; i < n; i++) if (!w.isWaterTile(tx + dx * i, tz + dz * i)) { clear = false; break; }
      if (!clear) break;
      if (!w.isWalkable(lx, lz)) continue;
      spots.push({ x: lx, z: lz, n });
    }
  }
  if (!spots.length) return null;
  const man = (s) => Math.abs(s.x - from.x) + Math.abs(s.z - from.z);
  spots.sort((a, b) => man(a) - man(b) || a.n - b.n);
  return spots[0];
}

/* The leap: one tile-to-tile step, drawn as an arc by the renderer
   (src/game.js#updateEntityTransform reads `airT`/`airH`; stepSim counts `airT`
   down and stepEntity keeps the render origin on the launch tile while a leap is
   in flight).

   The move itself does NOT happen here. `leapTo` only ORDERS the leap, and
   `tickActions` runs it at the end of the tick the order was given in. That is
   the whole trick to a consistent hop: the flight is drawn over one tick's
   interpolation window (`Game.tickProgress` 0..1), so it has to START at the
   beginning of one - and a click can land anywhere in a tick, which is how the
   first version came to draw a full arc for a click that arrived a tenth of a
   second after a tick and a barely-visible nudge for one that arrived just
   before the next. Applying it at the end of the tick means `airT = 1` is
   exactly one window: the countdown at the top of the next stepSim ends the
   flight just after the interpolation it belongs to has finished.

   Orders are QUEUED rather than kept as one pending leap, because a hop takes a
   tick and a player crossing the stones clicks faster than that: every click
   that arrived while the previous hop was still in the air used to overwrite
   the order it would have replaced (or, being ordered from the tile the player
   was still flying to, be thrown away as an illegal line), so a fast crossing
   swallowed most of its clicks and read as a broken crossing. The queue is
   drained one leap per tick, and each is re-tested against the tile the player
   has actually arrived on - which is what makes a chain of clicks walk the
   stones exactly as queued. That is the client's own queued-walk behaviour,
   applied to the one move whose step is taken by the renderer rather than by
   `stepEntity`. */
function leapTo(tx, tz, n) {
  const p = G.player;
  cancelAction();
  revealPlayer();
  p.path.length = 0;
  if (!p.pendingLeaps) p.pendingLeaps = [];
  p.pendingLeaps.push({ tx, tz, n });
}

/* The tile a leap ordered now would start from: the tile the player is actually
   standing on, or the tile the last ORDERED leap lands on. A click that arrives
   while an earlier hop is still in the air (or still queued behind one) means
   "continue from where that hop puts me", not "from where I am still drawn" -
   and that distinction is the whole of a fast crossing: a hop takes a bit over
   a second, every click inside that window is ordered from a tile the player has
   not reached yet, and computing each from the *current* tile refused the whole
   row as an impossible line (the stone one is standing on is not where the next
   hop starts). Each order is still re-tested from the real tile when it is
   applied, so a queue can only ever take leaps that are legal one after the
   other. */
function leapOrigin(p) {
  const q = p.pendingLeaps;
  if (q && q.length) { const l = q[q.length - 1]; return { x: l.tx, z: l.tz }; }
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}

function applyLeap(p, tx, tz, n) {
  p.px = p.x;
  p.pz = p.z;
  p.x = tx + 0.5;
  p.z = tz + 0.5;
  p.dir = Math.atan2(p.x - p.px, p.z - p.pz);
  p.moving = true;
  p.airT = 1;
  p.airH = n > 1 ? 0.95 : 0.6;
  chat("You leap across the water.", "game");
}

export function jumpToRocky(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "rocky") return false;
  /* A stunned player is rooted to the spot and cannot leap out of it, the same
     rule every other action obeys at the top of `begin` - this route does not
     go through `begin`, so it asks here. */
  if (G.ps.stunTicks > 0) { chat("You are stunned and cannot move!", "warn"); return true; }
  /* No leap starts mid-climb (see `begin`'s guard, same rule). */
  if (G.player && G.player.climbLock) return true;
  const p = G.player;
  const from = leapOrigin(p);
  const n = leapLine(w, from, x, z);
  if (n) { leapTo(x, z, n); return true; }
  /* A queued hop has not landed yet, so there is nothing to walk to a launch
     tile FROM: the crossing is in the air, and the only honest answer is the
     refusal. Without this, a click on a far rock mid-crossing planned a walk
     from the tile the player was still flying to and sent them somewhere else
     entirely. */
  if (p.pendingLeaps && p.pendingLeaps.length) { chat("You can't reach that rock from here.", "warn"); return true; }
  const launch = bestLaunch(w, from, x, z);
  if (!launch) { chat("You can't reach that rock from here.", "warn"); return true; }
  begin("jump", launch.x, launch.z, { tx: x, tz: z });
  return true;
}

/* A leap OFF a stepping stone, ordered by a click on the tile the stone can
   reach - the other half of `jumpToRocky`, which answers a click on the rock
   itself. `world.isWalkable` refuses a stone (it is a rock standing in the
   river), so nothing can be *routed* off one: the only way off is another hop,
   exactly the way on. That made the crossing one-way without this. The first
   stone of a row sits beside its own bank, and stepping off it on to that bank
   is a plain adjacent walk, so the west end always worked - but the far end of
   an EVEN-width row leaves a tile of water between the last stone and the far
   bank (the row's stones are laid every other tile, so the gap is a tile), and
   the walk that should finish the crossing was refused: no route may start on a
   tile nothing may walk on, so a click on the far bank did nothing at all and
   the player was stranded on the last stone with only the way they came. The
   user hit exactly that ("you can't actually get back to the shore now... on
   the east side of the river anyway, there needs to be a jump to shore or
   something"). The landing must be somewhere a jump can END - another stone, or
   dry ground - and the leap itself is the same straight line, over the same
   water, that `leapLine` draws for the other direction. */
function leapOffStone(tx, tz) {
  const p = G.player;
  if (!p || p.hidden) return false;
  if (G.ps.stunTicks > 0) return false;
  const from = leapOrigin(p);
  const n = leapOffStoneLine(G.world, from.x, from.z, tx, tz);
  if (!n) return false;
  leapTo(tx, tz, n);
  return true;
}

/* The off-stone leap rule, pure and shared: a stone at (fx, fz), a click on the
   tile (tx, tz), the distance of the legal hop or 0. `leapOffStone` above is its
   only caller in the game; the terrain audit (tools/check-world.mjs) calls it
   too, so "every stepping stone can be left" is held to the SAME rule the
   mechanic uses rather than to a copy of it - which is what makes a future
   tightening of this rule (require the landing to be another stone, say) fail
   loudly in the audit instead of quietly stranding the far end of every
   even-width row again. */
export function leapOffStoneLine(world, fx, fz, tx, tz) {
  const fo = world.objAt(fx, fz);
  if (!fo || fo.t !== "rocky") return 0;
  const n = leapLine(world, { x: fx, z: fz }, tx, tz);
  if (!n) return 0;
  /* A leap never ends in open water, on a wall or on a tree: the landing is a
     rock or dry walkable ground. Walls are walkable tiles now (standable, with
     sealed faces), so they are refused by name rather than by solidity. */
  const to = world.objAt(tx, tz);
  if (to && (to.t === "wall" || to.t === "lowwall")) return 0;
  if (!(to && to.t === "rocky") && !world.isWalkable(tx, tz)) return 0;
  return n;
}

/* Hide-in. Entering is an approach like any other, so the player walks to the
   crate first and climbs in on arrival; leaving is a click on the crate again,
   or anything else at all (see `revealPlayer`). */
export function hideInCrate(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "crate") return false;
  if (o.loot || o.searchOnly) return false;
  const p = G.player;
  if (p.hidden) { revealPlayer("You climb out of the crate."); return true; }
  approach(x, z, () => {
    if (p.hidden) return;
    p.hidden = true;
    p.path.length = 0;
    p.moving = false;
    chat("You hide inside the crate.", "game");
  }, crateReachTest(x, z));
  return true;
}

/* Search and Open are the same act on two shapes of container (the cache gives
   them separate defs only because it gives them separate words), so one handler
   serves both and the noun comes from the object. */
const CRATE_RESTOCK = 60;
function ringWallBetween(fx, fz, tx, tz) {
  /* A building wall panel on the shared edge of two orthogonally-adjacent
     tiles: the outer edge of a ring, which is what stops a crate being
     searched from the wrong side of its own wall. Either tile carrying an OPEN
     door clears the step (the doorway), as does a gap tile (a cave mouth, a
     yard gate). */
  const w = G.world;
  const openDoor = (x, z) => { const o = w.objAt(x, z); return !!o && o.t === "door" && o.open; };
  if (openDoor(fx, fz) || openDoor(tx, tz)) return false;
  for (const [x, z, ox, oz] of [[fx, fz, tx, tz], [tx, tz, fx, fz]]) {
    const bd = w.buildings.find((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    if (!bd) continue;
    const onW = x === bd.x0, onE = x === bd.x1, onN = z === bd.z0, onS = z === bd.z1;
    if (!onW && !onE && !onN && !onS) continue;
    if (bd.gaps && bd.gaps.some((g) => g[0] === x && g[1] === z)) continue;
    if ((onW && ox < bd.x0) || (onE && ox > bd.x1) || (onN && oz < bd.z0) || (onS && oz > bd.z1)) return true;
  }
  return false;
}
function crateReachTest(rx, rz) {
  /* The four sides and never a corner, on open ground - the rock rule
     (rockReachTest): a diagonal is not a face you can search across, and the
     walkability half is what routes the walk-in round through the door instead
     of through the wall, or refuses it when the door is shut. The wall half
     keeps the interaction on the crate's own side of its wall: without it the
     walk-in stops on the nearest passing tile, which for a ring crate can be
     the tile outside, and the search plays through the panel. */
  return (x, z) => Math.abs(x - rx) + Math.abs(z - rz) === 1 && G.world.isWalkable(x, z)
    && !ringWallBetween(x, z, rx, rz);
}
export function searchContainer(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || (o.t !== "crate" && o.t !== "crate_b" && o.t !== "chest")) return false;
  /* The pack is answered on arrival by takeFromContainer - the walk comes
     first (the user's NSEW rule), and the reach is the four sides already. */
  approach(x, z, () => takeFromContainer(o, x, z), crateReachTest(x, z));
  return true;
}

function takeFromContainer(o, x, z) {
  if (!o.loot) {
    chat(o.t === "chest" ? "The chest is empty." : "You search the crate but find nothing.", "game");
    return;
  }
  const loot = o.loot;
  const added = invAdd(G.ps, loot.id, loot.qty);
  /* A full pack keeps its crate: nothing taken, nothing cleared, no timer. */
  if (added <= 0) { chat("Your inventory is too full to carry any more loot.", "warn"); return; }
  o.loot0 = o.loot0 || { id: loot.id, qty: loot.qty };
  o.loot = null;
  const name = itemName(loot.id).toLowerCase();
  if (loot.id === "coins") chat("You find " + added + " coins.", "game");
  else chat("You find " + (added > 1 ? added + " x " + name : withArticle(name)) + ".", "game");
  mark("inv");
  /* Crates restock on the depleted clock like stalls and rocks (see
     `restoreResource`): whoever is standing there when the minute runs out
     puts the stock back. Chests stay one-and-done. */
  if ((o.t === "crate" || o.t === "crate_b") && x != null) {
    Actions.depleted.push({ x, z, at: (G.time || 0) + CRATE_RESTOCK, kind: "crate" });
  }
}

function openDiscordModal() {
  const invite = (typeof root !== "undefined" && root.discordInvite) ? String(root.discordInvite) : "https://discord.gg/BBp4pfAh6";
  openModal("Community", (body) => {
    body.textContent = "Join the Webscape Discord and help develop the game!";
    const a = document.createElement("a");
    a.href = invite;
    a.textContent = invite;
    a.target = "_blank";
    a.rel = "noopener";
    body.appendChild(document.createElement("br"));
    body.appendChild(a);
  });
}

export function readPlaque(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "statue") return false;
  approach(x, z, () => {
    if (o.discord) openDiscordModal();
    else chat("You read the plaque. The name has worn away.", "game");
  });
  return true;
}

export function readSignpost(x, z) {
  const w = G.world;
  const o = w.objAt(x, z);
  if (!o || o.t !== "signpost") return false;
  /* The minigame record boards outside the island mouths: Read opens the top
     twenty rather than chatting (src/minigame.js#openMgBoard). */
  if (o.mgBoard) {
    approach(x, z, () => openMgBoard());
    return true;
  }
  approach(x, z, () => {
    if (o.discord) {
      openDiscordModal();
    } else {
      chat("You read the signpost. It points down every road in town.", "game");
    }
  });
  return true;
}

/* ------------------------------------------------------------- the course

   Cairn Isle's agility course (src/island.js#COURSE), and the whole of what a
   click on one of its obstacles does.

   Every obstacle is the same act with different data, and that is the point: the
   world places twenty-one pieces, `COURSE` says what each of them *means* (which
   two tiles it moves you between, which pose it plays, what it needs and what it
   pays), and this section is the handful of functions that carry it out. A piece
   is never given a handler of its own, because "climb over the net" and "swing
   across the monkeybars" are the same sentence - *walk to the piece, play its
   pose, be moved across it, be paid* - with different nouns.

   Three things about the act are worth knowing, and all three are taken from the
   game's own behaviour rather than invented here:

     * the crossing is SYMMETRIC. A piece moves you between two tiles and does
       not care which of them you came from - the live game's shortcuts work the
       same way, and the strait here can be crossed at three points, so a one-way
       obstacle would strand a player on the wrong lobe with only the long way
       round. Whichever end the player is standing nearer is the start, and the
       other is the destination.
     * the MOVE is a placement, not a walk. The tiles a course piece crosses are
       water, a net or a rock face - ground nothing may be *routed* across
       (`world.isWalkable` refuses a water tile and every solid obstacle), so a
       crossing can only be ordered as a move. It is ordered while the pose
       plays and applied a beat later, on the render clock, so the one-tick
       interpolation draws the body gliding the gap - arcing when `hop` says the
       crossing is a leap and flat when it is not. `applyLeap` is the same shape
       (it is how the river's stepping stones are crossed).
     * the XP is paid on arrival, and the LAP BONUS only for the pieces taken in
       `COURSE`'s own order, from the first, in a single run. `ps.agilitySeq` is
       the index the next completion has to be, so a player may use any piece on
       its own for its own experience all day and never see the bonus, while one
       who runs the course does - the live game's own rule for a course, and what
       makes the island a course rather than a field of toys. */

/* The line each verb says on arrival, by the def's own word. A course's messages
   are part of its feel and there are only two dozen verbs, so they are written
   out rather than derived - and a verb with no line still works (the fallback is
   a plain sentence built from the piece's name). The list is the whole of what
   the baked kit's defs say (src/data/loc-cache-menus.json), so a piece added to
   src/island.js#PIECE shows its own sentence without this table being touched -
   and a verb that is genuinely new falls back rather than saying nothing. */
const AGILE_LINES = {
  "Swing-on": "You swing across the gap.",
  "Swing across": "You swing across the monkeybars.",
  "Climb": "You climb across.",
  "Climb-over": "You climb over the obstacle.",
  "Climb-under": "You scramble under it.",
  "Climb-up": "You climb up.",
  "Climb-down": "You climb back down.",
  "Climb-into": "You climb into it.",
  "Climb-out": "You climb out the other side.",
  "Squeeze-through": "You squeeze through the gap.",
  "Squeeze-past": "You squeeze past it.",
  "Crawl-under": "You crawl underneath.",
  "Crawl-through": "You crawl through the tunnel.",
  "Crawl-down": "You crawl down.",
  "Walk-across": "You walk carefully across.",
  "Walk-on": "You walk carefully along the beam.",
  "Walk-along": "You walk the length of it.",
  "Stand-on": "You step out onto the beam.",
  "Jump": "You jump it.",
  "Jump-over": "You leap over the wall.",
  "Jump-to": "You leap across.",
  "Jump-through": "You leap through the flames.",
  "Cross": "You jump across the stepping stones.",
  "Pass-through": "You pass straight through.",
  "Step-off": "You step off the ledge.",
  "Ride": "You ride the log down.",
  "Grapple": "You throw your rope up and haul yourself over.",
  "Enter": "You step inside.",
};
function agilityLine(spec) {
  if (AGILE_LINES[spec.verb]) return AGILE_LINES[spec.verb];
  const nm = (spec.name || "obstacle").toLowerCase();
  return "You scramble over the " + nm + ".";
}

/* The two tiles a piece moves between, oriented to the player: the end they are
   standing nearer is the one they start from. Straight-line distance, which for
   a crossing over water is the only honest measure - the walk between the two
   ends can be the whole length of the strait. */
function agilityEnds(spec, p) {
  const a = spec.from, b = spec.to;
  const da = Math.hypot(a[0] + 0.5 - p.x, a[1] + 0.5 - p.z);
  const db = Math.hypot(b[0] + 0.5 - p.x, b[1] + 0.5 - p.z);
  return da <= db ? { from: a, to: b } : { from: b, to: a };
}

/* The entry a click is on. The tile the ray picked is normally one of the
   piece's own tiles (a multi-tile model's tiles all carry the same object), and
   then the first lookup answers. The ring is for a click that landed on a tile
   *beside* a piece - which the picker does report, since a big model's own box
   leans over its neighbours - and it only accepts a tile whose piece is the same
   type as the object that was actually hit, so it can never grab the wrong
   obstacle. */
function agilityAt(tx, tz) {
  const direct = courseAt(tx, tz);
  if (direct) return direct;
  const o = G.world.objAt(tx, tz);
  if (!o || !AGILE_VERB[o.t]) return null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const e = courseAt(tx + dx, tz + dz);
    if (e && (e.keys ? e.keys[0] : e.key) === o.t) return e;
  }
  return null;
}

export function doAgilityObstacle(x, z) {
  const spec = agilityAt(x, z);
  if (!spec) return false;
  const p = G.player;
  if (levelOf(G.ps.skills, "agility") < spec.level) {
    /* Answered where the player stands, like every other refusal in this file
       (see `refuseAt`). */
    refuseAt(x, z, "You need an Agility level of " + spec.level + " to use that.");
    return true;
  }
  /* The gate at the end of the course is the one piece that is not a crossing at
     all: it is a teleport, so it is paid off with the standard teleport's own
     vanish/arrive pair rather than with a glide (`castTeleport` - the spell the
     player arrives here by, backwards). */
  if (spec.portal) {
    approach(x, z, () => {
      const portal = { id: TELEPORT_FX.id, at: ISLE.exitAt, place: "the mainland", arrive: "cast_arrive", start: 111, startH: 92 };
      castTeleport(portal, () => {
        playCastAnim(G.player, "cast_teleport");
        if (Net.status === "online") netCast(portal.id);
      });
    });
    return true;
  }
  const ends = agilityEnds(spec, p);
  /* The act's reach IS the launch tile, exactly (`reachTest`), so the walk-in
     ends the player *on* it rather than beside it - the same shape the rock
     across a bank counter's reach uses. Without it `begin`'s walk-in stops one
     tile short and the move would fire from the wrong tile. */
  const from = ends.from;
  begin("agility", from[0], from[1], {
    spec, from: ends.from, to: ends.to,
    reachTest: (rx, rz) => rx === from[0] && rz === from[1],
  });
  return true;
}

/* The pose first, then the crossing. The pose is held for its own sequence's
   length (`playCastAnim` with no `seconds`), and the move is ordered for just
   under half way through it: by then a swing is at the bottom of its arc and a
   balance has been taken, which is where the live game's own move lands. The
   beat is clamped, because a 7-frame sequence's half way is 70ms and a
   26-frame vault's is almost a second. */
function startAgility(spec, from, to) {
  const p = G.player;
  cancelAction();
  p.path.length = 0;
  faceTarget(p, to[0], to[1]);
  if (!document.hidden) playCastAnim(p, spec.anim);
  const a = p.ch && p.ch.data && p.ch.data._anims ? p.ch.data._anims[spec.anim] : null;
  const dur = a ? a.totalTicks * 0.02 : 1;
  const delaySec = Math.min(Math.max(dur * 0.45, 0.35), 1.2);
  afterTicks(Math.max(1, Math.ceil(delaySec / TICK)), () => applyAgility(spec, from, to));
}

/* The placed move, on the beat the pose called it on. */
function applyAgility(spec, from, to) {
  const p = G.player;
  /* Rooted, hidden, or no longer on the launch tile: the crossing is off. A stun
     that landed mid-pose, a teleport, or a click of the player's own between the
     pose and the move all leave the world a different place from the one this
     move was planned in, and the honest answer is to do nothing at all. */
  if (!p || p.hidden || G.ps.stunTicks > 0) return;
  if (Math.floor(p.x) !== from[0] || Math.floor(p.z) !== from[1]) return;
  if (document.hidden) {
    p.castAnim = null;
    p.castLeft = 0;
    p.castLoop = false;
    p.castTail = false;
    p.castClamp = false;
    p.castTool = null;
  }
  p.px = p.x;
  p.pz = p.z;
  p.x = to[0] + 0.5;
  p.z = to[1] + 0.5;
  p.dir = Math.atan2(p.x - p.px, p.z - p.pz);
  /* no `stepPts`: there was no step, so the frame interpolates the plain
     px/pz -> x/z line (`renderPos`) - which is the glide. */
  p.stepPts = null;
  p.moving = true;
  G.ps.lastMoveTick = G.tickCount;
  if (spec.hop) {
    const n = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    p.airT = 1;
    p.airH = n > 3 ? 0.95 : 0.6;
  }
  chat(agilityLine(spec), "game");
  addXp(G.ps, "agility", spec.xp);
  /* The lap. A piece that is not in `COURSE` at all (the two shortcuts, and the
     gate) is worth its xp and nothing else; one that is advances the sequence
     only when it is the piece the sequence was waiting for, and closes the lap
     when the last one is taken. */
  const idx = COURSE.indexOf(spec);
  if (idx >= 0 && (G.ps.agilitySeq || 0) === idx) {
    G.ps.agilitySeq = idx + 1;
    if (G.ps.agilitySeq >= COURSE.length) {
      G.ps.agilitySeq = 0;
      G.ps.agilityLap = (G.ps.agilityLap || 0) + 1;
      addXp(G.ps, "agility", COURSE_XP_LAP);
      chat("You have completed the Cairn Isle agility course " + G.ps.agilityLap + (G.ps.agilityLap === 1 ? " time." : " times."), "game");
    }
  }
  mark("skills");
}

export function interactNpc(npc, mode) {
  /* A stale menu row for a body on the other level: refused here, since the
     click-time guard (onClickTile) only covers live clicks. */
  if (npc && ((npc.plane || 0) !== (G.player.plane || 0))) { chat("You can't reach that.", "warn"); return; }
  /* A left click IS the def's own first action (unit W): the menu block's top
     row is the left click by construction, so a click and the row above it can
     never disagree. That is what makes a gardener's click a Talk-to instead of a
     weapon, and what shears a woolly sheep - the animal's def has exactly one
     action, "Shear", and it is action 0. */
  if (mode === "left") {
    const rows = npcMenuRows(npc);
    if (rows.length) rows[0].fn();
    return;
  }
  const x = Math.floor(npc.x);
  const z = Math.floor(npc.z);
  /* The reach this creature may be spoken to from - beside it, or across the
     counter it stands behind (a banker, a shopkeeper) - see `npcReachTile`. */
  const reach = npcReachTile(npc);
  /* The counter rows, which skip the chat the Talk-to row runs first. They are
     not this world's invention: the cache's own NPC defs carry them as op 2 -
     the banker (494) is ["Talk-to", null, "Bank"] and every shopkeeper is
     ["Talk-to", null, "Trade"] - so the menu is a transcription of the def, and
     these are its two endings.

     They run BEFORE the dialogue branches below, and that ordering is a bug this
     unit found live: a "Trade tanner" click used to reach the combat hook that
     treated any non-"talk" mode as an attack for a creature that is not a vendor
     or a banker (the tanner carries no `shop`, so the hook's own test did not
     save him), and the world's tanner died of it, twice. A mode that is not a
     counter now falls through to its own branch and no further: the only way to
     a weapon is the def's own Attack row (unit W), never a stray mode. */
  if (mode === "trade") {
    if (npc.type === "tanner") { approach(x, z, () => openTanMenu(), reach); return; }
    if (npc.shop && SHOPS[npc.shop]) { const shop = SHOPS[npc.shop]; approach(x, z, () => openShop(shop, npc.shop), reach); return; }
    return;
  }
  if (mode === "bank") {
    if (npc.type === "banker") {
      approach(x, z, () => {
        chat("The banker opens your bank account.", "game");
        setTab("bank");
      }, reach);
    }
    return;
  }
  /* The herbalist's own window (unit W). It is the world's row, not the cache's
     - her def is the shopkeeper's, Talk-to and Trade - and it is here so that a
     new player can find the herblore recipes at all: there is no use-with mode
     and no other interface opens them. */
  if (mode === "herbs") { approach(x, z, () => openHerbMenu(), reach); return; }
  if (npc.type === "banker") {
    approach(x, z, () => startDialogue(npc, bankerScreens(() => {
      chat("The banker opens your bank account.", "game");
      setTab("bank");
    })), reach);
    return;
  }
  /* Bob's Brilliant Axes: his own three-branch talk tree, whose counter option
     opens SHOPS.axes (see bobScreens). It has to come before the generic vendor
     branch below, which would otherwise serve him the plain two-line box. */
  if (npc.type === "bob") {
    const shop = SHOPS.axes;
    approach(x, z, () => startDialogue(npc, bobScreens(() => openShop(shop, "axes"))), reach);
    return;
  }
  /* Fred the Farmer, who runs the Sheep Shearer quest (see fredScreens above):
     his tree is chosen from the quest's state as the box opens, which is why he
     is on TALK_BRANCHES rather than in NPC_LINES. */
  if (npc.type === "fred") {
    approach(x, z, () => startDialogue(npc, fredScreens(npc)), reach);
    return;
  }
  if (npc.type === "makeover_mage") {
    approach(x, z, () => startDialogue(npc, mageScreens()), reach);
    return;
  }
  /* Wizard Thormac's own tree (see thormacScreens above): the greeting and the
     enchant window, on TALK_BRANCHES because the conversation has to *do*
     something as well as speak. */
  if (npc.type === "thormac") {
    approach(x, z, () => startDialogue(npc, thormacScreens()), reach);
    return;
  }
  /* Wizard Sedridor's own tree (see sedridorScreens below): essence-mine
     teleports, the air talisman, and what runecrafting is - on TALK_BRANCHES
     because the conversation has to *do* things as well as speak. */
  if (npc.type === "sedridor") {
    approach(x, z, () => startDialogue(npc, sedridorScreens()), reach);
    return;
  }
  /* Brother Jered's blessing and the Spirit of Scorpius's: the two ends of
     the silver-symbol chain (see jeredScreens / scorpiusScreens above) - on
     TALK_BRANCHES because the conversation has to *do* things as well as
     speak. */
  if (npc.type === "jered") {
    approach(x, z, () => startDialogue(npc, jeredScreens()), reach);
    return;
  }
  if (npc.type === "scorpius") {
    approach(x, z, () => startDialogue(npc, scorpiusScreens()), reach);
    return;
  }
  /* A vendor: the shop it keeps is named by its own spawn, so a new shopkeeper
     is a spawn-table entry (src/world.js) plus a shop (SHOPS above) and no
     code at all. The town shopkeeper and the Wizards' Guild's store owner are
     the same code path, and the shop's own conversation is the live game's
     (see `shopScreens`). */
  if (npc.shop && SHOPS[npc.shop]) {
    const shop = SHOPS[npc.shop];
    approach(x, z, () => startDialogue(npc, shopScreens(shop, () => openShop(shop, npc.shop))), reach);
    return;
  }
  /* The tanner's trade: talking to him opens his tanning list (the live game's
     own interface 219, mapped here onto the anvil's modal - see
     src/actions.js#openTanMenu). */
  if (npc.type === "tanner") {
    approach(x, z, () => openTanMenu(), reach);
    return;
  }
  /* Scully routes by tutorial stage (his own hub, the bobScreens pattern):
     stage 0 is the first meeting (the NPC_TALK tree), every later stage gets
     its own short scene below. */
  if (npc.type === "scully") {
    approach(x, z, () => talkToScully(npc), reach);
    return;
  }
  /* Everyone who can be talked to speaks through the client's own dialogue box
     (src/dialogue.js): a person with a conversation tree of their own (NPC_TALK)
     runs it, and anyone else says one of their NPC_LINES lines in the same box,
     which is what the live game does with the hundreds of NPCs it only gives a
     handful of lines to. */
  const tree = NPC_TALK[npc.type];
  if (tree) {
    approach(x, z, () => startDialogue(npc, typeof tree === "function" ? tree(npc) : tree), reach);
    return;
  }
  /* Anything with nothing to say simply has nothing to say - there is no
     fallback line, so a creature can never be made to talk by another route
     either (the menu does not offer Talk-to unless NPC_LINES has an entry). */
  const lines = NPC_LINES[npc.type];
  if (!lines) return;
  approach(x, z, () => startDialogue(npc, linesAsScreens(npc, lines)), reach);
}

/* ---------------------------------------------------------------- the scenery

   A creature is one object per cache def; the world's scenery is not. `tree` is
   a dozen baked tree models picked by hash, `rock` is a plain rock or one of the
   ten ore rocks, and which kind of tree or which ore an object is - and whether
   a tree has been felled, a stall raided, a rock mined out - is this world's own
   business on top of the cache's. So the rows below are the world's answers,
   with the cache's action lists wired into them wherever the cache has
   something to say:

     * **A row is only offered when the world can carry it out, and the cache's
       def decides that wherever the bake carries one.** The forest's **leafy**
       trees carry no log in this world and their def (loc 1302) names no action
       at all, so they offer no Chop - their examine stands alone, which is the
       live game's answer too. Its **evergreens** also carry no log here, but
       their defs (1315-1319) do carry "Chop down", so they keep the row and it
       answers with the world's own refusal ("You can't chop this tree.").
       Nothing offered a Chop row that neither a log table nor a def asked for -
       which every tree in the forest could do before this, the leafy ones
       included.
     * **The cache's wording wins wherever its def carries the verb.** The achey
       tree's def says "Chop", not the world's generic "Chop down", so its row
       reads "Chop Achey tree". Where the def names nothing, the world's word
       stands.
     * **The world's substitutions stand where the cache says nothing.** The
       anvil's and the well's defs carry no actions at all, and a fire has no loc
       in the bake at all - a fire is not a loc: it is what a firemaking action
       leaves behind - so Smith, Fill and Cook are the world's own rows, and the
       furnace's Craft window is a world-only extra. (The furnace's own Smelt is
       the cache's: loc 2781 names it. Since unit XIX the furnace, the range, the
       counter and the signpost are all real locs, so the only scenery type left
       with no loc anywhere in the bake is the fence.)

   `sceneryRowSpecs` is the one source of truth for all of it: the tile menu, the
   top-left hover line and `src/tools/check-locs.mjs` all read it, so the three
   cannot drift apart - which is how a mined-out rock came to keep "Mine" in its
   hover text while its menu had quietly dropped the row. */

/* The cache's own scenery action lists, keyed by baked loc key
   (src/data/loc-cache-menus.json - the scenery sibling of the creature file, and
   built from the same kind of parse: config index 2, archive 6 here, archive 9
   there). Loaded once at boot by src/main.js. With no data the rows fall back to
   the world's own wording, so a fetch that never lands degrades to the menu this
   world had before the audience, never to an empty one. */
let LOC_DEF_MENUS = {};
export function setLocDefMenus(data) { LOC_DEF_MENUS = data || {}; }
export function locDefFor(key) { return (key && LOC_DEF_MENUS[key]) || null; }

/* The loc key the world MEANS for an object's tile - the renderer's own hash
   (`scene.js#_locSpec`), whether or not the bake carries a model for the key.
   Null only for an object the world draws itself with no loc at all: since unit
   XIX that is the fence and a fire, the last two. */
function locKeyOf(o, x, z) {
  const spec = G.view && G.view._locSpec ? G.view._locSpec(o, x, z) : null;
  return spec ? spec.key : null;
}

/* The key the tile is actually DRAWN with (`scene.js#locSpec`, which returns the
   spec only when the bake has that model). The two differ for a key the bake is
   missing, and that difference is exactly what `locMenuAudit` reports - it is
   how the building corners were found asking for a `wall_corner` the model bake
   never carried, so that each corner fell back to the procedural stand-in while
   its neighbours were the textured cache wall. */
function locModelKeyOf(o, x, z) {
  const spec = G.view && G.view.locSpec ? G.view.locSpec(o, x, z) : null;
  return spec ? spec.key : null;
}

/* The loc's def, as `{ key, modelKey, def }`. The def is looked up by the key
   the world means, not by the one it manages to draw, because the def describes
   the object. */
export function locDefOf(o, x, z) {
  const key = locKeyOf(o, x, z);
  return { key, modelKey: locModelKeyOf(o, x, z), def: locDefFor(key) };
}

/* The cache's `hidden` action is a placeholder: the engine stores it in an
   option slot it wants left blank, so it is never a row. Thirty-six of the
   world's eighty-five baked locs carry it (every plain tree, every ore rock,
   every fishing spot), which is why it has to be filtered everywhere the def's
   actions are read. */
export function locActions(def) {
  return def && Array.isArray(def.actions) ? def.actions.filter((v) => v && v !== "hidden") : [];
}

/* The def's own verb for this object, when the def names one of `words`;
   otherwise null. This is what lets the cache's wording win - a single lookup
   applied to every row below, so a row can never hand-copy the word and drift. */
function locDefVerb(o, x, z, words) {
  return locActions(locDefOf(o, x, z).def).find((v) => words.some((w) => w.toLowerCase() === v.toLowerCase())) || null;
}

/* One object's rows, as specs. `verb` and `run` are required; `noun` overrides
   what the verb is appended to (the default is `menuNoun`, which is the world's
   own name for the object and, for a range, the shorter one the menu reads
   better with); `extra` marks a world-only row whose label is the verb alone;
   `alts` names the def's own spellings of the same act, for the remap at the end
   (a tree's "Chop down"/"Chop"). */
function sceneryRowSpecs(o, x, z) {
  const specs = [];
  /* The isle's course (src/island.js#COURSE). One row per piece, and it is the
     same row for all twenty-one of them, because every obstacle is the same act
     from the menu's point of view - the verb is what differs, and the piece's
     own def names it. The remap at the end of this function hands the row the
     cache's spelling, so the menu reads "Swing-on Ropeswing" and not something
     invented. A piece whose def names nothing (the monkeybars' end posts) gets
     no row at all, which is what makes those posts scenery. */
  if (AGILE_VERB[o.t]) specs.push({ verb: AGILE_VERB[o.t], run: (tx, tz) => doAgilityObstacle(tx, tz) });
  switch (o.t) {
    /* A tree's left click is its def's own Chop, and two things can put the row
       there: the world's log table (`TREE_LOGS`, src/items.js) - a species with
       an entry is a woodcutting species - or the loc def itself naming the verb.
       The second half is what the cache decides: the forest's **evergreens**
       have no logs in this world but their defs (locs 1315-1319) do carry "Chop
       down", so they keep the row and answer it with the world's own refusal
       ("You can't chop this tree."), while the **leafy** tree's def carries no
       actions at all and so offers no Chop - which is the live game's own
       answer for both. A stump is not a tree any more: the stump locs' defs
       carry no action either. */
    case "tree":
      if (!o.stump && (TREE_LOGS[o.kind || "tree"] || locDefVerb(o, x, z, ["Chop down", "Chop"]))) {
        /* `alts` names the def's own spellings of this act, so the remap below
           can hand the row the cache's word where the two differ - the achey
           tree's def says "Chop", every other choppable tree "Chop down". */
        specs.push({ verb: "Chop down", alts: ["Chop down", "Chop"], run: (tx, tz) => chopTree(tx, tz) });
      }
      /* Tutorial island (user ask 2026-10-30): with rope in hand and Scully's
         orders (stage 2), a cay tree offers Climb - tie fast, haul the crown
         down, pick the nuts. Ordinary chopping is untouched. */
      if (!o.stump && inTutIsleBox(x, z) && tutStageOf(G.ps) === 2 && invCount(G.ps, "rope") > 0) {
        specs.push({ verb: "Climb", run: (tx, tz) => bendPalmTree(tx, tz) });
      }
      break;
    /* Tutorial island's wrecks (user ask 2026-10-30): searchable rigging, but
       only on the cay - mainland wrecks keep their examine-only manners. */
    case "wreck":
      if (inTutIsleBox(x, z)) specs.push({ verb: "Search", run: (tx, tz) => searchCayWreck(tx, tz) });
      break;
    /* Fresh coconuts, knocked from the crown by the bend above: Take carries
       them home. The weathered ground kind (tut_dry_coconut) stays
       examine-only dressing, exactly as before. */
    case "tut_coconut":
      specs.push({ verb: "Take", run: (tx, tz) => takeCoconut(tx, tz) });
      break;
    /* The smugglers' cache (user ask 2026-10-30): a hole under the east
       bluff. Searchable once Scully has told the rumor (stage 4); before
       that it is just a dark crack with something glinting out of reach. */
    case "tut_cache":
      specs.push({ verb: "Search", run: (tx, tz) => searchTutCache(tx, tz) });
      break;
    /* Every rock carries both, mined out or not: the defs (locs 450/451 and the
       ten ore rocks) list Mine then Prospect on all of them, and the refusals
       this world gives - "There is no ore currently available in this rock." -
       are the ones the live game gives. */
    case "rock":
      specs.push({ verb: "Mine", run: (tx, tz) => mineRock(tx, tz) });
      specs.push({ verb: "Prospect", run: (tx, tz) => prospectRock(tx, tz) });
      break;
    /* One row per action the spot's own kind carries, in its order (Net/Bait,
       Cage/Harpoon, Net/Harpoon), so a spot that takes a cage offers Cage beside
       the harpoon instead of hiding it behind one generic verb. */
    case "fishing":
      for (const m of spotMethods(o.kind)) specs.push({ verb: m.verb, run: (tx, tz) => fishSpot(tx, tz, m.tool) });
      break;
    case "furnace":
      specs.push({ verb: "Smelt", run: (tx, tz) => smeltAt(tx, tz) });
      /* The furnace's other trade (unit L3): the client's own interface 446,
         opened here whenever the player is carrying a bar and a mould, so the
         bench is reachable from the furnace as well as from the bar. */
      if (JEWEL_MOULDS.some((m) => invCount(G.ps, m))) {
        if (invCount(G.ps, "gold_bar")) specs.push({ verb: "Craft gold", extra: true, run: (tx, tz) => jewelleryAt(tx, tz, "gold_bar") });
        if (invCount(G.ps, "silver_bar")) specs.push({ verb: "Craft silver", extra: true, run: (tx, tz) => jewelleryAt(tx, tz, "silver_bar") });
      }
      break;
    case "anvil": specs.push({ verb: "Smith", run: (tx, tz) => smithAt(tx, tz) }); break;
    /* The flax field's crop: the cache's own "Pick" (loc 2646), kept in every
       state like a mined-out rock's Mine - a picked plant answers with the
       live game's own "no flax" line until it grows back. */
    case "flax": specs.push({ verb: "Pick", run: (tx, tz) => pickFlax(tx, tz) }); break;
    case "wheel": specs.push({ verb: "Spin", run: (tx, tz) => spinAt(tx, tz) }); break;
    /* The potter's wheel: soft clay in the pack shapes on it (the use path is
       the same act through the cursor). The wheel's own def names no actions,
       so the Shape row is the world's - offered only while soft clay is
       carried, the furnace's Craft pattern. */
    case "potwheel":
      if (invCount(G.ps, "soft_clay")) specs.push({ verb: "Shape", run: (tx, tz) => potAt(tx, tz) });
      break;
    /* The pottery oven: the cache's own "Fire" (loc 2643). An unfired piece in
       the pack fires in it - the use path is the same act through the cursor -
       and the row opens the firing window, since the oven cannot know which
       piece the player means. */
    case "potoven": specs.push({ verb: "Fire", run: (tx, tz) => openFireMenu(tx, tz) }); break;
    case "range": specs.push({ verb: "Cook", run: (tx, tz) => cookFood(tx, tz) }); break;
    case "well": specs.push({ verb: "Fill", run: (tx, tz) => fillBucket(tx, tz) }); break;
    /* The sandpit's own Fill (see fillSand above): a bare verb like the
       well's, answered on arrival with the honest refusal when no bucket is
       carried. */
    case "sandpit": specs.push({ verb: "Fill", run: (tx, tz) => fillSand(tx, tz) }); break;
    /* The kitchen sink (update 1): the cache's own Sink (loc 873), standing
       against the kitchen's east wall. It fills what the well does not - jugs
       and bowls as well as buckets - one Fill row per empty vessel carried. */
    case "sink":
      for (const emptyId of ["bucket", "jug", "bowl"]) {
        if (invCount(G.ps, emptyId)) specs.push({ verb: "Fill " + itemName(emptyId), run: (tx, tz) => fillVessel(tx, tz, emptyId) });
      }
      break;
    /* A door swings both ways, so the verb follows the leaf's state exactly the
       way a coffin's follows its lid (`world.js#isWalkable` reads the same flag).
       The closed door is the only door in the bake, because the open one is the
       same panel turned a further quarter turn, so the def - which names only
       "Open" - cannot carry the closing verb. */
    case "door": specs.push({ verb: o.open ? "Close" : "Open", run: (tx, tz) => toggleDoor(tx, tz) }); break;
    /* The crypt's coffins: loc 398's own action is "Open" (399's is "Close"), so
       the row follows the object's state - and here the bake really does carry
       both locs, so the def names both verbs. */
    case "coffin": specs.push({ verb: o.open ? "Close" : "Open", run: (tx, tz) => toggleCoffin(tx, tz) }); break;
    /* The cache's own list for a bank booth (loc 2213) is ["Use", "Use-quickly"],
       and action 0 is the default, so the hover text and the first row read "Use
       Bank booth" - which is what opens the bank in the 317 client. The second
       row is the same act by its other name, because the def carries both. */
    case "booth":
      specs.push({ verb: "Use", run: (tx, tz) => onClickTile(tx, tz) });
      specs.push({ verb: "Use-quickly", run: (tx, tz) => onClickTile(tx, tz) });
      break;
    case "altar": specs.push({ verb: "Pray-at", run: (tx, tz) => prayAtAltar(tx, tz) }); break;
    /* The mysterious ruins on their point east of the mine: Enter walks in with an air talisman
       in the pack and refuses without one - the Use row below is the same act
       through the cursor, for the player already carrying the talisman. */
    case "ruins": specs.push({ verb: "Enter", run: (tx, tz) => enterAirAltar(tx, tz) }); break;
    /* The Air Altar itself: bind every rune essence carried into air runes. */
    case "air_altar": specs.push({ verb: "Craft-rune", run: (tx, tz) => craftAirRunes(tx, tz) }); break;
    /* The isle portals: the essence portal's own Enter, bound for the
       tile the portal was placed to go. */
    case "rc_portal": specs.push({ verb: "Enter", run: (tx, tz) => usePortal(tx, tz) }); break;
    /* The new island's portals: the cache's own Enter, bound for the tile
       the portal was placed to go - the same `usePortal` as above. */
    case "portal": specs.push({ verb: "Enter", run: (tx, tz) => usePortal(tx, tz) }); break;
    /* The cache's own stall action is "Steal-from" (the option every stall loc
       in index 6 carries), and it is offered whether or not the stall has been
       raided: the refusal an emptied stall gives is more use than a menu that
       silently changes shape, and it says what happened. */
    case "stall": specs.push({ verb: "Steal-from", run: (tx, tz) => stealFrom(tx, tz) }); break;
    case "signpost": specs.push({ verb: "Read", run: (tx, tz) => readSignpost(tx, tz) }); break;
    case "statue": specs.push({ verb: "Read", noun: "plaque", run: (tx, tz) => readPlaque(tx, tz) }); break;
    /* The village props' own verbs (unit X; see the "props' verbs" section
       above). Every one of them is the def's own word, so the remap at the end
       of this function hands the row its cache wording back - and each stays on
       the object in every state, the way a mined-out rock keeps Mine. */
    case "rocky": specs.push({ verb: "Jump-to", run: (tx, tz) => jumpToRocky(tx, tz) }); break;
    case "tut_hat": specs.push({ verb: "Take", run: (tx, tz) => takeTutHat(tx, tz) }); break;
    case "crate":
      /* A stocked crate is searched, not hidden in: the pantry crates carry
         the raw food, so they offer Search until emptied, and only an empty
         crate takes the hider - unless the room says otherwise (`searchOnly`,
         which the kitchen sets on all of its crates: Search there always,
         Hide-in never). */
      if (o.loot || o.searchOnly) { specs.push({ verb: "Search", run: (tx, tz) => searchContainer(tx, tz) }); break; }
      specs.push({ verb: "Hide-in", run: (tx, tz) => hideInCrate(tx, tz) }); break;
    case "crate_b": specs.push({ verb: "Search", run: (tx, tz) => searchContainer(tx, tz) }); break;
    case "chest": specs.push({ verb: "Open", run: (tx, tz) => searchContainer(tx, tz) }); break;
    case "ladder_down":
      /* The cache's own order is Climb-down first (loc 4713 carries
         ["Climb-down","Close"]): an open hatch is descended with a plain
         left-click, and Close is the second row. A closed lid offers Open
         only - there is no Climb-down row until it is open. */
      if (o.trapdoor && o.open) specs.push({ verb: o.verb || "Climb-down", run: (tx, tz) => (o.mgIn ? enterMinigame(tx, tz) : climbLadder(tx, tz)) });
      if (o.trapdoor) specs.push({ verb: o.open ? "Close" : "Open", run: (tx, tz) => toggleManhole(tx, tz, !G.world.objAt(tx, tz).open) });
      if (!o.trapdoor) specs.push({ verb: o.verb || "Climb-down", run: (tx, tz) => climbLadder(tx, tz) });
      break;
    case "ladder_up": specs.push({ verb: o.verb || "Climb-up", run: (tx, tz) => (o.mgOut ? exitMinigame(tx, tz) : climbLadder(tx, tz)) }); break;
  }
  /* The cache's wording wins where its def carries the verb; the world's stands
     where it does not. A spec's `alts` are the def's own spellings of the same
     act (a tree's Chop/Chop down), so a wording can be handed over without the
     row changing which act it runs. A fishing spot is exempt: every spot in the
     archive is the same model and the bake keeps one key for all of them (loc
     2028, the Net/Bait loc), so its verbs are the world's per-kind business and
     that one def cannot name them. */
  if (o.t !== "fishing") for (const s of specs) s.verb = locDefVerb(o, x, z, s.alts || [s.verb]) || s.verb;
  return specs;
}

/* What a row's verb is appended to. */
function rowNoun(o, s, x, z) { return s.noun || menuNoun(o, x, z); }

/* The object's menu block: the same rows, in the same order, with the tag the
   client puts on them (the menu paints the name cyan, and so does the hover
   line - it shows the block's row 0, tags and all). */
export function sceneryRows(o, tx, tz) {
  return sceneryRowSpecs(o, tx, tz).map((s) => ({
    label: s.extra ? s.verb : named(s.verb, rowNoun(o, s, tx, tz), "scenery"),
    fn: () => s.run(tx, tz),
  }));
}

/* The object's default left-click action, as the top-left hover line shows it:
   the first row of the block above, tags and all. Null for an object with no rows at
   all - a bush, a table, a wall - which the client leaves unlabelled. */
export function sceneryActionLabel(o, tx, tz) {
  const specs = sceneryRowSpecs(o, tx, tz);
  if (!specs.length) return null;
  return specs[0].extra ? actVerb(specs[0].verb) : actVerb(specs[0].verb) + " <col=00ffff>" + rowNoun(o, specs[0], tx, tz) + "</col>";
}

/* A diagnostic view of one scenery object's menu, for src/tools/check-locs.mjs
   and nothing else: the loc the tile resolves to, the def's own actions (with
   the cache's `hidden` placeholder filtered), the rows this world shows, which
   of the def's verbs the world cannot carry out (`dropped` - the cache promises
   a click and nothing happens) and which rows are the world's own (`added` - the
   Chop this world gives a leafy tree, the Smelt no furnace def names). */
export function locMenuAudit(o, x, z) {
  const { key, modelKey, def } = locDefOf(o, x, z);
  const defVerbs = locActions(def);
  const specs = sceneryRowSpecs(o, x, z);
  const rowVerbs = specs.filter((s) => !s.extra).map((s) => s.verb);
  const extras = specs.filter((s) => s.extra).map((s) => s.verb);
  const low = (s) => s.toLowerCase();
  return {
    type: o.t,
    key,
    modelKey,
    locId: def ? def.locId : null,
    defName: def ? def.name : null,
    worldName: objName(o),
    /* the name the rows and the examine actually show - the cache's own name of
       the loc this tile resolves to, this world's word only for the stalls, for
       the three generic-loc tree kinds and for an object with no loc (see
       `menuName`) */
    displayName: menuName(o, x, z),
    defVerbs,
    rowVerbs,
    extras,
    dropped: defVerbs.filter((v) => !rowVerbs.some((r) => low(r) === low(v))),
    added: rowVerbs.filter((r) => !defVerbs.some((v) => low(v) === low(r))),
  };
}

/* --------------------------------------------------------------- click routing */

/* The right-click menu is built from *everything under the cursor*, not from
   one tile. The client does the same: its `method310` scan walks the scene and
   stacks the actions of every object, creature and ground item whose projected
   box the mouse is inside, and this world's `Game.pickAll` hands over exactly
   that set (src/game.js#Game.pickAll - a convex box projects to precisely those
   pixels whose rays meet it, so "every tile box the ray enters" is "every object
   drawn under the cursor"). The bank is where it shows: the banker stands at
   (62,52) behind the booth at (62,53), the booth's box and the banker's body box
   both cover the same handful of pixels, so right-clicking the banker offers his
   rows *and* the booth's, and right-clicking the booth's own face offers the
   same menu.

   Rows are collected in this order - the one the single-tile menu always used:

     1. every creature under the cursor, nearest first, each creature's whole
        cache-def block (`npcMenuRows`);
     2. every other player under the cursor, nearest first (a stack holding a
        player is titled with their name - see `onRightClickWorld`);
     3. every object under the cursor, nearest first (`sceneryRows`);
     4. the ground items on the tile the click is on;
     5. "Walk here";
     6. one Examine per thing gathered, in the same order;
     7. "Cancel".

   The examines cannot be appended where their row was pushed - they all sit
   below "Walk here" whatever combination of things the cursor held - so they are
   collected while the rows are built and appended at the end, the way the
   single-tile menu did it.

   "Walk here" always walks. It used to route the bare-tile case through
   onClickTile, whose false return means "the caller should fall through to a
   plain walk" - but a menu entry has no caller to fall through to, so
   right-clicking an empty tile offered a Walk here that did nothing at all. */
export function worldMenuOptions(pick) {
  const opts = [];
  const examines = [];
  const seen = new Set();
  for (const h of pick.npcs) {
    if (seen.has(h.ent)) continue;
    seen.add(h.ent);
    npcMenuBlock(h.ent, opts, examines);
  }
  for (const h of pick.players) {
    if (seen.has(h.ent)) continue;
    seen.add(h.ent);
    playerMenuBlock(h.ent, opts);
  }
  for (const h of pick.locs) {
    const key = h.tx + "," + h.tz;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = h.obj || G.world.objAt(h.tx, h.tz);
    if (o) locMenuBlock(o, h.tx, h.tz, opts, examines);
  }
  /* The tutorial hat's mesh is a few pixels tall, so the ray usually meets the
     sand instead of the hat: without this, right-clicking the hat tile offers
     a ground menu with no Take row. Any pick on the hat tile (mesh or sand)
     names the hat while it stands (phase 0). The `seen` check keeps a direct
     mesh hit single. */
 for (const g of [pick.primary, pick.ground]) {
   if (!g || seen.has(g.tx + "," + g.tz) || tutHatTaken()) continue;
   const o = G.world.objAt(g.tx, g.tz);
   if (o && o.t === "tut_hat") { seen.add(g.tx + "," + g.tz); locMenuBlock(o, g.tx, g.tz, opts, examines); }
 }
  /* Fallen coconuts are the same few-pixels problem as the hat: any pick on
     a coconut tile (mesh or sand) names the coconut. No phase gate - they
     are dressing, not progression. */
  for (const g of [pick.primary, pick.ground]) {
    if (!g || seen.has(g.tx + "," + g.tz)) continue;
    const o = G.world.objAt(g.tx, g.tz);
    if (o && o.t === "tut_coconut") { seen.add(g.tx + "," + g.tz); locMenuBlock(o, g.tx, g.tz, opts, examines); }
    if (o && o.t === "tut_dry_coconut") { seen.add(g.tx + "," + g.tz); locMenuBlock(o, g.tx, g.tz, opts, examines); }
    if (o && o.t === "tut_cache") { seen.add(g.tx + "," + g.tz); locMenuBlock(o, g.tx, g.tz, opts, examines); }
  }
  const itemTiles = [];
  const seenTile = new Set();
  const addTile = (tx, tz) => {
    if (tx == null || tz == null) return;
    const k = tx + "," + tz;
    if (seenTile.has(k)) return;
    seenTile.add(k);
    itemTiles.push([tx, tz]);
  };
  const at = pick.primary;
  if (at) addTile(at.tx, at.tz);
  if (pick.ground) addTile(pick.ground.tx, pick.ground.tz);
  for (const h of pick.npcs || []) addTile(Math.floor(h.ent.x), Math.floor(h.ent.z));
  for (const h of pick.players || []) addTile(Math.floor(h.ent.x), Math.floor(h.ent.z));
  for (const h of pick.locs || []) addTile(h.tx, h.tz);
  for (const [tx, tz] of itemTiles) itemMenuBlock(tx, tz, opts);
  opts.push({ label: "Walk here", fn: () => { const g = pick.ground || at; if (g) walkTile(g.tx, g.tz); } });
  for (const e of examines) opts.push(e);
  opts.push({ label: "Cancel", fn: () => {} });
  return opts;
}

/* One creature's block: the def's verbs in the def's order, then whatever the
   world adds that the def leaves out (unit W, `npcMenuRows`), and the Examine
   every creature gets. The rows already carry the `@yel@` name tag and the
   attack row already carries its level suffix, so nothing about a creature's
   menu is decided here. */

/* The "Use <item> -> <target>" row the client puts at the head of a target's own
   block while an item is in the hand - and only then; without one there is no
   row. The act behind it is `useOnWorld`, the same one the left click runs, so
   the menu row, the hover line and the click can never disagree about what a use
   on this target means. `prefer` is the entity the row is about, because a
   creature's click is an entity and not a tile (see Game.pickEntity). */
function pushUseRow(opts, label, tx, tz, prefer) {
  if (!UI.useItem) return;
  /* keepUse marks the one menu row that is itself the use attempt, so the
     menu-pick disarm (src/ui.js#openCtx) leaves aiming through the menu alone */
  opts.push({ label: "Use " + itemName(UI.useItem.id) + " -> " + label, keepUse: true, fn: () => useOnWorld(tx, tz, prefer) });
}
function npcMenuBlock(npc, opts, examines) {
  pushUseRow(opts, npcDisplayName(npc), Math.floor(npc.x), Math.floor(npc.z), npc);
  for (const r of npcMenuRows(npc)) opts.push(r);
  const nm = npcDisplayName(npc);
  examines.push({ label: named("Examine", nm, "npc"), fn: () => chat(npcExamine(npc), "game") });
}

/* One object's block, from `sceneryRowSpecs` (see the note above it): the
   cache's own wording wherever its def carries the verb, the world's own rows
   where it does not, and no row at all for something the world cannot do - which
   is why a leafy or evergreen tree no longer offers a Chop. An object with no
   rows at all (a wall) still gets its Examine. */
function locMenuBlock(o, tx, tz, opts, examines) {
  pushUseRow(opts, menuName(o, tx, tz), tx, tz, null);
  for (const r of sceneryRows(o, tx, tz)) opts.push(r);
  examines.push({ label: named("Examine", menuName(o, tx, tz), "scenery"), fn: () => chat(objExamine(o, tx, tz), "game") });
}

/* The ground items on one tile, as Take rows. With a ground-aimed spell picked
   (the two Telekinetic Grabs), the cast leads the block - the client's own
   "Cast <spell> on <item>", the same first row a creature's menu gets with a
   combat spell picked (see `npcAttackLabel`). The cast is only offered on a
   tile holding an item, naming that tile's top item; the greater grab's 3x3
   sweep happens on landing, never in the aim. */
function itemMenuBlock(tx, tz, opts) {
  const pile = groundItemsAt(tx, tz);
  const picked = UI.spell != null ? spellById.get(UI.spell) : null;
  if (picked && (picked.on & SPELL_TARGET.GROUND) && grabAimHas(picked, tx, tz)) {
    /* The cast is only ever offered on a tile holding an item - the greater
       grab is aimed exactly like the standard one, one tile and one named
       item, and its 3x3 sweep only happens on landing. */
    const g0 = pile[pile.length - 1];
    const what = itemName(g0.id) + (g0.qty > 1 ? " x" + g0.qty : "");
    opts.push({
      label: "Cast " + picked.name + " on " + NAME_TAG.item + what,
      fn: () => {
        if (distT(tx, tz, G.player) <= (picked.range || 7) + 0.5) castSpell(picked, { where: "ground", x: tx, z: tz });
        else chat("That is too far away to reach.", "warn");
      },
    });
  }
  /* An item in the hand puts the Use row ahead of the Take rows - the same
     line the hover draws and the act the left click runs (`useOnWorld`), so
     the menu can never offer what the other two will not do. */
  if (UI.useItem && pile.length) {
    const g0 = pile[pile.length - 1];
    pushUseRow(opts, itemName(g0.id) + (g0.qty > 1 ? " x" + g0.qty : ""), tx, tz, null);
  }
  for (let i = pile.length - 1; i >= 0; i--) {
    const g = pile[i];
    opts.push({ label: named("Take", itemName(g.id) + (g.qty > 1 ? " x" + g.qty : ""), "item"), fn: () => takeGround(tx, tz, g.id) });
  }
}

/* Another player's name as their menu writes it: with the combat level that
   player's own client worked out and sent in its kit packet (src/net.js#kitText,
   src/game.js#setGhostKit). Nobody else can derive it - another client sees a
   body and a kit, not a stat sheet - so it is a fact the player tells everybody,
   and "Bob (level 3)" is the spaced form this project's menus already use for a
   creature (see `npcAttackLabel`). A ghost whose level has not arrived yet is
   shown as just their name: 0 means "not known", and inventing a number would be
   worse than showing none. */
export function playerMenuName(ghost, tagged) {
  const n = (ghost && ghost.name) || "Player";
  const lvl = ghost && ghost.combatLevel;
  if (!lvl) return n;
  const suffix = " (level " + lvl + ")";
  if (!tagged) return n + suffix;
  return n + " @" + playerCombatTag(ghost) + "@" + suffix;
}

/* One other player's block: Follow, always. There is deliberately no "Stop
    following" row: clicking Follow while already following them simply starts
    the follow over (src/game.js#followPlayer clears the route state, so the
    path is recalculated from here), and the way back out of a follow is
    walking somewhere else, the client's own rule. Plus whatever the trade
    seam adds (src/trade.js, through `Actions.playerOptions`, the same way
    combat.js adds a creature's Attack through `Actions.npcAttack`). No
    Examine: the client does not examine players. */
function playerMenuBlock(ghost, opts) {
  const nm = playerMenuName(ghost);
  const tnm = playerMenuName(ghost, true);
  /* With a spell that is aimed at players picked in the book, the cast is the
     block's first row - the client's own "Cast <spell> on <name>", which is the
     same line its hover text uses for a creature (src/actions.js#npcAttackLabel).
     The group teleports are not in this list at the best of times: they are cast
     on the spot, and the people they move are whoever happens to be standing in
     the caster's own 3x3 when the spell goes off. */
  const spell = pickedPlayerSpell();
  if (spell) {
    opts.push({ label: "Cast " + spell.name + " on " + tnm, fn: () => castSpellOnPlayer(ghost, spell) });
  }
  pushUseRow(opts, tnm, Math.floor(ghost.x), Math.floor(ghost.z), ghost);
  opts.push({ label: "Follow " + tnm, fn: () => { cancelAction(); clearLeaps(); followPlayer(ghost); } });
  if (Actions.playerOptions) Actions.playerOptions(ghost, opts);
}

/* The welcome a fresh character gets: the Wise Old Man speaks first. Called
   once, when a character that has just come through the maker steps into the
   world (main.js#enterWorld) - never for a returning character, and never
   twice (the maker only runs once per character). It opens his real
   conversation tree, the same box a Talk-to would, so he tells the newcomer
   about the town himself; the player spawns two tiles from his post, facing
   him, so he is already the first face they see. Skipped when the box is busy
   (a dialogue or a modal already owns the chatbox) or when he has wandered -
   he stands still, but a stun or a shove is not a conversation. Too far away
   (a spawn that moved, a teleport) gets a waved-over instead: the chat line
   points at him rather than opening a box on a man across the map. */
export function greetNewArrival() {
  try {
    if (!G || !G.player || !G.npcs) return false;
    if (Dialogue.active) return false;
    if (UI.els.modalLayer && !UI.els.modalLayer.hidden) return false;
    const wom = G.npcs.find((n) => n && n.type === "wise_old_man" && !n.dead);
    if (!wom) return false;
    if (Math.abs(G.player.x - wom.x) > 9 || Math.abs(G.player.z - wom.z) > 9) {
      chat("The Wise Old Man waves you over - go and talk to him.", "game");
      return true;
    }
    const tree = NPC_TALK.wise_old_man;
    if (!tree) return false;
    return startDialogue(wom, typeof tree === "function" ? tree(wom) : tree);
  } catch (e) { return false; }
}

/* The one-tile form: the menu for a single tile, with `prefer` naming the
   creature the cursor picked (see Game.pickEntity), so the action is taken on
   the thing that was clicked rather than on whichever neighbour happens to be
   nearest the tile's centre. Nothing opens a menu this way any more - a
   right-click stacks everything under the cursor - but this is what a tile's
   menu *is*, and it is what the audits and the wider docs mean by "the tile
   menu". */
export function tileMenuOptions(tx, tz, prefer) {
  const npc = npcAt(tx, tz, prefer);
  const o = G.world.objAt(tx, tz);
  return worldMenuOptions({
    npcs: npc ? [{ ent: npc, dist: 0 }] : [],
    players: [],
    locs: o ? [{ tx, tz, obj: o, dist: 0 }] : [],
    ground: G.world.inBounds(tx, tz) ? { tx, tz, dist: 0 } : null,
    primary: { tx, tz },
  });
}

/* Move a door's leaf, in place. The two states are both "solid scenery" (the
   leaf lies in the wall plane shut and across the jamb open), so this answers
   false-harmlessly when the door is already in the state asked for, and
   `world.isWalkable` reads the flag back - an open door's tile is floor, a shut
   one's is wall. */
function setDoorOpen(tx, tz, open) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "door" || !!o.open === !!open) return false;
  o.open = !!open;
  G.view.setDoorOpen(o, !!open);
  /* ...and the world is told (src/actions.js's ledger section). The leaf moves
     here first, so the click never waits on a round trip; the report is
     silent with no socket, so a single-player door is exactly what it was. */
  reportLoc(tx, tz, 0);
  return true;
}

/* The left click and the menu's own top row on a door: ONE verb that follows the
   leaf's state - Open on a shut door, Close on an open one. This is the client's
   own split, where the shut leaf's loc carries an "Open" action and the open
   leaf's carries "Close", collapsed into one function because this world keeps
   both states on one object - `sceneryRowSpecs` offers the word by state and
   calls this, so the click, the menu, the hover line and the tile-menu audit can
   never disagree.

   **A door is strictly a toggle (the user's rule, 2026-09-22 - standing
   preference P3): flipping the leaf is the whole of it.** No
   walk follows the click in either direction - opening a door does not walk you
   through it, and shutting one does not move you either - and no route ever
   swings a leaf by itself (a shut door is a wall to the pathfinder, for the
   player as much as for a creature). The click is the only thing in the game
   that moves a leaf, and it moves it whether or not somebody is standing in the
   doorway, exactly as the client does: a character left standing in a shut
   doorway is not stuck, because leaving a tile never needs the tile you are on
   to be walkable (src/game.js#stepEntity). A click from across the room still
   walks you over first - that is every object's reach rule, not a door
   behaviour - and the hinge swings on arrival.

   **A door is shared the moment it moves (2026-09-25).** The leaf swings here
   first - the click never waits on a round trip - and then the tile and its new
   state go onto the world ledger, which is where every shared piece of the world
   travels now (the section "the world ledger" above; a door is its LOC_OPEN
   bit). That is the whole of the fix for the two-players-one-doorway problem: a
   door used to be private scenery, so the player who opened it walked through a
   gap while the player behind them walked into a shut leaf. Nothing goes out
   offline, so a door is still a door in a world of one. */
function toggleDoor(tx, tz) {
  const o = G.world.objAt(tx, tz);
  if (!o || o.t !== "door") return false;
  const want = !o.open;
  if (!nearTile({ x: tx, z: tz }, G.player, 1)) {
    begin("goto", tx, tz, () => toggleDoor(tx, tz));
    return true;
  }
  setDoorOpen(tx, tz, want);
  return true;
}

function climbLadder(tx, tz) {
  /* The stairs are read on the climber's own level: the same tile holds the
     up-flight on the ground and the down-flight upstairs. `toPlane` names the
     level the climb lands on; a ladder without one (the manhole, the isle)
     keeps the level it started on. */
  const o = G.world.objAt(tx, tz, G.player.plane || 0);
  if (!o || (o.t !== "ladder_down" && o.t !== "ladder_up") || !o.to) return;
  const dx = o.to[0], dz = o.to[1];
  const plane = o.toPlane != null ? o.toPlane : (G.player.plane || 0);
  approach(tx, tz, () => {
    const p = G.player;
    faceTarget(p, tx, tz);
    /* A closed lid has no Climb-down row, so a climb reaching a shut
       trapdoor is stale (state changed mid-walk) - it stops instead of
       opening the lid itself. */
    if (o.trapdoor && !o.open) return;
    /* The climb owns the player until its own arrival below lands them: the
       lock refuses every other intent at `begin`, `approach`, `onClickTile`,
       `castSpell`, `walkTile`, `jumpToRocky`, `useOnWorld`, src/game.js#walkTo
       and src/combat.js#attackNpc, and the arrival below always clears it. */
    p.climbLock = true;
    if (!document.hidden) {
      if (o.t === "ladder_down") {
        /* Down climbs wear the same pose as up climbs - the identical call, not
           a looped hold: the tick loop drops looping poses that are not work
           swings, which is what ate the old 2s hold a tick after it started. */
        const fromPlane = G.player.plane || 0;
        if (!o.trapdoor || (!inUnderbelly(dx, dz) && !inMinigame(dx, dz)) || fromPlane >= 1) playCastAnim(p, "agile_reach_ladder");
      } else {
        playCastAnim(p, "agile_reach_ladder");
      }
    }
    /* A staircase flight reads as stairs, every other ladder as a ladder. */
    const stairs = typeof o.key === "string" && o.key.indexOf("stair") === 0;
    chat(o.t === "ladder_down" ? (stairs ? "You climb down the stairs." : "You climb down the ladder.") : (stairs ? "You climb up the stairs." : "You climb up the ladder."), "game");
    afterTicks(2, () => {
      if (Math.max(Math.abs(Math.round(p.x - 0.5) - tx), Math.abs(Math.round(p.z - 0.5) - tz)) > 1) { p.climbLock = false; return; }
      p.path.length = 0;
      placeEntity(p, dx + 0.5, dz + 0.5, p.dir, plane);
      if (G.cameraTarget && G.world) {
        G.cameraTarget.x = dx + 0.5;
        G.cameraTarget.z = dz + 0.5;
        try { G.cameraTarget.y = G.world.heightAt(dx + 0.5, dz + 0.5, plane); } catch (e) {}
      }
      p.climbLock = false;
      if (document.hidden) {
        p.castAnim = null;
        p.castLeft = 0;
        p.castLoop = false;
        p.castTail = false;
        p.castClamp = false;
        p.castTool = null;
      }
    });
  });
}

/* The minigame dungeon's ways down: the island's trapdoor mouths
   (src/world.js, `mgIn`). climbLadder's shape - approach, face, the same
   two-tick beat - but the arrival starts the run's clock
   (src/minigame.js#startRun) instead of just landing. Silent like the town
   mouth: a trapdoor descent into dirt plays no animation. A shut lid is a
   stale climb (state changed mid-walk) and stops, the way climbLadder does. */
function enterMinigame(tx, tz) {
  const o = G.world.objAt(tx, tz, G.player.plane || 0);
  if (!o || !o.mgIn || !o.to) return;
  const dx = o.to[0], dz = o.to[1];
  approach(tx, tz, () => {
    const p = G.player;
    faceTarget(p, tx, tz);
    const cur = G.world.objAt(tx, tz, G.player.plane || 0);
    if (!cur || !cur.open) return;
    p.climbLock = true;
    chat("You climb down the ladder.", "game");
    afterTicks(2, () => {
      if (Math.max(Math.abs(Math.round(p.x - 0.5) - tx), Math.abs(Math.round(p.z - 0.5) - tz)) > 1) { p.climbLock = false; return; }
      p.path.length = 0;
      placeEntity(p, dx + 0.5, dz + 0.5, p.dir, 0);
      if (G.cameraTarget && G.world) {
        G.cameraTarget.x = dx + 0.5;
        G.cameraTarget.z = dz + 0.5;
        try { G.cameraTarget.y = G.world.heightAt(dx + 0.5, dz + 0.5, 0); } catch (e) {}
      }
      p.climbLock = false;
      startRun();
    });
  });
}

/* The ways back up: the dungeon's iron ladders (`mgOut`). The arrival stops
   the clock and, when the dungeon is fully cleared, scores the run
   (src/minigame.js#finishRun) - climbing out with monsters still alive ends
   the run but records nothing. With no run going the same ladder is a plain
   climb out (a reloader waking in the dungeon, a visitor who never entered). */
function exitMinigame(tx, tz) {
  const o = G.world.objAt(tx, tz, G.player.plane || 0);
  if (!o || !o.mgOut || !o.to) return;
  const dx = o.to[0], dz = o.to[1];
  approach(tx, tz, () => {
    const p = G.player;
    faceTarget(p, tx, tz);
    p.climbLock = true;
    if (!document.hidden) playCastAnim(p, "agile_reach_ladder");
    chat("You climb up the ladder.", "game");
    afterTicks(2, () => {
      if (Math.max(Math.abs(Math.round(p.x - 0.5) - tx), Math.abs(Math.round(p.z - 0.5) - tz)) > 1) { p.climbLock = false; return; }
      p.path.length = 0;
      placeEntity(p, dx + 0.5, dz + 0.5, p.dir, 0);
      if (G.cameraTarget && G.world) {
        G.cameraTarget.x = dx + 0.5;
        G.cameraTarget.z = dz + 0.5;
        try { G.cameraTarget.y = G.world.heightAt(dx + 0.5, dz + 0.5, 0); } catch (e) {}
      }
      p.climbLock = false;
      if (mgActive()) finishRun();
    });
  });
}

/* A door moved by somebody else, and the whole set of open doors, used to live
   here; a door is now just a tile's LOC_OPEN bit on the world ledger, applied
   through `applyLocState` with everything else that changes in the world. */

/* A coffin's own action, straight out of the cache: loc 398 is ["Open"] and 399
   ["Close"], and this world already models both states (scene.js#_locSpec reads
   the object's `open` flag, and objExamine describes each). Moving the lid is
   the whole of it - the brothers the six churchyard coffins belong to are out
   standing on their graves, so there is nothing inside but the dark. The two
   lines are this world's own: the cache supplies the verbs and the models, not a
   sentence to go with them. */
function toggleCoffin(tx, tz) {
  approach(tx, tz, () => {
    const o = G.world.objAt(tx, tz);
    if (!o || o.t !== "coffin") return;
    o.open = !o.open;
    /* The lid's model stands once per 2x2 footprint, on its west/north tile,
       which may be in the neighbouring chunk - so the whole block is rebuilt
       rather than the tile that was clicked. */
    for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) G.view.rebuildChunkAt(tx - dx, tz - dz);
    reportLoc(tx, tz, 0);
    chat(o.open ? "You push the lid aside. The coffin is empty." : "You slide the lid back into place.", "game");
  });
}

function toggleManhole(tx, tz, want) {
  approach(tx, tz, () => {
    setTrapdoor(tx, tz, want);
    chat(want ? "You open the trapdoor." : "You close the trapdoor.", "game");
  });
}

/* A trapdoor is the cache's own pair (trapdoor_d's flat red plate closed,
   trapdoor's upright red hatch open - a tall loc whose ladder runs two tiles
   under the grass: the open state seats it by its own footY (dy -1.98, so the
   ~1.0 of hatch the authors meant shows, not the whole 2.96), the closed
   plate rides at 0. trapdoor_c looks the part at a glance but its paint is
   grey, not the same red trapdoor. Opening swaps the closed plate for the
   open hatch and redraws the chunk, the way a door swaps its leaf. The open
   hatch is drawn a quarter-turn (rot 1, so its face runs the plate's own
   axis with the handle side north) and shifted south (dz 0.289, undoing the
   bake's centre-ing) so its hinge edge stands flush on the tile's south
   edge instead of mid-tile. */
function trapdoorSeen(game, tx, tz) {
  if (game.view && game.view.tileOnScreen && game.view.tileOnScreen(tx, tz)) return true;
  const cx = tx + 0.5, cz = tz + 0.5;
  const p = game.player;
  if (p && Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz)) <= TRAP_SEEN_TILES) return true;
  for (const g of game.ghosts.values()) {
    if (g && Math.max(Math.abs((g.x || 0) - cx), Math.abs((g.z || 0) - cz)) <= TRAP_SEEN_TILES) return true;
  }
  return false;
}

function setTrapdoor(tx, tz, want) {
  const o = G.world.objAt(tx, tz);
  if (!o || !o.trapdoor) return;
  if (!!o.open === !!want) return;
  o.open = !!want;
  o.key = want ? "trapdoor" : "trapdoor_d";
  o.dy = want ? -1.98 : 0;
  o.rot = want ? 1 : 0;
  o.dx = 0;
  o.dz = want ? 0.289 : 0;
  G.view.setTrapHole(tx, tz, want);
  G.view.rebuildChunkAt(tx, tz);
  const keep = Actions.traps.filter((t) => t.x !== tx || t.z !== tz);
  Actions.traps.length = 0;
  for (const t of keep) Actions.traps.push(t);
  if (want) Actions.traps.push({ x: tx, z: tz, expire: (G.time || 0) + TRAP_OPEN_SECS });
  reportLoc(tx, tz, 0);
}

/* Praying at an altar: the church's altar (world.js, loc 409) is the only place
   in the world that refills the prayer book. It restores the points to their
   maximum - a player's maximum IS their Prayer level (player.js sets
   `maxPrayer` from it, and src/prayer.js#tickPrayer is the only other thing
   that moves `prayerPoints`) - and nothing else. The live game's plain altar
   gives no boost and no experience (that is the gilded altar's job, and this
   revision has no player-owned house to put one in); its message is the one the
   client sends, "You recharge your prayer points.". */
function prayAtAltar(tx, tz) {
  approach(tx, tz, () => {
    playCastAnim(G.player, "pray");
    G.ps.prayerPoints = G.ps.maxPrayer;
    chat("You recharge your prayer points.", "game");
    mark("prayer");
  });
}

function dropWindPick() {
  if (UI.spell === 15) { UI.spell = null; mark("magic"); }
}

function walkTile(tx, tz, skipMark) {
  /* The menu's Walk-here row is a walk like any other (see `begin`'s guard). */
  if (G.player && G.player.climbLock) return;
  dropWindPick();
  cancelAction();
  /* Walking somewhere yourself ends a follow - the same rule the raw click
     follows (src/game.js#handleClick). */
  stopFollowing();
  /* ...and, like any other movement command, it closes the shop window and ends
     a conversation (src/ui.js#closeOnWalk). */
  closeOnWalk();
  /* The "Walk here" cross (the user's own ask, the twenty-first report:
     "clicking walk here, resulting in a yellow x click visual, rooted to the
     tile that your right click was hovering over"). A menu row has no cursor of
     its own by the time it is clicked - the right-click was made, the menu
     opened over the world, and the pointer has since moved onto the menu - and
     the row is *about a tile*, so this is the **world** mark rather than the
     cursor-pinned one a left click uses: it is projected every frame, so the
     cross stays rooted to that tile as the camera turns. Yellow, because yellow
     is "walk here" and nothing else (see `onClickTile`). It no longer records
     the tile on `Game.clickFx` either: that record only ever drove the
     *minimap's* copy of the cross, and a minimap click must not draw a cross at
     all (the user's rule, standing preference P1). */
  if (!skipMark) Fx.setMarker(tx + 0.5, G.world.heightAt(tx + 0.5, tz + 0.5), tz + 0.5, MARK_WALK);
  /* Off a stepping stone the only way out is another hop, even when the tile
     clicked is dry land (see `leapOffStone`). */
  if (leapOffStone(tx, tz)) return;
  clearLeaps();
  /* The row walks, always. A tile the walk cannot *end* on - water, a wall, the
     tile under a tree or a furnace - is swapped for the nearest tile it can end
     on, exactly as a left click on such a tile is (src/game.js#handleClick does
     the same with the same radius). It used to fall through to `onClickTile`,
     which is the *interaction* router: right-clicking a tree and choosing "Walk
     here" then did whatever a left click does (or, for a tile whose interaction
     needs a reach it did not have, nothing at all - the row was dead, which is
     the same complaint as the creature one above). A **shut door** is no longer
     an exception: a door is strictly a toggle (standing preference P3), so a shut
     leaf is a wall to the route too, and the swap walks you up to its near side -
     which is where the click on the leaf itself would have put you. */
  const w = G.world;
  const dest = w.isWalkable(tx, tz) ? { x: tx, z: tz } : nearestWalkable(w, tx, tz, 14);
  if (!dest) return;
  if (walkTo(G.player, w, dest.x, dest.z, 0, clickMods())) G.view.setDest(G.player.destX, G.player.destZ);
}

/* The right-click itself. Every world menu keeps the client's own "Choose
   Option" title bar - including one opened on another player. Their name and
   combat level still stand on the menu's own rows ("Follow Bob (level 3)" and
   friends, through `playerMenuName`), which is where the client writes them;
   the bar is the menu's, not a caption.

   Report is deliberately not offered for a player (there is no report interface
   behind it, and an entry that can only apologise is worse than none). */
export function onRightClickWorld(x, y, pick) {
  if (!pick || (!pick.locs.length && !pick.npcs.length && !pick.players.length && !pick.ground)) return;
  const title = null;
  /* Every action row in a world menu marks the press red, exactly as a
     left-click interaction does (see onClickTile's rule below: yellow is only
     "walk here"). Menu rows run their act directly instead of routing through
     handleClick, so without this no cross is drawn at all. Every mark goes at the
     press point - the cursor that opened the menu - and "Cancel" is exempt. */
  const opts = worldMenuOptions(pick);
  for (const o of opts) {
    if (o.label === "Cancel") continue;
    if (o.label === "Walk here") {
      const fn = o.fn;
      o.fn = (ev) => {
        const cx = ev && ev.clientX != null ? ev.clientX : x;
        const cy = ev && ev.clientY != null ? ev.clientY : y;
        Fx.setMarkerScreen(cx, cy, MARK_WALK);
        const gg = pick.ground || pick.primary;
        if (!gg) return;
        walkTile(gg.tx, gg.tz, true);
      };
      continue;
    }
    const fn = o.fn;
    o.fn = (ev) => {
      const cx = ev && ev.clientX != null ? ev.clientX : x;
      const cy = ev && ev.clientY != null ? ev.clientY : y;
      Fx.setMarkerScreen(cx, cy, MARK_ACTION);
      fn();
    };
  }
  openCtx(x, y, title, opts);
}

export function noteAim(kind) {
  const log = Actions.aimLog;
  log.push(kind);
  while (log.length > 30) log.shift();
}

function aimCounts(n) {
  const tail = Actions.aimLog.slice(-n);
  let chop = 0, mine = 0, other = 0;
  for (const k of tail) {
    if (k === "chop") chop++;
    else if (k === "mine") mine++;
    else other++;
  }
  return { chop, mine, other };
}

/* Which scenery, if any, currently wins an ambiguous click - "chop", "mine",
   or null for the default (the creature wins, as it almost always should).

   The user's rule (2026-10-06): chop-focus is for someone *locked in* on
   chopping a hundred trees, and nothing else earns it. The log's single source
   of truth is YIELDS, not clicks: one intent per log or ore actually received
   (attemptWc/attemptMine). Clicks lie - a refusal earns nothing, a misclick
   earns nothing, and a click an NPC steals becomes a Talk-to that used to
   poison the keep-window and flap the mode on and off in a loop. Yields can
   be neither stolen nor misclicked, so entering takes **ten yields inside the
   last 25 intents** no matter how many Talk-tos sit between them, and once in,
   only genuine switching moves the mode: the rival reaching ten flips straight
   over to it (never through null), while focus fading below four releases it -
   about twenty straight anything-elses to shake a locked-in miner. Walking
   never logs an intent, so walking around neither builds nor breaks the mode.
   Mining is the mirror image; chop is checked first so the two can never both
   claim the log. Suggested alternative considered and rejected: a plain
   last-5 majority. It kicks in after three clicks, which is exactly the
   hair-trigger the user complained about - three misclicks should never flip
   targeting.

   Transitions are announced in chat, once each,
   so the player can see the mode engage and release instead of guessing. */
const AIM_WIN = 25, AIM_ENTER = 10, AIM_KEEP = 4;

function updateAimMode() {
  const cur = Actions.aimMode;
  const c = aimCounts(AIM_WIN);
  if (cur === "chop" || cur === "mine") {
    const focus = cur === "chop" ? c.chop : c.mine;
    const rival = cur === "chop" ? c.mine : c.chop;
    if (rival >= AIM_ENTER) {
      Actions.aimMode = cur === "chop" ? "mine" : "chop";
      chat(Actions.aimMode === "chop"
        ? "You focus on the trees around you."
        : "You focus on the rocks around you.", "game");
    } else if (focus < AIM_KEEP) {
      Actions.aimMode = null;
      chat("Your focus shifts back to your surroundings.", "game");
    }
    return Actions.aimMode;
  }
  if (c.chop >= AIM_ENTER) {
    Actions.aimMode = "chop";
    chat("You focus on the trees around you.", "game");
  } else if (c.mine >= AIM_ENTER) {
    Actions.aimMode = "mine";
    chat("You focus on the rocks around you.", "game");
  }
  return Actions.aimMode;
}

export function aimBias() {
  return updateAimMode();
}

function aimTargetKind(o) {
  if (!o) return null;
  if (o.t === "tree" && !o.stump) return "chop";
  if (o.t === "rock" && !o.empty && o.ore !== "none") return "mine";
  return null;
}

export function aimPreferScenery(npc, obj, front) {
  if (!npc || npc.kind === "ghost" || npc.dead) return false;
  /* Use mode, decided by the same rule tables the use itself runs, so the
     pick can never disagree with the arrival. A body the ray itself met
     (`front`) is in front and keeps the pick no matter what is in the hand -
     a soldier between the camera and the furnace wins over any bar. Only a
     body the tile scan found behind the object is dropped, and only for a
     station the item is designated for; the creature keeps the pick whenever
     the item means the creature (shears on a sheep, a hide on the tanner).
     Global across every station and creature - nothing here names the
     furnace, the soldier or the sheep. */
  if (UI.useItem) {
    if (front) return false;
    const held = G.ps && G.ps.inv[UI.useItem.index];
    if (held && held.id === UI.useItem.id && useRuleForLoc(obj, 0, 0, held.id) && !useRuleForNpc(npc, held.id)) return true;
  }
  /* A manually picked combat spell is aimed at a creature: focus never steals
     it to scenery (see `onClickTile`, which walks the click instead). */
  else if (manualNpcSpell()) return false;
  const bias = aimBias();
  if (!bias) return false;
  return aimTargetKind(obj) === bias;
}

/* Left-click routing. The return value tells the caller how to mark the click:
   a cross colour (see src/fx.js) or false when nothing handled it and the click
   should fall through to a plain walk. The rule is the client's: YELLOW is only
   for "walk here". Every actual interaction is RED - attacking, picking an item
   up, and using any object (a door, a bank booth, a tree, a rock, a range, a
   chest, a shopkeeper). A click that lands on scenery with nothing to do simply
   returns false and walks you there instead. */
export function onClickTile(tx, tz, prefer, pickObj) {
  /* Mid-climb clicks land on nothing: no interaction, no take, no leap, and no
     walk fall-through (see `begin`'s guard, same rule). */
  if (G.player && G.player.climbLock) return MARK_ACTION;
  /* A click on the world is the player doing something, so a level-up panel on
     the chatbox is cleared by it (src/dialogue.js#dismissLevelUp). The click
     still does whatever it was going to do: the panel is not a question that has
     to be answered first, it is just an interface the next action overwrites. */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  /* Use mode claims the click before anything else can read it: with an item in
     the hand every world click means "put this on that". A `false` return
     means the click named no target at all - bare ground, or an item that is
     gone - so the mode ends there (the user's rule, 2026-10-07: the mode is
     never sticky) and the click falls through to the plain walk below,
     disarmed. An attempt that reaches a target ends the mode on arrival
     instead (see useOnWorld) - worked, failed or refused. */
  if (UI.useItem) {
    const used = useOnWorld(tx, tz, prefer);
    if (used) return used;
    cancelUse();
  }
  /* A picked Telekinetic Grab reaches a ground item from a few tiles away,
     without walking over to it - the only spells that target the ground. */
  const picked = UI.spell != null ? spellById.get(UI.spell) : null;
  if (picked && (picked.on & SPELL_TARGET.GROUND) && grabAimHas(picked, tx, tz)) {
    if (distT(tx, tz, G.player) <= (picked.range || 7) + 0.5) {
      if (castSpell(picked, { where: "ground", x: tx, z: tz })) return MARK_ACTION;
    } else {
      chat("That is too far away to reach.", "warn");
      return MARK_WALK;
    }
  }
  const npc = npcAt(tx, tz, prefer);
  /* A body on the other level is out of reach: the keepers below cannot be
     talked to, traded with or attacked through the slab, and nothing below
     can be picked or prodded from up there. The click falls through to the
     walk, which itself goes nowhere off the upper floor. */
  const offPlane = (e) => e && ((e.plane || 0) !== (G.player.plane || 0));
  if (offPlane(npc)) return false;
  /* A click on another player. With a spell that is aimed at players picked in
     the book, that click *is* the cast - the client's own rule, and the reason
     the player's menu leads with the same option (see `playerMenuBlock`). With
     none picked there is nothing to do with a player, and the click falls
     through to the walk below, which is what clicking a person does in the live
     client too. */
  if (prefer && prefer.kind === "ghost") {
    if (offPlane(prefer)) return false;
    const spell = pickedPlayerSpell();
    if (spell) {
      approachPlayer(prefer, () => castSpellOnPlayer(prefer, spell));
      return MARK_ACTION;
    }
  }
 let pickScenery = pickObj === undefined ? G.world.objAt(tx, tz) : pickObj;
 if (!pickScenery && !tutHatTaken()) {
   const ho = G.world.objAt(tx, tz);
   if (ho && ho.t === "tut_hat") pickScenery = ho;
 }
  if (!pickScenery) {
    const ho = G.world.objAt(tx, tz);
    if (ho && ho.t === "tut_coconut") pickScenery = ho;
    if (ho && ho.t === "tut_dry_coconut") pickScenery = ho;
    if (ho && ho.t === "tut_cache") pickScenery = ho;
  }
  const sceneryFirst = !!(npc && pickObj && aimPreferScenery(npc, pickScenery, npc === G.clickDirect));
  if (npc && !sceneryFirst) {
    /* A creature with nothing to offer - one of the god's own assailants, whose
       only row is an Examine (see `npcCanAttack`) - does not swallow the click:
       it is not a target at all, so the click carries on to the walk below,
       exactly as a click on a wall that has nothing to do does. The click itself
       is still `interactNpc`'s own left-click rule (its top row), so the two can
       never disagree about which creature has a first action. */
    if (npcMenuRows(npc).length) { interactNpc(npc, "left"); return MARK_ACTION; }
  }
  /* Which object the click is on: the one the ray actually met the model of
     (`picked`, from the picker), falling back to the tile's own object only for
     the callers that have no ray - the menu rows, which were built from an
     object in the first place. This is what stops a click on the grass beside a
     trunk acting on the tree: the tile carries the tree (a footprint stamps it
     on every tile it covers) but the ray met only the ground, so the click walks
     (the user's report, 2026-09-23 - see src/scene.js#_locMeshHit). */
  const o = pickScenery;
  /* A manually picked combat spell ignores everything that is not a creature:
     the tree is nothing until the cast lands or the pick is cancelled, so the
     click falls through to the walk below - which cancels the pick (the user's
     rule). The leap stays outside the guard: a crossing is still a crossing
     with a spell in hand. */
  const npcSpell = manualNpcSpell();
  if (o && !npcSpell) {
    dropWindPick();
    /* The left click IS the object's own first row - the same spec the hover
       line and the menu's top row come from (`sceneryRowSpecs`), so the three
       can never disagree. A function that answers `false` means "not mine",
       which is the old chain's contract and what lets a click on scenery with
       nothing to do fall through to a walk; the void ones (a well, an altar, a
       coffin) count as handled, as they always did. */
    let handled = false;
    /* Two objects are the exceptions, because theirs is a left-click act and not
       the menu's version of it: a door toggles (a shut one opens and carries the
       walk on through it, an open one shuts and leaves you standing - see
       `toggleDoor`), and a booth's use is the bank interface rather than a walk
       onto the booth. */
    if (o.t === "door") handled = toggleDoor(tx, tz);
    else if (o.t === "booth") {
      approach(tx, tz, () => { chat("The banker opens your bank account.", "game"); setTab("bank"); },
        (x, z) => z === tz + 1 && Math.abs(x - tx) <= 1);
      handled = true;
    } else {
      const rows = sceneryRowSpecs(o, tx, tz);
      if (rows.length) handled = rows[0].run(tx, tz) !== false;
    }
    if (handled) return MARK_ACTION;
  }
  const pile = groundItemsAt(tx, tz);
  if (!npcSpell && pile.length && takeGround(tx, tz, pile[pile.length - 1].id)) { dropWindPick(); return MARK_ACTION; }
  /* Standing on a stepping stone, a click on the tile the stone can leap to is
     the jump and not a walk - see `leapOffStone`, which is how the far bank of
     an even-width crossing is reached at all. */
  if (leapOffStone(tx, tz)) { dropWindPick(); return MARK_ACTION; }
  /* Anything else is a new intent, so a crossing queued a moment ago is over. */
  clearLeaps();
  dropWindPick();
  cancelAction();
  /* A walk click with a picked combat spell armed cancels the pick: casting
     again means picking again. Other picks (tele-grab, alchemy) survive the
     walk, because aiming and then stepping closer is their normal flow. */
  if (npcSpell) { UI.spell = null; mark("magic"); }
  return false;
}

/* --------------------------------------------------------------- item menu extras */

/* The tool-gated inventory options, one table for both readers. Each entry is
   a use of a carried *tool* on a *target* item: `tools` names the item ids
   that satisfy the tool requirement (or computes them off the target, where
   the tool varies - the bolt the tips attach to, an unf's own secondary, a
   first ingredient's own vial), `target` is the target-side condition, and
   `run` performs the act on the target's own slot.

   Two readers come through here so a use-with can never drift from the click
   it mirrors: `itemOptions` grows the menu row when the tool is carried, and
   `useOnInv`'s mirror runs the same entry when the tool is the item in hand -
   a knife on logs fletches whether it arrives as a menu row or as a Use,
   either order. Entries with no tool requirement (the smelt shortcuts, Cook,
   Clean) are menu-only: the mirror skips them, since no carried item
   answers them.

   The order is the menu's own order, which the bolt chain's comment used to
   carry: each step is offered on the item it is performed *on* - the cut gem,
   the unfinished bolts, the tips - exactly as the client's own "Use" rows
   are, and each function does its own level and ingredient check so the menu
   never grows a row that cannot work. */
const INV_TOOL_GATED = [
  { label: "Light", tools: () => ["tinderbox"], target: (d) => d.kind === "log", run: (i) => lightFire(i) },
  { label: "Fletch", tools: () => ["knife"], target: (d) => d.kind === "log", run: (i) => fletchLogs(i) },
  { label: "Cut", tools: () => ["chisel"], target: (d) => !!d.cut, run: (i) => cutGem(i) },
  { label: "Fletch arrows", tools: () => ["feather"], target: (d, s) => s.id === "arrow_shaft", run: (i) => fletchArrows(i) },
  /* Bow-stringing: a bow string onto any unstrung bow, either Use order via
     the mirror below. The menu row grows on the unstrung bow when a string is
     carried, exactly like the feather row above it. */
  { label: "String", tools: () => ["bow_string"], target: (d, s) => !!BOW_STRING[s.id], run: (i) => stringBow(i) },
  { label: "Make bolt tips", tools: () => ["chisel"], target: (d, s) => !!BOLT_TIP_FROM_GEM[s.id], run: (i) => makeBoltTips(i) },
  { label: "Fletch bolts", tools: () => ["feather"], target: (d, s) => !!BOLT_FEATHER[s.id], run: (i) => fletchBoltFeathers(i) },
  {
    label: "Attach to bolts",
    tools: (d, s) => { const r = BOLT_TIP_ATTACH[s.id]; return r ? [r.bolt] : []; },
    target: (d, s) => !!BOLT_TIP_ATTACH[s.id],
    run: (i) => attachBoltTips(i),
  },
  {
    label: "Smelt at furnace",
    tools: () => [],
    target: (d, s, ps) => d.kind === "ore" && invCount(ps, "copper_ore") + invCount(ps, "tin_ore") > 0,
    run: (i) => smeltOreFromInv(i),
  },
  {
    label: "Smelt all here",
    tools: () => [],
    target: (d, s) => s.qty > 1 && smeltableIndex(),
    run: () => smeltAtPlayer(),
  },
  /* The jeweller's bench (unit L3): a bar at a furnace makes rings,
     necklaces, amulets, bracelets and the silver pieces, which is the live
     game's own use-a-bar-on-a-furnace gesture reached through the menu
     instead (see src/actions.js#jewelleryFromInv for why). The mould is what
     files it under this option at all. */
  {
    label: "Craft",
    tools: () => ["ring_mould", "necklace_mould", "amulet_mould", "bracelet_mould",
      "holy_mould", "unholy_mould", "sickle_mould", "tiara_mould", "bolt_mould"],
    target: (d, s) => s.id === "gold_bar" || s.id === "silver_bar",
    run: (i) => jewelleryFromInv(i),
  },
  { label: "Cook", tools: () => [], target: (d) => !!d.heal && !!d.cookOf, run: (i) => cookFromInv(i) },
  /* The needle and thread: any material a recipe in src/items.js#CRAFT_RECIPES
     eats can be sewn, and the menu that opens is that material's own recipe
     list (src/actions.js#openCraftMenu). The client's own option name is
     "Craft". The hand holds one of the pair and the pack carries the other. */
  {
    label: "Craft",
    tools: () => ["needle", "thread"],
    target: (d, s, ps, tool) => recipesFor(s.id).length > 0 && invCount(ps, tool === "needle" ? "thread" : "needle") > 0,
    run: (i) => craftFromInv(i),
  },
  /* A grimy herb is cleaned by hand: no tool answers it, so it is menu-only
     and the mirror never fires it. */
  { label: "Clean", tools: () => [], target: (d) => !!d.cleanTo, run: (i) => cleanHerb(i) },
  /* Herblore's three right-click Mix shapes: a herb into a vial of water, an
     unfinished potion's second ingredient, and a coconut-milk potion's first
     ingredient. "Mix" is the right-click shortcut for the use-withs
     (src/actions.js#useOnInv). */
  { label: "Mix", tools: () => ["vial_of_water"], target: (d) => !!d.unf, run: (i) => mixHerb(i) },
  {
    label: "Mix",
    tools: (d, s) => { const p = UNF_TO_POTION[s.id]; return p ? [p.secondary] : []; },
    target: (d, s) => !!d.potionHerb && !!UNF_TO_POTION[s.id],
    run: (i) => mixHerb(i),
  },
  {
    label: "Mix",
    tools: (d, s) => { const p = FIRST_TO_POTION[s.id]; return p ? [p.base] : []; },
    target: (d, s) => !!FIRST_TO_POTION[s.id],
    run: (i) => mixHerb(i),
  },
  { label: "Grind", tools: () => ["pestle_and_mortar"], target: (d) => !!d.crushTo, run: (i) => grindItem(i) },
];

function itemOptions(where, index, def, stack) {
  if (where !== "inv") return [];
  const ps = G.ps;
  const out = [];
  /* A spell that is aimed at an item puts its cast at the top of the item's own
     menu - the client's "Cast <spell>" option, which is how alchemy, Superheat
     and the enchant spells are used with the mouse. */
  const sp = UI.spell != null ? spellById.get(UI.spell) : null;
  if (sp && (sp.on & SPELL_TARGET.INV)) {
    out.push({ label: "Cast " + sp.name, fn: () => castSpell(sp, { where: "inv", index }) });
  }
  for (const e of INV_TOOL_GATED) {
    const tools = e.tools(def, stack, ps);
    /* An empty tool list is a menu-only row with no tool requirement (the
       smelt shortcuts, Cook, Clean) - the mirror below can never fire it,
       since no carried item is in its list. */
    const tool = tools.length ? tools.find((t) => invCount(ps, t) > 0) : null;
    if ((tools.length === 0 || tool != null) && e.target(def, stack, ps, tool)) out.push({ label: e.label, fn: () => e.run(index) });
  }
  return out;
}

/* -------------------------------------------------------------- the use-with

   The client's Use mode, walked through: `src/ui.js#startUse` puts a carried
   item in the hand and `resolveUse` hands the pair to this function when the
   next item is clicked. It answers with one of three things, which is the whole
   protocol:

     * `true`     - the use happened, so the item comes off the cursor;
     * `"quiet"`  - nothing to do, and this function has said why itself (the
                    client's own line for it is "Nothing interesting happens.",
                    which it says below - the two differ only in that a *rule*
                    that refuses a use gets to explain itself);
     * `false`    - no rule at all claims the pair, and the caller says
                    "Nothing interesting happens." and keeps the item in hand.

   There are three real rules, and they are all of this world's client actions
   rather than conveniences:

     * **a ball of wool on an unstrung amulet** - the second half of the
       jeweller's bench (unit L3): the amulet becomes the one that can be worn
       and enchanted (`stringAmulet` below).

     * **a weapon poison on a weapon it can coat** - daggers, spears, hastae and
       arrows, each in the three strengths (src/items.js#POISON_FAMILIES). One
       vial coats one weapon, or **five** thrown ones: "A single vial of weapon
       poison can poison only 5 arrows, bolts, darts, or throwing knives". An
       already-coated weapon is left alone - the vial is spent on a *clean*
       blade, and re-coating one is not a client action - and a vial on anything
       else says the nothing-happens line, which is why the shield in your other
       hand does not drink your poison.
     * **a cleaning cloth on a coated weapon** - the one way a coat comes off
       again ("Poison can be removed from weapons by making use of a cleaning
       cloth"). The cloth is not spent, so it is a tool rather than an
       ingredient.
     * **herblore's two use-withs** - a first ingredient into its vial of
       coconut milk, and an unfinished potion's second ingredient - both of
       which walk into the ordinary mixing action (`startMix`), so a use-with
       and the right-click "Mix" are the same recipe reached two ways. */
/* The plural of a poisoned-family weapon's name, for the one message below that
   names a quantity of them. Four families is the whole list, and one of them is
   the awkward one: Jagex's own plural of hasta is "hastae" (Rune hastae), so a
   naive "+s" would print "hastas" - which no item in the game is ever called. */
function poisonPlural(name) {
  if (name.endsWith("hasta")) return name.slice(0, -1) + "e";
  if (name.endsWith("s")) return name;
  return name + "s";
}

export function useOnInv(fromIndex, toIndex) {
  const ps = G.ps;
  const a = ps.inv[fromIndex];
  const b = ps.inv[toIndex];
  if (!a || !b || fromIndex === toIndex) return false;
  const da = ITEMS[a.id] || {};
  const db = ITEMS[b.id] || {};

  /* ---- a weapon poison onto a weapon ------------------------------------ */
  if (da.kind === "potion" && da.weaponPoison) {
    const variants = POISON_VARIANTS[b.id];
    if (!variants) { chat("Nothing interesting happens.", "game"); return "quiet"; }
    const coated = variants[da.weaponPoison];
    if (db.stack) {
      const n = Math.min(5, b.qty);
      invRemoveAt(ps, fromIndex, 1);
      if (n >= b.qty) ps.inv[toIndex] = { id: coated, qty: n };
      else { b.qty -= n; invAdd(ps, coated, n); }
      chat("You coat " + n + " " + poisonPlural(itemName(b.id).toLowerCase()) + " in weapon poison.", "you");
    } else {
      ps.inv[fromIndex] = null;
      ps.inv[toIndex] = { id: coated, qty: 1 };
      chat("You coat the " + itemName(b.id).toLowerCase() + " in weapon poison.", "you");
    }
    mark("inv");
    return true;
  }

  /* ---- a cleaning cloth back off a coated weapon ------------------------ */
  if (a.id === "cleaning_cloth") {
    const coat = POISON_COAT[b.id];
    if (!coat) { chat("Nothing interesting happens.", "game"); return "quiet"; }
    const qty = b.qty;
    invRemoveAt(ps, toIndex, qty);
    invAdd(ps, coat.base, qty);
    chat("You clean the weapon poison off the " + itemName(b.id).toLowerCase() + ".", "you");
    mark("inv");
    return true;
  }

  /* ---- a tinderbox onto any logs ---------------------------------------- */
  if (a.id === "tinderbox" && db.kind === "log") { lightFire(toIndex); return true; }
  if (b.id === "tinderbox" && da.kind === "log") { lightFire(fromIndex); return true; }

  /* ---- a knife onto a coconut (tutorial island): split and drink --------
     Either order; the knife is a tool and stays, the nut is spent. The milk
     heals, and the stage advances to the first drink. */
  if ((a.id === "knife" && b.id === "coconut") || (b.id === "knife" && a.id === "coconut")) {
    invRemove(ps, "coconut", 1);
    const healed = Math.min(ps.maxHp - ps.hp, 6);
    ps.hp = Math.min(ps.maxHp, ps.hp + 6);
    mark("inv");
    try {
      setTutStage(ps, 6);
    } catch (e) {}
    chat("You split the coconut and drink the sweet milk" + (healed > 0 ? ". It heals " + healed + " hitpoints." : ", though you are already full."), "you");
    return true;
  }

  /* ---- a ball of wool onto an unstrung amulet --------------------------- */
  const unstrung = STRING_RECIPES[a.id] ? a.id : (STRING_RECIPES[b.id] ? b.id : null);
  const woolIdx = a.id === "ball_of_wool" ? fromIndex : (b.id === "ball_of_wool" ? toIndex : -1);
  if (unstrung && woolIdx >= 0) { stringAmulet(unstrung); return true; }

  /* ---- clay onto water softens it -----------------------------------------
     Mined clay is hard and dry; a bucket, jug or bowl of water mixed in makes
     the soft clay the potter's wheel shapes. Either order, no experience -
     the experience is the wheel's and the oven's. */
  const clayIdx = a.id === "clay" ? fromIndex : (b.id === "clay" ? toIndex : -1);
  const wetId = DOUGH_WATER[a.id] ? a.id : (DOUGH_WATER[b.id] ? b.id : null);
  if (clayIdx >= 0 && wetId) {
    invRemove(ps, "clay", 1);
    invRemove(ps, wetId, 1);
    invAdd(ps, DOUGH_WATER[wetId], 1);
    invAdd(ps, "soft_clay", 1);
    mark("inv");
    chat("You mix the water into the clay to make soft clay.", "game");
    return true;
  }

  /* ---- a glassblowing pipe onto molten glass ------------------------------
     Either order; the window lists what the pack's glass can become. */
  if ((a.id === "glassblowing_pipe" && b.id === "molten_glass") || (b.id === "glassblowing_pipe" && a.id === "molten_glass")) {
    openGlassMenu();
    return true;
  }

  /* ---- an air talisman onto a plain tiara ----------------------------------
     The talisman is spent and the tiara carries air: it opens the mysterious
     ruins without a talisman in the pack. No experience - the live game gives
     none for the binding. */
  if ((a.id === "air_talisman" && b.id === "tiara") || (b.id === "air_talisman" && a.id === "tiara")) {
    invRemove(ps, "air_talisman", 1);
    invRemove(ps, "tiara", 1);
    invAdd(ps, "air_tiara", 1);
    mark("inv");
    chat("You bind the air talisman into the tiara.", "game");
    return true;
  }

  /* ---- herblore: a first ingredient into its coconut milk ---------------- */
  const fr = FIRST_TO_POTION[a.id];
  const br = FIRST_TO_POTION[b.id];
  if (fr && b.id === fr.base) { startMix({ stage: "base", potion: fr.id, base: fr.base, first: a.id, unf: fr.unf, level: fr.level }); return true; }
  if (br && a.id === br.base) { startMix({ stage: "base", potion: br.id, base: br.base, first: b.id, unf: br.unf, level: br.level }); return true; }

  /* ---- herblore: an unfinished potion's second ingredient ---------------- */
  const pa = UNF_TO_POTION[a.id];
  const pb = UNF_TO_POTION[b.id];
  if (pa && b.id === pa.secondary) { startMix({ stage: "potion", potion: pa.id, unf: a.id, level: pa.level, xp: pa.xp }); return true; }
  if (pb && a.id === pb.secondary) { startMix({ stage: "potion", potion: pb.id, unf: b.id, level: pb.level, xp: pb.xp }); return true; }

  /* ---- the dough-and-pastry chain (updates 3 and 5) ------------------------
     Water (bucket, jug or bowl) on a pot of flour opens the dough choice, the
     way the live game does ("you will be given a choice of different doughs"
     - the Cooks' Guild pizza-base guide on the wiki). Either order works. */
  const waterId = DOUGH_WATER[a.id] ? a.id : (DOUGH_WATER[b.id] ? b.id : null);
  const flourHere = a.id === "pot_of_flour" || b.id === "pot_of_flour";
  if (waterId && flourHere) { openDoughMenu(waterId); return true; }

  /* ---- pastry dough on a pie dish shells it ------------------------------ */
  if ((a.id === "pastry_dough" && b.id === "pie_dish") || (b.id === "pastry_dough" && a.id === "pie_dish")) {
    invRemove(ps, "pastry_dough", 1);
    invRemove(ps, "pie_dish", 1);
    invAdd(ps, "pie_shell", 1);
    mark("inv");
    chat("You put the pastry into the pie dish to make a pie shell.", "game");
    return true;
  }

  /* ---- a filling into a pie shell -----------------------------------------
     Apple, cooked meat or chicken, or redberries - the wiki's own three
     (an uncooked meat pie is "made by adding cooked meat or cooked chicken
     to a pie shell"). Either order. */
  const shellIdx = a.id === "pie_shell" ? fromIndex : (b.id === "pie_shell" ? toIndex : -1);
  const fillId = shellIdx === fromIndex ? b.id : a.id;
  if (shellIdx >= 0 && PIE_FILLINGS[fillId]) {
    invRemove(ps, "pie_shell", 1);
    invRemove(ps, fillId, 1);
    invAdd(ps, PIE_FILLINGS[fillId], 1);
    mark("inv");
    chat("You add the filling to the pie shell.", "game");
    return true;
  }

  /* ---- the pizza: tomato first, then cheese --------------------------------
     The wiki's own order ("tomato must be added first, then cheese"), with the
     cheese step gated on the published level 35. Either order for each step. */
  if ((a.id === "pizza_base" && b.id === "tomato") || (b.id === "pizza_base" && a.id === "tomato")) {
    if (skillLvl("cooking") < 35) { chat("You need a Cooking level of 35 to make a pizza.", "warn"); return true; }
    invRemove(ps, "pizza_base", 1);
    invRemove(ps, "tomato", 1);
    invAdd(ps, "incomplete_pizza", 1);
    mark("inv");
    chat("You add the tomato to the pizza base.", "game");
    return true;
  }
  if ((a.id === "incomplete_pizza" && b.id === "cheese") || (b.id === "incomplete_pizza" && a.id === "cheese")) {
    if (skillLvl("cooking") < 35) { chat("You need a Cooking level of 35 to make a pizza.", "warn"); return true; }
    invRemove(ps, "incomplete_pizza", 1);
    invRemove(ps, "cheese", 1);
    invAdd(ps, "uncooked_pizza", 1);
    mark("inv");
    chat("You add the cheese to the pizza.", "game");
    return true;
  }

  /* ---- the cake: egg, milk and flour on the cake tin ----------------------
     The wiki's own recipe ("use an egg, a bucket of milk, and a pot of flour
     on a cake tin to make an uncooked cake") - no intermediates, the tin goes
     in with the mix and comes back at the range (see attemptCook). Any one of
     the three on the tin completes it while the other two are carried. */
  const cakeHit = a.id === "cake_tin" ? b.id : (b.id === "cake_tin" ? a.id : null);
  if (cakeHit && (cakeHit === "eggs" || cakeHit === "bucket_of_milk" || cakeHit === "pot_of_flour")) {
    const missing = ["eggs", "bucket_of_milk", "pot_of_flour"].filter((id) => !invCount(ps, id));
    if (missing.length) { chat("You need an egg, some milk and some flour to make an uncooked cake.", "warn"); return true; }
    invRemove(ps, "eggs", 1);
    invRemove(ps, "bucket_of_milk", 1);
    invRemove(ps, "pot_of_flour", 1);
    invRemove(ps, "cake_tin", 1);
    invAdd(ps, "uncooked_cake", 1);
    mark("inv");
    chat("You mix the egg, milk and flour in the cake tin.", "game");
    return true;
  }

  /* ---- a bow string onto an unstrung bow ------------------------------------
     Either order, exactly one bow, on the same tick - the use-with strings a
     single bow instantly, while the "String" row below owns the repeat. Sits
     ahead of the tool-gated mirror so the mirror's String entry (repeat all)
     never answers a use-with. */
  const unbow = BOW_STRING[a.id] ? a.id : (BOW_STRING[b.id] ? b.id : null);
  const stringIdx = a.id === "bow_string" ? fromIndex : (b.id === "bow_string" ? toIndex : -1);
  if (unbow && stringIdx >= 0) { stringOneNow(unbow); return true; }

  /* ---- the tool-gated mirror ----------------------------------------------
     The inventory twin of `useRuleForLoc`: either clicked item may be the
     tool, and the other is the target. Each direction runs the target's own
     tool-gated option from `INV_TOOL_GATED` - the same entry the menu grows
     when the tool is carried - so a knife on logs fletches exactly as the
     logs' "Fletch" row does, a chisel on a gem cuts, feathers
     on shafts fletch, a pestle on a herb grinds, a mould on a gold bar opens
     the jewellery menu, and a vial, a secondary or a coconut base on its
     herb walks into the same mixing action, all in either order. The target
     functions re-check their own tool and level, so a use-with can never do
     what the menu row refuses. */
  if (invToolGatedUse(a.id, toIndex) || invToolGatedUse(b.id, fromIndex)) return true;

  return false;
}

/* One direction of the tool-gated mirror: `toolId` (the item in hand) used
   on the item in `targetIndex`. Runs the first table entry the pair answers
   and reports whether one did. */function invToolGatedUse(toolId, targetIndex) {
  const ps = G.ps;
  const stack = ps.inv[targetIndex];
  if (!stack) return false;
  const def = ITEMS[stack.id] || {};
  for (const e of INV_TOOL_GATED) {
    const tools = typeof e.tools === "function" ? e.tools(def, stack, ps) : e.tools;
    if (!tools.includes(toolId)) continue;
    if (!e.target(def, stack, ps, toolId)) continue;
    e.run(targetIndex);
    return true;
  }
  return false;
}

/* Every water vessel that mixes dough, to the empty vessel it leaves behind. */
const DOUGH_WATER = { bucket_of_water: "bucket", jug_of_water: "jug", bowl_of_water: "bowl" };

/* Every pie-shell filling to the uncooked pie it makes. */
const PIE_FILLINGS = { apple: "uncooked_apple_pie", cooked_meat: "uncooked_meat_pie", cooked_chicken: "uncooked_meat_pie", redberries: "uncooked_berry_pie" };

/* The four doughs water and flour can become, with the Cooking level the mix
   itself needs: bread and pastry free, pizza base 35, pitta dough 58. */
const DOUGH_LEVEL = { bread_dough: 1, pastry_dough: 1, pizza_base: 35, pitta_dough: 58 };

/* The dough choice: the client's own chatbox question, word for word. */
function openDoughMenu(waterId) {
  startDialogue("dough", [{
    title: "What sort of dough do you wish to make?",
    options: [
      opt("Bread dough.", [then(() => makeDough("bread_dough", waterId))]),
      opt("Pastry dough.", [then(() => makeDough("pastry_dough", waterId))]),
      opt("Pizza dough.", [then(() => makeDough("pizza_base", waterId))]),
      opt("Pitta dough.", [then(() => makeDough("pitta_dough", waterId))]),
    ],
  }]);
}

function makeDough(doughId, waterId) {
  const ps = G.ps;
  if (!invCount(ps, "pot_of_flour") || !invCount(ps, waterId)) return;
  const need = DOUGH_LEVEL[doughId] || 1;
  if (skillLvl("cooking") < need) { chat("You need a Cooking level of " + need + " to make " + itemName(doughId).toLowerCase() + ".", "warn"); return; }
  /* Flour, water, dough, pot, vessel: five stacks where four stood, so one
     free slot is the price of the mix. */
  if (invFreeSlots() < 1) { chat("You need an empty inventory slot to mix the dough.", "warn"); return; }
  invRemove(ps, "pot_of_flour", 1);
  invRemove(ps, waterId, 1);
  invAdd(ps, doughId, 1);
  invAdd(ps, "pot", 1);
  invAdd(ps, DOUGH_WATER[waterId], 1);
  mark("inv");
  chat("You mix the flour and water into " + itemName(doughId).toLowerCase() + ".", "game");
}

/* ----------------------------------------------------- the use-with onto the
   world

   Use mode's other half. The client's use-with is not an inventory gesture at
   all - it is "this item, on *that* thing" - and the things it can be used on
   are everything a world click can land on: a scene object, a creature, the
   ground, another player. `src/ui.js#startUse` puts the carried item in the hand
   (drawn at the pointer) and `onClickTile` hands the next world click here
   before it means anything else, so a use can never be read as a chop, an
   attack or a walk.

   Three client rules shape all of it:

     * **the use is a reach like every other world interaction.** The player
       walks to the target's own ring first and the rule fires on arrival - which
       is why using a bucket on the well from across the market works, and why
       the refusal for a bucket-less well came out of `fillBucket`'s own
       `approach` before this mode existed.
     * **the player turns to face the thing the item was used on**, whether or
       not anything came of it. That is the whole visible half of a use-with this
       world has no rule for, and it is why `faceTarget` runs before the rule
       does.
     * **a use with no rule is not a refusal.** It is the client's own line -
       "Nothing interesting happens." - and the item stays in the hand, so a use
       on the wrong thing is retried rather than swallowed, exactly as it is for
       a bad item-on-item pair (`useOnInv` above).

   Every rule below is the target's *own* click action reached with the material
   in hand, which is what most of the live game's use-withs are: the axe on a
   tree and the pickaxe on a rock are the two every player learns first, and the
   rest - a net on a fishing spot, a raw fish on a range, an ore on a furnace, a
   bar on an anvil, wool on a spinning wheel, a bucket on a well, shears on a
   sheep, a hide on the tanner - are the same shape. Routing each one through the
   function the object's own option calls is what makes the acts impossible to
   fork: there is exactly one implementation of every one of them, so a use-with
   can never drift from the click it mirrors (and a change to `cookFood` is a
   change to both at once).

   What is deliberately *not* here is a rule for the two targets the live game
   also has none for: the ground (a use on a ground item says the line and puts
   nothing down) and another player. Both walk and face and then say it, which is
   the client's own behaviour for them. */

/* What one carried item does to one scene object, as a thunk, or null when this
   world has no rule for the pair. The item is read through its own def, so every
   test is a fact about the item rather than its name: `chops` is the test the
   woodcutting code shares (`kind === "axe"` covers the real axes, `chops` the
   battleaxe-kind weapons the game also lets you fell a tree with), `cookOf`
   without `heal` is the *raw* half of a food pair - the
   cooked half carries `heal` and points back at the raw one (see the raw/cooked
   table built at the top of this file) - and the fishing rule asks the spot's
   own method list which tool the item is, so a net can never be used as a
   fishing rod. */
function useRuleForLoc(o, tx, tz, id) {
  const d = ITEMS[id] || {};
  switch (o.t) {
    case "tree":
      if (!o.stump && (d.kind === "axe" || d.toolSkill === "woodcutting" || d.chops)) return () => chopTree(tx, tz);
      break;
    case "rock":
      if (d.kind === "pickaxe") return () => mineRock(tx, tz);
      break;
    case "fishing": {
      const m = spotMethods(o.kind).find((x) => TOOL_IDS[x.tool] === id);
      if (m) return () => fishSpot(tx, tz, m.tool);
      break;
    }
    case "range":
      if (id === "raw_karambwan") return () => cookOne(tx, tz);
      /* the *raw* half of a food pair - `RAW_TO_COOKED` is keyed by the raw id
         and built from the cooked item's own `cookOf`, so this is the one test
         that catches both spellings the content uses: the fish, whose cooked
         half points back at a `raw_` id, and the meat, whose raw half names its
         cooked self */
      if (RAW_TO_COOKED[id]) return () => cookFood(tx, tz);
      break;
    case "fire":
      if (RAW_TO_COOKED[id]) return () => cookFood(tx, tz);
      break;
    /* the furnace's two materials: ore for the smelter, and the gold bar a mould
       turns into jewellery at the bench beside it (unit L3) - which is the same
       pair of acts its own Smelt and Craft rows carry. Whether the player has
       the mould, the level or the coins is the act's own business, not this
       rule's, so the furnace keeps saying its own refusals. */
    case "furnace":
      if (id === "gold_bar" || id === "silver_bar") return () => jewelleryAt(tx, tz, id);
      if (d.kind === "ore" || d.kind === "bar") return () => smeltAt(tx, tz);
      /* glassmaking: a bucket of sand or soda ash on the furnace, with the
         other half in the pack, smelts the pair into molten glass. */
      if ((id === "bucket_of_sand" && invCount(G.ps, "soda_ash")) ||
          (id === "soda_ash" && invCount(G.ps, "bucket_of_sand"))) return () => moltenGlassAt(tx, tz);
      break;
    case "anvil":
      if (d.kind === "bar") return () => smithAt(tx, tz, SMITH_BARS.includes(id) ? id : null);
      break;
    case "wheel":
      if (SPIN_RECIPES.some((r) => r.from === id)) return () => spinAt(tx, tz);
      break;
    /* pottery: soft clay on the wheel shapes it, an unfired piece on the oven
       fires it. The wheel carries no menu of its own - the clay in hand is
       the question - and the oven's Fire is the same act through the world. */
    case "potwheel":
      if (id === "soft_clay") return () => potAt(tx, tz);
      break;
    case "potoven":
      if (POTTERY_FIRE[id]) return () => { approach(tx, tz, () => firePottery(tx, tz, id), sideReachTest(tx, tz)); };
      break;
    case "well":
      if (id === "bucket") return () => fillBucket(tx, tz);
      break;
    /* An empty bucket on the sandpit fills it there (see fillSand) - the same
       act as the pit's own Fill row, through the cursor. */
    case "sandpit":
      if (id === "bucket") return () => fillSand(tx, tz);
      break;
    case "sink": {
      const emptyId = id === "bucket" ? "bucket" : id === "jug" ? "jug" : id === "bowl" ? "bowl" : null;
      if (emptyId) return () => fillVessel(tx, tz, emptyId);
      break;
    }
    /* An air talisman - or an air tiara, worn or carried - on the mysterious
       ruins steps through to the Air Altar: the same act as the ruins' own
       Enter row. */
    case "ruins":
      if (id === "air_talisman" || id === "air_tiara") return () => enterAirAltar(tx, tz);
      break;
  }
  return null;
}

/* The creature side: shears on a woolly sheep, and a hide on the tanner, whose
   trade is otherwise reached by talking to him. The sheep test is the one the
   Shear row itself uses (`npcVerbUsable`), so a shorn sheep has nothing for
   shears to do here either - it would only take the fleece off a sheep that is
   already bare, and `shearSheep`'s own guard would then have to invent the
   refusal. */
function useRuleForNpc(npc, id) {
  if (id === "shears" && npc.type === "sheep" && !npc.sheared) return () => shearSheep(npc);
  if (npc.type === "tanner" && TAN_FEES.some((r) => r.from === id)) return () => openTanMenu();
  return null;
}

/* The ground side: tinderbox onto logs lying on the ground lights them where
   they lie (the user's rule - the hover line already promises
   "Use Tinderbox -> Logs"). Nothing else in the hand has business with a
   drop, so anything else falls to the refusal below. */
function useRuleForGround(g, tx, tz, id) {
  if (!g) return null;
  const d = ITEMS[g.id] || {};
  if (id === "tinderbox" && d.kind === "log") return () => lightGroundFire(tx, tz, g.id);
  return null;
}

/* Light the logs lying on one ground tile: one log off the pile, the fire
   where the logs lay. The player stays on the side face the walk-in found, so
   nobody steps onto the new fire - unlike the pack-log version, which has to
   step off its own tile. */
function lightGroundFire(tx, tz, logId) {
  const ps = G.ps;
  const def = ITEMS[logId] || {};
  if (skillLvl("firemaking") < (def.levelReq || 1)) {
    chat("You need a Firemaking level of " + def.levelReq + " to light this log.", "warn");
    return;
  }
  if (G.world.objAt(tx, tz) || !G.world.isWalkable(tx, tz)) { chat("You can't light a fire here.", "warn"); return; }
  const arr = groundItemsAt(tx, tz);
  const g = arr.find((e) => e.id === logId);
  if (!g) return;
  g.qty -= 1;
  if (g.qty <= 0) removeGround(g);
  else { syncGroundMesh(g); noteGround(g.x, g.z, g.id, g.qty + 1); }
  mark("inv");
  playCastAnim(G.player, "firemaking");
  const idx = Math.max(0, LOG_ORDER.indexOf(logId));
  addXp(ps, "firemaking", LOG_FM_XP[idx] || 40);
  G.world.setObj(tx, tz, { t: "fire" });
  G.view.rebuildChunkAt(tx, tz);
  Actions.fires.push({ x: tx, z: tz, expire: (G.time || 0) + 90 });
  reportLoc(tx, tz, 90);
  chat("You light a fire.", "you");
}

/* The world half of Use mode, called from `onClickTile` and from the menu row
   the mode adds to a target's block. The target is read in the precedence an
   ordinary click uses - the creature the ray picked (which may be another
   player), then the scene object on the tile, then the ground - and an empty
   tile is `false`, which lets the click fall through to the plain walk the
   caller would have done. The item stays in the hand on the way, so a target
   across the room can be walked to while the cursor still carries it. */
export function useOnWorld(tx, tz, prefer) {
  /* No item use starts mid-climb (see `begin`'s guard, same rule). */
  if (G.player && G.player.climbLock) return false;
  const use = UI.useItem;
  const held = use ? G.ps.inv[use.index] : null;
  /* the item is gone - sold, banked, dropped, eaten - and the mode goes with it */
  if (!use || !held || held.id !== use.id) { cancelUse(); return false; }
  const id = held.id;
  const ghost = prefer && prefer.kind === "ghost" ? prefer : null;
  let npc = ghost ? null : npcAt(tx, tz, prefer);
  const o = G.world.objAt(tx, tz);
  /* The pick already preferred the station (see aimPreferScenery), but this
     tile scan can still find a body beside it - the smithy soldier wanders the
     tiles behind the furnace, often within a tile of the clicked footprint.
     The same rule-table test drops him here too, so the use lands on the
     station the cursor chose rather than "Nothing interesting happens." on
     the soldier. A body the click's own ray met (`G.clickDirect`, stashed by
     src/game.js#handleClick) is in front and is never dropped, no matter what
     is in the hand - and neither is a body the menu row was explicitly about
     (`prefer`). */
  if (npc && o && npc !== prefer && npc !== G.clickDirect && useRuleForLoc(o, tx, tz, id) && !useRuleForNpc(npc, id)) npc = null;
  const obj = npc ? null : o;
  const ground = npc || obj ? [] : groundItemsAt(tx, tz);
  if (!ghost && !npc && !obj && !ground.length) return false;
  /* A use is a one-tile reach, and one tile means the four sides (update 6):
     a diagonal neighbour is not beside the target, so the player walks to a
     side face first and turns to it before the rule - or the refusal - fires.
     Multi-tile scenery is judged against its whole footprint, the way chopping
     is; creatures, players and ground items against the one tile. The furnace
     is the exception: every one of its acts runs from the mouth tile
     (furnaceMouthTest), so the use walks straight there instead of to the side
     of whichever tile the click happened to land on - otherwise a click on the
     mouth tile itself walked the player OFF it to a side face, then back on
     (user, 2026-10-12). */
  const reach = obj && obj.t === "furnace" && furnaceMouthTile() ? furnaceMouthTest()
    : obj ? treeReachTest(obj, tx, tz) : sideReachTest(tx, tz);
  approach(tx, tz, () => {
    /* the item may have moved in the pack during the walk - the walk is a game
       tick away at best - and the mode is over the moment it is not the same
       stack it was when the click was made */
    const now = G.ps.inv[use.index];
    if (!now || now.id !== use.id) { cancelUse(); return; }
    faceTarget(G.player, tx, tz);
    const rule = ghost ? null
      : npc ? useRuleForNpc(npc, id)
        : obj ? useRuleForLoc(obj, tx, tz, id)
          : ground.length ? useRuleForGround(ground[ground.length - 1], tx, tz, id)
            : null;
    if (!rule) {
      /* the attempt is spent whether or not the world had anything to do with
         it: the mode is never sticky, so a refused use ends it the same as a
         worked one (the user's rule, 2026-10-07) */
      cancelUse();
      chat("Nothing interesting happens.", "game");
      return;
    }
    /* the use happened, so the item comes off the cursor - and off it *before*
       the rule runs, because a rule may itself open an interface (the tanner's
       list), and the cursor element must not be left hovering over it */
    cancelUse();
    rule();
  }, reach);
  return MARK_ACTION;
}

/* Stringing an amulet (unit L3): a ball of wool onto an unstrung amulet makes
   the wearer's version of it. One Crafting level and four experience - the live
   game's own numbers, and the odd thing about them is that the level is 1 while
   the craft that made the amulet needed 24 to 90, which is exactly what its
   Recipe box prints. The string is why the unstrung amulet cannot be worn or
   enchanted, and the content has a line for that refusal too (see
   castEnchant). */
function stringAmulet(unstrungId) {
  const ps = G.ps;
  const strung = STRING_RECIPES[unstrungId];
  if (!strung || !ITEMS[strung]) return;
  if (!invCount(ps, "ball_of_wool")) { chat("You need a ball of wool to string it.", "warn"); return; }
  invRemove(ps, unstrungId, 1);
  invRemove(ps, "ball_of_wool", 1);
  invAdd(ps, strung, 1);
  addXp(ps, "crafting", STRING_XP);
  mark("inv");
  playCastAnim(G.player, "leathercraft");
  chat("You string the " + itemName(strung).toLowerCase() + ".", "game");
}

function smeltableIndex() {
  return !!bestSmeltable();
}

function smeltOreFromInv(index) {
  /* The furnace comes first and the materials second: the walk to the furnace
     happens before anything is asked about the pack (the user's NSEW rule),
     and attemptSmelt answers "nothing to smelt" from the side face. */
  const furnace = findObjectNear(Math.floor(G.player.x), Math.floor(G.player.z), (q) => q.t === "furnace", 12);
  if (!furnace) { chat("You need to be near a furnace to smelt.", "warn"); return; }
  smeltAt(furnace[0], furnace[1]);
}

function smeltAtPlayer() {
  const furnace = findObjectNear(Math.floor(G.player.x), Math.floor(G.player.z), (q) => q.t === "furnace", 12);
  if (!furnace) { chat("You need to be near a furnace to smelt.", "warn"); return; }
  smeltAt(furnace[0], furnace[1]);
}

function cookFromInv(index) {
  const src = findCookSource(12);
  if (!src) { chat("You need to be near a fire or range to cook.", "warn"); return; }
  cookFood(src[0], src[1]);
}

/* ------------------------------------------------------------ spell casting

   The spellbook's non-combat spells. Combat spells (and the curses and binds)
   are aimed at an NPC and live in src/combat.js; these ones either cast on the
   spot - teleports, Charge - or are cast on an item in the inventory, the way
   alchemy and Superheat work in the live game. Every one of them goes through
   `canCastSpell` when it is chosen and `payCast` when it commits, so no cast
   can happen without its runes - and no refusal can cost one. */

/* The *selection* check: has the level, has the runes, and the weapon has
   recovered. It runs when the spell is picked, before it is aimed at anything,
   so a spell the player cannot afford never reaches a target prompt and says
   which half is missing in the spell's own words.

   The weapon's recovery gates every spell but the teleports: one cast timer
   covers every other spell (src/magic.js#Cast), and it is armed by the cast
   itself. Clicking a spell before the weapon has recovered is simply
   ignored - the live game ignores a too-fast click the same way - so no spell
   can be chain-cast faster than the weapon allows. A teleport never waits
   for the weapon - one click moves you, whatever it is doing - but it does wait
   for the previous teleport (see teleportUntil below). */
function canCastSpell(spell) {
  /* Teleports never wait for the weapon: one click teleports, mid-swing,
     mid-skilling or mid-fight - the recovery timer gates every other spell.
     What a teleport does wait for is the teleport before it: a click that
     lands while one is still in flight is ignored, so the animation has to
     arrive before another can begin, though the arrival may be cut short, and its xp cannot be spam-clicked. */
  if (spell.kind === "teleport") {
    if (Date.now() < teleportUntil) return false;
  } else if (!castReady()) return false;
  const st = spellStatus(G.ps, spell);
  if (!st.ok) {
    /* Tele Block first, because it is the one refusal that is neither the level
       nor the runes - and the one the spellbook shows with a greyed cell. A
       missing staff (a god spell, Iban Blast) names the staff, not the runes. */
    if (st.blocked) chat("A teleport block is preventing you from teleporting.", "warn");
    else if (!st.staffOk && st.needStaff) chat("You need " + st.needStaff + " to cast " + spell.name + ".", "warn");
    else chat(st.levelOk
      ? "You do not have enough runes to cast " + spell.name + "."
      : "You need a Magic level of " + spell.level + " to cast " + spell.name + ".", "warn");
    return false;
  }
  return true;
}

/* Spend the runes, grant the xp and raise the pose - the moment a spell really
   happens, and never one moment before. Every effect below calls this at the
   point it commits, which is what the live game does: a refusal (no bones to
   convert, nothing on the ground to grab, an item the spell cannot touch, no
   obelisk to charge an orb from) costs the player nothing, where paying up
   front charged a full set of runes and the spell's xp for a line of advice.

   The pose and the caster's own graphic are the pair a combat cast gets; the
   `*Override`s are the ring-enchant case - see src/magic.js#beginCast. */
function payCast(spell, poseOverride, gfxOverride, cdOverride) {
  const ps = G.ps;
  const st = spellStatus(ps, spell);
  if (!st.ok) return false;
  spendRunes(ps, st.plan);
  addXp(ps, "magic", spell.xp);
  beginCast(G.player, spell, poseOverride, gfxOverride, cdOverride);
  /* A self-cast is announced so the players standing around watch the pose
     and the gather graphic (src/net.js#C_CAST) - everything a combat cast
     gets, for the spells that otherwise play only at home. Casts that already
     travel under their own announcement are left alone: the Tele Group line
     (its offer rides a C_SPELL out of `castOnSelf`), the player-aimed line
     (a C_SPELL out of `castSpellOnPlayer`) and the Potion Shares (one C_SPELL
     per dose out of `castPotionShare`), whose pose the watchers already play
     off those packets. */
  if (Net.status === "online" && !spell.group && spell.kind !== "other" &&
      spell.on !== SPELL_TARGET.PLAYER && spell.id !== 551 && spell.id !== 554) {
    netCast(spell.id);
  }
  mark("inv", "skills");
  return true;
}

/* Teleports drop the player on the nearest walkable tile to the spell's
   destination - the browser game's own world is a 128x128 slice of Gielinor,
   so each teleport maps onto the landmark it belongs to - and the jump is held
   until the caster's model has actually vanished (see `holdForTeleport`). */
function castTeleport(spell, pay) {
  pay();
  teleportUntil = Date.now() + TELEPORT_LOCK_MS;
  closeBankOnTeleport();
  /* A teleport commits the body - and everything on it: a chatbox dialogue
     ends with the conversation left wherever it was, exactly as walking away
     mid-sentence would, so nothing survives the jump to drag the player back
     to what they just left. */
  try { endDialogue(); } catch (e) {}
  /* A teleport commits the body: the skilling loop stops, the follow ends, the
     walk stops dead, and the fight ends on both sides (see
     src/combat.js#Actions.endCombat) - so nothing survives the jump to drag the
     player back to what they just left. */
  cancelAction();
  stopFollowing();
  if (Actions.endCombat) Actions.endCombat();
  G.player.path.length = 0;
  G.player.stepPts = null;
  holdForTeleport(spell);
}

/* When, in seconds into a vanish pose, the model has collapsed away.

   The cache authors the standard teleport's disappearance as the *end of its
   own sequence*: `cast_teleport` (714, `human_castteleport`) holds the
   arms-raised gather for 48 cycles and only then collapses the caster with a
   type-3 scale transform on frames 6-11 - 108, 78, 50, 35, 20, 20 of 128, i.e.
   960ms to the sequence's end at 1360ms, on a 128-unit model (the exact numbers
   are in src/tools/cache-bake/bake.mjs#CAST_ANIMS, and
   src/models3d.js#applyTransform is what plays them). That collapse *is* the
   vanish - there is no type-5 alpha anywhere in 714 or its reverse 715, and the
   type-5 entries a spell *graphic*'s sequence carries are inert because those
   models have labels but no alpha array (see
   src/tools/cache-bake/README.md#alphatransforms). So this finds the last frame
   carrying the sequence's smallest scale, and reports the tick that frame
   starts on.

   A pose with no type-3 transform at all - `cast_teleport2` (793, which the
   Camelot/`cast_teleport2` row and every `cast_teleother` use) - has nothing to
   show, and returns null so the caller falls back to the content's own delay. */
function vanishPoint(anim) {
  if (!anim || !anim.fm || !anim.frames) return null;
  let at = -1;
  let smallest = 0;
  for (let fi = 0; fi < anim.frames.length; fi++) {
    const f = anim.frames[fi];
    for (let j = 0; j < f.ids.length; j++) {
      if (anim.fm.types[f.ids[j]] !== 3) continue;
      const sc = Math.abs(f.tx[j]);
      if (at < 0 || sc < smallest) { smallest = sc; at = fi; }
    }
  }
  if (at < 0) return null;
  /* the *first* frame at the smallest scale, not the last: the sequence's tail
     is a hold (714's last frame is 20000 cycles, the client's "stay gone"
     marker for a sequence that never settles), and jumping on that frame would
     wait out the hold instead of the collapse. */
  return (anim.tickOffsets[at] || 0) * 0.02;
}

/* Hold the jump until the vanish has played, then go. The pose was raised by
   `pay()`/`playCastAnim` in the same breath as this, so the sequence's own
   clock and the wait start together; the jump is on the render clock because a
   600ms tick cannot express "the 80ms frame the model finishes collapsing on".

   The content's own script is `anim(...); spotanim_pl(...); p_delay(2);
   p_telejump(...)` - two ticks, 1200ms - which is *inside* the collapse (it
   lands on frame 8, a fifth of full size); timed off our tick clock it could
   fire anywhere from 600ms to 1200ms after the pose began, i.e. before the
   collapse had been drawn at all, and the caster simply blinked out mid-spin.
   Pinning it to the model's own clock instead plays the whole authored vanish,
   and the arrival picks up from exactly where it left off: `cast_arrive`'s
   frame 0 is the same 20/128 scale the vanish ends on. */
function holdForTeleport(spell) {
  /* The content's own delay, for a teleport whose pose has no collapse to time
     the vanish off. The Ancient Magicks' teleport is the one that needs it:
     `cast_teleport` (714) ends by scaling the caster's own model to a fifth of
     its size, which is the standard book's disappearance and what `vanishPoint`
     reads; the Ancients' pose (1979) has no type-3 transform anywhere - the
     caster is *covered* by the spell's graphic instead of shrinking - so the
     content simply waits and then moves (`Spellbook.ANCIENT`, see
     src/magic.js#ANCIENT_TELE: four ticks there, two here - the user asked for
     the whole Ancient teleport two ticks faster). Checked before `vanishPoint`
     because that returns null here, and the 2-tick fallback below would jump a
     second early. */
  if (spell.holdTicks != null) {
    afterSeconds(spell.holdTicks * 0.6, () => teleportJump(spell));
    return;
  }
  const pose = castAnimFor(G.player, spell);
  const data = G.player.ch && G.player.ch.data;
  const anim = pose && data && data._anims ? data._anims[pose] : null;
  const at = vanishPoint(anim);
  if (at == null) {
    afterTicks(2, () => teleportJump(spell));
    return;
  }
  afterSeconds(at + 0.02, () => teleportJump(spell));
}

/* How long the arrival bubble's instance lives - see `teleportJump`. It is not
   the spotanim's own 89 cycles (1.78s): the ball only occupies the middle of
   that sequence, and read backwards the quiet tail would otherwise be the last
   nine tenths of a second of an invisible graphic. */
const TELEPORT_BUBBLE_SECONDS = 1.3;

/* A teleport in flight locks the book through the vanish and the jump, though a recast may cut the arrival short -
   vanish, jump and most of the arrival run about 2.6s end to end - so the xp
   cannot be clicked twice out of one set of runes. Wall-clock, so a stuck lock
   can never outlive the animation it belongs to. */
const TELEPORT_LOCK_MS = 2600;
let teleportUntil = 0;

/* The jump itself: the destination tile, the arrival pose and the line. */
export function teleportJump(spell) {
  /* Any teleport that is not a dungeon ladder voids a minigame run in
     progress - the clock only stops at a ladder (src/minigame.js). The
     dungeon entries and exits place directly and never come through here. */
  if (mgActive()) voidRun("tele");
  const at = spell.at || [62, 57];
  const spot = nearestWalkable(G.world, Math.floor(at[0]), Math.floor(at[1]), 16) || { x: 62, z: 57 };
  G.player.path.length = 0;
  /* A teleport lands on the ground, whatever level it left from. */
  placeEntity(G.player, spot.x + 0.5, spot.z + 0.5, G.player.dir, 0);
  /* the arrival: the cache authors it as its own sequence (`cast_arrive`, 715,
     the exact reverse of the vanish) and that is what the client plays on the
     far side - see src/magic.js#SPELL_FX's `arrive`, which every teleport
     carries. It is *clamped* rather than wrapped: 715 opens on frame 0 = the
     20/128 scale the vanish ended on, so letting its tail blend back into that
     first frame would shrink the arriving character to a fifth of its size in
     the sequence's last 60ms and then snap it to idle (see
     src/models3d.js#update's `castClamp`).

     The bubble rides with it, and that is the whole reason `arrive` is the test:
     the content plays *one* spotanim for a standard teleport
     (`spotanim_pl(teleport_casting, 92)` - spotanim 111, the same ball the
     caster's hands were gathering), and the client draws it on both sides of the
     jump; what changes is the direction. Read forwards it shrinks into the
     caster's hands and is gone before the tile changes, which is the vanish.
     Read *backwards* - src/gfx.js#play's `reverse` - it grows out of the ground
     the character lands on, holds full size for a beat and fades away again, so
     the far side of the jump opens with the shape the near side closed on and
     the character assembles inside it.

     Teleother must not get one: it has no `arrive` (it is the one teleport that
     moves somebody else, and its own two graphics are the swirl over the
     *caster's* head, 343, and the impact on the target, 342), so tying the
     bubble to the arrival pose keeps 343 off a victim who never cast anything.

     `seconds` cuts the instance short on purpose. The sequence is 89 cycles and
     the ball only occupies the middle of it: its last five frames (read
     forwards) are a quiet hold, so read backwards the graphic would sit
     invisible for a third of a second before it appeared, and for almost a
     whole second after it had gone. Stopping the instance the moment the ball
     has faded leaves the arrival exactly as long as the bubble is - measured off
     the sequence: visible from 0.32s to 1.24s, gone by 1.30s, inside the 1.56s
     `cast_arrive` (715) grows the character back over. */
  if (spell.arrive) {
    playCastAnim(G.player, spell.arrive);
    G.player.castClamp = true;
    if (spell.start != null) {
      Gfx.play(spell.start, {
        x: spot.x + 0.5,
        z: spot.z + 0.5,
        height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, G.player),
        dir: G.player.dir || 0,
        target: G.player,
        tint: spell.tint,
        reverse: true,
        seconds: TELEPORT_BUBBLE_SECONDS,
      });
    }
    /* The far side is announced so the players standing at the destination
       watch the arrival assemble (src/net.js#C_ARRIVE) - the departure half
       went out with the cast itself, from `payCast`. */
    if (Net.status === "online") netArrive(spell.id, Math.floor(spot.x), Math.floor(spot.z));
  }
  chat("You teleport to " + spell.place + ".", "game");
}

function castOnSelf(spell, pay) {
  if (spell.kind === "charge") {
    pay();
    G.ps.chargeTicks = spell.ticks;
    chat("You feel charged with power.", "game");
    return true;
  }
  if (spell.kind === "teleport") {
    /* Tele Block is the one thing in the game that stops another spell, and it
       is refused *before* `pay()` - a blocked teleport costs the player
       nothing, the same rule every other refusal here follows. The timer is the
       target's own (src/actions.js#teleblocked). */
    if (G.ps.teleblockTicks > 0) {
      chat("A teleport block is preventing you from teleporting.", "warn");
      return true;
    }
    /* A Tele Group spell moves the caster and then *asks* the people around
       them: the question goes out before the jump, while the caster is still
       visibly there to be asked about (see src/actions.js#offerTeleport). */
    if (spell.group && Net.status === "online") netSpell(spell.id, 0, 0);
    castTeleport(spell, pay);
    return true;
  }
  return false;
}

/* Alchemy turns the item into coins: 40% of its value for the low spell, 60%
   for the high one. Coins themselves are not alchemisable. */
function castAlchemy(spell, index, pay) {
  const ps = G.ps;
  const s = ps.inv[index];
  if (!s) return false;
  if (s.id === "coins") { chat("You can't alchemise coins.", "warn"); return true; }
  const v = Math.max(1, itemValue(s.id));
  const coins = Math.floor((spell.high ? 0.6 : 0.4) * v);
  pay();
  invRemoveAt(ps, index, 1);
  invAdd(ps, "coins", coins);
  chat("You alchemise the " + itemName(s.id).toLowerCase() + " and it turns into " + coins + " coins.", "game");
  mark("inv");
  return true;
}

/* Superheat Item runs a bar's recipe straight from the inventory, no furnace
   needed - the same ingredients a furnace would take, coal included. */
function castSuperheat(spell, index, pay) {
  const ps = G.ps;
  const s = ps.inv[index];
  if (!s) return false;
  const def = itemDef(s.id) || {};
  /* The recipe hangs off the *bar*, not the ore: the bar's item definition is
     what carries `inputs` (the same list a furnace smelt consumes), so this is
     the one lookup the furnace path and the spell share. */
  const bar = def.bar ? itemDef(def.bar) : null;
  if (!bar || !bar.inputs) { chat("You can only superheat ore.", "warn"); return true; }
  if (levelOf(ps.skills, "smithing") < (bar.levelReq || 1)) {
    chat("You need a Smithing level of " + bar.levelReq + " to smelt that.", "warn");
    return true;
  }
  const need = {};
  for (const id of bar.inputs) need[id] = (need[id] || 0) + 1;
  /* the clicked stack is itself one of the ingredients, so it counts towards
     the total here (invHasAll is the same test a furnace smelt makes) and is
     only *excluded* from the extra removals below */
  if (!invHasAll(ps, bar.inputs)) { chat("You don't have all the ingredients to superheat that.", "warn"); return true; }
  pay();
  /* take the clicked stack's one ingredient first, so a stack the pack also
     holds more of cannot be eaten into by the extra removals below */
  invRemoveAt(ps, index, 1);
  for (const [id, q] of Object.entries(need)) {
    const take = q - (id === s.id ? 1 : 0);
    if (take > 0) invRemove(ps, id, take);
  }
  invAdd(ps, def.bar, 1);
  addXp(ps, "smithing", bar.xp || 0);
  chat("You superheat the " + itemName(s.id).toLowerCase() + " into a " + itemName(def.bar).toLowerCase() + ".", "game");
  mark("inv", "skills");
  return true;
}

/* Bones to Bananas / Bones to Peaches: every bone in the pack changes. */
function castBonesTo(spell, pay) {
  const ps = G.ps;
  const to = spell.id === 354 ? "peaches" : "banana";
  let n = 0;
  /* Bones stack in the pack and a banana does not, so a pile of bones is a
     pile of slots waiting to happen. Each bone stack's own slot is freed
     *before* its fruit is added, and whatever will not fit is put back as the
     bones it was - a full pack converts what it has room for and loses
     nothing, where adding first could quietly eat the whole stack. */
  for (let i = 0; i < ps.inv.length; i++) {
    const s = ps.inv[i];
    if (!s) continue;
    const def = itemDef(s.id);
    if (!def || def.kind !== "bones") continue;
    const want = s.qty;
    ps.inv[i] = null;
    let made = 0;
    for (let k = 0; k < want; k++) if (invAdd(ps, to, 1) >= 1) made++;
    if (made < want) invAdd(ps, s.id, want - made);
    n += made;
  }
  if (!n) { chat("You have no bones to convert.", "warn"); return true; }
  pay();
  chat("You convert " + n + " bones into " + to + ".", "game");
  mark("inv");
  return true;
}

/* ------------------------------------------------------------- enchanting

   The Enchant spells each work on one gem's *finished* jewellery: the spell's
   own level picks the gem (the same mapping the item table carries on the
   amulets, the rings and - since unit L3 - three of the bracelets), and the
   piece becomes its enchanted form. Anything else gets the spell's own refusal
   message - the content's `additional_reqmessage`, word for word, except that
   the three messages whose spell gained a bracelet target (lvl-1, 5 and 6) list
   bracelets too: bracelet *enchanting* post-dates this cache, so the era's line
   could not have named them, and a refusal that denied a cast the spell now
   accepts would be a lie. */
const ENCHANT_LEVEL = { 18: 1, 28: 2, 39: 3, 43: 4, 50: 5, 353: 6 };
const ENCHANT_REQ = {
  1: "This spell can only be cast on Sapphire Amulets, Bracelets, Necklaces and Rings.",
  2: "This spell can only be cast on Emerald Amulets and Rings.",
  3: "This spell can only be cast on Ruby Amulets and Rings.",
  4: "This spell can only be cast on Diamond Amulets and Rings.",
  5: "This spell can only be cast on Dragonstone Amulets, Bracelets and Rings.",
  6: "This spell can only be cast on Onyx Amulets, Bracelets and Rings.",
};

function castEnchant(spell, index, pay) {
  const ps = G.ps;
  const s = index == null ? null : ps.inv[index];
  const def = s ? itemDef(s.id) : null;
  const level = ENCHANT_LEVEL[spell.id];
  /* An unstrung amulet is the right gem and the right shape and still cannot be
     enchanted - the content keeps a separate line for exactly that, and it is
     the reason the stringing step exists at all:
     `amulet_reqmessage,unstrung_sapphire_amulet,You need to string the Sapphire
     Amulet before enchanting it.` (this world prints the item's own name, lower
     case for the second word, rather than the content's capitalised one). */
  if (level && def && def.stringTo && def.enchant === level) {
    chat("You need to string the " + itemName(def.stringTo) + " before enchanting it.", "warn");
    return true;
  }
  if (!def || !level || def.enchant !== level) {
    chat(ENCHANT_REQ[level] || "Nothing interesting happens.", "warn");
    return true;
  }
  pay();
  invRemoveAt(ps, index, 1);
  invAdd(ps, def.enchantsTo, 1);
  chat("You successfully enchant the " + def.name.toLowerCase() + ".", "game");
  mark("inv");
  return true;
}

/* Enchant Crossbow Bolt (spell 358) - the one spell in the book that is used on
   ammunition, and the only one whose rune cost depends on what it is aimed at:
   every enchant is the spell's own single cosmic rune plus the gem's own runes,
   at the gem's own Magic level and for the gem's own experience
   (src/items.js#BOLT_ENCHANT, all of it straight off each (e) bolt's page).
   The spell's own row says Magic 4 / 1 cosmic because that is what the *book*
   gates it at; the gem is the real gate, and the topaz enchant is a level-29
   one cast with a level-4 spell.

   It works on **up to ten bolts at a time**, which is the entity the published
   recipe is written for ("10 Opal bolts + 1 cosmic + 2 air -> 10 Opal bolts
   (e)"), so a stack of ten pays exactly the page's experience and a shorter
   stack pays its share of it - the runes are the spell's and are spent whole
   either way, exactly as a shorter cast of any other spell costs the same runes
   as a full one. A stack that is already enchanted, or any other item at all,
   gets the spell's refusal and costs nothing. */
function castEnchantBolt(spell, index, pay, eff) {
  const ps = G.ps;
  const s = index == null ? null : ps.inv[index];
  const row = s ? BOLT_ENCHANT[s.id] : null;
  if (!row) {
    chat("This spell can only be cast on gem-tipped crossbow bolts.", "warn");
    return true;
  }
  if (skillLvl("magic") < row.level) {
    chat("You need a Magic level of " + row.level + " to enchant " + itemName(s.id).toLowerCase() + ".", "warn");
    return true;
  }
  if (!pay()) return true;
  const n = Math.min(10, s.qty);
  invRemoveAt(ps, index, n);
  invAdd(ps, row.id, n);
  mark("inv");
  chat("You enchant " + n + " " + itemName(s.id).toLowerCase() + " into " + itemName(row.id).toLowerCase() + ".", "game");
  return true;
}

/* The spell a bolt enchant is cast *as*: the book's own 358 with the gem's
   runes added to its cost and the gem's level and experience in place of the
   spell's. Everything downstream - `canCastSpell`, `payCast`, the pose, the
   graphic - reads this object, so there is one code path for every enchant and
   no second rune table to keep in step. */
function boltEnchantSpell(spell, row, n) {
  const cost = Object.assign({}, spell.cost);
  for (const [el, q] of Object.entries(row.runes)) cost[el] = (cost[el] || 0) + q;
  return Object.assign({}, spell, { cost, level: row.level, xp: row.xp * n / 10 });
}

/* Telekinetic Grab: the graphic flies out to the item and the item is taken
   when it lands - the content's own `coord_projectile` and `spotanim_map`,
   which is also why the pickup waits. The greater grab (src/magic.js#367)
   sweeps the 3x3 around the clicked tile and takes up to two items instead of
   one - the missile still flies at the clicked tile, and the sweep starts
   there, so the middle of the cluster is what comes up first. */
function castGrab(spell, target, pay) {
  /* Face the item first, before the pose goes up: the cast reads as the
     player turning to the pile and reaching for it, not throwing over their
     own shoulder. */
  faceTarget(G.player, target.x, target.z);
  pay();
  /* The watchers get the pose and the gather ball off the cast's own C_CAST
     (see `payCast`); the flight and the burst ride this packet instead, so a
     grab is seen to fly the way a strike is (src/net.js#C_GRABFX). */
  netGrabFx(spell.id, target.x, target.z);
  const px = G.player.rx != null ? G.player.rx : G.player.x;
  const pz = G.player.rz != null ? G.player.rz : G.player.z;
  const x = target.x + 0.5, z = target.z + 0.5;
  Gfx.projectile({
    gfx: spell.proj,
    tint: spell.tint,
    fromX: px, fromZ: pz, fromH: spell.projStart || 0,
    toX: x, toZ: z, toH: spell.projEnd || 0,
    /* The origin is re-measured every frame until the release beat, exactly
       like a strike's (see combat.js): the cast faces the pile and the body
       turns to it over frames, so a frozen origin leaves the ball starting
       wherever the caster stood when the cast began rather than in the hands
       that threw it. */
    fromFn: () => ({
      x: G.player.rx != null ? G.player.rx : G.player.x,
      z: G.player.rz != null ? G.player.rz : G.player.z,
      h: spell.projStart || 0,
    }),
    /* the grab gathers first too - its own rows give it 48 cycles, a beat less
       than a strike's 51 (see src/magic.js#PROJ_DELAY_CYCLES) */
    delay: projDelayCycles(spell),
  /* The greater grab flies its own fixed time at every distance
     (`fixedFlight`) - the animation and the landing take as long up close as
     at full reach. Every other missile flies the content's own speed. */
    duration: spell.fixedFlight != null ? spell.fixedFlight : flightSeconds(Math.hypot(px - x, pz - z)),
    onArrive: () => {
      Gfx.play(spell.end, { x, z, height: spell.endH || 0, tint: spell.tint });
      if (spell.grabArea) grabGroundArea(target.x, target.z, spell);
      else grabGround(target.x, target.z);
    },
  });
  return true;
}

/* The tiles one grab's landing reaches: the clicked tile alone for the
   standard grab, the 3x3 around it - clicked tile first - for the greater one.
   Aiming never uses this: both grabs are offered one tile at a time (see
   `grabAimHas`). */
function grabTiles(x, z, area) {
  if (!area) return [[x, z]];
  const out = [[x, z]];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dz) out.push([x + dx, z + dz]);
    }
  }
  return out;
}

/* Whether a grab aimed here has anything to take: the clicked tile itself must
   hold an item, exactly like the standard grab. The greater grab still sweeps
   the 3x3 on landing, but it is *aimed* one tile at a time - every caller that
   offers the cast (the menu, the hover line, the click, the spell) asks this,
   so none of them can offer a cast on an empty tile. */
function grabAimHas(spell, x, z) {
  return groundItemsAt(x, z).length > 0;
}

/* Take the item off the ground from where it lies - no walking, which is the
   whole point of the spell. */
function grabGround(x, z) {
  const ps = G.ps;
  const arr = groundItemsAt(x, z);
  if (!arr.length) { chat("Too late - it's gone!", "game"); return; }
  takeGroundEntry(arr[arr.length - 1]);
}

/* The greater grab's landing: up to `grabCount` entries off the 3x3, taken in
   order of high-alchemy worth - the pile's whole high-alch value
   (`itemValue` x qty x 0.6), so the two dearest piles come up. Ties break to
   the clicked tile first, then the newest pile. Each entry is taken whole by
   the same rule as the standard grab, so a sweep over a full pack still banks
   what fits and says so per item. */
function grabGroundArea(x, z, spell) {
  /* Drops live on the ground level: a grab cast upstairs sweeps an empty
     floor, which reads as "gone" exactly like a timed-out pile. */
  if (G && G.player && (G.player.plane || 0) !== 0) { chat("Too late - it's gone!", "game"); return; }
  const want = spell.grabCount || 1;
  const cands = [];
  let tile = 0;
  for (const [tx, tz] of grabTiles(x, z, spell.grabArea)) {
    const arr = groundItemsAt(tx, tz);
    for (let i = 0; i < arr.length; i++) {
      cands.push({ g: arr[i], worth: itemValue(arr[i].id) * arr[i].qty * 0.6, tile, pile: i });
    }
    tile++;
  }
  cands.sort((a, b) => (b.worth - a.worth) || (a.tile - b.tile) || (b.pile - a.pile));
  /* Nothing to take at all is the only "gone" there is: the aim had something
     when the cast began (see `grabAimHas`), so an empty sweep means the pile
     timed out or somebody else took it mid-flight. A sweep with candidates
     that takes nothing failed on pack space, and `takeGroundEntry` already
     said exactly that per item - "gone" on top of it would be a lie. */
  if (!cands.length) { chat("Too late - it's gone!", "game"); return; }
  let taken = 0;
  for (let i = 0; i < cands.length && taken < want; i++) {
    if (takeGroundEntry(cands[i].g)) taken++;
  }
}

/* One ground entry into the pack, by the standard grab's own rule: a stackable
   comes up whole, anything else as much of the pile as fits. Returns whether
   anything came up. */
function takeGroundEntry(g) {
  const ps = G.ps;
  if (!isStackable(g.id) && invFree(ps) < 1) { chat("You don't have enough inventory space.", "warn"); return false; }
  const want = isStackable(g.id) ? g.qty : Math.min(g.qty, invFree(ps));
  const got = invAdd(ps, g.id, want);
  if (!got) { chat("You don't have enough inventory space.", "warn"); return false; }
  g.qty -= got;
  if (g.qty <= 0) removeGround(g);
  else { syncGroundMesh(g); noteGround(g.x, g.z, g.id, g.qty + got); }
  trackGroundTake(g.x, g.z, g.id, got);
  mark("inv");
  chat("You pick up the " + itemName(g.id).toLowerCase() + (got > 1 ? " x" + got : "") + ".", "you");
  return true;
}

/* A spell that is aimed at something but has nothing to aim it at yet says so,
   in the spell's own words. */
function targetPrompt(spell, what) {
  if (what === SPELL_TARGET.INV) {
    chat(spell.kind === "alchemy" ? "Cast the spell on an item in your inventory."
      : spell.kind === "superheat" ? "Cast the spell on some ore in your inventory."
        : "Click the item you want to cast " + spell.name + " on.", "game");
  } else if (what === SPELL_TARGET.GROUND) {
    chat("Cast the spell on an item lying on the ground.", "game");
  } else {
    chat("Cast the spell on " + (what === SPELL_TARGET.LOC ? "the object" : "a target") + ".", "game");
  }
  return true;
}

/* ---------------------------------------------------------- the lunar book

   The Lunar spellbook is the utility book: most of its spells exist to replace
   an item or a skill, and this world implements the ones whose machinery it
   actually has. A spell whose machinery is missing says what it needs instead
   of pretending - and the item spells are written as a transformation table, so
   the moment the materials exist the spell starts working (see the "materials"
   note in src/PLAN.md).

   The player-targeted half of the book (Cure/Heal Other, Stat Spy, Energy
   Transfer, the Vengeance Other line and the Tele Group spells) is cast over the
   world server rather than here - see "the spells that need a body" below, which
   is where the whole set lives. */

/* The one item-to-item transformation per spell, where this world has both
   ends. `verb` is the chat line's verb, and `into` makes the line name the
   product as well - "You turn the logs into a plank." rather than the
   half-sentence a bare verb would give it (`into` is the product's own article
   plus its name, lower case, because `a plank` and `an orb` are not the same
   word). */
const LUNAR_MAKE = {
  /* Plank Make: logs become a plank, the spell's own point - it saves a trip to
     the sawmill. */
  581: { fromKind: "log", to: "plank", verb: "turn", into: "a plank" },
};

/* The two Potion Shares' own compatibility lists, straight off the wiki.

   Boost Potion Share takes "almost any non-barbaric potion", but pointedly not
   the combination potions: the wiki names a Combat potion and both brews among
   its exclusions, and what is left of this world's Herblore book are the
   plain single-stat boosters. Stat Restore Pot Share is the narrower spell and
   the wiki gives its own seven-potion list, of which this world brews five
   (Sanfew serum and stamina are not in this cache's item set). */
const BOOST_SHARE_POTIONS = new Set([
  "attack_potion", "strength_potion", "defence_potion", "agility_potion",
  "fishing_potion", "magic_potion", "ranging_potion",
  "super_attack", "super_strength", "super_defence",
]);
const RESTORE_SHARE_POTIONS = new Set([
  "energy_potion", "prayer_potion", "restore_potion", "super_energy", "super_restore",
]);

/* A potion's position in src/items.js#POTIONS, which is what a share puts on the
   wire: the `power` field of the spell packet is a u16 and carries this index
   instead of a magnitude, and every client turns it back into the same row. The
   table is the client's own and identical in every build of this world, so the
   index is a name the *server* never has to know - index.html's C_SPELL relays
   it blindly, exactly as it relays a spell id. */
const POTION_INDEX = new Map(POTIONS.map((p, i) => [p.id, i]));

/* The two Potion Shares. Cast a share spell on a potion in the pack and the
   dose goes to the whole 5x5 around the caster (the live spell's own square),
   the caster included. Each mechanic below is the wiki's, and each is a choice
   this window had to make somewhere:

     * **Who is dosed.** Everybody in the square who is taking aid
       (src/actions.js#squarePlayers), capped at four - the spell's own "up to
       four nearby players" - plus the caster, who is always dosed.
     * **What it costs in doses.** One dose per *other* player, and the caster's
       own dose is free: "doses of potion are only used up on other players,
       with the caster receiving a 'free' dose". A 3-dose vial shared with one
       other player is left with 1, not 2.
     * **When it is refused.** The potion must be one the spell accepts (the two
       lists above) and the vial must hold a dose at all - the caster's own
       share has to come from somewhere. A refusal costs nothing, as everywhere
       else, and the caster alone counts as a legal cast (a share with nobody
       around is just a free dose), which is what the wiki's own XP advice
       describes.
     * **How it travels.** One C_SPELL per recipient, each naming that player and
       carrying the *potion's index* in `power`, so every dose is applied by the
       recipient's own client - the only client that may apply it, and the one
       that knows whether they are still accepting aid. */
function castPotionShare(spell, index, pay) {
  const ps = G.ps;
  const s = ps.inv[index];
  if (!s) return false;
  const def = itemDef(s.id) || {};
  const p = POTION_BY_ITEM[s.id];
  const list = spell.id === 551 ? BOOST_SHARE_POTIONS : RESTORE_SHARE_POTIONS;
  if (!p || !list.has(p.id)) {
    chat("You can only share " + (spell.id === 551 ? "stat-boosting potions" : "stat-restoring potions") + " with this spell.", "warn");
    return true;
  }
  const held = def.dose || 1;
  if (held < 1) { chat("You have no doses of that potion left.", "warn"); return true; }
  /* one dose per other player, never more than the vial holds, and never more
     than the spell's own four */
  const wanted = squarePlayers(G.player, 2).slice(0, 4);
  const recipients = wanted.slice(0, Math.min(wanted.length, held));
  pay();
  const idx = POTION_INDEX.get(p.id);
  if (idx != null && Net.status === "online") {
    for (const g of recipients) netSpell(spell.id, g.id, idx);
  }
  /* the vial steps down by one dose per recipient, and what is left when they
     take the last one is the empty vial - the same item the drink leaves behind */
  const left = held - recipients.length;
  ps.inv[index] = { id: left > 0 ? p.id + "_" + left : "vial", qty: 1 };
  applyPotionEffects(ps, p);                     /* the caster's own free dose */
  chat(recipients.length
    ? "You share the " + def.name.toLowerCase() + " with those around you."
    : "You share the " + def.name.toLowerCase() + " with yourself.", "game");
  mark("inv", "skills");
  return true;
}

/* Vengeance's own cooldown, in game ticks: half a minute from the cast,
   whatever becomes of the effect. Game ticks are 0.6 s, so 50 of them. */
const VENGEANCE_CD_TICKS = 50;

/* ------------------------------------------------------- Spellbook Swap
   The live spell is *temporary*: it puts another book in front of you for one
   spell and then hands the Lunar book back, which is the whole difference
   between it and praying at an altar (where the change sticks). Two halves,
   and they live apart on purpose:

     * `swapSpellbook` (the cast) asks which book, through the client's own
       option list - interfaces 228/230/232/234, the same boxes an NPC uses
       (src/dialogue.js#renderOptions) - with every book this world has except
       the one already open.
     * `noteSwapCast` (hung on src/magic.js#Cast.onCast) hands the Lunar book
       back the instant a spell of the other book is actually cast.

   The state is two ids on the player state and is session-only: a logout ends
   the swap, exactly as it ends every other Lunar buff (src/save.js's field
   list and src/combat.js#playerDeath's clear). `swapTo` is what the fallback
   tests the cast's book against, so a manual book change (`cycleBook`, which
   drops the swap) cannot leave it armed against the wrong book. */
function swapSpellbook() {
  const options = BOOKS.filter((b) => b.id !== UI.book).map((b) =>
    opt(b.name, then(() => armSwap(b.id))));
  if (!options.length) { chat("You have no other spellbook to read.", "warn"); return; }
  startDialogue("spellbook", [{ title: "Spellbook Swap", options }]);
}

function armSwap(book) {
  const ps = G.ps;
  ps.swapFrom = UI.book;
  ps.swapTo = book;
  UI.spell = null;
  UI.book = book;
  chat("You are reading the " + bookById(book).name + " spellbook.", "game");
  mark("magic", "combat");
}

/* One spell of the swapped book has been cast: put the Lunar book back. */
function noteSwapCast(spell) {
  const ps = G.ps;
  if (ps.swapTo == null) return;
  if ((spell.book || "standard") !== ps.swapTo) return;
  const back = ps.swapFrom;
  ps.swapFrom = null;
  ps.swapTo = null;
  UI.spell = null;
  UI.book = back;
  chat("You are reading the " + bookById(back).name + " spellbook.", "game");
  mark("magic", "combat");
}

Cast.onCast = noteSwapCast;

/* The Moonclan spells that are cast on the spot and do something to the caster. */
function castLunarSelf(spell, pay) {
  const ps = G.ps;
  switch (spell.id) {
    case 564: { /* Vengeance - reflect 75% of the next hit back at its owner.
       The live spell has a cooldown of its own on top of the effect: half a
       minute from the *cast*, whatever becomes of the Vengeance itself, so a
       player cannot keep a fresh one up permanently. Both refusals are the
       client's own lines and both are free (they do not `pay()`), which is the
       same rule every other refusal in this file follows - and, unlike the
       effect, the timer is not saved: a logout ends it, exactly as it ends the
       Vengeance it was counting down (src/combat.js#playerDeath's buff clear
       and src/save.js's field list). */
      if (ps.vengeance) { chat("You already have Vengeance cast on you.", "warn"); return true; }
      if (ps.vengeanceCd > 0) { chat("You must wait before you can cast Vengeance again.", "warn"); return true; }
      pay();
      ps.vengeance = true;
      ps.vengeanceCd = VENGEANCE_CD_TICKS;
      chat("You feel vengeful.", "game");
      return true;
    }
    case 580: /* Dream - sleep off your wounds; recharges HP fast until you move */
      pay();
      ps.dream = true;
      chat("You fall into a dream.", "game");
      return true;
    case 552: /* Magic Imbue - lets a combination rune be made without a talisman */
      pay();
      ps.imbueTicks = 100;
      chat("You feel the power of the runes flow through you.", "game");
      return true;
    case 562: /* Cure Me */
      pay();
      ps.poison = null;
      chat("You feel cured of all poison.", "game");
      return true;
    case 582: { /* Spellbook Swap - the next spellbook, the spell's own point */
      pay();
      swapSpellbook();
      return true;
    }
    case 568: /* NPC Contact - the spell's whole use is a contact list, and this
       world has no one on one */
      chat("You have no one to contact.", "warn");
      return true;
    case 579: /* Hunter Kit - the live spell conjures a box of hunting gear.
       This world has no hunting equipment to put in one, so the spell says so
       rather than handing over a box with nothing in it. */
      chat("This world has no hunting gear for the spell to pack.", "warn");
      return true;
    default:
      return false;
  }
}

/* Humidify's own machinery: fill every empty vessel in the pack at once. The
   live spell takes no target - one cast waters the whole pack, which is its
   entire reason to exist next to a well that fills one bucket at a time - so
   this walks the pack rather than the clicked stack. Every filled vessel gets
   the client's own line for it ("You fill the bucket with water."), which is
   the same line the town well says (src/actions.js#fillBucket), so a spell
   cast and a well trip read identically. `WATER_VESSELS` is built from the
   items' `fillFrom` field (see its declaration), so a vessel this world grows
   later is filled without touching this function. Returns how many were
   filled, 0 if the pack held nothing that can hold water. */
function fillAllVessels(ps) {
  let filled = 0;
  for (const slot of ps.inv) {
    if (!slot) continue;
    const to = WATER_VESSELS[slot.id];
    if (!to || !ITEMS[to]) continue;
    const qty = slot.qty || 1;
    const name = (ITEMS[slot.id] && ITEMS[slot.id].name ? ITEMS[slot.id].name : slot.id).toLowerCase();
    slot.id = to;
    chat("You fill the " + name + " with water.", "game");
    filled += qty;
  }
  return filled;
}

/* An item-targeted lunar spell. Returns false if this spell has no item
   handling of its own (the caller then says what it needs). */
function castLunarItem(spell, index, pay) {
  const ps = G.ps;
  const s = index == null ? null : ps.inv[index];
  if (!s) return false;
  const def = itemDef(s.id) || {};
  /* The two Potion Shares: the clicked item is the potion whose dose is handed
     round (see `castPotionShare`). */
  if (spell.id === 551 || spell.id === 554) return castPotionShare(spell, index, pay);
  /* Bake Pie cooks the item you cast it on - raw food in this world, since
     there are no pies to bake (the spell's own material does not exist here). */
  if (spell.id === 543) {
    const cooked = RAW_TO_COOKED[s.id];
    if (!cooked || !ITEMS[cooked]) { chat("You can only bake food with this spell.", "warn"); return true; }
    pay();
    invRemoveAt(ps, index, 1);
    invAdd(ps, cooked, 1);
    chat("You bake the " + def.name.toLowerCase() + ".", "game");
    mark("inv");
    return true;
  }
  /* Humidify: every empty vessel in the pack, in one cast. */
  if (spell.id === 578) {
    if (!WATER_VESSELS[s.id]) { chat("You have no vessel that can hold water.", "warn"); return true; }
    if (!fillAllVessels(ps)) { chat("You have no vessel that can hold water.", "warn"); return true; }
    pay();
    mark("inv");
    return true;
  }
  const make = LUNAR_MAKE[spell.id];
  const to = make && (make.to ? ITEMS[make.to] : null);
  if (make && to && (make.from ? s.id === make.from : def.kind === make.fromKind)) {
    pay();
    invRemoveAt(ps, index, 1);
    invAdd(ps, make.to, 1);
    chat("You " + make.verb + " the " + def.name.toLowerCase() +
      (make.into ? " into " + make.into : "") + ".", "game");
    mark("inv");
    return true;
  }
  if (spell.id === 543) return true;
  if (spell.id === 581) { chat("You have no way to work these into planks.", "warn"); return true; }
  if (spell.id === 548) { chat("You need a bucket of sand and some soda ash.", "warn"); return true; }
  /* String Jewellery (unit L3a) - the spell the ball of wool does by hand, and
     the reason unit K parked this world's unstrung amulets in the first place.
     The live spell strings *every* unstrung amulet in the pack at once for 4
     Crafting each, so a cast aimed at one of them finishes the lot; the runes and
     the Magic xp are the spell's own row, the 4 per amulet is the stringing
     amount (`items.js#STRING_XP`), and the pose is the spell's own
     `cast_lunar_string` (so this does not go through `stringAmulet`, which plays
     the leathercraft pose). An unstrung amulet is still the thing to aim at -
     this plumbed spell needs a target where the live one does not - and aiming
     at anything else is the same refusal it has always been. (Unit M3 recorded
     this spell's *refusal* as its whole behaviour; that expectation is
     superseded now that the world has unstrung jewellery.) */
  if (spell.id === 550) {
    if (!STRING_RECIPES[s.id]) { chat("You can only string an unstrung amulet with this spell.", "warn"); return true; }
    pay();
    let strung = 0;
    for (const [unstrungId, strungId] of Object.entries(STRING_RECIPES)) {
      while (invCount(ps, unstrungId) > 0) {
        invRemove(ps, unstrungId, 1);
        invAdd(ps, strungId, 1);
        addXp(ps, "crafting", STRING_XP);
        strung++;
      }
    }
    mark("inv");
    chat("You string " + (strung === 1 ? "the amulet" : strung + " amulets") + ".", "game");
    return true;
  }
  if (spell.id === 553) { chat("You need a patch of soil to fertilise.", "warn"); return true; }
  if (spell.id === 567) { chat("You need a diseased plant to cure.", "warn"); return true; }
  /* Recharge Dragonstone tops a dragonstone amulet's teleport charges back up.
     The only charged jewellery this world has is the enchanted ring (see
     src/items.js#RINGS - the glory's teleports are all to places this map has
     not got, so this revision gives it none), which means there is no charge
     number to restore: the honest answer is that the amulet is already full,
     and the spell says which item it wants instead of the generic line. */
  if (spell.id === 584) {
    chat(s.id === "amulet_of_glory" || s.id === "dragonstone_amulet"
      ? "Your amulet is already fully charged."
      : "You can only cast this spell on a dragonstone amulet.", "warn");
    return true;
  }
  chat("Nothing interesting happens.", "game");
  return true;
}

/* ---------------------------------------------- the spells that need a body

   Nine rows of the Lunar book take another *player* as their target, and this
   world has other players in it (the world server, src/net.js), so those nine
   are cast over the wire instead of refused. The split of work is the live
   game's: the caster's client pays the runes, plays the pose and decides how
   much the spell is worth, and the **target's own client** is the only thing
   that ever touches the target's hitpoints or poison. Nothing has to trust a
   caster with somebody else's state, and a client that is *not* the target still
   plays the caster's pose, so everyone in earshot sees the spell happen - which
   is the whole point of casting Heal Other at a person rather than at yourself.

   What travels is the spell's own *magnitude*: a heal's hitpoints, Energy
   Transfer's run units. The spell id travels with it, and both clients look it
   up in the same table (src/magic.js#spellById) - one table, not two, exactly
   the way an emote travels as an index into src/emotes.js.

   Nothing here is a refusal any more: the whole player-targeted set is wired,
   including the two teleport lines that *move somebody else* - the standard
   book's Teleother line and the Lunar book's seven Tele Group spells - and the
   Tele Block that stops them. (The two Potion Shares are not in this set at all:
   their real target is a potion in the caster's own pack, and they say so on
   their own row - see src/magic.js#LUNAR_SPELLS' `refuses`.)

   Two things are worth knowing about the teleport lines, because they are the
   only spells here that change another player's *position* rather than their
   numbers:

   * **They ask first.** The cast arrives at the target's own client and that
     client puts the question to its own player through the client's own option
     box (`offerTeleport` below) - a teleport is the one effect a player has to
     accept, which is also why the answer is nobody else's business. A player who
     declines, closes the box or has walked away is simply not moved, and the
     caster is never told either way.
   * **Tele Block does not ask.** It is the hostile half: the target's own client
     sets its own `teleblockTicks`, and that timer is what refuses a teleport
     (`castOnSelf`). The caster cannot make it stick and the target cannot be
     made to forget it. */

/* The three Teleother spells: one named player, one fixed destination. */
const TELEOTHER_IDS = new Set([349, 350, 351]);
const TELEBLOCK_ID = 352;

/* The player-targeted spells the mark has a say over: the ones that only ever
   do them good. Cure Other, Heal Other, Vengeance Other, Energy Transfer and
   the three Teleothers all sit behind the mark's own **Accept Aid** setting
   (the options panel's toggle), which is why the caster refuses them early for
   a body whose flag is off - and why the mark's client drops them too. Tele
   Block and Stat Spy are deliberately absent: the one is the hostile half of
   the set and the other reads a statistic, and neither asks. */
const AIDED_PLAYER_SPELLS = new Set([551, 554, 558, 559, 560, 561, 349, 350, 351]);

const HEAL_FRACTION = 0.75;      /* Heal Other and Heal Group hand over 75% */
/* How far a spell reaches a player: the live game's ten tiles. */
const PLAYER_SPELL_RANGE = 10;
/* The two spells of the set that are cast on a *group* rather than on one
   person: they work over the 3x3 around the caster, not over the target. */
const AREA_SPELLS = new Set([565, 566]);

/* The spell picked in the book, when it is one aimed at a player. */
function pickedPlayerSpell() {
  const sp = UI.spell != null ? spellById.get(UI.spell) : null;
  if (!sp || !(sp.on & SPELL_TARGET.PLAYER)) return null;
  return sp;
}

/* Casting at another player: within ten tiles, else walk over first. */
function approachPlayer(ghost, fn) {
  /* No casting through the slab: a mark on the other level is out of reach. */
  if ((ghost.plane || 0) !== (G.player.plane || 0)) { chat("You can't reach that.", "warn"); return; }
  const tx = Math.floor(ghost.x), tz = Math.floor(ghost.z);
  if (distT(tx, tz, G.player) <= PLAYER_SPELL_RANGE) { fn(); return; }
  begin("goto", tx, tz, { fn });
}

/* The other players standing on `centre`'s square or the eight around it - the
   3x3 a group spell works over, which is always centred on the *caster* (the
   live spell says so: "within a 3x3 square area of the caster, including
   standing on the caster's square"), never on whoever was clicked. Read off the
   ghosts this client can see, which is exactly the set that could be in the
   square. */
function nearbyPlayers(centre) {
  const out = [];
  for (const g of G.ghosts.values()) {
    if (g === centre) continue;
    /* Group help stays on the caster's own level. */
    if ((g.plane || 0) !== (G.player.plane || 0)) continue;
    if (Math.max(Math.abs(g.x - centre.x), Math.abs(g.z - centre.z)) <= 1.5) out.push(g);
  }
  return out;
}

/* Would this player take the help? The live game's rule is that the *mark's*
   own Accept Aid decides, and this is that answer for a player this client can
   see - read off the kit packet they last sent (src/net.js#parseKit), which
   carries the toggle. A body whose flag has not arrived yet is treated as
   willing, which is the setting's own default. The caster uses it to refuse
   early (and, for a Potion Share, to decide how many doses to spend); the mark's
   own client is still the one that applies or drops the effect, so a stale flag
   can only cost the caster a dose, never change somebody's mind for them. */
function acceptsAidBy(ghost) {
  return !ghost || ghost.acceptAid !== false;
}

/* The players a spell cast *over the caster's own square* would reach, in the
   square the live spell uses and willing to be helped: the group spells work
   over a 3x3 (one tile each way) and the two Potion Shares over a 5x5 (two). */
function squarePlayers(centre, radius) {
  const out = [];
  for (const g of G.ghosts.values()) {
    if (g === centre) continue;
    if (Math.max(Math.abs(g.x - centre.x), Math.abs(g.z - centre.z)) > radius) continue;
    if (!acceptsAidBy(g)) continue;
    out.push(g);
  }
  return out;
}

/* What a player-targeted spell costs the caster and what it delivers.

   Two of them really are transfers. Heal Other and Heal Group hand over 75% of
   the caster's *current* hitpoints - the live spell says so ("transfers up to
   75% of Hitpoints to another player") and will not be cast on less than 11% of
   the caster's maximum, which is the floor that stops a dying player using it as
   a free heal. Heal Group's 75% is the *pool*, divided among the players in the
   3x3 (the caster counts as one of them - see `applyRemoteSpell`, where the
   caster standing in their own group is healed by their own cast). Energy
   Transfer hands over the special attack bar it names and only fires from a full
   one.

   Returns `{ power, cost }` - the magnitude to put on the wire and what the
   caster gives up - or null when the spell's own requirement is missing, in
   which case it has already said why. */
function playerSpellPlan(spell, ghost) {
  const ps = G.ps;
  const minimum = Math.ceil(ps.maxHp * 0.11);
  switch (spell.id) {
    case 560: {                                  /* Heal Other */
      if (ps.hp < minimum) { chat("You need at least 11% of your hitpoints to cast this spell.", "warn"); return null; }
      const heal = Math.floor(ps.hp * HEAL_FRACTION);
      return { power: heal, cost: heal };
    }
    case 566: {                                  /* Heal Group */
      if (ps.hp < minimum) { chat("You need at least 11% of your hitpoints to cast this spell.", "warn"); return null; }
      const pool = Math.floor(ps.hp * HEAL_FRACTION);
      /* the group is the caster's own 3x3, whichever player was clicked to
         centre the cast - so the count is the ghosts around `G.player`, and
         only the ones who would take the help: a player who has turned Accept
         Aid off is not in the group the caster is paying for. */
      const n = 1 + squarePlayers(G.player, 1.5).length;
      const share = Math.floor(pool / n);
      return { power: share, cost: share * n };
    }
    case 558: {                                  /* Energy Transfer */
      if ((ps.specEnergy || 0) < 100) { chat("You need a full special attack bar to cast Energy Transfer.", "warn"); return null; }
      return { power: Math.round(ps.runEnergy || 0), cost: -1 };
    }
    default:
      return { power: 0, cost: 0 };
  }
}

/* Take the caster's half of the cost, at the instant the spell is cast and not a
   moment before - the same rule every other cast in this file follows. */
function spendPlayerSpellCost(spell, cost) {
  const ps = G.ps;
  if (spell.id === 560 || spell.id === 566) {
    ps.hp = Math.max(1, ps.hp - cost);
    mark("skills");
    return;
  }
  if (spell.id === 558) {
    ps.specEnergy = 0;
    ps.runEnergy = 0;
    mark("combat");
  }
}

/* Cast a player-targeted spell at `ghost`. Returns true when the click was
   taken (whether or not the spell went off), false when the caller should go on
   and treat it as an ordinary click. */
function castSpellOnPlayer(ghost, spell) {
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  if (!ghost || ghost.kind !== "ghost" || !G.ghosts.has(ghost.id)) {
    chat("They are no longer here.", "warn");
    return true;
  }
  if (Net.status !== "online") {
    chat("You need to be connected to the world to cast " + spell.name + " on another player.", "warn");
    return true;
  }
  /* The level, the runes and the weapon's recovery, exactly as the book checks
     them before aiming anything anywhere (src/actions.js#canCastSpell). */
  if (!canCastSpell(spell)) return true;
  /* The mark's own Accept Aid decides whether a beneficial spell lands (see
     src/actions.js#AIDED_PLAYER_SPELLS). Refusing here costs nothing - the runes
     are only spent by `payCast` - and it saves the caster the missile. The group
     spells are not aimed at the player who was clicked, so for those the same
     check is made per recipient instead (`squarePlayers`). */
  if (AIDED_PLAYER_SPELLS.has(spell.id) && !acceptsAidBy(ghost)) {
    chat("That player is not accepting aid.", "warn");
    return true;
  }
  const plan = playerSpellPlan(spell, ghost);
  if (!plan) return true;                        /* its own refusal, already said */
  payCast(spell);                                /* runes, xp, the pose */
  spendPlayerSpellCost(spell, plan.cost);
  /* what the caster themselves watches cross the gap (see `showCastOnTarget`) -
     the echo that comes back off the socket deliberately does not draw this, so
     without it a Tele Block's missile would only ever be seen by other people */
  showCastOnTarget(spell, G.player, ghost.id, netMyId());
  netSpell(spell.id, ghost.id, plan.power);
  return true;
}

/* A player-targeted spell has arrived off the socket. Everything that can be
   done without knowing who the target is happens first - the caster's pose on
   their ghost, which is what lets everybody watching see the spell - and then
   the effect, which only this client may apply if this client is the mark.

   The caster receives their own cast back (the server echoes to the caster's own
   chunk), and skips the pose on the way in: it has already been played. They do
   *not* skip the effect half, because the group spells are centred on the caster
   and the caster is standing in their own 3x3. */
export function remoteSpell(from, spellId, target, power, ix) {
  const spell = spellById.get(spellId);
  if (!spell) return;
  const me = netMyId();
  const mine = from === me;
  const ghost = mine ? G.player : G.ghosts.get(from);
  /* The caster's body may not be on this screen at all: a player-targeted spell
     is delivered to the mark's own connection whether or not the mark can see
     the caster (see index.html's C_SPELL), because a Heal Other cast across the
     world still has to heal. There is nothing to animate when there is no body
     to animate, so the two visual halves below are skipped - but the effect half
     is not, and the impact graphic still lands on the mark.

     The one spell whose effect needs the caster *standing* somewhere is the
     group line, which works over the caster's own 3x3 - and that is cast on
     people who are by definition within arm's reach of the caster, where the
     caster's ghost is always drawn. `inCastersSquare` answers false for a caster
     this client cannot see, which is the honest answer. */
  if (ghost) {
    /* The cast's own look: the caster's pose and their gathering graphic, plus
       the missile when the spell throws one at a named player. The caster's own
       client has already shown all of it - they watched themselves cast - so
       that half is skipped on the echo; every other client in earshot draws it
       now, off the same shared table (see src/net.js#S_SPELL). */
    if (!mine) {
      playCastAnim(ghost, castAnimFor(ghost, spell));
      if (spell.start != null) {
        Gfx.play(spell.start, {
          x: ghost.rx != null ? ghost.rx : ghost.x,
          z: ghost.rz != null ? ghost.rz : ghost.z,
          height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, ghost),
          dir: ghost.dir || 0,
          target: ghost,
          fwd: spell.fwd || 0,
          rate: spell.rate || 1,
        });
      }
    }
    showCastOnTarget(spell, ghost, target, me);
  } else if (!mine && playerBody(target, me)) {
    /* no caster to draw, but the mark is on this screen: show what lands on it */
    playerImpact(spell, target, me);
  }
  /* A cast thrown at a creature: the caster's pose and gather are already
     playing above (the packet names no player), and now the rest of it - the
     missile across the gap and the burst on the victim's own body, flown at
     this client's copy of the creature the spawn index names. Nothing is
     applied: damage, curses and binds are the caster's own simulation, told
     separately as hitsplats (src/combat.js#damageNpc), so a watched spell can
     never hurt anything twice. */
  if (!mine && ghost && target === 0 && ix != null && ix !== 0xffff) showNpcSpellHit(spell, ghost, ix);
  applyRemoteSpell(spell, power, target === me, ghost, from);
}

/* The half of a player-targeted cast that happens *between* the two bodies: the
   missile on its way over (Tele Block's 344) or, for a spell that touches
   without throwing (the Teleother line), the swirl that lands on the mark at
   once. Every client that can see both bodies draws it - the caster's own
   client included, from `castSpellOnPlayer`, because a caster watching their own
   missile fly is the whole reason the missile exists. */
function showCastOnTarget(spell, caster, target, me) {
  if (spell.proj != null) flyPlayerMissile(spell, caster, target, me);
  else if (spell.end != null) playerImpact(spell, target, me);
}

/* A spell's missile, flown at the player it names. `target` is a connection id
   (0 for the group line, which throws nothing at anybody in particular), so this
   client finds the body it lands on the same way everything else addresses a
   player: its own entity if it is the mark, the ghost otherwise. Where the
   impact graphic goes is `playerImpact`. */
function flyPlayerMissile(spell, caster, target, me) {
  const tgt = playerBody(target, me);
  if (!tgt) return;
  const fx = caster.rx != null ? caster.rx : caster.x;
  const fz = caster.rz != null ? caster.rz : caster.z;
  Gfx.projectile({
    gfx: spell.proj,
    fromX: fx, fromZ: fz, fromH: spell.projStart || 0,
    /* the missile is aimed at the body, not at the tile: a moving mark is hit
       where they actually stand, and the height is their own chest rather than
       the caster's (src/magic.js#impactHeight) */
    target: tgt, toX: tgt.x, toZ: tgt.z, toH: bodyHeight(spell.projEnd || 0, tgt),
    delay: projDelayCycles(spell),
    tint: spell.tint,
    duration: spellTravelSeconds(spell, Math.hypot(fx - tgt.x, fz - tgt.z)),
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: () => playerImpact(spell, target, me),
  });
}

/* The far half of a cast thrown at a creature: the missile from the watcher's
   copy of the caster to the watcher's copy of the victim, and the burst on the
   victim's own body. It mirrors the caster's own presentation
   (src/combat.js#castAt and #landSpell) beat for beat - the gather ball is
   already playing on the ghost from `remoteSpell` above - but applies nothing:
   a miss still bursts here rather than splashing, because only the caster's
   client knows the roll and a watched spell must never decide anything. */
function showNpcSpellHit(spell, caster, ix) {
  const npc = creatureBySpawnIx(ix);
  if (!npc || npc.dead) return;
  const fx = caster.rx != null ? caster.rx : caster.x;
  const fz = caster.rz != null ? caster.rz : caster.z;
  const burst = () => {
    if (spell.end != null) {
      Gfx.play(spell.end, {
        x: npc.x, z: npc.z,
        height: impactHeight(spell, npc),
        dir: npc.dir || 0,
        target: npc,
        tint: spell.tint,
      });
    }
  };
  if (spell.proj != null) {
    Gfx.projectile({
      gfx: spell.proj,
      fromX: fx, fromZ: fz, fromH: spell.projStart || 0,
      target: npc, toX: npcDrawCX(npc), toZ: npcDrawCZ(npc), toH: bodyHeight(spell.projEnd || 0, npc),
      delay: projDelayCycles(spell),
      tint: spell.tint,
      duration: spellTravelSeconds(spell, Math.hypot(fx - npcDrawCX(npc), fz - npcDrawCZ(npc))),
      hidden: !MISSILE_IN_FLIGHT,
      onArrive: burst,
    });
    return;
  }
  /* A god spell carries no missile - only the god's own graphic on the victim -
     but the burst must not land before the casting pose has finished raising
     the arms, so a hidden carrier is flown over the pose's release frame first
     (src/combat.js#castAt). */
  if (spell.endDelay) {
    Gfx.projectile({
      gfx: spell.end,
      fromX: fx, fromZ: fz, fromH: 0,
      target: npc, toX: npcDrawCX(npc), toZ: npcDrawCZ(npc), toH: 0,
      delay: spell.endDelay,
      duration: 0.05,
      hidden: true,
      onArrive: burst,
    });
    return;
  }
  burst();
}

/* Somebody else's self-cast (src/net.js#C_CAST): the caster's pose and their
   gathering graphic on their ghost, so a utility spell is seen to be cast.
   There is no mark and no effect - applying anything is the caster's own
   client's business, and a self-cast has nobody to apply to. The sender's own
   echo never reaches here (src/net.js#onMessage drops it). */
export function remoteCastFx(from, spellId) {
  const spell = spellById.get(spellId);
  if (!spell) return;
  const ghost = G.ghosts.get(from);
  if (!ghost) return;
  playCastAnim(ghost, castAnimFor(ghost, spell));
  if (spell.start != null) {
    Gfx.play(spell.start, {
      x: ghost.rx != null ? ghost.rx : ghost.x,
      z: ghost.rz != null ? ghost.rz : ghost.z,
      height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, ghost),
      dir: ghost.dir || 0,
      target: ghost,
      tint: spell.tint,
      fwd: spell.fwd || 0,
      rate: spell.rate || 1,
    });
  }
}

/* Somebody else's grab flight (src/net.js#C_GRABFX): the missile and the burst
   on their ghost, so a Telekinetic Grab is seen to fly. There is no mark and
   no effect - the take is the caster's own client's business, and a second
   take here is exactly the duplication the priority rule exists to prevent
   (see `trackGroundTake`). The sender's own echo never reaches here
   (src/net.js#onMessage drops it). */
export function remoteGrabFx(from, spellId, x, z) {
  const spell = spellById.get(spellId);
  if (!spell || spell.kind !== "grab") return;
  const ghost = G.ghosts.get(from);
  if (!ghost) return;
  if (x < 0 || x >= 256 || z < 0 || z >= 256) return;
  const gx = ghost.rx != null ? ghost.rx : ghost.x;
  const gz = ghost.rz != null ? ghost.rz : ghost.z;
  const tx = x + 0.5, tz = z + 0.5;
  Gfx.projectile({
    gfx: spell.proj,
    tint: spell.tint,
    fromX: gx, fromZ: gz, fromH: spell.projStart || 0,
    toX: tx, toZ: tz, toH: spell.projEnd || 0,
    /* The ghost may be mid-step when the packet lands: the missile leaves the
       rendered body, the way a strike's does for the caster's own client. */
    fromFn: () => ({
      x: ghost.rx != null ? ghost.rx : ghost.x,
      z: ghost.rz != null ? ghost.rz : ghost.z,
      h: spell.projStart || 0,
    }),
    delay: projDelayCycles(spell),
    duration: spell.fixedFlight != null ? spell.fixedFlight : flightSeconds(Math.hypot(gx - tx, gz - tz)),
    onArrive: () => {
      Gfx.play(spell.end, { x: tx, z: tz, height: spell.endH || 0, tint: spell.tint });
    },
  });
}

/* Somebody else's one-shot graphic (src/net.js#C_GFX): a spotanim that is not
   a spell's gather, missile or burst, played riding their ghost the way a
   gather rides its caster - the runecrafting swirl over their hands, the dark
   bow's shroud around their body. Visuals-only like every other remote
   effect: an unknown id plays nothing (src/gfx.js#play returns null for it),
   and nothing here touches packs, levels or hitpoints. */
export function remoteGfxFx(from, gfxId, height) {
  const ghost = G.ghosts.get(from);
  if (!ghost) return;
  Gfx.play(gfxId, {
    x: ghost.rx != null ? ghost.rx : ghost.x,
    z: ghost.rz != null ? ghost.rz : ghost.z,
    height: height || 0,
    dir: ghost.dir || 0,
    target: ghost,
  });
}
/* Somebody else's teleport arrival (src/net.js#C_ARRIVE): the ghost is put on
   the landing tile the packet names - the caster's own state packets will
   confirm it a tick later, but the arrival is played now, where it happened -
   and then the arrival pose and the reversed bubble, exactly the far side the
   caster's own client played (src/actions.js#teleportJump). Teleother has no
   arrival pose and never sends one, so its victims simply appear, there as
   here. */
export function remoteArrive(from, spellId, x, z) {
  const spell = spellById.get(spellId);
  if (!spell || !spell.arrive) return;
  const ghost = G.ghosts.get(from);
  if (!ghost) return;
  if (x >= 0 && x < 256 && z >= 0 && z < 256) {
    ghost.x = x + 0.5;
    ghost.z = z + 0.5;
    ghost.rx = ghost.x;
    ghost.rz = ghost.z;
    if (ghost.path) ghost.path.length = 0;
  }
  playCastAnim(ghost, spell.arrive);
  ghost.castClamp = true;
  if (spell.start != null) {
    Gfx.play(spell.start, {
      x: ghost.x,
      z: ghost.z,
      height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, ghost),
      dir: ghost.dir || 0,
      target: ghost,
      tint: spell.tint,
      reverse: true,
      seconds: TELEPORT_BUBBLE_SECONDS,
    });
  }
}

/* The spell's own end graphic, on the player it was aimed at. */
function playerImpact(spell, target, me) {  if (spell.end == null) return;
  const tgt = playerBody(target, me);
  if (!tgt) return;
  Gfx.play(spell.end, {
    x: tgt.rx != null ? tgt.rx : tgt.x,
    z: tgt.rz != null ? tgt.rz : tgt.z,
    height: bodyHeight(spell.endH == null ? CENTRE_HEIGHT : spell.endH, tgt),
    dir: tgt.dir || 0,
    target: tgt,
    tint: spell.tint,
  });
}

/* The group spells' own halo, worn by each body they actually mend. The named-
   target line shows it through `playerImpact`, but a group cast names nobody -
   `showCastOnTarget` is handed 0 and `playerBody(0)` draws nothing - so the
   half of the effect that lands here (see `applyRemoteSpell`) draws it on the
   body it just cured or healed, caster included. */
function wearSpellHalo(spell) {
  if (spell.end == null) return;
  Gfx.play(spell.end, {
    x: G.player.rx != null ? G.player.rx : G.player.x,
    z: G.player.rz != null ? G.player.rz : G.player.z,
    height: bodyHeight(spell.endH == null ? CENTRE_HEIGHT : spell.endH, G.player),
    dir: G.player.dir || 0,
    target: G.player,
    tint: spell.tint,
  });
}

/* The entity a connection id names, from this client's point of view. */
function playerBody(target, me) {
  if (!target) return null;
  return target === me ? G.player : G.ghosts.get(target);
}

/* The name to hang on a line about another player. */
function playerNameOf(from) {
  const g = G.ghosts.get(from);
  return (g && g.name) || "Somebody";
}

/* Is this client standing in the caster's own 3x3 - the square the group spells
   work over? Only the square counts and the square is the *caster's*, so this is
   the one test a group spell makes about the client reading it. */
function inCastersSquare(caster) {
  /* a caster this client cannot see has no square here to be standing in */
  if (!caster) return false;
  return Math.max(Math.abs(G.player.x - caster.x), Math.abs(G.player.z - caster.z)) <= 1.5;
}

/* ------------------------------------------------- the teleports that ask

   A spell that moves somebody else cannot simply move them: it asks, and it asks
   the person it is about to move, through their own client's option box. That is
   the live game's own box (`interface 219`'s option list, drawn by
   src/dialogue.js#renderOptions) and the reason `then` exists - the box is torn
   down *before* the answer's line is printed, so the line lands in the log
   instead of underneath a box that is on its way out.

   Both senders land here: the three Teleother spells, which name the player they
   are aimed at, and the seven Tele Group spells, whose "target" is the 3x3
   around the caster and which arrive at every client in that square at once. */
function offerTeleport(spell, from) {
  const who = playerNameOf(from);
  startDialogue("teleother", [{
    title: who + " wishes to teleport you to " + spell.place + ".",
    options: [
      opt("Yes, teleport me.", then(() => acceptTeleport(spell))),
      opt("No, stay here.", then(() => chat("You decline " + who + "'s teleport.", "game"))),
    ],
  }]);
}

/* The answer was yes: vanish, then go. The move itself is `castTeleport`'s, minus
   the casting - nothing is paid by the player being moved, and their own cast
   timer is not armed, because they did not cast anything. */
function acceptTeleport(spell) {
  playCastAnim(G.player, castAnimFor(G.player, spell));
  /* The victim vanishes too, and the players standing around watch it happen:
     the caster's own announcement named the victim but played nothing on them,
     so the vanish goes out under the spell's own id. The arrival needs none -
     Teleother has none to send, and its victims simply appear. */
  if (Net.status === "online" && spell && spell.id != null) netCast(spell.id);
  holdForTeleport(spell);
}

/* Tele Block landed: the timer that refuses this player's teleports for the next
   five minutes, set by the player wearing it and by nobody else. */
function teleblocked(from) {
  const ps = G.ps;
  ps.teleblockTicks = TELEBLOCK_TICKS;
  chat("You have been teleport blocked by " + playerNameOf(from) + ".", "warn");
  mark("skills", "magic");
}

/* The effect, on the client that may apply it. `me` says whether the cast was
   aimed at this player; the group spells are aimed at nobody in particular and
   cure/heal everyone in the caster's 3x3 instead. `from` is the caster's own
   connection id - Stat Spy needs it, because its answer has to be addressed back
   to the connection that asked (src/net.js#netStats), and the two teleport
   prompts need the caster's name. */
function applyRemoteSpell(spell, power, me, caster, from) {
  const ps = G.ps;
  const mine = from === netMyId();
  /* The Teleother line: one named player, who is asked (see `offerTeleport`) -
     but only if they are taking aid at all: a player with Accept Aid off is not
     shown the offer box, which is exactly what the setting is for. */
  if (TELEOTHER_IDS.has(spell.id)) {
    if (me && acceptsAid()) offerTeleport(spell, from);
    return;
  }
  /* Tele Block: one named player, who is not asked - it is the hostile half. */
  if (spell.id === TELEBLOCK_ID) {
    if (me && ps.teleblockTicks <= 0) teleblocked(from);
    return;
  }
  /* The Tele Group line: nobody in particular, so it is the caster's own 3x3
     that decides who is asked. The caster's own client skips this outright -
     `castTeleport` has already moved them. */
  if (spell.kind === "teleport" && spell.group) {
    if (mine) return;
    if (inCastersSquare(caster) && acceptsAid()) offerTeleport(spell, from);
    return;
  }
  if (!me && !AREA_SPELLS.has(spell.id)) return;
  if (!me && !inCastersSquare(caster)) return;
  /* The spells that only do the mark good sit behind the mark's own Accept Aid
     (src/actions.js#AIDED_PLAYER_SPELLS, and the group line, which is the same
     bargain offered to a square). A player who has turned aid off is not
     cured, healed, given Vengeance or handed run energy, and no dose of a shared
     potion is applied to them. The rest of the set - Tele Block, Stat Spy - does
     not ask, and neither does a Potion Share's dose, which is checked where it
     is applied below.

     `!mine` because the setting governs aid from *other people*: a caster with
     Accept Aid off may still heal the square they are standing in, themselves
     included. */
  if (!mine && (AIDED_PLAYER_SPELLS.has(spell.id) || AREA_SPELLS.has(spell.id)) && !acceptsAid()) return;
  switch (spell.id) {
    case 559: case 565:                          /* Cure Other / Cure Group */
      if (!ps.poison) return;
      ps.poison = null;
      if (!me) wearSpellHalo(spell);             /* the group line, on each cured body */
      chat("You have been cured of all poison.", "game");
      mark("skills");
      return;
    case 560: case 566:                          /* Heal Other / Heal Group */
      if (ps.hp <= 0 || ps.hp >= ps.maxHp || power <= 0) return;
      ps.hp = Math.min(ps.maxHp, ps.hp + power);
      if (!me) wearSpellHalo(spell);             /* the group line, on each healed body */
      mark("skills");
      return;
    case 561:                                    /* Vengeance Other */
      if (ps.vengeance) return;
      ps.vengeance = true;
      chat("You feel vengeful.", "game");
      return;
    case 558:                                    /* Energy Transfer */
      if (power <= 0) return;
      ps.specEnergy = 100;
      ps.runEnergy = Math.min(RUN_UNITS, (ps.runEnergy || 0) + power);
      mark("combat");
      chat("You feel a surge of energy.", "game");
      return;
    case 551: case 554: {                        /* the two Potion Shares */
      /* `power` is not a magnitude here: it is the potion's own index in
         src/items.js#POTIONS, and this is the recipient's own dose of it -
         administered by this client because it is the only one that may. The
         Accept Aid gate above already ran, so a player who has turned aid off
         never reaches this line. */
      const p = POTIONS[power];
      if (!p) return;
      applyPotionEffects(ps, p);
      return;
    }
    case 576:                                    /* Stat Spy: answer the caster */
      netStats(from, statSpyText(ps));
      return;
    default:
      return;
  }
}

/* Stat Spy's reply, built by the player being spied on - the only client that
   knows what is in the answer. Two short lines: the combat levels, then the two
   the live interface prints as a *current* value rather than a level. Sent as
   one blob (src/net.js#netStats keeps it printable) and split on the bar. */
const COMBAT_SKILL_NAMES = { attack: "Attack", strength: "Strength", defence: "Defence", ranged: "Ranged", prayer: "Prayer", magic: "Magic", hitpoints: "Hitpoints" };
function statSpyText(ps) {
  const head = Object.keys(COMBAT_SKILL_NAMES)
    .map((id) => COMBAT_SKILL_NAMES[id] + " " + levelOf(ps.skills, id))
    .join("  ");
  const tail = "Hitpoints " + ps.hp + "/" + ps.maxHp + "  Prayer " + ps.prayerPoints + "/" + ps.maxPrayer;
  return head + "|" + tail;
}

/* Stat Spy's answer, back at the caster: two chat lines under the spy's name,
   because a chatbox report is what the live spell gives and the name is the one
   thing the answer cannot carry. */
export function showSpyStats(from, blob) {
  const name = (G.ghosts.get(from) || {}).name || "Player";
  const parts = String(blob).split("|");
  chat(name + ": " + parts[0], "game");
  if (parts[1]) chat(name + ": " + parts[1], "game");
}

export function castSpell(spell, target) {
  /* No cast starts mid-climb (see `begin`'s guard, same rule). */
  if (G.player && G.player.climbLock) return true;
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  /* A spell whose machinery this world has not got refuses here as well as in
     the spellbook, in its own words off its own row - the click can reach this
     function from an inventory slot or a menu row as well as from the book. It
     costs nothing, like every other refusal in this file. No row sets a
     `refuses` today (the two Potion Shares were the last, before the nineteenth
     report gave them their real machinery); the hook is kept for the next spell
     that needs it. */
  if (spell.refuses) { chat(spell.refuses, "warn"); return true; }
  const kind = spell.kind;
  const known = kind === "teleport" || kind === "charge" || kind === "alchemy" ||
    kind === "superheat" || kind === "item" || kind === "grab" ||
    kind === "self" || kind === "other" || kind === "npc";
  if (!known) return false;
  /* The spells that can only be aimed at another player: the Lunar support
     line, and Teleother Lumbridge/Falador/Camelot and Tele Block, whose `on` is
     exactly SPELL_TARGET.PLAYER. A click that named no player is refused here
     (the caller's prompt is the player's own menu - see `playerMenuBlock`);
     one that did names a player is cast over the world server, and what
     happens then is that player's client's business - a heal is applied by the
     client being healed, a teleport is *asked* of the client being moved. */
  if (kind === "other" || spell.on === SPELL_TARGET.PLAYER) {
    if (target && target.where === "player" && target.ent) return castSpellOnPlayer(target.ent, spell);
    chat("You need another player to cast " + spell.name + " on.", "warn");
    return true;
  }
  if (kind === "npc") return false; /* cast on a creature - src/combat.js#castAt */
  /* An Enchant cast aimed at a *ring* plays the content's own ring pair - the
     `human_cast_enchantring` pose and the `enchant_ring` swirl - instead of the
     amulet's. See src/magic.js#RING_ENCHANT. */
  const enchantRing = !!ENCHANT_LEVEL[spell.id] && !!(target && target.where === "inv") &&
    (itemDef((G.ps.inv[target.index] || {}).id) || {}).slot === "ring";
  /* The level and the runes are checked here, before the spell is aimed at
     anything; the runes themselves are only spent by `payCast`, at the moment
     the effect commits (see its comment). Every `pay` below is that call. */
  if (!canCastSpell(spell)) return false;
  const pay = () => payCast(spell, enchantRing ? RING_ENCHANT.pose : null, enchantRing ? RING_ENCHANT.gfx : null,
    ENCHANT_LEVEL[spell.id] ? 2 : undefined);
  if (spell.book === "lunar") {
    if (kind === "self") return castLunarSelf(spell, pay) || true;
    if (kind === "item" && target && target.where === "inv") return castLunarItem(spell, target.index, pay);
    if (kind === "item") return targetPrompt(spell, SPELL_TARGET.INV);
    if (kind === "teleport") return castOnSelf(spell, pay);
  }
  if (kind === "teleport" || kind === "charge") return castOnSelf(spell, pay);
  if (spell.id === 22 || spell.id === 354) return castBonesTo(spell, pay);
  if (kind === "alchemy") {
    if (target && target.where === "inv") return castAlchemy(spell, target.index, pay);
    return targetPrompt(spell, SPELL_TARGET.INV);
  }
  if (kind === "superheat") {
    if (target && target.where === "inv") return castSuperheat(spell, target.index, pay);
    return targetPrompt(spell, SPELL_TARGET.INV);
  }
  if (kind === "grab") {
    if (target && target.where === "ground" && grabAimHas(spell, target.x, target.z)) return castGrab(spell, target, pay);
    return targetPrompt(spell, SPELL_TARGET.GROUND);
  }
  if (ENCHANT_LEVEL[spell.id]) {
    if (target && target.where === "inv") return castEnchant(spell, target.index, pay);
    return targetPrompt(spell, SPELL_TARGET.INV);
  }
  /* Enchant Crossbow Bolt (358): the gem bolts this world can now make
     (src/items.js#GEM_BOLTS) become their enchanted selves, ten at a time, for
     the gem's own runes. The spell is cast *as* the effective spell its target
     implies - see boltEnchantSpell - so the rune check and the payment are the
     ordinary ones. Any other item gets the spell's refusal, and the orb-charging
     spells want an elemental obelisk, which this world has no object for; both
     report what they are waiting on rather than casting silently, and without
     spending a rune on the advice. */
  if (spell.id === 358) {
    if (target && target.where === "inv") {
      const slot = G.ps.inv[target.index];
      const row = slot ? BOLT_ENCHANT[slot.id] : null;
      const eff = row ? boltEnchantSpell(spell, row, Math.min(10, slot.qty)) : spell;
      if (!canCastSpell(eff)) return true;
      return castEnchantBolt(spell, target.index, () => payCast(eff), eff);
    }
    return targetPrompt(spell, SPELL_TARGET.INV);
  }
  if (kind === "item" && spell.on === SPELL_TARGET.LOC) { chat("You can only cast this on the element's obelisk.", "warn"); return true; }
  chat("Nothing interesting happens.", "game");
  return true;
}

/* ----------------------------------------------------------------- emotes

   Performing an emote, from wherever it was asked for - the emote book's own
   button (src/ui.js#renderEmotes) or the chatbox (`::dance`, `::emote dance`).
   An emote is a local act first: it plays on this character whether or not
   there is anybody to see it, exactly as saying something does. The byte that
   tells the players standing near us (src/net.js#netEmote) is the second half,
   and it is silent when the world server is unreachable.

   Two rules of the real client live here rather than in the model:

     * **An emote interrupts what you were doing.** The client stops the action
       you were part-way through the moment an emote begins, which is what
       `cancelAction` is - and the emote is in turn ended by the next action, by
       the model's own priority (src/game.js#updateVisuals).

     * **The Skill Cape emote needs a cape.** It is the one button of the book
       that is not a fixed animation: the real client plays the emote of the
       cape of accomplishment you are wearing and refuses if you are wearing one
       without one. The book's last button therefore has no `anim` of its own
       (src/emotes.js), and this is where the worn cape is asked what to play -
       each cape of accomplishment carries its own `skillcape` skill and its own
       sequence and graphic (src/emotes.js#SKILLCAPE_EMOTES).

   That pose is also the one emote **authored with empty hands**: its graphic
   carries its own prop, so the weapon and the shield are simply not drawn while
   it plays. Nothing is unequipped and nothing is refused - the renderer asks for
   the body's worn models every frame and drops those two for the length of the
   pose (src/game.js#wornKeysFor). */
function performEmote(emote) {
  if (!emote || !G || !G.player) return false;
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  stopFollowing();
  if (!emote.anim) {
    /* the book's last button - the Skill Cape emote */
    const worn = G.ps && G.ps.equip ? G.ps.equip.cape : null;
    const def = worn ? ITEMS[worn.id] : null;
    const sc = def && def.skillcape ? skillcapeEmote(def.skillcape) : null;
    if (sc) {
      /* The pose is authored **with empty hands**: its own graphic carries the
         prop (the wand, the bow, the anvil, the conjured shield), so the weapon
         and the shield are left out of the body model for as long as it plays
         (src/game.js#wornKeysFor, re-asked every frame). Nothing is unequipped -
         the slots still hold what they held and both models come back the
         moment the pose ends. Both halves of the play are the shared helper,
         which is also what a *peer's* cape emote goes through
         (src/game.js#playCapeEmote / #ghostEmote). */
      cancelAction();
      if (G.ps) G.ps.emoteLockTicks = 3;
      playCapeEmote(G.player, sc);
      netEmote(emote.i);
      return true;
    }
    /* the refusal, in the client's own words */
    chat("You need to be wearing a skillcape in order to perform that emote.", "warn");
    return false;
  }
  cancelAction();
  if (G.ps) G.ps.emoteLockTicks = 3;
  playEmote(G.player, emote.anim);
  netEmote(emote.i);
  return true;
}

/* --------------------------------------------------------------- wiring */

export function initActions(game) {
  G = game;
  Actions.game = game;
  game.hooks.onClickTile = (tx, tz, npc, picked) => onClickTile(tx, tz, npc, picked);
  game.hooks.aimPreferScenery = (npc, obj, front) => aimPreferScenery(npc, obj, front);
  game.hooks.onClickSky = (x, y) => skyClick(x, y);
  game.hooks.onRightClickWorld = (x, y, pick) => onRightClickWorld(x, y, pick);
  game.hooks.onRightClickCancel = () => hideCtx();
  /* A minimap walk is a fresh intent like any other walk (the tile click and
     the "Walk here" row both cancel through cancelAction): a production run
     left alive would keep hammering beside the anvil - or walk the player
     back to it on the next tick - after they had plainly walked away. */
  UI.actions.minimapClick = () => { cancelAction(); };
  UI.actions.drop = (where, index, qty) => dropFromInventory(where, index, qty);
  UI.actions.dropAll = (where, index) => dropAllOfKind(where, index);
  UI.actions.itemOptions = (where, index, def, stack) => itemOptions(where, index, def, stack);
  /* The emote book's buttons (src/emotes.js, drawn by src/ui.js#renderEmotes)
     and the `::emote` command both come through here. */
  UI.actions.emote = (emote) => performEmote(emote);
  UI.actions.caystart = () => cayStart();
  /* The client's Use mode: a carried item in the hand, and the pair the next
     click makes of it (see the "use-with" section for the three rules). */
  UI.actions.useOnInv = (fromIndex, toIndex) => useOnInv(fromIndex, toIndex);
  UI.actions.grantXp = (amount, skill) => addXp(game.ps, skill, amount);
  UI.actions.smelt = (index) => smeltOreFromInv(index);
  UI.actions.castSpell = (spell, target) => castSpell(spell, target);
  UI.actions.hoverLabel = (npc, tx, tz, picked, front) => hoverLabel(npc, tx, tz, picked, front);
  UI.actions.skyHoverLabel = (x, y) => skyHoverLabel(x, y);
  /* The drops on the floor, for the minimap's red ground-item dots
     (src/ui.js#drawMinimap). The list itself, not a copy: the map redraws every
     frame and this is read-only on that side. */
  UI.actions.groundItems = () => Actions.ground;
  try { applyTutPhase(); } catch (e) {}
  /* The two seams a shop asks through (src/ui.js#buyFromShop): a row may be
     refused before the coins move, and a purchase may carry something with it.
     Both are only interesting to the cape counter today - everything else in
     the world's shops sells unguarded - so they live here beside the rules
     rather than in the shop UI. */
  UI.actions.shopBuyCheck = (stock) => skillcapeCanBuy(stock);
  UI.actions.shopBought = (stock) => skillcapeBought(stock);
  return Actions;
}

export { TREE_LOGS, ORE_ITEMS, RAW_TO_COOKED, FISH_BY_SPOT, TOOL_IDS, AXES, PICKS, LOG_ORDER, TICK };
