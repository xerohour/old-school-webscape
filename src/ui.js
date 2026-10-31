import { SKILLS, combatLevel, totalLevel, totalXp, boosted, applyBoost } from "./skills.js";
import {
  ITEMS, itemDef, itemName, isStackable, showsCount, itemValue, MAX_STACK,
  STYLE_INFO, stylesForWeapon, layoutForWeapon, weaponCategory, POTION_BY_ITEM,
  CRAFT_RECIPES, BOW_STRING,
} from "./items.js";
import { iconUrl, noteUrl, ringedIconUrl, stackSpriteFor } from "./icons.js";
import {
  INV_SIZE, BANK_SIZE, invAdd, invRemove, invRemoveAt, invCount, invFree,
  totalBonus, totalWeight, weaponOf, equipFromInv, unequip, bankAdd,
  bankUsed, bankMove, bankCompact, swapInventoryItems, keptOnDeath, nameError,
} from "./player.js";import { QUESTS, questState, QUEST_COMPLETE } from "./quests.js";
import { xpForLevel, levelForXp, MAX_LEVEL, formatNum, amountString } from "./util.js";
import { Net, netPM, netSetPrivacy, PM_INFO, netWhere, netShop, netShopRequest, netShopClear, SHOP_FULL, SHOP_CLEAR, netLinkReport } from "./net.js";
import { buildGuide } from "./skillguides.js";
import { MUSIC_ROWS } from "./data/music-tracks.js";
import { RUN_UNITS, RUN_ON_THRESHOLD, runPercent } from "./run.js";
import { T, TILE_COLORS } from "./world.js";
import { walkTo, placeEntity, setPlayerAppearance, createNpc, NPC_STATS, playCastAnim, clickMods, spawnArchetypeNpc, clearArchetypeNpcs, entityBoxWorld, makePlayerCharacter, wornKeysFor, wornOptsFor, stopFollowing, Game, forceRiverTrollEvent } from "./game.js";
import { archetypeKeys, archetypeByKey, archetypeItemNames, archetypeExamine } from "./archetypes.js";
import { modelKeys, loadHeldModelsFemale } from "./models3d.js";
import { nearestWalkable } from "./pathfind.js";
import { Fx } from "./fx.js";
import {
  PRAYERS, prayerByName, isActive as prayerUp, togglePrayer,
  activePrayers, drainPerMinute, overheadPrayer, overheadPartFor,
  quickSet, isQuickMember, quickActive, toggleQuickMember, toggleQuick,
} from "./prayer.js";
import {
  SPELLS, SPELL_COLS, SPELL_CELL, SPELL_ORIGIN_X, SPELL_ORIGIN_Y,
  spellById, runeNeeds, missingText, spellStatus, spellStaffIds, RUNES_COMMAND_IDS, SPELL_TARGET,
  BOOKS, bookById,
} from "./magic.js";
import Frame, {
  VIEWPORT, TABS, DEFAULT_TAB, CHAT_MODES, MAP, SIDE, FRAME_W, FRAME_H,
  ORB_RUN_FILL, ORB_RUN_ICON, ORB_HP_FILL, DEVICE,
  SCROLLBAR_COLORS, scrollbarGrip, paintGrip,
} from "./gameframe.js";
import { TREE_GROUPS } from "./scene.js";
import { isSurfOn, setSurfOn } from "./surf.js";
import { hasLoc, locHeight } from "./locmodels.js";
import { Board, nodesFor, textFor, BOARD_NOTICE, BOARD_NOTICE_TITLE } from "./board.js";
/* SEVER (object-picker): the hand-authoring scenery browser - writer only. */
import { openProps } from "./props.js";
import { pixelIcon, drawPixels } from "./pixelart.js";
import {
  appearanceFromKey, appearanceKey, defaultAppearance, randomAppearance,
  kitsReady, loadIdentityKits, COLOUR_ORDER,
} from "./identikits.js";
import { levelupScreen } from "./levelup.js";
import { EMOTES, EMOTE_HIT, emoteNamed } from "./emotes.js";
import { RenderOptions } from "./renderopts.js";
import { refreshSharpText } from "./sharp.js";

/* ===========================================================================
   ui.js — everything the player sees around the world.

   The window itself (chrome, minimap frame, tab rows, side panel edges, chat
   background, the 765x503 window) is built by src/gameframe.js from the real
   cache sprites. This file fills it in: the fourteen side panels, the
   full-frame interfaces (bank, shop, options), the chatbox, the minimap and
   compass, the orbs, the menus and the tooltips.

   Conventions
     * Coordinates in here are FRAME pixels (0,0 is the top-left of the 765x503
       window), never screen pixels. Pointer coordinates come in as client
       coordinates and are converted with Frame.toFrame().
     * Panels live inside Frame.layers.side and build their own DOM. Fixed
       panels (inventory, worn equipment, prayers, ...) place their children
       absolutely inside a 190x261 box; flowing panels (skills, emotes, music)
       lay out normally so the side panel scrolls, which is what the real
       interface does.
     * Text is the embedded bitmap font (src/fonts.css) at its native size, so
       it lands on exactly the same pixels the client would use.
   =========================================================================== */

/* ------------------------------------------------------------ skill icons */

/* The skills tab's icons are the cache's own SKILL_* sprites, matched by name
   because the sprite ids are in "when the skill was released" order, not the
   order the stats interface draws them in. */
const SKILL_SPRITE = {
  attack: "skill197", strength: "skill198", defence: "skill199", hitpoints: "skill203",
  ranged: "skill200", prayer: "skill201", magic: "skill202", runecrafting: "skill215",
  agility: "skill204", herblore: "skill205", thieving: "skill206", crafting: "skill207",
  fletching: "skill208", slayer: "skill216", hunter: "skill220", mining: "skill209",
  smithing: "skill210", fishing: "skill211", cooking: "skill212", firemaking: "skill213",
  woodcutting: "skill214", farming: "skill217", construction: "skill221",
};

/* ---------------------------------------------------------- worn equipment */

/* The worn-equipment panel's layout, [slot, x, y] — interface 387's own widget
   positions, straight out of the cache. The head is alone on the top row, the
   body column runs down the middle, and hands/feet/ring form the bottom row. */
const EQUIP_LAYOUT = [
  ["head", 78, 4],
  ["cape", 37, 43], ["amulet", 78, 43], ["ammo", 119, 43],
  ["weapon", 22, 82], ["body", 78, 82], ["shield", 134, 82],
  ["legs", 78, 122],
  ["hands", 22, 162], ["feet", 78, 162], ["ring", 134, 162],
];
const EQUIP_SLOT_SPRITE = {
  head: "slotHead", cape: "slotCape", amulet: "slotNeck", weapon: "slotWeapon",
  body: "slotTorso", shield: "slotShield", legs: "slotLegs", hands: "slotHands",
  feet: "slotFeet", ring: "slotRing", ammo: "slotAmmo",
};
const SLOT_LABEL = {
  head: "Head", cape: "Cape", amulet: "Amulet", weapon: "Weapon", body: "Body",
  shield: "Shield", legs: "Legs", hands: "Hands", feet: "Feet", ring: "Ring",
  ammo: "Ammo",
};

/* Interface 387's decorative filler tiles: eight dark tiles and four rivetted
   connectors that brake the doll's silhouette out of one flat rectangle. */
const EQUIP_FILLER = [
  ["ironRivetsVertical", 78, 39], ["ironRivetsVertical", 78, 68], ["ironRivetsVertical", 78, 105], ["ironRivetsVertical", 78, 146],
  ["ironRivetsVertical", 22, 118], ["ironRivetsVertical", 22, 154], ["ironRivetsVertical", 134, 118], ["ironRivetsVertical", 134, 154],
  ["ironRivetsHorizontal", 48, 81], ["ironRivetsHorizontal", 107, 81], ["ironRivetsHorizontal", 58, 42], ["ironRivetsHorizontal", 112, 41],
];
/* Interface 465 repeats the whole worn-equipment ring inside its own window at
   an offset of (5,67): 465's nested container sits at (21,68) and its slot tiles
   are its children, so a 387 coordinate plus (5,67) is where the same tile lands
   in the stats window. Everything drawn over the ring uses that offset. The
   window's own character is *not* part of the ring - the cache's model widget
   sits clear of it, in the middle of the window (see the character section
   below). */

/* The little 9x9 arrow frames around the two 34x34 buttons — eight sprites
   (913..920) placed at the exact coordinates interface 387 uses. */
const EQUIP_ARROWS = [
  [915, 41, 238], [913, 41, 208], [916, 72, 238], [914, 72, 208],
  [918, 50, 208], [918, 59, 208], [918, 63, 208],
  [915, 111, 238], [913, 111, 208], [916, 142, 238], [914, 142, 208],
  [918, 120, 208], [918, 129, 208], [918, 133, 208],
  [920, 50, 238], [920, 59, 238], [920, 64, 238],
  [920, 120, 238], [920, 129, 238], [920, 134, 238],
  [917, 41, 217], [917, 41, 226], [917, 41, 229],
  [919, 72, 217], [919, 72, 226], [919, 72, 229],
  [917, 111, 217], [917, 111, 226], [917, 111, 229],
  [919, 142, 217], [919, 142, 226], [919, 142, 229],
];

/* The skills panel (interface 320): three columns of eight 31px-tall tile rows.
   `Skill`, column, row. The third column is one short (this world has no
   Construction, so that cell is left empty like the live game's is empty on a
   fresh account). */
const STATS_ROWS = [0, 31, 62, 93, 124, 155, 186, 219];
const STATS_TILE_HALF = [-1, 62, 125];
const STATS_TILE_SLASH = [29, 92, 155];
const STATS_ICON_X = [[4, 4, 4, 5, 5, 5, 5, 4], [68, 68, 68, 69, 69, 69, 66, 67], [132, 132, 131, 133, 132, 132, 131, -99]];
const STATS_ICON_Y = [5, 5, 5, 5, 5, 5, 5, 4];
const STATS_TEXT_A = [33, 96, 160];
const STATS_TEXT_B = [45, 108, 172];
const STATS_GRID = [
  [0, 0, "attack"], [0, 1, "strength"], [0, 2, "defence"], [0, 3, "ranged"], [0, 4, "prayer"], [0, 5, "magic"], [0, 6, "runecrafting"], [0, 7, "construction"],
  [1, 0, "hitpoints"], [1, 1, "agility"], [1, 2, "herblore"], [1, 3, "thieving"], [1, 4, "crafting"], [1, 5, "fletching"], [1, 6, "slayer"], [1, 7, "hunter"],
  [2, 0, "mining"], [2, 1, "smithing"], [2, 2, "fishing"], [2, 3, "cooking"], [2, 4, "firemaking"], [2, 5, "woodcutting"], [2, 6, "farming"],
];
/* The interface's own hit boxes — 64x31, overlapping slightly, with the real
   "Attack XP: %1 / Next level at: %2" tooltip. */
const STATS_HIT = [
  [0, 0, "attack", 0, 2], [1, 0, "hitpoints", 64, 2], [2, 0, "mining", 126, 2],
  [0, 1, "strength", 0, 33], [1, 1, "agility", 64, 33], [2, 1, "smithing", 125, 33],
  [0, 2, "defence", 0, 64], [1, 2, "herblore", 64, 64], [2, 2, "fishing", 129, 66],
  [0, 3, "ranged", 0, 95], [1, 3, "thieving", 64, 95], [2, 3, "cooking", 125, 95],
  [0, 4, "prayer", 0, 126], [1, 4, "crafting", 66, 125], [2, 4, "firemaking", 125, 125],
  [0, 5, "magic", 1, 153], [1, 5, "fletching", 63, 157], [2, 5, "woodcutting", 126, 157],
  [0, 6, "runecrafting", -1, 187], [1, 6, "slayer", 64, 187], [2, 6, "farming", 125, 189],
  [0, 7, "construction", 0, 219], [1, 7, "hunter", 64, 219],
];

/* ------------------------------------------------------------- combat styles */

/* ------------------------------------------------------------- tab registry */

const TAB_ALIAS = {
  combat: 0, combatstyles: 0, style: 0,
  skills: 1, stats: 1,
  quests: 2, quest: 2,
  inventory: 3, inv: 3,
  equipment: 4, worn: 4, equip: 4,
  prayer: 5, prayers: 5,
  magic: 6, spellbook: 6, spells: 6,
  board: 7, boards: 7, messageboard: 7, messages: 7, chat: 7,
  friendschat: 7, clan: 7, clanchat: 7,
  friends: 8, friendlist: 8,
  online: 9, onlineplayers: 9, players: 9, roster: 9, whosonline: 9,
  logout: 10,
  options: 11, settings: 11,
  emotes: 12, emote: 12,
  music: 13, musicplayer: 13,
};

/* Panels whose contents are positioned by hand inside the 190x261 side panel
   and therefore clipped rather than scrolled. Every one of these is a cache
   interface that *is* exactly 190x261 (or, for the spellbook, 7x10 cells that
   fill it). The emote book is the one that genuinely overflows (its content is
   501px tall) so it keeps the side panel's scrollbar, as the client does. */
const FIXED_TABS = new Set([0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);

/* ---------------------------------------------------------------- settings */

const SETTINGS_KEY = "osw:settings";
/* The split private chat's own memory: the strip's lines live here rather than
   in the character save, so logging out and back in keeps the conversation -
   but only for PRIVLOG_TTL_MS (ten minutes), after which a line quietly ages
   out. The public log is deliberately not kept: only private lines persist. */
const PRIVLOG_KEY = "osw:privlog";
const PRIVLOG_TTL_MS = 10 * 60 * 1000;
/* The name the message board signs your posts with (src/ui.js#renderBoard). */
const BOARD_NICK_KEY = "osw:boardnick";
/* The hint that sits in the empty chat line. Until someone presses Enter (or
   clicks a friend's name, which asks for one) this line is the only place a new
   player is told the sandbox commands exist at all. On a touch device there is
   no keyboard to start typing on, so the hint has to be a tap instead - the
   whole chatbox is a hit area that opens one (src/ui.js#initUI). */
const CHAT_PLACEHOLDER = DEVICE.touch
  ? "tap here to type - ::help for commands"
  : "type ::help to see commands to try!";
const DEFAULT_SETTINGS = {
  brightness: 3,          // 1..4, sliders in the real options interface
  musicVolume: 3,
  soundVolume: 3,
  areaSound: 3,
  musicOff: false,
  soundOff: false,
  chatEffects: true,
  splitPrivate: false,
  acceptAid: true,
  oneButton: false,
  /* Single-mouse-button menu hold: how long a left press must be held before
     it opens the right-click menu (user ask 2026-10-27: 300ms default, player
     adjustable 100..1000ms). Read by the world input (Game.input.menuHoldMs)
     through applySettings below. */
  menuHoldMs: 300,
  walkDefault: true,      // true = the game defaults to walking
  removeRoofs: true,      // true = every building roof is hidden, everywhere (on by default at the user's request, 2026-10-09)
  /* Right-drag rotates the camera. On: a right-drag still turns the
     view, and the press still opens the menu as before - the drag cancels it
     once it passes a few pixels. Off, the right button is menu-only and only
     the arrows (or held Ctrl) turn the view. On by default. Hold Ctrl for one
     gesture either way. */
  rightRotate: true,
  /* Single-message DMs: the chat line reverts to public after one sent line.
     On ("Multiple DMs"), the line stays addressed until Escape. Off by default. */
  multipleDMs: false,
  /* Tab to reply: pressing Tab opens a compose to whoever DM'd last. On by default. */
  tabToReply: true,
  /* The renderer switches, which live in the window the options panel's "Open
     additional settings" button opens (src/ui.js#openExtraSettings) and are read
     through src/renderopts.js. Anti-aliasing, frame interpolation and the
     overhead label shadow are ON by default and the whole-number zoom is OFF, at
     the user's request (2026-09-20). */
  antialias: true,
  frameInterpolation: true,
  textShadow: true,
  /* How the frame meets the window (see src/gameframe.js#setScale): "fit"
     fills it, "exact" sits on whole screen pixels, "full" covers it edge to
     edge. Fits at the user's request - the frame fills the window. */
  frameZoom: "fit",
  /* The option list's swords roam: instead of flanking the "Select an Option"
     title, they jump to flank whichever option line the pointer is over (and
     sit on the title only while the pointer is off the dialogue box). Off, the
     swords stay on the title and only swing wide on hover, as the cache draws
     them. On at the user's request (2026-10-08). */
  roamSwords: true,
};
const settings = { ...DEFAULT_SETTINGS };

/* The renderer switches whose defaults have changed at least once (see
   src/renderopts.js). A blob written by an older build carries whatever these
   were *then*, and `loadSettings` assigns it over the defaults, so an old blob
   would silently keep the old behaviour and the new defaults would only ever
   reach a browser that had never saved its options. Dropping just these keys
   from an out-of-date blob lets the new defaults through once, without
   discarding anything the player chose for themselves. */
const RENDERER_SETTING_KEYS = ["antialias", "frameInterpolation", "textShadow", "frameZoom"];
/* Bump when a default in `DEFAULT_SETTINGS` changes, so the blobs written under
   the old one are re-defaulted (see above). */
const SETTINGS_VERSION = 4;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.v !== SETTINGS_VERSION) {
      for (const k of RENDERER_SETTING_KEYS) delete saved[k];
      /* 2026-10-09: the roofs default flipped to hidden, so an old blob's
         stored `false` is dropped once and the new default reaches existing
         players too - a player who turns roofs back on afterwards keeps that
         choice, since the blob is then re-saved at v3. */
      delete saved.removeRoofs;
      /* The zoom toggle became a three-way choice: a blob whose player had
         whole-number zoom on keeps its meaning as "exact". */
      if (saved.wholeZoom) saved.frameZoom = "exact";
    }
    /* The retired toggle must never become a setting: assigned into
       `settings` it would ride back out on the next save forever. */
    delete saved.wholeZoom;
    /* The blob's own version stamp must never become a setting: assigned into
       `settings` it would ride back out on the next save ahead of the literal
       above (spread order), cementing the old version forever and re-running
       this migration on every boot. */
    delete saved.v;
    Object.assign(settings, saved);
  } catch (e) { /* private mode, ignore */ }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ v: SETTINGS_VERSION, ...settings }));
  } catch (e) { /* ignore */ }
  applySettings();
}

/* One world's-own toggle for the modules that draw what it governs
   (src/dialogue.js#renderOptions reads `roamSwords`). */
export function extraSetting(key) { return !!settings[key]; }

/* What Split Private Chat was the last time the settings were applied: the
   off->on edge is what sweeps the log's history into the strip (see
   applySettings/backfillPrivLog). Null before the first apply, so loading with
   the switch already on does not sweep an empty log for nothing. */
let appliedSplit = null;

/* Every option that has an effect outside the options interface funnels
   through here, so a settings change is applied the moment it is made. */
function applySettings() {
  applyBrightness();  /* The two renderer switches the additional-settings window owns: the value
     the low-level modules read lives in src/renderopts.js, and anti-aliasing
     also has to reach the renderer's drawing buffer. */
  RenderOptions.antialias = !!settings.antialias;
  RenderOptions.frameInterpolation = !!settings.frameInterpolation;
  RenderOptions.textShadow = !!settings.textShadow;
  /* The frame zoom is a three-way choice, so a hand-edited blob cannot land
     it anywhere else; the frame re-fits on every change. */
  if (!["fit", "exact", "full"].includes(settings.frameZoom)) settings.frameZoom = "fit";
  RenderOptions.frameZoom = settings.frameZoom;
  if (Frame && Frame.setScale) Frame.setScale();
  const view = UI.game && UI.game.view;
  if (view) {
    view.roofsHidden = !!settings.removeRoofs;
    view.setRoofVisibility(null);
    if (view.setAntialias) view.setAntialias(RenderOptions.antialias);
  }
  /* Split private chat is the chatbox's own layout, so the frame lays it out
     (src/gameframe.js#setChatSplit) - and the public log comes back with a new
     scrollbar, so the interface's handle on it is refreshed with it. Flipping
     the switch on also sweeps the log: any private lines already
     sitting in it move into the strip, so the toggle takes effect on the
     history too, not just on new lines. */
  if (Frame.els && Frame.els.chatLog) {
    const wasSplit = appliedSplit;
    appliedSplit = !!settings.splitPrivate;
    Frame.setChatSplit(appliedSplit);
    if (appliedSplit && !wasSplit) backfillPrivLog();
    UI.els.chatScroll = Frame.els.chatScroll;
    drawPrivateChat();
  }
  /* The camera half lives in the world module (src/game.js#input), so the
     world's copy is synced whenever options are applied or saved. */
  if (UI.game) {
    UI.game.input.rightRotate = !!settings.rightRotate;
    UI.game.input.oneButton = !!settings.oneButton;
    const ms = Math.floor(Number(settings.menuHoldMs) || 300);
    UI.game.input.menuHoldMs = Math.max(100, Math.min(1000, ms));
  }
}

function applyBrightness() {
  const v = settings.brightness || 3;
  /* 1..4 -> 0.62x .. 1.16x, the direction the real slider moves in */
  const f = 0.62 + (v - 1) * 0.18;
  const vp = Frame.layers.viewport;
  if (vp) vp.style.filter = v === 3 ? "" : "brightness(" + f.toFixed(3) + ")";
}

/* ---------------------------------------------------------------------- UI */

export const UI = {
  game: null,
  ps: null,
  world: null,
  tab: DEFAULT_TAB,
  actions: {},
  els: {},
  ready: false,
  shop: null,
  /* The shop's own key in src/actions.js#SHOPS - the name its shelves are filed
     under on the world ledger, which is how a record arriving from the server
     knows whether it is about the counter on screen (see applyShopStock). */
  shopKey: null,
  /* The prayer tab's "setup quick prayers" mode (the orb's right-click menu
     opens it). While it is on, the book's cells add and remove prayers from the
     quick set instead of switching them on - see renderPrayer. */
  quickSetup: false,
  mapBase: null,
  mapCtx: null,
  effT: 0,
  hoverOwner: null,
  worldHover: { key: null, npc: null, text: null },
  /* ::boxes - the hit-box view (scene.js#setHoverBox). Off until it is asked
     for; `::boxes` toggles it. */
  boxesOn: false,
  tilesOn: false,
  /* The performance read-out (`::fps` shows it, `::perf` prints it once). The
     sampled frame times live here because the frame loop already hands this
     function its own `dt` - see perfTick. */
  perf: { on: false, samples: 0, sum: 0, worst: 0, lastMs: 0, acc: 0, text: "" },
  orbAcc: 0,
  compassAcc: -1,
  dirty: new Set(),
  chatStick: true,
  chatScrollOff: 0,
  chatMode: { public: 0, private: 0, trade: 0 },
  /* The player a private message is being written to, or null. Set by clicking a
     name in the Players Online tab, the friends ledger's "Message" or the world's
     own player menu; shown as "To <name>: " on the chat line and cleared with
     Escape (see startPM). */
  pmTarget: null,
  /* Whoever DM'd this player last (incoming only) - what Tab replies to. */
  lastPM: null,
  /* The private lines the above-chatbox split display is showing, newest last;
     the box itself draws only the last five of them (see privateMessage). */
  privLog: [],
  /* The private-message calls themselves live at module scope (a private line is
     the chatbox's business, not a tab's); these are the handles src/main.js wires
     the socket to - deps.onPM / deps.onPMInfo. */
  privateMessage: (name, text, outgoing) => privateMessage(name, text, outgoing),
  privateMessageInfo: (reason) => privateMessageInfo(reason),
  startPM: (target) => startPM(target),
  friends: [],
  flashTabs: new Set(),
  flashOn: false,
  flashAcc: 0,
  pendingChat: [],
  /* Lines that arrived while a dialogue was covering the chatbox. The client
     keeps adding to its message log behind an interface, so the lines are held
     here and replayed when the box closes (see chat / closeChatDialog) rather
     than dropped - a level-up dialogue used to swallow the combat messages of
     the fight that caused it. */
  deferredChat: [],
  pendingName: null,
  pendingAmount: null,
  amountInput: null,
  /* The spell picked in the spellbook, by interface id (see src/magic.js). The
     next NPC clicked is cast at until the selection is cleared. */
  spell: null,
  /* The item on the cursor: the client's **Use mode**, entered from the
     inventory item menu's own "Use" option (src/ui.js#startUse). `{ id, index }`
     - the id so the cursor icon and the use-with rules can read it, the index so
     the slot the item came out of is the one a spend empties. Null when nothing
     is being used, which is every moment outside a use. */
  useItem: null,
  /* Which spellbook the magic tab is showing: "standard", "ancient" or
     "lunar" (src/magic.js#BOOKS). The cache has no switch widget - in the live
     2007 game you changed books by praying at an altar - so the tab carries one
     plain-font line naming the book, and clicking it cycles to the next one. */
  book: "standard",
  /* Auto retaliate: the client's own combat-panel toggle, on when you log in.
     While it is on, being struck by a creature you are not already fighting
     starts a fight back with it (see src/combat.js#npcStrikeHit). */
  autoRetaliate: true,
  /* The message board's own state: the last name it posted under, and the
     elements its panel is currently built from (null until the tab is opened,
     which is what lets a post arriving while the tab is shut simply sit in
     src/board.js#Board.messages until someone looks). */
  boardNick: null,
  boardFeed: null,
  boardStatus: null,
  boardInput: null,
  boardNickInput: null,
};

let G = null;

const iconCache = new Map();
/* A stack draws its own tier sprite (see src/icons.js#stackSpriteFor), so a
   slot's icon is keyed by the sprite it resolved to rather than by the item -
   otherwise the first quantity to ask would fix the picture for every later one. */
function itemIcon(id, size = 32, qty = 0) {
  const key = (stackSpriteFor(id, qty) || id) + ":" + size;
  let u = iconCache.get(key);
  if (!u) { u = iconUrl(id, size, qty); iconCache.set(key, u); }
  return u;
}

function skillSprite(id) {
  return SKILL_SPRITE[id] || null;
}

/* ------------------------------------------------------------------ helpers */

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* A fixed-size sprite sitting somewhere on the interface. */
function spriteEl(name, cls) {
  const d = mk("div", "spr" + (cls ? " " + cls : ""));
  Frame.setBg(d, name);
  return d;
}

/* A sprite used as a *tile* inside a flow layout (an inventory slot), so it
   must not become absolutely positioned. */
function tileEl(name, cls) {
  const d = mk("div", "tilebg" + (cls ? " " + cls : ""));
  Frame.bg(d, name);
  return d;
}

function place(e, x, y, w, h) {
  e.style.left = x + "px";
  e.style.top = y + "px";
  if (w != null) e.style.width = w + "px";
  if (h != null) e.style.height = h + "px";
  return e;
}

/* ------------------------------------------------- pixel-exact interface bits */

/* One sprite component, drawn where the cache puts it. `x`,`y` are the widget's
   top-left inside the side panel; the frame's own offsetX/offsetY (the sprite
   frames are trimmed to their painted pixels) takes it to the exact pixel the
   client blits at, so a 13x9 icon still lands in the middle of its 24x24 cell. */
function pxSprite(panel, name, x, y, opt = {}) {
  const p = Frame.parts[name];
  if (!p) return null;
  const e = spriteEl(name, opt.cls);
  place(e, x + (p.offX || 0), y + (p.offY || 0), p.w, p.h);
  panel.appendChild(e);
  return e;
}

/* A tiled sprite widget (the cache's tile flag): the client repeats the whole
   maxW x maxH cell across the widget's box, starting at the widget's own
   top-left, with the cell's art sitting at its frame offset (the rivet list
   frames are four corners plus four tiled edges). We repeat the *trimmed*
   frame at 1:1 and clip to the widget box, which lands on the same pixels.

   `artStep` is for the handful of strips the client repeats by their own
   trimmed size instead of by a cell: the trade window's edge strips are 32x7
   slivers inside a 32x32 cell, and repeating the *cell* would leave the box
   empty (a 424x34 box would hold two slivers). Passing it tiles by the art. */
function pxTiled(panel, name, x, y, w, h, artStep) {
  const p = Frame.parts[name];
  if (!p) return null;
  const clip = mk("div", "pxTiled");
  place(clip, x, y, w, h);
  const cw = artStep ? p.w : (p.maxW || p.w);
  const ch = artStep ? p.h : (p.maxH || p.h);
  for (let ty = 0; ty < h; ty += ch) {
    for (let tx = 0; tx < w; tx += cw) {
      const e = spriteEl(name);
      place(e, tx + (p.offX || 0), ty + (p.offY || 0), p.w, p.h);
      clip.appendChild(e);
    }
  }
  panel.appendChild(clip);
  return clip;
}

/* One text component: the interface's own box, font, colour and alignment. The
   cache stores the horizontal alignment (0/1/2 = left/centre/right) and a
   vertical one (0/1/2 = top/middle/bottom); the client centres each line in the
   box, so the text fills the box and text-align does the work.

   The fourth field of each entry is the `padding-top` a top-aligned line needs
   so its *baseline* lands where the client puts it. The client draws the first
   line's baseline at `widget_y + fontHeight` (see drawInterface in the 317
   client), and our baked bitmap font has its own baseline one pixel higher than
   the client's cell bottom, so the target offset inside the box is
   `fontHeight - 1` (9 for plain11, 11 for plain12/bold12). The browsers place
   the baseline at `(lineHeight - (ascent+descent))/2 + ascent`, which for these
   fonts is 8.0 at line-height 11 (plain11) and 8.8 at line-height 12
   (plain12/bold12) - hence the 1px and 2px nudges below. Line-height is left at
   the client's own line step so multi-line widgets keep the right spacing. */
const PX_FONTS = {
  plain11: ['"rs-plain11", monospace', 10, 11, 1],
  plain12: ['"rs-plain12", monospace', 12, 12, 2],
  bold12: ['"rs-bold12", monospace', 12, 12, 2],
  /* quill8 (font 497) is the dialogue font: every chatbox dialogue interface
     draws its name, lines and "Click here to continue" in it (see
     src/dialogue.js). Its fontHeight is 15, so the same "+1 in the box"
     convention applies, and the browser puts the baseline 11.2px below the line
     box at that size (measured; the gameframe's .weaponName is the other user
     of this font and carries the same 2.8). */
  quill8: ['"rs-quill8", monospace', 15, 15, 2.8],
};

function pxText(panel, str, x, y, w, h, opt = {}) {
  const e = mk("div", "pxText" + (opt.cls ? " " + opt.cls : ""));
  e.textContent = str;
  const [family, size, lh, padTop] = PX_FONTS[opt.font || "plain11"];
  place(e, x, y, w, h);
  e.style.fontFamily = family;
  e.style.fontSize = size + "px";
  e.style.lineHeight = (opt.lineHeight || lh) + "px";
  e.style.color = opt.color || "#ffd97a";
  if (opt.shadow !== false) e.style.textShadow = "1px 1px 0 #000";
  e.style.justifyContent = ["flex-start", "center", "flex-end"][opt.valign || 0];
  e.style.alignItems = "stretch";
  e.style.textAlign = ["left", "center", "right"][opt.align || 0];
  if (opt.nowrap) e.style.whiteSpace = "nowrap";
  if (!opt.valign) e.style.paddingTop = padTop + "px";
  panel.appendChild(e);
  return e;
}

/* A text component whose string carries the interface format's own markup:
   `<br>` for a line break and `<col=RRGGBB>` to switch colour mid-line (see
   interface 334's warning line, which turns red for the words NO WAY). The
   client parses these tags while drawing, so the colour is part of the widget,
   not of the text - which is why they are rendered here and not escaped.

   Each line is a block of its own rather than a run of text with a `<br>` in it:
   `pxText`'s box is a flex column, and inside a flex container a `<br>` becomes
   an item of its own that takes the line's height, so a two-line string came out
   three lines tall and spilled out of any box sized for two - the name screen's
   hint ended up written across the "Name" label below it. A block span per line
   keeps a multi-line widget's height what its line count says it is, whatever
   the box around it. */
function pxRich(panel, str, x, y, w, h, opt = {}) {
  const e = pxText(panel, "", x, y, w, h, opt);
  let colour = opt.color || "#ffd97a";
  for (const line of String(str).split("<br>")) {
    const row = mk("span", null);
    row.style.display = "block";
    for (const part of line.split(/(<col=[0-9a-fA-F]{6}>)/g)) {
      if (!part) continue;
      const m = /^<col=([0-9a-fA-F]{6})>$/.exec(part);
      if (m) { colour = "#" + m[1]; continue; }
      const span = mk("span", null, part);
      span.style.color = colour;
      row.appendChild(span);
    }
    e.appendChild(row);
  }
  return e;
}

/* A flat filled rectangle component (widget type 3). The cache's alpha byte maps
   straight to a 0..1 opacity (the client draws the alpha version with 256-alpha,
   and treats alpha 0 as a solid fill). */function pxRect(panel, x, y, w, h, colour, alpha) {
  const e = mk("div", "pxRect");
  place(e, x, y, w, h);
  e.style.background = colour;
  if (alpha != null && alpha > 0) e.style.opacity = String(Math.min(1, alpha / 256));
  panel.appendChild(e);
  return e;
}

/* A scrollbar grip, painted the way the client paints one (see
   `gameframe.js#paintGrip`, which the frame's own bars go through too). */
function pxGrip(panel, x, y, w, h) {
  return paintGrip(pxRect(panel, x, y, w, h, SCROLLBAR_COLORS.grip, 0));
}

/* The action-able wrapper: a transparent hit box over a sprite, with the
   interface's own action verb as the tooltip. */
/* A one-pixel outline in a widget's own colour (the cache's "unfilled"
   rectangle components - the special-attack bar's yellow frame is one). */
function pxFrame(panel, x, y, w, h, colour) {
  const e = mk("div", "pxRect");
  place(e, x, y, w, h);
  e.style.border = "1px solid " + colour;
  e.style.boxSizing = "border-box";
  panel.appendChild(e);
  return e;
}

function pxHit(panel, x, y, w, h, tip, fn) {
  const e = mk("div", "pxHit");
  place(e, x, y, w, h);
  /* Only the styled tip: a native `title` would pop a browser tooltip next to
     the cursor, doubling up on the client-style hover text. */
  if (tip) { e.addEventListener("pointerenter", () => showHoverTip(tip)); e.addEventListener("pointerleave", hideHoverTip); }
  if (fn) e.addEventListener("click", fn);
  panel.appendChild(e);
  return e;
}

/* --------------------------------------------------------------- dirty flags */

export function mark(...kinds) {
  for (const k of kinds) {
    UI.dirty.add(k);
    /* The spellbook's cell icons are lit only while a spell is both affordable
       and castable, so anything that moves your runes or your Magic level has
       to redraw the tab as well - otherwise a spend or a level-up leaves the
       book showing spells you can no longer pay for. */
    if (k === "inv" || k === "magic" || k === "skills") UI.dirty.add("magic");
  }
}

/* -------------------------------------------------------------------- chat */

/* The client's own chatbox history: 100 messages, with the 101st pushing the
   oldest line out of the top of the log. The 2007 client keeps exactly this
   many (`chatMessages` is a hundred long) and drops the oldest as a new one
   arrives, which is what keeps a busy world's chatbox scrolling rather than
   growing without bound. */
export const CHAT_LOG_LIMIT = 100;

/* Chat lines are the client's own: game messages black, another player's chat
   a black "Name:" followed by a blue message, private chat dark red, trade
   purple, level-ups 0x7e3200 (see drawChatArea in the 2007 client), and the
   world's death announcement (src/deaths.js) the same dark red a warning uses -
   it is the one line in the box that is always bad news. */
const BAKED_MOD_BADGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAALCAYAAACksgdhAAAASUlEQVR42mO4MFflPwMWgFf8/7/2/2gKwGLf/3NjFSdbE7oCGB+CMcUp0IQkQAAjNJClCUMjkAnCKGxMDZiakGkaaAIJ4sEomgDO7AsJnHD71QAAAABJRU5ErkJggg==";
const STOCK_MOD_BADGE_URL = "https://user.uploads.dev/file/847bb03c8da62399d2463f66e2de98fc.png";
function modBadgeUrl() {
  let u = "";
  try { u = String((typeof root !== "undefined" && root.modBadge) || ""); } catch (e) {}
  if (!u || u === STOCK_MOD_BADGE_URL) return BAKED_MOD_BADGE;
  return u;
}
function warmModBadge() {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = modBadgeUrl();
    if (img.decode) img.decode().catch(() => {});
  } catch (e) {}
}
export function chat(msg, cls = "game", name, isMod, opts) {
  if (!UI.els.chatLog) {
    UI.pendingChat.push([msg, cls, name, isMod, opts]);
    return;
  }
  if (UI.els.chatDialog && !UI.els.chatDialog.hidden) {
    UI.deferredChat.push([msg, cls, name, isMod, opts]);
    if (UI.deferredChat.length > 100) UI.deferredChat.shift();
    return;
  }
  const line = mk("div", "line " + cls);
  if (name && (cls === "other" || cls === "pub" || cls === "priv")) {
    if (isMod == null && cls !== "priv") {
      try {
        const m = (typeof root !== "undefined" && root.modAccount) || "";
        if (m && String(name).toLowerCase() === String(m).toLowerCase()) isMod = true;
      } catch (e) {}
    }
    if (isMod && cls !== "priv") {
      const badgeUrl = modBadgeUrl();
      if (badgeUrl) {
        const img = document.createElement("img");
        img.className = "modbadge";
        img.decoding = "sync";
        img.src = badgeUrl;
        img.alt = "[MOD]";
        img.onerror = () => {
          const pill = mk("span", "modbadge", "MOD");
          img.replaceWith(pill);
        };
        line.appendChild(img);
      } else {
        line.appendChild(mk("span", "modbadge", "MOD"));
      }
    }
    line.appendChild(mk("b", null, name + ":"));
    line.appendChild(mk("span", null, " " + msg));
  } else {
    line.textContent = msg;
  }
  /* An interactive line: the trade invitation (src/trade.js#onRequest) answers
     from the log itself - a left click takes the line's action, a right click
     opens its menu - instead of a modal box over the game. */
  if (opts && (opts.onClick || opts.menuOptions)) {
    line.classList.add("chatlink");
    line.style.cursor = "pointer";
    if (opts.tag) line.dataset.tag = opts.tag;
    if (opts.onClick) line.addEventListener("click", (e) => { opts.onClick(e); });
    if (opts.menuOptions) rightMenu(line, (e) => openCtx(e.clientX, e.clientY, opts.menuTitle || "Choose Option", opts.menuOptions));
  }
  /* A private line printed under a mode that hides it starts hidden (Friends
     hides strangers, Off hides everything - see refilterPrivHistory). */
  if (line.classList.contains("priv")) {
    const info = privLogLineInfo(line);
    if (info) line.hidden = !privAllowed(info.name, info.outgoing);
  }
  const inner = UI.els.chatLogInner;
  /* The log grows upwards from its anchored bottom edge, so a line arriving
     while the player is scrolled back would push the text they are reading up
     out of the window. Adding the appended height to the offset holds their
     place instead - and a line dropped off the top by the limit moves nothing
     on screen, because it takes the same height out of the top (see
     chatScrollbar for what the offset means). */
  const before = inner.scrollHeight;
  inner.appendChild(line);
  if (!UI.chatStick) UI.chatScrollOff += inner.scrollHeight - before;
  while (inner.childNodes.length > CHAT_LOG_LIMIT) inner.removeChild(inner.firstChild);
  if (UI.chatStick) UI.chatScrollOff = 0;
  chatScrollbar();
}

/* ------------------------------------------------------ private messages

   A private line is one player's message to one other player, and where one
   is drawn is the client's own "Split private chat" option: with it on,
   private lines print in cyan above the chatbox
   (src/gameframe.js#setChatSplit) and never appear in the log; with it off
   they are ordinary log lines in the client's private-chat colour. Both
   halves live in the strip, so the whole conversation sits in one place.

   The filter is the chatbox's own "Private chat" mode (On / Friends / Off). Off
   is handled before this is ever called: the server refuses the message at the
   sender's end, because the setting is announced to it (src/net.js#netSetPrivacy).
   Friends is ours to apply - the server cannot read anybody's friends list - so
   a line from somebody who is not on the list is dropped here, silently, which
   is exactly what "Friends" means to the sender as well.

   Split private chat moves private lines out of the log and into the strip
   above the chatbox - incoming and outgoing both, so the whole conversation
   sits in one place. */
function privateMessage(name, text, outgoing) {
  const who = name || "Player";
  if (!outgoing && (UI.chatMode.private || 0) === 1
    && !UI.friends.some((f) => f.name.toLowerCase() === who.toLowerCase())) return;
  /* Incoming only: an outgoing line is this player's own half, not somebody
     DMing them, so it must never become who Tab replies to. */
  if (!outgoing) UI.lastPM = who;
  if (settings.splitPrivate) {
    UI.privLog.push({ who, text, outgoing, at: Date.now() });
    while (UI.privLog.length > 50) UI.privLog.shift();
    savePrivLog();
    drawPrivateChat();
    return;
  }
  chat(text, "priv", outgoing ? "To " + who : who);
}

/* Sweep the main log's private lines into the strip: flipping Split Private
   Chat on takes effect on the history too, not just on new lines - incoming
   and outgoing both, so the whole conversation moves. Swept lines read as new
   for the ten-minute memory (they were re-seen now), and their log rows are
   removed, so a later sweep can never double them. */
function backfillPrivLog() {
  const inner = UI.els.chatLogInner;
  if (!inner) return;
  const now = Date.now();
  let moved = false;
  for (const line of [...inner.children]) {
    if (!line.classList || !line.classList.contains("priv")) continue;
    const b = line.querySelector("b");
    const span = line.querySelector("span");
    if (!b || !span) continue;
    const raw = b.textContent.replace(/:$/, "");
    const out = /^To /.test(raw);
    const name = out ? raw.replace(/^To /, "") : raw;
    if (!name) continue;
    UI.privLog.push({ who: name, text: span.textContent.replace(/^ /, ""), outgoing: out, at: now });
    inner.removeChild(line);
    moved = true;
  }
  if (!moved) return;
  while (UI.privLog.length > 50) UI.privLog.shift();
  savePrivLog();
  drawPrivateChat();
  chatScrollbar();
}

/* Who a private log row belongs to: the bold "Name:" ("To Name:" for our own
   half), shared by the sweep above and the mode filter below. */
function privLogLineInfo(line) {
  const b = line.querySelector("b");
  if (!b) return null;
  const raw = b.textContent.replace(/:$/, "");
  const out = /^To /.test(raw);
  const name = out ? raw.replace(/^To /, "") : raw;
  if (!name) return null;
  return { name, outgoing: out };
}

/* Whether a private line may show under the current Private chat mode: Off
   hides everything, Friends hides incoming lines from strangers (our own
   half always shows), On shows all. */
function privAllowed(name, outgoing) {
  const mode = UI.chatMode.private || 0;
  if (mode === 2) return false;
  if (mode === 1 && !outgoing
    && !UI.friends.some((f) => f && f.name && f.name.toLowerCase() === String(name).toLowerCase())) return false;
  return true;
}

/* Cycling Private chat On/Friends/Off takes effect on the history too, not
   just on new lines: hidden rows stay in the log (nothing is deleted), so
   cycling back to On brings them back. */
function refilterPrivHistory() {
  const inner = UI.els.chatLogInner;
  if (inner) {
    for (const line of [...inner.children]) {
      if (!line.classList || !line.classList.contains("priv")) continue;
      const info = privLogLineInfo(line);
      line.hidden = info ? !privAllowed(info.name, info.outgoing) : false;
    }
    chatScrollbar();
  }
  drawPrivateChat();
}

/* The right-click menu's "Clear messages": every private line goes, from the
   log and from the strip's ten-minute memory both. */
function clearPrivateMessages() {
  const inner = UI.els.chatLogInner;
  if (inner) {
    for (const line of [...inner.children]) {
      if (line.classList && line.classList.contains("priv")) inner.removeChild(line);
    }
    chatScrollbar();
  }
  UI.privLog.length = 0;
  savePrivLog();
  drawPrivateChat();
}

/* Write the strip's lines through to their store, dropping anything already
   past its ten minutes on the way out so the blob never carries the dead. */
function savePrivLog() {
  try {
    const now = Date.now();
    const live = UI.privLog.filter((l) => l && (now - (l.at || 0)) < PRIVLOG_TTL_MS).slice(-50);
    localStorage.setItem(PRIVLOG_KEY, JSON.stringify(live));
  } catch (e) {}
}

/* Bring the strip back after a logout: whatever is still inside its ten
   minutes is re-laid, the rest stays forgotten. Garbage in the store (a
   half-written blob, a wrong shape) reads as an empty strip, never a crash. */
function restorePrivLog() {
  let raw = null;
  try { raw = localStorage.getItem(PRIVLOG_KEY); } catch (e) {}
  if (!raw) return;
  try {
    const now = Date.now();
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return;
    UI.privLog = rows.filter((l) => l && typeof l.who === "string" && typeof l.text === "string"
      && typeof l.at === "number" && (now - l.at) < PRIVLOG_TTL_MS).slice(-50);
  } catch (e) {}
  drawPrivateChat();
}

/* The above-chatbox lines: the last five, anchored to the bottom of the box so
   the newest sits closest to the chatbox, in the client's cyan for split
   private lines. */
function drawPrivateChat() {
  const inner = UI.els.chatPrivAboveInner;
  if (!inner) return;
  inner.textContent = "";
  for (const line of UI.privLog.filter((l) => privAllowed(l.who, l.outgoing)).slice(-5)) {
    const row = mk("div", "line");
    row.appendChild(mk("b", null, (line.outgoing ? "To " + line.who : "From " + line.who) + ":"));
    row.appendChild(mk("span", null, " " + line.text));
    inner.appendChild(row);
  }
}

/* The server's answer to a private message that never arrived: the sentence
   that matches, the way a trade's refusals are printed (a player with private
   chat off is reported as offline, as the live game does). */
function privateMessageInfo(reason) {
  if (reason === PM_INFO.SELF) chat("You cannot message yourself.", "warn");
  else if (reason === PM_INFO.RATE) chat("You are sending private messages too quickly.", "warn");
  else chat("That player is not online.", "warn");
}

/* Start (or change) the private message the chat line is writing: the client's
   own gesture, which the Players Online tab does with a left-click and the
   friends list with a left-click or its right-click "Message". The line stays
   an ordinary addressed line throughout - "To <name>:" prefix, "Message <name>"
   hint - and the message goes to the friend when it is sent. */
function startPM(target) {
  if (!target || !target.name) return;
  UI.pmTarget = { id: target.id, name: target.name };
  const input = UI.els.chatInput;
  if (input) {
    input.placeholder = "Message " + target.name;
  }
  layoutChatInput();
  if (input) input.focus();
  /* The "Messaging <name>" line flashes a soft yellow wash as it lands, so the
     eye catches which conversation just opened - one small unobtrusive pulse,
     then it sits as an ordinary game line. A background does the flashing
     because the line's own text is baked onto the sharp-text canvas. */
  const logOpen = !!(UI.els.chatDialog && UI.els.chatDialog.hidden);
  chat(settings.multipleDMs
    ? "Messaging " + target.name + ". Press Escape to stop."
    : "Messaging " + target.name + ".", "game");
  if (logOpen) {
    const line = UI.els.chatLogInner && UI.els.chatLogInner.lastChild;
    if (line) {
      line.classList.add("msgflash");
      line.addEventListener("animationend", () => line.classList.remove("msgflash"), { once: true });
    }
  }
}

function stopPM() {
  if (!UI.pmTarget) return;
  UI.pmTarget = null;
  const input = UI.els.chatInput;
  if (input && !UI.pendingName) input.placeholder = CHAT_PLACEHOLDER;
  layoutChatInput();
}

/* One addressed line to the friend the chat line is addressed to. Single-shot
   by default: the line reverts to public after the one send unless "Multiple
   DMs" is on (see sendChatInput). */
function sendPm(said) {
  if (!UI.pmTarget) return;
  netPM(UI.pmTarget.id, UI.pmTarget.name, said);
  if (!settings.multipleDMs) stopPM();
}

/* The friends ledger's "Message": a friend is written to by finding them on the
   world's roster, because a friends list is only names - a name with no live
   connection behind it cannot be messaged at all. */
export function messageFriend(name) {
  const peer = (Net.rosterList || []).find((p) => p && p.name && p.name.toLowerCase() === name.toLowerCase());
  if (peer) startPM(peer);
  else chat("That player is not online.", "warn");
}

/* Everyone the world server says is in the world, as names (src/net.js keeps
   `Net.rosterList` off the roster packet). This - not the nearby ghost list - is
   what `::tp`'s usage line prints: the Players Online tab shows the whole world,
   and the two sets are deliberately different (a ghost exists only for a player
   close enough to be drawn). */
function rosterNames() {
  return (Net.rosterList || []).filter((p) => p && p.name).map((p) => p.name);
}

/* Resolve what the player typed to somebody: the nearby ghosts first - a
   teleport to one of those needs no round trip, because the client already has
   their tile - and then the roster, which is who may be teleported to at all.
   Exact name beats a prefix, case-insensitively, in both sets; two players
   sharing a name resolve to the first, the same "first record wins" the server's
   own `where` follows. Returns `{name, ghost|null}`, or null when nobody
   matches. */
function findPlayer(wanted) {
  const lower = wanted.toLowerCase();
  const ghosts = (G.ghosts ? [...G.ghosts.values()] : []).filter((g) => g.name);
  const near = ghosts.find((g) => g.name.toLowerCase() === lower) || ghosts.find((g) => g.name.toLowerCase().startsWith(lower));
  if (near) return { name: near.name, ghost: near };
  const names = rosterNames();
  const match = names.find((n) => n.toLowerCase() === lower) || names.find((n) => n.toLowerCase().startsWith(lower));
  return match ? { name: match, ghost: null } : null;
}

/* Put the player on a tile, exactly as `::tp <x> <z>` does. The destination is
   occupied by the player being teleported to, and `placeEntity` never puts two
   characters on one tile - it swaps an occupied destination for the nearest free
   tile - so this lands *beside* them rather than inside them. */
function teleportToPlayer(name, tx, tz) {
  G.player.path.length = 0;
  if (G.follow) stopFollowing();
  placeEntity(G.player, tx + 0.5, tz + 0.5, G.player.dir, 0);
  if (G.view && G.view.setDest) G.view.setDest();
  chat("Teleported to " + name + ".", "game");
}

/* The chatbox scrollbar reflects how far back through the log you are. The log
   itself is anchored to the bottom of its window (the real chatbox grows
   upwards as lines are added), so "scrolled back" means translating the log
   down by the number of pixels of history above the window. Three gestures
   drive the offset and they all end up here: the wheel (below), and the
   scrollbar's own arrows, track and grip (src/gameframe.js#_buildScrollbar,
   through the frame's `onChatScroll` hook). */
function chatScrollbar() {
  const sb = UI.els.chatScroll;
  const log = UI.els.chatLog;
  const inner = UI.els.chatLogInner;
  if (!sb || !log || !inner) return;
  const max = Math.max(0, inner.scrollHeight - log.clientHeight);
  UI.chatScrollOff = Math.max(0, Math.min(max, UI.chatScrollOff));
  UI.chatStick = max <= 0 || UI.chatScrollOff <= 2;
  inner.style.transform = UI.chatScrollOff ? "translateY(" + UI.chatScrollOff + "px)" : "";
  /* the grip's length is a function of how much text is in the log, so the
     content height goes with the position (gameframe.js#scrollbarGrip) */
  sb.set(max > 0, max > 0 ? 1 - UI.chatScrollOff / max : 1, inner.scrollHeight);
}

/* A fraction of the way down the log, 1 being the newest line: the scrollbar's
   own language, so its callbacks need no conversion. */
function setChatScroll(frac) {
  const log = UI.els.chatLog;
  const inner = UI.els.chatLogInner;
  if (!log || !inner) return;
  const max = Math.max(0, inner.scrollHeight - log.clientHeight);
  UI.chatScrollOff = (1 - Math.max(0, Math.min(1, frac))) * max;
  chatScrollbar();
}

/* --------------------------------------------------- side panel scrollbar */

/* The client draws a scrollbar on the right of any interface taller than the
   space it is given (the 2007 client draws it at x = interfaceX +
   interfaceWidth, i.e. the right edge of the scrolling list). For the side panel
   that is the right-hand 16px of the 190px panel, which is exactly where the
   real tabs show it - see the Music Player tab, whose list box is 174 wide with
   the scrollbar in the last 16px. Arrows, track and grip are all the client's
   own (src/gameframe.js#scrollbarGrip / paintGrip), so this bar is the same
   widget as the chatbox's, the bank's and the shop's. */
const SIDE_SB = { x: SIDE.x + SIDE.w - 16, y: SIDE.y, w: 16, h: SIDE.h };

function buildSideScrollbar() {
  const root = mk("div", "sidescroll");
  place(root, SIDE_SB.x, SIDE_SB.y, SIDE_SB.w, SIDE_SB.h);
  root.hidden = true;
  root.style.pointerEvents = "auto";

  const up = spriteEl("scrollUp");
  place(up, 0, 0);
  const down = spriteEl("scrollDown");
  place(down, 0, SIDE_SB.h - 16);
  root.appendChild(up);
  root.appendChild(down);

  pxRect(root, 0, 16, SIDE_SB.w, SIDE_SB.h - 32, SCROLLBAR_COLORS.track, 0);
  const grip = pxGrip(root, 0, 16, SIDE_SB.w, 8);

  const track = SIDE_SB.h - 32;
  const step = (d) => {
    const sb = UI.els.sideBody;
    if (sb) sb.scrollTop += d;
  };
  const jump = (clientY) => {
    const sb = UI.els.sideBody;
    if (!sb) return;
    const r = root.getBoundingClientRect();
    const y = (clientY - r.top) / (r.height / SIDE_SB.h);
    const max = Math.max(1, sb.scrollHeight - sb.clientHeight);
    sb.scrollTop = ((y - 16) / Math.max(1, track)) * max;
  };
  root.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const r = root.getBoundingClientRect();
    const y = (e.clientY - r.top) / (r.height / SIDE_SB.h);
    if (y < 16) step(-24);
    else if (y > SIDE_SB.h - 16) step(24);
    else jump(e.clientY);
  });
  root.addEventListener("wheel", (e) => {
    e.preventDefault();
    step(e.deltaY > 0 ? 24 : -24);
  }, { passive: false });

  /* The grip is draggable, which is the gesture a scrollbar is for - the same
     pointer-capture dance the frame's bars do (src/gameframe.js), so a drag that
     strays off the 16px bar keeps working and the grip does not jump under the
     cursor. */
  grip.style.pointerEvents = "auto";
  grip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const sb = UI.els.sideBody;
    if (!sb) return;
    const r = root.getBoundingClientRect();
    const scale = r.height / SIDE_SB.h;
    const y = (e.clientY - r.top) / scale;
    const g0 = scrollbarGrip(SIDE_SB.h, sb.scrollHeight, sb.scrollTop);
    const span = Math.max(1, g0.track - g0.length);
    const grab = y - 16 - g0.offset;
    const max = Math.max(1, sb.scrollHeight - sb.clientHeight);
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    const move = (ev) => {
      const yy = (ev.clientY - r.top) / scale;
      sb.scrollTop = (Math.max(0, Math.min(span, yy - 16 - grab)) / span) * max;
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });

  UI.els.sideScrollbar = { root, grip, track };
  return UI.els.sideScrollbar;
}

/* Show, hide and position the side scrollbar for whatever the panel is now
   showing. Hidden whenever the interface fits, exactly like the client, and the
   grip is placed with the client's own arithmetic (gameframe.js#scrollbarGrip)
   over the panel's real scroll box. */
function updateSideScrollbar() {
  const sb = UI.els.sideBody;
  if (!sb) return;
  const s = UI.els.sideScrollbar || buildSideScrollbar();
  const max = sb.scrollHeight - sb.clientHeight;
  const visible = max > 1;
  s.root.hidden = !visible;
  sb.classList.toggle("scrolling", visible);
  if (!visible) return;
  const g = scrollbarGrip(SIDE_SB.h, sb.scrollHeight, sb.scrollTop);
  s.grip.style.height = g.length + "px";
  s.grip.style.top = (16 + g.offset) + "px";
}

/* The "click here to continue" dialog the client draws in the chat area itself
   (bold, centred, with the prompt underneath in navy). The client draws it at
   the *bottom* of the chatbox, not the top: setDrawingArea(77,...) then
   drawCentredText(text, 239, 40) and ("Click to continue", 239, 60) - so the
   prompt's baseline is 60px down the 96px chatbox and the message sits 20px
   above it. `239` is the centre of the full 479px chatbox, and a client `y` is
   a baseline, so each line's box top is `y - 1 - 9.6` (9.6 = the bold font's
   baseline offset in a 14px line box). */
const DIALOG_OFFSET = 9.6;

/* An open dialogue takes the whole chatbox: the client draws the message log,
   its own "Name:" prefix, the input line and the underscore under it only in
   the branch of drawChatArea that has no interface laid over the area, so every
   one of them is hidden while one is up (the CSS rule on `.chat.dialogopen`
   names them in one place; it spares `canvas.sharpLayer`, because the dialogue's
   own baked-font pixels live on that canvas - see src/style.css and
   src/sharp.js). The chat mode buttons are a separate layer and stay - which is
   what the client does too. */
export function setChatDialogOpen(open) {
  const d = UI.els.chatDialog;
  if (d && d.parentElement) d.parentElement.classList.toggle("dialogopen", !!open);
}

export function showChatDialog(lines, onContinue) {
  const d = UI.els.chatDialog;
  if (!d) return;
  d.innerHTML = "";
  const n = lines.length + 1;
  const place1 = (el, top) => { el.style.top = Math.round(top) + "px"; };
  for (let i = 0; i < lines.length; i++) {
    const el = mk("div", null, lines[i]);
    place1(el, 59 - DIALOG_OFFSET - (n - 1 - i) * 20);
    d.appendChild(el);
  }
  const cont = mk("div", "cont", "Click here to continue");
  place1(cont, 59 - DIALOG_OFFSET);
  d.appendChild(cont);
  d.hidden = false;
  d._onContinue = onContinue;
  setChatDialogOpen(true);
}

export function closeChatDialog() {
  const d = UI.els.chatDialog;
  if (!d || d.hidden) return;
  d.hidden = true;
  d.innerHTML = "";
  UI.amountInput = null;
  setChatDialogOpen(false);
  /* the chatbox is readable again, so anything the game said behind the box
     lands now, in the order it was said */
  if (UI.deferredChat.length) {
    const queued = UI.deferredChat.splice(0);
    for (const [m, c, n, mod, o] of queued) chat(m, c, n, mod, o);
  }
  const fn = d._onContinue;
  d._onContinue = null;
  /* A conversation that was up in the chatbox has to know it is gone - Escape
     and the level-up dialogues close it without going through src/dialogue.js -
     so the hook is told before the callback runs. It is nulled first so a
     dialogue that closes itself cannot re-enter here. */
  const closed = UI.chatDialogClosed;
  UI.chatDialogClosed = null;
  UI.chatDialogClick = null;
  if (closed) closed();
  if (fn) fn();
}

export function sendChatInput() {
  const input = UI.els.chatInput;
  if (!input) return;
  const text = (input.value || "").trim();
  input.value = "";
  layoutChatInput();
  /* "Withdraw X" / "Deposit X" asked for an amount: this line is that amount.
     Exactly what was typed is remembered as its own menu row (a stack of 1
     keeps the 14, and the move itself is clamped to what is there); an empty
     line or 0 removes the row. Only the bank's two kinds read the chat line -
     every other prompt (Make X, tan X, Offer X, Remove X) owns its own amount
     box, so the chat line stays chat and is never eaten by them. */
  if (UI.pendingAmount && (UI.pendingAmount.kind === "deposit" || UI.pendingAmount.kind === "withdraw")) {
    const { kind, index } = UI.pendingAmount;
    UI.pendingAmount = null;
    closeChatDialog();
    const digits = text.replace(/\D/g, "");
    const n = digits ? parseInt(digits, 10) : 0;
    if (!n) { UI.ps.bankX = 0; input.blur(); return; }
    UI.ps.bankX = Math.min(2147483647, n);
    input.blur();
    if (kind === "deposit") {
      if (UI.ps.inv[index]) bankDeposit(index, UI.ps.bankX);
    } else if (UI.ps.bank[index]) {
      bankWithdraw(index, UI.ps.bankX);
    }
    return;
  }
  if (!text) { input.blur(); return; }
  /* One of the friends ledger's two stone buttons asked for a name
     (src/ui.js#askName): this line is that name. */
  if (UI.pendingName) {
    const { what } = UI.pendingName;
    UI.pendingName = null;
    input.placeholder = CHAT_PLACEHOLDER;
    if (what === "add") addFriend(text);
    else { removeFriend(text); mark("friends"); }
    input.blur();
    return;
  }
  if (text.startsWith("::")) { command(text.slice(2)); input.blur(); return; }
  /* Every sent line starts with a capital (update 4). The input already
     capitalizes as it is typed (see capChatInput); this second pass covers
     lines that arrived any other way - a paste, a PM, the scripted chat path -
     and runs after the command/amount/name branches above, which are never
     touched. */
  const said = capFirst(text);
  /* A private message goes to the player the chat line is addressed to rather
     than to the world: the "To <name>:" prefix is the only sign of which it is,
     so the send follows it (see startPM). Single-shot by default: the line
     reverts to public after the one send unless "Multiple DMs" is on. */
  if (UI.pmTarget) {
    sendPm(said);
    input.blur();
    return;
  }
  if (UI.actions.chat) UI.actions.chat(said);
  else chat(said, "pub", UI.ps.name);
  input.blur();
}

/* Uppercase a line's first letter, if it has one. Commands (`::...`) never
   reach this - sendChatInput returns before it for those, and capChatInput
   skips any line starting with a colon. */
function capFirst(s) {
  return s.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/* Capitalize the chat line while it is being typed (update 4): the very first
   character is uppercased the moment it is a lowercase letter, so the line
   reads correctly before it is ever sent. The caret is kept where it was, so
   editing the front of a long line does not throw it to the end. */
function capChatInput() {
  const input = UI.els.chatInput;
  if (!input || !input.value || input.value[0] === ":") return;
  const capped = capFirst(input.value);
  if (capped === input.value) return;
  const s = input.selectionStart, e = input.selectionEnd;
  input.value = capped;
  try { input.setSelectionRange(s, e); } catch (_) {}
}

/* The client draws "Name:" in black and then the message in blue after it, with
   a thin underscore line under the whole row. */
function layoutChatInput() {
  const input = UI.els.chatInput;
  const name = UI.els.chatName;
  if (!input || !name) return;
  const active = document.activeElement === input || input.value.length > 0;
  /* A private message being written is signed with who it is going *to* - the
     client's own "To <name>: " chat line (see startPM). */
  const who = UI.pmTarget ? "To " + UI.pmTarget.name : UI.ps.name;
  name.textContent = active ? who + ": " : "";
  /* The name div is placed with width 0 - it is only ever as wide as its own
     text - so `name.offsetWidth` is 0, and the input used to be laid down at
     4px regardless: directly on top of the "Name:" it is supposed to follow, so
     the black name and the blue message printed over each other. `scrollWidth`
     is the div's *content* width in the frame's own (unscaled) pixels, which is
     the same unit `input.style.left` is written in - a Range measurement would
     be in scaled page pixels and overshoot by the frame's scale. */
  const w = name.scrollWidth;
  const x = 4 + w;
  input.style.left = x + "px";
  input.style.width = Math.max(24, 463 - x - 2) + "px";
}

/* ------------------------------------------------------------------ commands */

/* The open meadow `::trees` plants its model rows on. A clear stretch of plain
   grass north of the town, well away from the buildings (which start at z=47),
   the river (which is around x=40 south of here), the mine and the cow pens.
   The camera that views the rows sits ~17 tiles south of the block, so the
   meadow has to extend that far; the first fence in that direction is the cow
   pen's north fence at z=42, which the clearing stops short of. Verified clear
   (no water, no building, no path) for x=45..121 at z=8..19. */
const NURSERY = { x0: 45, z0: 19 };

/* A single tree stands here for `::tree <kind>`: the dead-flat all-grass plain
   in the south-west (heights -0.12..0.14 over the whole patch), which has no
   building, fence, water or path anywhere near it, so a specimen is judged
   against clean grass. */
const SPECIMEN = { x: 64, z: 108 };

/* The open meadow `::archetypes` lines its candidates up on (src/archetypes.js):
   the dry, empty grass north-east of the town, clear of the cave mouth further
   east (x>=104) and short of the cow pens to the south (z=39), so the block and
   the camera corridor behind it both stay on open ground. Scattered trees on the
   block are cleared by the command itself, as `::trees` does. */
const ARCH_NURSERY = { x0: 74, z0: 9 };

/* Every tree the cache's ObjectDefinitions give us: one entry per baked model,
   in the order `::trees` plants them and the names `::tree <spec>` accepts.
   A spec is either a group name listed in scene.js#TREE_GROUPS (whose members
   the world's scatter picks between) or the exact key of one baked model. The
   labels are the cache's own loc names, qualified where several models share
   one. `tree_d/e/f` (loc 1330/1331/1332) are the cache's snow trees and
   `tree_g` (3879) / `oak_b` (3037) its Tirannwn tree and arctic pine - the
   world's forest never uses them (see scene.js#TREE_GROUPS). */
const TREE_KINDS = [
  ["tree_a", "Tree (broad)"],
  ["tree_b", "Tree (round)"],
  ["tree_c", "Tree (tall)"],
  ["oak", "Oak"],
  ["willow", "Willow"],
  ["yew", "Yew"],
  ["magic", "Magic tree"],
  ["maple", "Maple tree"],
  ["leafy", "Leafy tree"],
  ["evergreen_a", "Evergreen (small)"],
  ["evergreen_b", "Evergreen (large)"],
  ["evergreen_c", "Evergreen (broad)"],
  ["evergreen_d", "Evergreen (tall)"],
  ["hollow", "Hollow tree"],
  ["achey", "Achey tree"],
  ["dense_forest", "Dense forest"],
  ["dense_forest_b", "Dense forest (west)"],
  ["deadtree", "Dead tree"],
  ["dead_c", "Dead tree (sandy)"],
  ["dead_d", "Dead tree (old)"],
  ["stump_a", "Tree stump (small)"],
  ["stump_b", "Tree stump (large)"],
  ["stump_c", "Tree stump (dead)"],
  ["snow", "Tree (snow)"],
  ["tree_g", "Tree (Tirannwn)"],
  ["oak_b", "Arctic pine"],
];

/* Every baked loc key the `::tree` / `::trees` commands can stand in the world,
   for src/tools/check-locs.mjs and nothing else. A specimen is reachable without
   a world placement, so the audit must not report its key among the scenery
   "baked with nothing drawing it". A group spec expands to its members. */
export function locDebugKeys() {
  const keys = new Set();
  for (const [spec] of TREE_KINDS) {
    const grp = TREE_GROUPS[spec];
    if (grp) for (const k of grp) keys.add(k);
    else keys.add(spec);
  }
  return keys;
}

/* A spec -> the world object the tree layer renders. A group spec keeps its
   name as the object's `kind` so the world's own hash can pick among its
   models; an exact key is passed through as `key`, which scene.js#_locSpec
   honours ahead of the hash. */
function treeObj(spec) {
  if (spec === "deadtree") return { t: "deadtree" };
  if (spec.startsWith("dead_")) return { t: "deadtree", key: spec };
  if (spec.startsWith("stump_")) return { t: "tree", kind: "tree", stump: true, key: spec, hp: 2 };
  if (TREE_GROUPS[spec]) return { t: "tree", kind: spec, stump: false, hp: 2 };
  return { t: "tree", kind: "tree", key: spec, stump: false, hp: 2 };
}

const PATCH_WEBHOOK_KEY = "patchWebhook";
async function storedPatchWebhook() {
  const store = (typeof root !== "undefined" && root.kv) || null;
  if (!store) return null;
  try {
    return (await store[KV_FOLDER].get(PATCH_WEBHOOK_KEY)) || null;
  } catch (err) {
    return null;
  }
}
async function setPatchWebhook(url) {
  if (!Board.writer) { chat("Writer mode first: ::writer", "warn"); return; }
  const store = (typeof root !== "undefined" && root.kv) || null;
  if (!store) { chat("Storage is unavailable.", "warn"); return; }
  url = (url || "").trim();
  if (!url) {
    chat("Patch notes webhook: " + ((await storedPatchWebhook()) ? "set" : "missing") + ". Set it with ::webhook <url>.", "game");
    return;
  }
  if (/^(off|clear|none)$/i.test(url)) {
    try { await store[KV_FOLDER].delete(PATCH_WEBHOOK_KEY); } catch (err) {}
    chat("Patch notes webhook cleared.", "game");
    return;
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
    chat("That is not a Discord webhook URL - copy it from the channel's settings: Integrations, Webhooks, New Webhook, Copy Webhook URL.", "warn");
    return;
  }
  try {
    await store[KV_FOLDER].set(PATCH_WEBHOOK_KEY, url);
  } catch (err) {
    chat("Could not store the webhook URL.", "warn");
    return;
  }
  chat("Patch notes webhook set. ::patch <message> announces a fix to Discord.", "game");
}
async function sendPatchNote(text) {
  if (!Board.writer) { chat("Writer mode first: ::writer", "warn"); return; }
  if (!text) { chat("Usage: ::patch <what changed> - or ::patch fixes <queue message link> <what changed>", "game"); return; }
  const url = await storedPatchWebhook();
  if (!url) { chat("No patch webhook set - ::webhook <url> first (writer only).", "warn"); return; }
  let body = { content: "**Patch note**\n" + text };
  const fix = text.match(/^fixes\s+(\S+)\s+([\s\S]+)/i);
  if (fix && /^https:\/\/(discord\.com|discordapp\.com)\/channels\//.test(fix[1])) {
    body = {
      content: "**Patch note**",
      embeds: [{
        color: 0xc9a227,
        description: fix[2],
        fields: [{ name: "Report", value: "[Jump to the queue item](" + fix[1] + ")" }],
        footer: { text: "React ✅ if this works now, ❌ + reply if it still needs work." },
      }],
    };
  }
  chat("Posting patch note to Discord...", "game");
  try {
    /* Discord rejects proxied/XHR JSON posts from here ("Invalid request
       origin"), but a plain no-cors form post goes through: `payload_json`
       carries the message and the opaque response is the price (no confirm). */
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify(body));
    await fetch(url, { method: "POST", mode: "no-cors", body: fd });
    chat("Patch note posted.", "game");
  } catch (err) {
    chat("Could not post: " + (err && err.message ? err.message : err), "warn");
  }
}
function command(raw) {
  const [cmd, ...rest] = raw.trim().split(/\s+/);
  const arg = rest.join(" ");
  switch (cmd.toLowerCase()) {    case "help":
    case "commands":
    case "cmds":
      /* The box, not a wall of text in the chatbox: the two sections a player
         wants first are stats and items, and the commands read better as a list
         than as one wrapped line (see src/ui.js#openCommandsPopup). */
      openCommandsPopup();
      break;
    case "board":
    case "boards":
      /* the board's tab is the speech bubble at the left of the bottom row */
      setTab(7);
      chat("Message board: a permanent log every player shares. Your posts are signed with the name in its Name line.", "game");
      break;
    /* Writer mode - the board's moderation, behind the password whose hash is
       the only trace of it in this file (src/main.pjs#writerHash). */
    case "writer":
    case "writermode":
      if (/^(off|lock|exit)$/i.test(arg.trim())) {
        if (!Board.writer) { chat("Writer mode is already off.", "game"); break; }
        Board.lockWriter();
        if (UI.boardStatus) setBoardStatus("");
        drawBoard();
        chat("Writer mode off.", "game");
        break;
      }
      if (/^box$/i.test(arg.trim())) {
        if (!Board.writer) { chat("Writer mode first: ::writer", "warn"); break; }
        const on = !(Board.host && Board.host.classList.contains("boardHostOpen"));
        Board.showRealBox(on);
        chat(on
          ? "The board's own box is up - click it and press Ctrl+L (Cmd+L) to log in, and messages gain the plugin's own delete and ban buttons. ::writer box hides it again."
          : "The board's own box is hidden again.", "game");
        break;
      }
      openWriterLogin();
      break;
    case "account":
    case "login":
      chat("Accounts live on the welcome screen - log out (logout tab) and you will find Log in there.", "game");
      break;
    case "logout":
      if (!Net.account) { chat("You are playing as a guest.", "game"); break; }
      Net.logout();
      /* The character does not change and neither does its name: the name over
         its head is the character's own (src/net.js#setCharacterName), and
         logging out only stops the account behind it from following it. */
      chat("Logged out. Your character stays as it is, saved in this browser now.", "game");
      mark("inv", "equip", "bank", "skills");
      break;
    case "save":
      if (!UI.actions.save) { chat("Saving is unavailable.", "warn"); break; }
      chat("Saving game...", "game");
      UI.actions.save();
      break;
    case "claim": {
      const secret = arg.trim().split(/\s+/)[0] || "";
      if (!secret) { chat("Usage: ::claim <secret>.", "warn"); break; }
      if (!Net.account) { chat("Log into your account first, then ::claim <secret>.", "warn"); break; }
      Net.claimMod(secret).then((reply) => {
        if (reply === "ok") chat("This account is now the moderator. Your badge and ::kickall are live.", "game");
        else if (reply === "rate") chat("Too many attempts - try again in a few minutes.", "warn");
        else chat("Wrong secret.", "warn");
      }).catch(() => chat("Not connected to the world server.", "warn"));
      break;
    }
    case "kickall": {
      if (!Net.account) { chat("You are playing as a guest - open the Account panel and log in first.", "warn"); break; }
      chat("Logging out everyone else...", "game");
      Net.kickAll().then((reply) => {
        const n = parseInt(reply, 10);
        if (reply === "denied") chat("Logged in as " + Net.account + ", which is not the moderator account. Crown it first with ::claim <secret>.", "warn");
        else if (reply === "rate") chat("Too many attempts - try again in a minute.", "warn");
        else if (isFinite(n)) chat(n === 1 ? "Logged out 1 player." : "Logged out " + n + " players.", "game");
        else chat("Could not do that (" + reply + ").", "warn");
      }).catch(() => chat("Not connected to the world server.", "warn"));
      break;
    }
    case "webhook":
      setPatchWebhook(arg.trim());
      break;
    case "wipeaccounts": {
      const secret = arg.trim().split(/\s+/)[0] || "";
      if (!secret) { chat("This deletes EVERY account and character, including your own. There is no undo. Type ::wipeaccounts <owner secret> to do it.", "warn"); break; }
      Net.wipeAccounts(secret).then((reply) => {
        const n = parseInt(reply, 10);
        if (reply === "denied") chat("Wrong secret.", "warn");
        else if (reply === "rate") chat("Too many attempts - try again in a few minutes.", "warn");
        else if (isFinite(n)) chat(n === 1 ? "Wiped 1 account. The world is empty - register to start over." : "Wiped " + n + " accounts. The world is empty - register to start over.", "game");
        else chat("Could not do that (" + reply + ").", "warn");
      }).catch(() => chat("Not connected to the world server.", "warn"));
      break;
    }
    case "patch":
      sendPatchNote(arg.trim());
      break;
    case "load":
      if (!UI.actions.load) { chat("Loading is unavailable.", "warn"); break; }
      chat("Loading game...", "game");
      UI.actions.load();
      break;
    case "camera":
      G.yaw = 0;
      G.pitch = 0.94;
      G.targetDist = 15;
      chat("Camera reset.", "game");
      break;
    /* Hit-boxes (the user's own idea, 2026-09-22): hover a thing and it outlines
       the model's own mesh in yellow - the exact shape a click resolves through,
       texture holes included - with its bounding box in cyan. A loc comes
       through scene.js#setHoverBox, a creature through scene.js#setHoverEnt. A
       plain toggle - no gate, no password - because it is a debug view rather
       than a cheat. */
    case "boxes":
    case "hitboxes": {
      UI.boxesOn = !UI.boxesOn;
      if (!UI.boxesOn && G.view && G.view.setHoverBox) G.view.setHoverBox(null);
      chat(UI.boxesOn
        ? "Hit-boxes on: hover any object or creature to see the model's own mesh outlined in yellow (the exact shape a click resolves through) with its bounding box in cyan - for a big creature the cyan square is its tile floor instead, which never turns with the body while the yellow box does. ::boxes again turns them off."
        : "Hit-boxes off.", "game");
      break;
    }
    case "tile":
    case "tiles": {
      UI.tilesOn = !UI.tilesOn;
      if (!UI.tilesOn && G.view && G.view.setTileMarks) G.view.setTileMarks(null, null, null, null);
      chat(UI.tilesOn
        ? "Tile indicators on: the tile under your cursor draws cyan, and your current movement destination draws yellow. ::tile again turns them off."
        : "Tile indicators off.", "game");
      break;
    }
    case "pos":
      chat("Position: " + G.player.x.toFixed(1) + ", " + G.player.z.toFixed(1), "game");
      break;
    case "xp": {
      const s = UI.ps.skills[arg.toLowerCase()];
      if (!s) { chat("Unknown skill: " + arg, "warn"); break; }
      chat(arg + ": level " + s.level + " (" + formatNum(Math.floor(s.xp)) + " xp)", "game");
      break;
    }
    case "levels": {
      const n = Math.max(1, Math.min(MAX_LEVEL, parseInt(arg, 10) || 60));
      /* Levels are always calculated off XP (see src/skills.js#addXp), so this
         writes the table value for the level and derives the level back from
         it - never the level on its own, or lowering would leave the old XP
         behind and the display would disagree with the next gain. */
      for (const id in UI.ps.skills) {
        UI.ps.skills[id].xp = xpForLevel(n);
        UI.ps.skills[id].level = levelForXp(UI.ps.skills[id].xp);
      }
      UI.ps.maxHp = Math.max(10, UI.ps.skills.hitpoints.level);
      UI.ps.hp = UI.ps.maxHp;
      UI.ps.maxPrayer = UI.ps.skills.prayer.level;
      UI.ps.prayerPoints = UI.ps.maxPrayer;
      mark("skills"); mark("combat"); mark("prayer");
      if (UI.actions.save) UI.actions.save();
      chat("All skills set to level " + n + ".", "game");
      break;
    }
    /* One skill to one level: `::level smithing 60`. Same rule as `::levels` -
       the XP table value is written and the level is derived from it. */
    case "level": {
      const parts = arg.trim().split(/\s+/);
      const n = Math.max(1, Math.min(MAX_LEVEL, parseInt(parts[parts.length - 1], 10) || 0));
      const term = parts.slice(0, parts.length - 1).join(" ").toLowerCase().replace(/\s+/g, "_");
      const s = SKILLS.find((x) => x.id === term) || SKILLS.find((x) => x.name.toLowerCase() === parts.slice(0, parts.length - 1).join(" ").toLowerCase());
      if (!s || !n || !UI.ps.skills[s.id]) { chat("Usage: ::level <skill> <level>", "warn"); break; }
      UI.ps.skills[s.id].xp = xpForLevel(n);
      UI.ps.skills[s.id].level = levelForXp(UI.ps.skills[s.id].xp);
      if (s.id === "hitpoints") { UI.ps.maxHp = Math.max(10, n); UI.ps.hp = UI.ps.maxHp; }
      if (s.id === "prayer") { UI.ps.maxPrayer = n; UI.ps.prayerPoints = UI.ps.maxPrayer; }
      mark("skills"); mark("combat"); mark("prayer");
      if (UI.actions.save) UI.actions.save();
      chat(s.name + " set to level " + n + " (" + formatNum(Math.floor(xpForLevel(n))) + " xp).", "game");
      break;
    }
    /* The level-up panel is otherwise only reachable by really earning a level,
       which makes it tedious to look at 21 times. This raises the same event a
       real level does (`showLevelUp`), so the chat line and the interface
       behave exactly as they do in play. */
    case "levelup": {
      const parts = arg.trim().split(/\s+/);
      const term = (parts[0] || "").toLowerCase().replace(/\s+/g, "_");
      const s = SKILLS.find((x) => x.id === term) || SKILLS.find((x) => x.name.toLowerCase() === term);
      if (!s) { chat("Usage: ::levelup <skill> [level]", "warn"); break; }
      const cur = UI.ps.skills[s.id] ? UI.ps.skills[s.id].level : 1;
      const lvl = Math.max(1, Math.min(MAX_LEVEL, parseInt(parts[1], 10) || cur + 1));
      showLevelUp(s.id, lvl);
      break;
    }
    case "give": {
      const m = arg.match(/^(.+?)(?:\s+(\d+))?$/);
      if (!m) { chat("Usage: ::give <item> [n]", "warn"); break; }
      const term = m[1];
      /* The only ceiling is the client's own stack limit: asking for more than a
         stack can hold gives you a full stack and hands the surplus to the bank.
         Clamping the request first also keeps a stray ::give from tying the tick
         up trying to place billions of non-stacking items. */
      const n = Math.min(MAX_STACK, m[2] ? +m[2] : 1);
      const id = findItemId(term);
      if (!id) { chat("No item matching '" + term + "'", "warn"); break; }
      /* What does not fit in the pack spills into the bank: a full inventory
         should never be the reason a gift cannot be delivered, and the player
         who asked for the item is usually the one standing over a full pack. */
      const got = invAdd(UI.ps, id, n);
      const overflow = n - got;
      const banked = overflow ? bankAdd(UI.ps, id, overflow) : 0;
      const lost = overflow - banked;
      const parts = [];
      if (got) parts.push("Added " + got + " x " + itemName(id) + " to your pack.");
      if (banked) parts.push(banked + " x " + itemName(id) + " went to your bank (your pack was full).");
      if (lost) parts.push(lost + " x " + itemName(id) + " did not fit anywhere.");
      chat(parts.join(" ") || "Nothing could be added.", lost ? "warn" : "game");
      mark("inv", "bank");
      break;
    }
    case "bank":
      setTab("bank");
      break;
    case "heal":
      UI.ps.hp = UI.ps.maxHp;
      UI.ps.runEnergy = RUN_UNITS;
      UI.ps.prayerPoints = UI.ps.maxPrayer;
      chat("You feel fully restored.", "game");
      break;
    case "spec":
      UI.ps.specEnergy = 100;
      UI.ps.specRegen = 0;
      mark("combat");
      chat("Your special attack energy is fully restored.", "game");
      break;
    case "poison": {
      /* Test knob for the hitpoints orb's poisoned look (the cache's own
         half-split overlay). It sets the real poison state rather than a
         display flag, so the damage clock runs with it - `::poison off` cures
         it, which is what the antidotes do. */
      const on = arg ? !/^(off|no|0|false)$/i.test(arg) : !UI.ps.poison;
      UI.ps.poison = on ? { dmg: 4, hits: 0, timer: 30 } : null;
      chat(on ? "You are now poisoned." : "You are no longer poisoned.", "game");
      mark("skills");
      break;
    }
    case "disease": {
      /* Disease has no mechanic in this world (no NPC inflicts it), so this is
         purely the orb's other afflicted look. */
      const on = arg ? !/^(off|no|0|false)$/i.test(arg) : !UI.ps.diseased;
      UI.ps.diseased = on;
      chat(on ? "You are now diseased." : "You are no longer diseased.", "game");
      break;
    }
    case "pray": {
      const p = prayerByName(arg);
      if (!p) { chat("No such prayer. Try: " + PRAYERS.slice(0, 5).map((x) => x.name).join(", ") + ", ...", "warn"); break; }
      const r = togglePrayer(UI.ps, p);
      if (!r.ok) chat(r.why, "warn");
      else chat(r.on ? "You start praying " + p.name + "." : "You stop praying " + p.name + ".", "game");
      mark("prayer");
      break;
    }
    case "tp": {
      const [x, z] = rest.map(Number);
      /* With two numbers it is the sandbox teleport it always was. With
         anything else the argument is read as a *player's name* and the
         teleport lands beside that player - the user's request ("a hidden game
         command of tp but instead of coordinates you can type a players name
         and it teleports to them"). Deliberately not in `::help`: it is a
         convenience for finding somebody, not a sandbox knob, and a name is
         easy to mistake for a mistyped pair of coordinates. */
      if (!(isFinite(x) && isFinite(z))) {
        const wanted = arg.trim().replace(/\s+/g, " ");
        if (!wanted) {
          const names = rosterNames();
          chat(names.length
            ? "Usage: ::tp <player name>. Online: " + names.join(", ")
            : "Usage: ::tp <player name>. Nobody else is online.", "warn");
          break;
        }
        const target = findPlayer(wanted);
        if (target && target.ghost) {
          teleportToPlayer(target.ghost.name, Math.floor(target.ghost.x), Math.floor(target.ghost.z));
          break;
        }
        if (!target) {
          const names = rosterNames();
          chat(names.length
            ? "Nobody here is called '" + wanted + "'. Online: " + names.join(", ")
            : "Nobody else is online to teleport to.", "warn");
          break;
        }
        /* On the roster, but not in the neighbourhood: the online list is the
           whole world, and a position only ever reaches the nine chunks around
           the player standing there, so this client has no idea where they are.
           The server does - every player's own state packet names their tile -
           so it is asked, and the teleport happens when the answer lands (a
           round trip, which is why the nearby case above is answered on the
           spot and never asks). The user's report, 2026-09-22: *"it seems to be
           sometimes showing names of people who are actually not online when
           you actually go and try to tp to them"* - the list was right, the
           command was only ever looking at the players it could see. */
        netWhere(target.name).then((pos) => {
          if (!pos) {
            chat(target.name + " is somewhere I cannot find. Try again in a moment.", "warn");
            return;
          }
          teleportToPlayer(target.name, pos.x, pos.z);
        });
        break;
      }
      if (!UI.world.inBounds(x | 0, z | 0)) { chat("Bad coords.", "warn"); break; }
      G.player.path.length = 0;
      placeEntity(G.player, (x | 0) + 0.5, (z | 0) + 0.5, G.player.dir, 0);
      chat("Teleported to " + (x | 0) + ", " + (z | 0), "game");
      break;
    }
    case "caystart": {
      if (UI.actions.caystart) UI.actions.caystart();
      else chat("Cay start is unavailable.", "warn");
      break;
    }
    case "trolls": {
      /* The river-troll random event, on demand: drops the event timer so the
         next tick runs the real emergence path. Needs river water within
         fourteen tiles, like the event itself. */
      forceRiverTrollEvent();
      chat("The river stirs... watch the banks.", "game");
      break;
    }
    /* SEVER (object-picker): the hand-authoring scenery browser. Writer-gated
       here and inside openProps; delete this case to sever it. */
    case "props": {
      if (!Board.writer) { chat("Writer mode first: ::writer", "warn"); break; }
      openProps({ world: UI.world, view: G.view, player: G.player, chat });
      break;
    }
    case "tree": {
      /* ONE tree, stood on a clean patch of grass in the dead-flat south-west
         plain with the camera pulled in close, so a single model can be looked
         at properly instead of trying to judge a whole forest at once (what the
         user asked for). `::tree` alone lists the specs. */
      const kindArg = (rest[0] || "").toLowerCase().replace(/[\s-]+/g, "_");
      const match = TREE_KINDS.find(([k, n]) => k === kindArg || n.toLowerCase().replace(/\s+/g, "_") === kindArg);
      if (!arg) { chat("Tree kinds: " + TREE_KINDS.map(([k]) => k).join(", "), "game"); break; }
      if (!match) { chat("No tree kind '" + arg + "'. Kinds: " + TREE_KINDS.map(([k]) => k).join(", "), "warn"); break; }
      const [tk, tlabel] = match;
      const sx = SPECIMEN.x, sz = SPECIMEN.z;
      /* Frame the specimen by its own size. The same camera that shows a
         4.6-tile arctic pine leaves a 0.23-tile stump a few pixels wide, so the
         distance follows the model's real height (locs.json -> locHeight) and
         the pitch flattens for short things so we are not looking down on them
         from above. */
      const specKey = (G.view.locSpec(treeObj(tk), sx, sz) || {}).key;
      const th = (specKey && hasLoc(specKey) ? locHeight(specKey) : 3) || 3;
      const dist = Math.max(4.5, Math.min(14, th * 2.8));
      const pitch = Math.max(0.4, Math.min(0.9, 0.35 + th * 0.13));
      const stand = Math.max(1.8, Math.min(3.5, dist * 0.4));
      /* Clear the specimen plus a generous skirt back towards where the camera
         will sit. Without this the camera lands inside a scattered tree and the
         view is a screenful of white back-faces (the loc mesh is single-sided). */
      const back = Math.ceil(dist * Math.cos(pitch)) + 4;
      for (let z = sz - 12; z <= sz + 4 + back; z++) {
        for (let x = sx - 14; x <= sx + 14; x++) {
          if (UI.world.inBounds(x, z)) UI.world.delObj(x, z);
        }
      }
      UI.world.setObj(sx, sz, treeObj(tk));
      UI.nursery = { x0: sx, x1: sx, z0: sz, z1: sz, cx: sx, cz: sz };
      G.player.path.length = 0;
      /* Stand the player a little to one side rather than directly between the
         camera and the specimen: the camera orbits the player, so a player on
         the axis hides anything short (the stump would sit behind his legs). */
      placeEntity(G.player, sx + 2.2, sz + stand + 0.5, Math.PI, 0);
      G.yaw = 0;
      G.pitch = pitch;
      G.targetDist = dist;
      G.dist = dist;
      G.view.rebuildAllChunks();
      chat("A single " + tlabel + " stands in front of you. Try another: ::tree " + TREE_KINDS.map(([k]) => k).join(" | "), "game");
      break;
    }
    case "trees": {
      /* Every tree the cache has, planted as rows of all different types on a
         fixed open meadow, so each model can be walked past and confirmed one
         at a time (the user asked for a row, not a forest). A row holds up to
         ROWCOL models at SPACING tiles apart and the rows are ROWGAP apart, so
         a front row cannot hide the ones behind it (a 4-tile-tall tree hides
         about three tiles of ground behind it at the camera's pitch).

         `::trees grid` plants the same set as a compact 5-wide block instead,
         and `::trees <x> <z>` plants it anywhere else. Every object on the
         block and on the corridor back to where the camera will sit is cleared
         first, so nothing is planted on top of a scattered tree and the camera
         is not left standing inside one; the ground itself is left exactly as
         the world made it. The player is teleported to the vantage point in
         front of the block and the camera pulled back so the whole thing is on
         screen at once. */
      const kinds = TREE_KINDS;
      const asGrid = /^grid$/i.test(rest[0] || "");
      const nums = rest.map((r) => parseInt(r, 10)).filter((n) => isFinite(n));
      const ROWCOL = 13;
      const COL = asGrid ? 5 : Math.min(kinds.length, ROWCOL);
      const SPACING = asGrid ? 5 : 3;
      const ROWGAP = asGrid ? 5 : 7;
      const CELLW = SPACING - 1, MARGIN = 3;
      const nRows = Math.ceil(kinds.length / COL);
      const wantX = nums.length >= 2 ? nums[0] : NURSERY.x0;
      const wantZ = nums.length >= 2 ? nums[1] : NURSERY.z0;
      const x0 = Math.max(2, Math.min(UI.world.w - 3 - (COL - 1) * SPACING, wantX));
      const z0 = Math.max(2 + (nRows - 1) * ROWGAP, Math.min(UI.world.h - 3, wantZ));
      const pitch = asGrid ? 1.0 : 1.15;
      const dist = asGrid ? 26 : 42;
      /* the block's own footprint, and where the camera will end up standing */
      const bx1 = x0 + (COL - 1) * SPACING + CELLW - 1, bz1 = z0 - (nRows - 1) * ROWGAP - CELLW + 1;
      const cx2 = x0 + ((COL - 1) * SPACING) / 2;
      const cz2 = z0 - ((nRows - 1) * ROWGAP) / 2;
      const camZ = cz2 + Math.cos(pitch) * dist;
      for (let z = Math.floor(bz1 - MARGIN); z <= Math.ceil(camZ + 4); z++) {
        for (let x = x0 - MARGIN; x <= bx1 + MARGIN; x++) {
          if (!UI.world.inBounds(x, z)) continue;
          UI.world.delObj(x, z);
        }
      }
      for (let i = 0; i < nRows; i++) {
        const z = z0 - i * ROWGAP;
        const names = [];
        for (let j = 0; j < COL; j++) {
          const k = i * COL + j;
          if (k >= kinds.length) break;
          const x = x0 + j * SPACING;
          const [spec, label] = kinds[k];
          UI.world.setObj(x, z, treeObj(spec));
          names.push(label);
        }
        chat("Row " + (i + 1) + " (z=" + z + "): " + names.join(", "), "game");
      }
      UI.nursery = { x0, x1: x0 + (COL - 1) * SPACING, z0, z1: bz1, cx: cx2, cz: cz2 };
      G.player.path.length = 0;
      placeEntity(G.player, Math.round(cx2) + 0.5, Math.round(camZ) + 0.5, 0, 0);
      G.yaw = 0;
      G.pitch = pitch;
      G.targetDist = dist;
      G.dist = dist;
      G.view.rebuildAllChunks();
      chat("Planted " + kinds.length + " tree types at x=" + x0 + ".." + (x0 + (COL - 1) * SPACING) + ", z=" + z0 + ".." + (z0 - (nRows - 1) * SPACING) + ".", "game");
      break;
    }
    case "station": {
      /* A crafting station, stood two tiles ahead of the player and facing
         them - the skilling loop's own furniture wherever the player wants it:
         a spinning wheel to Spin wool on, an anvil to Smith bars on, a furnace
         to Smelt ore in, a range to Cook on, a well to Fill buckets from. The
         rows are the object's own type, so every one of them works through the
         ordinary click menu the moment it stands - no interaction code exists
         for any of this, and none is needed. `::station` lists the kinds;
         `::station remove` takes the nearest one this command stood back out.
         Only tiles this command stood are ever removed, so the town's own
         smithy and wheel are safe. Like the `::tree` specimens, a placed
         station lives in this session's world, not in the save. */
      const STATION_KINDS = [
        ["wheel", "spinning wheel", 1, "Right-click it and Spin with wool in the pack."],
        ["anvil", "anvil", 1, "Right-click it and Smith with bars in the pack."],
        ["furnace", "furnace", 3, "Right-click it and Smelt with ore in the pack."],
        ["range", "range", 1, "Right-click it and Cook with raw food in the pack."],
        ["well", "well", 1, "Right-click it and Fill with empty buckets in the pack."],
        ["potwheel", "potter's wheel", 1, "Use soft clay on it to Shape pottery."],
        ["potoven", "pottery oven", 1, "Right-click it and Fire with an unfired piece in the pack."],
      ];
      const alias = (s) => {
        s = (s || "").toLowerCase().replace(/[\s-]+/g, "_");
        if (s === "spinning_wheel" || s === "spinningwheel" || s === "spinning") return "wheel";
        if (s === "potter" || s === "potters_wheel" || s === "potter's_wheel" || s === "pottery_wheel") return "potwheel";
        if (s === "oven" || s === "pottery_oven") return "potoven";
        return s;
      };
      const sub = alias(rest[0]);
      if (!sub) {
        chat("Stations: " + STATION_KINDS.map(([k]) => k).join(" | ") + ". ::station <kind> stands one two tiles ahead of you; ::station remove takes yours back out.", "game");
        break;
      }
      UI.placedStations = UI.placedStations || [];
      if (sub === "remove" || sub === "clear") {
        let best = -1, bestD = 7;
        for (let i = 0; i < UI.placedStations.length; i++) {
          const st = UI.placedStations[i];
          const cx = st.tiles.reduce((a, t) => a + t[0], 0) / st.tiles.length;
          const cz = st.tiles.reduce((a, t) => a + t[1], 0) / st.tiles.length;
          const d = Math.max(Math.abs(cx + 0.5 - G.player.x), Math.abs(cz + 0.5 - G.player.z));
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best < 0) { chat("None of your stations within 6 tiles.", "warn"); break; }
        const [gone] = UI.placedStations.splice(best, 1);
        for (const [x, z] of gone.tiles) {
          UI.world.delObj(x, z);
          G.view.rebuildChunkAt(x, z);
        }
        chat("The " + gone.label + " is gone.", "game");
        break;
      }
      const kind = STATION_KINDS.find(([k]) => k === sub);
      if (!kind) { chat("No station '" + (rest[0] || "") + "'. Kinds: " + STATION_KINDS.map(([k]) => k).join(", "), "warn"); break; }
      const [tkey, tlabel, size, hint] = kind;
      const ptx = Math.floor(G.player.x), ptz = Math.floor(G.player.z);
      const fx = Math.sin(G.player.dir), fz = Math.cos(G.player.dir);
      const half = (size - 1) / 2;
      const freeAnchor = (ax, az) => {
        for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
          const x = ax + dx, z = az + dz;
          if (!UI.world.inBounds(x, z) || UI.world.objAt(x, z)) return false;
          if (x === ptx && z === ptz) return false;
        }
        return true;
      };
      let anchor = null;
      for (let r = 0; r <= 6 && !anchor; r++) {
        for (let dz = -r; dz <= r && !anchor; dz++) {
          for (let dx = -r; dx <= r && !anchor; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const ax = Math.floor(G.player.x + fx * 2 - half) + dx;
            const az = Math.floor(G.player.z + fz * 2 - half) + dz;
            if (freeAnchor(ax, az)) anchor = [ax, az];
          }
        }
      }
      if (!anchor) { chat("No room for a " + tlabel + " here - walk somewhere opener.", "warn"); break; }
      const tiles = [];
      for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
        const x = anchor[0] + dx, z = anchor[1] + dz;
        UI.world.setObj(x, z, { t: tkey });
        G.view.rebuildChunkAt(x, z);
        tiles.push([x, z]);
      }
      UI.placedStations.push({ kind: tkey, label: tlabel, tiles });
      const where = size === 1 ? tiles[0][0] + "," + tiles[0][1] : anchor[0] + ".." + (anchor[0] + 2) + "," + anchor[1] + ".." + (anchor[1] + 2);
      chat("A " + tlabel + " stands at " + where + ". " + hint, "game");
      break;
    }
    case "perf":
    case "performance": {
      /* The performance read-out. `::perf` says the numbers once, into the chat
         log, and `::fps` puts them on a plate in the corner of the viewport and
         keeps them there - which is what you want while actually moving the
         camera or standing in a crowd. Both are our own tooling rather than
         cache art; the numbers are the game's own (see perfStats). */
      const lines = perfReport();
      for (const l of lines) chat(l, "game");
      chat("::fps toggles the corner read-out.", "game");
      break;
    }
    case "fps": {
      if (/^(off|hide|0)$/i.test(arg.trim())) {
        if (UI.perf.on) togglePerfOverlay();
        chat("FPS read-out off.", "game");
        break;
      }
      if (/^(on|show|1)$/i.test(arg.trim())) {
        if (!UI.perf.on) togglePerfOverlay();
        chat("FPS read-out on.", "game");
        break;
      }
      chat(togglePerfOverlay()
        ? "FPS read-out on - top-left of the viewport. ::fps again to hide it."
        : "FPS read-out off.", "game");
      break;
    }
    case "netstats": {
      const rep = netLinkReport();
      if (!rep.peers.length) { chat("No link data yet - no players heard from.", "game"); break; }
      for (const p of rep.peers.slice(0, 12)) {
        chat(p.name + ": " + p.pps.toFixed(1) + "/s, loss " + p.lossPct + "%, jitter " + p.jitterMs + "ms, delay " + p.delayMs + "ms, divergence " + p.div + " tiles.", "game");
      }
      chat("Census out: " + rep.censusPps + "/s.", "game");
      break;
    }
    case "archetypes":
    case "archetype": {
      /* The archetype wardrobe (src/archetypes.js): humanoid NPCs - the wizards
         first - that wear an outfit instead of being a single fixed cache
         costume, so a candidate can be stood in front of the player and looked
         at. `::archetype <key>` stands exactly one; `::archetypes` lines every
         one of them up in rows on the meadow (ARCH_NURSERY) and frames the
         camera on the block, the same walk-past-and-pick harness `::trees`
         uses. Each candidate is a real, clickable NPC whose Examine reads its
         outfit out (src/actions.js#npcExamine), so picking one is a matter of
         walking the row and reading what it is wearing. */
      const keys = archetypeKeys();
      if (cmd.toLowerCase() === "archetype") {
        if (!arg) { chat("Archetypes: " + keys.join(", "), "game"); chat("::archetype <key> stands one in front of you.", "game"); break; }
        const key = arg.toLowerCase().replace(/[\s-]+/g, "_");
        const arch = archetypeByKey(key);
        if (!arch) { chat("No archetype '" + arg + "'. Keys: " + keys.join(", "), "warn"); break; }
        clearArchetypeNpcs();
        /* A free, walkable tile in the rings around the player, so the specimen
           lands beside the player rather than inside a wall. */
        const occupied = new Set();
        for (const e of G.entities) occupied.add(Math.floor(e.x) * 4096 + Math.floor(e.z));
        const px = Math.floor(G.player.x), pz = Math.floor(G.player.z);
        let spot = null;
        for (let r = 1; r <= 6 && !spot; r++) {
          for (let dz = -r; dz <= r && !spot; dz++) {
            for (let dx = -r; dx <= r && !spot; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
              if (!UI.world.isWalkable(px + dx, pz + dz)) continue;
              if (occupied.has((px + dx) * 4096 + (pz + dz))) continue;
              spot = { tx: px + dx, tz: pz + dz };
            }
          }
        }
        if (!spot) { chat("There is no room to stand one here.", "warn"); break; }
        /* Facing the player, so the specimen is seen from the front. */
        const dir = Math.atan2(G.player.x - (spot.tx + 0.5), G.player.z - (spot.tz + 0.5));
        spawnArchetypeNpc(arch, spot.tx, spot.tz, dir);
        chat("A " + arch.name + " appears before you. " + archetypeExamine(arch), "game");
        break;
      }
      /* The lineup. `::archetypes` alone uses ARCH_NURSERY; `::archetypes grid`
         plants a compact block, and `::archetypes <x> <z>` plants anywhere. */
      const asGrid = /^grid$/i.test(rest[0] || "");
      const nums = rest.map((r) => parseInt(r, 10)).filter((n) => isFinite(n));
      const COL = asGrid ? 5 : 8;
      const SPACING = asGrid ? 5 : 3;
      const ROWGAP = asGrid ? 6 : 5;
      const nRows = Math.ceil(keys.length / COL);
      const wantX = nums.length >= 2 ? nums[0] : ARCH_NURSERY.x0;
      const wantZ = nums.length >= 2 ? nums[1] : ARCH_NURSERY.z0;
      const x1 = Math.max(2, Math.min(UI.world.w - 3 - (COL - 1) * SPACING, wantX));
      const z0 = Math.max(2, Math.min(UI.world.h - 3 - (nRows - 1) * ROWGAP, wantZ));
      const pitch = asGrid ? 1.0 : 1.05;
      const dist = asGrid ? 30 : 22;
      const bx2 = x1 + (COL - 1) * SPACING, bz2 = z0 + (nRows - 1) * ROWGAP;
      const cx2 = x1 + ((COL - 1) * SPACING) / 2;
      const cz2 = z0 + ((nRows - 1) * ROWGAP) / 2;
      const camZ = cz2 + Math.cos(pitch) * dist;
      /* Clear the block's own footprint and the corridor back to where the
         camera will stand, so nothing scatters a tree through a row or leaves
         the camera inside one (the ground itself is untouched). */
      const MARGIN = 3;
      for (let z = z0 - MARGIN; z <= Math.ceil(camZ + 4); z++) {
        for (let x = x1 - MARGIN; x <= bx2 + MARGIN; x++) {
          if (UI.world.inBounds(x, z)) UI.world.delObj(x, z);
        }
      }
      clearArchetypeNpcs();
      let made = 0;
      for (let i = 0; i < nRows; i++) {
        const z = z0 + i * ROWGAP;
        const labels = [];
        for (let j = 0; j < COL; j++) {
          const k = i * COL + j;
          if (k >= keys.length) break;
          const arch = archetypeByKey(keys[k]);
          const x = x1 + j * SPACING;
          const npc = spawnArchetypeNpc(arch, x, z, Math.PI);
          if (npc) { made++; labels.push(keys[k] + "=" + archetypeItemNames(arch).join("/")); }
        }
        chat("Row " + (i + 1) + " (z=" + z + "): " + labels.join(", "), "game");
      }
      UI.nursery = { x0: x1, x1: bx2, z0, z1: bz2, cx: cx2, cz: cz2 };
      G.player.path.length = 0;
      placeEntity(G.player, Math.round(cx2) + 0.5, Math.round(camZ) + 0.5, 0, 0);
      G.yaw = 0;
      G.pitch = pitch;
      G.targetDist = dist;
      G.dist = dist;
      G.view.rebuildAllChunks();
      chat("Stood " + made + " archetypes at x=" + x1 + ".." + bx2 + ", z=" + z0 + ".." + bz2 +
        " (scenery on the block and the camera corridor was cleared). Walk the rows, or ::archetype <key> for one up close.", "game");
      break;
    }
    case "runes":
    case "rune": {
      /* The smallest set that still casts every spell: mist covers air and
         water, lava covers earth and fire, and the rest have no combination
         form. Ten thousand of each fits the pack with room to spare, and
         whatever will not fit goes into the bank instead of quietly
         vanishing, with the command saying where each kind ended up. */
      const n = Math.max(1, Math.min(MAX_STACK, parseInt(arg, 10) || 10000));
      const pack = [], bank = [], lost = [];
      for (const id of RUNES_COMMAND_IDS) {
        if (!ITEMS[id]) continue;
        if ((invCount(UI.ps, id) > 0 || invFree(UI.ps) > 0) && invAdd(UI.ps, id, n) >= n) {
          pack.push(id);
          continue;
        }
        if (bankAdd(UI.ps, id, n) >= n) bank.push(id); else lost.push(id);
      }
      mark("inv", "bank");
      chat("You now have " + formatNum(n) + " of each of the " + (pack.length + bank.length) +
        " kinds of rune" + (bank.length ? " (" + pack.length + " in your pack, " + bank.length +
        " in the bank)" : "") + ".", "game");
      if (lost.length) chat("No room for: " + lost.map((id) => itemName(id)).join(", ") + ".", "warn");
      break;
    }
    case "skin":
    case "appearance": {
      const list = ["male", "female", ...modelKeys().filter((k) => !k.startsWith("player_"))];
      if (!arg) { chat("Skins: " + list.join(", "), "game"); break; }
      const name = arg.toLowerCase().replace(/\s+/g, "_");
      const key = setPlayerAppearance(name);
      if (!key) { chat("No skin called '" + arg + "'. Skins: " + list.join(", "), "warn"); break; }
      chat("You're now wearing the " + key + " skin.", "game");
      break;
    }
    case "look": {
      /* The character's own appearance, from the command line (src/identikits.js).
         `::look` rolls a random one, `::look female` rolls a random woman,
         `::look default` is the classic starting look, `::look <key>` wears
         exactly the body the key names (the key `::look` itself prints, so a look
         can be copied out of the chat and pasted back). `::design` is the
         button-and-arrow version of the same thing (src/design.js); this is the
         command-line one, and it is what the appearance was built and verified
         with. */
      if (!kitsReady()) {
        chat("Loading the character-design data...", "game");
        loadIdentityKits().then(() => chat(kitsReady() ? "Design data ready. Try ::look again." : "The design data is unavailable in this build.", kitsReady() ? "game" : "warn"));
        break;
      }
      const what = arg.trim().toLowerCase();
      let app = null;
      if (!what) app = randomAppearance();
      else if (what === "default") app = defaultAppearance("male");
      else if (what === "male" || what === "female") app = randomAppearance(what);
      else if (what === "default male" || what === "default female") app = defaultAppearance(what.split(" ")[1]);
      else if (appearanceFromKey(what)) app = appearanceFromKey(what);
      if (!app) {
        chat("Usage: ::look [male|female|default|default male|default female|kit:m:...]. " +
          "Bare ::look rolls a random character.", "warn");
        break;
      }
      const key = appearanceKey(app);
      const got = setPlayerAppearance(key);
      if (!got) { chat("The character renderer is unavailable.", "warn"); break; }
      chat("Wearing " + key + " - " + app.gender + ", " + COLOUR_ORDER.map((r) => r + " " + app.colours[r]).join(", ") + ".", "game");
      break;
    }
    case "name": {
      /* The character's name, which is what the chatbox signs their lines with,
         what the world shows over their head and what the board's Name line
         starts from. It is chosen once, at the name step in front of the world
         (src/charname.js) - this command opens the same screen again, so a
         character made before the screen existed, or one whose name the player
         has gone off, is a keystroke away from a new one rather than a new
         character away. Escape backs out without changing anything. */
      if (UI.openNameScreen && UI.openNameScreen()) break;
      chat("The name screen is unavailable in this build.", "warn");
      break;
    }
    case "design": {
      /* The character-design screen itself: the client's interface 269, drawn
         component for component (src/design.js) - seven arrow rows for the body,
         five for the colours, Male/Female and Accept. It is opened in-game by
         this command and at creation by the welcome screen's play button, which
         is where the client only ever shows it. Escape backs out. */
      if (UI.openDesignScreen && UI.openDesignScreen()) break;
      chat("The design screen is unavailable in this build.", "warn");
      break;
    }
    case "party":
    case "sky": {
      /* The partyhat shower by hand (src/skydrop.js). The event runs itself -
         a few hats fall over the town every five minutes - so this is the
         command for *looking* at it rather than for playing it: `::party` fires
         one wave now, `::party 8` sends eight, and `::party timer` says how long
         the scheduled one has left. Stand in the town to watch them come down;
         wherever you are, they show on the minimap as red dots. */
      if (typeof UI.actions.skyDrop !== "function") { chat("Nothing is dropping from the sky in this build.", "warn"); break; }
      const what = arg.trim().toLowerCase();
      if (what === "timer" || what === "next" || what === "when") {
        const ms = UI.actions.skyDropNext ? UI.actions.skyDropNext() : 0;
        chat("The next partyhat shower is in " + Math.ceil(ms / 1000) + " seconds.", "game");
        break;
      }
      const n = what ? Math.max(1, Math.min(12, parseInt(what, 10) || 1)) : undefined;
      if (!UI.actions.skyDrop(n)) chat("No partyhats landed - there is no free ground in the town.", "warn");
      break;
    }
    case "wear":
    case "equip": {
      /* A whole outfit on at once, straight from the pack - the fast path for
         testing: `::wear rune full helm, rune platebody` wears exactly those,
         and a bare word (`::wear rune`) wears every pack item whose name
         contains it, which is how a set gets worn in one command. Anything that
         will not go on is named with the reason (usually a level requirement).
         The queue is resolved to item ids first and each id is then found fresh
         in the pack, so a two-handed weapon stowing the shield mid-run cannot
         make the loop equip the wrong thing. */
      if (!arg) { chat("Usage: ::wear <item>[, <item>...] - a single word wears every pack item whose name contains it.", "game"); break; }
      const wantIds = [];
      const missing = [];
      for (const want of arg.split(",").map((s) => s.trim()).filter(Boolean)) {
        const t = want.toLowerCase().replace(/\s+/g, "_");
        const exact = [];
        const loose = [];
        for (const s of UI.ps.inv) {
          if (!s) continue;
          const def = ITEMS[s.id];
          if (!def || !def.slot) continue;
          const name = def.name.toLowerCase().replace(/\s+/g, "_");
          if (s.id === t || name === t) exact.push(s.id);
          else if (name.includes(t)) loose.push(s.id);
        }
        const ids = exact.length ? exact : loose;
        if (!ids.length) {
          /* Say which of the two it is: a name that is in the pack but has no
             equipment slot (a rune, a coin) is a different thing from a name
             the pack has never heard of, and only one of them is the player's
             mistake. */
          let heldButNotWearable = false;
          for (const s of UI.ps.inv) {
            const def = s && ITEMS[s.id];
            if (!def) continue;
            const name = def.name.toLowerCase().replace(/\s+/g, "_");
            if (s.id === t || name === t || name.includes(t)) { heldButNotWearable = true; break; }
          }
          missing.push(want + (heldButNotWearable ? " (you can't equip that)" : " (not in your pack)"));
        } else wantIds.push(...ids);
      }
      const worn = [], failed = [];
      for (const id of wantIds) {
        const i = UI.ps.inv.findIndex((s) => s && s.id === id);
        if (i < 0) continue;
        const r = equipFromInv(UI.ps, i);
        if (r.ok) worn.push(itemName(id));
        else failed.push(itemName(id) + " - " + (r.why || "you can't equip that"));
      }
      if (worn.length) { mark("inv"); chat("Wearing: " + worn.join(", ") + ".", "game"); syncStaffAutocast(); }
      for (const msg of missing) chat(msg, "warn");
      for (const msg of failed) chat(msg, "warn");
      break;
    }
    case "guide":
    case "guides": {
      const term = arg.toLowerCase().trim().replace(/\s+/g, "_");
      const s = SKILLS.find((x) => x.id === term) ||
        SKILLS.find((x) => x.name.toLowerCase() === arg.toLowerCase().trim());
      if (!s) { chat("Usage: ::guide <skill>", "warn"); break; }
      openSkillGuide(s.id);
      break;
    }
    /* The emote book's own commands. `::emote dance` is the explicit form, and
       the bare name is accepted too (`::dance`) because that is how every other
       table in this game is reachable from the chatbox - see the default case
       below, which tries this lookup before giving up on a word. */
    case "emote":
    case "emotes": {
      if (!arg) {
        chat("Emotes: " + EMOTES.map((e) => e.name.toLowerCase().replace(/ /g, "")).join(", "), "game");
        break;
      }
      const emote = emoteNamed(arg);
      if (!emote) { chat("No emote called '" + arg + "'. Try `::emotes` for the list.", "warn"); break; }
      playEmote(emote);
      break;
    }
    default: {
      /* An emote's name on its own (`::dance`) is the same as `::emote dance`:
         the emote book is data, so a word that no command claims and that the
         book recognises is not a typo, it is an emote. */
      const emote = emoteNamed(cmd);
      if (emote) { playEmote(emote); break; }
      chat("Unknown command: " + cmd, "warn");
    }
  }
}

function findItemId(term) {
  const t = term.toLowerCase().replace(/\s+/g, "_");
  if (ITEMS[t]) return t;
  for (const id of Object.keys(ITEMS)) {
    if (ITEMS[id].name.toLowerCase().replace(/\s+/g, "_") === t) return id;
  }
  for (const id of Object.keys(ITEMS)) {
    if (ITEMS[id].name.toLowerCase().includes(term.toLowerCase())) return id;
  }
  return null;
}

/* --------------------------------------------------------------------- orbs */

/* Fill one orb to `frac`: the sprite slides down inside its 26px window and the
   window clips it, so the empty sphere shows above the fill line - which is
   exactly how the client's own component tree does it (a 26x26 container whose
   height is the filled part, holding the fill sprite). */
function setOrbFill(el, name, frac) {
  const p = el && Frame.parts[name];
  if (!p) return;
  const h = Math.max(0, Math.min(p.h, Math.round(p.h * frac)));
  if (el.dataset.part !== name) {
    el.classList.add("spr");
    el.style.width = p.w + "px";
    el.dataset.part = name;
  }
  /* The fill sprite is the *full* orb (a whole sphere of liquid - the cache has
     a separate orbEmpty for the dark one), and the client lets it drain, so the
     liquid stays at the bottom and the empty sphere shows above it. The element
     is pushed to the foot of its 26px window and only the matching bottom rows
     of the sprite are shown, so the top edge of the liquid is the flat clip
     line. Doing it with the background offset (rather than just shrinking a
     top-anchored element) is what keeps the right part of the sphere visible. */
  el.style.backgroundPosition = -p.x + "px " + -(p.y + p.h - h) + "px";
  el.style.top = (p.h - h) + "px";
  el.style.height = h + "px";
  el.hidden = h === 0;
}

export function updateOrbs() {
  const ps = UI.ps;
  if (!ps) return;
  const els = UI.els;

  const hpFrac = Math.max(0, Math.min(1, ps.hp / Math.max(1, ps.maxHp)));
  /* The sphere's background is the normal red fill, gold while diseased. A
     poisoned player gets the cache's own 13px left-half overlay on top of it,
     so the orb reads half green / half red (or half green / half gold when both
     are active) - which is exactly the live game's poisoned hitpoints orb, and
     exactly the component tree interface 548 describes. */
  const hpFill = ps.diseased ? ORB_HP_FILL.disease : ORB_HP_FILL.normal;
  setOrbFill(els.hpFill, hpFill, hpFrac);
  if (els.hpHalfWin) {
    const poisonFill = ps.poison ? ORB_HP_FILL.poison : null;
    els.hpHalfWin.hidden = !poisonFill;
    if (poisonFill) setOrbFill(els.hpHalfFill, poisonFill, hpFrac);
  }
  els.hpText.textContent = Math.max(0, Math.round(ps.hp));
  /* the client ramps the plate's number green -> yellow -> red as the value
     drains (the wiki's own description of the orb); run energy never changes
     colour, so it keeps the interface's own yellow. */
  els.hpText.style.color = ORB_TEXT_COLOUR(hpFrac);
  UI.orbLow = hpFrac <= 0.25;

  const prayFrac = Math.max(0, Math.min(1, ps.prayerPoints / Math.max(1, ps.maxPrayer)));
  setOrbFill(els.prayFill, "orbPray", prayFrac);
  els.prayText.textContent = Math.round(ps.prayerPoints);
  els.prayText.style.color = ORB_TEXT_COLOUR(prayFrac);

  const runOn = !!ps.runEnabled;
  setOrbFill(els.runFill, runOn ? ORB_RUN_FILL.on : ORB_RUN_FILL.off, Math.max(0, Math.min(1, ps.runEnergy / RUN_UNITS)));
  els.runText.textContent = runPercent(ps.runEnergy);
  /* the run orb swaps both its fill and its icon when you toggle run */
  if (els.runIcon) Frame.setBg(els.runIcon, runOn ? ORB_RUN_ICON.on : ORB_RUN_ICON.off);
  UI.orbRunOn = runOn;
}

/* The orb plate's number colour, by how full the orb is. */
function ORB_TEXT_COLOUR(frac) {
  return frac > 0.75 ? "#00ff00" : frac > 0.25 ? "#ffff00" : "#ff0000";
}

/* The hover text the client puts on each orb. */
function orbTip(key) {
  const ps = UI.ps;
  if (key === "hp") return "Hitpoints: " + Math.max(0, Math.round(ps.hp)) + "/" + ps.maxHp;
  if (key === "pray") {
    /* The prayer orb is the quick-prayers control, so its tip carries the set
       and what a click will do to it - otherwise there is nothing on screen
       that says the orb does anything. */
    const set = quickSet(ps);
    const on = quickActive(ps);
    const lines = ["Prayer: " + Math.round(ps.prayerPoints) + "/" + ps.maxPrayer];
    if (!set.length) lines.push("Quick prayers: none set up.", "Right-click the orb to choose some.");
    else {
      lines.push("Quick prayers (" + set.length + "): " + (on ? "on" : "off") + ".");
      lines.push("Click the orb to turn them " + (on ? "off" : "on") + ".");
      lines.push("Right-click the orb to set them up.");
    }
    return lines.join("\n");
  }
  return "Run energy: " + runPercent(ps.runEnergy) + "%";
}

/* The hitpoints orb flashes when the player is below a quarter health - the
   real client pulses it rather than recolouring it. Driven from UI.tick, not
   from a CSS animation, because nothing in this preview advances CSS ones. */
export function pulseOrbs(dt) {
  const els = UI.els;
  if (!els.hpFill) return;
  if (!UI.orbLow) {
    if (UI.orbPulsing) { els.hpFill.style.opacity = ""; UI.orbPulsing = false; }
    return;
  }
  UI.orbPulse = (UI.orbPulse || 0) + dt;
  UI.orbPulsing = true;
  const osc = 0.5 + 0.5 * Math.cos((UI.orbPulse * Math.PI * 2) / 1.2);
  els.hpFill.style.opacity = (0.35 + 0.65 * osc).toFixed(3);
}

export function toggleRun() {
  const ps = UI.ps;
  if (!ps) return;
  if (!ps.runEnabled && ps.runEnergy < RUN_ON_THRESHOLD) {
    chat("You don't have enough energy to run.", "game");
    return;
  }
  ps.runEnabled = !ps.runEnabled;
  /* The orb's choice governs from here on, including a walk already in
     progress: without this, toggling run on while a shift-click's "walk this
     one" override was still pinned would leave the character walking with the
     orb lit (see src/game.js#walkTo). */
  if (G && G.player) G.player.runClick = null;
  updateOrbs();
}

/* ------------------------------------------------ the quick-prayer orb click

   The live game's control for quick prayers is the prayer orb itself: "the
   player can left-click on the prayer orb to begin using quick prayers, or the
   player can right-click on the prayer orb to set up their desired quick
   prayers" (the wiki's Prayer page, "Quick prayers"). This is that click, and
   it is also the menu's own Activate/Deactivate row. */
export function toggleQuickPrayers() {
  const ps = UI.ps;
  if (!ps) return null;
  const r = toggleQuick(ps);
  if (!r.ok) { chat(r.why, "warn"); return r; }
  chat(r.on ? "You activate your quick prayers." : "You deactivate your quick prayers.", "game");
  /* A prayer in the set the player has not the level for is left out rather
     than refusing the whole click, so say which one it was. */
  if (r.on && r.blocked) chat("You need a Prayer level of " + r.low.level + " to use " + r.low.name + ".", "warn");
  mark("prayer");
  return r;
}

/* The orb's "Setup quick-prayers": the prayer book opens in its pick-a-prayer
   mode, where a click adds or removes instead of praying (renderPrayer), and
   the Done button at the bottom puts it away. */
export function openQuickSetup() {
  UI.quickSetup = true;
  if (UI.tab === 5) mark("prayer");
  else setTab("prayers");
  chat("Click a prayer to add or remove it from your quick prayers.", "game");
}

/* The toast's own pixels: the skill's icon and the number it gained, drawn by
   hand into one canvas rather than left to the DOM. Two reasons, both of which
   the plainer version ran into:

     * DOM text is rasterised by src/sharp.js onto **one canvas per layer**, and
       that canvas is redrawn only when the DOM changes. A toast that slides and
       fades frame by frame would leave its number behind on the layer canvas -
       and sharp has no way to express a translucent line at all (it reads the
       text's colour, not the element's opacity), so a fading toast could not
       have its number fade with it.
     * the icon is a crop of the interface atlas, and a `background-image` crop
       cannot be scaled without scaling the whole atlas, which every tool that
       reads these sprites (src/tools/uicap.js, `Frame.bg`) assumes is 1:1.

   A canvas holding both is a child of the toast, so it slides and fades with
   it, and it is blitted from the same atlas and the same glyph masks as the
   rest of the interface (src/fx.js#plate is the identical path the overhead
   names and the damage numbers use, black offset copy and all). */
const _xpMeasure = document.createElement("canvas").getContext("2d");
function xpToastCanvas(skill, text) {
  const name = SKILL_SPRITE[skill];
  const p = name && Frame.parts[name];
  const at = Frame.atlas;
  const f = Fx.labelFont || Fx.font;
  /* The icon is blitted on the cache's own cell, not on its painted box: the
     sprite is trimmed to the pixels it drew and `offX`/`offY` say where those
     pixels sit inside the cell, so scaling the painted box instead would make
     the short icons (thieving's is 25x13) the same height as the tall ones. */
  const cell = p ? Math.max(p.maxW || p.w, p.maxH || p.h) : 0;
  const k = (p && at && cell) ? XP_ICON / cell : 0;
  const iw = k ? Math.round((p.maxW || p.w) * k) : 0;
  const ih = k ? Math.round((p.maxH || p.h) * k) : 0;
  /* The number, at one pixel per glyph from the baked bold mask, with the
     client's own one-pixel drop shadow. A character the mask does not carry
     (none of the cache's 95 are used here) falls back to the browser. */
  let mask = f || null;
  if (mask) for (const ch of text) if (!mask.has(ch)) { mask = null; break; }
  let plate = null, shadow = null, tw = 0, top = 0, th = 0;
  if (mask) {
    plate = Fx.plate("xpd", mask, text, "#ffffff");
    shadow = Fx.plate("xpd", mask, text, "#000000");
    tw = mask.width(text);
    /* the plate is the font's own box - `boxHeight`, which reserves the rows a
       descender would reach into. A number has none, so the drawn rows are
       measured from the glyphs and only those are copied: it is what keeps the
       toast its icon's height instead of its font's. */
    let lo = Infinity, hi = 0;
    for (const ch of text) {
      const g = mask.glyph(ch);
      if (!g || !g.w) continue;
      if (g.oy < lo) lo = g.oy;
      if (g.oy + g.h > hi) hi = g.oy + g.h;
    }
    if (!(hi > lo)) { lo = 0; hi = mask.fontHeight; }
    top = lo;
    th = hi - lo;
  } else {
    _xpMeasure.font = "12px rs-bold12, monospace";
    _xpMeasure.textBaseline = "top";
    tw = Math.ceil(_xpMeasure.measureText(text).width);
    th = 12;
  }
  const gap = iw && tw ? 3 : 0;
  const w = iw + gap + tw + 1;          /* +1 for the shadow's own column */
  const h = Math.max(ih, th + 1);
  const cv = document.createElement("canvas");
  cv.className = "xpPlate";
  cv.width = w;
  cv.height = h;
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  const g = cv.getContext("2d");
  if (k) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(at, p.x, p.y, p.w, p.h,
      Math.round(p.offX * k), Math.round((h - ih) / 2) + Math.round(p.offY * k),
      Math.max(1, Math.round(p.w * k)), Math.max(1, Math.round(p.h * k)));
  }
  const tx = iw + gap, ty = Math.round((h - (th + 1)) / 2);
  if (mask) {
    g.drawImage(shadow, 0, top, tw, th, tx + 1, ty + 1, tw, th);
    g.drawImage(plate, 0, top, tw, th, tx, ty, tw, th);
  } else {
    g.font = "12px rs-bold12, monospace";
    g.textBaseline = "top";
    g.fillStyle = "#000000";
    g.fillText(text, tx + 1, ty + 1);
    g.fillStyle = "#ffffff";
    g.fillText(text, tx, ty);
  }
  return cv;
}

/* An xp drop: the skill's own icon and the number it gained, and nothing else -
   no panel, no border, no skill name. That is the whole of the modern client's
   toast (the icon is what says which skill it was), and leaving the world
   visible through it is what makes it unobtrusive. */
export function addXpDrop(skill, amount, tick) {
  addXpBurst([{ skill, amount }], tick);
}

/* A whole burst: every drop earned on one tick, taken together. That grouping
   is the point - the column's climb rate has to be known *before* the burst is
   placed, because a one-tick weapon's burst (attack and hitpoints) needs two
   lines cleared in the time one burst takes; only the group knows its own size
   on the first frame it exists. `k` is a drop's index inside the burst, which
   is the line it starts on, so the pair never covers itself. */
function addXpBurst(drops, tick) {
  if (!UI.els || !UI.els.xpDrops) return;
  /* Same-skill gains on one tick are one figure, so the burst is folded to one
     entry per skill first - that is also what makes `n`, just below, the number
     of *toasts* the burst will open, not the number of gains it carried. */
  const bySkill = [], seen = new Map();
  for (const d of drops) {
    const had = seen.get(d.skill);
    if (had) had.amount += d.amount;
    else { const e = { skill: d.skill, amount: d.amount }; seen.set(d.skill, e); bySkill.push(e); }
  }
  const n = bySkill.length || 1;
  /* Opening this tick's group. Its own tick and the tick of the group before it
     are all that is needed to know how long a group takes (a one-tick weapon's
     are one tick apart, a slow skill's are many); the group's own size comes
     later, from the drops as they are really placed. A tick drained in more than
     one call (xp queued after that tick's drain) does not open a second group -
     it adds to this one and keeps the base the first call gave it. */
  if (xpBurstTick !== tick) {
    xpPrevTick = xpBurstTick;
    xpBurstTick = tick;
    xpBurstN = 0;
  }
  const apart = xpPrevTick == null ? 1 : Math.max(1, tick - xpPrevTick);
  /* Where this group sits. The counter is the column *now*, so it is wound back
     to the tick these gains were earned on - `xpRise` is the sim's own clock
     times the measured rise per tick, so that is a subtraction - because a group
     drained a frame late should land where it was earned rather than on top of
     the one before it, and the two ticks' gains a single slow frame can hand over
     (a tab coming back, a stutter) should keep their ticks' distance.

     Then the floor under it: never on top of the group before. The rise per tick
     is a *measurement* of how fast the drops have been arriving, and a tick the
     player missed - a swing that dealt nothing pays no xp at all
     (src/combat.js#landStrike), so there is no drop for that tick - reads as an
     arrival gap twice as long as it really is, halves the rise, and the next
     group would be placed a step lower than the one it follows, right on top of
     it. This group's own height plus the gap to the last one,
     `(n - 1) * XP_INNER + XP_OUTER`, is exactly what its *top* drop needs to
     clear the *bottom* drop of the group before it, whatever the two groups'
     sizes - the previous group is higher on the screen and this one hangs that
     far below its base, so no two groups can ever cover each other. It can only
     bind when the rise has just been measured too low, so a column arriving on
     time is placed exactly as before. And it says where the *new* group goes
     rather than moving a toast that is already climbing - the nudge the user
     ruled out. The whole group shares this one base and differs only by its own
     `k`. The two corrections below - the counter, and a group that grew after its
     first call - are the only things that ever move a toast that is already on
     the screen, and each moves either the group being placed or the whole column
     together, never one drop to make room for another.

     A group can be handed over in more than one call - a tick the drain runs
     twice for (xp queued after this tick's drain) - and the rest of that group
     keeps the base its first drops were given rather than being placed again as
     a group of its own. */
  const earned = xpRise - Math.max(0, ((G && G.tickCount) || 0) - (tick == null ? 0 : tick)) * xpRisePerTick;
  const head = UI.els.xpDrops.firstChild;
  const base = !head || head._bornRise == null ? earned
    : head._tick === tick ? head._bornRise
      : Math.max(earned, head._bornRise + (n - 1) * XP_INNER + XP_OUTER);
  /* The floor above is what *places* the group; the counter must be told about
     it too. When the floor wins, the group has been put higher than the counter
     says, and leaving the counter behind leaves it behind for good: the next
     group's `earned` is the counter again, so the floor wins again, by the same
     margin - a constant offset on the whole column, every toast born that far
     below the run orb. It only takes one missed swing to start it (the tick with
     no drop makes the interval before it read as twice as long, halving the rise
     for the tick after it, so this group is 17 px short of what it needs). So the
     counter is moved up to where the group has just been placed: from here on the
     column is exactly as high as its own drops, and the one frame this correction
     lands on is the frame after a swing dealt nothing. */
  if (base > xpRise) xpRise = base;
  for (const d of bySkill) addXpOne(d.skill, d.amount, tick, base);
  /* How far the column must rise per tick from now on, measured from the group
     now that it is really there. The highest step this tick's toasts took, plus
     one, is how many drops the group has, and the room it must clear for the
     group after it is `(count - 1) * XP_INNER + XP_OUTER` - 19 px for a lone drop,
     35 for the dagger's pair, 67 for a spear's four - spread over the `apart`
     ticks a group takes. Counted after the fact on purpose: a group handed over
     in two calls is only whole once the second has landed, and a rate taken from
     its first half would leave the next group a step too low. It is also the
     rate a late-drained group is wound back on (`earned` above), so it must not
     be set before that subtraction. */
  let count = 0, above = null;
  for (let i = 0; i < UI.els.xpDrops.children.length; i++) {
    const el = UI.els.xpDrops.children[i];
    if (el._tick === tick) count = Math.max(count, (el._k || 0) + 1);
    else if (!above) above = el;
  }
  if (count > 0) xpRisePerTick = ((count - 1) * XP_INNER + XP_OUTER) / apart;
  /* A group handed over in more than one call can still grow *after* it has been
     placed, and then the base its first drops were given is too low for the
     group's full height: the drops that came later are stacked on top of it and
     go straight through the group above. The first call cannot know it - it only
     has the drops that have arrived by then - so the check is made here instead,
     on the group as it finally stands: the top of this group has to hang
     `XP_OUTER` below the *base* of the group above it (`above`, the oldest toast
     above this tick). If it does not, the whole group is moved down to where it
     does; all of its toasts share one base, so they move together, and not one
     toast outside the group moves at all. In the ordinary case - one tick, one
     call - the floor in `base` has already placed the group clear of the group
     above by exactly this, so this can never fire. */
  if (above && above._bornRise != null && count > 0) {
    const need = above._bornRise + (count - 1) * XP_INNER + XP_OUTER;
    if (need > base) {
      for (const el of UI.els.xpDrops.children) if (el._tick === tick) el._bornRise = need;
      if (need > xpRise) xpRise = need;
    }
  }
}

function addXpOne(skill, amount, tick, bornRise) {
  const container = UI.els.xpDrops;
  const amt = Math.round(amount * 10) / 10;
  /* Only xp earned in the *same tick* is added together. One tick's worth of a
     skill is one floating figure: an Ice Barrage that hits its target and the
     eight tiles around it gives Magic xp for every body it splashed, and the
     player should read that as a single drop, not five stacked ones. But xp
     from a later tick always opens its own toast, even if the previous one is
     still on the screen - mining two rocks in a row gives two drops, because
     the ore landed on two different ticks. The identity is the sim's own tick
     counter (`Game.tickCount`), never wall-clock time, so nothing depends on
     frame rate. */
  for (const old of container.children) {
    if (old._skill !== skill || old._tick !== tick) continue;
    old._amount = Math.round((old._amount + amt) * 10) / 10;
    old.replaceChild(xpToastCanvas(skill, formatNum(old._amount)), old.firstChild);
    /* A longer number is a *wider* toast and not a taller one (the height is the
       icon cell, see fadeXpToasts), so nothing about its place changes - it is
       only the freshly drawn canvas that is swapped in. Nor is its rise written
       again: the drop keeps the place it was given and only its figure grows, so
       a gain that arrives in a second pass over the same tick (a frame that ran
       two sim ticks, or xp queued after this tick's drain) cannot drag the toast
       down the column when it joins it. Its life does start again - it is a new
       figure for the player to read. */
    old._born = UI.effT;
    return;
  }
  const el = mk("div", "xpDrop");
  el._skill = skill;
  el._amount = amt;
  el._tick = tick;
  /* This toast's step inside its group. It is assigned only when a toast is
     really opened (a gain that merged into one above never took a line), so a
     group can never leave a hole in the column. */
  el._k = xpBurstN++;
  el.appendChild(xpToastCanvas(skill, formatNum(amt)));
  /* The whole life of the toast - the climb, the fade, the removal - is driven
     from UI.tick (see fadeXpToasts), so it is tied to the game's own clock
     rather than to timers. `_bornRise` is how far the column had risen on the
     tick the gain was earned, which is the base this group was given (see the
     base note in addXpBurst): the toast's y is the rise since then plus its own
     `k` steps, so nothing born later can move it. Newest goes at the head of the
     container and the oldest at the tail, which is what the trim and the expiry
     take - and no position depends on that order. */
  el._born = UI.effT;
  el._bornRise = bornRise;
  container.insertBefore(el, container.firstChild);
  /* Its line box and `top` are written by fadeXpToasts later in this same tick -
     the toast is placed on the very frame it is born, which is why nothing here
     has to wait for the element to be laid out. */
  while (container.childNodes.length > XP_MAX) container.removeChild(container.lastChild);
}

/* A level-up: the message and the new level written to the chat log, and the
   level-up **interface** (cache 157..177, one per skill) opening in the
   chatbox with its own two lines, its model icon and "Click here to continue".
   The skills tab icon deliberately does NOT flash: the only tab flash will be
   the tutorial's own, added later. The wording is the era's own, from
   src/levelup.js, so the chat line and the interface can never disagree;
   `UI.showLevelUpInterface` is set by src/dialogue.js (which owns the
   chatbox). */
export function showLevelUp(skillId, level) {
  const sc = levelupScreen(skillId, level);
  if (sc) {
    chat(sc.line1, "lvlup");
    chat(sc.line2, "lvlup");
  } else {
    /* Hunter and Construction have no interface in this revision (see
       src/levelup.js), so they keep the line alone. */
    const name = (SKILLS.find((s) => s.id === skillId) || {}).name || skillId;
    const word = name.toLowerCase();
    chat("Congratulations, you just advanced " + (/^[aeiou]/i.test(word) ? "an " : "a ") + word + " level.", "lvlup");
    chat("Your " + word + " level is now " + level + ".", "lvlup");
  }
  if (UI.showLevelUpInterface) UI.showLevelUpInterface(skillId, level);
}

/* ------------------------------------------------------------ item slots */

function slotTier(stack) {
  return (stackSpriteFor(stack.id, stack.qty) || stack.id) + (stack.note ? "N" : "");
}

function setSlotContent(d, stack) {
  d.innerHTML = "";
  if (stack) {
    const def = itemDef(stack.id);
    const img = mk("img");
    img.src = stack.note ? noteUrl(stack.id, 32) : itemIcon(stack.id, 32, stack.qty);
    img.draggable = false;
    img.alt = (def ? def.name : stack.id) + (stack.note ? " (noted)" : "");
    d.appendChild(img);
    if (showsCount(stack.id, stack.qty)) d.appendChild(mk("span", "qty", amountString(stack.qty)));
  }
  d._shown = stack ? { id: stack.id, qty: stack.qty, note: !!stack.note, tier: slotTier(stack) } : null;
}

function makeSlot(index, stack, cls) {
  const d = tileEl("slotTile", "slot" + (cls ? " " + cls : ""));
  d.dataset.index = index;
  setSlotContent(d, stack || null);
  return d;
}

function patchInventory() {
  if (UI.tab !== 3 || invSlotEls.size !== INV_SIZE) return false;
  const ps = UI.ps;
  let changed = false;
  for (let i = 0; i < INV_SIZE; i++) {
    const el = invSlotEls.get(i);
    if (!el || !el.isConnected) return false;
    const s = ps.inv[i] || null;
    const shown = el._shown || null;
    if (!s || !shown || s.id !== shown.id || (!!s.note) !== shown.note || slotTier(s) !== shown.tier) {
      setSlotContent(el, s);
      changed = true;
      continue;
    }
    if (s.qty !== shown.qty) {
      shown.qty = s.qty;
      const want = showsCount(s.id, s.qty) ? amountString(s.qty) : null;
      const q = el.querySelector(".qty");
      if (want == null) { if (q) q.remove(); }
      else if (!q) el.appendChild(mk("span", "qty", want));
      else if (q.textContent !== want) q.textContent = want;
      changed = true;
    }
  }
  if (changed) paintUseSlot();
  return true;
}

function bindItemSlot(el, ctx) {
  if (ctx.where === "inv") {
    el.addEventListener("pointerenter", () => {
      const s = UI.ps.inv[ctx.index];
      if (!s) return;
      showHoverTip(invHoverLine(ctx.index) || hoverHTML(s, itemDef(s.id) || { name: s.id, examine: "It's a " + s.id + "." }));
    });
    el.addEventListener("pointerleave", hideHoverTip);
    el.addEventListener("click", (e) => {
      e.preventDefault();
      if (e.button !== 0) return;
      if (dragJustEnded()) return;
      if (UI.actions.leftClick) { UI.actions.leftClick(ctx.where, ctx.index); return; }
      defaultLeftClick(ctx.where, ctx.index);
    });
    rightMenu(el, (e) => openItemMenu(e.clientX, e.clientY, ctx.where, ctx.index));
    return;
  }
  const ps = UI.ps;
  const stack = ctx.stack || null;
  if (!stack) return;
  const def = itemDef(stack.id) || { name: stack.id, examine: "It's a " + stack.id + "." };
  el.addEventListener("pointerenter", () => showHoverTip(hoverHTML(stack, def)));
  el.addEventListener("pointerleave", hideHoverTip);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.button !== 0) return;
    /* The release that ends a pack drag also fires a click; that click is not a
       use (see bindInvDrag). */
    if (dragJustEnded()) return;
    if (UI.actions.leftClick) { UI.actions.leftClick(ctx.where, ctx.index); return; }
    defaultLeftClick(ctx.where, ctx.index);
  });
  rightMenu(el, (e) => openItemMenu(e.clientX, e.clientY, ctx.where, ctx.index));
}

/* ---------------------------------------------------------- dragging the pack

   A carried stack can be dragged from one pack slot to another and the two
   slots exchange places - the same edit the bank's Swap mode makes to its own
   two entries (src/player.js#swapInventoryItems). The live game has no such
   gesture: a stack keeps the slot it was picked up into, and the pack's order
   is the order things happened in. Letting the positions be rearranged is this
   world's own liberty, and it is deliberately the *slot* that moves rather than
   the item, so a swap can neither create nor destroy anything.

   The gesture is measured on the pointer rather than with HTML5 drag events, so
   it works under a finger as well as a mouse, and it only becomes a drag after a
   few pixels of travel: below that threshold every event is left alone and the
   slot's ordinary left click (wield, eat, bury, use, bank) still happens. Once a
   drag has begun it swallows the click that follows it (`UI.dragEndedAt`), so
   letting go over a slot cannot also wear what was just dropped on it.

   The pointer is captured by the slot the drag started on, so the move stream
   keeps arriving even when the cursor leaves the panel - and because the capture
   is on a DOM slot inside the side panel, a drag across the pack can never be
   read as a camera turn by the world's own input. */
const INV_DRAG_SLOP = 6;

function dragGhostEl() {
  if (!UI.dragGhost) {
    const g = mk("div", "dragGhost");
    g.hidden = true;
    Frame.layers.overlay.appendChild(g);
    UI.dragGhost = g;
  }
  return UI.dragGhost;
}

/* The ghost rides the cursor at the size of a pack icon, so the thing under the
   finger is always the thing being moved. */
function moveDragGhost(clientX, clientY) {
  const g = UI.dragGhost;
  if (!g) return;
  const p = Frame.toFrame(clientX, clientY);
  g.style.left = (p.x - 16) + "px";
  g.style.top = (p.y - 16) + "px";
}

function showDragGhost(index) {
  const s = UI.ps.inv[index];
  const g = dragGhostEl();
  g.innerHTML = "";
  if (s) {
    const img = mk("img");
    img.src = s.note ? noteUrl(s.id, 32) : itemIcon(s.id, 32, s.qty);
    img.draggable = false;
    g.appendChild(img);
    if (showsCount(s.id, s.qty)) g.appendChild(mk("span", "qty", amountString(s.qty)));
  }
  g.hidden = false;
}

function hideDragGhost() {
  if (!UI.dragGhost) return;
  UI.dragGhost.hidden = true;
  UI.dragGhost.innerHTML = "";
}

/* The pack slot under the cursor, or null when the pointer is anywhere else. */
function dragSlotAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el && el.closest ? el.closest(".invGrid .slot") : null;
}

function markDragTarget(clientX, clientY) {
  const slot = dragSlotAt(clientX, clientY);
  if (UI.dragOver !== slot) {
    if (UI.dragOver) UI.dragOver.classList.remove("dragOver");
    UI.dragOver = slot;
    if (slot) slot.classList.add("dragOver");
  }
  /* Keep the pointer capture on a slot that is still in the document. The pack
     is rebuilt wholesale on any redraw (src/ui.js#renderTab), and that detaches
     the element the press captured - a capture on a detached node is one the
     browser drops, which is how the move/up stream used to be lost mid-gesture.
     Re-homing it on the slot now under the cursor gives the gesture a live home
     again, and it also keeps the stream coming while the cursor is out over the
     world rather than on the panel. */
  const d = invDrag;
  if (d && d.active && slot && d.el !== slot && slot.setPointerCapture) {
    d.el = slot;
    try { slot.setPointerCapture(d.id); } catch (err) {}
  }
}

function clearDragTarget() {
  if (UI.dragOver) UI.dragOver.classList.remove("dragOver");
  UI.dragOver = null;
}

let invDrag = null;
let invDragTracking = false;

/* End whatever pack drag is in flight and put the screen back. Safe when
   nothing is happening, which is the point.

   The gesture used to be ended by listeners bound to the slot it started on,
   and that is what left a ghost behind: a slot is a *rebuilt* element
   (src/ui.js#renderTab), so a redraw during a drag detached the one that was
   pressed, the browser dropped the pointer capture with it, and the pointerup
   then landed on the **fresh** slot - whose own handler saw `d.el !== el` and
   returned without cleaning up. `invDrag` stayed active and the ghost icon
   stayed parked on the pack until some later drag happened to finish normally.
   The tracking now lives on `window` (see bindInvDragTracking) and the capture
   is re-homed as the cursor moves (see markDragTarget), so no rebuilt slot can
   orphan the gesture any more. */
function endInvDrag() {
  const d = invDrag;
  invDrag = null;
  if (!d) return;
  releaseInvDragCapture(d);
  clearDragTarget();
  hideDragGhost();
}

function releaseInvDragCapture(d) {
  if (d && d.active && d.el && d.el.releasePointerCapture) {
    try { d.el.releasePointerCapture(d.id); } catch (err) {}
  }
}

/* Called by renderTab just before it throws the panel away. The gesture is NOT
   ended - a redraw happens for all sorts of reasons (combat marks the tab
   dirty every few ticks) and a pack drag must survive one - only the capture is
   let go, so what the browser is holding is never a node that is about to be
   detached. The next pointermove re-homes it on the slot under the cursor. */
function detachInvDragElement() {
  releaseInvDragCapture(invDrag);
}

function invDragMove(e) {
  const d = invDrag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.active) {
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < INV_DRAG_SLOP) return;
    d.active = true;
    if (d.el.setPointerCapture) { try { d.el.setPointerCapture(d.id); } catch (err) {} }
    hideHoverTip();
    showDragGhost(d.from);
  }
  moveDragGhost(e.clientX, e.clientY);
  markDragTarget(e.clientX, e.clientY);
}

function invDragUp(e) {
  const d = invDrag;
  if (!d || e.pointerId !== d.id) return;
  invDrag = null;
  /* A press that never travelled is an ordinary click and is left alone. */
  if (!d.active) return;
  if (e.preventDefault) e.preventDefault();
  clearDragTarget();
  hideDragGhost();
  UI.dragEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const slot = dragSlotAt(e.clientX, e.clientY);
  if (!slot) return;
  if (swapInventoryItems(UI.ps, d.from, Number(slot.dataset.index))) mark("inv");
}

function invDragCancel(e) {
  /* `blur` carries no pointerId, so a missing one counts as a match - the
     pointerup may simply have gone to another window and never come back. */
  const d = invDrag;
  if (!d || (e && e.pointerId != null && e.pointerId !== d.id)) return;
  endInvDrag();
}

/* The move/up stream is watched on `window`, once, on the first draggable
   slot. A listener there catches the event whether it was delivered to the
   captured slot or - after a mid-drag redraw - to whatever is under the pointer
   instead, which is exactly the case that used to hang. */
function bindInvDragTracking() {
  if (invDragTracking) return;
  invDragTracking = true;
  window.addEventListener("pointermove", invDragMove, true);
  window.addEventListener("pointerup", invDragUp, true);
  window.addEventListener("pointercancel", invDragCancel, true);
  window.addEventListener("blur", invDragCancel);
}

function bindInvDrag(el, index) {
  bindInvDragTracking();
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !UI.ps.inv[index]) return;
    /* A gesture already open means its pointerup was lost (a drag taken out of
       the window); start the new one clean rather than layering two. */
    endInvDrag();
    invDrag = { from: index, x: e.clientX, y: e.clientY, active: false, id: e.pointerId, el };
  });
}

/* True for the click that follows the release of a drag, so that a drop cannot
   double as a click on the slot it landed in. */
function dragJustEnded() {
  if (!UI.dragEndedAt) return false;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return now - UI.dragEndedAt < 350;
}

function hoverHTML(stack, def) {
  let h = def.name;
  if (stack.qty > 1) h += " x" + amountString(stack.qty);
  if (stack.note) h += " (noted)";
  return h;
}

const USE_FIRST = new Set(["gold_bar", "silver_bar"]);
for (const r of Object.values(CRAFT_RECIPES)) for (const [m] of r.mats) USE_FIRST.add(m);
/* Unstrung bows: a left click arms Use, so the bow goes onto a carried string
   (or a string onto it) straight into the stringing repeat - the make box is
   gone, and right-click STRING strings the whole pack the same way. */
for (const u of Object.keys(BOW_STRING)) USE_FIRST.add(u);
function defaultLeftClick(where, index) {  const ps = UI.ps;
  /* A click on any slot - the inventory, the worn kit, the bank or a shop - is
     the player doing something, so a level-up panel is cleared by it before the
     click's own action runs (src/dialogue.js#dismissLevelUp). */
  if (UI.dismissLevelUp) UI.dismissLevelUp();
  if (where === "inv") closeModal();
  /* A use in progress claims inventory clicks before anything else does: with
     an item in the hand every click on a carried item is "put this on that".
     Clicks anywhere else never reach a use - the mode is never sticky (the
     user's rule, 2026-10-07: any click that is not itself a use attempt
     deselects first), so they disarm below and then do their normal thing. */
  if (UI.useItem) {
    if (where === "inv") { resolveUse(index); return; }
    cancelUse();
  }
  /* An open trade window claims the inventory's own left-click: the client's
     trade screen turns a click on a carried item into an offer (and a click on
     an offered one into a withdrawal), and every other inventory action -
     wielding, eating, dropping - is unreachable while it is up. The handler
     returns false when there is nothing for it to do, so the ordinary clicks
     below still work. See src/trade.js#inventoryClick. */
  if (where === "inv" && UI.actions.invLeftClick && UI.actions.invLeftClick(index)) return;
  if (where === "bank") return bankWithdraw(index, 1);
  /* with the bank open, clicking an item in your inventory banks it - the same
     left-click the real client gives you */
  if (where === "inv" && FullIface.open === "bank") return bankDeposit(index, 1);
  if (where === "equip") return doUnequip(index);
  if (where === "shop") return shopValue("shop", index);
  /* with a shop open the inventory's top option is Value too - the interface's
     own hint line keeps buying and selling on the right-click menu */
  if (where === "inv" && FullIface.open === "shop") return shopValue("inv", index);
  /* A selected spell that is aimed at items is cast on whatever it is clicked
     on, exactly as in the live game's spell-then-item flow. The client switches
     to the inventory for these spells (spellUsableOn 16) precisely so that this
     click is the cast. */
  if (where === "inv" && UI.spell != null && UI.actions.castSpell) {
    const spell = spellById.get(UI.spell);
    if (spell && (spell.on & SPELL_TARGET.INV)) {
      UI.actions.castSpell(spell, { where: "inv", index });
      return;
    }
  }
  const stack = where === "inv" ? ps.inv[index] : null;
  if (!stack) return;
  if (USE_FIRST.has(stack.id)) { startUse(index); return; }
  /* **The item's own first option is what a left click does.** That is the
     client's rule rather than a convenience: the top row of an item's menu *is*
     its left click, and the item's own options (Wield/Wear, Eat, Bury, Drink,
     Empty, Clean, Light, Cut, Mix, Grind, Craft, Check, Cast ...) all sit above
     Use, which itself sits above Drop. So a dagger wields, a shark is eaten,
     bones are buried, a grimy herb is cleaned - and an item with none of those
     (a bucket, a rune, a vial, logs, an ore, a rope) has **Use** at the top of
     its menu, so the very same plain left click *selects it for Use* and the
     next click aims it. That is why the live game's "click use on the tinderbox,
     then click a log" is two plain left clicks.

     The rows come from the menu's own builder (`invItemRows`), used here and by
     `openItemMenu`, so the click and the top of the menu cannot drift apart. */
  const rows = invItemRows(index);
  if (rows.length) { rows[0].fn(); return; }
  startUse(index);
}

function norm(where, index) {
  const ps = UI.ps;
  if (where === "inv") return ps.inv[index] ? { stack: ps.inv[index], def: itemDef(ps.inv[index].id) || {} } : null;
  if (where === "equip") {
    const s = ps.equip[index];
    return s ? { stack: s, def: itemDef(s.id) || {} } : null;
  }
  if (where === "bank") {
    const s = ps.bank[index];
    return s ? { stack: s, def: itemDef(s.id) || {} } : null;
  }
  if (where === "shop") {
    const s = UI.shop && UI.shop.stock[index];
    return s ? { stack: s, def: itemDef(s.id) || {} } : null;
  }
  return null;
}

export function examine(where, index) {
  const it = norm(where, index);
  if (!it) return;
  if (UI.actions.examine) return UI.actions.examine(it.stack, it.def, where, index);
  chat(it.def.examine || "It's a " + it.def.name + ".", "game");
}

export function doEat(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  const def = itemDef(s.id) || {};
  if (!def.heal) { chat("You can't eat that.", "warn"); return; }
  /* Eating at full health is allowed, exactly as in the client: the food is
     consumed and simply heals nothing. Refusing it here made a player who was
     already full unable to use a food item at all (user report). */
  if (UI.actions.eat) return UI.actions.eat(index);
  /* The eat delay. Three ticks for standard food, one for the first slice of a
     pizza or an apple pie, two for a half (src/items.js#FOOD_BITES). A click
     inside the delay is dropped rather than queued - the client does not
     remember food you clicked and refused. */
  if (ps.eatCd > 0) return;
  invRemoveAt(ps, index, 1);
  /* the cache's own eating pose (`829 human_eat`, baked as `eat`) */
  playCastAnim(null, "eat");
  const healed = Math.min(ps.maxHp - ps.hp, def.heal);
  ps.hp = Math.min(ps.maxHp, ps.hp + def.heal);
  /* A multi-bite food leaves its next bite *in the same slot* - the item
     transforms where it lies rather than being put down and a new one picked
     up, so a cake you are eating never jumps to another inventory square. */
  if (def.biteNext) ps.inv[index] = { id: def.biteNext, qty: 1 };
  /* A finished pie leaves its dish behind - the wiki's own rule ("a pie dish
     will remain after both bites are consumed"). Pizzas leave nothing. */
  else if (/_pie_half$/.test(s.id)) invAdd(ps, "pie_dish", 1);
  ps.eatCd = def.eatDelay || 3;
  /* And if the weapon is still recovering, the bite costs three ticks of it
     (src/combat.js#initCombat owns that timer and the rule). */
  if (UI.actions.eatDelay) UI.actions.eatDelay(def.attackDelay || 3);
  chat("You eat the " + def.name.toLowerCase() + (healed > 0 ? ". It heals " + healed + " hitpoints." : "; you're already at full health."), "you");
  mark("inv");
}

/* The skill's display name for a chat line ("Your Attack level is now 25."). */
function skillTitle(id) {
  const s = SKILLS.find((q) => q.id === id);
  return s ? s.name : id;
}

/* Drinking a potion, and emptying one. Every number is the potion row's own
   (src/items.js#POTIONS): the boost as [fraction of the base level, flat
   bonus], the drain the same but subtracted, the hitpoint heal, the prayer
   restore, the run-energy fraction, the poison immunity in seconds and the
   dragonfire protection in seconds.

   Three things are worth stating, because they are the choices this window
   makes rather than numbers read off a page:

   * A **boost is only applied if it actually raises the stat** - the published
     rule. A super strength on top of a super strength does nothing until the
     first has decayed below the second's value.
   * A **Saradomin brew is capped at full hitpoints** here. The real potion
     overheals (the wiki says so in as many words), but this world's hitpoints
     bar, regeneration clock and death check all assume `hp <= maxHp`, and
     allowing a bar to read more than full is a change to all three; the cap is
     the deviation, and it is deliberate.
   * A **weapon poison refuses**, honestly: no weapon in this world accepts a
     coating (there is no poisoned-weapon system to hook into), so the potion
     says so and is not consumed rather than pretending to work.
   * The client plays its **eating** pose for a potion as well - the cache has
     no separate drinking sequence in this revision - so `eat` is the pose here
     too. */
export function doDrink(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  const def = itemDef(s.id) || {};
  if (def.kind !== "potion") { chat("You can't drink that.", "warn"); return; }
  const p = POTION_BY_ITEM[s.id];
  if (!p) { chat("You can't drink that.", "warn"); return; }
  /* A weapon poison is a coat, not a drink: the client gives the vial "Empty,
     Drop" and nothing else, so the Drink that no longer appears in its menu is
     refused here too - the same line a wrongly-clicked item gets. */
  if (p.weaponPoison) {
    chat("You can't drink that.", "warn");
    return;
  }
  /* potions share food's delay, and a click inside it is dropped, not queued */
  if (ps.eatCd > 0) return;
  invRemoveAt(ps, index, 1);
  /* The vial stays in the slot with one dose fewer in it: (3) -> (2) -> (1) ->
     an empty vial. The item transforms where it lies, exactly as a multi-bite
     food does (src/ui.js#doEat), so a potion you are drinking never jumps to
     another inventory square. */
  if (def.doseNext) ps.inv[index] = { id: def.doseNext, qty: 1 };
  playCastAnim(null, "eat");
  ps.eatCd = 3;
  if (UI.actions.eatDelay) UI.actions.eatDelay(3);
  chat("You drink the " + def.name.toLowerCase() + ".", "you");
  applyPotionEffects(ps, p);
  mark("inv", "combat");
}

/* The effect of one dose of a potion on whoever it is administered to.

   Factored out of `doDrink` because a dose is a dose however it arrives: the
   two Potion Share spells (src/actions.js#castPotionShare) give the very same
   dose to everybody standing near the caster, and the caster's own free dose is
   this function too. `ps` is the state being dosed - always the recipient's
   own, applied by the recipient's own client - and `p` is the potion's own row
   (src/items.js#POTIONS), not an item, so nothing here needs a vial to be in
   the pack: a shared dose works for a potion this player has never held. */
export function applyPotionEffects(ps, p) {
  if (!ps || !p) return;
  /* boosts: the published boost is a NUMBER OF LEVELS - floor(level x
     fraction) + flat - and the potion only takes effect if that number is
     higher than the boost already running, so a potion never lowers a boosted
     stat and two of the same potion do not stack. */
  if (p.boosts) {
    for (const [k, v] of Object.entries(p.boosts)) {
      const s2 = ps.skills[k];
      if (!s2) continue;
      const amt = Math.floor(s2.level * v[0]) + v[1];
      const cur = s2.boost || 0;
      if (amt > cur) {
        applyBoost(ps, k, amt - cur);
        chat("Your " + skillTitle(k) + " level is now " + boosted(ps.skills, k) + ".", "game");
      }
    }
  }
  /* drains: the wiki measures them off the CURRENT level, not the base, and a
     brew's drain may take a stat right down to nothing */
  if (p.drains) {
    for (const [k, v] of Object.entries(p.drains)) {
      if (k === "hitpoints") {
        const amt = Math.floor(ps.skills.hitpoints.level * v[0]) + v[1];
        /* the brew cannot kill, and the wiki says so */
        ps.hp = Math.max(1, ps.hp - amt);
        continue;
      }
      const s2 = ps.skills[k];
      if (!s2) continue;
      const amt = Math.floor(boosted(ps.skills, k) * v[0]) + v[1];
      applyBoost(ps, k, -amt);
    }
  }
  /* the restore: every stat a brew has lowered comes back up, by the row's own
     fraction and flat bonus, and never above the base level */
  if (p.restore) {
    for (const k of Object.keys(ps.skills)) {
      const s2 = ps.skills[k];
      if (!s2 || !(s2.boost < 0)) continue;
      const amt = Math.floor(s2.level * p.restore[0]) + p.restore[1];
      if (-s2.boost <= amt) { delete s2.boost; delete s2.boostTicks; }
      else applyBoost(ps, k, amt);
    }
  }
  if (p.heal) {
    const amt = Math.floor(ps.maxHp * p.heal[0]) + p.heal[1];
    const healed = Math.min(ps.maxHp - ps.hp, amt);
    ps.hp = Math.min(ps.maxHp, ps.hp + amt);
    if (healed > 0) chat("It heals " + healed + " hitpoints.", "game");
    else chat("You're already at full health - it heals nothing.", "game");
  }
  if (p.prayer) {
    const amt = Math.floor(ps.skills.prayer.level * p.prayer[0]) + p.prayer[1];
    const before = ps.prayerPoints;
    ps.prayerPoints = Math.min(ps.maxPrayer, ps.prayerPoints + amt);
    chat("You restore " + Math.round(ps.prayerPoints - before) + " prayer points.", "game");
  }
  if (p.energy) {
    const amt = Math.floor(RUN_UNITS * p.energy);
    ps.runEnergy = Math.min(RUN_UNITS, ps.runEnergy + amt);
    chat("It restores " + Math.round(p.energy * 100) + "% of your run energy.", "game");
  }
  if (p.cure) {
    const wasPoisoned = !!ps.poison;
    ps.poison = null;
    /* The shorter immunity does not overwrite a longer one still running - the
       published rule ("Drinking any kind of antipoison will no longer decrease
       your poison immunity"). */
    ps.poisonImmune = Math.max(ps.poisonImmune || 0, p.cure);
    chat(wasPoisoned ? "You are cured of poison." : "You are now immune to poison.", "game");
  }
  if (p.antifire) {
    ps.antifire = Math.max(ps.antifire || 0, p.antifire);
    ps.antifireWarned = false;
    chat("You feel protected from dragonfire.", "game");
  }
}

/* Is this player willing to be helped?

   The options panel's own Accept Aid toggle (interface 261's crossed-out hand),
   read wherever a spell would benefit somebody *else*. The setting lives on the
   receiving player's own client, which is the only client that can be asked:
   the live game's rule is that the target's setting decides, so a heal refused
   by the mark is not a heal. See src/actions.js#applyRemoteSpell. */
export function acceptsAid() {
  return settings.acceptAid !== false;
}

/* Emptying a potion: the vial is what is left. The client's own option. */
export function doEmptyPotion(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  const def = itemDef(s.id) || {};
  if (def.kind !== "potion") { chat("You can't empty that.", "warn"); return; }
  invRemoveAt(ps, index, 1);
  invAdd(ps, "vial", 1);
  chat("You empty the " + def.name.toLowerCase() + ".", "you");
  mark("inv");
}

export function doBury(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  const def = itemDef(s.id) || {};
  if (def.kind !== "bones") { chat("You can't bury that.", "warn"); return; }
  if (UI.actions.bury) return UI.actions.bury(index);
  invRemoveAt(ps, index, 1);
  /* Burying has no sequence of its own in the 2004 pack - the client bends
     over the ground, which is the same pose as picking something up
     (`827 human_pickupfloor`). The wiki's own description of the blackjack
     knockout animation ("your player bends over (bury bone animation)")
     confirms the shape of it. */
  playCastAnim(null, "pickup");
  const r = grantXp(def.buryXp || 4.5, "prayer");
  chat("You bury the " + def.name.toLowerCase() + ".", "you");
  if (!r.gained) chat("You gain some Prayer experience.", "game");
  mark("inv");
}

export function doEquip(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  if (UI.actions.equip) return UI.actions.equip(index);
  const r = equipFromInv(ps, index);
  if (!r.ok) { chat(r.why || "You can't equip that.", "warn"); return; }
  stopFollowing();
  if (r.slot === "weapon") syncStaffAutocast();
  /* The verb is the item's own, the same one its menu shows ("Wear" for armour,
     "Wield" for a weapon, an arrow or a loaded bolt, "Equip" for a shield). */
  const def = itemDef(r.equipped) || {};
  chat("You " + equipVerb(def).toLowerCase() + " the " + itemName(r.equipped) + ".", "you");
  mark("inv", "equip", "combat");
}

/* The effective autocast follows the wielded staff's own memory (the user's
   rule, 2026-10-09): equipping a staff resumes whatever spell was set on it
   through the book, equipping anything else parks the autocast with the staff
   that held it. A save from before staff memory existed seeds the wielded
   staff from the old global once, so nothing anyone was casting is lost. */
function stafflessKeep(spell) {
  return !!spell && spell.book === "standard" && spell.kind === "combat" && !spell.god && !spellStaffIds(spell);
}
export function syncStaffAutocast() {
  const ps = UI.ps;
  if (!ps) return;
  if (!ps.staffSpells || typeof ps.staffSpells !== "object") ps.staffSpells = {};
  const w = ps.equip && ps.equip.weapon;
  const def = w && itemDef(w.id);
  if (def && def.kind === "staff") {
    if (ps.staffSpells[w.id] == null && ps.autocast != null && Object.keys(ps.staffSpells).length === 0)
      ps.staffSpells[w.id] = ps.autocast;
    if (ps.staffSpells[w.id] != null) ps.autocast = ps.staffSpells[w.id];
    else if (!stafflessKeep(spellById.get(ps.autocast))) ps.autocast = null;
  } else {
    if (!stafflessKeep(spellById.get(ps.autocast))) ps.autocast = null;
  }
  mark("combat", "magic");
}

export function doUnequip(slot) {
  const ps = UI.ps;
  if (UI.actions.unequipSlot) return UI.actions.unequipSlot(slot);
  const r = unequip(ps, slot);
  if (!r.ok) { chat(r.why || "You can't remove that.", "warn"); return; }
  stopFollowing();
  if (slot === "weapon") syncStaffAutocast();
  chat("You remove the " + itemName(r.id) + ".", "you");
  mark("inv", "equip", "combat");
}

export function doDrop(where, index, qty) {
  const ps = UI.ps;
  const it = norm(where, index);
  if (!it) return;
  if (UI.actions.drop) return UI.actions.drop(where, index, qty);
  const s = it.stack;
  const n = Math.min(s.qty, qty || s.qty);
  invRemoveAt(ps, index, n);
  chat("You drop the " + it.def.name.toLowerCase() + (n > 1 ? " (" + n + ")" : "") + ".", "you");
  mark("inv");
}

/* The inventory menu's "Drop all" (src/actions.js#dropAllOfKind): every slot of
   one kind, on the ground in one pile. The menu only offers it when there is
   more than one of the kind, so this is never a way to drop a single item. */
export function doDropAll(where, index) {
  const it = norm(where, index);
  if (!it) return;
  if (UI.actions.dropAll) return UI.actions.dropAll(where, index);
  doDrop(where, index, it.stack.qty);
}

function grantXp(amount, skill) {
  return UI.actions.grantXp ? UI.actions.grantXp(amount, skill) : { gained: 0 };
}

/* The carried item's **own** options, in the order the menu shows them - which
   is also the order a left click reads them: everything the item does besides
   the three rows the client keeps below Use (Use itself, Drop, and a stack's
   "Drop <n>" / a non-stackable's "Drop all"). So a weapon's Wield/Wear, a
   food's Eat, a potion's Drink and Empty, bones' Bury, and everything
   `src/actions.js#itemOptions` adds for the item in hand (Light, Cut, Clean,
   Mix, Grind, Craft, Check, Cast, ...).

   Two readers come through here, and that is the point of it: the client's rule
   is that **the top of an item's menu is its left click**, so `openItemMenu`
   shows these rows first and `defaultLeftClick` runs `rows[0]`. An item that has
   none of them (a bucket, a rune, a vial, logs, an ore, a rope) therefore gets
   the Use row as its first option in both places, which is why a plain left
   click on a bucket selects it for use. */
/* The equip verb is the item's own, shared by its menu row, its hover line and
   its equipped chat line: "Wield" for a weapon, "Wear" for armour, "Equip" for
   a shield-slot item (shields Equip, never Wear). */
function equipVerb(def) {
  if (def.slot === "shield") return "Equip";
  return def.kind === "armour" ? "Wear" : "Wield";
}

function invItemRows(index) {
  const ps = UI.ps;
  const stack = ps.inv[index];
  if (!stack) return [];
  const def = itemDef(stack.id) || {};
  const opts = [];
  /* gear wears first - "Wield" for a weapon, "Wear" for armour, "Equip" for a
     shield-slot item */
  if (def.slot) opts.push({ label: equipVerb(def), fn: () => doEquip(index) });
  if (def.kind === "food" && def.heal) opts.push({ label: "Eat", fn: () => doEat(index) });
  /* A **weapon poison** has no Drink option, and that is the client's own
     rule rather than an omission: the vial's options are "Empty, Drop" and
     nothing else, because a weapon poison is a coat and not a drink. Every
     other potion keeps its Drink (src/ui.js#doDrink refuses one anyway). */
  if (def.kind === "potion" && def.potion) {
    if (!def.weaponPoison) opts.push({ label: "Drink", fn: () => doDrink(index) });
    opts.push({ label: "Empty", fn: () => doEmptyPotion(index) });
  }
  if (def.kind === "bones") opts.push({ label: "Bury", fn: () => doBury(index) });
  if (UI.actions.itemOptions) {
    for (const o of UI.actions.itemOptions("inv", index, def, stack) || []) opts.push(o);
  }
  return opts;
}

/* The inventory menu's own rows, in the order the menu shows them - which is
   also the order the hover line reads: the hover names the menu's entry 0, so
   the two are built here once and can never drift apart. `openItemMenu` shows
   them; `invHoverLine` names the first. */
function invMenuRows(index) {
  const it = norm("inv", index);
  if (!it) return [];
  const { stack, def } = it;
  if (UI.actions.tradeMenu) {
    const trade = UI.actions.tradeMenu(index, def, stack);
    if (trade) return trade;
  }
  const opts = [];
  if (FullIface.open === "bank") {
    opts.push({ label: "Deposit 1", fn: () => bankDeposit(index, 1) });
    opts.push({ label: "Deposit 5", fn: () => bankDeposit(index, 5) });
    opts.push({ label: "Deposit 10", fn: () => bankDeposit(index, 10) });
    const bxD = UI.ps ? UI.ps.bankX | 0 : 0;
    if (bxD > 0 && bxD !== 1 && bxD !== 5 && bxD !== 10) opts.push({ label: "Deposit " + bxD, fn: () => bankDeposit(index, bxD) });
    opts.push({ label: "Deposit X", fn: () => bankDepositX(index) });
    opts.push({ label: "Deposit All", fn: () => bankDeposit(index, "all") });
  }
  if (FullIface.open === "shop") {
    opts.push({ label: "Value", fn: () => shopValue("inv", index) });
    opts.push({ label: "Sell 1", fn: () => sellToShop(index, 1) });
    opts.push({ label: "Sell 5", fn: () => sellToShop(index, 5) });
    opts.push({ label: "Sell 10", fn: () => sellToShop(index, 10) });
  }
  /* the item's own options, in the order a left click reads them.
     An unstrung bow leads with Use (it strings one bow onto a carried
     string through the use-with) and keeps String second for the
     whole-pack repeat. */
  const unbowFirst = BOW_STRING[stack.id];
  if (unbowFirst) opts.push({ label: "Use", fn: () => startUse(index) });
  for (const o of invItemRows(index)) opts.push(o);
  if (!unbowFirst) opts.push({ label: "Use", fn: () => startUse(index) });
  opts.push({ label: "Drop", fn: () => doDrop("inv", index) });
  /* A *stack* drops whole, which is the client's own row ("Drop 100,000
     coins"). A non-stackable thing is one item per slot, so its second option
     - "Drop all" - appears only when there is more than one of the kind to
     drop, and means every slot of it (src/actions.js#dropAllOfKind). A lone
     pickaxe keeps "Drop" and nothing else. */
  if (stack.qty > 1) opts.push({ label: "Drop " + formatNum(stack.qty), fn: () => doDrop("inv", index, stack.qty) });
  else if (!isStackable(stack.id) && invCount(UI.ps, stack.id) > 1) opts.push({ label: "Drop all", fn: () => doDropAll("inv", index) });
  return opts;
}

/* The inventory hover line: the menu's entry 0, drawn the way the client draws
   every top-left hover - white verb, kind-coloured name. Carried items are the
   item kind, so the name is light red (`@lre@`): "Equip Elemental shield",
   "Use Air talisman". The 317 client builds menus on right-click only, so it
   has no inventory hover of its own; this is entry 0 drawn by the client's own
   rule. Exported for the worn-kit and shop menus to share later. */
export function invHoverLine(index) {
  const it = norm("inv", index);
  if (!it) return null;
  const rows = invMenuRows(index);
  if (!rows.length) return null;
  let h = rows[0].label + " <col=ff9040>" + it.def.name;
  if (it.stack.qty > 1) h += " x" + amountString(it.stack.qty);
  if (it.stack.note) h += " (noted)";
  h += "</col>";
  return h;
}

export function openItemMenu(x, y, where, index) {
  const it = norm(where, index);
  if (!it) return;
  const { stack, def } = it;
  /* While a trade window is open the client replaces the inventory's item menu
     with the trade screen's own options (Offer / Offer-5 / Offer-10 /
     Offer-All), so the menu a player sees is the one the interface is in. See
     src/trade.js#itemMenu. */
  if (where === "inv" && UI.actions.tradeMenu) {
    const trade = UI.actions.tradeMenu(index, def, stack);
    if (trade) {
      openCtx(x, y, null, itemRows(def.name, trade));
      return;
    }
  }
  const opts = [];
  if (where === "inv") {
    const rows = invMenuRows(index);
    rows.push({ label: "Examine", fn: () => examine(where, index) });
    openCtx(x, y, null, itemRows(def.name, rows));
    return;
  } else if (where === "equip") {
    /* The client's one "Check" option (unit L3): a **bracelet of clay** worn
       through a mine reports how much of its twenty-eight soft clay is left.
       It is checked *equipped*, which is what its page says ("The player can
       check how many more soft clay it can mine by equipping it and then
       right-clicking 'check'"), and the count lives on the equipped stack, so
       it survives a save like a ring's. */
    if (def.checkCharges) {
      const left = stack.charges == null ? def.charges : stack.charges;
      opts.push({ label: "Check", fn: () => chat(def.id === "bracelet_of_clay"
        ? "Your bracelet of clay can mine " + left + " more soft clay."
        : "It has " + left + " charges left.", "game") });
    }
    opts.push({ label: "Remove", fn: () => doUnequip(index) });
  } else if (where === "bank") {
    opts.push({ label: "Withdraw 1", fn: () => bankWithdraw(index, 1) });
    opts.push({ label: "Withdraw 5", fn: () => bankWithdraw(index, 5) });
    opts.push({ label: "Withdraw 10", fn: () => bankWithdraw(index, 10) });
    const bx = UI.ps ? UI.ps.bankX | 0 : 0;
    if (bx > 0 && bx !== 1 && bx !== 5 && bx !== 10) opts.push({ label: "Withdraw " + bx, fn: () => bankWithdraw(index, bx) });
    opts.push({ label: "Withdraw X", fn: () => bankWithdrawX(index) });
    opts.push({ label: "Withdraw All", fn: () => bankWithdraw(index, "all") });
  } else if (where === "shop") {
    opts.push({ label: "Value", fn: () => shopValue("shop", index) });
    opts.push({ label: "Buy 1", fn: () => buyFromShop(index, 1) });
    opts.push({ label: "Buy 5", fn: () => buyFromShop(index, 5) });
    opts.push({ label: "Buy 10", fn: () => buyFromShop(index, 10) });
  }
  opts.push({ label: "Examine", fn: () => examine(where, index) });
  openCtx(x, y, null, itemRows(def.name, opts));
}

/* --------------------------------------------------------------- use mode

   The client's **Use**: right-click a carried item, pick "Use", and the item
   rides the cursor until the next item you click - the one it is *used on*. It
   is the only way a weapon is coated in poison and the only way a cleaning
   cloth takes a coat off again (src/actions.js#useOnInv is the rule table), and
   it is what the client itself does with a poison vial: the potion's own
   options are Empty and Drop, and the Use is the whole of its purpose.

  Three details are the client's own and are worth naming:

     * the item in the hand **wears a white outline in its own slot**, which is
       the only place the game tells you which of two identical daggers you are
       holding (see `paintUseSlot`);
     * every use attempt ends the mode - worked, failed or refused - and any
       click that is not itself a use attempt deselects first (the user's rule,
       2026-10-07: the mode is never sticky, so a stray click can never leave
       the cursor carrying a phantom item), and
     * it comes off when you click the slot it came from, or when you press
       Escape.

   The target is whatever the next click lands on, and there are two halves to
   that: a carried item (`resolveUse` below, and `src/actions.js#useOnInv` for
   the rules) and anything in the world - a scene object, a creature, another
   player (`src/actions.js#useOnWorld`, reached from `onClickTile` before the
   click can mean anything else). The world half is a reach like every other
   world interaction: the player walks to the target's ring, turns to face it,
   and the rule fires on arrival; a target with no rule says the client's own
   line and keeps the item in the hand. */

/* The pack's slot elements, kept so the mark can be put on the right one the
   moment Use is picked rather than on the pack's next redraw. */
const invSlotEls = new Map();

/* The skills tab's level-number elements, kept so an xp gain can rewrite the
   numbers in place (see `patchSkills`) rather than rebuilding the panel. */
const skillNumEls = new Map();
let totalLevelEl = null;

/* **The mark.** The client draws the item in the hand by re-rendering *that
   slot's sprite* with a white outline round it: `ItemDefinition.getSprite`
   takes an outline colour as its third argument and the 317 client's interface
   drawing passes 0xFFFFFF for exactly the slot the Use came off
   (`Client.drawInterface`: `if (itemSelected && lastItemSelectedSlot == item &&
   lastItemSelectedInterface == childInterface.id) outlineColour = 0xFFFFFF`).
   Inside `getSprite` the ring is a one-pixel dilation of the sprite's own
   outline, so the mark is the *icon's own pixels* with one pixel of white round
   them (src/icons.js#ringedIconCanvas), swapped in on the slot's img and back
   again when the item leaves the hand - rather than a copy of the item riding
   the pointer, which is what this stage first drew and which put the mark in
   the wrong place: two identical daggers are told apart by *which slot* wears
   the ring, not by an icon hanging off the cursor that both of them would draw
   identically. The slot also wears `.useSel` so the mark is readable in the
   DOM. */
function paintUseSlot() {
  const use = UI.useItem;
  for (const [i, el] of invSlotEls) {
    const s = UI.ps.inv[i];
    const on = !!(use && use.index === i && s && s.id === use.id);
    el.classList.toggle("useSel", on);
    const img = el.querySelector("img");
    if (!img) continue;
    if (on) {
      if (img.dataset.plain == null) img.dataset.plain = img.src;
      const ringed = ringedIconUrl(s.id, 32, s.qty || 0, !!s.note);
      if (img.src !== ringed) img.src = ringed;
    } else if (img.dataset.plain != null) {
      if (img.src !== img.dataset.plain) img.src = img.dataset.plain;
      delete img.dataset.plain;
    }
  }
}

export function startUse(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  closeModal();
  UI.useItem = { id: s.id, index };
  paintUseSlot();
}

export function cancelUse() {
  if (!UI.useItem) return;
  UI.useItem = null;
  paintUseSlot();
}

/* A left click on a carried item while another is in the hand. The click is
   always consumed as a use attempt - worked, failed or refused, the attempt
   ends the mode, so nothing keeps the item in the hand any more (the user's
   rule, 2026-10-07: the mode is never sticky). Clicking the armed slot itself
   just deselects. */
function resolveUse(index) {
  const ps = UI.ps;
  const use = UI.useItem;
  const held = ps.inv[use.index];
  /* the item is gone - sold, banked, dropped, eaten - and the mode goes with it */
  if (!held || held.id !== use.id) { cancelUse(); return; }
  if (index === use.index) { cancelUse(); return; }
  const r = UI.actions.useOnInv ? UI.actions.useOnInv(use.index, index) : false;
  cancelUse();
  /* "quiet" is a rule that has already said its own line - a use the client
     accepts but this world has nothing to do with, like a poison on a shield */
  if (r !== true && r !== "quiet") chat("Nothing interesting happens.", "game");
}

/* =============================================================== side panels */

/* A panel wrapper inside the side panel. `fixed` panels are a 190x261 box whose
   children are placed by hand; the others flow and therefore scroll. */
function newPanel(fixed) {
  const v = mk("div", "panel" + (fixed ? " fixed" : ""));
  UI.els.sideBody.appendChild(v);
  return v;
}

/* ------------------------------------------------------------------ 0 combat */

/* The panel heading: the equipped weapon's name over the player's combat
   level, both above the style buttons (the client's combat interface draws
   exactly these two lines there). */
/* The combat-style tooltip, word for word as the client writes it, e.g.
   "(Accurate)<br>(Crush)<br>(Attack XP)" - stance, attack type, then the skill
   the style trains. A spell-casting style says so instead of giving a type. */
const TYPE_WORD = { stab: "Stab", slash: "Slash", crush: "Crush" };

function styleTip(st, w) {
  const info = STYLE_INFO[st.stance] || STYLE_INFO.accurate;
  /* The staff's two "Spell" styles name the spell they are set to repeat; with
     none chosen yet they only say what they train. */
  if ((info.xp || {}).magic) {
    const auto = autocastSpellOf(UI.ps);
    const lines = [auto ? "(Autocast)" : "(Spell)"];
    if (auto) lines.push("(" + auto.name + ")");
    lines.push("(Magic XP)");
    if (st.stance === "castDefensive") lines.push("(Defence XP)");
    return lines.join("\n");
  }
  const xp = info.xp || {};
  const lines = ["(" + info.name + ")"];
  const type = w && TYPE_WORD[w.style];
  if (type) lines.push("(" + type + ")");
  if (xp.magic) lines.push("(Magic XP)");
  else if (xp.ranged) lines.push("(Ranged XP)");
  else if (info.name === "Controlled") lines.push("(Shared XP)");
  else if (xp.defence) lines.push("(Defence XP)");
  else if (xp.strength) lines.push("(Strength XP)");
  else lines.push("(Attack XP)");
  if (st.stance === "longrange") lines.push("(Defence XP)");
  return lines.join("\n");
}

function combatHeading(panel) {
  const ps = UI.ps;
  const w = weaponOf(ps);
  const head = mk("div", "combatHead");
  place(head, 4, 0, 180, 44);
  head.appendChild(place(mk("div", "weaponName", w ? w.name : "Unarmed"), 0, 4, 180, 17));
  head.appendChild(place(mk("div", "combatLvl", "Combat Lvl: " + combatLevel(ps.skills)), 0, 25, 180, 12));
  panel.appendChild(head);
}

function renderCombat(panel) {
  const ps = UI.ps;
  const w = weaponOf(ps);
  /* The live handles the regen tick patches instead of rebuilding (see
     patchSpecBar below) - a rebuild flashes the whole tab, so they die here
     every render and are reborn with the bar. */
  specFillEl = specFrameEl = specCapEl = null;
  const styles = stylesForWeapon(w);
  if ((ps.styleIndex | 0) >= styles.length) ps.styleIndex = 0;
  const lay = layoutForWeapon(w);

  combatHeading(panel);

  /* The cache's own geometry, button for button: the style icon cell sits at a
     fixed offset inside its 34x24 cell at the top of the button, and the action
     name in a 70x13 strip 30px down, all of which layoutForWeapon carries
     verbatim. Selection shows only through the red-tinted button sprite, so the
     label colour is the same whichever style is active, as it is in the
     client. */
  /* A staff's two "Spell" styles stand for the spell the staff repeats: once
     one has been chosen the button carries that spell's own icon and name
     instead of the generic cast art, which is how the interface fills itself
     in. The spell itself is set from the book's right-click menu and
     remembered per staff - the tab only lights what is remembered. */
  const autoSpell = autocastSpellOf(ps);
  const castBtn = (st) => !!((STYLE_INFO[st.stance] || {}).xp || {}).magic;

  styles.forEach((st, i) => {
    const on = i === ps.styleIndex;
    const cast = castBtn(st);
    const tile = lay.tiles[Math.min(i, lay.tiles.length - 1)];
    const ico = lay.icons[Math.min(i, lay.icons.length - 1)];
    const base = tile[4] || "combat653";
    const btn = tileEl(on ? base.replace(/(\d+)$/, (m) => String(+m + 1)) : base, "styleBtn");
    place(btn, tile[0], tile[1], tile[2], tile[3]);
    let sprite = cast && autoSpell ? "spell" + autoSpell.id : "style" + st.sprite;
    let p = Frame.parts[sprite];
    if (!p) { sprite = "style" + st.sprite; p = Frame.parts[sprite]; }
    const spellIco = cast && autoSpell && sprite === "spell" + autoSpell.id;
    if (p) {
      const icon = spriteEl(sprite, "styleIco");
      if (spellIco) {
        /* An autocast spell's own icon is smaller than the cache's style art,
           so it is scaled to the blue shield's own height and centred in its
           button. The defensive cast shows the pair the client implies: the
           spell beside the cache's blue shield, side by side, centred as one
           row - no text, no drawn badge. */
        const shield = Frame.parts["style760"];
        const s = shield ? shield.h / p.h : 1;
        const sw = p.w * s, sh = p.h * s;
        icon.style.transformOrigin = "center";
        icon.style.transform = "scale(" + s + ")";
        if (st.stance === "castDefensive" && shield) {
          const gap = 2;
          const x0 = (tile[2] - (sw + gap + shield.w)) / 2;
          place(icon, Math.round(x0 + sw / 2 - p.w / 2), Math.round(tile[3] / 2 - p.h / 2), p.w, p.h);
          btn.appendChild(icon);
          const shEl = spriteEl("style760", "styleIco");
          place(shEl, Math.round(x0 + sw + gap), Math.round((tile[3] - shield.h) / 2), shield.w, shield.h);
          btn.appendChild(shEl);
        } else {
          place(icon, Math.round(tile[2] / 2 - p.w / 2), Math.round(tile[3] / 2 - p.h / 2), p.w, p.h);
          btn.appendChild(icon);
        }
      } else {
        /* The cache's style art sits where it is recorded inside its 34x24 cell. */
        const dx = ico[0] - tile[0] + (p.offX || 0);
        const dy = ico[1] - tile[1] + (p.offY || 0);
        place(icon, Math.round(dx), Math.round(dy), p.w, p.h);
        btn.appendChild(icon);
      }
    }
    btn.addEventListener("click", () => {
      /* The "Spell" styles only light what the staff remembers (the user's
         rule, 2026-10-09): the spell is set from the book's right-click menu,
         never here. Clicking the lit Spell style keeps casting it, clicking
         the other one resumes it after a bash on a melee style - no re-input
         either way. With nothing remembered the button points at the book. */
      if (cast) {
        if (autoSpell) {
          if (ps.styleIndex === i) return;
          ps.styleIndex = i;
          if (UI.actions.setAttackStyle) UI.actions.setAttackStyle(i);
          chat("Attack style: " + autoSpell.name, "game");
          mark("combat", "magic");
          return;
        }
        chat("Choose a spell in your spellbook to autocast it.", "game");
        setTab("magic");
        /* The exception to the book's left-click rule (the user's new flow):
           sent here by this very tap, the next single left-click on a spell
           picks the autocast and comes straight back to the combat tab. */
        UI.combatBookPick = true;
        return;
      }
      ps.styleIndex = i;
      if (UI.actions.setAttackStyle) UI.actions.setAttackStyle(i);
      /* Picking a combat style puts the weapon back in charge: the selected
         spell is dropped, which is how you go back to melee after casting. */
      if (UI.spell != null && !STYLE_INFO[st.stance].xp.magic) UI.spell = null;
      chat("Attack style: " + (cast && autoSpell ? autoSpell.name : st.name), "game");
      mark("combat", "magic");
    });
    btn.addEventListener("pointerenter", () => showHoverTip(styleTip(st, w)));
    btn.addEventListener("pointerleave", hideHoverTip);
    panel.appendChild(btn);
  });

  /* The label is a widget of its own in the cache, sitting under its button.
     A Spell button showing its spell's icon carries no name at all: the icon
     is the spell (the tooltip still names it), and the name is longer than the
     70px strip. With nothing remembered the button keeps its "Spell". */
  styles.forEach((st, i) => {
    if (castBtn(st) && autoSpell) return;
    const lab = lay.labels[Math.min(i, lay.labels.length - 1)];
    panel.appendChild(place(mk("span", "styleName", st.name), lab[0], lab[1], 70, 13));
  });

  /* Auto retaliate - the client's own toggle button (the knight is baked into
     the sprite; the two label lines sit to its right), off by default. */
  const auto = tileEl(UI.autoRetaliate ? "combat656" : "combat655", "styleBtn");
  auto.className = "tilebg styleBtn autoBtn";
  place(auto, 21, 152, 150, 46);
  auto.appendChild(mk("span", "styleName auto", "Auto Retaliate"));
  auto.appendChild(mk("span", "styleName auto2", "(" + (UI.autoRetaliate ? "On" : "Off") + ")"));
  auto.addEventListener("pointerenter", () => showHoverTip("Auto Retaliate\nWhen active your player\nwill automatically fight\nback if attacked"));
  auto.addEventListener("pointerleave", hideHoverTip);
  auto.addEventListener("click", () => {
    UI.autoRetaliate = !UI.autoRetaliate;
    if (UI.actions.setAutoRetaliate) UI.actions.setAutoRetaliate(UI.autoRetaliate);
    chat("Auto retaliate is now " + (UI.autoRetaliate ? "on" : "off") + ".", "game");
    mark("combat");
  });
  panel.appendChild(auto);

  /* The special-attack bar belongs to the weapon's special: a weapon with no
     special shows no bar at all (the user's rule). With one, the wiki's own
     look: the bar's full interior is the energy meter - a red bed with the
     energy's share over it in full height, green while it covers the weapon's
     cost, yellow when it cannot - and the "Special Attack: N%" caption sits
     over it in dark text, yellow while a special is queued. Geometry is the
     cache's: container (19,205) 158x64, bar sprite (21,205) 150x26, the meter
     inset 2px inside the 155x22 frame. */
  const hasSpec = !!(w && w.spec);
  const cost = (w && w.specCost) || 0;
  const energy = hasSpec ? Math.max(0, Math.min(100, ps.specEnergy == null ? 100 : ps.specEnergy)) : 0;
  if (hasSpec) {
    const spec = mk("div", "specBar");
    place(spec, 19, 205, 158, 64);
    pxSprite(spec, "combat657", 2, 0);
    pxRect(spec, 2, 3, 151, 18, "#ff0000");
    const fill = pxRect(spec, 2, 3, Math.max(1, Math.round(energy * 1.51)), 18, energy >= cost ? "#00b000" : "#ffff00");
    if (energy <= 0) fill.style.display = "none";
    specFillEl = fill;
    /* The cache bakes one bar sprite (653-657 are the whole combat family, and the
       bar itself is 657), so there is no "activated" art to swap in: this world's
       tell for a lit bar is the frame, drawn white instead of yellow. */
    specFrameEl = pxFrame(spec, 0, 1, 155, 22, UI.specOn ? "#ffffff" : "#ffff00");
    specCapEl = pxText(spec, "Special Attack: " + energy + "%", 2, 5, 151, 12,
      { font: "plain11", color: UI.specOn ? "#ffff00" : "#000010", align: 1, shadow: false });
    const specName = (UI.actions.specialName ? UI.actions.specialName(w) : w.spec) || w.spec;
    spec.addEventListener("pointerenter", () => showHoverTip(specName + " (" + energy + "%)\n" +
      (energy < cost ? "You need " + cost + "% special attack energy." : "Select to perform a special attack")));
    spec.addEventListener("pointerleave", hideHoverTip);
    spec.addEventListener("click", () => {
      UI.specOn = !UI.specOn;
      if (UI.specOn && energy < cost) {
        UI.specOn = false;
        chat("You need " + cost + "% special attack energy to use this attack.", "warn");
      }
      if (UI.actions.setSpecial) UI.actions.setSpecial(UI.specOn);
      if (!patchSpecBar()) mark("combat");
    });
    panel.appendChild(spec);
  }

  /* The weapon's category sits beneath the auto-retaliate and special-attack
     bar, exactly where the wiki puts it - and no Info button, by the user's
     rule. It holds its row whether or not the weapon has a special. */
  panel.appendChild(place(mk("div", "combatCat", "Category: " + weaponCategory(w)), 5, 272, 180, 12));
}

/* The special-attack bar's live handles: the energy number moves on the regen
   tick and on every paid swing, and rebuilding the whole combat tab for that
   flashed every button (the user's report). patchSpecBar moves only the fill,
   the frame and the caption, and reports whether it could - the caller falls
   back to mark("combat") when the tab is elsewhere or the weapon has no bar. */
let specFillEl = null, specFrameEl = null, specCapEl = null;
export function patchSpecBar() {
  if (UI.tab !== 0 || !specFillEl || !specFrameEl || !specCapEl) return false;
  const ps = UI.ps, w = weaponOf(ps);
  if (!w || !w.spec) return false;
  const cost = w.specCost || 0;
  const energy = Math.max(0, Math.min(100, ps.specEnergy == null ? 100 : ps.specEnergy));
  if (energy <= 0) specFillEl.style.display = "none";
  else {
    specFillEl.style.display = "";
    specFillEl.style.width = Math.max(1, Math.round(energy * 1.51)) + "px";
    specFillEl.style.background = energy >= cost ? "#00b000" : "#ffff00";
  }
  specFrameEl.style.borderColor = UI.specOn ? "#ffffff" : "#ffff00";
  specCapEl.textContent = "Special Attack: " + energy + "%";
  specCapEl.style.color = UI.specOn ? "#ffff00" : "#000010";
  return true;
}

/* ------------------------------------------------------------------- 1 skills */

/* Interface 320's tile rows. Rows 0..6 are six pieces wide (a 30px left half and
   a 33px slash half per skill column); the last row is only two columns wide and
   its pieces are 36px, because the row is shorter than the others. */
const STATS_TILE_PATTERN = [[-1, 30, "statsTileHalfLeft"], [29, 33, "statsTileHalfRightSlash"], [62, 30, "statsTileHalfLeft"], [92, 33, "statsTileHalfRightSlash"], [125, 30, "statsTileHalfLeft"], [155, 33, "statsTileHalfRightSlash"]];
const STATS_TILE_PATTERN_SHORT = [[-1, 36, "statsTileHalfLeft"], [29, 36, "statsTileHalfRightSlash"], [62, 36, "statsTileHalfLeft"], [92, 36, "statsTileHalfRightSlash"]];

function renderSkills(panel) {
  const ps = UI.ps;
  const byId = {};
  for (const s of SKILLS) byId[s.id] = s;
  /* The level numbers' live elements, keyed by skill id, so an xp gain can
     rewrite the two numbers in place (see `patchSkills`) instead of rebuilding
     the panel - the same fix the pack's own numbers got (see `patchInventory`
     and the README's "A count change no longer rebuilds the pack"): rebuilding
     23 icons and 47 numbers on every hit made the numbers flash while xp was
     arriving. A tab switch rebuilds and resumes patching. */
  skillNumEls.clear();
  totalLevelEl = null;

  /* the eight tile rows */
  for (let row = 0; row < 8; row++) {
    const y = STATS_ROWS[row];
    for (const [x, _w, spr] of (row === 7 ? STATS_TILE_PATTERN_SHORT : STATS_TILE_PATTERN)) {
      pxSprite(panel, spr, x, y);
    }
  }

  /* the skill icons, then the two level numbers (current and base). While a
     temporary boost or drain is running they differ - the current level is the
     boosted one, `st.level` the level the skill was trained to - which is
     exactly what the live client's two numbers mean ("this world has no
     temporary boosts" was true until the special attacks of unit T10). */
  for (const [col, row, id] of STATS_GRID) {
    const sprite = skillSprite(id);
    if (sprite) pxSprite(panel, sprite, STATS_ICON_X[col][row], STATS_ROWS[row] + STATS_ICON_Y[row]);
    const st = ps.skills[id];
    const cur = String(st ? boosted(ps.skills, id) : 1);
    const base = String(st ? st.level : 1);
    const curEl = pxText(panel, cur, STATS_TEXT_A[col], STATS_ROWS[row] + (row === 7 ? 6 : 5), 15, 12, { color: "#ffff00", align: 1 });
    const baseEl = pxText(panel, base, STATS_TEXT_B[col], STATS_ROWS[row] + 17, 15, 12, { color: "#ffff00", align: 1 });
    skillNumEls.set(id, { cur: curEl, base: baseEl });
  }

  /* the "Total level" box */
  pxRect(panel, 127, 222, 62, 31, "#726451");
  pxRect(panel, 128, 223, 60, 29, "#2e2b23");
  pxRect(panel, 129, 224, 59, 27, "#000000");
  totalLevelEl = pxText(panel, "Total\nLevel: " + totalLevel(ps.skills), 129, 223, 60, 30, { color: "#ffff00", align: 1, valign: 1 });

  /* the Total Level box carries the account's own summary - total xp and
     combat level - in the same yellow box as the skills above it */
  const totalHit = pxHit(panel, 127, 222, 62, 31, null, null);
  totalHit.addEventListener("pointerenter", () => {
    if (UI.ps) showTipRows(TOTAL_TIP_KEY, totalTipRows(UI.ps), 127, 222);
  });
  totalHit.addEventListener("pointerleave", hideSkillTip);

  /* the hover box, one per panel - filled and placed on hover (below) */
  skillTipBox = mk("div", "skillTipBox");
  skillTipBox.hidden = true;
  panel.appendChild(skillTipBox);
  skillTipFor = null;

  /* the interface's own 64x31 hit boxes carry the real tooltip, and clicking
     one opens the skill guide. The tip is read live on hover rather than
     frozen at render time, so it always shows the current xp. */
  for (const [col, row, id, x, y] of STATS_HIT) {
    const s = byId[id];
    if (!s) continue;
    const hit = pxHit(panel, x, y, 64, 31, null, () => { hideSkillTip(); openSkillGuide(id); });
    hit.addEventListener("pointerenter", () => {
      const live = UI.ps.skills[id] || { level: 1, xp: xpForLevel(1) };
      showSkillTipBox(id, s, live, x, y);
    });
    hit.addEventListener("pointerleave", hideSkillTip);
  }
}

/* Rewrite the skills tab's level numbers in place when they are what changed,
   the tab-1 twin of `patchInventory`. Returns false when the panel is not in
   the shape `renderSkills` left it (a tab switch, a first open), in which case
   the caller falls back to a full rebuild. */
function patchSkills() {
  if (UI.tab !== 1 || !UI.ps) return false;
  const ps = UI.ps;
  for (const [col, row, id] of STATS_GRID) {
    const rec = skillNumEls.get(id);
    if (!rec || !rec.cur.isConnected || !rec.base.isConnected) return false;
    const st = ps.skills[id];
    const cur = String(st ? boosted(ps.skills, id) : 1);
    const base = String(st ? st.level : 1);
    if (rec.cur.textContent !== cur) rec.cur.textContent = cur;
    if (rec.base.textContent !== base) rec.base.textContent = base;
  }
  if (totalLevelEl) {
    if (!totalLevelEl.isConnected) return false;
    const want = "Total\nLevel: " + totalLevel(ps.skills);
    if (totalLevelEl.textContent !== want) totalLevelEl.textContent = want;
  }
  /* an xp gain landing mid-hover refills the open box in place, so its rows
     never go stale under the cursor */
  if (skillTipFor && skillTipBox && !skillTipBox.hidden && skillTipBox.isConnected) {
    const rows = skillTipFor === TOTAL_TIP_KEY ? totalTipRows(ps)
      : ((s) => s && ps.skills[skillTipFor] ? skillTipLines(s, ps.skills[skillTipFor]) : null)(
        SKILLS.find((q) => q.id === skillTipFor));
    if (rows) {
      const divs = skillTipBox.children;
      for (let i = 0; i < rows.length && i < divs.length; i++) {
        const ks = divs[i].children[0], vs = divs[i].children[1];
        if (ks && ks.textContent !== rows[i][0]) ks.textContent = rows[i][0];
        if (vs && vs.textContent !== rows[i][1]) vs.textContent = rows[i][1];
      }
    }
  }
  return true;
}

function skillTip(s, st) {
  const rows = skillTipLines(s, st);
  return rows.map(([k, v]) => "<col=ffb000>" + k + " " + v).join("<col=ffffff><br>");
}

/* The three label/value rows the stats hover box shows, read live so they always
   carry the current xp (see `showSkillTipBox`). One pair per line: the label
   hugs the box's left edge and the number its right edge, the way the client's
   own tooltip draws them - the box's width is whatever the longest row needs. */
function skillTipLines(s, st) {
  const xp = Math.floor(st.xp);
  const next = st.level < MAX_LEVEL ? Math.floor(xpForLevel(st.level + 1)) : xp;
  return [
    [s.name + " XP:", formatNum(xp)],
    ["Next level at:", formatNum(next)],
    ["Remaining XP:", formatNum(Math.max(0, next - xp))],
  ];
}

/* The stats tab's own hover box element, rebuilt with the panel. `skillTipFor`
   names the skill it is showing - or TOTAL_TIP_KEY for the Total Level box -
   so an xp gain landing mid-hover can refill it in place (see `patchSkills`). */
let skillTipBox = null;
let skillTipFor = null;
const TOTAL_TIP_KEY = "__total__";
/* The Total Level box's own rows: the account's total xp and combat level. */
function totalTipRows(ps) {
  return [
    ["Total XP:", formatNum(Math.floor(totalXp(ps.skills)))],
    ["Combat level:", String(combatLevel(ps.skills))],
  ];
}
function showTipRows(key, rows, x, y) {
  const box = skillTipBox;
  if (!box || !box.isConnected) return;
  skillTipFor = key;
  box.innerHTML = "";
  for (const [k, v] of rows) {
    const row = mk("div", "tipRow");
    row.appendChild(mk("span", "k", k));
    row.appendChild(mk("span", "v", v));
    box.appendChild(row);
  }
  box.hidden = false;
  /* under the tile, or over it on the bottom row where there is no room below
     (the panel is 190x261); the left edge sits on the tile's own centre, the
     way the client's tooltip does, clamped so a wide box stays in the panel. */
  const h = box.offsetHeight || 42;
  const below = y + 33 + h <= 261;
  box.style.top = (below ? y + 33 : y - 2 - h) + "px";
  const w = box.offsetWidth || 150;
  box.style.left = Math.max(0, Math.min(x + 32, 188 - w)) + "px";
}
function showSkillTipBox(id, s, st, x, y) {
  showTipRows(id, skillTipLines(s, st), x, y);
}
function hideSkillTip() {
  skillTipFor = null;
  if (skillTipBox) skillTipBox.hidden = true;
}

/* ------------------------------------------------------------------- 2 quests */

function renderQuests(panel) {
  const ps = UI.ps;

  /* The rivetted ledger frame, straight out of interface 274: a sunken black
     page inside a corner-and-tiled-edge iron frame. */
  pxRect(panel, 7, 25, 161, 222, "#000000", 212);
  pxTiled(panel, "ironRivetsVertical", -12, 52, 21, 189);
  pxTiled(panel, "rivetEdgeRight", 150, 48, 21, 193);
  pxTiled(panel, "rivetEdgeTop", 10, 9, 143, 21);
  pxTiled(panel, "ironRivetsHorizontal", 10, 229, 150, 21);
  pxSprite(panel, "rivetCornerTopLeft", 3, 24);
  pxSprite(panel, "rivetCornerTopRight", 146, 24);
  pxSprite(panel, "rivetCornerBottomLeft", 3, 220);
  pxSprite(panel, "rivetCornerBottomRight", 146, 220);

  /* the header strip: quest points on the left, the diary-swap button on the
     right, and the section title where the client writes it */
  pxText(panel, "Quest Points: " + (ps.stats.questPoints || 0), 14, 4, 170, 14, { font: "bold12", color: "#eb981f" });
  pxSprite(panel, "questDiaryButton", 164, 4);
  pxHit(panel, 164, 4, 18, 18, "Swap to Achievement Diary", () => chat("There is no achievement diary in this world.", "game"));
  /* The title and the rows are children of the cache's scroll box at (4,24), so
     their own coordinates are relative to it - the title sits at (14,33) and the
     first row at (11,51). */
  pxText(panel, "Free Quests", 14, 33, 152, 15, { font: "bold12", color: "#ff9933" });

  /* The list itself. Every quest the player has begun is a coloured title -
     **yellow while it is under way, green once it is done**, which is the
     client's own convention for the entries below the "Free Quests" heading -
     with the journal's own lines beneath it. A quest nobody has begun prints
     nothing, so an empty log and a world with no quests in it look the same,
     exactly as the live journal intends.

     Everything but the colour and the position comes out of `QUESTS`
     (src/quests.js): a second quest is a row in that table and no code here at
     all, and a line may be a function of `ps`, which is how the started entry's
     wool counter stays live. The words are this world's own - the live game
     keeps its quest journals on the server and its wiki transcribes only the
     *dialogue* - and the module says so.

     The prose wraps, and each line's box height is **read back out of the
     browser's own layout** rather than guessed: plain12 is a bitmap font, and
     the frame's layout scale makes the same string wrap differently in the side
     panel than it would in the body, so a height counted anywhere else leaves a
     hole under the entry. The element is made at a one-line height and then told
     the height it wants. */
  let y = 51;
  for (const q of QUESTS) {
    const state = questState(ps, q.id);
    if (!state) continue;
    pxText(panel, q.name, 11, y, 144, 15, { font: "bold12", color: state >= QUEST_COMPLETE ? "#00ff00" : "#ffff00" });
    y += 17;
    for (const raw of q.journal[state] || []) {
      const line = typeof raw === "function" ? raw(ps) : raw;
      const el = pxText(panel, line, 11, y, 144, 12, { font: "plain12", color: "#ff981f" });
      el.style.height = el.scrollHeight + "px";
      y += el.scrollHeight + 2;
    }
    y += 6;
  }
}

/* ---------------------------------------------------------------- 3 inventory */

function renderInventory(panel) {
  const ps = UI.ps;
  const grid = mk("div", "invGrid");
  invSlotEls.clear();
  for (let i = 0; i < INV_SIZE; i++) {
    const s = ps.inv[i];
    const d = makeSlot(i, s);
    bindItemSlot(d, { where: "inv", index: i, stack: s });
    bindInvDrag(d, i);
    invSlotEls.set(i, d);
    grid.appendChild(d);
  }
  panel.appendChild(grid);
  /* the pack is redrawn under the item in the hand often enough (every eat and
     every drop) that the ring has to be re-put here, not only when Use is
     picked */
  paintUseSlot();
}

/* -------------------------------------------------------------- 4 equipment */

/* The eleven slot tiles, the ghost silhouette of an empty one, and the item
   sitting in a filled one - the "doll" of slots, empty in the middle. `ox`,`oy`
   shift the whole ring (interface 465 embeds the same ring 5px right and 67px
   down). */
function equipDoll(panel, ps, ox, oy, bind) {
  for (const [slot, x, y] of EQUIP_LAYOUT) {
    pxSprite(panel, "slotTile", ox + x, oy + y);
    const d = mk("div", "pxSlot");
    place(d, ox + x, oy + y, 36, 36);
    d.dataset.slot = slot;
    const s = ps.equip[slot];
    if (s) {
      const img = mk("img");
      /* an equipped stack (arrows) draws its own tier sprite too */
      img.src = itemIcon(s.id, 32, s.qty);
      img.draggable = false;
      img.alt = itemName(s.id);
      d.appendChild(img);
      /* A loaded stack (the ammo slot) shows how much is left, exactly as the
         pack does - the client prints the count on an equipped stack too. */
      if (showsCount(s.id, s.qty)) d.appendChild(mk("span", "qty", amountString(s.qty)));
      if (bind) bindItemSlot(d, { where: "equip", index: slot, stack: s });
    } else {
      pxSprite(d, EQUIP_SLOT_SPRITE[slot], 2, 2, { cls: "slotGhost" });
      d.addEventListener("pointerenter", () => showHoverTip(SLOT_LABEL[slot] + "\nNothing is equipped in this slot."));
      d.addEventListener("pointerleave", hideHoverTip);
    }
    panel.appendChild(d);
  }
}

const EQUIP_BONUS_LABELS = ["Stab", "Slash", "Crush", "Magic", "Range"];

/* ------------------------------------------------------ the character in the ring

   Only one of the two equipment screens shows the player's own model, and it is
   the "Equip Your Character..." window (465) - never the worn-equipment tab.

   The cache says so twice over. Interface 387 carries no model widget at all -
   its components are the eleven slot tiles, the twelve filler tiles and the two
   framed buttons, and nothing else - so the client has nothing to draw a
   character into and the ring stands empty. Interface 465 does carry one:
   component #76, a `t6` model widget at (209,201) sized 136x168, sitting
   *between* the repeated ring on the left and the bonus column on the right -
   the middle of the window, not the middle of the ring. Both numbers are
   template values the client ignores (a 168-tall box cannot hold a 207-pixel
   figure, and its y would hang it off a window that ends at 311), and the live
   game does not draw the character there anyway: measured off a 1:1 capture of
   the real window, the figure stands from x 222 to 292, its hair starting 81
   pixels below the window's top edge and its feet 34 above the floor. That
   placement - between the ring and the bonus column, standing low, clear of the
   ring's middle - is what this stage reproduces.

   The stage holds the *live* player model - the client builds it from what is
   actually worn - so it is a canvas the renderer fills (src/scene.js#drawDoll)
   rather than a sprite.

   It goes in AFTER the slot tiles rather than before them, so the figure is
   never painted under a tile it happens to overlap.

   The stage is taller than the figure it holds: the renderer draws a fixed
   span of model units with the framing anchored on the feet (see DOLL_SPAN),
   so the body lands at one size with its feet in one place whatever is worn,
   and tall headgear rises into the headroom above instead of shrinking the
   whole figure to fit. */
const DOLL_W = 160, DOLL_H = 262;
/* where that box belongs in interface 465 - across the middle of the window,
   clear of the ring at (27..175, 71..265) and of the bonus column at (358..).
   The top reaches above the ring so tall headgear has room; the bottom lands
   where it always did, with the figure's feet in the same place. */
const DOLL_X = 168, DOLL_Y = 36;

/* The figure is drawn at ONE size whatever is worn: `span` shows a fixed
   number of model units top to bottom (src/scene.js#drawDoll), so a tall hat
   can no longer shrink the body - it just rises into the headroom above. The
   framing is anchored on the feet: `foot` is the empty margin kept under them,
   in model units, and the centre follows the body's own measure, so boots and
   shields stay put while hats grow upward. */
const DOLL_SPAN = 2.2;
const DOLL_FOOT = 0.12;

/* How often the doll is re-rendered. The model is read back off the GPU to a 2D
   canvas (src/scene.js#drawDoll), which is a synchronous stall, so it is not
   worth doing at the frame rate for a mark that is a few centimetres tall on
   screen: twenty times a second is enough for the pose to follow the player and
   for a spin to feel live, at a third of the cost of every frame. */
const DOLL_REPAINT_MS = 50;

/* The doll can be spun with the mouse, exactly like the real one: the drag
   accumulates a yaw that the per-frame painter passes to the renderer. */
let dollDrag = null;
function onDollDown(ev) {
  ev.preventDefault();
  dollDrag = { x: ev.clientX, yaw: UI.dollYaw || 0 };
  window.addEventListener("pointermove", onDollMove);
  window.addEventListener("pointerup", onDollUp);
}
function onDollMove(ev) {
  if (!dollDrag) return;
  UI.dollYaw = dollDrag.yaw + (ev.clientX - dollDrag.x) * 0.02;
}
function onDollUp() {
  dollDrag = null;
  window.removeEventListener("pointermove", onDollMove);
  window.removeEventListener("pointerup", onDollUp);
}

/* One stage for the character, at the 465 model widget's own box (DOLL_X/
   DOLL_Y). It is draggable (`bind`): nothing clickable sits under it in that
   window, so it may take the pointer and spin on a drag. */
function placeDoll(panel, bind) {
  const cv = mk("canvas", "equipDoll");
  cv.width = DOLL_W;
  cv.height = DOLL_H;
  place(cv, DOLL_X, DOLL_Y, DOLL_W, DOLL_H);
  if (bind) {
    cv.title = "Drag to spin";
    cv.style.pointerEvents = "auto";
    cv.addEventListener("pointerdown", onDollDown);
  }
  panel.appendChild(cv);
  return cv;
}

/* The one stage there is - only interface 465 carries a model widget, so only
   its canvas is ever in need of a repaint. It is repainted before the world view
   is drawn, so the renderer can paint it into the frame first. */
function drawEquipDoll(force) {
  const p = G && G.player;
  if (!p || !p.ch || !p.ch.mesh || !G.view || !G.view.drawDoll) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  /* A rebuilt window (or a fresh canvas) cannot wait for the throttle: until
     the first paint lands the doll is a blank hole, which reads as the
     character blinking out for a frame whenever gear changes. */
  if (!force && now - (UI.dollPaintedAt || 0) < DOLL_REPAINT_MS) return;
  let painted = false;
  const cv = UI.doll;
  if (cv && cv.isConnected && cv.width) {
    /* Feet-anchored, fixed-scale framing: the span never changes, and the
       centre is the feet plus half the span, so the figure lands at one size
       with its feet in one place no matter what hat is on. Read off the same
       authored measure the renderer frames from; without one, centre as usual. */
    let sink = 0;
    const measure = p.ch.mesh.userData && p.ch.mesh.userData.measure;
    if (measure) sink = (measure.minY + measure.hgt / 2) - (measure.minY + DOLL_SPAN / 2 - DOLL_FOOT);
    G.view.drawDoll(p.ch.mesh, cv, UI.dollYaw || 0, 0, 0, sink, DOLL_SPAN);
    painted = true;
  }
  if (painted) UI.dollPaintedAt = now;
}

function renderEquipment(panel) {
  const ps = UI.ps;

  /* interface 387, component for component: the dark filler tiles first, then
     the eleven recessed slot tiles, then the two framed buttons across the
     bottom. Nothing else - 387 carries no model widget, so the ring stands
     empty here and the character is only ever drawn in 465 (renderEquipStats).
     The bonuses live in their own window too. */
  for (const [name, x, y] of EQUIP_FILLER) pxSprite(panel, name, x, y);
  equipDoll(panel, ps, 0, 0, true);

  for (const [id, x, y] of EQUIP_ARROWS) {
    const name = {
      913: "equipBtnTopLeft", 914: "equipBtnTopRight", 915: "equipBtnBottomLeft", 916: "equipBtnBottomRight",
      917: "equipBtnLeft", 918: "equipBtnTop", 919: "equipBtnRight", 920: "equipBtnBottom",
    }[id];
    pxSprite(panel, name, x, y);
  }
  /* The two framed buttons brighten on hover like the world's other icon
     buttons: the hit box is transparent, so it lights the sprite under it. */
  const statsSpr = pxSprite(panel, "optionIcon675", 45, 210);
  const keptSpr = pxSprite(panel, "itemsLostOnDeath", 113, 211);

  const statsHit = pxHit(panel, 38, 205, 34, 34, "Show Equipment Stats", () => FullIface.show("equipstats", renderEquipStats, { keepWorld: true }));
  const keptHit = pxHit(panel, 123, 204, 34, 34, "Show Items Kept on Death", showItemsKept);
  if (statsSpr) {
    statsHit.addEventListener("pointerenter", () => { statsSpr.style.filter = "brightness(1.35)"; });
    statsHit.addEventListener("pointerleave", () => { statsSpr.style.filter = ""; });
  }
  if (keptSpr) {
    keptHit.addEventListener("pointerenter", () => { keptSpr.style.filter = "brightness(1.35)"; });
    keptHit.addEventListener("pointerleave", () => { keptSpr.style.filter = ""; });
  }
}

/* -------------------------------------------------- items kept on death

   Interface 102, component for component out of the cache. It is the window
   the worn-equipment tab's second framed button opens - the cache's own
   tooltip on that button is "Show Items Kept on Death" - and until now this
   build answered the click with a chatbox dialogue.

   The cache's 102 is a *template* and says so in its own strings: its two list
   headings are real ("Items you will keep on death if not skulled:" / "Items
   you will lose on death if not skulled:"), but the information column still
   carries "This is where the information goes" and "put information in here",
   and its two list containers are empty because the client fills them at
   runtime. So the **layout below is the cache's own** - every x/y/w/h and every
   sprite id is out of component 102's definition, including the window frame,
   which is the same BOTTOM_LINE_MODE family the trade window is built from
   (src/trade.js) - and the **content is this world's**: the two lists come from
   src/player.js#keptOnDeath, which is the very function `combat.js#playerDeath`
   spends, so the window cannot promise a death you will not get.

   Three things the cache has no answer for, decided here and said plainly:

     * **the item lists are drawn as a row of icons** on the project's usual
       slot pitch (36px, the `.slot` the bank and the trade window use, each
       with the client's yellow quantity and a hover name). The client's own
       item-list renderer is not in the cache - a container component has no
       children until the client makes them - so there is nothing to transcribe.
     * **the two headings are drawn on one line each.** The cache sizes them
       117x16 with a 41-character string in them, which cannot be a wrapped box;
       `nowrap` is what makes them read as the client's own line.
     * **the information column's prose** is this world's own, in the voice the
       rest of the menus use. It describes exactly what `keptOnDeath` does and
       nothing else: the three most valuable items, four with Protect Item, the
       rest on the ground, and a bank that is never touched.

   The fonts and colours are the cache's: 496 bold12 for the title, 495 plain12
   for the headings and the information label, 494 plain11 for the information
   body (line height 12, as the component says), and #ff981f throughout. */

const KEPT_WIN = [
  /* component 0: the window's own drop shadow - a black plate the backdrop is
     then drawn over, so only its right and bottom edges ever show */
  ["box", 13, 14, 495, 314, "#000000", 56],
  ["tiled", "dialogBack", 12, 11, 490, 315],
  ["tiled", "tradeEdgeTop", 17, -4, 475, 28],
  ["tiled", "tradeEdgeLeft", -5, 24, 23, 289],
  ["tiled", "tradeEdgeRight", 486, 24, 28, 287],
  ["tiled", "tradeEdgeBottom", 18, 306, 478, 27],
  ["spr", "tradeCornerTopLeft", 8, 9],
  ["spr", "tradeCornerTopRight", 474, 9],
  ["spr", "tradeCornerBottomLeft", 8, 294],
  ["spr", "tradeCornerBottomRight", 474, 294],
  ["tiled", "tradeBand", 17, 23, 480, 26],
  ["spr", "tradeBossLeft", 8, 25],
  ["spr", "tradeBossRight", 474, 25],
  ["spr", "tradeClose", 481, 18],
  /* the two panels the window is divided into: the dark plate the lists sit on
     (component 14: a type-3 box at (19,46) 316x270, #010101 at the cache's
     inverted alpha 200) and the vertical spine that separates the information
     column from it (component 24, a tiled 30x271 strip with a stud at each end) */
  ["box", 19, 46, 316, 270, "#010101", 56],
  ["tiled", "tradeSpine", 324, 45, 30, 271],
  ["spr", "tradeStudTop", 325, 37],
  ["spr", "tradeStudBottom", 325, 293],
  ["text", "Items Kept on Death", 36, 20, 436, 13, { font: "bold12", color: "#ff981f", align: 1, valign: 1 }],
  ["text", "Items you will keep on death if not skulled:", 24, 50, 300, 16, { font: "plain12", color: "#ff981f", nowrap: true }],
  ["text", "Items you will lose on death if not skulled:", 24, 110, 300, 16, { font: "plain12", color: "#ff981f", nowrap: true }],
  ["text", "Information:", 348, 49, 133, 15, { font: "plain12", color: "#ff981f" }],
];

/* The two lists' own geometry. The keep list gets the strip between its heading
   and the lose heading (component 18 is 316x275, which overruns the panel - the
   headings are what actually divide the plate), the lose list the rest of it
   down to the panel floor at y 316. Eight 38px columns start at the panel's own
   left padding; a row is 36px, the slot the rest of the game uses. */
const KEPT_GRID = { x: 24, cols: 8, stepX: 38, stepY: 36, keepY: 68, loseY: 128, floor: 316 };

const KEPT_INFO = "When you die you keep the three most valuable items you are carrying - what you wear counts, and so does the whole of a stack.\n\nThe Protect Item prayer keeps one more item, for four in all.\n\nEverything else falls where you die, for anyone to pick up.\n\nItems in your bank are safe.";

function renderItemsKept(iface) {
  for (const o of KEPT_WIN) {
    const kind = o[0];
    if (kind === "box") pxRect(iface, o[1], o[2], o[3], o[4], o[5], o[6]);
    else if (kind === "spr") pxSprite(iface, o[1], o[2], o[3]);
    else if (kind === "tiled") pxTiled(iface, o[1], o[2], o[3], o[4], o[5], true);
    else if (kind === "text") pxText(iface, o[1], o[2], o[3], o[4], o[5], o[6]);
  }
  pxHit(iface, 473, 10, 32, 32, "Close", () => FullIface.hide());

  const { keep, lost } = keptOnDeath(UI.ps);
  drawKeptList(iface, keep, KEPT_GRID.keepY);
  drawKeptList(iface, lost, KEPT_GRID.loseY);
  if (!keep.length && !lost.length) {
    pxText(iface, "You are not carrying anything.", 24, KEPT_GRID.keepY, 300, 16, { font: "plain12", color: "#ff981f" });
  }

  /* the information column: the cache's own boxes (348,70) 149x193 for the body
     and (348,267) 149x46 centred for the footer */
  pxText(iface, KEPT_INFO, 348, 70, 149, 193, { font: "plain11", color: "#ff981f", lineHeight: 12 });
  let lostValue = 0;
  for (const e of lost) lostValue += e.value;
  pxText(iface, "Value of items lost:\n" + formatNum(lostValue) + " gp", 348, 267, 149, 46, { font: "plain12", color: "#ff981f", align: 1, valign: 1 });
}

/* One of the two lists: item icons on the game's own slot pitch, in the order
   `keptOnDeath` ranked them (most valuable first), with the client's yellow
   quantity on a stack and the item's name on the hover. The last row that would
   cross the panel floor is dropped rather than drawn over the window's edge. */
function drawKeptList(iface, items, y0) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x = KEPT_GRID.x + (i % KEPT_GRID.cols) * KEPT_GRID.stepX;
    const y = y0 + Math.floor(i / KEPT_GRID.cols) * KEPT_GRID.stepY;
    if (y + 32 > KEPT_GRID.floor) break;
    const d = mk("div", "slot keptSlot");
    place(d, x, y, 32, 32);
    const img = mk("img");
    img.src = itemIcon(it.id, 32, it.qty);
    img.draggable = false;
    d.appendChild(img);
    if (showsCount(it.id, it.qty)) d.appendChild(mk("span", "qty", amountString(it.qty)));
    const def = itemDef(it.id) || { name: it.id, examine: "It's a " + it.id + "." };
    d.addEventListener("pointerenter", () => showHoverTip(hoverHTML(it, def)));
    d.addEventListener("pointerleave", hideHoverTip);
    iface.appendChild(d);
  }
}

/* "Show Items Kept on Death" - the equipment tab's second framed button. */
function showItemsKept() {
  FullIface.show("keptitems", renderItemsKept);
}

/* Interface 465 - the "Equip Your Character..." window, opened from the doll's
   first framed button. A 6x5 grid of dialog-background tiles under an iron
   frame; the ring is repeated on the left at an offset of (5,67), the character
   stands in the window's own 136x168 model box in the middle (placeDoll), and
   the bonus text runs down the right.

   The window is walkable (keepWorld): switching side tabs does not close it,
   so the inventory stays usable beside it and gear swapped there shows up here
   - the frame loop re-renders any open interface on every marked change, which
   is what keeps the bonus column live while it is up. */
function renderEquipStats(iface) {
  const ps = UI.ps;
  const x0 = 12, y0 = 20, x1 = 475, y1 = 290;

  for (let gy = 0; gy < 5; gy++) {
    for (const gx of [12, 100, 188, 276, 364, 412]) pxSprite(iface, "dialogBack", gx, y0 + gy * 60);
  }

  /* the window's iron frame */
  pxSprite(iface, "rivetCornerTopLeft", x0, y0);
  pxSprite(iface, "rivetCornerTopRight", x1, y0);
  pxSprite(iface, "rivetCornerBottomLeft", x0, y1);
  pxSprite(iface, "rivetCornerBottomRight", x1, y1);
  pxTiled(iface, "rivetEdgeTop", 37, 5, 402, 21);
  pxTiled(iface, "ironRivetsHorizontal", 37, 299, 402, 21);
  pxTiled(iface, "ironRivetsVertical", -3, 45, 21, 245);
  pxTiled(iface, "rivetEdgeRight", 479, 46, 21, 244);

  /* the ring, repeated - fully working here: the same click that removes gear
     on the worn-equipment tab removes it here too (see equipDoll's bind) */
  for (const [name, x, y] of EQUIP_FILLER) pxSprite(iface, name, x + 5, y + 67);
  equipDoll(iface, ps, 5, 67, true);

  /* the character: the window's own model widget, in the middle of the window,
     to the right of the ring - nowhere near the ring's centre. Painted at once
     so the fresh canvas never shows a blank frame (see drawEquipDoll). */
  UI.doll = placeDoll(iface, true);
  drawEquipDoll(true);

  /* the title and the close button */
  pxText(iface, "Equip Your Character...", 23, 29, 458, 14, { font: "bold12", color: "#ff981f" });
  pxSprite(iface, "closeButton", 471, 26);
  pxHit(iface, 471, 26, 26, 23, "Close", () => FullIface.hide());

  /* the bonus columns, at the coordinates interface 465's own scroll box puts
     them (its children are relative to the box at (358,70), which it then
     scrolls) */
  const b = totalBonus(ps);
  pxText(iface, "Attack bonus", 365, 71, 111, 15, { font: "bold12", color: "#ff981f" });
  ["astab", "aslash", "acrush", "amagic", "arange"].forEach((k, i) =>
    pxText(iface, EQUIP_BONUS_LABELS[i] + ": " + sign(b[k] || 0), 372, 85 + i * 14, 111, 15, { font: "plain12", color: "#ff981f" }));
  pxText(iface, "Defence bonus", 365, 163, 111, 15, { font: "bold12", color: "#ff981f" });
  ["dstab", "dslash", "dcrush", "dmagic", "drange"].forEach((k, i) =>
    pxText(iface, EQUIP_BONUS_LABELS[i] + ": " + sign(b[k] || 0), 372, 177 + i * 14, 111, 15, { font: "plain12", color: "#ff981f" }));
  pxText(iface, "Other bonuses", 365, 253, 111, 15, { font: "bold12", color: "#ff981f" });
  pxText(iface, "Strength: " + sign(b.str || 0), 372, 267, 111, 15, { font: "plain12", color: "#ff981f" });
  pxText(iface, "Prayer: " + sign(b.pray || 0), 372, 281, 111, 15, { font: "plain12", color: "#ff981f" });

  /* weight carried, with the cache's own little weight icon */
  pxSprite(iface, "equipmentWeight", 73, 285);
  pxText(iface, weightText(ps), 94, 286, 62, 17, { font: "plain12", color: "#ff9800", valign: 1 });
  pxHit(iface, 73, 285, 60, 18, "Weight carried includes all backpack items", null);
}

function sign(n) {
  return (n >= 0 ? "+" : "") + n;
}

function weightText(ps) {
  const w = totalWeight(ps);
  return (Math.round(w * 10) / 10).toFixed(1) + "kg";
}

/* ------------------------------------------------------------------- 5 prayer */

/* Interface 271's prayer book: five columns of six 30x30 icons on a 37px pitch,
   each sitting inside a 34x34 "glow" frame that the client only shows while the
   prayer is up. The interface stores the *drained* icon (135..154, 506..509,
   949/950) and the client swaps in the lit one when the level is met. */
const PRAYER_COLS = 5;
const PRAYER_PITCH = 37;

/* The lit icon's part name, and the drained one, for a prayer entry. The first
   block of drained icons is its own range of sprites; the later ones share the
   plain `prayerNNN` name. */
function prayerLitName(p) { return "prayer" + p.id; }
function prayerOffName(p) { return Frame.parts["prayerOff" + p.off] ? "prayerOff" + p.off : "prayer" + p.off; }

/* ------------------------------------------------------ the overhead head icons

   The icon that flies over a head while an overhead prayer is up is NOT the
   prayer book's own icon. The client keeps them in a separate sprite group,
   `headicons_prayer` (cache index 8 archive 440, baked here as `headicon0`..
   `headicon6` - seven live 25x25 frames; see src/tools/cache-bake/frame.mjs#
   GROUPS), and they are their own artwork: gold badge frames around a symbol,
   not the 30x30 book cells. This table maps a prayer id (src/prayer.js#PRAYERS)
   to that archive's frame index. The mapping was read off the art itself - the
   three Protects carry the sword/arrow/torch of their book cells, and
   Retribution, Smite and Redemption match their book cells' colours - and the
   order is the client's own: the three Protects first (Melee, Missiles, Magic,
   the order the book lists them in), then Retribution, Smite, Redemption, then
   Protect Item.

   Every overhead prayer this world has is here; a prayer that is not is simply
   given no icon rather than the wrong one. */
const OVERHEAD_HEAD_ICON = {
  129: 0,  /* Protect from Melee */
  128: 1,  /* Protect from Missiles */
  127: 2,  /* Protect from Magic */
  131: 3,  /* Retribution */
  132: 4,  /* Smite */
  130: 5,  /* Redemption */
  123: 6,  /* Protect Item */
};

function overheadHeadPart(p) {
  const i = p ? OVERHEAD_HEAD_ICON[p.id] : undefined;
  return i == null ? null : "headicon" + i;
}

function renderPrayer(panel) {
  const ps = UI.ps;
  const level = ps.skills.prayer.level;
  /* The setup screen the prayer orb's right-click opens: the same cells, but a
     click adds or removes the prayer from the quick set instead of praying it,
     and a chosen one wears its glow. */
  const setup = !!UI.quickSetup;

  PRAYERS.forEach((p, i) => {
    const col = i % PRAYER_COLS;
    const row = Math.floor(i / PRAYER_COLS);
    const gx = 4 + PRAYER_PITCH * col;
    const gy = 8 + PRAYER_PITCH * row;
    const on = prayerUp(ps, p.name);
    const locked = level < p.level;
    const chosen = setup && isQuickMember(ps, p);

    /* The lit/drained swap is the *level*'s, not the prayer's: the client draws
       the lit icon for every prayer whose requirement is met and the drained one
       for the ones you cannot use yet - so the book fills in with colour as the
       level rises, which is the whole reason a Prayer level-up feels like one.
       Which prayers are actually *up* is a separate question and is answered by
       the glow frame behind the icon, the client's own `prayerGlow`. Getting the
       two confused painted only the active prayers lit and left every other
       usable one looking drained, i.e. greyed out exactly like the ones the
       player cannot pray at all. A prayer you are too low for keeps its drained
       sprite in the setup screen too. */
    if (on && !setup) pxSprite(panel, "prayerGlow", gx, gy);
    if (!(chosen && pxQuickGlow(panel, p, !locked, gx, gy))) {
      pxSprite(panel, locked ? prayerOffName(p) : prayerLitName(p), gx + 2, gy + 2);
    }

    pxHit(panel, gx, gy, 34, 34, setup ? quickSetupTip(p, locked, chosen) : prayerTip(p, locked), () => {
      if (setup) {
        const added = toggleQuickMember(ps, p);
        chat((added ? "Added " : "Removed ") + p.name + (added ? " to" : " from") + " your quick prayers.", "game");
        mark("prayer");
        return;
      }
      const r = togglePrayer(ps, p);
      if (!r.ok) { chat(r.why, "warn"); return; }
      chat(r.on ? "You start praying " + p.name + "." : "You stop praying " + p.name + ".", "game");
      mark("prayer");
    });
  });

  if (setup) {
    /* The setup screen's Done button, where the points counter usually sits. It
       is the client's own 83x20 stone button - sprite 812, the one the bank's
       mode buttons wear - under the cache's own yellow label, so the screen is
       built from art the client already has. */
    const bx = 53, by = 237;
    const spr = pxSprite(panel, "bankModeButton", bx, by);
    const hit = pxHit(panel, bx, by, 83, 20, "Confirm your quick prayers", () => {
      UI.quickSetup = false;
      chat("Quick prayers updated.", "game");
      mark("prayer");
    });
    if (spr) {
      hit.addEventListener("pointerenter", () => Frame.setBg(spr, "bankModeButtonHover"));
      hit.addEventListener("pointerleave", () => Frame.setBg(spr, "bankModeButton"));
    }
    pxText(panel, "Done", bx, by, 83, 20, { font: "bold12", color: "#ff981f", align: 1, valign: 1 });
    return;
  }

  /* the point counter in the panel's bottom-right corner */
  pxSprite(panel, "prayerPointsIcon", 63, 238);
  pxText(panel, Math.round(ps.prayerPoints) + " / " + ps.maxPrayer, 87, 238, 48, 18,
    { font: "plain12", color: "#ff981f", valign: 1 });
}

function prayerTip(p, locked) {
  let h = "<col=ff9040>" + p.name + "<col=ffffff><br>" + p.desc;
  const drain = drainPerMinute(UI.ps, totalBonus(UI.ps).pray);
  if (locked) h += "<br><col=ff0000>Level " + p.level + " Prayer required";
  else h += "<br>Level " + p.level + " Prayer";
  if (drain > 0) h += "<br><col=ff981f>Draining " + drain.toFixed(1) + " points/min";
  return h;
}

/* The setup screen's tip for one cell: the prayer's own line plus what the
   click will do to it. */
function quickSetupTip(p, locked, chosen) {
  let h = "<col=ff9040>" + p.name + "<col=ffffff><br>" + p.desc;
  if (locked) h += "<br><col=ff0000>Level " + p.level + " Prayer required";
  else h += "<br>Level " + p.level + " Prayer";
  h += chosen
    ? "<br><col=ff00ff>Click to take this out of your quick prayers."
    : "<br><col=ffffff>Click to add this to your quick prayers.";
  return h;
}

/* ------------------------------------------------------- the quick-prayer glow

   The live game's quick-prayers setup screen marks a chosen prayer with a
   magenta glow that hugs the icon's own silhouette (read off the wiki's own
   `Quick_prayers_interface.png`: a one-to-two pixel contour *outside* the art,
   the interior left untouched). So it is drawn the way the pack's "item in
   hand" outline is (src/icons.js#ringedIconCanvas) - the icon's own pixels
   dilated by two and painted round the art - and cached per prayer and state.
   Glow and icon have to be *one* image: an element underneath would be covered
   by the icon's opaque pixels, and one on top would cover the art. */
const QUICK_GLOW = "#b03ce8";
const QUICK_GLOW_R = 2;
const quickGlowCache = new Map();

function quickGlowUrl(p, lit) {
  const key = p.id + (lit ? "L" : "D");
  if (quickGlowCache.has(key)) return quickGlowCache.get(key);
  const part = Frame.parts[lit ? prayerLitName(p) : prayerOffName(p)];
  if (!part || !Frame.atlas) return null;
  const R = QUICK_GLOW_R, W = part.w + R * 2, H = part.h + R * 2;
  const art = document.createElement("canvas");
  art.width = part.w; art.height = part.h;
  const ac = art.getContext("2d");
  ac.imageSmoothingEnabled = false;
  ac.drawImage(Frame.atlas, part.x, part.y, part.w, part.h, 0, 0, part.w, part.h);
  const a = ac.getImageData(0, 0, part.w, part.h).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < part.w && y < part.h && a[(y * part.w + x) * 4 + 3] > 0;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const oc = out.getContext("2d");
  oc.imageSmoothingEnabled = false;
  /* Every glow pixel is collected before any is painted, so a painted pixel can
     never thicken its own glow - the same reason the icon ring collects first.
     Output (x,y) shows the art's (x-R, y-R), so the art lands at (R,R). */
  const px = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x - R, y - R)) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) {
        for (let dx = -R; dx <= R; dx++) if (solid(x - R + dx, y - R + dy)) { near = true; break; }
      }
      if (near) px.push(x, y);
    }
  }
  oc.fillStyle = QUICK_GLOW;
  for (let i = 0; i < px.length; i += 2) oc.fillRect(px[i], px[i + 1], 1, 1);
  oc.drawImage(art, R, R);
  const url = out.toDataURL("image/png");
  quickGlowCache.set(key, url);
  return url;
}

/* One prayer cell wearing that glow, placed so the art lands exactly where the
   plain atlas sprite would have put it. */
function pxQuickGlow(panel, p, lit, x, y) {
  const part = Frame.parts[lit ? prayerLitName(p) : prayerOffName(p)];
  const url = quickGlowUrl(p, lit);
  if (!part || !url) return false;
  const e = mk("div", "spr");
  e.style.backgroundImage = 'url("' + url + '")';
  place(e, x + (part.offX || 0) - QUICK_GLOW_R, y + (part.offY || 0) - QUICK_GLOW_R,
    part.w + QUICK_GLOW_R * 2, part.h + QUICK_GLOW_R * 2);
  panel.appendChild(e);
  return true;
}

/* ------------------------------------------------------------------- 6 magic */

/* Interface 192 - the standard spellbook. Every cell, in the cache's own order,
   with the interface's own drained sprite ids (lit id + 50) turned back into
   the lit ids. Seven columns of 24x24 cells starting at (12,10): the cache's
   nine rows grew to ten when this world added the two extra undead spells, and
   the origin moved up with them to keep the tray evenly filled (the full story
   is in the header of src/magic.js). The data itself lives in src/magic.js.

   The client gates the lit icon on the Magic level alone; we gate it on the
   level *and* the runes, like the spellbook's own "spells you can cast" filter,
   so a spell you cannot afford sits there drained until you have what it needs.

   There is no selection sprite anywhere in cache 241 (index 8 was decoded in
   full looking for one), so the selected spell is marked with the client's own
   one-pixel component outline - the same treatment the special-attack bar's
   yellow frame gets - and confirmed in the chatbox. */

let lastSpellPointerAt = 0;
function singleLoansStaff() {
  const s = UI.spell == null ? null : spellById.get(UI.spell);
  return !!s && (s.kind === "combat" || s.kind === "stat" || s.kind === "bind" || s.kind === "npc");
}
export function renderMagic(panel) {
  const ps = UI.ps;
  const book = bookById(UI.book);

  /* Every book draws from its own layout: the standard book's computed 7x10
     grid, and the cache interfaces' hand-placed cells for the Ancient Magicks
     and the Lunar book (see src/magic.js#BOOKS). A cell is a 24x24 hit box
     whatever the book, which is the cell size all three interfaces use. */
  book.layout.forEach((cell) => {
    const spell = spellById.get(cell.id);
    if (!spell) return;
    const st = spellStatus(ps, spell);
    const lit = "spell" + spell.id;
    /* The cache stores the *drained* icon for every cell (its id is the lit
       id + 50) and the client paints the lit one only while the level and the
       runes allow the cast - so the tab itself shows what you can cast. */
    let sprite = st.ok ? lit : "spellOff" + (spell.id + 50);
    if (!Frame.parts[sprite]) sprite = lit;
    if (!Frame.parts[sprite]) return;
    const sprEl = pxSprite(panel, sprite, cell.x, cell.y);
    /* Superior Blast's player-drawn art bakes 2px taller than the book's
       combat norm (16x22 vs the 13x20 of the blasts beside it) - an optical
       scale only, centred where it was painted; the atlas is untouched. */
    if (sprEl && spell.id === 73) {
      const q = Frame.parts[sprite];
      if (q && q.h > 20) { sprEl.style.transformOrigin = "center"; sprEl.style.transform = "scale(" + (20 / q.h) + ")"; }
    }
    /* The selection marker is the client's own one-pixel component outline in
       white, around the picked cell (user, 2026-10-07). Only the one-off pick
       (`UI.spell`) is marked - every spell alike, Wind Strike included.
       Autocast is a different state with its own home: the combat tab's Spell
       style button names the spell the staff is set to, and `ps.autocast`
       never sets a marker in the book (the client draws none for either
       state). Marking both meant two cells lit at once whenever they
       disagreed. */
    /* Three squares, never confused: white is the staff's remembered combat
       autocast, yellow the queued one-off single cast, green the remembered
       production spell (no staff holds it - it works inventory items only).
       While a staff-loaning single is queued the white square dims to grey -
       the staff has not forgotten, it is loaned out for one cast - and undims
       the moment the single fires. An inventory single loans nothing, so white
       stays lit under it. Both on one cell shows yellow, and the tooltip says
       both. */
    if (UI.spell === spell.id) pxFrame(panel, cell.x, cell.y, SPELL_CELL, SPELL_CELL, "#ffff00");
    else if (UI.ps && UI.ps.autocast === spell.id) pxFrame(panel, cell.x, cell.y, SPELL_CELL, SPELL_CELL, singleLoansStaff() ? "#808080" : "#ffffff");
    else if (UI.ps && UI.ps.prodAutocast === spell.id) pxFrame(panel, cell.x, cell.y, SPELL_CELL, SPELL_CELL, "#00ff00");
    const hit = pxHit(panel, cell.x, cell.y, SPELL_CELL, SPELL_CELL, spellTip(spell, st), spell.id === 15 ? null : () => selectSpell(spell, spellStatus(UI.ps, spell)));
    if (spell.id === 15) {
      hit.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        lastSpellPointerAt = performance.now();
        e.preventDefault();
        selectSpell(spell, spellStatus(UI.ps, spell));
      });
      hit.addEventListener("click", () => {
        if (performance.now() - lastSpellPointerAt < 600) return;
        selectSpell(spell, spellStatus(UI.ps, spell));
      });
    }
    hit.addEventListener("contextmenu", (e) => { e.preventDefault(); spellMenu(e, spell); });
  });

  /* The book's name and the switch. There is no such widget in the cache - the
     real 2007 client changed books by praying at an altar - so this is one line
     of the panel's own bitmap font at the foot of the tray, and clicking it
     cycles to the next book. It is deliberately plain: no invented sprite. */
  pxText(panel, book.name + (BOOKS.length > 1 ? "  >" : ""), 4, 250, 182, 11,
    { font: "plain11", color: "#ff981f", align: 1 });
  pxHit(panel, 2, 250, 186, 11, "Spellbook: " + book.name + ". Click to switch.", () => {
    cycleBook();
  });
}

/* Step to the next spellbook. A selected spell belongs to the book that is
   open, so switching drops it - leaving it picked would fire a spell whose cell
   is not even on screen. */
export function cycleBook(to) {
  const idx = BOOKS.findIndex((b) => b.id === (to || UI.book));
  const next = BOOKS[((idx < 0 ? 0 : idx) + (to ? 0 : 1)) % BOOKS.length];
  UI.spell = null;
  UI.book = next.id;
  /* Reading a book by hand is not a Spellbook Swap: the swap's fallback is
     armed against the book it handed over, so a manual change drops it rather
     than letting the next cast yank the panel somewhere the player did not ask
     for (src/actions.js#noteSwapCast). */
  if (UI.ps) { UI.ps.swapFrom = null; UI.ps.swapTo = null; }
  chat("You are reading the " + next.name + " spellbook.", "game");
  mark("magic", "combat");
}

/* Clicking a spell makes it the active one: the next NPC you click is cast at.
   Clicking the active spell again clears it, and so does picking a melee
   combat style (see the style buttons below), so there is always a way back to
   hitting things with a sword.

   Teleports and Charge are cast on the spot, the way the live client casts
   them: clicking the teleport simply moves you. Alchemy and Superheat want an
   item, so they stay selected until one is clicked in the inventory. */
export function selectSpell(spell, st) {
  /* A spell whose machinery this world has not got says so, in its own words,
     before anything else is asked about it - a row's `refuses` is the one place
     that knows why, and the same line is answered by the cast path
     (src/actions.js#castSpell), so the book and the click cannot disagree. No
     row sets a `refuses` today (the two Potion Shares were the last, and the
     nineteenth report gave them their real machinery); the hook is kept for the
     next spell that needs to say what it is missing. */
  if (spell.refuses) { chat(spell.refuses, "warn"); return; }
  /* Sent to the book by a combat-tab Spell button with nothing remembered:
     this single left-click picks the autocast (not the one-off single) and
     goes straight back to the combat tab. Reach the book any other way and
     the click below stays the yellow single, as before. */
  if (UI.combatBookPick) {
    UI.combatBookPick = false;
    if (spell.autocast) {
      setAutocastFromBook(spell);
      if (UI.ps && UI.ps.autocast === spell.id) setTab(0);
      return;
    }
  }
  /* A left click is always the one-off single cast (the yellow square) - never
     the autocast, which is set from the right-click menu alone (the user's
     rule, 2026-10-09). */
  if (UI.spell === spell.id) {
    UI.spell = null;
    chat("You stop casting " + spell.name + ".", "game");
    mark("magic");
    return;
  }
  if (!st.levelOk) {
    chat("You need a Magic level of " + spell.level + " to cast " + spell.name + ".", "warn");
    return;
  }
  if (!st.runesOk) {
    chat("You do not have enough runes to cast this spell.", "warn");
    return;
  }
  /* `on === 0` is the client's own way of saying "this spell has no target":
     teleports, Charge and Bones to Bananas are cast on the spot. */
  if (spell.on === 0) {
    if (UI.actions.castSpell) UI.actions.castSpell(spell, null);
    UI.spell = null;
    mark("magic");
    return;
  }
  UI.spell = spell.id;
  if (spell.on === SPELL_TARGET.INV) {
    chat("Click the item you want to cast " + spell.name + " on.", "game");
    /* the client switches to the inventory for an item-target spell
       (`spellUsableOn == 16`), so the pack is already open when you look down */
    setTab("inv");
  } else if (spell.on & SPELL_TARGET.GROUND) {
    chat("Cast " + spell.name + " on an item lying on the ground.", "game");
  } else if (spell.on & SPELL_TARGET.LOC) {
    chat("Cast " + spell.name + " on the object you want it to affect.", "game");
  } else if (spell.on & SPELL_TARGET.PLAYER) {
    /* The other half of the two books is written for other *players* (the whole
       Lunar support line, and the standard book's Teleother and Tele Block):
       picking one in the book aims it, and the next click on a player casts it -
       the person's own menu leads with "Cast <spell> on <name>", which is the
       same row a creature's menu gets (src/actions.js#playerMenuBlock). */
    chat("Cast " + spell.name + " on the player you want it to affect.", "game");
  } else {
    chat("You prepare to cast " + spell.name + ".", "game");
  }
  mark("magic");
}

/* Right-click a spellbook cell: Cast first, Autocast second (user,
   2026-10-07). Spells no memory can repeat - Monster Examine, Stat Spy,
   the stat-changing spells - offer Cast alone; production spells offer
   Auto-produce instead of Autocast. */
function spellMenu(e, spell) {
  /* The menu is where all three squares are won and lost: "Cast" queues the
     one-off yellow square, "Autocast" writes the white square onto the
     wielded staff's own memory, and "Auto-produce" writes the green square -
     the remembered production spell, held by no staff. A spell that already
     holds its square offers the Stop row instead. */
  const opts = [{ label: "Cast " + spell.name, fn: () => selectSpell(spell, spellStatus(UI.ps, spell)) }];
  if (UI.ps && UI.ps.autocast === spell.id) {
    opts.push({ label: "Stop autocasting", fn: () => {
      if (UI.actions.setAutocast) UI.actions.setAutocast(null);
      chat("You stop autocasting.", "game");
      mark("combat", "magic");
    } });
  } else if (spell.autocast) {
    opts.push({ label: "Autocast", fn: () => setAutocastFromBook(spell) });
  }
  if (UI.ps && UI.ps.prodAutocast === spell.id) {
    opts.push({ label: "Stop auto-production", fn: () => {
      UI.ps.prodAutocast = null;
      if (UI.spell === spell.id) UI.spell = null;
      chat("You stop auto-production.", "game");
      mark("magic");
    } });
  } else if (spell.prod) {
    opts.push({ label: "Auto-produce", fn: () => setProdFromBook(spell) });
  }
  opts.push({ label: "Cancel", fn: () => {} });
  openCtx(e.clientX, e.clientY, spell.name, opts);
}

export function setProdFromBook(spell) {
  if (!spell.prod) { chat(spell.name + " cannot be auto-produced.", "warn"); return; }
  if (!spellStatus(UI.ps, spell).levelOk) {
    chat("You need a Magic level of " + spell.level + " to cast " + spell.name + ".", "warn");
    return;
  }
  UI.ps.prodAutocast = spell.id;
  UI.spell = spell.id;
  if (spell.on === SPELL_TARGET.INV) {
    chat("Click the item you want to cast " + spell.name + " on.", "game");
    setTab("inv");
  }
  chat("Auto-producing " + spell.name + ".", "game");
  mark("magic");
}

export function setAutocastFromBook(spell) {
  if (!spell.autocast) { chat(spell.name + " cannot be autocast.", "warn"); return; }
  if (!spellStatus(UI.ps, spell).levelOk) {
    chat("You need a Magic level of " + spell.level + " to cast " + spell.name + ".", "warn");
    return;
  }
  if (UI.actions.setAutocast && !UI.actions.setAutocast(spell.id)) return;
  const w = weaponOf(UI.ps);
  if (w && w.kind === "staff") {
    const i = stylesForWeapon(w).findIndex((st) => ((STYLE_INFO[st.stance] || {}).xp || {}).magic);
    if (i >= 0) {
      UI.ps.styleIndex = i;
      if (UI.actions.setAttackStyle) UI.actions.setAttackStyle(i);
    }
  }
  /* No tab jump: the white square appearing on this very cell IS the
     confirmation (the user's rule, 2026-10-09). */
  chat("Autocasting " + spell.name + ".", "game");
  mark("combat", "magic");
}
export function autocastSpellOf(ps) {
  const id = ps && ps.autocast;
  return id == null ? null : spellById.get(id) || null;
}

function spellTip(spell, st) {
  let h = "<col=ff9040>" + spell.name + "<col=ffffff>";
  if (spell.level > 0) h += "<br>Level " + spell.level + " Magic";
  const cost = Object.entries(runeNeeds(UI.ps, spell));
  if (cost.length) {
    const parts = cost.map(([el, q]) => (q > 1 ? q + " " : "") + el + " runes");
    h += "<br><col=ffffff>Requires " + parts.join(", ");
  }
  if (!st.levelOk) h += "<br><col=ff0000>You need a Magic level of " + spell.level + " to cast this spell.";
  else if (!st.runesOk) h += "<br><col=ff0000>You are missing " + missingText(st.missing) + ".";
  /* Tele Block greys a teleport out like a lack of runes, and says so - the
     only place the block is visible before the click, which is what "currently
     only a chat line" left missing. */
  else if (st.blocked) h += "<br><col=ff0000>A teleport block is preventing you from teleporting.";
  else h += "<br><col=00ff00>Select to cast";
  if (UI.spell === spell.id) h += "<br><col=ffff00>Selected";
  if (UI.ps && UI.ps.autocast === spell.id) h += "<br><col=ffffff>Autocasting";
  if (UI.ps && UI.ps.prodAutocast === spell.id) h += "<br><col=00ff00>Auto-producing";
  return h;
}

/* -------------------------------------------------------------- 7 friends chat */

/* Interfaces 550 (friends) and 551 (ignore) are the same ledger: four rivet
   corners, four tiled edges, the tab title, and a 158x194 name box. Unlike the
   quest ledger (274) there is no sunken page - the names are written straight
   onto the stone, and the 317 client clips them to that box, so the whole list
   is drawn at its cache coordinates rather than laid out in the DOM flow. Two
   of this world's panels are this ledger: the friends list (tab 8) and the
   players-online list (tab 9, where the client keeps 551 - see
   renderOnlinePlayers for why that one moved). */
function sideLedger(panel, title) {
  pxSprite(panel, "rivetCornerTopLeft", 3, 20);
  pxSprite(panel, "rivetCornerTopRight", 146, 20);
  pxSprite(panel, "rivetCornerBottomLeft", 3, 194);
  pxSprite(panel, "rivetCornerBottomRight", 146, 194);
  pxTiled(panel, "rivetEdgeTop", 28, 5, 119, 36);
  pxTiled(panel, "rivetEdgeRight", 150, 50, 36, 144);
  pxTiled(panel, "ironRivetsVertical", -12, 50, 36, 144);
  pxTiled(panel, "ironRivetsHorizontal", 28, 203, 118, 36);
  if (title) pxText(panel, title, 4, 4, 180, 14, { font: "bold12", color: "#ff9933", align: 1 });
}

/* The client's world number, as the friends list prints it under the tab. */
const WORLD_NO = 301;

/* --------------------------------------------------------- 7 message board */

/* The board's panel (the transport and the log live in src/board.js).

   The tab the client uses for its friends/Clan Chat channel - the leftmost of
   the bottom row - is this world's message board instead: one permanent log
   every player shares, stored in a perchance comments channel. Its icon is a
   speech bubble rather than the cache's little house (see src/pixelart.js),
   which is the one piece of tab art here that is not the client's own.

   Three stacked parts: the log (the only part that scrolls), the name line and
   the message line. Each entry carries a copy button on its right - the one
   thing the comments plugin's own feed cannot have, because that feed lives in
   a cross-origin iframe - and the entry text is deliberately not selectable,
   since dragging a selection in the middle of the game picks up the frame. */
function renderBoard(panel) {
  Board.ensureChannel();

  const info = iconEl("infoButton", "bdInfo");
  place(info, 167, 3, 16, 16);
  info.title = "About the board";
  info.addEventListener("click", openBoardNotice);
  panel.appendChild(info);
  /* the title is the pjs knob (`boardTitle` in main.pjs) so the board can be
     renamed without touching the UI, with a fallback if it is ever blanked */
  const title = (root.boardTitle && String(root.boardTitle).trim()) || "Message Board";
  pxText(panel, title, 6, 4, 158, 14, { font: "bold12", color: "#ff9933", align: 1 });

  const feed = mk("div", "bdFeed");
  place(feed, 4, 21, 182, 168);
  panel.appendChild(feed);
  UI.boardFeed = feed;

  const nickRow = mk("div", "bdNick");
  place(nickRow, 4, 192, 182, 15);
  nickRow.appendChild(mk("span", "bdLabel", "Name"));
  const nick = mk("input", "bdNickInput");
  nick.type = "text";
  nick.maxLength = 24;
  nick.autocomplete = "off";
  nick.spellcheck = false;
  nick.value = boardNick();
  nick.placeholder = boardDefaultNick();
  nick.addEventListener("change", () => {
    UI.boardNick = nick.value.trim();
    saveBoardNick(UI.boardNick);
  });
  nickRow.appendChild(nick);
  panel.appendChild(nickRow);
  UI.boardNickInput = nick;

  const row = mk("div", "bdRow");
  place(row, 4, 210, 182, 18);
  const input = mk("input", "bdInput");
  input.type = "text";
  input.maxLength = 200;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Write a message...";
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); boardPost(input); }
    if (e.key === "Escape") { input.value = ""; input.blur(); }
  });
  for (const ev of ["keyup", "keypress", "pointerdown"]) input.addEventListener(ev, (e) => e.stopPropagation());
  const post = mk("button", "bdPost", "Post");
  post.addEventListener("click", () => boardPost(input));
  row.appendChild(input);
  row.appendChild(post);
  panel.appendChild(row);
  UI.boardInput = input;

  const status = mk("div", "bdStatus");
  place(status, 4, 231, 182, 11);
  panel.appendChild(status);
  UI.boardStatus = status;

  drawBoard();
}

/* One entry: the name, the time, the copy button on the right, then the text. */
function boardTray(m) {
  const cleared = Board.isCleared(m.id);
  const due = Board.dueAt(m.id);
  const tray = mk("div", "bdMsg" + (m.mine ? " mine" : "") + (m.admin ? " admin" : "") + (cleared ? " cleared" : ""));
  const head = mk("div", "bdHead");
  const name = mk("span", "bdName", m.name);
  if (m.admin) name.title = "moderator";
  head.appendChild(name);
  head.appendChild(mk("span", "bdTime", boardTime(m.time)));
  const copy = mk("button", "bdCopy", "copy");
  copy.title = "Copy this message";
  copy.addEventListener("click", (e) => {
    e.stopPropagation();
    copyBoardText(copy, textFor(m.html));
  });
  head.appendChild(copy);
  /* Writer mode only: the clear control on every entry, which is the writer's
     own power over the board (see src/board.js#clear). A cleared entry stays in
     the writer's own feed, struck through, with the same button offering to put
     it back - and one that is counting down says when it is due, so the rule
     below is visible to the person who set it and to nobody else. */
  if (Board.writer) {
    const act = mk("button", "bdMod", cleared ? "restore" : "clear");
    act.title = cleared ? "Put this message back on the board"
      : due ? "Clear now (scheduled to clear on its own at " + boardTime(due) + ")"
      : "Clear this message from the board";
    if (due && !cleared) act.classList.add("due");
    act.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cleared) Board.restore(m.id);
      else Board.clear(m.id, "writer");
    });
    head.appendChild(act);
  }
  tray.appendChild(head);
  const body = mk("div", "bdText");
  body.appendChild(nodesFor(m.html));
  tray.appendChild(body);
  return tray;
}

/* "14:32" today, "3 Sep 14:32" further back - the board is not a live chat, so
   an entry can easily be days old. */
const BOARD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function boardTime(ms) {
  const d = new Date(ms);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hm;
  return d.getDate() + " " + BOARD_MONTHS[d.getMonth()] + " " + hm;
}

/* Repaint the log. Called when the panel is built and whenever the board's
   message list moves (a post from here, or one arriving live from anyone else),
   so the board reads the same whether or not the tab is open. */
function drawBoard() {
  const feed = UI.boardFeed;
  if (!feed) return;
  const pinned = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  feed.innerHTML = "";
  /* the plugin's own "load more" button comes first: it pages the channel, and
     it is the plugin that decides whether there is anything older to fetch */
  if (Board.loadMore) {
    Board.loadMore.className = "bdMore";
    feed.appendChild(Board.loadMore);
  }
  /* The writer sees the whole log - cleared entries included, struck through -
     so a mistake is one press from being undone; everyone else sees the board
     the rule leaves them (Board#visible). */
  const list = Board.writer ? Board.messages : Board.visible();
  if (!list.length) {
    feed.appendChild(mk("div", "bdEmpty", boardEmptyLine()));
  } else {
    for (const m of list) feed.appendChild(boardTray(m));
  }
  if (Board.writer && Board.errors && Board.errors.length) {
    const h = mk("div", "bdEmpty", "client errors (" + Board.errors.length + ")");
    feed.appendChild(h);
    for (const e of Board.errors.slice(-10).reverse()) {
      const t = mk("div", "bdTray");
      const head = mk("div", "bdHead");
      head.appendChild(mk("span", "bdName", "error"));
      head.appendChild(mk("span", "bdTime", boardTime(e.at)));
      const copy = mk("button", "bdCopy", "copy");
      copy.addEventListener("click", (ev) => {
        ev.stopPropagation();
        copyBoardText(copy, (e.where || "") + ": " + (e.msg || "") + (e.stack ? "\n" + e.stack : ""));
      });
      head.appendChild(copy);
      t.appendChild(head);
      const body = mk("div", "bdText");
      body.textContent = (e.where ? e.where + ": " : "") + e.msg;
      t.appendChild(body);
      feed.appendChild(t);
    }
  }
  if (pinned) feed.scrollTop = feed.scrollHeight;
  /* leaves the writer's own line in place of an empty status (see
     setBoardStatus) whenever the log moves */
  if (Board.writer) setBoardStatus("");
}

function boardEmptyLine() {
  if (Board.status === "unavailable") return "The board is unavailable.";
  if (Board.status === "live") return "No messages yet. Post the first one!";
  return "Connecting to the board...";
}

/* The line under the message box: what the board is doing, or why the last post
   was refused. With nothing to say and writer mode on it is the writer's own
   line instead, because that is the only place on the interface that says the
   powers are still on. */
function setBoardStatus(text, cls) {
  const el = UI.boardStatus;
  if (!el) return;
  if (!text && Board.writer) {
    el.textContent = "writer mode - " + Board.clearedCount() + " cleared";
    el.className = "bdStatus writer";
    return;
  }
  el.textContent = text || "";
  el.className = "bdStatus" + (cls ? " " + cls : "");
}

/* Writer mode's door (`::writer`): the password is checked against the hash in
   src/main.pjs by src/board.js#unlockWriter, and nothing about the password is
   kept anywhere. What it opens is described in board.js - clear/restore on every
   entry, and the plugin's own box, where the channel's real delete and ban live
   (click it, Ctrl+L, same password). */
export function openWriterLogin() {
  if (Board.writer) {
    chat("Writer mode is already on. ::writer off turns it off, ::writer box shows the board's own box.", "game");
    return;
  }
  /* The field, the line that answers it, and the press that checks it outlive the
     builder function (openModal runs that first and the buttons after), so they
     are declared here and filled in below. */
  let input = null;
  let status = null;
  let busy = false;
  const submit = async () => {
    if (busy || !input) return;
    const pw = input.value;
    if (!pw) { status.textContent = "Enter the password."; return; }
    busy = true;
    status.textContent = "Checking...";
    let ok = false;
    try { ok = await Board.unlockWriter(pw); } catch (err) { ok = false; }
    busy = false;
    if (!ok) {
      status.textContent = "That is not the writer password.";
      input.value = "";
      return;
    }
    chat("Writer mode on. The board's entries now carry clear/restore controls; ::writer box opens the board's own box for real deletion.", "game");
    if (UI.boardStatus) setBoardStatus("");
    drawBoard();
    closeModal();
  };
  openModal("Writer mode", (body) => {
    body.appendChild(mk("div", "cmdIntro",
      "Enter the writer password. Only its hash is in the game's code, so the password cannot be read out of it - and nothing here is ever sent anywhere."));
    const row = mk("div", "modalRow");
    row.appendChild(mk("span", "nm", "Password:"));
    input = mk("input", "rs-field");
    input.type = "password";
    input.maxLength = 64;
    input.autocomplete = "off";
    input.spellcheck = false;
    row.appendChild(input);
    body.appendChild(row);
    status = mk("div", "acctStatus");
    body.appendChild(status);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    body.appendChild(mk("div", "extraNote",
      "The password is the one given to the game's author when this mode was built. Losing it cannot be undone from inside the game - it must be replaced in main.pjs."));
    setTimeout(() => input.focus(), 0);
  }, [{ label: "Unlock", fn: submit }]);
}

/* Post what is in the box. The text is given back on refusal, so a rate limit
   never eats a message someone just wrote. */
function boardPost(input) {
  const text = input ? input.value.trim() : "";
  if (!text) return;
  const nick = (UI.boardNick != null ? UI.boardNick : boardNick()) || "";
  input.value = "";
  setBoardStatus("posting...", "wait");
  Board.post(text, nick).then(() => {
    setBoardStatus("");
  }).catch((err) => {
    input.value = text;
    const reason = Board.reasonFor(err);
    setBoardStatus("refused: " + reason, "bad");
    chat("Message board refused that: " + reason, "warn");
  });
}

/* The copy button. The clipboard API can be refused here (the game runs inside
   perchance's own iframe, and the permission is not always granted to it), so
   the old selection copy is the fallback - still inside the click, which is what
   every browser asks for - and if even that is refused the message is opened
   selected in a window to copy by hand. */
function copyBoardText(btn, text) {
  const flash = (ok) => {
    btn.textContent = ok ? "copied" : "select+ctrl-c";
    btn.className = "bdCopy" + (ok ? " done" : " bad");
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => {
      btn.textContent = "copy";
      btn.className = "bdCopy";
    }, 1100);
  };
  const legacy = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed; left:-3000px; top:0; opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  };
  const attempt = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        return navigator.clipboard.writeText(text).then(() => true, () => legacy());
      } catch (err) {
        /* refused by policy this early: the selection copy is still inside the
           click, so it is worth a try */
      }
    }
    return legacy();
  };
  Promise.resolve(attempt()).then((ok) => {
    flash(ok);
    if (!ok) boardCopyWindow(text);
  });
}

/* Last resort: the message in a window, with a textarea already selected, so
   Ctrl+C finishes the job. */
function boardCopyWindow(text) {
  openModal("Copy message", (body) => {
    const ta = mk("textarea", "bdCopyArea");
    ta.value = text;
    ta.readOnly = true;
    ta.spellcheck = false;
    body.appendChild(ta);
    body.appendChild(mk("div", "bdNoticeHint", "Press Ctrl+C (Cmd+C on a Mac) to copy, if the board could not reach the clipboard itself."));
    setTimeout(() => { ta.focus(); ta.select(); }, 0);
  });
}

/* The board's name line: your posts are signed with this. It defaults to the
   character's own name, which is what most people will want, and it lives in
   localStorage rather than the save - it is a preference, not part of the
   character. */
function boardDefaultNick() {
  return (UI.ps && UI.ps.name) || "adventurer";
}

function boardNick() {
  if (UI.boardNick == null) {
    try {
      UI.boardNick = localStorage.getItem(BOARD_NICK_KEY) || boardDefaultNick();
    } catch (err) {
      UI.boardNick = boardDefaultNick();
    }
  }
  return UI.boardNick;
}

function saveBoardNick(nick) {
  try {
    localStorage.setItem(BOARD_NICK_KEY, nick || "");
  } catch (err) { /* private mode */ }
}

/* ------------------------------------------------------- the commands popup */

/* Where the "have you seen the commands?" flag lives - the same kv folder the
   save and the board notice use (src/save.js#FOLDER, src/board.js#FOLDER). */
const KV_FOLDER = "webscape";
const COMMANDS_SEEN_KEY = "commandsNoticeSeen";
const GREETING_SEEN_KEY = "greetingSeen";

/* The chat commands a player actually needs to know about, in the order the box
   prints them: `[heading, [[command, what it does], ...]]`. The two sections are
   the ones that hand out stats and gear, because that is what the list is for -
   the rest of the roster (the model viewers, the camera, the account, the
   board) is one shared line at the foot rather than a row each. `::give` is the
   only one most players will type a *name* into, so its row spells the matching
   rule out: any part of a name is enough, which is how a whole set is handed
   over in one line. */
const COMMAND_SECTIONS = [
  ["Stats and skills", [
    ["::levels <n>", "Sets every skill to level n (60 if you leave the number off)."],
    ["::level <skill> <n>", "Sets one skill to level n, e.g. ::level smithing 60."],
    ["::xp <skill>", "Your level and xp in one skill."],
    ["::heal", "Full hitpoints, run energy and prayer."],
    ["::spec", "Refills your special attack bar to 100%."],
    ["::pray <prayer>", "Turns one prayer on or off."],
    ["::poison", "Poisons you, for the orb's own look; ::poison off cures it."],
  ]],
  ["Items and gear", [
    ["::give <item> [n]", "Any item, by part of its name, e.g. ::give whip 5."],
    ["::runes [n]", "10,000 runes with full elemental cover (mist + lava, the rest), so the whole spellbook works."],
    ["::wear <item>", "Wears every pack item whose name matches, e.g. ::wear rune."],
    ["::bank", "Your bank. Whatever ::give cannot fit in the pack is put here."],
  ]],
];

/* Everything else the chat understands, said once instead of in a row each. */
const COMMAND_OTHERS =
  "::pos, ::tp <x> <z>, ::party [n], ::look [male|female], " +
  "::design, ::name, ::skin <name>, ::camera, ::boxes, ::tile, ::tree <kind>, ::trees, ::archetypes, " +
  "::station <kind>, ::props (the object picker, writer only), " +
  "::archetype <key>, ::guide <skill>, ::perf, ::fps, " +
  "::levelup <skill>, ::save, ::load, ::account, ::board, ::emote <name> " +
  "(or just the name - ::dance plays the emote, and ::emotes lists them all). " +
  "::writer is the board's moderation, for the game's author only. " +
  "::webhook <url> and ::patch <message> post patch notes to Discord (writer only); " +
  "::patch fixes <queue link> <message> links the note back to its queue item";

/* The commands box: a heading per section, then one row per command with the
   command itself on the left and what it does beside it, so the list can be
   read down the left edge the way a client's own menu list is read. */
export function openCommandsPopup(onClose) {
  openModal("Commands", (body) => {
    body.appendChild(mk("div", "cmdIntro",
      "Type any of these into the chat box, starting with two colons. They are the sandbox commands: use them to try out anything you like, and ::save (or ::account) to keep the results. Click a name in the Players Online tab to send that player a private message."));
    for (const [heading, rows] of COMMAND_SECTIONS) {
      body.appendChild(mk("div", "cmdTitle", heading));
      for (const [cmd, desc] of rows) {
        const row = mk("div", "cmdRow");
        row.appendChild(mk("span", "cmd", cmd));
        row.appendChild(mk("span", "cmdDesc", desc));
        body.appendChild(row);
      }
    }
    body.appendChild(mk("div", "cmdTitle", "Everything else"));
    body.appendChild(mk("div", "cmdOthers", COMMAND_OTHERS));
    body.appendChild(mk("div", "cmdHint", "::help or ::commands opens this box again at any time."));
  }, null, { onClose, boxClass: "cmdBox" });
}

/* The commands box, once per browser - the same one-off treatment the board's
   notice gets (src/board.js#maybeShowNotice), for the same reason. `after` runs
   either when the box is closed or at once if it does not need showing. */
export async function maybeShowCommands(after) {
  const store = (typeof root !== "undefined" && root.kv) || null;
  let seen = false;
  if (store) {
    try {
      seen = !!(await store[KV_FOLDER].get(COMMANDS_SEEN_KEY));
    } catch (err) {
      seen = true;
    }
  }
  if (seen) {
    if (after) after();
    return false;
  }
  if (store) Promise.resolve(store[KV_FOLDER].set(COMMANDS_SEEN_KEY, 1)).catch(() => {});
  openCommandsPopup(after);
  return true;
}

/* The one greeting a newcomer gets: a hello and a pointer at ::help, once per
   browser. This replaced the commands box + board notice chain at startup. */
export function openGreetingPopup(onClose) {
  openModal("Welcome", (body) => {
    body.appendChild(mk("div", "bdNotice",
      "Hello, this is a growing test environment for the game engine. Have fun! Type ::help to see what you can do."));
  }, null, { onClose });
}

export async function maybeShowGreeting(after) {
  const store = (typeof root !== "undefined" && root.kv) || null;
  let seen = false;
  if (store) {
    try {
      seen = !!(await store[KV_FOLDER].get(GREETING_SEEN_KEY));
    } catch (err) {
      seen = true;
    }
  }
  if (seen) {
    if (after) after();
    return false;
  }
  if (store) Promise.resolve(store[KV_FOLDER].set(GREETING_SEEN_KEY, 1)).catch(() => {});
  openGreetingPopup(after);
  return true;
}

/* The board's notice: the intro the author wrote, from the "i" in the board's
   title bar - and, once per browser, on its own (see src/main.js). */
export function openBoardNotice() {
  openModal(BOARD_NOTICE_TITLE, (body) => {
    body.appendChild(mk("div", "bdNotice", BOARD_NOTICE));
    body.appendChild(mk("div", "bdNoticeHint",
      "The board is the speech bubble at the left of the bottom tab row: posts there are permanent and shared with every player."));
  });
}

/* A div showing one of our own pixel icons (src/pixelart.js) as a background,
   the way .spr shows an atlas sprite. */
function iconEl(name, cls) {
  const art = pixelIcon(name);
  const d = mk("div", cls || "spr");
  if (art) {
    d.style.backgroundImage = 'url("' + art.url + '")';
    d.style.width = art.w + "px";
    d.style.height = art.h + "px";
  }
  return d;
}

/* The 155x194 name window (widget 0/1 of 550/551), as a scrolling list. */
function nameBox() {
  return mk("div", "nameList");
}

/* ------------------------------------------------ 8 friends + 9 players online */

/* The friends ledger (interface 550). The client's *ignore* list (551) is the
   same ledger on the next tab along, and this world does not draw it: a list of
   people you never want to hear from is not something a shard with one world
   and no private chat has a use for, and the tab it used to sit on now answers
   a question a player actually asks - who else is here right now (see
   renderOnlinePlayers below). So the friends half is the only half left, and
   the helpers below it are the friends' own. */
function renderFriendsList(panel) {
  sideLedger(panel, "Friends List - World " + WORLD_NO);
  const box = nameBox();
  const onRoster = new Set((Net.rosterList || []).filter((p) => p && p.name).map((p) => p.name.toLowerCase()));
  for (const e of UI.friends) {
    const online = onRoster.has(String(e.name || "").toLowerCase());
    const row = mk("div", "nameRow" + (online ? "" : " offline"));
    row.appendChild(mk("span", "nm", e.name));
    row.appendChild(mk("span", "world", online ? "World " + WORLD_NO : "Offline"));
    /* A left-click writes to the friend exactly like a Players Online row
       does (src/ui.js#messageFriend): online friends address the chat line,
       offline ones answer with the game's own sentence. */
    row.title = online ? "Message " + e.name : e.name + " is offline";
    row.addEventListener("click", () => messageFriend(e.name));
    rightMenu(row, (ev) => {
      openCtx(ev.clientX, ev.clientY, e.name, [
        { label: "Message", fn: () => messageFriend(e.name) },
        { label: "Delete", fn: () => { removeFriend(e.name); mark("friends"); } },
      ]);
    });
    box.appendChild(row);
  }
  panel.appendChild(box);
  /* The two stone buttons, sprite 293 with its own orange label, at the cache's
     exact coordinates. They ask for the name in the chatbox, which is where the
     2007 client asks for it too. */
  pxSprite(panel, "styleButton293", 15, 224);
  pxSprite(panel, "styleButton293", 95, 224);
  pxText(panel, "Add Friend", 21, 226, 61, 33, { color: "#ff9933", align: 1, valign: 1, cls: "nowrap" });
  pxText(panel, "Del Friend", 101, 227, 60, 30, { color: "#ff9933", align: 1, valign: 1, cls: "nowrap" });
  pxHit(panel, 15, 224, 72, 36, null, () => askName("add"));
  pxHit(panel, 95, 224, 72, 36, null, () => askName("del"));
}

/* ---------------------------------------------------------- 9 players online

   The tab the client keeps its ignore list on is this world's player list: the
   same stone ledger and the same 155x194 name window, with the players who are
   online *right now* written in it, one per line, as the world server reports
   them.

   The list is not this module's own - src/net.js keeps `Net.rosterList`, the
   `{id, name}` pairs off the server's roster packet, which is republished to
   every client whenever the set of named players changes. That is the same
   source the corner counters' hover text and the account panel's own "Players
   online" line read, so the three can never disagree; and because every client
   is published the roster as a whole, the list holds the players standing
   anywhere in the world, not just the ones in view (the world's own name tags
   only exist for the players actually nearby - see src/fx.js#renderLabels).

   The tab is also where a private message starts: clicking a name addresses the
   chat line to that player ("To <name>: ", src/ui.js#startPM), and the
   right-click menu offers the same plus adding them as a friend. The player's
   own row does neither - there is nobody to write to. */
function renderOnlinePlayers(panel) {
  sideLedger(panel, "Players Online - World " + WORLD_NO);
  const box = nameBox();
  const me = (UI.ps && UI.ps.name) || "";
  const list = (Net.rosterList || []).filter((p) => p && p.name);
  for (const p of list) {
    const row = mk("div", "nameRow");
    row.appendChild(mk("span", "nm", p.name));
    const self = p.name === me;
    if (self) {
      row.appendChild(mk("span", "world", "You"));
    } else {
      row.title = "Message " + p.name;
      row.addEventListener("click", () => startPM(p));
      rightMenu(row, (ev) => {
        openCtx(ev.clientX, ev.clientY, p.name, [
          { label: "Message " + p.name, fn: () => startPM(p) },
          { label: "Add friend", fn: () => addFriend(p.name) },
        ]);
      });
    }
    box.appendChild(row);
  }
  /* An empty list while the socket is up is the moment between the connection
     opening and the server's first roster publish - our own join is on that
     list too, so a genuinely empty one never arrives - and it says so rather
     than claiming nobody is playing. */
  if (!list.length) {
    box.appendChild(mk("div", "nameRow empty", Net.status === "online"
      ? "Waiting for the world server's player list..."
      : "Not connected to the world server."));
  }
  panel.appendChild(box);
}

export function removeFriend(name) {
  const i = UI.friends.findIndex((e) => e.name === name);
  if (i < 0) return;
  UI.friends.splice(i, 1);
  /* The list lives in the character save, so it is written at once rather
     than at the next autosave - a reload a moment later must still know. */
  if (UI.actions.save) UI.actions.save();
}

export function addFriend(name) {
  if (!name) return;
  name = String(name).trim();
  /* A friends list is names the world server must be able to address, so a
     string the build could not have drawn is refused the way the name step
     refuses it (src/player.js#nameError) rather than saved. */
  const bad = nameError(name);
  if (bad) { chat(bad, "warn"); return; }
  if (UI.friends.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    chat(name + " is already on your friends list.", "warn");
    return;
  }
  UI.friends.push({ name, online: false });
  chat("You have added " + name + " to your friends list.", "game");
  mark("friends");
  if (UI.actions.save) UI.actions.save();
}

/* "Enter name:" in the chatbox, exactly like the client's friends-list buttons.
   The next line typed there is taken as the name instead of being spoken. */
function askName(what) {
  UI.pendingName = { what };
  chat(what === "add" ? "Enter name of friend to add:" : "Enter name of friend to delete:", "game");
  const input = UI.els.chatInput;
  if (input) { input.placeholder = "Enter name"; input.focus(); layoutChatInput(); }
}

/* ----------------------------------------------------------------- 10 logout */

/* ------------------------------------------------------ the account label

   The corner line's text lives here (src/presence.js owns the element's place
   in the layout). Accounts themselves live on the welcome screen
   (src/titlescreen.js) - there is no account panel in the game anymore, and
   `::account` says exactly that. */
/* Clicking through "Click here to logout" really logs out: the account session
   is cleared and the player lands back on the pre-title screen, where they can
   log into another account or play on as a guest. The character itself is
   untouched - it stays as it is, saved in this browser. */
export function confirmLogout() {
  if (UI.leaveWorld) UI.leaveWorld();
  else {
    Net.logout();
    if (UI.returnToAuth) UI.returnToAuth();
  }
}

/* Interface 182 - the logout panel. The cache's own three lines of advice across
   the middle of the tab, then the wide stone button (three left halves and two
   right halves of the stats tile) with its label written over it. The button
   logs out immediately - no confirmation dialogue. */
function renderLogout(panel) {
  for (const [i, line] of ["When you have finished playing", "RuneScape, always use the", "button below to logout safely."].entries())
    pxText(panel, line, 7, 67 + i * 18, 179, 18,
      { font: "plain12", color: "#ff981f", align: 1, valign: 1, lineHeight: 18, nowrap: true });
  const btn = mk("div", "logoutBtn");
  place(btn, 22, 153, 144, 36);
  btn.addEventListener("click", confirmLogout);
  panel.appendChild(btn);
  for (const x of [0, 26, 52]) pxSprite(btn, "statsTileHalfLeftSelected", x, 0);
  for (const x of [82, 108]) pxSprite(btn, "statsTileHalfRightSelected", x, 0);
  const lab = pxText(btn, "Click here to logout", 3, 1, 141, 36, { font: "bold12", color: "#f7f0df", align: 1, valign: 1, cls: "logoutLabel" });
  lab.style.color = "";
}

/* ---------------------------------------------------------------- 11 options */

/* Interface 261 - the options panel, which in the client is a side panel and not
   a window, so it lives here rather than in the interface layer. Four sliders
   (a stone track with a jewel thumb), six square toggles that turn red when the
   option is on, and the run-energy button with its percentage under it. */
const OPT_BRIGHT = [49, 81, 113, 145];
const OPT_VOLUME = [49, 75, 101, 127, 153];
const OPT_TOGGLES = [
  /* [x, y, icon x, icon y, icon id, key] */
  [19, 132, 23, 138, 663, "oneButton"],
  [75, 132, 78, 136, 662, "chatEffects"],
  [131, 132, 136, 135, 664, "splitPrivate"],
  [19, 182, 23, 187, 665, "acceptAid"],
];
/* One slider row, drawn at 90% so the four of them nudge closer together and
   leave room below: the icon, pieces and hit boxes are all drawn into the row,
   so the scale takes all three together and the clicks stay on the art. */
const SLIDER_SCALE = 0.9;
function sliderRow(panel, y, build) {
  const row = mk("div", "sliderRow");
  place(row, 9, y, 172, 34);
  row.style.transform = "scale(" + SLIDER_SCALE + ")";
  row.style.transformOrigin = "top left";
  panel.appendChild(row);
  build(row);
  return row;
}

function renderOptionsPanel(panel) {
  const ps = UI.ps;
  applyBrightness();

  /* brightness: four steps, values 1..4 */
  sliderRow(panel, 4, (row) => {
    pxSprite(row, "optionIcon659", 0, 0);
    pxHit(row, 0, 0, 32, 32, "Adjust Screen Brightness", null);
    slider4(row, "brightness");
  });
  /* the three volumes: five steps, values 0..4 (0 is off) */
  sliderRow(panel, 34, (row) => volumeSlider(row, "musicVolume", 660));
  sliderRow(panel, 64, (row) => volumeSlider(row, "soundVolume", 661));
  sliderRow(panel, 94, (row) => volumeSlider(row, "areaSound", 673));

  /* the six square toggles (the house button is drawn plain - this world has no
     houses - but its frame is part of the interface all the same) */
  for (const [bx, by, ix, iy, icon, key] of OPT_TOGGLES) {
    pxSprite(panel, (settings[key] !== false) ? "optionWidget762" : "optionWidget761", bx, by);
    pxSprite(panel, "optionIcon" + icon, ix, iy);
  }
  pxSprite(panel, (settings.removeRoofs ? "optionWidget762" : "optionWidget761"), 131, 182);
  pxSprite(panel, "optionIcon676", 136, 187);
  pxHit(panel, 18, 131, 41, 41, "Mouse buttons<br>(currently " + (settings.oneButton ? "1" : "2") + ")", () => toggleOption("oneButton", true));
  pxHit(panel, 75, 132, 40, 40, "Chat Effects<br>(currently " + (settings.chatEffects !== false ? "on" : "off") + ")", () => toggleOption("chatEffects"));
  pxHit(panel, 131, 132, 40, 40, "Split Private Chat<br>(currently " + (settings.splitPrivate ? "on" : "off") + ")", () => toggleOption("splitPrivate"));
  pxHit(panel, 18, 182, 39, 40, "Accept Aid<br>(currently " + (settings.acceptAid !== false ? "on" : "off") + ")", () => toggleOption("acceptAid"));
  pxHit(panel, 131, 182, 40, 40, "Remove Roofs<br>(currently " + (settings.removeRoofs ? "on" : "off") + ")", () => toggleOption("removeRoofs"));

  /* the run button and its energy figure */
  const runOn = !!ps.runEnabled;
  pxSprite(panel, runOn ? "optionWidget762" : "optionWidget761", 75, 182);
  pxSprite(panel, "optionIcon677", 86, 186);
  pxHit(panel, 75, 183, 41, 40, "Run (" + (runOn ? "on" : "off") + ") Energy " + runPercent(ps.runEnergy) + "%", toggleRun);
  pxText(panel, runPercent(ps.runEnergy) + "%", 74, 203, 42, 18, { font: "plain12", color: "#ff9800", align: 1, valign: 1 });

  /* the way into the window the two renderer switches live in */
  renderAdditionalSettingsButton(panel);
}

/* The brightness slider: four pieces at x 49/81/113/145, values 1..4. */
function slider4(row, key) {
  const value = Math.max(1, Math.min(4, settings[key] || 1));
  OPT_BRIGHT.forEach((x, i) => {
    pxSprite(row, "optionWidget" + (value === i + 1 ? 683 + i : 679 + i), x, 8);
    pxHit(row, x, 2, 32, 22, "Adjust Screen Brightness", () => {
      settings[key] = i + 1;
      saveSettings();
      mark("options");
    });
  });
}

/* A volume slider: five pieces, values 0..4; value 0 leaves every piece plain,
   which is how the client shows an option that is turned off. */
function volumeSlider(row, key, icon) {
  const value = Math.max(0, Math.min(4, settings[key] == null ? 4 : settings[key]));
  pxSprite(row, "optionIcon" + icon, 0, 0);
  const tip = icon === 660 ? "Adjust Music Volume" : icon === 661 ? "Adjust Sound Effect Volume" : "Adjust Area Sound Volume";
  OPT_VOLUME.forEach((x, i) => {
    const isThumb = value === i + 1;
    pxSprite(row, "optionWidget" + (isThumb ? 687 + i : 692 + i), x, 8);
    pxHit(row, x, 4, 26, 20, tip + "<br>(currently " + (value === 0 ? "off" : String(value)) + ")", () => {
      settings[key] = i + 1;
      saveSettings();
      mark("options");
    });
  });
  pxHit(row, 0, 0, 32, 32, tip, null);
}

function toggleOption(key, isMouse) {
  settings[key] = !(settings[key] !== false);
  saveSettings();
  if (isMouse) chat("Mouse buttons: " + (settings.oneButton ? "1" : "2") + ".", "game");
  mark("options");
}

/* ------------------------------------------- the additional-settings window

   The cache's options interface (261) is full: four sliders, six square toggles
   and the run button leave exactly one strip of the 190x261 panel unused, the
   twelve rows below the run button's percentage. That strip is where the
   **"Open additional settings"** button lives, and it is the only control in
   this world's interface whose art is not the cache's - there is no art for it
   to have. It is drawn as the client's own 20-pixel mode button (`bankModeButton`,
   interface 12) squeezed into the twelve rows there is room for: same 1-pixel
   dark border, same tan highlight rows and the same grey body, read off that
   sprite (46,43,35 / 114,100,81 / 76,77,73).

   The window it opens is where every *renderer* setting goes from now on. The
   cache has no interface for one because the client had nothing to configure:
   its 765x503 canvas was blitted as it was. This world has two - anti-aliasing
   and frame interpolation (src/renderopts.js) - and both default to the client's
   own behaviour. */
const EXTRA_BTN = { x: 9, y: 226, w: 172, h: 26 };

function renderAdditionalSettingsButton(panel) {
  const b = EXTRA_BTN;
  /* One container so the hover has something of the button's own to brighten:
     the cache's button has a hover sprite and this one has none, so the whole
     thing is filtered instead. */
  const box = mk("div", "extraBtn");
  place(box, b.x, b.y, b.w, b.h);
  box.addEventListener("pointerenter", () => showHoverTip("Open additional settings"));
  box.addEventListener("pointerleave", hideHoverTip);
  box.addEventListener("click", openExtraSettings);
  panel.appendChild(box);
  pxRect(box, 0, 0, b.w, 1, "#2e2b23");
  pxRect(box, 0, 1, b.w, 1, "#726451");
  pxRect(box, 0, 2, b.w, b.h - 4, "#4c4d49");
  pxRect(box, 0, b.h - 2, b.w, 1, "#726451");
  pxRect(box, 0, b.h - 1, b.w, 1, "#2e2b23");
  pxText(box, "Open additional settings", 0, 7, b.w, 11, { font: "plain11", color: "#ffffff" });
  return box;
}

/* One switch in the additional-settings window: the name, an On/Off button, and
   a line saying what it actually does. `settings` is the store (saved with the
   rest of the options), and `applySettings` is what makes the change reach the
   renderer the moment it is made. */
function extraToggleRow(body, label, key, note) {  const row = mk("div", "modalRow extraRow");
  row.appendChild(mk("span", "nm", label));
  const btn = mk("button", "rs-btn");
  btn.textContent = settings[key] ? "On" : "Off";
  btn.addEventListener("click", () => {
    settings[key] = !settings[key];
    btn.textContent = settings[key] ? "On" : "Off";
    saveSettings();
    chat(label + ": " + (settings[key] ? "on" : "off") + ".", "game");
  });
  row.appendChild(btn);
  body.appendChild(row);
  body.appendChild(mk("div", "extraNote", note));
}

/* One choice in the additional-settings window: the name, a button cycling
   through the options, and a line saying what each does. `options` are
   [value, label] pairs; `settings` is the store and `applySettings` reaches
   the renderer the moment it is made. */
function extraCycleRow(body, label, key, options, note) {
  const row = mk("div", "modalRow extraRow");
  row.appendChild(mk("span", "nm", label));
  const btn = mk("button", "rs-btn");
  const show = () => options.find((o) => o[0] === settings[key]) || options[0];
  btn.textContent = show()[1];
  btn.addEventListener("click", () => {
    const i = options.findIndex((o) => o[0] === settings[key]);
    settings[key] = options[(i + 1 + options.length) % options.length][0];
    btn.textContent = show()[1];
    saveSettings();
    chat(label + ": " + show()[1].toLowerCase() + ".", "game");
  });
  row.appendChild(btn);
  body.appendChild(row);
  body.appendChild(mk("div", "extraNote", note));
}

export function openExtraSettings() {
  openModal("Additional settings", (body) => {
    body.appendChild(mk("div", "cmdIntro",
      "This world's own settings - saved with the rest of your options."));
    extraToggleRow(body, "Anti-aliasing", "antialias",
      "Smooths the world's edges by drawing it at twice the size and scaling it down. Costs performance; off is "
      + "one drawn pixel per game pixel, the 2007 look.");
    extraToggleRow(body, "Frame interpolation", "frameInterpolation",
      "Blends an animation's keyframes so movement is smooth. Off, each keyframe is held for its own delay and the "
      + "next snaps in, as the client's own sequencer does.");
    extraToggleRow(body, "Overhead text shadow", "textShadow",
      "The black copy the client draws one pixel down and right of every overhead name and chat line. Off, the "
      + "labels are flat single-colour text.");
    extraCycleRow(body, "Frame zoom", "frameZoom",
      [["fit", "Fit screen"], ["exact", "Pixel-exact"], ["full", "Fullscreen"]],
      "Fit screen fills the window. Pixel-exact sits on whole screen pixels instead (that 0.8 step - smaller, with "
      + "background around it, every game pixel exact). Fullscreen covers the window edge to edge, cropping the overflow.");
    extraCycleRow(body, "Single-button menu hold", "menuHoldMs",
      [[150, "150ms"], [200, "200ms"], [300, "300ms"], [450, "450ms"], [600, "600ms"], [800, "800ms"], [1000, "1000ms"]],
      "One-button mouse mode: how long a left press must be held before it "
      + "opens the right-click menu. Shift+left-click always opens it at once.");
    extraToggleRow(body, "Right-drag rotates camera", "rightRotate",
      "Right-drag turns the view, and the menu still opens on press as before - "
      + "a drag past a few pixels turns instead and closes the menu. On (default); "
      + "off, the right button is menu-only and the view turns with the arrow "
      + "keys - or hold Ctrl for one right-drag rotation.");
    extraToggleRow(body, "Roaming swords in dialogue", "roamSwords",
      "The option list's swords flank whichever option the pointer is over, "
      + "framing each line as it lights up, and sit on the title only while "
      + "the pointer is off the dialogue box. Off, they stay flanking "
      + "\"Select an Option\" and only swing wide on hover.");
    extraToggleRow(body, "Multiple DMs", "multipleDMs",
      "Keep messaging the same player until Escape stops it. Off, one sent "
      + "line goes to them and the chat line reverts to public chat.");
    extraToggleRow(body, "Tab to reply", "tabToReply",
      "Pressing Tab opens a message to whoever sent you a private message "
      + "last. Off, Tab does nothing.");
    const srow = mk("div", "modalRow extraRow");
    srow.appendChild(mk("span", "nm", "Shore sounds"));
    const sbtn = mk("button", "rs-btn");
    sbtn.textContent = isSurfOn() ? "On" : "Off";
    sbtn.addEventListener("click", () => {
      setSurfOn(!isSurfOn());
      sbtn.textContent = isSurfOn() ? "On" : "Off";
      chat("Shore sounds: " + (isSurfOn() ? "on" : "off") + ".", "game");
    });
    srow.appendChild(sbtn);
    body.appendChild(srow);
    body.appendChild(mk("div", "extraNote",
      "Procedural surf that swells as you near the shore and dies inland. "
      + "Starts after your first click or keypress."));
  });
}

/* ---------------------------------------------------------------- 12 emotes */

/* Interface 464 - the emote book, at the interface's own coordinates. The book
   itself (the 37 buttons, their names, their sprites) is src/emotes.js, because
   the buttons are not only an interface: the same table is what the runtime
   plays and what travels over the network when somebody emotes. This half is
   purely the drawing - one sprite per button, and a hit box that plays it. */
function renderEmotes(panel) {
  for (const emote of EMOTES) {
    const part = "emote" + emote.sprite;
    if (!Frame.parts[part]) continue;
    pxSprite(panel, part, emote.x, emote.y);
    pxHit(panel, emote.x, emote.y, EMOTE_HIT.w, EMOTE_HIT.h, emote.name, () => playEmote(emote));
  }
}

/* A button of the emote book was clicked (or `::emote` named one). The act
   itself - the pose, the refusal a cape-less Skill Cape emote gives, and the
   byte that tells the players around us - is src/actions.js#performEmote, which
   installs the hook; UI.actions.emote is left undefined if it has not (the
   panel is still being built, or a stripped build), in which case the click
   says so rather than doing nothing at all. */
function playEmote(emote) {
  if (UI.actions.emote) return UI.actions.emote(emote);
  chat("You perform the " + emote.name + " emote.", "game");
}

/* ------------------------------------------------------------------ 13 music */

/* Interface 239 - the music player: its own rivetted frame, the three transport
   buttons across the top, a "Playing:" line, the current mode, and the tune
   list. The list is the cache's own 467 rows (src/data/music-tracks.js),
   including the client's "Click the tune to play." hint and its
   "Green=Unlocked" legend; locked tunes are red, unlocked ones green. */

/* The tunes this world has unlocked. The client's own legend row spells the
   convention out, so the rest of the list stays red exactly as a new account's
   did. */
const MUSIC_UNLOCKED = new Set([
  "Scape Main", "Newbie Melody", "Harmony", "Autumn Voyage", "Yesteryear",
  "Flute Salad", "Spooky", "Al Kharid", "Fanfare", "Unknown Land",
  "Medieval", "Baroque", "Sea Shanty 2", "Wonder", "Alone", "Adventure",
  "Start", "Village", "Wilderness", "Book Of Spells", "Camelot", "Long Way Home",
]);

const MUSIC_MODES = ["auto", "man", "loop"];
let musicMode = "auto";

/* Interface 239's chrome, component for component, in the cache's own order
   (it lists every tile of every edge separately, so it is reproduced as-is;
   the two id-1 slots at the bottom are overridden later in the interface by
   the 27/63 horizontal rivets, so those are what get drawn). */
const MUSIC_CHROME = [
  ["ironRivetsVertical", -12, 194, 36, 36], ["rivetEdgeRight", 150, 194, 36, 36],
  ["rivetCornerTopLeft", 3, 53, 25, 30], ["rivetCornerTopRight", 146, 53, 25, 30],
  ["rivetCornerBottomLeft", 3, 219, 25, 30], ["rivetCornerBottomRight", 146, 219, 25, 30],
  ["rivetEdgeTop", 25, 38, 36, 36], ["rivetEdgeTop", 58, 38, 36, 36], ["rivetEdgeTop", 93, 38, 36, 36], ["rivetEdgeTop", 119, 38, 36, 36],
  ["rivetEdgeRight", 150, 72, 36, 36], ["rivetEdgeRight", 150, 86, 36, 36], ["rivetEdgeRight", 150, 122, 36, 36], ["rivetEdgeRight", 150, 158, 36, 36],
  ["ironRivetsVertical", -12, 63, 36, 36], ["ironRivetsVertical", -12, 86, 36, 36], ["ironRivetsVertical", -12, 122, 36, 36], ["ironRivetsVertical", -12, 158, 36, 36],
  ["ironRivetsHorizontal", 99, 228, 36, 36], ["ironRivetsHorizontal", 124, 228, 36, 36],
  ["ironRivetsHorizontal", 63, 228, 36, 36], ["ironRivetsHorizontal", 27, 228, 36, 36],
];

function setMusicMode(id) {
  musicMode = id;
  chat("Music mode: " + id.toUpperCase() + ".", "game");
  mark("music");
}

function playTrack(name) {
  if (!MUSIC_UNLOCKED.has(name)) return;
  UI.track = UI.track === name ? null : name;
  if (UI.actions.music) UI.actions.music(UI.track);
  else chat(UI.track ? "Now playing: " + UI.track : "Music stopped.", "game");
  mark("music");
}

function renderMusic(panel) {
  /* The container is component 0 and the rivet frame is components 1..22, so
     the client paints the tune list first and the frame over it - the list
     runs under the right-hand frame strip and the bottom corners. */
  MUSIC_ROWS.forEach(([y, x, w, name], i) => {
    if (i === 0) { pxText(panel, name, x, y, w, 14, { font: "plain12", color: "#ff981f" }); return; }
    const unlocked = MUSIC_UNLOCKED.has(name);
    const playing = UI.track === name;
    const col = i === 1 ? "#ff981f" : playing ? "#ffff00" : unlocked ? "#00ff00" : "#ff0000";
    pxText(panel, name, x, y, w, 14, { font: "plain12", color: col });
    if (i > 1 && unlocked) pxHit(panel, x, y, w, 14, null, () => playTrack(name));
  });

  for (const [name, x, y, w, h] of MUSIC_CHROME) {
    if (name.startsWith("rivetCorner")) pxSprite(panel, name, x, y);
    else pxTiled(panel, name, x, y, w, h);
  }

  /* the three transport buttons, with the active mode lit */
  MUSIC_MODES.forEach((id, i) => {
    const x = 66 + i * 39;
    const on = musicMode === id;
    pxSprite(panel, on ? "musicPlayerButtonSelected" : "musicPlayerButton", x, 7);
    pxHit(panel, x, 7, 36, 25, "Select", () => setMusicMode(id));
  });
  pxText(panel, "AUTO", 69, 12, 29, 14, { font: "plain12", color: "#ff981f", align: 1 });
  pxText(panel, "MAN", 111, 12, 25, 14, { font: "plain12", color: "#ff981f", align: 1 });
  pxText(panel, "LOOP", 148, 12, 29, 14, { font: "plain12", color: "#ff981f", align: 1 });

  /* "Playing:" plus the current tune, and the mode the player is in */
  pxText(panel, "Playing:", 7, 17, 44, 14, { font: "plain12", color: "#ff981f" });
  if (UI.track) pxText(panel, UI.track, 52, 17, 130, 14, { font: "plain12", color: "#00ff00" });
  pxText(panel, musicMode.toUpperCase(), 7, 35, 44, 14, { font: "plain12", color: "#ff981f" });
}

/* ========================================================= full interfaces */

export const FullIface = {
  name: null,
  render: null,
  /* Some interfaces are *walkable*: the client draws them at (0,0) over the
     running game, so the world, the minimap, the chatbox and the side panel
     stay live around them. The bank is one; the side panels' own interfaces
     are not. */
  keepWorld: false,

  show(name, renderFn, opts = {}) {
    UI.els.iface.hidden = false;
    this.name = name;
    this.render = renderFn;
    this.keepWorld = !!opts.keepWorld;
    this.anchor = name === "bank" && UI.ps ? { x: UI.ps.x, z: UI.ps.z } : null;
    UI.els.iface.classList.toggle("float", this.keepWorld);
    this.refresh();
    hideHoverTip();
    hideCtx();
  },

  hide() {
    if (!this.name) return;
    /* Closing the bank consolidates it: withdrawals leave null holes behind
       (bankWithdraw empties the slot in place so Swap/Insert keeps working
       while the window is open), and they are squeezed out here, toward the
       top-left, the way the client closes up behind a withdrawal. */
    if (this.name === "bank" && UI.ps) {
      bankCompact(UI.ps);
      mark("bank");
    }
    this.name = null;
    this.keepWorld = false;
    this.anchor = null;
    UI.els.iface.classList.remove("float");
    this.render = null;
    UI.doll = null;
    UI.els.iface.hidden = true;
    UI.els.iface.innerHTML = "";
    UI.shop = null;
    UI.shopKey = null;
    renderTab();
  },

  refresh() {
    if (!this.name || !this.render) return;
    UI.els.iface.innerHTML = "";
    /* The client renders the 3D view and *then* paints the open interface at
       (0,0) over it (draw3dScreen), so the world, the minimap, the chatbox and
       the side panel always stay on screen behind an interface. The only thing
       that changes is whether the world still takes clicks: a walkable one (the
       bank, a shop) does, everything else swallows them - which this box does,
       covering the game view only, so the side panel stays usable. */
    if (!this.keepWorld) UI.els.iface.appendChild(mk("div", "ifaceBlock"));
    this.render(UI.els.iface);
  },

  get open() { return this.name; },
};

export function closeInterface() {
  FullIface.hide();
}

/* ------------------------------------------------------------- moving away

   Issuing a movement command ends what the player was looking at. Two things
   go with it, and neither is a question the player has to answer first:

     * **The shop window.** A shop is a walkable interface (see `openShop`), so
       the world and the minimap stay live behind it - and a click that walks
       you away from the counter is the player leaving the shop, so the window
       goes with them (the user's ask, 2026-09-23: "when you click on the
       minimap when you are inside a shop, or navigate away, the shop should
       close"). The stock is left exactly as it is; only the window is closed.
     * **A conversation.** The client cancels a dialogue the moment the player
       commands a move (the user's ask, 2026-09-23: "the npc chat box dialogues
       should be cancelled and removed whenever you navigate away by clicking on
       the map or minimap to move your character"). This is `closeChatDialog`'s
       own teardown, so the speaker's `talking` flag is cleared and the creature
       is free to wander off again (src/dialogue.js#endDialogue), rather than
       the box being hidden under a conversation that is still live. A level-up
       panel is caught by the same branch - it is an ordinary box in the same
       chatbox.

   Called from every route a movement command can take: game.js#handleClick (a
   click on the world, through the hook installed in `initUI`), `walkFromMinimap`
   below, and actions.js#walkTile (the context menu's own "Walk here"). */
export function closeOnWalk() {
  if (FullIface.open === "shop") FullIface.hide();
  if (FullIface.open === "thormac") FullIface.hide();
  if (FullIface.open === "tan") FullIface.hide();
  if (FullIface.open === "bank") FullIface.hide();
  const d = UI.els.chatDialog;
  if (d && !d.hidden) closeChatDialog();
}

export function closeBankOnTeleport() {
  if (FullIface.open === "bank" || FullIface.open === "shop" || FullIface.open === "thormac" || FullIface.open === "tan") FullIface.hide();
}

/* ------------------------------------------------------------------- bank */

/* The bank is the cache's interface 12, component for component and in the
   client's own draw order: thirty 88x60 recessed plates making up the wall, a
   riveted iron frame around them (four corner plates, a rivet row across the
   top and the bottom, a rivet column down each side), the title, the 400-slot
   item list inside a scroll box, the four mode buttons along the bottom and
   the close button at the top right. The client draws the bank as a
   *walkable* interface at (0,0), so the window is a 488x305 box at (12,20) -
   the game view, the minimap, the chatbox and your inventory in the side
   panel all stay visible around it, exactly as they do in the real client.

   Every box below is one of the cache's own component boxes, generated from
   interface 12 by the snippet in src/tools/cache-bake/README.md. */
export const BANK_WIN = { x: 12, y: 20, w: 488, h: 305 };
export const BANK_LIST = { x: 37, y: 55, w: 427, h: 229, content: 1905 };
export const BANK_GRID = { x: 38, y: 3, cols: 8, stepX: 47, stepY: 38 };
export const BANK_BAR = { x: 464, y: 55, w: 16, h: 229 };
/* The four mode buttons: the cache's own components, each an 85x22
   `bankModeButton` (sprite 812) at y 298 whose alternate sprite is 813 - the
   red hovered state - and each carrying menuType 5 (the client's "these are
   options" flag). renderBank draws whichever of the two sprites the mode's
   state calls for. */
export const BANK_MODES = [
  { key: "swap", x: 64, y: 298, w: 85, h: 22 },
  { key: "insert", x: 148, y: 298, w: 85, h: 22 },
  { key: "item", x: 280, y: 298, w: 85, h: 22 },
  { key: "note", x: 364, y: 298, w: 85, h: 22 },
];

/* The colour and alignment every one of both interfaces' text components
   carries (the cache stores them per component; they are all the same value).
   renderBank/renderShop feed it to pxText, and tools/check-ui.mjs holds it
   against the cache's own colour and xAlign, so a wrong orange is a red flag
   rather than something only an eye could catch. */
export const IFACE_TEXT_STYLE = { color: "#ff981f", align: 1 };

/* Interface 12's own text components, in the cache's component order, each with
   the box it is centred in: [text, x, y, w, h, font]. Read by renderBank and
   held against the cache by tools/check-ui.mjs, so the two can never drift. */
export const BANK_TEXTS = [
  ["The Bank of RuneScape", 19, 30, 474, 16, "bold12"],
  ["Withdraw as:", 296, 284, 134, 14, "plain12"],
  ["Item", 293, 302, 62, 14, "plain12"],
  ["Rearrange mode:", 81, 284, 133, 14, "plain12"],
  ["Note", 375, 302, 62, 14, "plain12"],
  ["Insert", 163, 302, 61, 17, "plain12"],
  ["Swap", 74, 302, 62, 15, "plain12"],
];

/* The two boxes each window's close button lives in: the bank's is at (471,26)
   and the shop's at (472,26), both 26x23, and both carry the cache's own
   "Close" menu (menuType 3). The hover sprite sits in the container beside it
   and is swapped in by the pointer listeners, exactly as the client swaps the
   button's alternate sprite. */
export const CLOSE_BTN = { bank: { x: 471, y: 26, w: 26, h: 23 }, shop: { x: 472, y: 26, w: 26, h: 23 } };

/* Interface 12's sprite components, in draw order, minus the four mode buttons
   and the close button's hover state - renderBank() draws those itself because
   which sprite they use depends on the current state. */
export const BANK_PARTS = [
["dialogBack", 12, 20],
["dialogBack", 12, 80],
["dialogBack", 12, 140],
["dialogBack", 12, 200],
["dialogBack", 12, 260],
["dialogBack", 100, 20],
["dialogBack", 100, 80],
["dialogBack", 100, 140],
["dialogBack", 100, 200],
["dialogBack", 188, 20],
["dialogBack", 100, 260],
["dialogBack", 188, 80],
["dialogBack", 188, 140],
["dialogBack", 188, 200],
["dialogBack", 188, 260],
["dialogBack", 276, 20],
["dialogBack", 364, 80],
["dialogBack", 276, 80],
["dialogBack", 276, 140],
["dialogBack", 276, 200],
["dialogBack", 276, 260],
["dialogBack", 364, 140],
["dialogBack", 364, 20],
["dialogBack", 364, 200],
["dialogBack", 364, 260],
["dialogBack", 412, 20],
["dialogBack", 412, 80],
["dialogBack", 412, 140],
["ironRivetsVertical", -3, 49],
["dialogBack", 412, 200],
["dialogBack", 412, 260],
["rivetCornerTopLeft", 12, 20],
["ironRivetsVertical", -3, 85],
["ironRivetsVertical", -3, 121],
["ironRivetsVertical", -3, 157],
["ironRivetsVertical", -3, 193],
["ironRivetsVertical", -3, 229],
["ironRivetsVertical", -3, 265],
["rivetEdgeRight", 479, 50],
["rivetEdgeRight", 479, 86],
["rivetEdgeRight", 479, 122],
["rivetEdgeRight", 479, 158],
["rivetEdgeRight", 479, 194],
["rivetEdgeRight", 479, 230],
["rivetEdgeRight", 479, 266],
["ironRivetsHorizontal", 73, 304],
["ironRivetsHorizontal", 109, 304],
["ironRivetsHorizontal", 145, 304],
["ironRivetsHorizontal", 181, 304],
["ironRivetsHorizontal", 217, 304],
["ironRivetsHorizontal", 253, 304],
["ironRivetsHorizontal", 289, 304],
["ironRivetsHorizontal", 325, 304],
["ironRivetsHorizontal", 361, 304],
["ironRivetsHorizontal", 397, 304],
["ironRivetsHorizontal", 433, 304],
["rivetEdgeTop", 72, 5],
["rivetEdgeTop", 108, 5],
["rivetEdgeTop", 144, 5],
["rivetEdgeTop", 180, 5],
["rivetEdgeTop", 216, 5],
["rivetEdgeTop", 252, 5],
["rivetEdgeTop", 288, 5],
["rivetEdgeTop", 324, 5],
["rivetEdgeTop", 360, 5],
["rivetEdgeTop", 396, 5],
["rivetEdgeTop", 432, 5],
["rivetEdgeTop", 252, 34],
["rivetEdgeTop", 37, 5],
["ironRivetsHorizontal", 37, 304],
["rivetCornerBottomLeft", 12, 295],
["rivetCornerTopRight", 475, 20],
["rivetEdgeTop", 439, 5],
["rivetCornerBottomRight", 475, 295],
["ironRivetsHorizontal", 439, 304],
["rivetEdgeTop", 288, 34],
["rivetEdgeTop", 324, 34],
["rivetEdgeTop", 360, 34],
["rivetEdgeTop", 396, 34],
["rivetEdgeTop", 432, 34],
["rivetEdgeTop", 459, 34],
["rivetEdgeTop", 216, 34],
["rivetEdgeTop", 180, 34],
["rivetEdgeTop", 144, 34],
["rivetEdgeTop", 108, 34],
["rivetEdgeTop", 72, 34],
["rivetEdgeTop", 36, 34],
["rivetEdgeTop", 17, 34],
];

/* Interface 300 - the shop - is the very same riveted window as the bank's
   interface 12, built five pixels shorter at the bottom because the shop has
   no mode buttons: its own components say the whole bottom row sits five pixels
   higher, the rivets at y 299 (the bank's are at 304) and the corners at y 290
   (the bank's at 295), which is the same 305 -> 300 the window box makes. Its
   stock is an 8x5 grid of 47x47 cells at (76,65), which is the cache's own
   type-2 item list (component 75). */
export const SHOP_PARTS = BANK_PARTS.map(([name, x, y]) => [name, x, y === 304 ? 299 : y === 295 ? 290 : y]);
/* Interface 300's own two text components: the title line, which the client
   fills with the shop's name (the cache carries "Axe Shop" as the sample), and
   the buy/sell hint along the bottom, which the bank's interface does not have.
   Coordinates and box are the cache's. */
export const SHOP_TEXTS = [
  ["Axe Shop", 103, 28, 315, 18, "bold12"],
  ["Right-click on shop to buy item - Right-click on inventory to sell item", 18, 292, 476, 15, "plain12"],
];

export const SHOP_GRID = { x: 76, y: 65, cols: 8, rows: 5, stepX: 47, stepY: 47 };

let bankScroll = 0;
let barDrag = null;

function bankMaxScroll() { return BANK_LIST.content - BANK_LIST.h; }

/* The client's own scrollbar arithmetic (gameframe.js#scrollbarGrip), over the
   bank's list. Everything that needs the grip's geometry goes through here, so
   the drag maths and the grip can never disagree about its length. */
function bankGrip() { return scrollbarGrip(BANK_BAR.h, BANK_LIST.content, bankScroll); }

/* Set from outside the bank window too (src/save.js restores the saved scroll on
   load), so it is exported - the clamp keeps a hand-edited or stale value
   inside the list, and the early return makes it safe before the window exists. */
export function setBankScroll(v) {
  bankScroll = Math.max(0, Math.min(bankMaxScroll(), Math.round(v)));
  const els = UI.bankEls;
  if (!els) return;
  els.content.style.top = -bankScroll + "px";
  const g = bankGrip();
  els.grip.style.height = g.length + "px";
  els.grip.style.top = (16 + g.offset) + "px";
  refreshSharpText();
}

/* The saved-scroll reader (src/save.js#serializeState). */
export function bankScrollValue() { return bankScroll; }

/* The shop's own scroll state. The shop grid is 8x5 like the bank's first five
   rows, but a shop's stock list is as long as the shopkeeper's counter, so the
   same client scrollbar arithmetic is applied to it: see setBankScroll for the
   derivation of the grip length and travel. */
export const SHOP_BAR = { x: 452, y: 65, w: 16, h: 235 };
let shopScroll = 0;
let shopBarDrag = null;

function shopMaxScroll() { return Math.max(0, Math.ceil(UI.shop.stock.length / SHOP_GRID.cols) * SHOP_GRID.stepY - SHOP_GRID.rows * SHOP_GRID.stepY); }

/* `UI.shopEls.track` is the shop's own content height (its stock rows), so the
   grip arithmetic is `bankGrip`'s with the shop's window. */
function shopGrip() { return scrollbarGrip(SHOP_BAR.h, UI.shopEls ? UI.shopEls.track : SHOP_BAR.h, shopScroll); }

function setShopScroll(v) {
  shopScroll = Math.max(0, Math.min(shopMaxScroll(), Math.round(v)));
  const els = UI.shopEls;
  if (!els) return;
  els.content.style.top = -shopScroll + "px";
  const g = shopGrip();
  els.grip.style.height = g.length + "px";
  els.grip.style.top = (16 + g.offset) + "px";
  refreshSharpText();
}

function renderBank(iface) {
  const ps = UI.ps;
  const win = mk("div", "bankWin");
  /* the interface layer sits at the viewport origin, so its own (0,0) IS the
     client canvas origin - the cache coordinates go in verbatim */
  place(win, BANK_WIN.x, BANK_WIN.y, BANK_WIN.w, BANK_WIN.h);
  iface.appendChild(win);
  const ox = -BANK_WIN.x, oy = -BANK_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  const text = (str, x, y, w, h, opt) => pxText(win, str, x + ox, y + oy, w, h, opt);
  const hit = (x, y, w, h, tip, fn) => pxHit(win, x + ox, y + oy, w, h, tip, fn);

  /* the wall and the riveted frame (the cache's components in index order) */
  plateBacking(win);
  for (const [name, x, y] of BANK_PARTS) at(name, x, y);

  /* the four mode buttons: the cache gives them sprite 812 with the alternate
     813 (the red hovered state), and the mode that is on wears the highlighted
     sprite - the way the real bank shows which mode you are in. The buttons go
     down BEFORE their labels, which is the order the cache's own components are
     in (each button at 92/93/98/99, its label just after it at 95/97/100/101):
     the button sprite is opaque, so a label drawn first would vanish under it. */
  for (const b of BANK_MODES) {
    const on = b.key === "swap" ? !ps.bankSwap : b.key === "insert" ? !!ps.bankSwap
      : b.key === "item" ? !ps.bankNote : !!ps.bankNote;
    const spr = at(on ? "bankModeButtonHover" : "bankModeButton", b.x, b.y);
    const h = hit(b.x, b.y, b.w, b.h, null, () => setBankMode(b.key));
    h.classList.add("bankMode");
    h.dataset.key = b.key;
    h.addEventListener("pointerenter", () => Frame.setBg(spr, "bankModeButtonHover"));
    h.addEventListener("pointerleave", () => Frame.setBg(spr, on ? "bankModeButtonHover" : "bankModeButton"));
  }

  /* the cache's own seven texts: the title and the two label pairs that sit on
     the mode buttons' left halves (see BANK_TEXTS) */
  for (const [str, x, y, w, h, font] of BANK_TEXTS) {
    text(str, x, y, w, h, { font, ...IFACE_TEXT_STYLE });
  }

  /* the close button: sprite 535 over the cache's alternate 536 (component
     104, a child of 103, which the client swaps in while it is hovered) */
  const closeSpr = at("closeButton", CLOSE_BTN.bank.x, CLOSE_BTN.bank.y);
  const closeHit = hit(CLOSE_BTN.bank.x, CLOSE_BTN.bank.y, CLOSE_BTN.bank.w, CLOSE_BTN.bank.h, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));

  /* the 400 bank slots: an 8x50 widget at (38,3) inside the scroll box, its
     cells on the cache's own 47x38 pitch */
  const list = mk("div", "bankList");
  place(list, BANK_LIST.x + ox, BANK_LIST.y + oy, BANK_LIST.w, BANK_LIST.h);
  win.appendChild(list);
  const content = mk("div", "bankListInner");
  place(content, 0, 0, BANK_LIST.w, BANK_LIST.content);
  list.appendChild(content);
  for (let i = 0; i < ps.bank.length; i++) {
    const s = ps.bank[i];
    if (!s) continue;
    const d = mk("div", "slot bankSlot");
    d.dataset.index = i;
    place(d, BANK_GRID.x + (i % BANK_GRID.cols) * BANK_GRID.stepX - 2,
      BANK_GRID.y + ((i / BANK_GRID.cols) | 0) * BANK_GRID.stepY - 2, 36, 36);
    const img = mk("img");
    img.src = itemIcon(s.id, 32, s.qty);
    img.draggable = false;
    d.appendChild(img);
    if (showsCount(s.id, s.qty)) d.appendChild(mk("span", "qty", amountString(s.qty)));
    bindItemSlot(d, { where: "bank", index: i, stack: s });
    bindBankDrag(d, i);
    content.appendChild(d);
  }

  /* the scrollbar: the client's own 16px bar to the right of the list, its
     track and grip painted in the client's four hard-coded colours */
  const bar = mk("div", "bankBar");
  place(bar, BANK_BAR.x + ox, BANK_BAR.y + oy, BANK_BAR.w, BANK_BAR.h);
  win.appendChild(bar);
  const up = at("scrollUp", BANK_BAR.x, BANK_BAR.y);
  const down = at("scrollDown", BANK_BAR.x, BANK_BAR.y + BANK_BAR.h - 16);
  up.classList.add("bankScrollUp");
  down.classList.add("bankScrollDown");
  pxRect(bar, 0, 16, BANK_BAR.w, BANK_BAR.h - 32, SCROLLBAR_COLORS.track, 0);
  const grip = pxGrip(bar, 0, 16, BANK_BAR.w, 8);
  up.addEventListener("click", () => setBankScroll(bankScroll - BANK_GRID.stepY));
  down.addEventListener("click", () => setBankScroll(bankScroll + BANK_GRID.stepY));
  list.addEventListener("wheel", (e) => {
    e.preventDefault();
    setBankScroll(bankScroll + (e.deltaY > 0 ? BANK_GRID.stepY : -BANK_GRID.stepY));
  }, { passive: false });
  /* A click on an empty spot of the track jumps the grip straight there (the
     side panel's bar already works this way); a press on the grip itself just
     starts a drag, so the grip never jumps out from under the cursor. */
  bar.addEventListener("pointerdown", (e) => {
    const r = bar.getBoundingClientRect();
    const y = (e.clientY - r.top) / ((r.height / BANK_BAR.h) || 1);
    const g0 = bankGrip();
    if (y < 16 + g0.offset || y > 16 + g0.offset + g0.length)
      setBankScroll(((y - 16) / Math.max(1, BANK_BAR.h - 32)) * bankMaxScroll());
    barDrag = { y: e.clientY, at: bankScroll };
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!barDrag) return;
    const g = bankGrip();
    const span = Math.max(1, g.track - g.length);
    setBankScroll(barDrag.at + ((e.clientY - barDrag.y) / (Frame.scale || 1) / span) * bankMaxScroll());
  });
  bar.addEventListener("pointerup", () => { barDrag = null; });
  bar.addEventListener("pointercancel", () => { barDrag = null; });
  UI.bankEls = { content, grip };
  setBankScroll(bankScroll);
}

function setBankMode(key) {
  const ps = UI.ps;
  if (key === "swap") ps.bankSwap = 0;
  else if (key === "insert") ps.bankSwap = 1;
  else if (key === "item") ps.bankNote = 0;
  else ps.bankNote = 1;
  FullIface.refresh();
}

/* Dragging bank items onto each other rearranges them the way the client's two
   modes say: Swap exchanges the two slots, Insert pushes the range along. The
   gesture is the pack's own pointer drag (see bindInvDrag) rather than HTML5
   drag events, so it works under a finger as well as a mouse - HTML5 drags
   never fire on touch, which is what made rearrange a mouse-only gesture. */
let bankDrag = null;
let bankDragTracking = false;

/* The bank slot under the cursor, or null when the pointer is anywhere else. */
function bankSlotAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el && el.closest ? el.closest(".bankList .bankSlot") : null;
}

function showBankDragGhost(index) {
  const s = UI.ps.bank[index];
  const g = dragGhostEl();
  g.innerHTML = "";
  if (s) {
    const img = mk("img");
    img.src = itemIcon(s.id, 32, s.qty);
    img.draggable = false;
    g.appendChild(img);
    if (showsCount(s.id, s.qty)) g.appendChild(mk("span", "qty", amountString(s.qty)));
  }
  g.hidden = false;
}

function markBankDragTarget(clientX, clientY) {
  const slot = bankSlotAt(clientX, clientY);
  if (UI.bankDragOver !== slot) {
    if (UI.bankDragOver) UI.bankDragOver.classList.remove("dragOver");
    UI.bankDragOver = slot;
    if (slot) slot.classList.add("dragOver");
  }
  /* Keep the pointer capture on a slot that is still in the document, the way
     the pack drag does (see markDragTarget): a redraw mid-gesture detaches the
     pressed slot, so the capture is re-homed on the one under the cursor. */
  const d = bankDrag;
  if (d && d.active && slot && d.el !== slot && slot.setPointerCapture) {
    d.el = slot;
    try { slot.setPointerCapture(d.id); } catch (err) {}
  }
}

function clearBankDragTarget() {
  if (UI.bankDragOver) UI.bankDragOver.classList.remove("dragOver");
  UI.bankDragOver = null;
}

/* End whatever bank drag is in flight and put the screen back. Safe when
   nothing is happening, which is the point. */
function endBankDrag() {
  const d = bankDrag;
  bankDrag = null;
  if (!d) return;
  if (d.active && d.el && d.el.releasePointerCapture) {
    try { d.el.releasePointerCapture(d.id); } catch (err) {}
  }
  clearBankDragTarget();
  hideDragGhost();
}

function bankDragMove(e) {
  const d = bankDrag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.active) {
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < INV_DRAG_SLOP) return;
    d.active = true;
    if (d.el.setPointerCapture) { try { d.el.setPointerCapture(d.id); } catch (err) {} }
    hideHoverTip();
    showBankDragGhost(d.from);
  }
  moveDragGhost(e.clientX, e.clientY);
  markBankDragTarget(e.clientX, e.clientY);
}

function bankDragUp(e) {
  const d = bankDrag;
  if (!d || e.pointerId !== d.id) return;
  bankDrag = null;
  /* A press that never travelled is an ordinary click and is left alone. */
  if (!d.active) return;
  if (e.preventDefault) e.preventDefault();
  clearBankDragTarget();
  hideDragGhost();
  /* The release that ends a bank drag also fires a click; that click is not a
     withdraw (see dragJustEnded, which the shared slot click checks). */
  UI.dragEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const slot = bankSlotAt(e.clientX, e.clientY);
  if (!slot) return;
  if (bankMove(UI.ps, d.from, Number(slot.dataset.index), !!UI.ps.bankSwap)) mark("bank");
}

function bankDragCancel(e) {
  /* `blur` carries no pointerId, so a missing one counts as a match - the
     pointerup may simply have gone to another window and never come back. */
  const d = bankDrag;
  if (!d || (e && e.pointerId != null && e.pointerId !== d.id)) return;
  endBankDrag();
}

/* The move/up stream is watched on `window`, once, on the first draggable
   slot - the same arrangement the pack drag uses, for the same reason: a
   listener there survives the mid-drag redraw that detaches the pressed slot. */
function bindBankDragTracking() {
  if (bankDragTracking) return;
  bankDragTracking = true;
  window.addEventListener("pointermove", bankDragMove, true);
  window.addEventListener("pointerup", bankDragUp, true);
  window.addEventListener("pointercancel", bankDragCancel, true);
  window.addEventListener("blur", bankDragCancel);
}

function bindBankDrag(el, index) {
  bindBankDragTracking();
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !UI.ps.bank[index]) return;
    /* A gesture already open means its pointerup was lost (a drag taken out of
       the window); start the new one clean rather than layering two. */
    endBankDrag();
    bankDrag = { from: index, x: e.clientX, y: e.clientY, active: false, id: e.pointerId, el };
  });
}

function bankWithdraw(index, qty) {
  const ps = UI.ps;
  const s = ps.bank[index];
  if (!s) return;
  if (UI.actions.bankWithdraw) return UI.actions.bankWithdraw(index, qty);
  /* Notes are only for things that do not already stack: a stackable item
     withdraws as its own stack whatever the mode button says, which is the
     client's own rule - a note is the stackable form of an unstackable item,
     and noting a stackable would make a noted stack nothing can un-note. */
  const note = !!ps.bankNote && !isStackable(s.id);
  const n = qty === "all" ? s.qty : Math.min(s.qty, qty);
  if (!note && !isStackable(s.id) && invFree(ps) < n) {
    invWithdrawCareful(ps, index, s, n);
    return;
  }
  const moved = invAdd(ps, s.id, n, note);
  if (moved <= 0) { chat("You don't have enough inventory space.", "warn"); return; }
  s.qty -= moved;
  if (s.qty <= 0) ps.bank[index] = null;
  chat("You withdraw " + moved + " x " + itemName(s.id) + (note ? " as a note." : "."), "game");
  mark("inv", "bank");
  FullIface.refresh();
  renderTab();
}

/* Banking a stack. A note goes back in as the item itself - notes are only a
   withdrawal format, which is what the real bank does with them.

   "Deposit All" and "Deposit 5/10" count *items of that kind*, not the clicked
   slot's stack: a non-stackable item sits in the pack one per slot, so its own
   qty is always 1 and the options would otherwise move a single shark out of a
   pack holding twenty. The clicked slot is emptied first and the rest of the
   kind follows it - which is what the client's Deposit-N does, and why a
   "Deposit All" on a rune moves the whole 1000 in one click either way. */
export function bankDeposit(index, qty) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  const id = s.id;
  const want = qty === "all" ? Infinity : Math.max(0, qty | 0);
  if (!want) return;
  const order = [index];
  for (let i = 0; i < ps.inv.length; i++) {
    if (i !== index && ps.inv[i] && ps.inv[i].id === id) order.push(i);
  }
  let moved = 0;
  for (const i of order) {
    if (moved >= want) break;
    const st = ps.inv[i];
    if (!st || st.id !== id) continue;
    const take = Math.min(st.qty, want - moved);
    const got = bankAdd(ps, id, take);
    if (got <= 0) break;                       /* the bank is full */
    st.qty -= got;
    if (st.qty <= 0) ps.inv[i] = null;
    moved += got;
    if (got < take) break;
  }
  if (moved <= 0) { chat("There is no room in your bank.", "warn"); return; }
  chat("You deposit " + moved + " x " + itemName(id) + ".", "game");
  mark("inv", "bank");
  FullIface.refresh();
  renderTab();
}

function bankWithdrawX(index) {
  const ps = UI.ps;
  const s = ps.bank[index];
  if (!s) return;
  openAmountPrompt("withdraw", index);
}

function bankDepositX(index) {
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  openAmountPrompt("deposit", index);
}

export function openAmountPrompt(kind, index, extra) {
  cancelPendingAmount();
  const input = UI.els.chatInput;
  if (input && document.activeElement === input) input.blur();
  UI.pendingAmount = Object.assign({ kind, index, buffer: "" }, extra || {});
  const prev = UI.chatDialogClosed;
  UI.chatDialogClosed = () => { UI.pendingAmount = null; if (prev) prev(); };
  redrawAmountDialogue();
}

function redrawAmountDialogue() {
  const p = UI.pendingAmount;
  const d = UI.els.chatDialog;
  if (!p) return;
  if (!d) { UI.pendingAmount = null; return; }
  if (UI.amountInput && UI.amountInput.isConnected) {
    if (document.activeElement !== UI.amountInput && UI.amountInput.value !== (p.buffer || "")) {
      UI.amountInput.value = p.buffer || "";
    }
    if (d.hidden) { UI.pendingAmount = null; UI.amountInput = null; return; }
    d.hidden = false;
    setChatDialogOpen(true);
    return;
  }
  d.innerHTML = "";
  const prompt = mk("div", null, p.kind === "deposit" ? "How many would you like to deposit?"
    : p.kind === "offer" ? "How many would you like to offer?"
    : p.kind === "remove" ? "How many would you like to remove?"
    : p.kind === "make" ? "How many would you like to make?"
    : p.kind === "tan" ? "How many would you like tanned?"
    : p.kind === "enchant" ? "How many would you like enchanted?"
    : "How many would you like to withdraw?");
  prompt.style.top = Math.round(59 - DIALOG_OFFSET - 20) + "px";
  d.appendChild(prompt);
  const input = document.createElement("input");
  input.className = "amtInput";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.spellcheck = false;
  input.value = p.buffer || "";
  input.style.top = Math.round(59 - DIALOG_OFFSET) + "px";
  input.addEventListener("input", () => {
    /* The trade's Offer-X/Remove-X accepts a K/M/B suffix (the wiki's own
       rule), so those two kinds keep letters while the bank's kinds stay
       digits-only. */
    if (UI.pendingAmount && (UI.pendingAmount.kind === "offer" || UI.pendingAmount.kind === "remove")) {
      const digits = input.value.replace(/\D/g, "").slice(0, 10);
      const suf = (input.value.match(/[kmb]/i) || [""])[0].toLowerCase();
      const clean = digits + suf;
      if (input.value !== clean) input.value = clean;
    } else {
      const clean = input.value.replace(/\D/g, "").slice(0, 10);
      if (input.value !== clean) input.value = clean;
    }
    if (UI.pendingAmount) UI.pendingAmount.buffer = input.value;
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); confirmPendingAmount(); }
    else if (e.key === "Escape") { cancelPendingAmount(); closeChatDialog(); }
  });
  for (const ev of ["keyup", "keypress", "pointerdown"]) input.addEventListener(ev, (e) => e.stopPropagation());
  input.addEventListener("focus", () => { Frame.setTyping(true); });
  input.addEventListener("blur", () => { Frame.setTyping(false); });
  d.appendChild(input);
  d.hidden = false;
  setChatDialogOpen(true);
  UI.amountInput = input;
  input.focus();
  const n = input.value.length;
  try { input.setSelectionRange(n, n); } catch (err) {}
}

function confirmPendingAmount() {
  const p = UI.pendingAmount;
  const raw = UI.amountInput && UI.amountInput.isConnected ? UI.amountInput.value : (p ? p.buffer : "");
  UI.pendingAmount = null;
  UI.amountInput = null;
  closeChatDialog();
  if (!p) return;
  /* The trade's custom amounts (Offer-X/Remove-X): digits with an optional
     K/M/B suffix, handed to the trade window's own hook - the bank's bankX is
     nothing to do with them. */
  if (p.kind === "offer" || p.kind === "remove") {
    const m = /^\s*(\d+)\s*([kmb])?\s*$/i.exec(String(raw || ""));
    if (!m) return;
    let n = parseInt(m[1], 10);
    const s = (m[2] || "").toLowerCase();
    if (s === "k") n *= 1e3;
    else if (s === "m") n *= 1e6;
    else if (s === "b") n *= 1e9;
    if (n > 0 && UI.actions.tradeAmount) UI.actions.tradeAmount(p.kind, p.index, Math.min(2147483647, n));
    return;
  }
  const digits = String(raw || "").replace(/\D/g, "");
  const n = digits ? parseInt(digits, 10) : 0;
  if (!n) { UI.ps.bankX = 0; return; }
  /* A production Make-X: the amount goes to whoever asked, not the bank. */
  if (p.kind === "make" || p.kind === "enchant") {
    const cb = p.cb;
    if (cb) cb(Math.min(2147483647, n));
    return;
  }
  UI.ps.bankX = Math.min(2147483647, n);
  if (p.kind === "deposit") {
    if (UI.ps.inv[p.index]) bankDeposit(p.index, UI.ps.bankX);
  } else if (UI.ps.bank[p.index]) {
    bankWithdraw(p.index, UI.ps.bankX);
  }
}

function cancelPendingAmount() {
  if (!UI.pendingAmount) return;
  UI.pendingAmount = null;
  UI.amountInput = null;
}

/* Withdrawing a non-stackable item one at a time, stopping when the inventory
   is full - the same partial withdraw the client does. */
function invWithdrawCareful(ps, index, s, n) {
  let moved = 0;
  while (moved < n && invFree(ps) > 0) {
    if (invAdd(ps, s.id, 1) <= 0) break;
    moved++;
  }
  if (moved <= 0) { chat("You don't have enough inventory space.", "warn"); return; }
  s.qty -= moved;
  if (s.qty <= 0) ps.bank[index] = null;
  chat("You withdraw " + moved + " x " + itemName(s.id) + ".", "game");
  mark("inv", "bank");
  FullIface.refresh();
  renderTab();
}

/* -------------------------------------------------------------- skill guide */

/* Clicking a skill's own hit box in the stats tab opens the guide: there is no
   guide interface in the
   cache to transcribe (see src/skillguides.js for the search). This keeps the
   guide in the client's own idiom: the bank's riveted window, and its
   scrollable list and scrollbar, over guides built from this world's data. */
const GUIDE_LIST = { x: 37, y: 55, w: 427, h: 229 };
const GUIDE_LEAD_H = 18;
const GUIDE_HEADING_H = 21;
/* The blank band a category heading floats in. One long list of rows sorted by
   level reads as a single run of similar items; the band is what separates one
   category from the next without a rule line the client never draws. */
const GUIDE_GAP_H = 4;
const GUIDE_LINE_H = 11;
const GUIDE_ICON = 20;
const GUIDE_COL_ICON = 3;
const GUIDE_COL_LEVEL = 27;
const GUIDE_COL_TEXT = 92;
const GUIDE_FULL_TEXT = 8;
/* The jump list: a two-column index of the guide's own section headings, drawn
   as the first thing in the list when a guide is long enough to need one. The
   live game's own guide opens on a two-column list of categories for exactly
   this reason (see README's "The skill guide"). */
const GUIDE_JUMP_MIN = 6;
const GUIDE_JUMP_COLS = 2;
const GUIDE_JUMP_LINE = 14;
const GUIDE_JUMP_HEAD = 15;

let guideScroll = 0;
let guideContentH = 0;
let guideBarDrag = null;

/* The rows are as tall as their text needs: the text is read out of the world's
   data rather than hand-written (see src/skillguides.js), so a line can run
   past one row's width. Measured with the tab's own bitmap font at its native
   size, so the browser's own word wrap lands where the measurement says it
   will. */
const guideMeasure = document.createElement("canvas").getContext("2d");
function guideFont(font) {
  const [family, size] = PX_FONTS[font || "plain11"];
  return size + "px " + family;
}
function guideLines(str, width, font) {
  guideMeasure.font = guideFont(font);
  const w = guideMeasure.measureText(str).width;
  return w <= width ? 1 : Math.ceil(w / width);
}
function guideRowH(str, width, font) {
  return Math.max(22, guideLines(str, width, font) * GUIDE_LINE_H + 10);
}
function guideTextW(str, font) { guideMeasure.font = guideFont(font); return guideMeasure.measureText(str).width; }
/* A row's icon box. Item icons are square and come from the item ids; a sprite
   icon is whatever the atlas stores - the prayer icons are a 30x30 cell against
   a spell cell's 24 and an item's 20, which is why the columns are measured per
   guide rather than fixed. The cell (maxW/maxH) is the right measure, not the
   trimmed art: pxSprite puts the art back at its own offset inside the cell. */
function guideIconBox(icon) {
  if (!icon) return null;
  if (icon.item) { const s = icon.size || GUIDE_ICON; return { w: s, h: s }; }
  const p = Frame.parts[icon.sprite];
  if (!p) return { w: GUIDE_ICON, h: GUIDE_ICON };
  const cell = (v, fallback) => (v && v <= 40 ? v : fallback);
  return { w: cell(p.maxW, p.w), h: cell(p.maxH, p.h) };
}

function guideMaxScroll() { return Math.max(0, guideContentH - GUIDE_LIST.h); }

/* How far one notch of the wheel (or one click of an arrow) travels. A short
   guide keeps the bank's own 44px step; a long one - the Attack guide is nearly
   4,000px now that it lists every weapon in the world - scales up with its own
   length so the whole list stays reachable in a couple of dozen notches instead
   of a couple of hundred. */
function guideStep() { return Math.max(44, Math.round(guideContentH / 24)); }

/* The bank's own scrollbar arithmetic (see setBankScroll), over the guide's
   list heights. A guide is the same 229-tall scroll box as the bank's. */
function guideGrip() { return scrollbarGrip(GUIDE_LIST.h, guideContentH, guideScroll); }

function setGuideScroll(v) {
  guideScroll = Math.max(0, Math.min(guideMaxScroll(), Math.round(v)));
  const els = UI.guideEls;
  if (!els) return;
  els.content.style.top = -guideScroll + "px";
  const g = guideGrip();
  els.grip.style.height = g.length + "px";
  els.grip.style.top = (16 + g.offset) + "px";
}

/* -------------------------------------------- seamless plate backing

   Every full-window interface wears the same wall: thirty 88x60 `dialogBack`
   plates tiled plate-for-plate from the cache. Thirty separate tile divs under
   a fractional frame scale each round their edges differently, which draws 1px
   seams between the plates - so behind the plates sits ONE div repeating a
   single plate cell over the wall's own rect. A repeat inside one element is
   painted in local space and transformed as a whole, so it cannot seam, and at
   1x it is pixel-identical to the plates (same cell); any hairline the plates
   do open shows the continuing pattern through the crack instead of the page
   behind. The plates stay - they are what check-ui holds against the cache -
   the backing only fills cracks. Cropped once from the atlas (already in the
   browser's cache) and reused by every window; a window rendered before the
   crop lands simply gains it on the next refresh. */
const PLATE_BACK = { x: 0, y: 0, w: 488, h: 300 };
let plateBackURL = null;
let plateBackBusy = false;

function ensurePlateBack() {
  if (plateBackURL || plateBackBusy || !Frame.atlasURL) return;
  const p = Frame.parts["dialogBack"];
  if (!p) return;
  plateBackBusy = true;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = p.w; c.height = p.h;
      c.getContext("2d").drawImage(img, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
      plateBackURL = c.toDataURL();
    } catch (e) {}
    plateBackBusy = false;
    if (plateBackURL && FullIface.open) FullIface.refresh();
  };
  img.onerror = () => { plateBackBusy = false; };
  img.src = Frame.atlasURL();
}

export function plateBacking(win) {
  ensurePlateBack();
  if (!plateBackURL) return;
  const d = mk("div", "plateBack");
  place(d, PLATE_BACK.x, PLATE_BACK.y, PLATE_BACK.w, PLATE_BACK.h);
  d.style.backgroundImage = 'url("' + plateBackURL + '")';
  win.insertBefore(d, win.firstChild);
}

/* ------------------------------------------------- reusable client table window

   The bank/shop/skill-guide pattern, lifted into a template any table can use:
   the bank's own riveted window (BANK_PARTS at BANK_WIN), its title line, a
   scroll list (CLIENT_LIST, the bank's own box) and the client's own 16px
   scrollbar (track + grip + arrow sprites, gameframe.js#scrollbarGrip maths,
   click/drag/wheel). Content is header + fixed-height rows drawn with pxText,
   so every table that opens through here gets the real bar, not a native one. */
const CLIENT_LIST = { x: 37, y: 61, w: 427, h: 223 };
const CLIENT_BAR = { x: 464, y: 61, w: 16, h: 223 };
const CLIENT_HEADER_H = 18;
const CLIENT_ROW_H = 15;
let clientTableSpec = null;
let clientTableScroll = 0;
let clientTableContentH = CLIENT_LIST.h;
let clientTableBarDrag = null;

function clientTableMaxScroll() { return Math.max(0, clientTableContentH - CLIENT_LIST.h); }
function clientTableGrip() { return scrollbarGrip(CLIENT_LIST.h, clientTableContentH, clientTableScroll); }
function clientTableStep() { return CLIENT_ROW_H * 2; }

function setClientTableScroll(v) {
  clientTableScroll = Math.max(0, Math.min(clientTableMaxScroll(), Math.round(v)));
  const els = UI.clientTableEls;
  if (!els) return;
  els.content.style.top = -clientTableScroll + "px";
  const g = clientTableGrip();
  els.grip.style.height = g.length + "px";
  els.grip.style.top = (16 + g.offset) + "px";
}

export function openClientTable(spec) {
  clientTableSpec = {
    title: spec.title || "",
    columns: spec.columns ? spec.columns.slice() : [],
    rows: spec.rows ? spec.rows.slice() : [],
    footer: spec.footer || "",
  };
  clientTableScroll = 0;
  FullIface.show("clienttable", renderClientTable);
}

export function updateClientTable(spec) {
  if (!clientTableSpec) return;
  if (spec.title !== undefined) clientTableSpec.title = spec.title;
  if (spec.columns !== undefined) clientTableSpec.columns = spec.columns.slice();
  if (spec.rows !== undefined) clientTableSpec.rows = spec.rows.slice();
  if (spec.footer !== undefined) clientTableSpec.footer = spec.footer;
  clientTableScroll = 0;
  if (FullIface.open === "clienttable") FullIface.refresh();
}

function renderClientTable(iface) {
  const spec = clientTableSpec || { title: "", columns: [], rows: [], footer: "" };
  const win = mk("div", "bankWin");
  place(win, BANK_WIN.x, BANK_WIN.y, BANK_WIN.w, BANK_WIN.h);
  iface.appendChild(win);
  const ox = -BANK_WIN.x, oy = -BANK_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  plateBacking(win);
  for (const [name, x, y] of BANK_PARTS) at(name, x, y);
  pxText(win, spec.title, 19 + ox, 30 + oy, 474, 16, { font: "bold12", color: "#ff981f", align: 1 });
  const closeSpr = at("closeButton", 471, 26);
  const closeHit = pxHit(win, 471 + ox, 26 + oy, 26, 23, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));
  const list = mk("div", "bankList");
  place(list, CLIENT_LIST.x + ox, CLIENT_LIST.y + oy, CLIENT_LIST.w, CLIENT_LIST.h);
  win.appendChild(list);
  const n = spec.rows.length;
  clientTableContentH = CLIENT_HEADER_H + Math.max(1, n) * CLIENT_ROW_H + 4;
  const content = mk("div", "bankListInner");
  place(content, 0, 0, CLIENT_LIST.w, clientTableContentH);
  list.appendChild(content);
  const cols = spec.columns;
  const cw = CLIENT_LIST.w / Math.max(1, cols.length);
  cols.forEach((c, i) => {
    pxText(content, c, i * cw, 0, cw, CLIENT_HEADER_H, { font: "plain12", color: "#ffd97a", align: 1 });
  });
  spec.rows.forEach((r, ri) => {
    const y = CLIENT_HEADER_H + ri * CLIENT_ROW_H;
    r.forEach((cell, ci) => {
      pxText(content, String(cell), ci * cw, y, cw, CLIENT_ROW_H, { font: "plain12", color: "#ffffff", align: 1 });
    });
  });
  if (spec.footer) pxText(win, spec.footer, 19 + ox, 292 + oy, 474, 15, { font: "plain12", color: "#ffd97a", align: 1 });
  const bar = mk("div", "bankBar");
  place(bar, CLIENT_BAR.x + ox, CLIENT_BAR.y + oy, CLIENT_BAR.w, CLIENT_BAR.h);
  win.appendChild(bar);
  const up = at("scrollUp", CLIENT_BAR.x, CLIENT_BAR.y);
  const down = at("scrollDown", CLIENT_BAR.x, CLIENT_BAR.y + CLIENT_BAR.h - 16);
  pxRect(bar, 0, 16, CLIENT_BAR.w, CLIENT_BAR.h - 32, SCROLLBAR_COLORS.track, 0);
  const grip = pxGrip(bar, 0, 16, CLIENT_BAR.w, 8);
  up.addEventListener("click", () => setClientTableScroll(clientTableScroll - clientTableStep()));
  down.addEventListener("click", () => setClientTableScroll(clientTableScroll + clientTableStep()));
  list.addEventListener("wheel", (e) => {
    e.preventDefault();
    setClientTableScroll(clientTableScroll + (e.deltaY > 0 ? clientTableStep() : -clientTableStep()));
  }, { passive: false });
  bar.addEventListener("pointerdown", (e) => {
    const r = bar.getBoundingClientRect();
    const y = (e.clientY - r.top) / ((r.height / CLIENT_BAR.h) || 1);
    const g0 = clientTableGrip();
    if (y < 16 + g0.offset || y > 16 + g0.offset + g0.length)
      setClientTableScroll(((y - 16) / Math.max(1, CLIENT_BAR.h - 32)) * clientTableMaxScroll());
    clientTableBarDrag = { y: e.clientY, at: clientTableScroll };
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!clientTableBarDrag) return;
    const g = clientTableGrip();
    const span = Math.max(1, g.track - g.length);
    setClientTableScroll(clientTableBarDrag.at + ((e.clientY - clientTableBarDrag.y) / (Frame.scale || 1) / span) * clientTableMaxScroll());
  });
  bar.addEventListener("pointerup", () => { clientTableBarDrag = null; });
  bar.addEventListener("pointercancel", () => { clientTableBarDrag = null; });
  UI.clientTableEls = { content, grip };
  setClientTableScroll(clientTableScroll);
}

export function openSkillGuide(skillId) {
  guideScroll = 0;
  FullIface.show("skillguide:" + skillId, (iface) => renderSkillGuide(iface, skillId));
}

function renderSkillGuide(iface, skillId) {
  const ps = UI.ps;
  const guide = buildGuide(skillId);
  const st = ps.skills[skillId] || { level: 1, xp: 0 };

  /* the bank's window, part for part - the same frame every full-window
     interface in this build wears (see renderBank for the coordinates) */
  const win = mk("div", "bankWin");
  place(win, BANK_WIN.x, BANK_WIN.y, BANK_WIN.w, BANK_WIN.h);
  iface.appendChild(win);
  const ox = -BANK_WIN.x, oy = -BANK_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  plateBacking(win);
  for (const [name, x, y] of BANK_PARTS) at(name, x, y);
  pxText(win, guide.title, 19 + ox, 30 + oy, 474, 16, { font: "bold12", color: "#ff981f", align: 1 });
  const closeSpr = at("closeButton", 471, 26);
  const closeHit = pxHit(win, 471 + ox, 26 + oy, 26, 23, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));

  const list = mk("div", "bankList");
  place(list, GUIDE_LIST.x + ox, GUIDE_LIST.y + oy, GUIDE_LIST.w, GUIDE_LIST.h);
  win.appendChild(list);

  /* ----------------------------------------------------------- the layout

     Measured before anything is drawn, because the scrollbar's grip is scaled
     by the content height. One pass produces both the block list and the
     height, so the two can never disagree. */
  const next = st.level < MAX_LEVEL ? Math.floor(xpForLevel(st.level + 1)) : Math.floor(st.xp);
  const lead = "Your " + guide.title.replace(/ Guide$/, "") + " level is " + st.level +
    " - " + formatNum(Math.floor(st.xp)) + " XP" +
    (st.level < MAX_LEVEL ? " - next level at " + formatNum(next) + " XP" : " - maximum level");

  const blocks = [];
  blocks.push({ kind: "lead", text: lead, h: Math.max(GUIDE_LEAD_H, guideRowH(lead, GUIDE_LIST.w - 16, "plain11")) });
  blocks.push({ kind: "intro", text: guide.intro, h: Math.max(GUIDE_LEAD_H + 6, guideRowH(guide.intro, GUIDE_LIST.w - 16, "plain11")) });

  /* ------------------------------------------------------------ the columns

     The icon column is as wide as the widest icon this guide actually uses and
     the level column as wide as its own "Level NN" runs, so a big icon (the
     prayer art) pushes the level column right instead of sitting on it. The
     text column is the same 92px in every guide unless a wide icon needs more,
     and a row with an icon and no level still starts its text there rather than
     in the icon (the arrow and rune rows). Rows with no icon at all are prose
     and use the full width. A guide whose rows carry a `right` note (the
     weapons guide's attack speed) reserves a column for it at the far right,
     measured from the longest note, and the text column gives up that width so
     a name can never run under the number. */
  const iconX = GUIDE_COL_ICON;
  let iconW = GUIDE_ICON, iconH = GUIDE_ICON, lvlW = 0, rightW = 0;
  for (const sec of guide.sections) {
    for (const r of sec.rows) {
      if (r.icon) {
        const box = guideIconBox(r.icon);
        iconW = Math.max(iconW, box.w);
        iconH = Math.max(iconH, box.h);
      }
      if (r.level != null) lvlW = Math.max(lvlW, guideTextW("Level " + r.level, "plain11"));
      if (r.right) rightW = Math.max(rightW, guideTextW(r.right, "plain11"));
    }
  }
  const lvlX = Math.max(GUIDE_COL_LEVEL, iconX + iconW + 5);
  const textX = Math.max(GUIDE_COL_TEXT, lvlX + lvlW + 8);
  /* A few pixels of slack in the right-hand box: the DOM's own rendering of the
     tab's bitmap font can come out a hair wider than the canvas measurement, and
     the note must never reach the scrollbar at the list's right edge. The box's
     right edge itself sits 8px in from the list, so even an overflow of a couple
     of pixels lands on the panel, not the bar. */
  if (rightW) rightW += 6;
  const rightX = GUIDE_LIST.w - 8 - rightW;
  const textRight = rightW ? rightX - 8 : GUIDE_LIST.w - 4;

  for (const sec of guide.sections) {
    blocks.push({ kind: "head", text: sec.heading, h: GUIDE_HEADING_H + GUIDE_GAP_H });
    for (const r of sec.rows) {
      const x = r.icon ? textX : GUIDE_FULL_TEXT;
      const w = textRight - x;
      blocks.push({ kind: "row", r, x, w, h: Math.max(guideRowH(r.text, w, "plain11"), r.icon ? iconH + 6 : 0) });
    }
  }
  /* Where each section starts, so a jump-list click can scroll straight to it.
     Every block now carries its own `y`, which is also what the draw pass uses -
     the jump block is unshifted afterwards, so the shift is applied to the whole
     list at once and no two passes can disagree about where a row goes. */
  let yTop = 0;
  const sectionY = {};
  for (const b of blocks) { b.y = yTop; if (b.kind === "head") sectionY[b.text] = yTop; yTop += b.h; }
  let jump = null;
  if (guide.sections.length >= GUIDE_JUMP_MIN) {
    const rows = Math.ceil(guide.sections.length / GUIDE_JUMP_COLS);
    jump = { kind: "jump", h: rows * GUIDE_JUMP_LINE + GUIDE_JUMP_HEAD, items: guide.sections.map((s) => s.heading) };
    for (const b of blocks) b.y += jump.h;
    /* the recorded heading positions move with the rows, or a click would land
       exactly one jump-list too high */
    for (const k of Object.keys(sectionY)) sectionY[k] += jump.h;
    blocks.unshift(jump);
  }
  guideContentH = blocks.reduce((n, b) => n + b.h, 0) + 8;

  const content = mk("div", "bankListInner");
  place(content, 0, 0, GUIDE_LIST.w, guideContentH);
  list.appendChild(content);

  /* ------------------------------------------------------------- the draw */
  let y = 0;
  for (const b of blocks) {
    if (b.kind === "jump") {
      /* the index of the guide's own sections, one click from anywhere in it -
         it scrolls the list to the heading, which is the live game's own
         behaviour and the whole point of the list */
      pxText(content, "Jump to a section", GUIDE_FULL_TEXT, y, GUIDE_LIST.w - 16, GUIDE_JUMP_HEAD, { font: "bold12", color: "#ff981f", valign: 2 });
      const colW = Math.floor((GUIDE_LIST.w - GUIDE_FULL_TEXT * 2) / GUIDE_JUMP_COLS);
      b.items.forEach((label, i) => {
        const cx = GUIDE_FULL_TEXT + (i % GUIDE_JUMP_COLS) * colW;
        const cy = y + GUIDE_JUMP_HEAD + Math.floor(i / GUIDE_JUMP_COLS) * GUIDE_JUMP_LINE;
        const t = pxText(content, label, cx, cy, colW - 6, GUIDE_JUMP_LINE, { color: "#ffff00", valign: 1 });
        const hit = pxHit(content, cx, cy, colW - 6, GUIDE_JUMP_LINE, null,
          () => setGuideScroll(sectionY[label] - GUIDE_JUMP_HEAD));
        hit.addEventListener("pointerenter", () => { t.style.color = "#ffffff"; });
        hit.addEventListener("pointerleave", () => { t.style.color = "#ffff00"; });
      });
    } else if (b.kind === "head") {
      /* bottom-aligned in a taller band: the extra height becomes the space
         *above* the heading, so each category starts a little clear of the one
         before it. */
      pxText(content, b.text, GUIDE_FULL_TEXT, y, GUIDE_LIST.w - 16, b.h, { font: "bold12", color: "#ff981f", valign: 2 });
    } else if (b.kind === "lead") {
      pxText(content, b.text, GUIDE_FULL_TEXT, y, GUIDE_LIST.w - 16, b.h, { color: "#ffff00", valign: 1 });
    } else if (b.kind === "intro") {
      pxText(content, b.text, GUIDE_FULL_TEXT, y, GUIDE_LIST.w - 16, b.h, { color: "#ffd97a" });
    } else {
      const r = b.r;
      if (r.icon && r.icon.item) {
        const size = r.icon.size || GUIDE_ICON;
        const img = mk("img");
        img.src = itemIcon(r.icon.item, size);
        img.draggable = false;
        img.style.position = "absolute";
        img.style.left = (iconX + Math.round((iconW - size) / 2)) + "px";
        img.style.top = (y + Math.round((b.h - size) / 2)) + "px";
        img.style.width = img.style.height = size + "px";
        content.appendChild(img);
      } else if (r.icon && r.icon.sprite) {
        const box = guideIconBox(r.icon);
        pxSprite(content, r.icon.sprite, iconX + Math.round((iconW - box.w) / 2), y + Math.round((b.h - box.h) / 2));
      }
      if (r.level != null) {
        pxText(content, "Level " + r.level, lvlX, y, textX - lvlX - 3, b.h,
          { color: "#ffff00", valign: 1 });
      }
      pxText(content, r.text, b.x, y, b.w, b.h, { color: "#ffd97a", valign: 1 });
      if (r.right) {
        pxText(content, r.right, rightX, y, rightW, b.h, { color: "#c9b78d", valign: 1, align: 2, nowrap: true });
      }
    }
    y += b.h;
  }

  /* the same 16px bar as the bank's, in the client's four hard-coded colours */
  const bar = mk("div", "bankBar");
  place(bar, BANK_BAR.x + ox, BANK_BAR.y + oy, BANK_BAR.w, BANK_BAR.h);
  win.appendChild(bar);
  const up = at("scrollUp", BANK_BAR.x, BANK_BAR.y);
  const down = at("scrollDown", BANK_BAR.x, BANK_BAR.y + BANK_BAR.h - 16);
  up.classList.add("bankScrollUp");
  down.classList.add("bankScrollDown");
  pxRect(bar, 0, 16, BANK_BAR.w, BANK_BAR.h - 32, SCROLLBAR_COLORS.track, 0);
  const grip = pxGrip(bar, 0, 16, BANK_BAR.w, 8);
  up.addEventListener("click", () => setGuideScroll(guideScroll - guideStep()));
  down.addEventListener("click", () => setGuideScroll(guideScroll + guideStep()));
  list.addEventListener("wheel", (e) => {
    e.preventDefault();
    setGuideScroll(guideScroll + (e.deltaY > 0 ? guideStep() : -guideStep()));
  }, { passive: false });
  bar.addEventListener("pointerdown", (e) => { guideBarDrag = { y: e.clientY, at: guideScroll }; e.preventDefault(); });
  bar.addEventListener("pointermove", (e) => {
    if (!guideBarDrag) return;
    const g = guideGrip();
    const span = Math.max(1, g.track - g.length);
    setGuideScroll(guideBarDrag.at + ((e.clientY - guideBarDrag.y) / (Frame.scale || 1) / span) * guideMaxScroll());
  });
  bar.addEventListener("pointerup", () => { guideBarDrag = null; });
  bar.addEventListener("pointercancel", () => { guideBarDrag = null; });
  UI.guideEls = { content, grip };
  setGuideScroll(guideScroll);
}

/* ------------------------------------------------------------------- shop */

export const SHOP_WIN = { x: 12, y: 20, w: 488, h: 300 };

/* The world's shops (the ledger's one non-tile record, index.html's WK_SHOP).

   A counter used to be entirely private: each client walked up to its own copy
   of the shelves, so two players buying from the same shopkeeper bought from
   two different shops and neither could ever empty it. Now the shelves travel -
   but a shop is not a place, so it travels differently from a door: it has no
   tile to be filed under and no ring to be in, so it is filed under its own key
   (`SHOPS[...]`, the string `openShop` is handed) and *asked for* the moment a
   counter is opened. The answer is the shop's whole known shelf, laid over the
   shop's own default rows.

   The reset matters as much as the share. The world has no restock at all - it
   was per-player, so a shelf never had to come back - and sharing without
   restocking would let the first buyer empty every shop in the game forever. So
   the first change to a shop starts the server's own restock clock
   (`SHOP_RESTOCK_SEC`), and that clock is run the same way a tree's respawn is:
   the server prunes the record when its deadline passes (`pruneShops`, which
   covers a shop nobody is looking at), and the client with the counter open
   runs the same clock and reports the reset, which is what lets a player watch
   the shelves refill while they stand there. */
const SHOP_DEFAULTS = new Map();   /* shopKey -> a copy of the shop's own rows */
const SHOP_RESTOCK = new Map();    /* shopKey -> the game time its clock runs out */

/* What a shop looked like before anybody bought from it. Captured the first time
   the counter is opened and never again, because the shop's own `stock` array is
   the very thing the buying mutates in place - the default rows exist nowhere
   else once a sale has gone through. */
function shopDefaults(shop, key) {
  let rows = SHOP_DEFAULTS.get(key);
  if (!rows) {
    rows = shop.stock.map((s) => (s ? { ...s } : s));
    SHOP_DEFAULTS.set(key, rows);
  }
  return rows;
}

/* Put the shelves back the way the shop defines them. The array is refilled in
   place rather than replaced, because `UI.shop.stock` is read fresh on every
   render but the panel's scroll maths and the row index a click names both
   assume the shop object is the same one. */
function resetShopStock(shop, key) {
  const rows = SHOP_DEFAULTS.get(key);
  if (!rows) return;
  shop.stock.length = 0;
  for (const r of rows) shop.stock.push(r ? { ...r } : r);
}

/* One row of a shop's shelf, as the world says it is. An id the shop already
   carries has its count set outright; an id it does not (something another
   player sold it) takes a free cell of the grid exactly the way `sellToShop`
   gives it one, so the two ends grow the same shelf in the same order. */
function mergeShopRow(shop, id, qty) {
  const row = shop.stock.find((s) => s && s.id === id);
  if (row) { row.qty = qty; return; }
  if (qty <= 0) return;
  const free = shop.stock.findIndex((s) => !s || !s.qty);
  const room = free >= 0 ? free : shop.stock.length;
  if (room < SHOP_GRID.cols * 15) shop.stock[room] = { id, qty, price: itemValue(id) };
}

/* A shop record from the server (src/net.js#WK_SHOP, wired in src/main.js).
   `full` means "this is the shop's whole known shelf" - the answer to a request
   or to our own restock clear - so the default rows go down first and the record
   is laid over them; anything else is one change, merged in. A record about a
   shop that is not the one on screen is dropped: the shelves of a counter
   nobody has open are not this client's business, and the shop asks again when
   it is next opened. */
export function applyShopStock(key, flags, rows, remain) {
  if (!UI.shop || UI.shopKey !== key) return;
  const shop = UI.shop;
  if (flags & SHOP_FULL) resetShopStock(shop, key);
  if (flags & SHOP_CLEAR) SHOP_RESTOCK.delete(key);
  for (const r of rows || []) mergeShopRow(shop, r.id, r.qty);
  /* The server hands out the seconds its own clock has left, so this client
     arms the same deadline without either clock having to agree with the
     other - the trick the loc records already use. */
  if (remain > 0) SHOP_RESTOCK.set(key, (UI.game ? (UI.game.time || 0) : 0) + remain);
  else if (flags & 1) SHOP_RESTOCK.delete(key);
  FullIface.refresh();
}

/* Tell the world what this shop's shelf says now. One row per call - the id the
   sale was about and its new absolute count - because the server merges rows
   rather than taking a whole shelf from whoever spoke last. */
function reportShopStock(key, id, qty) {
  netShop(key, 0, [{ id, qty }]);
}

export function openShop(shop, key) {
  UI.shop = shop;
  UI.shopKey = key || null;
  shopScroll = 0;
  /* The counter is the world's, so ask for its shelves before drawing them: the
     answer resets them to the shop's own rows and lays the world's record over
     the top (applyShopStock). A shop with no key - a caller that never names one
     - is simply private, which is what every shop was before this. */
  if (key) { shopDefaults(shop, key); netShopRequest(key); }
  /* the shop is walkable: your inventory stays up in the side panel, which is
     where the interface's own hint line tells you to right-click to sell */
  if (UI.tab !== 3) { UI.tab = 3; Frame.setSelectedTab(3); }
  renderTab();
  FullIface.show("shop", renderShop, { keepWorld: true });
}

function shopPrice(shop, s) { return s.price != null ? s.price : itemValue(s.id); }
function shopSellPrice(shop, id) { return Math.max(1, Math.floor(itemValue(id) * (shop.sellRate || 0.6))); }

/* The "Value" option - the first entry of the interface's own action list, and
   so the one a left-click lands on. */
function shopValue(where, index) {
  const shop = UI.shop;
  if (!shop) return;
  const s = where === "inv" ? UI.ps.inv[index] : shop.stock[index];
  if (!s || !s.qty) return;
  if (where === "inv") chat(shop.name + ": " + itemName(s.id) + " is worth " + shopSellPrice(shop, s.id) + " coins.", "game");
  else chat(shop.name + ": " + itemName(s.id) + " costs " + shopPrice(shop, s) + " coins.", "game");
}

/* Interface 300: the very same riveted window as the bank, with the shop's name
   across the top, the interface's own hint line along the bottom, and the stock
   as an 8x5 grid of 47x47 cells. Each cell wears its stock count in the corner,
   drawn the way the client draws an inventory amount - plain11, yellow, one
   dark pixel down and to the right. */
function renderShop(iface) {
  const shop = UI.shop;
  const win = mk("div", "bankWin");
  /* cache coordinates, verbatim - see the note in renderBank */
  place(win, SHOP_WIN.x, SHOP_WIN.y, SHOP_WIN.w, SHOP_WIN.h);
  iface.appendChild(win);
  const ox = -SHOP_WIN.x, oy = -SHOP_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  const text = (str, x, y, w, h, opt) => pxText(win, str, x + ox, y + oy, w, h, opt);
  const hit = (x, y, w, h, tip, fn) => pxHit(win, x + ox, y + oy, w, h, tip, fn);
  plateBacking(win);
  for (const [name, x, y] of SHOP_PARTS) at(name, x, y);
  if (!shop) {
    text("This shop is closed.", 18, 292, 476, 15, { font: "plain12", ...IFACE_TEXT_STYLE });
    return;
  }
  /* the cache's own two texts (interface 300): the title line, filled with this
     shop's name, and the buy/sell hint along the bottom (see SHOP_TEXTS) */
  for (const [str, x, y, w, h, font] of SHOP_TEXTS) {
    text(str === "Axe Shop" ? shop.name : str, x, y, w, h, { font, ...IFACE_TEXT_STYLE });
  }
  const closeSpr = at("closeButton", CLOSE_BTN.shop.x, CLOSE_BTN.shop.y);
  const closeHit = hit(CLOSE_BTN.shop.x, CLOSE_BTN.shop.y, CLOSE_BTN.shop.w, CLOSE_BTN.shop.h, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));
  const stockRows = Math.max(SHOP_GRID.rows, Math.ceil(shop.stock.length / SHOP_GRID.cols));
  const list = mk("div", "bankList");
  place(list, SHOP_GRID.x + ox, SHOP_GRID.y + oy, SHOP_GRID.cols * SHOP_GRID.stepX, SHOP_GRID.rows * SHOP_GRID.stepY);
  win.appendChild(list);
  const content = mk("div", "bankListInner");
  place(content, 0, 0, SHOP_GRID.cols * SHOP_GRID.stepX, stockRows * SHOP_GRID.stepY);
  list.appendChild(content);
  for (let i = 0; i < shop.stock.length; i++) {
    const s = shop.stock[i];
    if (!s || !s.qty) continue;
    const x = (i % SHOP_GRID.cols) * SHOP_GRID.stepX;
    const y = ((i / SHOP_GRID.cols) | 0) * SHOP_GRID.stepY;
    const d = mk("div", "slot shopSlot");
    place(d, x - 2, y - 2, 36, 36);
    const img = mk("img");
    img.src = itemIcon(s.id, 32, s.qty);
    img.draggable = false;
    d.appendChild(img);
    bindShopSlot(d, i, s);
    content.appendChild(d);
    if (s.qty !== 1) pxText(content, amountString(s.qty), x, y + 1, 46, 11, { font: "plain11", color: "#ffff00" });
  }
  /* A shop with more stock than the 8x5 window shows gets the client's own
     scrollbar down the right edge of the grid, drawn by the engine rather than
     a component of the interface (and so absent from interface 300's
     children). Same arithmetic and same four colours as the bank's. */
  const track = stockRows * SHOP_GRID.stepY - SHOP_GRID.rows * SHOP_GRID.stepY;
  if (track > 0) {
    const bar = mk("div", "bankBar");
    place(bar, SHOP_BAR.x + ox, SHOP_BAR.y + oy, SHOP_BAR.w, SHOP_BAR.h);
    win.appendChild(bar);
    const up = pxSprite(win, "scrollUp", SHOP_BAR.x + ox, SHOP_BAR.y + oy);
    const down = pxSprite(win, "scrollDown", SHOP_BAR.x + ox, SHOP_BAR.y + oy + SHOP_BAR.h - 16);
    up.classList.add("bankScrollUp");
    down.classList.add("bankScrollDown");
    pxRect(bar, 0, 16, SHOP_BAR.w, SHOP_BAR.h - 32, SCROLLBAR_COLORS.track, 0);
    const grip = pxGrip(bar, 0, 16, SHOP_BAR.w, 8);
    up.addEventListener("click", () => setShopScroll(shopScroll - SHOP_GRID.stepY));
    down.addEventListener("click", () => setShopScroll(shopScroll + SHOP_GRID.stepY));
    list.addEventListener("wheel", (e) => {
      e.preventDefault();
      setShopScroll(shopScroll + (e.deltaY > 0 ? SHOP_GRID.stepY : -SHOP_GRID.stepY));
    }, { passive: false });
    /* A click on an empty spot of the track jumps the grip straight there (the
       side panel's bar already works this way); a press on the grip itself just
       starts a drag, so the grip never jumps out from under the cursor. */
    bar.addEventListener("pointerdown", (e) => {
      const r = bar.getBoundingClientRect();
      const y = (e.clientY - r.top) / ((r.height / SHOP_BAR.h) || 1);
      const g0 = shopGrip();
      if (y < 16 + g0.offset || y > 16 + g0.offset + g0.length)
        setShopScroll(((y - 16) / Math.max(1, SHOP_BAR.h - 32)) * shopMaxScroll());
      shopBarDrag = { y: e.clientY, at: shopScroll };
      e.preventDefault();
    });
    bar.addEventListener("pointermove", (e) => {
      if (!shopBarDrag) return;
      const g = shopGrip();
      const span = Math.max(1, g.track - g.length);
      setShopScroll(shopBarDrag.at + ((e.clientY - shopBarDrag.y) / (Frame.scale || 1) / span) * shopMaxScroll());
    });
    const stop = () => { shopBarDrag = null; };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
    UI.shopEls = { content, grip, track: stockRows * SHOP_GRID.stepY };
  } else {
    UI.shopEls = null;
  }
  setShopScroll(shopScroll);
}

function bindShopSlot(d, i, s) {
  const shop = UI.shop;
  const def = itemDef(s.id) || { name: s.id, examine: "" };
  const base = ((SHOP_DEFAULTS.get(UI.shopKey) || [])[i] || {}).qty || s.qty;
  d.addEventListener("pointerenter", () => showHoverTip("<col=ffff00>Value</col> " + def.name));
  d.addEventListener("pointerleave", hideHoverTip);
  /* A tap IS the menu (mobile only): pressing and holding for it is needless
     friction on a shelf, so a touch tap opens the same rows a right-click
     would - Value still first - while a mouse click keeps valuing at once. */
  let lastPtr = null;
  d.addEventListener("pointerdown", (e) => { lastPtr = e.pointerType; }, true);
  d.addEventListener("click", (e) => {
    e.preventDefault();
    if (lastPtr === "touch") {
      if (performance.now() - (UI.longPressMenuAt || 0) < 1200) return;
      openShopMenu(e.clientX, e.clientY, def, base, i);
    } else shopValue("shop", i);
  });
  rightMenu(d, (e) => openShopMenu(e.clientX, e.clientY, def, base, i));
}

function openShopMenu(clientX, clientY, def, base, i) {
  openCtx(clientX, clientY, null, itemRows(def.name, [
    { label: "Value", fn: () => shopValue("shop", i) },
    { label: "Buy 1", fn: () => buyFromShop(i, 1) },
    { label: "Buy 5", fn: () => buyFromShop(i, 5) },
    { label: "Buy 10", fn: () => buyFromShop(i, 10) },
    ...(base > 50 ? [{ label: "Buy 50", fn: () => buyFromShop(i, 50) }] : []),
    ...(base > 100 ? [{ label: "Buy 100", fn: () => buyFromShop(i, 100) }] : []),
    ...(base > 500 ? [{ label: "Buy 500", fn: () => buyFromShop(i, 500) }] : []),
    { label: "Examine", fn: () => chat(def.examine, "game") },
  ]));
}

/* Thormac's enchantment counter: the same riveted window as the shop
   (interface 300's shell), with the tanner's large cells - every upgrade on
   one screen, icon + name + fee with cyan/red affordability, the held count
   riding the icon's corner. A click enchants the whole affordable batch
   through the caller's own pick. The spec carries a build() reading live
   inventory, so a pick refreshes the shelf in place. */
let thormacSpec = null;

export function openThormac(spec) {
  thormacSpec = spec;
  FullIface.show("thormac", renderThormac, { keepWorld: true });
}

export function refreshThormac() {
  if (FullIface.open === "thormac") FullIface.refresh();
}

function renderThormac(iface) {
  const spec = thormacSpec || { title: "", build: () => ({ rows: [], note: "" }) };
  const { rows, note } = spec.build() || { rows: [], note: "" };
  const win = mk("div", "bankWin");
  place(win, SHOP_WIN.x, SHOP_WIN.y, SHOP_WIN.w, SHOP_WIN.h);
  iface.appendChild(win);
  const ox = -SHOP_WIN.x, oy = -SHOP_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  const text = (str, x, y, w, h, opt) => pxText(win, str, x + ox, y + oy, w, h, opt);
  plateBacking(win);
  for (const [name, x, y] of SHOP_PARTS) at(name, x, y);
  text(spec.title, 19, 30, 474, 16, { font: "bold12", color: "#ff981f", align: 1 });
  const closeSpr = at("closeButton", CLOSE_BTN.shop.x, CLOSE_BTN.shop.y);
  const closeHit = pxHit(win, CLOSE_BTN.shop.x + ox, CLOSE_BTN.shop.y + oy, CLOSE_BTN.shop.w, CLOSE_BTN.shop.h, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));
  /* Tanner-style cells, not shop slots: every upgrade on one screen with a
     large icon, name + fee lines and cyan/red affordability, exactly like the
     tanGrid - so the title sits snug over a full window instead of floating
     over an empty one. */
  const grid = mk("div", "bankList thormacGrid");
  place(grid, CLIENT_LIST.x + ox, (note ? 34 : 48) + oy, CLIENT_LIST.w, 256);
  win.appendChild(grid);
  for (const r of rows) {
    const cell = mk("div", "tanCell " + (r.ok ? "ok" : "short"));
    const img = mk("img", "tanIcon");
    img.src = r.icon;
    img.draggable = false;
    img.alt = r.name;
    cell.appendChild(img);
    const cap = mk("div", "thormacCap");
    cap.appendChild(mk("div", "tanName", r.name));
    cap.appendChild(mk("div", "tanFee", r.fee));
    cell.appendChild(cap);
    if (r.have > 0) cell.appendChild(mk("div", "thormacHave", "x" + r.have));
    cell.addEventListener("pointerenter", () => showHoverTip("<col=ffff00>Enchant</col> " + r.fromName));
    cell.addEventListener("pointerleave", () => hideHoverTip());
    let lastPtr = null;
    cell.addEventListener("pointerdown", (e) => { lastPtr = e.pointerType; }, true);
    cell.addEventListener("click", (e) => {
      e.preventDefault();
      if (FullIface.open !== "thormac") return;
      if (lastPtr === "touch") {
        if (performance.now() - (UI.longPressMenuAt || 0) < 1200) return;
        openThormacCellMenu(e.clientX, e.clientY, r);
      } else r.pick();
    });
    rightMenu(cell, (e) => openThormacCellMenu(e.clientX, e.clientY, r));
    grid.appendChild(cell);
  }
  if (note) text(note, 19, 292, 474, 15, { font: "plain12", color: "#ffd97a", align: 1 });
}

function openThormacCellMenu(clientX, clientY, r) {
  openCtx(clientX, clientY, r.fromName, [
    { label: "Enchant 1", fn: () => r.pickN(1) },
    { label: "Enchant 5", fn: () => r.pickN(5) },
    { label: "Enchant 10", fn: () => r.pickN(10) },
    { label: "Enchant X", fn: () => openAmountPrompt("enchant", 0, { cb: (n) => r.pickN(Math.max(1, n || 1)) }) },
    { label: "Enchant All", fn: () => r.pick() },
    { label: "Cancel", fn: () => {} },
  ]);
}
/* The tanner's counter: Thormac's riveted shell (the shop's window) with the
   tanning list's own cells - one per conversion, the large icon stacked over
   its name + fee, the whole stack centred in the cell. Red without the hide,
   cyan with the hide but short on coins, green when the batch can go. A click
   tans the whole affordable batch; the right-click menu offers Tan 1 / 5 /
   10 / X / All. The spec carries a build() reading live inventory, so a tan
   refreshes the shelf in place. */
let tanCounterSpec = null;

export function openTanCounter(spec) {
  tanCounterSpec = spec;
  FullIface.show("tan", renderTanCounter, { keepWorld: true });
}

export function refreshTanCounter() {
  if (FullIface.open === "tan") FullIface.refresh();
}

function renderTanCounter(iface) {
  const spec = tanCounterSpec || { title: "", build: () => ({ rows: [] }) };
  const { rows } = spec.build() || { rows: [] };
  const win = mk("div", "bankWin");
  place(win, SHOP_WIN.x, SHOP_WIN.y, SHOP_WIN.w, SHOP_WIN.h);
  iface.appendChild(win);
  const ox = -SHOP_WIN.x, oy = -SHOP_WIN.y;
  const at = (name, x, y) => pxSprite(win, name, x + ox, y + oy);
  const text = (str, x, y, w, h, opt) => pxText(win, str, x + ox, y + oy, w, h, opt);
  plateBacking(win);
  for (const [name, x, y] of SHOP_PARTS) at(name, x, y);
  text(spec.title, 19, 30, 474, 16, { font: "bold12", color: "#ff981f", align: 1 });
  const closeSpr = at("closeButton", CLOSE_BTN.shop.x, CLOSE_BTN.shop.y);
  const closeHit = pxHit(win, CLOSE_BTN.shop.x + ox, CLOSE_BTN.shop.y + oy, CLOSE_BTN.shop.w, CLOSE_BTN.shop.h, "Close", () => FullIface.hide());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));
  const grid = mk("div", "bankList tanCounterGrid");
  place(grid, CLIENT_LIST.x + ox, 48 + oy, CLIENT_LIST.w, 256);
  win.appendChild(grid);
  for (const r of rows) {
    const cell = mk("div", "tanCell " + (r.state || "short"));
    const img = mk("img", "tanIcon");
    img.src = r.icon;
    img.draggable = false;
    img.alt = r.name;
    cell.appendChild(img);
    const cap = mk("div", "tanCounterCap");
    cap.appendChild(mk("div", "tanName", r.name));
    cap.appendChild(mk("div", "tanFee", r.fee));
    cell.appendChild(cap);
    cell.addEventListener("pointerenter", () => showHoverTip(r.tip));
    cell.addEventListener("pointerleave", () => hideHoverTip());
    let lastPtr = null;
    cell.addEventListener("pointerdown", (e) => { lastPtr = e.pointerType; }, true);
    cell.addEventListener("click", (e) => {
      e.preventDefault();
      if (FullIface.open !== "tan") return;
      if (lastPtr === "touch") {
        if (performance.now() - (UI.longPressMenuAt || 0) < 1200) return;
        openTanCellMenu(e.clientX, e.clientY, r);
      } else r.pick();
    });
    rightMenu(cell, (e) => openTanCellMenu(e.clientX, e.clientY, r));
    grid.appendChild(cell);
  }
}

function openTanCellMenu(clientX, clientY, r) {
  openCtx(clientX, clientY, r.fromName, [
    { label: "Tan 1", fn: () => r.pickN(1) },
    { label: "Tan 5", fn: () => r.pickN(5) },
    { label: "Tan 10", fn: () => r.pickN(10) },
    { label: "Tan X", fn: () => openAmountPrompt("tan", 0, { cb: (n) => r.pickN(Math.max(1, n || 1)) }) },
    { label: "Tan All", fn: () => r.pick() },
    { label: "Cancel", fn: () => {} },
  ]);
}

function buyFromShop(index, qty) {  const shop = UI.shop;
  if (!shop) return;
  const stock = shop.stock[index];
  if (!stock || !stock.qty) return;
  /* A row may refuse before anything is paid for: the capes of accomplishment
     are gated on the level the player has in that skill, and the rule lives
     with the shop's other content (src/actions.js#skillcapeCanBuy) rather than
     here. A check that is absent, or that answers anything but `false`, lets
     the row through - which is every other shelf in the world. */
  if (UI.actions.shopBuyCheck && UI.actions.shopBuyCheck(stock, qty) === false) return;
  if (UI.actions.shopBuy) return UI.actions.shopBuy(shop, stock, qty, stock.price != null ? stock.price : itemValue(stock.id));
  const ps = UI.ps;
  const price = stock.price != null ? stock.price : itemValue(stock.id);
  /* Buying more than fits buys what fits: a Buy-50 click with twenty free
     slots takes twenty (and charges for twenty), and only a pack with no room
     at all is refused - the live game's own rule. */
  let n = Math.min(qty, stock.qty);
  if (!isStackable(stock.id)) n = Math.min(n, invFree(ps));
  else if (invCount(ps, stock.id) === 0 && invFree(ps) < 1) n = 0;
  if (n <= 0) { chat("You don't have enough inventory space.", "warn"); return; }
  const cost = n * price;
  if (invCount(ps, "coins") < cost) { chat("You don't have enough coins.", "warn"); return; }
  invRemove(ps, "coins", cost);
  const got = invAdd(ps, stock.id, n);
  stock.qty -= got;
  chat("You buy " + got + " x " + itemName(stock.id) + " for " + cost + " coins.", "game");
  /* ...and the shelf is the world's now (src/ui.js#reportShopStock) */
  if (UI.shopKey) reportShopStock(UI.shopKey, stock.id, stock.qty);
  /* A purchase may carry something with it: a cape of accomplishment comes with
     its hood (src/actions.js#skillcapeBought). */
  if (UI.actions.shopBought) UI.actions.shopBought(stock, got);
  mark("inv");
  FullIface.refresh();
}

function sellToShop(index, qty) {
  const shop = UI.shop;
  if (!shop) return;
  const ps = UI.ps;
  const s = ps.inv[index];
  if (!s) return;
  if (UI.actions.shopSell) return UI.actions.shopSell(shop, index, qty);
  if (s.note) return;
  const id = s.id;
  const price = shopSellPrice(shop, id);
  /* Sell 5 means five of that item, and a non-stackable item sits in the bag as
     a run of single-item slots - so the client walks the whole inventory, not
     just the slot you clicked. */
  const have = invCount(ps, id);
  const n = qty === 0 ? have : Math.min(have, qty);
  if (n <= 0) return;
  let left = n;
  for (let i = 0; i < ps.inv.length && left > 0; i++) {
    const st = ps.inv[i];
    if (!st || st.id !== id || st.note) continue;
    const take = Math.min(st.qty, left);
    left -= take;
    invRemoveAt(ps, i, take);
  }
  /* the shop keeps what it buys: it tops up a stack it already has, or takes a
     free cell in its 8x5 stock grid */
  const had = shop.stock.find(st => st && st.id === id);
  let shelfQty = n;
  if (had) { had.qty += n; shelfQty = had.qty; }
  else {
    /* The shop keeps what it buys: it takes an empty cell of its stock grid, or
       - when the counter is already full, as the armoury's now is - grows one.
       Nothing sold is hidden any more: the stock list scrolls (see renderShop).
       Fifteen rows is the ceiling, past which the shop is not buying. */
    const free = shop.stock.findIndex(st => !st || !st.qty);
    const room = free >= 0 ? free : shop.stock.length;
    if (room < SHOP_GRID.cols * 15) shop.stock[room] = { id, qty: n, price: itemValue(id) };
  }
  /* The buyer's own shelf report: the row's new absolute count, whether that
     topped up a stack the shop kept or opened a fresh cell for it. */
  if (UI.shopKey) reportShopStock(UI.shopKey, id, shelfQty);
  invAdd(ps, "coins", price * n);
  chat("You sell " + n + " x " + itemName(id) + " for " + price * n + " coins.", "game");
  mark("inv");
  FullIface.refresh();
}

/* ------------------------------------------------------------ smithing modal */

/* The item chooser a furnace/hammer gives you. A small centred parchment box,
   the way the client draws its "what would you like to make?" lists. */
export function openModal(title, buildBody, actions, opts) {
  const layer = UI.els.modalLayer;
  const box = UI.els.modalBox;
  /* `opts.onClose` fires once, whenever the box goes away - the Close button,
     a click on the dim layer, or Escape. The one-off notices chain themselves
     through it (src/ui.js#maybeShowCommands) so they can never take over the
     layer from each other. */
  UI.modalOnClose = (opts && opts.onClose) || null;
  /* `opts.boxClass` lands beside `modalbox` on the box itself, for a box that
     wants a width of its own (the commands list is wider than the smithing
     chooser so its descriptions stay on one line). */
  box.className = "modalbox" + (opts && opts.boxClass ? " " + opts.boxClass : "");
  box.innerHTML = "";
  const head = mk("div", "cHead", title);
  box.appendChild(head);
  const b = mk("div", "modalBody");
  if (buildBody) buildBody(b, box);
  box.appendChild(b);
  const foot = mk("div", "modalActions");
  for (const a of actions || []) {
    const btn = mk("button", "rs-btn", a.label);
    if (a.disabled) btn.disabled = true;
    btn.addEventListener("click", () => a.fn());
    foot.appendChild(btn);
  }
  const close = mk("button", "rs-btn", "Close");
  close.addEventListener("click", closeModal);
  foot.appendChild(close);
  box.appendChild(foot);
  layer.hidden = false;
  if (Frame && Frame.root) Frame.root.classList.add("modalup");
}

export function closeModal() {
  UI.els.modalLayer.hidden = true;
  if (Frame && Frame.root) Frame.root.classList.remove("modalup");
  UI.els.modalBox.innerHTML = "";
  const fn = UI.modalOnClose;
  UI.modalOnClose = null;
  if (fn) fn();
}

/* ------------------------------------------------------- context menu + tips */

let lastRightDownAt = 0;
let lastCtxPickAt = 0;
export function rightMenu(el, fn) {
  let holdTimer = 0;
  let holdXY = null;
  const clearHold = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    holdXY = null;
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && e.button === 0) {
      clearHold();
      const sx = e.clientX, sy = e.clientY;
      holdXY = { x: sx, y: sy };
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        holdXY = null;
        UI.longPressMenuAt = performance.now();
        fn({ clientX: sx, clientY: sy });
      }, 400);
      return;
    }
    if (e.button !== 2) return;
    lastRightDownAt = performance.now();
    fn(e);
  });
  el.addEventListener("pointermove", (e) => {
    if (holdXY && Math.abs(e.clientX - holdXY.x) + Math.abs(e.clientY - holdXY.y) > 10) clearHold();
  });
  el.addEventListener("pointerup", clearHold);
  el.addEventListener("pointercancel", clearHold);
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const now = performance.now();
    if (lastCtxPickAt > lastRightDownAt) { lastRightDownAt = now; return; }
    if (now - lastRightDownAt < 1200) return;
    lastRightDownAt = now;
    fn(e);
  });
}

export function openCtx(clientX, clientY, title, options) {  const c = UI.els.ctxMenu;
  UI.ctxAnchor = { x: clientX, y: clientY };
  if (UI.ctxHideTimer) { clearTimeout(UI.ctxHideTimer); UI.ctxHideTimer = null; }
  c.innerHTML = "";
  /* The client's drawMenu() always paints the black title bar with "Choose
     Option" in it - it is part of the menu, not an optional caption. (A menu
     with no title used to leave the bar's 19px of brown sitting there empty.) */
  c.appendChild(tipLine(tagMarkup(title || "Choose Option"), "cHead"));
  for (const o of options || []) {
    const mi = mk("div", "mi" + (o.disabled ? " disabled" : ""));
    /* A label may carry the client's colour tags (see `tagMarkup`): the whole
       row is painted by the same routine as the hover line, so a tagged name
       renders in its kind's colour and an untagged label is one plain run. */
    tipLine(tagMarkup(o.label), null, mi);
    if (!o.disabled) {
      let picked = false;
      const pick = (e) => {
        if (picked) return;
        picked = true;
        lastCtxPickAt = performance.now();
        e.stopPropagation();
        e.preventDefault();
        hideCtx();
        if (UI.dismissLevelUp) UI.dismissLevelUp();
        /* A picked menu row is a click like any other: with an item in the
           hand, anything but the Use row itself deselects first (the user's
           rule, 2026-10-07 - the mode is never sticky). The Use row carries
           keepUse, so aiming survives the menu. */
        if (UI.useItem && !o.keepUse) cancelUse();
        /* Any picked action ends a chatbox conversation - chopping, reading,
           attacking, banking, anything: a left click already tears the box down
           through onMoveCommand, and a right-click row must do the same. */
        closeChatDialog();
        o.fn(e);
      };
      mi.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; pick(e); });
      mi.addEventListener("click", (e) => { pick(e); });
    }
    c.appendChild(mi);
  }
  /* `menuWidth = widest text + 8`, measured the client's way: the sum of the
     bold font's own glyph advances, over the title and every option. The menu
     font here IS the cache's bold12, so the browser's measurer gives exactly the
     client's numbers (checked character for character). */
  let textW = menuTextWidth("Choose Option");
  for (const o of options || []) textW = Math.max(textW, menuTextWidth(stripTags(o.label)));
  c.style.width = (textW + 8) + "px";
  c.hidden = false;
  const p = Frame.toFrame(clientX, clientY);
  const w = c.offsetWidth;
  const h = c.offsetHeight;
  /* The client's processMenuHovering(): the menu belongs to whichever of the
     three screen areas the click landed in, and is centred on the cursor and
     clamped inside *that* area - not the whole frame. So a menu opened on a
     low inventory slot stays inside the side panel, and one opened on a bank
     slot stays inside the game view, exactly where the client puts them.

     In the client the offsets it stores are area-local and the area's origin is
     added back at draw time, and because the viewport's "-4" is the viewport's
     own origin this collapses to one clean rule for every area:

        left = clamp(area.left,  area.right  - width,  clickX - width/2)
        top  = clamp(area.top,   area.bottom - height, clickY)

     i.e. centred horizontally on the cursor with the cursor on the top edge,
     then slid inside the area. A click on the frame chrome (the minimap, the
     tabs, the orb row) falls into the frame-wide box, so its menu still shows
     at the cursor instead of snapping across the screen. */
  const AREAS = [
    /* [0] game view   - (4,4), 512x334 */
    { x0: 4, y0: 4, w: 512, h: 334, in: p.x > 4 && p.y > 4 && p.x < 516 && p.y < 338 },
    /* [1] side panel  - (553,205), 190x261 */
    { x0: 553, y0: 205, w: 190, h: 261, in: p.x > 553 && p.y > 205 && p.x < 743 && p.y < 466 },
    /* [2] chatbox     - (17,357), 479x96 */
    { x0: 17, y0: 357, w: 479, h: 96, in: p.x > 17 && p.y > 357 && p.x < 496 && p.y < 453 },
    /* the chrome: a frame-wide box inset 2px, as it always was */
    { x0: 2, y0: 2, w: FRAME_W - 4, h: FRAME_H - 4, in: true },
  ];
  const a = AREAS.find((cand) => cand.in);
  /* Java truncates the width/2 division toward zero; w is positive, so floor
     matches it exactly. */
  const left = Math.max(a.x0, Math.min(a.x0 + a.w - w, p.x - Math.floor(w / 2)));
  const top = Math.max(a.y0, Math.min(a.y0 + a.h - h, p.y));
  c.style.left = left + "px";
  c.style.top = top + "px";
}

export function hideCtx() {
  if (UI.ctxHideTimer) { clearTimeout(UI.ctxHideTimer); UI.ctxHideTimer = null; }
  UI.els.ctxMenu.hidden = true;
}

/* The width of `str` in the menu's own bold12, glyph advance by glyph advance.
   `document.fonts` has resolved long before a menu can be opened (the frame's
   pixel text is drawn with the same font), so the measurer can't fall back to a
   substitute and report the wrong width. */
let _menuMeasure = null;
/* The client's menu strings are tagged rather than plain: it builds every option
   as `actions[i] + " @cya@" + name` (scenery), `" @yel@"` (a creature) or
   `" @lre@"` (an item) - see `317_Client.java#buildAtObject` and its entity and
   item twins - and its string renderer turns the tag into the colour for the
   rest of the line. `tagMarkup` rewrites those tags into the `<col=rrggbb>`
   markup `tipLine` already paints, and `stripTags` gives the width measurer the
   text without them (a tag is three letters, not three glyphs of the label).
   The colour table is the client's own: lre is "light red", not red. */
const TAG_COLOURS = {
  red: "ff0000", gre: "00ff00", blu: "0000ff", yel: "ffff00", cya: "00ffff",
  mag: "ff00ff", whi: "ffffff", bla: "000000", lre: "ff9040",
  dre: "800000", dbl: "000080", or1: "ffb000", or2: "ff7000", or3: "ff3000",
  gr1: "c0ff00", gr2: "80ff00", gr3: "40ff00",
};
function tagMarkup(s) {
  return String(s).replace(/@([a-z][a-z0-9]{2})@/g, (m, t) => (TAG_COLOURS[t] ? "<col=" + TAG_COLOURS[t] + ">" : m));
}
function stripTags(s) {
  return String(s).replace(/@[a-z][a-z0-9]{2}@/g, "");
}

/* The client builds a **carried/stocked item's** menu from the item's own
   action list exactly the way it builds a scene object's: each row is
   `actions[i] + " @lre@" + itemName`, and the black title bar keeps its
   hardcoded "Choose Option" - the item's name is *in* every row rather than
   above them (317_Client.java#buildMenuForItem). The counts stay inside the
   verb ("Withdraw 5 @lre@Coins"), since the client's numeric verbs are single
   action strings, so only the name is tagged. Tagging here rather than at each
   call site keeps the bank, shop, trade and inventory menus on one rule. */
export function itemRows(name, opts) {
  return (opts || []).map((o) => ({ ...o, label: o.label + " @lre@" + name }));
}

function menuTextWidth(str) {
  if (!_menuMeasure) {
    _menuMeasure = document.createElement("canvas").getContext("2d");
    _menuMeasure.font = '12px "rs-bold12", monospace';
  }
  return Math.ceil(_menuMeasure.measureText(str).width);
}

/* The hover text sits at a fixed spot near the top-left of the game screen,
   exactly where the client draws it - it does not follow the mouse. */
function tipLine(markup, cls, into) {
  const div = into || mk("div", cls);
  const re = /<col=([0-9a-fA-F]{6})>|<\/col>/g;
  let color = null;
  let last = 0;
  let m;
  const add = (s) => {
    if (!s) return;
    if (color) {
      const sp = document.createElement("span");
      sp.style.color = color;
      sp.textContent = s;
      div.appendChild(sp);
    } else {
      div.appendChild(document.createTextNode(s));
    }
  };
  while ((m = re.exec(markup))) {
    add(markup.slice(last, m.index));
    /* the client's markup is `<col=rrggbb>` and the colour runs to the end of
       the line; an explicit closing tag is accepted and dropped */
    color = m[1] ? "#" + m[1] : null;
    last = m.index + m[0].length;
  }
  add(markup.slice(last));
  return div;
}

export function showHoverTip(text, owner = "ui") {
  const t = UI.els.hoverTip;
  if (UI.hoverOwner !== owner) { t.hidden = true; UI.hoverOwner = owner; }
  if (t._text === text && !t.hidden) return;
  t._text = text;
  t.innerHTML = "";
  const parts = String(text).replace(/<br\s*\/?>/gi, "\n").split("\n");
  t.appendChild(tipLine(parts[0], "tipMain"));
  for (let i = 1; i < parts.length; i++) t.appendChild(tipLine(parts[i], "sub"));
  t.hidden = false;
}

export function hideHoverTip(owner) {
  /* the world hover (see updateWorldHover) and the interface hovers share the
     one tip element, so a hide request only lands if it owns the tip */
  if (owner !== undefined && owner !== UI.hoverOwner) return;
  UI.hoverOwner = null;
  UI.els.hoverTip._text = null;
  UI.els.hoverTip.hidden = true;
}

/* Kept for callers that used to position the tip under the cursor. */
export function positionHoverTip() { /* the tip is fixed */ }

/* ------------------------------------------------------------------- minimap */

const MAP_PX = 4;
/* The client's own cut-off for a minimap entity dot: `method141` returns early
   once the dot is more than 80 px from the map centre. At this map's 4 px per
   tile that is 20 tiles, and it is what makes the marker table's "nearby
   items, players, monsters and NPCs" literal. */
const NPC_DOT_R2 = 80 * 80;
/* The map turns with the camera (see drawMinimap), so the blit has to come from
   a source square big enough to cover the map window at *any* angle: as wide as
   the window's own diagonal, which at 172x156 is 232.2 px. Rounded up to an even
   number so half of it is a whole pixel and the yaw-0 map is still a 1:1 blit
   with no half-pixel smear. */
const MAP_DIAG = 2 * Math.ceil(Math.hypot(MAP.w, MAP.h) / 2);
const MAP_HALF = MAP_DIAG / 2;

export function initMinimap() {
  UI.mapBase = buildMapBase(0);
  UI.mapBaseUp = null;
  UI.mapPlane = 0;
}

/* One level's minimap terrain, baked once: plane 0 is the ground the world
   walks on (terrain + walls/doors/trees/rocks/fences), anything else is the
   upper floor - black everywhere except the upstairs rooms' wooden boards and
   their own walls and doors (src/world.js#upstairs, #upObjs). The client draws
   one level at a time too: the map is a picture of the floor you are standing
   on, not an x-ray of the ones above and below it. */
function buildMapBase(plane) {
  const world = UI.world;
  const cv = document.createElement("canvas");
  cv.width = world.w * MAP_PX;
  cv.height = world.h * MAP_PX;
  const c = cv.getContext("2d");
  c.fillStyle = "#000";
  c.fillRect(0, 0, cv.width, cv.height);
  if (plane !== 0) {
    const up = world.upstairs;
    if (up) {
      c.fillStyle = "#8a6236";
      c.fillRect((up.x0 + 1) * MAP_PX, (up.z0 + 1) * MAP_PX,
        Math.max(0, up.x1 - up.x0 - 1) * MAP_PX, Math.max(0, up.z1 - up.z0 - 1) * MAP_PX);
    }
    if (world.upObjs) {
      for (const [key, o] of world.upObjs) {
        if (!o) continue;
        const x = key % world.w;
        const z = Math.floor(key / world.w);
        let col = null;
        if (o.t === "wall" || o.t === "door") col = "#4b3f30";
        if (!col) continue;
        c.fillStyle = col;
        c.fillRect(x * MAP_PX, z * MAP_PX, MAP_PX, MAP_PX);
      }
    }
    return cv;
  }
  for (let z = 0; z < world.h; z++) {
    for (let x = 0; x < world.w; x++) {
      let col;
      if (world.isWaterTile(x, z)) col = 0x3f6f9f;
      else col = TILE_COLORS[world.tileAt(x, z)] != null ? TILE_COLORS[world.tileAt(x, z)] : 0x6f9f4a;
      c.fillStyle = colour(col);
      c.fillRect(x * MAP_PX, z * MAP_PX, MAP_PX, MAP_PX);
    }
  }
  for (const [key, o] of world.objs) {
    const x = key % world.w;
    const z = Math.floor(key / world.w);
    let col = null;
    if (o.t === "wall" || o.t === "door") col = "#4b3f30";
    else if (o.t === "tree") col = "rgba(30,66,24,0.6)";
    else if (o.t === "rock") col = "rgba(122,120,112,0.55)";
    else if (o.t === "fence") col = "rgba(112,90,56,0.6)";
    if (!col) continue;
    c.fillStyle = col;
    c.fillRect(x * MAP_PX, z * MAP_PX, MAP_PX, MAP_PX);
  }
  return cv;
}

function colour(n) {
  return "#" + (n >>> 0).toString(16).padStart(6, "0");
}

/* One shared pair for `drawMinimap`'s `toScreen` - see the note there. */
const _mapScratch = [0, 0];

export function drawMinimap() {
  const cv = UI.els.minimap;
  if (!cv || !UI.mapBase) return;
  /* the 2d context is grabbed once, not per frame - a map that redraws every
     frame cannot afford a getContext() round-trip each time */
  const ctx = UI.mapCtx || (UI.mapCtx = cv.getContext("2d"));
  const p = G.player;
  /* The map is a picture of the floor you are standing on: climbing the
     shop stairs swaps the ground's terrain for the upstairs boards (see
     buildMapBase), built lazily once and kept beside the ground one. */
  const eyePlane = (p.plane | 0) !== 0 ? 1 : 0;
  if (eyePlane !== (UI.mapPlane | 0)) {
    if (eyePlane !== 0 && !UI.mapBaseUp) UI.mapBaseUp = buildMapBase(1);
    UI.mapPlane = eyePlane;
  }
  const base = (eyePlane !== 0 && UI.mapBaseUp) || UI.mapBase;
  /* centre on where the character is *rendered* this frame, not on the last
     completed tile, so the map scrolls smoothly between ticks */
  const ppx = p.rx == null ? p.x : p.rx;
  const ppz = p.rz == null ? p.z : p.rz;
  const sx = ppx * MAP_PX - MAP.cx;
  const sz = ppz * MAP_PX - MAP.cy;

  /* **The map turns with the camera** (the user's request): its up is the
     direction the camera is looking, so the world ahead of you is always at the
     top of the map. `View.setCamera` measures yaw so the camera's facing
     direction is `(-sin yaw, -cos yaw)` in world (x, z); in map pixels - +x
     right, +z down - that is the vector `(-sin yaw, -cos yaw)`, and a canvas
     rotation of `+yaw` about the map centre carries it to straight up. */
  const yaw = G.yaw || 0;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);

  ctx.clearRect(0, 0, MAP.w, MAP.h);
  ctx.imageSmoothingEnabled = false;
  /* Only the terrain is drawn *rotated*. The markers below are placed through
     `toScreen` - which turns their offset by the same yaw - and then blitted
     upright, so their little sprites stay pixel-crisp instead of being resampled
     at an angle. The rotated blit reads from a MAP_DIAG square centred on the
     map's centre rather than from the window itself, so no corner of the turned
     window can ever show cleared canvas. */
  ctx.save();
  ctx.translate(MAP.cx, MAP.cy);
  ctx.rotate(yaw);
  ctx.translate(-MAP.cx, -MAP.cy);
  ctx.drawImage(base,
    Math.round(ppx * MAP_PX - MAP_HALF), Math.round(ppz * MAP_PX - MAP_HALF), MAP_DIAG, MAP_DIAG,
    MAP.cx - MAP_HALF, MAP.cy - MAP_HALF, MAP_DIAG, MAP_DIAG);
  ctx.restore();

  /* world tile -> where it is drawn on the *turned* map: the offset from the map
     centre, rotated by +yaw, plus the centre. The answer goes into one shared
     two-element array - the map redraws every frame and asks this for every
     creature in the world (~240 of them, most of them then dropped by the
     range test below), and every caller reads the pair out before asking
     again, so a fresh array each time was pure garbage. */
  const toScreen = (wx, wz) => {
    const ox = wx * MAP_PX - sx - MAP.cx;
    const oz = wz * MAP_PX - sz - MAP.cy;
    _mapScratch[0] = MAP.cx + ox * cs - oz * sn;
    _mapScratch[1] = MAP.cy + ox * sn + oz * cs;
    return _mapScratch;
  };

  /* The buildings' map badges (the bank and every shop - see MAP_BADGES in
     src/world.js). The client draws these 1:1 over the map, under the player's
     own marker. */
  const icons = UI.world && UI.world.mapIcons;
  if (icons) {
    const placed = [];
    const tryOffsets = [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16], [16, 16], [-16, 16], [16, -16], [-16, -16]];
    for (const m of icons) {
      const [ix, iy] = toScreen(m.x + 0.5, m.z + 0.5);
      const q = Frame.parts[m.part];
      if (!q) continue;
      const bx = Math.round(ix - q.w / 2), by = Math.round(iy - q.h / 2);
      let px = bx, py = by;
      for (const [ox, oy] of tryOffsets) {
        const cx = bx + ox, cy = by + oy;
        if (!placed.some(p => Math.abs(p[0] - cx) < 14 && Math.abs(p[1] - cy) < 14)) {
          px = cx;
          py = cy;
          break;
        }
      }
      placed.push([px, py]);
      Frame.drawSprite(ctx, m.part, px, py);
    }
  }

  /* Every creature in range gets the client's own yellow dot marker. The
     client's minimap routine (`method126`, and the dot blitter `method141` it
     calls) walks its NPC array and blits `mapdots` frame 1 - the yellow one -
     over the map for each NPC whose definition passes `aBoolean87 &&
     aBoolean84` - the two flags the client tests, both `true` unless the cache
     clears them (NPC config opcodes 93 and 107; `Class5`'s constructor starts
     both `true`, and our baked roster carries neither, so every NPC here is
     marked). `mapdots` frames 0-4 are one 4x5 shape in five
     colours: red = a ground item, yellow = an NPC, white = another player,
     green = a friend, blue = a team-mate. Our atlas carries that same family
     as markerRedItem2 / markerYellowNpc / markerWhitePlayer / markerGreenFriend
     / markerBlueTeam (510-514), so this is the client's own art rather than a
     mark of our own invention - the client's marker table says it plainly
     enough: "A yellow dot indicates a Non-player character".
     Two rules come straight out of `method141`:
       - the sprite is centred on the creature's pixel, exactly as the
         player's own marker below is (`- w/2`, `- h/2`);
       - nothing is drawn beyond 80 px of the map centre (`if(l > 6400)
         return;`), which is 20 tiles at this map's 4 px per tile - so a
         creature away across the world simply has no dot instead of one
         pinned to the rim. That radius is a touch wider than the map's own
         71 px window, so the outermost dots are clipped by the round mask
         rather than culled, which is what the client's own clip does too.
     Corpses are not marked - the body is gone until it respawns. */
  for (const n of G.npcs) {
    if (n.dead) continue;
    /* Dots mark the level you are on, like the map itself: no creature has a
       plane of its own yet, but the rule is written once so the first one
       that does is already correct. */
    if ((n.plane | 0) !== eyePlane) continue;
    /* the render origin, like the player's own marker: the dot slides with
       the creature between ticks instead of jumping a whole tile at each
       600 ms step */
    const nx = n.rx == null ? n.x : n.rx;
    const nz = n.rz == null ? n.z : n.rz;
    const [dx, dy] = toScreen(nx, nz);
    const ox = dx - MAP.cx, oy = dy - MAP.cy;
    if (ox * ox + oy * oy > NPC_DOT_R2) continue;
    Frame.drawSprite(ctx, "markerYellowNpc", Math.round(dx) - 2, Math.round(dy) - 3);
  }

  /* The ground items, marked with the same `mapdots` family: frame 0 is the red
     one and it means "an item is lying here" - the same sprite the yellow NPC
     dots above are two frames of. Same 80px rule, same centring, so a drop is
     found the way the client's own player finds one: look at the map. The list
     is `Actions.ground` through the usual wiring point (src/actions.js#
     initActions sets `UI.actions.groundItems`), not an import, because
     src/actions.js is what already imports this file.

     A stack of hats on one tile is one dot, which is the right answer - the dot
     marks the *tile*, and the ground list holds one record per spawn whatever
     its quantity. Falling hats are in that list from the moment they spawn, so
     a shower shows on the map while it is still in the air. */
  const ground = (eyePlane !== 0 || !UI.actions.groundItems) ? [] : (UI.actions.groundItems() || []);
  for (const g of ground) {
    const [dx, dy] = toScreen(g.x + 0.5, g.z + 0.5);
    const ox = dx - MAP.cx, oy = dy - MAP.cy;
    if (ox * ox + oy * oy > NPC_DOT_R2) continue;
    Frame.drawSprite(ctx, "markerRedItem2", Math.round(dx) - 2, Math.round(dy) - 3);
  }

  /* Other players: the client's own white dot for everyone else in the world
     (`mapdots` frame 2, the same sprite and the same 80px rule as the yellow
     NPC dots above). The ghosts are real people - src/net.js keeps them in
     3x3-chunk neighbourhoods - so a shared world can be read off the map. */
  for (const g of G.ghosts.values()) {
    /* Same-level only: an upstairs player has no dot on the ground-floor map,
       and the ground crowd leaves no dots on the upstairs one. */
    if ((g.plane | 0) !== eyePlane) continue;
    const gx = g.rx == null ? g.x : g.rx;
    const gz = g.rz == null ? g.z : g.rz;
    const [dx, dy] = toScreen(gx, gz);
    const ox = dx - MAP.cx, oy = dy - MAP.cy;
    if (ox * ox + oy * oy > NPC_DOT_R2) continue;
    Frame.drawSprite(ctx, "markerWhitePlayer", Math.round(dx) - 2, Math.round(dy) - 3);
  }

  /* The player: our own dot, one pixel larger than the mapdots family so it is
     unmistakable in a crowd. The client fills a 3x3 white square at the map
     centre here (`method336(3, 78, 97, 0xffffff, 3, 0)`), and this project used
     to blit the *another player* mapdots frame over it, which read as a plain
     white square (user report). The dot is the player-facing fix - see
     src/pixelart.js#PLAYER_DOT. */
  const [px, py] = toScreen(ppx, ppz);
  drawPixels(ctx, "playerDot", Math.round(px) - 3, Math.round(py) - 3);

  /* the destination flag, clamped inside the map */
  const dest = G.view && G.view.dest;
  if (dest) {
    const raw = toScreen(dest.x + 0.5, dest.z + 0.5);
    const fx = Math.max(2, Math.min(MAP.w - 8, raw[0]));
    const fy = Math.max(10, Math.min(MAP.h - 2, raw[1]));
    drawFlag(ctx, fx, fy);
  }
}

/* The walk-destination marker: the client's own MAP_FLAG sprite. */
function drawFlag(ctx, x, y) {
  const q = Frame.parts.mapFlag;
  Frame.drawSprite(ctx, "mapFlag", Math.round(x) - q.w, Math.round(y) - q.h);
}

export function drawCompass() {
  const cv = UI.els.compass;
  if (!cv) return;
  /* grabbed once, as the minimap's own context is - the compass only redraws
     when the yaw actually moves, but a getContext() round-trip per call is
     still an avoidable cost for a line that is drawn on a turn */
  const ctx = UI.compassCtx || (UI.compassCtx = cv.getContext("2d"));
  const r = cv.width / 2;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.translate(r, r);
  /* The needle turns with the *map*, not against it: drawMinimap blits the
     terrain through `rotate(+yaw)`, which is what carries north to
     `(sin yaw, -cos yaw)` on screen - so the compass, whose sprite's needle
     points north at rest, takes the same `+yaw`. It was `-yaw` (the mirror),
     which is why the needle swung the wrong way as the camera turned. */
  ctx.rotate(G.yaw || 0);
  const s = 33;
  Frame.drawSprite(ctx, "compass", -s / 2, -s / 2, s, s);
  ctx.restore();
}

function resetCameraNorth() {
  const target = 0;
  G.yaw = 0;
  if (G.view && G.view.setYaw) G.view.setYaw(target);
  drawCompass();
}

function minimapClick(clientX, clientY, ev) {
  const cv = UI.els.minimap;
  const r = cv.getBoundingClientRect();
  const px = (clientX - r.left) / (r.width || MAP.w);
  const py = (clientY - r.top) / (r.height || MAP.h);
  const p = G.player;
  /* The map is drawn turned by the camera's yaw (see drawMinimap), so a click on
     it has to be turned *back* - R(-yaw) about the map's centre, the inverse of
     the rotation in the blit - before it can be read as a world offset. Without
     this the tile you walk to drifts round as soon as the camera leaves north.
     The origin is the *rendered* position, the same one drawMinimap centres the
     map on: reading `p.x` here while the map centres on `p.rx` would put the
     target a tile off for as long as the character is mid-step. */
  const ox0 = p.rx == null ? p.x : p.rx;
  const oz0 = p.rz == null ? p.z : p.rz;
  const yaw = G.yaw || 0;
  const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
  const ox = px * MAP.w - MAP.cx, oy = py * MAP.h - MAP.cy;
  const ux = ox * cs - oy * sn, uy = ox * sn + oy * cs;
  const tx = Math.floor(ox0 + ux / MAP_PX);
  const tz = Math.floor(oz0 + uy / MAP_PX);
  if (!UI.world.inBounds(tx, tz)) return;
  if (ev && (ev.type === "contextmenu" || (ev.type === "pointerdown" && ev.button === 2))) {
    openCtx(clientX, clientY, null, [
      { label: "Walk here", fn: () => walkFromMinimap(tx, tz) },
      { label: "Cancel", fn: () => {} },
    ]);
    return;
  }
  /* A minimap click is a click like any other: an armed use disarms first (the
     user's rule, 2026-10-07 - the mode is never sticky). Right-click picks go
     through the menu disarm in openCtx. */
  cancelUse();
  walkFromMinimap(tx, tz);
}

function walkFromMinimap(tx, tz) {
  /* A click on the minimap is a movement command like any other: it closes the
     shop window and ends a conversation (see `closeOnWalk`). */
  closeOnWalk();
  /* A notifier, not an override: it runs first and the minimap walk below
     always proceeds (src/actions.js installs the canceller). */
  if (UI.actions.minimapClick) UI.actions.minimapClick(tx, tz);
  const w = UI.world;
  const dest = w.isWalkable(tx, tz) ? { x: tx, z: tz } : nearestWalkable(w, tx, tz, 20);
  if (!dest) return;
  if (walkTo(G.player, w, dest.x, dest.z, 0, clickMods())) G.view.setDest(G.player.destX, G.player.destZ);
}

function biomeName(x, z) {
  const world = UI.world;
  let water = 0, sand = 0, marsh = 0, dark = 0, rock = 0, n = 0;
  for (let dz = -6; dz <= 6; dz += 3) {
    for (let dx = -6; dx <= 6; dx += 3) {
      const t = world.tileAt(Math.floor(x + dx), Math.floor(z + dz));
      n++;
      if (t === T.WATERBED) water++;
      else if (t === T.SAND) sand++;
      else if (t === T.MARSH) marsh++;
      else if (t === T.GRASS_DARK) dark++;
      else if (t === T.ROCKGROUND || t === T.GRAVEL) rock++;
    }
  }
  if (water / n > 0.3) return "River";
  if (sand / n > 0.3) return "Shoreline";
  if (rock / n > 0.3) return "Quarry";
  if (marsh / n > 0.3) return "Marshland";
  if (dark / n > 0.5) return "Deep forest";
  return "Countryside";
}

/* --------------------------------------------------------------------- tabs */

let lastRenderedTab = null;
const tabScroll = new Map();

function renderTab() {
  /* The pack slots about to be thrown away may be the ones a drag is running
     on and has its pointer capture on; let the capture go before the innerHTML
     wipe detaches it, or the browser is left holding a node that is gone and
     the rest of the gesture - including the pointerup that clears the ghost -
     never arrives. The drag itself carries on (see bindInvDrag). */
  detachInvDragElement();
  const sb = UI.els.sideBody;
  if (!sb) return;
  /* **Each tab remembers where it was scrolled to** (the user's report: "the
     emotes menu should remember where you are when you scrolled, it should not
     scroll up every time"). The panel in the DOM right now belongs to
     `lastRenderedTab`, so its live `scrollTop` is *that* tab's and is recorded
     before the content is wiped; a re-render of the tab already showing keeps
     that same live value, which is what an in-place refresh needs. Restoring on
     the way back in is what the emote book - the one flowing panel taller than
     the 261px side panel - was missing: leaving the tab clamped its position to
     0 on the short panel that replaced it, and coming back read that 0. */
  if (lastRenderedTab != null) tabScroll.set(lastRenderedTab, sb.scrollTop);
  const keep = tabScroll.get(UI.tab) || 0;
  lastRenderedTab = UI.tab;
  sb.innerHTML = "";
  const fn = TAB_RENDER[UI.tab];
  const fixed = FIXED_TABS.has(UI.tab);
  const panel = mk("div", "panel" + (fixed ? " fixed" : ""));
  sb.appendChild(panel);
  if (fn) fn(panel);
  sb.scrollTop = keep;
  updateSideScrollbar();
}

export function setTab(name) {
  /* Changing tabs is a click like any other: an armed use disarms first (the
     user's rule, 2026-10-07 - the mode is never sticky). */
  cancelUse();
  /* The combat-tab-to-book autocast pick (UI.combatBookPick) only survives the
     trip into the book: flicking anywhere else spends it unseen. */
  if (name !== "magic" && name !== 6) UI.combatBookPick = false;
  if (name === "bank") {
    /* the bank is walkable: the side panel stays up, showing your inventory.
       The list keeps wherever it was scrolled to - reopening the bank puts you
       back where you were, which is the whole of the "remember my scroll" ask. */
    if (UI.tab !== 3) { UI.tab = 3; Frame.setSelectedTab(3); }
    renderTab();
    FullIface.show("bank", renderBank, { keepWorld: true });
    return;
  }
  if (name === "shop") { openShop(UI.shop, UI.shopKey); return; }
  const id = typeof name === "number" ? name : TAB_ALIAS[String(name).toLowerCase()];
  if (id == null || id < 0 || id >= TABS.length) return;
  /* a walkable interface (the bank, a shop) stays up while you flick between
     side tabs - the panel behind it just changes */
  if (FullIface.open && !FullIface.keepWorld) FullIface.hide();
  UI.tab = id;
  Frame.setSelectedTab(id);
  UI.flashTabs.delete(id);
  renderTab();
}

const TAB_RENDER = {
  0: renderCombat,
  1: renderSkills,
  2: renderQuests,
  3: renderInventory,
  4: renderEquipment,
  5: renderPrayer,
  6: renderMagic,
  7: renderBoard,
  8: renderFriendsList,
  9: renderOnlinePlayers,
  10: renderLogout,
  11: renderOptionsPanel,
  12: renderEmotes,
  13: renderMusic,
};

/* Kept for callers that used to refresh the side panel by name. */
export function refreshInv() { if (UI.tab === 3) renderTab(); }
export function refreshSkills() { if (UI.tab === 1) renderTab(); }
export function refreshEquip() { if (UI.tab === 4) renderTab(); }
export function refreshBank(name) { setTab("bank"); }
export function refreshSetup() { setTab("options"); }
export function refreshEquip0() { /* handled by renderCombat */ }

/* ------------------------------------------------------------------ tick */

export function tick(game, dt) {
  if (!UI.ready) return;
  const ps = UI.ps;
  G = game;
  /* the xp column's clock, before this tick's drops are placed (see
     xpAdvanceClock) */
  xpAdvanceClock();

  if (ps.xpDrops && ps.xpDrops.length) {
    /* Every gain carries the tick that earned it, stamped where it was earned
       (src/skills.js#addXp). That is what lets a Barrage's per-body gains - all
       earned on one tick, so all one number - share a toast while a gain from
       the *next* tick opens its own, even when one frame covers both (a slow
       device, or a tab coming back from the background). The fallback is for a
       drop queued before the tick source was installed. */
    const queued = ps.xpDrops.slice();
    ps.xpDrops.length = 0;
    /* Grouped by the tick that earned them before anything is placed, because
       the burst's own size is what sets the column's climb rate (see
       addXpBurst) and a slow frame can hand us two ticks' worth at once. */
    for (let i = 0; i < queued.length; ) {
      const tick = queued[i].tick != null ? queued[i].tick : G.tickCount;
      const group = [];
      while (i < queued.length && (queued[i].tick != null ? queued[i].tick : G.tickCount) === tick) group.push(queued[i++]);
      addXpBurst(group, tick);
    }
  }
  if (ps.levelUps && ps.levelUps.length) {
    for (const l of ps.levelUps) showLevelUp(l.skill, l.level);
    ps.levelUps.length = 0;
    mark("skills", "combat", "prayer");
  }

  if (ps.runEnergy <= 0 && ps.runEnabled) { ps.runEnabled = false; mark("orbs"); }

  if (FullIface.open === "bank" && FullIface.anchor) {
    const dx = ps.x - FullIface.anchor.x, dz = ps.z - FullIface.anchor.z;
    if (dx * dx + dz * dz > 4) FullIface.hide();
  }

  /* A selected spell only stays selected while you can still pay for it. The
     client traps the failure at cast time instead, but dropping the selection
     the moment the last rune of a kind is spent is the only way the tab can
     tell you why nothing happens when you click a target. */
  if (UI.spell != null) {
    const sp = spellById.get(UI.spell);
    if (!sp || !spellStatus(ps, sp).ok) {
      UI.spell = null;
      mark("magic");
      if (sp) chat("You no longer have the runes to cast " + sp.name + ".", "warn");
    }
  }

  if (UI.dirty.size) {
    /* the side panel stays on screen behind an interface, so it needs its
       redraw either way (withdrawing an item has to show up in your inventory) */
    if (FullIface.open) FullIface.refresh();
    /* The pack and the skills tab patch their numbers in place rather than
       rebuilding the panel (see `patchInventory` / `patchSkills`): a rebuild
       on every gain made the numbers flash while xp - or stack counts - kept
       arriving. Any other tab, or a panel that is not in patchable shape,
       rebuilds as before. */
    if (UI.tab === 3) { if (!patchInventory()) renderTab(); }
    else if (UI.tab === 1) { if (!patchSkills()) renderTab(); }
    else renderTab();
    UI.dirty.clear();
  }

  UI.orbAcc += dt;
  if (UI.orbAcc > 0.4) { UI.orbAcc = 0; updateOrbs(); }
  pulseOrbs(dt);

  /* the level-up icon on the skills tab blinks until the tab is opened */
  if (UI.flashTabs.size) {
    UI.flashAcc += dt;
    if (UI.flashAcc > 0.3) {
      UI.flashAcc = 0;
      UI.flashOn = !UI.flashOn;
      for (const id of UI.flashTabs) {
        const t = Frame.tabs.find((x) => x.id === id);
        if (t && t.icon) t.icon.style.visibility = UI.flashOn ? "hidden" : "";
      }
    }
  }

  /* The minimap is redrawn every frame, on the interpolated render position, so
     it scrolls as smoothly as the world view instead of stepping 30 times a
     second. It is a 1:1 blit plus a handful of 4px sprites, so it costs almost
     nothing next to the world render. */
  drawMinimap();

  const yaw = G.yaw || 0;
  if (Math.abs(yaw - UI.compassAcc) > 0.002) { UI.compassAcc = yaw; drawCompass(); }

  /* ---------------------------------------------------------- ui effects
     The client's own little animation (the xp toast climb) is driven from here
     rather than from CSS keyframes: the game already has a frame loop, and
     driving it from there keeps it in lockstep with the rest of the interface.
     The hover text itself is static - it appears and stays put. */
  UI.effT += dt;
  fadeXpToasts();
  updateWorldHover();
  updateTileMarks();
  perfTick(dt);

  /* The open shop's restock clock (src/ui.js#applyShopStock). Only the counter
     on screen runs it - a shop nobody has open is the server's to prune - and
     when it runs out the shelves go back to the shop's own rows here first (the
     player watches them refill) and the world is told, which is what stops the
     server from handing the same emptied shelf out again. */
  if (UI.shopKey && SHOP_RESTOCK.has(UI.shopKey)) {
    const due = SHOP_RESTOCK.get(UI.shopKey);
    if ((G.time || 0) >= due) {
      SHOP_RESTOCK.delete(UI.shopKey);
      resetShopStock(UI.shop, UI.shopKey);
      netShopClear(UI.shopKey);
      FullIface.refresh();
    }
  }
}

/* -------------------------------------------------------------------- perf

   The frame loop hands this its own `dt`, which is the real wall-clock time
   between two drawn frames - so `dt` is the frame time, and no extra clock is
   needed to measure one. The window is deliberately short (60 frames, ~a
   second) because a performance read-out is about *now*: a stutter two minutes
   ago is not what the player is looking at, and a long average hides exactly
   the spikes a report is about. `worst` is kept over the same window, since a
   hitched 60th frame is the thing an average is best at hiding.

   The read-out is only *built* while it is on screen (`::fps`), but the sample
   is collected always, so `::perf` can report the last second of play even
   though nothing was being displayed at the time. */
function perfTick(dt) {
  const p = UI.perf;
  const ms = dt * 1000;
  p.lastMs = ms;
  p.samples++;
  p.sum += ms;
  if (ms > p.worst) p.worst = ms;
  p.acc += dt;
  /* Close the window on a second of play, or on a full 60 frames of it - which
     of the two comes first depends on the refresh rate, and both are "about a
     second" at the frame rates this game runs at. */
  if (p.acc >= 1 || p.samples >= 60) {
    p.avgMs = p.sum / p.samples;
    p.worstMs = p.worst;
    p.frames = p.samples;
    p.samples = 0; p.sum = 0; p.worst = 0; p.acc = 0;
  }
  if (!p.on) return;
  /* The plate is repainted five times a second rather than every frame: it is
     read by a person, and a DOM write per frame to show a number that only
     changes twice a second is the kind of measuring that changes the thing
     being measured. */
  p.uiAcc = (p.uiAcc || 0) + dt;
  if (p.uiAcc >= 0.2) { p.uiAcc = 0; renderPerf(); }
}

/* The numbers themselves. Everything here is read from the game's own state
   (its frame counter, the renderer's per-frame statistics, the entity list) -
   nothing is estimated, and nothing is stored twice. */
function perfStats() {
  const g = UI.game;
  const view = g && g.view;
  const info = view && view.renderer && view.renderer.info;
  const npcs = g ? g.npcs.length : 0;
  let ghosts = 0;
  try { ghosts = g && g.ghosts ? g.ghosts.size : 0; } catch (e) { ghosts = 0; }
  return {
    fps: g && g.fps ? g.fps : 0,
    avgMs: UI.perf.avgMs || UI.perf.lastMs,
    worstMs: UI.perf.worstMs || UI.perf.worst || 0,
    calls: info ? info.render.calls : 0,
    tris: info ? info.render.triangles : 0,
    geoms: info ? info.memory.geometries : 0,
    texs: info ? info.memory.textures : 0,
    progs: info && info.programs ? info.programs.length : 0,
    ratio: view && view.renderer ? view.renderer.getPixelRatio() : 1,
    entities: g ? g.entities.length : 0,
    npcs,
    ghosts,
    paused: !!(g && g.paused),
  };
}

function perfLine(s) {
  return [
    s.fps.toFixed(0) + " fps  (" + s.avgMs.toFixed(2) + " ms avg, " + s.worstMs.toFixed(1) + " ms worst)",
    "draw calls " + s.calls + ", " + s.tris.toLocaleString() + " tris",
    "geom " + s.geoms + ", tex " + s.texs + ", prog " + s.progs,
    "bodies " + s.entities + " (" + s.npcs + " npc, " + s.ghosts + " ghost)",
    "buffer x" + s.ratio + (s.ratio > 1 ? " (anti-aliasing)" : ""),
  ].join("\n");
}

function renderPerf() {
  const box = UI.els.perfBox;
  if (!box) return;
  const text = perfLine(perfStats());
  if (text !== UI.perf.text) {
    UI.perf.text = text;
    box.textContent = text;
  }
}

/* `::fps` - the live read-out, on or off. */
export function togglePerfOverlay() {
  UI.perf.on = !UI.perf.on;
  const box = UI.els.perfBox;
  if (box) {
    box.hidden = !UI.perf.on;
    if (UI.perf.on) renderPerf();
  }
  return UI.perf.on;
}

/* `::perf` - the same numbers said once into the chat log, plus the boot
   weight, which is the other half of a web game's performance and is not
   visible in any per-frame counter. The byte counts come from the browser's own
   resource timings, so they are what was actually fetched - and they are shown
   only when the API has something to say. */
export function perfReport() {
  const s = perfStats();
  const out = [];
  out.push("FPS " + s.fps.toFixed(1) + " | frame " + s.avgMs.toFixed(2) + " ms avg, " + s.worstMs.toFixed(1) + " ms worst (last second)");
  out.push("draw " + s.calls + " calls, " + s.tris.toLocaleString() + " triangles | " + s.geoms + " geometries, " + s.texs + " textures, " + s.progs + " programs");
  out.push("bodies " + s.entities + " (" + s.npcs + " npc, " + s.ghosts + " ghost) | drawing buffer x" + s.ratio + (s.ratio > 1 ? " (anti-aliasing on)" : ""));
  try {
    const res = performance.getEntriesByType("resource");
    let bytes = 0, n = 0;
    for (const r of res) {
      if (r.name.indexOf("/src/") < 0) continue;
      bytes += r.decodedBodySize || 0;
      n++;
    }
    if (n) out.push("boot assets " + n + " files, " + (bytes / 1048576).toFixed(1) + " MB fetched this session");
  } catch (e) { /* resource timings unavailable */ }
  return out;
}

/* ----------------------------------------------------------------------------
   The world hover text. The client draws the hovered thing's default
   left-click action at a fixed spot at the top-left of the game screen - e.g.
   "Chop down tree" or "Attack Goblin (level 2)" - and nothing else: the
   examine line lives in the right-click menu. Plain ground carries no label.
   The label is only rebuilt when the thing under the cursor changes, so
   nothing is recomputed on the 90% of frames where the cursor has not moved.
   ---------------------------------------------------------------------------- */
function updateWorldHover() {
  const g = UI.game;
  if (!g || !UI.els.hoverTip) return;
  /* A full screen is up (login, welcome): the world behind it is not being
     played, so it gets no hover label, no health bar and no boxes. */
  if (UI.worldBlocked) {
    Fx.hover = null;
    if (UI.hoverOwner === "world") { hideHoverTip("world"); UI.worldHover.key = null; UI.worldHover.text = null; }
    return;
  }
  /* A popup owns the screen: production boxes sit in the modal layer over the
     3D view, and while one is up the popup is what is displayed - nothing
     behind it gets a hover line (the user's rule). */
  if (UI.els.modalLayer && !UI.els.modalLayer.hidden) {
    Fx.hover = null;
    if (UI.hoverOwner === "world") { hideHoverTip("world"); UI.worldHover.key = null; UI.worldHover.text = null; }
    return;
  }
  if (!g.pointer || !g.pickTile) {
    Fx.hover = null;
    if (UI.boxesOn && g.view) g.view.setHoverBox(null);
    if (UI.tilesOn && g.view && g.view.setTileMarks) g.view.setTileMarks(null, null, null, null);
    if (UI.hoverOwner === "world") { hideHoverTip("world"); UI.worldHover.key = null; UI.worldHover.text = null; }
    return;
  }
  const p = g.pointer;
  let npc = g.pickEntity(p.x, p.y);
  /* the creature under the cursor wears its health bar too (see
     src/fx.js#renderBars), so pointing at anything at all shows how it is
     doing - the cursor is the one place you always look */
  let hit = npc ? null : g.pickTile(p.x, p.y);
  /* Hover hysteresis: the hover's own grace area (see `stickWorldHover`). */
  const stuck = stickWorldHover(g, p, npc, hit);
  npc = stuck.npc;
  hit = stuck.hit;
  /* Whether the ray itself is still on the creature: a body the ray met is in
     front, and with an item in hand it keeps the hover as well as the click
     (see src/actions.js#useTargetName). The grace recovery is deliberately
     left out - a body the tile scan found is behind. Only computed while an
     item is armed, the one case that reads it. */
  const front = !!((UI.useItem && npc && npc.kind !== "ghost" && g.pickFrom && g.npcs) && g.pickFrom(p.x, p.y, g.npcs) === npc);
  if (npc && g.hooks && g.hooks.aimPreferScenery) {
    const under = g.pickTile(p.x, p.y);
    if (under && under.obj && g.hooks.aimPreferScenery(npc, under.obj, front)) { npc = null; hit = under; }
  }
  /* With an item in the hand and the grace holding a creature, the use-test
     still needs the object under the cursor (see `useTargetName`), so the
     tile is picked once more - only while an item is armed. */
  const useUnder = (UI.useItem && npc && !hit) ? g.pickTile(p.x, p.y) : null;
  const ehit = hit || useUnder;
  Fx.hover = npc;
  /* ::boxes (scene.js#setHoverBox). It is driven from here because this is
     already the one place per frame that knows what the cursor is over, and it
     is asked *before* the early-out below: the box belongs to the object under
     the cursor, not to the hover text, so it must keep following a target whose
     label has not changed. A tile whose object the ray missed - looking down at
     the grass in front of a bush - still shows the bush it stands on, which is
     what `objAt` is doing here. */
  if (UI.boxesOn && g.view) {
    if (npc) {
      g.view.setHoverEnt(entityBoxWorld(npc), npc);
    } else {
      const boxObj = hit ? (hit.obj || UI.world.objAt(hit.tx, hit.tz)) : null;
      g.view.setHoverBox(hit ? hit.tx : null, hit ? hit.tz : null, boxObj || null);
    }
  }
  let hpKey = "";
  if (npc && Fx.hpOf) {
    try {
      const info = Fx.hpOf(npc);
      if (info && info.max > 0) hpKey = ":" + Math.max(0, Math.ceil(info.hp)) + "/" + info.max;
    } catch (e) { hpKey = ""; }
  }
  /* Above the horizon there is no creature and no tile, so the sky line is
     part of the key - panning across the skyline must rebuild it. */
  let sky = null;
  if (!npc && !hit && UI.actions.skyHoverLabel) sky = UI.actions.skyHoverLabel(p.x, p.y);
  const key = (npc ? "n" + hpKey : hit ? "t" + hit.tx + "," + hit.tz : "-") + "|" + (UI.spell == null ? "" : UI.spell) + "|" + (UI.useItem ? UI.useItem.id : "") + "|" + (sky || "");
  if (key === UI.worldHover.key && npc === UI.worldHover.npc) {
    /* the target has not changed, but a click may have dismissed the tip -
       put it back without rebuilding its contents */
    if (UI.worldHover.text && (UI.hoverOwner !== "world" || UI.els.hoverTip.hidden)) showHoverTip(UI.worldHover.text, "world");
    /* ...and the click-grace stamp is refreshed here too: with a still cursor
       this branch is taken every frame, and stamping only on change would let
       the 150ms window expire under a cursor that never moved. */
    if (npc && !npc.dead) { Game.hoverMemory.ent = npc; Game.hoverMemory.t = performance.now(); }
    return;
  }
  UI.worldHover.key = key;
  UI.worldHover.npc = npc;
  UI.worldHover.hit = hit;
  UI.worldHover.spell = UI.spell;
  /* Click grace (game.js#forgivePick): the press-time fallback reads whatever
     the cursor held last, so stamp it while it is held - every frame, not just
     on change, or the 150ms window would expire under a still cursor. */
  if (npc && !npc.dead) { Game.hoverMemory.ent = npc; Game.hoverMemory.t = performance.now(); }
  /* The client's drawTooltip falls back to the *selected spell* line when the
     cursor is over nothing actionable, so with a spell picked you get
     "Cast Fire Strike -> " over plain ground (317_Client.java:2504). Above the
     horizon the sky line wins over that fallback: the click up there examines,
     so the line must say Examine, not Cast. */
  const text = (UI.actions.hoverLabel ? UI.actions.hoverLabel(npc, ehit ? ehit.tx : null, ehit ? ehit.tz : null, ehit ? (ehit.obj || null) : null, front) : null)
    || sky
    || (UI.actions.pickedSpellHover ? UI.actions.pickedSpellHover() : null);
  UI.worldHover.text = text;
  if (text) showHoverTip(text, "world");
  else if (UI.hoverOwner === "world") hideHoverTip("world");
}

function updateTileMarks() {
  const v = G.view;
  if (!v || !v.setTileMarks) return;
  if (!UI.tilesOn || UI.worldBlocked) { v.setTileMarks(null, null, null, null); return; }
  const h = UI.worldHover.hit;
  const pl = G.player;
  const walking = pl && (pl.moving || (pl.path && pl.path.length)) && pl.destX != null && pl.destZ != null;
  v.setTileMarks(
    h && !UI.worldHover.npc ? h.tx : null, h && !UI.worldHover.npc ? h.tz : null,
    walking ? pl.destX : null, walking ? pl.destZ : null);
}

/* The hover's own grace area: how far the cursor may stray from the label's own
   anchor before the label lets go of it (game.js#distToEnt/distToTile).

   The ray picks every frame, so while the camera pans under a running player a
   cursor sitting still on the screen sweeps across bodies and tiles and the
   label flickers between neighbours - and a creature turning behind a tree
   spins its outline under a label that cannot settle. The label is display-only
   (clicks always re-pick at press time through the unforgiven ray plus the
   click's own same-tile/14px recovery), so it may lag the ray: whatever it
   holds, it keeps until the cursor is this many screen pixels from that
   thing's own anchor. The anchor is projected live, so the grace follows a
   walking body rather than pinning the label to a tile it left.

   The hold breaks early when the held thing stops being what it was: a dead
   creature, a picked spell (the label's text is the spell's line), or an
   object whose identity or state changed under the cursor (a felled tree is
   the same object with `stump` set, a drained rock the same with `empty`, an
   opened door the same with `open` - the label must answer the new state at
   once, not ride out the grace on the old words). */
const HOVER_STICK_PX = 22;
function objState(o) {
  if (!o) return "-";
  return (o.t || "?") + "|" + (o.stump ? "s" : "") + (o.empty ? "e" : "") + (o.open ? "o" : "");
}
function stickWorldHover(g, p, npc, hit) {
  const wh = UI.worldHover;
  if (UI.spell !== wh.spell || !wh.key) return { npc, hit };
  if (npc && npc === wh.npc && !npc.dead) return { npc, hit };
  if (wh.npc && !wh.npc.dead && g.distToEnt && g.distToEnt(wh.npc, p.x, p.y) < HOVER_STICK_PX) {
    return { npc: wh.npc, hit: null };
  }
  if (!npc && wh.hit && g.distToTile && g.distToTile(wh.hit.tx, wh.hit.tz, p.x, p.y) < HOVER_STICK_PX) {
    const o = wh.hit;
    if (hit && hit.tx === o.tx && hit.tz === o.tz
      && hit.obj === o.obj && objState(hit.obj) === objState(o.obj)) return { npc, hit };
    if (!hit || hit.tx !== o.tx || hit.tz !== o.tz) return { npc: null, hit: o };
  }
  return { npc, hit };
}

/* The hover text the client draws is static: a yellow line with a hard 1px
   black drop shadow that simply appears when the target changes (see
   showHoverTip). */

/* An xp toast *appears* - it is simply there, on the frame the xp was earned -
   at the run energy icon's own y level on the frame, and then climbs straight
   up at exactly the rate the room behind it needs. That rate is the whole of
   the user's ask (2026-09-23):
   *"they should not be starting at the top of the game viewer, they should be
   starting roughly at the same parallel longitudinal level as the run energy
   icon ... and then just move upwards, at the correct rate, so that there is
   always room cleared for the next one the next tick later."*

   It is what makes a column rather than a stack, and the second half of the
   ask is that nothing may be *nudged*: *"if you are using a 1 tick weapon, it
   must fall in line without nudging the one before it at all. it must be on
   its own schedule, and not nudge the hitbox of the other xp drop above it
   further up."* So the y of a toast is a pure function of that toast's own
   age - never of how many toasts were born after it. The model this replaced
   gave every toast a line *index* in the live list as well as a rise, so the
   two added up: each new drop shoved the older ones up a line *and* they were
   climbing a line a tick, which is why two drops a tick (the lightning dagger)
   left a whole empty line between every pair - the padding the user saw.

   The drops of one tick are a *group*: an ordinary swing is two of them (the
   skill, and hitpoints) and a shared-xp weapon such as a spear is three or four,
   and they belong together on the screen. So there are two steps, not one -
   `XP_INNER`, one pixel of air, between two drops of the same group, and
   `XP_OUTER` between the last drop of a group and the first of the next - and
   the column rises by exactly the room the group it just placed needs for the
   group after it: `((n - 1) * XP_INNER + XP_OUTER)` pixels per `apart` ticks.
   That is measured from the group the last tick produced (`addXpBurst`) and
   *integrated* into a counter that only ever counts up, so a change of rate
   bends the climb instead of jumping every toast to a new y.

   The life is 4.5 ticks for every toast, the last half of it a fade to nothing
   (the number has been read by then). The rise, the fade and the removal are
   driven from here, frame by frame, never from a CSS animation (see the
   "Animation is driven from UI.tick, never from CSS" note in src/README.md
   for why). */
const XP_TICK = 0.6, XP_TICKS = 4.5;         /* the game's own tick, and how many it lives */
const XP_FADE_TICKS = 0.5;                   /* the last half tick of that is the fade out */
const XP_HOLD = XP_TICKS * XP_TICK, XP_FADE = XP_FADE_TICKS * XP_TICK, XP_MAX = 10, XP_ICON = 15;
/* The air between two drops of the *same* tick: "a tiny tiny bit of padding", the
   user's own wording (2026-09-23), after asking for none at all - and what they
   settled on for the drops *inside* a group ("otherwise only the single pixel
   padding was fine"). One pixel. */
const XP_PAD = 1;
/* The air between two tick *groups* - the extra the user then asked for ("make it
   a few more pixels of air ... the padding only applies to the space in between
   tick groups"). Four, so a group reads as a group: two or four drops packed a
   pixel apart, with a wider pause before the next tick's. */
const XP_GROUP_PAD = 4;
/* The two steps a toast can take up the column: within its own group, and from
   one group to the next. Both are constants, so neither can nudge: a toast's y
   is its own `k`, its own born rise and the counter, and nothing else. */
const XP_INNER = XP_ICON + XP_PAD, XP_OUTER = XP_ICON + XP_GROUP_PAD;

/* The column's own clock. `xpRise` is how far the column has risen above the
   anchor, in pixels - every toast measures its own climb against it - and
   `xpRisePerTick` is how fast it is fed (measured in addXpBurst); `xpClock` is
   the simulation clock the counter was last moved on to (see xpAdvanceClock).
   Pixels rather than lines because a line is no longer one step: a group's
   drops are `XP_INNER` apart and the gaps between groups are `XP_OUTER`. */
let xpRise = 0, xpRisePerTick = 1, xpClock = null;
/* The burst being filled: the tick it was earned on, the tick of the burst
   before it (the pace between groups is measured over the two), and how many of
   its drops have been placed so far (that count is the `k` that offsets
   same-tick drops from each other). Cleared when the column empties, so a fresh
   streak is never measured against a burst from minutes ago. */
let xpBurstTick = null, xpPrevTick = null, xpBurstN = 0;

/* The y the drops start at: the run energy orb's own icon, on the frame's own
   axis. Read from the frame's baked orb geometry rather than from a live
   measurement, so a drop can be placed the first time one is ever earned -
   the icon's box is the cache's (src/tools/cache-bake/frame.mjs's ORB_GEOM),
   and `offY` says where the icon's pixels sit inside the orb's 26px window. */
function xpDropAnchorY() {
  const orbs = Frame.index && Frame.index.orbs;
  const b = orbs && (orbs.buttons || []).find((x) => x.key === "run");
  if (!b) return VIEWPORT.y;
  const part = (Frame.parts && (Frame.parts[ORB_RUN_ICON.on] || Frame.parts[ORB_RUN_ICON.off])) || null;
  const top = b.y + orbs.geom.fill.y + (part ? part.offY : 0);
  const h = (part && part.h) || orbs.geom.fill.h;
  return top + h / 2;
}

/* Move the column's rise on to the simulation's own clock: the sim's tick count
   plus how far into the current tick it is, so the counter rises smoothly frame
   by frame and by exactly `xpRisePerTick` over a tick. It is the
   *sim's* clock and not the wall clock on purpose - the drops come off that same
   clock, so the two can never disagree. Real elapsed time can: a frame that
   stumbles, or a tick the sim has to catch up on, would let the column fall a
   fraction of a step behind the drops arriving into it, and the drops would
   slowly pile on top of each other. Called at the top of the tick, before the
   tick's own drops are placed, so a toast born now is born at zero rise. */
function xpAdvanceClock() {
  if (!G) return;
  const now = (G.tickCount || 0) + (G.tickProgress || 0);
  if (xpClock == null) { xpClock = now; return; }
  const d = now - xpClock;
  if (d > 0) { xpRise += d * xpRisePerTick; xpClock = now; }
}

function fadeXpToasts() {
  const c = UI.els && UI.els.xpDrops;
  if (!c) return;
  /* The column is empty, so the streak is over: forget which burst it was fed
     by, so the next drop is measured against nothing rather than against a
     burst from minutes ago (which would make that first drop climb absurdly
     slowly). */
  if (!c.firstChild) { xpBurstTick = null; xpPrevTick = null; xpBurstN = 0; return; }
  /* The toast hangs from the run energy icon's own centre - the icon and the
     line are the same size to within a pixel, so the two read as one line. */
  const anchor = xpDropAnchorY() - VIEWPORT.y - XP_ICON / 2;
  for (let i = 0; i < c.children.length; i++) {
    const el = c.children[i];
    /* The line box is the icon cell, so even a toast with no icon (the number
       alone - Runecraft, Summoning, Dungeoneering) has its number centred on the
       line rather than hanging off the top of it. Written once per toast, not
       every frame, because a written style is a DOM change where a transform
       alone is not. */
    if (!el._lineH) {
      el._lineH = XP_ICON;
      el.style.height = XP_ICON + "px";
      el.style.top = anchor + "px";
    }
    /* How far above the anchor this toast hangs: its own step inside its group
       (`k` × `XP_INNER` - the dagger's pair, or a spear's four, are a pixel
       apart from the first frame, so they never cover each other) plus the rise
       the column has made since the tick this toast's group was placed. Both are
       fixed facts about *this* toast, so a drop arriving now cannot move it by a
       pixel: no nudging, ever. */
    const rise = (el._k || 0) * XP_INNER + (xpRise - (el._bornRise || 0));
    el.style.transform = "translateY(" + (-rise).toFixed(2) + "px)";
    /* Its box has crossed the top of the frame, so `#frame` clips it: marked
       here and taken off below with the expired ones. Tested on the box, not on
       a step count, because the column's rise is continuous - a toast 130 px up
       has half of its box past the frame's top edge - and on each toast's own
       box rather than on
       how many toasts are live, because a group is one to four drops and the
       groups are further apart than the drops in them, so no count of toasts can
       say whether the top row is inside the frame. The group structure is
       exactly why: a spear's four drops are 16 px apart but two groups are 19,
       so ten live toasts are a shorter column than twelve, and the only honest
       test is the box. */
    el._off = anchor - rise < 0;
    /* The last half tick is a fade to nothing - the toast is already climbing
       and the number has been read, so it leaves the screen rather than
       blinking out mid-air. Anything earlier in its life is fully opaque (the
       property is cleared rather than set to "1" so a fresh toast has no
       opacity of its own at all). */
    const left = XP_HOLD - (UI.effT - (el._born || 0));
    el.style.opacity = left >= XP_FADE ? "" : Math.max(0, left / XP_FADE).toFixed(3);
  }
  /* Every toast that has expired or crossed the top of the frame goes, oldest
     (last child) first. A removal moves nobody: every other toast's position is
     its own k and its own born rise, and neither of those changes, so it does
     not matter to them which of their neighbours leave or in what order. */
  for (let i = c.children.length - 1; i >= 0; i--) {
    const el = c.children[i];
    if (UI.effT - (el._born || 0) > XP_HOLD || el._off) c.removeChild(el);
  }
  /* Past the absolute cap on live toasts the oldest *group* goes, whole, which
     is the guard against a pathological stream of groups (the frame edge already
     takes the rest). Whole, not one toast at a time: the tail of the container
     is the oldest group's `k=0` - the group is inserted `k=0` first, so the tail
     holds its *bottom* drop - and taking that alone would leave the group's upper
     drops floating above a hole, which would read as extra air between that group
     and the one below it (a measured 35 px where the rule says 19). Removing the
     whole group at once is what the trim means anyway: it is the group that is
     leaving, not one of its drops. */
  while (c.childNodes.length > XP_MAX) {
    const oldestTick = c.lastChild && c.lastChild._tick;
    while (c.lastChild && c.lastChild._tick === oldestTick) c.removeChild(c.lastChild);
  }
}
/* `XP_TICKS` is documentation only - the hold is written from the two numbers so
   they can never drift apart - but the audits and src/README.md cite it, so it
   is kept beside its own number. */
void XP_TICKS;

/* -------------------------------------------------------------------- init */

export function initUI(game) {
  G = game;
  UI.game = game;
  UI.ps = game.ps;
  UI.world = game.world;
  /* the worn-equipment paper-doll repaints into the frame each tick, before the
     world view is drawn over it */
  if (game.hooks && !game.hooks.beforeRender) game.hooks.beforeRender = drawEquipDoll;
  /* Every click on the world is a movement command as far as what the player is
     looking at is concerned, so game.js#handleClick calls this at its top (see
     `closeOnWalk`). Installed here rather than in src/actions.js because the two
     things it closes - the shop window and the chatbox - are both this module's. */
  if (game.hooks) game.hooks.onMoveCommand = closeOnWalk;
  if (game.hooks) game.hooks.ctxMenuContains = (x, y, pad) => {
    if (els.ctxMenu.hidden) return false;
    const r = els.ctxMenu.getBoundingClientRect();
    const p = pad || 0;
    return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
  };
  if (game.hooks) game.hooks.ctxMenuExclusion = (x, y) => {
    if (els.ctxMenu.hidden) return false;
    const r = els.ctxMenu.getBoundingClientRect();
    const head = els.ctxMenu.querySelector(".cHead");
    const headBottom = head ? head.getBoundingClientRect().bottom : r.top;
    const p = 2;
    const ax = UI.ctxAnchor;
    if (ax) {
      const cx = Math.max(r.left, Math.min(r.right, ax.x));
      if (Math.abs(x - cx) <= 20 && y >= r.top - p && y <= headBottom) return true;
    }
    const rows = els.ctxMenu.querySelectorAll(".mi");
    let bottom = r.bottom;
    if (rows.length === 2 && rows[0].textContent.trim() === "Walk here" && rows[1].textContent.trim() === "Cancel") {
      bottom = rows[0].getBoundingClientRect().bottom;
    } else if (rows.length > 2) {
      bottom = rows[1].getBoundingClientRect().bottom;
    }
    return x >= r.left - p && x <= r.right + p && y >= headBottom && y <= bottom + p;
  };

  /* The overhead prayer icon is drawn by the world's overlay painter, but the
     sprite it blits is the cache's `headicons_prayer` group, which only the
     interface side knows the name of, so the painter is handed the lookup and
     the blit here (src/fx.js#renderOverheads). */
  Fx.overheadPart = (e) => {
    if (!e) return null;
    if (e.ps) {
      const p = overheadPrayer(e.ps);
      return overheadHeadPart(p);
    }
    if (e.overhead) return overheadPartFor(e.overhead);
    return null;
  };
  Fx.drawPart = (ctx, name, x, y, w, h) => Frame.drawSprite(ctx, name, x, y, w, h);
  loadSettings();
  warmModBadge();

  const els = UI.els;
  els.sideBody = document.createElement("div");
  els.sideBody.className = "sideScroll";
  Frame.layers.side.appendChild(els.sideBody);
  els.sideBody.addEventListener("scroll", updateSideScrollbar);
  els.sideBody.addEventListener("wheel", () => setTimeout(updateSideScrollbar, 0), { passive: true });
  buildSideScrollbar();
  Frame.layers.overlay.insertBefore(els.sideScrollbar.root, Frame.layers.overlay.firstChild);

  els.chatLog = Frame.els.chatLog;
  els.chatInput = Frame.els.chatInput;
  els.chatName = Frame.els.chatName;
  els.chatScroll = Frame.els.chatScroll;
  /* the split private chat's own window is the frame's furniture too, and the
     interface draws into it (src/ui.js#drawPrivateChat) */
  els.chatPriv = Frame.els.chatPriv;
  els.chatPrivInner = Frame.els.chatPrivInner;
  els.chatPrivRule = Frame.els.chatPrivRule;
  els.chatPrivAbove = Frame.els.chatPrivAbove;
  els.chatPrivAboveInner = Frame.els.chatPrivAboveInner;
  restorePrivLog();
  els.chatDialog = Frame.els.chatDialog;
  els.ctxMenu = Frame.els.ctxMenu;
  els.ctxMenu.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 2) return;
    if (els.ctxMenu.hidden) return;
    if (G && G.hooks && G.hooks.ctxMenuExclusion && G.hooks.ctxMenuExclusion(e.clientX, e.clientY)) return;
    if (G && G.camDragFrom) G.camDragFrom(e.clientX, e.clientY, e.pointerId);
  });
  els.hoverTip = Frame.els.hoverTip;
  els.perfBox = Frame.els.perfBox;
  els.modalLayer = Frame.els.modalLayer;
  els.modalBox = Frame.els.modalBox;
  els.levelUps = Frame.els.levelUps;
  els.xpDrops = Frame.els.xpDrops;
  els.minimap = Frame.els.minimap;
  els.compass = Frame.els.compass;
  els.hpOrb = Frame.els.hpOrb;
  els.hpText = Frame.els.hpText;
  els.hpFill = Frame.els.hpFill;
  els.hpFrame = Frame.els.hpFrame;
  els.hpHalfWin = Frame.els.hpHalfWin;
  els.hpHalfFill = Frame.els.hpHalfFill;
  els.prayOrb = Frame.els.prayOrb;
  els.prayText = Frame.els.prayText;
  els.prayFill = Frame.els.prayFill;
  els.prayFrame = Frame.els.prayFrame;
  els.runOrb = Frame.els.runOrb;
  els.runText = Frame.els.runText;
  els.runFill = Frame.els.runFill;
  els.runFrame = Frame.els.runFrame;
  els.runIcon = Frame.els.runIcon;

  /* the chat log lives inside a fixed window and grows upwards, like the real
     chatbox; the inner element is what actually holds the lines */
  const inner = document.createElement("div");
  inner.className = "chatlogInner";
  els.chatLog.appendChild(inner);
  els.chatLogInner = inner;
  let chatTouchDrag = null;
  els.chatLog.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    chatTouchDrag = { y: e.clientY, off: UI.chatScrollOff || 0, id: e.pointerId };
  });
  window.addEventListener("pointermove", (e) => {
    if (!chatTouchDrag || e.pointerId !== chatTouchDrag.id) return;
    const s = Frame.scale || 1;
    const max = Math.max(0, els.chatLogInner.scrollHeight - els.chatLog.clientHeight);
    UI.chatScrollOff = Math.max(0, Math.min(max, chatTouchDrag.off + (chatTouchDrag.y - e.clientY) / s));
    chatScrollbar();
  }, true);
  window.addEventListener("pointerup", (e) => {
    if (chatTouchDrag && e.pointerId === chatTouchDrag.id) chatTouchDrag = null;
  }, true);
  window.addEventListener("pointercancel", (e) => {
    if (chatTouchDrag && e.pointerId === chatTouchDrag.id) chatTouchDrag = null;
  }, true);
  els.chatLog.addEventListener("wheel", (e) => {
    e.preventDefault();
    /* The log is translated *down* by the offset to show what is older, so a
       wheel notch towards the newest line (a positive deltaY) takes the offset
       off and a notch the other way puts it on. The step is the browser's own
       delta, bounded: a trackpad's smooth scroll arrives as a stream of small
       deltas and a mouse wheel as ~100s, and both should move the log by about
       the same amount per gesture. */
    const step = Math.max(14, Math.min(70, Math.abs(e.deltaY)));
    UI.chatScrollOff += e.deltaY > 0 ? -step : step;
    chatScrollbar();
  }, { passive: false });
  /* The scrollbar's own arrows, track and thumb drag call back through the
     frame (src/gameframe.js#_buildScrollbar), and nothing had ever connected
     that hook: the chat scrollbar's arrows and track did nothing at all, and
     only the wheel ever moved the log. */
  Frame.els.onChatScroll = (frac) => setChatScroll(frac);

  /* the full-frame interface layer */
  els.iface = document.createElement("div");
  els.iface.id = "fullIface";
  els.iface.hidden = true;
  place(els.iface, VIEWPORT.x, VIEWPORT.y, FRAME_W - VIEWPORT.x - 4, 334);
  Frame.layers.overlay.appendChild(els.iface);

  /* chat input */
  /* An Enter keyup is only a send when its own keydown started on this line.
     Without that, a fast "a, Enter, b" sends the "b" too: the Enter keydown
     sends and blurs, the "b" keydown refocuses the line, and the Enter keyup
     - still in flight - lands on the line and reads as a second, phantom
     press. The same goes for an Enter pressed to *open* the line (the window
     focuses it on keydown): its keyup must not send-and-blur an empty line. */
  let enterArmed = false;
  els.chatInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" || e.keyCode === 13) { enterArmed = true; sendChatInput(); }
    else if (e.key === "Tab") {
      /* Tab to reply: compose to whoever DM'd last (see UI.lastPM). */
      if (settings.tabToReply && UI.lastPM) {
        e.preventDefault();
        messageFriend(UI.lastPM);
      }
    }
    else if (e.key === "Escape") {
      /* Escape is also how a player backs out of the name prompt and out of a
         private message (an empty chat line first puts the line back to public
         chat, and only then does Escape mean "close the box"), so the line's own
         hint has to come back rather than leaving "Enter name" or
         "Message Bob" sitting there for the rest of the session. */
      const wasEmpty = els.chatInput.value.length === 0;
      els.chatInput.value = "";
      if (UI.pendingAmount) { cancelPendingAmount(); closeChatDialog(); }
      if (UI.pmTarget && wasEmpty) stopPM();
      else if (!UI.pendingName) els.chatInput.placeholder = CHAT_PLACEHOLDER;
      layoutChatInput();
      els.chatInput.blur();
    }
  });
  for (const ev of ["keyup", "keypress", "pointerdown", "input"]) {
    els.chatInput.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === "input") { capChatInput(); layoutChatInput(); } });
  }
  els.chatInput.placeholder = CHAT_PLACEHOLDER;
  /* Focusing the line is two things at once: the caret (and, on a phone, the
     on-screen keyboard) and the frame's typing zoom, which scales the chatbox up
     so the line is readable with the keyboard covering the bottom of the screen
     (src/gameframe.js#setTyping). The zoom is driven from the event here and
     *also* asked for explicitly by the tap below, because a browser that gives
     the focus without ever delivering the focus event - which is what a page in
     a hidden/background frame can do - would otherwise leave the zoom off and
     the line it just focused sitting under the keyboard. */
  els.chatInput.addEventListener("focus", () => { Frame.setTyping(true); layoutChatInput(); });
  els.chatInput.addEventListener("blur", () => { Frame.setTyping(false); layoutChatInput(); });
  /* Every signal a soft keyboard has been seen to leave behind for its Enter/send
     key, not just the two obvious ones: `keydown` is what a desktop and most
     Android IMEs send (key "Enter"); a few Android keyboards report the key as
     "Unidentified" and leave only the legacy `keyCode` 13, which is why that is
     asked about too; an IME that ends a composition with a newline delivers it on
     `keypress`; a key that a keyboard routes through the editing pipeline rather
     than through a key event the page can see arrives as `beforeinput` with
     `insertLineBreak`/`insertParagraph` instead; and `keyup` is the last resort
     for a platform that delivers the press but not the compatible keydown (which
     is also why `enterkeyhint="send"` is set, src/gameframe.js#_build). The
     line is sent at most once no matter how many of these fire: sendChatInput
     clears the input, so every later signal in the same press finds an empty line
     and just blurs the (already blurred) box. */
  els.chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); sendChatInput(); }
  });
  els.chatInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
      if (!enterArmed) return;
      enterArmed = false;
      sendChatInput();
    }
  });
  els.chatInput.addEventListener("blur", () => { enterArmed = false; });
  els.chatInput.addEventListener("beforeinput", (e) => {
    if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") sendChatInput();
  });

  /* Typing on a phone, where there is no physical keyboard to start a line
     with: a tap anywhere on the chatbox - the message log, the input line -
     focuses the chat line and so opens the on-screen keyboard. The log itself is
     still scrollable by drag (a press that moves is not a tap), a dialogue still
     owns the chatbox while it is up (its own click handler advances it), and the
     scrollbar keeps its own grip and arrows. Desktop is left exactly as it was:
     there, clicking the log is for reading history.

     The signal is `pointerup` rather than `click`, and that is the point of the
     change: a `click` is a *composed* event that a browser only guarantees for a
     tap it has decided is a click, and it is not delivered at all when some
     other gesture has owned the pointer - a drag of the log, a two-finger
     gesture, a press whose pointer was already released. A player could then be
     left tapping a chatbox that never opened, which is exactly the report this
     is answering (*"make sure that players on mobile are able to type"*).
     Pointer events are delivered for the same tap unconditionally, and the
     pointerup is still inside the user gesture a soft keyboard requires - which
     matters, because a keyboard only opens for a focus asked for *during* a real
     gesture, never for one asked for afterwards. `click` is kept as a last
     resort for a browser with no PointerEvent at all; the two cannot double-send
     anything, they focus the same line. */
  if (DEVICE.touch) {
    const chatLayer = Frame.layers.chat;
    const openLine = () => {
      if (UI.els.chatDialog && !UI.els.chatDialog.hidden) return;
      els.chatInput.focus();
      Frame.setTyping(true);
      layoutChatInput();
    };
    /* A press that turns into a drag is the log being scrolled (or the frame
       being panned), not a tap: the pointer is watched from the press until it
       lifts, and anything that wanders more than a few pixels is abandoned. */
    /* The press is watched in the *capture* phase, because the input's own
       pointerdown handler stops the event from bubbling (it does that so a tap
       on the line cannot also reach the world's own plumbing) - a tap that lands
       on the input itself must still be seen here, or the tap that opens the
       keyboard would be the one tap this handler ignored. */
    let tap = null;
    const sameTap = (e) => tap && tap.id === e.pointerId;
    chatLayer.addEventListener("pointerdown", (e) => {
      tap = null;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest && e.target.closest(".scrollbar")) return;
      tap = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }, true);
    chatLayer.addEventListener("pointermove", (e) => {
      if (!sameTap(e)) return;
      if (Math.abs(e.clientX - tap.x) + Math.abs(e.clientY - tap.y) > 8) tap = null;
    });
    chatLayer.addEventListener("pointerup", (e) => {
      if (!sameTap(e)) { tap = null; return; }
      tap = null;
      openLine();
    });
    chatLayer.addEventListener("pointercancel", () => { tap = null; });
    chatLayer.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".scrollbar")) return;
      openLine();
    });
  }
  layoutChatInput();

  /* Chat dialog. A click advances whatever dialogue is open: the NPC
     conversations own the chatbox while they are up (src/dialogue.js installs
     `UI.chatDialogClick`, exactly the way src/trade.js installs its own hooks),
     and the level-up style "Click here to continue" below falls through to the
     plain close. Without the hook a click on an NPC's line would close the box
     instead of showing the next one. */
  els.chatDialog.addEventListener("click", (e) => {
    if (UI.chatDialogClick && UI.chatDialogClick(e)) return;
    closeChatDialog();
  });

  /* chat mode buttons */
  for (const b of Frame.els.chatButtons) {
    const mode = CHAT_MODES.find((m) => m.key === b.key);
    const el2 = document.createElement("div");
    el2.className = "cmMode";
    el2.style.textAlign = "center";
    b.modeEl = el2;
    if (mode && mode.modes) {
      const cycle = () => {
        UI.chatMode[b.key] = (UI.chatMode[b.key] + 1) % mode.modes.length;
        /* The private-chat mode is not just a local filter: with it off the world
           is told, so a message to us is refused at the sender's end with "That
           player is not online." rather than silently dropped here
           (src/net.js#netSetPrivacy). */
        if (b.key === "private") netSetPrivacy(UI.chatMode.private);
        drawChatModes();
        /* Friends/Off hide the history too, not just new lines - cycling back
           to On brings it back (see refilterPrivHistory). */
        if (b.key === "private") refilterPrivHistory();
      };
      b.el.appendChild(el2);
      /* inside the button's own 124-wide box, so the mode line lands on the
         same pixels the client draws it on */
      place(el2, 0, (mode && mode.modeY) || 31, 124, 12);
      b.el.addEventListener("click", cycle);
      /* The private button's own right-click menu: clear the private history,
         or flip the real Split Private Chat switch (the same setting the
         options panel owns, so the two stay in step). */
      if (b.key === "private") {
        rightMenu(b.el, (e) => {
          openCtx(e.clientX, e.clientY, "Private chat", [
            { label: "Clear messages", fn: () => clearPrivateMessages() },
            { label: "Split private chat (currently " + (settings.splitPrivate ? "on" : "off") + ")", fn: () => toggleOption("splitPrivate") },
            { label: "Cancel", fn: () => {} },
          ]);
        });
      }
    } else {
      b.el.addEventListener("click", () => chat("Abuse reports are not available in this world.", "game"));
    }
  }
  drawChatModes();

  /* tabs */
  Frame.onTabSelect((id) => setTab(id));
  Frame.setSelectedTab(DEFAULT_TAB);
  UI.tab = DEFAULT_TAB;
  renderTab();

  /* the board repaints itself when its log moves, whether or not its tab is
     open (a post from anyone, anywhere, arrives here through the comment
     channel) - src/board.js#Board.onChange */
  Board.onChange(drawBoard);

  /* orbs: hover swaps in the client's "hovered" frame and shows its tooltip,
     and the run orb toggles running */
  for (const b of Frame.index.orbs ? Frame.index.orbs.buttons : []) {
    const orb = els[b.key + "Orb"], fr = els[b.key + "Frame"];
    if (!orb) continue;
    orb.addEventListener("pointerenter", () => {
      if (fr) Frame.setBg(fr, "orbFrameHover");
      showHoverTip(orbTip(b.key), "orb");
    });
    orb.addEventListener("pointerleave", () => {
      if (fr) Frame.setBg(fr, "orbFrame");
      hideHoverTip("orb");
    });
  }
  els.runOrb.addEventListener("click", toggleRun);
  els.hpOrb.addEventListener("click", () => chat("Hitpoints: " + Math.round(UI.ps.hp) + " / " + UI.ps.maxHp, "game"));
  /* The prayer orb runs the quick prayers, and its right-click is the menu the
     live game offers there (see toggleQuickPrayers / openQuickSetup). */
  if (els.prayOrb) {
    els.prayOrb.addEventListener("click", () => toggleQuickPrayers());
    rightMenu(els.prayOrb, (e) => {
      const on = quickActive(UI.ps);
      openCtx(e.clientX, e.clientY, "Prayer", [
        { label: (on ? "Deactivate" : "Activate") + " quick prayers", fn: () => toggleQuickPrayers() },
        { label: "Setup quick-prayers", fn: () => openQuickSetup() },
      ]);
    });
  }
  /* minimap + compass */
  initMinimap();
  els.minimap.addEventListener("click", (e) => { if (e.button !== 0) return; minimapClick(e.clientX, e.clientY, e); });
  rightMenu(els.minimap, (e) => minimapClick(e.clientX, e.clientY, e));
  if (Frame.els.compassHit) {
    Frame.els.compassHit.addEventListener("click", resetCameraNorth);
    Frame.els.compassHit.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  drawMinimap();
  drawCompass();

  /* global keyboard + pointer plumbing */
  window.addEventListener("click", (e) => {
    if (UI.longPressMenuAt && performance.now() - UI.longPressMenuAt < 800) {
      UI.longPressMenuAt = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  window.addEventListener("pointerdown", (e) => {
    if (!els.ctxMenu.hidden && !els.ctxMenu.contains(e.target)) hideCtx();
    if (!els.hoverTip.hidden && !e.target.closest(".slot")) hideHoverTip();
  }, true);

  els.modalLayer.addEventListener("pointerdown", (e) => {
    if (e.target !== els.modalLayer) return;
    closeModal();
    if (e.button !== 0) return;
    if (FullIface.open) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slot = el && el.closest ? el.closest(".invGrid .slot") : null;
    if (!slot) return;
    const index = Number(slot.dataset.index);
    if (!Number.isFinite(index)) return;
    if (UI.actions.leftClick) { UI.actions.leftClick("inv", index); return; }
    defaultLeftClick("inv", index);
  });

  /* The item in the hand rides the pointer. `clientX/clientY` and a `position:
     fixed` element, because the pointer can be over the frame, over the chatbox
     or over the page around them and the icon should sit in the same place
     relative to it in all three. */
  window.addEventListener("pointermove", (e) => {
    /* The world menu belongs to the pointer that opened it: move the mouse off
       the menu and it is gone (the user's ask, 2026-09-23: "right click menu
       needs to disappear when you mouse away"). The menu is laid out with the
       cursor on its top edge and centred on it (see `openCtx`), so the pointer
       starts *inside* it and only leaves when the mouse truly moves away - and
       dragging down on to an option keeps it, which is what a menu is for. A
       pointer that has left the window entirely (`pointerleave` on the frame)
       reports its last position, so the rect test is the one that matters. */
    if (els.ctxMenu.hidden) {
      if (UI.ctxHideTimer) { clearTimeout(UI.ctxHideTimer); UI.ctxHideTimer = null; }
      return;
    }
    const r = els.ctxMenu.getBoundingClientRect();
    const pad = 2;
    const outside = e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad;
    if (!outside) {
      if (UI.ctxHideTimer) { clearTimeout(UI.ctxHideTimer); UI.ctxHideTimer = null; }
      return;
    }
    if (!UI.ctxHideTimer) UI.ctxHideTimer = setTimeout(() => { UI.ctxHideTimer = null; hideCtx(); }, 150);
  });

  window.addEventListener("keydown", (e) => {
    const p = UI.pendingAmount;
    if (!p) return;
    if (e.target === UI.amountInput) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); confirmPendingAmount(); return; }
    if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); p.buffer = (p.buffer || "").slice(0, -1); redrawAmountDialogue(); return; }
    if (e.key && /^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); if ((p.buffer || "").length < 10) { p.buffer = (p.buffer || "") + e.key; redrawAmountDialogue(); } return; }
  }, true);
  window.addEventListener("keydown", (e) => {
    const typing = document.activeElement && (document.activeElement.tagName === "INPUT");
    if (e.key === "Escape") {
      /* the item in the hand comes off first: a use is the innermost mode,
         and Escape backs out of it before it closes anything behind it */
      cancelUse();
      hideCtx();
      hideHoverTip();
      if (!els.modalLayer.hidden) { closeModal(); return; }
      if (!els.chatDialog.hidden) { closeChatDialog(); return; }
      if (FullIface.open) { FullIface.hide(); return; }
      /* and a private message being written is the next thing up: with the
         chatbox blurred (the player clicked back onto the world) the line has no
         visible sign of it any more, so Escape is what hands it back to public
         chat (src/ui.js#stopPM; the focused case is the input's own handler,
         which stops the event before it reaches here). */
      if (UI.pmTarget) { stopPM(); return; }
    }
    if (e.key === "Enter" && !typing && !UI.pendingAmount) {
      els.chatInput.focus();
      e.preventDefault();
      return;
    }
    /* Tab to reply from outside the chat line: open a compose to whoever DM'd
       last. Skipped while a modal, dialogue or full interface owns the
       keyboard (Tab still navigates those) and while the chat line itself is
       focused (the input's own handler answers there). */
    if (e.key === "Tab" && settings.tabToReply && UI.lastPM && !typing && !UI.pendingAmount && !UI.pendingName) {
      if (els.modalLayer && !els.modalLayer.hidden) return;
      if (els.chatDialog && !els.chatDialog.hidden) return;
      if (FullIface.open) return;
      e.preventDefault();
      messageFriend(UI.lastPM);
      return;
    }
    /* Typing is enough to start a line: the first printable character opens the
       chatbox with that character already in it and Enter sends it, so you no
       longer press Enter once to open the line and again to send (user request:
       "we don't have to press enter to chat"). Space is left out - an idle tap
       on it should not begin a message - and a production modal never blocks
       it, so a smithing box open over the 3D view leaves the chat line working
       (user request: popups never take over the chatbox's keyboard). Holding
       ctrl/alt/meta (browser shortcuts) is left alone. Letters reach the
       chatbox and not the camera because the camera keys are now the arrows
       alone (see game.js#updateVisuals). */
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && e.key !== " " && !UI.pendingAmount) {
      const input = els.chatInput;
      input.value += e.key;
      input.focus();
      const n = input.value.length;
      input.setSelectionRange(n, n);
      layoutChatInput();
      e.preventDefault();
    }
  });

  els.sideBody.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", () => { /* the frame transform handles it */ });

  applySettings();
  updateOrbs();
  UI.ready = true;

  /* anything the rest of the game said while the UI was still being built */
  const queued = UI.pendingChat.splice(0);
  chat("Welcome to Old School Webscape.", "game");
  for (const [m, c, n, mod, o] of queued) chat(m, c, n, mod, o);
  chat("Left-click the world to walk. Look around with the arrow keys, or hold Ctrl and right-drag. Wheel to zoom.", "game");
  chat("Start typing to chat, Enter to send. Type ::help to see the sandbox commands.", "game");
}

function drawChatModes() {
  for (const b of Frame.els.chatButtons || []) {
    if (!b.modeEl) continue;
    const mode = CHAT_MODES.find((m) => m.key === b.key);
    if (!mode || !mode.modes) { b.modeEl.textContent = ""; continue; }
    const m = mode.modes[UI.chatMode[b.key] || 0];
    b.modeEl.textContent = m[0];
    b.modeEl.style.color = m[1];
    b.label.textContent = mode.label;
  }
}

export { findItemId, biomeName };

/* --------------------------------------------------------------------- kit

   The handful of private helpers a *separate* interface module needs in order
   to be built the same way the panels in this file are (src/trade.js is the
   only caller). Anything already exported is passed by reference rather than
   re-exported, and nothing here is stateful, so a module that takes the kit
   cannot reach into this file's internals by accident. */
export const kit = {
  mk, place, spriteEl, tileEl,
  pxSprite, pxTiled, pxText, pxRich, pxRect, pxFrame, pxHit,
  itemIcon, iconUrl, hoverHTML, bindItemSlot,
  showHoverTip, hideHoverTip,
  openCtx, hideCtx, chat, mark,
  Frame, UI, FullIface,
};
