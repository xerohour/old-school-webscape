import { Game, isHolyFoe, playCastAnim } from "./game.js";
import { TICK_S } from "./tick.js";
import { Gfx } from "./gfx.js";
import { bodyHeight, spellById } from "./magic.js";
import { worldStrike, creatureStrike, creatureInReach, NPC_ATTACK_SPEED } from "./combat.js";
import { REGEN_BASE_SECONDS } from "./prayer.js";

/* -------------------------------------------------------------- the god's fight

   **Saradomin**, the one body in this world whose fight is not the creature AI's
   (the user's ask, 2026-09-24: *"please create an actual npc called Saradomin
   who is casting Saradomin Strike repeatedly on imps and zamorakian creatures
   that spawn around him ... his version of saradomin strike he gets a 3x damage
   multiplier against demon-class or zamorak-class monsters, and can also target
   multiple creatures at the same time with it. anything in a 3x3 area around
   him gets hit"*).

   He stands in a clearing in the north-western woods (src/world.js's grove
   table, `radius: 0` so he never wanders) and throws his own spell, on his own
   clock, at **everything within one tile of him** - a 3x3 nova centred on his
   tile. Nothing chases and nothing is chosen: the nova is the whole of his
   targeting, which is what makes the fight a *place* rather than a duel.

   Four things about him are worth stating plainly, because each one is a
   deliberate departure from the rest of the bestiary:

   1. **His strike hits a group.** Every creature in the box takes its own bolt
      and its own roll - one crack of the god's hand, several bodies. That is
      what `castStrike` below is built around, and it is why the presentation is
      one carrier projectile *per victim* rather than the single hidden carrier
      the player's own god spell flies (src/combat.js#castAt): each bolt has to
      arrive on its own body.

   2. **Demons and Zamorakians take three times as much.** `isHolyFoe`
      (src/game.js) is the classification - the demon line (imp, lesser, greater,
      black demon) and the three Zamorakians of this cache (monk of Zamorak,
      dark wizard, black knight) - and the multiplier is the user's own 3x,
      applied to each victim's roll.

   3. **He heals thirty times as fast as a player.** The natural rate is one
      hitpoint per minute (src/prayer.js#REGEN_BASE_SECONDS), so his is one
      every two seconds. It is the counterweight to a nova that can be stood in
      front of: he is not a damage race, he is a *sustained* one, and the
      creatures he is fighting cannot out-damage half a hitpoint a second.

   4. **He never touches the player** (the user's ask, 2026-09-24: *"the player
      should not be hit by saradomins attacks"*). The nova is a fight between him
      and the creatures of his glade and nothing else, so a player may stand in
      the middle of it - or play at being his executioner - without taking a
      single hitpoint of it. That is why no path in this module deals damage to
      the player at all, and why the grudge that used to put a bolt through a
      player plinking at him from spell range is gone with it: the god's answer
      to a player is simply that he has no answer, which is the whole of what
      was asked for.

   He is deliberately *not* in any of src/combat.js's creature tables - no
   `AGGRO` row, so nothing ever hands him the player as an ordinary target, and
   `NPC_MODULE_AI` (src/combat.js) keeps the ordinary creature loop off him
   entirely. Whatever dies in his glade, dies for nobody: his damage goes through
   `worldStrike` (src/combat.js), which credits no kill and grants no
   experience, while his kills' loot still falls where the body did.

   ------------------------------------------------------ the god's assailants

   Around him stands a congregation of his enemies - six imps, three monks of
   Zamorak, two dark wizards and two lesser demons (src/world.js) - planted on a
   ring six to eight tiles out so that the clearing between them and him is open
   ground to charge across. Every one of them is a **godFoe** (the flag is on
   the spawn, src/game.js#createNpc): a creature whose fight is with *him* and
   not with the player. Three things follow from that one flag, and together
   they are the whole of the creature's behaviour:

     * the player's right-click menu offers it nothing but Examine
       (src/actions.js#npcCanAttack), so it cannot be attacked at all - and a
       left click on it is not swallowed either, it walks you (src/actions.js
       #onClickTile);
     * the ordinary creature AI steps over it (src/combat.js#tickCombat's
       `godFoe` branch), so it never acquires the player and never swings at
       them;
     * `tickGodFoe` below is its whole life instead. It is handed the god as its
       target the moment it exists - "instantly aggroing towards him" is the
       user's own phrase - walks in on the ordinary pathfinder, which is the code
       that reads `npc.target` (src/game.js#updateNpcs), and strikes him when it
       is in reach. The target is re-set every tick rather than once, because the
       same tick re-targets a creature that has just respawned at its home tile,
       which is what turns the ring into a steady stream rather than a single
       charge.

   The blows they land on him are real creature blows - the same accuracy roll
   against his own defence, the same max hit, the same attack pose - dealt
   through src/combat.js#creatureStrike, which is the one path in the game where
   neither end of a blow is the player. They are also, by the numbers, almost
   nothing: his Defence is 100, so an imp connects about one blow in thirty and
   a lesser demon about one in two, and the god's own regen (point 3) covers what
   they do land. That is the intended shape of the scene: not a battle he might
   lose, but an army throwing itself at something that does not care. */

/* His cadence: five ticks, i.e. one strike every three seconds - the same
   recovery a staff-cast spell has, and the number written on his
   NPC_ATTACK_SPEED row so a reader finds the same figure in both places. */
const STRIKE_TICKS = 5;

/* The spell his strike *is*: Saradomin Strike, looked up rather than spelled out
   as loose numbers, so the graphic and its height come from the same row the
   player's own cast reads (src/magic.js's spell table). */
const STRIKE_SPELL = spellById.get(61);

/* The damage ceiling. The published Saradomin Strike hits for 20, and for 30
   while Charge is up and the caster wears Saradomin's cape - a god is always
   charged for his own spell, and 30 is the number the user's "3x" is multiplied
   against, so it is the ceiling here. Rolled 1..30 per victim, so the nova's
   sting varies the way a real cast's does. */
const MAX_HIT = 30;

/* Three times as hard on a demon or a Zamorakian (src/game.js#isHolyFoe). */
const HOLY_MULT = 3;

/* The nova: one tile in every direction, i.e. a 3x3 box centred on him. */
const NOVA = 1;

/* His healing: thirty times the natural rate - one hitpoint per two seconds
   instead of one per minute. */
const REGEN_DIVISOR = 30;

/* The one thing he does on the world tick: heal, and throw the strike when his
   cadence comes round. It runs from `initSaradomin`'s wrapper on `hooks.onTick`,
   which is chained *after* everything the game itself puts there, so by the time
   this sees the glade the tick's own work - the player's blows, the creaures'
   deaths, the respawns - is already done and this acts on the settled state.
   The god is looked up first because the assailants' pass needs him (a dead god
   is `null`, which is how they are told to give up). */
function tickSaradomin(dt) {
  if (!Game.npcs || !Game.player) return;
  let god = null;
  for (const npc of Game.npcs) {
    if (npc.type === "saradomin" && alive(npc)) { god = npc; break; }
  }
  for (const npc of Game.npcs) {
    if (npc.type === "saradomin") {
      if (alive(npc)) tickGod(npc, dt);
      continue;
    }
    if (npc.godFoe) tickGodFoe(npc, dt, god);
  }
}

/* A body that is up and on the field. The same test every path here makes -
   a corpse is skipped until its spawn timer brings it back
   (src/game.js#updateNpcs). */
function alive(npc) {
  return !!npc && !npc.dead && !npc.corpse && npc.hp > 0;
}

function tickGod(npc, dt) {
  const g = Game;
  /* --- the healing -------------------------------------------------------
     An accumulator rather than a fraction of a hitpoint per tick: 0.6 s ticks
     do not divide two seconds, so a per-tick share would drift a whole tick
     wide. The accumulator also means a god at full health banks nothing -
     the guard stops the moment he is whole, and the leftover is capped so he
     can never come out of a quiet minute with a dozen hitpoints in the bank. */
  const interval = REGEN_BASE_SECONDS / REGEN_DIVISOR;
  npc.healAcc = Math.min((npc.healAcc || 0) + dt, interval);
  if (npc.hp < npc.stats.hp && npc.healAcc >= interval) {
    npc.healAcc -= interval;
    npc.hp += 1;
  }

  /* --- the cadence ------------------------------------------------------- */
  npc.strikeCd = (npc.strikeCd || 0) - dt;
  if (npc.strikeCd > 0) return;

  const cx = Math.floor(npc.x);
  const cz = Math.floor(npc.z);
  const cheb = (x, z) => Math.max(Math.abs(x - cx), Math.abs(z - cz));

  /* Everything standing on the ground he covers. His own tile is the centre of
     the box, and a victim's own tile is what is measured - a big demon is hit
     when any part of its *anchor* is in the box, which in practice means
     standing astride it, exactly like everything else the box catches. The
     player is not in `Game.npcs` at all, which is half of why point 4 above is
     free: the loop below cannot reach them even by accident. */
  const victims = [];
  for (const e of g.npcs) {
    if (e === npc || e.dead || e.corpse) continue;
    if (cheb(Math.floor(e.x), Math.floor(e.z)) > NOVA) continue;
    victims.push(e);
  }
  if (!victims.length) return;

  /* He turns to face what he is smiting: the nearest victim. Purely for the
     look of it - the cast pose is played on the spot either way. */
  let faceX = null, faceZ = null;
  let best = Infinity;
  for (const v of victims) {
    const d = cheb(Math.floor(v.x), Math.floor(v.z));
    if (d < best) { best = d; faceX = v.x; faceZ = v.z; }
  }
  npc.dir = Math.atan2(faceX - npc.x, faceZ - npc.z);

  castStrike(npc, victims);
}

/* One crack of the god's hand. The pose goes up, and every victim in the box
   gets a bolt of its own: a hidden carrier projectile flown from the caster to
   that body on the god-spell release beat (src/magic.js#GOD_END_DELAY_CYCLES),
   which lands the burst *and* the damage on the frame the casting pose lets the
   strike go - the same two-beat presentation the player's own god spell has, per
   victim rather than once (see the header). A body that has died or walked out
   of the world before its bolt arrives takes nothing, which is what a missile
   that homes should do. */
function castStrike(npc, victims) {
  playCastAnim(npc, "cast_god");
  npc.strikeCd = STRIKE_TICKS * TICK_S;
  for (const v of victims) fireBolt(npc, v, () => worldStrike(v, rollStrike(v.type)));
}

/* One victim's damage: 1..30, times three for anything on his list
   (src/game.js#isHolyFoe). */
function rollStrike(type) {
  const dmg = 1 + Math.floor(Math.random() * MAX_HIT);
  return isHolyFoe(type) ? dmg * HOLY_MULT : dmg;
}

/* Fly one bolt at `target` and call `apply` where it lands. `hidden: true` means
   the carrier itself is never drawn - a god spell has no travelling graphic in
   the cache, only a `spotanim_target` - so what the eye sees is the strike
   falling out of the sky on the release beat, on the body it was aimed at. */
function fireBolt(npc, target, apply) {
  const fromX = npc.rx != null ? npc.rx : npc.x;
  const fromZ = npc.rz != null ? npc.rz : npc.z;
  const tx = target.x, tz = target.z;
  Gfx.projectile({
    gfx: STRIKE_SPELL.end,
    fromX, fromZ, fromH: 0,
    target, toX: tx, toZ: tz, toH: 0,
    delay: STRIKE_SPELL.endDelay,
    duration: 0.05,
    hidden: true,
    onArrive: (at) => {
      if (target.dead || target.corpse) return;
      const x = at && at.x != null ? at.x : tx;
      const z = at && at.z != null ? at.z : tz;
      Gfx.play(STRIKE_SPELL.end, {
        x, z,
        height: bodyHeight(STRIKE_SPELL.endH, target),
        dir: npc.dir || 0,
        scale: 0.8,
        target,
      });
      apply();
    },
  });
}

/* One of the god's assailants, on its own tick: hand it the god, and let it
   swing when it has walked in close enough. The target is (re)written every
   tick rather than once at the spawn, because a creature that has just been
   killed and respawned is a *new* decision - and because the ordinary AI's
   aggression block, which is what a creature usually gets its target from, has
   been told to leave these alone (src/combat.js#tickCombat). Nothing here can
   target the player: the god is the only name this function knows. */
function tickGodFoe(npc, dt, god) {
  if (npc.dead || npc.corpse || npc.hp <= 0) return;
  if (!god) {
    npc.target = null;
    npc.aggroed = null;
    return;
  }
  npc.target = god;
  npc.aggroed = god;
  /* The cooldown runs down whether or not it is in reach, so a creature that
     has just closed the distance swings on the tick it arrives rather than
     waiting out a recovery it never started. It is measured in seconds off the
     same tick clock as everything else here, from the creature's own published
     attack speed (src/combat.js#NPC_ATTACK_SPEED, in game ticks). */
  npc.foeCd = (npc.foeCd || 0) - dt;
  if (npc.foeCd > 0) return;
  if (!creatureInReach(npc, god)) return;
  npc.foeCd = (NPC_ATTACK_SPEED[npc.type] || 4) * TICK_S;
  creatureStrike(npc, god);
}

/* Wired from src/main.js beside the world's other clocks. It chains the tick
   hook rather than replacing it, the way the creature census does - everything
   already on the hook runs first, so the god acts on the tick's settled state
   rather than on a half-applied one. */
export function initSaradomin(game) {
  const prev = game.hooks.onTick;
  game.hooks.onTick = (dt) => {
    if (prev) prev(dt);
    tickSaradomin(dt);
  };
}
