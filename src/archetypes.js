/* The archetypes: humanoid NPCs that are *wearing an outfit*.

   Every other creature in this world is a single baked cache model - an NPC
   definition's model list, recoloured by its def, merged by the bake once and
   drawn forever. That is exactly right for a goblin or a dragon, and exactly
   wrong for a person: the cache authors each humanoid NPC as one fixed costume,
   so there is no way to ask a cache NPC for "a wizard in the dark mystic set".
   The *player's* body has no such limit - it is the seven identity-kit parts
   with the worn models of whatever is equipped merged over them (see
   src/identikits.js and src/models3d.js#setWorn) - and that is the machinery
   this registry drives for a *non-player* character.

   An archetype is therefore three things:

     * **a look** - an identity-kit appearance (see src/identikits.js): the head
       and jaw kits, and the five colour rows. This is what makes two wizards
       two different people rather than one person drawn twice.
     * **an outfit** - item ids, one per equipment slot, exactly as the player's
       equipment window holds them. Every id must be a real item *and* carry a
       baked worn model (src/models/held.json); `archetypeProblems` reports the
       ones that do not.
     * **a base** - the NPC whose stats, drop table, action list, aggression,
       attack style and cast this archetype inherits. The spawned entity's
       `type` is that base (so every mechanics table in the game reads it
       unchanged - see src/combat.js), and its `archetype` field names this
       entry, which is where the *look* and the *name* come from.

   Nothing here is drawn by hand: every garment is the cache's own worn model,
   and every face is the cache's own identity kit - with one exception, and it is
   the reason the *body* is decided here rather than in the wardrobe: a
   `headModel` names a creature whose **own head** an archetype wears in place of
   its kit head (see identikits.js#buildBorrowedHeadBody). Saradomin is the one
   who needs it - the god in the woods is the Lumbridge Guide, and the guide's
   long white hair and beard is geometry no kit has. (The Bee keeper used to be
   the second - his veil hung on his rig's head bones - until his own outfit
   was baked: his hat item carries his masked face with it, so the kit head
   drops under it like under any closed helm. See #beekeeper below.) The registry is the *wizard*
   wardrobe first and foremost - the user's ask, 2026-09-23: *"generate styles of
   wizards who are wearing gear combinations that make sense for wizards to
   wear, that way we can start picking which ones are good and can be made into
   new character archetypes in the game"* - with a second, shorter group of
   other classes so the picking has something to contrast against.

   `::archetypes` lines every candidate up in the world (src/ui.js) and
   `::archetype <key>` stands one in front of the player; each candidate is a
   real, clickable NPC whose Examine reads its outfit out, so picking one is a
   matter of walking the row and looking. */

import { defaultAppearance, buildKitBody, buildBorrowedHeadBody, PALETTES, GREY_BOOTS } from "./identikits.js";
import { modelData } from "./models3d.js";
import { ITEMS } from "./items.js";

/* The base classes an archetype can inherit. Each is an NPC this world already
   ships (src/game.js#NPC_STATS), so a wizard archetype fights, aggroes, drops
   and opens its menu exactly as the game's own `wizard` does. */
export const ARCHETYPE_BASES = new Set([
  "wizard", "dark_wizard", "monk", "druid", "priest", "monk_of_zamorak",
  "man", "guard", "soldier", "black_knight", "knight_of_ardougne",
  "barbarian", "rogue",
  /* The Wise Old Man's own base (src/game.js#NPC_STATS): the cache's Wise
     Old Man, a level-0 pacifist whose def carries nothing but Talk-to. */
  "wise_old_man",
  /* The god in the north-western woods (src/saradomin.js): his own entry in
     src/game.js#NPC_STATS, because his fight is nothing like any creature's -
     he stands still and throws a spell of his own. Nothing in the bestiary
     shares his row. */
  "saradomin",
  "iban",
  /* The Bee keeper in the smithy (see #beekeeper below): a level-0
     pacifist with Talk-to and nothing else, there to stand and to talk. */
  "beekeeper",
]);

/* The equipment slots a worn model can occupy, in the client's own order. A slot
   an archetype leaves out is simply empty. */
const SLOTS = ["head", "cape", "amulet", "weapon", "body", "shield", "legs", "hands", "feet", "ring"];

/* `look.parts` / `look.colours` are merged over the gender's own defaults, so an
   archetype only writes down what makes it that person. Valid kit ids per part
   are the cache's own selectable lists (src/identikits.js#selectableKits) - a
   male head is 0..8, a male jaw 10..17, and so on; anything outside a bucket is
   refused by the kit merge rather than drawn wrong. */
export const ARCHETYPES = [
  /* ------------------------------------------------------------- the wizards
     The classic blue mage and his elemental brothers: the same robe drawn in
     the shop's three colours, one per element staff. The blue robe set is the
     one the magic shops sell, so these are the archetypes a player actually
     meets. */
  { key: "wizard_blue", name: "Blue Wizard", group: "Wizard", base: "wizard",
    look: { head: 0, jaw: 10, colours: { hair: 3, skin: 0 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", weapon: "staff_of_air" },
    note: "The magic shop's own wizard: blue robe, blue skirt, pointed hat, air staff." },
  { key: "wizard_blue_fire", name: "Fire Wizard", group: "Wizard", base: "wizard",
    look: { head: 4, jaw: 12, colours: { hair: 9, skin: 2 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", weapon: "staff_of_fire" },
    note: "Blue robes, fire staff - the elemental set swapped for the fire one." },
  { key: "wizard_blue_earth", name: "Earth Wizard", group: "Wizard", base: "wizard",
    look: { head: 2, jaw: 15, colours: { hair: 2, skin: 4 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", weapon: "staff_of_earth" },
    note: "Blue robes, earth staff." },
  { key: "wizard_blue_water", name: "Water Wizard", group: "Wizard", base: "wizard",
    look: { head: 6, jaw: 10, colours: { hair: 6, skin: 1 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", weapon: "staff_of_water" },
    note: "Blue robes, water staff." },
  { key: "wizard_dark", name: "Dark Wizard", group: "Wizard", base: "dark_wizard",
    look: { head: 0, jaw: 14, colours: { hair: 1, skin: 0 } },
    items: { head: "dark_wizard_hat", body: "dark_wizard_robe_top", legs: "dark_wizard_robe_bottom", weapon: "staff_of_water" },
    note: "The robe set in black - the dark wizards' own colours, hat included." },
  { key: "wizard_dark_fire", name: "Dark Fire Wizard", group: "Wizard", base: "dark_wizard",
    look: { head: 5, jaw: 17, colours: { hair: 0, skin: 3 } },
    items: { head: "dark_wizard_hat", body: "dark_wizard_robe_top", legs: "dark_wizard_robe_bottom", weapon: "fire_battlestaff" },
    note: "Dark wizard robes and a fire battlestaff - the battlestaff is the step up from the plain staff." },
  { key: "wizard_shopkeeper", name: "Magic Shop owner", group: "Wizard", base: "wizard",
    chathead: "wizard",
    look: { head: 3, jaw: 10, colours: { hair: 7, skin: 1 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", shield: "mind_shield", cape: "yellow_cape", weapon: "staff_of_air" },
    note: "The town-square robe seller: blue wizard set, mind shield and yellow cape." },
  { key: "wizard_battlestaff", name: "Battlestaff Wizard", group: "Wizard", base: "wizard",
    look: { head: 1, jaw: 11, colours: { hair: 4, skin: 0 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "blue_skirt", weapon: "air_battlestaff" },
    note: "The blue robe set with the battlestaff form of the air staff." },

  /* ------------------------------------------------------- the mystic family
     The three mystic colours are one set drawn three ways - navy, black and
     white - and each is a complete five-piece outfit, which is what makes them
     the cleanest archetypes here: hat, top, bottom, gloves and boots all exist
     and all match. */
  { key: "mystic_blue", name: "Mystic Mage", group: "Mystic", base: "wizard",
    look: { head: 3, jaw: 10, colours: { hair: 2, skin: 0 } },
    items: { head: "mystic_hat", body: "mystic_robe_top", legs: "mystic_robe_bottom", hands: "mystic_gloves", feet: "mystic_boots", weapon: "mystic_air_staff" },
    note: "The full blue mystic set with its own air staff." },
  { key: "mystic_dark", name: "Mystic (dark)", group: "Mystic", base: "dark_wizard",
    look: { head: 0, jaw: 16, colours: { hair: 0, skin: 2 } },
    items: { head: "mystic_dark_hat", body: "mystic_dark_robe_top", legs: "mystic_dark_robe_bottom", hands: "mystic_dark_gloves", feet: "mystic_dark_boots", weapon: "ancient_staff" },
    note: "The dark mystic set, with the ancient staff - the Zamorakian mage." },
  { key: "mystic_light", name: "Mystic (light)", group: "Mystic", base: "wizard",
    look: { head: 7, jaw: 10, colours: { hair: 7, skin: 0 } },
    items: { head: "mystic_light_hat", body: "mystic_light_robe_top", legs: "mystic_light_robe_bottom", hands: "mystic_light_gloves", feet: "mystic_light_boots", weapon: "staff_of_air" },
    note: "The light mystic set, with an air staff." },

  /* ------------------------------------------------------------- the orders
     The robed orders - monks, druids, the shades and the god priests - are the
     cache's own robe sets, which is why they read as costume rather than as a
     player in armour. */
  { key: "monk", name: "Monk", group: "Order", base: "monk",
    look: { head: 0, jaw: 10, colours: { hair: 5, skin: 0 } },
    items: { body: "monks_robe_top", legs: "monks_robe" },
    note: "Monk's robe top and robe, empty hands - the monastery's own." },
  { key: "monk_zamorak", name: "Monk of Zamorak", group: "Order", base: "monk_of_zamorak",
    look: { head: 0, jaw: 10, colours: { hair: 1, skin: 0 } },
    items: { body: "zamorak_monk_top", legs: "zamorak_monk_bottom" },
    note: "The Zamorakian monk's own two-piece robe." },
  { key: "druid", name: "Druid", group: "Order", base: "druid",
    look: { head: 2, jaw: 13, colours: { hair: 6, skin: 1 } },
    items: { body: "druids_robe_top", legs: "druids_robe" },
    note: "Druid's robe top and robe." },
  { key: "shade_robed", name: "Shade Robed", group: "Order", base: "man",
    look: { head: 0, jaw: 10, colours: { hair: 0, skin: 5 } },
    items: { body: "shade_robe_top", legs: "shade_robe" },
    note: "Shade robe top and robe - the greyer order's set." },
  { key: "priest_zamorak", name: "Zamorak Priest", group: "Order", base: "monk_of_zamorak",
    look: { head: 8, jaw: 15, colours: { hair: 1, skin: 3 } },
    items: { head: "zamorak_mitre", body: "zamorak_robe_top", legs: "zamorak_robe_legs", amulet: "zamorak_stole", weapon: "zamorak_staff" },
    note: "The full Zamorak vestment: mitre, top, legs, stole and staff." },
  { key: "priest_saradomin", name: "Saradomin Priest", group: "Order", base: "priest",
    look: { head: 5, jaw: 10, colours: { hair: 7, skin: 0 } },
    items: { body: "saradomin_robe_top", legs: "saradomin_robe_legs", weapon: "saradomin_staff" },
    note: "Saradomin vestments and the Saradomin staff." },
  /* **Saradomin himself** (the user's ask, 2026-09-24): the god, not a priest
     of his. He wears the vestments - the top and the legs - with his own cape
     over them, and nothing else: no mitre, no stole, no gloves, and the
     identity kit's own boots recoloured plain grey (`GREY_BOOTS`), on the user's
     instruction (*"we dont want his gloves nor his shirt/top ... remove his
     boots and just use regular grey ones ... we dont want his pants either"* -
     the vestments are what covers him). His **head** is the Lumbridge Guide's -
     the god in the woods *is* the guide, and no kit draws the guide's long white
     hair and beard, so the head is borrowed from his model rather than
     approximated (`headModel`, see identikits.js#buildBorrowedHeadBody). He
     carries the Guide's staff, which is this world's own weapon
     (src/tools/hand-models/lumbridge-staff.mjs, src/items.js). His mechanics come
     from the `saradomin` base in src/game.js#NPC_STATS, which is a row no other
     creature shares (his fight is run by src/saradomin.js). */
  { key: "saradomin", name: "Saradomin", group: "Order", base: "saradomin",
    look: { head: 5, jaw: 10, colours: { hair: 7, skin: 0, feet: PALETTES.feet.indexOf(GREY_BOOTS) } },
    headModel: "lumbridge_guide",
    items: { body: "saradomin_robe_top", legs: "saradomin_robe_legs", cape: "saradomin_cape", weapon: "saradomins_staff" },
    note: "The god in the northern woods: Saradomin vestments and cape, the Guide's own hair and beard, plain grey boots and the Guide's staff." },
  { key: "iban", name: "Iban", group: "Wizard", base: "iban",
    look: { head: 0, jaw: 14, colours: { hair: 7, skin: 0 } },
    items: { head: "ahrims_hood", amulet: "unholy_symbol", body: "iban_robe_top", legs: "iban_robe", weapon: "ibans_staff" },
    note: "Iban at the skeletons field: dark hood, brown goatee and Zamorak robes with his own staff, an unholy symbol at his neck, throwing red ground spikes at the skeletons around him." },
  /* **The Bee keeper** (the user's ask, 2026-10-12): the cache's own Bee keeper
     (npc 4416) for the smithy, in his own clothes - the beekeeper's outfit
     (cache items 25129-25137), hat, top, legs, gloves and boots, with an
     abyssal whip in hand. The whip is why he is an archetype and not his
     baked self - a baked NPC cannot wield, while the archetype merges the
     whip onto the player-shaped body like any equipment
     (see makeArchetypeRender). The veiled mask hat carries the beekeeper's
     own masked face with it (the hat's second model is head geometry, which
     src/models3d.js#itemSuppliesHead reads as a face, so the kit head drops
     under it the way it does under any closed helm) - no borrowed head, no
     stand-in robes. He stands facing north where the hammer crate stood, and
     he would rather not go for a walk (see dialogue.js#NPC_TALK). His
     dialogue-box head is his own chathead too (see `chathead` below and
     dialogue.js#archetypeHeadKey). */
  { key: "beekeeper", name: "Bee keeper", group: "Other", base: "beekeeper",
    look: { head: 0, jaw: 10, colours: { hair: 1, skin: 0 } },
    chathead: "beekeeper",
    items: { head: "beekeeper_hat", body: "beekeeper_top", legs: "beekeeper_legs", hands: "beekeeper_gloves", feet: "beekeeper_boots", weapon: "abyssal_whip" },
    note: "The Bee keeper in the smithy: his own veiled hat, suit, gloves and boots, an abyssal whip in hand." },
  { key: "priest_guthix", name: "Guthix Priest", group: "Order", base: "priest",
    look: { head: 4, jaw: 12, colours: { hair: 2, skin: 1 } },
    items: { body: "guthix_robe_top", legs: "guthix_robe_legs", weapon: "guthix_staff" },
    note: "Guthix vestments and the Guthix staff." },

  /* --------------------------------------------------- the mage equipment
     The named mage sets: each is a whole outfit the live game considers one, so
     these are the "reasonable combination" cases by construction. */
  { key: "enchanted_mage", name: "Enchanted Mage", group: "Mage set", base: "wizard",
    look: { head: 6, jaw: 14, colours: { hair: 8, skin: 0 } },
    items: { head: "enchanted_hat", body: "enchanted_top", legs: "enchanted_robe", weapon: "staff_of_fire" },
    note: "The enchanted robes - the three-pointed hat's own set." },
  { key: "infinity_mage", name: "Infinity Mage", group: "Mage set", base: "wizard",
    look: { head: 3, jaw: 10, colours: { hair: 3, skin: 0 } },
    items: { head: "infinity_hat", body: "infinity_top", legs: "infinity_bottoms", hands: "infinity_gloves", feet: "infinity_boots", weapon: "mystic_water_staff" },
    note: "The full infinity set with a mystic water staff." },
  { key: "splitbark_mage", name: "Splitbark Mage", group: "Mage set", base: "wizard",
    look: { head: 0, jaw: 11, colours: { hair: 4, skin: 4 } },
    items: { head: "splitbark_helm", body: "splitbark_body", legs: "splitbark_legs", hands: "splitbark_gauntlets", feet: "splitbark_boots", weapon: "battlestaff" },
    note: "The full splitbark set - bark armour, and the plain battlestaff it is made with." },
  { key: "ahrims_mage", name: "Ahrim's Mage", group: "Mage set", base: "wizard",
    look: { head: 0, jaw: 17, colours: { hair: 1, skin: 3 } },
    items: { head: "ahrims_hood", body: "ahrims_robetop", legs: "ahrims_robeskirt", weapon: "ahrims_staff" },
    note: "Ahrim the Blighted's own hood, robetop, robeskirt and staff." },
  { key: "ghostly_mage", name: "Ghostly Mage", group: "Mage set", base: "wizard",
    look: { head: 1, jaw: 10, colours: { hair: 7, skin: 7 } },
    items: { head: "ghostly_hood", body: "ghostly_robe_top", legs: "ghostly_robe_bottom", hands: "ghostly_gloves", feet: "ghostly_boots", cape: "ghostly_cloak", weapon: "ancient_staff" },
    note: "The full ghostly set - the whole outfit, cloak included, in its own white." },
  { key: "third_age_mage", name: "3rd Age Mage", group: "Mage set", base: "wizard",
    look: { head: 4, jaw: 16, colours: { hair: 8, skin: 0 } },
    items: { head: "third_age_mage_hat", body: "third_age_robe_top", legs: "third_age_robe", weapon: "staff_of_earth" },
    note: "The 3rd age mage set - the rarest robe in the cache, and its own three pieces." },
  { key: "moonclan_seer", name: "Moonclan Seer", group: "Mage set", base: "wizard",
    look: { head: 5, jaw: 10, colours: { hair: 5, skin: 6 } },
    items: { head: "wizard_hat", body: "wizard_robe", legs: "moonclan_skirt", feet: "moonclan_boots", cape: "moonclan_cape", weapon: "staff_of_water" },
    note: "The moonclan skirt, boots and cape over the blue robe - the Fremennik seer." },

  /* ------------------------------------------------------------ other classes
     Not wizards: the same machinery wearing something else, so the wizard
     lineup has a contrast to be judged against. */
  { key: "ranger_green", name: "Green Ranger", group: "Other", base: "man",
    look: { head: 3, jaw: 10, colours: { hair: 2, skin: 1 } },
    items: { head: "coif", body: "green_dhide_body", legs: "green_dhide_chaps", hands: "leather_vambraces", feet: "leather_boots", weapon: "magic_shortbow" },
    note: "Green dragonhide and a magic shortbow." },
  { key: "ranger_black", name: "Black Ranger", group: "Other", base: "rogue",
    look: { head: 0, jaw: 13, colours: { hair: 0, skin: 2 } },
    items: { head: "coif", body: "black_dhide_body", legs: "black_dhide_chaps", hands: "leather_vambraces", feet: "ranger_boots", weapon: "yew_shortbow" },
    note: "Black dragonhide and a yew shortbow." },
  { key: "knight_black", name: "Black Knight", group: "Other", base: "black_knight",
    look: { head: 0, jaw: 10, colours: { hair: 0, skin: 0 } },
    items: { head: "black_fullhelm", body: "black_platebody", legs: "black_platelegs", shield: "black_kiteshield", weapon: "black_sword" },
    note: "The full black kit: full helm, platebody, platelegs, kiteshield and sword." },
  { key: "knight_white", name: "White Knight", group: "Other", base: "knight_of_ardougne",
    look: { head: 4, jaw: 10, colours: { hair: 4, skin: 0 } },
    items: { head: "white_fullhelm", body: "white_platebody", legs: "white_platelegs", shield: "white_kiteshield", weapon: "white_sword" },
    note: "The full white kit - the White Knights' own colours." },
  { key: "knight_rune", name: "Rune Knight", group: "Other", base: "soldier",
    look: { head: 6, jaw: 15, colours: { hair: 1, skin: 3 } },
    items: { head: "rune_fullhelm", body: "rune_platebody", legs: "rune_platelegs", shield: "rune_kiteshield", weapon: "rune_scimitar" },
    note: "Rune plate and a rune scimitar - the top of the metal tier." },
  { key: "guard_watch", name: "Watch Guard", group: "Other", base: "guard",
    look: { head: 1, jaw: 12, colours: { hair: 2, skin: 2 } },
    items: { head: "black_helm", body: "black_chainbody", legs: "black_platelegs", shield: "bronze_kiteshield", weapon: "iron_sword" },
    note: "A town watchman: black helm and chain over a bronze kiteshield." },
];

const BY_KEY = new Map(ARCHETYPES.map((a) => [a.key, a]));

export function archetypeByKey(key) {
  return key ? BY_KEY.get(key) || null : null;
}

export function archetypeKeys() {
  return ARCHETYPES.map((a) => a.key);
}

/* The identity-kit appearance this archetype looks like: the gender's defaults
   with the archetype's own kit picks and colour choices merged over them. */
export function archetypeAppearance(a) {
  const app = defaultAppearance(a && a.look && a.look.gender);
  if (a && a.look) {
    if (a.look.parts) Object.assign(app.parts, a.look.parts);
    if (a.look.colours) Object.assign(app.colours, a.look.colours);
  }
  return app;
}

/* The *body* key: the merged kit body, registered on demand by the identity-kit
   system (src/identikits.js#buildKitBody, which caches by key, so this is safe
   to call every frame). The fallback is the plain baked body of the same
   gender, so an archetype still renders if the kit manifest has not landed. */
export function archetypeBodyKey(a) {
  const app = archetypeAppearance(a);
  /* An archetype that names a `headModel` wears that creature's own head instead
     of a kit head (see identikits.js#buildBorrowedHeadBody). Until both models
     have landed it falls through to the plain kit body, so the character still
     draws - with a kit head - rather than not at all. */
  if (a && a.headModel) {
    /* `headBones` names the donor's own head bones when they are not the
       guide's (see src/identikits.js#buildBorrowedHeadBody). */
    const borrowed = buildBorrowedHeadBody(app, a.headModel, a.headBones);
    if (borrowed) return borrowed;
  }
  return buildKitBody(app) || (app.gender === "female" ? "player_female" : "player_male");
}

/* The archetype's outfit as an equipment object, in the shape
   src/game.js#wornKeysFor / #wornOptsFor already read - so an archetype's
   garments go through exactly the same worn-model merge, kit-part culling and
   garment depth bias as a player's own equipment, with no second code path. */
export function archetypeEquip(a) {
  const eq = {};
  if (!a || !a.items) return eq;
  for (const slot of SLOTS) {
    const id = a.items[slot];
    if (id && ITEMS[id]) eq[slot] = { id, qty: 1 };
  }
  return eq;
}

/* The outfit as readable item names, in equipment-slot order - what the
   archetype's Examine line and the `::archetypes` chat listing are built from. */
export function archetypeItemNames(a) {
  const out = [];
  if (!a || !a.items) return out;
  for (const slot of SLOTS) {
    const id = a.items[slot];
    if (!id) continue;
    out.push(ITEMS[id] ? ITEMS[id].name : id + " (missing)");
  }
  return out;
}

export function archetypeExamine(a) {
  const names = archetypeItemNames(a);
  const outfit = names.length ? names.join(", ") : "nothing";
  return (a.name || a.key) + " is wearing " + outfit + ".";
}

/* -------------------------------------------------------------- the audit

   Every id above has to be a real item *and* carry a baked worn model, because
   an archetype naming either a typo or an item whose art the bake has never
   seen would simply draw the character without that piece - silently, exactly
   the failure mode this project audits for everywhere else. Returns
   `{problems, checked}`; `problems` is empty when every archetype is sound. */
export function archetypeProblems(heldKeys) {
  const problems = [];
  const held = heldKeys || null;
  let checked = 0;
  const seen = new Set();
  for (const a of ARCHETYPES) {
    if (seen.has(a.key)) problems.push(a.key + ": duplicate key");
    seen.add(a.key);
    if (!a.name) problems.push(a.key + ": no display name");
    checked++;
    for (const slot of SLOTS) {
      const id = a.items && a.items[slot];
      if (!id) continue;
      const d = ITEMS[id];
      if (!d) { problems.push(a.key + ": \"" + id + "\" is not an item"); continue; }
      if (d.slot !== slot) problems.push(a.key + ": \"" + id + "\" is a " + d.slot + " item, filed under " + slot);
      if (held && !held.has(id)) problems.push(a.key + ": \"" + id + "\" has no baked worn model");
    }
    if (!ARCHETYPE_BASES.has(a.base)) problems.push(a.key + ": \"" + a.base + "\" is not one of the archetype bases");
    if (a.headModel && !modelData.has(a.headModel)) problems.push(a.key + ": head model \"" + a.headModel + "\" is not a baked model");
    if (a.headBones && (!Array.isArray(a.headBones) || !a.headBones.every((b) => Number.isInteger(b)))) problems.push(a.key + ": headBones is not a list of bone ids");
  }
  return { problems, checked };
}
