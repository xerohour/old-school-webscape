/* ------------------------------------------------------------- the level-up
   interface

   When a skill levels, the client does not write a chat line and leave it at
   that: the content's own script (`advancestat`) runs `mes($message)`, plays
   the level-up jingle and the level-up spotanim, and then opens a **chatbox
   interface** - one per skill, id 157..177 in this revision - whose two text
   components it fills with the message and the new level, and whose icon
   widget holds a 3D model. It stays up until the player clicks "Click here to
   continue" (`p_pausebutton`).

   The 21 interfaces, transcribed component for component out of the cache:

     | id  | skill        | icon model(s) - the cache's own model ids          |
     | --- | ------------ | -------------------------------------------------- |
     | 157 | Agility      | 3328  (the interface-only agility stat icon)        |
     | 158 | Attack       | 2604, 2602 (inventory models: shortsword, longsword)|
     | 159 | Cooking      | 27611 (the cauldron)                                |
     | 160 | Crafting     | 2376, 2489 (hammer, chisel)                         |
     | 161 | Defence      | 2339 (kiteshield)                                   |
     | 162 | Farming      | 7331 (watering can)                                 |
     | 163 | Firemaking   | 2260 (the fire)                                     |
     | 164 | Fishing      | 2355 (a fish)                                       |
     | 165 | Fletching    | 2711 twice (arrows)                                 |
     | 166 | Herblore     | 2364 (a herb)                                       |
     | 167 | Hitpoints    | 3326 (the interface-only hitpoints stat icon)        |
     | 168 | Magic        | 2483 (wizard hat)                                   |
     | 169 | Mining       | 2529 (pickaxe)                                      |
     | 170 | Prayer       | 3325 (the interface-only prayer stat icon)           |
     | 171 | Ranged       | 2711, 2562 (arrow, shortbow)                        |
     | 172 | Runecrafting | 2349 (a blank rune)                                 |
     | 173 | Slayer       | 1733 (an animal skull)                              |
     | 174 | Smithing     | 1251 (the anvil)                                    |
     | 175 | Strength     | 3327 (the interface-only strength stat icon)         |
     | 176 | Thieving     | 2500 (the highwayman mask)                          |
     | 177 | Woodcutting  | 1570 (a tree)                                       |

   Every field above is the cache's: `src/tools/cache-bake/iface.mjs` reads the
   interface definition and each widget's box, zoom and two rotations are the
   component's own. The **model ids were identified by number**, not guessed:
   the skill -> interface map comes from matching each interface's icon widget
   against the content repository's own `scripts/levelup/interfaces/
   levelup_<skill>.if` (same x/y, same zoom, same rotations) and then reading
   the model out of the item and loc definitions - a sword model is the one
   every sword shares, the tree is `plants_tree`, the fire is the one every
   fire loc uses. `src/tools/cache-bake/levelup-bake-run.mjs` bakes exactly
   those 23 models into `src/models/levelup.json`, drawn through the ordinary
   scenery pipeline (`locmodels.js`, key prefix `icon:`).

   **What the cache cannot answer.** Its two text components still say "Line1"
   and "Line2" - a level-up interface is a template the server fills - and the
   only wording the era leaves behind is the content repository's level-up
   table, so:

     * the messages and prefixes below are that table's, verbatim:
       "Congratulations, you just advanced an attack level." and "Your attack
       level is now", including its two quirks - **ranged** levels say "Your
       **ranging** level is now" and a hitpoints level says "Your hitpoints
       **are** now";
     * two skills have no row there because they did not exist yet in 2004 -
       **Farming** and **Slayer** - so their lines follow the same pattern and
       are named as the cache's own stats panel names them;
     * the same reason makes "Runecrafting" and "Firemaking" one word here
       where the 2004 table writes "runecraft" and "fire making": the embedded
       skill name is the one this revision uses everywhere else, and the
       message is otherwise untouched.

   The panel's own geometry, shared by all 21 (component coordinates, the
   q8 dialogue font, black for the two lines, blue for the prompt): */

const LINE1 = { x: 73, y: 15, w: 390, h: 30 };
const LINE2 = { x: 73, y: 44, w: 390, h: 30 };
const CONTINUE = { x: 93, y: 74, w: 350, h: 17 };
const COLOUR_LINE = "#000000";
const COLOUR_CONTINUE = "#0000ff";
const HOVER_CONTINUE = "#ffffff";

/* Herblore's own two interfaces put their first line higher (component 166's
   line1 is at y 9, not 15), so a skill may override a box. */
const LINE1_OFFSET = { herblore: 9 };

/* One icon widget: [modelId, x, y, zoom, pitch, yaw]. `zoom` is the cache's
   modelZoom and the two angles are its modelRotationX and modelRotationZ (the
   third, modelRotationY, is zero on all 21). Two of them mean two widgets -
   Attack draws a shortsword over a longsword, Crafting a hammer over a chisel,
   Ranged an arrow over a shortbow, Fletching two arrows - and they are drawn in
   the interface's own component order. */
export const LEVELUP = {
  agility: { iface: 157, icons: [[3328, 29, 29, 685, 533, 2040]], message: "Congratulations, you just advanced an agility level.", prefix: "Your agility level is now" },
  attack: { iface: 158, icons: [[2604, 65, 38, 444, 234, 148], [2602, 27, 29, 330, 198, 1419]], message: "Congratulations, you just advanced an attack level.", prefix: "Your attack level is now" },
  cooking: { iface: 159, icons: [[27611, 31, 59, 963, 169, 1593]], message: "Congratulations, you just advanced a cooking level.", prefix: "Your cooking level is now" },
  crafting: { iface: 160, icons: [[2376, 30, 24, 496, 418, 14], [2489, 39, 45, 400, 353, 18]], message: "Congratulations, you just advanced a crafting level.", prefix: "Your crafting level is now" },
  defence: { iface: 161, icons: [[2339, 34, 37, 598, 337, 1074]], message: "Congratulations, you just advanced a defence level.", prefix: "Your defence level is now" },
  farming: { iface: 162, icons: [[7331, 31, 52, 451, 118, 1278]], message: "Congratulations, you just advanced a farming level.", prefix: "Your farming level is now" },
  firemaking: { iface: 163, icons: [[2260, 37, 51, 771, 115, 1689]], message: "Congratulations, you just advanced a firemaking level.", prefix: "Your firemaking level is now" },
  fishing: { iface: 164, icons: [[2355, 33, 30, 517, 351, 1865]], message: "Congratulations, you just advanced a fishing level.", prefix: "Your fishing level is now" },
  fletching: { iface: 165, icons: [[2711, 43, 19, 408, 254, 1257], [2711, 46, 44, 444, 223, 177]], message: "Congratulations, you just advanced a fletching level.", prefix: "Your fletching level is now" },
  herblore: { iface: 166, icons: [[2364, 20, 35, 344, 550, 2024]], message: "Congratulations, you just advanced a herblore level.", prefix: "Your herblore level is now" },
  hitpoints: { iface: 167, icons: [[3326, 35, 58, 250, 538, 0]], message: "Congratulations, you just advanced a hitpoints level.", prefix: "Your hitpoints are now" },
  magic: { iface: 168, icons: [[2483, 29, 50, 344, 131, 1913]], message: "Congratulations, you just advanced a magic level.", prefix: "Your magic level is now" },
  mining: { iface: 169, icons: [[2529, 38, 33, 413, 292, 1166]], message: "Congratulations, you just advanced a mining level.", prefix: "Your mining level is now" },
  prayer: { iface: 170, icons: [[3325, 29, 27, 505, 582, 504]], message: "Congratulations, you just advanced a prayer level.", prefix: "Your prayer level is now" },
  ranged: { iface: 171, icons: [[2711, 28, 34, 405, 206, 195], [2562, 42, 17, 397, 422, 1618]], message: "Congratulations, you just advanced a ranged level.", prefix: "Your ranging level is now" },
  runecrafting: { iface: 172, icons: [[2349, 35, 38, 328, 242, 1979]], message: "Congratulations, you just advanced a runecrafting level.", prefix: "Your runecrafting level is now" },
  slayer: { iface: 173, icons: [[1733, 34, 60, 649, 221, 1944]], message: "Congratulations, you just advanced a slayer level.", prefix: "Your slayer level is now" },
  smithing: { iface: 174, icons: [[1251, 34, 53, 716, 97, 1868]], message: "Congratulations, you just advanced a smithing level.", prefix: "Your smithing level is now" },
  strength: { iface: 175, icons: [[3327, 35, 23, 631, 512, 14]], message: "Congratulations, you just advanced a strength level.", prefix: "Your strength level is now" },
  thieving: { iface: 176, icons: [[2500, 42, 31, 155, 366, 55]], message: "Congratulations, you just advanced a thieving level.", prefix: "Your thieving level is now" },
  woodcutting: { iface: 177, icons: [[1570, 20, 69, 1800, 116, 1978]], message: "Congratulations, you just advanced a woodcutting level.", prefix: "Your woodcutting level is now" },
};

/* Hunter and Construction have no interface in this revision's 157..177 run -
   the two families that arrived after it - so a level in either of them keeps
   the chat line alone and says so rather than borrowing another skill's icon. */

/* What one level-up screen needs, ready to draw: the two lines' text, the
   icons' model keys and boxes, and the prompt's box. `line1`/`line2` are the
   words, `y1` the first line's own y (which Herblore moves). */
export function levelupScreen(skill, level) {
  const it = LEVELUP[skill];
  if (!it) return null;
  return {
    iface: it.iface,
    skill,
    line1: it.message,
    line2: it.prefix + " " + level + ".",
    y1: LINE1_OFFSET[skill] != null ? LINE1_OFFSET[skill] : LINE1.y,
    icons: it.icons.map(([model, x, y, zoom, pitch, yaw]) => ({ key: "icon" + model, x, y, zoom, pitch, yaw })),
  };
}

/* The panel's own boxes and colours, in one place for the renderer. */
export const LEVELUP_BOX = {
  line1: LINE1,
  line2: LINE2,
  cont: CONTINUE,
  lineColour: COLOUR_LINE,
  contColour: COLOUR_CONTINUE,
  contHover: HOVER_CONTINUE,
};
