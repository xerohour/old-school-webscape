const B = () => ({ astab: 0, aslash: 0, acrush: 0, amagic: 0, arange: 0, dstab: 0, dslash: 0, dcrush: 0, dmagic: 0, drange: 0, str: 0, rstr: 0, mdmg: 0, pray: 0 });

export const ITEMS = {};

/* The client's own stack ceiling. The 317 client keeps a stack count in a
   signed 32-bit field, so no stack - coins, runes, arrows, anything - can hold
   more than 2^31-1, the number the real game's "max cash" stack sits at (and
   why 2147M is the highest a coin pile ever displays in it). Stacks fill to
   here and no further; whatever is left over is the caller's overflow, which
   ::give spills into the bank and reports if it will not fit. */
export const MAX_STACK = 2147483647;

function def(id, o) {
  const it = Object.assign(
    {
      id,
      name: o.name || id,
      examine: o.examine || "",
      value: o.value || 1,
      stack: !!o.stack,
      slot: o.slot || null,
      two: !!o.two,
      style: o.style || null,
      speed: o.speed || 4,
      req: o.req || null,
      bonus: o.bonus || B(),
      heal: o.heal || 0,
      tier: o.tier || 0,
      kind: o.kind || "misc",
      colour: o.colour || 0x9a9a94,
      shape: o.shape || null,
      toolSkill: o.toolSkill || null,
    },
    o
  );
  ITEMS[id] = it;
  return it;
}

/* ------------------------------------------------------------- the weapons

   Every melee weapon in this world, one row per item, and every field in the row
   is the item's own: the attack and defence bonuses, the strength bonus, the
   attack speed, the wield requirement, the shop value and the examine text are
   all as the live game publishes them. That is why the rows are spelled out
   rather than generated from a metal x shape cross-product - the game has a
   bronze hasta but no white one, a black spear but no dragon shortsword, and a
   dragon dagger that is a bigger step over rune than any other tier step. The
   earlier hand-tuned `a`/`s` progression is gone for the same reason: it made a
   rune scimitar's stab bonus zero, which is not what a player who has held one
   remembers.

   Row shape: [id, name, examine, shape, category, speed, two-handed, value,
   wield requirement, bonuses, extra].

     * shape      - picks the combat styles (COMBAT_STYLES at the bottom of this
                    file) and the wield model the cache bake looks for
                    (src/tools/cache-bake/held.mjs#HELD_SHAPES).
     * category   - only the skill guide reads this: it is the heading the item
                    is filed under (src/skillguides.js#CATEGORY).
     * two        - the item's own handedness, *not* its shape's. Dharok's
                    greataxe is a battleaxe in shape and fills both hands; the
                    bronze battleaxe does not.
     * extra      - the odd field out, copied straight onto the item. The
                    woodcutting and mining tools carry their `toolSkill` and
                    their `axes`/`power` rank, which src/actions.js reads to work
                    out how fast the tool swings. A weapon whose own attack
                    animation is not its shape's (the Barrows set, the granite
                    maul, the dragon dagger) carries `anims`, one animation name
                    per style button, which src/items.js#attackAnimFor prefers
                    over the shape table - so those five rows below are the whole
                    list of weapons that do not simply animate as their family.
                    A weapon with a special attack carries `spec` and `specCost`
                    - the published name and the percentage of the bar it drains
                    - which is what lights the combat panel's special bar
                    (src/ui.js#renderCombatPanel) and what src/combat.js#SPECIALS
                    keys its effect off. Seventeen rows carry one today:
                    Puncture, Cleave, Sever, Shatter, Rampage, Powerstab, Impale,
                    Sweep, Shove, Lumber Up, Energy Drain, Quick Smash, Weaken,
                    Sanctuary, Favour of the War God, Snapshot and Powershot.

   A bonus left out of the object is zero. `B()` below is the full field list. */
const WEAPON_TABLE = [
  /* Daggers */
  ["bronze_dagger", "Bronze dagger", "Short but pointy.", "dagger", "dagger", 4, 0, 10, { attack: 1 }, { astab: 4, aslash: 2, acrush: -4, amagic: 1, dmagic: 1, str: 3 }],
  ["iron_dagger", "Iron dagger", "Short but pointy.", "dagger", "dagger", 4, 0, 35, { attack: 1 }, { astab: 5, aslash: 3, acrush: -4, amagic: 1, dmagic: 1, str: 4 }],
  ["steel_dagger", "Steel dagger", "Short but pointy.", "dagger", "dagger", 4, 0, 125, { attack: 5 }, { astab: 8, aslash: 4, acrush: -4, amagic: 1, dmagic: 1, str: 7 }],
  ["black_dagger", "Black dagger", "A vicious black dagger.", "dagger", "dagger", 4, 0, 240, { attack: 10 }, { astab: 10, aslash: 5, acrush: -4, amagic: 1, dmagic: 1, str: 7 }],
  ["white_dagger", "White dagger", "A vicious white dagger.", "dagger", "dagger", 4, 0, 240, { attack: 10 }, { astab: 10, aslash: 5, acrush: -4, amagic: 1, dmagic: 1, str: 7, pray: 1 }],
  ["mithril_dagger", "Mithril dagger", "A dangerous dagger.", "dagger", "dagger", 4, 0, 325, { attack: 20 }, { astab: 11, aslash: 5, acrush: -4, amagic: 1, dmagic: 1, str: 10 }],
  ["adamant_dagger", "Adamant dagger", "Short and deadly.", "dagger", "dagger", 4, 0, 800, { attack: 30 }, { astab: 15, aslash: 8, acrush: -4, amagic: 1, dmagic: 1, str: 14 }],
  ["rune_dagger", "Rune dagger", "A powerful dagger.", "dagger", "dagger", 4, 0, 8000, { attack: 40 }, { astab: 25, aslash: 12, acrush: -4, amagic: 1, dmagic: 1, str: 24 }],
  ["dragon_dagger", "Dragon dagger", "A powerful dagger.", "dagger", "dagger", 4, 0, 30000, { attack: 60 }, { astab: 40, aslash: 25, acrush: -4, amagic: 1, dmagic: 1, str: 40 }, { anims: ["attack_dragon_dagger", "attack_dragon_dagger", "attack_dragon_dagger", "attack_dragon_dagger"], spec: "Puncture", specCost: 25 }],
  /* Swords */
  ["bronze_sword", "Bronze sword", "A razor sharp sword.", "sword", "sword", 4, 0, 26, { attack: 1 }, { astab: 4, aslash: 3, acrush: -2, dslash: 2, dcrush: 1, str: 5 }],
  ["iron_sword", "Iron sword", "A razor sharp sword.", "sword", "sword", 4, 0, 91, { attack: 1 }, { astab: 6, aslash: 4, acrush: -2, dslash: 2, dcrush: 1, str: 7 }],
  ["steel_sword", "Steel sword", "A razor sharp sword.", "sword", "sword", 4, 0, 325, { attack: 5 }, { astab: 11, aslash: 8, acrush: -2, dslash: 2, dcrush: 1, str: 12 }],
  ["black_sword", "Black sword", "A razor sharp sword.", "sword", "sword", 4, 0, 624, { attack: 10 }, { astab: 14, aslash: 10, acrush: -2, dslash: 2, dcrush: 1, str: 12 }],
  ["white_sword", "White sword", "A razor sharp sword.", "sword", "sword", 4, 0, 624, { attack: 10 }, { astab: 14, aslash: 10, acrush: -2, dslash: 2, dcrush: 1, str: 12, pray: 1 }],
  ["mithril_sword", "Mithril sword", "A razor sharp sword.", "sword", "sword", 4, 0, 845, { attack: 20 }, { astab: 16, aslash: 11, acrush: -2, dslash: 2, dcrush: 1, str: 17 }],
  ["adamant_sword", "Adamant sword", "A razor sharp sword.", "sword", "sword", 4, 0, 2080, { attack: 30 }, { astab: 23, aslash: 18, acrush: -2, dslash: 2, dcrush: 1, str: 24 }],
  ["rune_sword", "Rune sword", "A razor sharp sword.", "sword", "sword", 4, 0, 20800, { attack: 40 }, { astab: 38, aslash: 26, acrush: -2, dslash: 2, dcrush: 1, str: 39 }],
  /* Longswords */
  ["bronze_longsword", "Bronze longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 40, { attack: 1 }, { astab: 4, aslash: 5, acrush: -2, dslash: 3, dcrush: 2, str: 7 }],
  ["iron_longsword", "Iron longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 140, { attack: 1 }, { astab: 6, aslash: 8, acrush: -2, dslash: 3, dcrush: 2, str: 10 }],
  ["steel_longsword", "Steel longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 500, { attack: 5 }, { astab: 9, aslash: 14, acrush: -2, dslash: 3, dcrush: 2, str: 16 }],
  ["black_longsword", "Black longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 960, { attack: 10 }, { astab: 13, aslash: 18, acrush: -2, dslash: 3, dcrush: 2, str: 16 }],
  ["white_longsword", "White longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 960, { attack: 10 }, { astab: 13, aslash: 18, acrush: -2, dslash: 3, dcrush: 2, str: 16, pray: 1 }],
  ["mithril_longsword", "Mithril longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 1300, { attack: 20 }, { astab: 15, aslash: 20, acrush: -2, dslash: 3, dcrush: 2, str: 22 }],
  ["adamant_longsword", "Adamant longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 3200, { attack: 30 }, { astab: 20, aslash: 29, acrush: -2, dslash: 3, dcrush: 2, str: 31 }],
  ["rune_longsword", "Rune longsword", "A razor sharp longsword.", "longsword", "longsword", 5, 0, 32000, { attack: 40 }, { astab: 38, aslash: 47, acrush: -2, dslash: 3, dcrush: 2, str: 49 }],
  ["dragon_longsword", "Dragon longsword", "A very powerful sword.", "longsword", "longsword", 5, 0, 100000, { attack: 60 }, { astab: 58, aslash: 69, acrush: -2, dslash: 3, dcrush: 2, str: 71 }, { spec: "Cleave", specCost: 25 }],
  ["third_age_longsword", "3rd age longsword", "A beautifully crafted sword forged by ancient blacksmiths.", "third_age_longsword", "longsword", 5, 0, 150000, { attack: 65 }, { aslash: 72, acrush: 60, dslash: 3, dcrush: 2, str: 75 }, { cacheId: 12426 }],
  /* Scimitars */
  ["bronze_scimitar", "Bronze scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 32, { attack: 1 }, { astab: 1, aslash: 7, acrush: -2, dslash: 1, str: 6 }],
  ["iron_scimitar", "Iron scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 112, { attack: 1 }, { astab: 2, aslash: 10, acrush: -2, dslash: 1, str: 9 }],
  ["steel_scimitar", "Steel scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 400, { attack: 5 }, { astab: 3, aslash: 15, acrush: -2, dslash: 1, str: 14 }],
  ["black_scimitar", "Black scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 768, { attack: 10 }, { astab: 4, aslash: 19, acrush: -2, dslash: 1, str: 14 }],
  ["white_scimitar", "White scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 768, { attack: 10 }, { astab: 4, aslash: 19, acrush: -2, dslash: 1, str: 14, pray: 1 }],
  ["mithril_scimitar", "Mithril scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 1040, { attack: 20 }, { astab: 5, aslash: 21, acrush: -2, dslash: 1, str: 20 }],
  ["adamant_scimitar", "Adamant scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 2560, { attack: 30 }, { astab: 6, aslash: 29, acrush: -2, dslash: 1, str: 28 }],
  ["rune_scimitar", "Rune scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 25600, { attack: 40 }, { astab: 7, aslash: 45, acrush: -2, dslash: 1, str: 44 }],
  ["dragon_scimitar", "Dragon scimitar", "A vicious, curved sword.", "scimitar", "scimitar", 4, 0, 100000, { attack: 60 }, { astab: 8, aslash: 67, acrush: -2, dslash: 1, str: 66 }, { spec: "Sever", specCost: 55 }],
  /* Maces */
  ["bronze_mace", "Bronze mace", "A spiky mace.", "mace", "mace", 4, 0, 18, { attack: 1 }, { astab: 1, aslash: -2, acrush: 6, str: 5, pray: 1 }],
  ["iron_mace", "Iron mace", "A spiky mace.", "mace", "mace", 4, 0, 63, { attack: 1 }, { astab: 4, aslash: -2, acrush: 9, str: 7, pray: 1 }],
  ["steel_mace", "Steel mace", "A spiky mace.", "mace", "mace", 4, 0, 225, { attack: 5 }, { astab: 7, aslash: -2, acrush: 13, str: 11, pray: 2 }],
  ["black_mace", "Black mace", "A spiky mace.", "mace", "mace", 4, 0, 432, { attack: 10 }, { astab: 8, aslash: -2, acrush: 16, str: 13, pray: 2 }],
  ["white_mace", "White mace", "A spiky mace.", "mace", "mace", 4, 0, 432, { attack: 10 }, { astab: 8, aslash: -2, acrush: 16, str: 13, pray: 3 }],
  ["mithril_mace", "Mithril mace", "A spiky mace.", "mace", "mace", 4, 0, 585, { attack: 20 }, { astab: 11, aslash: -2, acrush: 18, str: 16, pray: 3 }],
  ["adamant_mace", "Adamant mace", "A spiky mace.", "mace", "mace", 4, 0, 1440, { attack: 30 }, { astab: 13, aslash: -2, acrush: 25, str: 23, pray: 3 }],
  ["rune_mace", "Rune mace", "A spiky mace.", "mace", "mace", 4, 0, 14400, { attack: 40 }, { astab: 20, aslash: -2, acrush: 39, str: 36, pray: 4 }],
  ["dragon_mace", "Dragon mace", "A spiky mace.", "mace", "mace", 4, 0, 50000, { attack: 60 }, { astab: 40, aslash: -2, acrush: 60, str: 55, pray: 5 }, { spec: "Shatter", specCost: 25 }],
  /* Battleaxes */
  ["bronze_battleaxe", "Bronze battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 52, { attack: 1 }, { astab: -2, aslash: 6, acrush: 3, drange: -1, str: 9 }, { chops: true, power: 1 }],
  ["iron_battleaxe", "Iron battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 182, { attack: 1 }, { astab: -2, aslash: 8, acrush: 5, drange: -1, str: 13 }, { chops: true, power: 2 }],
  ["steel_battleaxe", "Steel battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 650, { attack: 5 }, { astab: -2, aslash: 16, acrush: 11, drange: -1, str: 20 }, { chops: true, power: 3 }],
  ["black_battleaxe", "Black battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 1248, { attack: 10 }, { astab: -2, aslash: 20, acrush: 15, drange: -1, str: 24 }, { chops: true, power: 4 }],
  ["white_battleaxe", "White battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 1248, { attack: 10 }, { astab: -2, aslash: 20, acrush: 15, drange: -1, str: 24, pray: 1 }, { chops: true, power: 4 }],
  ["mithril_battleaxe", "Mithril battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 1690, { attack: 20 }, { astab: -2, aslash: 22, acrush: 17, drange: -1, str: 29 }, { chops: true, power: 5 }],
  ["adamant_battleaxe", "Adamant battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 4160, { attack: 30 }, { astab: -2, aslash: 31, acrush: 26, drange: -1, str: 41 }, { chops: true, power: 6 }],
  ["rune_battleaxe", "Rune battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 41600, { attack: 40 }, { astab: -2, aslash: 48, acrush: 43, drange: -1, str: 64 }, { chops: true, power: 7 }],
  ["dragon_battleaxe", "Dragon battleaxe", "A vicious looking axe.", "battleaxe", "battleaxe", 6, 0, 200000, { attack: 60 }, { astab: -2, aslash: 70, acrush: 65, drange: -1, str: 85 }, { chops: true, power: 7, spec: "Rampage", specCost: 100 }],
  /* Warhammers */
  ["bronze_warhammer", "Bronze warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 47, { attack: 1 }, { astab: -4, aslash: -4, acrush: 10, amagic: -4, str: 8 }],
  ["iron_warhammer", "Iron warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 173, { attack: 1 }, { astab: -4, aslash: -4, acrush: 11, amagic: -4, str: 11 }],
  ["steel_warhammer", "Steel warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 640, { attack: 5 }, { astab: -4, aslash: -4, acrush: 18, amagic: -4, str: 18 }],
  ["black_warhammer", "Black warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 980, { attack: 10 }, { astab: -4, aslash: -4, acrush: 22, amagic: -4, str: 22 }],
  ["white_warhammer", "White warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 980, { attack: 10 }, { astab: -4, aslash: -4, acrush: 22, amagic: -4, str: 22, pray: 1 }],
  ["mithril_warhammer", "Mithril warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 1660, { attack: 20 }, { astab: -4, aslash: -4, acrush: 25, amagic: -4, str: 27 }],
  ["adamant_warhammer", "Adamant warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 4120, { attack: 30 }, { astab: -4, aslash: -4, acrush: 35, amagic: -4, str: 39 }],
  ["rune_warhammer", "Rune warhammer", "I don't think it's intended for joinery.", "warhammer", "warhammer", 6, 0, 41500, { attack: 40 }, { astab: -4, aslash: -4, acrush: 53, amagic: -4, str: 62 }],
  /* Two-handed swords */
  ["bronze_2h", "Bronze 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 80, { attack: 1 }, { astab: -4, aslash: 9, acrush: 8, amagic: -4, drange: -1, str: 10 }],
  ["iron_2h", "Iron 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 280, { attack: 1 }, { astab: -4, aslash: 13, acrush: 10, amagic: -4, drange: -1, str: 14 }],
  ["steel_2h", "Steel 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 1000, { attack: 5 }, { astab: -4, aslash: 21, acrush: 16, amagic: -4, drange: -1, str: 22 }],
  ["black_2h", "Black 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 1920, { attack: 10 }, { astab: -4, aslash: 27, acrush: 21, amagic: -4, drange: -1, str: 26 }],
  ["white_2h", "White 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 1920, { attack: 10 }, { astab: -4, aslash: 27, acrush: 21, amagic: -4, drange: -1, str: 26, pray: 1 }],
  ["mithril_2h", "Mithril 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 2600, { attack: 20 }, { astab: -4, aslash: 30, acrush: 24, amagic: -4, drange: -1, str: 31 }],
  ["adamant_2h", "Adamant 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 6400, { attack: 30 }, { astab: -4, aslash: 43, acrush: 30, amagic: -4, drange: -1, str: 44 }],
  ["rune_2h", "Rune 2h sword", "A two handed sword.", "2h", "2h", 7, 1, 64000, { attack: 40 }, { astab: -4, aslash: 69, acrush: 50, amagic: -4, drange: -1, str: 70 }],
  ["dragon_2h", "Dragon 2h sword", "A two-handed Dragon Sword.", "2h", "2h", 7, 1, 220000, { attack: 60 }, { astab: -4, aslash: 92, acrush: 80, amagic: -4, drange: -1, str: 93 }, { spec: "Powerstab", specCost: 60 }],
  /* Claws */
  ["bronze_claws", "Bronze claws", "A set of fighting claws.", "claws", "claws", 4, 1, 15, { attack: 1 }, { astab: 3, aslash: 4, acrush: -4, dstab: 1, dslash: 2, dcrush: 1, str: 5 }],
  ["iron_claws", "Iron claws", "A set of fighting claws.", "claws", "claws", 4, 1, 50, { attack: 1 }, { astab: 4, aslash: 6, acrush: -4, dstab: 2, dslash: 3, dcrush: 1, str: 7 }],
  ["steel_claws", "Steel claws", "A set of fighting claws.", "claws", "claws", 4, 1, 175, { attack: 5 }, { astab: 8, aslash: 11, acrush: -4, dstab: 3, dslash: 6, dcrush: 2, str: 12 }],
  ["black_claws", "Black claws", "A set of fighting claws.", "claws", "claws", 4, 1, 360, { attack: 10 }, { astab: 10, aslash: 14, acrush: -4, dstab: 4, dslash: 7, dcrush: 2, str: 14 }],
  ["white_claws", "White claws", "A set of fighting claws.", "claws", "claws", 4, 1, 360, { attack: 10 }, { astab: 10, aslash: 14, acrush: -4, dstab: 4, dslash: 7, dcrush: 2, str: 14, pray: 1 }],
  ["mithril_claws", "Mithril claws", "A set of fighting claws.", "claws", "claws", 4, 1, 475, { attack: 20 }, { astab: 11, aslash: 16, acrush: -4, dstab: 4, dslash: 8, dcrush: 2, str: 17 }],
  ["adamant_claws", "Adamant claws", "A set of fighting claws.", "claws", "claws", 4, 1, 1200, { attack: 30 }, { astab: 18, aslash: 23, acrush: -4, dstab: 6, dslash: 12, dcrush: 3, str: 24 }],
  ["rune_claws", "Rune claws", "A set of fighting claws.", "claws", "claws", 4, 1, 12000, { attack: 40 }, { astab: 26, aslash: 38, acrush: -4, dstab: 10, dslash: 19, dcrush: 5, str: 39 }, { spec: "Impale", specCost: 25 }],
  /* Halberds */
  ["bronze_halberd", "Bronze halberd", "A bronze halberd.", "halberd", "halberd", 7, 1, 80, { attack: 1 }, { astab: 7, aslash: 8, amagic: -4, dstab: -1, dslash: 1, dcrush: 2, str: 8 }],
  ["iron_halberd", "Iron halberd", "An iron halberd.", "halberd", "halberd", 7, 1, 280, { attack: 1 }, { astab: 9, aslash: 12, amagic: -4, dstab: -1, dslash: 1, dcrush: 2, str: 12 }],
  ["steel_halberd", "Steel halberd", "A steel halberd.", "halberd", "halberd", 7, 1, 1000, { attack: 5 }, { astab: 14, aslash: 19, amagic: -4, dstab: -1, dslash: 1, dcrush: 2, str: 20 }],
  ["black_halberd", "Black halberd", "A black halberd.", "halberd", "halberd", 7, 1, 1920, { attack: 10, strength: 5 }, { astab: 19, aslash: 25, amagic: -4, dstab: -1, dslash: 2, dcrush: 3, str: 20 }],
  ["white_halberd", "White halberd", "A white halberd.", "halberd", "halberd", 7, 1, 1920, { attack: 10, strength: 5 }, { astab: 19, aslash: 25, amagic: -4, dstab: -1, dslash: 2, dcrush: 3, str: 20, pray: 1 }],
  ["mithril_halberd", "Mithril halberd", "A mithril halberd.", "halberd", "halberd", 7, 1, 2600, { attack: 20, strength: 10 }, { astab: 22, aslash: 28, amagic: -4, dstab: -1, dslash: 2, dcrush: 4, str: 29 }],
  ["adamant_halberd", "Adamant halberd", "An adamant halberd.", "halberd", "halberd", 7, 1, 6400, { attack: 30, strength: 15 }, { astab: 28, aslash: 41, amagic: -4, dstab: -1, dslash: 3, dcrush: 4, str: 42 }],
  ["rune_halberd", "Rune halberd", "A rune halberd.", "halberd", "halberd", 7, 1, 64000, { attack: 40, strength: 20 }, { astab: 48, aslash: 67, amagic: -4, dstab: -1, dslash: 4, dcrush: 5, str: 68 }],
  ["dragon_halberd", "Dragon halberd", "A dragon halberd.", "halberd", "halberd", 7, 1, 250000, { attack: 60, strength: 30 }, { astab: 70, aslash: 95, amagic: -4, dstab: -1, dslash: 4, dcrush: 5, str: 89 }, { spec: "Sweep", specCost: 30 }],
  /* This world's own halberd, and the only item here whose *mesh* was drawn
     outside this project: it arrived as a Metasequoia document
     (src/tools/hand-models/armadyl-halberd.mqo) and is turned into both of its
     models by armadyl-halberd.mjs in that same folder - see "Hand-authored
     models" in src/README.md. There is no Armadyl halberd in any cache or
     revision to transcribe, so, like the lightning dagger, every number below
     is this world's own: the tier above the dragon halberd (75 Attack /
     40 Strength), on the halberd's own three styles and its 7-tick swing, with
     an Armadyl-flavoured special.

     Its `shape` is a key of its own rather than `halberd`, for the reason in
     src/tools/hand-models/README.md: the wield-model bake looks a cache item up
     per shape, and an item whose meshes are hand-authored must not send it
     looking for one that cannot exist. It still files under `halberd` in the
     Attack guide (`cat`), because it is one - the only hand-authored weapon
     whose live family exists. */
  ["armadyl_halberd", "Armadyl halberd", "A halberd said to have been forged by Armadyl himself.", "armadyl_halberd", "halberd", 7, 1, 2000000, { attack: 75, strength: 40 }, { astab: 80, aslash: 112, amagic: -4, dstab: -1, dslash: 5, dcrush: 6, str: 106 }, { spec: "Armadyl's Judgement", specCost: 50 }],
  /* Spears */
  ["bronze_spear", "Bronze spear", "A bronze tipped spear.", "spear", "spear", 4, 1, 26, { attack: 1 }, { astab: 5, aslash: 5, acrush: 5, dstab: 1, dslash: 1, str: 6 }],
  ["iron_spear", "Iron spear", "An iron tipped spear.", "spear", "spear", 4, 1, 91, { attack: 1 }, { astab: 8, aslash: 8, acrush: 8, dstab: 1, dslash: 1, str: 10 }],
  ["steel_spear", "Steel spear", "A steel tipped spear.", "spear", "spear", 4, 1, 325, { attack: 5 }, { astab: 12, aslash: 12, acrush: 12, dstab: 1, dslash: 1, str: 12 }],
  ["black_spear", "Black spear", "A black tipped spear.", "spear", "spear", 4, 1, 650, { attack: 10 }, { astab: 15, aslash: 15, acrush: 15, dstab: 1, dslash: 1, str: 16 }],
  ["mithril_spear", "Mithril spear", "A mithril tipped spear.", "spear", "spear", 4, 1, 845, { attack: 20 }, { astab: 17, aslash: 17, acrush: 17, dstab: 1, dslash: 1, str: 18 }],
  ["adamant_spear", "Adamant spear", "An adamantite tipped spear.", "spear", "spear", 4, 1, 2080, { attack: 30 }, { astab: 24, aslash: 24, acrush: 24, dstab: 1, dslash: 1, str: 28 }],
  ["rune_spear", "Rune spear", "A rune tipped spear.", "spear", "spear", 4, 1, 20800, { attack: 40 }, { astab: 36, aslash: 36, acrush: 36, dstab: 1, dslash: 1, str: 42 }],
  ["dragon_spear", "Dragon spear", "A dragon tipped spear.", "spear", "spear", 4, 1, 62400, { attack: 60 }, { astab: 55, aslash: 55, acrush: 55, dstab: 5, dslash: 5, dcrush: 5, dmagic: 5, drange: 5, str: 60 }, { spec: "Shove", specCost: 25 }],
  ["bone_spear", "Bone spear", "Basic but brutal!", "spear", "spear", 6, 1, 600, { attack: 1 }, { astab: 11, aslash: 11, acrush: 11, dstab: 1, dslash: 1, str: 13 }],
  ["leaf_bladed_spear", "Leaf-bladed spear", "A spear with a leaf-shaped point.", "spear", "spear", 5, 1, 31000, { slayer: 55, attack: 50 }, { astab: 47, aslash: 42, acrush: 36, dstab: 1, dslash: 1, str: 50 }],
  /* Hastae */
  ["bronze_hasta", "Bronze hasta", "A bronze-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 26, { attack: 1 }, { astab: 5, aslash: 5, acrush: 5, dstab: -1, dslash: -1, dcrush: -1, drange: -1, str: 6 }],
  ["iron_hasta", "Iron hasta", "An iron-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 91, { attack: 1 }, { astab: 8, aslash: 8, acrush: 8, dstab: -2, dslash: -2, dcrush: -2, drange: -2, str: 10 }],
  ["steel_hasta", "Steel hasta", "A steel-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 325, { attack: 5 }, { astab: 12, aslash: 12, acrush: 12, dstab: -3, dslash: -3, dcrush: -3, drange: -3, str: 12 }],
  ["mithril_hasta", "Mithril hasta", "A mithril-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 845, { attack: 20 }, { astab: 17, aslash: 17, acrush: 17, dstab: -5, dslash: -5, dcrush: -4, drange: -5, str: 18 }],
  ["adamant_hasta", "Adamant hasta", "An adamant-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 2080, { attack: 30 }, { astab: 24, aslash: 24, acrush: 24, dstab: -6, dslash: -7, dcrush: -5, drange: -6, str: 28 }],
  ["rune_hasta", "Rune hasta", "A rune-tipped, one-handed hasta.", "spear", "hasta", 4, 0, 20800, { attack: 40 }, { astab: 36, aslash: 36, acrush: 36, dstab: -10, dslash: -10, dcrush: -9, drange: -10, str: 42 }],
  /* Axes */
  ["bronze_axe", "Bronze axe", "A woodcutter's axe.", "axe", "axe", 5, 0, 16, { attack: 1 }, { astab: -2, aslash: 4, acrush: 2, dslash: 1, str: 5 }, { toolSkill: "woodcutting", power: 1 }],
  ["iron_axe", "Iron axe", "A woodcutter's axe.", "axe", "axe", 5, 0, 56, { attack: 1 }, { astab: -2, aslash: 5, acrush: 3, dslash: 1, str: 7 }, { toolSkill: "woodcutting", power: 2 }],
  ["steel_axe", "Steel axe", "A woodcutter's axe.", "axe", "axe", 5, 0, 200, { attack: 5 }, { astab: -2, aslash: 8, acrush: 6, dslash: 1, str: 9 }, { toolSkill: "woodcutting", power: 3 }],
  ["black_axe", "Black axe", "A sinister looking axe.", "axe", "axe", 5, 0, 384, { attack: 10 }, { astab: -2, aslash: 10, acrush: 8, dslash: 1, str: 12 }, { toolSkill: "woodcutting", power: 4 }],
  ["mithril_axe", "Mithril axe", "A powerful axe.", "axe", "axe", 5, 0, 520, { attack: 20 }, { astab: -2, aslash: 12, acrush: 10, dslash: 1, str: 13 }, { toolSkill: "woodcutting", power: 5 }],
  ["adamant_axe", "Adamant axe", "A powerful axe.", "axe", "axe", 5, 0, 1280, { attack: 30 }, { astab: -2, aslash: 17, acrush: 15, dslash: 1, str: 19 }, { toolSkill: "woodcutting", power: 6 }],
  ["rune_axe", "Rune axe", "A powerful axe.", "axe", "axe", 5, 0, 12800, { attack: 40 }, { astab: -2, aslash: 26, acrush: 24, dslash: 1, str: 29 }, { toolSkill: "woodcutting", power: 7 }],
  ["dragon_axe", "Dragon axe", "A very powerful axe.", "axe", "axe", 5, 0, 55000, { attack: 60 }, { astab: -2, aslash: 38, acrush: 32, dslash: 1, str: 42 }, { toolSkill: "woodcutting", power: 8, spec: "Lumber Up", specCost: 100 }],
  ["third_age_axe", "3rd age axe", "A beautifully crafted axe, shaped by ancient smiths.", "axe", "axe", 5, 0, 55000, { attack: 65 }, { astab: -2, aslash: 38, acrush: 32, dslash: 1, str: 42 }, { toolSkill: "woodcutting", power: 8, spec: "Lumber Up", specCost: 100, cacheId: 20011 }],
  /* Pickaxes */
  ["bronze_pickaxe", "Bronze pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 1, { mining: 1, attack: 1 }, { astab: 4, aslash: -2, acrush: 2, dslash: 1, str: 5 }, { toolSkill: "mining", power: 1 }],
  ["iron_pickaxe", "Iron pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 140, { mining: 1, attack: 1 }, { astab: 5, aslash: -2, acrush: 3, dslash: 1, str: 7 }, { toolSkill: "mining", power: 2 }],
  ["steel_pickaxe", "Steel pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 500, { mining: 6, attack: 5 }, { astab: 8, aslash: -2, acrush: 6, dslash: 1, str: 9 }, { toolSkill: "mining", power: 3 }],
  ["mithril_pickaxe", "Mithril pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 1300, { mining: 21, attack: 20 }, { astab: 12, aslash: -2, acrush: 10, dslash: 1, str: 13 }, { toolSkill: "mining", power: 5 }],
  ["adamant_pickaxe", "Adamant pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 3200, { mining: 31, attack: 30 }, { astab: 17, aslash: -2, acrush: 15, dslash: 1, str: 19 }, { toolSkill: "mining", power: 6 }],
  ["rune_pickaxe", "Rune pickaxe", "Used for mining.", "pickaxe", "pickaxe", 5, 0, 32000, { mining: 41, attack: 40 }, { astab: 26, aslash: -2, acrush: 24, dslash: 1, str: 29 }, { toolSkill: "mining", power: 7 }],
  ["third_age_pickaxe", "3rd age pickaxe", "A beautifully crafted pickaxe, shaped by ancient smiths.", "pickaxe", "pickaxe", 5, 0, 97950, { mining: 61, attack: 65 }, { astab: 38, aslash: -2, acrush: 32, dslash: 1, str: 42 }, { toolSkill: "mining", power: 8, cacheId: 20014 }],

  /* the abyss and the Barrows crypts: the weapons with no metal behind them */
  /* Whips */
  ["abyssal_whip", "Abyssal whip", "A weapon from the abyss.", "whip", "whip", 4, 0, 120001, { attack: 70 }, { aslash: 82, str: 82 }, { spec: "Energy Drain", specCost: 50 }],
  /* Mauls */
  ["granite_maul", "Granite maul", "Simplicity is the best weapon.", "warhammer", "maul", 7, 1, 50000, { attack: 50, strength: 50 }, { acrush: 81, str: 79 }, { anims: ["attack_maul", "attack_maul", "attack_maul"], spec: "Quick Smash", specCost: 50 }],

  /* the four brothers' own weapons */
  /* Barrows weapons */
  ["dharoks_greataxe", "Dharok's greataxe", "Dharok the Wretched's greataxe.", "battleaxe", "barrows", 7, 1, 208000, { attack: 70, strength: 70 }, { astab: -4, aslash: 103, acrush: 95, amagic: -4, drange: -1, str: 105 }, { chops: true, power: 7, anims: ["attack_greataxe", "attack_greataxe", "attack_greataxe_smash", "attack_greataxe"] }],
  ["torags_hammers", "Torag's hammers", "Torag the Corrupted's twin hammers.", "warhammer", "barrows", 5, 1, 160000, { attack: 70, strength: 70 }, { astab: -4, aslash: -4, acrush: 85, amagic: -4, str: 72 }, { anims: ["attack_hammers", "attack_hammers", "attack_hammers"] }],
  ["veracs_flail", "Verac's flail", "Verac the Defiled's flail.", "mace", "barrows", 5, 1, 160000, { attack: 70 }, { astab: 68, aslash: -2, acrush: 82, str: 72, pray: 6 }, { anims: ["attack_flail", "attack_flail", "attack_flail", "attack_flail"] }],
  ["guthans_warspear", "Guthan's warspear", "Guthan the Infested's warspear.", "spear", "barrows", 5, 1, 100000, { attack: 70 }, { astab: 75, aslash: 75, acrush: 75, dstab: 7, dslash: 7, dcrush: 7, str: 75 }],
  /* Karil's crossbow, the ranged arm of the six sets, and the only weapon in
     the world that fires bolt racks (src/items.js#bolt_rack). Every number is
     the item page's own: +84 ranged attack, nothing else at all - no melee or
     magic bonus and no defence - 70 Ranged to wield, a two-handed weapon, and
     the fastest crossbow in the game at four ticks (every other crossbow is
     six). `ammoKind` is not a stat the wiki prints: it is this world's rule that
     a bow fires arrows and a crossbow fires bolts, and it lives next to
     `kind: "crossbow"` because both are what src/combat.js#rangedAmmo reads. */
  ["karils_crossbow", "Karil's crossbow", "Karil the Tainted's repeating crossbow.", "crossbow", "crossbow", 4, 1, 160000, { ranged: 70 }, { arange: 84 }, { style: "ranged", kind: "crossbow", ammoKind: "bolt", range: 8 }],

  /* quest and treasure weapons that belong to no family */
  /* Special weapons */
  ["silverlight", "Silverlight", "The magical sword 'Silverlight'.", "longsword", "special", 5, 0, 50, { attack: 1 }, { astab: 9, aslash: 14, acrush: -2, dslash: 3, dcrush: 2, dmagic: 1, str: 12 }],
  ["darklight", "Darklight", "The magical sword 'Silverlight', enhanced with the blood of Agrith-Naar.", "longsword", "special", 5, 0, 500, { attack: 1 }, { astab: 10, aslash: 16, acrush: -2, dslash: 3, dcrush: 2, dmagic: 2, str: 13 }, { spec: "Weaken", specCost: 50 }],
  ["excalibur", "Excalibur", "This used to belong to King Arthur.", "longsword", "special", 5, 0, 200, { attack: 20 }, { astab: 20, aslash: 29, acrush: -2, dslash: 3, dcrush: 2, dmagic: 1, str: 25 }, { spec: "Sanctuary", specCost: 100 }],
  ["ancient_mace", "Ancient mace", "It has ancient goblin symbols on it.", "mace", "special", 5, 0, 1000, { attack: 15, prayer: 25 }, { astab: 10, aslash: -2, acrush: 16, str: 14, pray: 3 }, { spec: "Favour of the War God", specCost: 100 }],
  ["silver_sickle", "Silver sickle", "It's a silver sickle.", "longsword", "special", 5, 0, 175, {}, { dslash: 1, dcrush: 1, dmagic: 1, drange: 1, str: 1 }, { cacheId: 2961 }],
  /* A 2019 easy-Treasure-Trails reward, and the fastest one-handed weapon in
     the game: **3 ticks**, which only the swift blade, the goblin paint cannon
     and the mystic cards also reach - everything else melee is 4 or slower. All
     fourteen of its bonuses really are zero, which is why the row's bonus
     object is empty: it is a joke weapon, and its whole point is the speed.

     The live game publishes no wield requirement for it. 1 Attack is that
     requirement in everything but name - no account can be below level 1 - and
     it is what files it in the Attack guide, which lists what the skill gates
     (`src/skillguides.js#weaponsGuide`), so a weapon with a null `req` would be
     the one weapon the weapon guide does not name.

     Its shape is its own key rather than `warhammer`: it *fights* exactly like
     the cache's one-handed crush weapons (same three styles, same swing), but
     the cache has no model or animation for it at all, so a shape of its own
     keeps the wield-model bake from looking for one that cannot exist (see
     src/tools/hand-models/README.md). */
  ["ham_joint", "Ham joint", "A delicious joint of ham.", "ham_joint", "special", 3, 0, 1500, { attack: 1 }, {}],

  /* The rest of the live game's four 3-tick melee weapons, plus the one weapon
     this world invented. Every number in the first two rows is the live game's
     own - all fourteen bonuses zero on the swift blade, the minus-hundred
     stab/slash bonuses on the cards, the values, the weights, the examines -
     with exactly two deliberate exceptions, both of them the user's: **the tick
     rate** and, on the cards, **the weapon class**. The live game has all four
     of these speed-3 melee weapons (the ham joint above, the goblin paint
     cannon, the swift blade and the mystic cards) at 3 ticks; here the swift
     blade swings at **2** and the mystic cards at **1**, and the cards are
     *thrown* rather than swung - a ranged weapon of **2 tiles' reach**, fired
     off its own stack exactly like a dart or a knife (src/combat.js#thrownStack).
     That is the item's own reading rather than an invention: its examine has
     always said "You gotta really put your heart into throwing these things",
     and the live game's Duel option throws a card too.

     The cards keep the live game's *published* numbers through all of it - the
     four negatives on the row, the 50 coins, the 0.1 kg, the two-handed grip,
     and **+0 ranged attack / +0 ranged strength**, the pair the item page
     prints - so they throw, they land, and they hit for the very little a joke
     weapon should. Their **stackability** is the one field the live game's row
     does not have (theirs is one duel disk, not a deck): a thrown weapon here
     *is* its own ammunition and one comes off the weapon slot per throw, so a
     non-stackable row would empty the slot after a single card. Every thrown
     weapon stacks (src/items.js#THROWN), and so do these.

     The live game gives neither the blade nor the cards a level requirement -
     the blade is bought from Justine's Last Man Standing shop and the cards are
     a redeem code from Diango - so both carry a level-1 gate, "any account can
     hold this". *Which* skill that gate names is what files an item in a guide
     (src/skillguides.js#weaponsGuide reads `{attack: N}` and #rangedGuide reads
     `{ranged: N}`), so the cards carry `{ ranged: 1 }`: they are thrown, they
     train Ranged, and the Ranged guide's Thrown weapons section is where a
     player finds them. The blade keeps `{ attack: 1 }` (see the ham joint's
     note).

     The lightning dagger has no row to transcribe at all: no cache and no
     revision has ever had one, so its numbers are this world's own. It is built
     as a dagger of the rune tier - a dagger's accuracy, a dagger's reach, the
     rune dagger's 40 Attack gate - at speed **1**, which is the fastest the
     combat timer can hold at all (`Math.max(1, ...)`, src/combat.js#tickCombat),
     i.e. a swing every 0.6 seconds. Like the ham joint above it, its shape is a
     key of its own so the wield-model bake never looks for a cache item that
     does not exist. */
  ["swift_blade", "Swift blade", "A dull blade that moves at incredible speed.", "swift_blade", "special", 2, 0, 1500, { attack: 1 }, {}],
  ["mystic_cards", "Mystic cards", "You gotta really put your heart into throwing these things.", "mystic_cards", "special", 1, 1, 50, { ranged: 1 }, { astab: -100, aslash: -100, acrush: -50, str: -20 }, { style: "ranged", kind: "thrown", thrown: "mystic_cards", range: 2, stack: true, missile: 212 }],
  ["lightning_dagger", "Lightning dagger", "A dagger crackling with the energy of the storm.", "lightning_dagger", "special", 1, 0, 60000, { attack: 40 }, { astab: 30, aslash: 20, acrush: -4, amagic: 1, dmagic: 1, str: 26 }],
];

/* Which of the client's three melee attack bonuses a shape's style buttons roll
   against (src/combat.js#attackBonusFor reads the matching field). */
const STYLE_BY_SHAPE = {
  dagger: "stab", sword: "stab", longsword: "slash", scimitar: "slash",
  mace: "crush", battleaxe: "slash", warhammer: "crush", "2h": "slash",
  claws: "slash", halberd: "slash", spear: "stab", axe: "slash", pickaxe: "crush",
  whip: "slash", ham_joint: "crush",
  /* the cache-predates set: the swift blade and the lightning dagger are both
     Stab Sword weapons in the live game's own category table (the blade
     exclusively so, "whereas the others use Crush"). The mystic cards name no
     melee bonus here at all, because they no longer fight in melee: their row
     carries `style: "ranged"` and there is no crush button for them to roll
     against. */
  swift_blade: "stab", lightning_dagger: "stab",
  third_age_longsword: "slash",
  /* the Armadyl halberd slices like the cache's own halberds do */
  armadyl_halberd: "slash",
};

/* The metal behind an item id, for the procedural icons' fallback colour and
   nothing else - every weapon here has a real sprite. */
const METAL_COLOUR = {
  bronze: 0x9c6b3f, iron: 0x9e9e9e, steel: 0xc2c2c2, black: 0x3a3a3a,
  white: 0xdcdcdc, mithril: 0x5f7fa8, adamant: 0x4f8f6f, rune: 0x5fb0d0,
  dragon: 0xb03040,
};

/* The table above, turned into items. */
for (const [id, name, examine, shape, cat, speed, two, value, req, bonus, extra] of WEAPON_TABLE) {
  const b = B();
  Object.assign(b, bonus);
  const tool = extra && extra.toolSkill;
  def(id, Object.assign({
    name, examine, value, slot: "weapon", two: !!two, speed, req, bonus: b,
    kind: tool === "woodcutting" ? "axe" : tool === "mining" ? "pickaxe" : "weapon",
    colour: METAL_COLOUR[id.split("_")[0]] || 0x9a9a94,
    shape, cat, style: STYLE_BY_SHAPE[shape] || "slash",
  }, extra || {}));
}

/* -------------------------------------------------------------- the armour

   The defence mirror of the table above: every piece of armour in this world,
   one row per item, and every field its own - the bonuses, the shop value, the
   examine text and the equip requirement are all as the live game publishes
   them, the same source the weapon table uses. Generated rows are gone for the
   same reason they went for weapons: a metal x shape cross-product cannot
   express white armour's prayer bonus, dragon's missing platebody, Karil's coif
   being ranged armour, or the three mystic colours sharing one cache name
   between three different wield models.

   Row shape: [id, name, examine, shape, category, slot, value, requirement,
   bonuses, extra].

     * shape      - the procedural icon's fallback family only; every piece has
                    a real sprite, and a worn piece is drawn from the item's own
                    wield model (src/tools/cache-bake/held.mjs#WORN_SLOTS).
     * category   - only the skill guide reads this: the heading the item is
                    filed under (src/skillguides.js#ARMOUR_CATEGORY).
     * slot       - head, cape, body, legs, shield, hands or feet.
     * extra      - the odd field out, copied straight onto the item. A piece
                    whose cache name is not its display name, or is shared with
                    another item (all three mystic colours are plain "Mystic
                    hat" in the cache, and "Dragon chainbody" names both the
                    real chainbody and an unused duplicate), carries its cache
                    item id rather than a name - see src/tools/cache-bake/held.mjs.

   A bonus left out of the object is zero. `B()` above is the full field list. */
const ARMOUR_TABLE = [
  /* Helmets */
  ["bronze_fullhelm", "Bronze full helm", "A full face helmet.", "fullhelm", "helm", "head", 44, { defence: 1 }, { amagic: -6, arange: -3, dstab: 4, dslash: 5, dcrush: 3, dmagic: -1, drange: 4 }],
  ["bronze_helm", "Bronze med helm", "A medium sized helmet.", "medhelm", "helm", "head", 24, { defence: 1 }, { amagic: -3, dstab: 3, dslash: 4, dcrush: 2, dmagic: -1, drange: 4 }],
  ["coif", "Coif", "Light weight head protection.", "coif", "helm", "head", 200, { defence: 1, ranged: 20 }, { amagic: -1, arange: 2, dstab: 4, dslash: 6, dcrush: 8, dmagic: 4, drange: 4 }],
  ["iron_fullhelm", "Iron full helm", "A full face helmet.", "fullhelm", "helm", "head", 154, { defence: 1 }, { amagic: -6, arange: -3, dstab: 6, dslash: 7, dcrush: 5, dmagic: -1, drange: 6 }],
  ["iron_helm", "Iron med helm", "A medium sized helmet.", "medhelm", "helm", "head", 84, { defence: 1 }, { amagic: -3, dstab: 4, dslash: 5, dcrush: 3, dmagic: -1, drange: 4 }],
  ["leather_coif", "Leather cowl", "Better than no armour!", "coif", "helm", "head", 24, { defence: 1, ranged: 1 }, { arange: 1, dstab: 2, dslash: 3, dcrush: 4, dmagic: 2, drange: 3 }, { cacheId: 1167 }],
  /* The chef's own hat (cache item 1949, "What a silly hat." - no bonuses, no
     requirements; sold by the kitchen's cook, see actions.js#SHOPS.cook). */
  ["chef_hat", "Chef's hat", "What a silly hat.", "coif", "helm", "head", 2, {}, {}, { cacheId: 1949 }],
  /* The tiaras (Crafting's silver leg): a silver bar and a tiara mould at a
     furnace (23 Crafting, 52.5 xp), then an air talisman used on the plain one
     for the air tiara that opens the mysterious ruins without a talisman.
     No requirement, no bonuses - the published numbers are zeroes for both
     (scratch/osrsbox-items.json). */
  ["tiara", "Tiara", "Makes me feel like a Princess.", "coif", "helm", "head", 100, {}, {}, { cacheId: 5525 }],
  ["air_tiara", "Air tiara", "A tiara infused with the properties of air.", "coif", "helm", "head", 100, {}, {}, { cacheId: 5527 }],
  ["steel_fullhelm", "Steel full helm", "A full face helmet.", "fullhelm", "helm", "head", 550, { defence: 5 }, { amagic: -6, arange: -3, dstab: 9, dslash: 10, dcrush: 7, dmagic: -1, drange: 9 }],
  ["steel_helm", "Steel med helm", "A medium sized helmet.", "medhelm", "helm", "head", 300, { defence: 5 }, { amagic: -3, dstab: 7, dslash: 8, dcrush: 6, dmagic: -1, drange: 7 }],
  ["black_fullhelm", "Black full helm", "A full face helmet.", "fullhelm", "helm", "head", 1056, { defence: 10 }, { amagic: -6, arange: -3, dstab: 12, dslash: 13, dcrush: 10, dmagic: -1, drange: 12 }],
  ["black_helm", "Black med helm", "A medium sized helmet.", "medhelm", "helm", "head", 576, { defence: 10 }, { amagic: -3, dstab: 9, dslash: 10, dcrush: 8, dmagic: -1, drange: 9 }],
  ["white_fullhelm", "White full helm", "A full face helmet.", "fullhelm", "helm", "head", 1056, { defence: 10 }, { amagic: -6, arange: -3, dstab: 12, dslash: 13, dcrush: 10, dmagic: -1, drange: 12, pray: 1 }],
  ["white_helm", "White med helm", "A medium sized helmet.", "medhelm", "helm", "head", 576, { defence: 10 }, { amagic: -3, dstab: 9, dslash: 10, dcrush: 8, dmagic: -1, drange: 9, pray: 1 }],
  ["initiate_sallet", "Initiate sallet", "An initiate Temple Knight's helm.", "fullhelm", "helm", "head", 6000, { defence: 20, prayer: 10 }, { amagic: -6, arange: -3, dstab: 13, dslash: 14, dcrush: 11, dmagic: -1, drange: 13, pray: 3 }],
  ["mithril_fullhelm", "Mithril full helm", "A full face helmet.", "fullhelm", "helm", "head", 1430, { defence: 20 }, { amagic: -6, arange: -3, dstab: 13, dslash: 14, dcrush: 11, dmagic: -1, drange: 13 }],
  ["mithril_helm", "Mithril med helm", "A medium sized helmet.", "medhelm", "helm", "head", 780, { defence: 20 }, { amagic: -3, dstab: 10, dslash: 11, dcrush: 9, dmagic: -1, drange: 10 }],
  ["mystic_hat", "Mystic hat", "A magical hat.", "coif", "helm", "head", 15000, { defence: 20, magic: 40 }, { amagic: 4, dmagic: 4 }, { cacheId: 4089 }],
  ["mystic_dark_hat", "Mystic hat (dark)", "A dark magical hat.", "coif", "helm", "head", 15000, { defence: 20, magic: 40 }, { amagic: 4, dmagic: 4 }, { cacheId: 4099 }],
  ["mystic_light_hat", "Mystic hat (light)", "A bright magical hat.", "coif", "helm", "head", 15000, { defence: 20, magic: 40 }, { amagic: 4, dmagic: 4 }, { cacheId: 4109 }],
  ["dagonhai_hat", "Dagon'hai hat", "A hat worn by members of the Dagon'hai.", "coif", "helm", "head", 9000, { defence: 20, magic: 40 }, { amagic: 6, dmagic: 6 }],
  ["adamant_fullhelm", "Adamant full helm", "A full face helmet.", "fullhelm", "helm", "head", 3520, { defence: 30 }, { amagic: -6, arange: -3, dstab: 19, dslash: 21, dcrush: 16, dmagic: -1, drange: 19 }],
  ["adamant_helm", "Adamant med helm", "A medium sized helmet.", "medhelm", "helm", "head", 1920, { defence: 30 }, { amagic: -3, dstab: 14, dslash: 15, dcrush: 13, dmagic: -1, drange: 14 }],
  ["fremennik_helm", "Fremennik helm", "A sturdy helm worn only by Fremennik clan members.", "fullhelm", "helm", "head", 5000, { defence: 30 }, { amagic: -6, arange: -2, dstab: 19, dslash: 21, dcrush: 16, dmagic: -1, drange: 19 }],
  ["rock_helm", "Rock-shell helm", "Protective headwear made from crabs. Better than that sounds.", "fullhelm", "helm", "head", 35200, { defence: 40 }, { amagic: -6, arange: -2, dstab: 30, dslash: 32, dcrush: 27, dmagic: -1, drange: 30 }],
  ["rune_fullhelm", "Rune full helm", "A full face helmet.", "fullhelm", "helm", "head", 35200, { defence: 40 }, { amagic: -6, arange: -3, dstab: 30, dslash: 32, dcrush: 27, dmagic: -1, drange: 30 }],
  ["rune_helm", "Rune med helm", "A medium sized helmet.", "medhelm", "helm", "head", 19200, { defence: 40 }, { amagic: -3, dstab: 22, dslash: 23, dcrush: 21, dmagic: -1, drange: 22 }],
  ["skeletal_helm", "Skeletal helm", "Make your foes cower by wearing a skull as a helmet!", "coif", "helm", "head", 10000, { defence: 40, magic: 40 }, { amagic: 2, arange: -2, dstab: 10, dslash: 9, dcrush: 11, dmagic: 3 }],
  ["spined_helm", "Spined helm", "A helm fit for any Fremennik ranger.", "coif", "helm", "head", 60000, { defence: 40, ranged: 40 }, { astab: -6, aslash: -6, acrush: -6, amagic: -6, arange: 6, dstab: 6, dslash: 6, dcrush: 6, dmagic: 6 }],
  ["splitbark_helm", "Splitbark helm", "A wooden helmet.", "coif", "helm", "head", 10000, { defence: 40, magic: 40 }, { amagic: 3, arange: -2, dstab: 10, dslash: 9, dcrush: 11, dmagic: 3 }],
  ["archer_helm", "Archer helm", "This helmet is worn by archers.", "coif", "helm", "head", 60000, { defence: 45 }, { astab: -5, aslash: -5, acrush: -5, amagic: -5, arange: 6, dstab: 6, dslash: 8, dcrush: 10, dmagic: 6, drange: 6 }],
  ["berserker_helm", "Berserker helm", "This helmet is worn by berserkers.", "fullhelm", "helm", "head", 60000, { defence: 45 }, { amagic: -5, arange: -5, dstab: 31, dslash: 29, dcrush: 33, drange: 30, str: 3 }],
  ["farseer_helm", "Farseer helm", "This helmet is worn by farseers.", "coif", "helm", "head", 60000, { defence: 45 }, { astab: -5, aslash: -5, acrush: -5, amagic: 6, arange: -5, dstab: 8, dslash: 10, dcrush: 12, dmagic: 6 }],
  ["warrior_helm", "Warrior helm", "This helmet is worn by warriors.", "fullhelm", "helm", "head", 60000, { defence: 45 }, { aslash: 5, amagic: -5, arange: -5, dstab: 31, dslash: 33, dcrush: 29, drange: 30 }],
  ["helm_of_neitiznot", "Helm of neitiznot", "A gift from Neitiznot's Burgher.", "fullhelm", "helm", "head", 50000, { defence: 55 }, { dstab: 31, dslash: 29, dcrush: 34, dmagic: 3, drange: 30, str: 3, pray: 3 }],
  ["dragon_fullhelm", "Dragon full helm", "Protects your head and looks impressive too.", "fullhelm", "helm", "head", 150000, { defence: 60 }, { amagic: -6, arange: -3, dstab: 45, dslash: 48, dcrush: 41, dmagic: -1, drange: 46 }, { cacheId: 11335 }],
  ["dragon_helm", "Dragon med helm", "Makes the wearer pretty intimidating.", "medhelm", "helm", "head", 100000, { defence: 60 }, { amagic: -3, dstab: 33, dslash: 35, dcrush: 32, dmagic: -1, drange: 34 }, { cacheId: 1149 }],
  ["ahrims_hood", "Ahrim's hood", "Ahrim the Blighted's leather hood.", "coif", "helm", "head", 13000, { defence: 70, magic: 70 }, { amagic: 6, arange: -2, dstab: 15, dslash: 13, dcrush: 16, dmagic: 6 }, { cacheId: 4708 }],
  ["dharoks_helm", "Dharok's helm", "Dharok the Wretched's helm.", "fullhelm", "helm", "head", 103000, { defence: 70 }, { amagic: -3, arange: -1, dstab: 45, dslash: 48, dcrush: 44, dmagic: -1, drange: 51 }, { cacheId: 4716 }],
  ["guthans_helm", "Guthan's helm", "Guthan the Infested's helm.", "fullhelm", "helm", "head", 103000, { defence: 70 }, { amagic: -6, arange: -2, dstab: 55, dslash: 58, dcrush: 54, dmagic: -1, drange: 62 }, { cacheId: 4724 }],
  ["karils_coif", "Karil's coif", "Karil the Tainted's coif.", "coif", "helm", "head", 13000, { defence: 70, ranged: 70 }, { amagic: -1, arange: 7, dstab: 6, dslash: 9, dcrush: 12, dmagic: 6, drange: 10 }, { cacheId: 4732 }],
  ["torags_helm", "Torag's helm", "Torag the Corrupted's helm.", "fullhelm", "helm", "head", 103000, { defence: 70 }, { amagic: -6, arange: -2, dstab: 55, dslash: 58, dcrush: 54, dmagic: -1, drange: 62 }, { cacheId: 4745 }],
  ["veracs_helm", "Verac's helm", "Verac the Defiled's helm.", "fullhelm", "helm", "head", 103000, { defence: 70 }, { amagic: -6, arange: -2, dstab: 55, dslash: 58, dcrush: 54, drange: 56, pray: 3 }, { cacheId: 4753 }],

  /* The magic and granite headgear (unit L2 of PLAN.md): the blue Infinity hat,
     the Lunar helm, the Moonclan helm and the granite one. */
  ["infinity_hat", "Infinity hat", "A mystic hat.", "coif", "helm", "head", 17000, { defence: 25, magic: 50 }, { amagic: 6, dmagic: 6 }],
  ["moonclan_helm", "Moonclan helm", "Mystical headgear.", "coif", "helm", "head", 1000, null, { amagic: 3, arange: -5, dstab: 3, dslash: 3, dcrush: 3, dmagic: 3, drange: -5 }],
  ["granite_helm", "Granite helm", "A stone helmet.", "fullhelm", "helm", "head", 46000, { strength: 50, defence: 50 }, { amagic: -9, arange: -7, dstab: 31, dslash: 33, dcrush: 29, dmagic: -1, drange: 39 }],

  /* Snakeskin heads and bodies (unit O) - the products of the needle-and-thread
     recipes in src/actions.js#CRAFT_RECIPES. The snakeskin bandana is the one
     head piece of the set; the set's own stats are the published ones, exactly
     like every other row here. */
  ["snakeskin_bandana", "Snakeskin bandana", "Lightweight head protection.", "coif", "helm", "head", 300, { defence: 30, ranged: 30 }, { amagic: -5, arange: 4, dstab: 2, dslash: 4, dcrush: 4, dmagic: 2, drange: 2 }],

  /* Body armour */
  ["bronze_chainbody", "Bronze chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 60, { defence: 1 }, { amagic: -15, dstab: 7, dslash: 11, dcrush: 13, dmagic: -3, drange: 9 }],
  ["bronze_platebody", "Bronze platebody", "Provides excellent protection.", "platebody", "body", "body", 160, { defence: 1 }, { amagic: -30, arange: -15, dstab: 15, dslash: 14, dcrush: 9, dmagic: -6, drange: 14 }],
  ["iron_chainbody", "Iron chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 210, { defence: 1 }, { amagic: -15, dstab: 10, dslash: 15, dcrush: 19, dmagic: -3, drange: 12 }],
  ["iron_platebody", "Iron platebody", "Provides excellent protection.", "platebody", "body", "body", 560, { defence: 1 }, { amagic: -30, arange: -15, dstab: 21, dslash: 20, dcrush: 12, dmagic: -6, drange: 20 }],
  ["leather_body", "Leather body", "Better than no armour!", "leatherbody", "body", "body", 21, { defence: 1, ranged: 1 }, { amagic: -2, arange: 2, dstab: 8, dslash: 9, dcrush: 10, dmagic: 4, drange: 9 }],
  ["steel_chainbody", "Steel chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 750, { defence: 5 }, { amagic: -15, dstab: 17, dslash: 25, dcrush: 30, dmagic: -3, drange: 19 }],
  ["steel_platebody", "Steel platebody", "Provides excellent protection.", "platebody", "body", "body", 2000, { defence: 5 }, { amagic: -30, arange: -15, dstab: 32, dslash: 31, dcrush: 24, dmagic: -6, drange: 31 }],
  ["black_chainbody", "Black chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 1440, { defence: 10 }, { amagic: -15, dstab: 22, dslash: 32, dcrush: 39, dmagic: -3, drange: 24 }],
  ["black_platebody", "Black platebody", "Provides excellent protection.", "platebody", "body", "body", 3840, { defence: 10 }, { amagic: -30, arange: -15, dstab: 41, dslash: 40, dcrush: 30, dmagic: -6, drange: 40 }],
  ["hardleather_body", "Hardleather body", "Harder than normal leather.", "leatherbody", "body", "body", 170, { defence: 10, ranged: 1 }, { amagic: -4, arange: 8, dstab: 12, dslash: 15, dcrush: 18, dmagic: 6, drange: 15 }],
  ["white_chainbody", "White chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 1440, { defence: 10 }, { amagic: -15, dstab: 22, dslash: 32, dcrush: 39, dmagic: -3, drange: 24, pray: 1 }],
  ["white_platebody", "White platebody", "Provides excellent protection.", "platebody", "body", "body", 3840, { defence: 10 }, { amagic: -30, arange: -15, dstab: 41, dslash: 40, dcrush: 30, dmagic: -6, drange: 40, pray: 1 }],
  ["initiate_hauberk", "Initiate hauberk", "An initiate Temple Knight's Armour.", "platebody", "body", "body", 10000, { defence: 20, prayer: 10 }, { amagic: -30, arange: -15, dstab: 46, dslash: 44, dcrush: 38, dmagic: -6, drange: 44, pray: 6 }],
  ["mithril_chainbody", "Mithril chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 1950, { defence: 20 }, { amagic: -15, dstab: 25, dslash: 35, dcrush: 42, dmagic: -3, drange: 27 }],
  ["mithril_platebody", "Mithril platebody", "Provides excellent protection.", "platebody", "body", "body", 5200, { defence: 20 }, { amagic: -30, arange: -15, dstab: 46, dslash: 44, dcrush: 38, dmagic: -6, drange: 44 }],
  ["mystic_robe_top", "Mystic robe top", "The upper half of a magical robe.", "leatherbody", "body", "body", 120000, { defence: 20, magic: 40 }, { amagic: 20, dmagic: 20 }, { cacheId: 4091 }],
  ["mystic_dark_robe_top", "Mystic robe top (dark)", "The upper half of a dark magical robe.", "leatherbody", "body", "body", 120000, { defence: 20, magic: 40 }, { amagic: 20, dmagic: 20 }, { cacheId: 4101 }],
  ["mystic_light_robe_top", "Mystic robe top (light)", "The upper half of a bright magical robe.", "leatherbody", "body", "body", 120000, { defence: 20, magic: 40 }, { amagic: 20, dmagic: 20 }, { cacheId: 4111 }],
  ["dagonhai_robe_top", "Dagon'hai robe top", "A robe worn by members of the Dagon'hai.", "leatherbody", "body", "body", 60000, { defence: 20, magic: 40 }, { amagic: 14, dmagic: 16 }],
  ["studded_body", "Studded body", "Those studs should provide a bit more protection.", "leatherbody", "body", "body", 850, { defence: 20, ranged: 20 }, { amagic: -4, arange: 8, dstab: 18, dslash: 25, dcrush: 22, dmagic: 8, drange: 25 }],
  ["adamant_chainbody", "Adamant chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 4800, { defence: 30 }, { amagic: -15, dstab: 36, dslash: 50, dcrush: 61, dmagic: -3, drange: 38 }],
  ["adamant_platebody", "Adamant platebody", "Provides excellent protection.", "platebody", "body", "body", 16640, { defence: 30 }, { amagic: -30, arange: -15, dstab: 65, dslash: 63, dcrush: 55, dmagic: -6, drange: 63 }],
  ["rock_plate", "Rock-shell plate", "A sturdy body armour made from rock crab pieces.", "platebody", "body", "body", 65000, { defence: 40 }, { amagic: -30, arange: -10, dstab: 82, dslash: 80, dcrush: 72, dmagic: -6, drange: 80 }],
  ["rune_chainbody", "Rune chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 50000, { defence: 40 }, { amagic: -15, dstab: 63, dslash: 72, dcrush: 78, dmagic: -3, drange: 65 }],
  ["rune_platebody", "Rune platebody", "Provides excellent protection.", "platebody", "body", "body", 65000, { defence: 40 }, { amagic: -30, arange: -15, dstab: 82, dslash: 80, dcrush: 72, dmagic: -6, drange: 80 }],
  ["skeletal_top", "Skeletal top", "The bones in this armour seem to vibrate with a magical quality...", "leatherbody", "body", "body", 45000, { defence: 40, magic: 40 }, { amagic: 8, arange: -10, dstab: 35, dslash: 25, dcrush: 42, dmagic: 15 }],
  ["spined_body", "Spined body", "A constant reminder that I'm above a Dagannoth in the food chain.", "leatherbody", "body", "body", 7800, { defence: 40, ranged: 40 }, { amagic: -15, arange: 15, dstab: 40, dslash: 32, dcrush: 45, dmagic: 20, drange: 40 }],
  ["splitbark_body", "Splitbark body", "Provides good protection.", "leatherbody", "body", "body", 45000, { defence: 40, magic: 40 }, { amagic: 10, arange: -10, dstab: 36, dslash: 26, dcrush: 42, dmagic: 15 }],
  ["dragon_chainbody", "Dragon chainbody", "A series of connected metal rings.", "chainbody", "body", "body", 250000, { defence: 60 }, { amagic: -15, dstab: 81, dslash: 93, dcrush: 98, dmagic: -3, drange: 82 }, { cacheId: 3140 }],
  ["ahrims_robetop", "Ahrim's robetop", "Ahrim the Blighted's armoured robe top.", "leatherbody", "body", "body", 50000, { defence: 70, magic: 70 }, { amagic: 30, arange: -10, dstab: 52, dslash: 37, dcrush: 63, dmagic: 30 }, { cacheId: 4712 }],
  ["dharoks_platebody", "Dharok's platebody", "Dharok the Wretched's platebody armour.", "platebody", "body", "body", 280000, { defence: 70 }, { amagic: -30, arange: -10, dstab: 122, dslash: 120, dcrush: 107, dmagic: -6, drange: 132 }, { cacheId: 4720 }],
  ["guthans_platebody", "Guthan's platebody", "Guthan the Infested's platebody armour.", "platebody", "body", "body", 280000, { defence: 70 }, { amagic: -30, arange: -10, dstab: 122, dslash: 120, dcrush: 107, dmagic: -6, drange: 132 }, { cacheId: 4728 }],
  ["karils_leathertop", "Karil's leathertop", "Karil the Tainted's leather body armour.", "leatherbody", "body", "body", 50000, { defence: 70, ranged: 70 }, { amagic: -15, arange: 30, dstab: 47, dslash: 42, dcrush: 50, dmagic: 65, drange: 57 }, { cacheId: 4736 }],
  ["torags_platebody", "Torag's platebody", "Torag the Corrupted's platebody armour.", "platebody", "body", "body", 280000, { defence: 70 }, { amagic: -30, arange: -10, dstab: 122, dslash: 120, dcrush: 107, dmagic: -6, drange: 132 }, { cacheId: 4749 }],
  ["veracs_brassard", "Verac's brassard", "Verac the Defiled's brassard.", "chainbody", "body", "body", 280000, { defence: 70 }, { amagic: -6, arange: -2, dstab: 81, dslash: 95, dcrush: 85, drange: 81, pray: 5 }, { cacheId: 4757 }],

  /* The magic bodies plus the Void, granite and Penance ones (unit L2). The
     Void knight top is the set's body: in the live game its 45 defence in
     every style only applies with the whole set on, which this world does not
     model - the row is the item's own line. */
  ["infinity_top", "Infinity top", "Mystical robes.", "leatherbody", "body", "body", 140000, { defence: 25, magic: 50 }, { amagic: 22, dmagic: 22 }],
  ["moonclan_armour", "Moonclan armour", "Provides good protection.", "leatherbody", "body", "body", 1000, null, { amagic: 5, arange: -10, dstab: 5, dslash: 5, dcrush: 5, dmagic: 5, drange: -10 }],
  ["void_knight_top", "Void knight top", "Torso armour from the order of the Void Knights.", "leatherbody", "body", "body", 48000, { attack: 42, strength: 42, defence: 42, hitpoints: 42, ranged: 42, prayer: 22, magic: 42 }, { dstab: 45, dslash: 45, dcrush: 45, dmagic: 45, drange: 45 }],
  ["granite_body", "Granite body", "Provides excellent protection.", "platebody", "body", "body", 80000, { strength: 50, defence: 50 }, { amagic: -22, arange: -5, dstab: 87, dslash: 84, dcrush: 79, dmagic: -6, drange: 97 }],
  ["fighter_torso", "Fighter torso", "A Penance Fighter torso armour.", "leatherbody", "body", "body", 65006, { defence: 40 }, { amagic: -40, dstab: 62, dslash: 85, dcrush: 62, dmagic: -10, drange: 67, str: 4 }],

  /* The dragonhide and snakeskin bodies (unit O) - what the needle-and-thread
     recipes in src/actions.js#CRAFT_RECIPES sew out of the prepared leathers.
     Each is the published OSRS line: a d'hide body costs 3 leather, weighs
     6.803 kg and gives its own ranged defence in exchange for -15 magic attack,
     and every one of them asks for 40 Defence as well as its Ranged level,
     which is why the four chrisms carry the extra number the guide prints in
     brackets (src/skillguides.js#reqText). */
  ["snakeskin_body", "Snakeskin body", "Made from 100% real snakeskin.", "leatherbody", "body", "body", 1250, { defence: 30, ranged: 30 }, { amagic: -5, arange: 12, dstab: 25, dslash: 28, dcrush: 32, dmagic: 15, drange: 35 }],
  ["green_dhide_body", "Green d'hide body", "Made from 100% real dragonhide.", "leatherbody", "body", "body", 7800, { defence: 40, ranged: 40 }, { amagic: -15, arange: 15, dstab: 18, dslash: 27, dcrush: 24, dmagic: 20, drange: 35 }],
  ["blue_dhide_body", "Blue d'hide body", "Made from 100% real dragonhide.", "leatherbody", "body", "body", 9360, { defence: 40, ranged: 50 }, { amagic: -15, arange: 20, dstab: 23, dslash: 30, dcrush: 30, dmagic: 26, drange: 40 }],
  ["red_dhide_body", "Red d'hide body", "Made from 100% real dragonhide.", "leatherbody", "body", "body", 11230, { defence: 40, ranged: 60 }, { amagic: -15, arange: 25, dstab: 26, dslash: 34, dcrush: 36, dmagic: 36, drange: 45 }],
  ["black_dhide_body", "Black d'hide body", "Made from 100% real dragonhide.", "leatherbody", "body", "body", 13480, { defence: 40, ranged: 70 }, { amagic: -15, arange: 30, dstab: 30, dslash: 38, dcrush: 45, dmagic: 45, drange: 50 }],
  /* White d'hide test bodies (user request 2026-09-28): the 3rd-age range
     top's geometry made perfectly symmetrical - A mirrors the +x shoulder and
     sleeve, B mirrors the -x side - with the bone groups remapped across the
     mirror so both sides animate on their own side. Black-tier stats. */
  ["white_dhide_body_a", "White d'hide body A", "Made from 100% real white dragonhide.", "leatherbody", "body", "body", 13480, { defence: 40, ranged: 70 }, { amagic: -15, arange: 30, dstab: 30, dslash: 38, dcrush: 45, dmagic: 45, drange: 50 }],
  ["white_dhide_body_b", "White d'hide body B", "Made from 100% real white dragonhide.", "leatherbody", "body", "body", 13480, { defence: 40, ranged: 70 }, { amagic: -15, arange: 30, dstab: 30, dslash: 38, dcrush: 45, dmagic: 45, drange: 50 }],

  /* Legs */
  ["bronze_platelegs", "Bronze platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 80, { defence: 1 }, { amagic: -21, arange: -11, dstab: 8, dslash: 7, dcrush: 6, dmagic: -4, drange: 7 }],
  ["bronze_plateskirt", "Bronze plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 80, { defence: 1 }, { amagic: -21, arange: -11, dstab: 8, dslash: 7, dcrush: 6, dmagic: -4, drange: 7 }],
  ["iron_platelegs", "Iron platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 280, { defence: 1 }, { amagic: -21, arange: -11, dstab: 11, dslash: 10, dcrush: 10, dmagic: -4, drange: 10 }],
  ["iron_plateskirt", "Iron plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 280, { defence: 1 }, { amagic: -21, arange: -11, dstab: 11, dslash: 10, dcrush: 10, dmagic: -4, drange: 10 }],
  ["leather_chaps", "Leather chaps", "Better than no armour!", "chaps", "legs", "legs", 20, { defence: 1, ranged: 1 }, { arange: 4, dstab: 2, dslash: 2, dcrush: 1 }],
  ["studded_chaps", "Studded chaps", "Those studs should provide a bit more protection.", "chaps", "legs", "legs", 750, { defence: 1, ranged: 20 }, { amagic: -5, arange: 6, dstab: 15, dslash: 16, dcrush: 17, dmagic: 6, drange: 16 }],
  ["steel_platelegs", "Steel platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 1000, { defence: 5 }, { amagic: -21, arange: -11, dstab: 17, dslash: 16, dcrush: 15, dmagic: -4, drange: 16 }],
  ["steel_plateskirt", "Steel plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 1000, { defence: 5 }, { amagic: -21, arange: -11, dstab: 17, dslash: 16, dcrush: 15, dmagic: -4, drange: 16 }],
  ["black_platelegs", "Black platelegs", "Big, black and heavy looking.", "platelegs", "legs", "legs", 1920, { defence: 10 }, { amagic: -21, arange: -11, dstab: 21, dslash: 20, dcrush: 19, dmagic: -4, drange: 20 }],
  ["black_plateskirt", "Black plateskirt", "Big, black and heavy looking.", "plateskirt", "legs", "legs", 1920, { defence: 10 }, { amagic: -21, arange: -11, dstab: 21, dslash: 20, dcrush: 19, dmagic: -4, drange: 20 }],
  ["white_platelegs", "White platelegs", "Big, White and heavy looking.", "platelegs", "legs", "legs", 1920, { defence: 10 }, { amagic: -21, arange: -11, dstab: 21, dslash: 20, dcrush: 19, dmagic: -4, drange: 20, pray: 1 }],
  ["white_plateskirt", "White plateskirt", "Big, White and heavy looking.", "plateskirt", "legs", "legs", 1920, { defence: 10 }, { amagic: -21, arange: -11, dstab: 21, dslash: 20, dcrush: 19, dmagic: -4, drange: 20, pray: 1 }],
  ["initiate_cuisse", "Initiate cuisse", "An initiate Temple Knight's leg armour.", "platelegs", "legs", "legs", 8000, { defence: 20, prayer: 10 }, { amagic: -21, arange: -11, dstab: 24, dslash: 22, dcrush: 20, dmagic: -4, drange: 22, pray: 5 }],
  ["mithril_platelegs", "Mithril platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 2600, { defence: 20 }, { amagic: -21, arange: -11, dstab: 24, dslash: 22, dcrush: 20, dmagic: -4, drange: 22 }],
  ["mithril_plateskirt", "Mithril plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 2600, { defence: 20 }, { amagic: -21, arange: -11, dstab: 24, dslash: 22, dcrush: 20, dmagic: -4, drange: 22 }],
  ["mystic_robe_bottom", "Mystic robe bottom", "The lower half of a magical robe.", "chaps", "legs", "legs", 80000, { defence: 20, magic: 40 }, { amagic: 15, dmagic: 15 }, { cacheId: 4093 }],
  ["mystic_dark_robe_bottom", "Mystic robe bottom (dark)", "The lower half of a dark magical robe.", "chaps", "legs", "legs", 80000, { defence: 20, magic: 40 }, { amagic: 15, dmagic: 15 }, { cacheId: 4103 }],
  ["mystic_light_robe_bottom", "Mystic robe bottom (light)", "The lower half of a bright magical robe.", "chaps", "legs", "legs", 80000, { defence: 20, magic: 40 }, { amagic: 15, dmagic: 15 }, { cacheId: 4113 }],
  ["dagonhai_robe_bottom", "Dagon'hai robe bottom", "A robe worn by members of the Dagon'hai.", "chaps", "legs", "legs", 45000, { defence: 20, magic: 40 }, { amagic: 12, dmagic: 14 }],
  ["adamant_platelegs", "Adamant platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 6400, { defence: 30 }, { amagic: -21, arange: -11, dstab: 33, dslash: 31, dcrush: 29, dmagic: -4, drange: 31 }],
  ["adamant_plateskirt", "Adamant plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 6400, { defence: 30 }, { amagic: -21, arange: -11, dstab: 33, dslash: 31, dcrush: 29, dmagic: -4, drange: 31 }],
  ["rock_legs", "Rock-shell legs", "Some tough leggings made from rock crab parts.", "platelegs", "legs", "legs", 64000, { defence: 40 }, { amagic: -21, arange: -7, dstab: 51, dslash: 49, dcrush: 47, dmagic: -4, drange: 49 }],
  ["rune_platelegs", "Rune platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 64000, { defence: 40 }, { amagic: -21, arange: -11, dstab: 51, dslash: 49, dcrush: 47, dmagic: -4, drange: 49 }],
  ["rune_plateskirt", "Rune plateskirt", "Designer leg protection.", "plateskirt", "legs", "legs", 64000, { defence: 40 }, { amagic: -21, arange: -11, dstab: 51, dslash: 49, dcrush: 47, dmagic: -4, drange: 49 }],
  ["skeletal_bottoms", "Skeletal bottoms", "A superior set of strengthened slacks for any self respecting seer.", "chaps", "legs", "legs", 40000, { defence: 40, magic: 40 }, { amagic: 6, arange: -7, dstab: 22, dslash: 20, dcrush: 24, dmagic: 10 }],
  ["spined_chaps", "Spined chaps", "Stylish leg armour for rangers with a lingering smell of raw fish...", "chaps", "legs", "legs", 3900, { defence: 40, ranged: 40 }, { amagic: -10, arange: 8, dstab: 22, dslash: 16, dcrush: 24, dmagic: 8, drange: 22 }],
  ["splitbark_legs", "Splitbark legs", "These should protect my legs.", "chaps", "legs", "legs", 40000, { defence: 40, magic: 40 }, { amagic: 7, arange: -7, dstab: 22, dslash: 20, dcrush: 25, dmagic: 10 }],
  ["dragon_platelegs", "Dragon platelegs", "These look pretty heavy.", "platelegs", "legs", "legs", 270000, { defence: 60 }, { amagic: -21, arange: -11, dstab: 68, dslash: 66, dcrush: 63, dmagic: -4, drange: 65 }],
  ["dragon_plateskirt", "Dragon plateskirt", "This looks pretty heavy.", "plateskirt", "legs", "legs", 270000, { defence: 60 }, { amagic: -21, arange: -11, dstab: 68, dslash: 66, dcrush: 63, dmagic: -4, drange: 65 }],
  ["ahrims_robeskirt", "Ahrim's robeskirt", "Ahrim the Blighted's armoured robe skirt.", "chaps", "legs", "legs", 47000, { defence: 70, magic: 70 }, { amagic: 22, arange: -7, dstab: 33, dslash: 30, dcrush: 36, dmagic: 22 }, { cacheId: 4714 }],
  ["dharoks_platelegs", "Dharok's platelegs", "Dharok the Wretched's plate leg armour.", "platelegs", "legs", "legs", 275000, { defence: 70 }, { amagic: -21, arange: -11, dstab: 85, dslash: 82, dcrush: 83, dmagic: -4, drange: 92 }, { cacheId: 4722 }],
  ["guthans_chainskirt", "Guthan's chainskirt", "Guthan the Infested's chainskirt.", "plateskirt", "legs", "legs", 275000, { defence: 70 }, { amagic: -14, arange: -11, dstab: 75, dslash: 72, dcrush: 73, dmagic: -4, drange: 82 }, { cacheId: 4730 }],
  ["karils_leatherskirt", "Karil's leatherskirt", "Karil the Tainted's leather skirt.", "chaps", "legs", "legs", 47000, { defence: 70, ranged: 70 }, { amagic: -10, arange: 17, dstab: 26, dslash: 20, dcrush: 28, dmagic: 35, drange: 33 }, { cacheId: 4738 }],
  ["torags_platelegs", "Torag's platelegs", "Torag the Corrupted's plate leg armour.", "platelegs", "legs", "legs", 275000, { defence: 70 }, { amagic: -21, arange: -11, dstab: 85, dslash: 82, dcrush: 83, dmagic: -4, drange: 92 }, { cacheId: 4751 }],
  ["veracs_plateskirt", "Verac's plateskirt", "Verac the Defiled's plate skirt.", "plateskirt", "legs", "legs", 275000, { defence: 70 }, { amagic: -21, arange: -11, dstab: 85, dslash: 82, dcrush: 83, drange: 84, pray: 4 }, { cacheId: 4759 }],

  /* The matching legs (unit L2). */
  ["infinity_bottoms", "Infinity bottoms", "Mystical robes.", "chaps", "legs", "legs", 90000, { defence: 25, magic: 50 }, { amagic: 17, dmagic: 17 }],
  ["moonclan_skirt", "Moonclan skirt", "This should protect my legs.", "chaps", "legs", "legs", 1000, null, { amagic: 5, arange: -7, dstab: 5, dslash: 5, dcrush: 5, dmagic: 5, drange: -7 }],
  ["void_knight_robe", "Void knight robe", "Leg armour from the order of the Void Knights.", "chaps", "legs", "legs", 45000, { attack: 42, strength: 42, defence: 42, hitpoints: 42, ranged: 42, prayer: 22, magic: 42 }, { dstab: 30, dslash: 30, dcrush: 30, dmagic: 30, drange: 30 }],
  ["granite_legs", "Granite legs", "These look pretty heavy.", "platelegs", "legs", "legs", 66000, { strength: 50, defence: 50 }, { amagic: -31, arange: -18, dstab: 43, dslash: 45, dcrush: 41, dmagic: -4, drange: 68 }],

  /* The matching dragonhide and snakeskin legs (unit O). A d'hide chaps is two
     leathers and asks only for the Ranged level - the body is the piece that
     wants Defence as well, exactly as the live game's own recipes do (see
     src/actions.js#CRAFT_RECIPES). */
  ["snakeskin_chaps", "Snakeskin chaps", "Made from 100% real snake.", "chaps", "legs", "legs", 1175, { defence: 30, ranged: 30 }, { amagic: -5, arange: 6, dstab: 8, dslash: 8, dcrush: 10, dmagic: 4, drange: 10 }],
  ["green_dhide_chaps", "Green d'hide chaps", "Made from 100% real dragonhide.", "chaps", "legs", "legs", 3900, { ranged: 40 }, { amagic: -10, arange: 8, dstab: 12, dslash: 15, dcrush: 18, dmagic: 8, drange: 17 }],
  ["blue_dhide_chaps", "Blue d'hide chaps", "Made from 100% real dragonhide.", "chaps", "legs", "legs", 4320, { ranged: 50 }, { amagic: -10, arange: 11, dstab: 13, dslash: 16, dcrush: 20, dmagic: 14, drange: 20 }],
  ["red_dhide_chaps", "Red d'hide chaps", "Made from 100% real dragonhide.", "chaps", "legs", "legs", 5180, { ranged: 60 }, { amagic: -10, arange: 14, dstab: 15, dslash: 18, dcrush: 22, dmagic: 18, drange: 20 }],
  ["black_dhide_chaps", "Black d'hide chaps", "Made from 100% real dragonhide.", "chaps", "legs", "legs", 6220, { ranged: 70 }, { amagic: -10, arange: 17, dstab: 18, dslash: 20, dcrush: 26, dmagic: 23, drange: 26 }],
  ["white_dhide_chaps_a", "White d'hide chaps", "Made from 100% real white dragonhide.", "chaps", "legs", "legs", 6220, { ranged: 70 }, { amagic: -10, arange: 17, dstab: 18, dslash: 20, dcrush: 26, dmagic: 23, drange: 26 }],

  /* Shields */
  ["anti_dragon_shield", "Anti-dragon shield", "This provides partial protection from dragonbreath attacks.", "sqshield", "shield", "shield", 20, null, { dstab: 7, dslash: 9, dcrush: 8, dmagic: 2, drange: 8 }],
  ["elemental_shield", "Elemental shield", "A magic shield.", "sqshield", "shield", "shield", 20, null, { dmagic: 6 }],
  ["mind_shield", "Mind shield", "A magic shield.", "sqshield", "shield", "shield", 3000, null, { dmagic: 9 }],
  ["wooden_shield", "Wooden shield", "A solid wooden shield.", "sqshield", "shield", "shield", 20, null, { dstab: 4, dslash: 5, dcrush: 3, dmagic: 1, drange: 4 }],
  ["bronze_kiteshield", "Bronze kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 68, { defence: 1 }, { amagic: -8, arange: -3, dstab: 5, dslash: 7, dcrush: 6, dmagic: -1, drange: 6 }],
  ["bronze_sqshield", "Bronze sq shield", "A medium square shield.", "sqshield", "shield", "shield", 48, { defence: 1 }, { amagic: -6, dstab: 5, dslash: 6, dcrush: 4, drange: 5 }],
  ["iron_kiteshield", "Iron kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 238, { defence: 1 }, { amagic: -8, arange: -3, dstab: 8, dslash: 10, dcrush: 9, dmagic: -1, drange: 9 }],
  ["iron_sqshield", "Iron sq shield", "A medium square shield.", "sqshield", "shield", "shield", 168, { defence: 1 }, { amagic: -6, dstab: 8, dslash: 9, dcrush: 7, drange: 8 }],
  ["steel_kiteshield", "Steel kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 850, { defence: 5 }, { amagic: -8, arange: -3, dstab: 13, dslash: 15, dcrush: 14, dmagic: -1, drange: 14 }],
  ["steel_sqshield", "Steel sq shield", "A medium square shield.", "sqshield", "shield", "shield", 600, { defence: 5 }, { amagic: -6, dstab: 12, dslash: 13, dcrush: 11, drange: 12 }],
  ["black_kiteshield", "Black kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 1632, { defence: 10 }, { amagic: -8, arange: -3, dstab: 17, dslash: 19, dcrush: 18, dmagic: -1, drange: 18 }],
  ["black_sqshield", "Black sq shield", "A medium square shield.", "sqshield", "shield", "shield", 1152, { defence: 10 }, { amagic: -6, dstab: 15, dslash: 16, dcrush: 14, drange: 15 }],
  ["white_kiteshield", "White kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 1632, { defence: 10 }, { amagic: -8, arange: -3, dstab: 17, dslash: 19, dcrush: 18, dmagic: -1, drange: 18, pray: 1 }],
  ["white_sqshield", "White sq shield", "A medium square shield.", "sqshield", "shield", "shield", 1152, { defence: 10 }, { amagic: -6, dstab: 15, dslash: 16, dcrush: 14, drange: 15, pray: 1 }],
  ["mithril_kiteshield", "Mithril kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 2210, { defence: 20 }, { amagic: -8, arange: -3, dstab: 18, dslash: 22, dcrush: 20, dmagic: -1, drange: 20 }],
  ["mithril_sqshield", "Mithril sq shield", "A medium square shield.", "sqshield", "shield", "shield", 1560, { defence: 20 }, { amagic: -6, dstab: 17, dslash: 19, dcrush: 15, drange: 17 }],
  ["adamant_kiteshield", "Adamant kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 5440, { defence: 30 }, { amagic: -8, arange: -3, dstab: 27, dslash: 31, dcrush: 29, dmagic: -1, drange: 29 }],
  ["adamant_sqshield", "Adamant sq shield", "A medium square shield.", "sqshield", "shield", "shield", 3840, { defence: 30 }, { amagic: -6, dstab: 24, dslash: 26, dcrush: 22, drange: 24 }],
  ["rune_kiteshield", "Rune kiteshield", "A large metal shield.", "kiteshield", "shield", "shield", 54400, { defence: 40 }, { amagic: -8, arange: -3, dstab: 44, dslash: 48, dcrush: 46, dmagic: -1, drange: 46 }],
  ["rune_sqshield", "Rune sq shield", "A medium square shield.", "sqshield", "shield", "shield", 38400, { defence: 40 }, { amagic: -6, dstab: 38, dslash: 40, dcrush: 36, drange: 38 }],
  ["dragon_sqshield", "Dragon sq shield", "An ancient and powerful looking Dragon Square shield.", "sqshield", "shield", "shield", 500000, { defence: 60 }, { amagic: -6, dstab: 50, dslash: 52, dcrush: 48, drange: 50 }],
  ["dragonfire_shield", "Dragonfire shield", "A heavy shield with a snarling, draconic visage.", "kiteshield", "shield", "shield", 2000000, { defence: 75 }, { amagic: -10, arange: -5, dstab: 70, dslash: 75, dcrush: 72, dmagic: 10, drange: 72, str: 7 }, { cacheId: 11283 }],

  /* Granite's own shield completes the set (unit L2). */
  ["granite_shield", "Granite shield", "A solid stone shield.", "kiteshield", "shield", "shield", 56000, { strength: 50, defence: 50 }, { amagic: -12, arange: -8, dstab: 40, dslash: 42, dcrush: 38, drange: 65 }],

  /* Gloves */
  ["rock_gloves", "Rock-shell gloves", "Fremennik gloves stitched together from rock crab shell shards.", "gloves", "hands", "hands", 650, null, { dslash: 1, dcrush: 2 }],
  ["skeletal_gloves", "Skeletal gloves", "Fremennik gloves stitched together from wallasalki bones fragments.", "gloves", "hands", "hands", 650, null, { dslash: 1, dcrush: 2 }],
  ["spined_gloves", "Spined gloves", "Fremennik gloves stitched together from spined dagannoth hide.", "gloves", "hands", "hands", 650, null, { dslash: 1, dcrush: 2 }],
  ["leather_vambraces", "Leather vambraces", "Better than no armour!", "gloves", "hands", "hands", 18, { defence: 1 }, { arange: 4, dstab: 2, dslash: 2, dcrush: 1 }],
  ["mystic_gloves", "Mystic gloves", "Magical gloves.", "gloves", "hands", "hands", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4095 }],
  ["mystic_dark_gloves", "Mystic gloves (dark)", "Dark magical gloves.", "gloves", "hands", "hands", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4105 }],
  ["mystic_light_gloves", "Mystic gloves (light)", "Bright magical gloves.", "gloves", "hands", "hands", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4115 }],
  ["splitbark_gauntlets", "Splitbark gauntlets", "These should keep my hands safe.", "gloves", "hands", "hands", 5000, { defence: 40, magic: 40 }, { amagic: 2, arange: -1, dstab: 3, dslash: 2, dcrush: 4, dmagic: 2 }],

  /* The rest of the glove slot (unit L of PLAN.md): the metal families from the
     Culinaromancer's chest, the d'hide vambraces, the Fremennik/rogue/void
     sets and the quest gauntlets. Every Recipe for Disaster glove shares the
     cache name "Gloves", and so does the Fremennik pair, which is why those
     rows carry a `cacheId` - see src/tools/cache-bake/held.mjs#itemNameIndex. */
  ["leather_gloves", "Leather gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 6, { defence: 1 }, { dslash: 1, dcrush: 2 }],
  /* The five **dyed leather gloves** (sold in Thessalia's clothes shop, 500gp a
     pair). The cache names every one of them just "Gloves" and gives them the
     single concealed male model **179** - the leather pair - recoloured, so like
     the Fremennik/HAM/Recipe-for-Disaster plain-"Gloves" rows further down these
     carry their own `cacheId`; without it the name lookup lands all five on one
     item and four of them would wear the wrong dye. Their ids are the cache's
     own, ascending in this order (grey, red, yellow, teal, purple). */
  ["grey_gloves", "Grey gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 2902 }],
  ["red_gloves", "Red gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 2912 }],
  ["yellow_gloves", "Yellow gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 2922 }],
  ["teal_gloves", "Teal gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 2932 }],
  ["purple_gloves", "Purple gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 2942 }],
  ["hardleather_gloves", "Hardleather gloves", "A pair of gloves.", "gloves", "hands", "hands", 50, null, { astab: 1, aslash: 1, acrush: 1, amagic: 1, arange: 1, dstab: 1, dslash: 1, dcrush: 1, dmagic: 1, drange: 1, str: 1 }, { cacheId: 7453 }],
  ["bronze_gloves", "Bronze gloves", "A pair of gloves.", "gloves", "hands", "hands", 100, null, { astab: 2, aslash: 2, acrush: 2, amagic: 1, arange: 2, dstab: 2, dslash: 2, dcrush: 2, dmagic: 1, drange: 2, str: 2 }, { cacheId: 7454 }],
  ["iron_gloves", "Iron gloves", "A pair of gloves.", "gloves", "hands", "hands", 250, null, { astab: 3, aslash: 3, acrush: 3, amagic: 2, arange: 3, dstab: 3, dslash: 3, dcrush: 3, dmagic: 2, drange: 3, str: 3 }, { cacheId: 7455 }],
  ["steel_gloves", "Steel gloves", "A pair of gloves.", "gloves", "hands", "hands", 500, null, { astab: 4, aslash: 4, acrush: 4, amagic: 2, arange: 4, dstab: 4, dslash: 4, dcrush: 4, dmagic: 2, drange: 4, str: 4 }, { cacheId: 7456 }],
  ["black_gloves", "Black gloves", "A pair of nice gloves.", "gloves", "hands", "hands", 1000, null, { astab: 5, aslash: 5, acrush: 5, amagic: 3, arange: 5, dstab: 5, dslash: 5, dcrush: 5, dmagic: 3, drange: 5, str: 5 }, { cacheId: 7457 }],
  ["mithril_gloves", "Mithril gloves", "A pair of nice gloves.", "gloves", "hands", "hands", 1500, null, { astab: 6, aslash: 6, acrush: 6, amagic: 3, arange: 6, dstab: 6, dslash: 6, dcrush: 6, dmagic: 3, drange: 6, str: 6 }, { cacheId: 7458 }],
  ["adamant_gloves", "Adamant gloves", "A pair of nice gloves.", "gloves", "hands", "hands", 2500, null, { astab: 7, aslash: 7, acrush: 7, amagic: 4, arange: 7, dstab: 7, dslash: 7, dcrush: 7, dmagic: 4, drange: 7, str: 7 }, { cacheId: 7459 }],
  ["rune_gloves", "Rune gloves", "A pair of very nice gloves.", "gloves", "hands", "hands", 5000, null, { astab: 8, aslash: 8, acrush: 8, amagic: 4, arange: 8, dstab: 8, dslash: 8, dcrush: 8, dmagic: 4, drange: 8, str: 8 }, { cacheId: 7460 }],
  ["dragon_gloves", "Dragon gloves", "A pair of very nice gloves.", "gloves", "hands", "hands", 100000, null, { astab: 9, aslash: 9, acrush: 9, amagic: 5, arange: 9, dstab: 9, dslash: 9, dcrush: 9, dmagic: 5, drange: 9, str: 9 }, { cacheId: 7461 }],
  ["barrows_gloves", "Barrows gloves", "A pair of very nice gloves.", "gloves", "hands", "hands", 100000, null, { astab: 12, aslash: 12, acrush: 12, amagic: 6, arange: 12, dstab: 12, dslash: 12, dcrush: 12, dmagic: 6, drange: 12, str: 12 }, { cacheId: 7462 }],
  ["infinity_gloves", "Infinity gloves", "Mystical gloves.", "gloves", "hands", "hands", 12000, { defence: 25, magic: 50 }, { amagic: 5, dmagic: 5 }],
  ["void_knight_gloves", "Void knight gloves", "Gloves as used by the order of the Void Knights.", "gloves", "hands", "hands", 6052, { attack: 42, strength: 42, defence: 42, hitpoints: 42, ranged: 42, prayer: 22, magic: 42 }, { dstab: 6, dslash: 6, dcrush: 6, dmagic: 4, drange: 6 }],
  ["green_dhide_vambraces", "Green d'hide vambraces", "Vambraces made from 100% real dragonhide.", "gloves", "hands", "hands", 2500, { ranged: 40 }, { amagic: -10, arange: 8, dstab: 1, dslash: 2, dcrush: 2, dmagic: 2 }],
  ["blue_dhide_vambraces", "Blue d'hide vambraces", "Vambraces made from 100% real dragonhide.", "gloves", "hands", "hands", 3000, { ranged: 50 }, { amagic: -10, arange: 9, dstab: 2, dslash: 3, dcrush: 3, dmagic: 4 }],
  ["red_dhide_vambraces", "Red d'hide vambraces", "Vambraces made from 100% real dragonhide.", "gloves", "hands", "hands", 3600, { ranged: 60 }, { amagic: -10, arange: 10, dstab: 3, dslash: 4, dcrush: 4, dmagic: 6 }],
  ["black_dhide_vambraces", "Black d'hide vambraces", "Vambraces made from 100% real dragonhide.", "gloves", "hands", "hands", 4320, { ranged: 70 }, { amagic: -10, arange: 11, dstab: 4, dslash: 5, dcrush: 5, dmagic: 8 }],
  ["snakeskin_vambraces", "Snakeskin vambraces", "Made from 100% real snake.", "gloves", "hands", "hands", 434, { defence: 30, ranged: 30 }, { amagic: -5, arange: 6, dstab: 2, dslash: 2, dcrush: 2, dmagic: 1 }],
  ["ice_gloves", "Ice gloves", "These will keep my hands cold!", "gloves", "hands", "hands", 6, null, { dslash: 3, dcrush: 4, drange: 2 }],
  ["klanks_gauntlets", "Klank's gauntlets", "Strong dwarvish gloves.", "gloves", "hands", "hands", 6, null, { astab: 2, aslash: 2, acrush: 2, dstab: 8, dslash: 9, dcrush: 7, str: 2 }],
  ["fremennik_gloves", "Fremennik gloves", "These will keep my hands warm!", "gloves", "hands", "hands", 500, null, { dslash: 1, dcrush: 2 }, { cacheId: 3799 }],
  ["rogue_gloves", "Rogue gloves", "Black banded leather gloves, a rogue's dream!", "gloves", "hands", "hands", 250, { thieving: 50, agility: 50 }, { dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: 2 }],
  ["ghostly_gloves", "Ghostly gloves", "They seem to fade in and out of existence...", "gloves", "hands", "hands", 30, null, { amagic: 2, dmagic: 2 }, { cacheId: 6110 }],
  ["cooking_gauntlets", "Cooking gauntlets", "These gauntlets empower with a greater ability to cook fish.", "gloves", "hands", "hands", 1, null, { astab: 2, aslash: 2, acrush: 2, dstab: 8, dslash: 9, dcrush: 7, str: 2 }],
  ["goldsmith_gauntlets", "Goldsmith gauntlets", "These gauntlets empower the bearer whilst making gold.", "gloves", "hands", "hands", 1, null, { astab: 2, aslash: 2, acrush: 2, dstab: 8, dslash: 9, dcrush: 7, str: 2 }],
  ["chaos_gauntlets", "Chaos gauntlets", "These gauntlets empower spell casters.", "gloves", "hands", "hands", 1, null, { astab: 2, aslash: 2, acrush: 2, dstab: 8, dslash: 9, dcrush: 7, str: 2 }],
  ["steel_gauntlets", "Steel gauntlets", "My reward for assisting the Fitzharmon family.", "gloves", "hands", "hands", 1, null, { astab: 2, aslash: 2, acrush: 2, dstab: 8, dslash: 9, dcrush: 7, str: 2 }],
  ["gloves_of_silence", "Gloves of silence", "Made from dark kebbit fur, these are perfect for tasks of a stealthier nature.", "gloves", "hands", "hands", 600, { hunter: 54 }, { dslash: 1, dcrush: 2 }],
  ["moonclan_gloves", "Moonclan gloves", "These should keep my hands safe.", "gloves", "hands", "hands", 900, null, { amagic: 2, arange: -5, dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: -5 }],
  ["combat_bracelet", "Combat bracelet", "You will need to recharge the bracelet at the Legends Guild.", "gloves", "hands", "hands", 21040, null, { astab: 7, aslash: 7, acrush: 7, amagic: 3, arange: 7, dstab: 5, dslash: 5, dcrush: 5, dmagic: 3, drange: 5, str: 6 }],
  ["regen_bracelet", "Regen bracelet", "Helps to restore Hitpoints.", "gloves", "hands", "hands", 202000, null, { astab: 8, aslash: 8, acrush: 8, amagic: 3, arange: 7, dstab: 6, dslash: 6, dcrush: 6, dmagic: 3, drange: 6, str: 7 }],
  /* The unenchanted bracelets (unit L3 of PLAN.md): the jewellery the wrist
     slot is for, and what a bracelet mould, a gold bar and a cut gem make at a
     furnace (src/items.js#JEWELLERY). Every one of them is purely decorative
     until it is enchanted - that is the live game's own rule, printed on its
     Jewellery page ("Unenchanted jewellery is purely decorative") - and each
     carries its own crafting data rather than a bonus. `cacheId` is on every
     row because the cache names are shared: "Dragon bracelet" is the
     dragonstone one and "Onyx bracelet" names both the gem bracelet and
     nothing else, but the sapphire/emerald/ruby/diamond set collides with the
     rings and amulets of the same gem only by *name pattern*, not by name, so
     the ids are simply safer than a lookup. Their values are the cache's own
     (1150, 1525, 2325, 3825, 19125, 201000), which is also what the gem
     bracelets' enchant products are worth. */
  ["gold_bracelet", "Gold bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 550, null, {}, { cacheId: 11069 }],
  ["sapphire_bracelet", "Sapphire bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 1150, null, {}, { cacheId: 11072, enchant: 1, enchantsTo: "bracelet_of_clay" }],
  ["emerald_bracelet", "Emerald bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 1525, null, {}, { cacheId: 11076 }],
  ["ruby_bracelet", "Ruby bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 2325, null, {}, { cacheId: 11085 }],
  ["diamond_bracelet", "Diamond bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 3825, null, {}, { cacheId: 11092 }],
  ["dragonstone_bracelet", "Dragonstone bracelet", "I wonder if this is valuable.", "gloves", "hands", "hands", 19125, null, {}, { cacheId: 11115, enchant: 5, enchantsTo: "combat_bracelet" }],
  ["onyx_bracelet", "Onyx bracelet", "Yep, this is most definitely valuable!", "gloves", "hands", "hands", 201000, null, {}, { cacheId: 11130, enchant: 6, enchantsTo: "regen_bracelet" }],
  /* The one bracelet enchant that stays in the mine rather than the bank: a
     sapphire bracelet under Lvl-1 Enchant becomes a **bracelet of clay**, which
     turns every clay the wearer mines into **soft clay** until twenty-eight of
     them have been made and the bracelet crumbles (the live game's own count,
     and its own wording for the check). `charges` is what
     src/player.js#useRingCharge spends - the same machinery the recoil and
     forging rings use, on the hands slot - and `checkCharges` is what puts the
     right-click "Check" option there (src/ui.js). */
  ["bracelet_of_clay", "Bracelet of clay", "Now I can become a potter.", "gloves", "hands", "hands", 1265, null, {}, { cacheId: 11074, charges: 28, checkCharges: true }],
  ["penance_gloves", "Penance gloves", "These gloves seem unbelieveably light!", "gloves", "hands", "hands", 65001, { defence: 40 }, { dslash: 3, dcrush: 4, drange: 2 }],
  ["zamorak_bracers", "Zamorak bracers", "Zamorak blessed dragonhide vambraces.", "gloves", "hands", "hands", 4000, { defence: 40, ranged: 70 }, { amagic: -10, arange: 11, dstab: 6, dslash: 5, dcrush: 7, dmagic: 8, pray: 1 }],
  ["guthix_bracers", "Guthix bracers", "Guthix blessed dragonhide vambraces.", "gloves", "hands", "hands", 6000, { defence: 40, ranged: 70 }, { amagic: -10, arange: 11, dstab: 6, dslash: 5, dcrush: 7, dmagic: 8, pray: 1 }],
  ["saradomin_bracers", "Saradomin bracers", "Saradomin blessed dragonhide vambraces.", "gloves", "hands", "hands", 4000, { defence: 40, ranged: 70 }, { amagic: -10, arange: 11, dstab: 6, dslash: 5, dcrush: 7, dmagic: 8, pray: 1 }],

  /* Boots */
  ["rock_boots", "Rock-shell boots", "Some Fremennik boots, made from the shards of a rock crab's shell.", "boots", "feet", "feet", 650, null, { dslash: 1, dcrush: 1 }],
  ["skeletal_boots", "Skeletal boots", "Some finely crafted Fremennik boots, made from the bones of a wallasalki.", "boots", "feet", "feet", 650, null, { dslash: 1, dcrush: 1 }],
  ["mystic_boots", "Mystic boots", "Magical boots.", "boots", "feet", "feet", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4097 }],
  ["mystic_dark_boots", "Mystic boots (dark)", "Dark magical boots.", "boots", "feet", "feet", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4107 }],
  ["mystic_light_boots", "Mystic boots (light)", "Bright magical boots.", "boots", "feet", "feet", 10000, { defence: 20, magic: 40 }, { amagic: 3, dmagic: 3 }, { cacheId: 4117 }],
  ["spined_boots", "Spined boots", "Some finely crafted Fremennik boots, made from spined dagannoth hide.", "boots", "feet", "feet", 650, null, { dslash: 1, dcrush: 1 }],
  ["splitbark_boots", "Splitbark boots", "Wooden foot protection.", "boots", "feet", "feet", 5000, { defence: 40, magic: 40 }, { amagic: 2, arange: -1, dstab: 3, dslash: 2, dcrush: 4, dmagic: 2 }],

  /* The rest of the boot slot (unit L of PLAN.md): the metal families, the
     Stronghold of Security's two pairs, and the ranger/wizard/rogue/Fremennik
     sets. Every row here has a real sprite and a real cache model. */
  ["bronze_boots", "Bronze boots", "These will protect my feet.", "boots", "feet", "feet", 24, { defence: 1 }, { amagic: -3, arange: -1, dstab: 1, dslash: 2, dcrush: 3 }],
  ["iron_boots", "Iron boots", "These will protect my feet.", "boots", "feet", "feet", 84, { defence: 1 }, { amagic: -3, arange: -1, dstab: 2, dslash: 3, dcrush: 4 }],
  ["steel_boots", "Steel boots", "These will protect my feet.", "boots", "feet", "feet", 300, { defence: 5 }, { amagic: -3, arange: -1, dstab: 5, dslash: 6, dcrush: 7 }],
  ["black_boots", "Black boots", "These will protect my feet.", "boots", "feet", "feet", 576, { defence: 10 }, { amagic: -3, arange: -1, dstab: 7, dslash: 8, dcrush: 9 }],
  ["white_boots", "White boots", "These will protect my feet.", "boots", "feet", "feet", 576, { defence: 10 }, { amagic: -3, arange: -1, dstab: 7, dslash: 8, dcrush: 9, pray: 1 }],
  ["mithril_boots", "Mithril boots", "These will protect my feet.", "boots", "feet", "feet", 780, { defence: 20 }, { amagic: -3, arange: -1, dstab: 8, dslash: 9, dcrush: 10 }],
  ["adamant_boots", "Adamant boots", "These will protect my feet.", "boots", "feet", "feet", 1920, { defence: 30 }, { amagic: -3, arange: -1, dstab: 10, dslash: 11, dcrush: 12, str: 1 }],
  ["rune_boots", "Rune boots", "These will protect my feet.", "boots", "feet", "feet", 12500, { defence: 40 }, { amagic: -3, arange: -1, dstab: 12, dslash: 13, dcrush: 14, str: 2 }],
  ["climbing_boots", "Climbing boots", "Boots made for climbing.", "boots", "feet", "feet", 12, null, { dslash: 2, dcrush: 2, str: 2 }],
  ["snakeskin_boots", "Snakeskin boots", "Made from snakes.", "boots", "feet", "feet", 250, { defence: 30, ranged: 30 }, { amagic: -10, arange: 3, dstab: 1, dslash: 1, dcrush: 2, dmagic: 1 }],
  ["frog_leather_boots", "Frog-leather boots", "Boots made out of frog hide.", "boots", "feet", "feet", 200, { defence: 25, ranged: 25 }, { amagic: -8, arange: 2, dstab: 1, dslash: 1, dcrush: 1, drange: 1 }],
  ["ranger_boots", "Ranger boots", "Lightweight boots ideal for rangers.", "boots", "feet", "feet", 200, { defence: 1, ranged: 40 }, { amagic: -10, arange: 8, dstab: 2, dslash: 3, dcrush: 4, dmagic: 2 }],
  ["wizard_boots", "Wizard boots", "Slightly magical boots.", "boots", "feet", "feet", 200, { defence: 1, magic: 20 }, { amagic: 4, dmagic: 4 }],
  ["fighting_boots", "Fighting boots", "Very nice boots from the Stronghold of Security.", "boots", "feet", "feet", 1, null, { amagic: -3, arange: -1, dstab: 1, dslash: 2, dcrush: 3 }],
  ["fancy_boots", "Fancy boots", "Very nice boots from the Stronghold of Security.", "boots", "feet", "feet", 1, null, { amagic: -3, arange: -1, dstab: 1, dslash: 2, dcrush: 3 }],
  ["infinity_boots", "Infinity boots", "Mystical boots.", "boots", "feet", "feet", 12000, { defence: 25, magic: 50 }, { amagic: 5, dmagic: 5 }],
  ["moonclan_boots", "Moonclan boots", "Groovy foot protection.", "boots", "feet", "feet", 900, null, { amagic: 2, arange: -5, dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: -5 }],
  ["rogue_boots", "Rogue boots", "Black banded leather boots, a rogue's dream!", "boots", "feet", "feet", 250, { thieving: 50, agility: 50 }, { dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: 2 }],
  ["runner_boots", "Runner boots", "Boots made from a Penance Runner.", "boots", "feet", "feet", 65003, { defence: 40 }, { amagic: 1, arange: 1, dstab: 8, dslash: 8, dcrush: 8 }],

  /* The level-1 boots every player of this era started in (unit O): one leather
     and one thread is the whole recipe (src/actions.js#CRAFT_RECIPES), which is
     the first thing the Crafting guide ever asks anyone to do. */
  ["leather_boots", "Leather boots", "Comfortable leather boots.", "boots", "feet", "feet", 6, { defence: 1 }, { dslash: 1, dcrush: 1 }],

  /* Capes. The cape slot was the last one with nothing in it at all, and the
     seven coloured capes are the ones every player of this era started in: a
     cape and a colour, +1 slash, +1 crush and +2 ranged defence between them.
     Their cache name is the bare word "Cape" for all seven, which is why every
     row here carries its `cacheId` - a name lookup would land them all on the
     same item (see src/tools/cache-bake/held.mjs#itemNameIndex). The three god
     capes are the Mage Arena's reward and the other half of the god spells'
     Charge bonus (see src/combat.js#spellMaxHit); the Cape of Legends is the
     Legends' Guild's own, and the only cape in this revision with a full set of
     defence bonuses. */
  ["red_cape", "Red cape", "A bright red cape.", "cape", "cape", "cape", 2, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1007 }],
  ["black_cape", "Black cape", "A warm black cape.", "cape", "cape", "cape", 7, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1019 }],
  ["blue_cape", "Blue cape", "A thick blue cape.", "cape", "cape", "cape", 32, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1021 }],
  ["yellow_cape", "Yellow cape", "A thick yellow cape.", "cape", "cape", "cape", 32, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1023 }],
  ["green_cape", "Green cape", "A thick green cape.", "cape", "cape", "cape", 32, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1027 }],
  ["purple_cape", "Purple cape", "A thick purple cape.", "cape", "cape", "cape", 32, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1029 }],
  ["orange_cape", "Orange cape", "A thick orange cape.", "cape", "cape", "cape", 32, null, { dslash: 1, dcrush: 1, drange: 2 }, { cacheId: 1031 }],
  ["cape_of_legends", "Cape of Legends", "The cape worn by members of the Legends Guild.", "cape", "cape", "cape", 450, null, { dstab: 7, dslash: 7, dcrush: 7, dmagic: 7, drange: 7 }, { cacheId: 1052 }],
  ["saradomin_cape", "Saradomin cape", "A cape from the almighty god Saradomin.", "cape", "cape", "cape", 10, null, { amagic: 10, dstab: 1, dslash: 1, dcrush: 2, dmagic: 10 }, { cacheId: 2412 }],
  ["guthix_cape", "Guthix cape", "A cape from the almighty god Guthix.", "cape", "cape", "cape", 10, null, { amagic: 10, dstab: 1, dslash: 1, dcrush: 2, dmagic: 10 }, { cacheId: 2413 }],
  ["zamorak_cape", "Zamorak cape", "A cape from the almighty god Zamorak.", "cape", "cape", "cape", 10, null, { amagic: 10, dstab: 1, dslash: 1, dcrush: 2, dmagic: 10 }, { cacheId: 2414 }],

  /* Four more capes (unit L2): the Lunar and Moonclan ones come with their
     sets, and the obsidian and fire capes are the TzHaar's - the fire cape is
     the Fight Caves' own reward, and the only cape in this revision with an
     attack bonus and strength on it. None of them shares a cache name, so none
     needs a \`cacheId\`. */
  ["moonclan_cape", "Moonclan cape", "A mystical cape.", "cape", "cape", "cape", 200, null, { amagic: 2, arange: -2, dslash: 1, dcrush: 1, dmagic: 2, drange: -2 }],
  ["obsidian_cape", "Obsidian cape", "A cape of woven obsidian plates.", "cape", "cape", "cape", 60000, null, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }],
  ["fire_cape", "Fire cape", "A cape of fire.", "cape", "cape", "cape", 65007, null, { astab: 1, aslash: 1, acrush: 1, amagic: 1, arange: 1, dstab: 11, dslash: 11, dcrush: 11, dmagic: 11, drange: 11, str: 4, pray: 2 }],

  /* ------------------------------------- the capes of accomplishment

     The 24 capes of accomplishment and their hoods: one per skill, plus the
     Quest point cape - 23 skills (src/skills.js) and the quest log's own
     total, which is the same set the live game sells. Every one of them is
     rev 241's own item (9747-9814, and the Hunter trio off on its own at
     9948-9950), so the worn cut, the ground model and the sprite all come out
     of the cache through the ordinary bakes - the trimmed cape included,
     whose only difference in the cache is a **second worn model** (opcode
     78/79, the gold trim) merged over the plain one, which is what
     src/tools/cache-bake/held.mjs#bakeItemModel already does for every item.

     The rules are the live game's:

       * **A cape or hood needs level 99 in its skill** - to buy it and to wear
         it (`req`), which is the whole point of the thing. The Quest point
         cape is the one exception: it carries no skill level at all, and
         instead a `reqQuests` gate - **every quest in this world's journal
         finished** (src/quests.js#allQuestsDone) - which both the master at the
         counter (src/actions.js#skillcapeCanBuy) and the equip path
         (src/player.js#canEquip, through src/player.js#questsFinished) read. It
         keeps its row on the master's shelf whatever your levels - the counter
         shows all 24 - and the master refuses while any quest is unfinished.
       * **The trimmed cut is for a second 99.** A player with two or more
         skills at 99 may buy the (t) version for the same 99,000 coins; the
         number is the same because the trim is the same cape with the gold
         edge on it. It is a *second row* rather than a swap on the first, so
         a player who has both can wear either.
       * **The hood comes with the cape** (src/actions.js#skillcapeBought), which
         is why a hood is also on the shelf at its own value of one coin -
         that is what the live game charges for a replacement.
       * **The Skill Cape emote is the worn cape's own animation.** Each cape
         has its own sequence and its own graphic
         (src/emotes.js#SKILLCAPE_EMOTES, baked as `emote_skill_cape_<skill>`
         and the gfx at 812-835/907), and the emote book's last button plays
         whichever one is worn (src/actions.js#performEmote).

     Every number is the item page's own; `skillcape` is the skill the cape
     answers to, which is what the shop, the emote and the audit key off, and
     `weight: 0.453` is inline for the reason src/items.js#itemWeight gives.

     Row shape: the armour table's. */
  ["attack_cape", "Attack cape", "The cape worn by masters of Attack.", "cape", "cape", "cape", 99000, { attack: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9747, weight: 0.453, skillcape: "attack" }],
  ["attack_cape_t", "Attack cape(t)", "The cape worn by masters of Attack.", "cape", "cape", "cape", 99000, { attack: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9748, weight: 0.453, skillcape: "attack", trimmed: true }],
  ["attack_hood", "Attack hood", "Attack skillcape hood.", "coif", "helm", "head", 1, { attack: 99 }, { }, { cacheId: 9749, weight: 0.453, skillcape: "attack", hooded: true }],
  ["strength_cape", "Strength cape", "The cape worn by only the strongest people.", "cape", "cape", "cape", 99000, { strength: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9750, weight: 0.453, skillcape: "strength" }],
  ["strength_cape_t", "Strength cape(t)", "The cape worn by only the strongest people.", "cape", "cape", "cape", 99000, { strength: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9751, weight: 0.453, skillcape: "strength", trimmed: true }],
  ["strength_hood", "Strength hood", "Strength skillcape hood.", "coif", "helm", "head", 1, { strength: 99 }, { }, { cacheId: 9752, weight: 0.453, skillcape: "strength", hooded: true }],
  ["defence_cape", "Defence cape", "The cape worn by masters of the art of Defence.", "cape", "cape", "cape", 99000, { defence: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9753, weight: 0.453, skillcape: "defence" }],
  ["defence_cape_t", "Defence cape(t)", "The cape worn by masters of the art of Defence.", "cape", "cape", "cape", 99000, { defence: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9754, weight: 0.453, skillcape: "defence", trimmed: true }],
  ["defence_hood", "Defence hood", "Defence skillcape hood.", "coif", "helm", "head", 1, { defence: 99 }, { }, { cacheId: 9755, weight: 0.453, skillcape: "defence", hooded: true }],
  ["ranging_cape", "Ranging cape", "The cape worn by master archers.", "cape", "cape", "cape", 99000, { ranged: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9756, weight: 0.453, skillcape: "ranged" }],
  ["ranging_cape_t", "Ranging cape(t)", "The cape worn by master archers.", "cape", "cape", "cape", 99000, { ranged: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9757, weight: 0.453, skillcape: "ranged", trimmed: true }],
  ["ranging_hood", "Ranging hood", "Range skillcape hood.", "coif", "helm", "head", 1, { ranged: 99 }, { }, { cacheId: 9758, weight: 0.453, skillcape: "ranged", hooded: true }],
  ["prayer_cape", "Prayer cape", "The cape worn by the most pious of heroes.", "cape", "cape", "cape", 99000, { prayer: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9759, weight: 0.453, skillcape: "prayer" }],
  ["prayer_cape_t", "Prayer cape(t)", "The cape worn by the most pious of heroes.", "cape", "cape", "cape", 99000, { prayer: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9760, weight: 0.453, skillcape: "prayer", trimmed: true }],
  ["prayer_hood", "Prayer hood", "Prayer skillcape hood.", "coif", "helm", "head", 1, { prayer: 99 }, { }, { cacheId: 9761, weight: 0.453, skillcape: "prayer", hooded: true }],
  ["magic_cape", "Magic cape", "The cape worn by the most powerful mages.", "cape", "cape", "cape", 99000, { magic: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9762, weight: 0.453, skillcape: "magic" }],
  ["magic_cape_t", "Magic cape(t)", "The cape worn by the most powerful mages.", "cape", "cape", "cape", 99000, { magic: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9763, weight: 0.453, skillcape: "magic", trimmed: true }],
  ["magic_hood", "Magic hood", "Magic skillcape hood.", "coif", "helm", "head", 1, { magic: 99 }, { }, { cacheId: 9764, weight: 0.453, skillcape: "magic", hooded: true }],
  ["runecraft_cape", "Runecraft cape", "The cape worn by master runecrafters.", "cape", "cape", "cape", 99000, { runecrafting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9765, weight: 0.453, skillcape: "runecrafting" }],
  ["runecraft_cape_t", "Runecraft cape(t)", "The cape worn by master runecrafters.", "cape", "cape", "cape", 99000, { runecrafting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9766, weight: 0.453, skillcape: "runecrafting", trimmed: true }],
  ["runecraft_hood", "Runecraft hood", "Runecraft skillcape hood.", "coif", "helm", "head", 1, { runecrafting: 99 }, { }, { cacheId: 9767, weight: 0.453, skillcape: "runecrafting", hooded: true }],
  ["hitpoints_cape", "Hitpoints cape", "The cape worn by the healthiest adventurers.", "cape", "cape", "cape", 99000, { hitpoints: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9768, weight: 0.453, skillcape: "hitpoints" }],
  ["hitpoints_cape_t", "Hitpoints cape(t)", "The cape worn by the healthiest adventurers.", "cape", "cape", "cape", 99000, { hitpoints: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9769, weight: 0.453, skillcape: "hitpoints", trimmed: true }],
  ["hitpoints_hood", "Hitpoints hood", "Hitpoints skillcape hood.", "coif", "helm", "head", 1, { hitpoints: 99 }, { }, { cacheId: 9770, weight: 0.453, skillcape: "hitpoints", hooded: true }],
  ["agility_cape", "Agility cape", "The cape worn by the most agile of heroes.", "cape", "cape", "cape", 99000, { agility: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9771, weight: 0.453, skillcape: "agility" }],
  ["agility_cape_t", "Agility cape(t)", "The cape worn by the most agile of heroes.", "cape", "cape", "cape", 99000, { agility: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9772, weight: 0.453, skillcape: "agility", trimmed: true }],
  ["agility_hood", "Agility hood", "Agility skillcape hood.", "coif", "helm", "head", 1, { agility: 99 }, { }, { cacheId: 9773, weight: 0.453, skillcape: "agility", hooded: true }],
  ["herblore_cape", "Herblore cape", "The cape worn by the most skilled at the art of Herblore.", "cape", "cape", "cape", 99000, { herblore: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9774, weight: 0.453, skillcape: "herblore" }],
  ["herblore_cape_t", "Herblore cape(t)", "The cape worn by the most skilled at the art of Herblore.", "cape", "cape", "cape", 99000, { herblore: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9775, weight: 0.453, skillcape: "herblore", trimmed: true }],
  ["herblore_hood", "Herblore hood", "Herblore skillcape hood.", "coif", "helm", "head", 1, { herblore: 99 }, { }, { cacheId: 9776, weight: 0.453, skillcape: "herblore", hooded: true }],
  ["thieving_cape", "Thieving cape", "The cape worn by master thieves.", "cape", "cape", "cape", 99000, { thieving: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9777, weight: 0.453, skillcape: "thieving" }],
  ["thieving_cape_t", "Thieving cape(t)", "The cape worn by master thieves.", "cape", "cape", "cape", 99000, { thieving: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9778, weight: 0.453, skillcape: "thieving", trimmed: true }],
  ["thieving_hood", "Thieving hood", "Thieving skillcape hood.", "coif", "helm", "head", 1, { thieving: 99 }, { }, { cacheId: 9779, weight: 0.453, skillcape: "thieving", hooded: true }],
  ["crafting_cape", "Crafting cape", "The cape worn by master craftworkers.", "cape", "cape", "cape", 99000, { crafting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9780, weight: 0.453, skillcape: "crafting" }],
  ["crafting_cape_t", "Crafting cape(t)", "The cape worn by master craftworkers.", "cape", "cape", "cape", 99000, { crafting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9781, weight: 0.453, skillcape: "crafting", trimmed: true }],
  ["crafting_hood", "Crafting hood", "Crafting skillcape hood.", "coif", "helm", "head", 1, { crafting: 99 }, { }, { cacheId: 9782, weight: 0.453, skillcape: "crafting", hooded: true }],
  ["fletching_cape", "Fletching cape", "The cape worn by the best of fletchers.", "cape", "cape", "cape", 99000, { fletching: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9783, weight: 0.453, skillcape: "fletching" }],
  ["fletching_cape_t", "Fletching cape(t)", "The cape worn by the best of fletchers.", "cape", "cape", "cape", 99000, { fletching: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9784, weight: 0.453, skillcape: "fletching", trimmed: true }],
  ["fletching_hood", "Fletching hood", "Fletching skillcape hood.", "coif", "helm", "head", 1, { fletching: 99 }, { }, { cacheId: 9785, weight: 0.453, skillcape: "fletching", hooded: true }],
  ["slayer_cape", "Slayer cape", "The cape worn by Slayer masters.", "cape", "cape", "cape", 99000, { slayer: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9786, weight: 0.453, skillcape: "slayer" }],
  ["slayer_cape_t", "Slayer cape(t)", "The cape worn by Slayer masters.", "cape", "cape", "cape", 99000, { slayer: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9787, weight: 0.453, skillcape: "slayer", trimmed: true }],
  ["slayer_hood", "Slayer hood", "Slayer skillcape hood.", "coif", "helm", "head", 1, { slayer: 99 }, { }, { cacheId: 9788, weight: 0.453, skillcape: "slayer", hooded: true }],
  ["construction_cape", "Construction cape", "The cape worn by master builders.", "cape", "cape", "cape", 99000, { construction: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9789, weight: 0.453, skillcape: "construction" }],
  ["construction_cape_t", "Construction cape(t)", "The cape worn by master builders.", "cape", "cape", "cape", 99000, { construction: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9790, weight: 0.453, skillcape: "construction", trimmed: true }],
  ["construction_hood", "Construction hood", "Construction skillcape hood.", "coif", "helm", "head", 1, { construction: 99 }, { }, { cacheId: 9791, weight: 0.453, skillcape: "construction", hooded: true }],
  ["mining_cape", "Mining cape", "The cape worn by the most skilled miners.", "cape", "cape", "cape", 99000, { mining: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9792, weight: 0.453, skillcape: "mining" }],
  ["mining_cape_t", "Mining cape(t)", "The cape worn by the most skilled miners.", "cape", "cape", "cape", 99000, { mining: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9793, weight: 0.453, skillcape: "mining", trimmed: true }],
  ["mining_hood", "Mining hood", "Mining skillcape hood.", "coif", "helm", "head", 1, { mining: 99 }, { }, { cacheId: 9794, weight: 0.453, skillcape: "mining", hooded: true }],
  ["smithing_cape", "Smithing cape", "The cape worn by master smiths.", "cape", "cape", "cape", 99000, { smithing: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9795, weight: 0.453, skillcape: "smithing" }],
  ["smithing_cape_t", "Smithing cape(t)", "The cape worn by master smiths.", "cape", "cape", "cape", 99000, { smithing: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9796, weight: 0.453, skillcape: "smithing", trimmed: true }],
  ["smithing_hood", "Smithing hood", "Smithing skillcape hood.", "coif", "helm", "head", 1, { smithing: 99 }, { }, { cacheId: 9797, weight: 0.453, skillcape: "smithing", hooded: true }],
  ["fishing_cape", "Fishing cape", "The cape worn by the best fishermen.", "cape", "cape", "cape", 99000, { fishing: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9798, weight: 0.453, skillcape: "fishing" }],
  ["fishing_cape_t", "Fishing cape(t)", "The cape worn by the best fishermen.", "cape", "cape", "cape", 99000, { fishing: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9799, weight: 0.453, skillcape: "fishing", trimmed: true }],
  ["fishing_hood", "Fishing hood", "Fishing skillcape hood.", "coif", "helm", "head", 1, { fishing: 99 }, { }, { cacheId: 9800, weight: 0.453, skillcape: "fishing", hooded: true }],
  ["cooking_cape", "Cooking cape", "The cape worn by the world's best chefs.", "cape", "cape", "cape", 99000, { cooking: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9801, weight: 0.453, skillcape: "cooking" }],
  ["cooking_cape_t", "Cooking cape(t)", "The cape worn by the world's best chefs.", "cape", "cape", "cape", 99000, { cooking: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9802, weight: 0.453, skillcape: "cooking", trimmed: true }],
  ["cooking_hood", "Cooking hood", "Cooking skillcape hood.", "coif", "helm", "head", 1, { cooking: 99 }, { }, { cacheId: 9803, weight: 0.453, skillcape: "cooking", hooded: true }],
  ["firemaking_cape", "Firemaking cape", "The cape worn by master firelighters.", "cape", "cape", "cape", 99000, { firemaking: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9804, weight: 0.453, skillcape: "firemaking" }],
  ["firemaking_cape_t", "Firemaking cape(t)", "The cape worn by master firelighters.", "cape", "cape", "cape", 99000, { firemaking: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9805, weight: 0.453, skillcape: "firemaking", trimmed: true }],
  ["firemaking_hood", "Firemaking hood", "Firemaking skillcape hood.", "coif", "helm", "head", 1, { firemaking: 99 }, { }, { cacheId: 9806, weight: 0.453, skillcape: "firemaking", hooded: true }],
  ["woodcutting_cape", "Woodcutting cape", "The cape worn by master woodcutters.", "cape", "cape", "cape", 99000, { woodcutting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9807, weight: 0.453, skillcape: "woodcutting" }],
  ["woodcutting_cape_t", "Woodcutting cape(t)", "The cape worn by master woodcutters.", "cape", "cape", "cape", 99000, { woodcutting: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9808, weight: 0.453, skillcape: "woodcutting", trimmed: true }],
  ["woodcutting_hood", "Woodcutting hood", "Woodcutting skillcape hood.", "coif", "helm", "head", 1, { woodcutting: 99 }, { }, { cacheId: 9809, weight: 0.453, skillcape: "woodcutting", hooded: true }],
  ["farming_cape", "Farming cape", "The cape worn by master farmers.", "cape", "cape", "cape", 99000, { farming: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9810, weight: 0.453, skillcape: "farming" }],
  ["farming_cape_t", "Farming cape(t)", "The cape worn by master farmers.", "cape", "cape", "cape", 99000, { farming: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9811, weight: 0.453, skillcape: "farming", trimmed: true }],
  ["farming_hood", "Farming hood", "Farming skillcape hood.", "coif", "helm", "head", 1, { farming: 99 }, { }, { cacheId: 9812, weight: 0.453, skillcape: "farming", hooded: true }],
  ["quest_point_cape", "Quest point cape", "The cape worn by only the most experienced adventurers.", "cape", "cape", "cape", 99000, null, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9813, weight: 0.453, skillcape: "quest", reqQuests: true }],
  ["quest_point_hood", "Quest point hood", "Quest point cape hood.", "coif", "helm", "head", 1, null, { }, { cacheId: 9814, weight: 0.453, skillcape: "quest", hooded: true, reqQuests: true }],
  ["hunter_cape", "Hunter cape", "The cape worn by master hunters.", "cape", "cape", "cape", 99000, { hunter: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9 }, { cacheId: 9948, weight: 0.453, skillcape: "hunter" }],
  ["hunter_cape_t", "Hunter cape(t)", "The cape worn by master hunters.", "cape", "cape", "cape", 99000, { hunter: 99 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 9949, weight: 0.453, skillcape: "hunter", trimmed: true }],
  ["hunter_hood", "Hunter hood", "Hunter skillcape hood.", "coif", "helm", "head", 1, { hunter: 99 }, { }, { cacheId: 9950, weight: 0.453, skillcape: "hunter", hooded: true }],
  /* The Max cape and its hood, sold by Mac (src/actions.js#SHOPS.skillcape).
     The live game's own rules: 99 in every skill to buy and to wear (`reqMax`,
     read by the counter in src/actions.js#skillcapeCanBuy and the equip path
     in src/player.js#canEquip), trimmed-tier stats, and 99,000 coins per skill
     mastered - which is 2,277,000 here for the 23 this world has, with the hood
     riding along free exactly like every other hood (src/actions.js#
     skillcapeBought). The art is the cache's own: the worn cuts, the ground
     model and the colours were baked from build 95 (the 2015-10-23 cache, which
     carries the real 13280/13281), and the shop icon is the osrsbox sprite. */
  ["max_cape", "Max cape", "The cape worn by only the most experienced players.", "cape", "cape", "cape", 2277000, null, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 4 }, { cacheId: 13280, weight: 0.453, skillcape: "max", reqMax: true }],
  ["max_hood", "Max hood", "Max cape hood.", "coif", "helm", "head", 1, null, { }, { cacheId: 13281, weight: 0.453, skillcape: "max", hooded: true, reqMax: true }],

  /* ------------------------------------------------------- the robe sets

     The last magic gear the cache holds (unit L5 of PLAN.md). Every number is
     the item page's own - the examine, the value, the weight (in
     data/item-weights.json) and all fourteen bonuses. Three families here:

       * the **blue wizard**, **black wizard** and **dark wizard** robes, which are what the magic shops
         sell and the first magic kit a new player wears;
       * the **prayer** robes - monk's, druid's and shade - which have no magic
         bonus at all and are worn for their prayer bonus, so the Magic guide
         leaves them out and the Prayer guide lists them with their own bonus in
         the right-hand column;
       * the **magic** robes proper: ghostly, enchanted and 3rd age, which are
         real magic armour (enchanted needs 20 Defence and 40 Magic; 3rd age 30
         Defence and 65 Magic).

     The god vestments are the odd ones: a Saradomin/Guthix/Zamorak robe top or
     pair of legs needs **20 Prayer**, a mitre **40 Prayer and 40 Magic**, and
     the stoles (in AMULETS below) and croziers (in STAVES above) **60 Prayer** -
     so the Magic guide files each vestment whole, with the prayer gate in the
     bracket beside the piece, and the Prayer guide's own derived list covers
     every prayer-gated piece again.
     A robe-bottom slot with no bonuses at all (the skirts) is still a real
     item: it is the wizard set's own bottom and the cache's own artwork, and it
     carries its own value. */
  ["wizard_hat", "Blue wizard hat", "A silly pointed hat.", "coif", "helm", "head", 2, null, { amagic: 2, dmagic: 2 }, { cacheId: 579 }],
  ["black_wizard_hat", "Black wizard hat", "A silly pointed hat, dyed black.", "coif", "helm", "head", 2, null, { amagic: 2, dmagic: 2 }, { cacheId: 15000 }],
  ["wizard_robe", "Blue wizard robe top", "I can do magic better in this.", "leatherbody", "body", "body", 15, null, { amagic: 3, dmagic: 3 }, { cacheId: 577 }],
  ["blue_skirt", "Blue wizard robe bottom", "Leg covering favoured by women and wizards.", "chaps", "legs", "legs", 2, null, {}, { cacheId: 1011 }],
  ["black_robe", "Black wizard robe top", "I can do magic better in this.", "leatherbody", "body", "body", 13, null, { amagic: 3, dmagic: 3 }, { cacheId: 581 }],
  ["black_skirt", "Black wizard robe bottom", "Clothing favoured by women and black wizards.", "chaps", "legs", "legs", 2, null, {}, { cacheId: 1015 }],
  ["dark_wizard_hat", "Dark wizard hat", "A silly pointed hat, stained dark brown.", "coif", "helm", "head", 2, null, { amagic: 2, dmagic: 2 }, { cacheId: 15001 }],
  ["dark_wizard_robe_top", "Dark wizard robe top", "I can do magic better in this.", "leatherbody", "body", "body", 13, null, { amagic: 3, dmagic: 3 }, { cacheId: 15002 }],
  ["dark_wizard_robe_bottom", "Dark wizard robe bottom", "Clothing favoured by dark wizards.", "chaps", "legs", "legs", 2, null, {}, { cacheId: 15003 }],
  ["monks_robe_top", "Monk's robe top", "I feel closer to the gods when I am wearing this.", "leatherbody", "body", "body", 40, null, { pray: 6 }, { cacheId: 544 }],
  ["monks_robe", "Monk's robe bottom", "Keeps a monk's knees nice and warm.", "chaps", "legs", "legs", 30, null, { pray: 5 }, { cacheId: 542 }],
  ["druids_robe_top", "Druid's robe top", "I feel closer to the gods when I am wearing this.", "leatherbody", "body", "body", 40, null, { pray: 4 }, { cacheId: 540 }],
  ["druids_robe", "Druid's robe", "Keeps a druid's knees nice and warm.", "chaps", "legs", "legs", 30, null, { pray: 4 }, { cacheId: 538 }],
  ["shade_robe_top", "Shade robe top", "I feel closer to the gods when I am wearing this.", "leatherbody", "body", "body", 40, null, { pray: 5 }, { cacheId: 546 }],
  ["shade_robe", "Shade robe", "If a shade had knees, this would keep them nice and warm.", "chaps", "legs", "legs", 30, null, { pray: 4 }, { cacheId: 548 }],
  ["ghostly_hood", "Ghostly hood", "A ghostly hood, fit for a ghostly head.", "coif", "helm", "head", 30, null, { amagic: 3, dmagic: 3 }, { cacheId: 6109 }],
  ["ghostly_robe_top", "Ghostly robe top", "A particularly spooky robe top.", "leatherbody", "body", "body", 30, null, { amagic: 5, dmagic: 5 }, { cacheId: 6107 }],
  ["ghostly_robe_bottom", "Ghostly robe bottom", "An unearthly set of robe bottoms.", "chaps", "legs", "legs", 30, null, { amagic: 4, dmagic: 4 }, { cacheId: 6108 }],
  ["ghostly_boots", "Ghostly boots", "They seem to be not quite of this world...", "boots", "feet", "feet", 30, null, { amagic: 2, dmagic: 2 }, { cacheId: 6106 }],
  ["ghostly_cloak", "Ghostly cloak", "Made of a strange ghostly material...", "cape", "cape", "cape", 25, null, { amagic: 5, dmagic: 5 }, { cacheId: 6111 }],
  ["enchanted_hat", "Enchanted hat", "A three pointed hat of magic.", "coif", "helm", "head", 15000, { defence: 20, magic: 40 }, { amagic: 4, dmagic: 4 }, { cacheId: 7400 }],
  ["enchanted_top", "Enchanted top", "Enchanted Wizards robes.", "leatherbody", "body", "body", 120000, { defence: 20, magic: 40 }, { amagic: 20, dmagic: 20 }, { cacheId: 7399 }],
  ["enchanted_robe", "Enchanted robe", "Enchanted Wizards robes.", "chaps", "legs", "legs", 80000, { defence: 20, magic: 40 }, { amagic: 15, dmagic: 15 }, { cacheId: 7398 }],
  ["third_age_mage_hat", "3rd age mage hat", "Fabulously ancient mage protection enchanted in the 3rd Age.", "coif", "helm", "head", 50400, { defence: 30, magic: 65 }, { amagic: 8, dmagic: 8, mdmg: 1 }, { cacheId: 10342 }],
  ["third_age_robe_top", "3rd age robe top", "Fabulously ancient mage protection enchanted in the 3rd Age.", "leatherbody", "body", "body", 50800, { defence: 30, magic: 65 }, { amagic: 24, dmagic: 24, mdmg: 1 }, { cacheId: 10338 }],
  ["third_age_robe", "3rd age robe", "Fabulously ancient mage protection enchanted in the 3rd Age.", "chaps", "legs", "legs", 50600, { defence: 30, magic: 65 }, { amagic: 19, dmagic: 19, mdmg: 1 }, { cacheId: 10340 }],
  ["third_age_full_helmet", "3rd age full helmet", "Fabulously ancient armour beaten from magical silver.", "fullhelm", "helm", "head", 90000, { defence: 65 }, { amagic: -5, arange: -2, dstab: 47, dslash: 49, dcrush: 43, dmagic: -3, drange: 48 }, { cacheId: 10350 }],
  ["third_age_kiteshield", "3rd age kiteshield", "Fabulously ancient armour beaten from magical silver.", "kiteshield", "shield", "shield", 180000, { defence: 65 }, { amagic: -10, arange: -4, dstab: 63, dslash: 65, dcrush: 61, dmagic: -3, drange: 63 }, { cacheId: 10352 }],
  ["third_age_platebody", "3rd age platebody", "Fabulously ancient armour beaten from magical silver.", "platebody", "body", "body", 200000, { defence: 65 }, { amagic: -20, arange: 0, dstab: 96, dslash: 108, dcrush: 113, dmagic: -4, drange: 97 }, { cacheId: 10348 }],
  ["third_age_platelegs", "3rd age platelegs", "Fabulously ancient armour beaten from magical silver.", "platelegs", "legs", "legs", 200000, { defence: 65 }, { amagic: -25, arange: -2, dstab: 78, dslash: 76, dcrush: 83, dmagic: -5, drange: 75 }, { cacheId: 10346 }],
  ["third_age_range_coif", "3rd age range coif", "Fabulously ancient range protection crafted from white dragonhide.", "coif", "helm", "head", 50400, { ranged: 65, defence: 45 }, { amagic: -2, arange: 9, dstab: 4, dslash: 7, dcrush: 10, dmagic: 5, drange: 8 }, { cacheId: 10334 }],
  ["third_age_range_top", "3rd age range top", "Fabulously ancient range protection crafted from white dragonhide.", "leatherbody", "body", "body", 50800, { ranged: 65, defence: 45 }, { amagic: -15, arange: 30, dstab: 55, dslash: 47, dcrush: 60, dmagic: 60, drange: 55 }, { cacheId: 10330 }],
  ["third_age_range_legs", "3rd age range legs", "Fabulously ancient range protection crafted from white dragonhide.", "chaps", "legs", "legs", 50600, { ranged: 65, defence: 45 }, { amagic: -10, arange: 17, dstab: 31, dslash: 25, dcrush: 33, dmagic: 30, drange: 31 }, { cacheId: 10332 }],
  ["third_age_vambraces", "3rd age vambraces", "Fabulously ancient range protection crafted from white dragonhide.", "gloves", "hands", "hands", 50500, { ranged: 65, defence: 45 }, { amagic: -10, arange: 11, dstab: 6, dslash: 5, dcrush: 7, dmagic: 9, drange: 0 }, { cacheId: 10336 }],
  ["third_age_plateskirt", "3rd age plateskirt", "Fabulously ancient armour beaten from magical silver.", "plateskirt", "legs", "legs", 200000, { defence: 65 }, { amagic: -25, arange: -2, dstab: 78, dslash: 76, dcrush: 83, dmagic: -5, drange: 75 }, { cacheId: 23242 }],
  ["third_age_druidic_top", "3rd age druidic robe top", "A fabulously ancient woven robe top as worn by the druids of old.", "leatherbody", "body", "body", 200000, { prayer: 65 }, { pray: 8 }, { cacheId: 23336 }],
  ["third_age_druidic_bottoms", "3rd age druidic robe bottoms", "A fabulously ancient woven robe as worn by the druids of old.", "chaps", "legs", "legs", 200000, { prayer: 65 }, { pray: 6 }, { cacheId: 23339 }],
  ["third_age_cloak", "3rd age cloak", "A beautiful cloak woven by ancient tailors.", "cape", "cape", "cape", 85000, { prayer: 65 }, { dstab: 9, dslash: 9, dcrush: 9, dmagic: 9, drange: 9, pray: 5 }, { cacheId: 12437 }],
  ["third_age_druidic_cloak", "3rd age druidic cloak", "A fabulously ancient vine cloak as worn by the druids of old.", "cape", "cape", "cape", 200000, { prayer: 65 }, { amagic: 1, dstab: 3, dslash: 3, dcrush: 3, dmagic: 3, drange: 3, pray: 3 }, { cacheId: 23345 }],
  ["zamorak_monk_top", "Zamorak monk top", "A robe worn by worshippers of Zamorak.", "leatherbody", "body", "body", 40, null, { amagic: 2, dmagic: 3, pray: 3 }, { cacheId: 1035 }],
  ["zamorak_monk_bottom", "Zamorak monk bottom", "A robe worn by worshippers of Zamorak.", "chaps", "legs", "legs", 30, null, { amagic: 2, dmagic: 3, pray: 3 }, { cacheId: 1033 }],
  ["saradomin_mitre", "Saradomin mitre", "A Saradomin mitre.", "coif", "helm", "head", 5000, { prayer: 40, magic: 40 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10452 }],
  ["saradomin_robe_top", "Saradomin robe top", "Saradomin Vestments.", "leatherbody", "body", "body", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 6 }, { cacheId: 10458 }],
  ["saradomin_robe_legs", "Saradomin robe legs", "Leggings from the Saradomin Vestments.", "chaps", "legs", "legs", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10464 }],
  ["guthix_mitre", "Guthix mitre", "A Guthix mitre.", "coif", "helm", "head", 5000, { prayer: 40, magic: 40 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10454 }],
  ["guthix_robe_top", "Guthix robe top", "Guthix Vestments.", "leatherbody", "body", "body", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 6 }, { cacheId: 10462 }],
  ["guthix_robe_legs", "Guthix robe legs", "Leggings from the Guthix Vestments.", "chaps", "legs", "legs", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10466 }],
  ["zamorak_mitre", "Zamorak mitre", "A Zamorak mitre.", "coif", "helm", "head", 5000, { prayer: 40, magic: 40 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10456 }],
  ["zamorak_robe_top", "Zamorak robe top", "Zamorak Vestments.", "leatherbody", "body", "body", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 6 }, { cacheId: 10460 }],
  ["zamorak_robe_legs", "Zamorak robe legs", "Leggings from the Zamorak Vestments.", "chaps", "legs", "legs", 7000, { prayer: 20 }, { amagic: 4, dmagic: 4, pray: 5 }, { cacheId: 10468 }],
  ["iban_robe_top", "Iban's robe top", "The grey robe of Iban himself.", "leatherbody", "costume", "body", 1, { attack: 999 }, {}, {}],
  ["iban_robe", "Iban's robe", "The grey robe of Iban himself.", "chaps", "costume", "legs", 1, { attack: 999 }, {}, {}],
  /* The beekeeper's outfit (cache items 25129-25137, November 2020): the Bee
     keeper's own clothes, worn only by the beekeeper archetype in the smithy
     (src/archetypes.js#beekeeper). F2P cosmetic, zero bonuses, value 1, weight
     0.001, Wear/Drop - the wiki's own numbers. The attack-999 gate is this
     world's NPC-costume lock (see iban_robe_top above): nobody can put them
     on, so no guide lists them (see check-gear.mjs#GUIDE_EXEMPT) and no shop
     stocks them. Worn models baked from the 2020 cache (see
     src/tools/cache-bake/README.md#beekeeper). */
  ["beekeeper_hat", "Beekeeper's hat", "Makes sure no bees get in your eyes!!", "coif", "costume", "head", 1, { attack: 999 }, {}, { cacheId: 25129, weight: 0.001 }],
  ["beekeeper_top", "Beekeeper's top", "According to the laws of aviation, there is no way that a bee should be able to fly.", "leatherbody", "costume", "body", 1, { attack: 999 }, {}, { cacheId: 25131, weight: 0.001 }],
  ["beekeeper_legs", "Beekeeper's legs", "Truly these pants are the bee's knees.", "chaps", "costume", "legs", 1, { attack: 999 }, {}, { cacheId: 25133, weight: 0.001 }],
  ["beekeeper_gloves", "Beekeeper's gloves", "Oww OWWW they're defending themselves somehow!", "gloves", "costume", "hands", 1, { attack: 999 }, {}, { cacheId: 25135, weight: 0.001 }],
  ["beekeeper_boots", "Beekeeper's boots", "BEE careful where you step with these boots on.", "boots", "costume", "feet", 1, { attack: 999 }, {}, { cacheId: 25137, weight: 0.001 }],

  /* The six partyhats (cache items 1038-1048): the cracker hats, and the only
     purely decorative head slot in the game. Every field is the item's own and
     nothing is filled in to make them look like armour - a partyhat has a value
     of 1, no bonuses at all and no requirement, which is exactly why the
     Defence guide does not list them (skillguides.js keeps only rows with a
     `req`) and why `canEquip` lets anyone wear one.

     All six share one model: 187 for the male body, 363 for the female, with
     the five coloured ones recoloured on the way in (colour 926, a grey the
     base cream cone is painted in, becomes each hat's own - 11200 yellow,
     43968 blue, 22464 green, 51136 purple, 127 white). The red one is the
     un-recoloured original, which is why it carries no cacheId-only entry like
     the mystic hats do: 1038 is genuinely its own definition, not a shared
     name. The ids are not in the order the colours read either - 1046 is
     purple and 1048 white in the cache, and reading them off the wiki would
     have them the other way round. */
  ["red_partyhat", "Red partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1038, colour: 0xd02020 }],
  ["yellow_partyhat", "Yellow partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1040, colour: 0xe0c020 }],
  ["blue_partyhat", "Blue partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1042, colour: 0x4060d0 }],
  ["green_partyhat", "Green partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1044, colour: 0x50b050 }],
  ["purple_partyhat", "Purple partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1046, colour: 0x9040c0 }],
  ["white_partyhat", "White partyhat", "A nice hat from a cracker.", "coif", "helm", "head", 1, null, null, { cacheId: 1048, colour: 0xf0f0f0 }],
  /* The pirate's hat (cache item 2651, "Shiver me timbers!"): the head slot's
     own tricorn, worn by Scully on the tutorial island (src/world.js) and
     wearable by the player like any other hat - no bonuses, no requirement,
     exactly the published zeroes. The Defence guide lists it with the other
     gate-less helmets by construction (skillguides.js#armourGuide). */
  ["pirate_hat", "Pirate's hat", "Shiver me timbers!", "coif", "helm", "head", 180, null, null, { cacheId: 2651, weight: 0.001 }],
];

/* The family behind an armour id, for the procedural icons' fallback colour and
   nothing else - every piece in the table above has a real sprite. */
const ARMOUR_COLOUR = Object.assign({}, METAL_COLOUR, {
  leather: 0x8a5a34, hardleather: 0x9a6a3c, studded: 0x7a5a3c, snakeskin: 0x7a8a5a,
  mystic: 0x3b4fa5, splitbark: 0x6a5a3a,
  ahrims: 0x4a3a6a, dharoks: 0x6a2a2a, guthans: 0x3a5a3a, karils: 0x3a4a5a,
  torags: 0x5a4a3a, veracs: 0x5a5a5a,
  rock: 0x7a6a5a, spined: 0x6a5a3a, skeletal: 0xd8d8c8,
  berserker: 0x8a5a3a, warrior: 0x8a8a8a, archer: 0x6a8a4a, farseer: 0x4a6a9a,
  fremennik: 0x8a8a8a, helm: 0xd8d0a0, initiate: 0xf0ece0,
  wooden: 0x8a5a34, anti: 0x9a6a3a, elemental: 0x4a6a8a, mind: 0xc8c8e8,
  dragonfire: 0x2a2a2a,
  /* the capes: one colour per dye, then the guild's and the gods' own */
  red: 0xb03030, black: 0x35353a, blue: 0x3050b0, yellow: 0xd8c040,
  green: 0x3a8a3a, purple: 0x7a3a9a, orange: 0xd88030,
  grey: 0xb4b4b4, teal: 0x1a9a8a, cyan: 0x30c0d0,
  cape: 0xd8c060, saradomin: 0xa8b8e0, guthix: 0x7ac078, zamorak: 0xc07868,
  iban: 0x6f6f78,
  /* the Max cape's dark cut, for its procedural icon only */
  max: 0x2e2c34,
});

/* The table above, turned into items. */
for (const [id, name, examine, shape, cat, slot, value, req, bonus, extra] of ARMOUR_TABLE) {
  const b = B();
  Object.assign(b, bonus);
  def(id, Object.assign({
    name, examine, value, slot, req, bonus: b, kind: "armour", cat,
    colour: ARMOUR_COLOUR[id.split("_")[0]] || 0x9a9a94, shape,
  }, extra || {}));
}

/* Names in the 2007 cache don't always match the modern item names we display.
   The bake looks items up by their cache name, so anything that differs gets an
   override here (used only by src/tools/cache-bake/held-bake-run.mjs). */
const CACHE_NAMES = {
  adamant_warhammer: "Addy warhammer",
  karils_crossbow: "Karils crossbow",
  guthans_warspear: "Guthans warspear",
  torags_hammers: "Torags hammers",
  veracs_flail: "Veracs flail",
  adamant_bar: "Adamantite bar",
  rune_bar: "Runite bar",
  raw_shrimp: "Raw shrimps",
  shrimp: "Shrimps",
  cooked_rat: "Cooked meat",
  green_dhide_vambraces: "Green d'hide vamb",
  blue_dhide_vambraces: "Blue d'hide vamb",
  red_dhide_vambraces: "Red d'hide vamb",
  black_dhide_vambraces: "Black d'hide vamb",
  snakeskin_vambraces: "Snakeskin v'brace",
  goldsmith_gauntlets: "Goldsmith gauntlet",
};

const LOGS = [
  { id: "logs", name: "Logs", level: 1, xp: 25, col: 0x8a6a42, tree: "tree" },
  { id: "oak_logs", name: "Oak logs", level: 15, xp: 37.5, col: 0x9a7a4a, tree: "oak" },
  { id: "willow_logs", name: "Willow logs", level: 30, xp: 67.5, col: 0x8a7a52, tree: "willow" },
  { id: "maple_logs", name: "Maple logs", level: 45, xp: 100, col: 0x9a8a62, tree: "maple" },
  { id: "yew_logs", name: "Yew logs", level: 60, xp: 175, col: 0x7a6a42, tree: "yew" },
  { id: "magic_logs", name: "Magic logs", level: 75, xp: 250, col: 0x6a5a3a, tree: "magic" },
];
LOGS.forEach((l) => def(l.id, { name: l.name, examine: "Logs cut from a tree.", value: 4 * l.xp, stack: false, kind: "log", colour: l.col, shape: "log", levelReq: l.level, xp: l.xp, tree: l.tree }));

/* The mining success low/high pair of each rock, straight out of the OSRS
   wiki - the "low" value is the Success-chance numerator at level 1 and the
   "high" one at level 99, and the level in between is the linear approximation
   `src/actions.js#mineChance` spells out. They are the client's own figures
   (each rock's wiki page carries them under "Skilling success chart": *Coal
   rocks ... low1=16|high1=100|req1=30*), and they are what makes the four
   level-1 rocks worth mining and a runite rock a lottery: at level 99 clay,
   copper, tin, iron and blurite are a certainty, coal is 40%, gold 30%,
   mithril 20%, adamantite 10% and runite 7% - never 1.

   Two of the numbers are **the wiki's current ones, not the 2007 client's**,
   and one of those is worth saying out loud: iron's `high` of 350 is past the
   256 the roll is drawn from, so iron becomes a *certainty* at level 62 and
   stays one - which is also when copper and tin reach it. The user's own
   recollection was "iron is quite high but I don't think 100%" (2026-09-23),
   and that is exactly right *below* 62: at the level 15 requirement iron is 52%,
   and it climbs steadily from there. */
const ORES = [
  { id: "clay", name: "Clay", level: 1, xp: 5, low: 128, high: 400, col: 0xb8b09a, ore: "clay", bar: null, smithXp: 0 },
  { id: "copper_ore", name: "Copper ore", level: 1, xp: 17.5, low: 100, high: 350, col: 0xc47a3a, ore: "copper", bar: "bronze_bar", smithXp: 6.2 },
  { id: "tin_ore", name: "Tin ore", level: 1, xp: 17.5, low: 100, high: 350, col: 0xd6dadd, ore: "tin", bar: "bronze_bar", smithXp: 6.2 },
  { id: "iron_ore", name: "Iron ore", level: 15, xp: 35, low: 96, high: 350, col: 0x8a5b3c, ore: "iron", bar: "iron_bar", smithXp: 12.5 },
  { id: "silver_ore", name: "Silver ore", level: 20, xp: 40, low: 25, high: 200, col: 0xc8d0d8, ore: "silver", bar: "silver_bar", smithXp: 13.7 },
  { id: "coal", name: "Coal", level: 30, xp: 50, low: 16, high: 100, col: 0x2e2d2a, ore: "coal", bar: null, smithXp: 0 },
  { id: "gold_ore", name: "Gold ore", level: 40, xp: 65, low: 7, high: 75, col: 0xe8c84a, ore: "gold", bar: "gold_bar", smithXp: 22.5 },
  { id: "mithril_ore", name: "Mithril ore", level: 55, xp: 80, low: 4, high: 50, col: 0x5b86c4, ore: "mithril", bar: "mithril_bar", smithXp: 30 },
  { id: "adamantite_ore", name: "Adamantite ore", level: 70, xp: 95, low: 2, high: 25, col: 0x4f8f6f, ore: "adamantite", bar: "adamant_bar", smithXp: 37.5 },
  { id: "runite_ore", name: "Runite ore", level: 85, xp: 125, low: 1, high: 18, col: 0x5fb0d0, ore: "runite", bar: "rune_bar", smithXp: 50 },
];
ORES.forEach((o) => def(o.id, { name: o.name, examine: "This needs refining.", value: Math.round(o.xp * 3), kind: "ore", colour: o.col, shape: "ore", levelReq: o.level, xp: o.xp, bar: o.bar, smithXp: o.smithXp, rock: o.ore, mineLow: o.low, mineHigh: o.high }));
/* Rune essence is mined, not smelted, so it stays out of the ORES table (whose
   rows all carry a `bar`): kind "essence" keeps it off the furnace, and it
   stacks the way the live game's does. The grey boulder art is the ore painter
   in its own colour (src/icons.js#PAINT). */
def("rune_essence", { name: "Rune essence", examine: "The source of all runes.", value: 4, stack: true, kind: "essence", colour: 0x9aa0a8, shape: "ore", levelReq: 1, xp: 5, rock: "essence", mineLow: 128, mineHigh: 400, cacheId: 1436 });
/* The air talisman: never consumed, never stacked, carried to the mysterious
   ruins to reach the Air Altar. Sedridor hands the first one over himself (see
   src/actions.js#sedridorScreens). */
def("air_talisman", { name: "Air talisman", examine: "A mysterious power emanates from this talisman.", value: 4, kind: "talisman", colour: 0x7fb2e5, shape: "talisman", cacheId: 1438 });

const BARS = {
  bronze_bar: { name: "Bronze bar", col: 0xb08040, n: ["copper_ore", "tin_ore"], xp: 6.2, level: 1, value: 12 },
  iron_bar: { name: "Iron bar", col: 0xb8b8b8, n: ["iron_ore"], xp: 12.5, level: 15, value: 40 },
  silver_bar: { name: "Silver bar", col: 0xd8e0e8, n: ["silver_ore"], xp: 13.7, level: 20, value: 60 },
  gold_bar: { name: "Gold bar", col: 0xf0d858, n: ["gold_ore"], xp: 22.5, level: 40, value: 120 },
  steel_bar: { name: "Steel bar", col: 0xc8c8c8, n: ["iron_ore", "coal", "coal"], xp: 17.5, level: 30, value: 90 },
  mithril_bar: { name: "Mithril bar", col: 0x6f8fb8, n: ["mithril_ore", "coal", "coal", "coal"], xp: 30, level: 50, value: 240 },
  adamant_bar: { name: "Adamant bar", col: 0x5f9f7f, n: ["adamantite_ore", "coal", "coal", "coal", "coal", "coal"], xp: 37.5, level: 70, value: 600 },
  rune_bar: { name: "Rune bar", col: 0x6fc0e0, n: ["runite_ore", "coal", "coal", "coal", "coal", "coal", "coal", "coal", "coal"], xp: 50, level: 85, value: 3200 },
};
for (const [id, b] of Object.entries(BARS)) {
  def(id, { name: b.name, examine: "It's a bar of " + b.name.split(" ")[0].toLowerCase() + ".", value: b.value, kind: "bar", colour: b.col, shape: "bar", levelReq: b.level, xp: b.xp, inputs: b.n });
}

/* A fish's `spots` are the loc action lists it comes from (src/actions.js#
   SPOT_METHODS holds the verbs): **net_bait** is loc 2028 "Net/Bait" in the
   shallows (shrimp and anchovies on a net; sardine, herring and pike on a rod
   with bait), **lure_bait** is 10087 ["Lure","Bait"] (trout and salmon on the
   fly, pike on bait with a rod), **cage_harpoon** is loc 2029 "Cage/Harpoon" in
  the deep water (tuna on a harpoon, lobster in a pot), and **net_harpoon** is
  loc 2030 "Net/Harpoon", the sea spot - shrimp and anchovies on the net, tuna,
  swordfish and shark on the harpoon. Since the coast (world.js#coastal) gave
  the map a real sea, src/world.js#fishSpots places this last kind both in the
  deepest water of the lake and in the open sea along the shore, where a
  harpoon fished from the bank lands the tuna, swordfish and shark whose level
  gates are 50 and 76 - the deepest water there is, since the coast is what
  put a sea on the map at all. The five later kinds follow the same pattern:
  **bignet_harpoon** is the sea's other face (mackerel, cod and bass on a big
  net, tuna and swordfish on the harpoon), **bait** is the eel water (slimy and
  cave eels on a rod with bait), **harpoon** is the harpoon-only sea rock
  (tuna and swordfish, no net), **oily** is the boiling water an oily rod
  fishes (lava and infernal eels, on bait - the lake's deep middle stands in
  for Mor Ul Rek, the way it already stands in for the sea), and
  **karambwan_spot** is the jungle pool (karambwanji on the small net,
  karambwan itself on the vessel with karambwanji for bait - see the karambwan
  defs below, which cannot go through the FISH loop because the cooking level
  is not the fishing level minus one). */
const FISH = [
  { id: "shrimp", name: "Shrimp", level: 1, xp: 10, tool: "net", spots: ["net_bait", "net_harpoon"], col: 0xe8a08a, cookXp: 30, burn: 0.35 },
  { id: "anchovies", name: "Anchovies", level: 15, xp: 40, tool: "net", spots: ["net_bait", "net_harpoon"], col: 0xb8c0c8, cookXp: 30, burn: 0.35 },
  { id: "sardine", name: "Sardine", level: 5, xp: 20, tool: "rod_bait", spots: ["net_bait"], col: 0xa8b8c0, cookXp: 40, burn: 0.3 },
  { id: "herring", name: "Herring", level: 10, xp: 30, tool: "rod_bait", spots: ["net_bait"], col: 0x8fa8b8, cookXp: 50, burn: 0.28 },
  { id: "trout", name: "Trout", level: 20, xp: 50, tool: "fly", spots: ["lure_bait"], col: 0xc0a080, cookXp: 70, burn: 0.25 },
  { id: "salmon", name: "Salmon", level: 30, xp: 70, tool: "fly", spots: ["lure_bait"], col: 0xd0a890, cookXp: 90, burn: 0.22 },
  { id: "pike", name: "Pike", level: 25, xp: 60, tool: "rod_bait", spots: ["lure_bait"], col: 0x90a090, cookXp: 80, burn: 0.24 },
  { id: "tuna", name: "Tuna", level: 35, xp: 80, tool: "harpoon", spots: ["cage_harpoon", "net_harpoon", "bignet_harpoon", "harpoon"], col: 0x8898b0, cookXp: 100, burn: 0.2 },
  { id: "lobster", name: "Lobster", level: 40, xp: 90, tool: "cage", spots: ["cage_harpoon"], col: 0xd05a3a, cookXp: 120, burn: 0.18 },
  { id: "swordfish", name: "Swordfish", level: 50, xp: 100, tool: "harpoon", spots: ["net_harpoon", "bignet_harpoon", "harpoon"], col: 0x7a8aa8, cookXp: 140, burn: 0.15 },
  { id: "shark", name: "Shark", level: 76, xp: 110, tool: "harpoon", spots: ["net_harpoon"], col: 0x6a7a90, cookXp: 210, burn: 0.1 },
  { id: "mackerel", name: "Mackerel", level: 16, xp: 20, tool: "bignet", spots: ["bignet_harpoon"], col: 0x7a98a8, cookXp: 60, burn: 0.28 },
  { id: "cod", name: "Cod", level: 23, xp: 45, tool: "bignet", spots: ["bignet_harpoon"], col: 0x9aa8b0, cookXp: 70, burn: 0.25 },
  { id: "bass", name: "Bass", level: 46, xp: 100, tool: "bignet", spots: ["bignet_harpoon"], col: 0x6a8898, cookXp: 130, burn: 0.2 },
  { id: "slimy_eel", name: "Slimy eel", level: 28, xp: 65, tool: "rod_bait", spots: ["bait"], col: 0x5a8a5a, cookXp: 95, burn: 0.22 },
  { id: "cave_eel", name: "Cave eel", level: 38, xp: 80, tool: "rod_bait", spots: ["bait"], col: 0x7a6a9a, cookXp: 115, burn: 0.2 },
  { id: "lava_eel", name: "Lava eel", level: 53, xp: 30, tool: "oily", spots: ["oily"], col: 0xd05a28, cookXp: 30, burn: 0.25 },
  { id: "infernal_eel", name: "Infernal eel", level: 80, xp: 95, tool: "oily", spots: ["oily"], col: 0xb02818, cookXp: 120, burn: 0.18 },
];
/* Every heal below is the **published** one - the wiki's Food/All food table,
   "Heals" column - rather than a number derived from the item's Cooking level.
   The two are not the same thing: anchovies and shrimps are both level 1 and
   heal 1 and 3, and a shark heals 20 where "cookXp / 8" would have said 14. */
const FISH_HEAL = {
  shrimp: 3, anchovies: 1, sardine: 4, herring: 5, trout: 7, salmon: 9,
  pike: 8, tuna: 10, lobster: 12, swordfish: 14, shark: 20,
  mackerel: 6, cod: 7, bass: 13, slimy_eel: 5, cave_eel: 7,
  lava_eel: 11, infernal_eel: 12,
};

FISH.forEach((f) => {
  def("raw_" + f.id, { name: "Raw " + f.name.toLowerCase(), examine: "I should try cooking this.", value: f.xp * 2, kind: "fish", colour: f.col, shape: "fish", levelReq: f.level, xp: f.xp, tool: f.tool, spots: f.spots });
  def(f.id, { name: f.name, examine: "Some nicely cooked " + f.name.toLowerCase() + ".", value: f.cookXp * 2, kind: "food", colour: f.col, shape: "fish_cooked", heal: FISH_HEAL[f.id], cookOf: "raw_" + f.id, cookXp: f.cookXp, burn: f.burn, levelReq: Math.max(1, f.level - 1) });
});

def("bread", { name: "Bread", examine: "Nice crispy bread.", value: 12, kind: "food", colour: 0xd8b070, shape: "bread", heal: 5, cookOf: "bread_dough", cookXp: 40, burn: 0.57, levelReq: 1 });
/* Tutorial island: a fresh coconut, knocked from the crown, and the only
   honest drink on the cay until the stills get built. Split it with a knife -
   the milk inside heals. (Icon: cache 5974; ground/held model: the "coconut"
   bake already in src/models/items.json.) */
def("coconut", { name: "Coconut", examine: "A fresh coconut, heavy with milk.", value: 8, kind: "misc", colour: 0x6a4a28, shape: "coconut", weight: 0.5 });
def("cheese", { name: "Cheese", examine: "A wedge of cheese.", value: 8, kind: "food", colour: 0xf0d060, shape: "cheese", heal: 2 });
def("cooked_meat", { name: "Cooked meat", examine: "A tasty bit of cooked meat.", value: 20, kind: "food", colour: 0xa06840, shape: "meat", heal: 3 });
def("raw_beef", { name: "Raw beef", examine: "I need to cook this first.", value: 8, kind: "food", colour: 0xd06858, shape: "meat_raw", cookOf: "cooked_meat", cookXp: 30, burn: 0.3, levelReq: 1 });
def("raw_chicken", { name: "Raw chicken", examine: "I need to cook this first.", value: 5, kind: "food", colour: 0xe8c0a8, shape: "meat_raw", cookOf: "cooked_chicken", cookXp: 30, burn: 0.3, levelReq: 1 });
def("cooked_chicken", { name: "Cooked chicken", examine: "A cooked chicken.", value: 14, kind: "food", colour: 0xc08050, shape: "meat", heal: 3 });
def("raw_rat", { name: "Raw rat meat", examine: "I need to cook this first.", value: 4, kind: "food", colour: 0xc09090, shape: "meat_raw", cookOf: "cooked_rat", cookXp: 30, burn: 0.3, levelReq: 1 });
def("cooked_rat", { name: "Cooked rat meat", examine: "Not very appetising.", value: 8, kind: "food", colour: 0x906850, shape: "meat", heal: 3 });
/* ------------------------------------------------------------------- the
   duck's and the ram's meat (this world's own, borrowing real cache art)

   The duck and the ram are this world's own creatures and neither of their
   meats exists in the revision: the cache's item table (7,648 names, max id
   11682) has no duck and no mutton, and the live game never added them either
   - the wiki has no page at all for Raw duck, Cooked duck, Raw mutton or
   Cooked mutton (checked through the MediaWiki API, not by eye). So the four
   are invented items, and each borrows its **art and ground model** from the
   closest real meat this revision does carry:

     * the duck's, from the Hunter skill's own **bird meat** - 9978 raw /
       9980 roast - because a duck is a bird; and
     * the ram's, from the same skill's **beast meat** - 9986 raw / 9988
       roast - because a ram is a beast.

   Both pairs are real items of this revision (Hunter landed 21 November 2006,
   so they are period-correct for an August 2007 world) and `cacheId` is the
   key the bake looks a ground model up by (`items-bake-run.mjs#wantedAllItems`
   reads `cacheId` first). The **icons** are the wiki's own PNGs for those four
   cache items, cropped into `src/sprites/items/<our key>.png` the way every
   other icon in the folder was made; the **weights** in
   `src/data/item-weights.json` are the borrowed item's own (0.15 kg for the
   bird, 2 kg for the beast).

   The **heals** are this world's invention - there is no published duck or
   mutton to copy one from - so both cooked meats heal the plain cooked meat's
   3, marked here as the invented number it is. Their values are this world's
   own too, for the same reason. */
def("raw_duck", { name: "Raw duck", cacheId: 9978, examine: "I need to cook this first.", value: 6, kind: "food", colour: 0xd8a8a0, shape: "meat_raw", cookOf: "cooked_duck", cookXp: 30, burn: 0.3, levelReq: 1 });
def("cooked_duck", { name: "Cooked duck", cacheId: 9980, examine: "A cooked duck.", value: 16, kind: "food", colour: 0xa86840, shape: "meat", heal: 3 });
def("raw_mutton", { name: "Raw mutton", cacheId: 9986, examine: "I need to cook this first.", value: 6, kind: "food", colour: 0xd06858, shape: "meat_raw", cookOf: "cooked_mutton", cookXp: 30, burn: 0.3, levelReq: 1 });
def("cooked_mutton", { name: "Cooked mutton", cacheId: 9988, examine: "A cooked piece of mutton.", value: 16, kind: "food", colour: 0xa06840, shape: "meat", heal: 3 });
def("burnt_fish", { name: "Burnt fish", examine: "Oops!", value: 1, kind: "misc", colour: 0x3a3228, shape: "fish_cooked" });
def("burnt_meat", { name: "Burnt meat", examine: "Oops!", value: 1, kind: "misc", colour: 0x3a3228, shape: "meat" });
def("apple", { name: "Cooking apple", cacheId: 1955, examine: "Keeps the doctor away.", value: 6, kind: "food", colour: 0xd04030, shape: "apple", heal: 2 });
def("banana", { name: "Banana", examine: "A banana.", value: 6, kind: "food", colour: 0xf0d040, shape: "banana", heal: 2 });
/* The cache's own **Peach** (6883, added 4 January 2006), so the fruit is a
   real item of the revision rather than a name this world invented: its
   examine, its 1 coin value and its 8 Hitpoint heal are the cache's / the
   wiki's own. The key stays `peaches` (the Bones to Peaches spell and the
   shop's stock list are keyed by id) while the display name is the cache's. */
def("peaches", { name: "Peach", cacheId: 6883, examine: "A tasty fruit.", value: 1, kind: "food", colour: 0xf0a878, shape: "banana", heal: 8 });

/* ------------------------------------------------------ multi-bite food

   Cakes, pizzas and pies are eaten a bite at a time, and a partly-eaten one is
   an item in its own right: a cake leaves "2/3 cake" behind, that leaves
   "Slice of cake", and the slice is the third and last bite (4 Hitpoints each,
   12 for the cake - the wiki's "[per bite] x [total bites]" notation). `bites`
   is how many this item still has and `biteNext` is the id one bite leaves, so
   src/ui.js#doEat can eat *in place* with no per-food special case.

   The delays are the Fast foods rules (see the header comment in src/ui.js):
   standard food is a 3-tick eat delay, the first slice of a pizza or an apple
   pie is 1, and the halves are 2. */
const FOOD_BITES = [
  /* id, name, examine, value, colour, shape, per-bite heal, bites, next, delay */
  ["cake", "Cake", "A plain sponge cake.", 50, 0xe8d0a0, "cake", 4, 3, "cake_2_3"],
  ["cake_2_3", "2/3 cake", "A plain sponge cake, two thirds left.", 34, 0xe8d0a0, "cake", 4, 2, "cake_slice"],
  ["cake_slice", "Slice of cake", "A slice of plain sponge cake.", 17, 0xe8d0a0, "cake", 4, 1, null],
  ["chocolate_cake", "Chocolate cake", "A chocolate sponge cake.", 75, 0x6b4420, "cake", 5, 3, "chocolate_cake_2_3"],
  ["chocolate_cake_2_3", "2/3 chocolate cake", "A chocolate sponge cake, two thirds left.", 50, 0x6b4420, "cake", 5, 2, "chocolate_slice"],
  ["chocolate_slice", "Chocolate slice", "A slice of chocolate sponge cake.", 25, 0x6b4420, "cake", 5, 1, null],
  ["plain_pizza", "Plain pizza", "A plain cheese pizza.", 26, 0xe8c070, "cake", 7, 2, "plain_pizza_half", 1],
  ["plain_pizza_half", "Half plain pizza", "Half a plain cheese pizza.", 13, 0xe8c070, "cake", 7, 1, null, 2],
  ["meat_pizza", "Meat pizza", "A pizza with meat on it.", 28, 0xc07a50, "cake", 8, 2, "meat_pizza_half", 1],
  ["meat_pizza_half", "Half meat pizza", "Half a pizza with meat on it.", 14, 0xc07a50, "cake", 8, 1, null, 2],
  ["anchovy_pizza", "Anchovy pizza", "A pizza with anchovies on it.", 30, 0xb8a890, "cake", 9, 2, "anchovy_pizza_half", 1],
  ["anchovy_pizza_half", "Half anchovy pizza", "Half a pizza with anchovies on it.", 15, 0xb8a890, "cake", 9, 1, null, 2],
  ["apple_pie", "Apple pie", "An apple pie. Yum!", 30, 0xd8b878, "cake", 7, 2, "apple_pie_half", 1],
  ["apple_pie_half", "Half an apple pie", "Half an apple pie. Still yum!", 15, 0xd8b878, "cake", 7, 1, null, 2],
  ["redberry_pie", "Redberry pie", "A redberry pie.", 12, 0xa04848, "cake", 5, 2, "redberry_pie_half"],
  ["redberry_pie_half", "Half a redberry pie", "Half a redberry pie.", 6, 0xa04848, "cake", 5, 1, null, 2],
  ["meat_pie", "Meat pie", "A meat pie.", 16, 0xb08858, "cake", 6, 2, "meat_pie_half"],
  ["meat_pie_half", "Half a meat pie", "Half a meat pie.", 8, 0xb08858, "cake", 6, 1, null, 2],
];
const FOOD_WEIGHT = {
  cake_2_3: 0.2, cake_slice: 0.1, chocolate_cake: 0.3, chocolate_cake_2_3: 0.2, chocolate_slice: 0.1,
  plain_pizza: 0.7, plain_pizza_half: 0.35, meat_pizza: 0.7, meat_pizza_half: 0.35,
  anchovy_pizza: 0.7, anchovy_pizza_half: 0.35, apple_pie: 0.45, apple_pie_half: 0.22,
  redberry_pie: 0.45, redberry_pie_half: 0.22, meat_pie: 0.45, meat_pie_half: 0.22,
};
for (const [id, name, examine, value, colour, shape, heal, bites, next, eatDelay] of FOOD_BITES) {
  def(id, { name, examine, value, kind: "food", colour, shape, heal, bites, biteNext: next, eatDelay: eatDelay || 3, weight: FOOD_WEIGHT[id] });
}
/* The bake-on-range half of the pies, the pizzas and the cake (update 5): the
   cooked defs above point back at their raw ids with the wiki's own level and
   experience (apple pie 30/130, meat pie 20/110, redberry pie 10/78, plain
   pizza 35/143, cake 40/180), so actions.js#RAW_TO_COOKED picks them up with
   no change there. */
Object.assign(ITEMS.apple_pie, { cookOf: "uncooked_apple_pie", cookXp: 130, burn: 0.6, levelReq: 30 });
Object.assign(ITEMS.meat_pie, { cookOf: "uncooked_meat_pie", cookXp: 110, burn: 0.585, levelReq: 20 });
Object.assign(ITEMS.redberry_pie, { cookOf: "uncooked_berry_pie", cookXp: 78, burn: 0.57, levelReq: 10 });
Object.assign(ITEMS.plain_pizza, { cookOf: "uncooked_pizza", cookXp: 143, burn: 0.615, levelReq: 35 });
Object.assign(ITEMS.cake, { cookOf: "uncooked_cake", cookXp: 180, burn: 0.645, levelReq: 40 });

/* ------------------------------------------------------------- herblore

   The fourteen herbs, the vial, and the twenty-two potions the 2007 game had,
   with every number the wiki publishes: the cleaning level and experience, the
   unfinished-potion level, the mixing level and experience, the secondary, the
   per-dose value, and the potion's own effect. Nothing here is invented except
   the fallback icon tints (`colour`, used only by src/icons.js#PAINT when a
   sprite file is missing) and three values noted at their rows.

   The herb table is the wiki's own cleaning table, read straight across:

     [id, name, grimy name, cleaning level, cleaning xp, clean value, grimy value]

   The unfinished-potion level is the second level in that table - the level at
   which the *clean* herb may go into a vial of water - and both it and the
   value come from the unf-potion pages themselves (UNF_LEVEL / UNF_VALUE, keyed
   by herb). */
const HERB_TABLE = [
  ["guam_leaf", "Guam leaf", "Grimy guam leaf", 3, 2.5, 3, 13],
  ["marrentill", "Marrentill", "Grimy marrentill", 5, 3.8, 5, 14],
  ["tarromin", "Tarromin", "Grimy tarromin", 11, 5, 11, 15],
  ["harralander", "Harralander", "Grimy harralander", 20, 6.3, 20, 16],
  ["ranarr_weed", "Ranarr weed", "Grimy ranarr weed", 25, 7.5, 25, 30],
  ["toadflax", "Toadflax", "Grimy toadflax", 30, 8, 48, 19],
  ["irit_leaf", "Irit leaf", "Grimy irit leaf", 40, 8.8, 40, 17],
  ["avantoe", "Avantoe", "Grimy avantoe", 48, 10, 48, 18],
  ["kwuarm", "Kwuarm", "Grimy kwuarm", 54, 11.3, 54, 20],
  ["snapdragon", "Snapdragon", "Grimy snapdragon", 59, 11.8, 59, 21],
  ["cadantine", "Cadantine", "Grimy cadantine", 65, 12.5, 65, 22],
  ["lantadyme", "Lantadyme", "Grimy lantadyme", 67, 13.1, 68, 23],
  ["dwarf_weed", "Dwarf weed", "Grimy dwarf weed", 70, 13.8, 70, 24],
  ["torstol", "Torstol", "Grimy torstol", 75, 15, 75, 25],
];
const UNF_LEVEL = { guam_leaf: 3, marrentill: 5, tarromin: 12, harralander: 22, ranarr_weed: 30, toadflax: 34, irit_leaf: 45, avantoe: 50, kwuarm: 55, snapdragon: 63, cadantine: 66, lantadyme: 69, dwarf_weed: 72, torstol: 78 };
const UNF_VALUE = { guam_leaf: 3, marrentill: 5, tarromin: 11, harralander: 20, ranarr_weed: 25, toadflax: 48, irit_leaf: 40, avantoe: 48, kwuarm: 54, snapdragon: 59, cadantine: 65, lantadyme: 68, dwarf_weed: 70, torstol: 25 };
/* The fallback tint of each herb. The clean herb is the greener of the two and
   the grimy one is the same plant dirtied, so one colour and a darkening for the
   grimy variant is enough for the painter. */
const HERB_COLOUR = {
  guam_leaf: 0x7a9a4a, marrentill: 0x8aa05a, tarromin: 0x6a8a3a, harralander: 0x9a8a4a,
  ranarr_weed: 0x5a7a3a, toadflax: 0xb0a060, irit_leaf: 0x6a9a5a, avantoe: 0x8a9a8a,
  kwuarm: 0x9a5a4a, snapdragon: 0xa08a4a, cadantine: 0x7a8a9a, lantadyme: 0x9a9a6a,
  dwarf_weed: 0x6a6a3a, torstol: 0xa04a4a,
};
export const HERBS = {};
for (const [id, name, grimyName, cleanLevel, cleanXp, cleanValue, grimyValue] of HERB_TABLE) {
  const unfId = id.replace(/_(leaf|weed)$/, "") + "_potion_unf";
  HERBS[id] = { id, unfId, cleanLevel, cleanXp, unfLevel: UNF_LEVEL[id] };
  def(grimyName.toLowerCase().replace(/\s+/g, "_"), {
    name: grimyName, examine: "It needs cleaning.", value: grimyValue, kind: "grimy_herb",
    colour: HERB_COLOUR[id], shape: "herb", cacheName: grimyName, cleanTo: id,
    cleanLevel, cleanXp, weight: 0.007,
  });
  def(id, {
    name, examine: "A fresh herb.", value: cleanValue, kind: "herb",
    colour: HERB_COLOUR[id], shape: "herb", cacheName: name, unf: unfId, unfLevel: UNF_LEVEL[id],
  });
  def(unfId, {
    name: name + " potion (unf)", examine: "I need another ingredient to finish this " + name + " potion.",
    value: UNF_VALUE[id], kind: "unf_potion", colour: HERB_COLOUR[id], shape: "vial",
    potionHerb: id, weight: 0.056,
  });
}

/* Vials. An empty vial comes from the shop; a vial of water from filling one at
   the town well (or from Humidify), and it is the base of every potion. */
def("vial", { name: "Vial", examine: "An empty glass vial.", value: 2, kind: "misc", colour: 0xc8d8e0, shape: "vial", weight: 0.015, cacheId: 229 });
def("vial_of_water", { name: "Vial of water", examine: "A glass vial containing water.", value: 2, kind: "misc", colour: 0x6a9ac0, shape: "vial", weight: 0.020, fillFrom: "vial" });

/* The secondaries, with the wiki's own value, weight and examine. Three of them
   are ground rather than found - a unicorn horn, a blue dragon scale and a
   chocolate bar all go through a pestle and mortar (src/actions.js#grindItem) -
   and the rest are sold by the town herbalist (src/actions.js#SHOPS). */
def("eye_of_newt", { name: "Eye of newt", examine: "It seems to be looking at me.", value: 3, kind: "secondary", colour: 0xc0d0a0, shape: "herb", weight: 0.007 });
def("unicorn_horn", { name: "Unicorn horn", examine: "This horn has restorative properties.", value: 20, kind: "secondary", colour: 0xe8e0c8, shape: "herb", weight: 0.007, crushTo: "unicorn_horn_dust" });
def("unicorn_horn_dust", { name: "Unicorn horn dust", examine: "Finely ground horn of Unicorn.", value: 20, kind: "secondary", colour: 0xe0d8c0, shape: "herb", weight: 0.007 });
def("limpwurt_root", { name: "Limpwurt root", examine: "The root of a limpwurt plant.", value: 7, kind: "secondary", colour: 0xc0a060, shape: "herb", weight: 0.007 });
def("red_spiders_eggs", { name: "Red spiders' eggs", examine: "Ewww!", value: 7, kind: "secondary", colour: 0xc04040, shape: "herb", weight: 0.007 });
def("chocolate_bar", { name: "Chocolate bar", examine: "Mmmmmmm chocolate.", value: 10, kind: "secondary", colour: 0x6b4420, shape: "meat", weight: 0.150, crushTo: "chocolate_dust" });
def("chocolate_dust", { name: "Chocolate dust", examine: "It's ground up chocolate.", value: 2, kind: "secondary", colour: 0x7a5030, shape: "herb", weight: 0.150 });
def("white_berries", { name: "White berries", examine: "Sour berries, used in potions.", value: 10, kind: "secondary", colour: 0xe8e8e0, shape: "herb", weight: 0.007 });
def("toads_legs", { name: "Toad's legs", examine: "They're a gnome delicacy apparently.", value: 2, kind: "secondary", colour: 0x9aa060, shape: "herb", weight: 0.150 });
def("goat_horn_dust", { name: "Goat horn dust", examine: "Finely ground goat horn.", value: 12, kind: "secondary", colour: 0xd8d0b8, shape: "herb", weight: 0.453 });
def("snape_grass", { name: "Snape grass", examine: "Strange spiky grass.", value: 10, kind: "secondary", colour: 0x8a9a5a, shape: "herb", weight: 0.007 });
def("mort_myre_fungus", { name: "Mort myre fungus", examine: "A mushroom from the swamps of Mort Myre.", value: 1, kind: "secondary", colour: 0x8a7a5a, shape: "herb", weight: 0.010 });
/* The cache's own name for this one is **Blue dragon scale** (rev 241 item 243,
   verified straight out of config index 2 archive 10 - the modern wiki redirects
   "Dragon scale" to it), and it is what a pestle and mortar turns into dragon
   scale dust. Its real 2007 source is the spawns in Taverley Dungeon, which this
   map has no region for, so the town herbalist keeps it like the other
   secondaries. */
def("blue_dragon_scale", { name: "Blue dragon scale", examine: "A large shiny scale.", value: 50, kind: "secondary", colour: 0x4e6f9e, shape: "herb", weight: 0.007, crushTo: "dragon_scale_dust", cacheName: "Blue dragon scale" });
def("dragon_scale_dust", { name: "Dragon scale dust", examine: "Finely ground scale of Dragon.", value: 52, kind: "secondary", colour: 0xa85858, shape: "herb", weight: 0.007, cacheName: "Dragon scale dust" });
def("wine_of_zamorak", { name: "Wine of Zamorak", examine: "An evil wine for an evil god.", value: 1, kind: "secondary", colour: 0x7a2a4a, shape: "jug", weight: 0.085 });
def("potato_cactus", { name: "Potato cactus", examine: "How am I supposed to eat that?!", value: 1, kind: "secondary", colour: 0x6a9a5a, shape: "herb", weight: 0.500 });
def("jangerberries", { name: "Jangerberries", examine: "They don't look very ripe.", value: 1, kind: "secondary", colour: 0xa03a3a, shape: "herb", weight: 0.007 });
def("crushed_nest", { name: "Crushed nest", examine: "A crushed bird's nest.", value: 200, kind: "secondary", colour: 0xa08868, shape: "herb", weight: 0.002 });
/* The three Farming produce the two stronger weapon poisons are built from. In
   the live game each one is grown - a cactus spine in a cactus patch, a cave
   nightshade in a nightshade patch, poison ivy berries on a vine - and this
   world has no Farming, so the town herbalist keeps them beside the other
   secondaries. That is the same stand-in the blue dragon scale already takes,
   and it is the only invented thing about them: the values, weights and examine
   texts are the items' own. */
def("cactus_spine", { name: "Cactus spine", examine: "Don't prick yourself with this.", value: 1, kind: "secondary", colour: 0x7a9a5a, shape: "herb", weight: 0.028, cacheId: 6016 });
def("cave_nightshade", { name: "Cave nightshade", examine: "Deadly.", value: 30, kind: "secondary", colour: 0x3a5a3a, shape: "herb", weight: 0.015, cacheId: 2398 });
def("poison_ivy_berries", { name: "Poison ivy berries", examine: "They look sweet and juicy, but only a fool would eat them.", value: 65, kind: "secondary", colour: 0x8a4a6a, shape: "herb", weight: 0.007, cacheId: 6018 });
/* The vial of coconut milk the two higher weapon poisons are mixed in, and the
   two unfinished potions that come out of it. In the 2007 client *every*
   unfinished potion was plain "Unfinished potion" - the item was not renamed to
   name its own herb until 2014 - so the three of them in the cache carry the
   same name, which is why these rows carry ids rather than cache names. The
   names they do use are the modern ones, the same choice the fourteen herb
   unfinished potions already make ("Kwuarm potion (unf)"), and their examine
   lines are the cache era's own. */
def("coconut_milk", { name: "Coconut milk", examine: "A vial filled with coconut milk.", value: 1, kind: "unf_base", colour: 0xe8e8d8, shape: "vial", weight: 0.035, cacheId: 5935 });
def("weapon_poison_plus_unf", { name: "Weapon poison+ (unf)", examine: "A vial of coconut milk and Cactus spine.", value: 1, kind: "unf_potion", colour: 0x7a8a4a, shape: "vial", potionHerb: "cactus_spine", weight: 0.035, cacheId: 5936 });
def("weapon_poison_plus_plus_unf", { name: "Weapon poison++ (unf)", examine: "A vial of coconut milk and Deadly Nightshade.", value: 14, kind: "unf_potion", colour: 0x4a6a3a, shape: "vial", potionHerb: "cave_nightshade", weight: 0.035, cacheId: 5939 });
/* The one way a coated weapon comes clean again: "Poison can be removed from
   weapons by making use of a cleaning cloth". Its own sources are Karamja rum,
   silk, a shopkeeper on Karamja and a Tai Bwo Wannai quest, none of which this
   map has a region for, so the general store keeps it. */
def("cleaning_cloth", { name: "Cleaning cloth", examine: "A spirit soaked piece of silk which can be used to remove poison.", value: 60, kind: "misc", colour: 0xd8d0c0, shape: "wool", weight: 1, cacheId: 3188 });
def("pestle_and_mortar", { name: "Pestle and mortar", examine: "I can grind things for potions in this.", value: 4, kind: "tool", colour: 0x9a9a92, shape: "hammer", weight: 0.056 });

/* The potion table. `level`/`xp` are the mixing level and experience, `herb`
   the clean herb that goes into the vial of water, `secondary` the ingredient
   added to the unfinished potion, and `value` the *per-dose* value the wiki
   gives (dosepot values are not linear, so they are spelled out per row rather
   than computed). The effect fields are the published ones:

     boosts   - a temporary boost, as [fraction of the base level, flat bonus]
     drains   - the same, subtracted (the two brews' price)
     heal     - hitpoints restored, as [fraction, flat]
     prayer   - prayer points restored, as [fraction, flat]
     restore  - every drained combat stat, as [fraction, flat]
     energy   - run energy restored, as a fraction of the 10,000-unit pool
     cure     - seconds of poison immunity (and the poison itself is cured)
     antifire - seconds of dragonfire protection
     weaponPoison - which poison family this vial coats a weapon with, as the
                tier index into src/items.js#WEAPON_POISON (the whole
                poisoned-weapon family is generated just below the bows, from
                #POISON_FAMILIES). A weapon poison is not drunk: the client
                gives the vial "Empty, Drop" and nothing else, and this build
                follows it (src/ui.js#openItemMenu).

   Two rows are not water-based: weapon poison(+) and (++) mix a cactus spine
   and a cave nightshade into a **vial of coconut milk** and then add their
   second ingredient, which is why they carry `base` (what the first ingredient
   goes into), `first` (the ingredient that opens the vial) and `unf` (the
   intermediate item) instead of the usual `herb`. */
export const POTIONS = [
  { id: "attack_potion", name: "Attack potion", level: 3, xp: 25, herb: "guam_leaf", secondary: "eye_of_newt", value: 12, colour: 0xd06a4a, boosts: { attack: [0.10, 3] } },
  { id: "antipoison", name: "Antipoison", level: 5, xp: 37.5, herb: "marrentill", secondary: "unicorn_horn_dust", value: 288, colour: 0x6ab04a, cure: 90 },
  { id: "strength_potion", name: "Strength potion", level: 12, xp: 50, herb: "tarromin", secondary: "limpwurt_root", value: 13, colour: 0xc06a3a, boosts: { strength: [0.10, 3] } },
  { id: "restore_potion", name: "Restore potion", level: 22, xp: 62.5, herb: "harralander", secondary: "red_spiders_eggs", value: 88, colour: 0xd0a0b0, restore: [0.30, 10] },
  { id: "energy_potion", name: "Energy potion", level: 26, xp: 67.5, herb: "harralander", secondary: "chocolate_dust", value: 110, colour: 0x8a6a3a, energy: 0.15 },
  { id: "defence_potion", name: "Defence potion", level: 30, xp: 75, herb: "ranarr_weed", secondary: "white_berries", value: 120, colour: 0x9ab0d0, boosts: { defence: [0.10, 3] } },
  { id: "agility_potion", name: "Agility potion", level: 34, xp: 80, herb: "toadflax", secondary: "toads_legs", value: 150, colour: 0xb0a0d0, boosts: { agility: [0, 3] } },
  { id: "combat_potion", name: "Combat potion", level: 36, xp: 84, herb: "harralander", secondary: "goat_horn_dust", value: 160, colour: 0xd0a060, boosts: { attack: [0.10, 3], strength: [0.10, 3] } },
  { id: "prayer_potion", name: "Prayer potion", level: 38, xp: 87.5, herb: "ranarr_weed", secondary: "snape_grass", value: 152, colour: 0xd0e0a0, prayer: [0.25, 7] },
  { id: "super_attack", name: "Super attack", level: 45, xp: 100, herb: "irit_leaf", secondary: "eye_of_newt", value: 180, colour: 0xd05a3a, boosts: { attack: [0.15, 5] } },
  { id: "superantipoison", name: "Superantipoison", level: 48, xp: 106.3, herb: "irit_leaf", secondary: "unicorn_horn_dust", value: 288, colour: 0x7ac06a, cure: 360 },
  { id: "fishing_potion", name: "Fishing potion", level: 50, xp: 112.5, herb: "avantoe", secondary: "snape_grass", value: 200, colour: 0x7ab0c0, boosts: { fishing: [0, 3] } },
  { id: "super_energy", name: "Super energy", level: 52, xp: 117.5, herb: "avantoe", secondary: "mort_myre_fungus", value: 230, colour: 0x9a8a4a, energy: 0.20 },
  { id: "super_strength", name: "Super strength", level: 55, xp: 125, herb: "kwuarm", secondary: "limpwurt_root", value: 220, colour: 0xc05a2a, boosts: { strength: [0.15, 5] } },
  { id: "weapon_poison", name: "Weapon poison", level: 60, xp: 137.5, herb: "kwuarm", secondary: "dragon_scale_dust", value: 144, colour: 0x5a7a3a, weaponPoison: 1, doses: 1, examine: "For use on daggers and projectiles.", weight: 0.025 },
  { id: "weapon_poison_plus", name: "Weapon poison(+)", level: 73, xp: 190, base: "coconut_milk", first: "cactus_spine", secondary: "red_spiders_eggs", unf: "weapon_poison_plus_unf", value: 288, colour: 0x4a6a2a, weaponPoison: 2, doses: 1, examine: "A vial of extra strong weapon poison, for spears and daggers.", weight: 0.035 },
  { id: "weapon_poison_plus_plus", name: "Weapon poison(++)", level: 82, xp: 190, base: "coconut_milk", first: "cave_nightshade", secondary: "poison_ivy_berries", unf: "weapon_poison_plus_plus_unf", value: 432, colour: 0x3a5a1a, weaponPoison: 3, doses: 1, examine: "A vial of super strong weapon poison, for spears and daggers.", weight: 0.035 },
  { id: "super_restore", name: "Super restore", level: 63, xp: 142.5, herb: "snapdragon", secondary: "red_spiders_eggs", value: 240, colour: 0xe0c0d0, restore: [0.25, 8], prayer: [0.25, 8] },
  { id: "super_defence", name: "Super defence", level: 66, xp: 150, herb: "cadantine", secondary: "white_berries", value: 264, colour: 0xa0c0e0, boosts: { defence: [0.15, 5] } },
  { id: "antifire_potion", name: "Antifire potion", level: 69, xp: 157.5, herb: "lantadyme", secondary: "dragon_scale_dust", value: 264, colour: 0xd0a03a, antifire: 360 },
  { id: "ranging_potion", name: "Ranging potion", level: 72, xp: 162.5, herb: "dwarf_weed", secondary: "wine_of_zamorak", value: 288, colour: 0x8a6ab0, boosts: { ranged: [0.10, 4] } },
  { id: "magic_potion", name: "Magic potion", level: 76, xp: 172.5, herb: "lantadyme", secondary: "potato_cactus", value: 250, colour: 0x6ab0d0, boosts: { magic: [0, 4] } },
  { id: "zamorak_brew", name: "Zamorak brew", level: 78, xp: 175, herb: "torstol", secondary: "jangerberries", value: 175, colour: 0x8a3a3a, boosts: { attack: [0.20, 2], strength: [0.12, 2] }, drains: { defence: [0.10, 2], hitpoints: [0.12, 0] }, prayer: [0.10, 0] },
  { id: "saradomin_brew", name: "Saradomin brew", level: 81, xp: 180, herb: "toadflax", secondary: "crushed_nest", value: 175, colour: 0xd0d0a0, boosts: { defence: [0.20, 2] }, heal: [0.15, 2], drains: { attack: [0.10, 2], strength: [0.10, 2], magic: [0.10, 2], ranged: [0.10, 2] } },
];
export const POTION_BY_ITEM = {};
for (const p of POTIONS) {
  /* "A newly finished vial of potion contains three (3) doses of the potion"
     (Herblore), so mixing makes the (3) and a drink steps it down: (3) -> (2)
     -> (1) -> the empty vial. The (4) dose is deliberately not generated - it
     is the decanted/GE form, and nothing in this world decants.

     The one exception is **weapon poison**, which the client sells as a single
     vial - "a single vial of weapon poison can poison only 5 arrows" - so it
     carries `doses: 1` and is defined whole, with no (1)/(2)/(3) family. */
  if (p.doses === 1) {
    POTION_BY_ITEM[p.id] = p;
    def(p.id, {
      name: p.name,
      examine: p.examine || "A vial of " + p.name.toLowerCase() + ".",
      value: p.value,
      kind: "potion", colour: p.colour, shape: "vial",
      potion: p.id, dose: 1, doseNext: "vial",
      weaponPoison: p.weaponPoison || 0,
      weight: p.weight != null ? p.weight : 0.020,
    });
    continue;
  }
  for (let dose = 3; dose >= 1; dose--) {
    const id = p.id + "_" + dose;
    POTION_BY_ITEM[id] = p;
    def(id, {
      name: p.name + "(" + dose + ")",
      examine: dose + (dose === 1 ? " dose" : " doses") + " of " + p.name.toLowerCase() + ".",
      value: p.value,
      kind: "potion", colour: p.colour, shape: "vial",
      potion: p.id, dose,
      doseNext: dose > 1 ? p.id + "_" + (dose - 1) : "vial",
      weight: 0.015 + 0.005 * dose,
    });
  }
}

def("bones", { name: "Bones", examine: "Bones are for burying!", value: 1, stack: true, kind: "bones", colour: 0xe8e0d0, shape: "bones", buryXp: 4.5 });
def("big_bones", { name: "Big bones", examine: "Big bones are for burying!", value: 2, stack: true, kind: "bones", colour: 0xdcd2bc, shape: "bigbone", buryXp: 15 });
/* Dragon bones (src/PLAN.md unit P) - the real 2007 burying step below a prayer
   potion: 72 XP against Big bones' 15. Cache item 536 (its own model 2768, so
   it gets a ground model like any other bone), 160 gp, 1.5 kg, and its own
   examine. Burying needs nothing new here: the bury action keys off
   `kind === "bones"` and reads `buryXp`, so this item is a row of data. */
def("dragon_bones", { name: "Dragon bones", examine: "These would feed a dog for months!", value: 160, stack: true, kind: "bones", colour: 0xa85848, shape: "bigbone", cacheId: 536, buryXp: 72 });
def("cowhide", { name: "Cowhide", examine: "It's a cowhide.", value: 12, kind: "hide", colour: 0x8a6a4a, shape: "hide" });
/* The tanner's raw snakeskins (src/items.js#TAN_FEES): snakes drop the hide,
   the tanner makes it snakeskin - the live game's own split. The swamp hide
   has no model in this revision (cache item 6481 is empty), so it is one of
   the procedural hide icons in a darker olive. */
def("snake_hide", { name: "Snake hide", examine: "The scaly hide of a snake.", value: 25, kind: "hide", colour: 0x6a7a4a, shape: "hide", cacheId: 6287 });
def("snake_hide_swamp", { name: "Swamp snake hide", examine: "The scaly hide of a swamp snake.", value: 30, kind: "hide", colour: 0x4a5a38, shape: "hide" });
def("feather", { name: "Feather", examine: "Used for fly fishing.", value: 2, stack: true, kind: "misc", colour: 0xf0f0e8, shape: "feather" });
/* Fishing bait (src/actions.js#FISH_BAIT_ITEM). This revision's pack carries no
   bait icon, so it is one of the procedural ones (src/icons.js#PAINT), like the
   feather above - and, like the feather, it is a stack of one-per-catch
   consumable: a rod on a Net/Bait spot spends a bait for every sardine,
   herring or pike it lands. */
def("fishing_bait", { name: "Fishing bait", cacheId: 313, examine: "For use with a fishing rod.", value: 1, stack: true, kind: "misc", colour: 0xd8c8a0, shape: "bait" });
/* The cache holds more than one item called Coins, and the two that matter are
   *not* interchangeable: 995 is the stackable one whose own model is the single
   coin, while 617 is a separate non-stackable coin whose model is a pile. A
   name lookup lands on 617 (see src/tools/cache-bake/held.mjs#itemNameIndex),
   which is why this row pins `cacheId` - the bake follows the id, and every
   ground model below hangs off 995's own count->item pairs (2, 3, 4, 5, 25,
   100, 250, 1000, 10000: src/models/items.json has one baked model per tier). */
def("coins", { name: "Coins", examine: "Lovely money!", value: 1, stack: true, kind: "coins", colour: 0xf0c040, shape: "coins", cacheId: 995 });
def("ashes", { name: "Ashes", examine: "A pile of ashes.", value: 2, stack: true, kind: "misc", colour: 0xb8b8b0, shape: "ashes" });
def("tinderbox", { name: "Tinderbox", examine: "Useful for lighting fires.", value: 1, kind: "tool", colour: 0x8a6a42, shape: "tinderbox" });
def("small_fishing_net", { name: "Small fishing net", examine: "Useful for catching small fish.", value: 5, kind: "tool", colour: 0xc8b890, shape: "net", toolSkill: "fishing", tool: "net" });
def("fishing_rod", { name: "Fishing rod", examine: "Useful for catching fish.", value: 5, kind: "tool", colour: 0x9a7a4a, shape: "rod", toolSkill: "fishing", tool: "rod_bait" });
def("fly_fishing_rod", { name: "Fly fishing rod", examine: "Useful for catching fish.", value: 5, kind: "tool", colour: 0xa88a5a, shape: "rod", toolSkill: "fishing", tool: "fly" });
def("harpoon", { name: "Harpoon", examine: "Useful for catching big fish.", value: 5, kind: "tool", colour: 0xa8a8b0, shape: "harpoon", toolSkill: "fishing", tool: "harpoon" });
def("lobster_pot", { name: "Lobster pot", examine: "Useful for catching lobsters.", value: 5, kind: "tool", colour: 0xc0b090, shape: "net", toolSkill: "fishing", tool: "cage" });
def("big_fishing_net", { name: "Big fishing net", examine: "Useful for catching bigger fish.", value: 20, kind: "tool", colour: 0xb8a880, shape: "net", toolSkill: "fishing", tool: "bignet" });
def("oily_fishing_rod", { name: "Oily fishing rod", examine: "Useful for catching fish in boiling water.", value: 50, kind: "tool", colour: 0x8a6a3a, shape: "rod", toolSkill: "fishing", tool: "oily" });
def("chisel", { name: "Chisel", examine: "Good for detailed Crafting.", value: 1, kind: "tool", colour: 0xb0b0b8, shape: "chisel" });
def("hammer", { name: "Hammer", examine: "Good for hitting things!", value: 1, kind: "tool", colour: 0x8a8a92, shape: "hammer" });
def("knife", { name: "Knife", examine: "A dangerous-looking knife.", value: 6, kind: "tool", colour: 0xc0c0c8, shape: "knife" });
def("bucket", { name: "Bucket", examine: "It's a bucket.", value: 2, kind: "tool", colour: 0x9a9a96, shape: "bucket" });
def("pot", { name: "Pot", examine: "This pot is empty.", value: 1, kind: "tool", colour: 0xa8643c, shape: "pot" });
def("jug", { name: "Jug", examine: "This jug is empty.", value: 1, kind: "tool", colour: 0xb87450, shape: "jug" });
/* Baking supplies (Cooking, the dough-and-pastry half). The kitchen's cook
   sells the lot (see actions.js#SHOPS.cook); the use-item-on-item dough steps
   (water on flour opens the dough choice, pastry on a pie dish shells it, the
   shell takes its filling, the base takes tomato then cheese, the cake tin
   takes egg, milk and flour) and the bake-on-range recipes all live in
   actions.js#useOnInv and the RAW_TO_COOKED table. Every one carries its cache
   item id, so the
   ground-model bake and the name lookup land on the right def - and the real
   examine, value and weight, out of the osrsbox dump (pot of flour 1933, egg
   1944, bucket of milk 1927, pie dish 2313, cake tin 1887, bowl 1923). */
def("pot_of_flour", { name: "Pot of flour", examine: "There is flour in this pot.", value: 10, stack: true, kind: "misc", colour: 0xe8e2d0, shape: "pot", cacheId: 1933 });
def("eggs", { name: "Eggs", examine: "A nice fresh egg.", value: 4, stack: true, kind: "misc", colour: 0xe8d8b8, shape: "apple", cacheId: 1944 });
def("bucket_of_milk", { name: "Bucket of milk", examine: "It's a bucket of milk.", value: 6, stack: true, kind: "misc", colour: 0xf2f0e8, shape: "bucket", cacheId: 1927 });
def("pie_dish", { name: "Pie dish", examine: "Deceptively pie shaped.", value: 3, kind: "misc", colour: 0xb87450, shape: "mould", cacheId: 2313 });
def("cake_tin", { name: "Cake tin", examine: "Useful for baking cakes.", value: 10, kind: "misc", colour: 0x9a9aa0, shape: "mould", cacheId: 1887 });
def("bowl", { name: "Bowl", examine: "Useful for mixing things.", value: 4, kind: "misc", colour: 0x7a6a58, shape: "pot", cacheId: 1923 });
/* The cook's full shelf (berries, veg, dough, pie shells, spice and the chef's
   hat itself - see actions.js#SHOPS.cook). Every one carries its cache item id
   with the real examine, value and weight out of the osrsbox dump (redberries
   1951, grapes 1987, bread dough 2307, pie shell 2315, potato 1942, onion
   1957, tomato 1982, cabbage 1965, garlic 1550, raw bear meat 2136, chef's hat
   1949, spice 2007). Raw bear meat cooks into plain cooked meat (there is no
   cooked bear meat item); the veg heal 1 raw. */
def("redberries", { name: "Redberries", examine: "Very bright red berries.", value: 3, kind: "misc", colour: 0xc03040, shape: "herb", cacheId: 1951 });
def("grapes", { name: "Grapes", examine: "Good grapes for wine making.", value: 1, kind: "misc", colour: 0x7a3a8a, shape: "apple", cacheId: 1987 });
def("bread_dough", { name: "Bread dough", examine: "Some uncooked dough.", value: 4, kind: "misc", colour: 0xe0d0a8, shape: "meat", cacheId: 2307 });
def("pie_shell", { name: "Pie shell", examine: "I need to find a filling for this pie.", value: 4, kind: "misc", colour: 0xe0c898, shape: "mould", cacheId: 2315 });
/* The rest of the dough-and-pastry chain (the water-on-flour choice, update 3):
   every one carries its cache item id with the real examine, value and weight
   out of the osrsbox dump (pastry dough 1953, pizza base 2283, incomplete
   pizza 2285, uncooked pizza 2287, uncooked apple/meat/berry pie 2317/2319/2321,
   uncooked cake 1889, burnt bread 2311, burnt pie 2329, burnt cake 1903, burnt
   pizza 2305). The burn rates are fitted to the burn formula in
   actions.js#attemptCook so each food stops burning at the level the wiki
   publishes (bread 38, redberry pie 45, meat pie 54, apple pie 63, pizza 68,
   cake 74). */
def("pastry_dough", { name: "Pastry dough", examine: "Potentially pastry.", value: 1, kind: "misc", colour: 0xd8d0a8, shape: "meat", cacheId: 1953 });
def("pizza_base", { name: "Pizza base", examine: "I need to add some tomato next.", value: 4, kind: "misc", colour: 0xe0c898, shape: "mould", cacheId: 2283 });
def("pitta_dough", { name: "Pitta dough", examine: "I need to cook this.", value: 4, kind: "misc", colour: 0xe0d0a8, shape: "meat", cacheId: 1863, cookOf: "pitta_bread" });
def("pitta_bread", { name: "Pitta bread", examine: "Nicely baked pitta bread. Needs more ingredients to make a kebab.", value: 10, kind: "misc", colour: 0xe0c890, shape: "mould", cacheId: 1865, cookXp: 40, levelReq: 58, burn: 0.14 });
def("incomplete_pizza", { name: "Incomplete pizza", examine: "I need to add some cheese next.", value: 10, kind: "misc", colour: 0xe0b878, shape: "mould", cacheId: 2285 });
def("uncooked_pizza", { name: "Uncooked pizza", examine: "This needs cooking.", value: 25, kind: "misc", colour: 0xe0a878, shape: "mould", cacheId: 2287 });
def("uncooked_apple_pie", { name: "Uncooked apple pie", examine: "This would be much tastier cooked.", value: 16, kind: "misc", colour: 0xd8b878, shape: "mould", cacheId: 2317 });
def("uncooked_meat_pie", { name: "Uncooked meat pie", examine: "This would be much healthier cooked.", value: 8, kind: "misc", colour: 0xb08858, shape: "mould", cacheId: 2319 });
def("uncooked_berry_pie", { name: "Uncooked berry pie", examine: "This would be much more appetising cooked.", value: 6, kind: "misc", colour: 0xa04848, shape: "mould", cacheId: 2321 });
def("uncooked_cake", { name: "Uncooked cake", examine: "Now all I need to do is cook it.", value: 20, kind: "misc", colour: 0xe8d0a0, shape: "cake", cacheId: 1889 });
def("burnt_bread", { name: "Burnt bread", examine: "Nice crispy bread. Possibly too crispy.", value: 1, kind: "misc", colour: 0x3a3228, shape: "bread", cacheId: 2311 });
def("burnt_pie", { name: "Burnt pie", examine: "I think I left it on the stove too long.", value: 1, kind: "misc", colour: 0x3a3228, shape: "mould", cacheId: 2329 });
def("burnt_cake", { name: "Burnt cake", examine: "Argh what a mess!", value: 1, kind: "misc", colour: 0x3a3228, shape: "cake", cacheId: 1903 });
def("burnt_pizza", { name: "Burnt pizza", examine: "Oh dear!", value: 1, kind: "misc", colour: 0x3a3228, shape: "mould", cacheId: 2305 });
def("potato", { name: "Potato", examine: "This could be used to make a good stew.", value: 1, kind: "food", colour: 0xc8a878, shape: "apple", heal: 1, cacheId: 1942 });
def("onion", { name: "Onion", examine: "A strong smelling onion.", value: 3, kind: "food", colour: 0xe8e0c0, shape: "apple", heal: 1, cacheId: 1957 });
def("tomato", { name: "Tomato", examine: "This would make good ketchup.", value: 4, kind: "food", colour: 0xd04030, shape: "apple", heal: 1, cacheId: 1982 });
def("cabbage", { name: "Cabbage", examine: "Yuck I don't like cabbage.", value: 1, kind: "food", colour: 0x4a8a3a, shape: "apple", heal: 1, cacheId: 1965 });
def("garlic", { name: "Garlic", examine: "A clove of garlic.", value: 3, kind: "misc", colour: 0xe8e4d0, shape: "herb", cacheId: 1550 });
def("raw_bear_meat", { name: "Raw bear meat", examine: "I need to cook this first.", value: 1, kind: "food", colour: 0xc06050, shape: "meat_raw", cookOf: "cooked_meat", cookXp: 30, burn: 0.3, levelReq: 1, cacheId: 2136 });
def("spice", { name: "Spice", examine: "This could liven up an otherwise bland stew.", value: 230, kind: "misc", colour: 0xa87830, shape: "herb", cacheId: 2007 });
/* Karambwan (the jungle octopus). Raw karambwan needs 65 Fishing and a vessel
   loaded with raw karambwanji - the ji themselves come on a small net (level
   5) at the same spot, so the chain is self-contained - and cooks at 30 for
   190 xp into an 18-heal food. The cooked def is written out rather than going
   through the FISH loop above because its cooking level (30) is not its
   fishing level minus one (65). Cache ids 3142/3144/3150/3157, real examines,
   values and weights throughout. */
def("karambwan_vessel", { name: "Karambwan vessel", examine: "A wide bodied and thin necked vessel, encrusted with sea salt.", value: 5, kind: "tool", colour: 0xb09070, shape: "pot", toolSkill: "fishing", tool: "vessel", cacheId: 3157 });
def("raw_karambwanji", { name: "Raw karambwanji", examine: "Small brightly coloured tropical fish.", value: 19, stack: true, kind: "fish", colour: 0x50a0c0, shape: "fish", levelReq: 5, xp: 5, tool: "net", spots: ["karambwan_spot"], cacheId: 3150 });
def("raw_karambwan", { name: "Raw karambwan", examine: "A raw green octopus.", value: 400, kind: "fish", colour: 0x3a8a4a, shape: "fish", levelReq: 65, xp: 105, tool: "vessel", spots: ["karambwan_spot"], cacheId: 3142 });
def("karambwan", { name: "Karambwan", examine: "Some nicely cooked karambwan.", value: 500, kind: "food", colour: 0x4a9a5a, shape: "fish_cooked", heal: 18, cookOf: "raw_karambwan", cookXp: 190, burn: 0.3, levelReq: 30, cacheId: 3144 });
def("burnt_karambwan", { name: "Burnt karambwan", examine: "Burnt octopus.", value: 1, kind: "misc", colour: 0x3a3228, shape: "fish_cooked", cacheId: 3148 });
def("spade", { name: "Spade", examine: "A spade.", value: 3, kind: "tool", colour: 0x8a8a92, shape: "spade" });
def("rope", { name: "Rope", examine: "A coil of rope.", value: 18, kind: "misc", colour: 0xc0a870, shape: "rope" });
def("needle", { name: "Needle", examine: "Used with thread to make things.", value: 1, kind: "tool", colour: 0xc8c8d0, shape: "needle" });
def("thread", { name: "Thread", examine: "Used with a needle to make things.", value: 1, stack: true, kind: "misc", colour: 0xe8e8e0, shape: "thread" });
def("wool", { name: "Wool", examine: "I can use this to make cloth.", value: 4, kind: "misc", colour: 0xe8e0d0, shape: "wool" });
/* The fleece chain (unit C3). Shears are the tool the sheep's own option list
   names - cache item 1735, "For shearing sheep.", 1 gp,
   sold by every general store - and a ball of wool is what a spinning wheel
   makes of a fleece (cache item 1759, "Spun from wool.", 2 gp, 2.5 Crafting
   experience; see actions.js#spinAt). Both carry their cache id so the
   ground-model bake picks them up. */
def("shears", { name: "Shears", examine: "For shearing sheep.", value: 1, kind: "tool", colour: 0xb0b0b8, shape: "shears", cacheId: 1735 });
def("ball_of_wool", { name: "Ball of wool", examine: "Spun from wool.", value: 2, kind: "misc", colour: 0xe8e0d0, shape: "wool", cacheId: 1759 });
def("flax", { name: "Flax", examine: "I can use this to make bow strings.", value: 5, kind: "misc", colour: 0x88a8c0, shape: "flax" });
def("bow_string", { name: "Bow string", examine: "I can use this to make a bow.", value: 40, kind: "misc", colour: 0xe0dcc8, shape: "thread" });
def("arrow_shaft", { name: "Arrow shaft", examine: "A wooden arrow shaft.", value: 1, stack: true, kind: "misc", colour: 0xb09060, shape: "shaft" });
def("headless_arrow", { name: "Headless arrow", examine: "A wooden arrow shaft.", value: 1, stack: true, kind: "misc", colour: 0xc0a878, shape: "headless" });

/* ------------------------------------------------------- hides, leather, cloth

   The materials the needle-and-thread recipes eat (see items.js#CRAFT_RECIPES).
   Every one carries the cache item's own `cacheId`, because all of them are
   ordinary items with a ground model in the bake, and its own real weight and
   examine text. Sources: `leather` and `hard_leather` and the four prepared
   dragon leathers come from the tanner (src/world.js's tanner,
   actions.js#tanHides);
   each of the four dragonhide colours is its dragon's own guaranteed drop
   (items.js#NPC_DROPS - green, blue, red and black dragon), and `snakeskin`
   is the snake's (unit P); `plank` is what Plank Make now makes, and
   `bucket_of_water` is what a bucket becomes at the town well (or under
   Humidify). */
def("leather", { name: "Leather", examine: "It's a piece of leather.", value: 1, kind: "misc", colour: 0xa87850, shape: "leather", cacheId: 1741 });
def("hard_leather", { name: "Hard leather", examine: "It's a piece of hard leather.", value: 1, kind: "misc", colour: 0x8a6a48, shape: "leather", cacheId: 1743 });
def("green_dragonhide", { name: "Green dragonhide", examine: "The scaly rough hide from a Green Dragon.", value: 135, kind: "hide", colour: 0x4a7a3a, shape: "hide", cacheId: 1753 });
def("blue_dragonhide", { name: "Blue dragonhide", examine: "The scaly rough hide from a Blue Dragon.", value: 140, kind: "hide", colour: 0x3a5a9a, shape: "hide", cacheId: 1751 });
def("red_dragonhide", { name: "Red dragonhide", examine: "The scaly rough hide from a Red Dragon.", value: 145, kind: "hide", colour: 0x9a3a30, shape: "hide", cacheId: 1749 });
def("black_dragonhide", { name: "Black dragonhide", examine: "The scaly rough hide from a Black Dragon.", value: 150, kind: "hide", colour: 0x3a3a40, shape: "hide", cacheId: 1747 });
def("green_dragon_leather", { name: "Green dragon leather", examine: "It's a piece of prepared green dragonhide.", value: 50, kind: "misc", colour: 0x4a7a3a, shape: "leather", cacheId: 1745 });
def("blue_dragon_leather", { name: "Blue dragon leather", examine: "It's a piece of prepared blue dragonhide.", value: 70, kind: "misc", colour: 0x3a5a9a, shape: "leather", cacheId: 2505 });
def("red_dragon_leather", { name: "Red dragon leather", examine: "It's a piece of prepared red dragonhide.", value: 90, kind: "misc", colour: 0x9a3a30, shape: "leather", cacheId: 2507 });
def("black_dragon_leather", { name: "Black dragon leather", examine: "It's a piece of prepared black dragonhide.", value: 110, kind: "misc", colour: 0x3a3a40, shape: "leather", cacheId: 2509 });
def("snakeskin", { name: "Snakeskin", examine: "Nicely tanned skin from a snake.", value: 50, kind: "misc", colour: 0x7a8a5a, shape: "leather", cacheId: 6289 });
def("plank", { name: "Plank", examine: "A plank of wood!", value: 1, kind: "misc", colour: 0xb08a52, shape: "log", cacheId: 960 });
def("bucket_of_water", { name: "Bucket of water", examine: "It's a bucket of water.", value: 6, kind: "misc", colour: 0x4a78a8, shape: "bucket", cacheId: 1929, fillFrom: "bucket" });
def("jug_of_water", { name: "Jug of water", examine: "It's full of water.", value: 1, kind: "misc", colour: 0x4a78a8, shape: "jug", cacheId: 1937, fillFrom: "jug" });
def("bowl_of_water", { name: "Bowl of water", examine: "It's a bowl of water.", value: 4, kind: "misc", colour: 0x4a78a8, shape: "pot", cacheId: 1921, fillFrom: "bowl" });

/* `missile` is the spotanim an arrow of this metal flies as. The cache gives
   every tier but the last its own travel graphic (bake.mjs#MISSILE_GFX, from the
   preserved `pack/spotanim.pack`: `10=bronze_arrow_travel`, `9=iron_arrow_travel`,
   `11=steel_arrow_travel`, `12=mithril_arrow_travel`, `13=adamant_arrow_travel`,
   `15=rune_arrow_travel`), and each one is the same 27-vertex arrow model with
   its own recolour - so a rune arrow really is the blue one on the way over.
   src/combat.js#shoot flies whichever the quiver gave up.

   The dragon arrow is the seventh tier and the odd one, and every number on it
   is the item's own: **+60 Ranged strength**, 800 coins, weight 0, "An arrow
   made using a dragon's talon." (its own examine). It is the one tier whose
   missile is not a `*_travel` graphic, because this revision has none for it -
   the arrow came in with the dark bow and its graphics are all `*_LAUNCH`
   (bake.mjs#MISSILE_GFX explains the pair of meshes it shares with the six metal
   tiers). It is also the one tier the cache abbreviates nothing about: its own
   item id is 11212 and its count tiers are 11213-11216, which is how the ground
   model bake finds it (src/tools/cache-bake/items-bake-run.mjs reads `cacheId`). */
const ARROW_TIERS = [
  { id: "bronze", name: "Bronze", col: 0x9c6b3f, bonus: 7, missile: 10 },
  { id: "iron", name: "Iron", col: 0x9e9e9e, bonus: 10, missile: 9 },
  { id: "steel", name: "Steel", col: 0xc2c2c2, bonus: 16, missile: 11 },
  { id: "mithril", name: "Mithril", col: 0x5f7fa8, bonus: 22, missile: 12 },
  { id: "adamant", name: "Adamant", col: 0x4f8f6f, bonus: 31, missile: 13 },
  { id: "rune", name: "Rune", col: 0x5fb0d0, bonus: 49, missile: 15 },
  { id: "dragon", name: "Dragon", col: 0x6a3a2a, bonus: 60, missile: 1116, cacheId: 11212, value: 800, examine: "An arrow made using a dragon's talon." },
];
ARROW_TIERS.forEach((a) => {
  def(a.id + "_arrow", { name: a.name + " arrow", examine: a.examine || "An arrow.", value: a.value || 2, slot: "ammo", stack: true, kind: "ammo", ammoKind: "arrow", colour: a.col, shape: "arrow", ammo: a.bonus, missile: a.missile, cacheId: a.cacheId, tier: 0 });
});

/* The Barrows crypts' own ammunition: **bolt racks**, which only Karil's
   crossbow can fire (the examine text says as much - "Must need a special type
   of crossbow to use this"). `ammoKind` is the whole rule, and it is why a bow
   will not fire them and the crossbow will not fire arrows: src/combat.js#
   rangedAmmo matches the quiver's kind against the weapon's. Their ranged
   strength is the item page's own +55, which sits between rune (+49) and the
   crossbow-only bolt tiers of a later era.

   In the live game they are a Barrows chest reward, bought from Ak-Haranu on
   the Port Phasmatys docks, or from the Last Man Standing shop. This world has
   no Barrows minigame and no Port Phasmatys, so the archery shop keeps them at
   the item's own value - the same stand-in the armour shop uses for the
   brothers' armour (see the shops in src/actions.js#SHOPS). */
def("bolt_rack", { name: "Bolt rack", examine: "Must need a special type of crossbow to use this.", value: 50, slot: "ammo", stack: true, kind: "ammo", ammoKind: "bolt", colour: 0x6a6a78, shape: "arrow", ammo: 55, missile: 27, tier: 0 });

const BOWS = [
  { id: "shortbow", name: "Shortbow", level: 1, col: 0xa08050, speed: 4, bonus: 8 },
  { id: "oak_shortbow", name: "Oak shortbow", level: 5, col: 0x9a8a5a, speed: 4, bonus: 14 },
  { id: "willow_shortbow", name: "Willow shortbow", level: 20, col: 0x8a7a52, speed: 4, bonus: 20 },
  { id: "maple_shortbow", name: "Maple shortbow", level: 30, col: 0x9a8a62, speed: 4, bonus: 29 },
  { id: "yew_shortbow", name: "Yew shortbow", level: 40, col: 0x7a6a42, speed: 4, bonus: 47 },
  { id: "magic_shortbow", name: "Magic shortbow", level: 50, col: 0x6a5a3a, speed: 4, bonus: 69, spec: "Snapshot", specCost: 55 },
  { id: "longbow", name: "Longbow", level: 1, col: 0xa08050, speed: 6, bonus: 10 },
  { id: "oak_longbow", name: "Oak longbow", level: 5, col: 0x9a8a5a, speed: 6, bonus: 17 },
  { id: "willow_longbow", name: "Willow longbow", level: 20, col: 0x8a7a52, speed: 6, bonus: 25 },
  { id: "maple_longbow", name: "Maple longbow", level: 30, col: 0x9a8a62, speed: 6, bonus: 36 },
  { id: "yew_longbow", name: "Yew longbow", level: 40, col: 0x7a6a42, speed: 6, bonus: 55 },
  { id: "magic_longbow", name: "Magic longbow", level: 50, col: 0x6a5a3a, speed: 6, bonus: 80, spec: "Powershot", specCost: 35 },
];
BOWS.forEach((b) => {
  const bn = B();
  bn.arange = b.bonus;
  def(b.id, Object.assign({
    name: b.name, examine: "A " + b.name.toLowerCase() + ".", value: b.bonus * 12, slot: "weapon", two: true, style: "ranged", speed: b.speed, req: { ranged: b.level }, bonus: bn, kind: "bow", ammoKind: "arrow", colour: b.col, shape: b.speed >= 6 ? "longbow" : "bow", cat: b.speed >= 6 ? "longbow" : "shortbow",
    /* The tile the shot reaches from, which is the item page's own number and
       not a family constant: a shortbow 7, a longbow 10 (the Longbow page's own
       attack range). `longrange` adds the other 2 (src/combat.js#attackRange). */
    range: b.speed >= 6 ? 10 : 7,
  }, b.spec ? { spec: b.spec, specCost: b.specCost } : {}));
});
/* The unstrung bows: what the knife makes before the string goes on. They are
   real rev-241 items (cache ids 48-72, baked into src/models/items.json like
   every other ground model), but they are NOT weapons - no slot, so nothing
   can wield one - they are the material the string turns into the bow above.
   `value` is half the strung bow's own, marked so because no page prints an
   unstrung price on its own. */
const UNSTRUNG_BOWS = [
  ["shortbow_u", "Shortbow (u)", 50, "shortbow", "An unstrung shortbow."],
  ["oak_shortbow_u", "Oak shortbow (u)", 54, "shortbow", "An unstrung oak shortbow."],
  ["willow_shortbow_u", "Willow shortbow (u)", 60, "shortbow", "An unstrung willow shortbow."],
  ["maple_shortbow_u", "Maple shortbow (u)", 64, "shortbow", "An unstrung maple shortbow."],
  ["yew_shortbow_u", "Yew shortbow (u)", 68, "shortbow", "An unstrung yew shortbow."],
  ["magic_shortbow_u", "Magic shortbow (u)", 72, "shortbow", "An unstrung magic shortbow."],
  ["longbow_u", "Longbow (u)", 48, "longbow", "An unstrung longbow."],
  ["oak_longbow_u", "Oak longbow (u)", 56, "longbow", "An unstrung oak longbow."],
  ["willow_longbow_u", "Willow longbow (u)", 58, "longbow", "An unstrung willow longbow."],
  ["maple_longbow_u", "Maple longbow (u)", 62, "longbow", "An unstrung maple longbow."],
  ["yew_longbow_u", "Yew longbow (u)", 66, "longbow", "An unstrung yew longbow."],
  ["magic_longbow_u", "Magic longbow (u)", 70, "longbow", "An unstrung magic longbow."],
];
for (const [id, name, cacheId, strung, examine] of UNSTRUNG_BOWS) {
  def(id, {
    name, examine, cacheId, kind: "misc", colour: (ITEMS[strung] || {}).colour || 0xa08050,
    shape: strung === "longbow" ? "longbow" : "bow",
    value: Math.max(1, Math.round(((ITEMS[strung] || {}).value || 96) / 2)),
  });
  ITEMS[id].strungOf = strung;
}

/* Bow-making: what the knife offers on each log, at the published level and
   experience. Shafts are 15 for 5 XP off any log; the bows are one log each.
   Read by src/actions.js#fletchLogs and the Fletching guide. */
export const BOW_FLETCH = {
  logs: { short: { id: "shortbow_u", level: 5, xp: 5 }, long: { id: "longbow_u", level: 10, xp: 10 } },
  oak_logs: { short: { id: "oak_shortbow_u", level: 10, xp: 16.5 }, long: { id: "oak_longbow_u", level: 15, xp: 25 } },
  willow_logs: { short: { id: "willow_shortbow_u", level: 20, xp: 33.3 }, long: { id: "willow_longbow_u", level: 25, xp: 41.7 } },
  maple_logs: { short: { id: "maple_shortbow_u", level: 30, xp: 50 }, long: { id: "maple_longbow_u", level: 35, xp: 58.3 } },
  yew_logs: { short: { id: "yew_shortbow_u", level: 40, xp: 83.5 }, long: { id: "yew_longbow_u", level: 45, xp: 75 } },
  magic_logs: { short: { id: "magic_shortbow_u", level: 50, xp: 100 }, long: { id: "magic_longbow_u", level: 60, xp: 125 } },
};

/* Stringing: a bow string onto an unstrung bow, at the published level and
   experience. Keyed by the unstrung item, like BOLT_FEATHER. Read by
   src/actions.js#stringBow and the Fletching guide. */
export const BOW_STRING = {
  shortbow_u: { id: "shortbow", level: 5, xp: 5 },
  oak_shortbow_u: { id: "oak_shortbow", level: 10, xp: 8.2 },
  willow_shortbow_u: { id: "willow_shortbow", level: 20, xp: 16.7 },
  maple_shortbow_u: { id: "maple_shortbow", level: 30, xp: 25 },
  yew_shortbow_u: { id: "yew_shortbow", level: 40, xp: 41.8 },
  magic_shortbow_u: { id: "magic_shortbow", level: 50, xp: 50 },
  longbow_u: { id: "longbow", level: 10, xp: 10 },
  oak_longbow_u: { id: "oak_longbow", level: 15, xp: 12.5 },
  willow_longbow_u: { id: "willow_longbow", level: 25, xp: 20.8 },
  maple_longbow_u: { id: "maple_longbow", level: 35, xp: 29.2 },
  yew_longbow_u: { id: "yew_longbow", level: 45, xp: 37.5 },
  magic_longbow_u: { id: "magic_longbow", level: 60, xp: 62.5 },
};
{
  const bn = B();
  bn.arange = 80;
  def("third_age_bow", {
    name: "3rd age bow", examine: "A beautifully crafted bow carved by ancient archers.",
    value: 150000, slot: "weapon", two: true, style: "ranged", speed: 4,
    req: { ranged: 65 }, bonus: bn, kind: "bow", ammoKind: "arrow",
    colour: 0xd8d8e8, shape: "bow", cat: "shortbow", range: 10, cacheId: 12424,
  });
}

/* ------------------------------------------------------- crossbows and bolts

   The second ranged family. A crossbow is a *bolter*: it fires the `bolt`
   ammunition kind and nothing else, exactly as a bow fires `arrow`s and
   nothing else, and that one word - `ammoKind` - is the whole rule
   (src/combat.js#rangedAmmo). Karil's crossbow, in the weapons table above, has
   been the world's only crossbow since the Barrows were built; this is the rest
   of them.

   Every number is the item page's own, and every row carries its rev 241 cache
   **item id** rather than a name, because this cache abbreviates the metal
   crossbows the way it abbreviates the warhammers ("Bronze c'bow", "Mith
   c'bow"). Both bakes read `cacheId` before a name
   (held-bake-run.mjs#wantedFromItems, items-bake-run.mjs#wantedAllItems), and
   an id cannot be got wrong the way an abbreviated name can.

     * speed  - the item page's own tick count. Nearly every crossbow is six;
                the Dorgeshuun crossbow is five (its entire reason to exist -
                the wiki: "an attack speed that is one tick faster than most
                other crossbows") and the hunters' crossbow is four, which is a
                shortbow's speed.
     * arange - the weapon's ranged attack bonus, and the *only* thing that
                separates one metal from the next: a crossbow adds no ranged
                strength at all, so the whole of a crossbow's damage is the bolt
                it loads (src/combat.js#maxHit takes the ammo's `ammo` number and
                adds nothing from the weapon, which is why a bronze crossbow
                with runite bolts hits like a rune crossbow).
     * level  - the published Ranged gate: plain and Phoenix 1, bronze 1,
                blurite 16, iron 26, Dorgeshuun 28, steel 31, mithril 36,
                adamant 46, hunters' 50, rune 61.
     * weight - the item's own kg (the wiki's number, kept inline for the reason
                src/items.js#itemWeight gives: a generated row that already
                knows its number should not need a second file kept in step).

   Row shape: [id, name, cache id, Ranged level, speed, ranged accuracy, value,
   weight, colour, examine, range]. `colour` is only the procedural icon fallback
   - every row has a real sprite - and never a stat. `range` is the tile the bolt
   flies from, the item page's own number (a plain crossbow 7, the Phoenix 5, the
   Dorgeshuun 6, the hunters' 8). */
const CROSSBOWS = [
  ["crossbow", "Crossbow", 837, 1, 6, 6, 70, 8, 0xa08050, "This fires crossbow bolts.", 7],
  ["phoenix_crossbow", "Phoenix crossbow", 767, 1, 6, 6, 4, 3.628, 0xb06030, "Former property of the Phoenix Gang.", 5],
  ["bronze_crossbow", "Bronze crossbow", 9174, 1, 6, 18, 73, 4, 0x9c6b3f, "A bronze crossbow.", 7],
  ["blurite_crossbow", "Blurite crossbow", 9176, 16, 6, 30, 93, 4, 0x8f86c0, "A blurite crossbow.", 7],
  ["iron_crossbow", "Iron crossbow", 9177, 26, 6, 42, 157, 4, 0x9e9e9e, "An iron crossbow.", 7],
  ["dorgeshuun_crossbow", "Dorgeshuun crossbow", 8880, 28, 5, 42, 2000, 2.267, 0xd8d0a0, "This fires crossbow bolts.", 6],
  ["steel_crossbow", "Steel crossbow", 9179, 31, 6, 54, 360, 5, 0xc2c2c2, "A steel crossbow.", 7],
  ["mithril_crossbow", "Mithril crossbow", 9181, 36, 6, 66, 783, 5, 0x5f7fa8, "A mithril crossbow.", 7],
  ["adamant_crossbow", "Adamant crossbow", 9183, 46, 6, 78, 1767, 6, 0x4f8f6f, "An adamantite crossbow.", 7],
  ["hunters_crossbow", "Hunters' crossbow", 10156, 50, 4, 55, 1300, 5, 0xc8b070, "A weapon made of bone and wood.", 8],
  ["rune_crossbow", "Rune crossbow", 9185, 61, 6, 90, 16200, 6, 0x5fb0d0, "A runite crossbow.", 7],
];
CROSSBOWS.forEach(([id, name, cacheId, level, speed, arange, value, weight, colour, examine, range]) => {
  const bn = B();
  bn.arange = arange;
  def(id, { name, examine, value, weight, cacheId, slot: "weapon", style: "ranged", speed, range, req: { ranged: level }, bonus: bn, kind: "crossbow", ammoKind: "bolt", colour, shape: "crossbow", cat: "crossbow" });
});
{
  /* This world's own prestige crossbow: there is no 3rd age crossbow in any
     cache or revision, so its numbers are this world's own - the tier above
     the rune crossbow (+100 ranged attack, 65 Ranged to wield, the crossbow
     family's own 6-tick speed and 7-tile reach), priced with the 3rd age bow.
     A crossbow adds no ranged strength (see the note above), so bolts do the
     damage exactly as they do for every other crossbow. Its meshes are a
     transplant of the rune crossbow's recoloured into the 3rd age family
     (src/tools/hand-models/third-age-crossbow.mjs), and its `shape` is a key
     of its own so neither bake hunts the cache for it - the same arrangement
     the Armadyl halberd uses. */
  const bn = B();
  bn.arange = 100;
  def("third_age_crossbow", {
    name: "3rd age crossbow", examine: "A beautifully crafted crossbow built by ancient archers.",
    value: 150000, weight: 3, slot: "weapon", style: "ranged", speed: 6, range: 7,
    req: { ranged: 65 }, bonus: bn, kind: "crossbow", ammoKind: "bolt",
    colour: 0xd8d8e8, shape: "third_age_crossbow", cat: "crossbow",
  });
}

/* The bolts. Two tables because they are made two ways - the plain metals
   (Smithing and feathers) and the gem-tipped ones (a gem bolt tip on a metal
   bolt) - and both are flat, because a bolt's ranged strength is its own `ammo`
   number and nothing else on the row is a stat.

   Every bolt flies as the cache's single crossbow-bolt projectile
   (`missile: 27` = `crossbowbolt_travel`, `bake.mjs#MISSILE_GFX`): rev 241 has
   one bolt travel graphic, so a runite bolt and a bronze one differ in the hit,
   not in the flight. `value` is the item's own, with the two that cost nothing
   (bronze, and the barbed bolts that are made from them) at the shop's price.

   Named "Dragon bolts" rather than the modern "Dragonstone bolts": id 9341 is
   *named* "Dragon bolts" in this cache, and its own examine - "Dragonstone
   tipped runite crossbow bolts." - is what tells you it is the gem-tipped one.
   The modern name belongs to a monster-drop bolt that postdates 2007. */
const METAL_BOLTS = [
  ["bronze_bolts", "Bronze bolts", 877, 10, 3, 0x9c6b3f, "Bronze crossbow bolts."],
  ["blurite_bolts", "Blurite bolts", 9139, 28, 2, 0x8f86c0, "Blurite crossbow bolts."],
  ["silver_bolts", "Silver bolts", 9145, 36, 5, 0xd8d8e0, "Silver crossbow bolts."],
  ["iron_bolts", "Iron bolts", 9140, 46, 2, 0x9e9e9e, "Iron crossbow bolts."],
  ["steel_bolts", "Steel bolts", 9141, 64, 8, 0xc2c2c2, "Steel crossbow bolts."],
  ["mithril_bolts", "Mithril bolts", 9142, 82, 20, 0x5f7fa8, "Mithril crossbow bolts."],
  ["adamant_bolts", "Adamant bolts", 9143, 100, 58, 0x4f8f6f, "Adamantite crossbow bolts."],
  ["runite_bolts", "Runite bolts", 9144, 115, 300, 0x5fb0d0, "Runite crossbow bolts."],
  ["barbed_bolts", "Barbed bolts", 881, 12, 200, 0x7a6a52, "Great if you have a crossbow!"],
  ["bone_bolts", "Bone bolts", 8882, 49, 3, 0xd8d0a0, "Good if you have a bone crossbow!"],
  ["kebbit_bolts", "Kebbit bolts", 10158, 28, 18, 0xb0a070, "Bolts made from the spikes of a prickly kebbit."],
  ["long_kebbit_bolts", "Long kebbit bolts", 10159, 38, 31, 0xb0a070, "Bolts made from the spikes of a razor-backed kebbit."],
];
const GEM_BOLTS = [
  ["opal_bolts", "Opal bolts", 879, 14, 7, 0xd8e0f0, "Opal tipped bronze crossbow bolts."],
  ["jade_bolts", "Jade bolts", 9335, 30, 12, 0x50b080, "Jade tipped blurite crossbow bolts."],
  ["pearl_bolts", "Pearl bolts", 880, 48, 13, 0xe8e8e0, "Pearl tipped iron crossbow bolts."],
  ["topaz_bolts", "Topaz bolts", 9336, 66, 22, 0xd89030, "Topaz tipped steel crossbow bolts."],
  ["sapphire_bolts", "Sapphire bolts", 9337, 83, 37, 0x4060d0, "Sapphire tipped mithril crossbow bolts."],
  ["emerald_bolts", "Emerald bolts", 9338, 85, 53, 0x30a050, "Emerald tipped mithril crossbow bolts."],
  ["ruby_bolts", "Ruby bolts", 9339, 103, 125, 0xc03040, "Ruby tipped adamantite crossbow bolts."],
  ["diamond_bolts", "Diamond bolts", 9340, 105, 192, 0xd8e8f0, "Diamond tipped adamantite crossbow bolts."],
  ["dragon_bolts", "Dragon bolts", 9341, 117, 967, 0x9070c0, "Dragonstone tipped runite crossbow bolts."],
  ["onyx_bolts", "Onyx bolts", 9342, 120, 13633, 0x30304a, "Onyx tipped runite crossbow bolts."],
];
for (const [id, name, cacheId, ammo, value, colour, examine] of METAL_BOLTS.concat(GEM_BOLTS)) {
  def(id, { name, examine, value, cacheId, slot: "ammo", stack: true, kind: "ammo", ammoKind: "bolt", colour, shape: "arrow", ammo, missile: 27 });
}

/* The two weapons that refuse the ammunition everything else takes, and the one
   that accepts a shorter list than the rest. These are the live game's own
   published rules, and they are the only place `ammoKind` is not the whole
   story: src/combat.js#rangedAmmo reads both tables before it will load a
   stack.

     * **bolt racks** - "ammunition exclusively used by the Karil's crossbow"
       (the item's own page, and its own examine: "Must need a special type of
       crossbow to use this"). Both directions, because that crossbow fires
       nothing else either.
     * **bone bolts** - "can only be used with the Dorgeshuun crossbow".
     * **kebbit and long kebbit bolts** - the hunters' crossbow "can only use
       kebbit bolts and long kebbit bolts as ammunition", and they are all it
       fires.
     * the **Dorgeshuun crossbow**'s own list is the one rule that is *not*
       mutual: "It can fire metal bolts up to iron, except silver bolts", so
       bronze, blurite and iron, "and is the only crossbow that can use bone
       bolts. Note, however, that bolts containing unique tips and their (e)
       variants are not able to be fired from" it - which is why the gem-tipped
       bolts are absent from its list.

   Without these, a rune crossbow loaded 500 bone bolts, which is exactly what
   the bolt rack's own examine text has been complaining about. */
export const AMMO_WEAPON_ONLY = {
  bolt_rack: ["karils_crossbow"],
  bone_bolts: ["dorgeshuun_crossbow"],
  kebbit_bolts: ["hunters_crossbow"],
  long_kebbit_bolts: ["hunters_crossbow"],
};
export const WEAPON_AMMO_ONLY = {
  karils_crossbow: ["bolt_rack"],
  dorgeshuun_crossbow: ["bronze_bolts", "blurite_bolts", "iron_bolts", "bone_bolts"],
  hunters_crossbow: ["kebbit_bolts", "long_kebbit_bolts"],
};

/* The composite bows: the treasure-trail bows, which sit between the shortbow
   and the longbow ladder rather than on it - a fifth tick, so one step slower
   than a shortbow and one faster than the longbow, with the longbow's ten-tile
   range and slightly better accuracy than the shortbow of the same metal. They
   are the only bows in this world that are not made from a log, and the only
   ones with a bow shape of their own (`shape: "comp_bow"`), because the cache
   gives each one a distinct recurved wield model rather than the self-bow every
   other bow in the ladder uses.

   Levels and accuracy are the item pages' own: willow 20/+22, yew 40/+49,
   magic 50/+71. */
const COMPOSITE_BOWS = [
  ["willow_comp_bow", "Willow comp bow", 10280, 20, 22, 300, 0x8a7a52, "A powerful bow made from willow wood."],
  ["yew_comp_bow", "Yew comp bow", 10282, 40, 49, 1800, 0x7a6a42, "A powerful bow made from yew wood."],
  ["magic_comp_bow", "Magic comp bow", 10284, 50, 71, 2500, 0x6a5a3a, "A powerful bow made from magic wood."],
];
COMPOSITE_BOWS.forEach(([id, name, cacheId, level, arange, value, colour, examine]) => {
  const bn = B();
  bn.arange = arange;
  /* Every composite bow reaches the longbow's own ten tiles (the item pages'
     attack range), and the **magic comp bow is the one that carries Powershot**:
     the live game's own Special-attacks table heads that entry "Magic longbow *
     Magic comp bow", so the fifth-tick treasure bow pastes the longbow's special
     onto itself. The willow and yew comp bows have none, which is what the table
     says by not naming them. */
  def(id, Object.assign({
    name, examine, value, cacheId, slot: "weapon", two: true, style: "ranged", speed: 5, range: 10, req: { ranged: level }, bonus: bn, kind: "bow", ammoKind: "arrow", colour, shape: "comp_bow", cat: "comp_bow",
  }, id === "magic_comp_bow" ? { spec: "Powershot", specCost: 35 } : {}));
});

/* ==================================================== the bolts' supply chain

   A crossbow bolt is not one item but five, and this block is the four other
   stages of it, in the order a player meets them:

     bar  --(Smithing, 10 at a time)-->  unfinished bolts
          --(Fletching, + a feather)-->  metal bolts
          --(Fletching, + a gem bolt tip)-->  gem-tipped bolts
          --(Magic, Enchant Crossbow Bolt)-->  enchanted bolts (e)

   Every number is the item's own page (the smithing and fletching tables of
   `Bolts`/`Unfinished bolts`/`Bolt tips`, and each (e) bolt's own Recipe), and
   the tips are chiselled out of the *cut gems* this world already has. Four of
   the ten gems the era's bolts were tipped with - opal, jade, pearl and red
   topaz - are not gems in this revision at all (there is no opal in the cache to
   cut, and no gem rock in this world either), so those four tips are bought from
   the archery shop at the item's own value, the same stand-in the shop makes for
   the Barrows ammunition. The other six are made, and the *tips* are made from
   the cut gems - so the sapphire in the ground is a sapphire bolt tip after a
   chisel and a sapphire bolt after ten bronze bolts.

   The silver row is the one the era files elsewhere: silver bolts are a
   Crafting recipe (a bolt mould at a furnace, 21 Crafting, 50 XP), and this
   world has no bolt mould and no mould interface, so they are smithed at the
   anvil like every other metal - marked `skill: "crafting"` so the level and the
   experience are the published ones rather than borrowed from Smithing.

   **Blurite is the one family with no bar to smith.** There is no blurite in
   this world - no blurite rock, no blurite bar (the crossbow and the bolts are
   shop items, which is what the `Blurite crossbow` row's own note says) - so the
   blurite row is deliberately absent from the Smithing table below. Its
   unfinished bolt (id 9376) is still a real item of this revision and is still
   in the tables, so it feathers into a blurite bolt if it ever finds a source
   (src/items.js#BOLT_FEATHER, level 24 - the item's own printed level, checked
   against its page); until then the jade chain starts from the shop's blurite
   bolts rather than from a bar, exactly as the archery shop's bolt stand does. */

/* [id, name, cacheId, gem (a cut gem id, or null for the four the world cannot
   cut), level, xp, per (tips a gem yields), value, colour, examine] */
const BOLT_TIPS = [
  ["opal_bolt_tips", "Opal bolt tips", 45, null, 11, 1.5, 12, 7, 0xd8e0f0, "Opal bolt tips."],
  ["jade_bolt_tips", "Jade bolt tips", 9187, null, 26, 2, 12, 10, 0x50b080, "Jade bolt tips."],
  ["pearl_bolt_tips", "Pearl bolt tips", 46, null, 41, 3.2, 6, 12, 0xe8e8e0, "Pearl bolt tips."],
  ["topaz_bolt_tips", "Topaz bolt tips", 9188, null, 48, 3.9, 12, 13, 0xd89030, "Red Topaz bolt tips."],
  ["sapphire_bolt_tips", "Sapphire bolt tips", 9189, "sapphire", 56, 4, 12, 17, 0x4060d0, "Sapphire bolt tips."],
  ["emerald_bolt_tips", "Emerald bolt tips", 9190, "emerald", 58, 5.5, 12, 33, 0x30a050, "Emerald bolt tips."],
  ["ruby_bolt_tips", "Ruby bolt tips", 9191, "ruby", 63, 6.3, 12, 67, 0xc03040, "Ruby bolt tips."],
  ["diamond_bolt_tips", "Diamond bolt tips", 9192, "diamond", 65, 7, 12, 133, 0xd8e8f0, "Diamond bolt tips."],
  ["dragon_bolt_tips", "Dragonstone bolt tips", 9193, "dragonstone", 71, 8.2, 12, 667, 0x9070c0, "Dragonstone bolt tips."],
  ["onyx_bolt_tips", "Onyx bolt tips", 9194, "onyx", 73, 9.4, 24, 1000, 0x30304a, "Onyx bolt tips."],
];

/* The chisel half: which tip a cut gem becomes, and what the cut pays. Read by
   src/actions.js#itemOptions (the gem's own "Make bolt tips" row) and by the
   Fletching guide. */
export const BOLT_TIP_FROM_GEM = {};
for (const [id, name, cacheId, gem, level, xp, per, value, colour, examine] of BOLT_TIPS) {
  def(id, { name, examine, value, kind: "bolt_tip", colour, stack: true, cacheId });
  ITEMS[id].tipLevel = level;
  ITEMS[id].tipXp = xp;
  ITEMS[id].tipPer = per;
  if (gem) BOLT_TIP_FROM_GEM[gem] = { id, level, xp, per };
}

/* [id, name, cacheId, metal, value, colour, examine] - `metal` is the finished
   bolt family the feathering step makes, which is also the id stem the (e) rows
   below use. */
const UNFINISHED_BOLTS = [
  ["bronze_bolts_unf", "Bronze bolts (unf)", 9375, "bronze", 1, 0xb08040, "Unfeathered bronze crossbow bolts."],
  ["blurite_bolts_unf", "Blurite bolts (unf)", 9376, "blurite", 1, 0x8f86c0, "Unfeathered blurite crossbow bolts."],
  ["iron_bolts_unf", "Iron bolts (unf)", 9377, "iron", 1, 0xb8b8b8, "Unfeathered iron crossbow bolts."],
  ["silver_bolts_unf", "Silver bolts (unf)", 9382, "silver", 1, 0xd8e0e8, "Unfeathered silver crossbow bolts."],
  ["steel_bolts_unf", "Steel bolts (unf)", 9378, "steel", 1, 0xc8c8c8, "Unfeathered steel crossbow bolts."],
  ["mithril_bolts_unf", "Mithril bolts (unf)", 9379, "mithril", 1, 0x6f8fb8, "Unfeathered mithril crossbow bolts."],
  ["adamant_bolts_unf", "Adamant bolts(unf)", 9380, "adamant", 1, 0x5f9f7f, "Unfeathered adamantite crossbow bolts."],
  ["runite_bolts_unf", "Runite bolts (unf)", 9381, "rune", 1, 0x6fc0e0, "Unfeathered runite crossbow bolts."],
];
for (const [id, name, cacheId, metal, value, colour, examine] of UNFINISHED_BOLTS) {
  def(id, { name, examine, value, kind: "bolt_unf", colour, stack: true, cacheId, boltMetal: metal });
}

/* The Smithing table: one bar makes ten unfinished bolts, at the published
   level and experience-per-bar (the whole 10 come out of the one action, which
   is why these rows carry a `qty` and the weapon rows above do not). */
export const BOLT_SMITH = {
  bronze_bar: { id: "bronze_bolts_unf", qty: 10, level: 3, xp: 12.5, smithing: true },
  iron_bar: { id: "iron_bolts_unf", qty: 10, level: 18, xp: 25, smithing: true },
  steel_bar: { id: "steel_bolts_unf", qty: 10, level: 33, xp: 37.5, smithing: true },
  mithril_bar: { id: "mithril_bolts_unf", qty: 10, level: 53, xp: 50, smithing: true },
  adamant_bar: { id: "adamant_bolts_unf", qty: 10, level: 73, xp: 62.5, smithing: true },
  rune_bar: { id: "runite_bolts_unf", qty: 10, level: 88, xp: 75, smithing: true },
  /* No silver row: silver bolts are a Crafting recipe at a furnace with a
     bolt mould (21 Crafting, 50 xp - src/items.js#JEWELLERY), never an anvil
     recipe, so they left this table for the jeweller's bench. */
};

/* Feathering: ten unfinished bolts and ten feathers make ten bolts, at the
   published level and per-bolt experience. Keyed by the unfinished item. */
export const BOLT_FEATHER = {
  bronze_bolts_unf: { id: "bronze_bolts", level: 9, xp: 0.5 },
  blurite_bolts_unf: { id: "blurite_bolts", level: 24, xp: 1 },
  iron_bolts_unf: { id: "iron_bolts", level: 39, xp: 1.5 },
  silver_bolts_unf: { id: "silver_bolts", level: 43, xp: 2.5 },
  steel_bolts_unf: { id: "steel_bolts", level: 46, xp: 3.5 },
  mithril_bolts_unf: { id: "mithril_bolts", level: 54, xp: 5 },
  adamant_bolts_unf: { id: "adamant_bolts", level: 61, xp: 7 },
  runite_bolts_unf: { id: "runite_bolts", level: 69, xp: 10 },
};

/* Attaching a tip: ten metal bolts and ten tips make ten gem bolts. Keyed by
   the tip item; `bolt` is the metal it goes on - the live game's own pairing
   (opal on bronze, jade on blurite, pearl on iron, topaz on steel, sapphire and
   emerald on mithril, ruby and diamond on adamant, dragonstone and onyx on
   runite), which is also why the `Bolts` page's gem table is not a cross
   product. */
export const BOLT_TIP_ATTACH = {
  opal_bolt_tips: { bolt: "bronze_bolts", id: "opal_bolts", level: 11, xp: 16 },
  jade_bolt_tips: { bolt: "blurite_bolts", id: "jade_bolts", level: 26, xp: 24 },
  pearl_bolt_tips: { bolt: "iron_bolts", id: "pearl_bolts", level: 41, xp: 32 },
  topaz_bolt_tips: { bolt: "steel_bolts", id: "topaz_bolts", level: 48, xp: 39 },
  sapphire_bolt_tips: { bolt: "mithril_bolts", id: "sapphire_bolts", level: 56, xp: 47 },
  emerald_bolt_tips: { bolt: "mithril_bolts", id: "emerald_bolts", level: 58, xp: 55 },
  ruby_bolt_tips: { bolt: "adamant_bolts", id: "ruby_bolts", level: 63, xp: 63 },
  diamond_bolt_tips: { bolt: "adamant_bolts", id: "diamond_bolts", level: 65, xp: 70 },
  dragon_bolt_tips: { bolt: "runite_bolts", id: "dragon_bolts", level: 71, xp: 82 },
  onyx_bolt_tips: { bolt: "runite_bolts", id: "onyx_bolts", level: 73, xp: 94 },
};

/* The enchanted bolts themselves. Every one is its gem bolt plus 1 cosmic rune
   and the gem's own extra runes, at the gem's own Magic level, and carries the
   same ranged strength as the bolt it was made from (the `(e)` is an effect, not
   a stat). The four `cacheName`s the 2007 cache writes differently are given by
   id below, because the id is what the wield/ground bakes and the icon crop
   read and an id cannot be got wrong: "Dragon bolts (e)" is 9244 in this
   revision, and its modern name would be "Dragonstone bolts (e)" - the same
   split the plain dragon bolts already carry (id 9341). */
const ENCHANTED_BOLTS = [
  // [gem, id, name, cacheId, level, xp, runes, examine]
  ["opal", "opal_bolts_e", "Opal bolts (e)", 9236, 4, 9, { air: 2 }, "Enchanted Opal tipped Bronze Crossbow Bolts."],
  ["jade", "jade_bolts_e", "Jade bolts (e)", 9237, 14, 19, { earth: 2 }, "Enchanted Jade tipped Blurite Crossbow Bolts."],
  ["pearl", "pearl_bolts_e", "Pearl bolts (e)", 9238, 24, 29.5, { water: 2 }, "Enchanted Pearl tipped Iron Crossbow Bolts."],
  ["topaz", "topaz_bolts_e", "Topaz bolts (e)", 9239, 29, 33, { fire: 2 }, "Enchanted Red Topaz tipped Steel Crossbow Bolts."],
  ["sapphire", "sapphire_bolts_e", "Sapphire bolts (e)", 9240, 7, 17.5, { water: 1, mind: 1 }, "Enchanted Sapphire tipped Mithril Crossbow Bolts."],
  ["emerald", "emerald_bolts_e", "Emerald bolts (e)", 9241, 27, 37, { air: 3, nature: 1 }, "Enchanted Emerald tipped Mithril Crossbow Bolts."],
  ["ruby", "ruby_bolts_e", "Ruby bolts (e)", 9242, 49, 59, { fire: 5, blood: 1 }, "Enchanted Ruby tipped Adamantite Crossbow Bolts."],
  ["diamond", "diamond_bolts_e", "Diamond bolts (e)", 9243, 57, 67, { earth: 10, law: 2 }, "Enchanted Diamond tipped Adamantite Crossbow Bolts."],
  ["dragon", "dragon_bolts_e", "Dragon bolts (e)", 9244, 68, 78, { earth: 15, soul: 1 }, "Enchanted Dragonstone tipped Runite Crossbow Bolts."],
  ["onyx", "onyx_bolts_e", "Onyx bolts (e)", 9245, 87, 97, { fire: 20, death: 1 }, "Enchanted Onyx tipped Runite Crossbow Bolts."],
];

/* The casting table: which gem bolt each enchant is cast on, and what it costs
   besides the 1 cosmic rune the spell itself already carries. */
export const BOLT_ENCHANT = {};
/* The gem bolt ids, in the same gem order as the table above, so the `bolt`
   side of each row can be filled in from the plain gem-bolt table without a
   second hand-written list. */
const GEM_BOLT_IDS = { opal: "opal_bolts", jade: "jade_bolts", pearl: "pearl_bolts", topaz: "topaz_bolts", sapphire: "sapphire_bolts", emerald: "emerald_bolts", ruby: "ruby_bolts", diamond: "diamond_bolts", dragon: "dragon_bolts", onyx: "onyx_bolts" };
for (const [gem, id, name, cacheId, level, xp, runes, examine] of ENCHANTED_BOLTS) {
  const from = ITEMS[GEM_BOLT_IDS[gem]];
  def(id, {
    name, examine, value: ITEMS[GEM_BOLT_IDS[gem]] ? ITEMS[GEM_BOLT_IDS[gem]].value : 1, cacheId,
    slot: "ammo", stack: true, kind: "ammo", ammoKind: "bolt", shape: "arrow",
    colour: from ? from.colour : 0x9a9a94, ammo: from ? from.ammo : 0, missile: 27,
    boltEffect: gem,
  });
  BOLT_ENCHANT[GEM_BOLT_IDS[gem]] = { id, gem, level, xp, runes };
}

/* What an enchanted bolt does when its effect fires - **only the PvM column**,
   because this world has no other player to shoot (the `Enchanted bolts` page
   prints a PvP and a PvM chance for each, and they are not the same number).

   `name` is the effect's own published name, `chance` its PvM activation
   chance, and `accuracy: true` marks the four the page says roll **regardless
   of whether the shot passes its accuracy roll** (Lucky Lightning, Earth's
   Fury, Sea Curse, Blood Forfeit and Armour Piercing) - so those can fire off a
   shot that misses. The rest only ride a hit. `note` is what a player is told
   when the effect has nothing to do here.

   Topaz is the odd one out and is kept for that reason: **Down to Earth can
   only trigger against another player** in the live game, so in a world of
   monsters it is an enchant that never fires. It is still enchantable, because
   the spell does not refuse it - the guide and the item row say the effect does
   nothing here rather than pretending the bolt is not a bolt. */
export const BOLT_EFFECTS = {
  opal: { name: "Lucky Lightning", chance: 0.05, accuracy: true, gfx: 749, damage: "ranged/10", note: "A bolt of lightning strikes the target." },
  jade: { name: "Earth's Fury", chance: 0.06, accuracy: true, gfx: 750, bindTicks: 8, note: "The target is knocked to the ground." },
  pearl: { name: "Sea Curse", chance: 0.06, accuracy: true, gfx: 751, damage: "ranged/20", fieryDamage: "ranged/15", note: "A mighty bolt of water strikes the target." },
  topaz: { name: "Down to Earth", chance: 0, accuracy: true, gfx: 752, pvpOnly: true, note: "This effect only works on another player." },
  sapphire: { name: "Clear Mind", chance: 0.25, gfx: 753, drain: "ranged/10", note: "The target's prayer is drained." },
  emerald: { name: "Magical Poison", chance: 0.55, gfx: 754, poison: 5, note: "The target is poisoned." },
  ruby: { name: "Blood Forfeit", chance: 0.06, accuracy: true, gfx: 757, forfeit: { pct: 0.2, cap: 100, costPct: 0.1 }, note: "Blood is torn from the target." },
  diamond: { name: "Armour Piercing", chance: 0.1, accuracy: true, gfx: 758, piercing: 0.15, note: "The bolt pierces the target's armour." },
  dragon: { name: "Dragon's Breath", chance: 0.06, gfx: 756, damage: "ranged/20", dragonfire: true, note: "The target is engulfed in dragonfire." },
  onyx: { name: "Life Leech", chance: 0.11, gfx: 755, leech: { damage: 0.2, heal: 0.25 }, note: "The target's life is leeched away." },
};

/* ====================================================== the thrown weapons

   Darts, throwing knives, throwing axes and javelins - the fourth ranged
   family, and the only one whose weapon *is* its ammunition. A thrown weapon is
   wielded in the weapon slot like a sword, stacks like an arrow, and spends one
   off its own stack on every throw; this world had no way to express that until
   now (src/combat.js#thrownStack is the whole mechanism, and
   src/items.js#ANIM_MODES gives each family its own throw).

   Every number is the item page's own, and the javelins' come from the
   `Javelin` page's own pre-Monkey-Madness-II table - the stats they had while
   they were *thrown weapons* rather than ballista ammunition, which is what
   this world needs (a bronze javelin +5 ranged attack / +6 ranged strength, a
   rune one +38/+42). That same page is where their speed comes from: "attacking
   every 3 seconds if on the Rapid style" - six ticks, the slowest thrown weapon
   there is - with five tiles of reach (seven on longrange).

   Range, speed and the ranged bonus/strength are the item's own:
     darts      speed 3, range 3, +0 accuracy, +1/2/3/9/17/26 strength
     knives     speed 3, range 4, +4/5/8/11/15/25 accuracy, +3/4/7/10/14/24 str
     axes       speed 5, range 4, +4/5/8/12/17/26 accuracy, +5/7/11/16/23/36 str
     javelins   speed 6, range 5, +5/8/12/17/24/38 accuracy, +6/10/12/18/28/42 str

   `missile` is the family's own travel spotanim, per metal - the cache has a
   separate one for every metal of every thrown family (`spotanim.pack`:
   `200=bronze_javelin_travel` … `231=rune_dart_travel`), so a rune knife is the
   blue one in the air exactly the way a rune arrow is. */

/* [id, name, cacheId, family, level, speed, arange, rstr, value, colour,
   examine, missile] */
const THROWN = [
  /* darts - the fastest, weakest and shortest-reaching of the four */
  ["bronze_dart", "Bronze dart", 806, "dart", 1, 3, 0, 1, 1, 0x9c6b3f, "A deadly throwing dart with a bronze tip.", 226],
  ["iron_dart", "Iron dart", 807, "dart", 1, 3, 0, 2, 2, 0x9e9e9e, "A deadly throwing dart with an iron tip.", 227],
  ["steel_dart", "Steel dart", 808, "dart", 5, 3, 0, 3, 10, 0xc2c2c2, "A deadly throwing dart with a steel tip.", 228],
  ["mithril_dart", "Mithril dart", 809, "dart", 20, 3, 0, 9, 25, 0x5f7fa8, "A deadly throwing dart with a mithril tip.", 229],
  ["adamant_dart", "Adamant dart", 810, "dart", 30, 3, 0, 17, 65, 0x4f8f6f, "A deadly throwing dart with an adamant tip.", 230],
  ["rune_dart", "Rune dart", 811, "dart", 40, 3, 0, 26, 350, 0x5fb0d0, "A deadly throwing dart with a rune tip.", 231],
  /* throwing knives - a hair more accurate, stronger and longer than a dart */
  ["bronze_knife", "Bronze knife", 864, "knife", 1, 3, 4, 3, 1, 0x9c6b3f, "A finely balanced throwing knife.", 212],
  ["iron_knife", "Iron knife", 863, "knife", 1, 3, 5, 4, 3, 0x9e9e9e, "A finely balanced throwing knife.", 213],
  ["steel_knife", "Steel knife", 865, "knife", 5, 3, 8, 7, 11, 0xc2c2c2, "A finely balanced throwing knife.", 214],
  ["mithril_knife", "Mithril knife", 866, "knife", 20, 3, 11, 10, 27, 0x5f7fa8, "A finely balanced throwing knife.", 216],
  ["adamant_knife", "Adamant knife", 867, "knife", 30, 3, 15, 14, 66, 0x4f8f6f, "A finely balanced throwing knife.", 217],
  ["rune_knife", "Rune knife", 868, "knife", 40, 3, 25, 24, 167, 0x5fb0d0, "A finely balanced throwing knife.", 218],
  /* throwing axes - slower, but the hardest-hitting of the three fast families */
  ["bronze_thrownaxe", "Bronze thrownaxe", 800, "thrownaxe", 1, 5, 4, 5, 3, 0x9c6b3f, "A finely balanced throwing axe.", 36],
  ["iron_thrownaxe", "Iron thrownaxe", 801, "thrownaxe", 1, 5, 5, 7, 7, 0x9e9e9e, "A finely balanced throwing axe.", 35],
  ["steel_thrownaxe", "Steel thrownaxe", 802, "thrownaxe", 5, 5, 8, 11, 26, 0xc2c2c2, "A finely balanced throwing axe.", 37],
  ["mithril_thrownaxe", "Mithril thrownaxe", 803, "thrownaxe", 20, 5, 12, 16, 70, 0x5f7fa8, "A finely balanced throwing axe.", 38],
  ["adamant_thrownaxe", "Adamant thrownaxe", 804, "thrownaxe", 30, 5, 17, 23, 176, 0x4f8f6f, "A finely balanced throwing axe.", 39],
  ["rune_thrownaxe", "Rune thrownaxe", 805, "thrownaxe", 40, 5, 26, 36, 440, 0x5fb0d0, "A finely balanced throwing axe.", 41],
  /* javelins - the slowest, longest-reaching and hardest-hitting thrown weapon */
  ["bronze_javelin", "Bronze javelin", 825, "javelin", 1, 6, 5, 6, 4, 0x9c6b3f, "A bronze tipped javelin.", 200],
  ["iron_javelin", "Iron javelin", 826, "javelin", 1, 6, 8, 10, 6, 0x9e9e9e, "An iron tipped javelin.", 201],
  ["steel_javelin", "Steel javelin", 827, "javelin", 5, 6, 12, 12, 24, 0xc2c2c2, "A steel tipped javelin.", 202],
  ["mithril_javelin", "Mithril javelin", 828, "javelin", 20, 6, 17, 18, 64, 0x5f7fa8, "A mithril tipped javelin.", 203],
  ["adamant_javelin", "Adamant javelin", 829, "javelin", 30, 6, 24, 28, 160, 0x4f8f6f, "An adamant tipped javelin.", 204],
  ["rune_javelin", "Rune javelin", 830, "javelin", 40, 6, 38, 42, 400, 0x5fb0d0, "A rune tipped javelin.", 205],
];
for (const [id, name, cacheId, family, level, speed, arange, rstr, value, colour, examine, missile] of THROWN) {
  const bn = B();
  bn.arange = arange;
  bn.rstr = rstr;
  def(id, {
    name, examine, value, cacheId, slot: "weapon", style: "ranged", speed, range: family === "dart" ? 3 : family === "javelin" ? 5 : 4,
    req: { ranged: level }, bonus: bn, kind: "thrown", thrown: family, stack: true,
    colour, shape: family, cat: family, missile,
  });
}

/* ========================================= the two bows that are not made of logs

   The **dark bow** (id 11235 in this revision, released 11 June 2007, so it is
   in the cache) and the **Seercull** (6724, from the Fremennik). Both are
   ordinary two-handed bows in every way the engine cares about - a bow shape,
   the bow's own draw, arrows from the quiver - and differ only in their
   numbers, their wield models and their special attacks.

   The dark bow is the slowest bow in the game at **nine ticks** (its own page's
   speed), and its special is the reason: `Descent of Darkness`, 55% of the bar,
   which looses **two arrows** and gives each one up to 30% more damage with a
   floor of 5 per hit (the live table's own numbers). The Seercull is a
   fifth-tick bow of 69 accuracy whose `Soulshot` - the whole bar, 100% - is a
   *guaranteed hit* that drains the target's Magic by the damage it deals, and
   which the live game rolls ignoring the wielder's own prayers and equipment
   bonuses. Both specials are in src/combat.js#SPECIALS. */
def("dark_bow", {
  name: "Dark bow", examine: "A bow from a darker dimension.", value: 120002, weight: 1.814, cacheId: 11235,
  slot: "weapon", two: true, style: "ranged", speed: 9, range: 10, req: { ranged: 60 },
  bonus: Object.assign(B(), { arange: 95 }), kind: "bow", ammoKind: "arrow", colour: 0x3a3a4a, shape: "bow", cat: "bow",
  spec: "Descent of Darkness", specCost: 55,
  /* The special's own crouch is the fourth entry, past the three style buttons:
     `attackAnimFor` clamps the style index to the end of the set, so no button
     can ever pick it locally - it is here so the swing table
     (src/items.js#combatAnims) carries the name and the special's own fight
     packet can show the crouch to the players standing around
     (src/combat.js, src/tools/check-visibility.mjs). */
  anims: ["attack_bow", "attack_bow", "attack_bow", "attack_dark_bow_spec"],
});
def("seercull", {
  name: "Seercull", examine: "An ancient Fremennik bow that was once used to battle the Moon Clan.", value: 8000, weight: 1.36, cacheId: 6724,
  slot: "weapon", two: true, style: "ranged", speed: 5, range: 8, req: { ranged: 50 },
  bonus: Object.assign(B(), { arange: 69 }), kind: "bow", ammoKind: "arrow", colour: 0xb0a070, shape: "bow", cat: "bow",
  spec: "Soulshot", specCost: 100,
});

/* ------------------------------------------------------- poisoned weapons

   Every weapon in this world a weapon poison can be applied to, in all three
   strengths. Only spears, hastae, daggers, arrows, bolts, darts, throwing
   knives and javelins can be poisoned - the Poison page's own list - and with
   the thrown families above in the world all eight are now here: the five below
   (daggers, spears, hastae, arrows and bolts) and the three thrown ones at the
   end of the table. A throwing *axe* is deliberately absent, and that is the
   page's own rule ("Unlike other throwing weapons, thrownaxes cannot be
   poisoned"), not an omission. Every one of
   them is in the cache, with a real icon (src/sprites/items/<id>.png) and, for
   the melee ones, a real wield model, which is how the family is generated at
   all: the cache ids below are what src/tools/cache-bake looks the models up
   by. (An arrow and a bolt are ammunition, so they have no wield model and no
   held-bake entry - they ride the same missile graphic they always did, and the
   coat shows in the name, the poison clock and the hit.)

   A poisoned weapon is its clean self and nothing else. The bonuses, the wield
   requirement, the speed, the attack styles and the ammo behaviour are copied
   from the base item, because a coating is not a stat line - a rune dagger(p)
   hits exactly like a rune dagger. What the row adds is the coat: its own name
   and examine, and `weaponPoison`, the tier that decides how hard the poison
   bites (src/items.js#WEAPON_POISON, src/combat.js#poisonOnHit).

   Row shape: [base item, the family's value, its weight in kg, examine,
   [the three cache ids in (p), (p+), (p++) order]].

     * value  is the *poisoned* item's own, which is not always the clean
              item's: a dragon dagger(p) is worth 24,000 where a clean one is
              30,000, and a black spear(p) 750 where a clean one is 650.
     * weight is the item's own kg, read off the wiki, and it is the same for
              all three tiers - and equal to the clean weapon's own weight,
              which was checked across all 37 families rather than assumed. (The
              eight bolt families weigh nothing, like every other bolt.)
              It is carried here rather than added to item-weights.json for the
              reason src/items.js#itemWeight gives: a generated row that already
              knows its number should not need a second file kept in step.
     * examine is per *family*, not per tier - all three strengths of a bronze
              dagger say "This dagger is poisoned." - so a family whose tiers do
              read differently carries its three lines in an array instead (the
              hastae do: "poison tipped" for (p)/(p+), "poison-tipped" for
              (p++)). Every line is the item's own from its wiki page.
     * the ids are the cache items. They are looked up by id rather than by name
              because the 2007 cache abbreviates some of them ("Adam dagger(p+)"
              for the adamant one, "Br'ze dagger(p++)"), and an id cannot be got
              wrong the way a name can. */
const POISON_FAMILIES = [
  /* Daggers */
  ["bronze_dagger", 10, 0.453, "This dagger is poisoned.", [1221, 5670, 5688]],
  ["iron_dagger", 35, 0.453, "The blade is covered with poison.", [1219, 5668, 5686]],
  ["steel_dagger", 125, 0.453, "The blade has been poisoned.", [1223, 5672, 5690]],
  ["black_dagger", 240, 0.453, "This dagger is poisoned.", [1233, 5682, 5700]],
  ["white_dagger", 240, 0.453, "This dagger is poisoned.", [6593, 6595, 6597]],
  ["mithril_dagger", 325, 0.396, "A poisoned Mithril dagger.", [1225, 5674, 5692]],
  ["adamant_dagger", 800, 0.51, "A very dangerous poisoned dagger.", [1227, 5676, 5694]],
  ["rune_dagger", 8000, 0.453, "The blade is covered with a nasty poison.", [1229, 5678, 5696]],
  ["dragon_dagger", 24000, 0.453, "A powerful dagger.", [1231, 5680, 5698]],
  /* Spears */
  ["bronze_spear", 26, 2.267, "A poisoned bronze tipped spear.", [1251, 5704, 5718]],
  ["iron_spear", 91, 2.267, "A poisoned iron tipped spear.", [1253, 5706, 5720]],
  ["steel_spear", 325, 2.267, "A poisoned steel tipped spear.", [1255, 5708, 5722]],
  ["black_spear", 750, 2.267, "A poisoned black tipped spear.", [4582, 5734, 5736]],
  ["mithril_spear", 845, 1.814, "A poisoned mithril tipped spear.", [1257, 5710, 5724]],
  ["adamant_spear", 2080, 2.721, "A poisoned adamantite tipped spear.", [1259, 5712, 5726]],
  ["rune_spear", 20800, 2.267, "A poisoned rune tipped spear.", [1261, 5714, 5728]],
  ["dragon_spear", 62400, 2.267, "A poisoned dragon tipped spear.", [1263, 5716, 5730]],
  /* Hastae */
  ["bronze_hasta", 26, 2.267, ["A poison tipped, one-handed bronze hasta.", "A poison tipped, one-handed bronze hasta.", "A poison-tipped, one-handed bronze hasta."], [11379, 11382, 11384]],
  ["iron_hasta", 91, 2.267, "A poison-tipped, one-handed iron hasta.", [11386, 11389, 11391]],
  ["steel_hasta", 325, 2.267, "A poison-tipped, one-handed steel hasta.", [11393, 11396, 11398]],
  ["mithril_hasta", 845, 1.814, "A poison-tipped, one-handed mithril hasta.", [11400, 11403, 11405]],
  ["adamant_hasta", 2080, 2.721, "A poison-tipped, one-handed adamantite hasta.", [11407, 11410, 11412]],
  ["rune_hasta", 20800, 2.267, "A poison-tipped, one-handed rune hasta.", [11414, 11417, 11419]],
  /* Arrows */
  ["bronze_arrow", 1, 0, "Venomous-looking arrows.", [883, 5616, 5622]],
  ["iron_arrow", 3, 0, "Venomous-looking arrows.", [885, 5617, 5623]],
  ["steel_arrow", 12, 0, "Venomous-looking arrows.", [887, 5618, 5624]],
  ["mithril_arrow", 32, 0, "Venomous-looking arrows.", [889, 5619, 5625]],
  ["adamant_arrow", 80, 0, "Venomous-looking arrows.", [891, 5620, 5626]],
  ["rune_arrow", 400, 0, "Venomous-looking arrows.", [893, 5621, 5627]],
  /* The dragon arrow's three coats, and they are the only poisoned items in this
     revision whose *stack* art the cache points somewhere else: opcodes 100-103
     of 11227/11228/11229 name the unpoisoned count tiers 11213-11216, exactly as
     the plain dragon arrow does, so a pile of two or more dragon arrows(p) is
     drawn from the plain tiers' own item ids. src/data/item-stacks.json follows
     the defs; the icons there are the wiki's per-count files, which are poisoned
     at every size. */
  ["dragon_arrow", 800, 0, "Venomous-looking arrows.", [11227, 11228, 11229]],
  /* Bolts - the plain metals only, which is the live game's own rule ("All
     metal bolts can be poisoned") and the cache's: there is no poisoned
     gem-tipped bolt in rev 241, because a gem bolt is tipped rather than
     pointed. Bronze's three cache ids are the odd ones out (878, 6061, 6062 -
     the (p+) and (p++) sit off on their own in the item archive next to the
     other early poisoned bolts), and the seven later metals run in the tidy
     blocks 9286/9293/9300 within each of their own families. The (p++) lines
     read "Super poisoned ..." for every metal except silver, whose own examine
     never changes - which is why silver carries one string and the rest carry
     three. */
  ["bronze_bolts", 3, 0, ["Some poisoned bronze bolts.", "Some poisoned bronze bolts.", "Super poisoned bronze bolts."], [878, 6061, 6062]],
  ["blurite_bolts", 2, 0, ["Some poisoned blurite bolts.", "Some poisoned blurite bolts.", "Super poisoned blurite bolts."], [9286, 9293, 9300]],
  ["silver_bolts", 5, 0, "Some poisoned silver bolts.", [9292, 9299, 9306]],
  ["iron_bolts", 2, 0, ["Some poisoned iron bolts.", "Some poisoned iron bolts.", "Super poisoned iron bolts."], [9287, 9294, 9301]],
  ["steel_bolts", 8, 0, ["Some poisoned steel bolts.", "Some poisoned steel bolts.", "Super poisoned steel bolts."], [9288, 9295, 9302]],
  ["mithril_bolts", 20, 0, ["Some poisoned mithril bolts.", "Some poisoned mithril bolts.", "Super poisoned mithril bolts."], [9289, 9296, 9303]],
  ["adamant_bolts", 58, 0, ["Some poisoned adamantite bolts.", "Some poisoned adamantite bolts.", "Super poisoned adamantite bolts."], [9290, 9297, 9304]],
  ["runite_bolts", 300, 0, ["Some poisoned runite bolts.", "Some poisoned runite bolts.", "Super poisoned runite bolts."], [9291, 9298, 9305]],
  /* Darts, throwing knives and javelins - the other three families the Poison
     page names, added with the thrown weapons themselves. Each of the three
     says one line for all its tiers (the darts' names the metal, the other two
     do not), and every value is the *poisoned* item's own, which is where a
     knife and its coat disagree by a coin (a steel knife is 11, a steel
     knife(p) is 10). The cache ids are what the wield-model bake and the icon
     crop read, and the 2007 cache abbreviates two of them ("Iron dart (p)",
     "Bronze jav'n(p++)"), which is exactly why they are ids. */
  ["bronze_dart", 1, 0, "A deadly poisoned dart with a bronze tip.", [812, 5628, 5635]],
  ["iron_dart", 2, 0, "A deadly poisoned dart with an iron tip.", [813, 5629, 5636]],
  ["steel_dart", 10, 0, "A deadly poisoned dart with a steel tip.", [814, 5630, 5637]],
  ["mithril_dart", 25, 0, "A deadly poisoned dart with a mithril tip.", [815, 5632, 5639]],
  ["adamant_dart", 65, 0, "A deadly poisoned dart with an adamant tip.", [816, 5633, 5640]],
  ["rune_dart", 350, 0, "A deadly poisoned dart with a rune tip.", [817, 5634, 5641]],
  ["bronze_knife", 1, 0, "A finely balanced throwing knife.", [870, 5654, 5661]],
  ["iron_knife", 3, 0, "A finely balanced throwing knife.", [871, 5655, 5662]],
  ["steel_knife", 10, 0, "A finely balanced throwing knife.", [872, 5656, 5663]],
  ["mithril_knife", 27, 0, "A finely balanced throwing knife.", [873, 5657, 5664]],
  ["adamant_knife", 66, 0, "A finely balanced throwing knife.", [875, 5659, 5666]],
  ["rune_knife", 166, 0, "A finely balanced throwing knife.", [876, 5660, 5667]],
  ["bronze_javelin", 4, 0, "A bronze tipped javelin.", [831, 5642, 5648]],
  ["iron_javelin", 6, 0, "An iron tipped javelin.", [832, 5643, 5649]],
  ["steel_javelin", 24, 0, "A steel tipped javelin.", [833, 5644, 5650]],
  ["mithril_javelin", 64, 0, "A mithril tipped javelin.", [834, 5645, 5651]],
  ["adamant_javelin", 160, 0, "An adamant tipped javelin.", [835, 5646, 5652]],
  ["rune_javelin", 400, 0, "A rune tipped javelin.", [836, 5647, 5653]],
];

/* The three strengths, and every number is the Poison page's own table:

     tier 1  Weapon poison       initial 4 melee / 2 ranged, severity 20
     tier 2  Weapon poison(+)    initial 5 melee / 3 ranged, severity 25
     tier 3  Weapon poison(++)   initial 6 melee / 4 ranged, severity 30

   The ranged pair is lower because a ranged poison starts with its severity
   lowered (the page's own rule), and the effect of that, in the shared poison
   clock src/combat.js#poisonTick already runs, is that the first plate is a
   single hit instead of five: a melee rune dagger(p++) deals its 6 five times
   and then 5, 4, 3, 2 and 1 five times each - 105 damage, the page's own total
   - while the same poison on arrows deals 4 once and then 3, 2 and 1 five times
   each, 34 damage, which is also the page's own total. `item` is the vial the
   coating is poured out of. */
export const WEAPON_POISON = [
  null,
  { name: "Weapon poison", melee: 4, ranged: 2, severity: 20, item: "weapon_poison" },
  { name: "Weapon poison(+)", melee: 5, ranged: 3, severity: 25, item: "weapon_poison_plus" },
  { name: "Weapon poison(++)", melee: 6, ranged: 4, severity: 30, item: "weapon_poison_plus_plus" },
];

export const POISON_SUFFIX = [null, "(p)", "(p+)", "(p++)"];
const POISON_ID_SUFFIX = [null, "_p", "_p_plus", "_p_plus_plus"];

/* The base item's own id -> { 1: poisoned id, 2: ..., 3: ... }, so a use-with
   can ask what a given poison makes of a given weapon, and the reverse -
   poisoned id -> { base, tier } - so a cleaning cloth can ask what a coated
   weapon's clean self is. */
export const POISON_VARIANTS = {};
export const POISON_COAT = {};

for (const [baseId, value, weight, examine, cacheIds] of POISON_FAMILIES) {
  const base = ITEMS[baseId];
  if (!base) continue;
  const variants = {};
  for (let tier = 1; tier <= 3; tier++) {
    const id = baseId + POISON_ID_SUFFIX[tier];
    def(id, {
      name: base.name + POISON_SUFFIX[tier],
      examine: Array.isArray(examine) ? examine[tier - 1] : examine,
      value,
      slot: base.slot, two: base.two, speed: base.speed,
      req: base.req ? Object.assign({}, base.req) : null,
      bonus: Object.assign(B(), base.bonus),
      kind: base.kind, shape: base.shape, cat: base.cat, style: base.style, colour: base.colour,
      stack: base.stack, ammo: base.ammo, ammoKind: base.ammoKind, missile: base.missile,
      /* A poisoned thrown weapon still reaches as far as the clean one and is
         still thrown (its own stack, one per throw), so the two fields the
         throw mechanics read have to be copied like every other stat. */
      range: base.range, thrown: base.thrown,
      weaponPoison: tier,
      cacheId: cacheIds[tier - 1],
      weight,
    });
    variants[tier] = id;
    POISON_COAT[id] = { base: baseId, tier };
  }
  POISON_VARIANTS[baseId] = variants;
}

/* --------------------------------------------------------------- the staves

   Every staff's stat line is the item's own. The four elemental staves share
   one line - +3 stab, -1 slash, +9 crush, +10 magic attack, +2/+3/+1 melee
   defence, +10 magic defence, +6 strength - and differ only in the rune they
   supply without end, which is what `rune` says: src/combat.js#castAt skips
   that element's cost while the staff is held, and src/magic.js#castAnimFor
   reads it to pick the staff casting pose.

   No staff has a magic-damage bonus in this era (`mdmg` is 0 for all of them,
   which is why the old `mb: 10` field went: it was being written into `mdmg`
   and read by nothing, and it made every staff look like a 10% damage boost).

   The three god staves are the key to their own god spell - without the
   matching staff the spell cannot be cast at all (magic.js#spellStatus), which
   is the live rule - and the **ancient staff** autocasts the Ancient book.

   **Every staff is one-handed**, which the wiki's own Slot row says (the Staff
   of fire's links to /w/One-handed_slot_table, while the bronze 2h sword's uses
   `2h_slot.png`), and which is why the staff-and-shield combination is a real
   loadout: a staff of fire with an anti-dragon shield, say. This used to be
   wrong here - every staff defaulted to two-handed, so equipping one silently
   stowed the shield - and the comment claimed the ancient staff was the one
   exception. There is no exception: `two` is opt-in, and no staff opts in. */
const STAVES = [
  { id: "staff_of_air", name: "Staff of air", col: 0xd8d8e8, rune: "air_rune", b: { astab: 3, aslash: -1, acrush: 9, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 6 } },
  { id: "staff_of_water", name: "Staff of water", col: 0x6a9fd8, rune: "water_rune", b: { astab: 3, aslash: -1, acrush: 9, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 6 } },
  { id: "staff_of_earth", name: "Staff of earth", col: 0x8a7a4a, rune: "earth_rune", b: { astab: 3, aslash: -1, acrush: 9, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 6 } },
  { id: "staff_of_fire", name: "Staff of fire", col: 0xd86a3a, rune: "fire_rune", b: { astab: 3, aslash: -1, acrush: 9, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 6 } },
  { id: "saradomin_staff", name: "Saradomin staff", col: 0xa8b8e0, examine: "A magical staff imbued with the power of Saradomin.", value: 80000, god: "saradomin", b: { astab: -1, aslash: -1, acrush: 6, amagic: 6, dstab: 2, dslash: 3, dcrush: 1, dmagic: 6, str: 2 } },
  { id: "guthix_staff", name: "Guthix staff", col: 0x7ac078, examine: "A magical staff imbued with the power of Guthix.", value: 80000, god: "guthix", b: { astab: -1, aslash: -1, acrush: 6, amagic: 6, dstab: 2, dslash: 3, dcrush: 1, dmagic: 6, str: 2 } },
  { id: "zamorak_staff", name: "Zamorak staff", col: 0xc07868, examine: "A magical staff imbued with the power of Zamorak.", value: 80000, god: "zamorak", b: { astab: -1, aslash: -1, acrush: 6, amagic: 6, dstab: 2, dslash: 3, dcrush: 1, dmagic: 6, str: 2 } },
  /* The **Lumbridge Guide's staff**, remade as a weapon of Saradomin's - this
     world's own, like the Armadyl halberd. The Guide himself is in the cache
     (NPC 2244, src/models/lumbridge_guide.json) but his staff is scenery on his
     body: no item, no wield model, no dropped model. So the weapon is authored
     by hand in src/tools/hand-models/lumbridge-staff.mjs - the *contour* of the
     Guide's own staff as the shaft, the Saradomin staff's banded handle built
     into that same tube rather than sleeved over it, the Saradomin staff's own
     star transplanted upright as its head in place of the Guide's top piece, and
     the shaft recoloured from the Guide's blue-grey to plain grey - all on the
     user's instruction, which is quoted in that file's header.

     It is the Guide's own size - his staff is 246.5 units against the Saradomin
     staff's 188.3, and nothing about it is scaled down - while the banded handle
     keeps the Saradomin staff's own dimensions and sits on the hand.

     Its stats are the Saradomin staff's own, because that is what it is: a
     Saradomin staff the Guide carries. One-handed, and a god staff, so it casts
     Saradomin Strike (magic.js#spellStatus reads the staff's own `god`).

     Its `shape` is a key of its own rather than `staff`, for the reason in
     src/tools/hand-models/README.md: the wield-model bake looks a cache item up
     per shape, and an item whose meshes are hand-authored must not send it
     looking for one that cannot exist (the same reason the Armadyl halberd's row
     carries one). */
  { id: "saradomins_staff", name: "Saradomin's staff", col: 0xa8b8e0,
    examine: "The Lumbridge Guide's staff, crowned with the star of Saradomin.",
    value: 80000, god: "saradomin", shape: "saradomins_staff",
    b: { astab: -1, aslash: -1, acrush: 6, amagic: 6, dstab: 2, dslash: 3, dcrush: 1, dmagic: 6, str: 2 } },
  { id: "ancient_staff", name: "Ancient staff", col: 0x8a7a9a, examine: "A magical staff of ancient origin...", value: 100000, cacheId: 4675,
    req: { attack: 50, magic: 50 },
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 15, dstab: 2, dslash: 3, dcrush: 1, dmagic: 15, str: 50, pray: -1 } },
  /* The Void knight mace: a one-handed crush weapon whose damage style panel is
     a staff's (weapon_type "staff" in the item's own data), so it autocasts -
     the mace one of the Void set wears. */
  { id: "void_knight_mace", name: "Void knight mace", col: 0x9a9a9a, examine: "A mace used by the order of the Void Knights.", value: 12000, cacheId: 8841,
    req: { attack: 42, strength: 42, defence: 42, hitpoints: 42, ranged: 42, magic: 42, prayer: 22 },
    b: { astab: 22, acrush: 41, amagic: 8, dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: 2, str: 38, pray: 6 } },
  { id: "third_age_wand", name: "3rd age wand", col: 0xd8d8e8, examine: "A beautifully crafted wand infused by ancient wizards.", value: 150000, cacheId: 12422,
    req: { magic: 65 }, speed: 4,
    b: { amagic: 20, dmagic: 20 } },
  { id: "third_age_druidic_staff", name: "3rd age druidic staff", col: 0x6a7a4a, examine: "A fabulously ancient gnarled staff as used by the druids of old.", value: 200000, cacheId: 23342,
    req: { prayer: 65, attack: 65 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 32, pray: 6 } },
  /* Ahrim's staff - the sixth and last of the brothers' weapons, and the head
     of the set its own effect hangs off (src/combat.js#applySetOnHit). It is
     the one Barrows weapon that is a *staff*: a one-handed quarterstaff, not a
     two-hander, so a shield stays on the other arm, and its own stat line is
     the strangest in the table - it is a magic weapon that hits like a mace
     (+12 stab, +65 crush, +68 strength, and only -1 slash), which is how it
     earned its place as the melee staff of choice before the staff of light.
     Every number is the item page's own. The +5% magic damage the modern wiki
     prints is *not* here: that is a 2014 addition to every Ahrim's piece, and
     this world is the era before it. 70 Attack and 70 Magic to wield, per the
     page's own requirements. */
  { id: "ahrims_staff", name: "Ahrim's staff", col: 0x5a4a7a, examine: "Ahrim the Blighted's quarterstaff.", value: 85000, cacheId: 4710,
    req: { attack: 70, magic: 70 },
    b: { astab: 12, aslash: -1, acrush: 65, amagic: 15, dstab: 3, dslash: 5, dcrush: 2, dmagic: 15, str: 68 } },

  /* ---------------------------------------------------------- the battlestaves

     The plain battlestaff and the six elemental ones. In the live game they are
     the Crafting staves (an air/water/earth/fire orb on a battlestaff, or an
     orb's two elements for the lava and mud ones), and they are the reason the
     orb-charging spells exist; this world has no orb in its roster and no
     recipe for one, so the seven are stocked by the Magic Guild Store at each
     staff's own value, the same stand-in the god staves already use, and the
     four that are pure elements are what `rune` says a staff supplies.

     Every number is the item page's own: 30 Attack and 30 Magic to wield, and
     the four elemental ones share a stat line (+7 stab, -1 slash, +28 crush,
     +12 magic, +2/+3/+1 melee defence, +12 magic defence, +35 strength) that is
     the plain battlestaff's line with a little more crush and strength. The
     **lava** and **mud** battlestaves are combination staves - fire+earth and
     water+earth - so they carry `runes`, the multi-element form the lunar staff
     introduced, and supply both elements without end. */
  { id: "battlestaff", name: "Battlestaff", col: 0x7a5a34, examine: "It's a slightly magical stick.", value: 7000, cacheId: 1391,
    req: { attack: 30, magic: 30 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 32 } },
  { id: "air_battlestaff", name: "Air battlestaff", col: 0xd8d8e8, examine: "It's a slightly magical stick.", value: 15500, cacheId: 1397,
    req: { attack: 30, magic: 30 }, rune: "air_rune",
    b: { astab: 7, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },
  { id: "water_battlestaff", name: "Water battlestaff", col: 0x6a9fd8, examine: "It's a slightly magical stick.", value: 15500, cacheId: 1395,
    req: { attack: 30, magic: 30 }, rune: "water_rune",
    b: { astab: 10, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },
  { id: "earth_battlestaff", name: "Earth battlestaff", col: 0x8a7a4a, examine: "It's a slightly magical stick.", value: 15500, cacheId: 1399,
    req: { attack: 30, magic: 30 }, rune: "earth_rune",
    b: { astab: 7, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },
  { id: "fire_battlestaff", name: "Fire battlestaff", col: 0xd86a3a, examine: "It's a slightly magical stick.", value: 15500, cacheId: 1393,
    req: { attack: 30, magic: 30 }, rune: "fire_rune",
    b: { astab: 7, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },
  { id: "lava_battlestaff", name: "Lava battlestaff", col: 0xc05030, examine: "It's a slightly magical stick.", value: 17000, cacheId: 3053,
    req: { attack: 30, magic: 30 }, runes: ["fire_rune", "earth_rune"],
    b: { astab: 7, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },
  { id: "mud_battlestaff", name: "Mud battlestaff", col: 0x6a5a3a, examine: "It's a slightly magical stick.", value: 17000, cacheId: 6562,
    req: { attack: 30, magic: 30 }, runes: ["water_rune", "earth_rune"],
    b: { astab: 7, aslash: -1, acrush: 28, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 12, str: 35 } },

  /* ---------------------------------------------------------- the mystic staves

     The six battlestaves' mystic counterparts: the same elements, one tier up,
     and 40 Attack and 40 Magic to wield rather than 30. They are the staff half
     of the mystic robe sets and are stocked alongside them. */
  { id: "mystic_air_staff", name: "Mystic air staff", col: 0x8a8ab8, examine: "It's a slightly magical stick.", value: 42500, cacheId: 1405,
    req: { attack: 40, magic: 40 }, rune: "air_rune",
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_water_staff", name: "Mystic water staff", col: 0x4a7fb8, examine: "It's a slightly magical stick.", value: 42500, cacheId: 1403,
    req: { attack: 40, magic: 40 }, rune: "water_rune",
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_earth_staff", name: "Mystic earth staff", col: 0x6a5a2a, examine: "It's a slightly magical stick.", value: 42500, cacheId: 1407,
    req: { attack: 40, magic: 40 }, rune: "earth_rune",
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_fire_staff", name: "Mystic fire staff", col: 0xb84a1a, examine: "It's a slightly magical stick.", value: 42500, cacheId: 1401,
    req: { attack: 40, magic: 40 }, rune: "fire_rune",
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_lava_staff", name: "Mystic lava staff", col: 0xa04020, examine: "It's a slightly magical stick.", value: 45000, cacheId: 3054,
    req: { attack: 40, magic: 40 }, runes: ["fire_rune", "earth_rune"],
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_mud_staff", name: "Mystic mud staff", col: 0x5a4a2a, examine: "It's a slightly magical stick.", value: 45000, cacheId: 6563,
    req: { attack: 40, magic: 40 }, runes: ["water_rune", "earth_rune"],
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },
  { id: "mystic_lightning_staff", name: "Mystic lightning staff", col: 0x00d5e8, examine: "It channels the power of all three gods.", value: 42500,
    req: { attack: 40, magic: 40 }, rune: "water_rune", speed: 3, god: "all",
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 14, dstab: 2, dslash: 3, dcrush: 1, dmagic: 14, str: 50 } },

  /* ------------------------------------------------- the rest of the staves

     The staves that supply no rune and unlock no spell this world has - so they
     are the weapon and nothing more, which is what the guide says about them.
     Every number is the item page's own, including the two that swing at the
     weapon's own 4 ticks rather than a staff's usual 5. */
  { id: "ibans_staff", name: "Iban's staff", col: 0x8a7a3a, examine: "An ancient staff, formerly the property of Iban.", value: 42500, cacheId: 1409,
    req: { attack: 50, magic: 50 },
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 50 } },
  /* Iban's superior staff - this world's own, after the live game's upgraded
     Iban's staff (u), but with no charges and no (u): the upgrade here is the
     staff itself, and what it unlocks is the book's Iban's Superior Blast
     (magic.js#spellStatus gates that spell to this staff id). Its numbers are
     the (u)'s own - the upgrade never changed the bonuses, only the charges -
     so they match Iban's staff above: 50 Attack and 50 Magic to wield, and no
     rune supplied. Its meshes are hand-authored (the (u) postdates rev 241 by
     years, so there is nothing to bake) in
     src/tools/hand-models/ibans-superior-staff.mjs: the staff's own geometry
     in the (u)'s red finish. Like the mystic lightning staff it keeps shape
     "staff", so styles, anims and autocast are a staff's, and a re-bake
     reports it missing by name and skips it. */
  { id: "ibans_superior_staff", name: "Iban's superior staff", col: 0x9a3a1a, examine: "An upgraded ancient staff, formerly the property of Iban.", value: 250000,
    req: { attack: 50, magic: 50 },
    b: { astab: 10, aslash: -1, acrush: 40, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 50 } },
  { id: "slayers_staff", name: "Slayer's staff", col: 0x9a8a5a, examine: "An old and magical staff.", value: 21000, cacheId: 4170, speed: 4,
    req: { magic: 50, slayer: 55 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 12, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 35 } },
  { id: "white_magic_staff", name: "White magic staff", col: 0xdedede, examine: "A Magical staff.", value: 200, cacheId: 6603,
    req: { attack: 10 },
    b: { astab: 2, aslash: -1, acrush: 10, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 7, pray: 1 } },
  { id: "dramen_staff", name: "Dramen staff", col: 0x7a8a5a, examine: "Crafted from a Dramen tree branch.", value: 15, cacheId: 772, speed: 4,
    b: { astab: -1, aslash: -1, acrush: 10, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 10 } },
  { id: "magic_staff", name: "Magic staff", col: 0x8a7a5a, examine: "A Magical staff.", value: 200, cacheId: 1389,
    b: { astab: 2, aslash: -1, acrush: 10, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 7 } },

  /* The three god croziers (unit L5): the vestments' own staff, and the only
     staves in this world with a prayer bonus - +6 each, against +10 magic. 60
     Prayer to wield, exactly as the item page prints them, and no rune: a
     crozier is the vestments' walking stick, not a rune-supplying staff. Their
     cache names are all the bare word "Crozier", so each row carries its own
     `cacheId`. */
  { id: "saradomin_crozier", name: "Saradomin crozier", col: 0xd8d8e8, examine: "A Saradomin crozier.", value: 5000, cacheId: 10440,
    req: { prayer: 60 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 32, pray: 6 } },
  { id: "guthix_crozier", name: "Guthix crozier", col: 0x7ac078, examine: "A Guthix crozier.", value: 5000, cacheId: 10442,
    req: { prayer: 60 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 32, pray: 6 } },
  { id: "zamorak_crozier", name: "Zamorak crozier", col: 0xc07868, examine: "A Zamorak crozier.", value: 5000, cacheId: 10444,
    req: { prayer: 60 },
    b: { astab: 7, aslash: -1, acrush: 25, amagic: 10, dstab: 2, dslash: 3, dcrush: 1, dmagic: 10, str: 32, pray: 6 } },
];
/* The four the shop keeps in stock carry the shop's own price; the god staves
   the value their own page gives. A staff with no `value` of its own is 1500,
   which is the elemental staff's published value. */
STAVES.forEach((s) => {
  const b = B();
  Object.assign(b, s.b);
  def(s.id, {
    name: s.name, examine: s.examine || "A magical staff.", value: s.value || 1500,
    slot: "weapon", two: !!s.two, style: "magic", speed: s.speed || 5,
    req: s.req || { magic: 1 }, bonus: b, kind: "staff", colour: s.col,
    shape: s.shape || "staff", cat: "staff", rune: s.rune || null, god: s.god || null,
    runes: s.runes || null, cacheId: s.cacheId,
  });
});

const RUNES = [
  { id: "air_rune", name: "Air rune", col: 0xd8d8e8 },
  { id: "water_rune", name: "Water rune", col: 0x6a9fd8 },
  { id: "earth_rune", name: "Earth rune", col: 0x9a8a5a },
  { id: "fire_rune", name: "Fire rune", col: 0xd86a3a },
  { id: "mind_rune", name: "Mind rune", col: 0xc0a0d8 },
  { id: "body_rune", name: "Body rune", col: 0xb0b8c8 },
  { id: "chaos_rune", name: "Chaos rune", col: 0xd8b040 },
  { id: "death_rune", name: "Death rune", col: 0x555a66 },
  { id: "blood_rune", name: "Blood rune", col: 0xa03030 },
  { id: "nature_rune", name: "Nature rune", col: 0x50a050 },
  { id: "law_rune", name: "Law rune", col: 0x6070c0 },
  { id: "cosmic_rune", name: "Cosmic rune", col: 0xc8c860 },
  { id: "soul_rune", name: "Soul rune", col: 0x8fa8b8 },
  { id: "astral_rune", name: "Astral rune", col: 0x9fb8e8 },
  { id: "mist_rune", name: "Mist rune", col: 0xb8c8e0, examine: "A combined Air and Water Rune." },
  { id: "dust_rune", name: "Dust rune", col: 0xc8b890, examine: "A combined Air and Earth Rune." },
  { id: "mud_rune", name: "Mud rune", col: 0x8a6a4a, examine: "A combined Earth and Water Rune." },
  { id: "smoke_rune", name: "Smoke rune", col: 0x6a6a72, examine: "A combined Air and Fire Rune." },
  { id: "steam_rune", name: "Steam rune", col: 0xc0c8d0, examine: "A combined Water and Fire Rune." },
  { id: "lava_rune", name: "Lava rune", col: 0xd85a2a, examine: "A combined Earth and Fire Rune." },
];
RUNES.forEach((r) => def(r.id, { name: r.name, examine: r.examine || "One of the many runes used in Magic.", value: 4, stack: true, kind: "rune", colour: r.col, shape: "rune" }));


const AMULETS = [
  { id: "amulet_of_accuracy", name: "Amulet of accuracy", b: { astab: 4, aslash: 4, acrush: 4, amagic: 4, arange: 4 }, col: 0xd8d8e8 },
  { id: "amulet_of_strength", name: "Amulet of strength", b: { str: 10 }, col: 0xc04040 },
  { id: "amulet_of_defence", name: "Amulet of defence", b: { dstab: 7, dslash: 7, dcrush: 7, dmagic: 7, drange: 7 }, col: 0x6070c0 },
  { id: "amulet_of_power", name: "Amulet of power", b: { astab: 6, aslash: 6, acrush: 6, amagic: 6, arange: 6, dstab: 6, dslash: 6, dcrush: 6, dmagic: 6, drange: 6, str: 6, pray: 1 }, col: 0xd0a030 },
  { id: "amulet_of_glory", name: "Amulet of glory", b: { astab: 10, aslash: 10, acrush: 10, amagic: 10, arange: 10, dstab: 3, dslash: 3, dcrush: 3, dmagic: 3, drange: 3, str: 6, pray: 3 }, col: 0x70d0e0 },
  { id: "amulet_of_magic", name: "Amulet of magic", b: { amagic: 10, mdmg: 0 }, col: 0x8090d8 },
  /* Unit L2 of PLAN.md: the Lunar set's amulet and the onyx one. The fury's
     line is the live game's own (its page's +10 in every attack style, +15 in
     every defence, +8 strength and +5 prayer); the Lunar amulet is a small
     magic amulet worn with the rest of the set. */
  { id: "amulet_of_fury", name: "Amulet of fury", examine: "A very powerful onyx amulet.", value: 202000,
    b: { astab: 10, aslash: 10, acrush: 10, amagic: 10, arange: 10, dstab: 15, dslash: 15, dcrush: 15, dmagic: 15, drange: 15, str: 8, pray: 5 }, col: 0x7020a0 },
  { id: "third_age_amulet", name: "3rd age amulet", examine: "Fabulously ancient mage protection enchanted in the 3rd Age.", value: 50500, cacheId: 10344,
    req: { magic: 65, defence: 30 }, b: { amagic: 15, dmagic: 10 }, col: 0xd8d8e8 },
  /* The three god stoles (unit L5): the vestments' own amulet, and the only
     amulets in this world with a real prayer bonus of their own. 60 Prayer to
     wear, +2 magic attack and defence and +10 prayer, exactly as the item page
     prints them - which makes a stole the best prayer slot there is until the
     amulet of fury. Their cache names are the bare word "Stole", so each row
     carries its own `cacheId`. */
  { id: "saradomin_stole", name: "Saradomin stole", examine: "A Saradomin stole.", value: 2500, cacheId: 10470,
    req: { prayer: 60 }, b: { amagic: 2, dmagic: 2, pray: 10 }, col: 0xd8d8e8 },
  { id: "guthix_stole", name: "Guthix stole", examine: "A Guthix stole.", value: 2500, cacheId: 10472,
    req: { prayer: 60 }, b: { amagic: 2, dmagic: 2, pray: 10 }, col: 0x7ac078 },
  { id: "zamorak_stole", name: "Zamorak stole", examine: "A Zamorak stole.", value: 2500, cacheId: 10474,
    req: { prayer: 60 }, b: { amagic: 2, dmagic: 2, pray: 10 }, col: 0xc07868 },
  /* Iban's own neck slot, worn by the iban archetype: the wiki's numbers are
     the offensive mirror of the holy symbol's - +2 in every attack bonus and
     +8 prayer - with no requirement to wear. Rev 241 carries it as
     "Unholy symbol" (1724). */
  { id: "unholy_symbol", name: "Unholy symbol", examine: "An unholy symbol of Zamorak.", value: 200, cacheId: 1724,
    b: { astab: 2, aslash: 2, acrush: 2, amagic: 2, arange: 2, pray: 8 }, col: 0x96201f },
];
AMULETS.forEach((a) => {
  const b = B();
  Object.assign(b, a.b);
  def(a.id, {
    name: a.name, examine: a.examine || ("A " + a.name.toLowerCase() + "."),
    value: a.value || 2000, slot: "amulet", req: a.req || null, bonus: b, kind: "jewellery",
    colour: a.col, shape: "amulet", cat: "amulet", cacheId: a.cacheId,
  });
});

/* The necklaces: the plain wearable half of the jeweller's bench. Every one
   of the seven the furnace makes (gold plus the six cut gems, onyx included),
   at the published Crafting level and for the published experience
   (src/items.js#JEWELLERY). They come out of the mould wearable - only amulets
   need the ball of wool - and they are purely decorative: the live game
   enchants every necklace into a teleport (games necklace, duelling ring and
   friends), and this world has none of those destinations, so there is
   nothing to enchant them into. The published numbers really are all zeroes,
   which is why the rows carry no `b` (see scratch/osrsbox-items.json). */
const NECKLACES = [
  { id: "gold_necklace", name: "Gold necklace", value: 450, col: 0xf0d858, cacheId: 1654 },
  { id: "sapphire_necklace", name: "Sapphire necklace", value: 1050, col: 0x4060c0, cacheId: 1656 },
  { id: "emerald_necklace", name: "Emerald necklace", value: 1425, col: 0x30a050, cacheId: 1658 },
  { id: "ruby_necklace", name: "Ruby necklace", value: 2175, col: 0xc03040, cacheId: 1660 },
  { id: "diamond_necklace", name: "Diamond necklace", value: 3675, col: 0xd8e0e8, cacheId: 1662 },
  { id: "dragon_necklace", name: "Dragon necklace", value: 18375, col: 0x8040a0, cacheId: 1664 },
  { id: "onyx_necklace", name: "Onyx necklace", value: 201000, col: 0x2a2a32, cacheId: 6577 },
];
NECKLACES.forEach((a) => {
  def(a.id, {
    name: a.name, examine: "I wonder if this is valuable.",
    value: a.value, slot: "amulet", kind: "jewellery",
    colour: a.col, shape: "amulet", cat: "amulet", cacheId: a.cacheId,
  });
});

/* The silver strung symbols: the blessed end of the silver chain. The
   unblessed and unpowered middles are wearable but carry no bonus - exactly
   what the live game gives an unblessed symbol - and the blessed ends carry
   the published +2 all defences (holy) / +2 all attacks (unholy) and +8
   prayer (scratch/osrsbox-items.json). */
const SILVER_SYMBOLS = [
  { id: "unblessed_symbol", name: "Unblessed symbol", examine: "A symbol of Saradomin.", value: 200, col: 0xd8e0e8, cacheId: 1716 },
  { id: "holy_symbol", name: "Holy symbol", examine: "A blessed holy symbol of Saradomin.", value: 300, col: 0xf0e8c0, cacheId: 1718,
    b: { dstab: 2, dslash: 2, dcrush: 2, dmagic: 2, drange: 2, pray: 8 } },
  { id: "unpowered_symbol", name: "Unpowered symbol", examine: "An unblessed symbol of Zamorak.", value: 200, col: 0x8a8a92, cacheId: 1722 },
];
SILVER_SYMBOLS.forEach((a) => {
  const b = B();
  Object.assign(b, a.b);
  def(a.id, {
    name: a.name, examine: a.examine, value: a.value, slot: "amulet", bonus: b,
    kind: "jewellery", colour: a.col, shape: "amulet", cat: "amulet", cacheId: a.cacheId,
  });
});

/* The amulets the Enchant spells work on. Each is the input for one level of
   the spell and turns into the finished amulet of the same gem - sapphire to
   the Amulet of magic at lvl-1, emerald to defence at lvl-2, ruby to strength
   at lvl-3, diamond to power at lvl-4, dragonstone to glory at lvl-5 - which is
   exactly what the preserved content's `convertobj` rows say (see
   scratch/ref/lc_magic_spells.dbrow). */
const ENCHANT_GEMS = [
  { id: "sapphire_amulet", name: "Sapphire amulet", col: 0x4060c0, level: 1, to: "amulet_of_magic", value: 900, cacheId: 1694 },
  { id: "emerald_amulet", name: "Emerald amulet", col: 0x30a050, level: 2, to: "amulet_of_defence", value: 1275, cacheId: 1696 },
  { id: "ruby_amulet", name: "Ruby amulet", col: 0xc03040, level: 3, to: "amulet_of_strength", value: 2025, cacheId: 1698 },
  { id: "diamond_amulet", name: "Diamond amulet", col: 0xd8e0e8, level: 4, to: "amulet_of_power", value: 3525, cacheId: 1700 },
  /* The dragonstone amulet is the one item in this file whose cache name the
     cache does not spell out: 1683 (unstrung) and 1702 (strung) are both
     "Dragonstone ammy" in rev 241, so a name lookup finds nothing and both rows
     carry their own `cacheId`. That is also why this row had **no worn model**
     until unit L3 - the bake asked for "Dragonstone amulet", was told no, and
     said nothing (the same class of silent miss as Karil's crossbow's). */
  { id: "dragonstone_amulet", name: "Dragonstone amulet", col: 0x8040a0, level: 5, to: "amulet_of_glory", value: 17625, cacheId: 1702 },
  /* Lvl-6 Enchant's own refusal message promises "Onyx Amulets and Rings", and
     until unit L2 this world had neither - the spell was uncastable. The amulet
     is here now, and enchanting one is the amulet of fury's real source. (The
     ring stays out: it enchants into a Ring of stone, which is novelty - see
     src/items.js#RINGS.) */
  { id: "onyx_amulet", name: "Onyx amulet", col: 0x2a2a32, level: 6, to: "amulet_of_fury",
    value: 201000, cacheId: 6581, examine: "I wonder if I can get this enchanted." },
];
ENCHANT_GEMS.forEach((g) => {
  def(g.id, {
    name: g.name, examine: g.examine || ("A " + g.name.toLowerCase() + "."),
    value: g.value != null ? g.value : 250, slot: "amulet",
    kind: "jewellery", colour: g.col, shape: "amulet", cat: "amulet", cacheId: g.cacheId,
    enchant: g.level, enchantsTo: g.to,
  });
});

/* ------------------------------------------------- the jeweller's bench

   Jewel the jeweller is not here, but her **bench** is: the live game's second
   way to work a furnace, and the real source of every ring, amulet and bracelet
   this world used to sell over the Magic Guild's counter. A **gold bar**, a
   **mould** and (except for the plain gold pieces) a **cut gem** make one
   piece, at the published Crafting level and for the published experience; the
   mould is a tool and is never used up. Every number below is the item page's
   own Recipe box, gathered in one place because the recipes are *data* - the
   machinery that reads them is src/actions.js#attemptJewel.

   Three things the table deliberately does not contain, each for the reason the
   live game has nothing to put there:

     * **Necklaces.** The whole necklace family exists in the cache, but every
       necklace enchants into a *teleport* - a games necklace, a duelling ring,
       a skills necklace - and this world has no Duel Arena, Castle Wars or
       Warriors' Guild to travel to. Same reasoning as the emerald ring below.
     * **The emerald, ruby and diamond bracelets' enchants.** Those three
       products (the castle wars bracelet, the inoculation bracelet and the
       abyssal bracelet) are not in cache 241 at all: they post-date it. The
       bracelets themselves are real and craftable - unenchanted jewellery is
       purely decorative in the live game too - and only the sapphire,
       dragonstone and onyx bracelets have an enchant in this revision (the
       bracelet of clay, the combat bracelet and the regen bracelet).
     * **The onyx ring.** It enchants into a Ring of stone, which is novelty
       (see src/items.js#RINGS), and the emerald ring into the duelling ring
       above.

   `gem` is the *cut* gem's item id. `mould` is what the player must be carrying
   for the recipe to appear in the furnace's menu. */
export const JEWELLERY = [
  /* plain gold - a bar and a mould, no gem, and the first things a jeweller
     makes (levels 5-8) */
  { id: "gold_ring", mould: "ring_mould", gem: null, level: 5, xp: 15 },
  { id: "gold_amulet_u", mould: "amulet_mould", gem: null, level: 8, xp: 30 },
  { id: "gold_bracelet", mould: "bracelet_mould", gem: null, level: 7, xp: 25 },
  /* rings */
  { id: "sapphire_ring", mould: "ring_mould", gem: "sapphire", level: 20, xp: 40 },
  { id: "ruby_ring", mould: "ring_mould", gem: "ruby", level: 34, xp: 70 },
  { id: "diamond_ring", mould: "ring_mould", gem: "diamond", level: 43, xp: 85 },
  { id: "dragonstone_ring", mould: "ring_mould", gem: "dragonstone", level: 55, xp: 100 },
  /* amulets - made **unstrung** and worn only after a ball of wool
     (src/items.js#STRING_RECIPES); the live game's own two steps */
  { id: "sapphire_amulet_u", mould: "amulet_mould", gem: "sapphire", level: 24, xp: 65 },
  { id: "emerald_amulet_u", mould: "amulet_mould", gem: "emerald", level: 31, xp: 70 },
  { id: "ruby_amulet_u", mould: "amulet_mould", gem: "ruby", level: 50, xp: 85 },
  { id: "diamond_amulet_u", mould: "amulet_mould", gem: "diamond", level: 70, xp: 100 },
  { id: "dragonstone_amulet_u", mould: "amulet_mould", gem: "dragonstone", level: 80, xp: 150 },
  { id: "onyx_amulet_u", mould: "amulet_mould", gem: "onyx", level: 90, xp: 165 },
  /* bracelets */
  { id: "sapphire_bracelet", mould: "bracelet_mould", gem: "sapphire", level: 23, xp: 60 },
  { id: "emerald_bracelet", mould: "bracelet_mould", gem: "emerald", level: 30, xp: 65 },
  { id: "ruby_bracelet", mould: "bracelet_mould", gem: "ruby", level: 42, xp: 80 },
  { id: "diamond_bracelet", mould: "bracelet_mould", gem: "diamond", level: 58, xp: 95 },
  { id: "dragonstone_bracelet", mould: "bracelet_mould", gem: "dragonstone", level: 74, xp: 110 },
  { id: "onyx_bracelet", mould: "bracelet_mould", gem: "onyx", level: 84, xp: 125 },
  /* necklaces - made **strung**, worn straight out of the mould (only
     amulets need the ball of wool). Purely decorative: every necklace
     enchants into a teleport and this world has none of those destinations. */
  { id: "gold_necklace", mould: "necklace_mould", gem: null, level: 6, xp: 20 },
  { id: "sapphire_necklace", mould: "necklace_mould", gem: "sapphire", level: 22, xp: 55 },
  { id: "emerald_necklace", mould: "necklace_mould", gem: "emerald", level: 29, xp: 60 },
  { id: "ruby_necklace", mould: "necklace_mould", gem: "ruby", level: 40, xp: 75 },
  { id: "diamond_necklace", mould: "necklace_mould", gem: "diamond", level: 56, xp: 90 },
  { id: "dragon_necklace", mould: "necklace_mould", gem: "dragonstone", level: 72, xp: 105 },
  { id: "onyx_necklace", mould: "necklace_mould", gem: "onyx", level: 82, xp: 120 },
  /* silver - a **silver bar**, not gold, and the mould of the piece. The
     symbols come out unstrung (string + bless, below); the sickle and the
     tiara come out finished. */
  { id: "unstrung_symbol", mould: "holy_mould", gem: null, level: 16, xp: 50, bar: "silver_bar" },
  { id: "unstrung_emblem", mould: "unholy_mould", gem: null, level: 17, xp: 50, bar: "silver_bar" },
  { id: "silver_sickle", mould: "sickle_mould", gem: null, level: 18, xp: 50, bar: "silver_bar" },
  { id: "tiara", mould: "tiara_mould", gem: null, level: 23, xp: 52.5, bar: "silver_bar" },
  /* silver bolts: one bar in, ten unfinished bolts out, at the bolt mould in
     a furnace (21 Crafting, 50 xp) - the wiki's own weaponry row. Smelted at
     the anvil before this; the anvil never touched them in the live game. */
  { id: "silver_bolts_unf", mould: "bolt_mould", gem: null, level: 21, xp: 50, bar: "silver_bar", qty: 10 },
];

/* Stringing: an unstrung amulet and a ball of wool make the amulet that can be
   worn (and enchanted). One Crafting level and four experience for every one of
   them - the level is the live game's own oddity, a level-1 action sitting
   inside a level-90 craft, which is exactly what its Recipe box prints. */
export const STRING_RECIPES = {
  gold_amulet_u: "gold_amulet",
  sapphire_amulet_u: "sapphire_amulet",
  emerald_amulet_u: "emerald_amulet",
  ruby_amulet_u: "ruby_amulet",
  diamond_amulet_u: "diamond_amulet",
  dragonstone_amulet_u: "dragonstone_amulet",
  onyx_amulet_u: "onyx_amulet",
  /* The silver symbols string the same way: an unstrung symbol becomes an
     unblessed symbol of Saradomin, an unstrung emblem an unpowered symbol of
     Zamorak - and both still need their blessing before they carry a bonus. */
  unstrung_symbol: "unblessed_symbol",
  unstrung_emblem: "unpowered_symbol",
};
export const STRING_XP = 4;

/* Pottery: soft clay shaped on a potter's wheel, then fired in a pottery
   oven. Both steps pay experience - the wiki's own table (pot 6.3 shaping +
   6.3 firing, pie dish 15 + 10, bowl 18 + 15) - read by
   src/actions.js#openPotMenu (shaping) and #firePottery (firing). The plant
   pot is left out on purpose: it only becomes anything with Farming, which
   this world has not got. */
export const POTTERY_SHAPE = [
  { id: "unfired_pot", level: 1, xp: 6.3 },
  { id: "unfired_pie_dish", level: 7, xp: 15 },
  { id: "unfired_bowl", level: 8, xp: 18 },
];
export const POTTERY_FIRE = {
  unfired_pot: { id: "pot", level: 1, xp: 6.3 },
  unfired_pie_dish: { id: "pie_dish", level: 7, xp: 10 },
  unfired_bowl: { id: "bowl", level: 8, xp: 15 },
};

/* Glassblowing: a glassblowing pipe used on molten glass. Levels and
   experience are the wiki's own, read by src/actions.js#openGlassMenu. The
   members-only glass (candle lantern, oil lamp, fishbowl) is left out, and
   the light orb stays empty - charging it wants a cave goblin wire out of
   Dorgesh-Kaan thieving, which does not exist here. */
export const GLASSBLOWING = [
  { id: "beer_glass", level: 1, xp: 17.5 },
  { id: "empty_candle_lantern", level: 4, xp: 19 },
  { id: "oil_lamp", level: 12, xp: 25 },
  { id: "vial", level: 33, xp: 35 },
  { id: "fishbowl", level: 42, xp: 42.5 },
  { id: "unpowered_orb", level: 46, xp: 52.5 },
  { id: "lantern_lens", level: 49, xp: 55 },
  { id: "empty_light_orb", level: 87, xp: 70 },
];

/* The moulds themselves. All nine the crafts need: the gold set (ring,
   necklace, amulet, bracelet), the silver set (holy, unholy, sickle, tiara)
   and the bolt mould for silver bolts. They are tools, so `kind: "mould"`
   keeps them out of every guide's item walk. Every cacheId is the item's own
   definition (ring 1592, unholy 1594, amulet 1595, necklace 1597, holy 1599,
   sickle 2976, tiara 5523, bolt 9434, bracelet 11065). */
const MOULDS = [
  { id: "ring_mould", name: "Ring mould", examine: "Used to make rings.", cacheId: 1592 },
  { id: "amulet_mould", name: "Amulet mould", examine: "Used to make amulets.", cacheId: 1595 },
  { id: "bracelet_mould", name: "Bracelet mould", examine: "Used to make bracelets.", cacheId: 11065 },
  { id: "necklace_mould", name: "Necklace mould", examine: "Used to make necklaces.", cacheId: 1597 },
  { id: "holy_mould", name: "Holy mould", examine: "Used to make holy symbols of Saradomin.", cacheId: 1599 },
  { id: "unholy_mould", name: "Unholy mould", examine: "Used to make unholy symbols.", cacheId: 1594 },
  { id: "sickle_mould", name: "Sickle mould", examine: "Used to make sickles.", cacheId: 2976 },
  { id: "tiara_mould", name: "Tiara mould", examine: "A mould for tiaras.", cacheId: 5523 },
  { id: "bolt_mould", name: "Bolt mould", examine: "A mould for creating silver crossbow bolts.", cacheId: 9434 },
];
MOULDS.forEach((m) => def(m.id, {
  name: m.name, examine: m.examine, value: 5, kind: "mould",
  colour: 0xb8b0a0, shape: "mould", cacheId: m.cacheId,
}));

/* `soft_clay` is what a bracelet of clay makes of every clay it mines (see
   src/items.js#ARMOUR_TABLE's bracelet_of_clay row and src/actions.js#mineRock).
   It is the one item the mine produces that is not an ore, which is why it is
   `kind: "misc"` and not `"ore"`: the Mining guide must not list it as a rock.
   Its own numbers are the item's (0.907 kg, value 2). */
def("soft_clay", { name: "Soft clay", examine: "Clay soft enough to mould.", value: 2,
  kind: "misc", colour: 0x9a9186, shape: "ore", cacheId: 1761 });

/* The plain gold pieces, the ones with no gem and no enchant. The ring is
   invisible when worn, like every ring in this era; the amulet and the bracelet
   are the first jewellery a player can wear that this world lets them make. */
def("gold_ring", { name: "Gold ring", examine: "A valuable ring.", value: 350, slot: "ring",
  kind: "jewellery", colour: 0xf0d858, shape: "ring", cacheId: 1635 });
def("gold_amulet_u", { name: "Gold amulet (u)", examine: "It needs a string so I can wear it.",
  value: 350, kind: "jewellery", colour: 0xf0d858, shape: "amulet", cacheId: 1673, stringTo: "gold_amulet" });
def("gold_amulet", { name: "Gold amulet", examine: "A plain gold amulet.", value: 350, slot: "amulet",
  kind: "jewellery", colour: 0xf0d858, shape: "amulet", cat: "amulet", cacheId: 1692 });

/* The unstrung gem amulets. They are not wearable and not enchantable - the
   content has a line for exactly that, which src/actions.js#castEnchant now
   says: "You need to string the Sapphire Amulet before enchanting it." Each one
   carries its **enchant level** as well as its strung form, because that is
   what tells the refusal which spell the player was reaching for (and it is the
   same field the strung rows use to say what they become).

   Every `cacheId` here is the *unstrung* definition and every strung id in
   ENCHANT_GEMS is the strung one, which matters because the two share a name
   and the unwearable one comes first in the cache. The onyx pair sits in its
   own id block (6566/6579 unstrung - 6566 is an unused placeholder, 6579 the
   real model - and 6581 strung), so nothing about the rows' neighbourhood gives
   them away; the wearable one is the one with a `maleModel`. */
const UNSTRUNG_AMULETS = [
  { id: "sapphire_amulet_u", gem: "sapphire", col: 0x4060c0, value: 900, cacheId: 1675, strung: "sapphire_amulet", level: 1 },
  { id: "emerald_amulet_u", gem: "emerald", col: 0x30a050, value: 1275, cacheId: 1677, strung: "emerald_amulet", level: 2 },
  { id: "ruby_amulet_u", gem: "ruby", col: 0xc03040, value: 2025, cacheId: 1679, strung: "ruby_amulet", level: 3 },
  { id: "diamond_amulet_u", gem: "diamond", col: 0xd8e0e8, value: 3525, cacheId: 1681, strung: "diamond_amulet", level: 4 },
  { id: "dragonstone_amulet_u", gem: "dragonstone", col: 0x8040a0, value: 17625, cacheId: 1683, strung: "dragonstone_amulet", level: 5 },
  { id: "onyx_amulet_u", gem: "onyx", col: 0x2a2a32, value: 201000, cacheId: 6579, strung: "onyx_amulet", level: 6 },
];UNSTRUNG_AMULETS.forEach((a) => {
  const name = (ITEMS[a.strung] ? ITEMS[a.strung].name : a.strung) + " (u)";
  def(a.id, {
    name, examine: "It needs a string so I can wear it.", value: a.value,
    kind: "jewellery", colour: a.col, shape: "amulet", cacheId: a.cacheId,
    stringTo: a.strung, enchant: a.level,
  });
});

/* The silver unstrung middles: a silver bar and the matching mould at a
   furnace (16 Crafting for the holy mould's symbol, 17 for the unholy
   mould's emblem, 50 xp each), strung with a ball of wool for 4 xp each
   (src/items.js#STRING_RECIPES), blessed into the wearable ends. */
def("unstrung_symbol", { name: "Unstrung symbol", examine: "It needs a string so I can wear it.",
  value: 200, kind: "jewellery", colour: 0xd8e0e8, shape: "amulet", cacheId: 1714 });
def("unstrung_emblem", { name: "Unstrung emblem", examine: "It needs a string so I can wear it.",
  value: 200, kind: "jewellery", colour: 0x8a8a92, shape: "amulet", cacheId: 1720 });

/* Pottery: soft clay shaped on a potter's wheel, fired in a pottery oven.
   Shaping and firing both pay experience (the wiki's own table: pot 6.3+6.3,
   pie dish 15+10, bowl 18+15), which is why the wheel and the oven each read
   their own table (src/items.js#POTTERY_SHAPE / #POTTERY_FIRE). */
def("unfired_pot", { name: "Unfired pot", examine: "I need to put this in a pottery oven.",
  value: 1, kind: "misc", colour: 0x9a9186, shape: "pot", cacheId: 1787 });
def("unfired_pie_dish", { name: "Unfired pie dish", examine: "I need to put this in a pottery oven.",
  value: 3, kind: "misc", colour: 0x9a9186, shape: "pot", cacheId: 1789 });
def("unfired_bowl", { name: "Unfired bowl", examine: "I need to put this in a pottery oven.",
  value: 2, kind: "misc", colour: 0x9a9186, shape: "pot", cacheId: 1791 });

/* Glassblowing: a bucket of sand and soda ash smelted at a furnace (20
   Crafting, the bucket comes back empty), then a glassblowing pipe on the
   molten glass. Levels and experience are the wiki's own (beer glass 1/17.5,
   vial 33/35, unpowered orb 46/52.5, lantern lens 49/55, empty light orb
   87/70 - src/items.js#GLASSBLOWING). Soda ash itself is seaweed cooked on a
   range or a fire, for no experience - the wiki's own "with no experience in
   any skill" - which is why the soda ash row carries `cookOf` with zero xp
   and zero burn (src/actions.js#attemptCook never burns it). */
def("molten_glass", { name: "Molten glass", examine: "Hot glass ready to be blown into useful objects.",
  value: 3, kind: "misc", colour: 0xa8d8e0, shape: "vial", cacheId: 1775 });
def("soda_ash", { name: "Soda ash", examine: "One of the ingredients for making glass.",
  value: 2, kind: "misc", colour: 0xd8d0c0, shape: "ore", stack: true, cacheId: 1781,
  cookXp: 0, burn: 0, levelReq: 1 });
def("bucket_of_sand", { name: "Bucket of sand", examine: "One of the ingredients for making glass.",
  value: 2, kind: "misc", colour: 0xe0d0a0, shape: "bucket", cacheId: 1783 });
def("glassblowing_pipe", { name: "Glassblowing pipe", examine: "Used to form molten glass into useful items.",
  value: 2, kind: "tool", colour: 0xb8b0a0, shape: "needle", cacheId: 1785 });
def("seaweed", { name: "Seaweed", examine: "Slightly damp seaweed.",
  value: 2, kind: "misc", colour: 0x4a7a4a, shape: "herb", stack: true, cacheId: 401, cookOf: "soda_ash" });
def("beer_glass", { name: "Beer glass", examine: "I need to fill this with beer.",
  value: 2, kind: "misc", colour: 0xc8d8e0, shape: "vial", weight: 0.015, cacheId: 1919 });
def("unpowered_orb", { name: "Unpowered orb", examine: "I'd prefer it if it was powered.",
  value: 100, kind: "misc", colour: 0x8090d0, shape: "vial", cacheId: 567 });
def("lantern_lens", { name: "Lantern lens", examine: "A roughly circular disc of glass.",
  value: 70, kind: "misc", colour: 0xc8d8e0, shape: "vial", cacheId: 4542 });
def("empty_light_orb", { name: "Empty light orb", examine: "Add a wire to complete it.",
  value: 250, kind: "misc", colour: 0xe8e8f0, shape: "vial", cacheId: 10980 });
/* The three glassblowing rows the menu was missing (src/items.js#GLASSBLOWING):
   wiki names, examines, values, weights and levels (candle 4/19, oil 12/25,
   fishbowl 42/42.5); the cache's own ids (4527, 4522, 6667 - the cache calls
   4527 plain "Candle lantern") with ground models baked into src/models/items.json. */
def("empty_candle_lantern", { name: "Candle lantern", examine: "Put a candle in to complete it.",
  value: 10, kind: "misc", colour: 0xc8d8e0, shape: "vial", weight: 0.907, cacheId: 4527 });
def("oil_lamp", { name: "Oil lamp", examine: "Not the genie sort.",
  value: 28, kind: "misc", colour: 0xc8d8e0, shape: "vial", weight: 0.453, cacheId: 4522 });
def("fishbowl", { name: "Fishbowl", examine: "An empty fishbowl.",
  value: 1, kind: "misc", colour: 0xc8d8e0, shape: "vial", weight: 1.360, cacheId: 6667 });

/* --------------------------------------------------------------- the rings

   The one equipment slot this world had left empty. Every ring's row is the
   item's own: the three Dagannoth rings carry the bonuses their pages publish
   (Berserker +4 crush defence and +4 strength, Warrior +4 slash attack and
   defence, Seers +6 magic attack and defence - the Seers ring's own page also
   lists a 0.2% magic-damage bonus, which src/combat.js#spellMaxHit now reads),
   and the four enchanted rings carry none at all.

   The four enchanted rings are *mechanics*, not stat sticks, so each carries
   the fields its mechanic needs:

     * `charges`  - how many times the ring's effect can fire before it
                    crumbles (40 for recoil, 140 for forging - the live game's
                    own numbers). The charge count lives on the *equipped
                    stack*, beside the id, so it survives a save.
     * `effect`   - which code reads it: combat.js#npcStrikeHit reflects 10% of
                    a hit for `recoil`, actions.js#attemptSmelt never fails an
                    iron smelt for `forging`, combat.js#killNpc rolls the rare
                    drops twice for `wealth`, and combat.js#npcStrikeHit
                    teleports a dying wearer to their respawn point for `life`.

   A ring has no wield model in the cache (the model id is -1 for every one of
   them), which is correct and not a gap: a ring is invisible when worn, in this
   era and in every era since. */
const RINGS = [
  /* --- the Dagannoth kings' own hoard -------------------------------------
     Rex's two, Prime's one and Supreme's one, exactly as many as the cache
     holds. */
  { id: "berserker_ring", name: "Berserker ring", examine: "A ring reputed to bring out a berserk fury in its wearer.", value: 10000, cacheId: 6737, b: { dcrush: 4, str: 4 } },
  { id: "warrior_ring", name: "Warrior ring", examine: "A legendary ring once worn by Fremennik warriors.", value: 10000, cacheId: 6735, b: { aslash: 4, dslash: 4 } },
  { id: "archers_ring", name: "Archers ring", examine: "A fabled ring once worn by Fremennik archers.", value: 10000, cacheId: 6733, b: { arange: 4, drange: 4 } },
  { id: "seers_ring", name: "Seers ring", examine: "A mysterious ring that can fill the wearer with magical power...", value: 10000, cacheId: 6731, b: { amagic: 6, dmagic: 6, mdmg: 0.2 } },
  /* --- the enchanted rings ------------------------------------------------- */
  { id: "ring_of_recoil", name: "Ring of recoil", examine: "An enchanted ring.", value: 900, cacheId: 2550, charges: 40, effect: "recoil" },
  { id: "ring_of_forging", name: "Ring of forging", examine: "An enchanted ring.", value: 2025, cacheId: 2568, charges: 140, effect: "forging" },
  { id: "ring_of_life", name: "Ring of life", examine: "An enchanted ring.", value: 3525, cacheId: 2570, effect: "life" },
  { id: "ring_of_wealth", name: "Ring of wealth", examine: "An enchanted ring.", value: 17625, cacheId: 2572, effect: "wealth" },
  /* --- the rings the Enchant spells work on -------------------------------
     Two of the five gem rings are missing, deliberately:

       * the **emerald ring** enchants into a Ring of dueling, whose eight
         charges are all teleports to places this world has not got (the Duel
         Arena, Castle Wars, Clan Wars, Mobilising Armies);
       * the **onyx ring** (cache 6564) enchants into a Ring of stone, which
         turns the wearer into a rock - pure novelty, and not wearable by any
         rule this world implements.

     Both are noted in src/TODO.md instead of being faked. The rest are real:
     the four below are the enchant inputs for Lvl-1, Lvl-3, Lvl-4 and Lvl-5
     Enchant, exactly as the spells' own refusal messages promise ("This spell
     can only be cast on Sapphire Amulets, Necklaces and Rings"). Their values
     are the values of the rings they become, which is where the enchanted
     rings' prices come from. */
  { id: "sapphire_ring", name: "Sapphire ring", examine: "A valuable ring.", value: 900, cacheId: 1637, enchant: 1, enchantsTo: "ring_of_recoil", b: {} },
  { id: "ruby_ring", name: "Ruby ring", examine: "A valuable ring.", value: 2025, cacheId: 1641, enchant: 3, enchantsTo: "ring_of_forging", b: {} },
  { id: "diamond_ring", name: "Diamond ring", examine: "A valuable ring.", value: 3525, cacheId: 1643, enchant: 4, enchantsTo: "ring_of_life", b: {} },
  { id: "dragonstone_ring", name: "Dragonstone ring", examine: "A valuable ring.", value: 17625, cacheId: 1645, enchant: 5, enchantsTo: "ring_of_wealth", b: {} },
];
const RING_COLOUR = {
  berserker_ring: 0x9a3a3a, warrior_ring: 0x9a9a9a, archers_ring: 0x3a9a4a, seers_ring: 0x4a5ac8,
  sapphire_ring: 0x4060c0, ruby_ring: 0xc03040, diamond_ring: 0xd8e0e8, dragonstone_ring: 0x8040a0,
};
RINGS.forEach((r) => {
  const b = B();
  if (r.b) Object.assign(b, r.b);
  def(r.id, {
    name: r.name, examine: r.examine, value: r.value, slot: "ring", cat: "ring", bonus: b,
    kind: "jewellery", colour: RING_COLOUR[r.id] || 0xd8c060, shape: "ring",
    cacheId: r.cacheId, charges: r.charges || 0, effect: r.effect || null,
    enchant: r.enchant || 0, enchantsTo: r.enchantsTo || null,
  });
});

/* The gem table, and the crafting levels that cut them. `cutLevel` is the
   published Crafting level for the *cut* (20/27/34/43/55/67) - a gate that was
   missing until unit L3, when the jewellery bench made the cutting step matter:
   without it a level-1 player could cut a diamond and make a ring the live game
   gates behind 43 Crafting. `cutXp` is likewise the published experience for
   the cut. The uncut values are the items' own; the cut values are what the
   pieces of jewellery they become are worth. */
const GEMS = [
  { id: "uncut_sapphire", name: "Uncut sapphire", col: 0x4060c0, cut: "sapphire", cutLevel: 20, cutXp: 50 },
  { id: "uncut_emerald", name: "Uncut emerald", col: 0x30a050, cut: "emerald", cutLevel: 27, cutXp: 67.5 },
  { id: "uncut_ruby", name: "Uncut ruby", col: 0xc03040, cut: "ruby", cutLevel: 34, cutXp: 85 },
  { id: "uncut_diamond", name: "Uncut diamond", col: 0xd8e0e8, cut: "diamond", cutLevel: 43, cutXp: 107.5 },
  /* The dragonstone (unit L3). It is the one gem the *bench* was waiting on: the
     dragonstone ring, the dragonstone amulet and the dragonstone bracelet are
     all real items this world already carried, and until now the gem they are
     cut from was not an item at all. Its numbers are its page's own (uncut
     1000 gp, cut 10,000, 137.5 XP at 55 Crafting), and its source is the blue
     dragon's hoard below - which used to drop the finished *amulet*, a stand-in
     that handed the player the end of a chain the start of which did not
     exist. */
  { id: "uncut_dragonstone", name: "Uncut dragonstone", col: 0x8040a0, cut: "dragonstone",
    value: 1000, cutValue: 10000, cacheId: 1631, cutCacheId: 1615,
    examine: "This would be worth more cut.", cutExamine: "This looks valuable.",
    cutLevel: 55, cutXp: 137.5 },
  /* The onyx (unit L2 of PLAN.md). Its real source is the TzHaar gem stall and
     a very rare drop; the Magic Guild's counter is the stand-in (see
     actions.js#SHOPS). Its own values are the published ones, and cutting it is
     worth far more xp than a diamond (167.5 against 107.5 - the wiki's own
     numbers), which is why those two fields are per-entry now. */
  { id: "uncut_onyx", name: "Uncut onyx", col: 0x2a2a32, cut: "onyx", value: 200000, cutValue: 200000,
    examine: "This would be worth more cut.", cutExamine: "This looks valuable.", cutXp: 167.5, cutLevel: 67 },
];
GEMS.forEach((g) => {
  def(g.id, {
    name: g.name, examine: g.examine || "An uncut gem.", value: g.value != null ? g.value : 100,
    kind: "gem", colour: g.col, shape: "gem_uncut", cut: g.cut, cutXp: g.cutXp || 50,
    cutLevel: g.cutLevel || 1, cacheId: g.cacheId,
  });
  def(g.cut, {
    name: g.name.slice(6).replace(/^./, (c) => c.toUpperCase()),
    examine: g.cutExamine || "A cut gem.", value: g.cutValue != null ? g.cutValue : 300,
    kind: "gem", colour: g.col, shape: "gem", cacheId: g.cutCacheId,
  });
});

for (const [id, cacheName] of Object.entries(CACHE_NAMES)) {
  if (ITEMS[id]) ITEMS[id].cacheName = cacheName;
}

/* The eleven equipment slots, in the client's own equipment order (interface
   387's worn-equipment ring). `ammo` is last because it is the one slot that is
   *not* part of a character's appearance: arrows and bolts sit in a slot of
   their own - the client's player definition has an `equipment[13]` ammo slot,
   and the worn-equipment panel draws its tile on the cape/amulet row - but
   nothing about them is drawn on the body. Appending it keeps every existing
   slot's index stable (the kit packet, below, and src/net.js rely on the order). */
export const EQUIP_SLOTS = ["head", "cape", "amulet", "weapon", "body", "shield", "legs", "hands", "feet", "ring", "ammo"];

/* The slots whose contents can show on the body - every slot but `ammo`, and the
   list the **kit packet** is built from (src/net.js#kitText): other players are
   told our appearance, and ammunition has none. The bake's own `WORN_SLOTS`
   (src/tools/cache-bake/held.mjs) is a different list for a different question
   (which items have a worn model to bake) - this one is about what is *sent*. */
export const KIT_SLOTS = EQUIP_SLOTS.filter((s) => s !== "ammo");

/* Which identity-kit body part each equipment slot REPLACES, in the cache's own
   part numbering (tools/cache-bake/bake.mjs#IDENTITY_KITS: 0 head, 1 jaw,
   2 torso, 3 arms, 4 hands, 5 legs, 6 feet).

   In the client a body part and the armour worn over it share one appearance
   slot, and `Player.getAnimatedModel` merges either the kit *or* the item into
   it - never both. That is not cosmetic, it is required: the armour is authored
   as a *replacement*, so parts of it sit inside where the body's own surface
   was, and drawing both leaves the body's shirt/trousers poking through the
   plates. Body, gloves, legs and boots each take over their part's slot.

   A cape, amulet, weapon, shield and ring share no slot with a kit part - they
   are purely additive, which is why a kite shield hides no body at all. The
   head slot is the exception in the other direction: a head item takes over the
   *head* part (0, hair included) and the beard (1), so it is deliberately not
   listed above - models3d.js#setWorn drops those two parts whenever anything
   with a worn model is equipped on the head. The cache authors each head item
   that way: a closed full helm carries no skin faces (nothing shows), an open
   helm or a coif or a hat carries the skin and hair faces itself. Whether a
   face is visible is therefore a property of the item, never of the character
   underneath it. */
export const EQUIP_BODY_PART = { body: 2, hands: 4, legs: 5, feet: 6 };

/* The stance behind a style button: it decides the invisible level boost and
   which skill the xp goes to. The *names* on the buttons are not these — they
   are the weapon's own action names (see COMBAT_STYLES below). */
export const STYLE_INFO = {
  accurate: { name: "Accurate", xp: { attack: 4, hitpoints: 1.33 }, atk: 3, str: 0, def: 0 },
  aggressive: { name: "Aggressive", xp: { strength: 4, hitpoints: 1.33 }, atk: 0, str: 3, def: 0 },
  controlled: { name: "Controlled", xp: { attack: 1.33, strength: 1.33, defence: 1.33, hitpoints: 1.33 }, atk: 1, str: 1, def: 1 },
  defensive: { name: "Defensive", xp: { defence: 4, hitpoints: 1.33 }, atk: 0, str: 0, def: 3 },
  rapid: { name: "Rapid", xp: { ranged: 4, hitpoints: 1.33 }, atk: 0, str: 0, def: 0, speed: -1 },
  longrange: { name: "Longrange", xp: { ranged: 2, defence: 2, hitpoints: 1.33 }, atk: 3, str: 0, def: 0, range: 2 },
  cast: { name: "Spell", xp: { magic: 4, hitpoints: 1.33 }, atk: 0, str: 0, def: 0 },
  castDefensive: { name: "Spell", xp: { magic: 2, defence: 2, hitpoints: 1.33 }, atk: 0, str: 0, def: 0 },
};

export const ATTACK_STYLES = STYLE_INFO;

/* The combat interface, per weapon category, exactly as the 2007 client has it.
   Every row is one style button in *screen order* (left column top-to-bottom,
   then right column), with the label the client draws under the button and the
   cache's own icon (sprite ids 233..296 + the two magic-cast icons 760/780).
   The label set and per-category sprite choice come from the interface data in
   cache rev. 241 (interfaces 75-93); the stances come from the same source's
   tooltips ("(Accurate) (Crush) (Attack XP)" and friends). */
const S = (name, stance, sprite) => ({ name, stance, sprite });

const SLASH_SWORD = [S("Chop", "accurate", 239), S("Slash", "aggressive", 238), S("Lunge", "controlled", 240), S("Block", "defensive", 237)];
const STAB_SWORD = [S("Stab", "accurate", 240), S("Lunge", "aggressive", 239), S("Slash", "aggressive", 238), S("Block", "defensive", 237)];
const AXE = [S("Chop", "accurate", 234), S("Hack", "aggressive", 235), S("Smash", "aggressive", 236), S("Block", "defensive", 233)];
const RANGED = [S("Accurate", "accurate", 268), S("Rapid", "rapid", 269), S("Longrange", "longrange", 270)];
const BOLT = [S("Accurate", "accurate", 258), S("Rapid", "rapid", 259), S("Longrange", "longrange", 260)];
/* A magic staff's own five buttons: it fills the right-hand column with the two
   cast options, so the screen order interleaves - Bash / offensive Spell /
   Pound / defensive Spell / Focus. The top Spell button is the accurate cast
   (the cache's blue shield 760), the bottom one the defensive cast (the brown
   book 780). Shared by the cache's staves and by the Lumbridge Guide's, which
   is one too. */
const STAFF_STYLES = [S("Bash", "accurate", 266), S("Spell", "cast", 760), S("Pound", "aggressive", 267), S("Spell", "castDefensive", 780), S("Focus", "defensive", 252)];

export const UNARMED_STYLES = [S("Punch", "accurate", 247), S("Kick", "aggressive", 248), S("Block", "defensive", 249)];

export const COMBAT_STYLES = {
  unarmed: UNARMED_STYLES,
  dagger: STAB_SWORD,
  sword: STAB_SWORD,
  scimitar: SLASH_SWORD,
  longsword: SLASH_SWORD,
  mace: [S("Pound", "accurate", 246), S("Pummel", "aggressive", 244), S("Spike", "controlled", 245), S("Block", "defensive", 243)],
  warhammer: [S("Pound", "accurate", 255), S("Pummel", "aggressive", 256), S("Block", "defensive", 253)],
  /* A ham joint is a Blunt weapon in the live game's own category table, i.e.
     exactly the warhammer's three crush buttons - the same interface, because
     there is no ham joint interface in the cache either. */
  ham_joint: [S("Pound", "accurate", 255), S("Pummel", "aggressive", 256), S("Block", "defensive", 253)],
  /* The swift blade and the lightning dagger are both Stab Sword weapons -
     Stab / Lunge / Slash / Block, the same four buttons (and the same four
     sprites) a bronze dagger and a rune sword use. The cache has no interface
     for either of them (both postdate rev 241), so each borrows the family it
     fights as. The mystic cards are **thrown** in this world (the user's change
     - see their row in src/items.js), and a thrown weapon wears the thrown
     family's own three buttons, Accurate / Rapid / Longrange, off the same
     sprites a dart and a knife use. */
  swift_blade: STAB_SWORD,
  lightning_dagger: STAB_SWORD,
  mystic_cards: RANGED,
  battleaxe: AXE,
  axe: AXE,
  "2h": [S("Chop", "accurate", 239), S("Slash", "aggressive", 238), S("Smash", "aggressive", 238), S("Block", "defensive", 237)],
  third_age_longsword: [S("Chop", "accurate", 239), S("Slash", "aggressive", 238), S("Smash", "aggressive", 238), S("Block", "defensive", 237)],
  pickaxe: [S("Spike", "accurate", 274), S("Impale", "aggressive", 276), S("Smash", "aggressive", 275), S("Block", "defensive", 273)],
  spear: [S("Lunge", "controlled", 241), S("Swipe", "controlled", 251), S("Pound", "controlled", 242), S("Block", "defensive", 250)],
  halberd: [S("Jab", "controlled", 284), S("Swipe", "aggressive", 285), S("Fend", "defensive", 283)],
  /* The Armadyl halberd is a halberd: the same three buttons off the cache's own
     halberd interface (Jab / Swipe / Fend, sprites 284/285/283). Its shape is a
     key of its own only so the wield-model bake never hunts the cache for an
     item that does not exist - see its row above. */
  armadyl_halberd: [S("Jab", "controlled", 284), S("Swipe", "aggressive", 285), S("Fend", "defensive", 283)],
  claws: [S("Chop", "accurate", 279), S("Slash", "aggressive", 278), S("Lunge", "controlled", 277), S("Block", "defensive", 280)],
  scythe: [S("Reap", "accurate", 272), S("Chop", "aggressive", 262), S("Jab", "aggressive", 271), S("Block", "defensive", 261)],
  whip: [S("Flick", "accurate", 286), S("Lash", "controlled", 287), S("Deflect", "defensive", 286)],
  /* A magic staff fills the right-hand column with the two cast options, so its
     screen order interleaves: Bash / Spell / Pound / Spell / Focus. The
     Lumbridge Guide's staff is a god staff and takes the same five buttons; its
     shape is a key of its own only so the wield-model bake never hunts the cache
     for an item that does not exist - see its row above. */
  staff: STAFF_STYLES,
  saradomins_staff: STAFF_STYLES,
  bow: RANGED,
  longbow: RANGED,
  /* The composite bows fire on the same three buttons as any other bow; only
     their speed and their model are their own. */
  comp_bow: RANGED,
  crossbow: BOLT,
  /* This world's own crossbow fights as a crossbow: the cache's own three
     crossbow buttons off the crossbow interface's sprites. */
  third_age_crossbow: BOLT,
  /* A thrown weapon uses the same three buttons as a bow - Accurate / Rapid /
     Longrange - because that is the interface the client gives the thrown
     family ("Thrown" combat styles), off the same style sprites. */
  dart: RANGED,
  knife: RANGED,
  thrownaxe: RANGED,
  javelin: RANGED,
};

export function stylesForWeapon(def) {
  const key = def && def.slot === "weapon" ? (def.shape || def.kind) || "" : "";
  return COMBAT_STYLES[key] || (def && def.slot === "weapon" ? STAB_SWORD : UNARMED_STYLES);
}

/* The weapon's category, as the combat tab names it under the auto-retaliate
   and special-attack bar ("Category: Crossbow"). Keyed exactly like the style
   table above, so the two can never disagree about what a weapon is. */
const WEAPON_CATEGORY = {
  unarmed: "Unarmed", dagger: "Dagger", sword: "Sword", scimitar: "Scimitar",
  longsword: "Longsword", mace: "Mace", warhammer: "Warhammer",
  ham_joint: "Ham joint", swift_blade: "Sword", lightning_dagger: "Dagger",
  mystic_cards: "Thrown", battleaxe: "Battleaxe", axe: "Axe",
  third_age_longsword: "Longsword", pickaxe: "Pickaxe", spear: "Spear",
  halberd: "Halberd", armadyl_halberd: "Halberd", claws: "Claw",
  scythe: "Scythe", whip: "Whip", staff: "Staff", saradomins_staff: "Staff",
  bow: "Bow", longbow: "Longbow", comp_bow: "Composite bow",
  crossbow: "Crossbow", third_age_crossbow: "Crossbow", dart: "Thrown",
  knife: "Thrown", thrownaxe: "Thrown", javelin: "Thrown",
};
export function weaponCategory(def) {
  const key = def && def.slot === "weapon" ? (def.shape || def.kind) || "" : "";
  return WEAPON_CATEGORY[key] || "Unarmed";
}

/* The button rectangles the 2007 client itself uses, read straight out of the
   cache's interface widgets (interfaces 75-93). Three- and four-style weapons
   share one grid: 70x46 buttons at x 20/104 (the fourth column drops to 103),
   y 45/98, each style's icon in a 34x24 cell at the top of its button (x offset
   20 for the left column, 18/19 for the right) and the action name in a 70x13
   strip 30px down. An autocasting staff (interface 90) squeezes three narrower
   72x36 buttons down the left column - those use the cache's own
   styleButton293 art - and puts its two "Spell" buttons in the right column.
   The trailing string on a tile row is the cache sprite the client blits there
   (its selected form is the next id up). */
const STD_LAYOUT = {
  tiles: [
    [20, 45, 70, 46, "combat653"], [104, 45, 70, 46, "combat653"],
    [20, 98, 70, 46, "combat653"], [103, 98, 70, 46, "combat653"],
  ],
  icons: [[40, 50], [122, 50], [40, 103], [122, 103]],
  labels: [[20, 75], [104, 75], [20, 128], [103, 128]],
};
const STAFF_LAYOUT = {
  tiles: [
    [20, 45, 72, 36, "styleButton293"], [104, 45, 70, 46, "combat653"],
    [20, 80, 72, 36, "styleButton293"], [103, 105, 70, 46, "combat653"],
    [20, 115, 72, 36, "styleButton293"],
  ],
  icons: [[40, 50], [105, 50], [40, 85], [124, 105], [40, 120]],
  labels: [[20, 66], [103, 74], [20, 101], [103, 134], [20, 136]],
};

export function layoutForWeapon(def) {
  /* The staff interface belongs to the item's own `kind` rather than its shape:
     a hand-authored staff's shape is a key of its own (see COMBAT_STYLES), while
     the interface is the cache's interface for the *family*, and `kind` is what
     says which family a weapon is in. */
  return def && def.kind === "staff" ? STAFF_LAYOUT : STD_LAYOUT;
}

/* Attack animation: one sequence per combat mode, in the *screen order* of the
   style buttons (see COMBAT_STYLES above, which uses the same per-category
   order). The animation ids are not in the cache - in the real game the server
   sends the sequence id with every attack - so these are transcribed from the
   #317 server's own fight-type table, asteria-3.0's `FightType.java` (keyed per
   weapon interface, i.e. per shape) with the per-weapon special cases from
   `WeaponInterface.java`/`Asteria_Melee.groovy` and Project Insanity's
   `getWepAnim`. Every id was then confirmed to exist in rev. 241 and to sit on
   the human skeleton; the sequence ids behind these names are in
   src/tools/cache-bake/bake.mjs (ATTACK_ANIMS), and src/README.md has the
   per-shape table with the raw id numbers.

   Two consequences worth knowing:

     * a weapon whose shape is right but whose *own* animation differs (the
       Barrows weapons, the granite maul, the dragon dagger) carries an `anims`
       override in its row's `extra` object, which wins over this table; and
     * adding a new weapon means checking that its shape (or its override) really
       plays the right motion - see "Attack animations" in src/README.md and the
       standing test note in src/TODO.md. Do not add an item and assume the
       shape table covers it. */
export const ANIM_MODES = {
  dagger: ["attack_dagger", "attack_dagger", "attack_slash", "attack_dagger"],
  sword: ["attack_stab", "attack_stab", "attack_slash", "attack_stab"],
  scimitar: ["attack_slash", "attack_slash", "attack_stab", "attack_slash"],
  longsword: ["attack_slash", "attack_slash", "attack_stab", "attack_slash"],
  mace: ["attack_chop", "attack_crush", "attack_stab", "attack_crush"],
  battleaxe: ["attack_chop", "attack_chop", "attack_crush", "attack_chop"],
  axe: ["attack_chop", "attack_chop", "attack_crush", "attack_chop"],
  warhammer: ["attack_crush", "attack_crush", "attack_crush"],
  /* The cache has no ham joint sequence (the item postdates rev 241), so the
     joint swings the one-handed blunt crush the cache's own models use; the
     live game's ham joint is a Crush weapon on the same Blunt interface. */
  ham_joint: ["attack_crush", "attack_crush", "attack_crush"],
  /* The other three cache-predates weapons likewise borrow the cache's own
     sequences for the family they fight as, since rev 241 has no sequence for
     any of them: the swift blade and the lightning dagger stab and slash like a
     sword and a dagger (both Stab Sword), and the mystic cards are **thrown** -
     the cache's own `attack_throw` (385), the overarm throw every dart, knife
     and throwing axe in this world already shares. That is the correct motion
     for a card, and it is the only throw the cache has: a weapon held in the
     hand is cocked back over the shoulder and whipped forward, which is what
     the item's own examine describes. The *models* are hand-authored
     (src/tools/hand-models/), but the body's motion is the cache's own - which
     is what makes a new weapon ride the player's skeleton correctly with no new
     animation data at all. */
  swift_blade: ["attack_stab", "attack_stab", "attack_slash", "attack_stab"],
  lightning_dagger: ["attack_dagger", "attack_dagger", "attack_slash", "attack_dagger"],
  mystic_cards: ["attack_throw", "attack_throw", "attack_throw"],
  "2h": ["attack_2h", "attack_2h", "attack_staff", "attack_2h"],
  third_age_longsword: ["attack_slash", "attack_slash", "attack_crush", "attack_slash"],
  pickaxe: ["attack_stab", "attack_stab", "attack_crush", "attack_stab"],
  spear: ["attack_spear_lunge", "attack_spear_swipe", "attack_spear_pound", "attack_spear_lunge"],
  halberd: ["attack_stab", "attack_halberd", "attack_stab"],
  /* the Armadyl halberd swings the halberd's own sequences - the cache's
     `attack_halberd` (440) on the Swipe button, a stab on the other two, which
     is exactly the row above. Only its shape key is its own. */
  armadyl_halberd: ["attack_stab", "attack_halberd", "attack_stab"],
  claws: ["attack_slash", "attack_slash", "attack_stab", "attack_slash"],
  scythe: ["attack_scythe", "attack_slash", "attack_stab", "attack_scythe"],
  whip: ["attack_whip", "attack_whip", "attack_whip"],
  bow: ["attack_bow", "attack_bow", "attack_bow"],
  longbow: ["attack_bow", "attack_bow", "attack_bow"],
  comp_bow: ["attack_bow", "attack_bow", "attack_bow"],
  crossbow: ["attack_crossbow", "attack_crossbow", "attack_crossbow"],
  /* This world's own crossbow looses like a crossbow: the cache's own
     `attack_crossbow`, the same motion every other crossbow uses. */
  third_age_crossbow: ["attack_crossbow", "attack_crossbow", "attack_crossbow"],
  /* The thrown families. A thrown weapon is not drawn and loosed like a bow: it
     is cocked back over the shoulder and whipped forward, which in this revision
     is the cache's own `human_throw` (sequence 385, the generic overarm throw
     the darts, the knives and the throwing axes all share) and, for the one that
     is a spear, `human_spear_throw` (432). Both are priority-6 strike sequences
     on the human skeleton, like every other attack in this table. */
  dart: ["attack_throw", "attack_throw", "attack_throw"],
  knife: ["attack_throw", "attack_throw", "attack_throw"],
  thrownaxe: ["attack_throw", "attack_throw", "attack_throw"],
  javelin: ["attack_spear_throw", "attack_spear_throw", "attack_spear_throw"],
  staff: ["attack_staff", "attack_staff", "attack_staff", "attack_staff", "attack_staff"],
  /* the Lumbridge Guide's staff bashes and casts off those same five staff
     sequences - only its shape key is its own */
  saradomins_staff: ["attack_staff", "attack_staff", "attack_staff", "attack_staff", "attack_staff"],
};
const UNARMED_ANIMS = ["attack_punch", "attack_kick", "attack_punch"];

export function attackAnimFor(weapon, styleIndex = 0) {
  const set = (weapon && weapon.anims) ||
    ANIM_MODES[(weapon && (weapon.shape || weapon.kind)) || ""] || UNARMED_ANIMS;
  const i = Math.min(Math.max(styleIndex | 0, 0), set.length - 1);
  return set[i];
}

/* ---------------------------------------------------- the swing book, on the wire

   Another player's swing is shown to the players around them by *name* - the
   sequence is what the model needs and neither client can guess the other's
   weapon from a tile - but this world puts numbers on the wire and a name is a
   string (see src/net.js#netCombat, whose packet is five bytes). So the two
   clients agree on a table instead of sending text.

   The table is *derived*, never written out by hand: every sequence
   `attackAnimFor` can return - the whole of `ANIM_MODES`, every weapon that
   carries an `anims` override, and the bare-handed set - collected into one set
   and sorted. Both clients run the same build, so both build exactly the same
   list from exactly the same sources, and an index means the same thing on each
   side. Adding a weapon with a new sequence therefore needs no change here: the
   name simply joins the table the next time this is read. The sort is plain
   lexicographic (Array#sort's default), which is the same on every engine - the
   determinism is the whole point, not the order.

   A build mismatch would shift every index; that is acceptable because a
   mismatch means two different versions of the game, which cannot see the same
   creatures either. `combatAnimIndex` falls back to the big slash rather than
   0 for a name the table has never heard of, so a stray one still draws a swing
   on the right body. */
let _combatAnims = null;
export function combatAnims() {
  if (!_combatAnims) {
    const set = new Set(UNARMED_ANIMS);
    for (const arr of Object.values(ANIM_MODES)) for (const n of arr) set.add(n);
    for (const d of Object.values(ITEMS)) if (d && d.anims) for (const n of d.anims) set.add(n);
    _combatAnims = [...set].sort();
  }
  return _combatAnims;
}
export function combatAnimIndex(name) {
  const a = combatAnims();
  const i = a.indexOf(name);
  return i < 0 ? Math.max(0, a.indexOf("attack_slash")) : i;
}
export function combatAnimAt(i) {
  return combatAnims()[i] || null;
}

/* Which block pose a weapon's shape raises when its owner takes a hit. This
   lives with the swing table rather than in src/combat.js because a ghost
   blocks with it too: the blow a neighbour takes arrives as a kind-2 fight
   packet, and src/game.js#ghostCombat raises exactly what this names - the
   same pose the victim's own client raised (src/combat.js#maybeBlockPlayer),
   so two screens never disagree about whether a block happened. */
export const BLOCK_BY_SHAPE = {
  dagger: "block_ddagger", lightning_dagger: "block_ddagger",
  sword: "block_sword", swift_blade: "block_sword", scimitar: "block_sword",
  longsword: "block_sword", claws: "block_sword",
  axe: "block_axe", battleaxe: "block_axe", pickaxe: "block_axe", third_age_axe: "block_axe",
  mace: "block_blunt", warhammer: "block_blunt", ham_joint: "block_blunt", third_age_pickaxe: "block_blunt",
  "2h": "block_dhsword", third_age_longsword: "block_dhsword",
  staff: "block_staff", saradomins_staff: "block_staff",
  spear: "block_spear", halberd: "block_spear", armadyl_halberd: "block_spear", leaf_bladed_spear: "block_spear",
  scythe: "block_scythe",
};

export function blockAnimFor(weapon) {
  const shape = weapon && (weapon.shape || weapon.kind);
  return BLOCK_BY_SHAPE[shape] || "defend";
}

export function styleAttackBonus(style) {
  const s = STYLE_INFO[style] || STYLE_INFO.accurate;
  return { atk: s.atk || 0, str: s.str || 0, def: s.def || 0 };
}

export function itemDef(id) {
  return ITEMS[id] || null;
}

export function itemName(id) {
  const d = ITEMS[id];
  return d ? d.name : id;
}

export function isStackable(id) {
  const d = ITEMS[id];
  return d ? d.stack : false;
}

/* Whether a slot prints the stack's count over the icon. A stackable item
   always does, even a lone one - the "1" on a single bolt is what says "this
   stacks", and it is what the real client draws - while anything else prints
   only once there is more than one of it. */
export function showsCount(id, qty) {
  return isStackable(id) ? qty > 0 : qty > 1;
}

export function itemValue(id) {
  const d = ITEMS[id];
  return d ? d.value : 1;
}

/* Real item weights, in kg, from the 2007 game (baked from the OSRS wiki into
   src/data/item-weights.json - the 2007 cache's ItemDefinition has no weight
   field, so this is the only source). Loaded once at boot by src/main.js;
   anything unknown weighs nothing, exactly like an item with no weight.

   A row may carry its own `weight` instead (the herblore tables do: the wiki
   states the weight right beside the value there, and a generator row that
   already knows its numbers should not need a second file edited in step with
   it). The inline weight wins when both exist. */
let WEIGHTS = {};

export function setItemWeights(map) {
  WEIGHTS = map && typeof map === "object" ? map : {};
}

export function itemWeight(id) {
  const d = ITEMS[id];
  if (d && typeof d.weight === "number") return d.weight;
  const w = WEIGHTS[id];
  return typeof w === "number" && w > 0 ? w : 0;
}

export function emptyBonus() {
  return B();
}

export const NPC_DROPS = {
  man: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.4, qty: [1, 12] }],
  woman: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.35, qty: [1, 8] }],
  guard: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 1, qty: [5, 30] }, { id: "iron_dagger", chance: 0.15, qty: [1, 1] }],
  goblin: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [1, 25] }, { id: "air_rune", chance: 0.2, qty: [1, 4] }, { id: "bronze_sword", chance: 0.05, qty: [1, 1] }],
  gas_goblin: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [1, 25] }, { id: "air_rune", chance: 0.2, qty: [1, 4] }, { id: "bronze_sword", chance: 0.05, qty: [1, 1] }],
  cow: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "cowhide", chance: 1, qty: [1, 1] }, { id: "raw_beef", chance: 1, qty: [1, 1] }],
  chicken: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "feather", chance: 0.8, qty: [5, 15] }, { id: "raw_chicken", chance: 1, qty: [1, 1] }],
  rat: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "raw_rat", chance: 1, qty: [1, 1] }],
  /* Cow calf: same animal, same table. */
  cow_calf: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "cowhide", chance: 1, qty: [1, 1] }, { id: "raw_beef", chance: 1, qty: [1, 1] }],
  giant_rat: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "raw_rat", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.3, qty: [1, 8] }],
  farmer: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 12] }, { id: "bronze_arrow", chance: 0.1, qty: [1, 3] }],
  monk: [{ id: "bones", chance: 1, qty: [1, 1] }],
  /* The two townsmen with no loot of their own (unit C1: both fell back to a
     bare "bones" anyway, so the row is only a statement - they leave bones like
     a monk and nothing else). */
  banker: [{ id: "bones", chance: 1, qty: [1, 1] }],
  shopkeeper: [{ id: "bones", chance: 1, qty: [1, 1] }],
  /* The undead drop bones and junk; the dark wizard is the world's own source
     of runes - his real drop table, which is where a mage's stock came from. */
  zombie: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 25] },
           { id: "air_rune", chance: 0.15, qty: [1, 6] }, { id: "chaos_rune", chance: 0.06, qty: [1, 1] },
           { id: "bronze_sword", chance: 0.03, qty: [1, 1] }],
  skeleton: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 22] },
             { id: "bronze_arrow", chance: 0.2, qty: [1, 6] }, { id: "iron_dagger", chance: 0.08, qty: [1, 1] },
             { id: "chaos_rune", chance: 0.05, qty: [1, 2] }],
  /* Scully drops what the skeleton he otherwise is drops. */
  scully: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 22] },
           { id: "bronze_arrow", chance: 0.2, qty: [1, 6] }, { id: "iron_dagger", chance: 0.08, qty: [1, 1] },
           { id: "chaos_rune", chance: 0.05, qty: [1, 2] }],
  ghost: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.4, qty: [1, 15] },
          { id: "air_rune", chance: 0.12, qty: [1, 4] }],
  /* Spiders drop nothing at all - the live game's own table. */
  giant_spider: [],
  imp: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 15] },
        { id: "fire_rune", chance: 0.2, qty: [1, 4] }],
  /* River trolls drop bones and the raw fish they were guarding, at the wiki's
     own rarities (swordfish 19/128 down to tuna 1/128). One table for all
     three walking tiers, like the live game's single drop table. */
  river_troll_79: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  river_troll_120: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  river_troll_159: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  /* The alpha guards the same fish, but greedier: double shark, like the
     live game's single drop table with the alpha's appetite. */
  river_troll_199: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 2] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  /* Ocean trolls guard the same fish (same table, own rows so the audit that
     keys drops by type stays green). */
  ocean_troll_79: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  ocean_troll_120: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  ocean_troll_159: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 1] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  ocean_troll_199: [{ id: "bones", chance: 1, qty: [1, 1] },
        { id: "raw_swordfish", chance: 0.15, qty: [1, 1] }, { id: "raw_shark", chance: 0.09, qty: [1, 2] },
        { id: "raw_pike", chance: 0.05, qty: [1, 1] }, { id: "raw_salmon", chance: 0.03, qty: [1, 1] },
        { id: "raw_sardine", chance: 0.03, qty: [1, 1] }, { id: "raw_herring", chance: 0.02, qty: [1, 1] },
        { id: "raw_tuna", chance: 0.01, qty: [1, 1] }],
  unicorn: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "big_bones", chance: 0.05, qty: [1, 1] },
            /* Herblore's old source: a unicorn always drops its horn (and the
               horn is what a pestle and mortar turns into unicorn horn dust,
               the secondary of both antidotes). */
            { id: "unicorn_horn", chance: 1, qty: [1, 1] },
            { id: "coins", chance: 0.3, qty: [1, 10] }],
  dark_wizard: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 30] },
                { id: "air_rune", chance: 0.3, qty: [1, 12] }, { id: "water_rune", chance: 0.3, qty: [1, 12] },
                { id: "earth_rune", chance: 0.3, qty: [1, 12] }, { id: "fire_rune", chance: 0.3, qty: [1, 12] },
                { id: "mind_rune", chance: 0.2, qty: [1, 14] }, { id: "chaos_rune", chance: 0.15, qty: [1, 6] },
                { id: "nature_rune", chance: 0.06, qty: [1, 4] }, { id: "law_rune", chance: 0.04, qty: [1, 2] },
                { id: "blood_rune", chance: 0.03, qty: [1, 2] }],
  dark_wizard_young: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 15] },
                { id: "air_rune", chance: 0.3, qty: [1, 6] }, { id: "earth_rune", chance: 0.3, qty: [1, 6] },
                { id: "mind_rune", chance: 0.2, qty: [1, 7] }, { id: "chaos_rune", chance: 0.1, qty: [1, 3] }],

  /* --- the wider population -------------------------------------------------
     Same shape as the table above, aimed at what the live NPCs actually drop:
     the humanoids leave bones and whatever coins they were carrying, the
     skeleton mage keeps a wizard's rune pouch, the birds leave feathers, and
     the sheep leave wool and mutton. */
  barbarian: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 20] },
              { id: "bronze_axe", chance: 0.05, qty: [1, 1] }],
  wizard: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 25] },
           { id: "air_rune", chance: 0.3, qty: [1, 8] }, { id: "mind_rune", chance: 0.2, qty: [1, 6] },
           { id: "water_rune", chance: 0.15, qty: [1, 6] }, { id: "chaos_rune", chance: 0.06, qty: [1, 2] }],
  druid: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.4, qty: [1, 20] },
          { id: "earth_rune", chance: 0.3, qty: [1, 10] }, { id: "law_rune", chance: 0.08, qty: [1, 2] },
          { id: "nature_rune", chance: 0.08, qty: [1, 2] },
          /* Herblore: druids carry grimy herbs, the lower half of the table -
             the second source (after the chaos druids below) the live game's
             herb-hunting players use. */
          { id: "grimy_guam_leaf", chance: 0.06, qty: [1, 1] }, { id: "grimy_marrentill", chance: 0.05, qty: [1, 1] },
          { id: "grimy_tarromin", chance: 0.05, qty: [1, 1] }, { id: "grimy_harralander", chance: 0.04, qty: [1, 1] },
          { id: "grimy_ranarr_weed", chance: 0.02, qty: [1, 1] }, { id: "grimy_irit_leaf", chance: 0.01, qty: [1, 1] }],
  warrior_woman: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 18] },
                  { id: "iron_scimitar", chance: 0.04, qty: [1, 1] }],
  knight_of_ardougne: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.8, qty: [1, 40] },
                       { id: "steel_longsword", chance: 0.05, qty: [1, 1] }],
  priest: [],
  soldier: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 25] },
            { id: "iron_sword", chance: 0.06, qty: [1, 1] }],
  mugger: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [1, 15] },
           { id: "bronze_dagger", chance: 0.08, qty: [1, 1] }],
  black_knight: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.8, qty: [1, 45] },
                 { id: "black_sword", chance: 0.06, qty: [1, 1] }, { id: "steel_kiteshield", chance: 0.04, qty: [1, 1] }],
  highwayman: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 12] },
               { id: "black_dagger", chance: 0.05, qty: [1, 1] }],
  rogue: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [1, 22] },
          { id: "iron_dagger", chance: 0.08, qty: [1, 1] }],
  monk_of_zamorak: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 25] },
                    { id: "air_rune", chance: 0.2, qty: [1, 6] }, { id: "chaos_rune", chance: 0.06, qty: [1, 2] }],
  unicorn_foal: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "big_bones", chance: 0.03, qty: [1, 1] }],
  skeleton_mage: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 22] },
                  { id: "air_rune", chance: 0.25, qty: [1, 8] }, { id: "law_rune", chance: 0.06, qty: [1, 2] },
                  { id: "chaos_rune", chance: 0.06, qty: [1, 2] }],
  duck: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "raw_duck", chance: 1, qty: [1, 1] },
         { id: "feather", chance: 0.8, qty: [5, 15] }],
  duckling: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "feather", chance: 0.7, qty: [1, 5] }],
  seagull: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "feather", chance: 0.9, qty: [5, 20] }],
  sheep: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "wool", chance: 1, qty: [1, 1] },
          { id: "raw_mutton", chance: 1, qty: [1, 1] }],
  ram: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "raw_mutton", chance: 1, qty: [1, 1] }],
  guard_dog: [{ id: "bones", chance: 1, qty: [1, 1] }],
  wolf: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.25, qty: [1, 8] },
         { id: "big_bones", chance: 0.03, qty: [1, 1] }],
  dwarf: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 30] },
          { id: "iron_pickaxe", chance: 0.08, qty: [1, 1] }],
  hobgoblin: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 30] },
              /* Herblore: the limpwurt root that the two strength potions need
                 is a hobgoblin's own drop, exactly as it is in the live game. */
              { id: "limpwurt_root", chance: 0.12, qty: [1, 1] },
              { id: "iron_sword", chance: 0.05, qty: [1, 1] }, { id: "iron_dagger", chance: 0.06, qty: [1, 1] }],
  bear_cub: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "big_bones", chance: 0.2, qty: [1, 1] }],

  /* --- the wider bestiary (src/PLAN.md unit E) ------------------------------
     Aimed at the live tables: the giants leave big bones and whatever coin the
     victim was carrying, the demons keep a rune pouch, the mine's vermin are
     mostly bones, and the blue dragon's hoard is the one place an uncut
     dragonstone turns up outside a shop. */
  black_bear: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.3, qty: [1, 20] },
               { id: "raw_beef", chance: 0.5, qty: [1, 1] }],
  hill_giant: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.9, qty: [5, 300] },
               { id: "iron_dagger", chance: 0.08, qty: [1, 1] }, { id: "steel_kiteshield", chance: 0.02, qty: [1, 1] },
               { id: "nature_rune", chance: 0.04, qty: [1, 2] }],
  moss_giant: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.8, qty: [5, 300] },
               { id: "steel_sqshield", chance: 0.03, qty: [1, 1] }, { id: "steel_spear", chance: 0.03, qty: [1, 1] },
               { id: "nature_rune", chance: 0.05, qty: [1, 2] }],
  fire_giant: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 1, qty: [10, 400] },
               { id: "fire_rune", chance: 0.3, qty: [1, 20] }, { id: "chaos_rune", chance: 0.12, qty: [1, 4] },
               { id: "rune_dagger", chance: 0.01, qty: [1, 1] }],
  ice_giant: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.8, qty: [5, 300] },
              { id: "water_rune", chance: 0.3, qty: [1, 12] }, { id: "iron_2h", chance: 0.03, qty: [1, 1] }],
  lesser_demon: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.8, qty: [5, 250] },
                 { id: "air_rune", chance: 0.3, qty: [1, 10] }, { id: "fire_rune", chance: 0.3, qty: [1, 10] },
                 { id: "chaos_rune", chance: 0.12, qty: [1, 3] }, { id: "steel_scimitar", chance: 0.03, qty: [1, 1] }],
  greater_demon: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 1, qty: [10, 400] },
                  { id: "fire_rune", chance: 0.3, qty: [1, 20] }, { id: "death_rune", chance: 0.1, qty: [1, 5] },
                  { id: "steel_battleaxe", chance: 0.03, qty: [1, 1] }, { id: "rune_mace", chance: 0.01, qty: [1, 1] }],
  scorpion: [{ id: "bones", chance: 1, qty: [1, 1] }],
  deadly_red_spider: [{ id: "bones", chance: 1, qty: [1, 1] }],
  giant_bat: [{ id: "bones", chance: 1, qty: [1, 1] }],
  crawling_hand: [{ id: "bones", chance: 1, qty: [1, 1] }],
  banshee: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.4, qty: [1, 25] },
            { id: "air_rune", chance: 0.15, qty: [1, 6] }],
  blue_dragon: [{ id: "dragon_bones", chance: 1, qty: [1, 1] },
                { id: "blue_dragonhide", chance: 1, qty: [1, 1] },
                { id: "coins", chance: 0.9, qty: [10, 500] },
                /* The hoard's rare gem (unit L3): an **uncut dragonstone**,
                   which is what the dragonstone ring, amulet and bracelet are
                   cut from. It used to be a finished dragonstone *amulet*, which
                   handed the player the far end of a chain whose first link did
                   not exist - the same stand-in the shop counters carry, exposed
                   by the bench. The 2% is this world's own number (the live
                   game's blue dragon has no gem on its table at all), so the
                   hoard is worth raiding without being a farm. */
                { id: "uncut_dragonstone", chance: 0.02, qty: [1, 1] },
                { id: "rune_dagger", chance: 0.03, qty: [1, 1] }],
  /* The chromatic dragons and the snake (src/PLAN.md unit P). The three smaller
     dragons' published 100% drops are dragon bones and their own hide - which is
     what finally gives the green/red/black dragonhide in items.js#CRAFT_RECIPES
     a source - and their commons are the coin pile and the metal they were
     killed for in the live game (steel and mithril for a green, rune for a
     black). The snake's own table is bones only; the `snakeskin` on it is this
     world's deliberate fudge (recorded in src/PLAN.md unit P), because unit O
     gave the needle-and-thread recipes a snakehide material with no creature
     that leaves one. */
  green_dragon: [{ id: "dragon_bones", chance: 1, qty: [1, 1] },
                 { id: "green_dragonhide", chance: 1, qty: [1, 1] },
                 { id: "coins", chance: 0.9, qty: [2, 250] },
                 { id: "steel_platelegs", chance: 0.04, qty: [1, 1] },
                 { id: "mithril_spear", chance: 0.03, qty: [1, 1] },
                 { id: "rune_dagger", chance: 0.01, qty: [1, 1] }],
  red_dragon: [{ id: "dragon_bones", chance: 1, qty: [1, 1] },
               { id: "red_dragonhide", chance: 1, qty: [1, 1] },
               { id: "coins", chance: 0.9, qty: [10, 400] },
               { id: "adamant_dagger", chance: 0.05, qty: [1, 1] },
               { id: "rune_axe", chance: 0.02, qty: [1, 1] },
               { id: "rune_dagger", chance: 0.02, qty: [1, 1] }],
  black_dragon: [{ id: "dragon_bones", chance: 1, qty: [1, 1] },
                 { id: "black_dragonhide", chance: 1, qty: [1, 1] },
                 { id: "coins", chance: 1, qty: [10, 500] },
                 { id: "rune_longsword", chance: 0.02, qty: [1, 1] },
                 { id: "rune_battleaxe", chance: 0.02, qty: [1, 1] },
                 { id: "rune_mace", chance: 0.02, qty: [1, 1] },
                 { id: "adamant_platebody", chance: 0.03, qty: [1, 1] },
                 { id: "dragonstone_amulet", chance: 0.02, qty: [1, 1] }],
  snake: [{ id: "bones", chance: 1, qty: [1, 1] },
          { id: "snake_hide", chance: 0.5, qty: [1, 1] }],
  earth_warrior: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [5, 60] },
                  { id: "earth_rune", chance: 0.3, qty: [1, 10] }, { id: "steel_spear", chance: 0.03, qty: [1, 1] }],
  chaos_druid: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.5, qty: [1, 30] },
                { id: "air_rune", chance: 0.3, qty: [1, 6] }, { id: "body_rune", chance: 0.3, qty: [1, 6] },
                /* The live game's herb-pickers' first stop: a chaos druid drops
                   grimy herbs more often than anything else it carries, which
                   is why the grove is worth farming at Herblore 1. */
                { id: "grimy_guam_leaf", chance: 0.10, qty: [1, 1] }, { id: "grimy_marrentill", chance: 0.10, qty: [1, 1] },
                { id: "grimy_tarromin", chance: 0.10, qty: [1, 1] }, { id: "grimy_harralander", chance: 0.10, qty: [1, 1] },
                { id: "grimy_ranarr_weed", chance: 0.06, qty: [1, 1] }, { id: "grimy_irit_leaf", chance: 0.04, qty: [1, 1] },
                { id: "grimy_avantoe", chance: 0.03, qty: [1, 1] }, { id: "grimy_kwuarm", chance: 0.02, qty: [1, 1] },
                { id: "grimy_cadantine", chance: 0.015, qty: [1, 1] }, { id: "grimy_lantadyme", chance: 0.01, qty: [1, 1] },
                { id: "earth_rune", chance: 0.3, qty: [1, 6] }],

  /* --- the wilderness band (unit C2, the creature families) -----------------
     The era's Wilderness population, and what each of them was worth killing
     for. The humans leave bones and their coin; the two warriors' kept weapons
     are the black dagger and black sword the live dark warriors drop; the
     bandits are poorer and carry bronze; the chaos dwarf keeps the mine's own
     iron pickaxe and a little of its coal and chaos runes (the row deliberately
     follows the ordinary dwarf's table rather than the published chaos-dwarf
     herblore table, which belongs to the 2005 battlefield this map does not
     have); the black unicorn is the unicorn's own table with its horn - the
     antidotes' secondary - on a much rarer 5% roll, because the black ones are
     the ones that fight back; the grizzly bear carries the black bear's row
     with big bones; and the black demon's hoard is the greater demon's with the
     pile and the rune pouch raised, which is the whole point of a level-172
     creature standing at the end of the demon line. */
  dark_warrior: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.6, qty: [1, 30] },
                 { id: "black_dagger", chance: 0.05, qty: [1, 1] }, { id: "black_sword", chance: 0.03, qty: [1, 1] }],
  bandit: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [1, 25] },
           { id: "bronze_dagger", chance: 0.08, qty: [1, 1] }, { id: "iron_dagger", chance: 0.04, qty: [1, 1] }],
  chaos_dwarf: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.7, qty: [5, 40] },
                { id: "iron_pickaxe", chance: 0.08, qty: [1, 1] }, { id: "coal", chance: 0.2, qty: [1, 2] },
                { id: "chaos_rune", chance: 0.08, qty: [1, 2] }],
  black_unicorn: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 0.3, qty: [1, 10] },
                  { id: "unicorn_horn", chance: 0.05, qty: [1, 1] }],
  grizzly_bear: [{ id: "big_bones", chance: 1, qty: [1, 1] }, { id: "raw_beef", chance: 0.5, qty: [1, 1] },
                 { id: "coins", chance: 0.3, qty: [1, 20] }],
  black_demon: [{ id: "bones", chance: 1, qty: [1, 1] }, { id: "coins", chance: 1, qty: [20, 600] },
                { id: "fire_rune", chance: 0.3, qty: [1, 25] }, { id: "death_rune", chance: 0.15, qty: [1, 8] },
                { id: "chaos_rune", chance: 0.2, qty: [1, 6] },
                { id: "rune_dagger", chance: 0.02, qty: [1, 1] }, { id: "steel_battleaxe", chance: 0.03, qty: [1, 1] }],

  /* --- the god in the northern woods (2026-09-24) --------------------------
     Not a creature's table but a small treasure: what a player who actually
     kills a level-250 god should walk away with. His own staff is the 100%
     drop - it is the one item the world has named for him, and it is what a
     player who watched him smite half a demon camp came for - and a set of big
     bones is the honest remains of a *body* that size on this world's own bone
     ladder (the giants and demons leave them). Everything else is a god's own
     coin. */
  saradomin: [{ id: "saradomin_staff", chance: 1, qty: [1, 1] },
              { id: "big_bones", chance: 1, qty: [1, 1] },
              { id: "coins", chance: 0.6, qty: [100, 500] }],

  /* --- the bosses (src/PLAN.md unit I) --------------------------------------
     The three Dagannoth Kings are this world's only source of the Fremennik
     rings, and each one carries the ring its own page names: Rex the Berserker
     *and* the Warrior ring, Prime the Seers ring, Supreme the Archers ring.
     The rings are 1 in
     125, the wiki's own rate, and that number matters beyond flavour: it is
     under the 5% ceiling the Ring of wealth's second roll covers, so a
     ring-bearer gets a second chance at exactly the drop the ring was made for
     (see src/combat.js#rollDrops). The bones, coins and rune gear around them
     are the published common drops.

     The King Black Dragon's published table is the reason a dragon med helm
     and a dragon sq shield can now be *found* rather than only bought: it
     drops the finished shield here because this world has no shield left half
     (the real game's `dragon sq shield left half` is its own item, id 2366,
     which this item table does not carry - so rather than half a shield that
     cannot be smithed, the boss drops the whole thing, noted in src/TODO.md). */
  dagannoth_supreme: [{ id: "big_bones", chance: 1, qty: [1, 1] },
                      { id: "coins", chance: 0.9, qty: [100, 1500] },
                      { id: "rune_scimitar", chance: 0.05, qty: [1, 1] },
                      { id: "rune_platebody", chance: 0.03, qty: [1, 1] },
                      { id: "rune_kiteshield", chance: 0.03, qty: [1, 1] },
                      { id: "nature_rune", chance: 0.15, qty: [10, 30] },
                      { id: "death_rune", chance: 0.12, qty: [10, 25] },
                      { id: "archers_ring", chance: 0.008, qty: [1, 1] }],
  dagannoth_prime: [{ id: "big_bones", chance: 1, qty: [1, 1] },
                    { id: "coins", chance: 0.9, qty: [100, 1500] },
                    { id: "rune_dagger", chance: 0.05, qty: [1, 1] },
                    { id: "rune_axe", chance: 0.04, qty: [1, 1] },
                    { id: "rune_kiteshield", chance: 0.03, qty: [1, 1] },
                    { id: "nature_rune", chance: 0.15, qty: [10, 30] },
                    { id: "law_rune", chance: 0.12, qty: [10, 25] },
                    { id: "seers_ring", chance: 0.008, qty: [1, 1] }],
  dagannoth_rex: [{ id: "big_bones", chance: 1, qty: [1, 1] },
                  { id: "coins", chance: 0.9, qty: [100, 1500] },
                  { id: "rune_mace", chance: 0.05, qty: [1, 1] },
                  { id: "rune_platebody", chance: 0.03, qty: [1, 1] },
                  { id: "rune_kiteshield", chance: 0.03, qty: [1, 1] },
                  { id: "nature_rune", chance: 0.15, qty: [10, 30] },
                  { id: "death_rune", chance: 0.12, qty: [10, 25] },
                  { id: "berserker_ring", chance: 0.008, qty: [1, 1] },
                  { id: "warrior_ring", chance: 0.008, qty: [1, 1] }],

  /* -------------------------------------------------- the Barrows brothers
     (src/PLAN.md unit T). In the live game a brother drops nothing himself -
     the loot comes out of the chest, at a rate that depends on the *reward
     potential* you built up and the number of brothers you killed. This world
     has no chest and no potential bar, so each brother carries his own four
     pieces instead, and the number is chosen with the live game's chest in
     mind but not slavishly: 1 in 32 for a piece means one piece every eight
     kills, a *specific* piece in about 32, and a full four-piece set in about
     128. The chest's own published rate is about 1/350 for one specific piece
     (~1/14.5 for any piece at all), so this is roughly ten times kinder - which
     is the right call, because the brothers ARE the loot here: there is no
     chest to loot, no reward-potential bar to fill, and no second source.

     The rest of each table is the chest's own common loot, per brother: runes
     for the five who are not Karil, bolt racks for the one who is, coins
     always, and bones (they are vengeful spirits, and every other undead thing
     in this world leaves bones). `ring_of_wealth` gets its second roll on the
     four pieces, exactly as it does on every other rare row - see
     src/combat.js#killNpc. */
  dharok: [{ id: "bones", chance: 1, qty: [1, 1] },
           { id: "coins", chance: 0.9, qty: [50, 3000] },
           { id: "nature_rune", chance: 0.25, qty: [15, 50] },
           { id: "death_rune", chance: 0.2, qty: [10, 30] },
           { id: "blood_rune", chance: 0.1, qty: [5, 15] },
           { id: "dharoks_helm", chance: 0.03125, qty: [1, 1] },
           { id: "dharoks_platebody", chance: 0.03125, qty: [1, 1] },
           { id: "dharoks_platelegs", chance: 0.03125, qty: [1, 1] },
           { id: "dharoks_greataxe", chance: 0.03125, qty: [1, 1] }],
  guthan: [{ id: "bones", chance: 1, qty: [1, 1] },
           { id: "coins", chance: 0.9, qty: [50, 3000] },
           { id: "nature_rune", chance: 0.25, qty: [15, 50] },
           { id: "law_rune", chance: 0.2, qty: [10, 30] },
           { id: "blood_rune", chance: 0.1, qty: [5, 15] },
           { id: "guthans_helm", chance: 0.03125, qty: [1, 1] },
           { id: "guthans_platebody", chance: 0.03125, qty: [1, 1] },
           { id: "guthans_chainskirt", chance: 0.03125, qty: [1, 1] },
           { id: "guthans_warspear", chance: 0.03125, qty: [1, 1] }],
  verac: [{ id: "bones", chance: 1, qty: [1, 1] },
          { id: "coins", chance: 0.9, qty: [50, 3000] },
          { id: "nature_rune", chance: 0.25, qty: [15, 50] },
          { id: "death_rune", chance: 0.2, qty: [10, 30] },
          { id: "blood_rune", chance: 0.1, qty: [5, 15] },
          { id: "veracs_helm", chance: 0.03125, qty: [1, 1] },
          { id: "veracs_brassard", chance: 0.03125, qty: [1, 1] },
          { id: "veracs_plateskirt", chance: 0.03125, qty: [1, 1] },
          { id: "veracs_flail", chance: 0.03125, qty: [1, 1] }],
  torag: [{ id: "bones", chance: 1, qty: [1, 1] },
          { id: "coins", chance: 0.9, qty: [50, 3000] },
          { id: "nature_rune", chance: 0.25, qty: [15, 50] },
          { id: "law_rune", chance: 0.2, qty: [10, 30] },
          { id: "blood_rune", chance: 0.1, qty: [5, 15] },
          { id: "torags_helm", chance: 0.03125, qty: [1, 1] },
          { id: "torags_platebody", chance: 0.03125, qty: [1, 1] },
          { id: "torags_platelegs", chance: 0.03125, qty: [1, 1] },
          { id: "torags_hammers", chance: 0.03125, qty: [1, 1] }],
  karil: [{ id: "bones", chance: 1, qty: [1, 1] },
          { id: "coins", chance: 0.9, qty: [50, 3000] },
          { id: "bolt_rack", chance: 0.5, qty: [20, 80] },
          { id: "death_rune", chance: 0.2, qty: [10, 30] },
          { id: "blood_rune", chance: 0.1, qty: [5, 15] },
          { id: "karils_coif", chance: 0.03125, qty: [1, 1] },
          { id: "karils_leathertop", chance: 0.03125, qty: [1, 1] },
          { id: "karils_leatherskirt", chance: 0.03125, qty: [1, 1] },
          { id: "karils_crossbow", chance: 0.03125, qty: [1, 1] }],
  ahrim: [{ id: "bones", chance: 1, qty: [1, 1] },
          { id: "coins", chance: 0.9, qty: [50, 3000] },
          { id: "blood_rune", chance: 0.3, qty: [10, 40] },
          { id: "death_rune", chance: 0.2, qty: [10, 30] },
          { id: "chaos_rune", chance: 0.2, qty: [15, 50] },
          { id: "ahrims_hood", chance: 0.03125, qty: [1, 1] },
          { id: "ahrims_robetop", chance: 0.03125, qty: [1, 1] },
          { id: "ahrims_robeskirt", chance: 0.03125, qty: [1, 1] },
          { id: "ahrims_staff", chance: 0.03125, qty: [1, 1] }],
  king_black_dragon: [{ id: "dragon_bones", chance: 1, qty: [1, 1] },
                      { id: "coins", chance: 1, qty: [500, 5000] },
                      { id: "rune_longsword", chance: 0.03, qty: [1, 1] },
                      { id: "rune_axe", chance: 0.03, qty: [1, 1] },
                      { id: "adamant_platebody", chance: 0.05, qty: [1, 1] },
                      { id: "death_rune", chance: 0.12, qty: [10, 50] },
                      { id: "blood_rune", chance: 0.08, qty: [5, 20] },
                      { id: "dragonstone_amulet", chance: 0.02, qty: [1, 1] },
                      { id: "dragon_helm", chance: 0.01, qty: [1, 1] },
                      { id: "dragon_sqshield", chance: 0.01, qty: [1, 1] }],

  /* --- the town's own people (src/PLAN.md unit J) ---------------------------
     Empty on purpose: an explicit `[]` is the difference between "drops
     nothing" and "this creature has no table so give it the default bones"
     (see the fallback in src/combat.js#killNpc), and the whole point of these
     twelve is that a person with a job is not something you farm. */
  hans: [], lumbridge_guide: [], cook: [], fisherman: [], miner: [], beggar: [],
  child: [], schoolgirl: [], gardener: [], shop_assistant: [], apprentice: [],
  drunken_man: [],
};

export const SMITH_ITEMS = (() => {
  const out = {};
  const BAR_ORDER = ["bronze", "iron", "steel", "mithril", "adamant", "rune"];
  const BASE = { bronze: 1, iron: 15, steel: 30, mithril: 50, adamant: 70, rune: 85 };
  /* Wiki level offsets, read off the iron column minus 15 (iron dagger 15,
     axe 16, mace 17 ... platebody 33): every metal but bronze follows them
     exactly - steel dagger 30, mithril claws 63, adamant platelegs 86. Bronze
     runs one below the pattern for everything but the dagger (bronze axe 1,
     mace 2, med helm 3, sword 4 ... platebody 18), and rune platebody/legs hit
     the 99 clamp (85 + 18 = 103 -> 99). All six tables verified cell by cell
     against the wiki's own Smithing tables, 2026-10-12. */
  const OFF = { dagger: 0, axe: 1, mace: 2, medhelm: 3, sword: 4, scimitar: 5, longsword: 6, fullhelm: 7, knives: 7, sqshield: 8, warhammer: 9, battleaxe: 10, chainbody: 11, kiteshield: 12, claws: 13, "2h": 14, platelegs: 16, plateskirt: 16, platebody: 18 };
  /* Wiki bar costs (the anvil screen's own "N bar(s)" lines): platebody 5,
     warhammer/battleaxe/chainbody/kiteshield/2h/platelegs/plateskirt 3,
     scimitar/longsword/fullhelm/sqshield/claws 2, everything else 1. */
  const COST = { dagger: 1, axe: 1, mace: 1, medhelm: 1, sword: 1, scimitar: 2, longsword: 2, fullhelm: 2, sqshield: 2, knives: 1, warhammer: 3, battleaxe: 3, chainbody: 3, kiteshield: 3, claws: 2, "2h": 3, platelegs: 3, plateskirt: 3, platebody: 5 };
  /* Output counts above one (the screen's yellow badges): one bar smiths five
     throwing knives, ten unfinished bolts (src/items.js#BOLT_SMITH). */
  const QTY = { knives: 5 };
  const ID = (bar, cls) => cls === "medhelm" ? bar + "_helm" : cls === "knives" ? bar + "_knife" : bar + "_" + cls;
  for (let t = 0; t < BAR_ORDER.length; t++) {
    const bar = BAR_ORDER[t];
    for (const cls of Object.keys(COST)) {
      const id = ID(bar, cls);
      if (!ITEMS[id]) continue;
      const level = Math.min(99, BASE[bar] + OFF[cls] - (bar === "bronze" && cls !== "dagger" ? 1 : 0));
      out[id] = { bars: COST[cls], level, xp: COST[cls] * 12.5 * (t + 1), bar: bar + "_bar", ...(QTY[cls] ? { qty: QTY[cls] } : {}) };
    }
  }
  return out;
})();

/* ------------------------------------------------- the needle and the thread

   The two data tables behind the Crafting skill's sewing half (unit O). Both
   are read by src/actions.js#craftFromInv (the recipe menu), #attemptCraft (the
   work) and src/skillguides.js#craftingGuide (the guide), so they live here
   with the rest of the item data rather than in actions.js - the same reason
   `SMITH_ITEMS` above does.

   `CRAFT_RECIPES` is one row per product: `level` and `xp` are the published
   OSRS values (the wiki's own Recipe template), `mats` is what it eats and
   `units` is how many *pieces of leather* the row sews. The units matter
   because thread is not per craft: "On every fifth piece of leather used, one
   thread will be consumed" (the Leather page's own words), which the game
   honours with a running count, so the d'hide body - three pieces - eats a
   thread every other one and the snakeskin body eats three at once. A row's
   price in thread is therefore charged out of the count, not out of the row.

   The one recipe the world cannot make is left out on purpose: the **studded
   body** (41, 40 XP) is a leather body plus *steel studs*, and steel studs are
   not an item in this revision - there is nothing to smith or buy them from and
   inventing them is exactly what the operating rules forbid. The 25 rows below
   are the whole of the rest of the leather/d'hide/snakeskin set.

   The tanning half is `TAN_FEES`: every hide the tanner will take, the leather
   it becomes and the price, in the live interface's own order (soft, hard,
   swamp snakeskin, snakeskin, the four dragon leathers). The published
   standard prices are 1 gp soft, 3 gp hard, 15 gp snakeskin, 20 gp swamp
   and any dragonhide (Ellis's own table, checked 2026-10-19) - this world
   deliberately charges more (2 / 5 / 25 / 30 / 30), the user's ask - and
   none of them scales with Crafting level, because a tanner has never
   asked for one. */
export const CRAFT_RECIPES = {
  leather_gloves: { level: 1, xp: 13.8, mats: [["leather", 1]], units: 1 },
  leather_boots: { level: 7, xp: 16.3, mats: [["leather", 1]], units: 1 },
  leather_coif: { level: 9, xp: 18.5, mats: [["leather", 1]], units: 1 },
  leather_vambraces: { level: 11, xp: 22, mats: [["leather", 1]], units: 1 },
  leather_body: { level: 14, xp: 25, mats: [["leather", 1]], units: 1 },
  leather_chaps: { level: 18, xp: 27, mats: [["leather", 1]], units: 1 },
  hardleather_body: { level: 28, xp: 35, mats: [["hard_leather", 1]], units: 1 },
  coif: { level: 38, xp: 37, mats: [["leather", 1]], units: 1 },
  snakeskin_boots: { level: 45, xp: 30, mats: [["snakeskin", 6]], units: 6 },
  snakeskin_vambraces: { level: 47, xp: 35, mats: [["snakeskin", 8]], units: 8 },
  snakeskin_bandana: { level: 48, xp: 45, mats: [["snakeskin", 5]], units: 5 },
  snakeskin_chaps: { level: 51, xp: 50, mats: [["snakeskin", 12]], units: 12 },
  snakeskin_body: { level: 53, xp: 55, mats: [["snakeskin", 15]], units: 15 },
  green_dhide_vambraces: { level: 57, xp: 62, mats: [["green_dragon_leather", 1]], units: 1 },
  green_dhide_chaps: { level: 60, xp: 124, mats: [["green_dragon_leather", 2]], units: 2 },
  green_dhide_body: { level: 63, xp: 186, mats: [["green_dragon_leather", 3]], units: 3 },
  blue_dhide_vambraces: { level: 66, xp: 70, mats: [["blue_dragon_leather", 1]], units: 1 },
  blue_dhide_chaps: { level: 68, xp: 140, mats: [["blue_dragon_leather", 2]], units: 2 },
  blue_dhide_body: { level: 71, xp: 210, mats: [["blue_dragon_leather", 3]], units: 3 },
  red_dhide_vambraces: { level: 73, xp: 78, mats: [["red_dragon_leather", 1]], units: 1 },
  red_dhide_chaps: { level: 75, xp: 156, mats: [["red_dragon_leather", 2]], units: 2 },
  red_dhide_body: { level: 77, xp: 234, mats: [["red_dragon_leather", 3]], units: 3 },
  black_dhide_vambraces: { level: 79, xp: 86, mats: [["black_dragon_leather", 1]], units: 1 },
  black_dhide_chaps: { level: 82, xp: 172, mats: [["black_dragon_leather", 2]], units: 2 },
  black_dhide_body: { level: 84, xp: 258, mats: [["black_dragon_leather", 3]], units: 3 },
};

export const TAN_FEES = [
  { from: "cowhide", to: "leather", fee: 2, label: "Soft leather" },
  { from: "cowhide", to: "hard_leather", fee: 5, label: "Hard leather" },
  { from: "snake_hide_swamp", to: "snakeskin", fee: 30, label: "Snakeskin" },
  { from: "snake_hide", to: "snakeskin", fee: 25, label: "Snakeskin" },
  { from: "green_dragonhide", to: "green_dragon_leather", fee: 30, label: "Green d'hide" },
  { from: "blue_dragonhide", to: "blue_dragon_leather", fee: 30, label: "Blue d'hide" },
  { from: "red_dragonhide", to: "red_dragon_leather", fee: 30, label: "Red d'hide" },
  { from: "black_dragonhide", to: "black_dragon_leather", fee: 30, label: "Black d'hide" },
];

/* ------------------------------------------------------------ the light fingers

   The two data tables behind the Thieving skill (src/PLAN.md unit Q). Both are
   read by src/actions.js#pickpocket / #stealFrom and by
   src/skillguides.js#thievingGuide, so - like `CRAFT_RECIPES` above - they live
   here with the rest of the item data rather than in actions.js.

   `PICKPOCKET` is one row per pickable creature, transcribed from the wiki's
   own table (the values are the ones the 2007/2008 game used; the wiki page is
   the only source, and every row below matches it exactly):

     * `level` is the Thieving level the target needs.
     * `xp` is the published experience for a success.
     * `coins` is the [min, max] of the coin purse - pickpocketing pays in coins
       directly here, because the "coin pouch" that holds them in the live game
       is a 2019 addition and this revision has no such item. The published
       figures are "3 coins/pick" for a man and a single figure for each of the
       others, so the range is that figure on both ends.
     * `stunDamage` is the published stun *hit* (1 for a man or a farmer, 2 for a
       warrior, a rogue or a guard, 3 for a knight).
     * `failLevel` is the published "100% success level" - the level at which
       the wiki says the roll stops failing at all (85 for a man, 90 for a
       farmer, 93 for a warrior, 94 for a rogue, 95 for a guard or a knight).

   The roll between the required level and `failLevel` is this world's own: the
   wiki publishes only those two endpoints, not the curve between them, so
   `src/actions.js#pickpocket` interpolates linearly across the span. That is
   recorded here because it is the one invented number in the skill.

   Only the creatures that actually stand in this world have rows. `hero` (80,
   273.3) is in the wiki's table but nothing in src/world.js spawns one yet, and
   a row for a creature that does not exist is dead data; it joins this table
   the day a hero is placed. */
export const PICKPOCKET = {
  man:                { level: 1,  xp: 8,    coins: [3, 3],   stunDamage: 1, failLevel: 85 },
  /* The drunken man is the same purse as a man, and that is the wiki's own
     sentence rather than a guess: "His drops and pickpocket loot are the same
     as a normal man." (Drunken_man). The cache agrees that he is a pickpocket
     target - his def's third action is exactly "Pickpocket" - so this row is
     what unit W needed to stop dropping that action from his menu. */
  drunken_man:        { level: 1,  xp: 8,    coins: [3, 3],   stunDamage: 1, failLevel: 85 },
  woman:              { level: 1,  xp: 8,    coins: [3, 3],   stunDamage: 1, failLevel: 85 },
  farmer:             { level: 10, xp: 14.5, coins: [9, 9],   stunDamage: 1, failLevel: 90 },
  warrior_woman:      { level: 25, xp: 26,   coins: [18, 18], stunDamage: 2, failLevel: 93 },
  rogue:              { level: 32, xp: 36.5, coins: [25, 25], stunDamage: 2, failLevel: 94 },
  guard:              { level: 40, xp: 46.8, coins: [30, 30], stunDamage: 2, failLevel: 95 },
  knight_of_ardougne: { level: 55, xp: 84.3, coins: [50, 50], stunDamage: 3, failLevel: 95 },
};

/* The two published stun timers, in game ticks: "Being stunned prevents the
   player from moving for nine ticks (5.4 seconds), and from further
   pickpocketing for eight ticks (4.8s)." They are constants rather than per-row
   because every pickpocketable creature shares them. */
export const PICKPOCKET_STUN_MOVE = 9;
export const PICKPOCKET_STUN_CD = 8;

/* The mark's grace after a successful theft, in game ticks: for ten ticks the
   thief cannot turn the pickpocket into a kill (the user's rule). It is set on
   the NPC by src/actions.js#attemptPickpocket and refused in
   src/combat.js#attackNpc, which is the funnel every player-initiated attack -
   melee, ranged, autocast and manual single-casts - passes through. */
export const PICKPOCKET_PP_GRACE = 10;

/* `STALLS` is one row per market stall, keyed by the `kind` its world object
   carries (src/world.js#stalls). The level, experience and respawn seconds are
   the published ones (the wiki's own Stall table; `respawn` is in seconds and
   converted to ticks by the caller). `loot` is a weighted list - [id, weight] -
   because the real stall's loot has rarities the wiki records in prose rather
   than numbers: a cake is the common bakery pull, a chisel the common crafting
   one, a swordfish/tuna break down as rarer than salmon, and a diamond rarer
   than a sapphire.

   Stalls the world cannot stock are left out on purpose: the tea, silk, wine,
   fruit, seed, fur, spice, crossbow, magic, scimitar and ore stalls all pay in
   items this revision has no such thing as (silk, spice, tea, seeds, jugs,
   moulds, cannonballs), and the monkey stalls belong to Ape Atoll. What is
   left is the five stalls the town's own market square carries (src/world.js). */
export const STALLS = {
  bakery: { name: "Baker's stall", level: 5, xp: 16, respawn: 2,
            loot: [["cake", 5], ["chocolate_slice", 3], ["bread", 3]] },
  crafting: { name: "Crafting stall", level: 5, xp: 16, respawn: 7,
              loot: [["chisel", 6], ["gold_bar", 1]] },
  fish: { name: "Fish stall", level: 42, xp: 42, respawn: 10,
          loot: [["raw_salmon", 5], ["raw_tuna", 2], ["raw_lobster", 1]] },
  silver: { name: "Silver stall", level: 50, xp: 54, respawn: 30,
            loot: [["silver_ore", 5], ["silver_bar", 1]] },
  gem: { name: "Gem stall", level: 75, xp: 160, respawn: 180,
         loot: [["uncut_sapphire", 50], ["uncut_emerald", 25], ["uncut_ruby", 8], ["uncut_diamond", 1]] },
};

export function findItem(term) {
  const t = String(term).toLowerCase().replace(/\s+/g, "_");
  if (ITEMS[t]) return ITEMS[t];
  const t2 = t.replace(/_/g, " ");
  for (const it of Object.values(ITEMS)) {
    if (it.name.toLowerCase() === t2) return it;
  }
  for (const it of Object.values(ITEMS)) {
    if (it.name.toLowerCase().startsWith(t2)) return it;
  }
  for (const it of Object.values(ITEMS)) {
    if (it.name.toLowerCase().includes(t2)) return it;
  }
  return null;
}
