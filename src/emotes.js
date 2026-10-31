/* ------------------------------------------------------------------ emotes

   The emote book: cache interface **464**, and the one place the game's three
   halves of an emote are joined up. An emote is three separate facts that have
   to agree:

     1. **A button** - the interface's own 42x48 sprite, at the interface's own
        coordinates. This file is the transcription of that interface, dumped
        from cache rev 241 with `src/tools/cache-bake/iface.mjs` and checked
        component for component (the 37 type-5 buttons and the 37 type-8 labels
        that name them, in the cache's own order).
     2. **A name** - every button carries a text component with the emote's
        name; the client shows it on hover (a locked emote shows its name the
        same way). The names here are the cache's own strings, not the wiki's.
     3. **A sequence** - baked into the player models as `emote_<name>`
        (src/tools/cache-bake/bake.mjs#EMOTE_ANIMS, which is the authority on
        the ids and cites where each one came from). The rule that turns a name
        into an animation key is `emote_` + the name in lowercase with every run
        of non-alphanumerics collapsed to one underscore - `Jump for Joy` ->
        `emote_jump_for_joy` - and both files apply the same rule, so a name
        typed here is a key the runtime can already play.

   The interface stores each button as one of two sprites: the lit one, or its
   dimmed "you have not unlocked this" partner (the id twenty higher, i.e.
   746-756 for the last fifteen). In this world every emote is unlocked, so the
   book draws the lit sprite for all 37, which is what the `sprite` column is -
   the *unlocked* id in every case.

   At the end of the book sits the **Skill Cape** emote, and it is the one that
   is not a single animation: the real client plays the emote of whichever cape
   of accomplishment you are wearing, and refuses if you are wearing a cape that
   has none. So its `anim` is null and the button asks
   `SKILLCAPE_EMOTES` below what the worn cape plays
   (src/actions.js#performEmote). */

export const EMOTE_ANIM_PREFIX = "emote_";

/* One entry per button of interface 464, in the interface's own order:
   [sprite, x, y, name]. `x`/`y` are the button's position inside the interface
   (the panel is 174 wide and 501 tall, so the last row sits below the side
   panel's 261px window and is reached by the panel's own scrollbar, exactly as
   the client does it). The sprite is the button's own, and the interface is
   what the layout came from - it is not a grid. */
const BUTTONS = [
  [700, -2, 6, "Yes"], [701, 42, 6, "No"], [703, 86, 6, "Bow"], [704, 130, 6, "Angry"],
  [702, -2, 55, "Think"], [708, 42, 55, "Wave"], [720, 86, 55, "Shrug"], [707, 130, 55, "Cheer"],
  [709, -3, 104, "Beckon"], [706, 39, 104, "Laugh"], [716, 86, 104, "Jump for Joy"], [718, 130, 104, "Yawn"],
  [710, -1, 153, "Dance"], [713, 42, 153, "Jig"], [714, 86, 153, "Spin"], [715, 130, 153, "Headbang"],
  [705, -1, 202, "Cry"], [721, 42, 202, "Blow Kiss"], [712, 86, 202, "Panic"], [717, 130, 202, "Raspberry"],
  [711, -1, 252, "Clap"], [719, 42, 252, "Salute"], [726, 86, 252, "Goblin Bow"], [727, 130, 252, "Goblin Salute"],
  [722, -2, 302, "Glass Box"], [723, 42, 302, "Climb Rope"], [724, 86, 302, "Lean"], [725, 130, 302, "Glass Wall"],
  [732, -6, 352, "Idea"], [730, 42, 352, "Stamp"], [731, 86, 352, "Flap"], [729, 130, 352, "Slap Head"],
  [733, -3, 403, "Zombie Walk"], [734, 42, 403, "Zombie Dance"], [728, 86, 403, "Scared"], [735, 130, 403, "Rabbit Hop"],
  [736, -1, 453, "Skill Cape"],
];

/* The animation key a button plays, from the name - the rule at the top of the
   file. A button whose sequence was never baked (the Skill Cape emote) answers
   with null, which is what tells its handler to refuse instead of play. */
function animKeyFor(name) {
  return /^skill cape$/i.test(name) ? null
    : EMOTE_ANIM_PREFIX + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* The emote book, ready to draw: `i` is the emote's position in the book, and
   it is also what travels over the network when somebody performs one (a single
   byte, src/net.js#netEmote) - both clients have this same table, so a position
   is all that has to go on the wire. */
export const EMOTES = BUTTONS.map(([sprite, x, y, name], i) => ({
  i, sprite, x, y, name, anim: animKeyFor(name),
}));

/* The button's own hit box, from the interface: 42x48, one per emote. */
export const EMOTE_HIT = { w: 42, h: 48 };

/* The capes of accomplishment' emotes: one per skill, plus the Quest point
   cape, keyed by the `skillcape` field the items carry (src/items.js). A cape
   of accomplishment is worn for the emote as much as for the +9s, and each one
   is **its own sequence and its own graphic** - not a shared "skillcape" pose.

   Both halves are baked from rev 241 and both were verified against it before
   they were trusted: the sequence exists in sequence archive 12 and animates on
   framemap 0, the human skeleton the player models are built on, and the gfx
   id was found by scanning the spotanim archive for the def whose animation is
   that cape's graphic sequence (812-835, and Hunter's 907). The graphic is the
   emote's *scene* (barbell, conjured shield/sword, box trap, anvil, tree ...)
   and is played at the emote's own start. It is **not** always as long as the
   pose: seven of the twenty-four author the graphic shorter than the animation
   (Defence, Strength, Hunter, Crafting, Woodcutting, Ranged, Herblore - e.g.
   defence 42f/204c against a 55f/269c pose), so it is not disposed on its own
   clock but held for the whole pose (src/gfx.js#play's `seconds`,
   src/game.js#playCapeEmote). See src/tools/cache-bake/bake.mjs#SKILLCAPE_ANIMS
   (the authority on the ids) and #SKILLCAPE_GFX, and
   src/tools/check-capes.mjs (audits the pairing).

   `anim` is the name the bake gives the sequence (`emote_skill_cape_<skill>`);
   `gfx` is the spotanim played on the caster as the pose begins.

   **`weapon` / `shield` are the props the pose holds**, and they are the cache's
   own: a sequence in this revision names the two *items* it wants in the hands
   (`SequenceDefinition`'s `weapon`/`shield` fields, written into
   PlayerComposition's own equipment array - see
   src/tools/cache-bake/capeprops-bake-run.mjs for the full derivation and the
   per-cape table). Fifteen of the twenty-four emotes name nothing, and for them
   the pose is played with **empty hands** (what this world has always done: the
   weapon and shield are simply not drawn). The other nine hold a real item -
   the Ranged cape a longbow, the Cooking cape a pan, the Woodcutting cape an
   axe, the Crafting cape a hammer and a chisel, and so on - and the keys here are
   the baked wield models of exactly those items (src/models/capeprops.json),
   merged into the body in place of the equipped weapon and shield while the
   pose runs (src/game.js#wornKeysFor). */
export const SKILLCAPE_EMOTES = {
  attack: { anim: "emote_skill_cape_attack", gfx: 823 },
  strength: { anim: "emote_skill_cape_strength", gfx: 828 },
  defence: { anim: "emote_skill_cape_defence", gfx: 824, weapon: "capeprop_9899", shield: "capeprop_9898" },
  hitpoints: { anim: "emote_skill_cape_hitpoints", gfx: 834 },
  ranged: { anim: "emote_skill_cape_ranged", gfx: 832, weapon: "capeprop_839" },
  prayer: { anim: "emote_skill_cape_prayer", gfx: 829 },
  magic: { anim: "emote_skill_cape_magic", gfx: 813 },
  runecrafting: { anim: "emote_skill_cape_runecrafting", gfx: 817 },
  agility: { anim: "emote_skill_cape_agility", gfx: 830 },
  herblore: { anim: "emote_skill_cape_herblore", gfx: 835, weapon: "capeprop_9893" },
  thieving: { anim: "emote_skill_cape_thieving", gfx: 826 },
  crafting: { anim: "emote_skill_cape_crafting", gfx: 818, weapon: "capeprop_9894", shield: "capeprop_9895" },
  fletching: { anim: "emote_skill_cape_fletching", gfx: 812 },
  slayer: { anim: "emote_skill_cape_slayer", gfx: 827 },
  hunter: { anim: "emote_skill_cape_hunter", gfx: 907 },
  mining: { anim: "emote_skill_cape_mining", gfx: 814 },
  smithing: { anim: "emote_skill_cape_smithing", gfx: 815, weapon: "capeprop_2347" },
  fishing: { anim: "emote_skill_cape_fishing", gfx: 819 },
  cooking: { anim: "emote_skill_cape_cooking", gfx: 821, weapon: "capeprop_9896" },
  firemaking: { anim: "emote_skill_cape_firemaking", gfx: 831 },
  woodcutting: { anim: "emote_skill_cape_woodcutting", gfx: 822, weapon: "capeprop_9897" },
  farming: { anim: "emote_skill_cape_farming", gfx: 825, weapon: "capeprop_5331" },
  construction: { anim: "emote_skill_cape_construction", gfx: 820, weapon: "capeprop_9894" },
  quest: { anim: "emote_skill_cape_quest", gfx: 816 },
  /* The Max cape plays the Quest point cape's own pose until its sequence is
     baked: the Max emote the live game plays (all 24 skill icons over a
     skill-bar graph) has no `emote_skill_cape_max` in this revision's bake, so
     the summit cape borrows the journal cape's rather than refusing - every
     switch that keys off the worn cape's `skillcape` (src/actions.js#
     performEmote, src/game.js#ghostEmote, src/game.js#wornKeysFor) then works
     for it with no second code path. */
  max: { anim: "emote_skill_cape_quest", gfx: 816 },
};

/* The emote one skill's cape plays, or null for a skill this world has no cape
   for (it never happens - the 23 skills and the quest journal are the whole
   list - but a null here is what the refusal hangs on). */
export function skillcapeEmote(skill) {
  return SKILLCAPE_EMOTES[skill] || null;
}

/* The cape emote a *pose* belongs to, or null when the animation is not one of
   them. The renderer asks this while a pose is playing: the sequence names the
   props it holds (see SKILLCAPE_EMOTES' `weapon`/`shield` and
   src/tools/cache-bake/capeprops-bake-run.mjs), and those have to be put in the
   hands in place of whatever is equipped - the same thing the client does by
   writing the sequence's own item ids into its equipment array
   (PlayerComposition.getModel). */
export function skillcapeEmoteForAnim(name) {
  if (!isSkillcapeEmoteAnim(name)) return null;
  const skill = name.slice((EMOTE_ANIM_PREFIX + "skill_cape_").length);
  return SKILLCAPE_EMOTES[skill] || null;
}

/* Whether an animation key is one of the capes of accomplishment' own poses
   (`emote_skill_cape_attack`, ...). The renderer asks this while a pose is
   playing, because a skillcape pose is **authored with empty hands**: its
   graphic carries the prop it needs (the wand, the bow, the anvil, the spear),
   so the weapon and the shield are held out of the merged body model while it
   runs - not unequipped, just not drawn (src/game.js#wornKeysFor). */
export function isSkillcapeEmoteAnim(name) {
  return !!name && name.startsWith(EMOTE_ANIM_PREFIX + "skill_cape_");
}

/* One emote by its position in the book (the wire's own addressing). */
export function emoteAt(i) {
  return EMOTES[i] || null;
}

/* One emote by what a player would type: its name, case and spacing free
   ("jump for joy" / "jumpforjoy" / "Jump_For_Joy" all find it). Used by the
   `::emote` command and by the bare `::<emotename>` shorthand
   (src/ui.js#command). */
export function emoteNamed(text) {
  const key = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key === "skillcape") return EMOTES[EMOTES.length - 1];
  return EMOTES.find((e) => e.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === key) || null;
}
