import { ITEMS } from "./items.js";
import { invCount, invRemove, weaponOf } from "./player.js";
import { levelOf } from "./skills.js";
import { Gfx } from "./gfx.js";
import { playCastAnim } from "./game.js";

/* ------------------------------------------------------------------ the book

   Interface 192, the standard spellbook, as the cache lays it out: seven
   columns of 24x24 cells with their origin at (12,22). The interface stores
   the *drained* sprite for every spell (lit id + 50), so the lit sprite is
   always at the lower id - that mapping is done in src/ui.js when the panel is
   drawn.

   The cache's book is nine rows, which is exactly the sixty-three spells of
   the real standard spellbook: 22 + 9*24 = 238 of the panel's 261 pixels, i.e.
   the grid is centred in the 190x261 tray with 22 above and 23 below. This
   content has two spells the real book does not (see the Crumble/Shatter/
   Pulverize note in SPELLS below), so the grid is ten rows - 240px - and the
   origin moves to y=10 to keep the tray evenly filled: 7px of the panel's
   parchment above the first row and 7 below the last. The panel itself is
   unchanged (190x261, src/gameframe.js#SIDE).

   Alongside the cache data each row carries the spell's rune cost (in plain
   element names - the item id is the element plus "_rune"), the Magic level
   the interface gates it at, and what casting it actually does. The costs were
   taken from the standard spellbook's published rune requirements; the max
   hits are the ones printed on each spell's page.

   Home Teleport (356) is the free one and has no drained variant.            */

export const SPELL_COLS = 7;
export const SPELL_CELL = 24;
export const SPELL_ORIGIN_X = 12;
/* Ten rows of 24 need 240 of the panel's 261px, so the grid starts at y=10 and
   ends at y=250. The panel's parchment runs from y=3 to y=256 (the outer 3-4px
   is its border sprite), which leaves an even 7px of parchment above the first
   row and below the last. The cache's own origin, 22, would put the tenth row
   at 238..262 - one pixel past the bottom of the panel. */
export const SPELL_ORIGIN_Y = 10;

/* Every row: id, name, Magic level, rune cost (plain element names), what the
   cast does, and the base Magic experience the cast is worth. Both the rune
   costs and the base experience are the published values for the spell; the
   damage column on the same tables gives the max hit (`max`). A combat cast
   also gives the usual 2 Magic xp and 1.33 Hitpoints xp per point of damage. */
/* The client's own targeting mask (`spellUsableOn`): which things a spell may
   be aimed at. 0 means the spell is cast on the spot - teleports, Charge and
   Bones to Bananas are all `on: 0`. Declared up here, above the tables, because
   a row is allowed to set its own `on` (Teleother and Tele Block do). */
export const SPELL_TARGET = { NPC: 1, PLAYER: 2, LOC: 4, GROUND: 8, INV: 16 };

const T = (id, name, level, cost, kind, data) => Object.assign({ id, name, level, cost, kind, xp: 0, max: 0 }, data);

export const SPELLS = [
  T(356, "Lumbridge Home Teleport", 0, {}, "teleport", { at: [62.5, 57.5], place: "Lumbridge" }),
  /* Cairn Isle Teleport - this world's own destination, and the way the user
     asked to reach the new area (2026-09-25: "accessible via a teleport of your
     choosing ... wire the teleport to the new area").

     It is deliberately the *free* teleport's twin: level 1 and no runes, so a
     player who has just made an account can still walk the course, and so the
     isle can be reached in one click for testing. The level is the only gate.
     `at` is `src/island.js#ISLE.landAt` - the isle's north beach, the one tile
     the course's own route begins from - copied here rather than imported for
     the same reason every other teleport in this list carries a literal
     coordinate: this table is data, and a spell that moved whenever the island's
     profile was retuned would be a trap.

     Its icon is invented art and lives in `src/tools/cache-bake/frame.mjs`
     (`CUSTOM_SPELLS`, ids 366/416): Camelot's blue rune circle with a C, in a
     Cairn Isle palette. The C is honest - it is the destination's initial, the
     way the V, L, F, C, A, W and T of the other teleports are theirs. */
  T(366, "Cairn Isle Teleport", 1, {}, "teleport", { at: [48.5, 142.5], place: "Cairn Isle" }),
  T(15, "Wind Strike", 1, { air: 1, mind: 1 }, "combat", { max: 2, xp: 5.5 }),
  T(16, "Confuse", 3, { body: 1, earth: 2, water: 3 }, "stat", { drain: { stat: "attack", pct: 5 }, ticks: 12, xp: 13 }),
  T(358, "Enchant Crossbow Bolt", 4, { cosmic: 1 }, "item", { xp: 17.5 }),
  T(17, "Water Strike", 5, { air: 1, water: 1, mind: 1 }, "combat", { max: 4, xp: 7.5 }),
  T(18, "Lvl-1 Enchant", 7, { cosmic: 1, water: 1 }, "item", { xp: 17.5 }),
  T(19, "Earth Strike", 9, { air: 1, earth: 2, mind: 1 }, "combat", { max: 6, xp: 9.5 }),
  T(20, "Weaken", 11, { body: 1, earth: 2, water: 3 }, "stat", { drain: { stat: "strength", pct: 5 }, ticks: 12, xp: 21 }),
  T(21, "Fire Strike", 13, { air: 2, fire: 3, mind: 1 }, "combat", { max: 8, xp: 11.5 }),
  T(22, "Bones to Bananas", 15, { water: 2, earth: 2, nature: 1 }, "item", { xp: 25 }),
  T(23, "Wind Bolt", 17, { chaos: 1, air: 2 }, "combat", { max: 9, xp: 13.5 }),
  T(24, "Curse", 19, { body: 1, earth: 3, water: 2 }, "stat", { drain: { stat: "defence", pct: 5 }, ticks: 12, xp: 29 }),
  T(319, "Bind", 20, { nature: 2, earth: 3, water: 3 }, "bind", { ticks: 8, xp: 30 }),
  T(25, "Low Level Alchemy", 21, { nature: 1, fire: 3 }, "alchemy", { high: false, xp: 31 }),
  T(26, "Water Bolt", 23, { chaos: 1, air: 2, water: 2 }, "combat", { max: 10, xp: 16.5 }),
  T(27, "Varrock Teleport", 25, { law: 1, air: 3, fire: 1 }, "teleport", { at: [62.5, 45.5], place: "Varrock", xp: 35 }),
  T(28, "Lvl-2 Enchant", 27, { cosmic: 1, air: 3 }, "item", { xp: 37 }),
  T(29, "Earth Bolt", 29, { chaos: 1, air: 2, earth: 3 }, "combat", { max: 11, xp: 19.5 }),
  T(30, "Lumbridge Teleport", 31, { law: 1, air: 3, earth: 1 }, "teleport", { at: [62.5, 57.5], place: "Lumbridge", xp: 41 }),
  T(31, "Telekinetic Grab", 33, { law: 1, air: 1 }, "grab", { range: 7, xp: 43 }),
  T(32, "Fire Bolt", 35, { chaos: 1, air: 3, fire: 4 }, "combat", { max: 12, xp: 22.5 }),
  T(33, "Falador Teleport", 37, { law: 1, air: 3, water: 1 }, "teleport", { at: [74.5, 70.5], place: "Falador", xp: 48 }),
  /* The undead line. Crumble Undead is the content's own spell, at its real
     2007 max hit of 15. This world adds two more that the real book does not
     have - Shatter Undead (at level 61, further down) and Pulverize Undead (at
     level 78) - each hitting for a multiple of crumble's 15: 1.6x is 24, and
     2.3x is 34.5, rounded up to 35 because a max hit is a whole number. Their
     ids (71 and 72) are free slots in the cache's sprite numbering, and their
     icons are recoloured crumble skulls - yellow for shatter, ice blue for
     pulverize - built by src/tools/cache-bake/frame.mjs#CUSTOM_SPELLS. */
  T(34, "Crumble Undead", 39, { air: 2, earth: 2, chaos: 1 }, "combat", { max: 15, undeadOnly: true, xp: 24.5 }),
  T(355, "Teleport to House", 40, { law: 1, air: 1, earth: 1 }, "teleport", { at: [74.5, 52.5], place: "your house", xp: 30 }),
  T(35, "Wind Blast", 41, { death: 1, air: 3 }, "combat", { max: 13, xp: 25.5 }),
  T(36, "Superheat Item", 43, { fire: 4, nature: 1 }, "superheat", { xp: 53 }),
  T(37, "Camelot Teleport", 45, { law: 1, air: 5 }, "teleport", { at: [62.5, 40.5], place: "Camelot", xp: 55.5 }),
  T(38, "Water Blast", 47, { death: 1, air: 3, water: 3 }, "combat", { max: 14, xp: 28.5 }),
  T(39, "Lvl-3 Enchant", 49, { cosmic: 1, fire: 5 }, "item", { xp: 59 }),
  T(53, "Iban Blast", 50, { fire: 5, death: 1 }, "combat",
    /* Iban Blast can be cast wielding either Iban staff - the regular one or
       the superior one - while the superior blast needs the superior staff
       (see `spellStatus` and `spellStaffIds`). */
    { max: 28, xp: 30, staffIds: ["ibans_staff", "ibans_superior_staff"] }),
  T(320, "Snare", 50, { nature: 3, earth: 4, water: 4 }, "bind", { ticks: 16, damage: 3, xp: 60 }),
  T(54, "Ardougne Teleport", 51, { law: 2, water: 2 }, "teleport", { at: [31.5, 90.5], place: "Ardougne", xp: 61 }),
  T(40, "Earth Blast", 53, { earth: 4, air: 3, death: 1 }, "combat", { max: 15, xp: 31.5 }),
  T(41, "High Level Alchemy", 55, { fire: 5, nature: 1 }, "alchemy", { high: true, xp: 65 }),
  T(42, "Charge Water Orb", 56, { cosmic: 3, water: 30 }, "item", { xp: 56 }),
  T(43, "Lvl-4 Enchant", 57, { cosmic: 1, earth: 10 }, "item", { xp: 67 }),
  T(55, "Watchtower Teleport", 58, { law: 2, earth: 2 }, "teleport", { at: [95.5, 66.5], place: "the Watchtower", xp: 68 }),
  T(44, "Fire Blast", 59, { fire: 5, air: 4, death: 1 }, "combat", { max: 16, xp: 34.5 }),
  T(45, "Charge Earth Orb", 60, { cosmic: 3, earth: 30 }, "item", { xp: 70 }),
  T(354, "Bones to Peaches", 60, { water: 4, earth: 2, nature: 2 }, "item", { xp: 35.5 }),
  /* The three god spells. Each needs its own god staff wielded to be cast at
     all (magic.js#spellStatus checks `god`), each drains one of the victim's
     prayer points on a successful hit, and each hits for 30 instead of 20
     while Charge is running *and* the matching god cape is worn - see
     src/combat.js#spellMaxHit. The three ids are the live game's own. */
  T(61, "Saradomin Strike", 60, { blood: 2, fire: 2, air: 4 }, "combat", { max: 20, xp: 35, god: "saradomin" }),
  T(60, "Claws of Guthix", 60, { blood: 2, fire: 1, air: 4 }, "combat", { max: 20, xp: 35, god: "guthix" }),
  T(59, "Flames of Zamorak", 60, { blood: 2, fire: 4, air: 1 }, "combat", { max: 20, xp: 35, god: "zamorak" }),
  T(323, "Trollheim Teleport", 61, { law: 2, fire: 2 }, "teleport", { at: [62.5, 26.5], place: "Trollheim", xp: 68 }),
  T(71, "Shatter Undead", 61, { air: 3, earth: 3, chaos: 2 }, "combat", { max: 24, undeadOnly: true, xp: 40 }),
  T(46, "Wind Wave", 62, { air: 5, blood: 1 }, "combat", { max: 17, xp: 36 }),
  T(47, "Charge Fire Orb", 63, { cosmic: 3, fire: 30 }, "item", { xp: 73 }),
  T(357, "Teleport to Ape Atoll", 64, { law: 2, fire: 2, water: 2 }, "teleport", { at: [91.5, 99.5], place: "Ape Atoll", xp: 74 }),
  T(48, "Water Wave", 65, { water: 7, air: 5, blood: 1 }, "combat", { max: 18, xp: 37.5 }),
  T(49, "Charge Air Orb", 66, { cosmic: 3, air: 30 }, "item", { xp: 76 }),
  T(56, "Vulnerability", 66, { water: 5, earth: 5, soul: 1 }, "stat", { drain: { stat: "defence", pct: 10 }, ticks: 16, xp: 76 }),
  T(50, "Lvl-5 Enchant", 68, { cosmic: 1, earth: 15, water: 15 }, "item", { xp: 78 }),
  T(51, "Earth Wave", 70, { earth: 7, air: 5, blood: 1 }, "combat", { max: 19, xp: 40 }),
  T(57, "Enfeeble", 73, { earth: 8, water: 8, soul: 1 }, "stat", { drain: { stat: "strength", pct: 10 }, ticks: 16, xp: 83 }),
  /* The Teleother line and Tele Block are aimed at another *player*, which is
     what `kind: "other"` means - the earlier `"item"` was a placeholder from
     when this world had nobody to aim them at. The three Teleothers carry the
     destination they ask the target to accept, and it is the same tile the
     spell's own self-cast twin uses (Lumbridge 30, Falador 33, Camelot 37): one
     place per town, not two. */
  T(349, "Teleother Lumbridge", 74, { law: 1, soul: 1, earth: 1 }, "other", { xp: 84, at: [62.5, 57.5], place: "Lumbridge" }),
  T(52, "Fire Wave", 75, { fire: 7, air: 5, blood: 1 }, "combat", { max: 20, xp: 42.5 }),
  T(72, "Pulverize Undead", 78, { air: 4, earth: 4, chaos: 3 }, "combat", { max: 35, undeadOnly: true, xp: 58 }),
  T(321, "Entangle", 79, { nature: 4, earth: 5, water: 5 }, "bind", { ticks: 24, damage: 5, xp: 89 }),
  T(58, "Stun", 80, { earth: 12, water: 12, soul: 1 }, "stat", { drain: { stat: "attack", pct: 10 }, ticks: 16, xp: 90 }),
  T(322, "Charge", 80, { air: 3, fire: 3, blood: 3 }, "charge", { ticks: 100, xp: 180 }),
  T(350, "Teleother Falador", 82, { law: 1, soul: 1, water: 1 }, "other", { xp: 92, at: [74.5, 70.5], place: "Falador" }),
  T(352, "Tele Block", 85, { chaos: 1, law: 1, death: 1 }, "other", { xp: 80 }),
  T(353, "Lvl-6 Enchant", 87, { cosmic: 1, earth: 20, fire: 20 }, "item", { xp: 97 }),
  T(351, "Teleother Camelot", 90, { law: 1, soul: 2 }, "other", { xp: 100, at: [62.5, 40.5], place: "Camelot" }),
  /* Greater Telekinetic Grab (this world's own, Magic 86): five times the
     runes of the standard grab (5 law + 5 air) for triple the perks - range 14
     instead of 7, two items instead of one, and a 3x3 sweep instead of one
     tile (`grabCount` / `grabArea`, read by src/actions.js#castGrab). It is
     aimed one tile at a time exactly like the standard grab - the sweep only
     happens on landing, taking the two dearest piles by high-alch worth. Its
     presentation is the standard grab's three graphics read through a red tint,
     and its icon a red recolour of the standard grab's arrow (see the note on
     this table's `tint` and src/tools/cache-bake/frame.mjs#CUSTOM_SPELLS). */
  T(367, "Greater Telekinetic Grab", 86, { law: 5, air: 5 }, "grab", { range: 14, xp: 215, grabCount: 2, grabArea: 1,
    /* The missile crosses any distance in the same time - the standard grab's
       own full-reach pace, 1.3 s (see src/magic.js#flightSeconds at 7 tiles) -
       so the animation and the landing never stretch with the range. Read by
       src/actions.js#castGrab. */ fixedFlight: 1.3 }),
  /* Iban's Superior Blast - this world's own spell, last in the book because
     the book is ordered by level and nothing outranks 90. It is what our
     Iban himself throws: the cast_iban pose with his doubled hand-charge, a
     hidden carrier instead of a missile, and the big red ground strike (83)
     erupting under every victim - see src/combat.js#superiorBlastNova. On
     landing it attacks the nearest 6 creatures inside the 7x7 square around
     the landing tile, each taking its own roll of the same max hit. The gate
     is its own staff, Iban's superior staff, exactly like Iban Blast's gate
     to Iban's staff (see `spellStatus`). Its id (73) and its drained pair
     (123) are free slots in index 8's numbering, and its icon is the nova's
     own ground strike (83) rendered side-on - see
     src/tools/cache-bake/frame.mjs#CUSTOM_SPELLS. */
  T(73, "Iban's Superior Blast", 90, { fire: 7, death: 2, blood: 1 }, "combat",
    { max: 34, xp: 46, staffId: "ibans_superior_staff" }),
];

/* --------------------------------------------------------- the other books

   A spellbook is a *view* of the book of spells: the same spell can only ever
   belong to one, and each book lays its own out. The standard book is the
   cache's interface 192, and its rows are the ones above. The other two books
   this world carries - the Ancient Magicks (interface 193) and the Lunar
   spellbook (interface 430) - are both real interfaces of this cache revision,
   so both their spell sets and the exact (x, y) of every cell come out of the
   cache rather than out of a computed grid.

   Icons: run `spell<id>` for the lit cell and `spellOff<id + 50>` for the
   drained one - the same rule the standard book uses (the cache stores the
   drained sprite in the interface, and the client swaps in the lit one when
   the level and runes allow). The sprite ids below are RuneLite's SpriteID
   names (`SPELL_ICE_BARRAGE = 328`, ...), which is how the layout was mapped
   back to spells: every cell in interface 193/430 stores the *disabled* id,
   i.e. lit id + 50.

   Ancient numbers are the Asteria-3.0 `CombatSpells.java` table (this era's
   own): levels, runes, max hits, xp, the cast animations (1978 one-handed,
   1979 two-handed) and the spotanim ids. Lunar levels/runes/xp are the OSRS
   wiki's published table for the spell (this world's rule for a number with no
   content row). Both books' effects are this world's implementation of the
   published behaviour; where a spell's machinery does not exist here (farming,
   a potion-dose path to share) its row says so - `refuses` - and the cast refuses
   honestly. */

const A = (id, name, level, cost, max, xp, extra) => T(id, name, level, cost, "combat",
  Object.assign({ max, xp, autocast: true, book: "ancient" }, extra || {}));
const AP = (id, name, level, cost, xp, at, place) => T(id, name, level, cost, "teleport",
  { xp, book: "ancient", at, place });

/* The Shadow spells' own drain. Every shadow attack that deals damage lowers
   the victim's Attack: 5% for Rush and Burst, 15% for Blitz and Barrage. The
   numbers are Asteria-3.0's `CombatWeaken` enum (ATTACK_LOW 0.05, ATTACK_HIGH
   0.15), which is the same table the rest of the Ancient numbers above are
   transcribed from. The OSRS wiki's current pages give 10%/10% for the two low
   rows - a later rebalance - and that difference is deliberate here: this world
   follows the era's own table, exactly as it does for the max hits and the
   freeze lengths. `ticks` is this world's clock, matching the curse spells'
   12/16 - the live game's own duration for a weaken effect is not published. */
const SHADOW_LOW = { stat: "attack", pct: 5 };
const SHADOW_HIGH = { stat: "attack", pct: 15 };

/* The sixteen Ancient combat spells, four elements by four tiers. A Burst or a
   Barrage hits the target's own tile *and* the eight around it (`radius: 1`),
   freezes/poisons/heals/drains on the same rule the live game uses, and every
   one of them can be autocast from a staff's Spell style. */
export const ANCIENT_SPELLS = [
  A(329, "Smoke Rush", 50, { air: 1, fire: 1, chaos: 2, death: 2 }, 13, 30, { smoke: true, poison: 2 }),
  A(337, "Shadow Rush", 52, { air: 1, soul: 1, chaos: 2, death: 2 }, 14, 31, SHADOW_LOW),
  A(333, "Blood Rush", 56, { blood: 1, chaos: 2, death: 2 }, 15, 33, { lifesteal: 0.25 }),
  A(325, "Ice Rush", 58, { water: 2, chaos: 2, death: 2 }, 18, 34, { freeze: 8 }),
  A(330, "Smoke Burst", 62, { air: 2, fire: 2, chaos: 4, death: 2 }, 13, 36, { smoke: true, poison: 2, radius: 1 }),
  A(338, "Shadow Burst", 64, { air: 1, soul: 2, chaos: 4, death: 2 }, 18, 37, { radius: 1, drain: SHADOW_LOW, ticks: 12 }),
  A(334, "Blood Burst", 68, { blood: 2, chaos: 4, death: 2 }, 21, 39, { lifesteal: 0.25, radius: 1 }),
  A(326, "Ice Burst", 70, { water: 4, chaos: 4, death: 2 }, 22, 40, { freeze: 16, radius: 1 }),
  A(331, "Smoke Blitz", 74, { air: 2, fire: 2, blood: 2, death: 2 }, 23, 42, { smoke: true, poison: 4 }),
  A(339, "Shadow Blitz", 76, { air: 2, soul: 2, blood: 2, death: 2 }, 24, 43, { drain: SHADOW_HIGH, ticks: 16 }),
  A(335, "Blood Blitz", 80, { blood: 4, death: 2 }, 25, 45, { lifesteal: 0.25 }),
  A(327, "Ice Blitz", 82, { water: 3, blood: 2, death: 2 }, 26, 46, { freeze: 25 }),
  A(332, "Smoke Barrage", 86, { air: 4, fire: 4, blood: 2, death: 4 }, 27, 48, { smoke: true, poison: 4, radius: 1 }),
  A(340, "Shadow Barrage", 88, { air: 4, soul: 3, blood: 2, death: 4 }, 28, 49, { radius: 1, drain: SHADOW_HIGH, ticks: 16 }),
  A(336, "Blood Barrage", 92, { death: 4, soul: 1, blood: 4 }, 29, 51, { lifesteal: 0.25, radius: 1 }),
  A(328, "Ice Barrage", 94, { water: 6, blood: 2, death: 4 }, 30, 52, { freeze: 33, radius: 1 }),
  /* The eight Ancient teleports. The real places are on the real map; this
     world is its own landmass, so each one lands on the landmark that plays
     the same part here (see src/world.js) - the mine for Paddewwa, the town
     square for Senntisten, the churchyard for Kharyrll, the river for Lassar,
     the goblin camp for Dareeyak, the south-west fields for Carrallangar, the
     far western wilds for Annakarl, the north-east shore for Ghorrock. Every
     `at` is a tile verified walkable in src/world.js, so the landing is exact
     and `castTeleport`'s nearestWalkable never has to move you. */
  AP(341, "Paddewwa Teleport", 54, { law: 1, air: 1, fire: 1 }, 64, [98.5, 71.5], "Paddewwa"),
  AP(342, "Senntisten Teleport", 60, { law: 2, soul: 1 }, 70, [62.5, 57.5], "Senntisten"),
  AP(343, "Kharyrll Teleport", 66, { law: 2, blood: 1 }, 76, [47.5, 71.5], "Kharyrll"),
  AP(344, "Lassar Teleport", 72, { law: 2, water: 4 }, 82, [32.5, 72.5], "Lassar"),
  AP(345, "Dareeyak Teleport", 78, { law: 2, air: 3, fire: 1 }, 88, [66.5, 109.5], "Dareeyak"),
  AP(346, "Carrallangar Teleport", 84, { law: 2, soul: 2 }, 94, [44.5, 78.5], "Carrallangar"),
  AP(347, "Annakarl Teleport", 90, { law: 2, blood: 2 }, 100, [11.5, 46.5], "Annakarl"),
  AP(348, "Ghorrock Teleport", 96, { law: 2, water: 8 }, 106, [120.5, 30.5], "Ghorrock"),
];

/* The Lunar spellbook's spells, in the cache interface's own order. `kind` is
   what the cast does with itself: "teleport" moves you (or, with `group`, the
   people standing around you once they accept), "item" wants an item clicked,
   "self" is cast on the spot, and "other" wants another player - which this
   world has, over the world server, so those rows are cast rather than refused
   (src/actions.js#castSpellOnPlayer). A row may also carry a `refuses`: its own
   words for something this world cannot do at all.

   Recharge Dragonstone's own cell is this world's invention: the cache's
   interface 430 carries thirty-nine cells and none for it, so the fortieth -
   the first empty slot of the last row - is placed by hand, and its icon is
   invented art too (src/tools/cache-bake/frame.mjs#CUSTOM_SPELLS). */
const L = (id, name, level, cost, xp, kind, extra) => T(id, name, level, cost, kind,
  Object.assign({ book: "lunar", xp }, extra || {}));
const LT = (id, name, level, cost, xp, at, place) => L(id, name, level, cost, xp, "teleport", { at, place });
const LG = (id, name, level, cost, xp, at, place) => L(id, name, level, cost, xp, "teleport", { at, place, group: true });

export const LUNAR_SPELLS = [
  /* combat/support */
  L(577, "Monster Examine", 66, { astral: 1, cosmic: 1, mind: 1 }, 61, "npc"),
  L(559, "Cure Other", 68, { astral: 1, law: 1, earth: 10 }, 65, "other"),
  L(562, "Cure Me", 71, { astral: 2, law: 1, cosmic: 2 }, 69, "self"),
  L(565, "Cure Group", 74, { astral: 2, law: 2, cosmic: 2 }, 74, "other"),
  L(576, "Stat Spy", 75, { astral: 2, cosmic: 1, body: 5 }, 76, "other"),
  L(580, "Dream", 79, { astral: 2, cosmic: 1, body: 5 }, 82, "self"),
  /* The two Potion Shares. Their target is a *potion in the caster's own pack*,
     not a player: the dose is then administered to everybody standing within
     two tiles of the caster - a 5x5, the live spell's own square - who is taking
     aid, and the caster's own dose is free (see
     src/actions.js#castPotionShare). They are `kind: "item"` for that reason,
     which is what routes them to the inventory branch of the lunar dispatch and
     gives them the `SPELL_TARGET.INV` mask the client's own `spellUsableOn`
     field gives them. */
  L(554, "Stat Restore Pot Share", 81, { astral: 2, earth: 10, water: 10 }, 84, "item"),
  L(551, "Boost Potion Share", 84, { astral: 3, earth: 12, water: 10 }, 88, "item"),
  L(558, "Energy Transfer", 91, { astral: 3, law: 2, nature: 1 }, 100, "other"),
  L(560, "Heal Other", 92, { astral: 3, law: 3, blood: 1 }, 101, "other"),
  L(561, "Vengeance Other", 93, { astral: 3, earth: 10, death: 2 }, 108, "other"),
  L(564, "Vengeance", 94, { astral: 4, earth: 10, death: 2 }, 112, "self"),
  L(566, "Heal Group", 95, { astral: 4, law: 6, blood: 3 }, 124, "other"),
  /* teleports */
  LT(544, "Moonclan Teleport", 69, { astral: 2, law: 1, earth: 2 }, 66, [96.5, 49.5], "Moonclan"),
  LG(569, "Tele Group Moonclan", 70, { astral: 2, law: 1, earth: 4 }, 67, [96.5, 49.5], "Moonclan"),
  LT(545, "Waterbirth Teleport", 71, { astral: 2, law: 1, water: 1 }, 71, [30.5, 79.5], "Waterbirth"),
  LG(570, "Tele Group Waterbirth", 73, { astral: 2, law: 1, water: 5 }, 72, [30.5, 79.5], "Waterbirth"),
  LT(547, "Barbarian Teleport", 75, { astral: 2, law: 2, fire: 3 }, 76, [88.5, 47.5], "the Barbarian Village"),
  LG(571, "Tele Group Barbarian", 76, { astral: 2, law: 2, fire: 6 }, 77, [88.5, 47.5], "the Barbarian Village"),
  LT(549, "Khazard Teleport", 78, { astral: 2, law: 2, water: 4 }, 80, [66.5, 109.5], "Khazard"),
  LG(572, "Tele Group Khazard", 79, { astral: 2, law: 2, water: 8 }, 81, [66.5, 109.5], "Khazard"),
  LT(555, "Fishing Guild Teleport", 85, { astral: 3, law: 3, water: 10 }, 89, [32.5, 72.5], "the Fishing Guild"),
  LG(573, "Tele Group Fishing Guild", 86, { astral: 3, law: 3, water: 14 }, 90, [32.5, 72.5], "the Fishing Guild"),
  LT(556, "Catherby Teleport", 87, { astral: 3, law: 3, water: 10 }, 92, [62.5, 80.5], "Catherby"),
  LG(574, "Tele Group Catherby", 88, { astral: 3, law: 3, water: 15 }, 93, [62.5, 80.5], "Catherby"),
  LT(557, "Ice Plateau Teleport", 89, { astral: 3, law: 3, water: 8 }, 96, [120.5, 30.5], "the Ice Plateau"),
  LG(575, "Tele Group Ice Plateau", 90, { astral: 3, law: 3, water: 16 }, 97, [120.5, 30.5], "the Ice Plateau"),
  /* skilling */
  L(543, "Bake Pie", 65, { astral: 1, fire: 5, water: 4 }, 60, "item"),
  L(553, "Fertile Soil", 83, { astral: 3, earth: 15, nature: 2 }, 87, "item"),
  L(567, "Cure Plant", 66, { astral: 1, earth: 8 }, 66, "item"),
  L(568, "NPC Contact", 67, { astral: 1, cosmic: 1, air: 2 }, 63, "self"),
  L(578, "Humidify", 68, { astral: 1, water: 3, fire: 1 }, 65, "item"),
  L(579, "Hunter Kit", 71, { astral: 2, earth: 2 }, 70, "self"),
  L(548, "Superglass Make", 77, { astral: 2, fire: 6, air: 10 }, 78, "item"),
  L(550, "String Jewellery", 80, { astral: 2, earth: 10, water: 5 }, 83, "item"),
  L(552, "Magic Imbue", 82, { astral: 2, fire: 7, water: 7 }, 86, "self"),
  L(581, "Plank Make", 86, { astral: 2, nature: 1, earth: 15 }, 90, "item"),
  L(584, "Recharge Dragonstone", 89, { soul: 1, astral: 1, water: 4 }, 97, "item"),
  L(582, "Spellbook Swap", 96, { astral: 3, cosmic: 2, law: 1 }, 130, "self"),
];

/* ------------------------------------------------- what a cast looks like

   The cache has no "cast a spell" data of its own: in the live game the server
   sends the sequence id with each cast, exactly as it does for an attack. The
   preserved content scripts (LostCityRS/Content branch 274) are the record of
   which sequence, spotanim and height each spell uses, and the ids in them
   match this cache revision - `data=anim,human_caststrike`,
   `data=spotanim_origin,windstrike_casting`, `data=spotanim_proj,
   windstrike_travel,43,31,...`, `data=spotanim_target,windstrike_impact,124`
   in pack/magic_combat_spells.dbrow. The sequence *names* map to the ids baked
   into the player models by src/tools/cache-bake/bake.mjs#CAST_ANIMS, and the
   spotanim names to the ids in src/models/gfx.json.

   Heights are in the client's own units (128 to a tile). The two `spotanim_proj`
   height numbers are packet bytes and the client multiplies them by 4 - the
   strike arc's `43,31` is 172 and 124 units, and the impact's own height in the
   dbrow is the same 124, so a projectile leaves the caster's shoulder and lands
   on the target's chest. A caster's own graphic is given in whole units instead
   (`spotanim_pl(gfx, 92, 0)`), where 92 is the client's standard mid-body
   height - the same 92 every `player.graphics(id, 92, 0)` in the game uses.

   `on` is the targeting mask the client itself uses (the interface's
   spellUsableOn field): which things a spell may be aimed at. 0 means the spell
   is cast on the spot, which is how teleports, Charge and Bones to Bananas
   work.

   When the ball leaves the hands. A cast is two beats, not one: the pose gathers
   the spell in the caster's hands, and only then does the missile appear there
   and fly. The content's `spotanim_proj` rows carry the gap between the two as
   its third number - `data=spotanim_proj,windstrike_travel,43,31,51,16,-5,64,10`
   is (startHeight, endHeight, *delay* in client cycles, angle, length, offset,
   step) - and it is the same 51 for the whole strike/bolt/blast/wave/curse/bind/
   confuse family. The flight itself then lasts `length + range*step` cycles. So
   the client's own timeline for a strike cast is: pose starts, 51 cycles
   (1.02 s) of gathering, and only then the travel graphic is *created* at the
   caster and sent on its way. Launching it at the same instant as the pose (as
   this used to) makes the gathering and the throw happen together, which reads
   as the ball being fired before the hands have finished moving. */
export const PROJ_DELAY_CYCLES = 51;

/* When the god-cast pose lets its strike go, in client cycles. `cast_god` runs
   100 cycles and holds the arms-up release frame from offset 64 onwards, so
   that is the frame the god's own graphic belongs on. There is no missile in
   the `spotanim_proj` sense - the content gives the god spells only a
   `spotanim_target` - so src/combat.js#castAt flies a hidden carrier projectile
   with this delay purely so the burst lands then, and the damage lands with it.
   Landing on the cast frame instead (as this used to) puts the strike behind
   the whole two-second animation, which reads as the game waiting for it. */
export const GOD_END_DELAY_CYCLES = 64;

/* How long Tele Block holds somebody's teleports down: the live spell's five
   minutes, in this world's 0.6 s ticks. The timer lives on the target's own
   player state and is what src/actions.js#castOnSelf refuses a teleport on -
   Tele Block is the only spell in the game that stops another spell. */
export const TELEBLOCK_TICKS = 500;

/* strike / bolt / blast: one pose, one arc, one splash. */
const STRIKE = {
  anim: "cast_strike", staffAnim: "cast_strike_staff",
  projStart: 172, projEnd: 124, endH: 124, projDelay: PROJ_DELAY_CYCLES,
  autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER,
};
/* the wave spells hold the pose a beat longer */
const WAVE = Object.assign({}, STRIKE, { anim: "cast_wave", staffAnim: "cast_wave_staff" });
/* curses and the bind line are cast, not auto-repeated: `continue_by_autocast`
   is false for every one of them in the cache's spell table. */
const CURSE = {
  projStart: 172, projEnd: 124, endH: 124, projDelay: PROJ_DELAY_CYCLES,
  autocast: false, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER,
};
const SOFT_CURSE = Object.assign({}, CURSE, { projStart: 144 });
const BIND = {
  anim: "cast_bind", staffAnim: "cast_bind_staff",
  projStart: 180, projEnd: 0, endH: 124, projDelay: PROJ_DELAY_CYCLES,
  autocast: false, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER,
};
/* the self-cast teleports: the arms-raise vanish, with the arrival played
   backwards on the far side */
const TELEPORT = { anim: "cast_teleport", start: 111, startH: 92, arrive: "cast_arrive" };

/* Teleother: the one teleport in the book that moves somebody *else*. It has a
   pose and a pair of graphics of its own, and neither is the standard
   teleport's - the cache names them (`human_teleport_other_casting` 1818,
   `teleport_other_casting` 1817 / `teleport_other_impact` 1813 = spotanims 343
   and 342), and playing the ordinary vanish here would show the caster
   leaving, which is the one thing a Teleother does not do. The caster holds the
   swirl over their own head; the target wears the matching one as they go, and
   the target's own client is what plays that half (see
   src/actions.js#applyRemoteSpell). */
const TELEOTHER = {
  anim: "cast_teleother", start: 343, startH: 92, end: 342, endH: 92,
  autocast: false, on: SPELL_TARGET.PLAYER,
};

/* Tele Block: the other spell aimed at a player that is not the Lunar book's.
   RuneLite's animation list gives it a pose of its own with a staff variant
   (`human_casting_tele_block` 1819 / `..._staff` 1820 - the only one of the two
   that has one) and a travel/impact pair (spotanims 344/345, recovered from the
   sequence ids `TELE_BLOCK_TRAVEL`/`TELE_BLOCK_IMPACT`). Its missile leaves the
   caster's shoulder the way every other missile does - see PROJ_DELAY_CYCLES. */
const TELEBLOCK = {
  anim: "cast_teleblock", staffAnim: "cast_teleblock_staff",
  proj: 344, projStart: 172, projEnd: 124, end: 345, endH: 124,
  projDelay: PROJ_DELAY_CYCLES, autocast: false, on: SPELL_TARGET.PLAYER,
};

/* Crumble Undead is the one damage spell on a row of the content's spell table
   by itself: `spotanim_proj,ibanblast_travel,31,31,46,16,0,64,5` - a 46-cycle
   gather, and a ball that leaves the hands from 124 units up. The two undead
   spells this world adds on top of the book (Shatter and Pulverize, ids 71 and
   72 - see the note in SPELLS) have no content row at all, so they borrow
   crumble's whole presentation: the same pose, the same gathering ball, the
   same travel and the same impact.

   They do not, however, share its colour. The content bakes one white dust
   burst, and three spells throwing the same white graphic is three spells that
   look like one. `tint` multiplies every face of the graphic (see
   src/models3d.js#buildMesh), so the whole three-beat sequence - the ball in
   the caster's hands, the missile, the burst - arrives in the spell's own
   colour: yellow for Shatter, ice blue for Pulverize. The tint rides the spell
   record, so every caller that plays one of its graphics passes it through
   (src/combat.js and src/magic.js#beginCast), and the miss splash is coloured
   to match so a splash still reads as the spell you threw. Crumble keeps the
   content's own white.

   The three also skip the gather ball's ride: the ball is played pinned where
   the cast began instead of merged into the caster's turning body (see
   `pinStart` in `beginCast`) - the user's call, and the body itself still turns
   to the target as every cast does. */
const CRUMBLE = Object.assign({}, STRIKE, {
  anim: "cast_crumble", staffAnim: "cast_crumble_staff",
  start: 145, proj: 146, end: 147, projStart: 124, projEnd: 124,
  projDelay: 46, pinStart: true,
});
const SHATTER = Object.assign({}, CRUMBLE, { tint: 0xffd21e });
const PULVERIZE = Object.assign({}, CRUMBLE, { tint: 0x7fdcff });

export const SPELL_FX = {
  /* Lumbridge Home Teleport - the two-handed teleport of the free spell */
  356: { anim: "cast_teleport2", start: 111, startH: 92, arrive: "cast_arrive" },
  /* Cairn Isle Teleport (src/magic.js#SPELLS, Magic 1). A destination of this
     world's own, and its presentation is the standard book's teleport to the
     letter: `TELEPORT` above is the arms-raise vanish every other teleport in
     the book uses, and the free spell's two-handed variant is the free spell's
     alone. Nothing here is invented - 111 is the gather graphic the era's own
     teleports play in the caster's hands (see the note on this table's
     `start`). */
  366: Object.assign({}, TELEPORT),
  15: Object.assign({}, STRIKE, { start: 90, proj: 91, end: 92 }),
  16: Object.assign({}, SOFT_CURSE, { anim: "cast_confuse", staffAnim: "cast_confuse_staff", start: 102, proj: 103, end: 104 }),
  /* Enchant Crossbow Bolt is the one spell in the book whose *pose* and graphic
     belong to what it is aimed at rather than to the spell: the live content
     plays `human_xbow_enchant_arrowtip` (4462) over the bolts with the
     `enchanting_tips` graphic (spotanim 759) in the caster's hands, which is a
     different motion from the amulet enchant the level-1 row uses. Its runes
     depend on the gem too - see src/items.js#BOLT_ENCHANT and
     src/actions.js#boltEnchantSpell, which builds the effective spell. The
     graphic's own height is low because the burst is authored well above its
     origin (measured live: the spark cluster hangs ~1.13 tiles over it), so an
     origin at the caster's feet puts the firework itself in the raised hands,
     where the bolts are held - a mid-body origin detonates it over the head. */
  358: { anim: "cast_enchant_bolt", start: 759, startH: 28, autocast: false, on: SPELL_TARGET.INV },
  17: Object.assign({}, STRIKE, { start: 93, proj: 94, end: 95 }),
  /* The Enchant spells' gfx are the gem-coloured swirl over the item in your
     hand. Enchanting a *ring* is a different pose in the content
     (`human_cast_enchantring`, anim 931) and carries its own graphic
     (`enchant_ring`, spotanim 238); both are baked, and both are played when the
     target item is a ring (see RING_ENCHANT below and src/actions.js#castSpell). */
  18: { anim: "cast_enchant1", start: 114, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  19: Object.assign({}, STRIKE, { start: 96, proj: 97, end: 98 }),
  20: Object.assign({}, SOFT_CURSE, { anim: "cast_weaken", staffAnim: "cast_weaken_staff", start: 105, proj: 106, end: 107 }),
  21: Object.assign({}, STRIKE, { start: 99, proj: 100, end: 101 }),
  22: { anim: "cast_bones", start: 141, startH: 92, autocast: false, on: 0 },
  23: Object.assign({}, STRIKE, { start: 117, proj: 118, end: 119 }),
  24: Object.assign({}, CURSE, { anim: "cast_curse", staffAnim: "cast_curse_staff", start: 108, proj: 109, end: 110 }),
  319: Object.assign({}, BIND, { start: 177, proj: 178, end: 181 }),
  25: { anim: "cast_alchemy_low", start: 112, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  26: Object.assign({}, STRIKE, { start: 120, proj: 121, end: 122 }),
  27: Object.assign({}, TELEPORT),
  28: { anim: "cast_enchant2", start: 115, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  29: Object.assign({}, STRIKE, { start: 123, proj: 124, end: 125 }),
  30: Object.assign({}, TELEPORT),
  31: { anim: "cast_telegrab", start: 142, startH: 92, proj: 143, projStart: 140, projEnd: 0, end: 144, endH: 0, autocast: false, on: SPELL_TARGET.GROUND,
        /* `coord_projectile(coord, obj_coord, null, 35, 0, 48, 16, -2, 64, 10)` -
           the grab's own rows put its launch one beat earlier than the strikes */ projDelay: 48 },
  /* Greater Telekinetic Grab: the standard grab's whole three-beat sequence -
     the gather in the hands, the missile, the burst - read through a red tint
     instead of the content's purple, the same `tint` rule the undead line uses
     above (src/actions.js#castGrab threads it through the flight and the
     landing, src/magic.js#beginCast through the gather). */
  367: { anim: "cast_telegrab", start: 142, startH: 92, proj: 143, projStart: 140, projEnd: 0, end: 144, endH: 0, autocast: false, on: SPELL_TARGET.GROUND,
        tint: 0xff0000, projDelay: 48 },
  32: Object.assign({}, STRIKE, { start: 126, proj: 127, end: 128 }),
  33: Object.assign({}, TELEPORT),
  34: CRUMBLE,
  71: SHATTER,
  72: PULVERIZE,
  355: Object.assign({}, TELEPORT),
  35: Object.assign({}, STRIKE, { start: 132, proj: 133, end: 134 }),
  36: { anim: "cast_superheat", start: 148, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  37: Object.assign({}, TELEPORT),
  38: Object.assign({}, STRIKE, { start: 135, proj: 136, end: 137 }),
  39: { anim: "cast_enchant3", start: 116, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  53: Object.assign({}, STRIKE, { anim: "cast_iban", staffAnim: "cast_iban", start: 87, proj: 88, end: 89, projStart: 144 }),
  /* Iban's Superior Blast is what our Iban himself throws: his cast_iban
     pose and doubled hand-charge (see the second layer in
     src/magic.js#beginCast), a hidden carrier flown over the pose's release
     frame instead of a missile, and the big red ground strike (83) erupting
     under every victim - src/combat.js#superiorBlastNova lands it on the
     nearest 6 creatures in the landing tile's 7x7. */
  73: { anim: "cast_iban", staffAnim: "cast_iban", start: 87, proj: null, end: 83, endH: 0,
        endDelay: PROJ_DELAY_CYCLES, autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER },
  320: Object.assign({}, BIND, { start: 177, proj: 178, end: 180 }),
  54: Object.assign({}, TELEPORT),
  40: Object.assign({}, STRIKE, { start: 138, proj: 139, end: 140 }),
  41: { anim: "cast_alchemy_high", start: 113, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  42: { anim: "cast_orb", start: 149, startH: 92, autocast: false, on: SPELL_TARGET.LOC },
  /* Charge Water Orb's gfx is the water obelisk's own swirl, and so on for the
     other three - see the content's `convertobj` rows. */
  43: { anim: "cast_enchant1", start: 153, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  55: Object.assign({}, TELEPORT),
  44: Object.assign({}, STRIKE, { start: 129, proj: 130, end: 131 }),
  45: { anim: "cast_orb", start: 151, startH: 92, autocast: false, on: SPELL_TARGET.LOC },
  354: { anim: "cast_bones", start: 141, startH: 92, autocast: false, on: 0 },
  /* The god spells have no projectile at all - the god's own graphic lands on
     the victim where it stands. It lands on the pose's release frame and not
     on the cast, so the animation plays out before the strike falls: see
     GOD_END_DELAY_CYCLES above. */
  61: { anim: "cast_god", end: 76, endH: 128, endDelay: GOD_END_DELAY_CYCLES, autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER },
  60: { anim: "cast_god", end: 77, endH: 96, endDelay: GOD_END_DELAY_CYCLES, autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER },
  59: { anim: "cast_god", end: 78, endH: 0, endDelay: GOD_END_DELAY_CYCLES, autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER },
  323: Object.assign({}, TELEPORT),
  46: Object.assign({}, WAVE, { start: 158, proj: 159, end: 160 }),
  47: { anim: "cast_orb", start: 152, startH: 92, autocast: false, on: SPELL_TARGET.LOC },
  357: Object.assign({}, TELEPORT),
  48: Object.assign({}, WAVE, { start: 161, proj: 162, end: 163 }),
  49: { anim: "cast_orb", start: 150, startH: 92, autocast: false, on: SPELL_TARGET.LOC },
  56: Object.assign({}, CURSE, { anim: "cast_curse", staffAnim: "cast_curse_staff", start: 167, proj: 168, end: 169 }),
  50: { anim: "cast_enchant2", start: 154, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  51: Object.assign({}, WAVE, { start: 164, proj: 165, end: 166 }),
  57: Object.assign({}, SOFT_CURSE, { anim: "cast_enfeeble", staffAnim: "cast_enfeeble_staff", start: 170, proj: 171, end: 172 }),
  349: Object.assign({}, TELEOTHER),
  52: Object.assign({}, WAVE, { start: 155, proj: 156, end: 157 }),
  321: Object.assign({}, BIND, { start: 177, proj: 178, end: 179 }),
  58: Object.assign({}, SOFT_CURSE, { anim: "cast_stun", staffAnim: "cast_stun_staff", start: 173, proj: 174, end: 175 }),
  /* Charge: the god-cast pose with the teleport swirl held overhead - the
     content plays it at 128 units (a tile up, above the caster's head) after a
     32-cycle delay, `spotanim_pl(teleport_casting, 128, 32)`. */
  322: { anim: "cast_god", start: 111, startH: 128, startDelay: 32, autocast: false, on: 0 },
  350: Object.assign({}, TELEOTHER),
  352: Object.assign({}, TELEBLOCK),
  /* Lvl-6 Enchant (onyx) is the one enchant with no `convertobj` row to read:
     it came with the Mage Training Arena, after the branch of the content this
     table's ids come from. Its graphic is the sixth of the enchant swirls all
     the same, though, and this revision has it: spotanim **452** = model 3113
     animated by sequence **2718**, and the era's own sequence pack names 2718
     `enchant_amulet2_lvl6` (the family is 114/115/116, 153/154, 452). The row
     used to wear 154 - the *dragonstone* swirl - so an onyx enchant showed the
     wrong gem's effect. */
  353: { anim: "cast_enchant3", start: 452, startH: 92, autocast: false, on: SPELL_TARGET.INV },
  351: Object.assign({}, TELEOTHER),
};

/* The animation and graphic the Enchant spells use when the thing in the hand
   is a *ring*. The content names them separately from the amulet pair
   (`human_cast_enchantring` = anim 931, `enchant_ring` = spotanim 238) because
   the gem is held differently, and both are in cache 241; src/actions.js picks
   this pair when the enchant's target item sits in the ring slot. */
export const RING_ENCHANT = { pose: "cast_enchant_ring", gfx: 238 };

/* ---------------------------------------------------- the other books' looks

   Ancient Magicks. Every one of the sixteen combat spells plays one of two
   poses - the one-handed gather (1978, the Rush and Blitz tiers) or the
   two-handed burst (1979, the Burst and Barrage tiers) - and then the spell's
   own graphic arrives on the victim. The Rush and Blitz tiers throw a graphic
   that is *seen crossing the gap* (`spotanim_proj`); the Burst and Barrage
   tiers have no travelling graphic at all, only the burst on the target's tile,
   so they fly a hidden carrier for the cast's 43 cycles and let the burst fall
   where the pose releases it (the same trick the god spells use, see
   `endDelay` in src/combat.js#castAt). All sixteen can be autocast.

   The spotanim ids are Asteria-3.0's own (`BLOOD_BLITZ.endGraphic() = 375`,
   `ICE_BARRAGE = 369`, ...).

   Heights. The ancient impacts are *ground* effects, not chest ones: the ice
   spells' models are authored hanging below their own origin (Ice Barrage's
   gfx 369 reaches 512 client units - four whole tiles - below it, so that the
   block erupts out of the ground of whatever tile it is played on) and the
   shadow/smoke/blood bursts the same. Their `endH` is therefore 0 and not the
   124 a strike's burst uses - played at a human's chest, a four-tile ice
   formation stands a tile clear of the ground and towers over the victim
   instead of swallowing it. The travelling graphics keep 172/124 (shoulder to
   chest: those are the ones actually crossing the gap). */
const ANCIENT = {
  anim: "cast_ancient", staffAnim: "cast_ancient",
  projStart: 172, projEnd: 124, endH: 0, projDelay: 43,
  autocast: true, on: SPELL_TARGET.NPC | SPELL_TARGET.PLAYER,
};
const ANCIENT_BURST = Object.assign({}, ANCIENT, {
  anim: "cast_ancient_burst", staffAnim: "cast_ancient_burst", projDelay: null, endDelay: 43,
});
/* Each ancient spell's own spotanims, off the Asteria table: `proj` is the
   graphic that crosses the gap, `end` the one that falls on the victim. The
   four tiers come in pairs by pose - Rush and Blitz are thrown one-handed
   (1978, `zaros_casting`) at a single victim, Burst and Barrage are gathered
   two-handed (1979, `zaros_vertical_casting`) and land on a 3x3 - so `burst`
   picks the pose; the projectile follows from the tier and not from the pose.

   ## The one row Asteria gets wrong, and how the cache settles it

   Asteria is right about fifteen of the sixteen. Its Ice Blitz row is not: it
   gives the spell no travelling graphic and the *burst* block for its impact,
   and this table followed it - Ice Blitz wore the 3x3-sized eruption on a
   single-target spell, Ice Burst the blitz's smaller one, and Ice Blitz threw
   nothing at all while its seven sibling Rush/Blitz spells all flew a
   projectile. The cache and Jagex's own names both say otherwise, and they
   agree with each other down to the sequence ids:

     spotanim **362** = model 6384 animated by sequence **1960** - ice_blitz_travel
     spotanim **363** = model 6383 animated by sequence **1961** - ice_blitz_impact
     spotanim **367** = model 6385 animated by sequence **1963** - ice_burst_impact

   (the sequence names are LostCityRS/Content's own - the `ice_*` block at
   1958-1985 - and `gameval.SpotanimID` names the three spotanims
   `ICE_BLITZ_TRAVEL`, `ICE_BLITZ_IMPACT` and `ICE_BURST_IMPACT`.) So the Blitz
   row is fixed below, and the `ANCIENT_END` row that used to exist for it -
   the one-handed pose with the impact popped when the release frame arrived -
   is gone with it: no ancient spell is short a graphic.

   The burst and barrage *travel* graphics this revision also has - spotanims
   366 (`ice_burst_travel`, model 1204, which Enakhra's own `ENAKH_ICE_BURST_
   TRAVEL` 540 reuses) and 368, 388/390 for smoke, each pointing at its own
   1962/1964/1984/1986 sequence - and they are *not* flown here: those four
   tiers land their 3x3 burst on the far side when the pose releases (see
   ANCIENT_BURST above), which is how the Asteria table has them and how the
   build has always played them. */
const ANCIENT_GFX = {
  329: { proj: 384, end: 385 },   /* Smoke Rush     */
  337: { proj: 378, end: 379 },   /* Shadow Rush    */
  333: { proj: 372, end: 373 },   /* Blood Rush     */
  325: { proj: 360, end: 361 },   /* Ice Rush       */
  331: { proj: 386, end: 387 },   /* Smoke Blitz    */
  339: { proj: 380, end: 381 },   /* Shadow Blitz   */
  335: { proj: 374, end: 375 },   /* Blood Blitz    */
  327: { proj: 362, end: 363 },  /* Ice Blitz      */
  330: { burst: true, end: 389 }, /* Smoke Burst    */
  338: { burst: true, end: 382 }, /* Shadow Burst   */
  334: { burst: true, end: 376 }, /* Blood Burst    */
  326: { burst: true, end: 367 }, /* Ice Burst      */
  332: { burst: true, end: 391 }, /* Smoke Barrage  */
  340: { burst: true, end: 383 }, /* Shadow Barrage */
  336: { burst: true, end: 377 }, /* Blood Barrage  */
  328: { burst: true, end: 369 }, /* Ice Barrage    */
};

/* Lunar. The book's own cast is one shared two-handed animation (4413 in the
   live game's animation list); its teleports are the same arms-raise vanish the
   standard book uses, and the arrival is played backwards, exactly like the
   standard book's. */
const LUNAR = { anim: "cast_lunar", autocast: false };
/* The Lunar teleports, one family for all fourteen of them (the seven
   destinations and their seven Tele Group twins). They raise the arms and
   vanish exactly as the standard book's do - `cast_teleport` (714) and the
   `cast_arrive` (715) played backwards on the far side - and the only thing
   that makes them Lunar
   is the **graphic**: spotanim 747 (`LUNAR_TELEPORT_SPOTANIM` in the cache's own
   names, model 16827), not the standard book's 111.

   **The pose is deliberately the standard one.** This row used to name 4423 as
   the caster's pose, on the strength of `gameval.AnimationID` calling 4423
   `LUNAR_TELEPORT` - and 4423 is not a player animation at all. It is spotanim
   747's *own* animation: its keyframes sit on framemap 1036, the graphic's
   skeleton, not framemap 0 (see `src/tools/cache-bake/bake.mjs#checkCastAnims`,
   which now refuses the whole table if a pose is not human). Played on a body,
   a graphic's bone ids deform it instead of animating it - the caster squashed
   and stretched into a thin pillar for the whole cast. The complete evidence
   that 714 is right and nothing else could be: (a) there is no other
   `LUNAR_TELEPORT`-shaped name in `gameval.AnimationID`; (b) the whole lunar
   sequence batch 4409-4432 contains no framemap-0 animation that lifts or
   shrinks the caster the way the wiki clip's teleport does; and (c) the era's
   own content ran one teleport proc for every book - `human_castteleport`, the
   same 714 - with only the spotanim differing (`spotanim_pl(teleport_casting,
   92, 0)` in the preserved scripts). The Lunar teleport was always "the
   standard arms-raise with the lunar swirl" - which is exactly what the wiki's
   own Lunar-teleport clip shows, and what casting it here now plays. */
const LUNAR_TELE = Object.assign({}, TELEPORT, { start: 747 });

/* The Ancient Magicks' own teleport, and the reason it is not the standard
   book's. The era's proc is in Asteria-3.0's `Spellbook.ANCIENT` - the same
   source this file's whole Ancient table comes from - and it is the standard
   book's *shape* with its own two ids in it:

     NORMAL   animation(714) ... graphic(308, 100) ... animation(715); move()
     ANCIENT  animation(1979) ... graphic(392)     ...                     move()

   So an Ancient teleport is three things and none of them is 714 or 111:

     * **The two-handed ancient pose, 1979.** There is no separate "ancient
       teleport" body animation in this revision and none in the live game's
       animation list either (RuneLite names no such sequence, and the ids either
       side of 1979 are the ice-climbing minigame's) - the Ancients really do
       teleport with the same two-handed gather the Burst and Barrage spells
       cast with. It is already baked, as `cast_ancient_burst`, so this row
       points at that name rather than duplicating the sequence.
     * **Graphic 392**, on the caster, at the caster's own feet. Its def is model
       6404 animated by sequence 1988 - the block column that assembles around
       the caster and sinks away again - and it is played a tick in
       (`startDelay`, the content's stage 2), not on the cast frame. The height
       is **0** and not the standard book's 92: the content passes no height at
       all (`new Graphic(392)`), and it is a ground effect that grows out of the
       tile - the same reason every Ancient impact in this file is played at
       `endH: 0`.
       The delay is half a client tick (15 cycles): the column is a *tall* effect
       and the caster is gone three ticks after the pose is raised (`holdTicks`),
       so starting it half a second late would leave the bottom of the
       animation - the part that actually rises past the caster - arriving after
       the jump rather than before it.
     * **Nothing at all on the far side.** The standard book plays its own
       reverse pose (715) and its ball again, read backwards, when the caster
       lands; the Ancient proc is a bare `move(position)` - no second animation,
       no second graphic - so this row carries no `arrive`, and the whole
       arrival half of src/actions.js#teleportJump (all of it gated on
       `spell.arrive`) stays out of its way.

   **Why `holdTicks`, and why 3 and not the content's 4.** `cast_teleport` (714)
   carries the vanish in its own keyframes - a type-3 scale collapse on frames
   6-11 - which is what `vanishPoint` times the jump off. 1979 has no scale
   transform on any of its 13 frames (there is nothing to shrink: the caster is
   *covered* by the graphic instead), so the jump is timed off a fixed delay,
   which is what that proc waits (four ticks there). The column itself plays
   **1.5x fast** (`rate`, src/gfx.js#play) - its 114 cycles are over in 76, so
   starting it 15 cycles in it completes at ~91 cycles, just as the jump fires
   at 3 ticks (1.8 s) - and the jump still waits for the animation, exactly as
   the user asked: nothing leaves before the bricks have finished encasing
   them. The two-handed gather itself is 66 cycles (1.32 s), so the caster
   still leaves on the pose's own closing beat, with the column around them.
   See src/actions.js#holdForTeleport.
   **Transparency.** Yes, it has some, and it is the cache's own: model 6404
   authors a base alpha of 32 (of 255 - barely sheer) on every face, and
   sequence 1988 drives labelled fades over it (the column breathing in and
   out as it assembles), which src/models3d.js replays per frame. It renders
   exactly as authored. */
const ANCIENT_TELE = {
  anim: "cast_ancient_burst", staffAnim: "cast_ancient_burst",
  start: 392, startH: 0, startDelay: 15, holdTicks: 3, rate: 1.5,
};

for (const s of ANCIENT_SPELLS) {
  if (s.kind === "teleport") { SPELL_FX[s.id] = Object.assign({}, ANCIENT_TELE); continue; }
  const g = ANCIENT_GFX[s.id] || {};
  const base = g.burst ? ANCIENT_BURST : ANCIENT;
  SPELL_FX[s.id] = Object.assign({}, base, { proj: g.proj == null ? null : g.proj, end: g.end });
}
/* The Rush and Blitz tiers throw a tick late: each missile leaves the caster's
   hands one game tick (30 client cycles) after the family's own 43-cycle
   gather, while its flight is shortened by the same tick so it lands exactly
   when it always did (see `spellTravelSeconds`, which subtracts
   `flightShorten`). At very close range the flight cannot go below a frame, so
   a point-blank throw lands a beat later - a launch cannot run late and land
   on time when the flight is shorter than the delay. `flightShorten` is the
   compensation `spellTravelSeconds` subtracts, so the landing stays fixed. */
for (const id of [329, 337, 333, 325, 331, 339, 335, 327]) {
  Object.assign(SPELL_FX[id], { projDelay: 73, flightShorten: 0.6 });
}
/* The spells of the Lunar book that carry a pose of their own in the cache,
   and the whole reason this table exists. Sixteen do, off
   src/tools/cache-bake/bake.mjs#CAST_ANIMS: the Dream Mentor casts the
   `gameval.AnimationID` names spell-for-spell - 6293 Monster Examine and Stat
   Spy, 6294 Humidify, 6299 Spellbook Swap, 6303 Hunter Kit - plus what the
   narrative record and the sequence archive between them pin down: 4412
   String Jewellery, 4432 Cure Plant, 6298 Plank Make, and the four sequences
   of the book's own support block, 4409-4413.

   The support block is the book's spine and the reason the four touch spells
   read as four spells and not one. 4413 (`MAGIC_LUNAR_SHARED`) is the plain
   two-handed gather: *every* Lunar cast falls back on it, and the live game's
   own users of it - Fertile Soil, the two Potion Shares, NPC Contact, Bake Pie
   - are the ones this table leaves on it. 4411 is the reach-out-and-touch-a-
   player pose the book's support block plays whether the touch is a transfer
   or a boon - Energy Transfer, Vengeance Other, Cure Other and Heal Other - and
   4409 (`QUEST_LUNAR_SPELL_CAST_SPELL_ON_GROUP`) is its group twin, played by
   the two group spells, Cure Group and Heal Group. 4410 is Vengeance's own.

   A message must be careful here: none of 4409/4410/4411 has a
   `LUNAR_...`-shaped name in a modern animation list, because Jagex reauthored
   Vengeance's pose and reused the three old sequences for other things - 4410
   became an unrelated boss attack, 4411 an "energy transfer/vengeance other"
   row. The archaeology that identifies them is that they are the only
   framemap-0 animations in the 4409-4413 batch with lunar-spell user lists,
   and that 8316/8317 (`VENGEANCE_SPELL_ANIM_*`), the modern replacements, are
   absent from cache 241 - so in *this* cache Vengeance really is 4410.

   `DREAM_PLAYER_DREAM_SPELL_READY` (6296) is deliberately not among them: it
   is a held crouch (the sleeper's pose), not a cast, so Dream keeps 4413. */
const LUNAR_POSE = {
  /* ---- the skilling casts: the book's shared 4413, each with its own graphic
     in the caster's hands. The graphics are the cache's own lunar spotanims,
     all authored 100-280 units above their origin, so 92 (`CENTRE_HEIGHT`)
     floats them where the wiki clips show them: a pie held up (746,
     `QUEST_LUNAR_BAKEPIE`, model 16821 @4422), a molten-glass sandstorm (729),
     an imbuing rune (732), the fertile-soil claw (724), Cure Me's sparkle
     (733), Cure Plant's watering can (731) and Humidify's rain cloud (723). */
  543: { start: 746, startH: 92 },       /* Bake Pie         */
  548: { start: 729, startH: 92 },       /* Superglass Make  */
  550: { anim: "cast_lunar_string", start: 730, startH: 92 }, /* String Jewellery */
  /* **Magic Imbue is the one spell in this book whose pose is not 4413**, and
     the one the cache cannot name for us. The only "imbue" animations in a
     modern list are `HUMAN_CAST_SELFIMBUE` (8970) and `SELF_IMBUE` (8982) -
     both authored long after this revision, and *neither is in cache 241*
     (checked; the sequence archive has nothing at 8970), so the post-2007
     motion cannot be baked here at all. What the spell does cast with is the
     **Bones to Bananas** pose, which this revision does have: the live game's
     own Magic Imbue page says outright that "this spell's animation is similar
     to Bones to Bananas and Bones to Peaches", and the wiki's Magic Imbue clip
     matches `cast_bones` (722, `HUMAN_CASTBONESTOBANANAS`) choreography for
     choreography - arms down, out and up, then brought together in front of
     the chest, where the imbuing rune appears and the head tilts back - while
     the shared 4413 the row used to play (hands clasped at the chest, held for
     the best part of five seconds) matches neither. The graphic was already
     right and stays: 732, `QUEST_LUNAR_SPELLBOOK_MAGIC_EMBUE_SPOT_ANIM`.

     Its **height** is the one thing that was wrong, and the user is the one
     who saw it: at the shared 92 the rune floated above the caster's head
     instead of sitting where the bones pose puts their hands together. 732's
     model is authored well above its own origin (the baked bounds reach 1.19
     tiles up from it), so the shared 92 stacks on top of that offset - measured
     against the pose, 92 puts the rune's centre over the head, 0 puts it at
     the hands and anything lower tucks it under them. `-16` (a fifth of a
     tile below the tile the caster stands on) is the number the render was
     checked against: the rune sits between the two hands, which is where the
     wiki's Magic Imbue clip has it. */
  552: { anim: "cast_bones", start: 732, startH: -16, fwd: 0.25 }, /* Magic Imbue */
  553: { start: 724, startH: 92 },       /* Fertile Soil     */
  562: { start: 733, startH: 92 },       /* Cure Me          */
  567: { anim: "cast_lunar_cure_plant", start: 731, startH: 92 }, /* Cure Plant */
  /* Humidify's rain cloud. The Dream Mentor update shipped a graphic named for
     the spell outright (`DREAM_HUMIDIFY_SPELL_SPOTANIM`, spotanim 1061, model
     25009 - baked here too), but the book's own `QUEST_LUNAR_SPELLBOOK_WATER_
     PATCH_SPOT_ANIM` (723, model 16829) is the *same cloud model* as Fertile
     Soil's green one (724) and is the one the wiki's Humidify clip matches: a
     small cloud over the caster's head with rain falling from it. 1061 is the
     bigger, dark storm-cloud version and stays on the shelf. */
  578: { anim: "cast_lunar_humidify", start: 723, startH: 92 },   /* Humidify */

  /* ---- the support block: 4411 to the caster, and a graphic on the body it
     touches. Cure Other wears the cache's `CURE_OTHER`-family sparkle (736),
     Heal Other its green twin (738) - the pair is one model recoloured, the
     same way the live game ships one heal graphic per spell. Vengeance Other
     wears the *plain* skull (725) - see the note on Vengeance below for why
     the two skulls are not the ones their `gameval` names suggest. Energy
     Transfer's swirl (734) is shown in the caster's own hands, because the
     spell *gives* - the energy leaves the caster, so the graphic is on the
     caster and not on the recipient. */
  558: { anim: "cast_lunar_energy", start: 734, startH: 92 },   /* Energy Transfer */
  559: { anim: "cast_lunar_energy", end: 736, endH: 92 },       /* Cure Other    */
  560: { anim: "cast_lunar_energy", end: 738, endH: 92 },       /* Heal Other    */
  561: { anim: "cast_lunar_energy", end: 725, endH: 92 },       /* Vengeance Other */

  /* ---- Vengeance: a pose of its own (4410) and the **red** skull that swoops
     over the caster's own head (**726**), which is what the wiki's
     Vengeance.gif shows - the spell is cast on the caster, so both graphics are
     the caster's. The `end` here and `start` are the same thing to `beginCast`;
     `start` is the one that rides the body.

     **Why 726 and not the 725 `gameval` calls `VENGEANCE`: the names and the
     colours disagree.** `gameval.SpotanimID` names 725 `..._VENGEANCE_...` and
     726 `..._VENGEANCE_OTHER_...`, but the *defs* say the opposite: 725 is
     model 16828 with no recolour and 726 is the same model with
     `recolorToFind [7265] -> recolorToReplace [563]` (a white/grey recoloured
     to a saturated mid red). The live game's Vengeance skull is red, so
     **Vengeance gets 726** and **Vengeance Other gets the plain 725** - the
     order the user's own play (and the wiki clip) confirms. 725 is kept baked
     and on Vengeance Other precisely so the graphic is ready when
     player-targeted spells are next worked on; it is the *plain* skull and
     will not look right until then. */
  564: { anim: "cast_vengeance", start: 726, startH: 92 },      /* Vengeance     */

  /* ---- the group spells: the caster throws the group pose (4409) and the
     halo lands on every player it actually mends (see
     src/actions.js#applyRemoteSpell, which plays it, because the group cast
     names no target for `playerImpact` to draw on). */
  565: { anim: "cast_lunar_group", end: 744, endH: 92 },        /* Cure Group    */
  566: { anim: "cast_lunar_group", end: 745, endH: 92 },        /* Heal Group    */

  /* ---- the Dream Mentor casts. `gameval.AnimationID` names each of their
     *poses* for the spell it belongs to, and the same update shipped a graphic
     for every one of them: `gameval.SpotanimID` names them
     `DREAM_SPELL_MONSTEREXAM_STATSPY_SPOTANIM` (**1059**),
     `DREAM_SPELL_PLAYEREXAM_STATSPY_SPOTANIM` (**1060**),
     `DREAM_HUMIDIFY_SPELL_SPOTANIM` (**1061**), `DREAM_SPELLBOOK_SPOTANIM`
     (**1062**), `DREAM_PLANK_MAKE_SPELL_SPOTANIM` (**1063**) and
     `DREAM_HUNTER_SPELL_SPOTANIM` (**1074**), and all six are in cache 241 -
     models 25016/25017/25009/25012/25011/25010, each animated by its own
     sequence (6306-6309, 6353). Until now these spells played their pose and
     nothing else, so the five that had no graphic at all are given theirs here.
     Stat Spy and Monster Examine are cast on somebody *else*, so theirs are
     `end` - played on the body being looked over, which is exactly what the
     1059/1060 twins are for (the `...PLAYEREXAM...` one is for a player). */
  576: { anim: "cast_lunar_exam", end: 1060, endH: 124 },        /* Stat Spy */
  577: { anim: "cast_lunar_exam", end: 1059, endH: 124 },        /* Monster Examine */
  579: { anim: "cast_lunar_hunter", start: 1074, startH: 92 },   /* Hunter Kit */
  581: { anim: "cast_plank_make", start: 1063, startH: 92 },     /* Plank Make */
  582: { anim: "cast_lunar_book_swap", start: 1062, startH: 92 },/* Spellbook Swap */
};
for (const s of LUNAR_SPELLS) {
  if (SPELL_FX[s.id]) continue;
  if (s.kind === "teleport") { SPELL_FX[s.id] = Object.assign({}, LUNAR_TELE); continue; }
  SPELL_FX[s.id] = Object.assign({}, LUNAR, LUNAR_POSE[s.id] || {});
}

/* ------------------------------------------------------------ the book views

   How each book lays its spells out. The standard book is the computed 7x10
   grid the panel has always drawn (interface 192's own cells, ten rows because
   this world's book has two spells the real one does not). The other two books
   carry the cache interface's exact per-cell coordinates, in the interface's
   own order. Numbers in brackets are the lit sprite ids the interface's
   drained-id cells map onto (drained = lit + 50). */
export const STANDARD_LAYOUT = [];
{
  const std = SPELLS.filter((s) => (s.book || "standard") === "standard");
  std.forEach((s, i) => STANDARD_LAYOUT.push({
    id: s.id,
    x: SPELL_ORIGIN_X + SPELL_CELL * (i % SPELL_COLS),
    y: SPELL_ORIGIN_Y + SPELL_CELL * Math.floor(i / SPELL_COLS),
  }));
}

/* Interface 193, the Ancient Magicks: four columns, and a staggered set of rows
   - the cache places the cells by hand rather than on a grid, so the layout is
   transcribed cell for cell. */
export const ANCIENT_LAYOUT = [
  { id: 356, x: 19, y: 8 },     /* home teleport */
  { id: 329, x: 64, y: 8 },     /* [379] Smoke Rush   */
  { id: 337, x: 110, y: 8 },    /* [387] Shadow Rush  */
  { id: 341, x: 151, y: 8 },    /* [391] Paddewwa     */
  { id: 333, x: 19, y: 36 },    /* [383] Blood Rush   */
  { id: 325, x: 64, y: 36 },    /* [375] Ice Rush     */
  { id: 342, x: 110, y: 36 },   /* [392] Senntisten   */
  { id: 330, x: 151, y: 36 },   /* [380] Smoke Burst  */
  { id: 338, x: 19, y: 64 },    /* [388] Shadow Burst */
  { id: 343, x: 64, y: 64 },    /* [393] Kharyrll     */
  { id: 334, x: 110, y: 64 },   /* [384] Blood Burst  */
  { id: 326, x: 151, y: 64 },   /* [376] Ice Burst    */
  { id: 344, x: 19, y: 92 },    /* [394] Lassar       */
  { id: 331, x: 64, y: 92 },    /* [381] Smoke Blitz  */
  { id: 339, x: 110, y: 92 },   /* [389] Shadow Blitz */
  { id: 345, x: 151, y: 92 },   /* [395] Dareeyak     */
  { id: 335, x: 19, y: 120 },   /* [385] Blood Blitz  */
  { id: 327, x: 64, y: 120 },   /* [377] Ice Blitz    */
  { id: 346, x: 110, y: 120 },  /* [396] Carrallangar */
  { id: 332, x: 151, y: 120 },  /* [382] Smoke Barrage */
  { id: 336, x: 19, y: 148 },   /* [386] Blood Barrage */
  { id: 347, x: 64, y: 148 },   /* [397] Annakarl     */
  { id: 340, x: 110, y: 148 },  /* [390] Shadow Barrage */
  { id: 328, x: 151, y: 148 },  /* [378] Ice Barrage  */
  { id: 348, x: 19, y: 176 },   /* [398] Ghorrock     */
];

/* Interface 430, the Lunar spellbook: a plain 6x7 grid at (8,8) on a 29px
   pitch, with two cells left empty. (This cache revision's lunar book has no
   Geomancy, Tan Leather, Spin Flax or Ourania Teleport - the interface simply
   does not carry their cells, so this world's book does not either.
   Recharge Dragonstone's cell is this world's own fortieth, in the last row.) */
export const LUNAR_LAYOUT = [
  { id: 356, x: 8, y: 8 },      /* [406] home teleport */
  { id: 543, x: 37, y: 8 },     /* [593] Bake Pie */
  { id: 567, x: 69, y: 8 },     /* [617] Cure Plant */
  { id: 577, x: 101, y: 8 },    /* [627] Monster Examine */
  { id: 568, x: 133, y: 8 },    /* [618] NPC Contact */
  { id: 559, x: 163, y: 8 },    /* [609] Cure Other */
  { id: 578, x: 8, y: 37 },     /* [628] Humidify */
  { id: 544, x: 37, y: 37 },    /* [594] Moonclan Teleport */
  { id: 569, x: 69, y: 37 },    /* [619] Tele Group Moonclan */
  { id: 562, x: 101, y: 37 },   /* [612] Cure Me */
  { id: 579, x: 133, y: 37 },   /* [629] Hunter Kit */
  { id: 545, x: 163, y: 37 },   /* [595] Waterbirth Teleport */
  { id: 570, x: 8, y: 66 },     /* [620] Tele Group Waterbirth */
  { id: 565, x: 37, y: 66 },    /* [615] Cure Group */
  { id: 547, x: 101, y: 66 },   /* [597] Barbarian Teleport */
  { id: 576, x: 69, y: 66 },    /* [626] Stat Spy */
  { id: 571, x: 133, y: 66 },   /* [621] Tele Group Barbarian */
  { id: 548, x: 163, y: 66 },   /* [598] Superglass Make */
  { id: 549, x: 8, y: 95 },     /* [599] Khazard Teleport */
  { id: 572, x: 37, y: 95 },    /* [622] Tele Group Khazard */
  { id: 580, x: 69, y: 95 },    /* [630] Dream */
  { id: 550, x: 101, y: 95 },   /* [600] String Jewellery */
  { id: 554, x: 133, y: 95 },   /* [604] Stat Restore Pot Share */
  { id: 552, x: 163, y: 95 },   /* [602] Magic Imbue */
  { id: 553, x: 8, y: 124 },    /* [603] Fertile Soil */
  { id: 551, x: 37, y: 124 },   /* [601] Boost Potion Share */
  { id: 555, x: 69, y: 124 },   /* [605] Fishing Guild Teleport */
  { id: 573, x: 100, y: 123 },  /* [623] Tele Group Fishing Guild (the interface's own 1px offset) */
  { id: 581, x: 133, y: 124 },  /* [631] Plank Make */
  { id: 556, x: 163, y: 124 },  /* [606] Catherby Teleport */
  { id: 574, x: 8, y: 153 },    /* [624] Tele Group Catherby */
  { id: 557, x: 37, y: 153 },   /* [607] Ice Plateau Teleport */
  { id: 575, x: 69, y: 153 },   /* [625] Tele Group Ice Plateau */
  { id: 558, x: 101, y: 153 },  /* [608] Energy Transfer */
  { id: 560, x: 133, y: 153 },  /* [610] Heal Other */
  { id: 561, x: 163, y: 153 },  /* [611] Vengeance Other */
  { id: 564, x: 8, y: 181 },    /* [614] Vengeance */
  { id: 566, x: 37, y: 182 },   /* [616] Heal Group */
  { id: 582, x: 69, y: 182 },   /* [632] Spellbook Swap */
  { id: 584, x: 101, y: 182 },  /* Recharge Dragonstone - this world's own cell */
];

export const BOOKS = [
  { id: "standard", name: "Standard", layout: STANDARD_LAYOUT },
  { id: "ancient", name: "Ancient Magicks", layout: ANCIENT_LAYOUT },
  { id: "lunar", name: "Lunar", layout: LUNAR_LAYOUT },
];

export function bookById(id) {
  return BOOKS.find((b) => b.id === id) || BOOKS[0];
}

/* The splash the game shows when a spell misses, and the height every
   player-centred graphic uses (`player.graphics(id, 92, 0)`). */
export const SPLASH_GFX = 85;
export const CENTRE_HEIGHT = 92;
export const HIT_HEIGHT = 124;

/* The body the content's 124-unit impact height was authored for: the player
   model, whose baked bounds measure 202 units - 1.578125 tiles at the bake's
   1/128 scale (measured live off `ch.height`, and the number every
   `spotanim_target,<spell>_impact,124` in scratch/ref/lc_magic_combat_spells.dbrow
   is written for). A burst at 124 units sits 0.97 of a tile up - a human's
   chest, and more than a whole body above anything small: measured live, a
   chicken's model is 0.620 tiles tall and a cow's is 1.172, so the authored 124
   floats a body and a half over a chicken. */
export const REFERENCE_BODY_TILES = 202 / 128;

/* A spotanim height in the content's units, scaled from the body it was
   authored for to the body it is actually being drawn on. A player-sized
   target gives the authored number back untouched; a chicken's blast comes out
   at its own chest. Linear in the model height because these are body-centred
   effects - a burst belongs at the height on *this* creature that 124 is on a
   human. `target` may be null, in which case the authored height stands. */
export function bodyHeight(units, target) {
  const h = target && target.ch && target.ch.height;
  if (!h) return units;
  return units * (h / REFERENCE_BODY_TILES);
}

/* How high a spell's burst goes when it lands on `target`. The base is the
   spell's own `endH` - or, for a spell that only carries a missile, the
   missile's `projEnd`, which is where the first strike/bolt/blast family's
   height comes from - and it is then scaled to the victim's own body (see
   `bodyHeight`), so a blast lands *on* what it hit instead of on the tile in
   front of it. The god spells' `endH` values are already deliberate (128, 96
   and 0) and scale with the rest. */
export function impactHeight(spell, target) {
  const base = spell.endH == null ? (spell.projEnd != null ? spell.projEnd : HIT_HEIGHT) : spell.endH;
  return bodyHeight(base, target);
}

/* The two extra books join the flat list, so every existing reader of SPELLS -
   the skill guide, the tooltips, `spellById`, the cast refusals - sees the
   whole world's book without a change. This runs after STANDARD_LAYOUT has been
   computed from the standard rows alone (see above). */
SPELLS.push(...ANCIENT_SPELLS, ...LUNAR_SPELLS);

for (const s of SPELLS) {
  const fx = SPELL_FX[s.id];
  if (fx) Object.assign(s, fx);
  /* a spell with no `on` of its own is aimed at whatever it makes sense to aim
     it at: combat spells at creatures, the rest on the spot */
  if (s.on == null) {
    if (s.kind === "npc") s.on = SPELL_TARGET.NPC;
    else if (s.kind === "other") s.on = SPELL_TARGET.PLAYER;
    else if (s.kind === "item") s.on = SPELL_TARGET.INV;
    else if (s.kind === "combat" || s.kind === "stat" || s.kind === "bind") s.on = SPELL_TARGET.NPC | SPELL_TARGET.PLAYER;
    else s.on = 0;
  }
  if (s.autocast == null) s.autocast = s.kind === "combat";
  if (!s.book) s.book = "standard";
}

/* Can this spell be aimed at `what` (a SPELL_TARGET bit)? */
export function usableOn(spell, what) {
  return (spell.on & what) === what;
}

/* Does this spell need a target clicked before it can fire at all? Teleports,
   Charge and Bones to Bananas/Peaches are cast on the spot the moment they are
   picked, which is what `on === 0` means. */
export function isSelfCast(spell) {
  return spell.on === 0;
}

export const spellById = new Map(SPELLS.map((s) => [s.id, s]));
export const PROD_AUTOCAST_IDS = [18, 28, 39, 43, 50, 353, 25, 41, 543, 548, 550, 578, 581, 584];
for (const id of PROD_AUTOCAST_IDS) {
  const s = spellById.get(id);
  if (s) s.prod = true;
}

export function spellName(id) {
  const s = spellById.get(id);
  return s ? s.name : null;
}

/* -------------------------------------------------------------- the runes */

/* element -> the item that pays for it */
export const RUNE_ID = {
  air: "air_rune", water: "water_rune", earth: "earth_rune", fire: "fire_rune",
  mind: "mind_rune", body: "body_rune", chaos: "chaos_rune", death: "death_rune",
  blood: "blood_rune", nature: "nature_rune", law: "law_rune", cosmic: "cosmic_rune",
  astral: "astral_rune", soul: "soul_rune",
};

/* Every rune the world hands out, in the client's own order. */
export const RUNE_IDS = Object.values(RUNE_ID).concat([
  "mist_rune", "dust_rune", "mud_rune", "smoke_rune", "steam_rune", "lava_rune",
]);

/* The smallest set that still casts every spell: mist pays for air or water,
   lava pays for earth or fire, and the rest have no combination form. The
   ::runes command hands out only these, so it costs 12 pack slots instead of
   20 with nothing lost. */
export const RUNES_COMMAND_IDS = Object.values(RUNE_ID)
  .filter((id) => id !== "air_rune" && id !== "water_rune" && id !== "earth_rune" && id !== "fire_rune")
  .concat(["mist_rune", "lava_rune"]);

/* A combination rune is made of two elements and pays for either of them, the
   same as the live game: a mist rune is a water rune *or* an air rune. */
export const COMBINATION_RUNES = {
  mist_rune: ["air", "water"],
  dust_rune: ["air", "earth"],
  mud_rune: ["water", "earth"],
  smoke_rune: ["air", "fire"],
  steam_rune: ["water", "fire"],
  lava_rune: ["earth", "fire"],
};

/* The rune an equipped staff supplies for free (a staff of fire never spends a
   fire rune). `ITEMS[id].rune` links the staff to its rune, and
   `ITEMS[id].runes` is the multi-element form: the Lunar staff is an air, water,
   earth *and* fire staff at once, which is the live game's own rule. */
export function staffRunes(player) {
  const w = weaponOf(player);
  if (!w) return [];
  if (w.runes && w.runes.length) return w.runes;
  return w.rune ? [w.rune] : [];
}

export function staffRune(player) {
  const r = staffRunes(player);
  return r.length ? r[0] : null;
}

/* Elements still owed once the staff has been accounted for. */
export function runeNeeds(player, spell) {
  const free = staffRunes(player);
  const need = {};
  for (const [el, q] of Object.entries(spell.cost)) {
    if (free.includes(RUNE_ID[el])) continue;
    need[el] = q;
  }
  return need;
}

/* Works out exactly which runes a cast would take, so the click handler can
   spend precisely what the check promised. Plain runes are spent first, then
   combination runes cover whatever shortfall is left. */
export function planCast(player, spell) {
  const need = runeNeeds(player, spell);
  const plan = [];
  const short = {};
  for (const [el, q] of Object.entries(need)) {
    const id = RUNE_ID[el];
    const have = invCount(player, id);
    const use = Math.min(have, q);
    if (use > 0) plan.push({ id, qty: use });
    if (have < q) short[el] = q - have;
  }
  for (const [combId, els] of Object.entries(COMBINATION_RUNES)) {
    let left = invCount(player, combId);
    if (!left) continue;
    const owed = els.filter((e) => short[e]).sort((a, b) => short[b] - short[a]);
    for (const el of owed) {
      if (left <= 0) break;
      const use = Math.min(left, short[el]);
      short[el] -= use;
      left -= use;
      plan.push({ id: combId, qty: use });
    }
  }
  const missing = Object.entries(short)
    .filter(([, q]) => q > 0)
    .map(([el, qty]) => ({ el, qty }));
  return { ok: missing.length === 0, missing, plan };
}

export function spendRunes(player, plan) {
  for (const p of plan) invRemove(player, p.id, p.qty);
}

/* Has the level, and the runes, to cast it right now. */
/* The staff ids that gate a spell, if any: `staffIds` when the row carries a
   list (Iban Blast, castable from either Iban staff), else the single
   `staffId` (Iban's Superior Blast, superior staff only). Null means no staff
   gates the spell at all. */
export function spellStaffIds(spell) {
  if (!spell) return null;
  if (Array.isArray(spell.staffIds) && spell.staffIds.length) return spell.staffIds;
  return spell.staffId ? [spell.staffId] : null;
}

/* Has the level, the runes, the staff (for a god spell) to cast it right now.
   The staff check reads the equipped weapon directly rather than importing the
   helper from src/combat.js, because combat.js already imports this module -
   the same reason `weaponOf` lives in player.js. */
export function spellStatus(player, spell) {
  const levelOk = levelOf(player.skills, "magic") >= spell.level;
  const cast = levelOk ? planCast(player, spell) : { ok: false, missing: [], plan: [] };
  /* A god spell cannot be cast at all without its own god staff in hand - the
     staff is the gate, not a bonus (only the staff of light autocasts one). The
     check reads the wielded weapon's own `god` and `kind` rather than three item
     ids, so that a second Saradomin staff - the Lumbridge Guide's, whose row is
     in src/items.js next to the god staves - is a god staff too, and so that any
     future one is a row rather than an edit here. */
  const held = player.equip && player.equip.weapon ? ITEMS[player.equip.weapon.id] : null;
  const wieldedId = player.equip && player.equip.weapon ? player.equip.weapon.id : null;
  const gateIds = spellStaffIds(spell);
  const staffOk = (!spell.god || !!(held && held.kind === "staff" && (held.god === spell.god || held.god === "all"))) &&
    (!gateIds || (wieldedId != null && gateIds.includes(wieldedId)));
  /* What the refusal names when the staff is the missing half: "a Saradomin
     staff" for a god spell, the item's own name for Iban Blast. */
  const needStaff = spell.god ? "a " + godStaffName(spell)
    : (gateIds && ITEMS[gateIds[0]] ? ITEMS[gateIds[0]].name : null);
  /* Tele Block is the one spell that stops another spell, and this is where the
     spellbook can *see* it: a blocked teleport goes drained like one you cannot
     afford, and its tooltip says why (src/ui.js#spellTip). Only the spells that
     move the caster are held down - a Teleother moves somebody else, and Tele
     Block itself is not a teleport at all. */
  const blocked = spell.kind === "teleport" && (player.teleblockTicks || 0) > 0;
  return { levelOk, runesOk: cast.ok, staffOk, needStaff, blocked, ok: levelOk && cast.ok && staffOk && !blocked, missing: cast.missing, plan: cast.plan };
}

/* The name of the staff a god spell needs, for the refusal message. */
export function godStaffName(spell) {
  return spell.god ? spell.god.charAt(0).toUpperCase() + spell.god.slice(1) + " staff" : null;
}

export function canCast(player, id) {
  const s = spellById.get(id);
  return !!s && spellStatus(player, s).ok;
}

/* "<col=...>" coloured list of what is short, for the spell tooltip. */
export function missingText(missing) {
  return missing
    .map((m) => {
      const def = ITEMS[RUNE_ID[m.el]];
      return (m.qty > 1 ? m.qty + " " : "") + (def ? def.name.replace(/ rune$/, "") : m.el) + " runes";
    })
    .join(", ");
}

/* ------------------------------------------------------------ playing a cast

   `beginCast` puts the pose and the caster's own graphic on screen; the cast
   itself (runes, xp, the roll) is the caller's business - src/combat.js for a
   creature, src/actions.js for the book's utility spells. Everything here goes
   through src/gfx.js, which is the only module that knows how to draw a
   spotanim. */

/* The pose to play: the staff variant when a staff is wielded, the bare-hand
   one otherwise. That is the engine's own rule - the spell table carries both
   a `anim` and a `staffanim` and picks by what is held. `who` may be the
   player's entity or the state itself (see player.js#weaponOf). */
export function castAnimFor(who, spell) {
  const w = weaponOf(who);
  const staff = !!(w && (w.rune || w.kind === "staff"));
  return (staff && spell.staffAnim) || spell.anim || null;
}

/* The caster's own graphic - the little ball the spell table calls `start`
   (gfx 90 for Wind Strike) - is drawn on the *caster*, which is where the
   content puts it: `lc_player_magic.rs2` line 168 (and its 2004 twin) plays
   `spotanim_pl(spotanim_origin, 92, 0)` the instant the pose begins, 51 cycles
   before the missile leaves, so a cast shows a ball gather in the caster's
   hands, then a travelling ball, then the burst on the victim. The reference
   capture scratch/ref/fire-strike.gif shows exactly that three-beat read.

   This used to be false, which drew nothing at all on the caster and replayed
   the gather ball on the victim instead; that is what made a cast look like it
   started with a pop of the spell's effect hanging off the person casting it -
   the real fix is to show the content's own beat. The victim's end is
   correspondingly quiet: src/combat.js#bubbleArrives does nothing while this is
   on, because the ball has already been shown leaving the hands.

   Casts with no creature to throw at (the book's utility spells, the
   teleports, Charge) were always drawn on the caster and are unaffected. */
export const START_GFX_ON_CASTER = true;

/* The casting pose plus the caster's graphic. Returns nothing - the callers
   already know their spell. `poseOverride` and `gfxOverride` name a pose and a
   caster graphic to play instead of the spell's own, which is how enchanting a
   *ring* gets the content's separate ring sequence (`cast_enchant_ring`, anim
   931, with the `enchant_ring` swirl, spotanim 238) instead of the amulet pair
   the four Enchant rows carry; src/actions.js passes both when the target item
   is a ring. */
export function beginCast(player, spell, poseOverride, gfxOverride, cdOverride) {
  /* every cast goes through here - a combat spell from src/combat.js and the
     book's utility spells from src/actions.js - so this is the one place the
     cast timer is armed (see `Cast` below), and the one place that can tell a
     cast that really happened from a click that was refused. The second of
     those is what the Spellbook Swap fallback hangs on (see `Cast.onCast`). */
  spendCast(player, cdOverride);
  if (Cast.onCast) Cast.onCast(spell);
  if (spell.anim) playCastAnim(player, poseOverride || castAnimFor(player, spell));
  const start = gfxOverride != null ? gfxOverride : spell.start;
  /* the caster's own ball belongs in the caster's hands, which is where the
     content plays it (see START_GFX_ON_CASTER above); a spell with no `start`
     of its own has nothing to gather */
  if (start != null) {
    /* the caster's own graphic is drawn where the *body* is, not on the tile it
       is walking off: `rx`/`rz` are the interpolated render position, and the
       facing turns the graphic's authored forward offset towards the target.
       It carries the caster as its target so it rides the body if they move
       while the gather plays, the same as a missile in flight. The three
       undead spells are the exception (`pinStart`): their ball is pinned where
       the cast began - no target, so it neither rides the body nor swivels with
       it while the caster turns to face the victim. */
    Gfx.play(start, {
      x: player.rx != null ? player.rx : player.x,
      z: player.rz != null ? player.rz : player.z,
      height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, player),
      delay: spell.startDelay || 0,
      dir: player.dir || 0,
      target: spell.pinStart ? null : player,
      tint: spell.tint,
      fwd: spell.fwd || 0,
      rate: spell.rate || 1,
    });
    /* Iban's Superior Blast carries its mentor's own second charge layer: the
       same gather graphic again, riding over everything at a fiercer rate -
       see src/iban.js#castCharge, which plays this exact pair for his nova. */
    if (spell.id === 73) {
      Gfx.play(start, {
        x: player.rx != null ? player.rx : player.x,
        z: player.rz != null ? player.rz : player.z,
        height: bodyHeight(spell.startH == null ? CENTRE_HEIGHT : spell.startH, player),
        delay: spell.startDelay || 0,
        dir: player.dir || 0,
        target: spell.pinStart ? null : player,
        tint: spell.tint,
        fwd: spell.fwd || 0,
        onTop: true,
        rate: 1.3,
      });
    }
  }
}

/* ----------------------------------------------------------- the cast timer

   How often a spell may be cast is the *weapon's* speed - for a staff, the very
   number the cache gives that staff for timing a melee swing. A caster with
   empty hands (or a blade in them) falls back on the standard five-tick spell
   speed, which is the cast time the content itself sets. The timer is counted
   in game ticks, never in wall-clock seconds, so it stays in step with the rest
   of the simulation: src/combat.js - tickCombat takes one tick off it every
   tick, right where prayers and the Charge buff are drained.

   One timer covers the whole spellbook. A combat cast is armed by the cast
   itself (and src/combat.js makes the attack timer wait for it), a utility
   cast is refused outright while it is running, so nothing at all can be
   spammed by clicking faster than the weapon recovers. */
export const SPELL_SPEED_TICKS = 5;

/* How fast the weapon in hand lets a spell be cast, in ticks.

   The content times a cast at five ticks - `2004_player_magic.rs2` sets
   `%action_delay = add(map_clock, 5)` before the missile is launched - and the
   staves, the weapons that actually cast, carry a speed of five in the cache,
   so the weapon's own `weapon_speed` and the spell's own five ticks agree. So
   the weapon's number is used when the weapon is a casting weapon (the same
   test the casting pose uses, see `castAnimFor`), and the standard five ticks
   otherwise: a blade in the other hand cannot make spells come out faster than
   the spell's own speed. */
export function castSpeed(player) {
  const w = weaponOf(player);
  const staff = !!(w && (w.rune || w.kind === "staff"));
  return Math.max(1, (staff && w.speed) || SPELL_SPEED_TICKS);
}

export const Cast = { cd: 0 };

/* Called by `beginCast` the instant a cast really happens, with the spell that
   was cast. It exists for Spellbook Swap's fallback - the swapped book lasts
   for exactly one spell, and "one spell" has to mean one *cast*, whichever
   module asked for it (src/actions.js#noteSwapCast is the only user). A refused
   click never reaches it, so a spell the player could not afford does not spend
   the swap. */
Cast.onCast = null;

export function castReady() {
  return Cast.cd <= 0;
}

/* Called by `beginCast`, i.e. exactly when a spell's runes leave the pack, so
   the timer always starts at the real cast and not at the click. Jewelry
   enchants recover in two ticks rather than the weapon's five (user,
   2026-10-07): the gather is a flourish over the item in the hand, not a
   missile to throw, and five ticks left a dead pause between casts. */
export function spendCast(player, ticks) {
  Cast.cd = ticks != null ? ticks : castSpeed(player);
}

/* How long a missile takes to cross `dist` tiles, in seconds. This is the
   content's own projectile speed, not a guess: `spotanim_proj` gives each
   graphic a `length` and a per-tile `step`, and a projectile's flight is
   `length + range*step` cycles (the server's own `npc_projectile` proc, which
   is why `spotanim_proj` carries those two numbers at all). The strike family's
   row is `...,16,-5,64,10`, i.e. -5 + range*10, so a creature at arm's length
   is hit 0.1 s after the ball leaves the hands and one ten tiles away after
   1.9 s - the visible flight really is that quick up close. Timed in seconds
   because the graphic's own tween is. */
export function flightSeconds(dist) {
  return Math.min(2.4, Math.max(0.1, 0.2 * Math.max(0, dist) - 0.1));
}

/* The gathering beat before a spell's missile leaves the caster's hands, in
   client cycles - the unit `Gfx` takes its delays in (see
   src/magic.js#PROJ_DELAY_CYCLES for the number). Spells that carry no
   `projDelay` of their own gather for the family's 51 cycles. */
export function projDelayCycles(spell) {
  return spell && spell.projDelay != null ? spell.projDelay : PROJ_DELAY_CYCLES;
}

/* How long a spell's missile takes to cross `dist` tiles, in seconds: the
   content's own projectile speed (`flightSeconds`), and nothing else. The
   distance-formula travel this used to fly (the Magic delay's 1-4 ticks) is
   reverted on the user's instruction, so every spell lands on the content's
   clock again. The one subtraction that stays is the late-launch Rush/Blitz
   family's: those eight throws leave the hands a tick late on purpose (see
   SPELL_FX) and their flight is shortened by the same tick so they land
   exactly when they always did. */
export function spellTravelSeconds(spell, dist) {
  return Math.max(0.05, flightSeconds(dist) - (spell && spell.flightShorten || 0));
}

/* Whether the missile graphic is drawn on its way across.

   The content does have the ball leave the caster's hands and travel: the
   `spotanim_proj` row's delay is the gathering beat, and once it is up the
   client creates the projectile *at the caster* and sends it on its way (see
   src/magic.js#PROJ_DELAY_CYCLES). The flight itself is `length + range*step`
   cycles, which is what src/gfx.js#projectile flies and src/combat.js uses to
   time the landing. The reference capture scratch/ref/fire-strike.gif shows the
   whole thing: the ball gathers, crosses the gap, and bursts on the victim's
   chest.

   This used to be false, which kept the missile invisible for its whole flight
   and replayed the ball on the victim at the arrival frame - a cast looked like
   a pose, a pause, and then two balls popping on the target at once. With it on
   the ball is simply seen doing what the content says it does, and
   src/combat.js#ballArrives does nothing because there is nothing left to show. */
export const MISSILE_IN_FLIGHT = true;

/* The spray of sparks a spell leaves when it misses. `dir` is the victim's own
   facing, so the graphic is merged on the body the way the client draws it, and
   `target` is that victim, so the splash stays on it if it is walking away.
   `tint` (optional) is the casting spell's own colour, so the failed cast still
   reads as the spell that was thrown rather than as a generic white splash; the
   content's splash is shared by the whole book, and a spell with no tint of its
   own (every one but Shatter and Pulverize) keeps it as baked. */
export function playSplash(x, z, height, dir, target, tint) {
  Gfx.play(SPLASH_GFX, { x, z, height: height == null ? HIT_HEIGHT : height, dir: dir || 0, target: target || null, tint });
}
