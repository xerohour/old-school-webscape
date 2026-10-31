/* ===========================================================================
   charname.js — the name step: the screen between designing a character and
   walking into the world.

   The client has no such screen. It did not need one: in 2007 a character *was*
   its login name, typed into the website before the game ever started. This
   world has no website, so a character made here would otherwise be named after
   the generator that hosts it (`createPlayerState(window.generatorName)`,
   src/game.js) - every player on the shard called the same thing. So the design
   screen is followed by this one, and the name it takes is the character's own:
   the name over their head in the world, the name the roster lists them under
   (src/net.js), the name their own chat lines are signed with (src/ui.js#chat),
   and the name they can register under later.

   ## What it is built from

   The same iron window as the design screen (cache interface 269). That layout
   is `src/data/char-design.json`, baked component for component out of the
   cache, and this screen draws all of its *chrome* - the dialogBack plates that
   make up the window, the rivet corners and edges, the little riveted frame
   round the Accept plate and the Accept plate itself - and leaves out its
   controls: the sixteen arrow pairs, the two gender buttons, the label column
   and the cache's own title. So the two steps read as one screen: the same
   window, the same character still standing in it, the same Accept button in
   the same place, drawn from the same data rather than redrawn by hand. The
   preview is the design screen's own - the look just accepted, swaying on the
   same clock (see `_paint`).

   ## The name itself

   Three to twelve letters, digits or underscores (src/player.js#nameError),
   which is the world's *account* rule - deliberately, because the name chosen
   here is the name the character can be registered under later, and "log in to
   save your character" is a promise the name has to be able to keep. The arrows
   either side of the field roll a random name out of main.pjs's two word lists
   (see `rollName` below); the field takes a typed one.

   At creation the field opens **empty**, with "Type your name here" in it and
   the hint above it saying so: a rolled name already filled in reads as a label
   rather than as something to type, and typing a name is what this screen is
   for (the arrows are the shortcut, not the point). A player who accepts the
   empty box is refused, in the line under it, with the two ways forward named.
   The screen is not a one-off, either: `::name` reopens it at any time, and the
   line under the field says the same thing - the name can be changed later -
   which is also what the chat prints when a name is taken.

   Enter is Accept; Escape backs out, but only when the screen was opened in-game
   (`::name`) - at creation there is no way out but Accept, exactly like the
   design screen it follows.

   ## When it is shown

   src/main.js asks `needsNaming()` under the welcome screen's play button, after
   the design screen and before the world: a character is named once. `::name`
   opens it again afterwards. A character with an account behind it is never
   asked: an account's name *is* its character's name (src/net.js), so there is
   nothing to choose.
   =========================================================================== */

import { Frame, VIEWPORT } from "./gameframe.js";
import { kit } from "./ui.js";
import { Game } from "./game.js";
import { saveGame } from "./save.js";
import { Net, netRefreshName } from "./net.js";
import { nameError } from "./player.js";
import { appearanceFromKey, appearanceKey, defaultAppearance, buildKitBody, kitsReady } from "./identikits.js";
import { makeModelCharacter } from "./models3d.js";
import { fetchBakedJSON } from "./baked.js";
import { acceptPlate, nameStage, drawStage } from "./dollstage.js";

const { mk, place, pxSprite, pxText, pxRich, pxHit, pxRect, hideHoverTip, chat, mark, UI } = kit;

const DATA_URL = "src/data/char-design.json";

/* The parts of interface 269 that are the window rather than its controls. Every
   sprite in the baked screen is one or the other, and this is the whole of the
   first set: the plate the window is made of, the four rivet corners, the two
   rivet edges and the two tiled rivet strips. (The Accept plate's own little
   frame - four more corners and two strips, placed round the button - is in
   here too, and draws in its cache position, over the character's feet, exactly
   as it does on the design screen.) */
const CHROME = new Set([
  "dialogBack",
  "rivetCornerTopLeft", "rivetCornerTopRight", "rivetCornerBottomLeft", "rivetCornerBottomRight",
  "rivetEdgeTop", "rivetEdgeRight", "ironRivetsVertical", "ironRivetsHorizontal",
]);

/* The cache's action id for Accept (tools/cache-bake/design-bake-run.mjs). */
const A_ACCEPT = 326;

/* The preview's motion: the design screen's own numbers, so a player who goes
   straight from one screen to the other sees the same turn of the same body. */
const PREVIEW_TILT = (150 / 2048) * Math.PI * 2;
const PREVIEW_SWAY = (256 / 2048) * Math.PI * 2;
const PREVIEW_RATE = 1.25;

/* The name row, in the window's own pixels: the field on the centre line, one of
   the cache's arrow buttons either side of it, and the label above. The arrows
   are placed on the field's own centre line, so they sit on the same rhythm as
   the design screen's arrow rows. The whole column is drawn higher up the window
   than it first was, because the figure below it is now the size the reference
   gives it (src/dollstage.js) and needs the room: title, hint, label, field and
   the status line all end above y 146, and the character stands clear of them. */
const TITLE = { x: 17, y: 8, w: 478, h: 36 };
const HINT = { x: 17, y: 46, w: 478, h: 30 };
const LABEL = { x: 156, y: 78, w: 200, h: 13 };
const FIELD = { x: 156, y: 96, w: 200, h: 30 };
const BACK = { x: 105, y: 93 };
const FWD = { x: 362, y: 93 };
/* The line under the field: wide enough for the longest sentence either of its
   two jobs has to fit on one line - the "you can change it later" note and the
   longest refusal (both measured at plain11's advance). */
const STATUS = { x: 96, y: 131, w: 320, h: 14 };

/* What the field says while it is empty: the whole point of this screen is that
   the player may type their own name (the arrows are the alternative), and an
   empty box with a written invitation is what makes that obvious. */
const PLACEHOLDER = "Type your name here";

/* Where the figure's band starts: everything this screen writes is above it
   (the status line is the last of it), and the Accept plate is below. */
const FIGURE_TOP = STATUS.y + STATUS.h + 2;

/* The interface colours the cache's own screen uses: its title's orange, its
   labels' white and its Accept label's green. */
const TITLE_COLOR = "#ff981f";
const LABEL_COLOR = "#ffffff";
const ACCEPT_COLOR = "#00c000";
const ERROR_COLOR = "#ff0000";
/* The client's own prose colour: hints and notes are yellow, refusals red. */
const NOTE_COLOR = "#ffff00";
const NOTE = "You can change this later - just type ::name";

const USER_FONT_PX = ["15px rs-quill8", "12px rs-plain12", "12px rs-bold12", "12px rs-plain11"];

const hex = (n) => "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");

/* ------------------------------------------------------------ random names

   The two word lists are the world's own configuration (main.pjs, "character
   names"), read off `root` the way the rest of the config is (src/player.js
   reads its own the same way): a perchance list's items come out of `selectAll`,
   each item's `evaluateItem` being its raw string. A missing or empty list is
   not an error - it just leaves the fallback below. */
function configWords(name) {
  const store = typeof root !== "undefined" ? root : null;
  const node = store ? store[name] : null;
  if (!node || !node.selectAll) return null;
  const out = [];
  for (const item of node.selectAll) {
    const s = item && item.evaluateItem;
    if (typeof s === "string" && s.trim()) out.push(s.trim());
  }
  return out.length ? out : null;
}

/* What a character is called if main.pjs's word lists are empty - a name the
   screen will still accept, so the step can never be a dead end. */
const FALLBACK_NAME = "Adventurer";

/* Every pair of words that makes a usable name, built once. `nameError` is the
   same rule the screen checks a typed name against, so a name this offers can
   never be one the screen would refuse - which is why the pairs are filtered
   here rather than rolled and hoped for (a long first word and a long second one
   simply never appear). */
let pool = null;
function namePool() {
  if (pool) return pool;
  const first = configWords("nameFirst");
  const second = configWords("nameSecond");
  const out = [];
  if (first && second) {
    for (const a of first) {
      for (const b of second) {
        const name = a + b;
        if (!nameError(name)) out.push(name);
      }
    }
  }
  if (!out.length) out.push(FALLBACK_NAME);
  pool = out;
  return pool;
}

/* A fresh roll. `notThis` is the name already in the field, so pressing an
   arrow always visibly changes it - a roll that came back with the same name
   would read as a dead button. */
function rollName(notThis) {
  const p = namePool();
  for (let i = 0; i < 8; i++) {
    const name = p[Math.floor(Math.random() * p.length)];
    if (name !== notThis) return name;
  }
  return p[0];
}

export const NameScreen = {
  data: null,
  game: null,
  layer: null,
  /** the look being shown, as an appearance object (src/identikits.js) */
  appearance: null,
  preview: null,
  previewKey: null,
  /** the canvas box + framing the figure is drawn with (src/dollstage.js) */
  stage: null,
  canvas: null,
  input: null,
  statusEl: null,
  noteEl: null,
  up: false,
  creating: false,
  _onAccept: null,
  _hooked: false,
  /** resolved when the baked screen has been fetched, built and is drawable */
  ready: null,

  async init({ game }) {
    this.game = game;
    this.data = await fetchBakedJSON(DATA_URL);
    /* The frame's bitmap faces are webfonts and the labels are placed against
       their metrics (ui.js#PX_FONTS), so nothing may be built before they are
       there or the first paint is measured in a fallback face. */
    await Promise.all(USER_FONT_PX.map((f) => document.fonts.load(f).catch(() => {})));
    this._build();
    /* The preview is repainted before the world is drawn, the same hook the
       design screen and the worn-equipment doll use, chained rather than
       taken. */
    if (game.hooks && !this._hooked) {
      this._hooked = true;
      const prior = game.hooks.beforeRender;
      game.hooks.beforeRender = () => {
        if (prior) prior();
        if (this.up) this._paint();
      };
    }
    return this;
  },

  _build() {
    /* The cache lays interface 269 out to fill the 512x334 game view, so this
       screen is a clipped box over the view - the chrome, the side panel and the
       chatbox stay visible around it, exactly as they do around the design
       screen and the bank. */
    const layer = mk("div", "nameIface");
    layer.style.background = this.data.background || "#000000";
    layer.hidden = true;
    place(layer, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    Frame.layers.overlay.appendChild(layer);
    this.layer = layer;

    /* The Accept plate and the model widget are found *before* anything is
       drawn. The parts arrive in component order and the widget (98) comes
       before the plate (99), so a plate looked up inside the loop is still null
       by the time the widget is reached - which is how the figure ended up on
       the widget's own full-height box and standing low in the window. The plate
       is also what the figure's feet are placed against, so it has to be known
       first in any case. */
    const plate = acceptPlate(this.data, A_ACCEPT);
    /* The plate's own label is the cache's text widget laid over it - found by
       its box rather than by its component number, so the two can never be
       separated by a rebake. */
    const plateLabel = plate ? this.data.parts.find((q) => q.type === 4
      && q.x >= plate.x - 4 && q.x <= plate.x + plate.w
      && q.y >= plate.y - 4 && q.y <= plate.y + plate.h) : null;
    /* The stage the character stands on: the same window as the design screen,
       but with this screen's own title, hint, label and field across its top, so
       the figure stands in the free band between the status line and the Accept
       plate (src/dollstage.js). */
    const stage = nameStage(this.data, A_ACCEPT, FIGURE_TOP);
    this.stage = stage;

    /* The cache's own parts in the cache's own order, which is also its draw
       order: the window's chrome, the model widget (a canvas the renderer paints
       the character into) and then the Accept plate over the character's feet.
       Everything else in the interface is a control this screen does not use and
       draws its own version of, so it is skipped here - the plate itself is
       drawn after the loop, where that draw order puts it. */
    for (const p of this.data.parts) {
      if (p.type === 3 && p.action === A_ACCEPT) continue;
      if (p.type === 5) {
        if (CHROME.has(p.sprite)) pxSprite(layer, p.sprite, p.x, p.y);
        continue;
      }
      if (p.type === 6) {
        if (!stage) continue;
        const c = mk("canvas", "designDoll");
        c.width = stage.w;
        c.height = stage.h;
        place(c, stage.x, stage.y, stage.w, stage.h);
        layer.appendChild(c);
        this.canvas = c;
      }
    }

    /* This screen's own texts, in the cache's own widget boxes - the title box
       the design screen's "Welcome to ..." fills, and the label line under it.
       `pxRich` rather than `pxText` for the title and the hint, because it is
       the interface text widget that carries a line break (the design screen's
       own title is a two-line widget too). The hint leads with the box rather
       than with the arrows: a name is typed here first, and rolling one is the
       shortcut. */
    pxRich(layer, this.gameTitle() + "<br>Choose the name other players will see.", TITLE.x, TITLE.y, TITLE.w, TITLE.h, {
      font: "bold12", color: TITLE_COLOR, align: 1, valign: 1,
    });
    pxRich(layer, "Click the box below and type your own name,<br>or click an arrow to roll a random one.",
      HINT.x, HINT.y, HINT.w, HINT.h, {
        font: "plain11", color: LABEL_COLOR, align: 1, lineHeight: 14,
      });
    pxText(layer, "Name", LABEL.x, LABEL.y, LABEL.w, LABEL.h, {
      font: "plain11", color: LABEL_COLOR, align: 1,
    });

    /* The field: a dark well with the client's own bevel, drawn as a black plate
       under the input so the input's translucent-looking colours have something
       to sit on, exactly as the account panel's fields do inside their modal. */
    pxRect(layer, FIELD.x - 2, FIELD.y - 2, FIELD.w + 4, FIELD.h + 4, "#0a0a0a");
    const input = mk("input", "nameEntryField");
    input.type = "text";
    input.maxLength = 12;
    /* Empty with a written invitation is what makes "you can type here" plain;
       a rolled name sitting in the box reads as a label (the slot the arrows
       fill is the same one). */
    input.placeholder = PLACEHOLDER;
    input.spellcheck = false;
    input.autocomplete = "off";
    place(input, FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    input.addEventListener("input", () => this._say(""));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.accept(); }
      /* A keystroke in this field is this field's: the rest of the interface
         listens on `window` (the chatbox opens itself on the first printable
         character, the arrows turn the camera), and a name being typed is not a
         message or a camera move. The caret keeps its own arrow keys - the event
         is only stopped from travelling on. */
      e.stopPropagation();
    });
    layer.appendChild(input);
    this.input = input;

    this.statusEl = pxText(layer, "", STATUS.x, STATUS.y, STATUS.w, STATUS.h, {
      font: "plain11", color: ERROR_COLOR, align: 1,
    });
    /* The line under the field says what the box is for while there is nothing
       to refuse - that the name is the character's own and can be changed again
       later (`::name` reopens this screen). A refusal replaces it (see _say). */
    this.noteEl = pxText(layer, NOTE, STATUS.x, STATUS.y, STATUS.w, STATUS.h, {
      font: "plain11", color: NOTE_COLOR, align: 1,
    });
    this._say("");

    /* The two roll buttons are the cache's own arrow sprites, at the field's
       left and right. Their tips are the arrows' own tooltip (the cache carries
       none, so this is ours, the way the welcome screen's hover text is). */
    for (const [at, tip] of [[BACK, "Roll a random name"], [FWD, "Roll a random name"]]) {
      pxSprite(layer, at === BACK ? "backArrow" : "forwardArrow", at.x, at.y);
      pxHit(layer, at.x, at.y, 45, 36, tip, () => this._roll());
    }

    if (plate) {
      pxRect(layer, plate.x, plate.y, plate.w, plate.h, hex(plate.colour == null ? 0 : plate.colour));
      if (plateLabel) {
        pxText(layer, this._world(plateLabel.text || "Accept"), plateLabel.x, plateLabel.y, plateLabel.w, plateLabel.h, {
          font: plateLabel.font || "plain12",
          color: hex(plateLabel.colour == null ? 0x00c000 : plateLabel.colour),
          align: plateLabel.align === "center" ? 1 : plateLabel.align === "right" ? 2 : 0,
          valign: plateLabel.valign === "center" ? 1 : plateLabel.valign === "bottom" ? 2 : 0,
        });
      } else {
        pxText(layer, "Accept", plate.x, plate.y, plate.w, plate.h, { font: "plain12", color: ACCEPT_COLOR, align: 1, valign: 1 });
      }
      pxHit(layer, plate.x, plate.y, plate.w, plate.h, null, () => this.accept());
    }

    /* At creation the client has no way out of the design screen but Accept, and
       neither has this one; in-game (`::name`) Escape backs out and leaves the
       name as it was. Enter is Accept from anywhere on the screen, not just from
       the field - a keyboard player is not being asked to find the mouse. */
    window.addEventListener("keydown", (e) => {
      if (!this.up) return;
      if (e.key === "Escape") {
        if (this.creating) return;
        e.preventDefault();
        this.hide();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this.accept();
      }
    });
  },

  /* The world's name, for the title (main.pjs `gameTitle`, the same source the
     welcome screen and the loading card read). */
  gameTitle() {
    const configured = typeof root !== "undefined" && root && root.gameTitle;
    return "Welcome to " + (configured ? String(configured) : "RuneScape");
  },

  /* The cache's own strings, with this world's name in place of the client's -
     the Accept label carries none, but the same helper as the design screen's
     keeps the two screens' handling of cache text identical. */
  _world(s) {
    if (s.indexOf("RuneScape") < 0) return s;
    const configured = typeof root !== "undefined" && root && root.gameTitle;
    return s.replace("RuneScape", configured ? String(configured) : "RuneScape");
  },

  /* A character who has never chosen a look is wearing one of the two baked
     bodies by name, not a kit key; the design screen's own seed turns that into
     the look this screen shows (and a character who has just come from the
     design screen is already a kit key). */
  _seedAppearance() {
    const fromKey = appearanceFromKey(Game.playerAppearance);
    if (fromKey) return fromKey;
    const cur = String(Game.playerAppearance || "");
    return defaultAppearance(cur.indexOf("female") >= 0 ? "female" : "male");
  },

  /* Has the character been through this screen? The boot names a new character
     after the *generator* (`createPlayerState(window.generatorName || "Player")`,
     src/game.js) and only this screen (or an account, src/net.js) marks the name
     as the character's own, so the flag is what is read - a name that merely
     *looks* like one must not be mistaken for a name that was chosen. */
  needsNaming() {
    if (Net.account) return false;         /* the account names the character */
    const ps = Game.ps;
    return !ps || !ps.named;
  },

  /** Open the screen. `onAccept` runs when Accept is pressed (and only then);
      `creating` marks the pre-game visit, which has no way out but Accept. */
  show({ onAccept, creating = false } = {}) {
    if (!this.layer || !kitsReady()) return false;
    /* A character with an account is named by it, so there is nothing to choose
       (src/net.js#setCharacterName) - and letting the two drift apart would put
       one name over the character's head and another on their account. */
    if (Net.account) {
      if (!creating) chat("Your name is your account's name. Log out to play under another one.", "warn");
      return false;
    }
    this.creating = !!creating;
    this._onAccept = onAccept || null;
    this.appearance = this._seedAppearance();
    this.previewKey = null;
    this._rebuild();
    /* What the field starts on. A character with a name of its own opens on it -
       the screen was opened to change it, and `::name` on a character called
       Ravenwing must not open on a random word - selected, so the first thing
       typed replaces it. A character with no name yet opens on an *empty* field:
       an empty box saying "Type your name here" is what tells a player the name
       is theirs to type, where a rolled name sitting in the same slot reads as a
       label. The arrows are one click away for anyone who would rather not think
       of a name. */
    const ps = this.game.ps;
    const cur = ps ? String(ps.name || "") : "";
    const named = ps && ps.named && !nameError(cur);
    if (this.input) this.input.value = named ? cur : "";
    this._say("");
    this.layer.hidden = false;
    this.up = true;
    this.game.pointer = null;
    Frame.root.classList.add("titleup");
    this._paint();
    if (this.input) {
      this.input.focus();
      if (this.input.value) this.input.select();
    }
    return true;
  },

  hide() {
    if (!this.layer || !this.up) return;
    this.up = false;
    this.layer.hidden = true;
    Frame.root.classList.remove("titleup");
    hideHoverTip();
    if (this.input) this.input.blur();
    this._onAccept = null;
  },

  /* Roll a new name into the field. */
  _roll() {
    if (!this.input) return;
    this.input.value = rollName(this.input.value.trim());
    this._say("");
    this.input.focus();
  },

  /* The status line under the field: an empty string clears it (every keystroke
     and every roll does that), anything else is a refusal to show - and the
     "you can change it later" note is what lives in that line when there is no
     refusal to show, rather than an empty line nobody can read anything from. */
  _say(text) {
    if (this.statusEl) this.statusEl.textContent = text || "";
    if (this.noteEl) this.noteEl.style.visibility = text ? "hidden" : "";
  },

  /* Accept: the name becomes the character's own. */
  accept() {
    if (!this.up || !this.input) return;
    const name = this.input.value.trim();
    if (!name) {
      /* An empty box is not a name, and rolling one is the way out - the field
         opened empty on purpose, so this refusal is the one a player who wants a
         random name will actually meet. */
      this._say("Type a name first, or click an arrow to roll one.");
      this.input.focus();
      return;
    }
    const bad = nameError(name);
    if (bad) {
      this._say(bad);
      this.input.focus();
      return;
    }
    const ps = this.game.ps;
    ps.name = name;
    ps.named = true;
    const next = this._onAccept;
    this.hide();
    /* The name is part of the character from here on, so it is written at once
       rather than at the next autosave: a reload a moment later must not offer
       to name the character again. Quiet and fire-and-forget - the character is
       playable either way. */
    saveGame(this.game, true, true);
    /* and the world is told before anyone reads the old name off the roster */
    netRefreshName();
    mark("online");
    chat("You are known as " + name + ". You can change it later by typing ::name.", "game");
    if (next) next();
  },

  /* One character render per look, rebuilt when the look changes - the same
     lifetime the design screen's own preview has (src/design.js#_rebuild). */
  _rebuild() {
    if (!this.canvas) return;
    const key = this.appearance ? appearanceKey(this.appearance) : null;
    const built = key && kitsReady() ? buildKitBody(key) : null;
    const ch = built ? makeModelCharacter(built) : null;
    if (this.preview) this.preview.dispose();
    this.preview = ch;
    this.previewKey = key;
  },

  _paint() {
    if (!this.canvas || !this.preview || !this.preview.mesh) return;
    const t = performance.now() / 1000;
    const yaw = Math.sin(t * PREVIEW_RATE) * PREVIEW_SWAY;
    drawStage(this.game.view, this.preview.mesh, this.canvas, this.stage, yaw, PREVIEW_TILT);
  },
};

/* Wired once from src/main.js, the way the other interface modules of this kind
   are (src/design.js#initDesign, src/skydrop.js#initSkyDrops). The command parser
   in src/ui.js owns `::name` and cannot import this module without a cycle (this
   one reads ui.js's `kit`), so it calls the hook instead, and `NameScreen.ready`
   is what a caller waits on - the same 13 KB interface fetch the design screen
   already makes, and the play button is reachable while it is still in flight. */
export function initNameScreen(game) {
  NameScreen.ready = NameScreen.init({ game });
  UI.openNameScreen = () => {
    if (!NameScreen.layer) {
      NameScreen.ready.then(() => NameScreen.show());
      return true;
    }
    if (!kitsReady()) {
      chat("Loading the character-design data...", "game");
      return false;
    }
    return NameScreen.show();
  };
  return NameScreen;
}
