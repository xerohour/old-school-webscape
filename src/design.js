/* ===========================================================================
   design.js — the client's character-design screen: cache interface 269.

   This is the screen the real client puts in front of a brand-new account:
   "Welcome to RuneScape / Use the buttons below to design your player", with a
   live character standing in the middle of a riveted iron window, seven arrow
   rows down the left (Head, Jaw, Torso, Arms, Hands, Legs, Feet), five down the
   right (Hair, Torso, Legs, Feet, Skin), a Male/Female pair of buttons and
   Accept. `src/data/char-design.json` is that interface, component for
   component, baked straight out of the cache by
   `tools/cache-bake/design-bake-run.mjs` (recipe in the cache-bake README);
   this module draws every piece where the cache says and nothing else.

   ## What the cache carries, and what is ours

   The layout is entirely the cache's - 140 components, in the cache's own draw
   order, including the two rivet strips that happen to fall inside the model
   widget's box and therefore draw *over* the character, exactly as they do in
   the client. What the cache does not carry is the look itself: the body is
   seven identity-kit parts plus five colours (src/identikits.js), and the
   screen's own behaviour is the cache's `anInt214` action ids, which the bake
   wrote out as `action`:

     300-313  the design rows - `(action - 300) >> 1` is the body part and the
              low bit the direction (even = back, odd = forward)
     314-323  the colour rows the same way, in the design screen's own order
     324,325  male and female
     326      accept
     327      the model widget, which shows the look being designed

   Two client rules are worth writing down because they are not guessable from
   the layout:

   * **switching gender re-picks the whole body.** The client's gender buttons
     call `method45`, which sets each of the seven parts to the first choosable
     kit of that part *for the new gender* and keeps the five colour choices.
     It is not a "swap the body under the same choices" operation, because a
     female has no beard and the two bodies' kit buckets are not aligned;
   * **the preview sways rather than spins.** The client sets the widget's
     rotation each cycle to `sin(cycle / 40) * 256` of the client's 2048 units
     of a turn, which at its 50 cycles a second is a 45-degree sway on a five
     second cycle, over a fixed 150-unit tilt carried by the widget itself
     (`rotX` in the data file).

   ## Where it sits, and how it is reached

   The cache lays this screen out to *fill the game view*: its plates span
   (12,4) to (500,320) of a 512x334 window, exactly the way the bank's and the
   shop's do. So it is drawn as a full interface over the game view - a black
   box the size of the view, its components at their own coordinates inside it,
   clipped to it (the cache puts a few rivets at x -3 and y -11, which the
   client's own clip cuts off, and so does this) - and the frame chrome, the
   side panel and the chatbox stay visible around it, exactly as they do around
   the bank. Behind the box is the black the client shows at account creation,
   because the world has not been drawn yet.

   Pressing play on the welcome screen leads here for a character who has never
   designed one (the Accept button then carries on into the world); `::design`
   opens it on demand in-game, where Escape backs out without applying anything.
   =========================================================================== */

import { Frame, VIEWPORT } from "./gameframe.js";
import { kit } from "./ui.js";
import {
  BODY_PARTS, COLOUR_ORDER, defaultAppearance, appearanceKey, appearanceFromKey,
  cycleKit, cycleColour, buildKitBody, kitsReady, loadIdentityKits, isKitKey,
} from "./identikits.js";
import { makeModelCharacter } from "./models3d.js";
import { fetchBakedJSON } from "./baked.js";
import { designStage, drawStage } from "./dollstage.js";
import { Game, setPlayerAppearance } from "./game.js";
import { Net } from "./net.js";

const { mk, place, pxSprite, pxRich, pxRect, pxHit, hideHoverTip, chat, UI } = kit;

const DATA_URL = "src/data/char-design.json";

/* The action ids the cache hangs the screen's behaviour off (see
   tools/cache-bake/design-bake-run.mjs#DESIGN_ACTIONS). */
const A_DESIGN_FIRST = 300;
const A_DESIGN_LAST = 313;
const A_COLOUR_FIRST = 314;
const A_COLOUR_LAST = 323;
const A_MALE = 324;
const A_FEMALE = 325;
const A_ACCEPT = 326;

/* The preview's motion, in the client's own numbers: a tilt of 150 of its 2048
   units of a turn carried by the widget (the cache's rotX), and a sway of
   sin(cycle / 40) * 256 units, i.e. one cycle per 2 * pi * 40 of the client's
   20ms cycles - 1.25 radians a second here, straight off the wall clock. */
const PREVIEW_TILT = (150 / 2048) * Math.PI * 2;
const PREVIEW_SWAY = (256 / 2048) * Math.PI * 2;
const PREVIEW_RATE = 1.25;

/* The component whose text is the screen's title, and the one whose text is its
   "Welcome to X" line - the cache's own strings, with the world's name in place
   of the client's (exactly as the welcome screen does it). */
const TITLE_PART = 97;

const USER_FONT_PX = ["15px rs-quill8", "12px rs-plain12", "12px rs-bold12", "12px rs-plain11"];

const hex = (n) => "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");

export const DesignScreen = {
  data: null,
  game: null,
  layer: null,
  /** the look being designed, as an appearance object (src/identikits.js) */
  appearance: null,
  /** the character render standing in the model widget */
  preview: null,
  previewKey: null,
  /** the canvas box + framing the figure is drawn with (src/dollstage.js) */
  stage: null,
  canvas: null,
  /** the sprite element of each gender button, so the selected one can light up */
  genderEls: {},
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
    /* The preview is repainted before the world view is drawn, the same hook the
       worn-equipment doll uses - and chained rather than taken, so both can be
       on the same frame (a design screen cannot be up at the same time as the
       stats window, but nothing here should depend on that). */
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
    /* The interface fills the game view, so that is the box it is drawn in -
       the same 512x334 window the bank and the shop are drawn in, with the
       client's black behind the character. Everything outside it (the chrome,
       the side panel, the chatbox) is left alone. */
    const layer = mk("div", "designIface");
    layer.style.background = this.data.background || "#000000";
    layer.hidden = true;
    place(layer, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    Frame.layers.overlay.appendChild(layer);
    this.layer = layer;

    /* The stage the character stands on (src/dollstage.js), computed before the
       parts are drawn because the canvas box and the framing both come out of
       it. */
    this.stage = designStage(this.data, A_ACCEPT);

    /* The components are drawn in the cache's own order, which is also the
       client's draw order - so the two rivet strips that sit inside the model
       widget's box land on top of the character, and the Accept plate, its
       label and its rivets land on top of everything, exactly as they do. */
    for (const p of this.data.parts) {
      if (p.type === 5) {
        const e = pxSprite(layer, p.sprite, p.x, p.y);
        if (p.action === A_MALE || p.action === A_FEMALE) this.genderEls[p.action] = e;
        if (p.action) pxHit(layer, p.x, p.y, p.w, p.h, p.tooltip || null, () => this.press(p.action));
      } else if (p.type === 4) {
        const e = pxRich(layer, this._text(p.text || ""), p.x, p.y, p.w, p.h, {
          font: p.font,
          color: hex(p.colour == null ? 0xffffff : p.colour),
          align: p.align === "center" ? 1 : p.align === "right" ? 2 : 0,
          valign: p.valign === "center" ? 1 : p.valign === "bottom" ? 2 : 0,
          shadow: !!p.shadow,
          lineHeight: p.lineHeight,
        });
        if (p.id === TITLE_PART) { this.titleEl = e; this.titlePart = p; this.titleText = this._text(p.text || ""); }
      } else if (p.type === 3) {
        /* A filled plate - the Accept button is one, and the cache's own action
           id sits on the plate rather than on its label. */
        pxRect(layer, p.x, p.y, p.w, p.h, hex(p.colour));
        if (p.action) pxHit(layer, p.x, p.y, p.w, p.h, p.tooltip || null, () => this.press(p.action));
      } else if (p.type === 6) {
        /* The model widget: a 2D canvas the renderer paints the look into.
           Where the canvas *is* comes from src/dollstage.js: the cache's own
           136x168 widget box, grown to the stage the figure is framed on, so
           the character stands the widget's own height with its feet on the
           Accept plate's top edge and its own centre where the stage says -
           not the widget's box centre, which left the figure small and low. */
        if (!this.stage) continue;
        const c = mk("canvas", "designDoll");
        c.width = this.stage.w;
        c.height = this.stage.h;
        place(c, this.stage.x, this.stage.y, this.stage.w, this.stage.h);
        layer.appendChild(c);
        this.canvas = c;
      }
    }

    /* At creation the client has no way out of this screen but Accept, and
       neither has this one; in-game (`::design`) Escape backs out and leaves the
       character as it was. */
    window.addEventListener("keydown", (e) => {
      if (!this.up || e.key !== "Escape") return;
      if (this.creating) return;
      e.preventDefault();
      this.hide();
    });
  },

  /* The cache's own strings, with this world's name in place of the client's. */
  _text(s) {
    if (s.indexOf("RuneScape") < 0) return s;
    const configured = typeof root !== "undefined" && root && root.gameTitle;
    return s.replace("RuneScape", configured ? String(configured) : "RuneScape");
  },

  /* A character who has never chosen a look is wearing one of the two baked
     bodies by name ("male"/"female"/"player_male"), not a kit key; that, and the
     gender it implies, is what the screen opens on. */
  _seedAppearance() {
    const fromKey = appearanceFromKey(Game.playerAppearance);
    if (fromKey) return fromKey;
    const cur = String(Game.playerAppearance || "");
    return defaultAppearance(cur.indexOf("female") >= 0 ? "female" : "male");
  },

  /* Is this character still wearing an un-designed body? (main.js asks before it
     sends a player into the world from the welcome screen.) */
  needsDesigning() {
    return !isKitKey(Game.playerAppearance);
  },

  /** Open the screen. `onAccept` runs when Accept is pressed (and only then);
      `creating` marks the pre-game visit, which has no way out but Accept. */
  show({ onAccept, creating = false } = {}) {
    if (!this.layer || !kitsReady()) return false;
    this.creating = !!creating;
    this._onAccept = onAccept || null;
    this.appearance = this._seedAppearance();
    this.previewKey = null;
    this._rebuild();
    const who = this.creating && Net.account ? Net.account : null;
    if (this.titlePart) {
      const str = who ? this.titleText.replace("<br>", ", " + who + "<br>") : this.titleText;
      if (this.titleEl) this.titleEl.remove();
      const p = this.titlePart;
      this.titleEl = pxRich(this.layer, str, p.x, p.y, p.w, p.h, {
        font: p.font,
        color: hex(p.colour == null ? 0xffffff : p.colour),
        align: p.align === "center" ? 1 : p.align === "right" ? 2 : 0,
        valign: p.valign === "center" ? 1 : p.valign === "bottom" ? 2 : 0,
        shadow: !!p.shadow,
        lineHeight: p.lineHeight,
      });
    }
    this._syncGender();
    this.layer.hidden = false;
    this.up = true;
    this.game.pointer = null;
    Frame.root.classList.add("titleup");
    this._paint();
    return true;
  },

  hide() {
    if (!this.layer || !this.up) return;
    this.up = false;
    this.layer.hidden = true;
    Frame.root.classList.remove("titleup");
    hideHoverTip();
    this._onAccept = null;
  },

  /** The cache's action id -> the change it makes. */
  press(action) {
    if (!this.appearance) return;
    if (action >= A_DESIGN_FIRST && action <= A_DESIGN_LAST) {
      const part = BODY_PARTS[(action - A_DESIGN_FIRST) >> 1];
      this.appearance.parts[part] = cycleKit(this.appearance, part, action & 1 ? 1 : -1);
    } else if (action >= A_COLOUR_FIRST && action <= A_COLOUR_LAST) {
      const row = COLOUR_ORDER[(action - A_COLOUR_FIRST) >> 1];
      this.appearance.colours[row] = cycleColour(this.appearance, row, action & 1 ? 1 : -1);
    } else if (action === A_MALE || action === A_FEMALE) {
      /* The client's `method45`: every part goes back to that gender's first
         choosable kit, the colours are kept. */
      const fresh = defaultAppearance(action === A_MALE ? "male" : "female");
      fresh.colours = Object.assign({}, this.appearance.colours);
      this.appearance = fresh;
    } else if (action === A_ACCEPT) {
      this.accept();
      return;
    } else {
      return;
    }
    this._rebuild();
    this._syncGender();
  },

  /* Accept: the look becomes the character's own, and at creation that is what
     carries on into the world. */
  accept() {
    const key = appearanceKey(this.appearance);
    const got = setPlayerAppearance(key);
    const next = this._onAccept;
    this.hide();
    if (!got) {
      chat("The character renderer is unavailable.", "warn");
      return;
    }
    if (next) next();
  },

  /* One character render per look, rebuilt when a choice changes: the merged
     body is cached in `modelData` by its key (src/identikits.js#buildKitBody),
     but the character that draws it is ours and is disposed as soon as it is
     replaced, so holding a look down on an arrow key cannot leak a model a
     frame. */
  _rebuild() {
    const key = appearanceKey(this.appearance);
    if (key === this.previewKey) return;
    const built = kitsReady() ? buildKitBody(key) : null;
    const ch = built ? makeModelCharacter(built) : null;
    if (this.preview) this.preview.dispose();
    this.preview = ch;
    this.previewKey = ch ? key : null;
  },

  /* The gender buttons swap to their own alternate sprite while selected -
     which is the client's `if(aBoolean1047) 932 else 931`, and the reason the
     cache's two buttons each carry a 293 with a 294 alternate. */
  _syncGender() {
    const female = this.appearance && this.appearance.gender === "female";
    const parts = this.data ? this.data.parts : [];
    for (const p of parts) {
      if (p.action !== A_MALE && p.action !== A_FEMALE) continue;
      const el = this.genderEls[p.action];
      if (!el) continue;
      const selected = (p.action === A_FEMALE) === female;
      const want = selected && p.altSprite ? p.altSprite : p.sprite;
      const part = Frame.parts[want];
      if (!part) continue;
      Frame.bg(el, want);
      place(el, p.x + (part.offX || 0), p.y + (part.offY || 0), part.w, part.h);
    }
  },

  /* The preview, standing in the model widget's own box: the swirl of the client
     is a sway, so the model is tilted 150 units off the widget and turned back
     and forth 45 degrees either way. */
  _paint() {
    if (!this.canvas || !this.preview || !this.preview.mesh) return;
    const t = performance.now() / 1000;
    const yaw = Math.sin(t * PREVIEW_RATE) * PREVIEW_SWAY;
    drawStage(this.game.view, this.preview.mesh, this.canvas, this.stage, yaw, PREVIEW_TILT);
  },
};

/* Wired once from src/main.js, the way the other interface modules of this kind
   are (src/skydrop.js#initSkyDrops): the command parser in src/ui.js owns
   `::design`, and it cannot import this module without a cycle (this one reads
   ui.js's `kit`), so it calls the hook instead. The bake itself starts loading
   here, and `DesignScreen.ready` is what both callers wait on - a 13 KB fetch,
   but the welcome screen's play button is reachable while it is still in
   flight. */
export function initDesign(game) {
  DesignScreen.ready = DesignScreen.init({ game });
  UI.openDesignScreen = () => {
    if (!DesignScreen.layer) {
      DesignScreen.ready.then(() => DesignScreen.show());
      return true;
    }
    if (!kitsReady()) {
      chat("Loading the character-design data...", "game");
      loadIdentityKits().then(() => {
        if (kitsReady()) DesignScreen.show();
        else chat("The design data is unavailable in this build.", "warn");
      });
      return false;
    }
    return DesignScreen.show();
  };
  return DesignScreen;
}
