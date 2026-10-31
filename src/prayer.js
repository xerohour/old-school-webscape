import { TICK_S } from "./tick.js";

/* ===========================================================================
   prayer.js — the prayer book, and what praying actually does.

   The twenty-six prayers the cache's own prayer interface (271) lays out, in
   its order, each carrying the cache sprite id of its lit and unlit icon
   (PRAYER_* / PRAYER_*_DISABLED, frames of the prayer sheet).

   Real rules that are modelled here:

     * A prayer boosts the relevant *effective* level by 5/10/15%. In the live
       game that is applied inside the combat formula, so that is where
       prayerLevelFactor() is read from (src/combat.js).
     * Protect from Melee/Missiles/Magic **blocks** an incoming blow of that
       style outright against a monster (damage 0). The wiki's own numbers:
       "Protection prayers block all damage in most circumstances against NPCs",
       and the 40% (older text: half) they are worth in PvP is a mode this world
       has no players for yet - see src/combat.js#npcStrikeHit, where the block
       is applied, and `commitStrike`, where a *missile's* block is decided on
       the attacker's own tick rather than on the tick the missile lands.
     * A prayer is applied **at the instant it is clicked**. The click *is* the
       change (`togglePrayer` folds it straight into `ps.prayers`), so the book,
       the orb, the overhead icon and combat all read one set at one moment -
       what the icon promises is what the world does. What is still
       **tick-locked is the drain**: each tick adds the drain effect of every
       prayer that is up at the end of it, and a prayer switched on since the
       last check is free on that tick. That is the machinery prayer flicking
       falls out of, rather than a rule of its own.
     * Prayer points are drained by a per-tick counter, not by a clock: each
       tick adds the drain *effect* of every prayer that was up at the start of
       it, and a point is lost whenever the counter reaches the wearer's prayer
       drain resistance (60, plus 2 per point of prayer bonus) - possibly more
       than once in a tick. A prayer switched on during a tick is skipped, which
       is what makes a flick free: "the game does not drain prayer for prayers
       on the tick they are activated".
     * **Prayer points do not restore themselves.** The wiki's "Prayer points"
       section lists every way they come back - an altar (below), a
       rejuvenation pool, a prayer potion or a super restore (src/ui.js#drink),
       a dose-based item, and a handful of special attacks - and natural
       recovery is not one of them: a prayer potion's own page says points are
       "otherwise only restored by praying at an altar". Nothing in this file
       adds points any more; the altar is src/actions.js#prayAtAltar.
     * The **fraction** (the drain counter) is *not* thrown away by laying the
       prayers down: "Prayer points ... in the background [are] represented as a
       fraction. This fraction can be reset through a rejuvenation pool, the
       Falador shield prayer recharge, or dying. Drinking a Prayer potion will
       NOT reset it." So a counter part-way to a point is still part-way there
       when the book goes quiet, and the next activation picks up where it left
       off. `clearPrayers` (dying, and running out) is the one thing here that
       zeroes it, which is the "or dying" half of that sentence.
     * Hitpoints regenerate 1 per 60s, 1 per 30s with Rapid Heal up.
     * Rapid Restore halves the time it takes to recover (modelled on run
       energy, the only recoverable stat this game has).
   =========================================================================== */

/* The twenty-six prayers of the 2009 book, in the exact order (and at the exact
   grid positions) the cache's prayer interface 271 lays them out. `id` is the
   sprite of the lit icon and `off` that of the drained grey; both are the ids
   the interface itself stores (it stores the grey one, the client swaps in the
   lit one when the level is met).

   `drain` is the prayer's own drain *effect*: the number the engine adds to its
   drain counter on every tick the prayer is up (the wiki's Prayer page table -
   1 for the 5% prayers and Rapid Restore, 2 for Rapid Heal and Protect Item, 3
   for Retribution, 6 for the 10% prayers, Hawk Eye, Mystic Lore and Redemption,
   12 for the 15% prayers, the three Protects, Eagle Eye and Mystic Might, 18
   for Smite and 24 for Piety). What that costs in points per minute is a second
   number, the wearer's drain resistance - see `prayerResistance`.

   **Two of these numbers come from the era rather than from today's table, and
   both are deliberate.** This is the book of the 2009 cache (interface 271),
   and the wiki records what has moved since:

     * **Chivalry drains 24** here (the wiki's Chivalry page: "1 point per 1.5
       seconds (40 per minute)"), not the 12 of today's table: that page's own
       change log says the rate was "reduced from 1 point per 1.5 seconds (40
       per minute) to 1 point per 3 seconds (20 per minute)" only on 12 August
       2026, seventeen years after this world's cache. Piety's own page still
       says 40 per minute, and the two were always the same rate, so setting
       Chivalry to the modern 20 would make the older prayer the cheaper one.
     * **Mystic Lore and Mystic Might carry no Magic damage bonus.** Today's
       Prayer table gives them +1% and +2%, but the Mystic Lore page's change log
       dates that to "Magic damage bonus ... increased from 0% to 1%" on 29 May
       2024, so in this world's era both are purely "+X% Magic attack and
       defence" - which is what `magic` is read as here (see
       `magicDefenceFactor` for the defence half).

   The modern book's later prayers (Preserve, Deadeye, Mystic Vigour, Rigour,
   Augury) are simply not here: the cache's interface has twenty-six cells. */
export const PRAYERS = [
  { id: 115, off: 135, name: "Thick Skin", level: 1, drain: 1, def: 1.05, group: "def", desc: "Increases your Defence by 5%." },
  { id: 116, off: 136, name: "Burst of Strength", level: 4, drain: 1, str: 1.05, group: "str", desc: "Increases your Strength by 5%." },
  { id: 117, off: 137, name: "Clarity of Thought", level: 7, drain: 1, atk: 1.05, group: "atk", desc: "Increases your Attack by 5%." },
  { id: 133, off: 153, name: "Sharp Eye", level: 8, drain: 1, range: 1.05, group: "range", desc: "Increases your Ranged by 5%." },
  { id: 134, off: 154, name: "Mystic Will", level: 9, drain: 1, magic: 1.05, group: "magic", desc: "Increases your Magic by 5%." },
  { id: 118, off: 138, name: "Rock Skin", level: 10, drain: 6, def: 1.1, group: "def", desc: "Increases your Defence by 10%." },
  { id: 119, off: 139, name: "Superhuman Strength", level: 13, drain: 6, str: 1.1, group: "str", desc: "Increases your Strength by 10%." },
  { id: 120, off: 140, name: "Improved Reflexes", level: 16, drain: 6, atk: 1.1, group: "atk", desc: "Increases your Attack by 10%." },
  { id: 121, off: 141, name: "Rapid Restore", level: 19, drain: 1, restore: true, desc: "Doubles your natural recovery rate." },
  { id: 122, off: 142, name: "Rapid Heal", level: 22, drain: 2, rapidHeal: true, desc: "Halves the time it takes to heal." },
  { id: 123, off: 143, name: "Protect Item", level: 25, drain: 2, protectItem: true, desc: "Keeps one extra item when you die." },
  { id: 502, off: 506, name: "Hawk Eye", level: 26, drain: 6, range: 1.1, group: "range", desc: "Increases your Ranged by 10%." },
  { id: 503, off: 507, name: "Mystic Lore", level: 27, drain: 6, magic: 1.1, group: "magic", desc: "Increases your Magic by 10%." },
  { id: 124, off: 144, name: "Steel Skin", level: 28, drain: 12, def: 1.15, group: "def", desc: "Increases your Defence by 15%." },
  { id: 125, off: 145, name: "Ultimate Strength", level: 31, drain: 12, str: 1.15, group: "str", desc: "Increases your Strength by 15%." },
  { id: 126, off: 146, name: "Incredible Reflexes", level: 34, drain: 12, atk: 1.15, group: "atk", desc: "Increases your Attack by 15%." },
  { id: 127, off: 147, name: "Protect from Magic", level: 37, drain: 12, protect: "magic", group: "overhead", desc: "Protects against Magic attacks." },
  { id: 128, off: 148, name: "Protect from Missiles", level: 40, drain: 12, protect: "range", group: "overhead", desc: "Protects against Ranged attacks." },
  { id: 129, off: 149, name: "Protect from Melee", level: 43, drain: 12, protect: "melee", group: "overhead", desc: "Protects against Melee attacks." },
  { id: 504, off: 508, name: "Eagle Eye", level: 44, drain: 12, range: 1.15, group: "range", desc: "Increases your Ranged by 15%." },
  { id: 505, off: 509, name: "Mystic Might", level: 45, drain: 12, magic: 1.15, group: "magic", desc: "Increases your Magic by 15%." },
  { id: 131, off: 151, name: "Retribution", level: 46, drain: 3, retribution: true, group: "overhead", desc: "Deals damage to nearby foes when you die." },
  { id: 130, off: 150, name: "Redemption", level: 49, drain: 6, redemption: true, group: "overhead", desc: "Heals you when you are close to death." },
  { id: 132, off: 152, name: "Smite", level: 52, drain: 18, smite: true, group: "overhead", desc: "Reduces your target's Prayer by a quarter of your hits." },
  { id: 945, off: 949, name: "Chivalry", level: 60, drain: 24, atk: 1.15, str: 1.18, def: 1.2, group: "god", desc: "Increases your Attack by 15%, your Strength by 18% and your Defence by 20%." },
  { id: 946, off: 950, name: "Piety", level: 70, drain: 24, atk: 1.2, str: 1.23, def: 1.25, group: "god", desc: "Increases your Attack by 20%, your Strength by 23% and your Defence by 25%." },
];

export const PRAYER_BY_ID = {};
export const PRAYER_BY_NAME = {};
for (const p of PRAYERS) {
  PRAYER_BY_ID[p.id] = p;
  PRAYER_BY_NAME[p.name.toLowerCase()] = p;
}

/* Points per minute each prayer costs while it is up, and the number that says
   how fast: the engine's "prayer drain resistance". It is 60 at no prayer
   bonus, and every point of prayer bonus adds 2 - so +30 halves the drain rate,
   exactly as the wiki's own note says. `TICK_S` is the game tick, so the rate
   works out to `effect / resistance * 100` points per minute. */
export const PRAYER_RESISTANCE_BASE = 60;
export const PRAYER_RESISTANCE_PER_BONUS = 2;
const TICKS_PER_MINUTE = 60 / TICK_S;

export function prayerResistance(prayerBonus = 0) {
  return PRAYER_RESISTANCE_BASE + PRAYER_RESISTANCE_PER_BONUS * Math.max(0, prayerBonus);
}

export function prayerByName(name) {
  return PRAYER_BY_NAME[String(name || "").toLowerCase().replace(/[\s_]+/g, " ")] || null;
}

/* ------------------------------------------------- prayer toggles, and the drain

   **A click is the change.** `togglePrayer` folds the click into `ps.prayers`
   there and then, through the ordinary conflict rule, so the prayer is up the
   moment the icon is. It used to be queued on `ps.prayerQueue` and folded in at
   the top of the next tick (`game.js#stepSim` called `applyPrayerQueue` there),
   which left the book's icon, the orb and the overhead icon - all of which
   always drew from the *predicted* set - a whole tick ahead of the prayer they
   promised: a click could be up to 0.6 s of lie. The user's ruling of
   2026-09-26 settled it: *"you need to correctly apply the prayers now"*.

   **What is still tick-locked is the drain, and that is where flicking lives.**
   Every tick adds the drain *effect* of each prayer that is up at the end of it
   to `ps.prayerDrainCounter`, skipping the ones switched on since the last
   check - the wiki's own compensation: "the game does not drain prayer for
   prayers on the tick they are activated". `ps.prayerOnThisTick` is that list of
   just-switched-on names (clicks push to it, `tickPrayer` empties it), so a
   player who deactivates and reactivates a prayer between two ticks is charged
   nothing and still has the prayer up for that whole tick's attacks - which is
   1-tick flicking - while re-clicking every other tick is charged on the ticks
   it is not re-clicked, i.e. the half-price half-flick.

   `activate`/`deactivate` (the book's clicks) and `toggleQuick` (the orb) all go
   through `togglePrayer`, so every way of praying behaves the same way.

   The other half of a flick is *when the prayer is read*, and that is what
   `src/combat.js#commitStrike` is for. A protection prayer is consulted on the
   **attacker's own tick** - the wiki: "If flicking a protection prayer, this is
   the tick your enemy attacks (which is typically when their attack animation
   begins, not necessarily the tick in which you take damage)" - so a missile
   that is in the air when the prayer goes up is not stopped by it, and a
   protection held for the one tick the creature throws its blow does stop it
   however long the missile then flies. Reading the prayer at the landing
   instead (which this game did until the user's report of 2026-09-26: *"do more
   research for the prayer flicks cause theres some kind of delay that we
   need"*) asks the player to hold it for the whole flight and quietly breaks
   the flick.

   The click is folded in with the ordinary conflict rule (`conflicts`), so
   asking for Piety after Chivalry, or for a second overhead, resolves exactly
   the way the click should: the one asked for last goes up and every prayer it
   conflicts with goes out with it. */

function foldQueue(base, queue) {
  const out = base.slice();
  const switchedOn = [];
  for (const name of queue) {
    const p = PRAYER_BY_NAME[String(name).toLowerCase()];
    if (!p) continue;
    const i = out.findIndex((n) => n.toLowerCase() === p.name.toLowerCase());
    if (i >= 0) out.splice(i, 1);
    else {
      for (let k = out.length - 1; k >= 0; k--) {
        const q = PRAYER_BY_NAME[out[k].toLowerCase()];
        if (q && conflicts(p, q)) out.splice(k, 1);
      }
      out.push(p.name);
      switchedOn.push(p.name);
    }
  }
  return { prayers: out, switchedOn };
}

/* One click's worth: fold a single name into the set and write the result back
   into `ps.prayers` in place (the array object is shared with everything that
   holds a reference to it, so it is emptied and refilled rather than replaced).
   Returns whether the click put the prayer *up*, which is what the caller's
   message says. */
function applyNow(ps, name) {
  const before = ps.prayers.slice();
  const { prayers, switchedOn } = foldQueue(ps.prayers, [name]);
  ps.prayers.length = 0;
  for (const n of prayers) ps.prayers.push(n);
  if (switchedOn.length) {
    if (!ps.prayerOnThisTick) ps.prayerOnThisTick = [];
    for (const n of switchedOn) if (!ps.prayerOnThisTick.includes(n)) ps.prayerOnThisTick.push(n);
  }
  /* Rapid Heal restarts the natural-healing countdown on either edge - "the
     countdown timer for natural health regeneration" begins again at 30 s with
     it up and 60 s with it down - and the edge is the toggle itself
     (src/prayer.js#resetRegenClock). */
  const was = before.some((n) => n.toLowerCase() === "rapid heal");
  const now = ps.prayers.some((n) => n.toLowerCase() === "rapid heal");
  if (was !== now) resetRegenClock(ps);
  return switchedOn.length > 0;
}

/* Is this prayer up? There is one set to ask - the applied one - so this is
   plain membership, and the book's glow, the overhead icon, the quick-prayer
   orb and combat all answer from it. */
export function isActive(ps, name) {
  const key = String(name).toLowerCase();
  if (!ps.prayers) ps.prayers = [];
  return ps.prayers.some((n) => n.toLowerCase() === key);
}

export function activePrayers(ps) {
  if (!ps.prayers) ps.prayers = [];
  return ps.prayers.map((n) => PRAYER_BY_NAME[n.toLowerCase()]).filter(Boolean);
}

export function countActive(ps) {
  return activePrayers(ps).length;
}

/* Can this player switch this prayer on right now? Prayers need the level,
   points in the book, and - in the live game - a free inventory slot for the
   book itself. */
export function canPray(ps, p) {
  if (!p) return { ok: false, why: "There is no such prayer." };
  if (!ps.prayers) ps.prayers = [];
  if (isActive(ps, p.name)) return { ok: true };
  if (ps.skills.prayer.level < p.level) {
    return { ok: false, why: "You need a Prayer level of " + p.level + " to use " + p.name + "." };
  }
  if (ps.prayerPoints <= 0) {
    return { ok: false, why: "You have run out of prayer points; you must recharge at an altar." };
  }
  return { ok: true };
}

/* One click: switch this prayer on or off, there and then. The prayer is in
   `ps.prayers` before this returns, so the world feels it on the same beat as
   the icon lights - there is no tick of lag between the book and the game (the
   user's ruling, 2026-09-26). A refusal (a level you have not got, or an empty
   book) still changes nothing and still says why. A prayer that is already up
   can always be clicked again, which turns it off: that is the half-flick. */
export function togglePrayer(ps, p) {
  if (!p) return { ok: false, why: "There is no such prayer." };
  if (!ps.prayers) ps.prayers = [];
  const on = !isActive(ps, p.name);
  if (on) {
    const check = canPray(ps, p);
    if (!check.ok) return check;
  }
  applyNow(ps, p.name);
  return { ok: true, on };
}

/* The conflict groups, exactly the wiki's own table:

     def / str / atk / range / magic  - one prayer each per group, because two
                                        prayers can never boost the same stat;
     god  (Chivalry, Piety)           - boosts all three melee stats, so it
                                        conflicts with every one of the five
                                        groups above as well as with itself;
     overhead (the three Protects, Retribution, Redemption, Smite) - one
                                        overhead icon at a time.

   Rapid Restore, Rapid Heal and Protect Item are in no group at all: the wiki
   lists them as the only prayers "without conflicting prayers, and thus can
   always be activated". */
function conflicts(a, b) {
  if (!a.group || !b.group) return false;
  if (a.group === b.group) return true;
  const god = a.group === "god" || b.group === "god";
  const overhead = a.group === "overhead" || b.group === "overhead";
  return god && !overhead;
}

/* Everything down at once - dying, and running out of points. The free-tick
   list goes with them: a prayer that was switched on and then wiped off inside
   the same tick must not leave its name behind to forgive somebody else's
   drain. */
export function clearPrayers(ps) {
  if (ps.prayers) ps.prayers.length = 0;
  ps.prayerOnThisTick = [];
  ps.prayerDrainCounter = 0;
}

/* ------------------------------------------------------------- quick prayers

   The live game's quick prayers (added with the data orbs on 2014-02-06; the
   wiki's Prayer page, "Quick prayers"): a group of prayers the player
   preselects, switched on or off together by **left-clicking the prayer orb**,
   with the selection made by right-clicking it and choosing "Setup
   quick-prayers". Up to any number of prayers may be in the group - the live
   game puts no cap on it - so the whole rule is:

     * the **set** (`ps.quickPrayers`, saved with the character) is the names,
       in the order the player picked them;
     * **on** means every prayer in the set is up, so a quick-prayer click that
       finds the set already lit turns it off (the wiki: "It can be
       left-clicked to activate or deactivate a group of prayers preselected by
       the player simultaneously", and double-clicking is "an easy way to turn
       off all prayers");
     * a prayer the player has not the level for, or cannot pay for, is simply
       left out of the activation rather than refusing the whole click - the
       rest of the set still goes up. */

export function quickSet(ps) {
  if (!ps.quickPrayers) ps.quickPrayers = [];
  return ps.quickPrayers.map((n) => PRAYER_BY_NAME[n.toLowerCase()]).filter(Boolean);
}

export function isQuickMember(ps, p) {
  return !!(ps.quickPrayers && p && ps.quickPrayers.some((n) => n.toLowerCase() === p.name.toLowerCase()));
}

/* Is the whole set up? An empty set is never "on". */
export function quickActive(ps) {
  const set = quickSet(ps);
  if (!set.length) return false;
  return set.every((p) => isActive(ps, p.name));
}

/* Add or remove one prayer from the set (the setup screen's click). Returns
   true when the prayer was added. */
export function toggleQuickMember(ps, p) {
  if (!ps.quickPrayers) ps.quickPrayers = [];
  const i = ps.quickPrayers.findIndex((n) => n.toLowerCase() === p.name.toLowerCase());
  if (i >= 0) ps.quickPrayers.splice(i, 1);
  else ps.quickPrayers.push(p.name);
  return i < 0;
}

/* One left-click of the prayer orb. Returns `{ ok, on, n, blocked, why }`:
   `blocked` is how many of the set could not be switched on (no level, or the
   points ran out), and `why` is the message to say when nothing could be done
   at all. Every member goes through `togglePrayer`, so the whole click lands at
   once, and conflicting prayers inside the set resolve the ordinary way - the
   last one switched on clears the ones it conflicts with. */
export function toggleQuick(ps) {
  const set = quickSet(ps);
  if (!set.length) return { ok: false, why: "You have no quick prayers set up - right-click the prayer orb to set some." };
  if (!ps.prayers) ps.prayers = [];
  if (quickActive(ps)) {
    let n = 0;
    for (const p of set) {
      if (!isActive(ps, p.name)) continue;
      const r = togglePrayer(ps, p);
      if (r.ok) n++;
    }
    return { ok: true, on: false, n, blocked: 0 };
  }
  if (ps.prayerPoints <= 0) {
    return { ok: false, why: "You have run out of prayer points; you must recharge at an altar." };
  }
  let n = 0, blocked = 0, low = null;
  for (const p of set) {
    if (isActive(ps, p.name)) { n++; continue; }
    const r = togglePrayer(ps, p);
    if (r.ok) n++;
    else { blocked++; if (!low) low = p; }
  }
  if (!n) return { ok: false, why: "You need a Prayer level of " + low.level + " to use " + low.name + ".", blocked };
  return { ok: true, on: true, n, blocked, low: blocked ? low : null };
}

/* The multiplier the combat formula applies to a skill's effective level. */
export function prayerLevelFactor(ps, skill) {
  let f = 1;
  for (const p of activePrayers(ps)) {
    if (p[skill]) f *= p[skill];
  }
  return f;
}

/* The same multiplier for a **magic** blow, which is not answered by Defence
   alone. The wiki's own line for the Mystic prayers is that they boost "Magic
   Attack **and Defence**" - Mystic Will "+5% Magic Attack and Defence", Mystic
   Lore "+10% Magic Attack and Defence", Mystic Might "+15% Magic Attack and
   Defence" - so the defence half of the Mystic prayer is a real part of what a
   magic attack has to get past, and leaving it out had the three Mystic prayers
   do nothing at all against a caster. A blow of magic is therefore met by both
   halves at once: the Defence a Skin/Chivalry/Piety prayer raises, and the
   Magic defence a Mystic prayer raises. `src/combat.js#playerDefence` (the
   creature's own curse or blast) and `playerMagicDefence` (a dragon's breath,
   which the wiki rolls "with the monster's Magic accuracy against the player's
   Magic defence") both read it. */
export function magicDefenceFactor(ps) {
  return prayerLevelFactor(ps, "def") * prayerLevelFactor(ps, "magic");
}

/* "melee" | "range" | "magic" | null - the style the player is protected from. */
export function prayerProtection(ps) {
  for (const p of activePrayers(ps)) if (p.protect) return p.protect;
  return null;
}

/* The prayer whose icon flies over the player's head, or null. The six
   "overhead" prayers are the three Protects plus Retribution, Redemption and
   Smite, and the client draws the *same* prayer icon over the head that its cell
   in the book carries (src/fx.js#renderOverheads blits it) - the book's own
   group is what decides, so a prayer added to `group: "overhead"` shows its head
   icon without anything else being touched. At most one can be up at a time:
   they are all in one conflict group (`conflicts`). */
export function overheadPrayer(ps) {
  for (const p of activePrayers(ps)) if (p.group === "overhead") return p;
  return null;
}

/* The overhead prayer as one small number for the wire: 0 is nothing up. */
export function overheadIndexOf(p) {
  if (!p) return 0;
  if (p.protect === "melee") return 1;
  if (p.protect === "range") return 2;
  if (p.protect === "magic") return 3;
  if (p.retribution) return 4;
  if (p.redemption) return 5;
  if (p.smite) return 6;
  return 0;
}

export function overheadIndex(ps) {
  return overheadIndexOf(overheadPrayer(ps));
}

const OVERHEAD_INDEX_FRAME = [null, 0, 1, 2, 3, 5, 4];

export function overheadPartFor(index) {
  const f = OVERHEAD_INDEX_FRAME[index];
  return f == null ? null : "headicon" + f;
}

/* Points burned per minute with the current set of prayers up, after the prayer
   bonus on the player's worn equipment. It is the real rate the counter below
   produces: the prayers' drain effects over the resistance, times the hundred
   ticks a minute holds. The tooltip's number, not the drain itself. */
export function drainPerMinute(ps, prayerBonus = 0) {
  let effect = 0;
  for (const p of activePrayers(ps)) effect += p.drain;
  if (!effect) return 0;
  return effect / prayerResistance(prayerBonus) * TICKS_PER_MINUTE;
}

/* One game tick of prayer: add up what is up, lose a point every time the
   counter reaches the wearer's resistance, and stop when the book empties.
   Called once per tick from src/combat.js#tickCombat, and it is the *only*
   tick-locked piece of praying left: every click is already in `ps.prayers` by
   the time this runs, so `activePrayers` is simply what is up.

   The one exemption is the flick: a prayer the player switched *on* since the
   last drain check (`ps.prayerOnThisTick`) costs nothing on this tick. It is
   the live game's compensation - "the game does not drain prayer for prayers on
   the tick they are activated" - and it is what makes an every-tick re-click
   free rather than merely cheap.

   Nothing here *gives* points back. A quiet book costs nothing and is worth
   nothing: the counter keeps whatever fraction it had (the wiki's "fraction",
   which only a pool, a shield recharge or dying resets - not a potion, and not
   laying the prayers down), and the points come back from an altar
   (src/actions.js#prayAtAltar) or a potion (src/ui.js#drink) and nowhere else.
   This file used to hand out a point per prayer level per minute while no
   prayer was up, which is not a rule of the game at all: at Prayer 99 that was
   99 points a minute, so a book spent on Protect from Melee was back inside the
   time it took to walk a few tiles - and a flick, which is supposed to be worth
   something, was worth nothing beside it. */
export function tickPrayer(ps, dt, prayerBonus = 0) {
  if (!ps.prayers) ps.prayers = [];
  const active = activePrayers(ps);
  const switchedOn = ps.prayerOnThisTick || [];
  ps.prayerOnThisTick = [];
  if (!active.length) return null;
  let effect = 0;
  for (const p of active) {
    if (switchedOn.some((n) => n.toLowerCase() === p.name.toLowerCase())) continue;
    effect += p.drain;
  }
  ps.prayerDrainCounter = (ps.prayerDrainCounter || 0) + effect;
  const resist = prayerResistance(prayerBonus);
  while (ps.prayerDrainCounter >= resist && ps.prayerPoints > 0) {
    ps.prayerDrainCounter -= resist;
    ps.prayerPoints -= 1;
  }
  if (ps.prayerPoints <= 0) {
    ps.prayerPoints = 0;
    ps.prayerDrainCounter = 0;
    /* Nothing may be prayed for at no points, so everything goes out together
       - and the free-tick list with it, so a name switched on earlier in this
       very tick cannot linger to forgive a drain that will never come. */
    ps.prayerOnThisTick = [];
    ps.prayers.length = 0;
    return "out";
  }
  return null;
}

/* ------------------------------------------------ hitpoint regeneration

   The published rate is **1 Hitpoint per minute** (Hitpoints: "Players
   regenerate 1 Hitpoint per minute"), and every effect that changes it is a
   doubling of that rate, exactly as the wiki's own list gives them:

     base                              1 / min   (60s)
     Rapid Heal prayer                 2 / min   (30s)
     Hitpoints cape                    2 / min   (30s)   - no such cape here
     regen bracelet                    2 / min   (30s)
     Rapid Heal (or cape) + bracelet   4 / min   (15s)

   Rapid Heal and the cape do *not* stack with each other, but either of them
   stacks with the bracelet - so the bracelet is a second, independent doubling
   rather than a replacement, which is why the two factors multiply.

   Dream (Lunar) is the one that is not a doubling: the spell "increase[s] the
   regeneration rate to 3 Hitpoints per minute", i.e. 20s, and it holds the
   caster asleep until they are whole again or they take a step (src/combat.js
   watches for both). */
export const REGEN_BASE_SECONDS = 60;
export const DREAM_REGEN_SECONDS = 20;

export function hpRegenInterval(ps, regenBracelet = false) {
  if (ps.dream) return DREAM_REGEN_SECONDS;
  let rate = 1;
  if (activePrayers(ps).some((p) => p.rapidHeal)) rate *= 2;
  if (regenBracelet) rate *= 2;
  return REGEN_BASE_SECONDS / rate;
}

/* "Activating or deactivating Rapid Heal resets the countdown timer [for]
   natural health regeneration to 30 seconds or 60 seconds, respectively" - so
   the click does not merely change the interval, it also throws away whatever
   was already owed. Turning it *off* is the useful half: the wait restarts at a
   full minute, which is how a player stops overheal decaying. */
export function resetRegenClock(ps) {
  ps.hpRegen = 0;
}

/* Run energy recovery is doubled by Rapid Restore. */
export function energyRecoveryFactor(ps) {
  return activePrayers(ps).some((p) => p.restore) ? 2 : 1;
}
