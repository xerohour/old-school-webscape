/* ============================================================= skill guides
   The stats interface's own tooltip is the client's three XP lines
   (src/ui.js#skillTip); in the 2007 client a fourth "View Attack guide" line
   opened the RuneScape website's skill-guide page in the player's
   browser, and the cache agrees - all 466 interfaces were searched for a guide
   and the only two that even mention the skill icons (197..221) are a
   "choose the stat you wish to be advanced" dialog and a reward-options window.
   There is no skill-guide interface to transcribe, so this world keeps the
   guide behind the skill's own hit box instead - the bank's
   riveted frame and dialog tiles - filled with this world's own content.

   Everything below is read out of the world's data rather than written out by
   hand, so a guide can never promise a rock, a spell or a bar the game does not
   have: the item gates come from src/items.js (`req`, `levelReq`), the spells
   from src/magic.js, the prayers from src/prayer.js, and the run-energy
   formulas from src/run.js. A skill this world has no content for says so, the
   way the quest journal says there are no quests.

   Shape: `buildGuide(skillId)` returns

     { title, intro, sections: [{ heading, rows: [{ icon, level, text }] }] }

   `icon` is either { item: "<item id>", size } (drawn with the item's baked
   sprite) or { sprite: "<frame part>" } (a cache sprite, used for spells and
   prayers) or null. `level` is the level the entry needs, or null when nothing
   is gated on it. `right` is a short note the guide right-aligns at the end of
   the row - the Attack guide puts each weapon's attack speed there - or null.
   src/ui.js#renderSkillGuide does the drawing. */

import { ITEMS, SMITH_ITEMS, CRAFT_RECIPES, TAN_FEES, PICKPOCKET, STALLS, HERBS, POTIONS, WEAPON_POISON, itemName, JEWELLERY, STRING_RECIPES, STRING_XP, BOW_FLETCH, BOW_STRING, POTTERY_SHAPE, POTTERY_FIRE, GLASSBLOWING } from "./items.js";
import { SPELLS } from "./magic.js";
import { PRAYERS } from "./prayer.js";
import { SKILLS } from "./skills.js";

/* A copy of src/actions.js#LOG_FM_XP and #LOG_ORDER. Importing actions.js from
   here would close an import cycle (actions -> ui -> skillguides -> actions),
   so the two log tables are duplicated rather than shared; keep them in step
   with the originals. The order is the order src/items.js defines LOGS in. */
const LOG_FM_XP = [40, 60, 90, 135, 202.5, 303.8];
const LOG_ORDER = ["logs", "oak_logs", "willow_logs", "maple_logs", "yew_logs", "magic_logs"];

const TOOL_NAMES = {
  net: "small net",
  rod_bait: "rod and bait",
  fly: "fly rod",
  harpoon: "harpoon",
  cage: "lobster pot",
  bignet: "big net",
  oily: "oily rod",
  vessel: "karambwan vessel",
};

const SPELL_KINDS = {
  combat: "Combat", stat: "Stat", bind: "Binding", teleport: "Teleport",
  alchemy: "Alchemy", item: "Item", grab: "Telegrab", superheat: "Superheat",
  charge: "Charge", npc: "NPC", other: "Support", self: "Self",
};

/* The order the guide files a set's pieces in: head to feet, then the weapon,
   because that is the order the worn-equipment interface and the real guide
   both read in. */
const SLOT_ORDER = ["head", "cape", "body", "legs", "hands", "feet", "shield", "weapon"];

const SKILL_NAME = {};
for (const s of SKILLS) SKILL_NAME[s.id] = s.name;

/* --------------------------------------------------------------- row helpers */

function row(icon, level, text, right) { return { icon, level, text, right: right || null }; }
function itemIcon(id, size = 20) { return { item: id, size }; }
function spriteIcon(name) { return { sprite: name }; }

/* The weapon categories, in the order the guide files them: the smithed metal
   families first (daggers through hastae), then the two tool families, then the
   weapons that belong to no metal. The keys are the `cat` field src/items.js
   puts on every weapon; a category with nothing in it for this skill is
   dropped rather than shown empty. */
const CATEGORY = [
  ["dagger", "Daggers"], ["sword", "Swords"], ["longsword", "Longswords"],
  ["scimitar", "Scimitars"], ["mace", "Maces"], ["battleaxe", "Battleaxes"],
  ["warhammer", "Warhammers"], ["2h", "Two-handed swords"], ["claws", "Claws"],
  ["halberd", "Halberds"], ["spear", "Spears"], ["hasta", "Hastae"],
  ["axe", "Axes"], ["pickaxe", "Pickaxes"], ["whip", "Whips"], ["maul", "Mauls"],
  ["staff", "Staves"],
  ["barrows", "Barrows weapons"], ["special", "Special weapons"],
];

/* A row's text: the item's name, plus any *other* skill it also needs, so a
   white halberd reads "White halberd (5 Strength)" and a rune pickaxe reads
   "Rune pickaxe (41 Mining)" instead of quietly hiding the second gate. */
function reqText(d, skill) {
  const rest = Object.keys(d.req || {}).filter((k) => k !== skill);
  if (!rest.length) return d.name;
  return d.name + " (" + rest.map((k) => d.req[k] + " " + (SKILL_NAME[k] || k)).join(", ") + ")";
}

/* The same requirement, but grouped by level and read out as a sentence - used
   only where a whole set shares one gate, so the gate can be stated once
   instead of repeating a seven-skill bracket on every row. */
function otherReq(d, skill) {
  const out = {};
  for (const [k, v] of Object.entries(d.req || {})) {
    if (k === skill) continue;
    (out[v] = out[v] || []).push(SKILL_NAME[k] || k);
  }
  return out;
}

function reqPhrase(map) {
  return Object.keys(map).map(Number).sort((a, b) => b - a)
    .map((lvl) => "level " + lvl + " " + map[lvl].join(", ")).join(", and ");
}

/* A weapon's attack speed, as the Attack guide's right-hand column reads it.
   `speed` is the weapon's own field in game ticks (src/items.js) - the same
   number src/player.js#attackSpeed hands the combat timer, so a row in the
   guide and the swing the player feels are the same value. */
function speedText(d) {
  const t = d.speed || 4;
  return t + (t === 1 ? " tick" : " ticks");
}

/* A gathering tool's power, as the Mining and Woodcutting guides' right-hand
   column reads it: the field src/actions.js adds 5.5 percentage points of strike
   chance for per point above 1 (src/actions.js#attemptMine, #attemptWc - those
   two formulas are the only things in the world that read it, and these two
   guides are the only place it is printed). Every axe and pickaxe carries its
   own `power`; a tool without one is the weakest of its family. */
function toolPower(d) { return "power " + (d.power || 1); }

function xpText(n) { return (Math.round(n * 10) / 10) + " XP"; }
function withArticle(name) { return (/^[aeiou]/i.test(name) ? "an " : "a ") + name; }

/* Runes as the spell's own cost object reads: { air: 1, mind: 1 } ->
   "1 air, 1 mind". */
function runeText(cost) {
  const parts = [];
  for (const [name, qty] of Object.entries(cost || {})) parts.push(qty + " " + name);
  return parts.length ? parts.join(", ") : "no runes";
}

/* --------------------------------------------------------------- the guides */

/* The melee guide, filed by weapon category rather than as one list sorted by
   level. Sorted by level alone, every bronze weapon of every kind sits together
   and the list reads as "bronze weapons, iron weapons, steel weapons" - which is
   what it did before, and what the live game's own guide is criticised for. The
   categories are the game's own weapon types (src/items.js#WEAPON_TABLE's
   `cat`), so all nine scimitars are in one block, and the two categories that
   are not metals - the Barrows weapons and the quest/treasure uniques - come
   last. */
function weaponsGuide(skill) {
  const sections = [];
  for (const [cat, heading] of CATEGORY) {
    const rows = [];
    for (const [id, d] of Object.entries(ITEMS)) {
      if (d.slot !== "weapon" || !d.req || d.req[skill] == null) continue;
      if ((d.cat || "") !== cat) continue;
      /* One row per weapon, not one per coating: the guide lists the weapon a
         player sets out to get, and a dagger's three poison strengths are the
         same dagger as far as Attack is concerned (src/items.js#POISON_FAMILIES
         generates them as copies of the clean row). */
      if (d.weaponPoison) continue;
      rows.push(row(itemIcon(id), d.req[skill], reqText(d, skill), speedText(d)));
    }
    if (!rows.length) continue;
    rows.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
    sections.push({ heading, rows });
  }
  return {
    intro: "Every weapon lists the " + SKILL_NAME[skill] + " level needed to wield it. Weapons are grouped by type; a second requirement is shown in brackets, and the number at the right is its attack speed in game ticks (1 tick = 0.6 seconds).",
    sections,
  };
}

function strengthGuide() {
  const rows = [];
  const METALS = ["bronze", "iron", "steel", "black", "mithril", "adamant", "rune"];
  for (const m of METALS) {
    const id = m + "_2h";
    const d = ITEMS[id];
    if (!d) continue;
    rows.push(row(itemIcon(id), d.req ? d.req.attack : null, d.name + " - strength bonus +" + (d.bonus ? d.bonus.str : 0)));
  }
  return {
    intro: "Strength raises your melee max hit. No item in this world needs a Strength level to use.",
    sections: [
      { heading: "Training", rows: [
        row(null, null, "Fight with the Aggressive style to gain Strength XP."),
        row(null, null, "The Controlled style splits its XP between Attack, Strength and Defence."),
        row(null, null, "Every hit also gives 1.33 Hitpoints XP."),
      ] },
      { heading: "The heaviest weapon of each metal", rows },
    ],
  };
}

/* The armour categories, in the order the guide files them: the worn slots from
   the head down. The keys are the `cat` field src/items.js puts on every piece
   of armour; a slot with nothing in it for this skill is dropped rather than
   shown empty. Grouping by slot rather than by metal is the same choice the
   weapon guide makes - sorted by level alone every bronze piece of every kind
   sits together and the list reads as "bronze armour, iron armour, steel
   armour", which is what it did before. Filed by slot, a player looking for a
   better body asks one section and sees every body piece they can wear. */
const ARMOUR_CATEGORY = [
  ["helm", "Helmets"], ["cape", "Capes"], ["body", "Body armour"], ["legs", "Legs"],
  ["shield", "Shields"], ["hands", "Gloves"], ["feet", "Boots"], ["amulet", "Amulets"],
  ["ring", "Rings"],
];

/* The Defence guide: every piece of armour in the world, grouped by the slot it
   fills. An item that also needs another skill - a spined helm needs 40 Ranged,
   an Ahrim's robetop needs 70 Magic, a stole needs 60 Prayer - shows that in
   brackets.

   The level column is the piece's own Defence gate, and a piece with no gate
   carries no number: the column is left blank rather than filled with something
   else, because a large part of the roster is free to wear. The whole glove
   chain from hardleather to barrows, every boot from climbing to moonclan, the
   four unenchanted shields, the capes, the rings and every amulet are all
   requirement-less - and an earlier version of this guide *dropped every one of
   them* by testing `d.req[skill]` first and skipping when it was absent, which is
   how whole families went missing from the guide that the audit in
   src/tools/check-gear.mjs now guards (a guide that drops a piece is silent: the
   piece simply never appears).

   Gate-less rows sort last so the section still answers "what does Defence
   unlock" at a glance, and a second `cat` - "amulet" - covers the jewellery,
   which is worn armour even though src/items.js defines it in its own table
   rather than in ARMOUR_TABLE. */
function armourGuide(skill) {
  const sections = [];
  for (const [cat, heading] of ARMOUR_CATEGORY) {
    const rows = [];
    for (const [id, d] of Object.entries(ITEMS)) {
      if (d.slot === "weapon" || (d.cat || "") !== cat) continue;
      rows.push(row(itemIcon(id), d.req ? d.req[skill] ?? null : null, reqText(d, skill)));
    }
    if (!rows.length) continue;
    /* `(a.level == null) - (b.level == null)` puts a gate-less row after a gated
       one without treating "no gate" as level zero, which would sort every free
       piece above the bronze. */
    rows.sort((a, b) => (a.level == null) - (b.level == null) || (a.level || 0) - (b.level || 0) || a.text.localeCompare(b.text));
    sections.push({ heading, rows });
  }
  return {
    intro: "Defence reduces how often you are hit. Every piece of armour in the world is listed here, grouped by the slot it fills. The number on the left is the Defence level it needs - a piece with no number needs no Defence level at all - and any second requirement is shown in brackets.",
    sections,
  };
}

function hitpointsGuide() {
  return {
    intro: "Your Hitpoints level is your maximum life points. Damage you deal trains it.",
    sections: [
      { heading: "Training", rows: [
        row(null, null, "Every hit in combat gives 1.33 Hitpoints XP alongside the style's XP."),
        row(null, null, "Your life points are always equal to your Hitpoints level."),
        row(null, null, "A level-up heals you by the levels it gained."),
      ] },
      { heading: "Staying alive", rows: [
        row(itemIcon("bread"), null, "Eat food to restore life points (Bread heals 5)."),
        row(null, null, "Life points also regenerate on their own: one every minute, twice as fast under Rapid Heal or a regen bracelet."),
        row(null, null, "If you die you keep your three most valuable items."),
      ] },
    ],
  };
}

function rangedGuide() {
  const bows = [];
  const crossbows = [];
  const comps = [];
  const thrown = [];
  const leather = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (!d.req || d.req.ranged == null) continue;
    /* The poisoned three of a weapon are copies of the clean row
       (src/items.js#POISON_FAMILIES) and every other guide lists a family once,
       so they are skipped here - including for the thrown weapons, which would
       otherwise triple the section. */
    if (d.weaponPoison) continue;
    const r = row(itemIcon(id), d.req.ranged, d.name);
    if (d.kind === "crossbow") crossbows.push(r);
    else if (d.shape === "comp_bow") comps.push(r);
    else if (d.kind === "bow") bows.push(r);
    /* The fourth ranged family: a dart, a knife, a throwing axe or a javelin is
       wielded like a weapon and thrown like an arrow (src/items.js#THROWN). It
       is a section of its own rather than part of "Armour" - which is where the
       `else` below used to send anything gated on Ranged that was not a bow. */
    else if (d.kind === "thrown") thrown.push(r);
    else leather.push(r);
  }
  const byLevel = (a, b) => a.level - b.level || a.text.localeCompare(b.text);
  bows.sort(byLevel);
  crossbows.sort(byLevel);
  comps.sort(byLevel);
  thrown.sort(byLevel);
  leather.sort(byLevel);

  /* The thrown weapons print their own ranged strength like the arrows below,
     and the right-hand column says which family's throwing motion the row
     carries, because that is what sets the swing's speed and its reach: a dart
     (3 tiles, the fastest), a knife (4), a throwing axe (4, but a slower swing)
     and a javelin (5, the slowest and the hardest-hitting). Rows are grouped by
     family - darts, knives, axes, javelins - and by the metal's level within
     each, which is the order the families themselves read best in. */
  /* The mystic cards are the fifth family and the shortest reach of all - a
     thrown weapon at **2** tiles, half a knife's - which is the user's change
     rather than a cache row (see src/items.js#WEAPON_TABLE). They sort last so
     the four cache families keep their own order. */
  const THROWN_NOTE = { dart: "thrown, reach 3", knife: "thrown, reach 4", thrownaxe: "thrown, reach 4", javelin: "thrown, reach 5", mystic_cards: "thrown, reach 2" };
  const THROWN_ORDER = { dart: 0, knife: 1, thrownaxe: 2, javelin: 3, mystic_cards: 4 };
  for (const r of thrown) {
    const d = ITEMS[r.icon.item];
    if (!d) continue;
    r.text = d.name + " - ranged strength +" + (d.bonus && d.bonus.rstr || 0);
    r.right = THROWN_NOTE[d.thrown] || "thrown";
  }
  thrown.sort((a, b) => (THROWN_ORDER[ITEMS[a.icon.item].thrown] - THROWN_ORDER[ITEMS[b.icon.item].thrown])
    || a.level - b.level || a.text.localeCompare(b.text));

  /* The arrows are derived the same way the bolts are, and for the same reason:
     the metal ladder used to be spelled out here, which quietly left a dragon
     arrow out of the guide the day one was added to src/items.js (the audit
     caught it - src/tools/check-gear.mjs's "every equippable item is named by
     some guide"). Strength order is tier order, so the section reads
     bronze-to-dragon without a list to keep in step. The poison variants are
     the herblore guide's business, not this one's, hence the same
     `!weaponPoison` filter the bolts carry. */
  const arrows = Object.entries(ITEMS)
    .filter(([, d]) => d.kind === "ammo" && d.ammoKind === "arrow" && !d.weaponPoison)
    .map(([id, d]) => ({ s: d.ammo || 0, r: row(itemIcon(id), null, d.name + " - ranged strength +" + d.ammo) }))
    .sort((a, b) => a.s - b.s)
    .map((e) => e.r);
  /* The bolts are derived from the item table rather than listed, so a bolt
     added to src/items.js cannot be missing from the guide - and the strongest
     first, because that is the question the guide is opened to answer. The kind
     is the whole rule: a crossbow fires `bolt`, a bow fires `arrow`
     (src/combat.js#rangedAmmo). */
  const bolts = Object.entries(ITEMS)
    .filter(([, d]) => d.kind === "ammo" && d.ammoKind === "bolt" && !d.weaponPoison)
    .map(([id, d]) => ({ s: d.ammo || 0, r: row(itemIcon(id), null, d.name + " - ranged strength +" + d.ammo) }))
    .sort((a, b) => a.s - b.s)
    .map((e) => e.r);
  return {
    intro: "Ranged needs a bow and some arrows, a crossbow and some bolts, or a stack of thrown weapons. A bow will not fire bolts and a crossbow will not fire arrows; a dart, a knife, a throwing axe, a javelin or a set of mystic cards is its own ammunition and is thrown from the hand. The stronger the ammunition, the harder the shot - and the gem-tipped bolts can be enchanted.",
    sections: [
      { heading: "Bows", rows: bows },
      { heading: "Crossbows", rows: crossbows },
      { heading: "Composite bows", rows: comps },
      { heading: "Thrown weapons", rows: thrown },
      { heading: "Arrows", rows: arrows },
      { heading: "Bolts", rows: bolts },
      { heading: "Armour", rows: leather },
    ],
  };
}

function prayerGuide() {
  const rows = PRAYERS.map((p) => row(spriteIcon("prayer" + p.id), p.level, p.name + " - " + p.desc));
  const sections = [{ heading: "Prayers", rows }];
  /* The equipment half of the guide, and the reason a player opens it twice:
     every item in the world with a prayer bonus of its own, best bonus first.
     It is derived from the items rather than hand-listed, so nothing can be
     left out of it - the monk's, druid's and shade robes that carry no magic
     bonus at all land here (and only here), the vestments' prayer-gated pieces
     (robe top, legs, stole, crozier) land here as well as in the Magic guide's
     set entries, and so do the small ones a hand-list would forget, like the
     white knight's armour and the amulet of glory. */
  const equip = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    const pray = d.bonus && d.bonus.pray;
    if (!(pray > 0)) continue;
    equip.push({ id, d, pray });
  }
  if (equip.length) {
    equip.sort((a, b) => b.pray - a.pray || a.d.name.localeCompare(b.d.name));
    sections.push({
      heading: "Prayer equipment",
      rows: equip.map((e) => row(itemIcon(e.id), null, e.d.name, "+" + e.pray + " prayer")),
    });
  }
  return {
    intro: "Prayers drain your prayer points while they are up; the points come back slowly on their own. The equipment below adds its prayer bonus to the points each dose of a prayer potion restores.",
    sections,
  };
}

function magicGuide() {
  const sections = [];

  /* The spells, grouped by what they do rather than poured into one list
     sorted by level. Sorted by level alone a 128-row list interleaves a
     teleport, a curse and a combat spell, which is what it did before; the
     groups are the spells' own `kind` field (src/magic.js), and the two groups
     that mix kinds show each row's kind in brackets so the heading cannot lie.
     A combat spell shows its maximum hit instead, which is the number a player
     choosing between two of them actually wants. */
  const SPELL_GROUPS = [
    ["Combat spells", ["combat"]],
    ["Stat-changing", ["stat"]],
    ["Binding spells", ["bind"]],
    ["Teleports", ["teleport"]],
    ["Enchanting and alchemy", ["alchemy", "item"]],
    ["Other spells", ["grab", "superheat", "charge", "npc", "other", "self"]],
  ];
  for (const [heading, kinds] of SPELL_GROUPS) {
    const rows = [];
    const mixed = kinds.length > 1;
    for (const sp of SPELLS) {
      if (!kinds.includes(sp.kind)) continue;
      let text = sp.name + " - " + runeText(sp.cost);
      if (sp.kind === "combat" && sp.max) text += " (max " + sp.max + ")";
      else if (mixed) text += " (" + (SPELL_KINDS[sp.kind] || sp.kind).toLowerCase() + ")";
      /* A spell with no book cell (`noCell` in src/magic.js - none today) gets a
         text-only row instead of a blank icon. */
      rows.push(row(sp.noCell ? null : spriteIcon("spell" + sp.id), sp.level || null, text));
    }
    if (!rows.length) continue;
    rows.sort((a, b) => (a.level || 0) - (b.level || 0));
    sections.push({ heading, rows });
  }

  /* The equipment, filed as *sets* rather than as one "Robes" pile. The set
     names and members are the real ones: it is the cache's own item names
     (`scratch/cache241-items.json`) that carry "(dark)" and "(light)" as
     separate pieces, and a set's staff is filed with the set - Ahrim's staff
     with the robes, the lunar staff with the Lunar set - because that is where
     a player who wants the set will look for it. Every row's second
     requirement, the Defence level the piece also needs, is shown in brackets
     by `reqText`, so an Ahrim's hood reads "70 Defence" instead of hiding a
     gate the way the old filter did. Anything magic-gated that no set claims
     still lands in a final catch-all section, so a piece can never be dropped
     from the guide by being left off a list here. */
  const listed = new Set();
  /* `opts.set` says the ids are an explicit *set* rather than a group of
     magic-gated pieces: a set is filed whole, so every id on the list shows,
     whatever its own gate or bonus is. That is the only way the two plain magic
     skirts can be shown at all - the blue and black skirts carry no bonus of
     any kind (they are the wizard and dark-wizard sets' bottoms and nothing
     more) - and the reason a vestment's robe top, legs, stole and crozier
     appear beside the mitre even though they are gated on **Prayer**. The
     *prayer* robes (monk's, druid's, shade - no magic bonus at all) are simply
     not on any list here; they are the Prayer guide's, and that guide derives
     its own list from the items so they cannot be left out of it. */
  const gear = (heading, ids, opts) => {
    const set = !!(opts && opts.set);
    const members = [];
    for (const id of ids) {
      const d = ITEMS[id];
      if (!d) continue;
      if (!set) {
        const gated = !!(d.req && d.req.magic != null);
        const bonus = !!(d.bonus && (d.bonus.amagic || d.bonus.dmagic));
        if (!gated && !bonus) continue;
      }
      if (listed.has(id)) continue;
      listed.add(id);
      members.push({ id, d });
    }
    if (!members.length) return;
    const rank = (m) => {
      const i = SLOT_ORDER.indexOf(m.d.slot);
      return i < 0 ? SLOT_ORDER.length : i;
    };
    members.sort((a, b) => rank(a) - rank(b) || a.d.name.localeCompare(b.d.name));
    /* When every piece of a set carries the *same* long second requirement -
       the void knight set needs six combat skills at once - repeating the whole
       list in every bracket wraps four rows into eight and reads badly. The
       gate is stated once, in a prose line after the pieces, and the rows stay
       single-line. A short shared gate ("(20 Defence)") keeps its bracket on
       every row instead: it is what the player scans for. Nothing is hidden
       either way. */
    const restKey = (d) => JSON.stringify(otherReq(d, "magic"));
    const nOthers = Object.values(otherReq(members[0].d, "magic")).reduce((n, a) => n + a.length, 0);
    const shared = members.length > 1 && nOthers >= 3 && members.every((m) => restKey(m.d) === restKey(members[0].d));
    const rows = members.map((m) => row(itemIcon(m.id), m.d.req && m.d.req.magic != null ? m.d.req.magic : null, shared ? m.d.name : reqText(m.d, "magic")));
    if (shared) rows.push(row(null, null, "Every piece also needs " + reqPhrase(otherReq(members[0].d, "magic")) + "."));
    sections.push({ heading, rows });
  };
  gear("Elemental staves", ["staff_of_air", "staff_of_water", "staff_of_earth", "staff_of_fire"]);
  gear("Battlestaves", ["battlestaff", "air_battlestaff", "water_battlestaff", "earth_battlestaff", "fire_battlestaff", "lava_battlestaff", "mud_battlestaff"]);
  gear("Mystic staves", ["mystic_air_staff", "mystic_water_staff", "mystic_earth_staff", "mystic_fire_staff", "mystic_lava_staff", "mystic_mud_staff", "mystic_lightning_staff"]);
  gear("God staves", ["saradomin_staff", "guthix_staff", "zamorak_staff"]);
  gear("Other staves", ["ancient_staff", "ibans_staff", "ibans_superior_staff", "slayers_staff", "dramen_staff", "magic_staff"]);
  /* The **white magic staff** is deliberately not in any list here: its gate is
     10 Attack (its own page's requirement), not Magic, so it is not Magic
     content under this guide's rule. It shows up in the Attack guide's own
     Staves section instead, which is where a weapon that gates on Attack
     belongs. */
  gear("Mystic robes", ["mystic_hat", "mystic_robe_top", "mystic_robe_bottom", "mystic_gloves", "mystic_boots"]);
  gear("Mystic robes (dark)", ["mystic_dark_hat", "mystic_dark_robe_top", "mystic_dark_robe_bottom", "mystic_dark_gloves", "mystic_dark_boots"]);
  gear("Mystic robes (light)", ["mystic_light_hat", "mystic_light_robe_top", "mystic_light_robe_bottom", "mystic_light_gloves", "mystic_light_boots"]);
  gear("Dagon'hai robes", ["dagonhai_hat", "dagonhai_robe_top", "dagonhai_robe_bottom"]);
  gear("Splitbark armour", ["splitbark_helm", "splitbark_body", "splitbark_legs", "splitbark_gauntlets", "splitbark_boots"]);
  gear("Skeletal armour", ["skeletal_helm", "skeletal_top", "skeletal_bottoms"]);
  gear("Infinity robes", ["infinity_hat", "infinity_top", "infinity_bottoms", "infinity_gloves", "infinity_boots"]);
  gear("Ahrim's robes", ["ahrims_hood", "ahrims_robetop", "ahrims_robeskirt", "ahrims_staff"]);
  gear("Void knight equipment", ["void_knight_top", "void_knight_robe", "void_knight_gloves", "void_knight_mace"]);
  /* The rest of the robe sets (unit L5 of PLAN.md), the ones that carry no
     Magic *level* of their own: the three plain magic-shop robes (blue wizard,
     black wizard and dark wizard), the ghostly set (Desert Treasure's), and the vestments, whose robe
     tops, legs, stoles and croziers are gated on **Prayer**. They are filed as
     sets (`opts.set`), so each shows whole and its own gate reads in the
     bracket beside it - a vestment top as "(20 Prayer)", its stole as
     "(60 Prayer)". The Zamorak monk robes carry a magic bonus too, so they are
     a set here and *also* the one prayer robe the Prayer guide's own list
     covers. */
  gear("Blue wizard robes", ["wizard_hat", "wizard_robe", "blue_skirt"], { set: true });
  gear("Dark wizard robes", ["dark_wizard_hat", "dark_wizard_robe_top", "dark_wizard_robe_bottom"], { set: true });
  gear("Black wizard robes", ["black_wizard_hat", "black_robe", "black_skirt"], { set: true });
  gear("Ghostly robes", ["ghostly_hood", "ghostly_robe_top", "ghostly_robe_bottom", "ghostly_gloves", "ghostly_boots", "ghostly_cloak"], { set: true });
  gear("Enchanted robes", ["enchanted_hat", "enchanted_top", "enchanted_robe"]);
  gear("3rd age robes", ["third_age_mage_hat", "third_age_robe_top", "third_age_robe"]);
  gear("Zamorak monk robes", ["zamorak_monk_top", "zamorak_monk_bottom"], { set: true });
  gear("Saradomin vestments", ["saradomin_mitre", "saradomin_robe_top", "saradomin_robe_legs", "saradomin_stole", "saradomin_crozier"], { set: true });
  gear("Guthix vestments", ["guthix_mitre", "guthix_robe_top", "guthix_robe_legs", "guthix_stole", "guthix_crozier"], { set: true });
  gear("Zamorak vestments", ["zamorak_mitre", "zamorak_robe_top", "zamorak_robe_legs", "zamorak_stole", "zamorak_crozier"], { set: true });
  const leftovers = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (listed.has(id)) continue;
    if (d.req && d.req.magic != null) leftovers.push(id);
  }
  if (leftovers.length) {
    const rows = leftovers.map((id) => row(itemIcon(id), ITEMS[id].req.magic, reqText(ITEMS[id], "magic")));
    rows.sort((a, b) => (a.level || 0) - (b.level || 0) || a.text.localeCompare(b.text));
    sections.push({ heading: "Other magic equipment", rows });
  }

  return {
    intro: "Each spell lists its Magic level and its runes; a staff supplies its own rune for free. Magic equipment is grouped into sets - a piece that also needs Defence shows that in brackets, and each set's staff is listed with it.",
    sections,
  };
}

function runecraftingGuide() {
  return {
    intro: "Mine rune essence on its own island, carry it through the mysterious ruins, and bind it into runes at the Air Altar's island. Wizard Sedridor west of the town square sends you to the essence mine.",
    sections: [
      { heading: "Rune essence", rows: [
        row(itemIcon("rune_essence"), null, "Mined from the great rock on the essence mine's island (level 1 Mining, 5 xp) - every swing lands and the rock never runs out; its portal brings you back."),
        row(itemIcon("air_talisman"), null, "Sedridor hands you an air talisman - it is never used up."),
      ] },
      { heading: "Air runes", rows: [
        row(itemIcon("air_rune"), null, "Bind every essence carried at the Air Altar: 5 xp each, an extra rune per essence every 11 levels."),
        row(null, null, "The mysterious ruins stand on their own point east of the mine, past the beach; enter with the talisman to reach the altar's island, and leave through its portal."),
      ] },
    ],
  };
}

function agilityGuide() {
  return {
    intro: "Agility needs no training here, but its level decides how fast your run energy recovers.",
    sections: [{ heading: "Run energy", rows: [
      row(null, null, "Running drains energy every tick; walking never does."),
      row(null, null, "Each Agility level raises the energy you regain per tick."),
      row(null, null, "The more you carry, the faster running drains you."),
      row(null, null, "Energy must be back at 100% before you can start running again."),
    ] }],
  };
}

function craftingGuide() {
  const gems = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "gem" || !d.cut) continue;
    gems.push(row(itemIcon(id), d.cutLevel || 1, "Cut " + d.name.toLowerCase() + " into " + withArticle(ITEMS[d.cut].name.toLowerCase()) + " (" + xpText(d.cutXp || 50) + ")."));
  }
  gems.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  /* The needle's half of the skill (src/PLAN.md unit O). Every row is a row of
     src/items.js#CRAFT_RECIPES, so the guide can never promise a piece the
     needle cannot actually sew, and the thread rule is the client's own: one
     thread per five pieces of leather. */
  const sewn = Object.entries(CRAFT_RECIPES)
    .filter(([id]) => ITEMS[id])
    .map(([id, r]) => ({ id, r }))
    .sort((a, b) => a.r.level - b.r.level)
    .map(({ id, r }) => row(itemIcon(id), r.level, "Sew " +
      r.mats.map(([m, q]) => q + " x " + ITEMS[m].name.toLowerCase()).join(" and ") +
      " into " + (/s$/.test(ITEMS[id].name) ? "" : "a ") + ITEMS[id].name.toLowerCase() +
      " (" + xpText(r.xp) + ")."));
  const tan = TAN_FEES.filter((t) => ITEMS[t.from] && ITEMS[t.to]).map((t) =>
    row(itemIcon(t.to), null, "Tan " + ITEMS[t.from].name.toLowerCase() + " into " +
      ITEMS[t.to].name.toLowerCase() + " (" + t.fee + " gp each, at a tanner)."));
  /* The jeweller's bench (unit L3): one row per recipe in
     src/items.js#JEWELLERY, so the guide can promise exactly what a furnace can
     make. The bar is the recipe's own - gold for rings, necklaces, amulets and
     bracelets, silver for symbols, sickles, tiaras and bolts (the gold bar gate
     is Smithing's 40 to smelt gold ore, which is why the level-5 rows still
     need a bar). */
  const jewels = JEWELLERY.filter((r) => ITEMS[r.id] && ITEMS[r.mould])
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((r) => {
      const barName = (ITEMS[r.bar || "gold_bar"] || {}).name || "gold bar";
      const what = r.qty > 1 ? r.qty + " x " + ITEMS[r.id].name.toLowerCase()
        : withArticle(ITEMS[r.id].name.toLowerCase());
      return row(itemIcon(r.id), r.level,
        "Make " + what + " - 1 " + barName.toLowerCase() +
        (r.gem && ITEMS[r.gem] ? " and 1 " + ITEMS[r.gem].name.toLowerCase() : "") +
        ", with " + withArticle(ITEMS[r.mould].name.toLowerCase()) + " at a furnace (" + xpText(r.xp) + ").");
    });
  const strings = Object.entries(STRING_RECIPES)
    .filter(([u, s]) => ITEMS[u] && ITEMS[s])
    .sort((a, b) => ITEMS[a[1]].value - ITEMS[b[1]].value)
    .map(([u, s]) => row(itemIcon(s), 1, "Add a ball of wool to " + withArticle(ITEMS[u].name.toLowerCase()) +
      " to string it (" + xpText(STRING_XP) + ")."));
  /* Pottery: soft clay (clay mixed with water) shaped on a potter's wheel,
     then fired in a pottery oven - both steps pay experience. */
  const pots = POTTERY_SHAPE
    .filter((r) => ITEMS[r.id] && POTTERY_FIRE[r.id] && ITEMS[POTTERY_FIRE[r.id].id])
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((r) => {
      const f = POTTERY_FIRE[r.id];
      return row(itemIcon(f.id), r.level,
        "Shape soft clay into " + withArticle(ITEMS[r.id].name.toLowerCase()) +
        " on a potter's wheel (" + xpText(r.xp) + "), then fire it in a pottery oven into " +
        withArticle(ITEMS[f.id].name.toLowerCase()) + " (" + xpText(f.xp) + ").");
    });
  /* Glassblowing: soda ash (seaweed cooked for no experience) and a bucket of
     sand smelted at a furnace into molten glass, then blown with a pipe. */
  const glass = [];
  if (ITEMS["molten_glass"]) {
    glass.push(row(itemIcon("molten_glass"), 20,
      "Smelt a bucket of sand with soda ash at a furnace into molten glass (" + xpText(20) + ", the bucket comes back). Cook seaweed on a fire or range for soda ash (no experience)."));
  }
  for (const r of GLASSBLOWING.filter((g) => ITEMS[g.id])) {
    glass.push(row(itemIcon(r.id), r.level,
      "Blow molten glass with a glassblowing pipe into " + withArticle(ITEMS[r.id].name.toLowerCase()) +
      " (" + xpText(r.xp) + ")."));
  }
  glass.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Crafting is trained by cutting gems, sewing with a needle and thread, making jewellery at a furnace, shaping pottery, and blowing glass. A thread is used up on every fifth piece of leather. Bless a strung silver symbol - Brother Jered in the church for Saradomin's, the Spirit of Scorpius by the churchyard graves for Zamorak's.",
    sections: [
      { heading: "Gem cutting", rows: gems },
      { heading: "Leather, dragonhide and snakeskin", rows: sewn },
      { heading: "Jewellery", rows: jewels },
      { heading: "Stringing", rows: strings },
      { heading: "Pottery", rows: pots },
      { heading: "Glassblowing", rows: glass },
      { heading: "Tanning", rows: tan },
    ],
  };
}

function fletchingGuide() {
  const shafts = LOG_ORDER.map((id) => row(itemIcon(id), null, "Whittle " + ITEMS[id].name.toLowerCase() + " into 15 arrow shafts (5 XP)."));
  /* Bow-making, read off the same table the knife menu uses so the two can
     never drift: each log's shortbow (u) and longbow (u) with its own gate. */
  const bows = [];
  for (const id of LOG_ORDER) {
    const fb = BOW_FLETCH[id];
    if (!fb) continue;
    if (fb.short) bows.push(row(itemIcon(fb.short.id), fb.short.level, ITEMS[id].name + " into " + ITEMS[fb.short.id].name + " (" + xpText(fb.short.xp) + ")"));
    if (fb.long) bows.push(row(itemIcon(fb.long.id), fb.long.level, ITEMS[id].name + " into " + ITEMS[fb.long.id].name + " (" + xpText(fb.long.xp) + ")"));
  }
  bows.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  /* Stringing, one row per unstrung bow off the same table stringBow reads. */
  const strings = Object.entries(BOW_STRING).map(([u, r]) =>
    row(itemIcon(u), r.level, ITEMS[u].name + " + bow string into " + ITEMS[r.id].name + " (" + xpText(r.xp) + ")"));
  strings.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Fletching turns logs into arrow shafts and bows with a knife; a bow string turns an unstrung bow into the bow itself.",
    sections: [
      { heading: "Arrow shafts", rows: shafts },
      { heading: "Headless arrows", rows: [row(itemIcon("headless_arrow"), null, "Add feathers to arrow shafts - 1 XP each.")] },
      { heading: "Bows", rows: bows },
      { heading: "Stringing", rows: strings },
    ],
  };
}

function miningGuide() {
  const rocks = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "ore") continue;
    rocks.push(row(itemIcon(id), d.levelReq, d.name + " (" + xpText(d.xp) + ")"));
  }
  rocks.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  const picks = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "pickaxe") continue;
    /* The level column is the Mining gate - the gate the item's own row carries
       under the guide's own skill - and the Attack gate a pickaxe also has goes
       into the text through reqText. Reading the Attack gate as if it were the
       Mining one is how this guide used to promise a steel pickaxe at 5 while
       the rock it is for unlocks at 6; src/tools/check-gear.mjs catches exactly
       that class of mismatch. */
    picks.push(row(itemIcon(id), d.req ? d.req.mining : null, reqText(d, "mining"), toolPower(d)));
  }
  picks.sort((a, b) => (a.level || 1) - (b.level || 1) || a.text.localeCompare(b.text));
  return {
    intro: "Mine a rock with a pickaxe. A better pickaxe strikes more often: the number on the right is its power, and every point above 1 raises the chance a swing yields ore.",
    sections: [
      { heading: "Rocks", rows: rocks },
      { heading: "Pickaxes", rows: picks },
    ],
  };
}

function smithingGuide() {
  const bars = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "bar" || !d.inputs) continue;
    /* Coal-heavy recipes repeat one input (rune needs eight), so the inputs
       are collapsed first: "runite ore + 8 x coal". */
    const counts = new Map();
    for (const i of d.inputs) counts.set(i, (counts.get(i) || 0) + 1);
    const from = [...counts].map(([i, n]) => (n > 1 ? n + " x " : "") + ITEMS[i].name.toLowerCase()).join(" + ");
    bars.push(row(itemIcon(id), d.levelReq, d.name + " from " + from + " (" + xpText(d.xp) + ")"));
  }
  bars.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));

  const smith = [];
  for (const [id, s] of Object.entries(SMITH_ITEMS)) {
    const barsText = s.bars === 1 ? "1 bar" : s.bars + " bars";
    smith.push(row(itemIcon(id), s.level, ITEMS[id].name + " - " + barsText + " (" + xpText(s.xp) + ")"));
  }
  smith.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Smelt ore into bars at a furnace, then hammer them into items at an anvil. Smithing needs a hammer.",
    sections: [
      { heading: "Smelting", rows: bars },
      { heading: "Smithing", rows: smith },
    ],
  };
}

function fishingGuide() {
  const rows = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "fish") continue;
    const spots = (d.spots || []).join("/");
    rows.push(row(itemIcon(id), d.levelReq, d.name + " - " + (TOOL_NAMES[d.tool] || d.tool) + " at a " + spots + " spot (" + xpText(d.xp) + ")"));
  }
  rows.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Stand at a fishing spot with the right tool. The fishing shop sells every tool.",
    sections: [{ heading: "Fish", rows }],
  };
}

function cookingGuide() {
  /* Which item cooks into which is split across the two definitions: a raw
     fish names the cooked one as its `cookOf`, while raw meat carries `cookOf`
     the other way round (see the RAW_TO_COOKED build in src/actions.js). Pair
     them here with the same rule, then describe the cooked side. */
  const pairs = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (!d.cookOf) continue;
    /* Soda ash is glassmaking, not food: seaweed cooks into it on a range or
       a fire for no experience, and it has no heal to print. */
    if (d.cookOf === "soda_ash" || id === "soda_ash") continue;
    if (d.heal) pairs.push([d.cookOf, id]);
    else pairs.push([id, d.cookOf]);
  }
  const rows = [];
  for (const [rawId, cookedId] of pairs) {
    const raw = ITEMS[rawId] || {};
    const cooked = ITEMS[cookedId] || {};
    const level = cooked.levelReq != null ? cooked.levelReq : (raw.levelReq != null ? raw.levelReq : 1);
    const xp = cooked.cookXp != null ? cooked.cookXp : (raw.cookXp != null ? raw.cookXp : 30);
    const burn = cooked.burn != null ? cooked.burn : (raw.burn != null ? raw.burn : 0.3);
    rows.push(row(itemIcon(cookedId), level, cooked.name + " - heals " + cooked.heal + ", " + xpText(xp) + ", burns " + Math.round(burn * 100) + "%"));
  }
  rows.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Cook raw food on a fire or a range. Light your own fire with a tinderbox and a log.",
    sections: [{ heading: "Food", rows }],
  };
}

function firemakingGuide() {
  const rows = LOG_ORDER.map((id, i) => row(itemIcon(id), null, ITEMS[id].name + " - " + xpText(LOG_FM_XP[i]) + " for lighting it"));
  return {
    intro: "Light a log with a tinderbox to make a fire. Any fire can be cooked on.",
    sections: [{ heading: "Logs", rows }],
  };
}

function woodcuttingGuide() {
  const trees = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "log") continue;
    trees.push(row(itemIcon(id), d.levelReq, d.name + " from a " + d.tree + " (" + xpText(d.xp) + ")"));
  }
  trees.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  const axes = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== "axe") continue;
    /* No axe in this world carries a Woodcutting gate - any level can swing any
       axe - so the level column follows the guide's own rule and stays blank,
       and the one gate an axe does have, the Attack level to wield it, is stated
       in the text like any other second requirement. */
    axes.push(row(itemIcon(id), d.req ? d.req.woodcutting : null, reqText(d, "woodcutting"), toolPower(d)));
  }
  axes.sort((a, b) => (ITEMS[a.icon.item].power || 1) - (ITEMS[b.icon.item].power || 1) || a.text.localeCompare(b.text));
  return {
    intro: "Chop a tree with an axe in your inventory or hand. A better axe cuts faster: the number on the right is its power, and every point above 1 raises the chance a swing yields a log. No axe needs a Woodcutting level - only the Attack level in brackets. A battleaxe can fell a tree just as well, at its own metal's power.",
    sections: [
      { heading: "Trees", rows: trees },
      { heading: "Axes", rows: axes },
    ],
  };
}

/* The skills this world has no content for yet. The line is the same kind of
   statement the quest journal makes about quests - better an honest empty
   guide than an invented one. */
function emptyGuide(intro, notes) {
  return { intro, sections: [{ heading: "Training", rows: notes.map((n) => row(null, null, n)) }] };
}

/* The Thieving guide (src/PLAN.md unit Q). Everything it lists is read out of
   the skill's own two data tables (src/items.js#PICKPOCKET / #STALLS), so the
   guide can never name a target or a stall the world does not have. The one
   name it has to spell out is the knight's, whose second word the cache
   capitalises (src/game.js#NPC_NAMES has the same pair, duplicated here because
   importing game.js from the skill guides would close an import cycle). */
const PICKPOCKET_NAMES = { knight_of_ardougne: "Knight of Ardougne" };

function thievingGuide() {
  const people = [];
  for (const [type, r] of Object.entries(PICKPOCKET)) {
    const name = PICKPOCKET_NAMES[type] || type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    people.push(row(null, r.level, "Pickpocket a " + name + " for " + xpText(r.xp) + " and up to " + r.coins[1] + " coins"));
  }
  people.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  const stalls = [];
  for (const s of Object.values(STALLS)) {
    const loot = s.loot.map((l) => itemName(l[0]).toLowerCase()).join(", ");
    stalls.push(row(itemIcon(s.loot[0][0]), s.level, "Steal from the " + s.name.toLowerCase() + " for " + xpText(s.xp) + ": " + loot));
  }
  stalls.sort((a, b) => a.level - b.level);
  return {
    intro: "Steal from a person's pockets or a market stall. A stall never fails, but a guard who sees the theft will come for you; a person can catch your hand, stun you and take a hit off you.",
    sections: [
      { heading: "Pickpocketing", rows: people },
      { heading: "Stalls", rows: stalls },
    ],
  };
}

/* The Herblore guide (src/PLAN.md unit T12). Every row is read out of the two
   data tables in src/items.js - #HERB_TABLE (through #HERBS) and #POTIONS - so
   the guide can never name a herb or a potion this world has not got. The
   three sections are the skill's own three clicks: clean a grimy herb, stand
   the clean herb in a vial of water, then add the row's own secondary. The
   right-hand note is the potion's effect, the same fields src/actions.js#doDrink
   reads, worded short (nothing that drinks for you happens anywhere the guide
   does not say). */
function potionEffectText(p) {
  const amount = (f, flat) => (f ? Math.round(f * 100) + "%" : "") + (flat ? (f ? "+" : "") + flat : "");
  const parts = [];
  for (const [k, v] of Object.entries(p.boosts || {})) parts.push(SKILL_NAME[k] + " +" + amount(v[0], v[1]));
  for (const [k, v] of Object.entries(p.drains || {})) parts.push(SKILL_NAME[k] + " -" + amount(v[0], v[1]));
  if (p.heal) parts.push("heals " + amount(p.heal[0], p.heal[1]));
  if (p.prayer) parts.push("prayer +" + amount(p.prayer[0], p.prayer[1]));
  if (p.restore) parts.push("restores drained stats");
  if (p.energy) parts.push("energy +" + Math.round(p.energy * 100) + "%");
  if (p.cure) parts.push("antipoison " + p.cure / 60 + " min");
  if (p.antifire) parts.push("antifire " + p.antifire / 60 + " min");
  /* A weapon poison is not drunk, so its note is what it does to a blade: the
     two published initial damages, melee and ranged (src/items.js#WEAPON_POISON). */
  if (p.weaponPoison) {
    const w = WEAPON_POISON[p.weaponPoison];
    parts.push("coats a weapon, poison " + w.melee + " melee / " + w.ranged + " ranged");
  }
  return parts.join(", ");
}

function herbloreGuide() {
  const cleaning = [];
  const unfs = [];
  const potions = [];
  for (const h of Object.values(HERBS)) {
    const name = ITEMS[h.id].name;
    cleaning.push(row(itemIcon(h.id), h.cleanLevel, name + " - clean a grimy herb (" + xpText(h.cleanXp) + ")"));
    unfs.push(row(itemIcon(h.unfId), h.unfLevel, ITEMS[h.unfId].name + " - a clean " + name.toLowerCase() + " and a vial of water"));
  }
  /* The two coconut-milk unfinished potions belong with the herb ones - they
     are the same step with a different vial - and their level is the potion
     row's own, because in the live game the whole recipe unlocks at once. */
  for (const p of POTIONS) {
    if (!p.unf || !p.first) continue;
    unfs.push(row(itemIcon(p.unf), p.level, ITEMS[p.unf].name + " - a " + ITEMS[p.first].name.toLowerCase() + " and a vial of " + ITEMS[p.base].name.toLowerCase()));
  }
  cleaning.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  unfs.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  /* The two coconut-milk poisons have no herb: their second ingredient goes
     into a vial the *first* one opened (src/items.js#POTIONS' base/first/unf),
     so their row names both ingredients and the vial they stand in. */
  for (const p of POTIONS) {
    const product = p.doses === 1 ? p.id : p.id + "_3";
    const base = p.base ? ITEMS[p.base].name.toLowerCase() : ITEMS[p.herb].name.toLowerCase();
    const first = p.first ? ITEMS[p.first].name.toLowerCase() + " + " : "";
    potions.push(row(itemIcon(product), p.level, p.name + " - " + first + base + " + " + ITEMS[p.secondary].name.toLowerCase() + " (" + xpText(p.xp) + ")", potionEffectText(p)));
  }
  potions.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  return {
    intro: "Clean grimy herbs, mix them into vials of water, then add each potion's own second ingredient. The two strongest weapon poisons instead open a vial of coconut milk with a cactus spine or a cave nightshade. The town herbalist sells vials, secondaries and the coconut milk, and will mix whatever your pack can make.",
    sections: [
      { heading: "Cleaning", rows: cleaning },
      { heading: "Unfinished potions", rows: unfs },
      { heading: "Potions", rows: potions },
    ],
  };
}

const BUILDERS = {
  attack: () => weaponsGuide("attack"),
  strength: strengthGuide,
  defence: () => armourGuide("defence"),
  hitpoints: hitpointsGuide,
  ranged: rangedGuide,
  prayer: prayerGuide,
  magic: magicGuide,
  runecrafting: runecraftingGuide,
  agility: agilityGuide,
  herblore: herbloreGuide,
  thieving: thievingGuide,
  crafting: craftingGuide,
  fletching: fletchingGuide,
  slayer: () => emptyGuide(
    "Slayer is not trained in this world yet.",
    ["Nothing here assigns Slayer tasks.", "Monsters can be fought with or without one."]),
  hunter: () => emptyGuide(
    "Hunter is not trained in this world yet.",
    ["There are no implings, no birds and no traps."]),
  mining: miningGuide,
  smithing: smithingGuide,
  fishing: fishingGuide,
  cooking: cookingGuide,
  firemaking: firemakingGuide,
  woodcutting: woodcuttingGuide,
  farming: () => emptyGuide(
    "Farming is not trained in this world yet.",
    ["There are no patches, seeds or crops."]),
  construction: () => emptyGuide(
    "Construction is not trained in this world yet.",
    ["There is no player-owned house to build in."]),
};

const cache = new Map();

/* The guide for one skill, built on first use and kept. */
export function buildGuide(skillId) {
  if (cache.has(skillId)) return cache.get(skillId);
  const build = BUILDERS[skillId];
  const guide = build ? build() : emptyGuide("There is no guide for that skill.", []);
  guide.title = (SKILL_NAME[skillId] || skillId) + " Guide";
  cache.set(skillId, guide);
  return guide;
}
