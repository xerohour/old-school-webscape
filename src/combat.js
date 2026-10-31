import { ITEMS, itemDef, itemName, NPC_DROPS, stylesForWeapon, styleAttackBonus, STYLE_INFO, WEAPON_POISON, AMMO_WEAPON_ONLY, WEAPON_AMMO_ONLY, BOLT_EFFECTS, combatAnimIndex, attackAnimFor, blockAnimFor } from "./items.js";
import { invCount, invRemove, totalBonus, weaponOf, attackSpeed, equippedId, useRingCharge, keptOnDeath } from "./player.js";
import { addXp, levelOf, boosted, applyBoost, tickBoosts, combatLevel } from "./skills.js";
import { walkTo, placeEntity, isUndead, isDemon, entityAtTile, respawnTicksFor, npcFootBox, npcFoot, npcDrawCX, npcDrawCZ, footDistance, nearestFootTile, floorTiles, stopFollowing, sayOverhead, creatureBySpawnIx } from "./game.js";
import { chat, mark, patchSpecBar, UI } from "./ui.js";
import { spawnGround, Actions, revealPlayer } from "./actions.js";
import { Fx, BAR_TICKS } from "./fx.js";
import { RUN_UNITS } from "./run.js";
import { prayerLevelFactor, magicDefenceFactor, prayerProtection, hpRegenInterval, tickPrayer, activePrayers, clearPrayers } from "./prayer.js";
import { spellById, spellStatus, spellStaffIds, spendRunes, beginCast, flightSeconds, spellTravelSeconds, projDelayCycles, playSplash, CENTRE_HEIGHT, bodyHeight, impactHeight, castSpeed, castReady, Cast, MISSILE_IN_FLIGHT, START_GFX_ON_CASTER, SPELL_TARGET } from "./magic.js";
import { Gfx } from "./gfx.js";
import { playCastAnim, dragonfireOf, NPC_STATS } from "./game.js";
import { prepareModel } from "./models3d.js";
import { Net, netCombat, netSpell, netDeath, netGfx } from "./net.js";
import { voidRun } from "./minigame.js";

const NPC_DEF_BONUS = {
  man: 0, woman: 0, guard: 25, banker: 0, shopkeeper: 0,
  goblin: -4, gas_goblin: -4, cow: -2, chicken: -6, rat: -6,  cow_calf: -2, giant_rat: -6, farmer: 0, monk: 0,
  zombie: -2, skeleton: -2, scully: -2, ghost: -2,
  giant_spider: -6, imp: -2, unicorn: 0, dark_wizard: -2, dark_wizard_young: -2,
  /* the wider bestiary (see src/game.js#NPC_STATS) */
  black_bear: -4, hill_giant: 4, moss_giant: 6, fire_giant: 10, ice_giant: 8,
  lesser_demon: 6, greater_demon: 8, scorpion: -4, deadly_red_spider: -4,
  giant_bat: -6, crawling_hand: -8, banshee: -2, blue_dragon: 12,
  earth_warrior: 4, chaos_druid: -2,
  /* The four creatures of src/PLAN.md unit P. The dragons' published slash
     defences divided by the same eighth the blue dragon's is (90 -> 12): green
     68 -> 9, red 130 -> 16, black 200 -> 25, which makes a black dragon the
     toughest melee target outside the lairs. The snake is soft, as a level-5
     creature should be. */
  green_dragon: 9, red_dragon: 16, black_dragon: 25, snake: -6,
  /* The bosses (src/PLAN.md unit I). These are the wiki's defence bonuses
     divided down to this table's scale (the table runs about an eighth of the
     wiki's 0..255 numbers - the blue dragon's published 90 slash defence is 12
     here). Supreme is the soft one at 1 (its published 10 across the board),
     Rex and Prime are the 255-defence walls at 20, and the King Black Dragon
     sits between them at 11 (its published 90 slash/crush; the table carries
     one melee number, so its softer 40 stab defence is not separately
     expressible). */
  dagannoth_supreme: 1, dagannoth_prime: 20, dagannoth_rex: 20,
  king_black_dragon: 11,
  /* The Barrows brothers (src/PLAN.md unit T), the wiki's slash defence over
     the same eighth: Dharok 250 -> 31, Guthan 257 -> 32, Verac 230 -> 29,
     Torag 235 -> 29, Karil 71 -> 9, Ahrim 85 -> 11. The four melee brothers
     are the walls of the bestiary (a rune scimitar's 47 accuracy bonus is
     worth about two thirds of Dharok's 31), and the two weapon-brothers are
     soft, which is what makes the prayer the answer: Karil's real defence is
     106 against magic, not the 9 he shows a sword. */
  dharok: 31, guthan: 32, verac: 29, torag: 29, karil: 9, ahrim: 11,
  /* ---------- the rows unit C1's audit found missing ------------------------
     Only the five creatures whose published slash defence is worth saying
     anything about get a row here: the table's published-figure convention is
     a rough eighth of the wiki's 0..255 numbers (the blue dragon's 90 -> 12),
     so the armoured humanoids come out as the wiki's slash defence over that
     eighth - the black knight's 76 -> 10, the knight of Ardougne's 40 -> 5,
     the warrior woman's 41 -> 5, the soldier's 14 -> 2 and the rogue's 9 -> 1.
     The other twenty-three creatures the audit listed carry a wiki slash
     defence of 0 (a farmer, a wolf, a bear cub), which is exactly the value
     the missing row would have defaulted to, so no row is added for them -
     "0" and "no row" say the same thing, and the audit reports them as notes
     rather than problems for that reason. */
  black_knight: 10, knight_of_ardougne: 5, warrior_woman: 5, soldier: 2, rogue: 1,
  /* ---------- the wilderness band (unit C2) ---------------------------------
     The same rule as the rows above (the wiki's own slash defence over the
     table's rough eighth), and the same reason two of the six get a row and
     four do not: the **dark warrior** is the level-8 variant's 79 -> 10, which
     is real armour - a level-8 creature that blocks like a black knight is
     exactly the thing C1's audit was for - and the **chaos dwarf**'s 34 -> 4,
     the dwarf's own plate. The bandit's 3 -> 0, the black unicorn's, the
     grizzly bear's and the black demon's published slash defences are all 0,
     which is what the missing row would have defaulted to anyway (the black
     demon's is the one that surprises - its published defensive bonuses are all
     zero, so its 157 hitpoints are the whole of its staying power). */
  dark_warrior: 10, chaos_dwarf: 4,
  /* ---------- the god in the northern woods (2026-09-24) --------------------
     Saradomin's own row. He never melees anyone, so this is the *defence* side
     of the fight only: the user's god is a wall, and 25 is the number that puts
     him level with the Barrows walls (Dharok's 31 over his own 100 Defence)
     once NPC_STATS' Defence 100 is in - see src/combat.js#npcDefence, which is
     `(defence + 8) * (bonus + 64)`. His strike's own damage is rolled in
     src/saradomin.js and never reads NPC_MAX_HIT, but that row is filled in
     anyway so the bestiary's numbers stay complete (a missing row silently
     falls back to the table's default, which is exactly what this project
     audits for everywhere else). */
  saradomin: 25,
  iban: 15,
};

const NPC_ATTACK_SPEED = {
  man: 4, woman: 4, guard: 4, goblin: 4, cow: 4, chicken: 5, rat: 5,
  cow_calf: 4, giant_rat: 4, farmer: 4, monk: 4,
  zombie: 4, skeleton: 4, scully: 4, ghost: 4, giant_spider: 4, imp: 4, unicorn: 4,
  dark_wizard: 5, dark_wizard_young: 5,
  /* the wider bestiary - the slower the creature, the longer its recovery */
  black_bear: 4, hill_giant: 6, moss_giant: 6, fire_giant: 6, ice_giant: 6,
  lesser_demon: 4, greater_demon: 4, scorpion: 4, deadly_red_spider: 4,
  giant_bat: 4, crawling_hand: 4, banshee: 4, blue_dragon: 5,
  earth_warrior: 4, chaos_druid: 4,
  /* The dragons breathe on the blue dragon's own 5-tick cycle; the snake
     strikes at the ordinary 4. */
  green_dragon: 5, red_dragon: 5, black_dragon: 5, snake: 4,
  /* The bosses attack every four ticks, exactly as the wiki's infoboxes give
     them. A boss that swings as fast as a goblin is the point: the fight is
     meant to be about its damage, not its speed. */
  dagannoth_supreme: 4, dagannoth_prime: 4, dagannoth_rex: 4, king_black_dragon: 4,
  /* The brothers' published attack speeds: Dharok's greataxe is the slowest
     weapon in the game at 7 ticks, Karil's crossbow the fastest of the six at
     4, Ahrim's staff is 6, and the other three are 5. */
  dharok: 7, guthan: 5, verac: 5, torag: 5, karil: 4, ahrim: 6,
  /* The six missing rows that are not the table's default of 4 - unit C1's
     audit found twenty-five creatures without a speed row, and only these six
     have a published speed other than 4 (the rest are correct at the default
     and are left implicit). */
  farmer: 6, barbarian: 6, dwarf: 5, black_knight: 5,
  knight_of_ardougne: 5, soldier: 5,
  /* Saradomin's cadence: five ticks, i.e. one strike every three seconds. His
     own module owns the clock (see src/saradomin.js) - this row is the same
     number written where a reader looks for it, and what he would fall back to
     if he were ever handed the ordinary creature AI. */
  saradomin: 5,
  iban: 5,
};

const FLINCH_CALM_TICKS = 8;

const NPC_MAX_HIT = {
  man: 1, woman: 1, guard: 3, goblin: 2, gas_goblin: 2, cow: 1, chicken: 1, rat: 1, banker: 1, shopkeeper: 1,
  cow_calf: 1, giant_rat: 1, farmer: 1, monk: 1,
  zombie: 4, skeleton: 3, scully: 3, ghost: 3, giant_spider: 1, imp: 1, unicorn: 2, dark_wizard: 7,
  dark_wizard_young: 4,
  /* the wider bestiary - the published max hits */
  black_bear: 3, hill_giant: 4, moss_giant: 6, fire_giant: 11, ice_giant: 6,
  lesser_demon: 7, greater_demon: 9, scorpion: 2, deadly_red_spider: 4,
  giant_bat: 3, crawling_hand: 1, banshee: 3, blue_dragon: 10,
  earth_warrior: 6, chaos_druid: 2,
  /* The published melee max hits: green 8, red 14, black 21, snake 1. The three
     dragons' *breath* is the `dragonfire` field in src/game.js#NPC_STATS (50
     for all of them), which is what an anti-dragon shield is for. */
  green_dragon: 8, red_dragon: 14, black_dragon: 21, snake: 1,
  /* The bosses' *melee* max hits, from their infoboxes: Rex 26, Supreme 30,
     the King Black Dragon 25. Prime is the odd one - its published max hit is
     50, but that is its Water-Wave-like magic attack, which it throws through
     src/combat.js#NPC_CAST rather than swinging; its melee number is the
     fallback for a Prime that somehow ends up in reach without its cast. */
  dagannoth_supreme: 30, dagannoth_prime: 26, dagannoth_rex: 26,
  king_black_dragon: 25,
  /* The brothers' published max hits: Dharok 29, Guthan 24, Verac 23 (the
     wiki's "15 through Protect from Melee" is the *PvP* reading of the
     protection; against a monster it blocks the blow outright, which is what
     this world does - see `npcStrikeHit`), Torag 23, Karil 20, Ahrim 20.
     Dharok's is the one that is not a constant: see the modifier in `npcMaxHit`,
     which takes him to the published 57 at one hitpoint. */
  dharok: 29, guthan: 24, verac: 23, torag: 23, karil: 20, ahrim: 20,
  /* ---------- the rows unit C1's bestiary audit found missing ---------------
     Twenty-three creatures were hitting for the table's default of **1**,
     which for a black knight or a hobgoblin is the kind of wrong number
     nothing logs. Each value is the creature's published maximum hit for the
     stat line this world gives it, except the one noted below. The level-1
     birds and the sheep keep the 1 the rest of the level-1 row uses (the
     published 0 does nothing in this formula, where `NPC_MAX_HIT[type] || 1`
     turns a zero straight back into a one - the birds are pests, not threats,
     which is what a 1 already says). */
  barbarian: 2, dwarf: 2, highwayman: 1, mugger: 1, rogue: 2,
  wolf: 2, unicorn_foal: 2, bear_cub: 2, hobgoblin: 3,
  black_knight: 4, knight_of_ardougne: 6, soldier: 4, warrior_woman: 3,
  druid: 4, wizard: 4, skeleton_mage: 3, monk_of_zamorak: 3,
  ram: 1, sheep: 1, duck: 1, duckling: 1, seagull: 1,
  /* The guard dog's page publishes one dog - level 44 with 49 hitpoints, whose
     maximum hit is 5 - and the cache's own entry for the body this world's dog
     is baked from carries 44 as well, so unit C1's audit replaced this world's
     invented level-27 dog with the published one. It is the only row here that
     is stronger than the creature it keeps company with (the town guard is
     level 21), which is exactly what the live game's guard dogs are. */
  guard_dog: 5,
  /* ---------- the wilderness band (unit C2) ---------------------------------
     The six creatures' published maximum hits: dark warrior 2, bandit 3, chaos
     dwarf 6, black unicorn 3, grizzly bear 3 and the black demon's 16, which
     makes it the hardest-hitting thing in the bestiary outside a dragon, a
     brother or a boss. Each one matches what this engine's own formula produces
     from the creature's strength level, which is the check unit C1 introduced. */
  dark_warrior: 2, bandit: 3, chaos_dwarf: 6, black_unicorn: 3,
  grizzly_bear: 3, black_demon: 16,
  /* Saradomin's own number, not that he ever swings: see the note on his
     NPC_DEF_BONUS row. 30 is the *charged* Saradomin Strike maximum, which is
     the ceiling his own nova rolls against (src/saradomin.js). */
  saradomin: 30,
  iban: 25,
  /* The river trolls' published max hits per walking tier (7/11/14), plus the
     alpha's own 19 - double the troll, double the trouble. */
  river_troll_79: 7,
  river_troll_120: 11,
  river_troll_159: 14,
  river_troll_199: 19,
  ocean_troll_79: 7,
  ocean_troll_120: 11,
  ocean_troll_159: 14,
  ocean_troll_199: 19,
};

const NPC_STYLE = {
  man: "crush", woman: "crush", guard: "slash", goblin: "crush",
  cow: "crush", chicken: "stab", rat: "stab",
  cow_calf: "crush", giant_rat: "stab", farmer: "crush", monk: "crush",
  zombie: "crush", skeleton: "slash", scully: "slash", ghost: "crush", giant_spider: "stab",
  imp: "stab", unicorn: "stab", dark_wizard: "crush",
  /* the wider bestiary. Giants and demons crush, the spiders and bats stab,
     and the crawling hand lashes with its claws. */
  black_bear: "slash", hill_giant: "crush", moss_giant: "crush", fire_giant: "crush",
  ice_giant: "crush", lesser_demon: "slash", greater_demon: "slash",
  scorpion: "stab", deadly_red_spider: "stab", giant_bat: "stab",
  crawling_hand: "slash", banshee: "crush", blue_dragon: "slash",
  earth_warrior: "crush", chaos_druid: "crush",
  /* The bosses' published attack styles. Supreme is the *Ranged* one, and this
     table is where "range" finally means something: playerDefence reads the
     ranged defence bonus for it and Protect from Missiles is the prayer that
     stops it, exactly as the other two styles do for melee and magic. Rex is Slash and the King
     Black Dragon is Stab, both as published. Prime's own entry is only its
     fallback - it attacks with a cast (see NPC_CAST below), which passes
     "magic" and so meets Protect from Magic. */
  dagannoth_supreme: "range", dagannoth_prime: "crush", dagannoth_rex: "slash",
  king_black_dragon: "stab",
  /* The brothers' published attack styles: Dharok Slash, Guthan Crush, Verac
     Stab, Torag Crush, Karil Ranged and Ahrim Magic. Ahrim's entry is only his
     fallback - he fights through NPC_CAST like the dark wizard, which passes
     "magic" itself - and Karil's "range" is what makes Protect from Missiles
     stop his bolts. */
  dharok: "slash", guthan: "crush", verac: "stab", torag: "crush",
  karil: "range", ahrim: "magic",
  /* ---------- the rows unit C1's bestiary audit found missing ---------------
     Twenty-nine creatures were taking the "crush" default, which is not merely
     a label: the style is what picks which of the *player's* defence bonuses
     the blow rolls against (src/combat.js#playerDefence), so a black dragon
     that "crushed" was being blocked by the wrong armour. Every value below is
     the creature's published attack style.

     Three of them (`druid`, `skeleton_mage`, `monk_of_zamorak`) are published
     as casting as well - "Crush, Magic" - and the druid and the monk fight
     unarmed here, because no cast sequence is baked for their models. The
     `skeleton_mage` got its cast anyway (see NPC_CAST): its baked `attack` is
     the motion it casts with. The `wizard` is the exception: it *is* a Human
     model, so it got a real cast (see NPC_CAST
     below), and its entry here is only the fallback for a wizard that is
     somehow in reach without one. */
  banker: "crush", shopkeeper: "crush",
  barbarian: "stab", dwarf: "stab", highwayman: "stab", mugger: "crush",
  rogue: "stab", wolf: "stab", unicorn_foal: "stab", bear_cub: "slash",
  guard_dog: "crush", hobgoblin: "crush", black_knight: "slash",
  knight_of_ardougne: "slash", soldier: "slash", warrior_woman: "stab",
  ram: "crush", sheep: "crush", duck: "stab", duckling: "stab", seagull: "crush",
  druid: "crush", wizard: "crush", skeleton_mage: "crush",
  monk_of_zamorak: "crush", snake: "stab",
  green_dragon: "slash", red_dragon: "slash", black_dragon: "slash",
  /* The river trolls' published attack style, one row per walking tier. */
  river_troll_79: "crush", river_troll_120: "crush", river_troll_159: "crush", river_troll_199: "crush",
  ocean_troll_79: "crush", ocean_troll_120: "crush", ocean_troll_159: "crush", ocean_troll_199: "crush",
  /* ---------- the wilderness band (unit C2) ---------------------------------
     The six published attack styles: the dark warrior and the grizzly bear
     slash, the bandit and the black unicorn stab, the chaos dwarf crushes, and
     the black demon slashes like its two smaller cousins. This is not a label -
     it is which of the player's defence bonuses a blow rolls against. */
  dark_warrior: "slash", bandit: "stab", chaos_dwarf: "crush",
  black_unicorn: "stab", grizzly_bear: "slash", black_demon: "slash",
  /* Saradomin's strike is Magic, which is what a player's Protect from Magic
     answers (src/saradomin.js routes his damage through the same protection
     test every other blow goes through). Nothing rolls the player's *attack*
     against his style - his defence is the melee one above - so this entry is
     the honest label rather than a number anything reads. */
  saradomin: "magic",
  iban: "magic",
};

/* The creature's magic defence bonus. The cache's npc definitions in this
   revision carry a single melee defence bonus, so the magic side is the same
   number - which is what the real client does with an empty magic-defence
   field, and what makes curses and blasts land about as often as they should
   against the low-level creatures.

   The bosses are the exception, and they are the whole reason this is a table
   of its own rather than an alias: the three Dagannoth Kings are a
   rock-paper-scissors fight, and the rock is which combat style their defence
   is weak to. Rex is the melee wall (255 melee / 10 magic - the published
   numbers), Prime and Supreme the other way round, so a mage can farm Rex and
   a ranger can farm Supreme while neither can touch Prime. Halving the wiki's
   numbers the same way NPC_DEF_BONUS does gives Rex 1 on the magic side
   against 20 melee, Supreme and Prime 20 and 20, and the King Black Dragon 10
   (its published 80 magic defence, a little softer than its 90 melee). */
const NPC_MAGIC_DEF_BONUS = Object.assign({}, NPC_DEF_BONUS, {
  dagannoth_rex: 1, dagannoth_supreme: 20, dagannoth_prime: 20,
  king_black_dragon: 10,
  /* The brothers' own magic-defence bonuses, the one place where the two
     weapon-brothers split from the four walls: the wiki publishes Karil at 106
     and Ahrim at 73, against 9 and 11 melee (that is 13 and 9 here), while the
     four melee brothers carry negative magic defence - 0 for Verac and Torag,
     -1 for Dharok and Guthan - which is what makes a mage the answer to them
     and a sword the answer to Karil and Ahrim. */
  dharok: -1, guthan: -1, verac: 0, torag: 0, karil: 13, ahrim: 9,
  /* Saradomin is softer to magic than to steel (15 against 25), which is what
     makes a mage the sensible way to fight a god and a sword the stubborn one -
     the same rock-paper-scissors the Kings and the brothers are built on. */
  saradomin: 15,
});

/* Attack range in tiles: a spell reaches ten tiles, a bow its own reach (seven
   for a shortbow, ten for a longbow - `range` on the weapon row), everything
   else has to close to an adjacent tile. How *fast* a spell may be cast is the
   weapon's speed, the same number that times a melee swing - see
   src/magic.js#castSpeed. */
const SPELL_RANGE = 10;
/* The reach of a ranged weapon whose row names none - every bow and crossbow in
   src/items.js carries its own `range`, so this is only the fallback. */
const BOW_RANGE = 7;

/* How long a ranged missile takes to cross `dist` tiles, in seconds. A shot
   fired at the weapon's own full reach lands one tick after the release beat,
   and anything closer arrives sooner in proportion - so a bolt never trails
   whole ticks behind the bow that loosed it. `range` is the weapon's own
   reach (see `attackRange`), which is why the flight scales with it rather
   than with a fixed pace. */
const RANGED_FLIGHT_TICK = 0.6;
function rangedFlightSeconds(dist, range) {
  const r = Math.max(1, range || BOW_RANGE);
  return Math.min(RANGED_FLIGHT_TICK, Math.max(0.05, RANGED_FLIGHT_TICK * Math.max(0, dist) / r));
}

/* What the refusal says when a thrown weapon has nothing left to throw, one line
   per family: "You have no darts to throw." A thrown weapon is its own
   ammunition, so this is the same sentence the bow's "no arrows to fire." is,
   in the family's own noun. The mystic cards have a row of their own here, for
   the same reason the four cache families do: they are a thrown family of one,
   and the refusal should name the thing in the player's hand ("You have no
   mystic cards to throw.") rather than fall back to the generic sentence. */
const THROWN_PLURAL = { dart: "darts", knife: "knives", thrownaxe: "throwing axes", javelin: "javelins", mystic_cards: "mystic cards" };

/* NPCs that attack on sight do so only for players below a combat-level
   threshold, exactly like the live game. */
const AGGRO = {
  goblin: { range: 5, maxLevel: 42 },
  gas_goblin: { range: 5, maxLevel: 42 },
  rat: { range: 3, maxLevel: 22 },
  guard: { range: 0, maxLevel: 0 },
  /* The undead and the mine's spiders come at you; the farm animals and the
     wandering townsfolk never do (the live game's own split). */
  zombie: { range: 6, maxLevel: 60 },
  giant_rat: { range: 3, maxLevel: 20 },
  giant_spider: { range: 4, maxLevel: 40 },
  /* The wider bestiary (src/PLAN.md unit E). The giants, demons and the mine's
     vermin come at you; `maxLevel` is the combat-level threshold above which
     they leave you alone, exactly as the live game's aggression does. */
  black_bear: { range: 4, maxLevel: 35 },
  hill_giant: { range: 4, maxLevel: 60 },
  moss_giant: { range: 5, maxLevel: 70 },
  fire_giant: { range: 5, maxLevel: 100 },
  ice_giant: { range: 5, maxLevel: 80 },
  lesser_demon: { range: 5, maxLevel: 95 },
  greater_demon: { range: 5, maxLevel: 110 },
  scorpion: { range: 4, maxLevel: 30 },
  deadly_red_spider: { range: 4, maxLevel: 45 },
  giant_bat: { range: 4, maxLevel: 40 },
  crawling_hand: { range: 3, maxLevel: 20 },
  banshee: { range: 4, maxLevel: 40 },
  blue_dragon: { range: 6, maxLevel: 126 },
  earth_warrior: { range: 5, maxLevel: 65 },
  chaos_druid: { range: 4, maxLevel: 30 },
  /* The chromatic dragons (src/PLAN.md unit P) are all aggressive, and the
     threshold rises with the colour exactly as the live game's does: a low-
     level player is left alone by a red but not by a green. The black dragons
     share the lairs' no-ceiling rule, so walking into their cave at any level
     means all three at once - the reason the cave is where it is. */
  green_dragon: { range: 6, maxLevel: 100 },
  red_dragon: { range: 6, maxLevel: 120 },
  black_dragon: { range: 6, maxLevel: 126 },
  snake: { range: 3, maxLevel: 30 },
  /* The bosses come for you and never stop coming: every one of them is
     aggressive with no level ceiling (126 is the highest combat level the
     formula can produce, so `maxLevel: 126` means "always"). The two lairs are
     small, so the range is short - what makes a boss dangerous is that you
     cannot step out of its reach and be left alone, not that it can see you
     from across the map. */
  dagannoth_supreme: { range: 8, maxLevel: 126 },
  dagannoth_prime: { range: 8, maxLevel: 126 },
  dagannoth_rex: { range: 8, maxLevel: 126 },
  king_black_dragon: { range: 9, maxLevel: 126 },
  /* The brothers sit in their own crypts and come for anyone who walks in, at
     any combat level (see src/world.js#NPC_SPAWNS). The range is short - the
     crypt is a 5x5 room - so a fight starts at the door rather than through a
     wall. */
  dharok: { range: 5, maxLevel: 126 },
  guthan: { range: 5, maxLevel: 126 },
  verac: { range: 5, maxLevel: 126 },
  torag: { range: 5, maxLevel: 126 },
  karil: { range: 6, maxLevel: 126 },
  ahrim: { range: 6, maxLevel: 126 },
  /* ---------- the rows unit C1's audit found missing ------------------------
     Eight creatures whose own page says **aggressive** had no row here, which
     in this engine means they never start a fight at all - the churchyard's
     skeletons and ghosts stood by while a zombie two tiles away came for you.
     The wiki publishes the flag, not the threshold, so the `maxLevel` is this
     world's own reading of the live game's level-based aggression (the same
     kind of number every other row in this table already carries): roughly the
     creature's own level plus twenty to thirty-five, so it comes for a player
     it can beat and leaves one it cannot. */
  highwayman: { range: 4, maxLevel: 35 },
  mugger: { range: 4, maxLevel: 40 },
  dark_wizard: { range: 5, maxLevel: 50 },
  dark_wizard_young: { range: 5, maxLevel: 50 },
  ghost: { range: 5, maxLevel: 50 },
  skeleton: { range: 5, maxLevel: 55 },
  skeleton_mage: { range: 5, maxLevel: 55 },
  hobgoblin: { range: 5, maxLevel: 60 },
  black_knight: { range: 5, maxLevel: 70 },
  /* ---------- the wilderness band (unit C2) ---------------------------------
     All six of the era's Wilderness creatures are aggressive, and their
     thresholds follow the C1 rule: roughly the creature's own level plus twenty
     to thirty-five, so each comes for a player it can beat and leaves one it
     cannot. The black demon is the exception on purpose - like the greater
     demon, the dragons and the brothers it has no ceiling at all (126 is the
     highest combat level the formula can produce, so 126 means "always"), which
     is what makes the far north-west corner a wall the way the live game's own
     demon camps are. */
  dark_warrior: { range: 4, maxLevel: 35 },
  bandit: { range: 5, maxLevel: 45 },
  chaos_dwarf: { range: 4, maxLevel: 70 },
  black_unicorn: { range: 4, maxLevel: 45 },
  grizzly_bear: { range: 4, maxLevel: 40 },
  black_demon: { range: 6, maxLevel: 126 },
  /* River trolls come for whoever walks close, at any combat level - the
     random event attacks its targeted player, so there is no ceiling. */
  river_troll_79: { range: 6, maxLevel: 126 },
  river_troll_120: { range: 6, maxLevel: 126 },
  river_troll_159: { range: 6, maxLevel: 126 },
  river_troll_199: { range: 6, maxLevel: 126 },
  ocean_troll_79: { range: 6, maxLevel: 126 },
  ocean_troll_120: { range: 6, maxLevel: 126 },
  ocean_troll_159: { range: 6, maxLevel: 126 },
  ocean_troll_199: { range: 6, maxLevel: 126 },
};

/* The six per-creature tables, exported so the bestiary audit
   (src/tools/check-bestiary.mjs) reads *them* rather than a hand-kept copy:
   they are the bestiary's other half, and a missing row here is a creature
   whose numbers silently fall back to the defaults. `NPC_CAST` comes too - it
   is how a creature's combat level is derived (a caster's Magic is its
   Attack). */
export { NPC_DEF_BONUS, NPC_MAGIC_DEF_BONUS, NPC_ATTACK_SPEED, NPC_MAX_HIT, NPC_STYLE, AGGRO, NPC_CAST };

export const Combat = {
  /* `target` is an accessor rather than a plain field so that every place that
     starts or ends a fight - the click, the stop, the death, the cancel, the
     magic book's own stop - moves the overhead health bar with it, without a
     single one of those sites having to remember to do so (see
     src/fx.js#renderBars). */
  _target: null,
  get target() { return this._target; },
  set target(v) {
    this._target = v || null;
    Fx.focus = this._target;
    /* The chase's memory of which tile of the victim the current route was
       planned to belongs to the victim, so it goes when the victim does - see
       the per-tick chase in tickCombat. */
    this.chaseTile = null;
    /* ...and so does the chase's facing: the player looks at the victim for
       the whole walk-in (see faceEnt), so a dropped or switched target must
       not leave them staring at thin air. The tick re-aims at the live target
       every moment after this. */
    if (G && G.player && G.player.faceEnt && G.player.faceEnt !== this._target) G.player.faceEnt = null;
  },
  timer: 0,
  chaseTimer: 0,
  /* The victim's tile (`"tx,tz"`) the route in hand was planned for. The chase
     re-plans the moment this stops matching the victim, which is what makes a
     *moving* creature attackable - see tickCombat. */
  chaseTile: null,
  playerTimer: 0,
  cooldown: 0,
  kills: 0,
  /* Ticks a special attack adds to the recovery after its own swing (rune
     claws' Impale is the one row that uses it). The tick that performs the
     swing reads and clears it, so it can never leak onto a later attack. */
  specDelay: 0,
};

let G = null;
/* Set only around the automatic swing that auto retaliate starts (see
   `npcStrikeHit`). A refusal - a cast style with no spell picked, no arrows, no
   runes, too low a Magic level - is worth telling the player about when *they*
   clicked the creature, but auto retaliate retries on every blow it takes, so
   the same sentence would be repeated into the chatbox for as long as the
   creature keeps attacking. While this is set the attempt stays silent; the
   refusal still happens and still leaves nothing targeted. */
let quietAttack = false;

function ps() {
  return G.ps;
}

/* Spends one charge of the equipped ring and says so when that was the last
   one, the crunchy half of player.js#useRingCharge. */
function spendRingCharge(player, slot = "ring") {
  const r = useRingCharge(player, slot);
  if (r.crumbled) {
    chat("Your " + itemName(r.crumbled).toLowerCase() + " crumbles to dust.", "game");
    mark("equip");
  }
  return r.spent;
}

function tileOf(e) {
  return { x: Math.floor(e.x), z: Math.floor(e.z) };
}

/* Every tile a body swings from or is swung at: its whole floor, so a blow
   beside a big body is measured to the right ground (see game.js#npcFootBox). */
function bodyTiles(e) {
  if (!(e.foot > 1)) return [tileOf(e)];
  return floorTiles(npcFootBox(e));
}

/* Whether a melee swing would have to cross a sealed face
   (world.js#swingBlocked): beside the victim is not enough when a wall panel
   stands between the two tiles, so the attacker must walk round to a clear
   side first. Bows and spells never ask - their reach stays distance-only, and
   a low wall they can shoot over still stops a blade. */
function meleeWalled(att, tgt) {
  if (!G || !G.world || !G.world.swingBlocked) return false;
  return G.world.swingBlocked(bodyTiles(att), bodyTiles(tgt));
}

/* The walk-in half of the same rule, for a chase's goal ring: only sides the
   swing can land from. */
function clearSwingTo(tgt) {
  const tiles = bodyTiles(tgt);
  if (!G || !G.world || !G.world.swingBlocked) return () => true;
  return (x, z) => !G.world.swingBlocked([{ x, z }], tiles);
}

/* Whether a bow or a spell can fly between attacker and victim
   (world.js#losBlocked): in range is not enough without a clear line - the
   attacker walks until there is one. Melee never asks (its faces are the
   swing's own), and trees never block (faces only). */
function sightBlocked(att, tgt) {
  if (!G || !G.world || !G.world.losBlocked) return false;
  return G.world.losBlocked(bodyTiles(att), bodyTiles(tgt));
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/* How far a creature can land a blow, read off how it fights: a caster reaches
   the ten tiles a spell does, a shooter the seven a bow does, and everything
   else has to stand beside its victim (the reach note in tickCombat). */
function npcReach(npc) {
  return castSpecOf(npc) ? SPELL_RANGE : NPC_MISSILE_GFX[npc.type] ? BOW_RANGE : 1;
}

/* The aggression range (OSRS wiki, Aggressiveness): the creature's max range
   plus its attack reach, measured from the STATIC spawn point - the outer limit
   of where the player can stand and still be attacked. */
function aggroRangeOf(npc) {
  const aggro = AGGRO[npc.type];
  return (aggro ? aggro.range : 0) + npcReach(npc);
}

/* Retreat mode (OSRS wiki, Retreat): attacked from outside the aggression
   range, a creature walks back to its spawn instead of chasing across the map.
   The three retaliation assignments below ask this first and stay silent when
   the blow came from beyond it. */
/* Lure awareness (the user's rule, 2026-10-09): ANY blow makes the creature
   aware of its attacker, at any distance. Inside the aggression range that
   awareness is a chase as before; from beyond it the creature will not march
   across the map (Retreat, above) but backs away facing its attacker instead
   (see game.js#updateNpcs), trying to draw the attacker into its own ground.
   A re-hit refreshes the lure. Fleeing birds keep their panic flight. */
const LURE_TIME = 12;
export function provokeNpc(npc) {
  /* Flinch (the user's rule, 2026-10-09): a creature that is out of combat
     takes a tick to answer a blow, so a player who swings from the edge of a
     safespot gets the step back behind cover before the first swing comes.
     `retal` is the existing no-strike fuse (see tickCombat) - set to a single
     tick here, it blocks only the hit tick itself; the normal post-hit rhythm
     (barTicks, then half-speed retal) takes over from there. The landing tick
     itself is held by the `flinch` fuse in landStrike, which covers every blow
     of the fight, not just the first - this line is what still holds the
     cast tick of a spell, whose missile lands later. Only a blow that
     actually puts the creature into the fight touches `retal` here: mid-combat
     re-hits (target already held) and far-away lure taps (no target taken)
     keep their old timing. */
  const wasOut = !npc.target;
  npc.aggroed = G.player;
  /* Answered at arm's length (the user's rule, 2026-10-22): a blow struck from
     inside the creature's own reach needs no march, so it takes a target even
     when the attacker stands outside the home aggression range - the retreat
     below is for blows that would have to be chased across the map. Without
     this a wandered townsfolk (home a few tiles off, range ~1) stood mute at
     adjacent blows: the knight, the warrior woman and the guard dog never
     fought back. */
  const dFloor = footDistance(Math.floor(G.player.x), Math.floor(G.player.z), npcFootBox(npc));
  const here = meleeReach(npc.type) ? dFloor.orth : dFloor.cheb;
  if (here <= npcReach(npc) || !provokedFromBeyondRange(npc)) npc.target = G.player;
  else if (!npc.fleeing) { npc.lureTgt = G.player; npc.lureTimer = LURE_TIME; }
  if (wasOut && npc.target === G.player) npc.retal = Math.max(npc.retal || 0, 1);
}
function provokedFromBeyondRange(npc) {
  if (!G || !npc.home) return false;
  return chebyshev({ x: Math.floor(npc.home.x), z: Math.floor(npc.home.z) }, tileOf(G.player)) > aggroRangeOf(npc);
}

/* Tolerance (OSRS wiki): 10 minutes in a standard monster's vicinity and it
   goes passive until the player moves on - tracked here as ticks with the
   player near (a tick is 0.6 s, so 1000 ticks is the ten minutes). Only new
   aggression is gated: a tolerant creature still retaliates when hit, and an
   ongoing fight is never interrupted. Bosses never go tolerant. */
const TOLERANCE_TICKS = 1000;
const TOLERANCE_RADIUS = 11;
const NEVER_TOLERANT = {
  dagannoth_supreme: true, dagannoth_prime: true, dagannoth_rex: true,
  king_black_dragon: true, dharok: true, guthan: true, verac: true,
  torag: true, karil: true, ahrim: true,
};
function tickTolerance(npc, pl) {
  const aggro = AGGRO[npc.type];
  if (!aggro || !(aggro.range > 0) || NEVER_TOLERANT[npc.type]) return;
  if (npc.tolerant) {
    if (npc.tolerateAnchor && chebyshev(tileOf(pl), npc.tolerateAnchor) > 10) {
      npc.tolerant = false;
      npc.presenceTicks = 0;
      npc.tolerateAnchor = null;
    }
    return;
  }
  if (chebyshev(tileOf(npc), tileOf(pl)) <= TOLERANCE_RADIUS) {
    npc.presenceTicks = (npc.presenceTicks || 0) + 1;
    if (npc.presenceTicks >= TOLERANCE_TICKS) {
      npc.tolerant = true;
      npc.tolerateAnchor = tileOf(pl);
    }
  } else {
    npc.presenceTicks = 0;
  }
}

/* The other distance a tile pair can be read at: how many steps apart they are
   when every step is axis-aligned. A diagonal neighbour is *two* of these and
   an orthogonal one is one, which is exactly what makes it the right measure for
   a melee reach - see `reachDistance` below. */
function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function currentStyles() {
  const w = weaponOf(ps());
  return stylesForWeapon(w);
}

/* The style button that is lit, before any spell is laid over it. */
function rawStyle() {
  const styles = currentStyles();
  const idx = Math.min(ps().styleIndex || 0, styles.length - 1);
  return styles[idx] || { name: "Accurate", stance: "accurate", sprite: 247 };
}

/* The spell the player is casting with, if any.

   Two ways in, just as in the live game. Picking a spell in the book is a
   one-off: the next thing clicked gets it. Picking one of a staff's two "Spell"
   styles is standing orders - whatever `ps.autocast` has been set to is cast
   over and over, without a click each time. The manual pick always wins, so a
   player can break off the autocast for one cast and go back to it. */
export function autocastSpell() {
  const p = ps();
  return p && p.autocast != null ? spellById.get(p.autocast) || null : null;
}

/* Set (or clear) the wielded staff's autocast spell - the ONLY way a spell
   becomes the autocast (the user's rule, 2026-10-09): the combat tab never
   asks, it only lights what is remembered. Stat-changing spells, binds and the rest of the
   non-repeatable spells are refused, exactly as the cache's
   `continue_by_autocast` says they should be. The spell is written to the
   staff's own memory (`ps.staffSpells`) as well as to the effective
   `ps.autocast` the engine reads, so swapping staves - or bashing with this
   one on a melee style and coming back - never asks twice, and a one-off
   pick never overwrites it. Standard combat spells need no staff to set;
   Ancient ones need an ancient staff wielded; clearing only
   forgets the wielded staff's spell. */
/* The wielded staff's item id, or null when no staff is held. */
const ANCIENT_AUTOCAST_STAVES = ["ancient_staff"];
export function stafflessAutocastOk(spell) {
  return !!spell && spell.book === "standard" && spell.kind === "combat" && !spell.god && !spellStaffIds(spell);
}
export function wieldedStaffId() {
  const p = ps();
  const id = equippedId(p, "weapon");
  if (id == null) return null;
  const def = itemDef(id);
  return def && def.kind === "staff" ? id : null;
}
export function setAutocast(id) {
  const spell = id == null ? null : spellById.get(id) || null;
  if (spell && !spell.autocast) return false;
  const p = ps();
  if (!p.staffSpells || typeof p.staffSpells !== "object") p.staffSpells = {};
  const staff = wieldedStaffId();
  if (spell) {
    if (spell.book === "ancient" && !ANCIENT_AUTOCAST_STAVES.includes(staff)) { chat("You need to wield an ancient staff to autocast that.", "warn"); return false; }
    if (staff != null) {
      p.staffSpells[staff] = spell.id;
      p.autocast = spell.id;
    } else {
      if (!stafflessAutocastOk(spell)) { chat("You need to wield a staff to set autocast.", "warn"); return false; }
      p.autocast = spell.id;
    }
  } else {
    if (staff != null) delete p.staffSpells[staff];
    p.autocast = null;
  }
  return true;
}

/* True when the lit style button is one of the staff's spell styles, i.e. the
   panel is set to cast rather than to swing. */
export function styleIsCast(st = rawStyle()) {
  return st.stance === "cast" || st.stance === "castDefensive";
}

export function selectedSpell() {
  const id = UI.spell;
  if (id != null) return spellById.get(id) || null;
  const auto = autocastSpell();
  if (!auto) return null;
  if (styleIsCast()) return auto;
  if (wieldedStaffId() == null) return auto;
  return null;
}

export function currentStyle() {
  const st = rawStyle();
  const out = {
    id: st.stance,
    name: st.name,
    info: STYLE_INFO[st.stance] || STYLE_INFO.accurate,
    weapon: weaponOf(ps()),
  };
  const spell = selectedSpell();
  if (spell) {
    /* A picked spell takes the attack over: the weapon still sets the speed and
       adds its own magic bonus, but the style buttons only choose whether the
       cast trains Defence as well. */
    out.spell = spell;
    out.name = spell.name;
    out.info = st.stance === "castDefensive" ? STYLE_INFO.castDefensive : STYLE_INFO.cast;
  }
  return out;
}

/* The style a click on a creature attacks with. It differs from `currentStyle()`
   in one case: a picked spell that is not aimed at a creature at all - a
   teleport, an alchemy, one of the enchantments - does not take the weapon's
   swing over. The client offers no "Cast on" for those (the cursor itself calls
   the click "Attack <name>", see actions.js#npcAttackLabel), so the attack is
   the plain weapon attack the label promises, rolled against the stance's own
   skill and bonus rather than the spell's. */
function styleForAttack() {
  const st = currentStyle();
  const sp = st.spell;
  if (!sp || (sp.on & SPELL_TARGET.NPC)) return st;
  const raw = rawStyle();
  st.spell = null;
  st.name = raw.name;
  st.info = STYLE_INFO[raw.stance] || STYLE_INFO.accurate;
  return st;
}

/* A Spell style with nothing to cast is a refusal, not an attack - and which
   refusal depends on whether a spell *is* picked. See attackNpc. */
function refuseCast() {
  const picked = selectedSpell();
  if (!quietAttack) chat(picked
    ? "You can't cast " + picked.name + " on a creature."
    : "You need to select a spell to cast with this style.", "warn");
}

function styleSkill(style) {
  if (style.spell) return "magic";
  const w = style.weapon;
  if (w && (w.kind === "bow" || w.kind === "crossbow" || w.kind === "thrown")) return "ranged";
  const xp = style.info.xp || {};
  if (xp.magic) return "magic";
  if (xp.ranged) return "ranged";
  return "attack";
}

/* The Dagon'hai set effect: all three robes at once (hat, top and bottom - no
   weapon needed, the set is armour alone) stretches a spell's attack range to
   25 tiles. Read in `attackRange` below, so the chase and the click both honor
   it. `worn` is defined with the Barrows sets further down; as a function
   declaration it is hoisted, so calling it here is safe. */
const DAGONHAI_SET = ["dagonhai_hat", "dagonhai_robe_top", "dagonhai_robe_bottom"];
const DAGONHAI_RANGE = 25;
function hasDagonhai() {
  return DAGONHAI_SET.every(worn);
}

/* How far this style can strike from: a spell reaches ten tiles (twenty-five
   in full Dagon'hai - see above), a ranged
   weapon its own row's reach (a dart three, a javelin five, a shortbow seven, a
   longbow ten - see src/items.js), and a melee weapon has to stand beside its
   victim. The Longrange style adds its own two tiles on top, which is where the
   live game's "+2 reach" lives. It is read in two places - the per-tick chase
   and the click that starts one - so it lives here rather than being spelled out
   at each site. */
function attackRange(style) {
  if (style.spell) return hasDagonhai() ? DAGONHAI_RANGE : SPELL_RANGE;
  if (styleSkill(style) === "ranged") {
    const w = style.weapon;
    return ((w && w.range != null) ? w.range : BOW_RANGE) + (style.info.range || 0);
  }
  return 1;
}

/* ------------------------------------------------------- what a melee reach is

   A melee blow is struck from one of the victim's four **side** tiles - north,
   south, east or west - and never from a diagonal one, and an attacker who is
   not already on a side tile is walked round to one before it swings. That is
   the whole shape of a 1-tile reach: when you click a creature to attack it the
   client drags you in to "a tile beside it", and beside means those four
   orthogonal neighbours, so coming at a skeleton from a diagonal leaves you
   standing on its north/south/east/west face and *then* swinging (the user's
   report, 2026-09-22: *"attacking the skeleton or creature from a diagonal tile
   to it is not allowed with standard 1 tile range melee. it needs to bring the
   player to either the north south east or west tile of the creature"*).

   So a melee reach is measured **orthogonally** - Manhattan distance, where the
   diagonal costs two and so falls outside a reach of one - while ranged and
   magic keep the client's own Chebyshev distance, under which a diagonal step
   counts as one tile. `isMeleeStyle` is the same branch `attackRange` above
   falls through to (`return 1`), so a style can never be measured one way and
   ranged another: reach 1 and orthogonal distance are the same statement.

   There is a second half to the rule and the two must be changed together. The
   walk-in a chase plans is a *goal set* - "any tile beside the victim" - and if
   that set still held the diagonals then an attacker already standing diagonally
   beside its victim would satisfy the goal where it stood: the route would come
   back zero steps long, the tick's reach test would refuse the swing, and the
   attacker would stand beside its creature, unable to attack it, for good. So
   the chase plans onto the four side tiles instead (src/game.js#walkTo's
   `opts.orthogonal`), which is exactly the set the reach test accepts. */
export function isMeleeStyle(style) {
  return !style.spell && styleSkill(style) !== "ranged";
}
function reachDistance(a, b, style) {
  return isMeleeStyle(style) ? manhattan(a, b) : chebyshev(a, b);
}

/* How far an attack of this style has to cross to land on `b`, where `b` is a
   **body** rather than a tile. It is `reachDistance` over floors
   (src/game.js#npcFootBox): a creature with a tile footprint - a 2x2 lesser
   demon, a 3x3 greater or black demon - is measured to the nearest tile of its
   own ground, so a melee blow is struck from a tile beside the *floor* and
   never from inside it, and the four sides of a 3x3 body's ground are all
   "beside" it (the user's big-monster rule, 2026-09-24: *"they move outside to
   an adjacent tile anything around them north south east west but not the 4
   diagonal squares"*). A 1x1 body's floor is the tile it stands on, so this is
   the old tile-to-tile number exactly. */
function reachTo(a, b, style) {
  if (!b) return Infinity;
  if (!(b.foot > 1)) return reachDistance(tileOf(a), tileOf(b), style);
  const t = tileOf(a);
  const d = footDistance(t.x, t.z, npcFootBox(b));
  return isMeleeStyle(style) ? d.orth : d.cheb;
}

/* Whether this *creature* fights in melee, which decides both the distance its
   blow is measured by and the shape of the ring it chases a victim onto. The
   tables that answer it are this module's (NPC_CAST/NPC_MISSILE_GFX below), and
   game.js's `updateNpcs` walks the creature's route without being able to import
   them - the arrow points the other way - so `initCombat` publishes the same
   answer on the game object as `Game.npcMelee` for game.js to ask. */
function meleeReach(type) {
  return !NPC_CAST[type] && !NPC_MISSILE_GFX[type];
}

/* Sets off after a creature the player is out of reach of. Returns false when
   there is no tile beside it to attack from at all, which is the caller's cue
   to refuse the target ("I can't reach that!").
 *
 * It is called from both the click and the tick's chase. The click call is what
 * makes the walk start promptly: the tick's own movement step runs *before* its
 * combat step (see src/game.js#stepSim), so a route planned by the tick cannot
 * be walked until the following tick, and clicking a creature across the square
 * meant standing still for up to two ticks (1.2s) before a single step was
 * taken. Planning the route on the click itself puts the walk one tick earlier,
 * which is the delay the live game has (the click is processed on the tick
 * after it is sent). */
/* Step out from under a victim. A blow is struck from **beside** a body, never
   from inside it, so an attacker standing on the same tile as its target walks
   out to the ring around it - and it does so while the attack it just ordered
   still lands: the movement step runs before the combat step (src/game.js#stepSim
   moves, then tickCombat), so by the time the swing is measured the attacker is
   on the side tile and the blow is struck from there. The target is never
   dropped, and the route is planned to a side tile of the victim exactly as a
   chase's would be (`opts.adjacent`/`opts.orthogonal`), so the two cannot
   disagree about which tiles count.

   The user's report (2026-09-23): *"if you are standing underneath an npc and
   then attack them, you should move out from underneath them to a adjacent
   tile. however it will allow you to attack the tick that you initiate the
   attack, but it needs to move out from under it also."* The two halves are the
   two halves of this function: it is called from the click's own chase (the
   attack that initiates the fight) and from the tick's in-reach branch (a
   victim that later walks onto the attacker, or an attacker that arrived under
   it), and the caller goes on to swing either way.

   A **big** victim changes what "under" means (the user's ask, 2026-09-24):
   its ground is a 2x2 or 3x3 block, so the attacker can be standing *inside the
   block* while not sharing the creature's own tile. The exit is chosen here
   rather than left to the pathfinder, because the user asked for it to be
   predictable: of the four side tiles - the ones in line with the attacker on
   each side of the block, so the step out is the shortest one - the nearest
   wins, and a tie is broken in a fixed order (south, then west, east, north;
   the user's own guess was "it defaults to the south one"). The first of those
   that is actually walkable and clear is the destination; a route that cannot
   reach it at all falls back to the open ring around the whole floor. */
function stepOutFromUnder(pl, tgt, style) {
  /* Face the victim for the whole step-out: the walk below turns the body
     along its steps, so the facer in stepSim aims this first and clears it
     once the body is out from under. */
  pl.faceEnt = tgt;
  if (tgt.foot > 1) {
    const box = npcFootBox(tgt);
    const p = tileOf(pl);
    const clampX = Math.max(box.x0, Math.min(box.x1, p.x));
    const clampZ = Math.max(box.z0, Math.min(box.z1, p.z));
    /* South, west, east, north - and each is the side tile in the attacker's
       own line, so stepping out is one step rather than up to three. */
    const sides = [
      { x: clampX, z: box.z1 + 1 },
      { x: box.x0 - 1, z: clampZ },
      { x: box.x1 + 1, z: clampZ },
      { x: clampX, z: box.z0 - 1 },
    ];
    sides.sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.z - p.z)) - (Math.abs(b.x - p.x) + Math.abs(b.z - p.z)));
    for (const s of sides) {
      if (!G.world.isWalkable(s.x, s.z)) continue;
      if (isMeleeStyle(style) && meleeWalled({ x: s.x + 0.5, z: s.z + 0.5 }, tgt)) continue;
      if (walkTo(pl, G.world, s.x, s.z, 0, null, true, null)) return true;
    }
    /* Nowhere to step out to by the short way - plan the ring around the whole
       floor instead, so the attacker at least walks to a tile it can swing
       from the moment one opens up. */
    return walkTo(pl, G.world, Math.floor(tgt.x), Math.floor(tgt.z), 1, null, true, { adjacent: true, orthogonal: isMeleeStyle(style), foot: box, faceClear: isMeleeStyle(style) ? clearSwingTo(tgt) : null });
  }
  const tx = Math.floor(tgt.x);
  const tz = Math.floor(tgt.z);
  return walkTo(pl, G.world, tx, tz, 1, null, true, { adjacent: true, orthogonal: isMeleeStyle(style), faceClear: isMeleeStyle(style) ? clearSwingTo(tgt) : null });
}

function chaseTarget(pl, tgt, style = styleForAttack()) {
  /* A victim on the other level is out of reach, full stop: no route is
     planned through the slab, so the caller refuses the target ("I can't
     reach that!") exactly as for an unreachable one. */
  if ((pl.plane || 0) !== (tgt.plane || 0)) return false;
  const here = reachTo(pl, tgt, style);
  /* In reach is not enough for a blade: a sealed face between the two tiles
     means walk round first (see meleeWalled above) - nor for a bow or a spell
     without a line between them: the walk below closes until there is one
     (see sightBlocked above). */
  const blind = !isMeleeStyle(style) && sightBlocked(pl, tgt);
  if (here <= attackRange(style) && !(isMeleeStyle(style) && meleeWalled(pl, tgt)) && !blind) {
    /* Already in reach - and if that is because the two share a tile (or, for a
       big victim, because the attacker is standing on its ground), the
       attacker's own walk-out begins here - for MELEE only. A bow or a spell
       is already in range from underneath (the user's rule, 2026-10-01: you can
       attack a dragon from any tile under it), so only a blade steps out to
       the closest side tile first. The chase still succeeds either way: the
       attack lands (see `stepOutFromUnder`). */
    if (here === 0 && (isMeleeStyle(style) || !(tgt.foot > 1))) stepOutFromUnder(pl, tgt, style);
    pl.dir = Math.atan2(npcDrawCX(tgt) - pl.x, npcDrawCZ(tgt) - pl.z);
    return true;
  }
  const tx = Math.floor(tgt.x);
  const tz = Math.floor(tgt.z);
  /* Blind: walk right up to the victim - through the doorway, round the wall -
     and the swing fires on the first tick with a line. A shut door or a
     sealed room fails the walk instead, which refuses the target exactly as
     an unreachable one. */
  if (blind) {
    if (tgt.foot > 1) {
      const box = npcFootBox(tgt);
      return walkTo(pl, G.world, tx, tz, 1, null, true, {
        goalTest: (x, z) => footDistance(x, z, box).orth === 0,
      });
    }
    return walkTo(pl, G.world, tx, tz, 1, null, true, {
      goalTest: (x, z) => x === tx && z === tz,
    });
  }
  /* ------------------------------------------- the walk-in to a big victim

     A creature with a tile footprint is always chased to the ring around its
     **floor**, never onto its own tile: its own tile is inside the ground an
     attack may not be struck from, so aiming there would walk the attacker into
     the one place it then has to step back out of (the user's big-monster rule,
     2026-09-24). `opts.foot` rebuilds the ring around the box - all four sides
     of a 3x3 body's ground count as "beside it", and the diagonals still do not
     (see src/game.js#walkTo). This is short-circuited before the mover logic
     below, which is about the attacker's *speed* against a victim that is
     going somewhere - a demon's 2x2 or 3x3 body is already a wider target than
     any chase lag can lose. */
  if (npcFoot(tgt.type) > 1) {
    return walkTo(pl, G.world, tx, tz, 1, null, true, { adjacent: true, orthogonal: isMeleeStyle(style), foot: npcFootBox(tgt), faceClear: isMeleeStyle(style) ? clearSwingTo(tgt) : null });
  }
  /* ------------------------------------------------ the walk-in to a mover

     Which tile a chase plans *to* depends on whether its victim is standing
     still, and the reason is a walker's speed against a body's.

     A step is taken at the top of the tick and the victim's own step happens
     after it (`src/game.js#stepSim` moves the player, then `updateNpcs`), so a
     route aimed at the tile the victim is *on* is a route aimed one tile behind
     it - correct for a body that is not going anywhere, and stale the moment it
     is. The goal therefore depends on the victim:

     * **Standing still** - the four (or eight) tiles beside it, exactly as
       before (`opts.adjacent`), so the walker comes to rest beside it and the
       swing can land without ever standing inside it. Against a still victim the
       ring is also the *shorter* route, so nothing is lost by asking for it.
     * **On the move** - the victim's own tile, which for a body between tiles
       is already the tile it is walking *onto* (an entity's x/z hold the step's
       destination - see `stepEntity`), i.e. the tile it will occupy at the top
       of the next tick. The route is then one tile *longer* than the ring's
       would be, which is the whole point: the movement step spends a route
       tile per step and a two-tile run needs two tiles of route to spend. Aimed
       at the ring, a running attacker one square behind a fleeing chicken had a
       one-tile route, so a run bought it one tile, so did the chicken's own
       step, and the two moved in lockstep for as long as the chase went on. See
       the block below for the other half of the same fault (a victim two tiles
       off, where the ring route is *always* one tile).
       Aimed at the mover itself, a run closes two tiles while the victim closes
       one, so the attacker overtakes it on the next tick and the swing - which
       is measured *after* the victim's own step, on the tile it has just left -
       lands from the tile beside it. Measured live: a chicken fleeing one tile
       per tick was caught in 3 ticks at a run, where the ring goal stalled at a
       constant two tiles for as long as the test ran (26 ticks, never a swing).

     This is the same rule the client follows - it walks you onto the tile the
     creature is going to, not the one it is on - and the same one `tickFollow`
     already uses for a player being followed. */
  const moving = !!(tgt.moving || (tgt.path && tgt.path.length));
  /* The goal is the victim's own tile in two cases: while it is on the move
     (above), and when it is CLOSE ENOUGH that the ring goal would be a single
     step. The second case is the user's second report of the same fault
     (2026-09-22: *"the character changes to walking and stalking the chicken
     when it gets close … if you are running, it should easily catch up to and
     overtake the chicken"*), and it is the one the first fix missed.

     A goal on the ring with the victim two tiles off is a **one-tile route**, and
     a one-tile route can never be a run: the movement step spends at most one
     tile of route per step and the gait follows the ground actually covered
     (`player.gaitRun = player.running && steps > 1` - src/game.js#stepSim), so
     the walker covered one tile a tick - the walk animation, run orb and all -
     while a fleeing chicken covered one a tick, and the two were locked together
     for as long as the chase went on. Aimed at the victim's own tile from two
     tiles away the route is two tiles, a run buys both of them, the walker gains
     a tile a tick and overtakes, and the swing - measured after the victim's own
     step - lands from the tile it has just left. The ring is still the goal
     whenever the walk to it is worth running (three tiles or more), because
     stopping BESIDE the victim rather than on it is the nicer arrival; it is the
     short walk, the one that stalls, that is planned to the victim itself. Melee
     is the exception: against a victim that is standing still the goal is
     always the side-tile ring, even point-blank (the user's corner-trap rule,
     2026-10-09) - aiming at the victim itself walks the attacker onto the
     victim's own tile instead of the side tile beside it, which is a valid
     swing tile one step closer. */
  const dist = reachTo(pl, tgt, style);
  /* Both walks pass `keepRunOverride = true`, and that is a fix rather than a
     detail. A chase is a *continuation* of a walk, not a fresh destination, so
     it has no business rewriting the run override - and `walkTo` recomputes that
     override from `Game.input.keys` when no pointer event is handed to it, so a
     shift (or ctrl) whose keyup the page never saw would silently pin a chase to
     walking for as long as it ran. The chase follows the run orb, which is what
     the user expects to be running. */
  if (moving || (dist - 1 < 2 && !isMeleeStyle(style))) {
    return walkTo(pl, G.world, tx, tz, 1, null, true, {
      goalTest: (x, z) => x === tx && z === tz,
    });
  }
  return walkTo(pl, G.world, tx, tz, 1, null, true, { adjacent: true, orthogonal: isMeleeStyle(style), faceClear: isMeleeStyle(style) ? clearSwingTo(tgt) : null });
}

function swingNow(tgt, style) {
  /* One ready swing, now: the shared tail of the tick's in-reach branch and a
     click that lands already in reach (attacking from underneath - see
     attackNpc). A spell still waits out its own cast timer, and the weapon's
     full recovery starts here either way, so an early swing can never shorten
     the wait for the next one. */
  const p = ps();
  if (style.spell && !castReady()) {
    Combat.timer = Math.max(1, Cast.cd);
    return;
  }
  playerStrike(tgt);
  Combat.timer = Math.max(1, style.spell ? castSpeed(p) : attackSpeed(p) + (style.info.speed || 0));
  if (Combat.specDelay) {
    Combat.timer += Combat.specDelay;
    Combat.specDelay = 0;
  }
}

function xpMapFor(style) {
  const sk = styleSkill(style);
  if (sk === "ranged") {
    return style.id === "longrange" ? { ranged: 2, defence: 2, hitpoints: 1.33 } : { ranged: 4, hitpoints: 1.33 };
  }
  /* A cast trains Magic for the cast and, on the staff's defensive Spell
     style, Defence as well - the style's own table already says which. */
  if (sk === "magic") return style.info.xp || { magic: 4, hitpoints: 1.33 };
  return style.info.xp || { attack: 4, hitpoints: 1.33 };
}

function attackBonusFor(style) {
  const b = totalBonus(ps());
  const w = style.weapon;
  const sk = styleSkill(style);
  if (sk === "ranged") return b.arange;
  if (sk === "magic") return b.amagic;
  const s = (w && w.style) || "slash";
  if (s === "stab") return b.astab;
  if (s === "crush") return b.acrush;
  return b.aslash;
}

/* The stack of ammunition the shot will take, if the quiver and the weapon
   agree: a bow fires arrows and a crossbow fires bolts, which is what the two
   `ammoKind` fields mean (src/items.js). Without the match a yew bow would
   happily fire bolt racks - the item page's own examine text is the rule this
   enforces ("Must need a special type of crossbow to use this"). An item that
   names no kind at all is accepted by any weapon, so a future ammunition with
   no opinion of its own still works.

   Three weapons also carry a **published** list of their own, in both
   directions (src/items.js#AMMO_WEAPON_ONLY / #WEAPON_AMMO_ONLY): bolt racks
   are Karil's crossbow's alone and it fires nothing else, bone bolts need the
   Dorgeshuun crossbow, and the hunters' crossbow and the two kebbit bolts are
   each other's only partners. The Dorgeshuun crossbow's own list is one-way -
   it takes metal bolts up to iron (not silver) and bone bolts, and excludes the
   gem-tipped ones. */
function ammoFitsWeapon(ammoId, weapon) {
  const only = AMMO_WEAPON_ONLY[ammoId];
  if (only && !only.includes(weapon.id)) return false;
  const list = WEAPON_AMMO_ONLY[weapon.id];
  if (list && !list.includes(ammoId)) return false;
  return true;
}

/* The ammunition a shot would spend, or null when the ammo slot holds nothing
   the weapon will take. Only the **ammo slot** counts - that is what loading a
   bow means, and what the worn-equipment panel's Ammo tile shows. Ammunition
   sitting loose in the pack does not feed a weapon at all: it has to be
   equipped first. `ammoFitsWeapon` still has the final say, so arrows loaded
   into the slot are ignored by a crossbow (and the click says so - see
   `rangedAmmoWrongWeapon`). */
function rangedAmmo() {
  const p = ps();
  const w = weaponOf(p);
  if (!w) return null;
  /* A thrown weapon *is* its own ammunition: there is no quiver and no pack
     search, because the stack that will be spent is the one in the weapon slot
     (src/combat.js#thrownStack). It is returned as the "ammo" so that the whole
     shot path reads the same for a dart as for an arrow - the item's `missile`
     is what flies and its own `weaponPoison` is what a coated dart delivers. */
  if (w.kind === "thrown") return w.id;
  const want = w.ammoKind;
  const fits = (id) => {
    const d = ITEMS[id];
    if (!d || d.kind !== "ammo") return false;
    if (want && d.ammoKind && d.ammoKind !== want) return false;
    return ammoFitsWeapon(id, w);
  };
  const loaded = p.equip && p.equip.ammo;
  if (loaded && fits(loaded.id)) return loaded.id;
  return null;
}

/* True when the ammo slot holds ammunition of the right *kind* that this
   weapon nonetheless refuses - a rune crossbow with bone bolts loaded, say.
   The click uses it to say which of the two refusals happened, because "You
   have no bolts to fire." is the wrong thing to tell a player holding 500 of
   them. Only the loaded slot is read: ammunition in the pack is not equipped,
   so it is reported as nothing at all. The
   wording of that second line is this world's own; the era's exact string is
   not in any source this project can cite. */
function rangedAmmoWrongWeapon(style = currentStyle()) {
  const p = ps();
  const w = style.weapon || weaponOf(p);
  if (!w) return false;
  const refused = (id) => {
    const d = ITEMS[id];
    if (!d || d.kind !== "ammo") return false;
    if (w.ammoKind && d.ammoKind && d.ammoKind !== w.ammoKind) return false;
    return !ammoFitsWeapon(id, w);
  };
  const loaded = p.equip && p.equip.ammo;
  if (loaded && refused(loaded.id)) return true;
  return false;
}

/* Is the dark bow the wielded weapon? Its page's own rule - "it fires two
   arrows per attack" - is the only thing a bow's *ordinary* attack does beyond
   the shared shot path, so it is asked for by name in one place and read from
   `playerStrike` below (which is where the second arrow is loosed). */
function isDarkBow() {
  const w = weaponOf(ps());
  return !!w && w.id === "dark_bow";
}

/* Does the dark bow's special take its *second* form? The item page's own rule:
   "If the player has dragon arrows equipped, the 2nd special attack, Descent of
   Dragons, is used instead." Dragon arrows are the only tier that changes what
   a special does in this world, so this is asked in one place and read by the
   special itself (which variant of the two, and which missiles), by its own
   published condition, and by the combat panel's caption. */
function darkBowDragons() {
  return isDarkBow() && rangedAmmo() === "dragon_arrow";
}

/* The name of the special the weapon `w` would perform *right now*, which is not
   always the one on its item row: the dark bow's two published forms are picked
   by the arrows in the quiver, so with dragon arrows equipped the panel has to
   say `Descent of Dragons` where the row says `Descent of Darkness`. Every other
   weapon's name is the row's own string, read here so the caller never has to
   know which weapons have a second form. */
export function specialName(w) {
  const spec = w && SPECIALS[w.id];
  if (spec && spec.nameFor) return spec.nameFor();
  return (w && w.spec) || null;
}

/* One dart (knife, axe, javelin) off the stack in the **weapon slot** - the one
   pile in this game that is ammunition and equipment at once, which is the whole
   of what makes a thrown weapon a thrown weapon. The live game's own behaviour:
   a thrown weapon is wielded as a stack and one comes off *that* stack per
   throw, so the slot is what is drawn from and the pack is never touched. When
   the last one leaves, the weapon slot is emptied and the player is bare-handed
   from the next tick on - which is also the live game's own ending.

   Keeping it as its own function (rather than a branch inside `spendAmmo`) is
   what lets the *equipment* path be the only place a thrown stack is read: the
   shot path asks `rangedAmmo` for an id exactly as it does for an arrow, and
   the difference between the two is settled here. */
function thrownStack(id, qty = 1) {
  const p = ps();
  const w = p.equip && p.equip.weapon;
  if (!w || w.id !== id) return 0;
  const take = Math.min(w.qty || 1, qty);
  w.qty = (w.qty || 1) - take;
  if (w.qty <= 0) p.equip.weapon = null;
  mark("equip");
  return take;
}

/* How many rounds of `id` the player has to fire - the loaded stack, and the
   weapon slot itself for a thrown weapon, whose stack is its ammunition. The
   pack is never counted: only equipped ammunition can be fired. The dark bow's
   special is the only caller: the item page says both of its forms "require
   more than 1 arrow equipped", and that condition has to be asked *before* the
   swing is spent, so it cannot be discovered by trying to fire twice. */
function ammoCount(id) {
  const p = ps();
  const d = ITEMS[id];
  if (d && d.kind === "thrown") {
    const w = p.equip && p.equip.weapon;
    return w && w.id === id ? (w.qty || 1) : 0;
  }
  const loaded = p.equip && p.equip.ammo;
  if (loaded && loaded.id === id) return loaded.qty || 1;
  return 0;
}

/* Spend `qty` rounds of `id` off the loaded stack in the ammo slot, which is
   the only place `rangedAmmo` picks them from. A shot that empties the loaded
   stack unloads the slot, and the marker is told which panel changed so the
   Ammo tile and the pack redraw together. A thrown weapon spends from the
   weapon slot instead - see `thrownStack` - because that is where its stack
   lives. Returns how many rounds were actually spent. */
function spendAmmo(id, qty = 1) {
  const p = ps();
  const d = ITEMS[id];
  if (d && d.kind === "thrown") return thrownStack(id, qty);
  const loaded = p.equip && p.equip.ammo;
  if (loaded && loaded.id === id) {
    const take = Math.min(loaded.qty || 1, qty);
    loaded.qty = (loaded.qty || 1) - take;
    if (loaded.qty <= 0) p.equip.ammo = null;
    mark("equip");
    return take;
  }
  return 0;
}

export function maxHit(style = currentStyle()) {
  if (style.spell) return spellMaxHit(ps(), style.spell);
  const ranged = styleSkill(style) === "ranged";
  const lvl = Math.floor(boosted(ps().skills, ranged ? "ranged" : "strength") *
    prayerLevelFactor(ps(), ranged ? "range" : "str"));
  const b = totalBonus(ps());
  let strBonus;
  if (ranged) {
    const ammo = rangedAmmo();
    strBonus = (ammo ? ITEMS[ammo].ammo || 0 : 0) + (b.rstr || 0);
  } else {
    strBonus = b.str;
  }
  const effStr = lvl + styleAttackBonus(style.id).str + 8;
  return Math.max(1, Math.floor(0.5 + (effStr * (strBonus + 64)) / 640));
}

export function hitChance(atkRoll, defRoll) {
  if (atkRoll > defRoll) return 1 - (defRoll + 2) / (2 * (atkRoll + 1));
  return atkRoll / (2 * (defRoll + 1));
}

export function playerAccuracy(style = currentStyle()) {
  const ranged = styleSkill(style) === "ranged";
  const magic = styleSkill(style) === "magic";
  const lvl = Math.floor(boosted(ps().skills, ranged ? "ranged" : magic ? "magic" : "attack") *
    prayerLevelFactor(ps(), ranged ? "range" : magic ? "magic" : "atk"));
  const effAtk = lvl + styleAttackBonus(style.id).atk + 8;
  return effAtk * (attackBonusFor(style) + 64);
}

export function npcDefence(npc) {
  const lvl = (npc.stats.defence || 1) * drainedMul(npc, "defence") + 8;
  return lvl * ((NPC_DEF_BONUS[npc.type] || 0) + 64);
}

/* Magic rolls against the creature's magic defence, which for this revision of
   the cache is the same defence level the melee roll uses. */
export function npcMagicDefence(npc) {
  const lvl = (npc.stats.defence || 1) * drainedMul(npc, "defence") + 8;
  const bonus = NPC_MAGIC_DEF_BONUS[npc.type] || 0;
  return lvl * (bonus + 64);
}

/* The spell's own max hit. Two modifiers apply to it, both the live game's own:

   * A god spell hits for **30 instead of 20 while Charge is running and the
     caster is wearing that god's own cape**. Both halves are required - every
     god spell's page reads "Charged & <god> cape worn: 30" - so a Charge with
     no cape, or a cape with no Charge, leaves the spell at 20. This used to
     read `spell.god && chargeTicks` alone, which handed out the bonus with no
     cape at all.
   * A magic-damage bonus (`mdmg`, in whole percent) multiplies the result. It
     is applied before the floor, so the 1%-per-piece bonuses on the infinity
     robes and the 0.2% on a Seers ring only show up once they add up: +10%
     turns a 20 into a 22, +0.2% turns it into 20. */
export function spellMaxHit(player, spell) {
  let max = spell.max || 1;
  if (spell.god && player.chargeTicks > 0 && equippedId(player, "cape") === spell.god + "_cape") max += 10;
  const mdmg = totalBonus(player).mdmg || 0;
  if (mdmg) max = max * (1 + mdmg / 100);
  return Math.floor(max);
}

export function playerDefence(npc) {
  const b = totalBonus(ps());
  const style = NPC_STYLE[npc.type] || "crush";
  /* Which of the player's four defence bonuses the attacker's style reads, and
     therefore which shield and which piece of armour matters in the fight. The
     engine matched only the three melee styles until Supreme, whose published
     style is Ranged, made `drange` worth reading - see NPC_STYLE. `magic` is
     the fourth: a caster's curse or Fire Wave is resisted by magic defence, the
     same bonus the player's own spells are rolled against (see `npcMagicDefence`
     for the mirror image of this on the creature's side), so Ahrim's blasts are
     answered by dragonhide and the mystic robes' +magic, which is the whole
     reason those pieces are worth wearing at the Barrows. */
  const db = style === "slash" ? b.dslash : style === "stab" ? b.dstab
    : style === "range" ? b.drange : style === "magic" ? b.dmagic : b.dcrush;
  const lvl = Math.floor(boosted(ps().skills, "defence") *
    (style === "magic" ? magicDefenceFactor(ps()) : prayerLevelFactor(ps(), "def"))) + 8;
  return lvl * (db + 64);
}

/* The same roll for an attack that is **not** one of the four styles: a dragon's
   breath, which the wiki's own mechanic section says "usually roll[s] with the
   monster's Magic accuracy against the player's Magic defence". `dmagic` is the
   bonus it reads, so dragonhide and a mystic robe answer fire the way they
   answer Ahrim's blasts. Protect from Magic does *not* enter here - it is a
   protection, not a Defence boost, and it works by lowering the breath's ceiling
   instead (see `dragonfireMax`). */
export function playerMagicDefence() {
  const b = totalBonus(ps());
  const lvl = Math.floor(boosted(ps().skills, "defence") * magicDefenceFactor(ps())) + 8;
  return lvl * ((b.dmagic || 0) + 64);
}

function drainedMul(npc, stat) {
  const d = npc.drains && npc.drains[stat];
  return d ? d.mul : 1;
}

/* The one place a drained level is worked out, so a multiplier drain (a curse)
   and a flat one (Ahrim's five Strength levels) lower a stat by the same rule:
   the flat part comes off the level, then the multiplier scales what is left. */
function drainedValue(npc, stat, base) {
  const d = npc.drains && npc.drains[stat];
  if (!d) return base;
  return Math.max(1, base - (d.flat || 0)) * (d.mul == null ? 1 : d.mul);
}

function npcAccuracy(npc) {
  const atk = drainedValue(npc, "attack", npc.stats.attack || 1);
  return (atk + 8) * (atk + 64);
}

function npcMaxHit(npc) {
  const base = NPC_MAX_HIT[npc.type] || 1;
  const str = (npc.stats && npc.stats.strength) || 1;
  /* A flat Strength drain takes levels off the *level*, so the max hit falls by
     the same ratio - not by a percentage of itself. */
  let hit = Math.max(1, Math.round(base * (drainedValue(npc, "strength", str) / str)));
  /* Dharok the Wretched fights with his own set on, so his damage climbs as his
     hitpoints fall - the same rule the player's set has (see `dharokModifier`),
     on his own 100 hitpoints. The wiki's numbers are the proof of the formula:
     29 at full health, 57 at one hitpoint, and 1 + (99/100) * (100/100) = 1.99,
     which turns 29 into 57 exactly. Applied *after* the drained level, because
     the two are different things: a Weaken lowers the axe, the wounds raise it. */
  if (npc.type === "dharok") hit = Math.floor(hit * dharokModifier(npc));
  return hit;
}

/* The Wretched Strength modifier. Called with the player by default - the
   player's own set effect (src/combat.js#playerStrike) - and with Dharok
   himself by `npcMaxHit`, which is why it reads `hp`/`stats.hp` from either
   shape: an entity has `.hp` and `.stats.hp`, a player state has `.hp` and
   `.maxHp`. */
function dharokModifier(entity) {
  const p = entity || ps();
  const max = (p.maxHp != null ? p.maxHp : (p.stats && p.stats.hp)) || 1;
  const hp = Math.max(0, p.hp != null ? p.hp : max);
  return 1 + ((max - hp) / 100) * (max / 100);
}

/* hitsplats are drawn as a screen-space overlay by src/fx.js so that the
   cache's own sprite art and the client's plain-11 numerals appear at exactly
   the pixel size the real game uses. */

/* --------------------------------------------------------------- attacking */

export function attackNpc(npc) {
  if (!npc || npc.dead) return;
  /* The dead do not start fights. */
  if (G && G.player && G.player.dying) return;
  /* No fight starts mid-climb - retaliation included; the arrival is a level
     away a tick later (src/actions.js#climbLadder). */
  if (G && G.player && G.player.climbLock) return;
  /* The mark's grace after a pickpocket: ten ticks before a theft can become
     a kill (the user's rule - set in src/actions.js#attemptPickpocket). This
     is the funnel for every player-initiated attack, so melee, ranged,
     autocast and manual single-casts are all refused together. */
  if (npc.ppGrace > 0) {
    if (!quietAttack) chat("You can't attack someone you just stole from.", "warn");
    return;
  }
  /* Picking a fight is the player doing something, so a level-up panel that is
     up goes with it (src/dialogue.js#dismissLevelUp) - this is also the
     auto-retaliate path (see the comment by `quietAttack`). */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  /* Standing up to fight is the end of hiding in a crate (src/actions.js#
     hideInCrate): you cannot swing a sword from inside a box, and a creature
     that could not see you a moment ago has to be able to hit back. */
  revealPlayer("You climb out of the crate.");
  if (Actions.act) Actions.act = null;
  try { stopFollowing(); } catch (err) {}
  /* The banker and *every* vendor serve rather than fight: a shop is named by
     the spawn's own `shop` field, so the check is that field and not a list of
     type names - a new shopkeeper is then never a combat NPC by construction. */
 if (npc.type === "banker" || npc.shop || npc.type === "scully") {
   if (Actions.npcInteractDefault) Actions.npcInteractDefault(npc, "left");
   return;
 }
  /* The cay's crabs are ambient beach life (cache npc 2706, no actions, no
     combat rows): swings and aimed casts at them refuse instead of starting
     a fight the body has no death for. */
  if (npc.type === "crab") {
    if (Actions.chat) Actions.chat("The crab scuttles sideways, well out of reach.");
    return;
  }
  const style = styleForAttack();
  /* A staff's two Spell styles are cast styles and nothing else. With no spell
     picked (and no autocast set) there is nothing for them to cast, and letting
     the swing fall through to the melee code rolls it against the *magic* attack
     bonus instead of a melee one - which is how a creature ends up unkillable:
     the accuracy roll is `level * (bonus + 64)`, so any suit of armour that
     takes the magic attack bonus to -64 or below can never land, and the
     creature simply never loses a hitpoint. Refusing here is also the honest
     reading of the client's own style panel, where those two buttons only ever
     choose between the cast and the defensive cast. */
  if (styleIsCast() && !style.spell) {
    refuseCast();
    return;
  }
  if (styleSkill(style) === "ranged" && !rangedAmmo()) {
    const w = style.weapon;
    const bolt = w && w.ammoKind === "bolt";
    const thrown = w && w.kind === "thrown";
    if (!quietAttack) chat(thrown
      ? "You have no " + (THROWN_PLURAL[w.thrown] || "throwing weapons") + " to throw."
      : rangedAmmoWrongWeapon(style)
        ? "You can't use those " + (bolt ? "bolts" : "arrows") + " with this weapon."
        : "You have no " + (bolt ? "bolts" : "arrows") + " to fire.", "warn");
    return;
  }
  if (style.spell) {
    const st = spellStatus(ps(), style.spell);
    if (!st.levelOk) {
      if (!quietAttack) chat("You need a Magic level of " + style.spell.level + " to cast " + style.spell.name + ".", "warn");
      return;
    }
    if (!st.runesOk) {
      if (!quietAttack) chat("You do not have enough runes to cast this spell.", "warn");
      return;
    }
  }
  Combat.target = npc;
  /* Look at them for the whole walk-in, not just on arrival: the tick re-aims
     every moment (see faceEnt), and this starts the turn on the click itself. */
  if (G && G.player) G.player.faceEnt = npc;
  /* The creature this player has taken on is *theirs* from this click on - it
     is the one whose position and health they speak for to everybody else, and
     the one whose copy they will not let another client drag around
     (src/game.js#creatureStateBatch / #applyNpcStates). Set here as well as on
     every blow, so that a chase that has not landed a hit yet still counts. */
  npc.playerHitTicks = 8;
  Combat.chaseTimer = 0;
  /* ...and set off after it now. The tick's chase would do the same a moment
     later, but a route planned there cannot be walked until the tick *after*
     (movement runs before combat in src/game.js#stepSim), so a creature across
     the square left the player standing still for two ticks before the first
     step - see chaseTarget. The click is authored here, so this is also where
     an unreachable creature is refused at once rather than a tick later. */
  if (!chaseTarget(G.player, npc, style)) {
    Combat.target = null;
    if (!quietAttack) chat("I can't reach that!", "warn");
  } else {
    /* Remember the tile this first leg was planned for, so the tick's chase
       does not immediately plan the same route a second time (see Combat.
       chaseTile). `Combat.target`'s setter has just cleared it, so it is set
       again here - after the plan, never before it. */
    Combat.chaseTile = Math.floor(npc.x) + "," + Math.floor(npc.z);
    /* In reach on the click itself, the blow lands on the click - face, plan
       (nothing to walk) and swing all on the one tick (the user's rule,
       2026-10-09: no 1-tick wait from the safespot). The swing starts the
       weapon's full recovery, so clicking cannot shorten the wait between
       blows - and a click that lands mid-recovery (timer running) still does
       nothing. Walled-off (melee) or blind (bow/spell) is not in reach even
       at range: the walk-in below runs and the swing waits for arrival. */
    const inReachNow = reachTo(G.player, npc, style) <= attackRange(style)
      && !(isMeleeStyle(style) && meleeWalled(G.player, npc))
      && !(!isMeleeStyle(style) && sightBlocked(G.player, npc));
    if (inReachNow) {
      if (Combat.timer <= 0) { Combat.pending = null; swingNow(npc, style); }
      /* On recovery the swing is COMMITTED, not queued on the target (the
         user's rule, 2026-10-09): a step-in-place cancel must not take it -
         it fires at its natural time even targetless, unless the victim has
         left reach by then (see the tick's pending block). */
      else Combat.pending = { tgt: npc, style };
    } else {
      Combat.pending = null;
      if (Combat.timer <= 0) Combat.timer = 1;
    }
  }
}

export function stopCombat() {
  if (Combat.target) {
    Combat.target = null;
    Combat.timer = 0;
  }
  Combat.pending = null;
  if (G && G.player) G.player.faceEnt = null;
}

export function isFighting() {
  return !!Combat.target;
}

function swing(npc) {
  /* A swing is the player acting, so it clears a level-up panel
     (src/dialogue.js#dismissLevelUp). This is the single place every player
     attack passes through - a normal swing and a special both call it - so a
     fight clears the panel once per attack rather than every tick. */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  G.player.actionAnim = 1;
  G.player.swingId = (G.player.swingId || 0) + 1;
  /* The swing marks the tick, so a blow landing on the same tick does not
     raise the block pose over it (see the block in `npcStrikeHit`); and a
     block raised earlier this tick is dropped, because the cast channel
     outranks the swing channel in the model (src/models3d.js) and would
     otherwise hide the swing just made. */
  G.player.struckTick = G.tickCount;
  if (G.player.castAnim === "defend") { G.player.castAnim = null; G.player.castLeft = 0; }
  /* ...and the same swing is shown to the players standing around us. This is
     the one place it can be told from, because it is the one place every attack
     - an ordinary blow, a special, a bowshot - passes through, and a swing that
     only some attacks broadcast would leave half a fight invisible. The
     sequence name is the weapon's own fight-type animation, exactly the pose a
     neighbour would see if the weapon were in their own hand, and it travels as
     an index into the table both clients build (src/items.js#combatAnims). The
     creature is named by its index in the shared spawn table, so the listener
     knows which of its own bodies this swing is at (src/game.js#ghostCombat);
     the tile rides along as the fallback for a creature it has no counterpart
     for. A named creature is also what a *missed* swing needs: nothing lands,
     so no hitsplat packet follows, and without the name a neighbour would never
     see the creature being fought at all. */
  const w = weaponOf(ps());
  netCombat(0, combatAnimIndex(attackAnimFor(w, ps().styleIndex || 0)),
    Math.floor(npc ? npc.x : G.player.x), Math.floor(npc ? npc.z : G.player.z),
    npc ? npc.spawnIx : 0xffff);
}

function resolveHit(attackRoll, defenceRoll, max) {
  if (Math.random() > hitChance(attackRoll, defenceRoll)) return 0;
  return Math.floor(Math.random() * (max + 1));
}

/* ============================================================ the Barrows sets

   Each of the six brothers' sets does something when all four of its pieces are
   worn at once, and the tests are the item ids rather than the slots, so a
   second copy of a piece in the wrong slot cannot claim a set. The effects and
   their 25% proc chance are the wiki's own (see the Barrows equipment page's
   per-brother sections):

     dharok  Wretched Strength - the damage modifier above (`dharokModifier`,
                                 which Dharok himself also uses - see `npcMaxHit`)
     guthan  Infestation       - a quarter of all hits heal the wearer for the
                                 damage dealt
     verac   Defiler           - a quarter of all hits ignore armour, Defence and
                                 protection prayers, i.e. they cannot miss
     ahrim   Blighted Aura     - a quarter of all magical hits lower the victim's
                                 Strength by 5 levels
     torag   Corruption        - a quarter of all hits lower the victim's run
                                 energy by 20%: **nothing to implement**, because
                                 no creature in this world has run energy to
                                 drain (the player is the only one who runs)
     karil   Tainted Shot      - a quarter of all hits lower the victim's Agility
                                 by 20%: nothing to implement either, for the same
                                 reason - no creature has an Agility level

   The last two are left unimplemented on purpose rather than faked with a drain
   onto a stat that does not exist; if a later unit gives creatures run energy or
   agility, these two rows are where the effect goes. */
const SET_PROC = 0.25;
const BARROWS_SETS = {
  dharok: ["dharoks_helm", "dharoks_platebody", "dharoks_platelegs", "dharoks_greataxe"],
  guthan: ["guthans_helm", "guthans_platebody", "guthans_chainskirt", "guthans_warspear"],
  verac: ["veracs_helm", "veracs_brassard", "veracs_plateskirt", "veracs_flail"],
  torag: ["torags_helm", "torags_platebody", "torags_platelegs", "torags_hammers"],
  karil: ["karils_coif", "karils_leathertop", "karils_leatherskirt", "karils_crossbow"],
  ahrim: ["ahrims_hood", "ahrims_robetop", "ahrims_robeskirt", "ahrims_staff"],
};

function worn(id) {
  const eq = ps().equip || {};
  for (const k of Object.keys(eq)) if (eq[k] && eq[k].id === id) return true;
  return false;
}

/* Is the whole set on? All six rows name four pieces, each brother's own weapon
   included - so a set's weapon has to be in hand for its effect to fire, which
   is how the live game's set effects work too (Karil's crossbow and Ahrim's
   staff were added to src/items.js with the effects, so every row is complete). */
function hasSet(name) {
  return BARROWS_SETS[name].every(worn);
}

/* The effects that fire *on a hit*, called from the two places damage lands on
   a creature: the melee/ranged strike and the magic one. `magic` tells the two
   apart, because Ahrim's only procs on a magical hit and Guthan's only on a
   melee one (the sets cannot overlap anyway - each needs its own weapon - but
   the argument keeps the rule where it belongs instead of in the caller). */
function applySetOnHit(npc, dmg, opts) {
  if (dmg <= 0) return;
  const magic = !!(opts && opts.magic);
  const p = ps();
  if (!magic && hasSet("guthan") && Math.random() < SET_PROC) {
    p.hp = Math.min(p.maxHp, p.hp + dmg);
  }
  if (magic && hasSet("ahrim") && Math.random() < SET_PROC) {
    drainStat(npc, { stat: "strength", flat: 5 }, AHRIM_DRAIN_TICKS, "ahrim");
    chat("The " + npc.type + "'s strength is drained.", "game");
  }
}

/* How long Ahrim's Strength drain lasts. The wiki gives the size (5 levels) but
   not a duration - the same gap the curses and the god spells have - so this
   follows the curse clock, which is the family the effect belongs to. */
const AHRIM_DRAIN_TICKS = 16;

/* ========================================================== special attacks

   Eighteen of the world's weapons carry a special attack, and every row below
   is the live game's own: the name, the share of the bar it costs and the effect
   are the OSRS wiki's Special attacks table, the same published source as every
   other number in this project. The item rows in src/items.js carry
   `spec`/`specCost` (which is what the combat panel's bar reads); the effect
   lives here, beside the combat code it drives, keyed by item id.

   **Every row was re-checked against the wiki's per-weapon page and its change
   history, and dated to August 2007** - the trap here is that the live game has
   rebalanced several of these since, so today's numbers are not necessarily
   this world's. That audit found four rows to fix and confirmed the rest:

     * **granite maul** was charging 60%. The cost was *raised* to 60% on
       5 September 2019 (the ornate maul handle is what lowers it back to 50%),
       so in 2007 it is **50%**.
     * **rune claws**' slower recovery was two ticks; the wiki measures it at
       **one** tick (0.6s).
     * the **dragon halberd**'s cone included the target's own tile. The live
       game's 7 June 2018 note records the old shape - "only hit the main target
       on the central tile, but hit an unlimited amount of monsters on the two
       adjacent tiles" - so the primary tile is the main target's alone now.
     * the **ancient mace** capped the wielder's prayer at the level plus their
       prayer bonus, which is this world's invention; the wiki is explicit that
       it may go above the maximum "up to the amount of damage inflicted".
     * Confirmed period-correct, against change notes that date the current
       behaviour *before* 2007: **magic shortbow** 55% (raised from 35% on
       22 February 2005), **dragon scimitar** 55% with the protection-prayer
       lock (4 April 2005), **abyssal whip** 50% at +25% accuracy (the
       guarantee-a-max-hit version ended 22 June 2005), **dragon dagger**'s two
       simultaneous hits in PvM (they were only separated on 13 October 2016),
       and the fixed costs of the rest.

   Three rows state a limit rather than pretending past it, the same honesty the
   Barrows sets' Torag and Karil rows use:

     * **Sever**'s lock-out of the target's protection prayers, and the **ancient
       mace**'s hits-through-Protect-from-Melee, both need a target that prays,
       and nothing in this world does. The rows are written to bite the moment a
       creature carries `prayers`/`prayerPoints`.
     * **Energy Drain** siphons run energy, which only the player has: it bites on
       an entity with `runEnergy` and does nothing to one without.
     * **Snapshot**'s published attack-roll modifier is 43%, which cannot be read
       as a single hit, so both of its arrows take the tooltip's own words,
       "reduced accuracy", as -25%.

   One duration this world has no published value for - how long Darklight's
   drain lasts - follows the nearest thing that does have one, and says so at its
   row. */

/* The halberd's sweep lands a second time on "monsters that occupy two or more
   tiles". `size` is the baked model's own height in tiles (src/game.js#NPC_STATS),
   so two tiles is the honest line: the giants (2.4-3.9), the dragons (3.3) and
   the giant bat (2.0) are large; everything else is not. */
const LARGE_NPC_SIZE = 2;

/* One hit of a special attack. `acc`/`dmg` are the row's modifiers (0.15 = +15%),
   `true` is a guaranteed hit - the accuracy roll is skipped, which is how the two
   bows' "true strike" rows read - and `min` is a damage floor the roll cannot go
   below, which is the dark bow's own published "a minimum of 5 damage per arrow"
   (it is applied to a miss as well as to a hit, so the arrow really does always
   bite for its floor). What happens after the roll is the ordinary tail,
   `landStrike`, so experience, Smite, the set procs and the kill all behave
   exactly as they do for a normal swing. */
function specRoll(npc, style, opts) {
  const o = opts || {};
  const max = Math.max(1, Math.round(maxHit(style) * (1 + (o.dmg || 0))));
  const dmg = o.true
    ? Math.floor(Math.random() * (max + 1))
    : resolveHit(playerAccuracy(style) * (1 + (o.acc || 0)), npcDefence(npc), max);
  /* `min` is the dark bow's published floor - "a minimum of 5 damage per arrow"
     - and it is applied to the roll, which is why a miss really does bite for
     it: "both types of special attacks have to pass regular accuracy check to be
     able to deal more damage than their minimum guaranteed hit". */
  let out = o.min ? Math.max(o.min, dmg) : dmg;
  /* `cap` is Descent of Dragons' published ceiling - "capping the max hit at 48
     damage per arrow" - and it lands on the *outcome*, not on the roll's
     ceiling. The wiki's own reference for the live code is Mod Ash: "It'd roll
     0-51, then reduce 49, 50 and 51 to 48. So you have a higher chance of
     getting 48 than of getting 47." A ceiling over the roll range instead would
     make 48 exactly as likely as 47 and would flatten the +50% away entirely
     below it. */
  if (o.cap != null && out > o.cap) out = o.cap;
  return out;
}

function specHit(npc, style, opts) {
  if (!npc || npc.dead) return 0;
  const dmg = specRoll(npc, style, opts);
  landStrike(npc, dmg, style);
  return dmg;
}

/* One arrow of a special: the quiver is charged for it exactly as a normal shot
   charges, and the damage lands when the arrow does, so a Snapshot really is two
   arrows in the air. `opts.shot` is handed straight through to `shoot` - the
   dark bow's specials use it for an anchor of their own and for the missiles and
   impacts the special flies instead of the arrow's own (see MISSILE_ANCHORS and
   `shoot`). */
function specArrow(npc, style, opts) {
  const ammo = rangedAmmo();
  if (!ammo) return 0;
  spendAmmo(ammo, 1);
  const dmg = specRoll(npc, style, opts);
  shoot(npc, dmg, style, ammo, null, opts && opts.shot);
  return dmg;
}

/* The Seercull's Soulshot takes the target's Magic level down by the damage its
   arrow dealt - "drains the target's Magic level by the amount of damage
   inflicted", the bow's own wording - which goes through `drainStat` like any
   other drain, on the clock the curses use.

   A creature's Magic level is not read by anything in this world's fight model
   (a monster's spell damage is its own table row, not a formula over its Magic),
   so against most of the bestiary this is a drain the *player* can see in the
   chat and the beast fights on unaffected. That is stated rather than papered
   over: it is the honest translation of the special into a world whose creatures
   do not cast from their stats. */
function drainNpcMagic(npc, dmg) {
  drainStat(npc, { stat: "magic", flat: dmg }, AHRIM_DRAIN_TICKS, "seercull");
  chat("The " + npc.type + "'s Magic is drained by " + dmg + ".", "game");
}

/* Every living creature standing on one of `tiles`. This is how the halberd's
   sweep and the two-handed sword's power stab find their extra victims;
   `exclude` is the creature the first hit has already been rolled against. */
function specTargets(tiles, exclude) {
  const out = [];
  for (const npc of G.npcs) {
    if (npc.dead || npc === exclude) continue;
    const t = tileOf(npc);
    if (tiles.some((v) => v.x === t.x && v.z === t.z)) out.push(npc);
  }
  return out;
}

/* The halberd's 1x3 cone: the target's own tile and the two beside it, across the
   line the attack came down (the axis the attack is more nearly parallel to is
   the *length* of the 1x3, so the other axis is its width).

   `sweepSideTiles` is the **two beside it only**. The period's own description of
   the dragon halberd's Sweep (recorded by the live game's 7 June 2018 change
   note) is "only hit the main target on the central tile, but hit an unlimited
   amount of monsters on the two adjacent tiles", so the tile the main target
   stands on is the main target's alone and a creature stacked on top of it is
   not caught. Both halberds here sweep the side tiles. */
function sweepTiles(npc) {
  const pt = tileOf(G.player);
  const tt = tileOf(npc);
  const dx = tt.x - pt.x, dz = tt.z - pt.z;
  const along = Math.abs(dz) >= Math.abs(dx);
  const sx = along ? 1 : 0, sz = along ? 0 : 1;
  return [
    { x: tt.x, z: tt.z },
    { x: tt.x + sx, z: tt.z + sz },
    { x: tt.x - sx, z: tt.z - sz },
  ];
}

function sweepSideTiles(npc) {
  return sweepTiles(npc).slice(1);
}

/* Every tile within one square of the player - the two-handed sword's "up to
   fourteen enemies surrounding you", a 3x3 of which the player is the middle. */
function aroundPlayerTiles() {
  const pt = tileOf(G.player);
  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) tiles.push({ x: pt.x + dx, z: pt.z + dz });
  return tiles;
}

export const SPECIALS = {
  dragon_dagger: {
    name: "Puncture", cost: 25,
    /* Two quick slashes, each at +15% accuracy and +15% damage. */
    run(npc, style) {
      specHit(npc, style, { acc: 0.15, dmg: 0.15 });
      specHit(npc, style, { acc: 0.15, dmg: 0.15 });
    },
  },
  dragon_longsword: {
    name: "Cleave", cost: 25,
    run(npc, style) { specHit(npc, style, { dmg: 0.25 }); },
  },
  dragon_scimitar: {
    name: "Sever", cost: 55,
    run(npc, style) {
      const dmg = specHit(npc, style, { acc: 0.25 });
      /* "Disables the target's active protection prayers" (PvP). No creature in
         this world prays, so the row waits on a target that carries `prayers`
         rather than inventing a drain it does not have. */
      if (dmg > 0 && npc.prayers && npc.prayers.length) {
        npc.prayers.length = 0;
        chat("The " + npc.type + "'s protection prayers are disabled.", "game");
      }
    },
  },
  dragon_mace: {
    name: "Shatter", cost: 25,
    run(npc, style) { specHit(npc, style, { acc: 0.25, dmg: 0.5 }); },
  },
  dragon_battleaxe: {
    name: "Rampage", cost: 100,
    /* The hit first, then the trade: a tenth of each of Attack, Defence, Ranged
       and Magic, and Strength up by ten plus a quarter of what was taken. The
       drains stack if you lean on it, exactly as they do in the live game. */
    run(npc, style) {
      specHit(npc, style, {});
      const p = ps();
      let taken = 0;
      for (const sk of ["attack", "defence", "ranged", "magic"]) {
        const off = Math.floor(boosted(p.skills, sk) * 0.1);
        if (off > 0) { applyBoost(p, sk, -off); taken += off; }
      }
      const gain = 10 + Math.floor(taken / 4);
      applyBoost(p, "strength", gain);
      chat("You drain your own Attack, Defence, Ranged and Magic, raising your Strength by " + gain + ".", "game");
      mark("skills");
    },
  },
  dragon_halberd: {
    name: "Sweep", cost: 30,
    /* +10% damage on everything it touches; a large body is hit a second time,
       at -25% accuracy; and the two tiles *beside* the target take the blow
       too.

       The cone is the period's own shape, not today's: the live game's 7 June
       2018 change records the old behaviour as "only hit the main target on the
       central tile, but hit an unlimited amount of monsters on the two adjacent
       tiles", which is what this does - the primary tile is the main target's
       alone, so a creature stacked on top of it is not caught, and the adjacent
       tiles have no cap (this world carries no multi-combat flag, so there is
       no third rule to write). */
    run(npc, style) {
      specHit(npc, style, { dmg: 0.1 });
      if (npc && !npc.dead && (NPC_STATS[npc.type] || {}).size >= LARGE_NPC_SIZE) {
        specHit(npc, style, { acc: -0.25, dmg: 0.1 });
      }
      for (const other of specTargets(sweepSideTiles(npc), npc)) specHit(other, style, { dmg: 0.1 });
    },
  },
  armadyl_halberd: {
    name: "Armadyl's Judgement", cost: 50,
    /* The halberd's own Sweep, raised: +25% accuracy and damage into the target
       and +10% into the rest of the 1x3 cone it takes with it. (Every number of
       this weapon is this world's own - it is hand-authored, see its row in
       src/items.js and src/tools/hand-models/armadyl-halberd.mjs - so this is
       the one special in the table with no published row behind it; it is built
       out of the same `specHit`/`sweepTiles` the dragon halberd's Sweep uses so
       that it lands, drains and grants experience exactly like every other
       special does.) */
    run(npc, style) {
      specHit(npc, style, { acc: 0.25, dmg: 0.25 });
      for (const other of specTargets(sweepSideTiles(npc), npc)) specHit(other, style, { dmg: 0.1 });
    },
  },
  dragon_2h: {
    name: "Powerstab", cost: 60,
    /* "Hits up to fourteen enemies within one square of the user": the 3x3 the
       player stands in the middle of, no damage modifier. */
    run(npc, style) {
      for (const other of specTargets(aroundPlayerTiles(), null)) specHit(other, style, {});
    },
  },
  dragon_spear: {
    name: "Shove", cost: 25,
    /* No damage at all: the target is pushed a tile back along the line it was
       attacked on and held there for five ticks. The shove lands whether or not a
       blow would have, which is why there is no accuracy roll here. */
    run(npc, style) {
      const pt = tileOf(G.player);
      const tt = tileOf(npc);
      const dx = Math.sign(tt.x - pt.x), dz = Math.sign(tt.z - pt.z);
      const tx = tt.x + dx, tz = tt.z + dz;
      /* A shove is a step, not a teleport: walkable is not enough, the tile has
         to be reachable without crossing a sealed wall face. */
      if ((dx || dz) && G.world.isWalkable(tx, tz) && !entityAtTile(tx, tz, npc)
          && !(G.world.blocksStep && G.world.blocksStep(tt.x, tt.z, tx, tz))) {
        placeEntity(npc, tx + 0.5, tz + 0.5, npc.dir || 0);
      }
      npc.boundTicks = Math.max(npc.boundTicks || 0, 5);
      chat("You shove the " + npc.type + " back.", "game");
    },
  },
  granite_maul: {
    /* 50%, not the 60% the live game charges today: the cost was *raised* to 60%
       on 5 September 2019 (an ornate maul handle lowers it back to 50%), and
       this world is August 2007. */
    name: "Quick Smash", cost: 50,
    /* "Instantly performs a second attack" - two ordinary hits on the same
       tick, which is the whole of the weapon's reputation. The live game's own
       tooltip notes it does *not* raise accuracy, so there is no modifier. */
    run(npc, style) {
      specHit(npc, style, {});
      specHit(npc, style, {});
    },
  },
  rune_claws: {
    name: "Impale", cost: 25,
    /* +10% accuracy and damage ("Attack with 10% more Attack and Strength" in
       the period's own wording), and the recovery after the swing is one tick
       longer - the row's "slower speed". The wiki measures that penalty at
       exactly one tick (0.6s), not two. */
    run(npc, style) {
      specHit(npc, style, { acc: 0.1, dmg: 0.1 });
      Combat.specDelay = 1;
    },
  },
  abyssal_whip: {
    name: "Energy Drain", cost: 50,
    run(npc, style) {
      const dmg = specHit(npc, style, { acc: 0.25 });
      /* "Transfers 10% of the target's run energy to the user" - the target has
         to have some, and only the player runs in this world. Written to siphon
         anything that carries a `runEnergy`. */
      const e = npc && npc.runEnergy;
      if (dmg > 0 && e > 0) {
        const take = Math.max(1, Math.floor(e * 0.1));
        npc.runEnergy = e - take;
        ps().runEnergy = Math.min(RUN_UNITS, ps().runEnergy + take);
        mark("run");
      }
    },
  },
  darklight: {
    name: "Weaken", cost: 50,
    /* Off Attack, Strength and Defence by 5% of the level plus 1 - twice as hard
       on a demon. The wiki gives no duration, so this follows the curse clock
       (`AHRIM_DRAIN_TICKS`), which is the family the effect belongs to. */
    run(npc, style) {
      const dmg = specHit(npc, style, {});
      if (dmg <= 0) return;
      const pct = isDemon(npc.type) ? 10 : 5;
      for (const st of ["attack", "strength", "defence"]) {
        drainStat(npc, { stat: st, pct, flat: 1 }, AHRIM_DRAIN_TICKS, "darklight");
      }
      chat("The " + npc.type + "'s Attack, Strength and Defence are drained" + (isDemon(npc.type) ? " twice over." : "."), "game");
    },
  },
  ancient_mace: {
    name: "Favour of the War God", cost: 100,
    /* The blow is a normal one (it ignores Protect from Melee, which no creature
       here uses), and the prayer it takes from the target goes to the wielder -
       who may end up above their own level, which is the weapon's own trick: the
       wiki's own words are that it "can raise your current Prayer points to above
       your maximum Prayer level - up to the amount of damage inflicted by the
       attack". So the ceiling this hit may reach is the level plus the damage it
       dealt, which is also the reason two specs in a row cannot stack - the
       second one's ceiling is lower than the prayer the first one already
       granted. */
    run(npc, style) {
      const dmg = specHit(npc, style, {});
      const p = ps();
      const pool = (npc && npc.prayerPoints) || 0;
      const taken = Math.min(dmg, pool);
      if (taken > 0) {
        npc.prayerPoints = pool - taken;
        p.prayerPoints = Math.min(p.maxPrayer + taken, p.prayerPoints + taken);
        chat("You drain " + taken + " prayer point" + (taken === 1 ? "" : "s") + " from the " + npc.type + ".", "game");
        mark("prayer");
      }
    },
  },
  excalibur: {
    name: "Sanctuary", cost: 100,
    run(npc, style) {
      specHit(npc, style, {});
      applyBoost(ps(), "defence", 8);
      chat("You feel a surge of Defence.", "game");
      mark("skills");
    },
  },
  dragon_axe: {
    name: "Lumber Up", cost: 100,
    /* A skilling special pressed from the same bar: it swings like any other, and
       it raises the wielder's Woodcutting by three (src/actions.js#skillLvl is
       what makes that worth anything - a boosted level really does clear the
       tree's requirement and improve the odds). */
    run(npc, style) {
      specHit(npc, style, {});
      applyBoost(ps(), "woodcutting", 3);
      chat("Your Woodcutting level is boosted by 3.", "game");
      mark("skills");
    },
  },
  magic_shortbow: {
    name: "Snapshot", cost: 55,
    /* Two arrows, both at -25% accuracy (see the note above on the published
       43%), each consuming its own arrow. */
    run(npc, style) {
      specArrow(npc, style, { acc: -0.25 });
      specArrow(npc, style, { acc: -0.25 });
    },
  },
  magic_longbow: {
    name: "Powershot", cost: 35,
    run(npc, style) { specArrow(npc, style, { true: true }); },
  },
  /* The magic composite bow fires the magic longbow's own Powershot - the live
     game's special-attack table heads that row "Magic longbow * Magic comp bow"
     - so it is the same code under a second weapon key rather than a copy that
     could drift. Its own 35% of the bar is on the item row (src/items.js). */
  magic_comp_bow: {
    name: "Powershot", cost: 35,
    run(npc, style) { specArrow(npc, style, { true: true }); },
  },
  dark_bow: {
    name: "Descent of Darkness", cost: 55,
    /* Both of the bow's specials are 55% and both need a *stack*: the item page
       says each form "require[s] more than 1 arrow equipped", so the bar has to
       refuse before it is charged and before the pose is spent. The refusal is
       the same shape as the low-energy one in `trySpecialAttack` - a message and
       the bar going out - which is why `ok` returns the published condition's
       own explanation as a string rather than throwing. */
    ok() {
      const ammo = rangedAmmo();
      if (!ammo) return "You need more than one arrow to use this attack.";
      return ammoCount(ammo) > 1 ? true : "You need more than one arrow to use this attack.";
    },
    /* The special has two *published names* and the panel should say which one
       this swing would be: with dragon arrows equipped it is Descent of Dragons
       ("If the player has dragon arrows equipped, the 2nd special attack,
       Descent of Dragons, is used instead"), otherwise Descent of Darkness. */
    nameFor() { return darkBowDragons() ? "Descent of Dragons" : "Descent of Darkness"; },
    /* Two arrows, both loosed on the same tick with +30% damage and the bow's
       own published floor of five per arrow ("a minimum of 5 damage per arrow" -
       which is why the floor is applied to a miss too, in `specRoll`). Each
       arrow is charged to the quiver like any other shot, so both really are
       spent when both fire; with only one left, the second shot simply does not
       happen. The pair also leaves the bow from two points of its own and on the
       client's own ballistic arc (DARK_BOW_PAIR, DARK_BOW_SLOPE): two arrows are
       the whole of what the special is, and *Descent* is the shape it flies - so
       both of those are part of the attack, not decoration.

       **The bow has a special animation of its own and plays it here.** Every
       other special in this file is the ordinary swing with different numbers -
       the weapon's fight-type sequence already says what the body does - but
       `Descent of Darkness` does something the bow's attack sequence cannot:
       the archer drops into a crouch and thrusts the bow out low. That is
       sequence **2890** in this revision (the live game's own
       `DARK_SPEC_PLAYER`, RuneLite's AnimationID) on the human framemap, and it
       is the first special in this world to have a pose of its own. It is
       played through the ordinary one-shot pose channel (game.js#playCastAnim),
       which is how a spell holds a pose the attack flag would otherwise cut
       short - the baked sequence runs its full length and the attack flag
       underneath is ignored for as long as it does.

       **The baked sequence is 20 frames / 88 cycles, not the cache's 24 /
       113.** The sequence's own first four frames are a fragment that does not
       belong to the special - they start on the idle pose, sink the body and
       carry the bow flat across it, and then the frame list takes its single
       largest pose step into the real motion. The bake drops them (see
       `src/tools/cache-bake/bake.mjs#ANIM_LEAD_TRIM`, which records the vertex
       measurement that says so), and the release beat below is counted on the
       trimmed clock.

       The graphic 483 goes with it and is **not** a coincidence: its own
       animation is 2889 (`DARK_SPEC_SPOT`), which is the *same 24 frames and the
       same 113 cycles* as 2890 - the two were authored as a pair, one on the
       body and one in the air, which is why the world can play them together
       with no delay to guess at. It is played on the archer, at height 0: the
       model is authored around the body the way a body model is (its own drawn
       extent is 0.2 to 1.4 tiles up the archer), so it needs no offset.

       The arrows leave from wherever the bow is in *that* pose, not from the
       bow's ordinary anchor: see `MISSILE_ANCHORS.dark_bow_spec`, which is the
       same scan read at the special's own release beat (50 cycles into the
       trimmed sequence). */
    run(npc, style) {
      const p = G.player;
      const dragons = darkBowDragons();
      /* The pose, and the black shroud that goes with it: sequence 2890 and
         spotanim 483 are the special's own pair, and both are on the archer for
         the whole sequence whichever form the special takes. */
      playCastAnim(p, "attack_dark_bow_spec");
      Gfx.play(483, {
        x: p.rx != null ? p.rx : p.x,
        z: p.rz != null ? p.rz : p.z,
        height: 0,
        dir: p.dir || 0,
        target: p,
      });
      /* The crouch and the shroud play on the neighbours' screens too. The
         swing packet already sent above carries the bow's ordinary sequence,
         so the special sends its own pose after it - the last pose to land is
         the one the ghost holds - and the shroud rides along as a one-shot
         graphic (src/net.js#C_GFX). The arrows' own missiles stay home, the
         way every bowshot's do; their splats travel as the blows land. */
      if (Net.status === "online") {
        netCombat(0, combatAnimIndex("attack_dark_bow_spec"),
          Math.floor(npc ? npc.x : p.x), Math.floor(npc ? npc.z : p.z),
          npc ? npc.spawnIx : 0xffff);
        netGfx(483, 0);
      }
      /* The two arrows, with the special's own missile and its own impact. This
         is the one attack in the world whose *projectile* is not the ammunition's
         own travel graphic: Descent of Darkness fires the two arrows "surrounded
         in a black shroud" (1101, the black smoke), and with dragon arrows
         equipped the special becomes Descent of Dragons and fires "two black
         dragon heads" instead (1099) - which is also why the two forms have
         different published damage. What the *ammunition* still decides is the
       damage and the amount, so the arrows really are spent from the same
       stack either way. */
      const shot = dragons
        ? { dmg: 0.5, min: 8, cap: 48, gfx: 1099, impact: 1100 }
        : { dmg: 0.3, min: 5, gfx: 1101, impact: 1103 };
      /* The two arrows leave the bow at two points and on two arcs of their own
         (DARK_BOW_PAIR and DARK_BOW_SLOPE): two arrows are what the special is,
         and each is its own blow with its own roll and its own arrival. */
      for (let i = 0; i < 2; i++) {
        const at = Object.assign({
          anchor: MISSILE_ANCHORS.dark_bow_spec,
          off: DARK_BOW_PAIR[i],
          slope: DARK_BOW_SLOPE,
        }, shot);
        specArrow(npc, style, { dmg: shot.dmg, min: shot.min, cap: shot.cap, shot: at });
      }
    },
  },
  seercull: {
    name: "Soulshot", cost: 100,
    /* The whole bar for one **guaranteed** hit (`true`, the accuracy roll is
       skipped) whose damage comes straight off the target's Magic level. The
       drain rides the arrow, so it is handed to `shoot` as its landing hook and
       fires where the arrow does - a creature that dies to the shot is not
       drained, which is the live game's own "if the target dies, nothing is
       drained" reading. */
    run(npc, style) {
      const ammo = rangedAmmo();
      if (!ammo) return;
      spendAmmo(ammo, 1);
      const dmg = specRoll(npc, style, { true: true });
      shoot(npc, dmg, style, ammo, () => { if (dmg > 0) drainNpcMagic(npc, dmg); });
    },
  },
};

/* Is the special bar lit, and can the weapon honour it? True means the special
   has taken this swing over, so the ordinary attack must not also run. The bar
   goes *out* when it cannot deliver: a weapon with no special of its own, or an
   empty bar, means the next swing is an ordinary one rather than a command that
   silently does nothing. The energy belongs to the player - 100 to start, and
   switching weapons never changes what is left. */
function trySpecialAttack(npc, style) {
  if (!UI.specOn) return false;
  const p = ps();
  const w = weaponOf(p);
  const spec = w && SPECIALS[w.id];
  const cost = spec ? (spec.cost || w.specCost || 0) : 0;
  const energy = p.specEnergy == null ? 100 : p.specEnergy;
  if (!spec || energy < cost) {
    UI.specOn = false;
    if (!patchSpecBar()) mark("combat");
    if (spec) chat("You need " + cost + "% special attack energy to use this attack.", "warn");
    return false;
  }
  /* A special may carry a condition of its own that has nothing to do with
     energy - the dark bow's two forms both demand a stack of arrows. It is
     asked *before* the bar is charged and before the pose is spent, so a
     refusal costs the player nothing but the message. */
  const why = spec.ok ? spec.ok(npc, style) : true;
  if (why !== true) {
    UI.specOn = false;
    if (!patchSpecBar()) mark("combat");
    if (typeof why === "string") chat(why, "warn");
    return false;
  }
  p.specEnergy = energy - cost;
  swing(npc);
  spec.run(npc, style);
  if (!patchSpecBar()) mark("combat");
  return true;
}

/* 10% of the special bar every 30 seconds, the live game's own rate (five
   minutes from empty to full). The regeneration runs on the game tick with the
   other timers, and the bar is only redrawn when it actually moves. */
const SPECIAL_REGEN_SECONDS = 30;
const SPECIAL_REGEN_STEP = 10;

function tickSpecialEnergy(p, dt) {
  if (p.specEnergy == null) p.specEnergy = 100;
  if (p.specEnergy >= 100) { p.specEnergy = 100; p.specRegen = 0; return; }
  p.specRegen = (p.specRegen || 0) + dt;
  let gained = 0;
  while (p.specRegen >= SPECIAL_REGEN_SECONDS) {
    p.specRegen -= SPECIAL_REGEN_SECONDS;
    gained += SPECIAL_REGEN_STEP;
  }
  if (gained > 0) {
    p.specEnergy = Math.min(100, p.specEnergy + gained);
    if (!patchSpecBar()) mark("combat");
  }
}

function playerStrike(npc) {
  const style = styleForAttack();
  if (style.spell) { castAt(npc, style.spell); return; }
  /* The same guard as attackNpc, for a style switched to a Spell style (or a
     spell cleared) after the fight had already started: the fight ends with an
     explanation rather than quietly turning into a melee swing that is rolled
     against the magic attack bonus - see src/combat.js#attackNpc. */
  if (styleIsCast()) {
    stopCasting();
    refuseCast();
    return;
  }
  /* The special attack, if the bar is lit: it takes this swing over entirely
     (its own effects above), and the ordinary attack below does not also run. */
  if (trySpecialAttack(npc, style)) return;
  const ranged = styleSkill(style) === "ranged";
  /* One ordinary blow, rolled. A function rather than a block because the dark
     bow looses **two** arrows on an ordinary attack and each is its own blow:
     "It fires two arrows per attack which roll independent accuracy checks"
     (the bow's own page), so the second arrow cannot share the first's roll -
     not its accuracy and not its damage.

       * Verac's Defiler: a quarter of the flail's hits ignore armour, Defence
         and protection prayers entirely - which in this world's model, where a
         target's Defence only ever feeds the accuracy roll, means the hit
         cannot miss.
       * Dharok's Wretched Strength: the lower the wearer's hitpoints, the more
         damage every hit does. The wiki gives the modifier exactly - it is
         applied to the rolled damage, not to the max hit, and it is worth
         97.02% at 99 hitpoints down to 1 (1 + (98/100) * (99/100)). */
  const rollBlow = () => {
    const verac = hasSet("verac") && Math.random() < SET_PROC;
    let d = verac
      ? Math.floor(Math.random() * (maxHit(style) + 1))
      : resolveHit(playerAccuracy(style), npcDefence(npc), maxHit(style));
    if (d > 0 && hasSet("dharok")) d = Math.floor(d * dharokModifier());
    return d;
  };
  const dmg = rollBlow();
  swing(npc);
  if (ranged) {
    /* The shot is a real missile, so the damage is not dealt at the bow - it
       lands when the arrow does (`shoot`). Everything below this branch is the
       *arrival*, which is why it lives in one function: a swing and a shot must
       not be able to drift apart in what they apply.

       The dark bow fires two arrows on **every** attack, not only on its
       special (the bow's page: "It fires two arrows per attack which roll
       independent accuracy checks"), and each arrow is charged to the quiver
       on its own - so a bow with a single arrow left fires one. */
    const shots = isDarkBow() ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const ammo = rangedAmmo();
      if (!ammo) break;
      spendAmmo(ammo, 1);
      /* The pair leaves the bow from two points so that it *reads* as two
         arrows rather than one doubled one (DARK_BOW_PAIR). Their flight is the
         ordinary one - only the special is loosed on an arc. */
      shoot(npc, i === 0 ? dmg : rollBlow(), style, ammo, null, shots === 2 ? { off: DARK_BOW_PAIR[i] } : null);
    }
    return;
  }
  landStrike(npc, dmg, style);
}

/* Take the blow off the victim's hitpoints and pay out for it. This is the tail
   of an attack - everything from the hitsplat on - and it is reached by a melee
   swing at once and by a shot or a thrown missile when it arrives, so the
   rolls, the experience, the set effects and the kill all stay in one place
   regardless of how the damage got there. `ammo` is the arrow a shot spent (a
   melee swing passes nothing), carried this far for one reason: the poison a
   ranged weapon delivers is the *arrow's*, not the bow's (src/combat.js#poisonOnHit). */
/* Tell the players around us that a blow has just landed on a creature
   (src/net.js#netCombat, src/game.js#ghostCombat). It is called beside the
   splat every time the *player* is the one dealing damage to a creature - a
   melee swing, an arrow's arrival, a spell's impact - so the fight reads the
   same to a bystander as it does to the player having it. The creature is
   named by its index in the shared spawn table, so the bystander's own copy of
   that same spawn takes the number even when the two copies have wandered
   apart, and the tile rides along as the fallback for a creature they do not
   have (an archetype preview, or a build from before the index existed).
   Damage to a creature from anything else (a poison tick, recoil, a creature's
   own fight) is left alone: those are not blows this player is visibly
   throwing, and a bystander has their own copy of the poison and the ring to
   watch. */
function broadcastHit(npc, dmg) {
  if (!npc) return;
  /* Every blow the player lands marks the creature as *theirs* for a few ticks
     (see the same line in `attackNpc`, and src/game.js#creatureStateBatch). It is
     what makes the creature the player just killed stay in the census long
     enough to carry its death to the other clients: killing it clears
     `npc.target`, but this outlives that. */
  npc.playerHitTicks = 8;
  netCombat(1, dmg, Math.floor(npc.x), Math.floor(npc.z), npc.spawnIx);
}

/* Pay out the experience for a blow of `dmg`, nothing else. Split out of
   `landStrike` so a ranged shot can pay it when the missile *leaves* the bow
   (see `shoot`) while everything else about the blow - the wound, the kill -
   still happens when it lands. */
function awardStrikeXp(style, dmg) {
  if (!(dmg > 0)) return;
  for (const [sk, mult] of Object.entries(xpMapFor(style))) {
    addXp(ps(), sk, dmg * mult);
  }
  mark("skills");
}

/* Pay out the experience for a spell's damage, nothing else: the live game's
   two Magic xp per point of damage plus 1.33 Hitpoints. Split out of
   `damageNpc` so a cast can pay it on the release beat (see `castAt`) while the
   wound and the kill still wait for the missile, exactly like a ranged shot's
   `awardStrikeXp`. */
function awardSpellXp(dmg) {
  if (!(dmg > 0)) return;
  addXp(ps(), "magic", dmg * 2);
  addXp(ps(), "hitpoints", dmg * 1.33);
  mark("skills");
}

/* The block: a blow that lands for damage on a tick the victim did not attack
   raises the shield pose - the client's own defend sequence, baked as
   `defend` on the player, the humanoids and the skeletons
   (src/tools/cache-bake/bake.mjs#HUMAN_DEFEND_ANIM). An attack the victim made
   on the same tick wins and no block is raised; a victim with no baked
   `defend` keeps exactly the old behaviour, because `playCastAnim` refuses an
   unknown name; and a victim already playing a pose keeps it, so a block never
   cuts another animation short. */
function maybeBlockNpc(npc) {
  if (!npc || npc.dead || !(npc.hp > 0)) return;
  if ((npc.struckTick | 0) === (G.tickCount | 0)) return;
  if (npc.castLeft > 0) return;
  playCastAnim(npc, "defend");
}

export function maybeBlockPlayer(dmg) {
  if (!G || !G.player || ps().hp <= 0) return;
  const has = (n) => !!(G.player.ch && G.player.ch.data && G.player.ch.data._anims && G.player.ch.data._anims[n]);
  if ((G.player.struckTick | 0) === (G.tickCount | 0)) return;
  if (G.player.castLeft > 0) return;
  if (dmg > 0) {
    const h = blockAnimFor(weaponOf(ps()));
    if (has(h)) playCastAnim(G.player, h);
    else if (has("defend")) playCastAnim(G.player, "defend");
  } else if (has("defend")) playCastAnim(G.player, "defend");
}

function landStrike(npc, dmg, style, ammo = null, opts = null) {
  /* An enchanted bolt's effect is rolled here, on the strike, and is allowed to
     change the blow before anything is paid for it (see `boltEffectRoll`). Two
     of the ten effects can fire on a shot that missed and add damage to it, so
     this is deliberately before the branch below rather than inside it. */
  dmg = boltEffectRoll(npc, dmg, style, ammo);
  /* A shot whose experience was already paid at the release beat (see `shoot`)
     must not pay it again here: only damage the bolt's effect *added* on top
     of the released roll earns anything on arrival. An ordinary swing passes
     nothing and behaves exactly as before. */
  const prepaid = opts && opts.xpDone > 0 ? opts.xpDone : 0;
  /* Flinch length follows the overhead bar (the user's rule, 2026-10-09): a
     fresh bar - a hit landed in the last few seconds - means no delay at
     all, the victim answers at once when in range; a faded bar or none
     (out of combat) holds its strike for the landing tick plus one more, so
     the step back into the safespot always wins. Read before the splat below
     stamps the bar, and hover alone never counts: the cursor pins a ghost
     bar on anything, but only a fresh bar means a fight - so a ghost showing
     always reads bar-down here, exactly as it looks. */
  const flinchTicks = ((npc.hpBarUntil || 0) > performance.now()) ? 0 : 2;
  Fx.hitsplat(npc, dmg);
  npc.barTicks = BAR_TICKS;
  /* Flinch (the user's rule, 2026-10-09): every landed blow - hit or miss -
     holds the victim's next strike for `flinchTicks`, so a safespot step-back
     always wins the trade, on the first swing and every one after. Unlike
     `retal` this fuse ticks down unconditionally (see tickCombat), so
     continuous hits can delay strikes but never stunlock. */
  npc.flinch = flinchTicks;
  broadcastHit(npc, dmg);
  if (dmg > 0) {
    npc.hp -= dmg;
    npc.hitFlash = 0.3;
    provokeNpc(npc);
    maybeBlockNpc(npc);
    applySmite(npc, dmg);
    applySetOnHit(npc, dmg, { magic: false });
    /* A coated weapon poisons what it hits, on the published chance - and only
       a blow that dealt something, which is why this sits inside `dmg > 0`. */
    poisonOnHit(npc, style, ammo);
    const extra = dmg - Math.min(prepaid, dmg);
    if (extra > 0) {
      for (const [sk, mult] of Object.entries(xpMapFor(style))) {
        addXp(ps(), sk, extra * mult);
      }
    }
  } else {
    provokeNpc(npc);
    maybeBlockNpc(npc);
  }
  if (npc.hp <= 0) killNpc(npc);
  mark("skills");
}

/* --------------------------------------------------------------- the missile

   An arrow leaves the bow. The live client draws every ranged attack as a real
   projectile - the same `spotanim_proj` machinery the spells use, with the
   ammunition's own travel graphic - and rolls the hit when it lands, which is
   why a creature that steps out of the way mid-flight is struck where it
   actually stands (src/gfx.js#projectile re-aims every frame) rather than at
   the tile the archer aimed at. This world fired instantly until now: the arrow
   dealt its damage on the swing tick with nothing on the screen between bow and
   body, which is the one part of ranging that read as wrong next to the
   spells.

   The heights are the content's own scale: `spotanim_pl` heights are model
   units, 128 to the tile, and 92 is mid-chest on a player-sized body
   (src/magic.js#CENTRE_HEIGHT), which is where every shot *arrives* - scaled to
   whatever body it hit (`bodyHeight`), so an arrow fired at a chicken arrives
   at chicken height.

   **Where the shot leaves the body is measured, not guessed** (2026-09-20).
   It used to leave the tile centre at one height for every family - 96 units,
   a bow's chest - so a bolt was seen to come out of the character's belly
   rather than out of the crossbow, and a dart out of the waist rather than out
   of the throwing hand, which is what the user reported ("darts are being
   thrown initiating at the incorrect height level", "the bolts are also not
   flying out of the correct height level ... from where the bolt fires exactly
   in relation to the crossbow during the animation and the character").
   `MISSILE_ANCHORS` below carries one anchor per family, read off the *weapon
   model in the attack pose* with src/tools/anchor-scan.mjs - and the shot is
   held back to that pose's own release beat, so the bolt is seen to leave the
   crossbow at the instant the crossbow fires rather than a second before it is
   even raised.

   `hidden: !MISSILE_IN_FLIGHT` keeps the one flag that decides whether a
   missile is drawn on its way over in a single place (src/magic.js), so
   flipping the presentation back for every missile is still one edit. */

/* Where each ranged family's shot leaves the body.

   Every number here was measured, not chosen: src/tools/anchor-scan.mjs walks a
   weapon model through its attack sequence with the renderer's own skinner and
   reports its bounding box per frame, in tiles, in the drawn local space (x is
   the body's own left, y up from the feet, z the way the body faces). Re-run it
   after re-baking the player or a weapon and the table falls straight out.

     release  how far into the attack sequence, in client cycles (20ms), the
              missile appears - the beat the animation itself looses the shot
              on. Read off the sequence: a bow draws and aims through frames
              4-5 and releases at frame 6 (41 cycles), a crossbow aims and fires
              at its frame 6 (also 41), a throw winds up through frame 5 and
              whips through at frame 6 (27, or 25 for the javelin's shorter
              sequence).
     side/up/fwd  the anchor in tiles: how far to the side of the body's centre
              line, how high above the feet, and how far in front of the body.

   The point itself is the weapon's own **box centre** at the release frame for
   the drawn-back families - an arrow leaves a bow's grip, which is the bow
   model's middle, and a dart or a knife leaves the hand *holding* it, which is
   where the weapon is - and the **muzzle** (the forward-most vertex) for a
   crossbow, whose bolt travels down a groove and leaves at the tip. Measured
   values, tile by tile:

     magic longbow  frame 6 of attack_bow            -0.085 / 1.325 / 0.335
     dark bow       frame 6 of attack_bow            -0.095 / 1.340 / 0.380
     rune crossbow  frame 6 of attack_crossbow       -0.150 / 1.450 / 0.480  (tip)
     rune dart      frame 6 of attack_throw          -0.075 / 1.230 / 0.555
     rune knife     frame 6 of attack_throw          -0.105 / 1.090 / 0.610
     rune thrownaxe frame 6 of attack_throw          -0.070 / 1.320 / 0.555
     rune javelin   frame 5 of attack_spear_throw    -0.120 / 1.090 / 0.750
     mystic cards   frame 6 of attack_throw         -0.085 / 1.290 / 0.560
     dark bow spec  frame 12 of attack_dark_bow_spec -0.240 / 0.695 / 0.600

   The last row is the odd one and is why a shot may be handed an anchor of its
   own (see `shoot`'s `anchor`): the dark bow's **special** does not use the bow's
   attack sequence at all - it crouches and thrusts the bow forward low on its
   own sequence (src/combat.js#SPECIALS) - so the two arrows it
   looses leave from wherever the bow actually is *in that pose*, a quarter-tile
   further out and half a tile lower than an ordinary shot. The three numbers are
   the bow model's own **box centre** at the loose, off the same scan: at frame 17
   of the untrimmed sequence (tick 75, the last of the three frames the pose holds
   the bow at full stretch - its forward-most vertex reads 1.398 / 1.398 / 1.391
   over f15-17, ticks 65/70/75; the bake drops the sequence's four-frame lead-in
   so that beat is tick 50 of the baked animation, see bake.mjs#ANIM_LEAD_TRIM)
   the box spans z -0.22..1.39 and y 0.37..1.02, whose centre is 0.585 / 0.695 /
   -0.211. That is the beat the ordinary bow's own release sits on, one frame past
   its furthest reach, which is where the scan's own rule puts a loose.

   One anchor per *family* is enough because the family shares its animation:
   every crossbow uses Karil's repeating crossbow's own sequence (427), which is
   why the user is happy with one crossbow animation for all of them, and every
   bow uses 426. A weapon that ever needs its own point can carry a `launch`
   field on its item row, which wins here. */
/* The content's own scale for a height: 128 units to the tile (the two numbers
   `bodyHeight` is written around, src/magic.js). The anchors above are in
   tiles because that is how the scan reports them; this is what turns one into
   the client units the missile heights are authored in. */
const UNIT_TILE = 128;

const MISSILE_ANCHORS = {
  bow: { release: 41, fwd: 0.35, up: 1.33, side: -0.09 },
  crossbow: { release: 41, fwd: 0.48, up: 1.45, side: -0.15 },
  dart: { release: 27, fwd: 0.555, up: 1.23, side: -0.075 },
  knife: { release: 27, fwd: 0.61, up: 1.09, side: -0.105 },
  thrownaxe: { release: 27, fwd: 0.555, up: 1.32, side: -0.07 },
  javelin: { release: 25, fwd: 0.75, up: 1.09, side: -0.12 },
  /* The mystic cards, thrown off their own stack exactly like a dart or a knife
     (see the row in src/items.js, and "The weapon table" in src/README.md for
     the two departures from the live game's row). They ride `attack_throw` -
     the knives' own throw, so the same release beat, 27 - and the row is that
     same scan run over *their* model (its numbers are in the list above). The
     fan of three cards is a wider body than a blade, and the scan shows it: its
     box centre sits a little higher and a little closer to the body's centre
     line than a knife's. Both leave the hand on the same frame, so the
     difference is the model's own shape, not its grip. */
  mystic_cards: { release: 27, fwd: 0.56, up: 1.29, side: -0.085 },
  /* Not a family: the dark bow's special, which is handed to `shoot` directly
     (it is the one attack that changes the bow's own pose, so a family lookup
     could never find it). `release` is the end of the aim hold - 75 cycles into
     the special's 113 - which is where the two arrows are loosed. */
  dark_bow_spec: { release: 50, fwd: 0.60, up: 0.695, side: -0.24 },
};

/* The dark bow's two arrows are two arrows.

   "It fires two arrows per attack which roll independent accuracy checks" (the
   item's own page), and the 2007 release post says it was "designed to shoot two
   arrows at a time, even with the most powerful arrows". The live game flies the
   pair rather than rolling one twice: RuneLite's `ProjanimID` carries a **pair** of
   projectile animations for this bow, `doublearrow_one` and `doublearrow_two`, and
   the server hands one to each arrow (rsmod's `DarkBowWeapons` spawns the arrows
   with exactly those two, and its special does the same for each of its two arrows
   as well) - which is also how the two arrows come to have their own client delays.

   Fired from one point at one instant, though, the pair draws on top of itself:
   one arrow to look at, and the two arrows the weapon is named for invisible on
   the screen. So each arrow of the pair carries this small offset, added to the
   bow's own anchor (see `missileStart`): a hair either side of the grip and a hair
   apart vertically - the bow measures 0.40 tiles across the grip in its attack
   pose (src/tools/anchor-scan.mjs) - so the two are seen to leave side by side.
   They keep the same flight, so they travel as a pair and reach the target
   together, which is what the content's two hitsplats look like. */
const DARK_BOW_PAIR = [
  { side: -0.12, up: -0.05 },
  { side: 0.12, up: 0.05 },
];

/* The launch angle of the special's arrows, in the client's `slope` units - a
   twentieth of a radian each, **negative upward** (src/gfx.js#launchArc). -25 is
   therefore 35 degrees above the horizontal, and the client's own solved
   acceleration drops the arrow back onto whatever it was aimed at, so every
   distance lands right: about 0.9 of a tile above the bow at five tiles and 1.7
   at ten. The special is *Descent* of Darkness/Dragons - the two arrows climb
   away from the bow and come down on the mark - which is the picture the wiki's
   own animation shows: "two arrows fired at the target" out of a bow thrust low,
   with the missile seen arcing above the archer.

   The angle is the one number the client's flight needs and the one number this
   cache cannot give us: a projectile's slope is a byte the *server* sends (it is
   not in the item, and no client script in this revision builds one), so it is
   chosen here rather than read. Everything else about the arc - the shape, where
   it lands, the pitch of the model along it - is the client's own maths. */
const DARK_BOW_SLOPE = -25;

function missileAnchor(weapon) {
  if (!weapon) return MISSILE_ANCHORS.bow;
  if (weapon.release != null) return weapon;      // an anchor handed in directly
  if (weapon.launch) return weapon.launch;
  if (weapon.kind === "crossbow") return MISSILE_ANCHORS.crossbow;
  if (weapon.kind === "thrown") return MISSILE_ANCHORS[weapon.thrown] || MISSILE_ANCHORS.dart;
  return MISSILE_ANCHORS.bow;
}

/* The world point a shot of `weapon` leaves `entity` from, and the beat it
   leaves on. The anchor is a point on the *body*, so it scales with the body
   the shot leaves (`bodyHeight`) exactly as the heights do - a goblin's dart
   starts at a goblin's hand - and it is turned to face the target, so `fwd`
   runs along the firing line and `side` across it. */
/* `off` (optional) is a small offset in tiles added to the anchor - `side`, `up`,
   `fwd` and `release` - and it exists for one weapon: the dark bow looses **two**
   arrows on every attack, and two arrows leaving one point at one instant are one
   arrow on the screen. Each of the pair is given its own point on the bow (see
   DARK_BOW_PAIR), so the two are seen to fly as a pair and land as the two
   hitsplats the content gives them. */
function missileStart(entity, weapon, targetX, targetZ, off) {
  const a = missileAnchor(weapon);
  const o = off || {};
  const k = bodyHeight(UNIT_TILE, entity) / UNIT_TILE;
  const ex = entity.rx != null ? entity.rx : entity.x;
  const ez = entity.rz != null ? entity.rz : entity.z;
  const dir = Math.atan2(targetX - ex, targetZ - ez);
  const sin = Math.sin(dir), cos = Math.cos(dir);
  const fwd = (a.fwd + (o.fwd || 0)) * k, side = (a.side + (o.side || 0)) * k;
  return {
    x: ex + sin * fwd + cos * side,
    z: ez + cos * fwd - sin * side,
    h: bodyHeight((a.up + (o.up || 0)) * UNIT_TILE, entity),
    release: a.release + (o.release || 0),
  };
}

function missileGfx(id) {
  return id && ITEMS[id] && ITEMS[id].missile != null ? ITEMS[id].missile : null;
}

function shoot(npc, dmg, style, ammo, onLand, shot) {
  /* `shot` (optional) is what makes one attack's arrow different from the
     ammunition's: `gfx`/`impact` override the travel graphic and add a burst on
     the target, `anchor` is a release point of its own instead of the equipped
     weapon's family one, `off` shifts that point a little for one arrow of a
     pair (DARK_BOW_PAIR), and `slope` gives the missile the client's own arc
     instead of the straight line (DARK_BOW_SLOPE). The dark bow is the only
     weapon that uses any of it: its special's pose throws the bow to a place the
     family anchor does not describe and its two forms fly a *black shroud* or two
     *black dragon heads* rather than the arrows' own graphic (see MISSILE_ANCHORS
     and src/combat.js#SPECIALS), and both its attacks loose a pair of arrows that
     has to read as a pair on the screen. Every other shot in the world leaves
     this empty and behaves exactly as before. */
  const o = shot || {};
  const gfx = o.gfx != null ? o.gfx : missileGfx(ammo);
  /* No ammunition graphic to fly (nothing in the quiver, or an item this
     revision has no travel spotanim for): the blow still lands, at once, rather
     than being swallowed by a missing model. */
  if (gfx == null) { landStrike(npc, dmg, style, ammo); if (onLand) onLand(); return; }
  const w = o.anchor || (style && style.weapon) || weaponOf(ps());
  const start = missileStart(G.player, w, npc.rx != null ? npc.rx : npc.x, npc.rz != null ? npc.rz : npc.z, o.off);
  const fx = start.x, fz = start.z;
  const range = style ? attackRange(style) : BOW_RANGE;
  /* The damage was already rolled when the shot was loosed (see `playerStrike`
     / `specArrow`), and the experience goes with the release beat, not the
     landing: the drop is paid on `onRelease` - the frame the bolt is seen to
     leave the bow - while the wound, the kill and everything else still wait
     for `onArrive`. The arrival is told what was prepaid so an enchanted bolt's
     effect can only ever earn experience on damage it *added* (see
     `landStrike`). */
  const prepaid = dmg > 0 ? dmg : 0;
  Gfx.projectile({
    gfx,
    fromX: fx, fromZ: fz, fromH: start.h,
    target: npc, toX: npcDrawCX(npc), toZ: npcDrawCZ(npc), toH: bodyHeight(CENTRE_HEIGHT, npc),
    duration: rangedFlightSeconds(Math.hypot(fx - npcDrawCX(npc), fz - npcDrawCZ(npc)), range),
    delay: start.release,
    /* The muzzle is re-measured every frame until the release beat: the swing
       starts while the archer is still running into range, and the bolt has to
       leave the bow from the tile it stands on when it actually fires, not the
       one the chase started from (src/gfx.js#projectile follows it there). */
    fromFn: () => {
      const s = missileStart(G.player, w, npc.rx != null ? npc.rx : npc.x, npc.rz != null ? npc.rz : npc.z, o.off);
      return { x: s.x, z: s.z, h: s.h };
    },
    durationFn: (dist) => rangedFlightSeconds(dist, range),
    /* The client's launch angle for this shot, or undefined for the straight
       line every other missile flies - see src/gfx.js#launchArc. The dark bow's
       specials lob their arrows; nothing else does yet. */
    slope: o.slope,
    hidden: !MISSILE_IN_FLIGHT,
    onRelease: () => { awardStrikeXp(style, prepaid); },
    onArrive: () => {
      if (npc.dead) return;
      /* The special's own impact, if it has one: the black shroud's burst or
         the dragon head's bite, played where the arrow lands - the same place
         and the same instant the ordinary bolt effects put theirs. */
      if (o.impact != null) {
        Gfx.play(o.impact, { x: npc.x, z: npc.z, height: bodyHeight(CENTRE_HEIGHT, npc), dir: npc.dir || 0, target: npc });
      }
      landStrike(npc, dmg, style, ammo, { xpDone: prepaid });
      /* A shot may carry something that only happens when it *lands* and only
         knows what it dealt once it has - the Seercull's Magic drain is the one
         case (src/combat.js#SPECIALS). It runs after the ordinary tail so the
         drain cannot change the hit it is paid out of. */
      if (onLand) onLand();
    },
  });
}

/* ------------------------------------------------------ enchanted bolts

   An enchanted bolt - the `(e)` kind - is its plain gem bolt plus an effect, and
   the effect is rolled when the bolt **strikes**, not when it is loosed, which
   is why this lives beside the missile and is called from src/combat.js#
   landStrike (the arrival tail every shot already goes through).

   There are two kinds of row, and the difference is the whole of the design:

     * the five the table marks `accuracy: true` - Lucky Lightning, Earth's Fury,
       Sea Curse, Blood Forfeit and Armour Piercing - roll **whether or not the
       shot passed its accuracy roll** ("this effect is rolled regardless of
       whether the attack hits"), so a miss (`dmg === 0`) is not a refusal for
       them and the ones that add damage turn the miss into a hit;
     * the rest only ride a blow that landed.

   Every number is the effect's own published one - the citations, and the two
   places this world had to choose a reading, are on the BOLT_EFFECTS table in
   src/items.js (Jade's eight-tick knockdown, and Topaz's PvP-only Down to
   Earth, which cannot fire at all in a world with no other player in it).

   A proc's damage is added *before* the hitsplat and the experience, so an opal
   bolt's lightning shows on one plate and trains Ranged like the bolt does - the
   bolt and its effect are one blow, never two. */

/* A `ranged/N` expression - a twentieth of the archer's Ranged level, and the
   like - resolved against whichever level the effect measures. Written as the
   little evaluator the table's own strings ask for rather than a second copy of
   the numbers, so a row's "ranged/10" cannot drift from the code that pays it. */
function boltAmount(expr, lvl) {
  const m = /^ranged\/(\d+)$/.exec(expr || "");
  return m ? Math.max(1, Math.floor(lvl / Number(m[1]))) : 0;
}

function boltEffectRoll(npc, dmg, style, ammo) {
  const d = ammo ? ITEMS[ammo] : null;
  const eff = d && d.boltEffect ? BOLT_EFFECTS[d.boltEffect] : null;
  if (!eff || eff.pvpOnly) return dmg;
  if (dmg <= 0 && !eff.accuracy) return dmg;
  if (Math.random() >= eff.chance) return dmg;
  const p = ps();
  const lvl = Math.floor(boosted(p.skills, "ranged"));
  const fiery = !!dragonfireOf(npc.type);
  if (eff.gfx != null) {
    /* The proc lands on the victim's own body - its drawn position, at the
       victim's own scaled height (see src/magic.js#bodyHeight) - and not at the
       shooter's centre height over the victim's tile, which hung small victims'
       fireworks a body and a half over their heads. */
    Gfx.play(eff.gfx, {
      x: npc.rx != null ? npc.rx : npc.x, z: npc.rz != null ? npc.rz : npc.z,
      height: bodyHeight(CENTRE_HEIGHT, npc), target: npc,
    });
  }
  if (eff.damage) {
    /* Dragon's Breath is the one a creature can shrug off: the bolt's own page
       says its extra damage does not apply to dragons, which is the same
       `dragonfire` marking the breath attacks themselves carry. Sea Curse, by
       contrast, bites *harder* into the fiery (its own page's second number). */
    if (eff.dragonfire && fiery) {
      chat("The " + npc.type + " is unharmed by the bolt's flame.", "game");
    } else {
      dmg += boltAmount(eff.fieryDamage && fiery ? eff.fieryDamage : eff.damage, lvl);
    }
  }
  if (eff.poison) {
    if (!npc.poison || npc.poison.dmg < eff.poison) {
      npc.poison = { dmg: eff.poison, hits: 0, timer: POISON_INTERVAL_TICKS };
      chat("The " + npc.type + " is poisoned.", "game");
    }
  }
  if (eff.bindTicks) {
    npc.boundTicks = Math.max(npc.boundTicks || 0, eff.bindTicks);
    chat("The " + npc.type + " is knocked to the ground.", "game");
  }
  if (eff.drain) {
    /* Clear Mind takes a slice of the *target's* Ranged level off its prayer
       points, and the archer keeps an eighth of what was taken. A creature with
       no Ranged level of its own - which is most of this world's bestiary -
       falls back to the archer's, the only other reading the number admits; and
       a creature with no prayer points at all simply has nothing to lose, which
       is why this is the one bolt effect that can fire and do nothing. */
    const tLvl = (npc.stats && (npc.stats.ranged || npc.stats.level)) || lvl;
    if (npc.prayerPoints > 0) {
      const take = Math.min(npc.prayerPoints, boltAmount(eff.drain, tLvl));
      npc.prayerPoints -= take;
      const gain = Math.max(1, Math.floor(take / 8));
      p.prayerPoints = Math.min(p.maxPrayer + gain, p.prayerPoints + gain);
      chat("You drain " + take + " prayer point" + (take === 1 ? "" : "s") + " from the " + npc.type + ".", "game");
      mark("prayer");
    }
  }
  if (eff.forfeit) {
    /* Blood Forfeit is a trade, and the trade only happens if the archer can
       spare the hitpoints - the bolt's own page refuses the activation outright
       when the cost would take the wielder to zero or below. */
    const cost = Math.floor(p.hp * eff.forfeit.costPct);
    if (p.hp > cost) {
      dmg += Math.min(eff.forfeit.cap, Math.floor(npc.hp * eff.forfeit.pct));
      p.hp -= cost;
      p.hpRegen = 0;
      Fx.hitsplat(G.player, cost);
      G.player.hitFlash = 0.3;
      mark("skills");
      chat("The bolt tears " + cost + " hitpoints from you as it drinks the " + npc.type + "'s blood.", "warn");
      if (p.hp <= 0) playerDeath(null);
    }
  }
  if (eff.piercing) {
    /* Armour Piercing: a guaranteed hit whose maximum is raised by the effect's
       own percentage. Rolled here rather than left to the accuracy roll above
       because it fires on a miss too - and it can never *lower* a hit that
       already landed, so a proc is always the better of the two. */
    const max = Math.round(maxHit(style) * (1 + eff.piercing));
    dmg = Math.max(dmg, Math.floor(Math.random() * (max + 1)));
  }
  if (eff.leech) {
    /* Life Leech: the blow is raised and the archer is healed out of it. The
       undead are the bolt's own exception - it does nothing at all against
       them. */
    if (isUndead(npc.type)) return dmg;
    dmg = Math.floor(dmg * (1 + eff.leech.damage));
    const heal = Math.floor(dmg * eff.leech.heal);
    if (heal > 0) {
      p.hp = Math.min(p.maxHp, p.hp + heal);
      mark("skills");
    }
  }
  return dmg;
}

/* ------------------------------------------------------------ casting a spell

   A cast is two beats. First the gathering: the caster's pose plays and the
   caster's own graphic sits in his hands (`beginCast`). Only when that gather
   is done does the spell itself leave - `projDelay` cycles later, the travel
   graphic is created *at the caster* and sent on its way (see
   src/magic.js#PROJ_DELAY_CYCLES for where the number comes from). The damage,
   the curse, the bind all land when the missile does, not when the runes leave
   the pack, so the hit is always married to the ball you can see flying.

   A cast spends its runes up front, so a spell can never fire for free. The
   base experience is granted for the cast itself, plus the usual two Magic xp
   and 1.33 Hitpoints xp per point of damage - the live game's formula. A splash
   deals nothing but still costs the runes and still trains Magic.

   The god spells are the exception the cache itself marks: they have a
   `spotanim_target` and no projectile of their own. They are still not landed
   at the instant of the cast - a hidden carrier flies from the caster so the
   god's graphic falls when the casting pose releases it, which is what
   `endDelay` gives (see src/magic.js#GOD_END_DELAY_CYCLES). */

function castAt(npc, spell) {
  const p = ps();
  const st = spellStatus(p, spell);
  if (!st.ok) {
    chat(!st.staffOk
      ? "You need " + (st.needStaff || "a staff") + " to cast " + spell.name + "."
      : st.levelOk
        ? "You do not have enough runes to cast this spell."
        : "You need a Magic level of " + spell.level + " to cast " + spell.name + ".", "warn");
    stopCasting();
    return;
  }
  if (spell.undeadOnly && !isUndead(npc.type)) {
    chat("This spell can only be cast on the undead.", "warn");
    stopCasting();
    return;
  }
  spendRunes(p, st.plan);
  mark("inv");
  beginCast(G.player, spell);
  /* A cast is an attack for the block rule: a blow landing on the same tick
     does not raise the shield pose over the cast (see `npcStrikeHit`). The
     cast pose itself clears any block, raised through playCastAnim above. */
  G.player.struckTick = G.tickCount;
  /* A one-off pick is spent by the cast it commits to: the yellow square goes
     the moment the runes leave, the white autocast square undims, and the
     staff's own memory is untouched (the user's rule, 2026-10-09) - so the
     fight falls straight back onto the autocast without a click. */
  if (UI.spell === spell.id) { UI.spell = null; mark("magic"); }
  const prod = p.prodAutocast == null ? null : spellById.get(p.prodAutocast);
  if (prod && prod.prod && spellStatus(p, prod).ok) { UI.spell = prod.id; mark("magic"); }
  /* The cast itself is relayed, so the players around us watch the gather and
     the spell's own graphics rather than a creature taking damage out of
     nowhere. A spell thrown at a creature names no *player* target (the packet
     carries 0), which is exactly what the teleport group line already sends for
     the same reason: every client in earshot looks the spell up in its own
     table and plays the pose, and only a named target would apply an effect -
     there is nobody to apply one to. The creature's own spawn index rides along
     so the watchers can fly the missile at their own copy of the victim and
     burst on it (see src/actions.js#remoteSpell). */
  netSpell(spell.id, 0, 0, npc.spawnIx);
  provokeNpc(npc);
  /* The whole of the cast's own experience goes on the release beat, not the
     landing - the base every cast trains plus the damage's share (two Magic xp
     and 1.33 Hitpoints per point), combined into the one tick's drops. The
     primary's damage is therefore rolled here, when the runes leave the pack,
     exactly like a ranged shot's roll at the loose (see `shoot`): the missile
     only delivers a wound that was already decided. A splash still pays nothing
     either way. The arrival is told what was prepaid, so the landing can only
     ever earn experience on damage above the released roll (see `damageNpc` -
     and a Burst/Barrage's splashed creatures, rolled against their own defence
     on arrival, earn their full share there). */
  const rolled = spell.kind === "combat"
    ? resolveHit(playerAccuracy(), npcMagicDefence(npc), spellMaxHit(p, spell))
    : (spell.kind === "bind" ? (spell.damage || 0) : 0);
  addXp(p, "magic", spell.xp);
  awardSpellXp(rolled);
  /* the missile leaves the *drawn* body, not the tile it is stepping off - the
     hands are where the caster's own graphic is (see beginCast) */
  const fx = G.player.rx != null ? G.player.rx : G.player.x;
  const fz = G.player.rz != null ? G.player.rz : G.player.z;
  /* A creature that dies with a spell in the air still flies its graphic to
     where the body dropped; landSpell is what decides there is nothing left to
     hit. */
  if (spell.proj == null) {
    /* A god spell carries no missile - only the god's own graphic on the
       victim - but it must not land before the casting pose has finished
       raising the arms. A hidden carrier is flown from the caster to the victim
       over the pose's release frame, so the burst (and the damage) happen at
       the strike, not behind the swaying animation (see
       src/magic.js#GOD_END_DELAY_CYCLES). A spell with neither a missile nor a
       release delay lands the moment it is cast. */
    if (spell.endDelay) {
      Gfx.projectile({
        gfx: spell.end,
        fromX: fx, fromZ: fz, fromH: 0,
        target: npc, toX: npcDrawCX(npc), toZ: npcDrawCZ(npc), toH: 0,
        delay: spell.endDelay,
        duration: 0.05,
        hidden: true,
        /* Same live origin as the visible missile below: the carrier is born
           on the swing tick, while the drawn body still trails the step that
           put the caster in range. */
        fromFn: () => ({
          x: G.player.rx != null ? G.player.rx : G.player.x,
          z: G.player.rz != null ? G.player.rz : G.player.z,
          h: 0,
        }),
        onArrive: (at) => landSpell(npc, spell, at, rolled),
      });
      return;
    }
    landSpell(npc, spell, undefined, rolled);
    return;
  }  Gfx.projectile({
    gfx: spell.proj,
    fromX: fx, fromZ: fz, fromH: spell.projStart || 0,
    /* the ball's destination is the victim's own chest, not a fixed 124 units
       over the tile: see src/magic.js#impactHeight. The heights on the
       `spotanim_proj` row are the player the content authored them for, so a
       creature half the size of a human has the ball stop half as high */
    target: npc, toX: npcDrawCX(npc), toZ: npcDrawCZ(npc), toH: bodyHeight(spell.projEnd || 0, npc),
    delay: projDelayCycles(spell),
    /* The origin is re-measured every frame until the release beat, exactly
       like a ranged shot's muzzle (see shoot's fromFn): the swing fires on the
       tick the caster steps into range, while the drawn body - and `rx`/`rz`
       with it - still trails a step behind, and a hitch can trail it several.
       Left frozen, the ball would leave the tile the walk started from rather
       than the hands that threw it. */
    fromFn: () => ({
      x: G.player.rx != null ? G.player.rx : G.player.x,
      z: G.player.rz != null ? G.player.rz : G.player.z,
      h: spell.projStart || 0,
    }),
    durationFn: (dist) => spellTravelSeconds(spell, dist),
    tint: spell.tint,
    duration: spellTravelSeconds(spell, Math.hypot(fx - npcDrawCX(npc), fz - npcDrawCZ(npc))),
    /* the ball is drawn on its way over, exactly as the content's
       `spotanim_proj` row says (see src/magic.js#MISSILE_IN_FLIGHT). The
       missile still homes on the victim every frame (src/gfx.js#projectile),
       so a creature that walks out is hit where it actually stands. */
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: (at) => landSpell(npc, spell, at, rolled),
  });
}

/* The ball a spell arrives in. When the missile is drawn in flight this is
   nothing at all - the flying graphic *is* the ball (see
   src/magic.js#MISSILE_IN_FLIGHT) - but the branch is kept so the two-beat
   presentation can be flipped back without touching the callers. It changes
   nothing about *when* the spell lands: the timing lives in the projectile. */
function ballArrives(spell, x, z, h, dir, target) {
  if (MISSILE_IN_FLIGHT || spell.proj == null) return;
  Gfx.play(spell.proj, { x, z, height: h, dir: dir || 0, target: target || null, tint: spell.tint });
}

/* The spell's own ball - the gathering graphic the spell table calls `start`
   (gfx 90 for Wind Strike) - popping on the victim.

   The content draws this one on the *caster*, at the instant the pose begins,
   which is where it belongs: the cast reads as a ball gathering in the hands,
   then a travelling ball, then the burst (see src/magic.js#START_GFX_ON_CASTER).
   With that on, this is a no-op on a hit; it is the counterpart for a
   presentation that does not draw the caster's ball, kept alongside
   `ballArrives` above. */
function bubbleArrives(spell, x, z, h, dir, target) {
  if (START_GFX_ON_CASTER || spell.start == null) return;
  Gfx.play(spell.start, { x, z, height: h, dir: dir || 0, target: target || null, tint: spell.tint });
}

/* Iban Blast's impact, in parts: the spike-and-ember core, the skull riding
   the victim at a size set by the damage, and - for the bigger half of hits -
   the Fire Blast vortex (131) swallowing the small orange burst. */
function ibanBlastBurst(npc, spell, bx, bz, h, dmg) {
  bubbleArrives(spell, bx, bz, h, npc.dir, npc);
  ballArrives(spell, bx, bz, h, npc.dir, npc);
  const dir = npc.dir || 0;
  const maxHit = Math.max(1, spellMaxHit(ps(), spell));
  const frac = Math.min(1, Math.max(0, dmg / maxHit));
  const opts = { x: bx, z: bz, height: h, dir, target: npc, tint: spell.tint, onTop: true };
  Gfx.play("89core", opts);
  Gfx.play("89skull", Object.assign({}, opts, { scale: 0.5 + 0.8 * frac }));
  if (frac > 0.5) Gfx.play(131, opts);
}

/* Iban's Superior Blast lands the way our Iban's own nova does: no missile,
   no skull, no vortex - the big red ground strike (83) erupts under the
   victim at ground height, riding the body, drawn over everything. The
   primary takes the cast's prepaid roll; then the nearest creatures inside
   the landing tile's 7x7 square - five at most, six victims in all - each
   take their own roll of the same max hit against their own magic defence,
   with full experience on every hit, exactly like a Burst/Barrage splash. */
function superiorBlastNova(npc, spell, at, dmg) {
  const p = ps();
  const dir = npc.dir || 0;
  /* The bolt comes down a quarter larger than the cache authored it - the
     player's Superior Blast is the bigger telling of Iban's own nova, so its
     spike plays at 1.25x (Iban himself still throws the stock size). The spike
     itself plays as two halves (src/tools/cache-bake/derive-spike83.mjs): the
     light spokes at ground height with a normal depth test, so the victim's
     body correctly hides them, and the red bolt drawn over everything - both
     riding the victim at the same scale, so they stack back into the whole. */
  const spike = (victim) => {
    const sx = npcDrawCX(victim), sz = npcDrawCZ(victim), dir = victim.dir || 0;
    Gfx.play("83base", {
      x: sx, z: sz, height: 0,
      dir, target: victim, tint: spell.tint,
      scale: 1.25,
    });
    Gfx.play("83bolt", {
      x: sx, z: sz, height: 0,
      dir, target: victim, tint: spell.tint, onTop: true,
      scale: 1.25,
    });
  };
  if (dmg <= 0) {
    playSplash(npcDrawCX(npc), npcDrawCZ(npc), impactHeight(spell, npc), dir, npc, spell.tint);
    warnLowMagic(spell);
    mark("skills", "magic");
    return;
  }
  spike(npc);
  damageNpc(npc, dmg, dmg);
  applySetOnHit(npc, dmg, { magic: true });
  applySpellEffect(npc, spell, dmg);
  if (npc.hp <= 0) killNpc(npc);
  /* the landing tile is where the carrier arrived, not where the victim has
     walked to since - a creature that keeps walking takes its own spike with
     it, but the square is drawn where the spell came down. */
  const cx = at && at.x != null ? Math.floor(at.x) : Math.floor(npc.x);
  const cz = at && at.z != null ? Math.floor(at.z) : Math.floor(npc.z);
  const rest = [];
  for (const other of G.npcs) {
    if (other === npc || other.dead || other.hp <= 0) continue;
    const d = Math.max(Math.abs(Math.floor(other.x) - cx), Math.abs(Math.floor(other.z) - cz));
    if (d > 3) continue;
    rest.push({ npc: other, dist: Math.hypot(other.x - (cx + 0.5), other.z - (cz + 0.5)) });
  }
  rest.sort((a, b) => a.dist - b.dist);
  for (const cand of rest.slice(0, 5)) {
    const other = cand.npc;
    const od = resolveHit(playerAccuracy(), npcMagicDefence(other), spellMaxHit(p, spell));
    if (od <= 0) continue;
    spike(other);
    damageNpc(other, od);
    applySpellEffect(other, spell, od);
    if (other.hp <= 0) killNpc(other);
  }
  mark("skills", "magic");
}
/* A player whose Magic attack bonus is -64 or lower cannot land a spell at all:
   the 2007 roll is `effective level * (bonus + 64)`, so it comes out at zero or
   below and *every* cast splashes. That is the live game's own "splashing",
   which is why the formula is left exactly as it is - but a player who has not
   set out to splash (they put their armour on for the walk over and never took
   it off) is left attacking a creature that never loses a hitpoint, which is
   indistinguishable from a broken fight. Say so, once every few seconds, and
   say nothing at all as soon as a cast can land again. */
function warnLowMagic(spell) {
  const p = ps();
  if (playerAccuracy() > 0) { p.magicWarnAt = 0; return; }
  const now = performance.now();
  if (now - (p.magicWarnAt || 0) < 8000) return;
  p.magicWarnAt = now;
  chat("Your armour is too heavy to cast in: your Magic attack bonus is too low to land " + spell.name + ".", "warn");
}

/* The spell's graphic arrives. Curse and bind spells always take effect; a
   damage spell either bursts its cast-time roll on the target or splashes
   harmlessly across it. `dmg` is the primary's roll from the release beat (see
   `castAt`) - it is delivered here, never re-rolled. `at` is where the
   projectile actually flew to - the victim's interpolated position, which is
   where the burst belongs; when the projectile had no graphic to fly, the
   victim's tile is used instead. */
function landSpell(npc, spell, at, dmg = 0) {
  const p = ps();
  /* the burst goes on the victim's own body, not at the content's raw 124
     units - that number is the height of a *player*, and it floats over
     anything smaller (see src/magic.js#impactHeight) */
  const h = impactHeight(spell, npc);
  if (npc.dead || npc.hp <= 0) return;
  /* the burst goes on the victim's own body, where it stands now - not where
     the projectile's arrival frame measured it a moment ago. The graphic also
     rides the body from here (every burst below carries the victim as its
     target), so a creature that keeps walking takes its claws with it rather
     than leaving them hanging over the tile it was hit on. */
  const bx = npcDrawCX(npc);
  const bz = npcDrawCZ(npc);
  /* the victim's own graphic is merged onto its body, so it takes the victim's
     facing - the same reason the caster's graphic takes the player's - and it
     carries the victim as its target, so the blast rides the body if the
     creature keeps walking rather than hanging over the tile it landed on. */
  const burst = () => {
    bubbleArrives(spell, bx, bz, h, npc.dir, npc);
    ballArrives(spell, bx, bz, h, npc.dir, npc);
    if (spell.end != null) Gfx.play(spell.end, { x: bx, z: bz, height: h, dir: npc.dir || 0, target: npc, tint: spell.tint });
  };
  if (spell.kind === "stat") {
    burst();
    applyCurse(npc, spell);
    mark("skills");
    return;
  }
  if (spell.kind === "bind") {
    burst();
    applyBind(npc, spell, spell.damage || 0);
    mark("skills");
    return;
  }
  /* A Lunar utility spell aimed at a creature (Monster Examine) reads the
     creature out instead of hurting it. */
  if (spell.kind === "npc") {
    burst();
    examineCreature(npc);
    mark("skills", "magic");
    return;
  }
  if (dmg > 0) {
    if (spell.id === 73) { superiorBlastNova(npc, spell, at, dmg); return; }
    if (spell.id === 53) ibanBlastBurst(npc, spell, bx, bz, h, dmg);
    else burst();
    damageNpc(npc, dmg, dmg);
    applySetOnHit(npc, dmg, { magic: true });
    applySpellEffect(npc, spell, dmg);
    /* A Burst or a Barrage hits everything on the eight tiles around its
       target as well - the "3x3" the live game's ancient spells are famous for.
       Each creature takes its own roll of the same max hit. */
    if (spell.radius) splashSpell(npc, spell, spell.radius);
    if (npc.hp <= 0) killNpc(npc);
  } else {
    /* a miss shows the failed-spell splash instead of the burst - the target's
       own impact graphic is what a *hit* looks like. What was thrown still had
       to get there, though, so the ball and the spell's own pop are shown
       arriving on the victim first, exactly as they are on a hit. */
    bubbleArrives(spell, bx, bz, h, npc.dir, npc);
    ballArrives(spell, bx, bz, h, npc.dir, npc);
    playSplash(bx, bz, h, npc.dir, npc, spell.tint);
    warnLowMagic(spell);
  }
  mark("skills", "magic");
}

/* A cast that cannot happen at all drops the selection, so the player is not
   left swinging at nothing. */
function stopCasting() {
  Combat.target = null;
  Combat.timer = 0;
  UI.spell = null;
  mark("magic");
}

/* One place where a creature's combat stat is lowered, shared by the curse
   spells, the Shadow spells' own Attack drain and the two god spells' level
   drain (see `applySpellEffect`). The multiplier *stacks* across different
   spells - Vulnerability's defence cut and Enfeeble's strength cut are two
   stats, and a shadow spell's Attack cut is a third - and the strongest
   remaining `ticks` wins so a weaker second cast cannot cut a stronger one
   short.

   The *same* spell does not stack with itself: the wiki is explicit on the
   Confuse page ("The spell can only be cast if an opponent's stats haven't
   already been lowered, meaning you can not stack stat-reduction with multiple
   spells in a row"), so a second cast refreshes the existing drain instead of
   multiplying it again. Without this a player could chain Confuse until a
   creature's attack was nothing at all.

   A row may also carry a `flat` amount instead of a percentage - the only one
   today is Ahrim's five Strength levels - which `drainedValue` takes off the
   level before the multiplier is applied, so the two kinds compose in either
   order. The same refresh rule covers it: the same spell replaces its own flat
   drain, a different one adds to it. */
function drainStat(npc, d, ticks, spellId) {
  npc.drains = npc.drains || {};
  const cur = npc.drains[d.stat];
  /* A row with no percentage is a *flat* drain (Ahrim's five Strength levels):
     the levels come off first, in `drainedValue`. A row with no percentage and
     no flat amount would leave `1 - undefined/100` as NaN, so the multiplier is
     skipped entirely rather than computed. */
  const mul = d.pct ? 1 - d.pct / 100 : 1;
  const same = cur && spellId != null && cur.spell === spellId;
  npc.drains[d.stat] = {
    mul: !cur || same ? mul : cur.mul * mul,
    flat: (same ? 0 : (cur ? cur.flat || 0 : 0)) + (d.flat || 0),
    ticks: Math.max(cur ? cur.ticks : 0, ticks),
    spell: spellId != null ? spellId : (cur ? cur.spell : null),
  };
}

/* Confuse/Weaken/Curse/Vulnerability/Enfeeble/Stun: the target's attack,
   strength or defence is lowered by the spell's percentage for its duration. */
function applyCurse(npc, spell) {
  drainStat(npc, spell.drain, spell.ticks, spell.id);
  chat("The " + npc.type + " is weakened.", "game");
}

/* Bind/Snare/Entangle: the creature cannot move for a while, and the stronger
   two of them knock a few hitpoints off as they land. The damage's experience
   was prepaid at the release beat (see `castAt`), so only damage above the
   prepaid roll could earn anything here - and a bind's damage is fixed, so
   there never is any. */
function applyBind(npc, spell, xpDone = 0) {
  npc.boundTicks = Math.max(npc.boundTicks || 0, spell.ticks);
  chat("The " + npc.type + " is held in place.", "game");
  const dmg = spell.damage || 0;
  if (dmg > 0) {
    Fx.hitsplat(npc, dmg);
    npc.barTicks = BAR_TICKS;
    broadcastHit(npc, dmg);
    npc.hp -= dmg;
    npc.hitFlash = 0.3;
    maybeBlockNpc(npc);
    const extra = dmg - Math.min(xpDone, dmg);
    if (extra > 0) awardSpellXp(extra);
    if (npc.hp <= 0) killNpc(npc);
  }
}

/* ------------------------------------------------------- shared spell damage

   One place where a spell's damage is applied, shared by the primary target and
   by every creature a Burst/Barrage splashes onto: the hitsplat, the red flash,
   and the live game's two Magic xp per point of damage plus 1.33 Hitpoints -
   minus whatever the cast already prepaid at the release beat (see `castAt`),
   so a primary target whose roll was paid up front earns nothing twice, while a
   splashed creature (rolled and paid here, on arrival) earns its full share. */
function damageNpc(npc, dmg, xpDone = 0) {
  /* A spell's landing flinches like any other blow (see landStrike) - the
     cast-time provoke above has long burned off while the missile flew. Read
     before the splat stamps the bar: a first-ever hit on an idle victim is
     bar-down, anything after is bar-up (no delay). */
  const flinchTicks = ((npc.hpBarUntil || 0) > performance.now()) ? 0 : 2;
  Fx.hitsplat(npc, dmg);
  npc.barTicks = BAR_TICKS;
  npc.flinch = flinchTicks;
  broadcastHit(npc, dmg);
  npc.hp -= dmg;
  npc.hitFlash = 0.3;
  maybeBlockNpc(npc);
  applySmite(npc, dmg);
  const extra = dmg - Math.min(xpDone, dmg);
  if (extra > 0) awardSpellXp(extra);
}

/* The Ancient combat spells' own effects, applied to each body a cast lands on:

     smoke  - the target is poisoned (see `poisonTick` for the damage rule).
              The initial damage is the spell's own published number - 2 for
              Smoke Rush and Smoke Burst, 4 for Smoke Blitz and Smoke Barrage
              (the Ancient Magicks page's own table, and the "smoke spells"
              row of the poison page's weapon table) - and a weaker poison
              never replaces a stronger one.
     ice    - it cannot take a step for `freeze` ticks; it can still fight
     blood  - the caster is healed for `lifesteal` (a quarter) of the damage
     shadow - the target's Attack is lowered (see the shadow rows in
              src/magic.js#ANCIENT_SPELLS; 5% for Rush/Burst, 15% for
              Blitz/Barrage) */
function applySpellEffect(npc, spell, dmg) {
  if (spell.smoke) {
    const p = spell.poison || 2;
    if (!npc.poison || npc.poison.dmg < p) {
      npc.poison = { dmg: p, hits: 0, timer: POISON_INTERVAL_TICKS };
      chat("The " + npc.type + " is poisoned.", "game");
    }
  }
  if (spell.freeze) {
    if (!npc.boundTicks || npc.boundTicks < spell.freeze) {
      npc.boundTicks = spell.freeze;
      chat("The " + npc.type + " is frozen in place.", "game");
    }
  }
  if (spell.drain && dmg > 0) {
    drainStat(npc, spell.drain, spell.ticks, spell.id);
    chat("The " + npc.type + "'s " + spell.drain.stat + " is drained.", "game");
  }
  if (spell.lifesteal && dmg > 0 && G.player) {
    const heal = Math.max(1, Math.floor(dmg * spell.lifesteal));
    const p = ps();
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    /* no heal splat: this cache has no such graphic (the hitsplat sheet is
       miss/damage/poison/disease/max), and 2007 had none either - the orb
       simply moves. */
    if (p.hp > before) mark("skills");
  }
  /* The three god spells' own secondary effects, each on a successful hit and
     each exactly as its page gives it:

       Saradomin Strike  - the victim loses 1 Prayer point (the one drain that
                           needs no creature data, because prayerPoints is
                           universal state; a creature with none is unaffected)
       Claws of Guthix   - the victim's Defence falls by 1 + 5%
       Flames of Zamorak - the victim's Magic falls by 1 + 5%

     The two level drains go through the same `drains` bookkeeping the curse
     spells use, so they expire on the same clock and stack the same way. Only
     the Defence one bites today, because this revision's creatures roll their
     magic defence off their Defence level (see npcMagicDefence) - the Magic
     drain is written and honest, and has nothing to move yet. */
  if (spell.god && dmg > 0) {
    if (spell.god === "saradomin") {
      npc.prayerPoints = Math.max(0, (npc.prayerPoints || 0) - 1);
    } else {
      const stat = spell.god === "guthix" ? "defence" : "magic";
      drainStat(npc, { stat, pct: 5 }, GOD_DRAIN_TICKS, spell.id);
      chat("The " + npc.type + "'s " + stat + " is drained.", "game");
    }
  }
}

/* How long a god spell's level drain lasts. The live game's own number is not
   published on the spell pages (only the size of the drain), so this follows
   the curse spells' 16-tick clock, which is the family the effect belongs to. */
const GOD_DRAIN_TICKS = 16;

/* A Burst/Barrage's splash: every live creature on the tiles within `radius` of
   the victim, each rolled against its own magic defence. The caster is not
   among them. */
function splashSpell(center, spell, radius) {
  const p = ps();
  const hit = [];
  for (const other of G.npcs) {
    if (other === center || other.dead || other.hp <= 0) continue;
    const d = Math.max(Math.abs(Math.floor(other.x) - Math.floor(center.x)),
                       Math.abs(Math.floor(other.z) - Math.floor(center.z)));
    if (d > radius) continue;
    const od = resolveHit(playerAccuracy(), npcMagicDefence(other), spellMaxHit(p, spell));
    if (od <= 0) continue;
    Gfx.play(spell.end, {
      x: other.rx != null ? other.rx : other.x,
      z: other.rz != null ? other.rz : other.z,
      height: impactHeight(spell, other), dir: other.dir || 0, target: other, tint: spell.tint,
    });
    damageNpc(other, od);
    applySpellEffect(other, spell, od);
    if (other.hp <= 0) killNpc(other);
    hit.push(other.type);
  }
  return hit;
}

/* Monster Examine: the spell reads the creature out, stat by stat, the way the
   live game's spell prints its combat level, hitpoints and bonuses. */
function examineCreature(npc) {
  const s = npc.stats || {};
  chat(npc.type.replace(/_/g, " ") + ": combat level " + (s.level || 0) +
    ", " + (s.hp || 0) + " hitpoints.", "game");
  chat("Attack " + (s.attack || 1) + ", Strength " + (s.strength || 1) +
    ", Defence " + (s.defence || 1) + ", max hit " + npcMaxHit(npc) + ".", "game");
  if (isUndead(npc.type)) chat("It is of the undead.", "game");
}

/* The poison clock, which the player and the creatures share. The published
   rule is one hitsplat every **30 game ticks (18 seconds)**, with the damage
   falling by one for every five hits that land - so a poison that starts at 6
   runs 6,6,6,6,6, 5,5,5,5,5, ... 1,1,1,1,1, and its whole life is 105 damage.
   It wears off by itself when the damage reaches zero. */
const POISON_INTERVAL_TICKS = 30;
const POISON_HITS_PER_STEP = 5;
export { POISON_INTERVAL_TICKS, POISON_HITS_PER_STEP };

/* One creature's hit of the clock. A creature's poison is `{ dmg, hits, timer }`
   exactly like the player's (see `playerPoisonTick`), because the rule is the
   same rule; the smoke spells are what put it there (see `applySpellEffect`). */
function poisonTick(npc) {
  if (!npc.poison || npc.dead) return;
  npc.poison.timer -= 1;
  if (npc.poison.timer > 0) return;
  npc.poison.timer = POISON_INTERVAL_TICKS;
  const dmg = Math.max(1, npc.poison.dmg);
  Fx.hitsplat(npc, dmg, "poison");
  npc.hp -= dmg;
  npc.hitFlash = 0.3;
  npc.poison.hits = (npc.poison.hits || 0) + 1;
  if (npc.poison.hits % POISON_HITS_PER_STEP === 0) npc.poison.dmg -= 1;
  if (npc.hp <= 0) killNpc(npc);
  else if (npc.poison.dmg < 1) npc.poison = null;
}

/* The player's side of the same clock. A poisoned player takes one green
   hitsplat every 30 ticks, with the damage stepping down by one every five
   hits, and the poison simply ending when there is nothing left to deal - the
   published rule, and the same numbers the creatures use. `poison` is
   `{ dmg, hits, timer }` on the player state (src/player.js). A hit that takes
   the player to zero goes through the ordinary death path. */
export function playerPoisonTick(p) {
  if (!p.poison || p.hp <= 0) return;
  p.poison.timer -= 1;
  if (p.poison.timer > 0) return;
  p.poison.timer = POISON_INTERVAL_TICKS;
  const dmg = Math.max(1, p.poison.dmg);
  Fx.hitsplat(G.player, dmg, "poison");
  p.hp = Math.max(0, p.hp - dmg);
  p.hpRegen = 0;
  p.poison.hits = (p.poison.hits || 0) + 1;
  if (p.poison.hits % POISON_HITS_PER_STEP === 0) p.poison.dmg -= 1;
  if (p.poison.dmg < 1) {
    p.poison = null;
    chat("The poison wears off.", "game");
  } else {
    chat("You take " + dmg + " damage from poison.", "warn");
  }
  mark("skills");
  if (p.hp <= 0) playerDeath(null);
}

/* Catching a creature's poison. `poison` on an NPC's stats row
   (src/game.js#NPC_STATS) is the published *initial damage* per hit - the
   number the wiki's poisonous-monsters table prints - and it is applied on any
   blow that lands. An antidote's immunity stops it outright, and a second
   poisoning only takes hold if it is stronger than the one already running.
   The per-creature chance of poisoning is not published for most monsters, so
   "a hit that lands" is this world's rule rather than a number read off a
   page. */
export function inflictPoison(npc) {
  const p = ps();
  const dmg = (npc.stats && npc.stats.poison) || 0;
  if (!dmg) return;
  if ((p.poisonImmune || 0) > 0) return;
  if (p.poison && p.poison.dmg >= dmg) return;
  p.poison = { dmg, hits: 0, timer: POISON_INTERVAL_TICKS };
  mark("skills");
  chat("You have been poisoned!", "warn");
}

/* ---------------------------------------------- the poison on the other blade

   The other direction of the same clock: a player poisoning a creature, which
   until now only the smoke spells could do. A weapon coated in weapon poison
   (src/items.js#POISON_FAMILIES, applied with a use-with out of the vial) rolls
   for it on every blow that lands, on the Poison page's own rules:

     * the hit must have dealt something - "Damage must be non-zero" - so a miss
       and a splash roll nothing at all;
     * the chance is **1/4 for melee, 1/8 for ranged** (Mod Ash's numbers, cited
       on the page), and it is not material-dependent, so every poisoned weapon
       of a tier poisons at the same rate;
     * the poison delivered is the tier's own initial damage - 4, 5 or 6 for a
       melee weapon and 2, 3 or 4 for a ranged one (src/items.js#WEAPON_POISON);
     * a creature already carrying an equal or stronger poison is not made
       stronger, but the coat *does* refresh the one it has - re-applying is how
       a poison is kept running, which is what "if not reapplied to the target,
       the poison damage will deal 1 less damage every 5 hits" says;
     * an immune creature is never poisoned at all. The four in this world are
       marked on their stats rows (src/game.js#NPC_STATS' `poisonImmune`): the
       cow, the calf, the chicken and the duck, whose own internal timers are
       busy doing something else.

   Which weapon is read from the *hand that made the attack*: a melee swing is
   poisoned by the equipped weapon, a shot by the arrow that flew. And the
   ranged poison runs the shared clock one plate ahead of the melee one - its
   first plate is a single hit where a melee poison's is five - which is the
   whole of the `hits` seed below (see WEAPON_POISON's own note for the two
   damage totals that come out of it). */
function poisonOnHit(npc, style, ammo) {
  if (!npc || npc.dead || !npc.stats) return;
  if (npc.stats.poisonImmune) return;
  const ranged = styleSkill(style) === "ranged";
  const id = ranged ? ammo : equippedId(ps(), "weapon");
  const d = id ? ITEMS[id] : null;
  const tier = d && d.weaponPoison ? WEAPON_POISON[d.weaponPoison] : null;
  if (!tier) return;
  if (Math.random() >= (ranged ? 0.125 : 0.25)) return;
  const dmg = ranged ? tier.ranged : tier.melee;
  if (npc.poison) {
    if (npc.poison.dmg >= dmg) {
      npc.poison.timer = POISON_INTERVAL_TICKS;
      return;
    }
  }
  npc.poison = { dmg, hits: ranged ? POISON_HITS_PER_STEP - 1 : 0, timer: POISON_INTERVAL_TICKS };
  chat("The " + npc.type + " is poisoned.", "game");
}

/* The undead-only spells (Crumble/Shatter/Pulverize) will only touch a creature
   of the undead class. That class is declared on each creature's stats row in
   src/game.js#NPC_STATS - the graveyard's zombies, skeletons (mage included) and
   ghosts, and the monks and priests the user asked for - and read back through
   `isUndead`; there is no name list here to drift out of date. */

function killNpc(npc, credit = true) {
  const t = tileOf(npc);
  npc.dead = true;
  npc.hp = 0;
  /* The creature is dead from this tick on. Its *model* stays on screen while
     the cache's death sequence plays: the render loop steps the fall
     (src/game.js#updateVisuals) and takes the body away once models3d.js#update
     reports the sequence has reached the lying pose it holds forever
     (`fallDone`). A creature with no animated model of its own - a sprite
     billboard or the blocky stand-in - has no sequence to play, so it is
     switched off right here, exactly as everything used to be. `corpse` marks
     it as awaiting respawn, and the render loop then runs its spawn timer (see
     src/game.js#updateNpcs). 17-47 game ticks, i.e. 10.2-27.6s, is the real
     spawn timer range - but the number is drawn from the *creature* rather
     than rolled (src/game.js#respawnTicksFor), so the same kill brings the same
     monster back at the same moment on every client watching it, instead of
     each client holding its own private resurrection. */
  if (npc.ch && npc.ch.group && !npc.ch.isModel) npc.ch.group.visible = false;
  npc.corpse = true;
  npc.respawn = 0;
  npc.respawnTicks = respawnTicksFor(npc.spawnIx);
  /* Clearing `target` below is what takes this creature out of the player's
     fight, and the census reads exactly that to decide which creatures are
     worth a packet - so the death itself has to leave a mark that outlives it,
     which is what `playerHitTicks` is for (see src/game.js#creatureStateBatch,
     and the same line in `broadcastHit`). It is set here rather than only on
     the blows because not every killing blow went through `broadcastHit`: a
     poison tick (see `poisonTick`) and the smoke spells' own damage land
     without one, and a creature the poison finished off then died privately -
     the killer watched it fall, and nobody else's copy ever heard. A kill the
     world made (`credit = false`, see `worldStrike`) says nothing about who
     did it, but the *body* is still a fact its neighbours need, so it is
     marked too. */
  npc.playerHitTicks = Math.max(npc.playerHitTicks || 0, 8);
  npc.target = null;
  npc.aggroed = null;
  npc.path.length = 0;
  npc.moving = false;
  npc.rphase = 0;
  /* The minigame dungeon's private cast drops nothing (src/minigame.js): the
     bodies are one runner's alone, and instanced loot must never land on
     shared ground where a passer-by could pick it up. */
  const drops = npc.noDrops ? [] : (NPC_DROPS[npc.type] || [{ id: "bones", chance: 1, qty: [1, 1] }]);
  /* Ring of wealth: the live game's own rule is that it gives a second roll at
     the rare drop table ("the chance of getting a rare drop... the ring of
     wealth increases it by removing the empty slot"), and this world has no
     such table - every creature carries its own short drop list instead. What
     the ring does here is the honest translation: a row the creature drops at
     5% or rarer gets a second roll. Rows that are not rare at all are left
     exactly as they were, so a wealth ring adds luck, never quantity. */
  const wealthy = equippedId(G.ps, "ring") === "ring_of_wealth";
  for (const d of drops) {
    let got = Math.random() <= d.chance;
    if (!got && wealthy && d.chance <= 0.05) got = Math.random() <= d.chance;
    if (!got) continue;
    const q0 = d.qty ? d.qty[0] : 1;
    const q1 = d.qty ? d.qty[1] : q0;
    const qty = q0 + Math.floor(Math.random() * (q1 - q0 + 1));
    if (qty > 0) spawnGround(d.id, qty, t.x, t.z, { owner: credit ? G.ps.name : null });
  }
  /* The kill is *credited* to the player by default, and everything that means
     is in this branch: the counter, the player's own tally and the skills
     repaint. A kill the world made - a blow landed through `worldStrike`, i.e.
     a god's own strike - passes `credit = false` and pays out nothing, while
     still leaving the creature dead and its drops on the ground (the loot is
     the creature's, not the killer's). The player's own fight still ends either
     way: a dead target is dropped by `tickCombat` regardless, but it is dropped
     here too so nothing is left pointing at a corpse. */
  if (Combat.target === npc) Combat.target = null;
  if (credit) {
    Combat.kills++;
    if (G.ps.stats) G.ps.stats.kills = (G.ps.stats.kills || 0) + 1;
    mark("skills");
  }
}

/* ------------------------------------------------------------------ world damage

   The primitives for a blow the *player* is not part of, added for the god in
   the northern woods and the creatures that throw themselves at him
   (src/saradomin.js, 2026-09-24). They are written as the honest shape of the
   thing rather than as that module's private code, because each is one half of
   the only fight in this world in which neither end of a blow is the player:

     * `worldStrike` - "a blow landed on a creature by the world";
     * `creatureStrike` - "a creature's blow landed on another creature".

   A **god's kill is nobody's kill**. `worldStrike` passes `credit = false` to
   `killNpc`, which skips the kill counter, the player's `stats.kills` and the
   skills repaint - the creature died, its bones fall where it stood (the drop
   table is the creature's own and still rolls), but the player watching it
   happen has earned nothing, exactly as they should not have. Contrast the
   player's own blows, which all end in `landStrike` - experience, kill credit,
   the lot. */

/* There is deliberately no third primitive for "a blow landed on the player by
   the world". There was one - the god's strike used it - and it went with the
   god's ability to hit the player at all (the user's ask, 2026-09-24: *"the
   player should not be hit by saradomins attacks"*), which src/saradomin.js's
   header explains. A future mechanic that needs one writes it again rather than
   reviving a path nothing asks for. */

/* Land `dmg` on a creature from the world itself. Returns what landed, so a
   caller that draws a hit and a miss differently can tell them apart. */
export function worldStrike(npc, dmg) {
  if (!npc || npc.dead || npc.corpse || !(dmg > 0)) return 0;
  Fx.hitsplat(npc, dmg);
  npc.hp -= dmg;
  npc.hitFlash = 0.3;
  if (npc.hp <= 0) killNpc(npc, false);
  return dmg;
}

/* ------------------------------------------------------- two creatures fighting

   The mirror of the player's own attack, for the one fight the player watches
   instead of having: the god's assailants against the god (src/saradomin.js#
   tickGodFoe). Everything about the blow is the game's own - the attacker's
   accuracy roll (`npcAccuracy`) against the victim's own defence (`npcDefence`,
   so the god is exactly as hard to hit as his row says), the attacker's own
   published max hit, and the attacker's own attack pose - which is why these
   live here beside the tables they read rather than inside the god's module.

   `creatureInReach` is the reach test, and it is deliberately the same measure
   `game.js#updateNpcs` walks a creature in on: a melee creature must be
   orthogonally beside its victim's floor, a caster or an archer anywhere in the
   Chebyshev ring around it. If the two ever disagreed, a creature would walk to
   a tile it could not swing from and stand there for good. */
export function creatureInReach(attacker, victim) {
  if (!attacker || !victim) return false;
  const t = tileOf(victim);
  const d = footDistance(t.x, t.z, npcFootBox(attacker));
  return meleeReach(attacker.type) ? d.orth <= 1 : d.cheb <= 1;
}

/* One creature's blow on another. A caster throws the spell it already throws
   at a player, aimed at this victim instead; a melee creature raises its own
   attack pose and swings. Returns the damage dealt, which the god's module
   ignores - it only wants the blow to happen.

   `tileOf` measures the victim's *tile* against the attacker's floor, which is
   the same direction `updateNpcs` measures in (a big demon's chase stops with
   its floor beside the victim). */
export function creatureStrike(attacker, victim) {
  if (!attacker || !victim || attacker.dead || victim.dead) return 0;
  const spec = castSpecOf(attacker);
  if (spec) return creatureCast(attacker, victim, spec);
  attacker.attackAnim = 1;
  attacker.swingId = (attacker.swingId || 0) + 1;
  return creatureBlow(attacker, victim, null);
}

/* The roll itself, and the only place in the game where a creature damages a
   creature: the attacker's accuracy against the victim's defence, the
   attacker's own max hit, and the damage applied through `worldStrike` - so a
   kill made here is still nobody's kill, exactly like the god's own strikes. A
   miss is the client's blue zero over the victim's head, the same null splat a
   creature's miss on the player draws. */
function creatureBlow(attacker, victim, maxOverride) {
  const max = maxOverride != null ? maxOverride : npcMaxHit(attacker);
  const dmg = resolveHit(npcAccuracy(attacker), npcDefence(victim), max);
  if (dmg > 0) { worldStrike(victim, dmg); return dmg; }
  Fx.hitsplat(victim, 0);
  return 0;
}

/* The caster's half of it: the same three beats `npcCast` throws at the player
   - the ball gathering in the caster's hands, the missile in flight, the burst
   on the victim - with the victim standing in for the player at every one of
   them, so an impact graphic rides *this* body rather than the local player's.
   The damage is rolled when the graphic lands, exactly as it is for a player. */
function creatureCast(attacker, victim, spec) {
  /* Plants its feet exactly as a cast at the player does (see npcCast). */
  if (attacker.path) attacker.path.length = 0;
  attacker.dir = Math.atan2(victim.x - npcDrawCX(attacker), victim.z - npcDrawCZ(attacker));
  playCastAnim(attacker, spec.anim);
  if (spec.start != null && START_GFX_ON_CASTER) {
    Gfx.play(spec.start, {
      x: attacker.rx != null ? attacker.rx : attacker.x,
      z: attacker.rz != null ? attacker.rz : attacker.z,
      height: bodyHeight(CENTRE_HEIGHT, attacker),
      dir: attacker.dir || 0,
      target: attacker,
    });
  }
  Gfx.projectile({
    gfx: spec.proj,
    fromX: npcDrawCX(attacker), fromZ: npcDrawCZ(attacker), fromH: spec.projStart,
    target: victim, toX: npcDrawCX(victim), toZ: npcDrawCZ(victim), toH: bodyHeight(spec.projEnd, victim),
    delay: projDelayCycles(spec),
    duration: flightSeconds(Math.hypot(attacker.x - victim.x, attacker.z - victim.z)),
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: (at) => {
      if (attacker.dead || victim.dead || victim.corpse) return;
      const vx = at && at.x != null ? at.x : victim.x;
      const vz = at && at.z != null ? at.z : victim.z;
      const vh = impactHeight(spec, victim);
      bubbleArrives(spec, vx, vz, vh, victim.dir, victim);
      ballArrives(spec, vx, vz, vh, victim.dir, victim);
      if (creatureBlow(attacker, victim, spec.max) > 0) {
        Gfx.play(spec.end, { x: vx, z: vz, height: vh, dir: victim.dir || 0, target: victim });
      } else {
        playSplash(vx, vz, vh, victim.dir, victim);
      }
    },
  });
  return 0;
}

/* The one creature in the world with a cast of its own: the dark wizard's
   bolt. The animation is the wizard's own `curse` sequence (baked by
   src/tools/cache-bake/bake.mjs#CHARACTERS) and the graphics are the player's
   Earth Bolt spell's - the same three spotanims the content gives the spell. The hit
   is rolled when the graphic lands, so the wizard's target can walk out of the
   way of nothing: the projectile follows them, exactly as the player's does. */
const NPC_CAST = {
  dark_wizard: { anim: "curse", start: 123, proj: 124, end: 125, projStart: 172, projEnd: 124, endH: 124 },
  dark_wizard_young: { anim: "curse", start: 96, proj: 97, end: 98, projStart: 172, projEnd: 124, endH: 124 },
  /* The **wizard** (level 9) is the second caster, and it throws Fire Strike:
     its published attack style is Magic, it wears the very same `Human` rig as
     the dark wizard (with a hat merged on), and the cache's own
     `human_castcurse` (718) plays on its framemap - so it throws Fire Strike's
     own three beats for its own published max hit of 4. Unit C1 found it attacking
     unarmed for 1: a level-9 mage that punches. Its `NPC_MAX_HIT` and
     `NPC_STYLE` rows stay as the fallback for a wizard that somehow ends up in
     reach without its cast, exactly like Prime's and Ahrim's. */
  wizard: { anim: "curse", start: 99, proj: 100, end: 101, projStart: 172, projEnd: 124, endH: 124, max: 4 },
  /* Dagannoth Prime is the world's first *combat* caster: its published attack
     "resembles the Water Wave spell", so it is given Water Wave's own three
     beats - the same spotanims the player's spell plays (gather 161, missile
     162, impact 163), thrown through this same npcCast. `max` is the published
     50, which is what makes the "magic" style worth passing to `npcStrikeHit`:
     the breath-equivalent for a mage, and the one dragon-sized number among the
     Kings. Everything else about Prime is the ordinary melee path, so a Prime
     that has been closed on still swings for its 26 (see src/game.js#NPC_STATS
     and the NPC_MAX_HIT note in this file). */
  dagannoth_prime: { anim: "cast", start: 161, proj: 162, end: 163, projStart: 172, projEnd: 124, endH: 124, max: 50 },
  /* Ahrim is the other caster, and he throws **Fire Wave**: the spell whose
     published max hit is 20 is exactly his own published max hit, which is why
     the wizard's curse graphics are not what he uses. His three beats are Fire
     Wave's own (gather 155, missile 156, impact 157 - the earth/water/wind
     waves in this cache are 164/161/158 respectively) and the pose is the
     `cast` sequence baked onto his model (711, the same cast_strike the player
     plays). `max` is his published 20, matching NPC_MAX_HIT above. */
  ahrim: { anim: "cast", start: 155, proj: 156, end: 157, projStart: 172, projEnd: 124, endH: 124, max: 20 },
  /* The tower wizard east of the mine: a plain level-9 wizard whose spawn
     carries `cast: "tower_wizard"` (src/world.js), so it is an ordinary wizard
     in everything but the cast it throws - Fire Strike's own three beats
     (gather 99, missile 100, impact 101: the player's spell id 21, whose
     published max hit of 8 is this row's `max`). The pose stays the `curse`
     the Human rig is baked with - no `cast` sequence exists for it - which is
     the same arms the curse wizards raise. Read through `castSpecOf` below,
     never directly. */
  tower_wizard: { anim: "curse", start: 99, proj: 100, end: 101, projStart: 172, projEnd: 124, endH: 124, max: 8 },
  /* The churchyard's Skeleton Mage (wiki: level 16, Magic/Crush, max hit 3,
     4-tick speed - all already in this module's rows): "usually attack with
     melee and will occasionally cast a spell, exclaiming 'I infect your body
     with rot...', that resembles Weaken as a projectile and Curse when it
     lands". Its cast motion is gameval SKELETON_UPDATE_MAGE_CASTING (5523,
     baked as the `cast` slot; 5507/5508 were vary3 attack/defend - 5508 is
     a block), and the missile leaves as the hands thrust out (`projDelay: 48`,
     the same 80%-through fraction the old 99-cycle timing used).
     `mixMelee` keeps the wiki's
     usually-melee rule (see npcStrike): adjacent it swings three blows in
     four and casts the fourth; further out it always casts. `rot` is the
     landed curse draining Attack/Strength/Defence 3-4 (see npcCast). */
  skeleton_mage: { anim: "cast", start: 105, proj: 106, end: 107, projStart: 172, projEnd: 124, endH: 124, max: 3, mixMelee: 0.25, rot: true, projDelay: 48 },
};

/* Which cast a creature throws: its type's own row, unless its spawn names
   another one (`castOverride`, src/game.js#createNpc) - the same spawn-flag
   idea as `godFoe`, because the tower wizard is an ordinary wizard everywhere
   but in the spell it throws. A name with no row falls back to the type, so a
   typo degrades to the ordinary cast rather than to silence. */
function castSpecOf(npc) {
  if (npc && npc.castOverride && NPC_CAST[npc.castOverride]) return NPC_CAST[npc.castOverride];
  return npc ? NPC_CAST[npc.type] : null;
}

/* The casts in wire order: every row of NPC_CAST above, so a cast is one byte
   on the wire (see `remoteCreatureCast`). Derived from the table rather than
   written down, the way `items.js#combatAnims` is - both clients run the same
   build, so an index means the same cast on each side, and a new caster joins
   the wire the moment its row is added. Karil's bolt rides the same kind at
   128 plus its row below, so casts and missiles never share an index. */
export const CREATURE_CASTS = Object.keys(NPC_CAST);
const CREATURE_MISSILES = ["karil"];

/* The wire index of the cast this creature throws: its override's row, else
   its type's - the same answer `castSpecOf` gives, as a number. -1 when the
   creature throws nothing a watcher could name, which is when no kind-3
   packet goes out at all. */
function castIndexOf(npc) {
  const key = npc && npc.castOverride && NPC_CAST[npc.castOverride] ? npc.castOverride : npc ? npc.type : null;
  return CREATURE_CASTS.indexOf(key);
}

function npcCast(npc, spec) {
  /* A caster plants its feet to throw: the chase stops for the cast (any walk
     still planned is dropped and the body turns to face its victim), so the
     motion reads as a cast rather than as walking forward - the Skeleton
     Mage's whole complaint, which threw its swipe while still walking its
     chase. The next chase tick re-paths if the victim is still out of reach,
     so a ranged caster still advances between casts, exactly as a player does
     who casts, steps, and casts again. */
  if (npc.path) npc.path.length = 0;
  npc.dir = Math.atan2(G.player.x - npcDrawCX(npc), G.player.z - npcDrawCZ(npc));
  playCastAnim(npc, spec.anim);
  /* The Skeleton Mage exclaims its rot line as it casts, over its own head -
     the wiki's "I infect your body with rot...". */
  if (spec.rot) sayOverhead(npc, "I infect your body with rot...");
  /* ...and the watchers are told: the cast's wire index plus the caster's
     spawn index (src/combat.js#remoteCreatureCast), so another player's
     screen throws the same spell rather than swinging a punch. */
  const ci = castIndexOf(npc);
  if (ci >= 0) netCombat(3, ci, 0, 0, npc.spawnIx);
  /* the wizard's ball gathers in his own hands, exactly as a player's does -
     see src/magic.js#START_GFX_ON_CASTER. Played off the *rendered* position
     and carrying him as the target, so it rides the body if he steps */
  if (spec.start != null && START_GFX_ON_CASTER) {
    Gfx.play(spec.start, {
      x: npc.rx != null ? npc.rx : npc.x,
      z: npc.rz != null ? npc.rz : npc.z,
      height: bodyHeight(CENTRE_HEIGHT, npc),
      dir: npc.dir || 0,
      target: npc,
    });
  }
  /* The caster's blow is decided on the tick he casts - see `commitStrike`. */
  const ctx = commitStrike(npc, "magic", spec.max);
  Gfx.projectile({
    gfx: spec.proj,
    fromX: npcDrawCX(npc), fromZ: npcDrawCZ(npc), fromH: spec.projStart,
    target: G.player, toX: G.player.x, toZ: G.player.z, toH: bodyHeight(spec.projEnd, G.player),
    /* the wizard gathers his curse exactly as a player casting one does - the
       same row's 51 cycles - so his arms finish moving before the ball is away.
       The ball is drawn in flight, for the same reason the player's is (see
       src/magic.js#MISSILE_IN_FLIGHT): the content's own three beats. */
    delay: projDelayCycles(spec),
    duration: flightSeconds(Math.hypot(npcDrawCX(npc) - G.player.x, npcDrawCZ(npc) - G.player.z)),
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: (at) => {
      if (npc.dead) return;
      /* the curse bursts on the player only when it lands, and a miss leaves the
         failed-spell splash instead - the same rule the player's casts follow.
         Both ride the player, who is a normal-sized body, so the heights are
         the content's own (see src/magic.js#impactHeight). */
      const px = at && at.x != null ? at.x : G.player.x;
      const pz = at && at.z != null ? at.z : G.player.z;
      const ph = impactHeight(spec, G.player);
      bubbleArrives(spec, px, pz, ph, G.player.dir, G.player);
      ballArrives(spec, px, pz, ph, G.player.dir, G.player);
      if (npcStrikeHit(npc, "magic", spec.max, null, ctx) > 0) {
        Gfx.play(spec.end, { x: px, z: pz, height: ph, dir: G.player.dir || 0, target: G.player });
        /* ...and a landed rot curse drains Attack, Strength and Defence 3-4 -
           the wiki's "if successful, it will lower the player's stats". A miss
           or a prayer-blocked blow leaves the stats alone. */
        if (spec.rot) {
          const d = 3 + (Math.random() < 0.5 ? 1 : 0);
          applyBoost(ps(), "attack", -d);
          applyBoost(ps(), "strength", -d);
          applyBoost(ps(), "defence", -d);
        }
      }
      else playSplash(px, pz, ph, G.player.dir, G.player);
    },
  });
}

/* The ranged creatures' missiles. A crossbow shot is the same kind of thing an
   arrow is - `27 = crossbowbolt_travel` in the preserved pack, a 15-vertex bolt
   with its own recolour - so it flies exactly the way the player's does and the
   blow is rolled when it lands, not when the string is released. Karil is the
   one creature who fights this way, and keeping the table here (rather than a
   special case in `npcStrikeHit`) means the bolt is resolved as `"range"`, the
   style Protect from Missiles carries (src/prayer.js): Karil's attack is
   published as Ranged, so that is the protection which stops it, and a plain
   `npcStrikeHit(npc)` - whose style defaults to `"melee"` - could never have
   picked it up. */
const NPC_MISSILE_GFX = { karil: 27 };

function npcMissile(npc) {
  /* Plants its feet exactly as a spellcaster does (see npcCast): Karil fires
     standing, not mid-stride. */
  if (npc.path) npc.path.length = 0;
  npc.dir = Math.atan2(G.player.x - npcDrawCX(npc), G.player.z - npcDrawCZ(npc));
  playCastAnim(npc, "attack");
  /* The watchers get the bolt the same way they get a cast (see `npcCast`
     above): Karil's wire row under the 128 offset, so their screen looses a
     bolt rather than swinging a punch. */
  const mi = CREATURE_MISSILES.indexOf(npc.type);
  if (mi >= 0) netCombat(3, 128 + mi, 0, 0, npc.spawnIx);
  /* Karil fires the very animation every crossbow fires (Karil's own - 427, the
     one the user asked to keep for all of them), so his bolt leaves from the
     same measured muzzle point the player's does, scaled to his own body. */
  const start = missileStart(npc, MISSILE_ANCHORS.crossbow, G.player.x, G.player.z);
  /* The blow is decided *here*, on the tick Karil looses it - see
     `commitStrike`. */
  const ctx = commitStrike(npc, "range");
  Gfx.projectile({
    gfx: NPC_MISSILE_GFX[npc.type],
    fromX: start.x, fromZ: start.z, fromH: start.h,
    target: G.player, toX: G.player.x, toZ: G.player.z, toH: bodyHeight(CENTRE_HEIGHT, G.player),
    duration: rangedFlightSeconds(Math.hypot(start.x - G.player.x, start.z - G.player.z), BOW_RANGE),
    delay: start.release,
    hidden: !MISSILE_IN_FLIGHT,
    fromFn: () => {
      const s = missileStart(npc, MISSILE_ANCHORS.crossbow, G.player.x, G.player.z);
      return { x: s.x, z: s.z, h: s.h };
    },
    durationFn: (dist) => rangedFlightSeconds(dist, BOW_RANGE),
    onArrive: () => { if (!npc.dead) npcStrikeHit(npc, "range", null, null, ctx); },
  });
}

/* Somebody else's creature cast (src/net.js#C_COMBAT kind 3): the pose, the
   gather and the missile on this client's copy of the caster, and the burst
   on their ghost - the three beats the victim's own client played, told to
   the neighbourhood so a watched fight throws spells instead of punches.
   Visuals-only like every other remote effect (see
   src/actions.js#showNpcSpellHit): a miss still bursts here rather than
   splashing, because only the victim's client knows the roll, and the damage
   arrives separately as kind 2. An index this build does not know, a missile
   row naming another creature, or a caster this client cannot resolve draws
   nothing. */
export function remoteCreatureCast(id, a, ix) {
  const g = G && G.ghosts ? G.ghosts.get(id) : null;
  if (!g) return null;
  const gx = g.rx != null ? g.rx : g.x, gz = g.rz != null ? g.rz : g.z;
  const npc = ix != null && ix !== 0xffff ? creatureBySpawnIx(ix) : null;
  if (!npc || npc.dead) return g;
  if (a >= 128) {
    /* Karil's bolt: the pose and the missile, and no burst - the local throw
       bursts nothing either (see `npcMissile`), and the blow lands as kind 2,
       where the ghost's answer is raised. */
    if (CREATURE_MISSILES[a - 128] !== npc.type) return g;
    npc.dir = Math.atan2(gx - npcDrawCX(npc), gz - npcDrawCZ(npc));
    playCastAnim(npc, "attack");
    const start = missileStart(npc, MISSILE_ANCHORS.crossbow, gx, gz);
    Gfx.projectile({
      gfx: NPC_MISSILE_GFX[npc.type],
      fromX: start.x, fromZ: start.z, fromH: start.h,
      target: g, toX: gx, toZ: gz, toH: bodyHeight(CENTRE_HEIGHT, g),
      duration: rangedFlightSeconds(Math.hypot(start.x - gx, start.z - gz), BOW_RANGE),
      delay: start.release,
      hidden: !MISSILE_IN_FLIGHT,
      fromFn: () => {
        const s = missileStart(npc, MISSILE_ANCHORS.crossbow, gx, gz);
        return { x: s.x, z: s.z, h: s.h };
      },
      durationFn: (dist) => rangedFlightSeconds(dist, BOW_RANGE),
      onArrive: () => {},
    });
    return g;
  }
  const spec = CREATURE_CASTS[a] ? NPC_CAST[CREATURE_CASTS[a]] : null;
  if (!spec) return g;
  npc.dir = Math.atan2(gx - npcDrawCX(npc), gz - npcDrawCZ(npc));
  playCastAnim(npc, spec.anim);
  if (spec.rot) sayOverhead(npc, "I infect your body with rot...");
  if (spec.start != null && START_GFX_ON_CASTER) {
    Gfx.play(spec.start, {
      x: npc.rx != null ? npc.rx : npc.x,
      z: npc.rz != null ? npc.rz : npc.z,
      height: bodyHeight(CENTRE_HEIGHT, npc),
      dir: npc.dir || 0,
      target: npc,
    });
  }
  Gfx.projectile({
    gfx: spec.proj,
    fromX: npcDrawCX(npc), fromZ: npcDrawCZ(npc), fromH: spec.projStart,
    target: g, toX: gx, toZ: gz, toH: bodyHeight(spec.projEnd, g),
    delay: projDelayCycles(spec),
    duration: flightSeconds(Math.hypot(npcDrawCX(npc) - gx, npcDrawCZ(npc) - gz)),
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: (at) => {
      if (npc.dead) return;
      const vx = at && at.x != null ? at.x : gx;
      const vz = at && at.z != null ? at.z : gz;
      const vh = impactHeight(spec, g);
      bubbleArrives(spec, vx, vz, vh, g.dir, g);
      ballArrives(spec, vx, vz, vh, g.dir, g);
      Gfx.play(spec.end, { x: vx, z: vz, height: vh, dir: g.dir || 0, target: g });
    },
  });
  return g;
}

/* The protection style a creature's ordinary blow carries, for the three
   overhead Protect prayers. `NPC_STYLE` is written in the *weapon's* own
   vocabulary - "slash", "crush", "stab", "range", "magic" - because its job is
   to pick which of the player's defence bonuses the blow rolls against
   (`playerDefence`), and the protections are only three, so the melee weapons
   collapse into one: a creature published as Ranged or Magic keeps that name,
   everything else is "melee".

   This is what makes the *published* attack style the protection that stops a
   blow, which the tables' own notes promise - "Supreme is the Ranged one, and
   this table is where 'range' finally means something ... and Protect from
   Missiles stops it" (see NPC_STYLE). It was not true: a plain strike called
   `npcStrikeHit(npc)` and that defaulted the style to "melee", so Dagannoth
   Supreme - the one Ranged attacker in the world with no bolt of its own baked
   (Karil's is the other, and he goes through `npcMissile`) - was met by Protect
   from *Melee* and not at all by Protect from Missiles (the user's ask,
   2026-09-23: "make sure overhead prayers such as protect from missiles etc
   actually do what they are supposed to do"). A caster's own blow is left to
   its cast's explicit "magic". */
function protectionStyle(type) {
  const s = NPC_STYLE[type];
  return s === "range" || s === "magic" ? s : "melee";
}

/* Should a mixed fighter throw its cast on this strike? Anything without
   `mixMelee` always casts (the dark wizard, Prime, Ahrim); a mixed fighter
   only ever swings when it can reach you, and beside you it reads the
   overheads - Protect from Melee is answered with the rot curse, Protect from
   Magic with the crush swing, and with neither up it swings three blows in
   four exactly as before. */
function shouldCast(npc, spec) {
  if (!spec.mixMelee) return true;
  if (chebyshev(tileOf(npc), tileOf(G.player)) > 1) return true;
  const prot = prayerProtection(ps());
  if (prot === "melee") return true;
  if (prot === "magic") return false;
  return Math.random() < spec.mixMelee;
}

function npcStrike(npc) {
  /* The creature commits to a blow here - whether it is a swing, a bolt or a
     spell - so the attack animation is raised at the strike and not when the
     blow lands. It used to be raised at the end of `npcStrikeHit`, which was
     the same instant for a swing but is a whole flight too late for a missile:
     a caster or an archer would replay its attack pose as the bolt arrived. */
  npc.attackAnim = 1;
  npc.swingId = (npc.swingId || 0) + 1;
  /* The strike marks the tick, so a blow landing back on the same tick does
     not raise the block pose over the attack (see `maybeBlockNpc`). The
     attack pose itself clears any block, raised through playCastAnim below. */
  npc.struckTick = G.tickCount;
  const spec = castSpecOf(npc);
  /* A mixed fighter (the Skeleton Mage's `mixMelee`): adjacent it usually
     swings and only sometimes casts, while further out it always casts - a
     mage that could not reach you would otherwise never fight back at all.
     Tarn's Lair's own rule on top (its Skeleton (mage) page): the mage
     recognises the overhead prayers and switches styles accordingly - it will
     only throw its magic if you are unreachable or are praying melee, and
     answers Protect from Magic the other way, with its (weaker, less
     accurate) crush swing. */
  if (spec && shouldCast(npc, spec)) { npcCast(npc, spec); return; }
  const breath = dragonfireOf(npc.type);
  if (breath && Math.random() < DRAGONFIRE_CHANCE) { dragonfire(npc); return; }
  if (NPC_MISSILE_GFX[npc.type]) { npcMissile(npc); return; }
  /* The plain blow carries the creature's own published style, so the three
     overhead Protect prayers meet it correctly (see `protectionStyle`). */
  npcStrikeHit(npc, protectionStyle(npc.type));
}

/* How often a dragon breathes instead of biting. The live rate is not
   published anywhere, and the wiki's own wording is only that dragons "may
   occasionally use their dragonfire". One blow in three is this world's
   stand-in, and it is deliberately the only invented number in the mechanic. */
const DRAGONFIRE_CHANCE = 1 / 3;

/* ---------------------------------------------------------- the dragonfire table

   The wiki's damage-reduction table (Dragonfire#Damage reduction) *is* what a
   dragon's breath does to a player, and this is it, whole. Every chromatic row
   is a pair - **[lost the accuracy roll, won it]** - which the client prints as
   "You're horribly burnt by the dragon fire!" and "You manage to resist some of
   the dragon fire!"; a zero row is full immunity:

     nothing               50 / 30     anti-dragon shield     5 /  5
     antifire potion       35 / 15     Protect from Magic    10 / 10
     shield + prayer        5 /  5     super antifire         0 /  0
     antifire potion + a shield, or the prayer, or both      0 /  0

   A **super antifire potion on its own** is the immunity row, and a plain one
   reaches it only with a second layer - "antifire provides immunity against
   regular dragonfire attacks when used in combination with an anti-dragon
   shield or Protect from Magic" (the potion's own page). Nothing in this world
   brews a super antifire yet, so that flag is always false today; the rows are
   the wiki's and a potion added later inherits them for free.

   The **King Black Dragon** gets one number per layer rather than two - 65 bare,
   15 behind a shield, 20 under Protect from Magic, 50 under a plain antifire
   potion, **5** under the potion *and* the prayer, and 0 under a super one or
   behind the shield with the potion - because its two published columns are its
   *fiery* and its *icy/toxic/shocking* breath, not the two rolls. This world's
   King Black Dragon has the one breath, so its single figure is what it is
   rolled against either way.

   Two things this table is **not**, both corrected here:

     * the **dragonfire shield is not immunity.** Its own page: it "retains the
       same dragonfire protection as the anti-dragon shield" - the absorption is
       what *charges* it (its worn bonuses climb by one per breath). This build
       used to swallow the breath whole with it (0 damage, always), which made
       the 2,000,000-coin shield strictly stronger than anything the wiki allows
       and left the 20-coin anti-dragon shield looking broken beside it.
     * there is no **half**. The shape is a ceiling on the roll, because
       "antifire shields and Protect from Magic dictate a lower possible damage
       range before the damage roll has taken place", where a (super) antifire
       potion is subtracted after it.

   The two **chat lines with a roll** are the wiki's own words; the lines for the
   immune rows are this world's (the wiki documents no text for them). */

/* The key is built from the layers the player actually has - s hield, p rayer,
   f plain antifire potion, S super antifire potion - in that fixed order, so a
   row can be read straight across. */
const DRAGONFIRE_TABLE = {
  chromatic: {
    "": [50, 30], s: [5, 5], p: [10, 10], sp: [5, 5],
    f: [35, 15], S: [0, 0], sf: [0, 0], sS: [0, 0],
    pf: [0, 0], pS: [0, 0], spf: [0, 0], spS: [0, 0],
  },
  king_black_dragon: {
    "": [65, 65], s: [15, 15], p: [20, 20], sp: [15, 15],
    f: [50, 50], S: [0, 0], sf: [0, 0], sS: [0, 0],
    pf: [5, 5], pS: [0, 0], spf: [0, 0], spS: [0, 0],
  },
};

/* What one breath is rolled against for this player and this dragon: `burnt`
   when they lose the Magic accuracy roll, `resisted` when they win it. A
   creature the table has no row for breathes like a chromatic dragon, which is
   every other dragon there is. */
export function dragonfireMax(type, prot = {}) {
  const rows = DRAGONFIRE_TABLE[type] || DRAGONFIRE_TABLE.chromatic;
  const key = (prot.shield ? "s" : "") + (prot.prayer ? "p" : "") +
    (prot.potion ? "f" : "") + (prot.superPotion ? "S" : "");
  const r = rows[key] || rows[""];
  return { burnt: r[0], resisted: r[1] };
}

/* Did the player win the dragonfire accuracy roll? "Dragonfire attacks usually
   roll with the monster's Magic accuracy against the player's Magic defence"
   (the wiki's mechanic section, citing Mod Ash) - and that one roll is where
   both the two maximums and the two chat lines come from. This bestiary carries
   no Magic level on most creatures, so the creature's **Attack** level stands in
   for it, the mirror of `npcMagicDefence` above, which uses a creature's
   Defence level for both sides of its own roll.

   The roll belongs to the *monster*, so the player is the one who wins it when
   the breath's chance-to-hit does **not** fire: a successful roll is the
   dragon's, and only then does it deal its burnt maximum. */
function dragonfireWon(npc) {
  const atk = drainedValue(npc, "attack", npc.stats.attack || 1);
  return Math.random() > hitChance((atk + 8) * (atk + 64), playerMagicDefence());
}

/* Dragonfire: the breath attack that makes a dragon a dragon. The blue dragon
   has carried `dragonfire: 50` since the bestiary pass; the King Black Dragon
   brings 65 (see src/game.js#NPC_STATS). It is a projectile of its own kind -
   spotanim 1, the cache's dragonfire - so it has no cast graphics and no
   impact graphic: the flame IS the whole animation, exactly as the client
   renders it, and the hit is rolled when it lands so that walking away from a
   dragon mid-breath works the way it does for every other missile here.

   It **cannot miss**: the accuracy roll has already happened, and it is the one
   that chooses burnt or resisted (`dragonfireWon`). Rolling a second time inside
   `npcStrikeHit` would let a player simply dodge the fire, which is not a thing
   dragonfire does, so the damage is handed over ready-made.

   The style passed to it is the string "dragonfire" rather than one of
   "melee"/"range"/"magic" - the one thing this leaves out. The three protection
   prayers are not a *block* against the breath; Protect from Magic is a
   **ceiling** on it, like every shield (see `dragonfireMax`), so the breath
   arrives already expressed in damage and must not be zeroed by the prayer that
   softened it. */
function dragonfire(npc) {
  playCastAnim(npc, "attack");
  const dist = Math.hypot(npcDrawCX(npc) - G.player.x, npcDrawCZ(npc) - G.player.z);
  Gfx.projectile({
    gfx: 1,
    fromX: npcDrawCX(npc), fromZ: npcDrawCZ(npc), fromH: bodyHeight(CENTRE_HEIGHT, npc),
    target: G.player, toX: G.player.x, toZ: G.player.z, toH: bodyHeight(CENTRE_HEIGHT, G.player),
    duration: flightSeconds(dist),
    hidden: !MISSILE_IN_FLIGHT,
    onArrive: (at) => {
      if (npc.dead) return;
      const px = at && at.x != null ? at.x : G.player.x;
      const pz = at && at.z != null ? at.z : G.player.z;
      const p = ps();
      const shield = equippedId(p, "shield");
      /* The dragonfire shield is the anti-dragon shield smithed up - "it retains
         the same dragonfire protection as the anti-dragon shield" - so both sit
         behind the same `s` column of the table. */
      const warded = shield === "anti_dragon_shield" || shield === "dragonfire_shield";
      const prot = {
        shield: warded,
        prayer: prayerProtection(p) === "magic",
        potion: (p.antifire || 0) > 0,
        superPotion: (p.superAntifire || 0) > 0,
      };
      const max = dragonfireMax(npc.type, prot);
      /* Nothing gets through at all: a super antifire potion, or a plain one with
         a second layer behind it. */
      if (!max.burnt && !max.resisted) {
        Fx.hitsplat(G.player, 0);
        chat(prot.superPotion
          ? "Your super antifire potion repels the flames."
          : warded
            ? "Your antifire potion and shield repel the flames."
            : "Your antifire potion and Protect from Magic repel the flames.", "game");
        return;
      }
      /* A creature the table has no row for breathes like a chromatic dragon,
         and `NPC_STATS[type].dragonfire` (50 for every chromatic dragon, 65 for
         the King Black Dragon) is the bare figure the table's unprotected row
         repeats. */
      const won = dragonfireWon(npc);
      const ceiling = won ? max.resisted : max.burnt;
      chat(won ? "You manage to resist some of the dragon fire!"
               : "You're horribly burnt by the dragon fire!", "game");
      npcStrikeHit(npc, "dragonfire", ceiling, Math.floor(Math.random() * (ceiling + 1)));
    },
  });
}

/* Smite: while it is up, a quarter of every point of damage the player deals is
   taken off the victim's prayer as well. This world has no other *player* to
   drain - a creature has no prayer to lose - so the rule is written against the
   field rather than against a type: anything carrying `prayerPoints` loses 1 per
   4 damage. The guardian of a future multiplayer world therefore gets the real
   behaviour from the data, and today it is honestly a no-op (see src/PLAN.md). */
function applySmite(npc, dmg) {
  if (!(dmg > 0)) return;
  if (!activePrayers(ps()).some((p) => p.smite)) return;
  if (npc.prayerPoints == null || npc.prayerPoints <= 0) return;
  npc.prayerPoints = Math.max(0, npc.prayerPoints - Math.floor(dmg / 4));
}

/* The blow a *missile* thrower has committed to, decided on the tick it is
   thrown rather than on the tick the missile lands.

   This is the rule the whole of prayer flicking is built on. The OSRS Wiki, on
   protection prayers and flicking: *"If flicking a protection prayer, this is
   the tick your enemy attacks (which is typically when their attack animation
   begins, **not necessarily the tick in which you take damage**)"* - and, on
   the exceptions, *"there are some exceptions to the rule of protection prayer
   having to be active on the first tick of the attack: for example, many of
   TzTok-Jad, The Nightmare, and Verzik Vitur's attacks are calculated shortly
   after the start of their attack animation ... and similarly many of Scurrius
   and The Leviathan's attacks are only calculated when their projectiles reach
   the player."* So the **rule is the attacker's own tick** and the
   arrival-tick reading is a handful of named bosses' exception - and this world
   has none of those bosses, while it does have Karil, the wizards, Prime and
   Ahrim, all of whom throw a missile on one tick and land it several later.

   Reading the protection when the missile *lands* (which is what this file did)
   silently asks the player to hold a prayer for the whole flight instead of for
   the tick the creature attacked, and that is exactly what breaks a
   protection flick: a player who raises Protect from Magic on the wizard's cast
   and drops it again a tick later is protected in the live game and was *hit*
   here. Deciding the whole blow here - the accuracy roll against the defence
   the player has at this instant, prayer boosts included (`playerDefence`), and
   which protection is up (`prayerProtection`) - puts the flick back where the
   wiki puts it. The projectile still lands on the player and still draws its
   burst: only the decision has moved, and `npcStrikeHit` is handed the answer
   (`ctx`) so it does not make it a second time.

   `style` is spelled exactly as `prayerProtection` spells the three protections,
   and `max` is the attack's own published maximum where it has one of its own
   (a caster's `spec.max`), or the creature's ordinary max hit. */
function commitStrike(npc, style, max) {
  return {
    dmg: resolveHit(npcAccuracy(npc), playerDefence(npc), max != null ? max : npcMaxHit(npc)),
    blocked: prayerProtection(ps()) === (style || "melee"),
  };
}

/* Returns the damage dealt, so a caller that shows different graphics for a hit
   and a miss can tell them apart. `style` is the incoming attack's own kind -
   "melee" for a swing, "range" for a bolt, "magic" for a wizard's curse - and
   it is spelled exactly as `prayerProtection` spells the three protections,
   because which one blocks the blow depends on what actually landed, not on
   what the victim would like it to be (see src/magic.js#NPC_CAST).

   `forced` is damage handed over ready-made by the one attack that cannot miss:
   a dragon's breath has already made its accuracy roll, and that roll chose
   between two published maximums rather than between a hit and a miss (see
   `dragonfire`). Everything below - the Vengeance and recoil reflections, the
   hitsplat, the hitpoints - is the same either way.

   `ctx` is the blow a missile thrower already decided on its own tick (see
   `commitStrike`): when it is there, the roll and the protection are both taken
   from it rather than made again at the landing - which is what lets a
   protection prayer be held for the attack tick alone. A swing carries none (it
   strikes and lands on the same tick) and a dragon's breath carries none (the
   protection is a ceiling on it rather than a block - see `dragonfire`). */
export function npcStrikeHit(npc, style, maxOverride, forced, ctx) {
  let dmg = forced != null
    ? forced
    : ctx
      ? ctx.dmg
      : resolveHit(npcAccuracy(npc), playerDefence(npc), maxOverride != null ? maxOverride : npcMaxHit(npc));
  /* The right Protect blocks the blow outright. In the live game the overhead
     protections are 100% against a *monster* because the monster's attack is
     rolled to hit or miss before the prayer is consulted, and a PvM miss is a
     miss - the halving that the older revisions of this file applied (and that
     the wiki describes) belongs to **PvP**, where the same protection is worth
     half. There are no other players to fight here yet, so the default is the
     PvM one, as the user asked: *"protect from missles and melee and mage those
     are all 100% protection by the way, the only time it is halved is in pvp
     situations, so dont worry about that for now, just make it 100% protection
     by default"*. A blocked blow is damage 0, which every caller already
     understands - it is the same shape as a miss, and the hitsplat that follows
     is the client's own blue zero. */
  const blocked = ctx ? ctx.blocked : prayerProtection(ps()) === (style || "melee");
  if (dmg > 0 && blocked) dmg = 0;
  /* Vengeance (Lunar): the next damaging attack that lands on the caster is
     also dealt to the creature that made it, for three quarters of the damage.
     It is spent by the hit, whether or not the reflection kills. */
  if (dmg > 0 && ps().vengeance) {
    ps().vengeance = false;
    const back = Math.floor(dmg * 0.75);
    if (back > 0 && !npc.dead) {
      chat("Your Vengeance spell reflects " + back + " damage back at the " + npc.type + ".", "game");
      Fx.hitsplat(npc, back);
      npc.hp -= back;
      npc.hitFlash = 0.3;
      if (npc.hp <= 0) killNpc(npc);
    }
  }
  /* Ring of recoil: a tenth of whatever lands on you is dealt straight back to
     the creature that hit you, and the ring spends one of its forty charges
     doing it (see `spendRingCharge` above). The reflection can kill. It sits
     beside Vengeance because the two are the same idea at different strengths -
     10% for free while the ring lasts, 75% for one hit under the spell. */
  if (dmg > 0 && equippedId(ps(), "ring") === "ring_of_recoil") {
    const back = Math.floor(dmg * 0.1);
    spendRingCharge(ps());
    if (back > 0 && !npc.dead) {
      chat("Your ring of recoil reflects " + back + " damage back at the " + npc.type + ".", "game");
      Fx.hitsplat(npc, back);
      npc.hp -= back;
      npc.hitFlash = 0.3;
      if (npc.hp <= 0) killNpc(npc);
    }
  }
  Fx.hitsplat(G.player, dmg);
  /* ...and the same splat goes out to the neighbours, on the player's own body
     rather than a tile: a blow that lands on *you* is the one part of your
     fight that only you would otherwise see (src/net.js#netCombat). The style
     rides in `b` (0 melee, 1 range, 2 magic) and the shield's answer in `c`
     (the hitsplat, when a magic blow lit the ring shields - else 0), and `ix`
     names the attacker, so the watchers swing the body that swung, light the
     ghost's shield, and never punch for a cast (see
     src/game.js#ghostCombat). */
  const styleIx = style === "magic" ? 2 : style === "range" ? 1 : 0;
  const shWorn = equippedId(ps(), "shield");
  const shieldDmg = dmg > 0 && style === "magic" && (shWorn === "mind_shield" || shWorn === "elemental_shield") ? dmg : 0;
  netCombat(2, dmg, styleIx, shieldDmg, npc.spawnIx);
  if (dmg > 0) {
    ps().hp = Math.max(0, ps().hp - dmg);
    ps().hpRegen = 0;
    maybeBlockPlayer(dmg);
    G.player.hitFlash = 0.3;
    /* The ring shields' answer to magic: a blow of the "magic" style that
       lands for damage lights the shield's inner disc for one short flash
       (src/models3d.js, 0.3s like the red one above), harder hits lighting
       more of the face. Only a hit does it - a splash, or a zero the prayers
       blocked, leaves the shield dark. `shieldDmg` above is this same answer,
       computed for the neighbours' copy of it. */
    if (shieldDmg > 0) { G.player.shieldFlash = 0.3; G.player.shieldFlashDmg = dmg; }
    /* Nothing is written to the chatbox for a blow that lands on you - the
       hitsplat over your head and the red flash are the whole of the client's
       answer, exactly as they are for a miss (see the note a few lines below).
       A line reading "The <creature> hits you for <damage>." used to be printed
       here; it was removed permanently by the user's ask of 2026-09-23. */
    /* Ring of life: a hit that leaves the wearer at or under a tenth of their
       hitpoints teleports them out instead of letting them die, and the ring is
       consumed doing it. It is checked *before* Redemption because the two fire
       on the same condition and the escape is the stronger of the two effects;
       the live game's own ring of life "will teleport the player to their
       respawn point when they are below 10% of their hitpoints, and is
       destroyed". The destination is this world's respawn point - the same tile
       src/combat.js#playerDeath sends a corpse to. */
    if (ps().hp > 0 && ps().hp <= ps().maxHp * 0.1 && equippedId(ps(), "ring") === "ring_of_life") {
      ps().equip.ring = null;
      G.player.path.length = 0;
      npc.target = null;
      npc.aggroed = null;
      Combat.target = null;
      placeEntity(G.player, 62.5, 57.5, G.player.dir, 0);
      chat("Your ring of life teleports you to your respawn point.", "game");
      chat("Your ring of life crumbles to dust.", "game");
      mark("equip", "inv");
      return dmg;
    }
    /* Redemption: a hit that leaves you under a tenth of your hitpoints burns
       the prayer out healing you for a quarter of your Prayer level. It fires
       at most once per activation - it turns itself off as it heals, which is
       the live game's own rule ("when this prayer is activated, it will heal
       the player... and then deactivate"). Only a hit that does not kill you
       can trigger it: a lethal blow is not healed back from. */
    if (ps().hp > 0 && ps().hp < ps().maxHp * 0.1 && activePrayers(ps()).some((p) => p.redemption)) {
      const heal = Math.max(1, Math.floor(ps().skills.prayer.level / 4));
      ps().prayers = (ps().prayers || []).filter((n) => n.toLowerCase() !== "redemption");
      ps().prayerPoints = 0;
      ps().hp = Math.min(ps().maxHp, ps().hp + heal);
      chat("Your Redemption prayer heals you for " + heal + " hitpoints.", "game");
      mark("skills", "prayer");
    }
    if (ps().hp <= 0) playerDeath(npc);
    /* The creature's own poison, if its stats row carries one - a hit that
       lands is what delivers it (src/combat.js#inflictPoison). */
    else inflictPoison(npc);
  } else {
    maybeBlockPlayer(0);
  }
  /* A miss is deliberately silent. The live client prints no chat line when a
     creature fails to hit you - the "0" hitsplat is the whole of the feedback -
     and the line this world used to print ("The goblin misses you.") put one in
     the chatbox per swing the instant anything was on you, which is what the
     user asked to be rid of, permanently. The miss is not lost by taking the
     line out: `Fx.hitsplat` on the line above still shows the "0", and the
     auto-retaliate sweep below still turns you around and answers, because it
     is the attack, not the damage, that does that. */
  /* Auto retaliate: the combat style panel's own toggle, which the client
     starts with on, and whose tooltip promises "when active your player will
     automatically fight back if attacked". Being struck is therefore what picks
     the attacker as the player's target, exactly as in the client, where a hit
     turns you around to face whatever hit you - including a miss, since it is
     the attack, not the damage, that does it. It happens *after* the damage, so
     the killing blow of a fight you were losing is not answered from the
     grave, and it cancels whatever the player was doing the way auto retaliate
     interrupting a fishing spot does (attackNpc clears `Actions.act`). The
     attempt is silenced so a style that cannot actually swing - a cast style
     with no runes, a bow with no arrows - does not repeat its refusal into the
     chatbox on every blow. */
  if (UI.autoRetaliate && !Combat.target && ps().hp > 0) {
    quietAttack = true;
    attackNpc(npc);
    quietAttack = false;
  }
  return dmg;
}

/* How long the body lies on the death tile before the respawn. The fall
   itself is the original human death (cache 836 - see graftPlayerDeath); this
   is the pause on the ground after it lands, the live game's own beat before
   you show up at respawn. */
const DEATH_HOLD = 1.0;
/* Backstop: the respawn never waits longer than this even if the fall never
   reports itself landed (a model rebuilt mid-death, a hidden tab's clock). */
const DEATH_MAX = 5;

/* The original human death (cache 836) for the player rig: copied from the
   first loaded Human-model NPC and compiled exactly the way src/models3d.js
   #compileAnims compiles it there, so the engine's own death path plays the
   real fall instead of the procedural topple. A no-op once grafted (or when
   no Human model is loaded yet - the topple covers that death instead). */
function graftPlayerDeath() {
  try {
    const ch = G.player && G.player.ch;
    const anims = ch && ch.data && ch.data._anims;
    if (!anims || anims.death) return anims ? anims.death : null;
    const donor = prepareModel("banker") || prepareModel("man") || prepareModel("woman") || prepareModel("guard");
    const raw = donor && donor.anims && donor.anims.death;
    if (!raw || !raw.frames || !raw.frames.length || !raw.fm || !raw.fm.types) return null;
    const stand = anims.stand;
    if (!stand || !stand.fm || stand.fm.types.length !== raw.fm.types.length) return null;
    const lengths = raw.lengths && raw.lengths.length === raw.frames.length ? raw.lengths : raw.frames.map(() => 4);
    anims.death = {
      frames: raw.frames,
      fm: raw.fm,
      lengths,
      totalTicks: lengths.reduce((s, v) => s + v, 0),
      tickOffsets: lengths.reduce((acc, v) => { acc.push((acc[acc.length - 1] || 0) + v); return acc; }, []),
    };
    return anims.death;
  } catch (err) { return null; }
}

export function playerDeath(killer) {
  const p = ps();
  const pl = G.player;
  /* Already falling: every damage site funnels here once hp hits 0, so blows
     landing on the corpse must not restart the sequence. */
  if (pl.dying) return;
  /* A death voids any minigame run in progress - no time, no board. The run's
     bodies leave with the void (src/minigame.js). */
  voidRun();
  /* The original human death lives on the Human-model NPCs (cache 836, baked
     on every banker/guard/man) but never on the player rig - whose framemap is
     byte-identical, so the sequence poses the player exactly. It is grafted
     onto the player's own anims here, where a rebuild simply grafts again. */
  graftPlayerDeath();
  if (p.stats) p.stats.deaths = (p.stats.deaths || 0) + 1;
  chat("Oh dear, you are dead!", "warn");
  /* ...and the world is told, so every other player's chatbox gets the notice
     too (src/net.js#netDeath, which picks the line and prints it here first). */
  netDeath();
  /* Retribution: everything standing within a tile of where you fall takes a
     hit for up to a quarter of your Prayer level. It fires while you are still
     on the death tile - before the loot is scattered and before the prayers
     are cleared - so the creature that killed you can be caught by it. */
  if (activePrayers(p).some((x) => x.retribution)) {
    const max = Math.max(1, Math.floor(p.skills.prayer.level / 4));
    const px = Math.floor(G.player.x), pz = Math.floor(G.player.z);
    let hitAny = false;
    for (const npc of G.npcs) {
      if (npc.dead || npc.hp <= 0) continue;
      if (Math.max(Math.abs(Math.floor(npc.x) - px), Math.abs(Math.floor(npc.z) - pz)) > 1) continue;
      const d = 1 + Math.floor(Math.random() * max);
      Fx.hitsplat(npc, d);
      npc.hp -= d;
      npc.hitFlash = 0.3;
      if (npc.hp <= 0) killNpc(npc);
      hitAny = true;
    }
    if (hitAny) chat("Your Retribution prayer blasts the creatures around you for up to " + max + ".", "game");
  }
  const t = tileOf(G.player);
  /* The keep rule itself lives in src/player.js#keptOnDeath, because the
     equipment tab's "Items Kept on Death" window shows the same answer before
     you die and the two must not be able to disagree. Protect Item is read
     inside it, *before* the prayers are cleared a few lines down - it protects
     one extra item ("protects one extra item") and dying empties the book
     either way. */
  const { entries, keep, lost, keepCount } = keptOnDeath(p);
  for (const e of lost) {
    spawnGround(e.id, e.qty, t.x, t.z, { owner: p.name });
    if (e.kind === "inv") p.inv[e.slot] = null;
    else p.equip[e.eq] = null;
  }
  if (entries.length > keep.length) {
    chat("You keep your " + (keepCount === 4 ? "four" : "three") + " most valuable items.", "game");
  }
  /* Hitpoints stay at 0 and energy spent until the respawn - see
     finishPlayerDeath. Dying empties the prayer book and the points, exactly
     like the live game. */
  clearPrayers(p);
  p.prayerPoints = 0;
  /* and it ends every spell buff the book is holding up */
  p.vengeance = false;
  p.vengeanceCd = 0;
  p.dream = false;
  p.imbueTicks = 0;
  /* not `teleblockTicks`: the live spell's five minutes run on either side of a
     death, so dying is not a way out of one (src/player.js#createPlayerState) */
  /* Death ends the herblore statuses too: you respawn unpoisoned, and any
     immunity or dragonfire protection you were carrying is gone (it is the
     same "a logout ends them" clear the save does - src/save.js#applyState). */
  p.poison = null;
  p.poisonImmune = 0;
  p.antifire = 0;
  p.antifireWarned = false;
  /* Everything lets go of the corpse, and the aggression gate keeps anything
     from picking it back up while it lies there. */
  for (const npc of G.npcs) {
    if (npc.target === pl) npc.target = null;
    if (npc.aggroed === pl) npc.aggroed = null;
  }
  Combat.target = null;
  /* The body stops where it falls: no last step slides out, no swing finishes,
     no spell keeps gathering, no skilling action runs on, no follow continues. */
  pl.path.length = 0;
  pl.moving = false;
  pl.stepPts = null;
  pl.actionAnim = 0;
  pl.emoteAnim = null;
  pl.emoteLeft = 0;
  pl.castAnim = null;
  pl.castLeft = 0;
  Actions.act = null;
  stopFollowing();
  /* Hitpoints stay at 0 and the body stays on the death tile until the fall
     has played out - the respawn is finishPlayerDeath, on the tick below. */
  pl.dying = true;
  pl.deadT = 0;
  pl.deadHold = 0;
  mark("inv", "equip", "skills");
}

/* The second half of dying: the fall has played out, so the body simply shows
   up at the respawn point - with a snapped camera, never a pan across the map. */
function finishPlayerDeath() {
  const p = ps();
  const pl = G.player;
  pl.dying = false;
  pl.deadT = 0;
  pl.deadHold = 0;
  p.hp = p.maxHp;
  p.runEnergy = RUN_UNITS;
  /* Death sends the body to the respawn point on the ground, upstairs or not. */
  placeEntity(pl, 62.5, 57.5, pl.dir, 0);
  if (G.cameraTarget) { G.cameraTarget.x = pl.x; G.cameraTarget.z = pl.z; }
  if (pl.ch && pl.ch.resetAnim) pl.ch.resetAnim();
  mark("skills");
}

/* ------------------------------------------------- thieving's two hooks

   A failed pickpocket deals a *fixed* blow - the target's published stun damage
   (src/items.js#PICKPOCKET), not a rolled hit - so it cannot go through
   `npcStrikeHit` (which rolls accuracy against the player's defence and would
   sometimes miss). Everything after the roll is the same, though, and it is
   kept the same on purpose: the hitsplat, the red flash, the ring of life,
   Redemption, and death all behave here exactly as they do for an ordinary
   strike. Protection prayers are deliberately NOT applied - the live game's
   prayers guard against an attack, and a pickpocket that noticed you is not
   one. */
function stunPlayer(dmg, npc) {
  const p = ps();
  Fx.hitsplat(G.player, dmg);
  p.hp = Math.max(0, p.hp - dmg);
  p.hpRegen = 0;
  G.player.hitFlash = 0.3;
  /* No chatbox line for the blow itself, for the same reason npcStrikeHit
     prints none (see its note): the hitsplat is the whole of the feedback. */
  if (p.hp <= 0) playerDeath(npc);
}

/* The market's own alarm: robbing a stall inside a guard's sight brings the
   guards down on the thief. The published rule is that stealing from a stall is
   a certainty *only* while no owner or nearby guard can see you do it ("if you
   are, the stall owner will call over a guard who will begin to attack you"),
   and this is that sentence. This world's guards stand at either end of the
   market square's aisle (src/world.js), so every stall in the square is in one
   of their sights and a raid has to be timed. The
   guard gets `aggroed` as well as `target`, so the leash and the give-up rules
   in updateNpcs treat it exactly like ordinary aggression - it will chase the
   thief out of the market and then turn for home. */
const GUARD_SIGHT = 5;
function callMarketGuards(x, z) {
  let called = 0;
  for (const npc of G.npcs) {
    if (npc.dead || npc.type !== "guard") continue;
    if (chebyshev(tileOf(npc), { x, z }) > GUARD_SIGHT) continue;
    npc.target = G.player;
    npc.aggroed = G.player;
    called++;
  }
  if (called) chat("The stall owner calls for the guards!", "warn");
}

/* --------------------------------------------------------------- tick */

/* Creatures whose whole fight is run by a module of its own instead of by the
   loop below. It is one table and one `continue`, and it exists for the one
   body in the world that is not a creature of the bestiary at all: **Saradomin**
   (src/saradomin.js), who stands still and throws his own spell in every
   direction rather than chasing and swinging.

   The `continue` is deliberately after the loop's bookkeeping (the hit flash,
   the poison, the drains) and immediately before its aggression block, so the
   god is *released from the ordinary AI* rather than from the world: his
   hitpoints fall, his hitsplat shows, a curse on him runs out as it would on
   anything else - but this loop never hands him a target, never walks him and
   never swings for him. `npc.target`/`npc.aggroed` are cleared with it, because
   `landStrike` sets both on the creature when a *player* hits it (that is how
   every ordinary creature is provoked); the god has no answer to being hit at
   all (src/saradomin.js's header, point 4), and without this clear the ordinary
   loop would take the target straight back and turn him into a melee creature on
   the next tick.

   His **assailants** are the same idea done with a spawn flag rather than a
   type: a creature whose spawn carries `godFoe` (src/game.js#createNpc) fights
   the god and never the player, so it is stepped over here too (the `godFoe`
   branch in the loop below) and lives on the god's own clock instead
   (src/saradomin.js#tickGodFoe). */
const NPC_MODULE_AI = { saradomin: true, iban: true };

export function tickCombat(game, dt) {
  G = game;
  const p = game.ps;
  const pl = game.player;
  if (pl.hitFlash) pl.hitFlash = Math.max(0, pl.hitFlash - dt);
  if (pl.shieldFlash) pl.shieldFlash = Math.max(0, pl.shieldFlash - dt);
  if (!pl.shieldFlash) pl.shieldFlashDmg = 0;

  if (p.hp <= 0 && !Combat.deadHandled) playerDeath(null);
  Combat.deadHandled = p.hp <= 0;
  /* The fall plays out on the death tile; the respawn waits for the body to
     land (the model's own fallDone) plus the hold - or the backstop. */
  if (pl.dying) {
    pl.deadT = (pl.deadT || 0) + dt;
    if (pl.ch && pl.ch.fallDone) pl.deadHold = (pl.deadHold || 0) + dt;
    if ((pl.deadHold || 0) >= DEATH_HOLD || pl.deadT >= DEATH_MAX) finishPlayerDeath();
  }

  p.hpRegen = (p.hpRegen || 0) + dt;
  /* Dream (Lunar): you sleep off your wounds at three times the natural rate
     until you are whole again or you take a step, which is the spell's own
     rule ("the caster will stay in this state until they move or reach full
     health"). */
  if (p.dream && (p.hp >= p.maxHp || (pl.path && pl.path.length))) {
    p.dream = false;
    if (p.hp >= p.maxHp) chat("You wake from your dream.", "game");
  }
  /* The one piece of worn equipment that changes the rate: the regen bracelet
     doubles natural healing, and stacks with Rapid Heal (src/prayer.js). */
  const regenAt = hpRegenInterval(p, equippedId(p, "hands") === "regen_bracelet");
  if (p.hp < p.maxHp && p.hp > 0 && p.hpRegen >= regenAt) {
    p.hpRegen -= regenAt;
    p.hp += 1;
    mark("skills");
  }

  /* The herblore statuses: a poison dealing damage (and ending by itself),
     an antidote's immunity, and the antifire potion's protection. All three
     are in seconds and all three run on every tick, in or out of combat, since
     a poison does not wait for a fight to resume and a potion does not pause
     when you walk away. */
  /* Logged out (main.js#leaveWorld): the character is not in the world, so
     nothing may chew on it unseen - poison pauses and prayers hold, while
     natural healing above keeps running. */
  if (!pl.authHid) playerPoisonTick(p);
  const secs = dt;
  if (p.poisonImmune > 0) {
    p.poisonImmune -= secs;
    if (p.poisonImmune <= 0) { p.poisonImmune = 0; chat("Your resistance to poison has worn off.", "game"); }
  }
  if (p.antifire > 0) {
    p.antifire -= secs;
    /* the client warns a quarter of a minute before it lapses: "Your antifire
       potion is about to expire." */
    if (p.antifire <= 15 && !p.antifireWarned) {
      p.antifireWarned = true;
      chat("Your antifire potion is about to expire.", "warn");
    }
    if (p.antifire <= 0) { p.antifire = 0; p.antifireWarned = false; chat("Your antifire potion has expired.", "game"); }
  }

  /* Prayers drain while they are up, and refill the book once they are down -
     but not while logged out (see the poison note above): they hold. */
  if (!pl.authHid && tickPrayer(p, dt, (totalBonus(p) || {}).pray || 0) === "out") {
    chat("You have run out of prayer points; you must recharge at an altar.", "warn");
    mark("prayer");
  }

  /* Charge is a buff on the player, drained on the game tick like a prayer. */
  if (p.chargeTicks > 0) {
    p.chargeTicks -= 1;
    if (p.chargeTicks === 0) chat("Your Charge spell wears off.", "game");
  }
  /* Magic Imbue (Lunar): the same kind of buff - it lets a combination rune be
     made without the talisman, and simply runs out. */
  if (p.imbueTicks > 0) {
    p.imbueTicks -= 1;
    if (p.imbueTicks === 0) chat("Your Magic Imbue spell wears off.", "game");
  }
  /* Vengeance's cooldown, which runs from the cast rather than from the effect
     (see src/actions.js#VENGEANCE_CD_TICKS). It is silent - nothing wears off
     and nothing is announced; the spell simply becomes castable again. */
  if (p.vengeanceCd > 0) p.vengeanceCd -= 1;
  /* Tele Block, which is the one debuff another player puts on this one. It is
     the player's own timer running down rather than anything the caster's client
     does, so the block lifts even if the caster has long since logged out. */
  if (p.teleblockTicks > 0) {
    p.teleblockTicks -= 1;
    if (p.teleblockTicks === 0) chat("Your teleport block has worn off.", "game");
  }

  /* The spellbook's cast timer, one tick at a time - see
     src/magic.js#Cast. It is drained here with the other tick-length effects,
     so a cast rate is a number of ticks and not a stopwatch. */
  if (Cast.cd > 0) Cast.cd -= 1;

  /* The weapon's recovery runs down on the game tick whether or not there is
     anything to hit. It used to be decremented inside the "in reach of the
     target" branch, so it simply *froze* at whatever was left when a fight
     ended - a killing blow leaves a full `attackSpeed` on the timer, the next
     tick drops the dead target, and the cancelled decrement left those three or
     four ticks sitting there for good. The next creature clicked then stood
     untouched for the whole of that stale recovery before the first swing (up
     to 2.4s after a kill, and again after every walk, since the timer is not
     decremented while chasing either), which reads as input that arrives late.
     Recovery is time passing, not target state: in the real game the delay
     between two attacks is the weapon's speed measured from the *previous*
     attack, so it keeps running while you pick a new victim and while you walk
     to it, and the click itself only starts it when nothing is running (see
     src/combat.js#attackNpc). */
  if (Combat.timer > 0) Combat.timer -= 1;

  /* The special-attack bar refills on the game tick (10% every 30s), and any
     temporary stat change - a potion, Rampage's drain, Excalibur's Defence -
     loses a level a minute until it is gone. Both are the player's, not the
     world's, so they run whether or not anything is being fought. */
  tickSpecialEnergy(p, dt);
  tickBoosts(p, dt);
  /* A lit special bar belongs to the weapon it was lit for: stowing that weapon
     puts it out (as the live client does). */
  if (UI.specOn) {
    const lw = weaponOf(p);
    if (!lw || !lw.spec) { UI.specOn = false; mark("combat"); }
  }

  const tgt = Combat.target;
  if (tgt) {
    if (tgt.dead) {
      Combat.target = null;
    } else {
      /* Face the victim for the whole fight - the walk-in included, so the
         turn starts on the click and holds round every obstacle (the user's
         rule, 2026-10-09). stepSim aims this before the steps and re-aims
         after, so the body strafes toward the target looking at it; the
         setter clears it the moment the fight ends. */
      pl.faceEnt = tgt;
      const style = currentStyle();
      /* A blade also needs a clear face, not just reach (see meleeWalled):
         walled off, the attacker chases round instead of swinging. A bow or
         a spell needs a line (see sightBlocked): blind, the attacker closes
         instead of shooting. */
      if (reachTo(pl, tgt, style) > attackRange(style) || (isMeleeStyle(style) && meleeWalled(pl, tgt)) || (!isMeleeStyle(style) && sightBlocked(pl, tgt))) {
        /* -------------------------------------------------- chasing a mover
           The route is planned to the *ring around* the victim rather than to
           its own tile (src/game.js#walkTo's `adjacent`), because which side the
           attacker walks in from has to come out of the search: aiming at one
           pre-chosen neighbour - the nearest free tile to the victim, which is
           always the north one, because that is the first the ring scan finds -
           sent a character standing one step south of its target the whole way
           around to its north face, and left it standing still for good the
           moment that one side was fenced off, unable to attack an adjacent
           creature it could plainly see.

           The ring, though, is only ever a goal set *as of the tile it was
           planned for*, so it has to be re-planned when the victim leaves that
           tile - and the gate on that re-plan used to be `!pl.moving`, i.e.
           "wait until the attacker has stopped". Against a stationary creature
           the two are the same thing. Against a wandering one they are not, and
           the user hit exactly that (2026-09-22: *"i literally had to chase down
           a chicken for several attempts before actually attacking it... the
           player will arrive at the tile, check to see if the npc is on the
           same tile, and if it's not, it looks for it again and moves to the
           new tile"*): the click planned a route to the ring around the tile the
           chicken stood on *then*, the attacker walked it, arrived beside a tile
           the chicken had since left - out of reach, and standing still - and
           only that full stop allowed the next leg to be planned. Every hop of
           the chicken bought it another stop, so the fight could not begin.

           So the chase keeps the victim's tile (`Combat.chaseTile`) and re-plans
           the moment it changes, mid-route if need be - the same rule, and the
           same one-string-per-tick cost, as `tickFollow` (src/game.js), which is
           why two characters running in a line move as a pair. A re-plan that
           finds the victim within reach does nothing but fall to the branch
           below, which swings: that is the "attack it while it is moving" half -
           the attacker meets the creature on the tick it steps into range
           instead of stopping first and striking a tick later. */
        const key = Math.floor(tgt.x) + "," + Math.floor(tgt.z);
        if (Combat.chaseTile !== key) {
          Combat.chaseTile = key;
          Combat.chaseTimer = 1;
          if (!chaseTarget(pl, tgt, style)) {
            /* No route to any tile beside it exists at all. The client refuses
               the target in that case ("I can't reach that!") rather than
               holding one it can never act on - and the refusal ends the fight,
               so the message can never repeat tick after tick. `Combat.target`'s
               setter clears `chaseTile` with it. */
            Combat.target = null;
            chat("I can't reach that!", "warn");
          }
        } else if (!pl.moving && !pl.path.length) {
          /* The victim has not moved, so there is nothing new to plan *to* - but
             the attacker is standing still with no route and still out of reach,
             which means the last walk ended short of its goal (a shut door, a
             route the world closed under it). Retry, throttled to the tick rate
             as before, so a genuinely stuck chase keeps looking rather than
             sitting mute - and a retry that cannot find any route at all refuses
             the target exactly as the first attempt would. */
          Combat.chaseTimer -= 1;
          if (Combat.chaseTimer <= 0) {
            Combat.chaseTimer = 1;
            if (!chaseTarget(pl, tgt, style)) {
              Combat.target = null;
              chat("I can't reach that!", "warn");
            }
          }
        }
      } else {
        Combat.chaseTile = null;
        /* Under the victim - or, for a big one, standing on its ground: a MELEE
           attacker steps out to a side tile (ranged/magic just shoots from
           underneath - see chaseTarget). The step-out is planned once and then
           walked to completion - re-planned only when the route is spent - so
           a step is always finalized before the next try and the walk never
           restarts mid-tile. Anything else in reach stops dead. */
        const under = reachTo(pl, tgt, style) === 0 && (isMeleeStyle(style) || !(tgt.foot > 1));
        if (under) {
          if (!pl.faceEnt || !pl.path.length) stepOutFromUnder(pl, tgt, style);
        } else pl.path.length = 0;
        pl.dir = Math.atan2(npcDrawCX(tgt) - pl.x, npcDrawCZ(tgt) - pl.z);
        if (Combat.pending && Combat.pending.tgt === tgt) Combat.pending = null;
        if (Combat.timer <= 0) swingNow(tgt, style);
      }
    }
  }
  /* A committed swing (see attackNpc): the click landed mid-recovery and a
     later click may since have cleared the target - stepping in place must
     not cancel what it cannot outrun. It fires here, at its natural time,
     exactly once: still in reach and alive it lands, otherwise it fizzles
     (running clear still escapes it). */
  if (Combat.pending && Combat.timer <= 0) {
    const pend = Combat.pending;
    Combat.pending = null;
    const pt = pend.tgt;
    if (!pt.dead
      && reachTo(pl, pt, pend.style) <= attackRange(pend.style)
      && !(isMeleeStyle(pend.style) && meleeWalled(pl, pt))
      && !(!isMeleeStyle(pend.style) && sightBlocked(pl, pt)))
      swingNow(pt, pend.style);
  }

  for (const npc of game.npcs) {
    npc.hitFlash = Math.max(0, (npc.hitFlash || 0) - dt);
    /* The flinch fuse (see landStrike/damageNpc): captured before it ticks so
       a bar-down victim is held for the landing tick plus one more, while a
       bar-up victim (zero) answers at once - and ticked unconditionally,
       unlike `retal`, which freezes while `barTicks` run, so a victim taking
       continuous hits still answers between blows instead of standing mute. */
    const flinched = (npc.flinch > 0);
    if (npc.flinch > 0) npc.flinch -= 1;
    if (npc.barTicks > 0) {
      npc.barTicks -= 1;
      if (npc.barTicks <= 0 && !npc.dead) npc.retal = Math.floor((NPC_ATTACK_SPEED[npc.type] || 4) / 2);
    } else if (npc.retal > 0) {
      npc.retal -= 1;
      if (npc.retal <= 0) npc.retalEnded = true;
    } else if (npc.calm > 0) {
      npc.calm -= 1;
    }
    /* Curses wear off, and a bound creature is released, on the game tick. */
    if (npc.boundTicks > 0) npc.boundTicks -= 1;
    if (!npc.dead) poisonTick(npc);
    if (npc.drains) {
      for (const k of Object.keys(npc.drains)) {
        npc.drains[k].ticks -= 1;
        if (npc.drains[k].ticks <= 0) delete npc.drains[k];
      }
    }
    if (npc.dead) continue;
    /* A creature whose fight a module owns is left alone from here on - see the
       note on NPC_MODULE_AI above the function. Everything above this line has
       already run for it. */
    if (NPC_MODULE_AI[npc.type]) {
      npc.target = null;
      npc.aggroed = null;
      continue;
    }
    /* One of the god's assailants (src/saradomin.js's header): its fight is
       with Saradomin and nothing else, so the whole of the block below - the
       leash, the player's own aggression range, the strike at the player - is
       not its business. It is stepped over like the god himself, and its target
       (the god) is written by src/saradomin.js#tickGodFoe on the same tick.
       Everything above this line has already run for it: it still shows a
       hitsplat, still takes poison, still runs its curse timers out. */
    if (npc.godFoe || npc.ibanFoe) continue;
    const aggro = AGGRO[npc.type];
    /* A leash, anchored to the creature's own home tile exactly as the live
       game's aggression is. A creature that has chased a runner clear of its
       territory gives up and walks back, so a boss dragged out of its lair
       cannot stay out: `aggroed` never expires on its own, and without this a
       King Black Dragon would follow a player into Lumbridge and camp the town
       square for good. The leash is the creature's own aggression range plus six
       tiles, so an ordinary fight - even one you win by stepping back a few
       tiles to eat - is never interrupted, and a creature that has no business
       being aggressive at all keeps its plain eight-tile limit.

       It is a gate on the whole block and not just a clear, because clearing
       alone is not enough: the re-acquire test below asks only whether the
       creature has no target and the player is inside its range, so it would
       hand the target straight back on the same tick and the creature would
       never actually turn for home. While leashed, the creature does nothing but
       wander - and its wander anchor is its home tile, so it walks back
       (`pickWanderTarget`, src/game.js). */
    /* A player hidden in a crate is not there to be seen (src/actions.js#
       hideInCrate): no creature picks them up, and one already fighting them
       loses the target, the grudge and the route it was chasing along. That is
       the whole point of the crates out at the bandits' camp - it is the one way
       out of a fight you cannot win, and it costs you the initiative: anything
       you then do climbs you back out. It has to be a gate on the whole block
       and not a clear, exactly like the leash below: the re-acquire test asks
       only whether the creature has no target, so clearing alone would hand the
       target straight back on the same tick. */
    const hidden = !!pl.hidden;
    /* A player on the other level is not there to be seen: nothing below
       acquires the stairs' climber, and anything fighting them loses the
       target like a hidden one (the chase cannot climb, so keeping it would
       park the creature under the slab forever). */
    const offPlane = (pl.plane || 0) !== (npc.plane || 0);
    const leashed = npc.home && chebyshev(tileOf(npc), { x: npc.home.x, z: npc.home.z }) > (aggro ? aggro.range + 6 : 8);
    /* A dying player is left alone like a hidden one: the corpse is dropped
       and nothing re-acquires it while the fall plays out. */
    if (leashed || hidden || offPlane || pl.dying) {
      npc.target = null;
      npc.aggroed = null;
      npc.lureTimer = 0;
      npc.lureTgt = null;
      npc.calm = 0;
      npc.retalEnded = false;
      /* ...and the path it planned while it *was* chasing is dropped with it.
         Clearing the target alone left a creature walking out the last route it
         had plotted, so a brother whose victim teleported away finished the
         journey anyway and ended up in the town square with nothing to fight -
         then had to walk the whole way home. The leash means "stop and go home",
         and the path is half of the stopping. */
      npc.path.length = 0;
    } else {
      tickTolerance(npc, pl);
      if (aggro && aggro.range > 0 && !npc.target && !(npc.calm > 0) && !npc.tolerant && combatLevel(p.skills) <= aggro.maxLevel) {
        /* The hunt is measured from the static spawn, not the wandering body:
           the aggression range is the max range plus the attack reach (see
           aggroRangeOf), so a caster notices you a step further out than a
           brawler does. */
        const spawnD = npc.home
          ? chebyshev({ x: Math.floor(npc.home.x), z: Math.floor(npc.home.z) }, tileOf(pl))
          : chebyshev(tileOf(npc), tileOf(pl));
        if (spawnD <= aggroRangeOf(npc)) {
          npc.target = pl;
          npc.aggroed = pl;
        }
      }
      if (npc.aggroed === pl && !npc.target && !(npc.calm > 0) && !provokedFromBeyondRange(npc)) npc.target = pl;
      if (npc.target === pl) {
        /* The recovery clock runs through the answer delay, it is not eaten by
           it: every landed blow still holds the next strike back (flinch, then
           the bar, then retal - the 2026-10-09 answer rule), but the clock keeps
           counting underneath, so a creature swung at every few ticks still
           strikes on its own rhythm instead of standing mute while it is hit.
           Freezing the clock here stunlocked anything on a 4-tick weapon: each
           blow re-armed the bar and the half-speed retal, and the clock never
           moved between them, so the knight and the warrior woman threw one
           punch and then never swung again. */
        npc.attackCd = (npc.attackCd || 0) - 1;
        /* How far this creature can land a blow is a property of *how* it
           fights, so it is read off the same tables that decide that: a caster
           reaches the ten tiles a spell does, a shooter the seven a bow does,
           and everything else has to stand beside its victim. Until this table
           existed, every creature in the world - Ahrim with his Fire Wave,
           Karil with his crossbow - had to be touching you before it could
           attack, which is the one thing the Barrows brothers plainly are not. */
        const reach = npcReach(npc);
        /* A melee creature's own distance to its victim is measured to the
           victim's tile from **its own floor**, not from the tile its feet happen
           to be on: a 3x3 demon reaches a player standing beside its body, and
           stopping the chase there is what keeps it from shuffling its anchor
           round until the player is next to that one tile (the user's big-monster
           rule, 2026-09-24 - the same box the player's own blow is measured to,
           src/combat.js#reachTo). A 1x1 creature's floor is its tile, so its
           distance is exactly the old anchor-to-anchor number. A melee blow
           lands from one of the victim's four side tiles and never from a
           diagonal (`reachDistance` above). The give-up radius below stays on
           Chebyshev, because that one is a distance and not a reach. */
        const dFloor = footDistance(Math.floor(pl.x), Math.floor(pl.z), npcFootBox(npc));
        const d = meleeReach(npc.type) ? dFloor.orth : dFloor.cheb;
        const dCheb = dFloor.cheb;
        /* A wide melee body strikes only from the 1-tile ring outside its own
           floor - never from underneath it (the user's rule, 2026-10-01: with
           the victim on its ground the blow waits for the back-out in
           src/game.js#updateNpcs to finish). A 1x1 body sharing its victim's
           tile is unaffected. */
        const underFoot = meleeReach(npc.type) && (npc.foot > 1) && d === 0;
        const inRange = d <= reach;
        if (npc.retalEnded) {
          npc.retalEnded = false;
          if (!inRange) npc.calm = FLINCH_CALM_TICKS;
        }
        if (npc.calm > 0 && inRange) npc.calm = 0;
        if (d <= reach && !underFoot && !(npc.fleeing) && npc.attackCd <= 0 && !(npc.retal > 0) && !(npc.calm > 0) && !flinched && !(meleeReach(npc.type) && meleeWalled(npc, pl)) && (meleeReach(npc.type) || !sightBlocked(npc, pl))) {
          npcStrike(npc);
          npc.attackCd = NPC_ATTACK_SPEED[npc.type] || 4;
        } else if (dCheb > 8) {
          npc.target = null;
          npc.aggroed = null;
          npc.lureTimer = 0;
          npc.lureTgt = null;
          npc.calm = 0;
          npc.retalEnded = false;
        }
      }
    }
  }

  tickEcoFights(game);

  if (Combat.kills !== (p.stats && p.stats.kills)) {
    if (p.stats) p.stats.kills = Combat.kills;
  }
}/* ------------------------------------------------- gulls vs snakes (eco fights)

   The cay's own food chain (user ask 2026-10-31): a gull and a snake within
   two tiles of each other may start a fight, and from there everything is the
   game's own combat - the accuracy/defence/max-hit blow through
   `creatureStrike` (so a kill here is nobody's kill: no player XP, no tally,
   the victim's own drop table still rolling), the generic chase in
   game.js#updateNpcs, the generic low-health flight (both species are in
   FLEE_TYPES, so a losing gull runs from a snake exactly as it runs from the
   player, and a losing snake runs too).

   The trigger re-rolls on every tile change, as asked: each fighter remembers
   its last tile, and stepping onto a new one with the enemy species within
   two tiles rolls ECO_TRIGGER_CHANCE for the *mover* to swing first. The
   victim answers back on the next exchange if it has no other fight - a
   creature already fighting the player never turns aside for a bird.

   Not every fight is to the death. The moment the victim's flight starts, its
   attacker rolls once: pursue (keep the target, the chase continues) or let
   it go (both sides stand down). A pursuer that falls more than ECO_GIVE_UP
   tiles behind gives up the same way, so no snake patrols the island forever
   after a bird. */

const ECO_FIGHTERS = { seagull: "snake", snake: "seagull" };
/* One step in ten starts something. Low enough that the beach is mostly
   peaceful, high enough that a pupil loafing by the point will see one. */
const ECO_TRIGGER_CHANCE = 0.1;
/* Half the flights end there, half are chased. */
const ECO_PURSUE_CHANCE = 0.5;
/* The player's own give-up radius, so an eco chase ends where a player chase
   would (see the dCheb branch above). */
const ECO_GIVE_UP = 8;

function ecoRelease(a, b) {
  if (!a) return;
  a.target = null;
  a.aggroed = null;
  a.ecoFleeTgt = null;
  if (b && b.target === a) { b.target = null; b.aggroed = null; b.ecoFleeTgt = null; }
}

/* The mover's roll: nearest living foe of the other species within two tiles
   becomes the target. Player fights take precedence on both ends - a creature
   with any target never starts one, and a victim with any target never
   answers one. */
function ecoMaybeStart(mover, foeType) {
  if (mover.target || mover.fleeing || Math.random() >= ECO_TRIGGER_CHANCE) return;
  const mtx = Math.floor(mover.x), mtz = Math.floor(mover.z);
  let best = null, bd = 3;
  for (const n of G.npcs) {
    if (!n || n === mover || n.type !== foeType || n.dead || n.corpse) continue;
    if ((n.plane || 0) !== (mover.plane || 0)) continue;
    const d = Math.max(Math.abs(Math.floor(n.x) - mtx), Math.abs(Math.floor(n.z) - mtz));
    if (d <= 2 && d < bd) { bd = d; best = n; }
  }
  if (!best) return;
  mover.target = best;
  mover.aggroed = best;
  /* A beat before the first swing, so the two have a tick to face each other.
     The chase below would close the gap anyway; this is only the rhythm. */
  mover.ecoCd = 2;
}

function tickEcoFights(game) {
  for (const npc of game.npcs) {
    if (!npc || npc.dead || npc.corpse) continue;
    const foeType = ECO_FIGHTERS[npc.type];
    if (!foeType) continue;
    /* The trigger runs on tile changes, so the stored tile is read and written
       here and nowhere else. */
    const tx = Math.floor(npc.x), tz = Math.floor(npc.z);
    if (npc.ecoTx !== tx || npc.ecoTz !== tz) {
      npc.ecoTx = tx; npc.ecoTz = tz;
      ecoMaybeStart(npc, foeType);
    }
    const t = npc.target;
    if (!t || t === game.player || t.dead || t.corpse || ECO_FIGHTERS[t.type] !== npc.type) continue;
    /* The flight verdict, rolled once per flight: pursue or stand down. A
       pursuer falls through to the give-up and the strikes below, so a chase
       that catches its runner still bites - standing down is the `continue`
       after the release, not the verdict itself. */
    if (t.fleeing) {
      if (npc.ecoFleeTgt !== t) {
        npc.ecoFleeTgt = t;
        if (Math.random() >= ECO_PURSUE_CHANCE) { ecoRelease(npc, t); continue; }
      }
    } else if (npc.ecoFleeTgt === t) npc.ecoFleeTgt = null;
    const dCheb = Math.max(Math.abs(Math.floor(t.x) - tx), Math.abs(Math.floor(t.z) - tz));
    if (dCheb > ECO_GIVE_UP) { ecoRelease(npc, t); continue; }
    npc.ecoCd = (npc.ecoCd || 0) - 1;
    /* No strikes while running - the same rule as the player's own block above
       (`!(npc.fleeing)`), since a fleeing snake's teeth are behind it. */
    if (!npc.fleeing && creatureInReach(npc, t) && npc.ecoCd <= 0) {
      creatureStrike(npc, t);
      npc.ecoCd = NPC_ATTACK_SPEED[npc.type] || 4;
      if (!t.dead && !t.corpse && !t.target) { t.target = npc; t.aggroed = npc; }
    }
    if (t.dead || t.corpse) { npc.target = null; npc.aggroed = null; npc.ecoFleeTgt = null; }
  }
}

/* --------------------------------------------------------------- wiring */

export function initCombat(game) {
  G = game;
  /* The combat panel sets the staff's standing spell through here rather than
     reaching into the state itself, so the refusal rules (curses and binds are
     not autocastable) live in one place. */
  UI.actions.setAutocast = (id) => setAutocast(id);
  UI.actions.autocastSpell = () => autocastSpell();
  /* The combat panel's special-bar caption asks here for the special's name
     rather than reading the item row's `spec`, because the dark bow has two
     published forms and which one is showing depends on the arrows equipped. */
  UI.actions.specialName = (w) => specialName(w);
  Actions.onCancel = () => {
    if (Combat.target) {
      Combat.target = null;
      Combat.timer = 0;
    }
    if (G && G.player) G.player.faceEnt = null;
  };
  /* The one row of a creature's menu this module owns: the weapon. actions.js
     builds the block from the cache's own action list (unit W, `npcMenuRows`)
     and calls here for the verb, so the ordering - and whether the row exists at
     all - is the def's and this engine's, never this module's. There is no
     "any mode but talk is an attack" hook any more: that rule is what killed the
     world's tanner twice (see src/PLAN.md unit V), and the def's own Attack
     action is the only route to a weapon now. */
  Actions.npcAttack = (npc) => attackNpc(npc);
  /* Which creatures fight in melee. The tables that answer it are this module's
     (NPC_CAST/NPC_MISSILE_GFX above), and game.js's `updateNpcs` walks a
     creature's route without being able to import them - the arrow points the
     other way - so the same answer is published here and read there, exactly as
     `Actions.npcAttack` is. A melee creature has to arrive on one of its
     victim's four side tiles (see the note on `reachDistance`), and only this
     module knows which creatures those are. */
  game.npcMelee = (type) => meleeReach(type);
  /* The Thieving skill's two hooks (see src/actions.js#stunPlayer and
     #attemptSteal). They are installed here rather than imported, because
     actions.js is the module this one imports - the arrow has to point one way.
     `strikePlayer` is the same blow-lands-on-the-player tail an ordinary strike
     uses, so a pickpocket that knocks you out kills you properly; `guardCalled`
     is the market's alarm. */
  Actions.strikePlayer = (dmg, npc) => stunPlayer(dmg, npc);
  Actions.guardCalled = (x, z) => callMarketGuards(x, z);
  /* Teleporting out ends the fight on both sides: our own swings stop (the
     same clear `Actions.onCancel` runs) and nothing keeps chasing a body that
     has vanished - without this the act and the aggro survive the jump and the
     player walks straight back into what they just left. Installed here rather
     than imported because actions.js is the module this one imports. */
  Actions.endCombat = () => {
    Combat.target = null;
    Combat.timer = 0;
    Combat.pending = null;
    if (G && G.player) for (const npc of G.npcs) {
      if (npc.target === G.player) npc.target = null;
      if (npc.aggroed === G.player) npc.aggroed = null;
    }
  };
  /* The food hook. The wiki's rule is that eating adds three ticks to the
     weapon's recovery *only if it is already recovering* - "Foods only add to
     an existing attack delay between weapon attacks. If your weapon is ready to
     attack again then eating does not add any new delay." UI owns the click
     (src/ui.js#doEat), this module owns the timer, so the click asks here. */
  UI.actions.eatDelay = (ticks) => { if (Combat.timer > 0) Combat.timer += ticks; };
  return Combat;
}

export { ps as playerState };

/* The ammunition seam, for the live checks and nothing else: which stack the
   equipped weapon would load, and whether the pack holds one of the right kind
   that the weapon nonetheless refuses (a rune crossbow with only bone bolts).
   The unit XX ammunition matrix equips a weapon with each kind of ammunition in
   turn and reads both, so the rule that decides a shot and the rule the matrix
   prints can never drift. (`src/tools/check-gear.mjs` audits the static tables
   themselves - every id, and each exclusive kind named back by its weapon.) */
export { rangedAmmo, rangedAmmoWrongWeapon };
