import { ITEMS, itemDef, isStackable, itemWeight, EQUIP_SLOTS, emptyBonus, MAX_STACK } from "./items.js";
import { createSkills, levelOf, addXp, SKILLS } from "./skills.js";
import { xpForLevel, MAX_LEVEL } from "./util.js";
import { RUN_UNITS } from "./run.js";
import { activePrayers } from "./prayer.js";
import { allQuestsDone } from "./quests.js";

export const INV_SIZE = 28;
export const BANK_SIZE = 400;

/* The revision of the starting kit. It is stamped on the character (`ps.kit`)
   and it rides the save, which is what makes the grant once per *character*
   rather than once per load: a character saved before the kit existed is given
   it the next time it is loaded, and never a second time after that. Bump the
   number if the kit ever changes in a way existing characters should share. */
export const STARTER_KIT_VERSION = 2;

/* ------------------------------------------------- the character's name

   What a character may be called lives here, once, because three different
   places have to agree on it: the name step in front of the world asks for one
   (src/charname.js), `::name` renames with it (src/ui.js#command), and a save is
   checked against it on the way in (src/save.js#applyState) rather than
   trusting whatever is written in the browser's storage.

   The rule is the account RPCs' own (index.html, `clean(username, 12)`: three
   to twelve of letters, digits and underscores). Using the *account* rule for
   the character's name and not a looser one is the point: the name chosen when
   the character is made is the name it can be registered under later, so "log in
   to save your character" is a promise the name is able to keep. It also keeps
   the name printable ASCII, which is what the world server's join packet carries
   (src/net.js#sendJoin) and what an interface widget can draw without worrying
   about a glyph the font has not got. */

export const NAME_MIN = 3;
export const NAME_MAX = 12;

/* null when `name` is a name this build can use, else the line to show the
   player saying why not. */
export function nameError(name) {
  const s = String(name == null ? "" : name).trim();
  if (s.length < NAME_MIN) return "A name needs at least " + NAME_MIN + " characters.";
  if (s.length > NAME_MAX) return "A name can be at most " + NAME_MAX + " characters.";
  if (!/^[A-Za-z0-9_]+$/.test(s)) return "A name can only use letters, digits and underscores.";
  return null;
}

/* ------------------------------------------------------ reading main.pjs

   The starting build and the starting kit are the world's own configuration
   (main.pjs, "a new character"), so they are read off `root` rather than
   duplicated here. Everything is optional and every value falls back to what
   main.pjs ships with, so a hand-edited config can never stop the game booting:
   the worst a missing line can do is give a new character the default. */
function cfgNum(name, fallback) {
  const store = typeof root !== "undefined" ? root : null;
  const v = store ? store[name] : null;
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

/* A main.pjs array literal (`startKit = [["a", "b"]]` - the outer brackets say
   "this is JavaScript", so the value really is an array of strings). `null` if
   the line is missing, which is different from an empty kit on purpose. */
function cfgIds(name) {
  const store = typeof root !== "undefined" ? root : null;
  const v = store ? store[name] : null;
  if (!Array.isArray(v)) return null;
  return v.filter((id) => typeof id === "string" && id.length > 0);
}

/* Where each skill starts. The seven combat skills are named one by one and
   every other skill takes `startOtherSkills`, which is the live game's own split
   of the skill tab - a new character can fish, smith and cut logs on the day it
   is made, and fights like the build main.pjs describes. */
function applyStartLevels(skills) {
  const named = {
    attack: cfgNum("startAttack", 99),
    strength: cfgNum("startStrength", 99),
    defence: cfgNum("startDefence", 99),
    hitpoints: cfgNum("startHitpoints", 99),
    ranged: cfgNum("startRanged", 99),
    magic: cfgNum("startMagic", 99),
  };
  const other = cfgNum("startOtherSkills", 99);
  for (const id of Object.keys(skills)) {
    const want = named[id] == null ? other : named[id];
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(want)));
    skills[id].level = level;
    skills[id].xp = xpForLevel(level);
  }
}

/* How many of a carried thing a new character gets. Anything not named here is
   one: tools, a bow, a staff and a crossbow are singular, while ammunition,
   runes and a purse of coins come in stacks. The food is a deliberate handful
   rather than a full pack - a shark does not stack, so twenty of them would
   leave a new character no room to pick anything up (and the bank is on the
   spawn's own doorstep). */
const START_QTY = {
  rune_arrow: 250,
  bolt_rack: 250,
  shark: 8,
  air_rune: 1000,
  fire_rune: 1000,
  death_rune: 500,
  super_attack_3: 1,
  super_strength_3: 1,
};

/* One piece of the kit. It goes into the pack first and is equipped from there
   through the ordinary rule (`equipFromInv`), so a piece the character has not
   got the levels for is simply carried instead of being lost - which matters
   here, because a 1 Defence build cannot wear most of the world's armour and
   src/player.js#canEquip is the only thing that should decide that. Whatever
   will not fit in the pack goes to the bank rather than on the floor. */
function giveStarterItem(player, id, qty, equip) {
  if (!itemDef(id) || qty <= 0) return;
  const added = invAdd(player, id, qty);
  if (qty - added > 0) bankAdd(player, id, qty - added);
  if (!equip || added <= 0) return;
  const i = player.inv.findIndex((s) => s && s.id === id);
  if (i >= 0) equipFromInv(player, i);
}

/* The whole kit: worn pieces, carried pieces and the purse. */
export function grantStarterKit(player) {
  for (const id of cfgIds("startKit") || []) giveStarterItem(player, id, 1, true);
  for (const id of cfgIds("startCarried") || []) giveStarterItem(player, id, START_QTY[id] || 1, false);
  giveStarterItem(player, "coins", cfgNum("startCoins", 100000), false);
  player.kit = STARTER_KIT_VERSION;
  return true;
}

export function createPlayerState(name) {
  const skills = createSkills();
  applyStartLevels(skills);
  const p = {
    name: name || "Player",
    /* Has the character been through the name step (src/charname.js)? A new
       character is named after the *generator* to begin with - the boot hands
       `createPlayerState` `window.generatorName` (src/game.js), which is a
       placeholder rather than a name - and this flag is what says a name was
       actually chosen (or that an account gave one, src/net.js). It rides the
       save, so a character keeps the flag across a reload. */
    named: false,
    skills,
    hp: skills.hitpoints.level,
    maxHp: skills.hitpoints.level,
    inv: new Array(INV_SIZE).fill(null),
    equip: {},
    bank: new Array(BANK_SIZE).fill(null),
    bankSwap: 0,
    bankNote: 0,
    styleIndex: 0,
    /* The spell a staff's two "Spell" styles repeat (see src/combat.js). It is
       separate from src/ui.js#UI.spell, which is the one-off manual pick. */
    autocast: null,
    /* Each staff's own remembered autocast spell, by wielded staff item id
       (the user's rule, 2026-10-09): swapping staves never asks twice, and a
       one-off pick never overwrites it. `autocast` above stays the effective
       spell the engine reads - it is synced from this map on every equip. */
    staffSpells: {},
    prodAutocast: null,
    prayerPoints: skills.prayer.level,    maxPrayer: skills.prayer.level,
    prayers: [],
    /* `prayers` is the applied set and it changes the instant a prayer is
       clicked (src/prayer.js#togglePrayer) - there is no "asked for" copy
       behind it. What is tick-locked is the drain: `prayerDrainCounter` is the
       engine's per-tick clock (a point goes every time it reaches the wearer's
       resistance) and `prayerOnThisTick` is the list of names switched on since
       the last check, which get that tick free - the flick. Both live entirely
       inside a tick, so neither is saved. */
    prayerOnThisTick: [],
    prayerDrainCounter: 0,
    /* The quick-prayer set: the prayers the prayer orb switches on and off
       together (src/prayer.js#toggleQuick). It is part of the account, like
       `prayers` and the spellbook, so a reload does not lose a selection the
       player made. */
    quickPrayers: [],
    /* Seconds owed toward the next natural hitpoint. The interval it is
       compared against is 60s, halved by Rapid Heal and by the regen bracelet
       (src/prayer.js#hpRegenInterval); it is deliberately not saved, so a
       reload starts the countdown fresh. */
    hpRegen: 0,
    /* Pieces of leather sewn since the last thread was used up: the client
       charges a thread on every fifth piece (src/items.js#CRAFT_RECIPES), which
       needs a running count, and this is it - a 0..4 remainder that crosses the
       save like any other number on the player. */
    threadUnits: 0,
    runEnergy: RUN_UNITS,
    runEnabled: false,
    running: false,
    /* The special-attack bar, 0..100. It is the *player's*, not the weapon's -
       changing weapons never changes how much is left (the live game's own
       rule) - and `specRegen` is the seconds owed toward the next 10%, since the
       bar refills at 10% every 30s (see src/combat.js#SPECIAL_REGEN_SECONDS). */
    specEnergy: 100,
    specRegen: 0,
    xpDrops: [],
    levelUps: [],
    /* Ticks left on a Charge spell; god spells hit ten higher while it runs. */
    chargeTicks: 0,
    /* The Lunar buffs that are not the save's business: Vengeance and its
       half-minute cooldown, the Dream sleep, the Magic Imbue window, and the
       Spellbook Swap's pair of book ids (src/actions.js#castLunarSelf). All of
       them are session-only - a logout ends them, which is why none of them
       appears in src/save.js's field list. */
    vengeance: false,
    vengeanceCd: 0,
    dream: false,
    imbueTicks: 0,
    swapFrom: null,
    swapTo: null,
    /* How long Tele Block is holding this player's teleports down, in ticks.
       Set only by another player's cast landing here (src/actions.js#teleblocked)
       and refused on only by this player's own teleport (src/actions.js#castOnSelf).
       Session-only like the rest of this block, but it is *not* cleared by dying:
       the live spell's five minutes run on either side of that. */
    /* Thieving (src/PLAN.md unit Q). `stunTicks` is the published nine-tick
       freeze a failed pickpocket puts on the player's feet (they cannot move
       while it runs - src/game.js#stepSim); `pickpocketCd` is the published
       eight-tick lock-out on the act itself, which is shorter, so a stun that
       has just worn off its careful half is still a moment before the next
       hand goes out. Both count down on the 600ms tick. */
    stunTicks: 0,
    pickpocketCd: 0,
    teleblockTicks: 0,
    /* The food cooldown ("eat delay"). Standard food is 3 ticks, the first
       slice of a pizza or apple pie 1, a half 2 - src/items.js#FOOD_BITES. A
       potion shares the same clock (src/ui.js#doDrink). */
    eatCd: 0,
    /* Herblore's two status effects, both in SECONDS and both ticked by
       src/combat.js#tickCombat.

       `poison` is the live poison, or null: `{ dmg, hits }`, where `dmg` is what
       the next hitsplat deals and `hits` counts the hits taken at that value.
       The published rule is one hit every 30 ticks (18 seconds), with the
       damage falling by one for every five hits (src/combat.js#poisonTick).

       `poisonImmune` and `antifire` are the antidote's and the antifire
       potion's own timers; drinking a weaker antidote never shortens a stronger
       one (see src/ui.js#doDrink). */
    poison: null,
    poisonImmune: 0,
    antifire: 0,
    /* set once when the antifire's last 15 seconds begin, so the warning line
       is printed once and not on every tick of the last quarter-minute */
    antifireWarned: false,
    stats: { kills: 0, deaths: 0, gpEarned: 0, questPoints: 0 },
    /* The quest log's own state (src/quests.js): where the player is in each
       quest, and how many balls of wool Fred has taken off them so far. The
       two ride the ordinary save, and the accessors in src/quests.js are the
       only code that reads or writes them. */
    quests: { sheep_shearer: 0, sheep_shearer_wool: 0 },
    /* The revision of the starting kit this character has been given (see
       STARTER_KIT_VERSION above). 0 means "never"; every save writes it. */
    kit: 0,
    tutHatTaken: false,
    /* Tutorial island stage (user ask 2026-10-30, the rope-and-coconut
       beginning): 0 waking/hat, 1 rope quest from Scully, 2 rope in hand,
       3 coconuts knocked down, 4 cache known, 5 knife in hand, 6 first
       drink. Advances only forward; the save carries it, localStorage
       mirrors it the way tutHatTaken does. */
    tutStage: 0,
  };
  for (const s of EQUIP_SLOTS) p.equip[s] = null;
  grantStarterKit(p);
  return p;
}

/* Bank notes. A stack can carry `note: true`, the game's "withdraw as note"
   form of an item. A note is an item in its own right: it always stacks, and
   it never matches the plain item, so a noted stack can't be eaten, equipped
   or used as a skill input by accident - the same rule the real game has. */
export function sameStack(s, id, note) {
  return !!s && s.id === id && !!s.note === !!note;
}

export function invCount(player, id, note = false) {
  let n = 0;
  for (const s of player.inv) if (sameStack(s, id, note)) n += s.qty;
  return n;
}

/* Tutorial stage accessors (single source; actions.js and dialogue.js both
   read through these, so neither module needs the other's import). The save
   carries the number, localStorage mirrors it. */
export function tutStageOf(ps) {
  if (ps && (ps.tutStage | 0) > 0) return ps.tutStage | 0;
  try {
    const v = parseInt(localStorage.getItem("osw:tutStage"), 10);
    if (v > 0) {
      if (ps) ps.tutStage = v;
      return v;
    }
  } catch (e) {}
  return 0;
}

export function setTutStage(ps, n) {
  n = Math.max(tutStageOf(ps), n | 0);
  if (ps) ps.tutStage = n;
  try {
    localStorage.setItem("osw:tutStage", String(n));
  } catch (e) {}
}

export function invFree(player) {
  let n = 0;
  for (const s of player.inv) if (!s) n++;
  return n;
}

export function invAdd(player, id, qty = 1, note = false) {
  const def = itemDef(id);
  if (!def || qty <= 0) return 0;
  let left = qty;
  if (isStackable(id) || note) {
    let merged = false;
    for (let i = 0; i < player.inv.length && left > 0; i++) {
      const s = player.inv[i];
      if (!sameStack(s, id, note)) continue;
      merged = true;
      /* A stack tops out at the client's 32-bit ceiling. Coins already at the
         ceiling are not joined by a second pile of coins - the pack holds one
         stack per kind - so the surplus stays in `left` and the caller decides
         where it goes (::give sends it to the bank, the real game drops it). */
      const add = Math.min(Math.max(0, MAX_STACK - s.qty), left);
      s.qty += add;
      left -= add;
    }
    if (!merged && left > 0) {
      const i = player.inv.indexOf(null);
      if (i === -1) return qty - left;
      const add = Math.min(MAX_STACK, left);
      player.inv[i] = { id, qty: add };
      if (note) player.inv[i].note = true;
      left -= add;
    }
  } else {
    while (left > 0) {
      const i = player.inv.indexOf(null);
      if (i === -1) break;
      player.inv[i] = { id, qty: 1 };
      left--;
    }
  }
  return qty - left;
}

export function invRemove(player, id, qty = 1, note = false) {
  let left = qty;
  for (let i = 0; i < player.inv.length && left > 0; i++) {
    const s = player.inv[i];
    if (!sameStack(s, id, note)) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take;
    left -= take;
    if (s.qty <= 0) player.inv[i] = null;
  }
  return qty - left;
}

export function invRemoveAt(player, index, qty) {
  const s = player.inv[index];
  if (!s) return null;
  const take = Math.min(s.qty, qty || s.qty);
  s.qty -= take;
  const removed = { id: s.id, qty: take };
  if (s.note) removed.note = true;
  if (s.qty <= 0) player.inv[index] = null;
  return removed;
}

export function invHas(player, id, qty = 1) {
  return invCount(player, id) >= qty;
}

export function invHasAll(player, list) {
  const need = {};
  for (const id of list) need[id] = (need[id] || 0) + 1;
  for (const id of Object.keys(need)) if (invCount(player, id) < need[id]) return false;
  return true;
}

/* ------------------------------------------------------ items kept on death

   The one rule that decides what survives a death, written once because two
   callers read it and they must not drift apart: `combat.js#playerDeath`
   *spends* the answer and drops the rest, and the equipment tab's "Items Kept
   on Death" window (interface 102, src/ui.js#renderItemsKept) *shows* it before
   you ever die. A save's own bank is not part of it - banked items are never
   lost, which is the client's rule and this world's too.

   The published rule, and the whole of it: you keep the **three most valuable
   items you are carrying** - worn kit and pack alike, with a stack counting as
   its own value times its size - and the **Protect Item prayer keeps one
   more**. Everything left over is what falls where you die. `entries` is the
   whole carrying sorted by worth, so a caller that wants to show the ranking
   (the window shows the two halves) has it, and `keepCount` is the number the
   prayer moved. */
export function keptOnDeath(player) {
  const entries = [];
  for (let i = 0; i < player.inv.length; i++) {
    const s = player.inv[i];
    if (s) entries.push({ id: s.id, qty: s.qty, value: (ITEMS[s.id] || { value: 1 }).value * s.qty, slot: i, kind: "inv" });
  }
  for (const [slot, s] of Object.entries(player.equip)) {
    if (!s) continue;
    const qty = s.qty || 1;
    /* a loaded stack counts as its own value times its size, exactly as a pack
       stack does - the rule is about what is worth keeping, not where it sits */
    entries.push({ id: s.id, qty, value: (ITEMS[s.id] || { value: 1 }).value * qty, eq: slot, kind: "equip" });
  }
  entries.sort((a, b) => b.value - a.value);
  const keepCount = activePrayers(player).some((x) => x.protectItem) ? 4 : 3;
  return { entries, keep: entries.slice(0, keepCount), lost: entries.slice(keepCount), keepCount };
}

/* --------------------------------------------------------- worn-item helpers

   Three small reads the jewellery's own mechanics need, kept here rather than
   in combat.js or actions.js because both of those need them and combat.js
   already imports actions.js - a module may only depend one way round.

   `equippedId` answers "what is in this slot", `equipStack` hands back the
   equipped stack itself (which is where a ring keeps its charges, beside the
   id, so a charge count survives a save), and `useRingCharge` spends one. */

export function equippedId(player, slot) {
  const s = player && player.equip ? player.equip[slot] : null;
  return s ? s.id : null;
}

export function equipStack(player, slot) {
  return (player && player.equip ? player.equip[slot] : null) || null;
}

/* Spends one charge of the ring in `slot`. Returns `{ spent, left, crumbled }`
   - `crumbled` is the item id when that was the ring's last charge, which is
   what the live game does to a recoil or forging ring ("the ring crumbles to
   dust"), and the caller says so in the chatbox. A ring with no charge count of
   its own (a `charges` of 0 or absent) cannot be spent. */
export function useRingCharge(player, slot = "ring") {
  const st = equipStack(player, slot);
  if (!st) return { spent: false };
  const def = itemDef(st.id);
  if (!def || !def.charges) return { spent: false };
  if (st.charges == null) st.charges = def.charges;
  st.charges -= 1;
  if (st.charges <= 0) {
    player.equip[slot] = null;
    return { spent: true, left: 0, crumbled: st.id };
  }
  return { spent: true, left: st.charges, crumbled: null };
}

export function totalBonus(player) {
  const b = emptyBonus();
  for (const slot of EQUIP_SLOTS) {
    const s = player.equip[slot];
    if (!s) continue;
    const def = itemDef(s.id);
    if (!def) continue;
    for (const k of Object.keys(b)) b[k] += def.bonus[k] || 0;
  }
  return b;
}

/* The equipped weapon's definition. `player` may be the player's own entity —
   which keeps its state on `.ps` — as well as the state itself, because the
   casting code reaches for the weapon from whichever side it is holding. */
export function weaponOf(player) {
  const p = player && player.ps ? player.ps : player;
  const s = p && p.equip ? p.equip.weapon : null;
  return s ? itemDef(s.id) : null;
}

export function attackSpeed(player) {
  const w = weaponOf(player);
  if (!w) return 4;
  return w.speed || 4;
}

export function canEquip(player, id) {
  const def = itemDef(id);
  if (!def || !def.slot) return { ok: false, why: "You can't equip that." };
  if (def.req) {
    for (const [skill, lvl] of Object.entries(def.req)) {
      if (levelOf(player.skills, skill) < lvl) {
        return { ok: false, why: "You need level " + lvl + " " + skillLabel(skill) + " to equip this." };
      }
    }
  }
  if (def.reqQuests && !questsFinished(player)) {
    return { ok: false, why: "You need to have completed every quest to equip this." };
  }
  /* The Max cape's gate (src/items.js's `reqMax`, the same flag the counter
     reads in src/actions.js#skillcapeCanBuy): 99 in all 23 skills at once. */
  if (def.reqMax) {
    const sk = (player && player.ps ? player.ps : player).skills;
    for (const s of SKILLS) {
      if (levelOf(sk, s.id) < 99) {
        return { ok: false, why: "You need level 99 in every skill to equip this." };
      }
    }
  }
  return { ok: true };
}

/* The quest gate, in the one place an item can reach it (src/items.js's
   `reqQuests`; the shop's own counter asks the same question of the same
   function - src/actions.js#skillcapeCanBuy). `player` may be the state itself
   or the entity that carries it, like everything else here. */
export function questsFinished(player) {
  const p = player && player.ps ? player.ps : player;
  return allQuestsDone(p);
}

function skillLabel(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function equipFromInv(player, index) {
  const s = player.inv[index];
  if (!s) return { ok: false };
  const def = itemDef(s.id);
  if (!def || !def.slot) return { ok: false, why: "You can't equip that." };
  const chk = canEquip(player, s.id);
  if (!chk.ok) return chk;
  /* A two-handed weapon is holding both hands, so it and a shield can never be
     worn at once - but **which one gives way depends on which one you just
     clicked**, and either direction is a stow rather than a refusal. Equipping
     a two-hander over a shield puts the shield back in the pack (below);
     equipping a shield over a two-hander puts the weapon back, so the hand is
     free for it. The second direction used to be a flat refusal ("You can't
     equip a shield while wielding a two-handed weapon."), which is the user's
     ruling of 2026-09-26: "...it needs to realize that you have the 2handed
     weapon on ... and it needs to unequip them and actually equip/wear the
     shield or otherwise offhand piece." It is the USER's rule, not the live
     client's - the client refuses - so do not "correct" it back; see SPEC.md. */
  const held = player.equip.weapon && itemDef(player.equip.weapon.id);
  if (def.slot === "shield" && held && held.two) {
    const weapon = player.equip.weapon;
    /* Still ONE move, so it may only ask for the room it actually needs: the
       weapon swaps into the very slot the shield is leaving whenever that stack
       is down to its last item, and a stackable weapon (the thrown mystic cards
       are the one kind of two-hander that is) may merge into its own pile
       instead. Only a weapon that can do neither wants a genuinely free slot. */
    const vacates = s.qty <= 1;
    const merges = isStackable(weapon.id) && invCount(player, weapon.id) > 0;
    if (!vacates && !merges && invFree(player) < 1) return { ok: false, why: "You need a free inventory slot." };
    s.qty--;
    const shieldLast = s.qty <= 0;
    player.equip.weapon = null;
    if (shieldLast) player.inv[index] = { id: weapon.id, qty: weapon.qty || 1 };
    else invAdd(player, weapon.id, weapon.qty || 1);
    player.equip[def.slot] = { id: s.id, qty: 1 };
    return { ok: true, equipped: s.id, slot: def.slot };
  }
  let parkShield = null;
  if (def.two && player.equip.shield) {
    const sh = player.equip.shield;
    if (player.equip.weapon || s.qty > 1) {
      if (invFree(player) < 1) return { ok: false, why: "You need a free inventory slot." };
      player.equip.shield = null;
      invAdd(player, sh.id, sh.qty || 1);
    } else {
      /* Only the shield is worn and the clicked stack is down to its last item,
         so the shield swaps into the clicked slot below and no free slot is
         wanted at all. */
      player.equip.shield = null;
      parkShield = sh;
    }
  }
  /* Ammunition is a **stack**, and its slot takes the whole stack - the live
     game's own behaviour: clicking a pack of 500 arrows wields all 500, and a
     second load of the same kind merges into it. The generic path below takes
     ONE off the stack and puts a one-arrow "stack" in the slot, which is not how
     a quiver works. A different kind already loaded goes back to the pack first
     (which is why that direction needs a free slot; merging into the same kind
     does not). */
  if (def.slot === "ammo") {
    const loaded = player.equip.ammo;
    /* A swap, so the clicked slot always vacates and no free slot is ever
       wanted: a different kind already loaded swaps into the clicked slot. */
    player.inv[index] = null;
    if (loaded && loaded.id === s.id) {
      const moved = Math.min(MAX_STACK - loaded.qty, s.qty);
      loaded.qty += moved;
      if (moved < s.qty) player.inv[index] = { id: s.id, qty: s.qty - moved };
      return { ok: true, equipped: s.id, slot: "ammo", qty: loaded.qty };
    }
    if (loaded) player.inv[index] = { id: loaded.id, qty: loaded.qty };
    player.equip.ammo = { id: s.id, qty: s.qty };
    return { ok: true, equipped: s.id, slot: "ammo", qty: s.qty };
  }
  /* A **thrown** weapon is the one thing that stacks in the *weapon* slot: a
     dart, a knife, a throwing axe and a javelin are wielded as their whole pile,
     exactly as arrows are loaded as their whole quiver, and one comes off that
     pile per throw (src/combat.js#thrownStack). The generic path below would
     take a single dart off the stack and put a one-dart "stack" in the hand,
     which is the one thing a thrown weapon must not do - the item page's own
     "can be thrown... up to 20 (stackable)" is what the pile is for. A second
     pile of the same kind tops up the wielded one (up to the same ceiling the
     pack uses), and a different kind goes back to the pack first, which is why
     that direction needs a free slot and merging does not. */
  if (def.kind === "thrown") {
    const loaded = player.equip.weapon;
    /* A swap, like ammunition: the clicked slot always vacates, so no free
       slot is ever wanted and a different kind swaps into the clicked slot. */
    player.inv[index] = null;
    if (loaded && loaded.id === s.id) {
      const moved = Math.min(MAX_STACK - loaded.qty, s.qty);
      loaded.qty += moved;
      if (moved < s.qty) player.inv[index] = { id: s.id, qty: s.qty - moved };
      return { ok: true, equipped: s.id, slot: "weapon", qty: loaded.qty };
    }
    if (loaded) player.inv[index] = { id: loaded.id, qty: loaded.qty };
    player.equip.weapon = { id: s.id, qty: s.qty };
    return { ok: true, equipped: s.id, slot: "weapon", qty: s.qty };
  }
  const prev = player.equip[def.slot];
  /* A swap is ONE move, not two, so it may only ask for the room it actually
     needs. The piece coming off goes into the very slot the piece going on has
     just left whenever that stack is down to its last item - so changing a cape
     in a full pack needs no free slot at all. It used to demand one anyway
     (`invFree(player) < 1`), which is the user's report of 2026-09-24: "you
     dont need a free inventory slot to change from one skillcape to another".
     A slot is genuinely wanted in two cases: the incoming stack is left behind
     in its own slot (it is stacked, and more than one is held), or the outgoing
     piece cannot merge back into a stack of its own kind - the same `merges`
     question `unequip` asks for the same reason. */
  if (prev) {
    const vacates = s.qty <= 1;
    const merges = prev.id === s.id || (isStackable(prev.id) && invCount(player, prev.id) > 0);
    if (!vacates && !merges && invFree(player) < 1) {
      return { ok: false, why: "You need a free inventory slot." };
    }
  }
  s.qty--;
  const wasLast = s.qty <= 0;
  /* The piece coming off swaps into the very slot the piece going on was
     clicked from - parkShield and prev are mutually exclusive (the park only
     happens with an empty weapon hand), so at most one of them is set. */
  const displaced = parkShield || prev;
  if (wasLast) player.inv[index] = displaced ? { id: displaced.id, qty: displaced.qty || 1 } : null;
  else if (displaced) invAdd(player, displaced.id, displaced.qty || 1);
  player.equip[def.slot] = { id: s.id, qty: 1 };
  return { ok: true, equipped: s.id, slot: def.slot };
}

export function unequip(player, slot) {
  const s = player.equip[slot];
  if (!s) return { ok: false };
  /* Everything but ammunition holds one, so it needs a free slot outright. An
     ammunition stack comes back whole (a 500-arrow load is 500 arrows again, not
     one), and it needs a free slot only when the pack has no stack of that kind
     to top up - `invAdd` merges what it can. */
  const def = itemDef(s.id);
  const merges = !!(def && def.stack && invCount(player, s.id) > 0);
  if (!merges && invFree(player) < 1) return { ok: false, why: "You need a free inventory slot." };
  player.equip[slot] = null;
  invAdd(player, s.id, s.qty || 1);
  return { ok: true, id: s.id, slot, qty: s.qty || 1 };
}

/* The bank stacks everything: an item that will not stack in your pack still
   shares a single bank slot with its kind, which is how the real bank works. */
export function bankAdd(player, id, qty = 1) {
  /* The bank keeps one slot per kind - that is what makes it a bank - so a
     kind already in there tops up its own slot, and that slot stops at the
     same 32-bit ceiling as the pack, handing the surplus back to the caller. */
  let left = qty;
  for (let i = 0; i < player.bank.length; i++) {
    const s = player.bank[i];
    if (!s || s.id !== id) continue;
    const add = Math.min(Math.max(0, MAX_STACK - s.qty), left);
    s.qty += add;
    left -= add;
    return qty - left;
  }
  if (left > 0) {
    const i = player.bank.indexOf(null);
    if (i === -1) return 0;
    const add = Math.min(MAX_STACK, left);
    player.bank[i] = { id, qty: add };
    left -= add;
  }
  return qty - left;
}

export function bankRemove(player, id, qty = 1) {
  let left = qty;
  for (let i = 0; i < player.bank.length && left > 0; i++) {
    const s = player.bank[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take;
    left -= take;
    if (s.qty <= 0) player.bank[i] = null;
  }
  return qty - left;
}

export function bankCount(player, id) {
  let n = 0;
  for (const s of player.bank) if (s && s.id === id) n += s.qty;
  return n;
}

export function bankUsed(player) {
  let n = 0;
  for (const s of player.bank) if (s) n++;
  return n;
}

/* Closing the bank squeezes out the empty slots withdrawals leave behind, so
   everything consolidates toward the top-left in the order it is already in -
   the client's own answer without placeholders (a withdrawn stack leaves no
   hole; with the placeholder feature off, the bank closes up behind it). A
   zero-quantity ghost counts as empty too, so a past partial withdraw can never
   leave a dead slot behind. The array keeps its length - only the order of the
   entries changes - so saves and the 400-slot widget are untouched. */
export function bankCompact(player) {
  const b = player.bank;
  let w = 0;
  for (let r = 0; r < b.length; r++) {
    const s = b[r];
    if (!s || !(s.qty > 0)) { b[r] = null; continue; }
    if (w !== r) { b[w] = s; b[r] = null; }
    w++;
  }
}

/* Rearranging the pack. The live game has no such gesture - a stack keeps the
   slot it arrived in, and the pack's order is the order things were picked up
   - but a carried stack is a *position* as much as it is a thing, and this
   world lets the positions be rearranged: dragging one stack onto another
   exchanges the two slots, exactly what the bank's Swap mode does to the same
   two entries (see bankMove below). Nothing else about the stack changes: the
   id, the count and the note flag all travel with it, and the two slots' own
   contents are the only thing that moves, so a swap can never duplicate or
   lose an item. An empty `from` is refused (there is nothing to drag) but an
   empty `to` is the ordinary way to move a stack into a free slot - the held
   stack goes there and the empty slot's `null` comes back. */
export function swapInventoryItems(player, from, to) {
  const inv = player.inv;
  if (from === to || from < 0 || to < 0 || from >= inv.length || to >= inv.length) return false;
  if (!inv[from]) return false;
  const held = inv[to] || null;
  inv[to] = inv[from];
  inv[from] = held;
  return true;
}

/* Rearranging the bank, in the client's own two modes: Swap exchanges the two
   slots, Insert pushes everything between them along one place so the dragged
   item lands between its new neighbours. (See swapInventoryItems and the
   insert loop in the 317 client's click handler.) */
export function bankMove(player, from, to, insert) {
  const b = player.bank;
  if (from === to || from < 0 || to < 0 || from >= b.length || to >= b.length) return false;
  if (!b[from]) return false;
  if (insert) {
    const held = b[from];
    if (from > to) for (let i = from; i > to; i--) b[i] = b[i - 1];
    else for (let i = from; i < to; i++) b[i] = b[i + 1];
    b[to] = held;
    return true;
  }
  const swap = b[to];
  b[to] = b[from];
  b[from] = swap;
  return true;
}

export function equipValueTotal(player) {
  let v = 0;
  for (const slot of EQUIP_SLOTS) {
    const s = player.equip[slot];
    if (s) v += (itemDef(s.id) || { value: 0 }).value * (s.qty || 1);
  }
  return v;
}

/* Carried weight in kg: everything in the inventory plus everything worn. The
   real game weighs stackable items per unit except where the item itself has no
   weight (coins, runes, arrows, feathers...), which the weight table encodes. */
export function totalWeight(player) {
  let w = 0;
  for (const s of player.inv) if (s) w += itemWeight(s.id) * s.qty;
  for (const slot of EQUIP_SLOTS) {
    const s = player.equip[slot];
    if (s) w += itemWeight(s.id) * (s.qty || 1);
  }
  return w;
}

export function grantXp(player, skill, amount) {
  return addXp(player, skill, amount);
}

export { ITEMS };
